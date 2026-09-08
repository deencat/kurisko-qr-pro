export type CapitalEnvironment = "demo" | "live";

export function capitalEnvironment(): CapitalEnvironment {
  if (process.env.CAPITAL_DEMO === "false") return "live";
  if (process.env.CAPITAL_DEMO === "true") return "demo";
  // Liquidity / shared env uses CAPITAL_ENV=demo|live
  const env = (process.env.CAPITAL_ENV ?? "demo").trim().toLowerCase();
  return env === "live" ? "live" : "demo";
}

export function capitalBaseUrl(): string {
  const override = process.env.CAPITAL_BASE_URL?.trim();
  if (override) return override.replace(/\/$/, "");
  return capitalEnvironment() === "demo"
    ? "https://demo-api-capital.backend-capital.com"
    : "https://api-capital.backend-capital.com";
}

export interface CapitalCredentials {
  apiKey: string;
  identifier: string;
  password: string;
}

export function getCapitalCredentials(): CapitalCredentials | null {
  const apiKey = process.env.CAPITAL_API_KEY?.trim() ?? "";
  const identifier = process.env.CAPITAL_IDENTIFIER?.trim() ?? "";
  // Kurisko .env.example uses CAPITAL_API_PASSWORD; Liquidity uses CAPITAL_PASSWORD
  const password =
    process.env.CAPITAL_API_PASSWORD?.trim() ||
    process.env.CAPITAL_PASSWORD?.trim() ||
    "";
  if (!apiKey || !identifier || !password) return null;
  return { apiKey, identifier, password };
}

export function isCapitalConfigured(): boolean {
  return getCapitalCredentials() != null;
}
