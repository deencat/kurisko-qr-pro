/** Capital.com bars use UTC epoch ms — display both UTC and Hong Kong for chart cross-check. */
export function formatBarTime(tsMs: number): { utc: string; hkt: string; iso: string } {
  const iso = new Date(tsMs).toISOString();
  const utc = iso.replace("T", " ").slice(0, 19);
  const hkt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(new Date(tsMs))
    .replace(" ", "T");
  return { utc: `${utc} UTC`, hkt: `${hkt} HKT`, iso };
}

export function capitalPlatformHint(symbol: string): string {
  return `Open Capital.com demo → search ${symbol} → set chart to same execution TF. Bar times below are UTC (Capital API); add 8h for Hong Kong.`;
}
