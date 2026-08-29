// presets.js - Runtime-loaded composite preset configuration
import { setColormaps } from "../utils/colormaps.js";

const PRESETS_URL = new URL("./presets.json", document.baseURI);

// Keep this as a live export so existing consumers see a successfully reloaded
// configuration without needing to be re-imported.
export let PRESET_GROUPS = [];

export async function loadPresetGroups() {
  const url = new URL(PRESETS_URL.href);
  url.searchParams.set("_reload", Date.now().toString());

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Preset config request failed (${response.status})`);
  }

  const config = await response.json();
  const groups = Array.isArray(config) ? config : config?.presets;
  if (!Array.isArray(groups) || groups.some((group) => !group || !group.id || !Array.isArray(group.layers))) {
    throw new Error("Preset config must be an array of groups with id and layers");
  }

  if (!Array.isArray(config) && config.colormaps !== undefined) {
    setColormaps(config.colormaps);
  }
  PRESET_GROUPS = groups;
  return PRESET_GROUPS;
}

export function formatCompactJSON(obj) {
  let str = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
  str = str.replace(/"color":\s*\[\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\]/g, '"color": [$1, $2, $3, $4]');
  str = str.replace(/\{\s*"val":\s*(-?[\d.]+),\s*"color":\s*(\[[^\]]+\])\s*\}/g, '{ "val": $1, "color": $2 }');
  return str;
}

export async function savePresetConfig(configObj) {
  const res = await fetch("/api/config/presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: formatCompactJSON(configObj),
  });
  if (!res.ok) {
    throw new Error(`Failed to save preset config (${res.status})`);
  }
  const groups = Array.isArray(configObj) ? configObj : configObj?.presets;
  if (Array.isArray(groups)) {
    PRESET_GROUPS = groups;
  }
  if (!Array.isArray(configObj) && configObj.colormaps !== undefined) {
    setColormaps(configObj.colormaps);
  }
  return await res.json();
}

export const DEFAULT_MOCK_OBS_FILES = [
  "20260827170000.000",
  "20260827200000.000",
  "20260828020000.000",
  "20260828050000.000",
  "20260828080000.000",
  "20260828110000.000",
  "20260828140000.000",
  "20260828170000.000",
];
