/**
 * Load Capital credentials for CLI without committing secrets.
 * Supports kurisko-qr-pro/.env and parent Liquidity .env (CAPITAL_PASSWORD).
 */
import fs from "node:fs";
import path from "node:path";

function parseEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env) || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

export function loadCapitalEnv(cwd = process.cwd()): void {
  parseEnvFile(path.join(cwd, ".env"));
  parseEnvFile(path.join(cwd, "..", ".env"));
  // Normalize Liquidity → Kurisko names when only Liquidity vars are present
  if (!process.env.CAPITAL_API_PASSWORD?.trim() && process.env.CAPITAL_PASSWORD?.trim()) {
    process.env.CAPITAL_API_PASSWORD = process.env.CAPITAL_PASSWORD;
  }
  if (!process.env.CAPITAL_DEMO && process.env.CAPITAL_ENV) {
    process.env.CAPITAL_DEMO = process.env.CAPITAL_ENV.trim().toLowerCase() === "live" ? "false" : "true";
  }
}
