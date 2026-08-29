// presets.js - Runtime-loaded composite preset & layer configuration (config.json)
import { setColormaps } from "../utils/colormaps.js";

const CONFIG_URL = new URL("./config.json", document.baseURI);

// Keep this as a live export so existing consumers see a successfully reloaded
// configuration without needing to be re-imported.
export let PRESET_GROUPS = [];
export let CURRENT_CONFIG = { colormaps: {}, presets: [] };

let autoSaveTimer = null;

export async function loadPresetGroups() {
  let response = await fetch(new URL(CONFIG_URL.href + "?_t=" + Date.now()), { cache: "no-store" });
  if (!response.ok) {
    // Fallback to /api/config or ./presets.json
    response = await fetch("/api/config?_t=" + Date.now(), { cache: "no-store" });
    if (!response.ok) {
      response = await fetch("./presets.json?_t=" + Date.now(), { cache: "no-store" });
    }
  }
  if (!response.ok) {
    throw new Error(`Config request failed (${response.status})`);
  }

  const config = await response.json();
  CURRENT_CONFIG = config;
  const groups = Array.isArray(config) ? config : config?.presets;
  if (!Array.isArray(groups) || groups.some((group) => !group || !group.id || !Array.isArray(group.layers))) {
    throw new Error("Config must be an array of groups with id and layers");
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

export async function savePresetConfig(configObj = CURRENT_CONFIG) {
  const res = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: formatCompactJSON(configObj),
  });
  if (!res.ok) {
    // Try legacy /api/config/presets
    const legacyRes = await fetch("/api/config/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: formatCompactJSON(configObj),
    });
    if (!legacyRes.ok) throw new Error(`Failed to save config (${res.status})`);
  }
  const groups = Array.isArray(configObj) ? configObj : configObj?.presets;
  if (Array.isArray(groups)) {
    PRESET_GROUPS = groups;
  }
  if (!Array.isArray(configObj) && configObj.colormaps !== undefined) {
    setColormaps(configObj.colormaps);
  }
  CURRENT_CONFIG = configObj;
  return { status: "ok" };
}

export function autoSaveLayerConfig(layer) {
  if (!layer || !CURRENT_CONFIG || !Array.isArray(CURRENT_CONFIG.presets)) return;

  let matched = false;
  for (const preset of CURRENT_CONFIG.presets) {
    if (!Array.isArray(preset.layers)) continue;
    for (const pLayer of preset.layers) {
      if (pLayer.id === layer.id || (pLayer.model === layer.model && pLayer.element === layer.element && (pLayer.level === layer.level || pLayer.level === null))) {
        if (!pLayer.render) pLayer.render = {};
        if (layer.config) {
          if (layer.config.showFill !== undefined) pLayer.render.showFill = layer.config.showFill;
          if (layer.config.showLine !== undefined) pLayer.render.showLine = layer.config.showLine;
          if (layer.config.lineColor !== undefined) pLayer.render.lineColor = layer.config.lineColor;
          if (layer.config.lineWidth !== undefined) pLayer.render.lineWidth = layer.config.lineWidth;
          if (layer.config.boldValues !== undefined) pLayer.render.boldValues = layer.config.boldValues;
          if (layer.config.boldLineWidth !== undefined) pLayer.render.boldLineWidth = layer.config.boldLineWidth;
          if (layer.config.opacity !== undefined) pLayer.render.opacity = layer.config.opacity;
          if (layer.config.showRaster !== undefined) pLayer.render.showRaster = layer.config.showRaster;
          if (layer.config.showWind !== undefined) pLayer.render.showWind = layer.config.showWind;
          if (layer.config.showBarbs !== undefined) pLayer.render.showBarbs = layer.config.showBarbs;
        }
        matched = true;
      }
    }
  }

  if (matched) {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      savePresetConfig(CURRENT_CONFIG).catch((err) => console.warn("[ConfigAutoSave] Failed to auto-save:", err));
    }, 400);
  }
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
