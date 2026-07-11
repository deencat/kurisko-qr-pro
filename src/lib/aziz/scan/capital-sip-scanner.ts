import "server-only";

import { isCapitalConfigured, fetchAllCapitalCandlesByEpic } from "@/lib/capital/client";
import {
  type CapitalAssetClass,
  type CapitalAssetGroupNodeKey,
  type CapitalMoverNodeKey,
  type CapitalNavigationMarket,
  capitalAssetClassOf,
  capitalMarketTicker,
  capitalSpreadPct,
  fetchCapitalAssetGroupUniverse,
  fetchCapitalMoverUniverse,
  getCapitalClientSentiment,
  isTradeableCapitalInstrument,
} from "@/lib/capital/markets";
import { fetchSymbolCatalyst, isFinnhubConfigured } from "@/lib/aziz/news/finnhub";
import {
  getActiveOpenDriveWindow,
  GLOBAL_SESSION_LABELS,
  type GlobalSessionId,
} from "@/lib/aziz/session/global-sessions";
import {
  DEFAULT_AZIZ_SIP_THRESHOLDS,
  type AzizSipScanResult,
  type AzizSipScanRow,
  type AzizSipThresholds,
  type AzizSipUniverse,
  type CapitalScanAssetClass,
} from "./sip-types";
import { buildSipMetricsFromCandles, evaluateSip } from "./sip-metrics";
import { etYmd } from "./session-et";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function nodesForUniverse(universe: AzizSipUniverse): CapitalMoverNodeKey[] {
  switch (universe) {
    case "capital_gainers":
      return ["top_gainers"];
    case "capital_volatile":
      return ["most_volatile"];
    case "capital_movers":
    case "capital_all":
    case "capital_shares":
    case "capital_indices":
    case "capital_commodities":
    case "capital_forex":
    default:
      return ["top_gainers", "most_volatile", "most_traded"];
  }
}

function assetClassForUniverse(universe: AzizSipUniverse): CapitalScanAssetClass {
  switch (universe) {
    case "capital_shares":
      return "shares";
    case "capital_indices":
      return "indices";
    case "capital_commodities":
      return "commodities";
    case "capital_forex":
      return "forex";
    default:
      return "all";
  }
}

function assetGroupsForUniverse(universe: AzizSipUniverse): CapitalAssetGroupNodeKey[] {
  switch (universe) {
    case "capital_shares":
      return ["shares_us", "shares_uk"];
    case "capital_indices":
      return ["indices"];
    case "capital_commodities":
      return ["commodities"];
    case "capital_forex":
      return ["forex"];
    case "capital_all":
      return ["shares_us", "indices", "commodities", "forex"];
    default:
      return [];
  }
}

async function loadCapitalUniverse(
  universe: AzizSipUniverse,
  assetClass: CapitalScanAssetClass
) {
  const movers = await fetchCapitalMoverUniverse({
    nodes: nodesForUniverse(universe),
    limitPerNode: 100,
    assetClass,
  });
  const groups = assetGroupsForUniverse(universe);
  if (!groups.length) return movers;

  const grouped = await fetchCapitalAssetGroupUniverse({
    groups,
    limitPerGroup: 80,
    assetClass,
  });

  const byEpic = new Map<string, CapitalNavigationMarket & { moverSource: string }>();
  for (const m of [...grouped, ...movers]) {
    const existing = byEpic.get(m.epic);
    if (!existing || Math.abs(m.percentageChange ?? 0) > Math.abs(existing.percentageChange ?? 0)) {
      byEpic.set(m.epic, m);
    }
  }
  return [...byEpic.values()];
}

function rankMovers(
  markets: Array<CapitalNavigationMarket & { moverSource: string }>
): typeof markets {
  return [...markets].sort((a, b) => {
    const aMove = Math.abs(a.percentageChange ?? 0);
    const bMove = Math.abs(b.percentageChange ?? 0);
    if (bMove !== aMove) return bMove - aMove;
    const aRange = (a.high ?? 0) - (a.low ?? 0);
    const bRange = (b.high ?? 0) - (b.low ?? 0);
    return bRange - aRange;
  });
}

