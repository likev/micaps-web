// timeHeightLoader.js - Bulk NWP grid data fetcher, queue concurrency, window cache, and profile matrix builder
import { fetchJson } from "../../api/apiClient.js";
import { createScalarSampler, createWindSampler, snapToGridNode } from "./timeHeightSampling.js";

export const PROFILE_LEVELS = [1000, 925, 850, 700, 500, 400, 300, 250, 200, 100];
export const TH_GRID_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const TH_GRID_CACHE_MAX_ENTRIES = 600;
export const TH_CONCURRENCY = 6;
export const SUPPORTED_STEPS = [1, 3, 6, 12, 24];

/**
 * Validates and builds array of lead hours
 */
export function buildLeads(startHour = 0, endHour = 144, stepHours = 12) {
  let start = Math.max(0, parseInt(startHour, 10) || 0);
  let end = Math.min(240, parseInt(endHour, 10) || 144);
  let step = parseInt(stepHours, 10) || 12;

  if (!SUPPORTED_STEPS.includes(step)) {
    step = 12;
  }
  if (start >= end) {
    end = start + step;
  }

  const leads = [];
  for (let h = start; h <= end; h += step) {
    leads.push(h);
    if (leads.length >= 41) break; // Hard cap 41 columns
  }
  return leads;
}

/**
 * Retrieves or initializes window-scoped grid cache
 */
export function getThGridCache(win) {
  if (!win) {
    if (!globalThis._fallbackThGridCache) {
      globalThis._fallbackThGridCache = new Map();
    }
    return globalThis._fallbackThGridCache;
  }
  if (!win._thGridCache) {
    win._thGridCache = new Map();
  }
  return win._thGridCache;
}

/**
 * Clears window-scoped grid cache
 */
export function clearThGridCache(win) {
  const cache = getThGridCache(win);
  cache.clear();
}

/**
 * Prunes expired or over-capacity entries from cache (LRU)
 */
function pruneThGridCache(cache) {
  const now = Date.now();
  for (const [k, v] of cache.entries()) {
    if (now - v.ts > TH_GRID_CACHE_TTL_MS) {
      cache.delete(k);
    }
  }
  while (cache.size > TH_GRID_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    } else {
      break;
    }
  }
}

/**
 * Formats forecast grid file name e.g. "26091808.024"
 */
export function formatGridFileName(cycle, leadHour) {
  return `${cycle}.${String(leadHour).padStart(3, "0")}`;
}

/**
 * Fetches a single grid from window cache or API, updating cache on success
 */
async function fetchGridWithCache(win, path, file) {
  const cache = getThGridCache(win);
  const cacheKey = `${path}|${file}`;

  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.ts <= TH_GRID_CACHE_TTL_MS)) {
    return cached.data;
  }

  try {
    const data = await fetchJson("/api/data/grid", { path, file });
    if (data && (data.values || data.u)) {
      cache.set(cacheKey, { data, ts: Date.now() });
      pruneThGridCache(cache);
      return data;
    }
    cache.set(cacheKey, { data: null, ts: Date.now() });
    pruneThGridCache(cache);
    return null;
  } catch {
    cache.set(cacheKey, { data: null, ts: Date.now() });
    pruneThGridCache(cache);
    return null;
  }
}

/**
 * Bulk loads grid data for the profile matrix with concurrency cap, progress reporting, and cancellation
 */
export async function loadTimeHeightMatrix({
  win = null,
  model = "ECMWF_HR",
  cycle,
  leads = [0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 132, 144],
  levels = PROFILE_LEVELS,
  point = { lon: 121.5, lat: 31.4 },
  onProgress = null,
  signalSeq = null,
  isCancelled = null,
} = {}) {
  const elements = ["RH", "TMP", "VVEL", "WIND"];
  const gridMap = new Map(); // key -> gridData

  // Build task list: leads x levels x elements
  const tasks = [];
  for (const lead of leads) {
    const file = formatGridFileName(cycle, lead);
    for (const level of levels) {
      for (const element of elements) {
        const path = `${model}/${element}/${level}`;
        const key = `${path}|${file}`;
        tasks.push({ element, level, lead, path, file, key });
      }
    }
  }

  const total = tasks.length;
  let loaded = 0;
  let ok = 0;
  let failed = 0;

  const shouldCancel = () => {
    if (typeof isCancelled === "function" && isCancelled()) return true;
    if (signalSeq !== null && win && win._thLoadSeq !== undefined && win._thLoadSeq !== signalSeq) {
      return true;
    }
    if (signalSeq !== null && win && win.loadSeq !== undefined && win.loadSeq !== signalSeq) {
      return true;
    }
    return false;
  };

  const reportProgress = () => {
    if (typeof onProgress === "function") {
      const pct = total > 0 ? Math.round((loaded / total) * 100) : 100;
      onProgress({ loaded, total, ok, failed, pct, cancelled: shouldCancel() });
    }
  };

  // Process in batches of TH_CONCURRENCY
  for (let i = 0; i < tasks.length; i += TH_CONCURRENCY) {
    if (shouldCancel()) {
      break;
    }
    const chunk = tasks.slice(i, i + TH_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(async (task) => {
        const grid = await fetchGridWithCache(win, task.path, task.file);
        return { task, grid };
      })
    );

    for (const res of results) {
      loaded++;
      if (res.status === "fulfilled" && res.value.grid) {
        ok++;
        gridMap.set(res.value.task.key, res.value.grid);
      } else {
        failed++;
      }
    }
    reportProgress();
  }

  if (shouldCancel()) {
    return { cancelled: true, matrix: null, stats: { total, loaded, ok, failed } };
  }

  // Snap the point to the nearest grid node using the first available grid
  let firstGrid = null;
  for (const g of gridMap.values()) {
    if (g && (g.x || g.header)) {
      firstGrid = g;
      break;
    }
  }
  const snappedPoint = snapToGridNode(firstGrid, point.lon, point.lat);

  // Build and sample the 2D matrices [nLevels][nLeads]
  const matrix = buildProfileMatrix({
    cycle,
    leads,
    levels,
    point: snappedPoint,
    model,
    gridMap,
  });

  return {
    cancelled: false,
    matrix,
    stats: { total, loaded, ok, failed },
  };
}

