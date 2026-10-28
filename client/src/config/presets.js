// presets.js - Runtime-loaded composite preset & layer configuration (config.json)
import { setColormaps } from "../utils/colormaps.js";
import { expandRenderProfiles, compactConfigForSave } from "./renderProfiles.js";
import { isUpperAirStationLayer } from "../ui/layers/layerDefaults.js";

const CONFIG_URL = new URL("./config.json", (typeof document !== "undefined" && document.baseURI) ? document.baseURI : "http://localhost:8088/");
const COLORMAPS_URL = new URL("./colormaps.json", (typeof document !== "undefined" && document.baseURI) ? document.baseURI : "http://localhost:8088/");

// Keep this as a live export so existing consumers see a successfully reloaded
// configuration without needing to be re-imported.
export let PRESET_GROUPS = [];
export let CURRENT_CONFIG = { colormaps: {}, presets: [] };

// Memory optimization budget (§8.8.4): max cells fed into Marching Squares.
// Single source of compiled-in fallback; runtime value lives in
// client/config.json -> performance.maxEffectiveCells (never hardcoded at call sites).
export const DEFAULT_MAX_EFFECTIVE_CELLS = 50000;
export const MIN_MAX_EFFECTIVE_CELLS = 1000;
export const MAX_MAX_EFFECTIVE_CELLS = 4000000;

/**
 * Resolve the effective Marching Squares cell budget.
 * Precedence: explicit override > CURRENT_CONFIG.performance.maxEffectiveCells
 * > window.__MICAPS_CONFIG__.performance.maxEffectiveCells > compiled default.
 * Invalid values fall back to the default; valid values are clamped to sane bounds.
 */
export function getMaxEffectiveCells(overrideValue) {
  const pick = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : null);
  const fromOverride = pick(overrideValue);
  if (fromOverride !== null) {
    return Math.max(MIN_MAX_EFFECTIVE_CELLS, Math.min(MAX_MAX_EFFECTIVE_CELLS, fromOverride));
  }
  let fromConfig = null;
  try {
    fromConfig = pick(CURRENT_CONFIG?.performance?.maxEffectiveCells);
  } catch {}
  if (fromConfig === null) {
    try {
      fromConfig = pick(typeof window !== "undefined" ? window.__MICAPS_CONFIG__?.performance?.maxEffectiveCells : null);
    } catch {}
  }
  if (fromConfig === null) return DEFAULT_MAX_EFFECTIVE_CELLS;
  return Math.max(MIN_MAX_EFFECTIVE_CELLS, Math.min(MAX_MAX_EFFECTIVE_CELLS, fromConfig));
}

export const DEFAULT_PREFETCH_CONFIG = {
  serverWarm: true,
  maxItems: 12,
  playbackLookahead: 2,
};

export function getPrefetchConfig() {
  const pick = (v) => (typeof v === "object" && v !== null ? v : null);
  let fromConfig = null;
  try {
    fromConfig = pick(CURRENT_CONFIG?.performance?.prefetch);
  } catch {}
  if (!fromConfig) {
    try {
      fromConfig = pick(typeof window !== "undefined" ? window.__MICAPS_CONFIG__?.performance?.prefetch : null);
    } catch {}
  }
  const cfg = fromConfig || {};
  return {
    serverWarm: cfg.serverWarm !== undefined ? Boolean(cfg.serverWarm) : DEFAULT_PREFETCH_CONFIG.serverWarm,
    maxItems: typeof cfg.maxItems === "number" && cfg.maxItems > 0 ? cfg.maxItems : DEFAULT_PREFETCH_CONFIG.maxItems,
    playbackLookahead: typeof cfg.playbackLookahead === "number" && cfg.playbackLookahead > 0 ? cfg.playbackLookahead : DEFAULT_PREFETCH_CONFIG.playbackLookahead,
  };
}

let autoSaveTimer = null;

export function isDivider(entry) {
  return Boolean(entry && entry.divider === true);
}

export function formatDividerOption(entry) {
  const label = entry?.label ? String(entry.label).trim() : "";
  return label ? `───── ${label} ─────` : "────────";
}

