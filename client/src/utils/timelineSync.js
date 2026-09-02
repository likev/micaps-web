import { fetchTree, fetchLatest } from "../api/catalogApi.js";
import { setTimelineMode } from "../ui/timeSlider.js";
import { getActiveWindow } from "../ui/tabWindowManager.js";
import { DEFAULT_MOCK_OBS_FILES } from "../config/presets.js";

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
    const clean = base.split(".")[0];
    const y = parseInt(clean.length === 8 ? `20${clean.slice(0, 2)}` : clean.slice(0, 4), 10);
    const m = parseInt(clean.length === 8 ? clean.slice(2, 4) : clean.slice(4, 6), 10) - 1;
    const d = parseInt(clean.length === 8 ? clean.slice(4, 6) : clean.slice(6, 8), 10);
    const h = parseInt(clean.length === 8 ? clean.slice(6, 8) : clean.slice(8, 10), 10);
    initHour = h >= 20 ? 20 : 8;
    baseDate = new Date(Date.UTC(y, m, d, initHour));
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
  const path = `${model}/${element}/${level || 500}`;
  const shortPath = `${model}/${element}`;

  if (!forceRefresh) {
    const cached = forecastCyclesCache[path] || forecastCyclesCache[shortPath] || forecastCyclesCache[model];
    if (cached && Array.isArray(cached.data) && cached.data.length && (Date.now() - cached.ts) < FORECAST_CYCLES_TTL_MS) {
      return cached.data;
    }
  }

  // 1. First priority: O(1) point lookup in latestdatatime index table
  try {
    const latestRes = await fetchLatest(path, "*.024");
    const latestStr = latestRes?.latest || latestRes?.value;
    if (latestStr) {
      const cycles = generateDynamicForecastCycles(latestStr, 10);
      if (cycles.length > 0) {
        forecastCyclesCache[path] = { data: cycles, ts: Date.now() };
        forecastCyclesCache[model] = { data: cycles, ts: Date.now() };
        return cycles;
      }
    }
  } catch (_) {
    try {
      const latestRes = await fetchLatest(shortPath, "*.024");
      const latestStr = latestRes?.latest || latestRes?.value;
      if (latestStr) {
        const cycles = generateDynamicForecastCycles(latestStr, 10);
        if (cycles.length > 0) {
          forecastCyclesCache[path] = { data: cycles, ts: Date.now() };
          forecastCyclesCache[model] = { data: cycles, ts: Date.now() };
          return cycles;
        }
      }
    } catch (_) {}
  }

  // 2. Second priority: Bounded treeview catalog query with limit=30
  try {
    const fileEntries = await fetchTree(path, 30);
    const cycles = extractCyclesFromFiles(fileEntries);
    if (cycles.length > 0) {
      forecastCyclesCache[path] = { data: cycles, ts: Date.now() };
      forecastCyclesCache[model] = { data: cycles, ts: Date.now() };
      return cycles;
    }
  } catch (err) {
    console.warn(`[Forecast] Fetch cycles failed for ${path}:`, err);
  }

  // 3. Third priority: Bounded treeview catalog query on model/element path with limit=30
  if (shortPath !== path) {
    try {
      const fileEntries = await fetchTree(shortPath, 30);
      const cycles = extractCyclesFromFiles(fileEntries);
      if (cycles.length > 0) {
        forecastCyclesCache[path] = { data: cycles, ts: Date.now() };
        forecastCyclesCache[shortPath] = { data: cycles, ts: Date.now() };
        forecastCyclesCache[model] = { data: cycles, ts: Date.now() };
        return cycles;
      }
    } catch (err) {
      console.warn(`[Forecast] Fetch cycles failed for ${shortPath}:`, err);
    }
  }

  // 4. Dynamic fallback based on real-time clock
  const dynamicFallback = generateDynamicForecastCycles(null, 10);
  forecastCyclesCache[path] = { data: dynamicFallback, ts: Date.now() };
  forecastCyclesCache[model] = { data: dynamicFallback, ts: Date.now() };
  return dynamicFallback;
}

export async function resolveLatestForecastCycle(model = "ECMWF_HR", element = "TMP", level = 500, forceRefresh = false) {
  const cycles = await resolveForecastCycles(model, element, level, forceRefresh);
  return cycles[0] || generateDynamicForecastCycles(null, 1)[0];
}

export async function syncObservationTimeline(path, currentFile = null, winTitle = "", win = null) {
  const isUpper = path.includes("UPPER_AIR") || winTitle.toLowerCase().includes("upper") || winTitle.toLowerCase().includes("sounding");
  const stepLength = isUpper ? 12 : 3;
  const applyTimeline = (file, files) => {
    if (win) {
      win._obsTimeline = { file, files };
      if (getActiveWindow() === win) {
        setTimelineMode("obs", { file, files, winTitle, stepLength, path });
      } else {
        win._pendingTimeline = { file, files, winTitle, stepLength, path };
      }
    } else {
      setTimelineMode("obs", { file, files, winTitle, stepLength, path });
    }
  };
  try {
    const fileEntries = await fetchTree(path, 30);
    if (Array.isArray(fileEntries) && fileEntries.length > 0) {
      let validFiles = fileEntries.filter((f) => f.name && (f.size > 100 || f.size === 0)).map((f) => f.name);
      const hasObsFormat = validFiles.some((f) => f.length >= 14 && f.endsWith(".000"));
      const isMockFallback = !hasObsFormat;
      validFiles = hasObsFormat ? validFiles.filter((f) => f.length >= 14 && f.endsWith(".000")) : DEFAULT_MOCK_OBS_FILES;
      if (validFiles.length > 0) {
        // FIX: after filter validFiles is always a new array, so `validFiles !== DEFAULT_MOCK_OBS_FILES` is always true — use isMockFallback flag instead
        const recentFiles = !isMockFallback && validFiles.length >= 2 ? validFiles.slice(0, 10).reverse() : (validFiles.length >= 2 ? validFiles.slice(-10) : DEFAULT_MOCK_OBS_FILES);
        // when falling back to mock, recentFiles should be mock files
        const effectiveFiles = isMockFallback ? DEFAULT_MOCK_OBS_FILES : recentFiles;
        const targetFile = currentFile && effectiveFiles.includes(currentFile) ? currentFile : effectiveFiles[effectiveFiles.length - 1];
        applyTimeline(targetFile, effectiveFiles);
        return targetFile;
      }
    }
  } catch (err) {
    console.warn("[Main] Failed to query observation file tree for timeline:", err);
  }
  const fallbackFile = currentFile || DEFAULT_MOCK_OBS_FILES[DEFAULT_MOCK_OBS_FILES.length - 1];
  applyTimeline(fallbackFile, DEFAULT_MOCK_OBS_FILES);
  return fallbackFile;
}
