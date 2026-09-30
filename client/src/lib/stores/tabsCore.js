import { getPeriodsForStep } from "./timelineMath.js";
import { fetchLevels } from "../../api/catalogApi.js";
import {
  getRainAccumulationHours,
  getRainAccumulationHoursForWindow,
} from "../../utils/rain12.js";
export const DEFAULT_LEVELS = [500, 850, 1000, 200, 700, 925, 400, 300, 100];

export const DEFAULT_MODELS = [
  "ECMWF_HR",
  "GRAPES_GFS",
  "BEIJING_MR",
  "GRAPES_3KM",
  "JAPAN_MR",
  "SHANGHAI_MR",
  "NCEP_GFS",
  "GERMAN_HR",
];

// Runtime cache of model levels queried from server (/api/catalog/levels)
// key: "MODEL/ELEMENT" or "MODEL" -> Array<number> (e.g. "SHANGHAI_MR/RH" -> [1000, 925, 850])
export const modelLevelsRuntimeCache = new Map();
const inFlightLevelQueries = new Map();

/**
 * Queries the server at runtime for supported pressure levels of a model and element.
 * Caches the response in modelLevelsRuntimeCache.
 * @param {string} model
 * @param {string} [element]
 * @returns {Promise<number[]|null>}
 */
export async function queryModelSupportedLevels(model, element = "") {
  if (!model) return null;
  const m = String(model).trim().toUpperCase();
  const el = element ? String(element).trim().toUpperCase() : "";
  const key = el ? `${m}/${el}` : m;

  if (modelLevelsRuntimeCache.has(key)) {
    return modelLevelsRuntimeCache.get(key);
  }
  if (inFlightLevelQueries.has(key)) {
    return await inFlightLevelQueries.get(key);
  }

  const queryPromise = (async () => {
    try {
      const dataPath = el ? `${m}/${el}` : m;
      const res = await fetchLevels(dataPath);
      if (Array.isArray(res)) {
        const levels = res.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
        modelLevelsRuntimeCache.set(key, levels);
        return levels;
      }
    } catch {
      if (el) {
        try {
          const res = await fetchLevels(m);
          if (Array.isArray(res)) {
            const levels = res.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
            modelLevelsRuntimeCache.set(key, levels);
            return levels;
          }
        } catch {}
      }
    } finally {
      inFlightLevelQueries.delete(key);
    }
    return null;
  })();

  inFlightLevelQueries.set(key, queryPromise);
  return await queryPromise;
}

/**
 * Preloads supported levels from the server for models and layers at runtime.
 */
export async function preloadModelLevels(models = DEFAULT_MODELS, elements = ["RH", "HGT", "WIND", "TMP"]) {
  const tasks = [];
  for (const m of models) {
    if (Array.isArray(elements) && elements.length > 0) {
      for (const el of elements) {
        tasks.push(queryModelSupportedLevels(m, el));
      }
    } else {
      tasks.push(queryModelSupportedLevels(m));
    }
  }
  await Promise.allSettled(tasks);
}

/**
 * Sets or updates the cached levels for a model/element (useful for tests or custom server configs).
 */
export function setModelLevelsCache(model, element, levels) {
  if (!model) return;
  const m = String(model).trim().toUpperCase();
  const el = element ? String(element).trim().toUpperCase() : "";
  const key = el ? `${m}/${el}` : m;
  if (Array.isArray(levels)) {
    modelLevelsRuntimeCache.set(key, levels.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n)));
  } else {
    modelLevelsRuntimeCache.delete(key);
  }
}

/**
 * Checks whether a given model supports a specific meteorological element at a given level.
 * Queries the server at runtime (via /api/catalog/levels) and checks the runtime cache.
 * Does NOT hardcode model names or level limits.
 */
