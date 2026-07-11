export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startKuriskoScanScheduler } = await import("@/lib/kurisko/snapshot/scan-scheduler");
    startKuriskoScanScheduler();
  }
}
