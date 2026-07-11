export type CapitalEnvironment = "demo" | "live";

export function capitalEnvironment(): CapitalEnvironment {
  return process.env.CAPITAL_DEMO === "false" ? "live" : "demo";
}

export function capitalBaseUrl(): string {
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
  const password = process.env.CAPITAL_API_PASSWORD?.trim() ?? "";
  if (!apiKey || !identifier || !password) return null;
  return { apiKey, identifier, password };
}

export function isCapitalConfigured(): boolean {
  return getCapitalCredentials() != null;
}