export function isModelLayerSupported(model, element, level) {
  if (!model || level == null) return true;
  const numLevel = parseInt(level, 10);
  if (isNaN(numLevel)) return true;

  const m = String(model).trim().toUpperCase();
  const el = element ? String(element).trim().toUpperCase() : "";
  const key = el ? `${m}/${el}` : m;

  // 1. If levels are already cached from a runtime server query, check against them:
  const cached = (el && modelLevelsRuntimeCache.get(key)) || modelLevelsRuntimeCache.get(m);
  if (Array.isArray(cached) && cached.length > 0) {
    return cached.includes(numLevel);
  }

  // 2. If not yet cached, query the server at runtime
  return queryModelSupportedLevels(m, el).then((levels) => {
    if (Array.isArray(levels) && levels.length > 0) {
      return levels.includes(numLevel);
    }
    return true;
  });
}

/**
 * Returns candidate models for auto-allocation Mode 'model', omitting models
 * for which all layers in the preset/window do not exist at the given level.
 */
export function getEligibleModelsForAllocation(groupOrWin, level = 500, models = DEFAULT_MODELS) {
  if (!Array.isArray(models) || models.length === 0) return DEFAULT_MODELS;

  const layers = (Array.isArray(groupOrWin?.activeGroup?.layers) && groupOrWin.activeGroup.layers.length > 0)
    ? groupOrWin.activeGroup.layers
    : (Array.isArray(groupOrWin?.layers) && groupOrWin.layers.length > 0
      ? groupOrWin.layers
      : null);

  if (!layers || layers.length === 0) {
    return models;
  }

  const effectiveLevel = level !== null && level !== undefined
    ? parseInt(level, 10)
    : (groupOrWin?.level !== null && groupOrWin?.level !== undefined
      ? parseInt(groupOrWin.level, 10)
      : (groupOrWin?.defaultLevel ? parseInt(groupOrWin.defaultLevel, 10) : 500));

  const fallbackElement = groupOrWin?.element || groupOrWin?.activeGroup?.element;

  const eligible = models.filter((model) => {
    const allLayersNotExist = layers.every((l) => {
      const elem = l.element || (l.type === "wind" ? "WIND" : null) || (typeof l.id === "string" ? l.id.toUpperCase() : null) || fallbackElement || "TMP";
      const lvl = l.level !== null && l.level !== undefined ? parseInt(l.level, 10) : effectiveLevel;
      const res = isModelLayerSupported(model, elem, lvl);
      return res === false;
    });
    return !allLayersNotExist;
  });

  return eligible.length > 0 ? eligible : models;
}

/**
 * Asynchronous version that ensures all model level queries from server complete before evaluating eligibility.
 */
export async function getEligibleModelsForAllocationAsync(groupOrWin, level = 500, models = DEFAULT_MODELS) {
  if (!Array.isArray(models) || models.length === 0) return DEFAULT_MODELS;

  const layers = (Array.isArray(groupOrWin?.activeGroup?.layers) && groupOrWin.activeGroup.layers.length > 0)
    ? groupOrWin.activeGroup.layers
    : (Array.isArray(groupOrWin?.layers) && groupOrWin.layers.length > 0
      ? groupOrWin.layers
      : null);

  if (!layers || layers.length === 0) {
    return models;
  }

  const fallbackElement = groupOrWin?.element || groupOrWin?.activeGroup?.element;
  const elements = layers.map((l) => l.element || (l.type === "wind" ? "WIND" : null) || (typeof l.id === "string" ? l.id.toUpperCase() : null) || fallbackElement || "TMP");

  await preloadModelLevels(models, elements);
  return getEligibleModelsForAllocation(groupOrWin, level, models);
}


