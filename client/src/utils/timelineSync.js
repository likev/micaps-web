import { fetchTree, fetchLatest } from "../api/catalogApi.js";
import { setTimelineMode, filterObsFilesByStep } from "../ui/timeSlider.js";
import { getActiveWindow } from "../ui/tabWindowManager.js";
import { DEFAULT_MOCK_OBS_FILES } from "../config/presets.js";
import { parseTimestamp } from "./timeResolver.js";

const forecastCyclesCache = {};
const FORECAST_CYCLES_TTL_MS = 5 * 60 * 1000;

export function invalidateForecastCyclesCache(key = null) {
  if (key) {
    delete forecastCyclesCache[key];
  } else {
    for (const k in forecastCyclesCache) {
      delete forecastCyclesCache[k];
    }
  }
}

export function generateDynamicForecastCycles(base = null, count = 10) {
  let baseDate;
  let initHour;

  if (typeof base === "string" && base.length >= 8) {
    const digits = base.split(".")[0].replace(/\D/g, "");
    if (digits.length >= 8) {
      const y = parseInt(digits.length === 8 ? `20${digits.slice(0, 2)}` : digits.slice(0, 4), 10);
      const m = parseInt(digits.length === 8 ? digits.slice(2, 4) : digits.slice(4, 6), 10) - 1;
      const d = parseInt(digits.length === 8 ? digits.slice(4, 6) : digits.slice(6, 8), 10);
      const h = parseInt(digits.length === 8 ? digits.slice(6, 8) : digits.slice(8, 10), 10);
      initHour = Number.isInteger(h) && h >= 0 && h <= 23 ? h : (h >= 20 ? 20 : 8);
      baseDate = new Date(Date.UTC(y, m, d, initHour));
    }
  } else if (base instanceof Date) {
    const bjt = new Date(base.getTime() + 8 * 3600 * 1000);
    const bjtHour = bjt.getUTCHours();
    initHour = bjtHour >= 20 ? 20 : (bjtHour >= 8 ? 8 : 20);
    const dayOffset = bjtHour < 8 ? 1 : 0;
    baseDate = new Date(Date.UTC(bjt.getUTCFullYear(), bjt.getUTCMonth(), bjt.getUTCDate() - dayOffset, initHour));
  } else {
    const now = new Date();
    const bjt = new Date(now.getTime() + 8 * 3600 * 1000);
    const bjtHour = bjt.getUTCHours();
    initHour = bjtHour >= 20 ? 20 : (bjtHour >= 8 ? 8 : 20);
    const dayOffset = bjtHour < 8 ? 1 : 0;
    baseDate = new Date(Date.UTC(bjt.getUTCFullYear(), bjt.getUTCMonth(), bjt.getUTCDate() - dayOffset, initHour));
  }

  const cycles = [];
  const pad = (n) => String(n).padStart(2, "0");
  let curTime = baseDate.getTime();

  for (let i = 0; i < count; i++) {
    const d = new Date(curTime);
    const yy = String(d.getUTCFullYear()).slice(-2);
    const mm = pad(d.getUTCMonth() + 1);
    const dd = pad(d.getUTCDate());
    const hh = pad(d.getUTCHours());
    cycles.push(`${yy}${mm}${dd}${hh}`);
    curTime -= 12 * 3600 * 1000;
  }

  return cycles;
}

function extractCyclesFromFiles(fileEntries) {
  if (!Array.isArray(fileEntries) || fileEntries.length === 0) return [];
  const cycleSet = new Set();
  for (const f of fileEntries) {
    const fname = typeof f === "string" ? f : f?.name;
    if (!fname) continue;
    const parts = fname.split(".");
    if (parts.length >= 2 && parts[0].length >= 8) {
      const prefix = parts[0];
      const cycle = prefix.length === 10 && prefix.startsWith("20") ? prefix.slice(2) : prefix.slice(0, 8);
      cycleSet.add(cycle);
    }
  }
  if (cycleSet.size > 0) {
    return Array.from(cycleSet).sort().reverse();
  }
  return [];
}

