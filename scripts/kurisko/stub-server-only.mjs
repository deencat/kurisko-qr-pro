/**
 * Preload: allow CLI scripts to import Next `server-only` modules under tsx.
 * Usage: tsx --import ./scripts/kurisko/stub-server-only.mjs …
 */
import Module from "node:module";

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.apply(this, arguments);
};