/**
 * Builds and samples the meteorological matrices from cached gridData
 */
export function buildProfileMatrix({
  cycle,
  leads,
  levels,
  point,
  model = "ECMWF_HR",
  gridMap,
}) {
  const nLevels = levels.length;
  const nLeads = leads.length;

  const rh = Array.from({ length: nLevels }, () => new Float32Array(nLeads).fill(NaN));
  const tmp = Array.from({ length: nLevels }, () => new Float32Array(nLeads).fill(NaN));
  const vvel = Array.from({ length: nLevels }, () => new Float32Array(nLeads).fill(NaN));
  const u = Array.from({ length: nLevels }, () => new Float32Array(nLeads).fill(NaN));
  const v = Array.from({ length: nLevels }, () => new Float32Array(nLeads).fill(NaN));

  const missing = { rh: 0, tmp: 0, vvel: 0, wind: 0 };
  let rhMin = Infinity, rhMax = -Infinity;
  let tmpMin = Infinity, tmpMax = -Infinity;
  let vvelMin = Infinity, vvelMax = -Infinity;

  const scalarSamplers = new Map();
  const getScalarSampler = (grid) => {
    if (!grid) return null;
    let s = scalarSamplers.get(grid);
    if (!s) {
      s = createScalarSampler(grid);
      scalarSamplers.set(grid, s);
    }
    return s;
  };

  const windSamplers = new Map();
  const getWindSampler = (grid) => {
    if (!grid) return null;
    let s = windSamplers.get(grid);
    if (!s) {
      s = createWindSampler(grid);
      windSamplers.set(grid, s);
    }
    return s;
  };

  for (let li = 0; li < nLevels; li++) {
    const level = levels[li];
    for (let ti = 0; ti < nLeads; ti++) {
      const lead = leads[ti];
      const file = formatGridFileName(cycle, lead);

      // RH
      const rhGrid = gridMap.get(`${model}/RH/${level}|${file}`);
      const sRH = getScalarSampler(rhGrid);
      if (sRH) {
        const val = sRH(point.lon, point.lat);
        if (val !== null && !Number.isNaN(val)) {
          rh[li][ti] = val;
          if (val < rhMin) rhMin = val;
          if (val > rhMax) rhMax = val;
        } else {
          missing.rh++;
        }
      } else {
        missing.rh++;
      }

      // TMP
      const tmpGrid = gridMap.get(`${model}/TMP/${level}|${file}`);
      const sTMP = getScalarSampler(tmpGrid);
      if (sTMP) {
        const val = sTMP(point.lon, point.lat);
        if (val !== null && !Number.isNaN(val)) {
          tmp[li][ti] = val;
          if (val < tmpMin) tmpMin = val;
          if (val > tmpMax) tmpMax = val;
        } else {
          missing.tmp++;
        }
      } else {
        missing.tmp++;
      }

      // VVEL
      const vvelGrid = gridMap.get(`${model}/VVEL/${level}|${file}`);
      const sVVEL = getScalarSampler(vvelGrid);
      if (sVVEL) {
        const val = sVVEL(point.lon, point.lat);
        if (val !== null && !Number.isNaN(val)) {
          vvel[li][ti] = val;
          if (val < vvelMin) vvelMin = val;
          if (val > vvelMax) vvelMax = val;
        } else {
          missing.vvel++;
        }
      } else {
        missing.vvel++;
      }

      // WIND
      const windGrid = gridMap.get(`${model}/WIND/${level}|${file}`);
      const sWind = getWindSampler(windGrid);
      if (sWind) {
        const res = sWind(point.lon, point.lat);
        if (res && res.length === 2) {
          u[li][ti] = res[0];
          v[li][ti] = res[1];
        } else {
          missing.wind++;
        }
      } else {
        missing.wind++;
      }
    }
  }

  return {
    point,
    cycle,
    leads: [...leads],
    levels: [...levels],
    rh,
    tmp,
    vvel,
    u,
    v,
    missing,
    stats: {
      rhMin: Number.isFinite(rhMin) ? rhMin : 0,
      rhMax: Number.isFinite(rhMax) ? rhMax : 100,
      tmpMin: Number.isFinite(tmpMin) ? tmpMin : -40,
      tmpMax: Number.isFinite(tmpMax) ? tmpMax : 40,
      vvelMin: Number.isFinite(vvelMin) ? vvelMin : -100,
      vvelMax: Number.isFinite(vvelMax) ? vvelMax : 100,
    },
  };
}
