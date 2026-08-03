export { duxDataDir, duxDbPath, duxSmokeSeedPath, FUTU_DEFAULT_HOST, FUTU_DEFAULT_PORT } from "./config";
export { loadGusSmokeSeed } from "./params";
export { classifyUsSession } from "./session";
export {
  openDuxDb,
  getDuxDb,
  closeDuxDb,
  upsertCandles,
  getCandles,
  candleStats,
  upsertSymbolMeta,
  getSymbolMeta,
  logIngest,
  recentIngestLogs,
  makeCandle,
  fixturesDir,
} from "./store";
export type { DuxCandle, DuxSymbolMeta, DuxIngestLogRow, GusParams } from "./types";
export {
  runBacktest,
  runBacktestOnSymbols,
  runDay,
  sweepFamily,
  PARAM_FAMILIES,
  summarize,
  DEFAULT_EQUITY,
} from "./backtest";
export type {
  BacktestResult,
  BacktestSummary,
  DayResult,
  Trade,
  SweepRow,
  SkipReason,
} from "./backtest";
export {
  runPaperSession,
  assertParity,
  PaperBroker,
  ensurePaperSchema,
  recentPaperRuns,
  recentPaperTrades,
  recentPaperOrders,
} from "./paper";
export type { PaperMode, PaperOrder, PaperRunResult, ParityReport } from "./paper";
export {
  loadLiveConfig,
  evaluateIntent,
  runLiveSession,
  intentsFromTrades,
  createBroker,
  MockBroker,
  FutuBroker,
  WebullBroker,
  ensureLiveSchema,
  recentLiveRuns,
  recentLiveOrders,
} from "./live";
export type {
  LiveConfig,
  LiveIntent,
  LiveTicket,
  LiveSessionResult,
  LiveBroker,
} from "./live";
export { getDuxResearchStatus } from "./status";
