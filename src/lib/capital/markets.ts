import "server-only";

import { capitalFetch } from "./client";

export const CAPITAL_MOVER_NODES = {
  top_gainers: "hierarchy_v1.commons.top_gainers",
  top_losers: "hierarchy_v1.commons.top_losers",
  most_volatile: "hierarchy_v1.commons.most_volatile",
  most_traded: "hierarchy_v1.commons.most_traded",
} as const;

/** Asset-class navigation trees (supplement movers for class-specific SIP). */
export const CAPITAL_ASSET_GROUP_NODES = {
  shares_us: "hierarchy_v1.shares.us",
  shares_uk: "hierarchy_v1.shares.uk",
  indices: "hierarchy_v1.indices",
  commodities: "hierarchy_v1.commodities",
  forex: "hierarchy_v1.forex",
} as const;

export type CapitalMoverNodeKey = keyof typeof CAPITAL_MOVER_NODES;
export type CapitalAssetGroupNodeKey = keyof typeof CAPITAL_ASSET_GROUP_NODES;

export type CapitalAssetClass = "all" | "shares" | "indices" | "commodities" | "forex";

const CRYPTO_TYPES = new Set(["CRYPTOCURRENCIES", "CRYPTO", "CRYPTOCURRENCY"]);

export function normalizeCapitalInstrumentType(raw?: string): string {
  return (raw ?? "").toUpperCase().replace(/\s+/g, "_");
}

export function isCapitalCrypto(m: CapitalNavigationMarket): boolean {
  const t = normalizeCapitalInstrumentType(m.instrumentType);
  return CRYPTO_TYPES.has(t) || t.includes("CRYPTO");
}

export function capitalAssetClassOf(m: CapitalNavigationMarket): CapitalAssetClass | null {
  const t = normalizeCapitalInstrumentType(m.instrumentType);
  if (isCapitalCrypto(m)) return null;
  if (t === "SHARES" || t === "SHARE") return "shares";
  if (t === "INDICES" || t === "INDEX") return "indices";
  if (t === "COMMODITIES" || t === "COMMODITY") return "commodities";
  if (t === "CURRENCIES" || t === "CURRENCY" || t === "FOREX") return "forex";
  return "commodities";
}

export function isTradeableCapitalInstrument(
  m: CapitalNavigationMarket,
  assetClass: CapitalAssetClass = "all"
): boolean {
  if (!m.epic || m.marketStatus !== "TRADEABLE") return false;
  if (isCapitalCrypto(m)) return false;
  const cls = capitalAssetClassOf(m);
  if (!cls) return false;
  if (assetClass !== "all" && cls !== assetClass) return false;
  const price = midPrice(m);
  if (cls === "shares" && (price < 5 || price > 500)) return false;
  if (cls === "forex" && price <= 0) return false;
  if ((cls === "commodities" || cls === "indices") && price <= 0) return false;
  return price > 0;
}

/** @deprecated Use isTradeableCapitalInstrument(m, 'shares') */
export function isTradeableUsShare(m: CapitalNavigationMarket): boolean {
  return isTradeableCapitalInstrument(m, "shares");
}

export interface CapitalNavigationMarket {
  epic: string;
  symbol?: string;
  instrumentName?: string;
  instrumentType?: string;
  marketStatus?: string;
  bid?: number;
  offer?: number;
  percentageChange?: number;
  netChange?: number;
  high?: number;
  low?: number;
}

export interface CapitalClientSentiment {
  marketId: string;
  longPositionPercentage: number;
  shortPositionPercentage: number;
}

function midPrice(m: CapitalNavigationMarket): number {
  const bid = m.bid ?? 0;
  const ask = m.offer ?? bid;
  if (!bid && !ask) return 0;
  return (bid + ask) / 2;
}

export function capitalMarketTicker(m: CapitalNavigationMarket): string {
  const sym = m.symbol?.trim();
  if (sym && sym.length <= 6 && /^[A-Z0-9.]+$/i.test(sym)) {
    return sym.toUpperCase();
  }
  const epic = m.epic?.trim();
  if (epic && epic.length <= 6 && /^[A-Z0-9.]+$/i.test(epic)) {
    return epic.toUpperCase();
  }
  return (sym ?? epic ?? "UNKNOWN").toUpperCase();
}