export function stepCycleHours(cycleStr, deltaHours) {
  if (!cycleStr || typeof cycleStr !== "string") return cycleStr;
  const dotIdx = cycleStr.indexOf(".");
  const raw = dotIdx !== -1 ? cycleStr.slice(0, dotIdx) : cycleStr;
  const ext = dotIdx !== -1 ? cycleStr.slice(dotIdx) : "";
  if (raw.length < 8) return cycleStr;

  let year, month, day, hour, tail = "", is4DigitYear = false;
  if (raw.length >= 10 && (raw.startsWith("19") || raw.startsWith("20"))) {
    is4DigitYear = true;
    year = parseInt(raw.slice(0, 4), 10);
    month = parseInt(raw.slice(4, 6), 10) - 1;
    day = parseInt(raw.slice(6, 8), 10);
    hour = parseInt(raw.slice(8, 10), 10);
    tail = raw.slice(10);
  } else if (raw.length >= 8) {
    const yy = parseInt(raw.slice(0, 2), 10);
    year = yy < 70 ? 2000 + yy : 1900 + yy;
    month = parseInt(raw.slice(2, 4), 10) - 1;
    day = parseInt(raw.slice(4, 6), 10);
    hour = parseInt(raw.slice(6, 8), 10);
    tail = raw.slice(8);
  } else {
    return cycleStr;
  }

  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour)) return cycleStr;
  const d = new Date(Date.UTC(year, month, day, hour + deltaHours));
  if (isNaN(d.getTime())) return cycleStr;

  const pad = (n) => String(n).padStart(2, "0");
  const outYYYY = String(d.getUTCFullYear());
  const outMM = pad(d.getUTCMonth() + 1);
  const outDD = pad(d.getUTCDate());
  const outHH = pad(d.getUTCHours());

  const stepped = is4DigitYear
    ? `${outYYYY}${outMM}${outDD}${outHH}${tail}`
    : `${outYYYY.slice(-2)}${outMM}${outDD}${outHH}${tail}`;
  return stepped;
}

export function createDefaultWindow(winIdx = 0, tabId = 1) {
  return {
    tabId,
    uid: winIdx,
    winIdx,
    id: `tab-${tabId}-win-${winIdx}`,
    title: "",
    level: 500,
    period: 24,
    model: null,
    element: null,
    isObservation: false,
    obsTime: null,
    activeGroup: null,
    // v1.1.0: no step default on fresh windows — the mode decides on load
    // (upper-air 12h, surface 3h, NWP 6h). A hardcoded 6 here would stick and
    // override the upper-air 12h default with a "valid" 6h.
    stepLength: null,
  };
}

export function createDefaultTab(id = 1) {
  return {
    id,
    title: `Workstation ${id}`,
    layout: "1x1",
    syncMap: true,
    autoAllocation: "none",
    activeWinIdx: 0,
    _nextWinSeq: 1,
    windows: [createDefaultWindow(0, id)],
  };
}

export const tabsState = {
  tabs: [createDefaultTab(1)],
  activeTabId: 1,
  callbacks: {},
  syncingTabs: new Set(),
};

export function getTabs() {
  return tabsState.tabs;
}

export function setTabs(tabs) {
  tabsState.tabs = tabs;
}

export function getActiveTabId() {
  return tabsState.activeTabId;
}

export function setActiveTabId(id) {
  tabsState.activeTabId = id;
}

export function getCallbacks() {
  return tabsState.callbacks;
}

export function setCallbacks(c) {
  tabsState.callbacks = c || {};
}

export function getSyncingTabs() {
  return tabsState.syncingTabs;
}

export function getActiveTab() {
  return tabsState.tabs.find((t) => t.id === tabsState.activeTabId) || tabsState.tabs[0];
}

export function getActiveWindow() {
  const tab = getActiveTab();
  if (!tab) return null;
  return tab.windows[tab.activeWinIdx] || tab.windows[0];
}

export function getWindowById(winId) {
  if (!winId) return null;
  for (const tab of tabsState.tabs) {
    const found = tab.windows?.find((w) => w.id === winId);
    if (found) return found;
  }
  return null;
}

// ── Shared MapLibre instance registry (plain, never reactive) ─────────────
// Map handles must never live inside Svelte $state: the proxy would wrap
// MapLibre Map methods and break `this`, plus cause reactive loops.
// This registry is the single source of truth for live maps. tabs.svelte.js
// re-exports this SAME Map instance (no `new Map()` fork) so App/mapViewport
// writes are visible to windowMaps sync reads even though tab state itself
// is forked between core (plain) and svelte (proxy).
export const mapInstances = new Map();

export function getMapInstance(winId) {
  return mapInstances.get(winId) || null;
}

export function setMapInstance(winId, map) {
  if (map) {
    mapInstances.set(winId, map);
  } else {
    mapInstances.delete(winId);
  }
}

