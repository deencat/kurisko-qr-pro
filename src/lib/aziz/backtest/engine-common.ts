import type { LighterCandle } from "@/lib/lighter/client";
import type { AzizSessionPolicy } from "@/lib/aziz/session/global-sessions";
import { isAbcdEntryAllowedAt } from "@/lib/aziz/session/global-sessions";
import { etYmd } from "@/lib/aziz/scan/session-et";
import { sma, trueRange } from "./indicators";

export interface AzizEngineBaseParams {
  sessionPolicy?: AzizSessionPolicy;
  initialCapital?: number;
  riskPct?: number;
  maxLeverage?: number;
  minRvol?: number;
}

export interface AzizSimpleTrade {
  id: number;
  side: "long" | "short";
  entryTs: number;
  exitTs: number;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  stopPrice: number;
  targetPrice: number;
  netPnl: number;
  signal: string;
}

export interface AzizSimpleBacktestResult {
  symbol: string;
  resolution: string;
  strategyId: string;
  initialCapital: number;
  finalEquity: number;
  netPnl: number;
  netPnlPct: number;
  totalTrades: number;
  winRate: number;
  trades: AzizSimpleTrade[];
}

export const ENGINE_DEFAULTS: Required<AzizEngineBaseParams> = {
  sessionPolicy: "all",
  initialCapital: 10_000,
  riskPct: 2,
  maxLeverage: 5,
  minRvol: 0.6,
};

export interface MarketContext {
  volAvg10: number[];
  ema9: number[];
  ema20: number[];
  atr10: number[];
  sessionVwap: number[];
  pdHigh: number[];
  pdLow: number[];
  pdClose: number[];
  /** Current session running high (Pine pmHigh). */
  pmHigh: number[];
  /** Current session running low (Pine pmLow). */
  pmLow: number[];
  dayOpen: number[];
  isNewDay: boolean[];
}

function emaSeries(values: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < values.length; i++) {
    if (i === 0) out.push(values[0]);
    else out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

export function buildMarketContext(candles: LighterCandle[]): MarketContext {
  const n = candles.length;
  const closes = candles.map((c) => c.c);
  const vols = candles.map((c) => c.v);
  const trs = candles.map((c, i) =>
    i > 0 ? trueRange(c, candles[i - 1].c) : c.h - c.l
  );

  const volAvg10 = vols.map((_, i) => sma(vols, 10, i));
  const ema9 = emaSeries(closes, 9);
  const ema20 = emaSeries(closes, 20);
  const atr10 = trs.map((_, i) => sma(trs, 10, i));

  const sessionVwap: number[] = new Array(n).fill(0);
  const pdHigh: number[] = new Array(n).fill(0);
  const pdLow: number[] = new Array(n).fill(0);
  const pdClose: number[] = new Array(n).fill(0);
  const pmHigh: number[] = new Array(n).fill(0);
  const pmLow: number[] = new Array(n).fill(0);
  const dayOpen: number[] = new Array(n).fill(0);
  const isNewDay: boolean[] = new Array(n).fill(false);

  let curDay = "";
  let cumPv = 0;
  let cumV = 0;
  let prevH = 0;
  let prevL = 0;
  let prevC = 0;
  let hasPrevDay = false;
  let curH = 0;
  let curL = 0;
  let curC = 0;
  let curO = 0;
  let sessH = 0;
  let sessL = 0;

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const ymd = etYmd(new Date(c.t));
    if (ymd !== curDay) {
      if (curDay) {
        prevH = curH;
        prevL = curL;
        prevC = curC;
        hasPrevDay = true;
      }
      isNewDay[i] = true;
      curDay = ymd;
      curH = c.h;
      curL = c.l;
      curC = c.c;
      curO = c.o;
      sessH = c.h;
      sessL = c.l;
      cumPv = 0;
      cumV = 0;
    } else {
      curH = Math.max(curH, c.h);
      curL = Math.min(curL, c.l);
      curC = c.c;
      sessH = Math.max(sessH, c.h);
      sessL = Math.min(sessL, c.l);
    }

    const hlc3 = (c.h + c.l + c.c) / 3;
    cumPv += hlc3 * c.v;
    cumV += c.v;
    sessionVwap[i] = cumV > 0 ? cumPv / cumV : hlc3;

    dayOpen[i] = curO;
    pmHigh[i] = sessH;
    pmLow[i] = sessL;
    if (hasPrevDay) {
      pdHigh[i] = prevH;
      pdLow[i] = prevL;
      pdClose[i] = prevC;
    }
  }

  return { volAvg10, ema9, ema20, atr10, sessionVwap, pdHigh, pdLow, pdClose, pmHigh, pmLow, dayOpen, isNewDay };
}

export function mergeEngineParams<T extends AzizEngineBaseParams>(params: T): T & Required<AzizEngineBaseParams> {
  const defined = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  ) as T;
  return { ...ENGINE_DEFAULTS, ...defined };
}

export function entryAllowed(ts: number, policy: AzizSessionPolicy): boolean {
  return isAbcdEntryAllowedAt(new Date(ts), policy);
}

export function rvolOk(v: number, avg: number, minRvol: number): boolean {
  return avg <= 0 || v / avg >= minRvol;
}

