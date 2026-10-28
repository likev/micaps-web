// compact-config.mjs - Shrink client/config.json.
//  1. Moves any remaining `colormaps` from config.json into client/colormaps.json.
//  2. Factors repeated layer render options into top-level `renderProfiles`
//     (layers reference them via `renderRef`).
// Idempotent. Usage: node scripts/compact-config.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderProfiles } from "../client/src/config/renderProfiles.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = resolve(ROOT, "client/config.json");
const COLORMAPS_PATH = resolve(ROOT, "client/colormaps.json");

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  }
  return v;
}

function format(obj, { sort }) {
  return JSON.stringify(sort ? sortKeys(obj) : obj, null, 2)
    .replace(/\[\s+(-?\d+(?:\.\d+)?),\s+(-?\d+(?:\.\d+)?),\s+(-?\d+(?:\.\d+)?),\s+(-?\d+(?:\.\d+)?)\s+\]/g, "[$1, $2, $3, $4]")
    .replace(/\{\s*"val":\s*(-?[\d.]+),\s*"color":\s*(\[[^\]]+\])\s*\}/g, '{ "val": $1, "color": $2 }') + "\n";
}

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const colormaps = JSON.parse(readFileSync(COLORMAPS_PATH, "utf8"));
const before = readFileSync(CONFIG_PATH).length;

if (config.colormaps) {
  for (const [name, stops] of Object.entries(config.colormaps)) {
    // colormaps.json wins on conflict (it is the loaded-first, canonical file)
    if (!(name in colormaps)) colormaps[name] = stops;
  }
  delete config.colormaps;
}

buildRenderProfiles(config);

writeFileSync(COLORMAPS_PATH, format(colormaps, { sort: false }), "utf8");
const out = format(config, { sort: true });
writeFileSync(CONFIG_PATH, out, "utf8");
console.log(`config.json: ${before} -> ${Buffer.byteLength(out)} bytes; profiles: ${Object.keys(config.renderProfiles).length}`);