export function getLoadableGroups(groups = PRESET_GROUPS) {
  if (!Array.isArray(groups)) return [];
  return groups.filter((g) => !isDivider(g));
}

/**
 * Renders HTML string of <option> elements for preset groups,
 * properly formatting dividers as disabled separator options.
 * @param {Array} [groups=PRESET_GROUPS]
 * @param {string|null} [selectedId=null]
 * @returns {string}
 */
export function renderPresetOptions(groups = PRESET_GROUPS, selectedId = null) {
  if (!Array.isArray(groups)) return "";
  return groups
    .map((g) => {
      if (!g) return "";
      if (isDivider(g)) {
        return `<option value="" disabled class="preset-divider-option">${formatDividerOption(g)}</option>`;
      }
      const isSelected = selectedId && g.id === selectedId ? " selected" : "";
      return `<option value="${g.id}"${isSelected}>${g.name || g.id}</option>`;
    })
    .join("");
}

const configListeners = new Set();

export function onConfigLoaded(cb) {
  if (typeof cb !== "function") return () => {};
  configListeners.add(cb);
  return () => configListeners.delete(cb);
}

export function notifyConfigLoaded() {
  configListeners.forEach((cb) => {
    try {
      cb(CURRENT_CONFIG, PRESET_GROUPS);
    } catch (e) {
      console.error("[Config] Listener error:", e);
    }
  });
}

export async function loadColormaps() {
  try {
    let response = await fetch(new URL(COLORMAPS_URL.href + "?_t=" + Date.now()), { cache: "no-store" });
    if (!response.ok) {
      response = await fetch("/api/colormaps?_t=" + Date.now(), { cache: "no-store" });
    }
    if (!response.ok) {
      response = await fetch("/colormaps.json?_t=" + Date.now(), { cache: "no-store" });
    }
    if (response.ok) {
      const data = await response.json();
      const colormaps = (data && typeof data === "object" && !Array.isArray(data) && data.colormaps) ? data.colormaps : data;
      if (colormaps && typeof colormaps === "object" && !Array.isArray(colormaps) && Object.keys(colormaps).length > 0) {
        setColormaps(colormaps);
        return colormaps;
      }
    }
  } catch (err) {
    // Graceful fallback to built-in or config colormaps
  }
  return null;
}

export async function loadPresetGroups() {
  const [colormapsRes, configRes] = await Promise.allSettled([
    loadColormaps(),
    (async () => {
      let response = await fetch(new URL(CONFIG_URL.href + "?_t=" + Date.now()), { cache: "no-store" });
      if (!response.ok) {
        // Fallback to /api/config
        response = await fetch("/api/config?_t=" + Date.now(), { cache: "no-store" });
      }
      if (!response.ok) {
        throw new Error(`Config request failed (${response.status})`);
      }
      return response.json();
    })()
  ]);

  if (configRes.status !== "fulfilled") {
    throw configRes.reason;
  }
  const config = configRes.value;
  CURRENT_CONFIG = config;
  // expose for mapInstance resolveInitialBasemapScheme
  try {
    if (typeof window !== "undefined") window.__MICAPS_CONFIG__ = config;
    if (typeof globalThis !== "undefined") globalThis.__MICAPS_CONFIG__ = config;
  } catch {}
  const groups = Array.isArray(config) ? config : config?.presets;
  if (!Array.isArray(groups) || groups.some((group) => {
    if (!group || !group.id) return true;
    if (isDivider(group)) return false;
    return !Array.isArray(group.layers);
  })) {
    throw new Error("Config must be an array of groups with id and layers");
  }

  // Expand shared render profiles so layers always carry complete `render` objects.
  if (!Array.isArray(config)) expandRenderProfiles(config);

  const colormapsLoaded = colormapsRes.status === "fulfilled" ? colormapsRes.value : null;
  const mergedColormaps = {
    ...(colormapsLoaded || {}),
    ...(!Array.isArray(config) && config?.colormaps ? config.colormaps : {}),
  };
  if (Object.keys(mergedColormaps).length > 0) {
    setColormaps(mergedColormaps);
    if (!Array.isArray(config)) {
      config.colormaps = mergedColormaps;
    }
  }

  // persist basemap scheme and projection for next map creation (maptile only, no UI chrome change)
  try {
    const scheme = config?.basemap?.scheme;
    if (scheme === "light" || scheme === "dark" || scheme === "brutalism") {
      try { if (typeof localStorage !== "undefined") localStorage.setItem("micaps-basemap-scheme", scheme); } catch {}
    }
    const proj = config?.basemap?.projection;
    if (proj === "mercator" || proj === "globe" || proj === "vertical-perspective") {
      try { if (typeof localStorage !== "undefined") localStorage.setItem("micaps-map-projection", proj); } catch {}
    }
  } catch {}
  PRESET_GROUPS = groups;
  notifyConfigLoaded();
  return PRESET_GROUPS;
}