// ── Split visibility helpers (pure, no DOM) ───────────────────────────────
export function getNumVisible(layout) {
  if (layout === "1x2") return 2;
  if (layout === "2x2") return 4;
  // 3x2 reserved for future (portrait/vertical-monitor layout); UI currently only creates 2x3.
  if (layout === "2x3" || layout === "3x2") return 6;
  return 1;
}

export function getVisibleWindows(tab) {
  if (!tab || !Array.isArray(tab.windows) || tab.windows.length === 0) return [];
  const numVisible = getNumVisible(tab.layout);
  if (tab.layout === "1x1") {
    const active = tab.windows[tab.activeWinIdx] || tab.windows[0];
    return active ? [active] : [];
  }
  if (tab.windows.length <= numVisible) return [...tab.windows];
  const active = tab.windows[tab.activeWinIdx] || tab.windows[0];
  if (!active) return tab.windows.slice(0, numVisible);
  const activePos = tab.windows.indexOf(active);
  if (activePos >= 0 && activePos < numVisible) {
    return tab.windows.slice(0, numVisible);
  }
  // Active outside first N: keep active visible + first N-1 others in order.
  const others = tab.windows.filter((w) => w !== active).slice(0, numVisible - 1);
  return [active, ...others];
}

export function isWindowVisible(tab, win) {
  if (!tab || !win) return false;
  if (tab.layout === "1x1") {
    return tab.windows[tab.activeWinIdx] === win;
  }
  return getVisibleWindows(tab).includes(win);
}

/**
 * Pure predicate behind the split fan-out's reload skip: the base window
 * keeps its map untouched when the allocation pass changed nothing about it
 * (same preset, level, model, period, cycle, obsTime). Skipping must not
 * wipe or invalidate anything — callers must neither tear down its map nor
 * bump its stale-guard sequence on this path.
 */
export function shouldSkipWindowReload(w, baseWin, prevBaseState, mode) {
  if (!w || !baseWin || w !== baseWin || !prevBaseState || w.activeGroup?.id !== prevBaseState.groupId) {
    return false;
  }
  if (mode === "level") return w.level === prevBaseState.level;
  if (mode === "model") return w.model === prevBaseState.model;
  if (mode === "step") return w.period === prevBaseState.period;
  if (mode === "time") {
    if (w.isObservation) return w.obsTime === prevBaseState.obsTime;
    return w.forecastCycle === prevBaseState.forecastCycle && w.period === prevBaseState.period;
  }
  return false;
}

