import "server-only";

import path from "node:path";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return defaultValue;
  return raw !== "0" && raw.toLowerCase() !== "false";
}

function envInt(name: string, defaultValue: number, min = 1): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= min ? Math.floor(parsed) : defaultValue;
}

export function isKuriskoDataEnabled(): boolean {
  return envFlag("KURISKO_DATA_ENABLED", true);
}

export function kuriskoDataDir(): string {
  const dir = process.env.KURISKO_DATA_DIR?.trim();
  return dir ? path.resolve(dir) : path.resolve(process.cwd(), "data");
}

export function kuriskoDbPath(): string {
  return path.join(kuriskoDataDir(), "kurisko.db");
}

export function candleRetentionDays(): number {
  return envInt("KURISKO_CANDLE_RETENTION_DAYS", 45);
}

export function snapshotRetentionDays(): number {
  return envInt("KURISKO_SNAPSHOT_RETENTION_DAYS", 14);
}

export function alertRetentionDays(): number {
  return envInt("KURISKO_ALERT_RETENTION_DAYS", 30);
}

export function backfillOnStart(): boolean {
  return envFlag("KURISKO_BACKFILL_ON_START", true);
}

export function snapshotPersistEnabled(): boolean {
  return envFlag("KURISKO_SNAPSHOT_PERSIST", true);
}

export function candleBackfillEveryTick(): boolean {
  return envFlag("KURISKO_CANDLE_BACKFILL_EVERY_TICK", true);
}

export function sqliteWalEnabled(): boolean {
  return envFlag("KURISKO_SQLITE_WAL", true);
}

export function candleRetentionMs(): number {
  return candleRetentionDays() * MS_PER_DAY;
}

export function snapshotRetentionMs(): number {
  return snapshotRetentionDays() * MS_PER_DAY;
}

export function alertRetentionMs(): number {
  return alertRetentionDays() * MS_PER_DAY;
}
