import { candleStats, openDuxDb } from "./store";
import {
  ensurePaperSchema,
  recentPaperOrders,
  recentPaperRuns,
  recentPaperTrades,
} from "./paper/store";
import { ensureLiveSchema, recentLiveOrders, recentLiveRuns } from "./live/store";
import { loadLiveConfig } from "./live/config";

export function getDuxResearchStatus() {
  openDuxDb();
  ensurePaperSchema();
  ensureLiveSchema();

  const paperRuns = recentPaperRuns(8);
  const paperTrades = recentPaperTrades(15);
  const paperOrders = recentPaperOrders(25);
  const liveRuns = recentLiveRuns(8);
  const liveOrders = recentLiveOrders(25);
  const candles = candleStats();
  const liveCfg = loadLiveConfig();

  return {
    at: Date.now(),
    store: {
      candleSeries: candles.length,
      symbols: [...new Set(candles.map((c) => c.symbol))],
    },
    liveConfig: {
      armed: liveCfg.armed,
      trdEnv: liveCfg.trdEnv,
      broker: liveCfg.broker,
      maxShares: liveCfg.maxShares,
      maxNotional: liveCfg.maxNotional,
      allowlist: liveCfg.allowlist,
      kill: liveCfg.kill,
    },
    paper: {
      runs: paperRuns,
      trades: paperTrades,
      orders: paperOrders,
    },
    live: {
      runs: liveRuns,
      orders: liveOrders,
    },
  };
}