export function formatCompactJSON(obj) {
  let str = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
  str = str.replace(/"color":\s*\[\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\]/g, '"color": [$1, $2, $3, $4]');
  str = str.replace(/\{\s*"val":\s*(-?[\d.]+),\s*"color":\s*(\[[^\]]+\])\s*\}/g, '{ "val": $1, "color": $2 }');
  return str;
}

export async function savePresetConfig(configObj = CURRENT_CONFIG) {
  // colormaps live in colormaps.json; render options shared via renderProfiles.
  const hasColormaps = !Array.isArray(configObj) && configObj?.colormaps && typeof configObj.colormaps === "object";
  if (hasColormaps) {
    const cmRes = await fetch("/api/colormaps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: formatCompactJSON(configObj.colormaps),
    });
    if (!cmRes.ok) {
      throw new Error(`Failed to save colormaps (${cmRes.status})`);
    }
  }
  const res = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: formatCompactJSON(Array.isArray(configObj) ? configObj : compactConfigForSave(configObj)),
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
  try {
    if (typeof window !== "undefined") window.__MICAPS_CONFIG__ = configObj;
    if (typeof globalThis !== "undefined") globalThis.__MICAPS_CONFIG__ = configObj;
    const scheme = configObj?.basemap?.scheme;
    if (scheme === "light" || scheme === "dark" || scheme === "brutalism") {
      try { if (typeof localStorage !== "undefined") localStorage.setItem("micaps-basemap-scheme", scheme); } catch {}
    }
    const proj = configObj?.basemap?.projection;
    if (proj === "mercator" || proj === "globe" || proj === "vertical-perspective") {
      try { if (typeof localStorage !== "undefined") localStorage.setItem("micaps-map-projection", proj); } catch {}
    }
  } catch {}
  notifyConfigLoaded();
  return { status: "ok", ok: true };
}

