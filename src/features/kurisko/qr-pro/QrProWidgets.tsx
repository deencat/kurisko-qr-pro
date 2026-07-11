"use client";

import type { KuriskoSnapshot } from "@/lib/kurisko/snapshot/types";
import { QrProEconomicSchedule, QrProFearGreedGauge } from "./QrProMarketWidgets";
import { QrProGapScanner } from "./QrProGapScanner";
import { QrProKeyLevelsTable } from "./QrProKeyLevelsTable";
import { QrProPreMarket } from "./QrProPreMarket";

/** Second-row QR Pro widgets matching reference layout. */
export function QrProWidgets() {
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
      <QrProGapScanner />
      <QrProPreMarket />
      <QrProEconomicSchedule />
      <QrProKeyLevelsTable />
      <QrProFearGreedGauge />
    </div>
  );
}