export function riskQty(
  equity: number,
  riskPct: number,
  maxLeverage: number,
  entry: number,
  stop: number
): number {
  const riskPerUnit = Math.abs(entry - stop);
  if (riskPerUnit <= 0 || entry <= 0) return 0;
  const targetRisk = equity * (riskPct / 100);
  const raw = targetRisk / riskPerUnit;
  const maxQty = (equity * maxLeverage) / entry;
  return Math.min(raw, maxQty);
}

export function bufPrice(price: number, pct = 0.001): number {
  return price * pct;
}

export function isGreen(c: LighterCandle): boolean {
  return c.c > c.o;
}

export function isRed(c: LighterCandle): boolean {
  return c.c < c.o;
}

export function candleRange(c: LighterCandle): number {
  return c.h - c.l;
}

export function isHammer(c: LighterCandle): boolean {
  const rng = candleRange(c);
  if (rng <= 0) return false;
  const lowerWick = Math.min(c.o, c.c) - c.l;
  return lowerWick / rng >= 0.6 && isGreen(c);
}

export function isShootingStar(c: LighterCandle): boolean {
  const rng = candleRange(c);
  if (rng <= 0) return false;
  const upperWick = c.h - Math.max(c.o, c.c);
  return upperWick / rng >= 0.6 && isRed(c);
}

export function isBullEngulf(candles: LighterCandle[], i: number): boolean {
  if (i < 1) return false;
  const c = candles[i];
  const p = candles[i - 1];
  return isGreen(c) && isRed(p) && c.c > p.o && c.o < p.c;
}

export function isBearEngulf(candles: LighterCandle[], i: number): boolean {
  if (i < 1) return false;
  const c = candles[i];
  const p = candles[i - 1];
  return isRed(c) && isGreen(p) && c.c < p.o && c.o > p.c;
}

export function lowestSince(candles: LighterCandle[], from: number, to: number): number {
  let min = Infinity;
  for (let j = from; j <= to; j++) min = Math.min(min, candles[j].l);
  return min;
}

export function highestSince(candles: LighterCandle[], from: number, to: number): number {
  let max = -Infinity;
  for (let j = from; j <= to; j++) max = Math.max(max, candles[j].h);
  return max;
}

export function finalizeSimpleResult(
  symbol: string,
  resolution: string,
  strategyId: string,
  initialCapital: number,
  equity: number,
  trades: AzizSimpleTrade[]
): AzizSimpleBacktestResult {
  const wins = trades.filter((t) => t.netPnl > 0).length;
  const netPnl = equity - initialCapital;
  return {
    symbol,
    resolution,
    strategyId,
    initialCapital,
    finalEquity: equity,
    netPnl,
    netPnlPct: initialCapital > 0 ? (netPnl / initialCapital) * 100 : 0,
    totalTrades: trades.length,
    winRate: trades.length ? wins / trades.length : 0,
    trades,
  };
}

export interface OpenPosition {
  side: "long" | "short";
  entry: number;
  stop: number;
  target: number;
  qty: number;
  entryTs: number;
  signal: string;
}

export function tryExitPosition(
  pos: OpenPosition,
  c: LighterCandle,
  tradeId: number
): { trade: AzizSimpleTrade; tradeId: number } | null {
  if (pos.side === "long") {
    const hitStop = c.l <= pos.stop;
    const hitTarget = c.h >= pos.target;
    if (!hitStop && !hitTarget) return null;
    const exitPrice = hitStop ? pos.stop : pos.target;
    return {
      tradeId: tradeId + 1,
      trade: {
        id: tradeId + 1,
        side: "long",
        entryTs: pos.entryTs,
        exitTs: c.t,
        entryPrice: pos.entry,
        exitPrice,
        qty: pos.qty,
        stopPrice: pos.stop,
        targetPrice: pos.target,
        netPnl: (exitPrice - pos.entry) * pos.qty,
        signal: hitStop ? "SL" : pos.signal,
      },
    };
  }
  const hitStop = c.h >= pos.stop;
  const hitTarget = c.l <= pos.target;
  if (!hitStop && !hitTarget) return null;
  const exitPrice = hitStop ? pos.stop : pos.target;
  return {
    tradeId: tradeId + 1,
    trade: {
      id: tradeId + 1,
      side: "short",
      entryTs: pos.entryTs,
      exitTs: c.t,
      entryPrice: pos.entry,
      exitPrice,
      qty: pos.qty,
      stopPrice: pos.stop,
      targetPrice: pos.target,
      netPnl: (pos.entry - exitPrice) * pos.qty,
      signal: hitStop ? "SL" : pos.signal,
    },
  };
}

export function rrOk(entry: number, stop: number, target: number, isLong: boolean, minRr = 2): boolean {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  if (risk <= 0) return false;
  return isLong ? reward / risk >= minRr : reward / risk >= minRr;
}

/** Prior bars only — consolidation before breakout (not on the breakout bar). */
export function s7ConsolidationTight(
  candles: LighterCandle[],
  i: number,
  maxStdevPct = 0.003
): boolean {
  if (i < 5) return false;
  const slice = candles.slice(i - 5, i);
  const mean = slice.reduce((s, x) => s + x.c, 0) / slice.length;
  if (mean <= 0) return false;
  const stdev = Math.sqrt(slice.reduce((s, x) => s + (x.c - mean) ** 2, 0) / slice.length);
  return stdev / mean <= maxStdevPct;
}