export function applyAutoAllocation(tab, mode = "level", baseWin = null) {  if (!tab || !Array.isArray(tab.windows)) return;
  tab.autoAllocation = mode;
  if (mode === "none") {
    revertAutoAllocation(tab, baseWin);
    return;
  }
  const visible = getVisibleWindows(tab);
  const win0 = (baseWin && typeof baseWin === "object" && baseWin.activeGroup)
    ? baseWin
    : (tab.windows.find((w) => w && w.activeGroup) || (baseWin && typeof baseWin === "object" ? baseWin : null) || tab.windows[tab.activeWinIdx] || tab.windows[0] || {});
  const baseLevel = win0.level ?? 500;
  const baseModel = win0.model || tab.windows[tab.activeWinIdx]?.model || tab.windows[0]?.model || "ECMWF_HR";
  const baseElement = win0.element || "TMP";
  const rainHours = getRainAccumulationHoursForWindow(win0) ??
    getRainAccumulationHours(baseElement) ??
    getRainAccumulationHours(win0.activeGroup?.id) ??
    getRainAccumulationHours(win0.activeGroup?.name);
  const basePeriodRaw = win0.period ?? 24;
  let basePeriod = basePeriodRaw;
  if (rainHours !== null && rainHours > 0) {
    if (basePeriodRaw < rainHours) {
      basePeriod = rainHours;
    }
  }
  const baseCycle = win0.forecastCycle || (Array.isArray(win0.forecastCycles) && win0.forecastCycles[0]) || "26092608";
  const isObs = Boolean(win0.isObservation || win0.activeGroup?.isObservation || tab.windows.some((w) => w.isObservation));
  const isSurface = baseModel === "SURFACE" || baseModel === "SURFACE_PLOT" || (typeof win0.element === "string" && win0.element.toLowerCase().includes("surface")) || win0.activeGroup?.id?.toLowerCase().includes("surface");
  let baseObsTime = win0.obsTime || tab.windows.find((w) => w.obsTime)?.obsTime || "26092608";
  const defaultStep = isObs ? (isSurface ? 3 : 12) : 6;
  const stepLen = win0.stepLength || defaultStep;

  for (let i = 0; i < visible.length; i++) {
    const win = visible[i];
    win.element = baseElement;
    win.isObservation = isObs;
    win.stepLength = stepLen;
    if (Array.isArray(win0.discretePeriods)) {
      win.discretePeriods = [...win0.discretePeriods];
    }
    if (Array.isArray(win0.forecastCycles)) {
      win.forecastCycles = [...win0.forecastCycles];
    }
    if (win !== win0) {
      win.isAutoAllocated = true;
      win.allocParentId = win0.id;
      win.allocMode = mode;
    }
    if (win0.activeGroup && (!win.activeGroup || win !== win0)) {
      try {
        win.activeGroup = JSON.parse(JSON.stringify(win0.activeGroup));
      } catch {
        win.activeGroup = win0.activeGroup;
      }
    }
    if (mode === "level") {
      win.level = DEFAULT_LEVELS[i] ?? 500;
      win.model = baseModel;
      win.period = basePeriod;
      win.forecastCycle = baseCycle;
      win.obsTime = baseObsTime;
    } else if (mode === "model") {
      const eligibleModels = getEligibleModelsForAllocation(win0, baseLevel, DEFAULT_MODELS);
      win.model = eligibleModels[i % eligibleModels.length];
      win.level = baseLevel;
      win.period = basePeriod;
      win.forecastCycle = baseCycle;
      win.obsTime = baseObsTime;
    } else if (mode === "step") {
      win.model = baseModel;
      win.level = baseLevel;
      win.forecastCycle = baseCycle;
      if (Array.isArray(win0.forecastCycles)) {
        win.forecastCycles = [...win0.forecastCycles];
      }
      if (win0._nwpTimeline && !isObs) {
        win._nwpTimeline = { ...win0._nwpTimeline, stepLength: win.stepLength, cycle: win.forecastCycle };
      }
      if (isObs) {
        const stepped = stepCycleHours(baseObsTime, -i * stepLen);
        win.obsTime = (typeof baseObsTime === "string" && baseObsTime.endsWith(".000") && !stepped.endsWith(".000"))
          ? `${stepped}.000`
          : stepped;
        if (win._obsTimeline) win._obsTimeline.file = win.obsTime;
      } else {
        const isCadenceMatch = Array.isArray(win0.discretePeriods) &&
          win0.discretePeriods.length >= 2 &&
          (Math.abs(Number(win0.discretePeriods[1]) - Number(win0.discretePeriods[0])) === Number(stepLen));
        const periods = isCadenceMatch
          ? win0.discretePeriods
          : getPeriodsForStep(stepLen);
        win.discretePeriods = Array.isArray(periods) ? [...periods] : periods;
        let baseIdx = periods.indexOf(basePeriod);
        if (baseIdx === -1 && Array.isArray(periods) && periods.length > 0) {
          let minDiff = Infinity;
          periods.forEach((p, idx) => {
            if (rainHours !== null && rainHours > 0 && Number(p) < rainHours) return;
            const diff = Math.abs(p - basePeriod);
            if (diff < minDiff) {
              minDiff = diff;
              baseIdx = idx;
            }
          });
        }
        if (baseIdx !== -1 && baseIdx + i < periods.length) {
          win.period = periods[baseIdx + i];
        } else {
          const startP = baseIdx !== -1 ? periods[baseIdx] : basePeriod;
          win.period = startP + i * stepLen;
        }
      }
    } else if (mode === "time") {
      win.model = baseModel;
      win.level = baseLevel;
      if (isObs) {
        const stepped = stepCycleHours(baseObsTime, -i * stepLen);
        win.obsTime = (typeof baseObsTime === "string" && baseObsTime.endsWith(".000") && !stepped.endsWith(".000"))
          ? `${stepped}.000`
          : stepped;
        if (win._obsTimeline) win._obsTimeline.file = win.obsTime;
      } else {
        const cycles = Array.isArray(win0.forecastCycles) && win0.forecastCycles.length > 0
          ? win0.forecastCycles
          : null;
        win.forecastCycles = Array.isArray(cycles) ? [...cycles] : cycles;
        if (Array.isArray(win0.discretePeriods)) {
          win.discretePeriods = [...win0.discretePeriods];
        }

        const parseCycleEpoch = (str) => {
          const clean = String(str || "").replace(/[^\d]/g, "").slice(0, 10);
          if (clean.length < 8) return NaN;
          const y = clean.length === 8 ? parseInt(`20${clean.slice(0, 2)}`, 10) : parseInt(clean.slice(0, 4), 10);
          const m = (clean.length === 8 ? parseInt(clean.slice(2, 4), 10) : parseInt(clean.slice(4, 6), 10)) - 1;
          const d = clean.length === 8 ? parseInt(clean.slice(4, 6), 10) : parseInt(clean.slice(6, 8), 10);
          const h = clean.length === 8 ? parseInt(clean.slice(6, 8), 10) : parseInt(clean.slice(8, 10), 10);
          return Date.UTC(y, m, d, h);
        };

        let cycleStep = (win0.model === "ECMWF_HR" && win0.stepLength === 6) ? 12 : (win0.stepLength || 12);
        if (cycles && cycles.length >= 2) {
          const t0 = parseCycleEpoch(cycles[0]);
          const t1 = parseCycleEpoch(cycles[1]);
          if (!isNaN(t0) && !isNaN(t1)) {
            const diffH = Math.round(Math.abs(t0 - t1) / 3600000);
            if (diffH > 0 && diffH <= 48) cycleStep = diffH;
          }
        }

        const baseIdx = cycles ? cycles.indexOf(baseCycle) : -1;
        if (cycles && baseIdx !== -1 && (baseIdx + i) < cycles.length) {
          const chosenCycle = cycles[baseIdx + i];
          const tBase = parseCycleEpoch(baseCycle);
          const tChosen = parseCycleEpoch(chosenCycle);
          const deltaH = (!isNaN(tBase) && !isNaN(tChosen)) ? Math.round((tBase - tChosen) / 3600000) : (i * cycleStep);
          win.forecastCycle = chosenCycle;
          win.period = basePeriod + deltaH;
        } else {
          win.forecastCycle = stepCycleHours(baseCycle, -i * cycleStep);
          win.period = basePeriod + i * cycleStep;
        }
        if (win.forecastCycles && Array.isArray(win.forecastCycles) && !win.forecastCycles.includes(win.forecastCycle)) {
          win.forecastCycles = [win.forecastCycle, ...win.forecastCycles];
        }
      }
    }
  }

  if (mode === "step" && !isObs) {
    const isCadenceMatch = Array.isArray(win0.discretePeriods) &&
      win0.discretePeriods.length >= 2 &&
      (Math.abs(Number(win0.discretePeriods[1]) - Number(win0.discretePeriods[0])) === Number(stepLen));
    const periods = isCadenceMatch
      ? win0.discretePeriods
      : getPeriodsForStep(stepLen);
    for (const w of tab.windows) {
      if (!visible.includes(w)) {
        w.stepLength = stepLen;
        w.discretePeriods = Array.isArray(periods) ? [...periods] : periods;
      }
    }
  }
}