export async function resolveForecastCycles(model = "ECMWF_HR", element = "TMP", level = 500, forceRefresh = false) {
  const elem = (element === "VOR" || element === "DIV") ? "WIND" : element;
  const hasLevel = level !== null && level !== undefined && level !== "null" && level !== "undefined" && String(level).trim().toLowerCase() !== "undefined" && String(level).trim().toLowerCase() !== "null" && level !== "";
  const path = hasLevel ? `${model}/${elem}/${level}` : `${model}/${elem}`;
  const shortPath = `${model}/${elem}`;

  if (!forceRefresh) {
    // Keep cache entries scoped to the complete data path. A model-wide alias
    // can return the cycle list for a different element/level and, more
    // importantly, keeps the timeline stale after a new model run appears.
    const cached = forecastCyclesCache[path];
    if (cached && Array.isArray(cached.data) && cached.data.length && (Date.now() - cached.ts) < FORECAST_CYCLES_TTL_MS) {
      return cached.data;
    }
  }

  // 1. First priority: O(1) point lookup in latestdatatime index table
  try {
    const requestOptions = forceRefresh ? { bypassCache: true } : {};
    const latestRes = await fetchLatest(path, "*.024", requestOptions);
    const latestStr = typeof latestRes === "string" ? latestRes : (latestRes?.latest || latestRes?.value || latestRes?.file);
    if (latestStr) {
      const cycles = generateDynamicForecastCycles(latestStr, 10);
      if (cycles.length > 0) {
        forecastCyclesCache[path] = { data: cycles, ts: Date.now() };
        return cycles;
      }
    }
  } catch (_) {
    try {
      const requestOptions = forceRefresh ? { bypassCache: true } : {};
      const latestRes = await fetchLatest(shortPath, "*.024", requestOptions);
      const latestStr = typeof latestRes === "string" ? latestRes : (latestRes?.latest || latestRes?.value || latestRes?.file);
      if (latestStr) {
        const cycles = generateDynamicForecastCycles(latestStr, 10);
        if (cycles.length > 0) {
          forecastCyclesCache[path] = { data: cycles, ts: Date.now() };
          return cycles;
        }
      }
    } catch (_) {}
  }

  // 2. Second priority: Bounded treeview catalog query with limit=100
  try {
    const fileEntries = await fetchTree(path, 100, forceRefresh ? { bypassCache: true } : {});
    const cycles = extractCyclesFromFiles(fileEntries);
    if (cycles.length > 0) {
      forecastCyclesCache[path] = { data: cycles, ts: Date.now() };
      return cycles;
    }
  } catch (err) {
    console.warn(`[Forecast] Fetch cycles failed for ${path}:`, err);
  }

  // 3. Third priority: Bounded treeview catalog query on model/element path with limit=100
  if (shortPath !== path) {
    try {
      const fileEntries = await fetchTree(shortPath, 100, forceRefresh ? { bypassCache: true } : {});
      const cycles = extractCyclesFromFiles(fileEntries);
      if (cycles.length > 0) {
        forecastCyclesCache[path] = { data: cycles, ts: Date.now() };
        return cycles;
      }
    } catch (err) {
      console.warn(`[Forecast] Fetch cycles failed for ${shortPath}:`, err);
    }
  }

  // 4. Dynamic fallback based on real-time clock
  const dynamicFallback = generateDynamicForecastCycles(null, 10);
  forecastCyclesCache[path] = { data: dynamicFallback, ts: Date.now() };
  return dynamicFallback;
}

export async function resolveLatestForecastCycle(model = "ECMWF_HR", element = "TMP", level = 500, forceRefresh = false) {
  const cycles = await resolveForecastCycles(model, element, level, forceRefresh);
  return cycles[0] || generateDynamicForecastCycles(null, 1)[0];
}

