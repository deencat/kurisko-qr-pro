import "server-only";

import { capitalFetch } from "./client";
import type { CapitalNavigationMarket } from "./markets";

export interface CapitalPosition {
  dealId: string;
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  level: number;
  upl?: number;
  createdDate?: string;
}

export interface CapitalAccountSummary {
  accountId?: string;
  accountName?: string;
  balance?: number;
  deposit?: number;
  profitLoss?: number;
  available?: number;
  currency?: string;
}

function normalizeAccountRow(raw: Record<string, unknown>): CapitalAccountSummary {
  const bal = raw.balance;
  if (bal && typeof bal === "object" && bal !== null) {
    const nested = bal as Record<string, unknown>;
    return {
      accountId: raw.accountId as string | undefined,
      accountName: raw.accountName as string | undefined,
      balance: Number(nested.balance ?? nested.deposit ?? 0),
      deposit: Number(nested.deposit ?? 0),
      profitLoss: Number(nested.profitLoss ?? 0),
      available: Number(nested.available ?? nested.balance ?? 0),
      currency: (raw.currency as string) ?? undefined,
    };
  }
  return {
    accountId: raw.accountId as string | undefined,
    accountName: raw.accountName as string | undefined,
    balance: Number(raw.balance ?? 0),
    deposit: Number(raw.deposit ?? 0),
    profitLoss: Number(raw.profitLoss ?? 0),
    available: Number(raw.available ?? raw.balance ?? 0),
    currency: (raw.currency as string) ?? undefined,
  };
}

export async function listCapitalPositions(): Promise<
  Array<{ position: CapitalPosition; market?: CapitalNavigationMarket }>
> {
  const { data } = await capitalFetch<{
    positions?: Array<{ position: CapitalPosition; market?: CapitalNavigationMarket }>;
  }>("/api/v1/positions");
  return data.positions ?? [];
}

export async function getCapitalAccounts(): Promise<CapitalAccountSummary[]> {
  const { data } = await capitalFetch<{ accounts?: Record<string, unknown>[] }>("/api/v1/accounts");
  return (data.accounts ?? []).map(normalizeAccountRow);
}

export async function createCapitalPosition(params: {
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  stopLevel?: number;
  profitLevel?: number;
  guaranteedStop?: boolean;
}): Promise<{ dealReference: string }> {
  const { data } = await capitalFetch<{ dealReference?: string }>("/api/v1/positions", {
    method: "POST",
    body: JSON.stringify({
      epic: params.epic,
      direction: params.direction,
      size: params.size,
      stopLevel: params.stopLevel,
      profitLevel: params.profitLevel,
      guaranteedStop: params.guaranteedStop ?? false,
    }),
  });
  if (!data.dealReference) throw new Error("Capital.com: no dealReference returned");
  return { dealReference: data.dealReference };
}

export async function closeCapitalPosition(dealId: string): Promise<void> {
  await capitalFetch(`/api/v1/positions/${encodeURIComponent(dealId)}`, {
    method: "DELETE",
  });
}
