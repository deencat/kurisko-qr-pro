import "server-only";

import { capitalBaseUrl, getCapitalCredentials } from "./config";

export interface CapitalSession {
  cst: string;
  securityToken: string;
  createdAt: number;
}

let cached: CapitalSession | null = null;
const SESSION_TTL_MS = 9 * 60 * 1000;

export function clearCapitalSession() {
  cached = null;
}

export async function getCapitalSession(force = false): Promise<CapitalSession> {
  if (!force && cached && Date.now() - cached.createdAt < SESSION_TTL_MS) {
    return cached;
  }

  const creds = getCapitalCredentials();
  if (!creds) {
    throw new Error(
      "Capital.com API not configured. Set CAPITAL_API_KEY, CAPITAL_IDENTIFIER, and CAPITAL_API_PASSWORD in .env (demo by default)."
    );
  }

  const res = await fetch(`${capitalBaseUrl()}/api/v1/session`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CAP-API-KEY": creds.apiKey,
    },
    body: JSON.stringify({
      identifier: creds.identifier,
      password: creds.password,
      encryptedPassword: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Capital.com session failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const cst = res.headers.get("CST");
  const securityToken = res.headers.get("X-SECURITY-TOKEN");
  if (!cst || !securityToken) {
    throw new Error("Capital.com session missing CST or X-SECURITY-TOKEN headers");
  }

  cached = { cst, securityToken, createdAt: Date.now() };
  return cached;
}
