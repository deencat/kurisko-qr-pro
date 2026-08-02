import path from "node:path";

export function duxDataDir(): string {
  return process.env.DUX_DATA_DIR?.trim() || path.join(process.cwd(), "data", "dux");
}

export function duxDbPath(): string {
  return process.env.DUX_DB_PATH?.trim() || path.join(duxDataDir(), "kurisko_dux.db");
}

export function duxSmokeSeedPath(): string {
  return path.join(process.cwd(), "docs", "dux", "gus_smoke_seed.json");
}

export const FUTU_DEFAULT_HOST = process.env.FUTU_OPEND_HOST?.trim() || "127.0.0.1";
export const FUTU_DEFAULT_PORT = Number(process.env.FUTU_OPEND_PORT ?? 11111);
