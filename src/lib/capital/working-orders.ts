import "server-only";

import { capitalFetch } from "./client";

export type CapitalWorkingOrderType = "LIMIT" | "STOP";

export interface CapitalWorkingOrder {
  dealId: string;
  epic: string;
  direction: "BUY" | "SELL";
  orderType: CapitalWorkingOrderType;
  size: number;
  level: number;
  currency?: string;
  createdDate?: string;
}

export async function listCapitalWorkingOrders(): Promise<CapitalWorkingOrder[]> {
  const { data } = await capitalFetch<{
    workingOrders?: Array<{ workingOrder?: CapitalWorkingOrder } | CapitalWorkingOrder>;
  }>("/api/v1/workingorders");
  const rows = data.workingOrders ?? [];
  return rows
    .map((row) => ("workingOrder" in row && row.workingOrder ? row.workingOrder : (row as CapitalWorkingOrder)))
    .filter((o) => o.dealId && o.epic);
}

export async function createCapitalWorkingOrder(params: {
  epic: string;
  direction: "BUY" | "SELL";
  type: CapitalWorkingOrderType;
  size: number;
  level: number;
  goodTillDate?: string;
  guaranteedStop?: boolean;
}): Promise<{ dealReference: string }> {
  const { data } = await capitalFetch<{ dealReference?: string }>("/api/v1/workingorders", {
    method: "POST",
    body: JSON.stringify({
      epic: params.epic,
      direction: params.direction,
      type: params.type,
      size: params.size,
      level: params.level,
      goodTillDate: params.goodTillDate,
      guaranteedStop: params.guaranteedStop ?? false,
    }),
  });
  if (!data.dealReference) throw new Error("Capital.com: no dealReference for working order");
  return { dealReference: data.dealReference };
}

export async function updateCapitalWorkingOrder(
  dealId: string,
  patch: { level?: number; size?: number }
): Promise<void> {
  await capitalFetch(`/api/v1/workingorders/${encodeURIComponent(dealId)}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export async function deleteCapitalWorkingOrder(dealId: string): Promise<void> {
  await capitalFetch(`/api/v1/workingorders/${encodeURIComponent(dealId)}`, {
    method: "DELETE",
  });
}