async function scanCapitalEpic(params: {
  epic: string;
  symbol: string;
  assetClass: CapitalAssetClass | null;
  thresholds: AzizSipThresholds;
  changePct: number | null;
  spreadPct: number | null;
  moverSource: string;
  drive: ReturnType<typeof getActiveOpenDriveWindow>;
}): Promise<AzizSipScanRow | null> {
  const endTs = Date.now();
  const startTs = endTs - 16 * MS_PER_DAY;

  try {
    const [daily, candles5m] = await Promise.all([
      fetchAllCapitalCandlesByEpic({
        epic: params.epic,
        resolution: "1d",
        startTimestamp: endTs - 25 * MS_PER_DAY,
        endTimestamp: endTs,
        minBars: 12,
      }),
      fetchAllCapitalCandlesByEpic({
        epic: params.epic,
        resolution: "5m",
        startTimestamp: startTs,
        endTimestamp: endTs,
        minBars: 400,
      }),
    ]);

    const metrics = buildSipMetricsFromCandles({
      symbol: params.symbol,
      marketId: 0,
      epic: params.epic,
      sessionYmd: etYmd(new Date(params.drive.startMs)),
      daily,
      candles5m,
      spreadPct: params.spreadPct,
      changePct: params.changePct,
      moverSource: params.moverSource,
      assetClass: params.assetClass ?? undefined,
      activeSession: params.drive.session,
      windowStart: params.drive.startMs,
      windowEnd: params.drive.endMs,
      sessionLabel: params.drive.label,
    });

    if (!metrics) return null;
    return evaluateSip(metrics, params.thresholds, params.assetClass ?? "all");
  } catch {
    return null;
  }
}

export async function scanAzizSipCapital(params: {
  universe?: AzizSipUniverse;
  assetClass?: CapitalScanAssetClass;
  maxSymbols?: number;
  thresholds?: Partial<AzizSipThresholds>;
  onProgress?: (message: string) => void;
}): Promise<AzizSipScanResult> {
  if (!isCapitalConfigured()) {
    throw new Error(
      "Capital.com not configured. Set CAPITAL_API_KEY, CAPITAL_IDENTIFIER, CAPITAL_API_PASSWORD in .env."
    );
  }

  const thresholds: AzizSipThresholds = { ...DEFAULT_AZIZ_SIP_THRESHOLDS, ...params.thresholds };
  const universe = params.universe ?? "capital_all";
  const assetClass = params.assetClass ?? assetClassForUniverse(universe);
  const drive = getActiveOpenDriveWindow();
  const sessionYmd = etYmd(new Date());
  const maxSymbols = params.maxSymbols ?? 30;

  params.onProgress?.(
    `Capital.com: ${GLOBAL_SESSION_LABELS[drive.session]} — loading movers (${assetClass})…`
  );

  const rawMovers = await loadCapitalUniverse(universe, assetClass);

  const ranked = rankMovers(rawMovers).slice(0, maxSymbols);

  params.onProgress?.(
    `Capital.com: ${ranked.length} instruments — SIP on ${drive.label}…`
  );

  const results: AzizSipScanRow[] = [];

  for (let i = 0; i < ranked.length; i++) {
    const m = ranked[i];
    const symbol = capitalMarketTicker(m);
    const cls = capitalAssetClassOf(m);
    params.onProgress?.(`SIP ${i + 1}/${ranked.length}: ${symbol} (${m.epic})…`);

    const row = await scanCapitalEpic({
      epic: m.epic,
      symbol,
      assetClass: cls,
      thresholds,
      changePct: m.percentageChange ?? null,
      spreadPct: capitalSpreadPct(m),
      moverSource: m.moverSource,
      drive,
    });

    if (row) results.push(row);
    await new Promise((r) => setTimeout(r, 180));
  }

  results.sort((a, b) => b.score - a.score);

  const sentimentIds = results.slice(0, 15).map((r) => r.epic ?? r.symbol);
  try {
    const sentiments = await getCapitalClientSentiment(sentimentIds);
    for (const row of results.slice(0, 15)) {
      const key = row.epic ?? row.symbol;
      const s = sentiments.get(key);
      if (s) row.longSentimentPct = s.longPositionPercentage;
    }
  } catch {
    /* optional */
  }

  const qualified = results.filter((r) => r.ready).length;

  if (isFinnhubConfigured()) {
    for (const row of results.slice(0, 12)) {
      try {
        const catalyst = await fetchSymbolCatalyst({
          symbol: row.symbol,
          lookbackDays: 2,
          assetClass: row.assetClass,
        });
        const catalystHeadline = catalyst.headlines.find((h) => h.mentionsSymbol);
        row.hasCatalyst = Boolean(catalystHeadline);
        row.catalystHeadline = catalystHeadline?.headline ?? null;
        await new Promise((r) => setTimeout(r, 280));
      } catch {
        row.hasCatalyst = false;
      }
    }
  }

  const newsNote = isFinnhubConfigured()
    ? "Finnhub catalyst flags on top rows."
    : "Set FINNHUB_API_KEY for automated catalyst flags.";

  return {
    scanned: results.length,
    moversAttempted: ranked.length,
    qualified,
    sessionDate: sessionYmd,
    universe,
    dataSource: "capital",
    thresholds,
    results,
    activeSession: drive.session,
    scanWindowLabel: drive.label,
    note:
      `Multi-asset Capital scan (${assetClass}) — crypto excluded. ` +
      `Active session: ${GLOBAL_SESSION_LABELS[drive.session as GlobalSessionId]}. ` +
      `Algo may trade all sessions; calendar gates are optional in backtest (sessionPolicy). ` +
      newsNote,
  };
}