export async function syncObservationTimeline(path, currentFile = null, winTitle = "", win = null, options = {}) {
  const forceLatest = options === true || Boolean(options?.forceLatest);
  const isUpper = path.includes("UPPER_AIR") || path.includes("TLOGP") || winTitle.toLowerCase().includes("upper") || winTitle.toLowerCase().includes("sounding") || winTitle.toLowerCase().includes("tlogp");
  const defaultStep = isUpper ? 12 : 3;
  const validSteps = isUpper ? [12, 24, 6] : [1, 3, 6, 12, 24];
  let stepLength = (win && win.stepLength && validSteps.includes(win.stepLength)) ? win.stepLength : defaultStep;
  if (forceLatest) {
    stepLength = defaultStep;
    if (win) win.stepLength = defaultStep;
  }
  const applyTimeline = (file, files) => {
    const timelineData = { file, files, winTitle, stepLength, path, isUpper };
    if (win) {
      win._obsTimeline = timelineData;
      win._obsTimelinePath = path;
      if (getActiveWindow() === win) {
        setTimelineMode("obs", timelineData);
      } else {
        win._pendingTimeline = timelineData;
      }
    } else {
      setTimelineMode("obs", timelineData);
    }
  };
  const targetLevel = options?.level ?? win?.level;
  const treeOpts = { ...(forceLatest ? { bypassCache: true } : {}) };
  if (targetLevel !== null && targetLevel !== undefined && targetLevel !== "") {
    treeOpts.level = targetLevel;
  }
  try {
    const fileEntries = await fetchTree(path, 100, treeOpts);
    if (Array.isArray(fileEntries) && fileEntries.length > 0) {
      let validFiles = fileEntries.filter((f) => f.name && (f.size > 100 || f.size === 0)).map((f) => f.name);
      const hasObsFormat = validFiles.some((f) => parseTimestamp(f) !== null);
      const isMockFallback = !hasObsFormat;
      validFiles = hasObsFormat ? validFiles.filter((f) => parseTimestamp(f) !== null) : [...DEFAULT_MOCK_OBS_FILES];
      if (validFiles.length > 0) {
        // Sort chronologically by parsed timestamp
        const chronologicalFiles = [...validFiles].sort((a, b) => {
          const ta = parseTimestamp(a);
          const tb = parseTimestamp(b);
          if (ta !== null && tb !== null && ta !== tb) return ta - tb;
          return a.localeCompare(b);
        });
        const rawFiles = isMockFallback && chronologicalFiles.length < 2
          ? [...DEFAULT_MOCK_OBS_FILES]
          : chronologicalFiles.slice(-100);

        const filteredFiles = filterObsFilesByStep(rawFiles, stepLength, isUpper);
        let targetFile = !forceLatest && currentFile && filteredFiles.includes(currentFile)
          ? currentFile
          : (filteredFiles.length > 0 ? filteredFiles[filteredFiles.length - 1] : rawFiles[rawFiles.length - 1]);
        if (isUpper && currentFile && !filteredFiles.includes(currentFile)) {
          // If a requested file was outside standard 08:00/20:00 soundings, lock to latest valid sounding
          targetFile = filteredFiles.length > 0 ? filteredFiles[filteredFiles.length - 1] : (rawFiles[rawFiles.length - 1] || currentFile);
        }
        applyTimeline(targetFile, rawFiles);
        return targetFile;
      }
    }
  } catch (err) {
    console.warn("[Main] Failed to query observation file tree for timeline:", err);
  }
  const rawFallback = [...DEFAULT_MOCK_OBS_FILES];
  const filteredFallback = filterObsFilesByStep(rawFallback, stepLength, isUpper);
  let fallbackFile = !forceLatest && currentFile && filteredFallback.includes(currentFile)
    ? currentFile
    : (filteredFallback.length > 0 ? filteredFallback[filteredFallback.length - 1] : rawFallback[rawFallback.length - 1]);
  if (isUpper && currentFile && !filteredFallback.includes(currentFile)) {
    fallbackFile = filteredFallback.length > 0 ? filteredFallback[filteredFallback.length - 1] : (rawFallback[rawFallback.length - 1] || currentFile);
  }
  applyTimeline(fallbackFile, rawFallback);
  return fallbackFile;
}