export function capitalSpreadPct(m: CapitalNavigationMarket): number | null {
  const bid = m.bid;
  const ask = m.offer;
  const mid = midPrice(m);
  if (bid == null || ask == null || mid <= 0) return null;
  return ((ask - bid) / mid) * 100;
}

export async function getCapitalNavigationMarkets(
  nodeId: string,
  limit = 100
): Promise<CapitalNavigationMarket[]> {
  const { data } = await capitalFetch<{ markets?: CapitalNavigationMarket[] }>(
    `/api/v1/marketnavigation/${encodeURIComponent(nodeId)}?limit=${Math.min(500, Math.max(1, limit))}`
  );
  return data.markets ?? [];
}

export async function fetchCapitalMoverUniverse(params: {
  nodes: CapitalMoverNodeKey[];
  limitPerNode?: number;
  assetClass?: CapitalAssetClass;
}): Promise<Array<CapitalNavigationMarket & { moverSource: CapitalMoverNodeKey }>> {
  const limit = params.limitPerNode ?? 80;
  const assetClass = params.assetClass ?? "all";
  const byEpic = new Map<string, CapitalNavigationMarket & { moverSource: CapitalMoverNodeKey }>();

  for (const nodeKey of params.nodes) {
    const nodeId = CAPITAL_MOVER_NODES[nodeKey];
    const markets = await getCapitalNavigationMarkets(nodeId, limit);
    for (const m of markets) {
      if (!m.epic || !isTradeableCapitalInstrument(m, assetClass)) continue;
      const existing = byEpic.get(m.epic);
      if (!existing) {
        byEpic.set(m.epic, { ...m, moverSource: nodeKey });
      } else if (Math.abs(m.percentageChange ?? 0) > Math.abs(existing.percentageChange ?? 0)) {
        byEpic.set(m.epic, { ...m, moverSource: nodeKey });
      }
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  return [...byEpic.values()];
}

export async function fetchCapitalAssetGroupUniverse(params: {
  groups: CapitalAssetGroupNodeKey[];
  limitPerGroup?: number;
  assetClass?: CapitalAssetClass;
}): Promise<Array<CapitalNavigationMarket & { moverSource: CapitalAssetGroupNodeKey }>> {
  const limit = params.limitPerGroup ?? 60;
  const assetClass = params.assetClass ?? "all";
  const byEpic = new Map<
    string,
    CapitalNavigationMarket & { moverSource: CapitalAssetGroupNodeKey }
  >();

  for (const groupKey of params.groups) {
    const nodeId = CAPITAL_ASSET_GROUP_NODES[groupKey];
    try {
      const markets = await getCapitalNavigationMarkets(nodeId, limit);
      for (const m of markets) {
        if (!m.epic || !isTradeableCapitalInstrument(m, assetClass)) continue;
        if (!byEpic.has(m.epic)) {
          byEpic.set(m.epic, { ...m, moverSource: groupKey });
        }
      }
    } catch {
      /* group may be unavailable on demo */
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  return [...byEpic.values()];
}

export async function listCapitalNavigationRoot(): Promise<
  Array<{ id?: string; name?: string }>
> {
  const { data } = await capitalFetch<{ nodes?: Array<{ id?: string; name?: string }> }>(
    "/api/v1/marketnavigation"
  );
  return data.nodes ?? [];
}

export async function getCapitalClientSentiment(
  marketIds: string[]
): Promise<Map<string, CapitalClientSentiment>> {
  const out = new Map<string, CapitalClientSentiment>();
  if (!marketIds.length) return out;

  const chunkSize = 40;
  for (let i = 0; i < marketIds.length; i += chunkSize) {
    const chunk = marketIds.slice(i, i + chunkSize);
    const { data } = await capitalFetch<{ clientSentiments?: CapitalClientSentiment[] }>(
      `/api/v1/clientsentiment?marketIds=${encodeURIComponent(chunk.join(","))}`
    );
    for (const s of data.clientSentiments ?? []) {
      out.set(s.marketId, s);
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  return out;
}
