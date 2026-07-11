import "server-only";

import type { CandleResolution, LighterCandle } from "@/lib/lighter/client";
import { capitalBaseUrl, getCapitalCredentials, isCapitalConfigured } from "./config";
import { capitalBarMs, toCapitalResolution } from "./resolutions";
import { clearCapitalSession, getCapitalSession } from "./session";
import { synthesizeBarVolume, ensureCapitalVolumes } from "./volume";

export { capitalEnvironment, isCapitalConfigured } from "./config";

export interface CapitalMarket {
  epic: string;
  instrumentName?: string;
  symbol?: string;
  marketStatus?: string;
  bid?: number;
  offer?: number;
}

interface PriceLevel {
  bid?: number;
  ask?: number;
  lastTraded?: number;
}

interface CapitalPriceBar {
  snapshotTimeUTC?: number;
  snapshotTime?: string;
  openPrice?: PriceLevel;
  highPrice?: PriceLevel;
  lowPrice?: PriceLevel;
  closePrice?: PriceLevel;
  lastTradedVolume?: number;
}

function bidPx(level?: PriceLevel): number {
  if (!level) return 0;
  return level.bid ?? level.lastTraded ?? 0;
}

function askPx(level?: PriceLevel): number {
  if (!level) return 0;
  const bid = bidPx(level);
  return level.ask ?? bid;
}

function mid(level?: PriceLevel): number {
  const bid = bidPx(level);
  const ask = askPx(level);
  if (!bid && !ask) return 0;
  if (!ask) return bid;
  return (bid + ask) / 2;
}

function sideOhlc(
  bar: CapitalPriceBar,
  pick: "bid" | "ask"
): { o: number; h: number; l: number; c: number } | null {
  const px = pick === "bid" ? bidPx : askPx;
  const o = px(bar.openPrice);
  const h = px(bar.highPrice);
  const l = px(bar.lowPrice);
  const c = px(bar.closePrice);
  if (!o || !h || !l || !c) return null;
  return { o, h, l, c };
}