export function autoSaveLayerConfig(layer) {
  if (!layer || !CURRENT_CONFIG) return;

  let matched = false;

  // 1. Basemap (PMTiles & Graticule) configuration
  if (layer.type === "pmtiles" || layer.id === "pmtiles-base" || layer.id === "basemap" || layer.id?.startsWith("layer-pmtiles")) {
    if (!CURRENT_CONFIG.basemap) CURRENT_CONFIG.basemap = {};
    if (layer.config) {
      Object.assign(CURRENT_CONFIG.basemap, layer.config);
      if (layer.config.scheme && (layer.config.scheme === "light" || layer.config.scheme === "dark" || layer.config.scheme === "brutalism")) {
        try { if (typeof localStorage !== "undefined") localStorage.setItem("micaps-basemap-scheme", layer.config.scheme); } catch {}
      }
      if (layer.config.projection && (layer.config.projection === "mercator" || layer.config.projection === "globe" || layer.config.projection === "vertical-perspective")) {
        try { if (typeof localStorage !== "undefined") localStorage.setItem("micaps-map-projection", layer.config.projection); } catch {}
      }
    }
    matched = true;
  }

  // 2. Preset Layers configuration
  if (Array.isArray(CURRENT_CONFIG.presets)) {
    for (const preset of CURRENT_CONFIG.presets) {
      if (isDivider(preset) || !Array.isArray(preset.layers)) continue;
      for (const pLayer of preset.layers) {
        const isDerivedMatch = Boolean(
          pLayer.derivedFrom &&
          pLayer.model === layer.model &&
          pLayer.element === layer.element &&
          (!layer.derivedFrom || pLayer.derivedFrom === layer.derivedFrom)
        );
        const isStationMatch = Boolean(
          pLayer.type === "station" &&
          layer.type === "station" &&
          (pLayer.model === layer.model || (isUpperAirStationLayer(pLayer) === isUpperAirStationLayer(layer)))
        );
        const isStandardMatch = isStationMatch || pLayer.id === layer.id || (pLayer.model === layer.model && pLayer.element === layer.element && (pLayer.level === layer.level || pLayer.level === null || pLayer.level === undefined));
        if (isDerivedMatch || isStandardMatch) {
          if (!pLayer.render) pLayer.render = {};
          if (layer.config) {
            // Contour & Wind properties
            if (layer.config.showFill !== undefined) pLayer.render.showFill = layer.config.showFill;
            if (layer.config.showLine !== undefined) pLayer.render.showLine = layer.config.showLine;
            if (layer.config.showLabels !== undefined) pLayer.render.showLabels = layer.config.showLabels;
            if (layer.config.lineColor !== undefined) pLayer.render.lineColor = layer.config.lineColor;
            if (layer.config.lineWidth !== undefined) pLayer.render.lineWidth = layer.config.lineWidth;
            if (layer.config.boldValues !== undefined) pLayer.render.boldValues = layer.config.boldValues;
            if (layer.config.boldLineWidth !== undefined) pLayer.render.boldLineWidth = layer.config.boldLineWidth;
            if (layer.config.labelSize !== undefined) pLayer.render.labelSize = layer.config.labelSize;
            if (layer.config.opacity !== undefined) pLayer.render.opacity = layer.config.opacity;
            if (layer.config.smooth !== undefined) pLayer.render.smooth = layer.config.smooth;
            if (layer.config.smoothIterations !== undefined) pLayer.render.smoothIterations = layer.config.smoothIterations;
            if (layer.config.showRaster !== undefined) pLayer.render.showRaster = layer.config.showRaster;
            if (layer.config.showWind !== undefined) pLayer.render.showWind = layer.config.showWind;
            if (layer.config.showBarbs !== undefined) pLayer.render.showBarbs = layer.config.showBarbs;
            if (layer.config.palettePath !== undefined) pLayer.render.palettePath = layer.config.palettePath;
            if (layer.config.interval !== undefined) pLayer.render.interval = layer.config.interval;
            if (layer.config.levels !== undefined) {
              if (Array.isArray(layer.config.levels) && layer.config.levels.length >= 2) {
                pLayer.render.levels = layer.config.levels;
              } else {
                delete pLayer.render.levels;
              }
            }

            // Station plot field visibility
            if (layer.config.showTemp !== undefined) pLayer.render.showTemp = layer.config.showTemp;
            if (layer.config.showDewpoint !== undefined) pLayer.render.showDewpoint = layer.config.showDewpoint;
            if (layer.config.showCloud !== undefined) pLayer.render.showCloud = layer.config.showCloud;
            if (layer.config.showWeather !== undefined) pLayer.render.showWeather = layer.config.showWeather;
            if (layer.config.showPressure !== undefined) pLayer.render.showPressure = layer.config.showPressure;
            if (layer.config.showTendency !== undefined) pLayer.render.showTendency = layer.config.showTendency;
            if (layer.config.showVisibility !== undefined) pLayer.render.showVisibility = layer.config.showVisibility;
            if (layer.config.showRain6 !== undefined) pLayer.render.showRain6 = layer.config.showRain6;
            if (layer.config.showDTD !== undefined) pLayer.render.showDTD = layer.config.showDTD;
            if (layer.config.showStreamlines !== undefined) pLayer.render.showStreamlines = layer.config.showStreamlines;
            if (pLayer.config) Object.assign(pLayer.config, pLayer.render);

            // Station filter rules & logic
            if (layer.config.filterRules !== undefined) pLayer.render.filterRules = layer.config.filterRules;
            if (layer.config.filterLogic !== undefined) pLayer.render.filterLogic = layer.config.filterLogic;
            if (layer.config.filterField1 !== undefined) pLayer.render.filterField1 = layer.config.filterField1;
            if (layer.config.filterOp1 !== undefined) pLayer.render.filterOp1 = layer.config.filterOp1;
            if (layer.config.filterVal1 !== undefined) pLayer.render.filterVal1 = layer.config.filterVal1;
            if (layer.config.filterField2 !== undefined) pLayer.render.filterField2 = layer.config.filterField2;
            if (layer.config.filterOp2 !== undefined) pLayer.render.filterOp2 = layer.config.filterOp2;
            if (layer.config.filterVal2 !== undefined) pLayer.render.filterVal2 = layer.config.filterVal2;
            if (pLayer.render.showFill && pLayer.render.showRaster) {
              pLayer.render.showRaster = false;
            }
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

export function upsertDerivedLayerToPreset(presetId, layerEntry) {
  if (!layerEntry || !CURRENT_CONFIG) return;
  const groups = Array.isArray(CURRENT_CONFIG) ? CURRENT_CONFIG : CURRENT_CONFIG.presets;
  if (!Array.isArray(groups)) return;
  const preset = groups.find((p) => !isDivider(p) && p.id === presetId);
  if (!preset || !Array.isArray(preset.layers)) return;

  const elem = layerEntry.element;
  const model = layerEntry.model;

  // Match existing derived layer in this preset by (model, element, derivedFrom) or id
  const existing = preset.layers.find((l) =>
    l.id === layerEntry.id ||
    (l.derivedFrom && layerEntry.derivedFrom && l.derivedFrom === layerEntry.derivedFrom && l.model === model && l.element === elem)
  );

  if (existing) {
    if (layerEntry.id) existing.id = layerEntry.id;
    if (layerEntry.level !== undefined) existing.level = layerEntry.level;
    if (layerEntry.name) existing.name = layerEntry.name;
    if (layerEntry.visible !== undefined) existing.visible = layerEntry.visible;
    if (layerEntry.render) {
      existing.render = { ...(existing.render || {}), ...layerEntry.render };
    }
  } else {
    preset.layers.push(layerEntry);
  }

  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    savePresetConfig(CURRENT_CONFIG).catch((err) => console.warn("[ConfigAutoSave] Failed to auto-save:", err));
  }, 400);
}

export function removeDerivedLayerFromPreset(presetId, layerMatcher) {
  if (!layerMatcher || !CURRENT_CONFIG) return;
  const groups = Array.isArray(CURRENT_CONFIG) ? CURRENT_CONFIG : CURRENT_CONFIG.presets;
  if (!Array.isArray(groups)) return;
  const preset = groups.find((p) => !isDivider(p) && p.id === presetId);
  if (!preset || !Array.isArray(preset.layers)) return;

  const idx = preset.layers.findIndex((l) => {
    if (!l.derivedFrom) return false;
    if (layerMatcher.id && l.id === layerMatcher.id) return true;
    if (layerMatcher.model && layerMatcher.element && l.model === layerMatcher.model && l.element === layerMatcher.element) {
      if (layerMatcher.derivedFrom && l.derivedFrom && layerMatcher.derivedFrom !== l.derivedFrom) return false;
      return true;
    }
    return false;
  });

  if (idx !== -1) {
    preset.layers.splice(idx, 1);
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      savePresetConfig(CURRENT_CONFIG).catch((err) => console.warn("[ConfigAutoSave] Failed to auto-save:", err));
    }, 400);
  }
}

export const DEFAULT_MOCK_OBS_FILES = (() => {
  const files = [];
  // 55 files spanning 7 days (every 3h: 02, 05, 08, 11, 14, 17, 20, 23 UTC+8)
  // from 2026-08-23 02:00:00 to 2026-08-29 20:00:00
  const baseTime = Date.UTC(2026, 7, 23, 2, 0, 0);
  for (let i = 0; i < 55; i++) {
    const d = new Date(baseTime + i * 3 * 3600 * 1000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const h = String(d.getUTCHours()).padStart(2, "0");
    files.push(`${y}${m}${day}${h}0000.000`);
  }
  return files;
})();