/**
 * Reverts auto-allocation across visible windows to 'none'.
 * @param {Object} tab - The tab state.
 * @param {Object|number|null} baseWin - Target baseline: window object (unifies level, model,
 *   period, cycle) or numeric level (unifies vertical level while retaining window's model/period).
 */
export function revertAutoAllocation(tab, baseWin = null) {
  if (!tab || !Array.isArray(tab.windows)) return;
  tab.autoAllocation = "none";
  for (const win of tab.windows) {
    win.isAutoAllocated = false;
    win.allocParentId = null;
    win.allocMode = null;
  }
  const visible = getVisibleWindows(tab);
  const isNumericLevelOnly = typeof baseWin === "number";
  const win0 = (baseWin && typeof baseWin === "object" && baseWin.activeGroup)
    ? baseWin
    : (tab.windows.find((w) => w && w.activeGroup) || (baseWin && typeof baseWin === "object" ? baseWin : null) || tab.windows[tab.activeWinIdx] || tab.windows[0] || {});
  const baseLevel = isNumericLevelOnly ? baseWin : (win0.level ?? 500);
  const baseModel = win0.model || "ECMWF_HR";
  const baseElement = win0.element || "TMP";
  const basePeriod = win0.period ?? 24;
  const baseCycle = win0.forecastCycle || "26092608";
  const isObs = Boolean(win0.isObservation || win0.activeGroup?.isObservation);
  let baseObsTime = win0.obsTime || null;

  for (let i = 0; i < visible.length; i++) {
    const win = visible[i];
    win.level = baseLevel;
    if (!isNumericLevelOnly) {
      win.model = baseModel;
      win.element = baseElement;
      win.period = basePeriod;
      const isSurface = win0.model === "SURFACE" || win0.model === "SURFACE_PLOT" || (typeof win0.element === "string" && win0.element.toLowerCase().includes("surface")) || win0.activeGroup?.id?.toLowerCase().includes("surface");
      win.isObservation = isObs;
      if (baseCycle) win.forecastCycle = baseCycle;
      if (baseObsTime) win.obsTime = baseObsTime;
      win.stepLength = win0.stepLength || (isObs ? (isSurface ? 3 : 12) : 6);
      if (Array.isArray(win0.discretePeriods)) {
        win.discretePeriods = [...win0.discretePeriods];
      }
      if (win0.activeGroup && (!win.activeGroup || win !== win0)) {
        try {
          win.activeGroup = JSON.parse(JSON.stringify(win0.activeGroup));
        } catch {
          win.activeGroup = win0.activeGroup;
        }
      }
    }
  }
}

