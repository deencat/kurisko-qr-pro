/**
 * Script-safe Capital.com history client (no `server-only`).
 * Mirrors src/lib/capital/client.ts fetch helpers for CLI backtests,
 * with Liquidity-style deep paging + local disk cache under data/kurisko/capital/.
 */
import fs from "node:fs";
import path from "node:path";
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

/**
 * Default page budget — ~12m of 1m bars when demo allows (~500×1000).
 * Raise further (800–1200) to probe deeper Capital history; cache under data/kurisko/capital/.
 */
export const DEFAULT_MAX_PAGES = 500;

/** Suggested page budget when probing beyond ~12–18m of 1m history. */
export const DEEP_MAX_PAGES = 1000;

const DEFAULT_CACHE_DIR = path.join(process.cwd(), "data", "kurisko", "capital");

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

async function capitalFetchRaw(
  pathSuffix: string,
  init?: RequestInit,
  retry = true
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const creds = getCapitalCredentials() as CapitalCredentials;
  const session = await getSession();
  const res = await fetch(`${capitalBaseUrl()}${pathSuffix}`, {
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
    return capitalFetchRaw(pathSuffix, init, false);
  }
  if (res.status === 429 && retry) {
    await new Promise((r) => setTimeout(r, 1200));
    return capitalFetchRaw(pathSuffix, init, false);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function capitalFetch<T>(pathSuffix: string, init?: RequestInit, retry = true): Promise<T> {
  const r = await capitalFetchRaw(pathSuffix, init, retry);
  if (!r.ok) {
    throw new Error(`Capital.com API ${r.status}: ${r.text.slice(0, 300)}`);
  }
  return r.json as T;
}

const epicCache = new Map<string, string>();

/**
 * Kurisko / TV aliases → Capital.com CFD epics.
 * Confirmed demo search: US100→US100, US500→US500, GOLD→GOLD.
 * NAS100 / NQ do not resolve via free-text search — pin to US100.
 */
export const CAPITAL_EPIC_ALIASES: Record<string, string> = {
  US100: "US100",
  NAS100: "US100",
  NQ: "US100",
  NASDAQ100: "US100",
  US500: "US500",
  ES: "US500",
  SPX: "US500",
  GOLD: "GOLD",
  XAUUSD: "GOLD",
  GC: "GOLD",
  US30: "US30",
  BTCUSD: "BTCUSD",
};

export async function resolveEpic(symbol: string): Promise<string> {
  const key = symbol.trim().toUpperCase();
  const hit = epicCache.get(key);
  if (hit) return hit;
  const aliased = CAPITAL_EPIC_ALIASES[key];
  if (aliased) {
    epicCache.set(key, aliased);
    return aliased;
  }
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
  const r = await capitalFetchRaw(`/api/v1/prices/${encodeURIComponent(params.epic)}?${query.toString()}`);
  // Empty / weekend windows often 404 error.prices.not-found — treat as empty page.
  if (!r.ok) {
    if (r.status === 404 || r.text.includes("error.prices.not-found")) return [];
    throw new Error(`Capital.com API ${r.status}: ${r.text.slice(0, 300)}`);
  }
  const data = r.json as { prices?: CapitalPriceBar[] };
  return (data.prices ?? [])
    .map(capitalBarToCandle)
    .filter((c): c is LighterCandle => c != null)
    .sort((a, b) => a.t - b.t);
}

export interface CapitalCacheMeta {
  symbol: string;
  epic: string;
  resolution: "1m";
  barCount: number;
  firstTs: number | null;
  lastTs: number | null;
  volumeMode: "reported" | "synthetic";
  updatedAtUtc: string;
}

function cachePaths(symbol: string, cacheDir = DEFAULT_CACHE_DIR) {
  const base = path.join(cacheDir, `${symbol.toUpperCase()}_1m`);
  return { json: `${base}.json`, meta: `${base}.meta.json` };
}

export function loadCapital1mCache(
  symbol: string,
  cacheDir = DEFAULT_CACHE_DIR
): { candles: LighterCandle[]; meta: CapitalCacheMeta | null } {
  const { json, meta } = cachePaths(symbol, cacheDir);
  if (!fs.existsSync(json)) return { candles: [], meta: null };
  const candles = JSON.parse(fs.readFileSync(json, "utf8")) as LighterCandle[];
  const metaObj = fs.existsSync(meta)
    ? (JSON.parse(fs.readFileSync(meta, "utf8")) as CapitalCacheMeta)
    : null;
  return { candles, meta: metaObj };
}

export function saveCapital1mCache(
  symbol: string,
  candles: LighterCandle[],
  extra: { epic: string; volumeMode: "reported" | "synthetic" },
  cacheDir = DEFAULT_CACHE_DIR
): CapitalCacheMeta {
  fs.mkdirSync(cacheDir, { recursive: true });
  const { json, meta } = cachePaths(symbol, cacheDir);
  const sorted = [...candles].sort((a, b) => a.t - b.t);
  fs.writeFileSync(json, JSON.stringify(sorted));
  const metaObj: CapitalCacheMeta = {
    symbol: symbol.toUpperCase(),
    epic: extra.epic,
    resolution: "1m",
    barCount: sorted.length,
    firstTs: sorted[0]?.t ?? null,
    lastTs: sorted[sorted.length - 1]?.t ?? null,
    volumeMode: extra.volumeMode,
    updatedAtUtc: new Date().toISOString(),
  };
  fs.writeFileSync(meta, JSON.stringify(metaObj, null, 2));
  return metaObj;
}

function mergeCandles(a: LighterCandle[], b: LighterCandle[]): LighterCandle[] {
  const map = new Map<number, LighterCandle>();
  for (const c of a) map.set(c.t, c);
  for (const c of b) map.set(c.t, c);
  return [...map.values()].sort((x, y) => x.t - y.t);
}

function sliceRange(candles: LighterCandle[], start: number, end: number): LighterCandle[] {
  return candles.filter((c) => c.t >= start && c.t <= end);
}

/**
 * Page Capital 1m history backward from `endTimestamp` until `startTimestamp`
 * or the demo API stops returning bars.
 */
export async function fetchCapital1mRange(params: {
  symbol: string;
  startTimestamp: number;
  endTimestamp: number;
  maxPages?: number;
  onProgress?: (msg: string) => void;
  /** When set, merge into / load from local JSON cache (gitignored under data/). */
  useCache?: boolean;
  cacheDir?: string;
}): Promise<{
  epic: string;
  candles: LighterCandle[];
  volumeMode: "reported" | "synthetic";
  pages: number;
  fromCache: boolean;
  cacheHitBars: number;
}> {
  const symbol = params.symbol.toUpperCase();
  const maxPages = params.maxPages ?? DEFAULT_MAX_PAGES;
  const useCache = params.useCache ?? true;
  const cacheDir = params.cacheDir ?? DEFAULT_CACHE_DIR;

  let cachedBars: LighterCandle[] = [];
  let cachedMeta: CapitalCacheMeta | null = null;
  if (useCache) {
    const loaded = loadCapital1mCache(symbol, cacheDir);
    cachedBars = loaded.candles;
    cachedMeta = loaded.meta;
  }

  const covered =
    cachedBars.length > 0 &&
    cachedMeta?.firstTs != null &&
    cachedMeta.lastTs != null &&
    cachedMeta.firstTs <= params.startTimestamp + 60_000 &&
    cachedMeta.lastTs >= params.endTimestamp - 60_000;

  if (covered) {
    const sliced = sliceRange(cachedBars, params.startTimestamp, params.endTimestamp);
    params.onProgress?.(
      `Cache hit ${symbol}: ${sliced.length} bars (${new Date(sliced[0]?.t ?? 0).toISOString()} → ${new Date(sliced[sliced.length - 1]?.t ?? 0).toISOString()})`
    );
    const { candles, volumeMode } = ensureCapitalVolumes(sliced);
    return {
      epic: cachedMeta!.epic,
      candles,
      volumeMode: cachedMeta!.volumeMode ?? volumeMode,
      pages: 0,
      fromCache: true,
      cacheHitBars: sliced.length,
    };
  }

  const epic = cachedMeta?.epic ?? (await resolveEpic(symbol));
  const barMs = capitalBarMs("1m");
  const all = new Map<number, LighterCandle>();

  // Seed from cache so we only fill gaps before first / after last when possible.
  for (const c of cachedBars) all.set(c.t, c);

  let cursorTo = params.endTimestamp;
  // If cache already covers the recent end, jump cursor to just before first cached bar
  // when requesting older history only.
  if (
    cachedMeta?.firstTs != null &&
    cachedMeta.lastTs != null &&
    cachedMeta.lastTs >= params.endTimestamp - barMs &&
    cachedMeta.firstTs > params.startTimestamp
  ) {
    cursorTo = cachedMeta.firstTs - 1;
    params.onProgress?.(
      `Extending ${symbol} cache older than ${new Date(cachedMeta.firstTs).toISOString()}…`
    );
  }

  let pages = 0;
  let stuck = 0;
  let lastEarliest = Number.POSITIVE_INFINITY;

  while (cursorTo > params.startTimestamp && pages < maxPages) {
    pages++;
    params.onProgress?.(`Capital ${symbol} (${epic}): page ${pages}/${maxPages}…`);
    const batch = await getPrices({ epic, resolution: "1m", toMs: cursorTo, max: 1000 });
    if (!batch.length) {
      // Jump back ~16h on empty (weekend / gap) — Liquidity-style skip.
      cursorTo -= 16 * 60 * 60 * 1000;
      stuck++;
      if (stuck > 8) break;
      await new Promise((r) => setTimeout(r, 120));
      continue;
    }
    stuck = 0;
    for (const c of batch) {
      if (c.t >= params.startTimestamp - 7 * 24 * 60 * 60 * 1000) {
        // Keep a little pre-roll in cache for warmup convenience
        all.set(c.t, c);
      }
    }
    const earliest = batch[0]!.t;
    if (earliest <= params.startTimestamp) break;
    if (earliest >= lastEarliest) {
      // Cursor not advancing — step back hard
      cursorTo = earliest - 60 * 60 * 1000;
    } else {
      cursorTo = earliest - 1;
    }
    lastEarliest = earliest;
    await new Promise((r) => setTimeout(r, 100));
  }

  const merged = [...all.values()].sort((a, b) => a.t - b.t);
  const { candles: volCandles, volumeMode } = ensureCapitalVolumes(merged);

  if (useCache && volCandles.length) {
    const meta = saveCapital1mCache(symbol, volCandles, { epic, volumeMode }, cacheDir);
    params.onProgress?.(
      `Cached ${symbol}: ${meta.barCount} bars → ${cachePaths(symbol, cacheDir).json}`
    );
  }

  const sliced = sliceRange(volCandles, params.startTimestamp, params.endTimestamp);
  const { candles, volumeMode: vm } = ensureCapitalVolumes(sliced);
  return {
    epic,
    candles,
    volumeMode: vm,
    pages,
    fromCache: false,
    cacheHitBars: cachedBars.length,
  };
}
