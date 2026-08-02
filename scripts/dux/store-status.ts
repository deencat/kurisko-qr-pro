import { candleStats, closeDuxDb, loadGusSmokeSeed, openDuxDb, recentIngestLogs } from "../../src/lib/dux";

openDuxDb();
const stats = candleStats();
const logs = recentIngestLogs(10);
const seed = loadGusSmokeSeed();

console.log("=== Dux store candle stats ===");
if (!stats.length) console.log("(empty)");
for (const s of stats) {
  console.log(
    `${s.symbol} ${s.resolution} bars=${s.bars} first=${new Date(s.first_t).toISOString()} last=${new Date(s.last_t).toISOString()}`
  );
}
console.log("\n=== Recent ingest logs ===");
for (const l of logs) {
  console.log(`${l.status} ${l.symbol} ${l.resolution} bars=${l.bars} — ${l.message}`);
}
console.log("\n=== Smoke seed ===");
console.log(`gap_ref=${seed.gap_ref} gap_min=${seed.gap_min} crowded_pm_m=${seed.crowded_pm_m} K=${seed.K}`);
closeDuxDb();
