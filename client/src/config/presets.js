// presets.js - Runtime-loaded composite preset & layer configuration (config.json)
import { setColormaps } from "../utils/colormaps.js";

const CONFIG_URL = new URL("./config.json", typeof document !== "undefined" ? document.baseURI : "http://localhost:8088/");

// Keep this as a live export so existing consumers see a successfully reloaded
// configuration without needing to be re-imported.
export let PRESET_GROUPS = [];
export let CURRENT_CONFIG = { colormaps: {}, presets: [] };

let autoSaveTimer = null;

export async function loadPresetGroups() {
  let response = await fetch(new URL(CONFIG_URL.href + "?_t=" + Date.now()), { cache: "no-store" });
  if (!response.ok) {
    // Fallback to /api/config
    response = await fetch("/api/config?_t=" + Date.now(), { cache: "no-store" });
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
    throw new Error(`Failed to save config (${res.status})`);
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
  if (!layer || !CURRENT_CONFIG) return;

  let matched = false;

  // 1. Basemap (PMTiles & Graticule) configuration
  if (layer.type === "pmtiles" || layer.id === "pmtiles-base" || layer.id === "basemap") {
    if (!CURRENT_CONFIG.basemap) CURRENT_CONFIG.basemap = {};
    if (layer.config) {
      Object.assign(CURRENT_CONFIG.basemap, layer.config);
    }
    matched = true;
  }

  // 2. Preset Layers configuration
  if (Array.isArray(CURRENT_CONFIG.presets)) {
    for (const preset of CURRENT_CONFIG.presets) {
      if (!Array.isArray(preset.layers)) continue;
      for (const pLayer of preset.layers) {
        if (pLayer.id === layer.id || (pLayer.model === layer.model && pLayer.element === layer.element && (pLayer.level === layer.level || pLayer.level === null || pLayer.level === undefined))) {
          if (!pLayer.render) pLayer.render = {};
          if (layer.config) {
            // Contour & Wind properties
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

            // Station plot field visibility
            if (layer.config.showTemp !== undefined) pLayer.render.showTemp = layer.config.showTemp;
            if (layer.config.showDewpoint !== undefined) pLayer.render.showDewpoint = layer.config.showDewpoint;
            if (layer.config.showCloud !== undefined) pLayer.render.showCloud = layer.config.showCloud;
            if (layer.config.showWeather !== undefined) pLayer.render.showWeather = layer.config.showWeather;
            if (layer.config.showPressure !== undefined) pLayer.render.showPressure = layer.config.showPressure;
            if (layer.config.showTendency !== undefined) pLayer.render.showTendency = layer.config.showTendency;
            if (layer.config.showVisibility !== undefined) pLayer.render.showVisibility = layer.config.showVisibility;
            if (layer.config.showRain6 !== undefined) pLayer.render.showRain6 = layer.config.showRain6;
            if (layer.config.showStreamlines !== undefined) pLayer.render.showStreamlines = layer.config.showStreamlines;

            // Station filter rules & logic
            if (layer.config.filterRules !== undefined) pLayer.render.filterRules = layer.config.filterRules;
            if (layer.config.filterLogic !== undefined) pLayer.render.filterLogic = layer.config.filterLogic;
            if (layer.config.filterField1 !== undefined) pLayer.render.filterField1 = layer.config.filterField1;
            if (layer.config.filterOp1 !== undefined) pLayer.render.filterOp1 = layer.config.filterOp1;
            if (layer.config.filterVal1 !== undefined) pLayer.render.filterVal1 = layer.config.filterVal1;
            if (layer.config.filterField2 !== undefined) pLayer.render.filterField2 = layer.config.filterField2;
            if (layer.config.filterOp2 !== undefined) pLayer.render.filterOp2 = layer.config.filterOp2;
            if (layer.config.filterVal2 !== undefined) pLayer.render.filterVal2 = layer.config.filterVal2;
          }
          matched = true;
        }
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
  "20260827080000.000",
  "20260827140000.000",
  "20260827200000.000",
  "20260828020000.000",
  "20260828080000.000",
  "20260828140000.000",
  "20260828200000.000",
  "20260829020000.000",
  "20260829080000.000",
  "20260829200000.000",
];