let defaultLayerResolver = null;
export function setDefaultLayerResolver(fn) {
  defaultLayerResolver = fn;
}

export function hasWeatherLayers(win, layerResolver = null) {
  if (!win) return false;
  if (win.activeGroup && Array.isArray(win.activeGroup.layers) && win.activeGroup.layers.length > 0) {
    return true;
  }
  if (Array.isArray(win.layers) && win.layers.length > 0) {
    return true;
  }
  const resolver = layerResolver || defaultLayerResolver;
  if (typeof resolver === "function") {
    try {
      const layers = resolver(win.id || win);
      if (Array.isArray(layers) && layers.some((l) => l.removable !== false || (l.type && l.type !== "pmtiles"))) {
        return true;
      }
    } catch {}
  }
  return false;
}

export function isWindowEmpty(win, layerResolver = null) {
  return !hasWeatherLayers(win, layerResolver);
}

export function getNextWindowUid(tab) {
  if (!tab) return 0;
  const maxUid = (tab.windows || []).reduce((max, w) => Math.max(max, typeof w?.uid === "number" ? w.uid : -1), -1);
  const nextSeq = Math.max(tab._nextWinSeq || 0, (tab.windows || []).length, maxUid + 1);
  tab._nextWinSeq = nextSeq + 1;
  return nextSeq;
}