function toMs(ts: number | string | undefined): number {
  if (ts == null) return 0;
  if (typeof ts === "number") return ts < 1e12 ? ts * 1000 : ts;
  const parsed = Date.parse(ts);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCapitalDateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function capitalBarToCandle(bar: CapitalPriceBar): LighterCandle | null {
  const t = toMs(bar.snapshotTimeUTC ?? bar.snapshotTime);
  const o = mid(bar.openPrice);
  const h = mid(bar.highPrice);
  const l = mid(bar.lowPrice);
  const c = mid(bar.closePrice);
  if (!t || !o || !h || !l || !c) return null;
  const bid = sideOhlc(bar, "bid");
  const ask = sideOhlc(bar, "ask");
  const reported = bar.lastTradedVolume ?? 0;
  const v = reported > 0 ? reported : synthesizeBarVolume({ o, h, l, c });
  return {
    t,
    o,
    h,
    l,
    c,
    v,
    V: v * c,
    bid: bid ?? undefined,
    ask: ask ?? undefined,
  };
}

export async function capitalFetch<T>(
  path: string,
  init?: RequestInit,
  retry = true
): Promise<{ data: T; res: Response }> {
  const creds = getCapitalCredentials();
  if (!creds) throw new Error("Capital.com credentials missing");

  const session = await getCapitalSession();
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
    clearCapitalSession();
    await getCapitalSession(true);
    return capitalFetch<T>(path, init, false);
  }

  if (res.status === 429 && retry) {
    await new Promise((r) => setTimeout(r, 1200));
    return capitalFetch<T>(path, init, false);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Capital.com API ${res.status}: ${text.slice(0, 300)}`);
  }

  return { data: (await res.json()) as T, res };
}

const epicCache = new Map<string, string>();

export async function resolveCapitalEpic(symbol: string): Promise<string> {
  const key = symbol.toUpperCase();
  const cached = epicCache.get(key);
  if (cached) return cached;

  const { data } = await capitalFetch<{ markets?: CapitalMarket[] }>(
    `/api/v1/markets?searchTerm=${encodeURIComponent(key)}`
  );
  const markets = data.markets ?? [];
  const exact =
    markets.find((m) => m.epic?.toUpperCase() === key) ??
    markets.find((m) => m.symbol?.toUpperCase() === key) ??
    markets.find((m) => m.instrumentName?.toUpperCase().includes(key));

  if (!exact?.epic) {
    throw new Error(`Capital.com: no market found for ${symbol}`);
  }

  epicCache.set(key, exact.epic);
  return exact.epic;
}

export async function searchCapitalMarkets(searchTerm: string): Promise<CapitalMarket[]> {
  const { data } = await capitalFetch<{ markets?: CapitalMarket[] }>(
    `/api/v1/markets?searchTerm=${encodeURIComponent(searchTerm)}`
  );
  return data.markets ?? [];
}

export async function getCapitalMarket(epic: string): Promise<CapitalMarket & Record<string, unknown>> {
  const { data } = await capitalFetch<{ market?: CapitalMarket & Record<string, unknown> }>(
    `/api/v1/markets/${encodeURIComponent(epic)}`
  );
  return data.market ?? (data as CapitalMarket & Record<string, unknown>);
}

export async function getCapitalPrices(params: {
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

  const { data } = await capitalFetch<{ prices?: CapitalPriceBar[] }>(
    `/api/v1/prices/${encodeURIComponent(params.epic)}?${query.toString()}`
  );

  const candles = (data.prices ?? [])
    .map(capitalBarToCandle)
    .filter((c): c is LighterCandle => c != null)
    .sort((a, b) => a.t - b.t);

  return candles;
}

export async function fetchAllCapitalCandles(params: {
  symbol: string;
  resolution: CandleResolution;
  startTimestamp: number;
  endTimestamp: number;
  minBars?: number;
  onProgress?: (message: string) => void;
}): Promise<{ epic: string; candles: LighterCandle[]; volumeMode: "reported" | "synthetic" }> {
  const epic = await resolveCapitalEpic(params.symbol);
  const barMs = capitalBarMs(params.resolution);
  const minBars = params.minBars ?? 0;
  const all = new Map<number, LighterCandle>();

  let cursorTo = params.endTimestamp;
  let pages = 0;
  const maxPages = 30;

  while (cursorTo > params.startTimestamp && pages < maxPages) {
    pages++;
    params.onProgress?.(`Capital ${params.symbol} (${epic}): page ${pages}…`);

    const batch = await getCapitalPrices({
      epic,
      resolution: params.resolution,
      toMs: cursorTo,
      max: 1000,
    });

    if (!batch.length) break;

    for (const c of batch) {
      if (c.t >= params.startTimestamp && c.t <= params.endTimestamp) {
        all.set(c.t, c);
      }
    }

    const earliest = batch[0].t;
    if (earliest <= params.startTimestamp) break;
    if (all.size >= minBars && earliest <= params.startTimestamp + barMs) break;

    const nextTo = earliest - 1;
    if (nextTo >= cursorTo) break;
    cursorTo = nextTo;

    await new Promise((r) => setTimeout(r, 120));
  }

  const sorted = [...all.values()].sort((a, b) => a.t - b.t);
  const { candles, volumeMode } = ensureCapitalVolumes(sorted);
  return { epic, candles, volumeMode };
}

export async function fetchAllCapitalCandlesByEpic(params: {
  epic: string;
  resolution: CandleResolution;
  startTimestamp: number;
  endTimestamp: number;
  minBars?: number;
  onProgress?: (message: string) => void;
}): Promise<LighterCandle[]> {
  const barMs = capitalBarMs(params.resolution);
  const minBars = params.minBars ?? 0;
  const all = new Map<number, LighterCandle>();

  let cursorTo = params.endTimestamp;
  let pages = 0;
  const maxPages = 30;

  while (cursorTo > params.startTimestamp && pages < maxPages) {
    pages++;
    params.onProgress?.(`Capital ${params.epic}: page ${pages}…`);

    const batch = await getCapitalPrices({
      epic: params.epic,
      resolution: params.resolution,
      toMs: cursorTo,
      max: 1000,
    });

    if (!batch.length) break;

    for (const c of batch) {
      if (c.t >= params.startTimestamp && c.t <= params.endTimestamp) {
        all.set(c.t, c);
      }
    }

    const earliest = batch[0].t;
    if (earliest <= params.startTimestamp) break;
    if (all.size >= minBars && earliest <= params.startTimestamp + barMs) break;

    const nextTo = earliest - 1;
    if (nextTo >= cursorTo) break;
    cursorTo = nextTo;

    await new Promise((r) => setTimeout(r, 120));
  }

  return [...all.values()].sort((a, b) => a.t - b.t);
}

export async function pingCapital(): Promise<{ ok: boolean; environment: string; serverTime?: string }> {
  const res = await fetch(`${capitalBaseUrl()}/api/v1/time`);
  if (!res.ok) throw new Error(`Capital.com ping failed: ${res.status}`);
  const data = (await res.json()) as { serverTime?: string };
  await getCapitalSession();
  return { ok: true, environment: capitalBaseUrl().includes("demo") ? "demo" : "live", serverTime: data.serverTime };
}
