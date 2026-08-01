export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startKuriskoScanScheduler } = await import("@/lib/kurisko/snapshot/scan-scheduler");
    try {
      const { hydrateKuriskoData } = await import("@/lib/kurisko/data/hydrate");
      await hydrateKuriskoData();
    } catch (error) {
      console.error(
        "[kurisko-data] hydration failed — starting scanner without persistence:",
        error instanceof Error ? error.message : error
      );
    }
    startKuriskoScanScheduler();
  }
}
