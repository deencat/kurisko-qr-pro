import fs from "node:fs";
import { duxSmokeSeedPath } from "./config";
import type { GusParams } from "./types";

export function loadGusSmokeSeed(filePath = duxSmokeSeedPath()): GusParams {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as GusParams;
}
