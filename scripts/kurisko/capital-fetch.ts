/**
 * Script-safe Capital.com history client (no `server-only`).
 * Mirrors src/lib/capital/client.ts fetch helpers for CLI backtests.
 */
import type { CandleResolution, LighterCandle } from "../../src/lib/lighter/client";
import { capitalBarToCandle, type CapitalPriceBar } from "../../src/lib/capital/client-core";
import { capitalBarMs, toCapitalResolution } from "../../src/lib/capital/resolutions";
import { ensureCapitalVolumes } from "../../src/lib/capital/volume";
import {
  capitalBaseUrl,
  getCapitalCredentials,
  isCapitalConfigured,
  type CapitalCredentials,
} from "../../src/lib/capital/config";

export { isCapitalConfigured, capitalBaseUrl };

interface CapitalSession {
  cst: string;
  securityToken: string;
  createdAt: number;
}

let cached: CapitalSession | null = null;
const SESSION_TTL_MS = 9 * 60 * 1000;

function formatCapitalDateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

async function getSession(force = false): Promise<CapitalSession> {
  if (!force && cached && Date.now() - cached.createdAt < SESSION_TTL_MS) return cached;
  const creds = getCapitalCredentials();
  if (!creds) {
    throw new Error(
      "Capital.com not configured. Set CAPITAL_API_KEY, CAPITAL_IDENTIFIER, CAPITAL_API_PASSWORD (or CAPITAL_PASSWORD)."
    );
  }
  const res = await fetch(`${capitalBaseUrl()}/api/v1/session`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CAP-API-KEY": creds.apiKey,
    },
    body: JSON.stringify({
      identifier: creds.identifier,
      password: creds.password,
      encryptedPassword: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Capital.com session failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const cst = res.headers.get("CST");
  const securityToken = res.headers.get("X-SECURITY-TOKEN");
  if (!cst || !securityToken) throw new Error("Capital.com session missing CST / X-SECURITY-TOKEN");
  cached = { cst, securityToken, createdAt: Date.now() };
  return cached;
}

async function capitalFetch<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const creds = getCapitalCredentials() as CapitalCredentials;
  const session = await getSession();
  const res = await fetch(`${capitalBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CAP-API-KEY": creds.apiKey,
      CST: session.cst,
      "X-SECURITY-TOKEN": session.securityToken,
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401 && retry) {
    cached = null;
    await getSession(true);
    return capitalFetch<T>(path, init, false);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Capital.com API ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

const epicCache = new Map<string, string>();

export async function resolveEpic(symbol: string): Promise<string> {
  const key = symbol.trim().toUpperCase();
  const hit = epicCache.get(key);
  if (hit) return hit;
  const data = await capitalFetch<{ markets?: { epic?: string; symbol?: string; instrumentName?: string }[] }>(
    `/api/v1/markets?searchTerm=${encodeURIComponent(key)}`
  );
  const markets = data.markets ?? [];
  const exact =
    markets.find((m) => m.epic?.toUpperCase() === key) ??
    markets.find((m) => m.symbol?.toUpperCase() === key) ??
    markets.find((m) => m.instrumentName?.toUpperCase().includes(key));
  if (!exact?.epic) throw new Error(`Capital.com: no market for ${symbol}`);
  epicCache.set(key, exact.epic);
  return exact.epic;
}

async function getPrices(params: {
  epic: string;
  resolution: CandleResolution;
  toMs: number;
  max?: number;
}): Promise<LighterCandle[]> {
  const resolution = toCapitalResolution(params.resolution);
  const max = Math.min(1000, Math.max(1, params.max ?? 1000));
  const query = new URLSearchParams({
    resolution,
    max: String(max),
    to: formatCapitalDateTime(params.toMs),
  });
  const data = await capitalFetch<{ prices?: CapitalPriceBar[] }>(
    `/api/v1/prices/${encodeURIComponent(params.epic)}?${query.toString()}`
  );
  return (data.prices ?? [])
    .map(capitalBarToCandle)
    .filter((c): c is LighterCandle => c != null)
    .sort((a, b) => a.t - b.t);
}

export async function fetchCapital1mRange(params: {
  symbol: string;
  startTimestamp: number;
  endTimestamp: number;
  onProgress?: (msg: string) => void;
}): Promise<{ epic: string; candles: LighterCandle[]; volumeMode: "reported" | "synthetic" }> {
  const epic = await resolveEpic(params.symbol);
  const barMs = capitalBarMs("1m");
  const all = new Map<number, LighterCandle>();
  let cursorTo = params.endTimestamp;
  let pages = 0;
  const maxPages = 40;

  while (cursorTo > params.startTimestamp && pages < maxPages) {
    pages++;
    params.onProgress?.(`Capital ${params.symbol} (${epic}): page ${pages}…`);
    const batch = await getPrices({ epic, resolution: "1m", toMs: cursorTo, max: 1000 });
    if (!batch.length) break;
    for (const c of batch) {
      if (c.t >= params.startTimestamp && c.t <= params.endTimestamp) all.set(c.t, c);
    }
    const earliest = batch[0]!.t;
    if (earliest <= params.startTimestamp) break;
    const nextTo = earliest - 1;
    if (nextTo >= cursorTo) break;
    cursorTo = nextTo;
    await new Promise((r) => setTimeout(r, 120));
    if (all.size > 0 && earliest <= params.startTimestamp + barMs) break;
  }

  const sorted = [...all.values()].sort((a, b) => a.t - b.t);
  const { candles, volumeMode } = ensureCapitalVolumes(sorted);
  return { epic, candles, volumeMode };
}