export function prepareSplitWindows(tab, numNeeded, baseWin = null, isWindowEmptyFn = isWindowEmpty, wasTab = true, prevNumVisible = null) {
  if (!tab || !Array.isArray(tab.windows)) return [];
  if (numNeeded <= 1) return tab.windows;

  const targetBase = baseWin || tab.windows[tab.activeWinIdx] || tab.windows[0];

  if (wasTab) {
    const emptyWins = [];
    const busyWins = [];

    for (const w of tab.windows) {
      if (w === targetBase || (targetBase && w.id && w.id === targetBase.id)) {
        continue;
      }
      const isAllocForBase = Boolean(
        (w.isAutoAllocated && targetBase && w.allocParentId === targetBase.id) ||
        (tab.autoAllocation && tab.autoAllocation !== "none" && w.activeGroup?.id && targetBase?.activeGroup?.id && w.activeGroup.id === targetBase.activeGroup.id)
      );
      if (isWindowEmptyFn(w) || isAllocForBase) {
        emptyWins.push(w);
      } else {
        busyWins.push(w);
      }
    }

    const neededExtra = numNeeded - 1;
    const usedEmpty = emptyWins.slice(0, neededExtra);
    const unusedEmpty = emptyWins.slice(neededExtra);

    const createdWins = [];
    while (usedEmpty.length + createdWins.length < neededExtra) {
      const uid = getNextWindowUid(tab);
      const posIdx = 1 + usedEmpty.length + createdWins.length;
      const winObj = createDefaultWindow(posIdx, tab.id);
      winObj.uid = uid;
      winObj.id = `tab-${tab.id}-win-${uid}`;
      if (tab.autoAllocation && tab.autoAllocation !== "none") {
        winObj.isAutoAllocated = true;
        if (targetBase) winObj.allocParentId = targetBase.id;
      }
      createdWins.push(winObj);
    }

    const splitWins = [targetBase, ...usedEmpty, ...createdWins];
    tab.windows = [...splitWins, ...busyWins, ...unusedEmpty];
  } else {
    // When already in split mode, only windows that were in the previous visible split
    // are kept in currentSplit. Any windows outside the previous visible split that have
    // layers (busyWins) must NOT be clobbered or drawn into new split slots.
    const prevCount = prevNumVisible != null ? prevNumVisible : Math.min(tab.windows.length, numNeeded);
    const currentSplit = tab.windows.slice(0, Math.min(prevCount, numNeeded));
    const remaining = tab.windows.slice(Math.min(prevCount, numNeeded));

    const emptyWins = [];
    const busyWins = [];
    for (const w of remaining) {
      const isAllocForBase = Boolean(
        (w.isAutoAllocated && targetBase && w.allocParentId === targetBase.id) ||
        (tab.autoAllocation && tab.autoAllocation !== "none" && w.activeGroup?.id && targetBase?.activeGroup?.id && w.activeGroup.id === targetBase.activeGroup.id)
      );
      if (isWindowEmptyFn(w) || isAllocForBase) {
        emptyWins.push(w);
      } else {
        busyWins.push(w);
      }
    }

    const neededExtra = numNeeded - currentSplit.length;
    const usedEmpty = emptyWins.slice(0, Math.max(0, neededExtra));
    const unusedEmpty = emptyWins.slice(Math.max(0, neededExtra));

    const createdWins = [];
    while (currentSplit.length + usedEmpty.length + createdWins.length < numNeeded) {
      const uid = getNextWindowUid(tab);
      const posIdx = currentSplit.length + usedEmpty.length + createdWins.length;
      const winObj = createDefaultWindow(posIdx, tab.id);
      winObj.uid = uid;
      winObj.id = `tab-${tab.id}-win-${uid}`;
      if (tab.autoAllocation && tab.autoAllocation !== "none") {
        winObj.isAutoAllocated = true;
        if (targetBase) winObj.allocParentId = targetBase.id;
      }
      createdWins.push(winObj);
    }

    const splitWins = [...currentSplit, ...usedEmpty, ...createdWins];
    tab.windows = [...splitWins, ...busyWins, ...unusedEmpty];
  }

  tab.windows.forEach((w, idx) => {
    w.winIdx = idx;
    if (w.title) w.title = String(w.title).replace(/^W\d+:\s*/, "");
    if (w.baseTitle) w.baseTitle = String(w.baseTitle).replace(/^W\d+:\s*/, "");
  });

  tab.activeWinIdx = Math.max(0, tab.windows.findIndex((w) => w === targetBase || (targetBase && w.id && w.id === targetBase.id)));
  return tab.windows;
}

