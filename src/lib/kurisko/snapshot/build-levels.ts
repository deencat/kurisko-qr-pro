import "server-only";

import { loadAzizMarketData } from "@/lib/aziz/improvement/market-data";
import type { LighterCandle } from "@/lib/lighter/client";
import type { KuriskoSymbolLevels } from "./types";

const QR_ALIAS: Record<string, string> = {
  US500: "ES",
  US100: "NQ",
  GOLD: "GC",
  BTCUSD: "BTC",
  US30: "YM",
};

const MS_DAY = 24 * 60 * 60 * 1000;

function sessionStartMs(ts: number): number {
  const d = new Date(ts);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function todayRange(candles: LighterCandle[]): { hi: number; lo: number } {
  if (!candles.length) return { hi: 0, lo: 0 };
  const start = sessionStartMs(candles[candles.length - 1]!.t);
  const today = candles.filter((c) => c.t >= start);
  const slice = today.length ? today : candles.slice(-60);
  return {
    hi: Math.max(...slice.map((c) => c.h)),
    lo: Math.min(...slice.map((c) => c.l)),
  };
}

export async function buildSymbolLevels(symbol: string): Promise<KuriskoSymbolLevels> {
  const sym = symbol.toUpperCase();
  const [daily, intraday] = await Promise.all([
    loadAzizMarketData({ symbol: sym, resolution: "1d", days: 60, dataSource: "capital" }),
    loadAzizMarketData({ symbol: sym, resolution: "1m", days: 3, dataSource: "capital" }),
  ]);

  const d = daily.candles;
  const prev = d.length >= 2 ? d[d.length - 2]! : d[d.length - 1];
  const prevCls = prev?.c ?? 0;
  const prevHi = prev?.h ?? 0;
  const prevLo = prev?.l ?? 0;
  const pivot = prev ? (prev.h + prev.l + prev.c) / 3 : 0;
  const { hi: todayHi, lo: todayLo } = todayRange(intraday.candles);

  const ath = d.length ? Math.max(...d.map((c) => c.h)) : null;
  const atl = d.length ? Math.min(...d.map((c) => c.l)) : null;
  const athFib = ath != null && atl != null ? ath - 0.618 * (ath - atl) : null;

  const meta = QR_ALIAS[sym];

  return {
    symbol: sym,
    qrAlias: meta ?? sym,
    todayHi,
    todayLo,
    pivot,
    prevDay: prevCls,
    prevHi,
    prevCls,
    prevLo,
    athFib,
  };
}

export async function buildAllSymbolLevels(symbols: string[]): Promise<KuriskoSymbolLevels[]> {
  const out: KuriskoSymbolLevels[] = [];
  for (let i = 0; i < symbols.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 400));
    try {
      out.push(await buildSymbolLevels(symbols[i]!));
    } catch {
      /* skip missing symbol */
    }
  }
  return out;
}
