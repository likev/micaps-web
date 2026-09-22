// timeHeightLoader.js - Single streaming NWP time-height profile fetcher & matrix builder
import { createScalarSampler, createWindSampler, snapToGridNode } from "./timeHeightSampling.js";
import { loadHovmollerMatrix } from "../lineprofile/hovmollerLoader.js";
import { buildTransectNodes } from "../lineprofile/lineUtils.js";

export const PROFILE_LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200];
export const TH_GRID_CACHE_TTL_MS = 10 * 60 * 1000;
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
 * Deprecated cache accessors (kept for migration & test compatibility)
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

export function clearThGridCache(win) {
  const cache = getThGridCache(win);
  cache.clear();
}

/**
 * Formats forecast grid file name e.g. "26091808.024"
 */
export function formatGridFileName(cycle, leadHour) {
  return `${cycle}.${String(leadHour).padStart(3, "0")}`;
}

/**
 * Fetches time-height cross-section profile as a single NDJSON stream
 */
export async function loadTimeHeightMatrix({
  win = null,
  model = "ECMWF_HR",
  cycle,
  leads = [0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 132, 144],
  levels = PROFILE_LEVELS,
  point = { lon: 121.5, lat: 31.4 },
  onProgress = null,
  signalSeq = null, // legacy, ignored: cancellation is owned by isCancelled + abort signal
  isCancelled = null,
  abortController = null,
} = {}) {
  let total = leads.length * levels.length * 4;
  let loaded = 0;
  let ok = 0;
  let failed = 0;
  let cacheHits = 0;
  let lastSource = "cache";

  const controller = abortController || new AbortController();
  const signal = controller.signal;

  const shouldCancel = () => {
    if (signal.aborted) return true;
    if (typeof isCancelled === "function" && isCancelled()) return true;
    return false;
  };

  if (shouldCancel()) {
    return { cancelled: true, matrix: null, stats: { total, loaded: 0, ok: 0, failed: 0 } };
  }

  const query = new URLSearchParams({
    model,
    cycle,
    leads: leads.join(","),
    levels: levels.join(","),
    lon: String(point.lon),
    lat: String(point.lat),
  });

  const url = `/api/data/timeheight/profile?${query.toString()}`;

  let response;
  try {
    response = await fetch(url, { signal });
  } catch (err) {
    if (shouldCancel()) {
      return { cancelled: true, matrix: null, stats: { total, loaded, ok, failed } };
    }
    throw err;
  }

  if (!response.ok) {
    throw new Error(`Profile fetch failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body ? response.body.getReader() : null;
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let resultObj = null;

  if (reader) {
    try {
      while (true) {
        if (shouldCancel()) {
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
          return { cancelled: true, matrix: null, stats: { total, loaded, ok, failed, cacheHits } };
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // keep partial chunk

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let evt;
          try {
            evt = JSON.parse(trimmed);
          } catch {
            continue;
          }

          if (evt.type === "progress") {
            loaded = evt.loaded ?? loaded;
            total = evt.total ?? total;
            ok = evt.ok ?? ok;
            failed = evt.failed ?? failed;
            cacheHits = evt.cacheHits ?? cacheHits;
            lastSource = evt.lastSource ?? lastSource;

            if (typeof onProgress === "function") {
              const pct = total > 0 ? Math.round((loaded / total) * 100) : 100;
              onProgress({
                loaded,
                total,
                ok,
                failed,
                pct,
                cacheHits,
                lastSource,
                cancelled: shouldCancel(),
              });
            }
          } else if (evt.type === "result") {
            resultObj = evt;
          }
        }
      }

      if (buffer.trim()) {
        try {
          const evt = JSON.parse(buffer.trim());
          if (evt.type === "result") {
            resultObj = evt;
          }
        } catch {
          // ignore
        }
      }
    } catch (err) {
      if (shouldCancel()) {
        return { cancelled: true, matrix: null, stats: { total, loaded, ok, failed, cacheHits } };
      }
      throw err;
    }
  } else if (typeof response.text === "function") {
    // Non-streaming fallback for testing/mock fetch environments
    const fullText = await response.text();
    for (const line of fullText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const evt = JSON.parse(trimmed);
        if (evt.type === "progress") {
          loaded = evt.loaded ?? loaded;
          total = evt.total ?? total;
          ok = evt.ok ?? ok;
          failed = evt.failed ?? failed;
          cacheHits = evt.cacheHits ?? cacheHits;
          lastSource = evt.lastSource ?? lastSource;

          if (typeof onProgress === "function") {
            const pct = total > 0 ? Math.round((loaded / total) * 100) : 100;
            onProgress({
              loaded,
              total,
              ok,
              failed,
              pct,
              cacheHits,
              lastSource,
              cancelled: shouldCancel(),
            });
          }
        } else if (evt.type === "result") {
          resultObj = evt;
        }
      } catch {
        // ignore
      }
    }
  } else if (typeof response.json === "function") {
    const data = await response.json();
    if (data && data.type === "result") {
      resultObj = data;
    }
  }

  if (shouldCancel()) {
    return { cancelled: true, matrix: null, stats: { total, loaded, ok, failed, cacheHits } };
  }

  if (!resultObj) {
    return { cancelled: false, matrix: null, stats: { total, loaded, ok, failed, cacheHits } };
  }

  const nLevels = resultObj.levels ? resultObj.levels.length : levels.length;
  const nLeads = resultObj.leads ? resultObj.leads.length : leads.length;

  const toFloat32Array = (mat2D) => {
    return Array.from({ length: nLevels }, (_, li) => {
      const row = (mat2D && mat2D[li]) || [];
      const arr = new Float32Array(nLeads);
      for (let ti = 0; ti < nLeads; ti++) {
        const val = row[ti];
        arr[ti] = (val === null || val === undefined || Number.isNaN(val)) ? NaN : val;
      }
      return arr;
    });
  };

  const matrix = {
    point: resultObj.point || point,
    cycle: resultObj.cycle || cycle,
    leads: [...(resultObj.leads || leads)],
    levels: [...(resultObj.levels || levels)],
    rh: toFloat32Array(resultObj.rh),
    tmp: toFloat32Array(resultObj.tmp),
    vvel: toFloat32Array(resultObj.vvel),
    u: toFloat32Array(resultObj.u),
    v: toFloat32Array(resultObj.v),
    missing: resultObj.missing || { rh: 0, tmp: 0, vvel: 0, wind: 0 },
    stats: {
      rhMin: resultObj.stats?.rhMin ?? 0,
      rhMax: resultObj.stats?.rhMax ?? 100,
      tmpMin: resultObj.stats?.tmpMin ?? -40,
      tmpMax: resultObj.stats?.tmpMax ?? 40,
      vvelMin: resultObj.stats?.vvelMin ?? -100,
      vvelMax: resultObj.stats?.vvelMax ?? 100,
    },
  };

  return {
    cancelled: false,
    matrix,
    stats: {
      total: resultObj.stats?.total ?? total,
      loaded: loaded || total,
      ok: ok || total - (resultObj.stats?.failed || 0),
      failed: resultObj.stats?.failed ?? failed,
      cacheHits: resultObj.stats?.cacheHits ?? cacheHits,
    },
  };
}

/**
 * Averages per-level transect matrices ([lead][pt] each) into one time-height
 * profile matrix ([level][lead]). Each cell is the mean of valid (non-NaN)
 * transect nodes; U/V are averaged as vector components (true vector mean).
 * All-NaN columns stay NaN (gap, never fabricated).
 */
export function averageLineProfiles(levelMats, { levels, leads, line, npoints, transect = null }) {
  const nLevels = levels.length;
  const nLeads = leads.length;
  const mk = () => Array.from({ length: nLevels }, () => new Float32Array(nLeads).fill(NaN));
  const rh = mk(), tmp = mk(), vvel = mk(), u = mk(), v = mk();
  const missing = { rh: 0, tmp: 0, vvel: 0, wind: 0 };
  let rhMin = Infinity, rhMax = -Infinity;
  let tmpMin = Infinity, tmpMax = -Infinity;
  let vvelMin = Infinity, vvelMax = -Infinity;

  for (let li = 0; li < nLevels; li++) {
    const lm = levelMats[li];
    for (let ti = 0; ti < nLeads; ti++) {
      const pick = (mat) => (mat && mat[ti] ? mat[ti] : null);
      const rRow = pick(lm?.rh), tRow = pick(lm?.tmp), wRow = pick(lm?.vvel);
      const uRow = pick(lm?.u), vRow = pick(lm?.v);
      const nPts = Math.max(
        rRow?.length || 0, tRow?.length || 0, wRow?.length || 0, uRow?.length || 0, vRow?.length || 0
      );
      const mean = (row) => {
        if (!row) return NaN;
        let sum = 0, count = 0;
        for (let pi = 0; pi < nPts; pi++) {
          const val = row[pi];
          if (val !== null && val !== undefined && !Number.isNaN(val)) { sum += val; count++; }
        }
        return count > 0 ? sum / count : NaN;
      };
      const mRh = mean(rRow), mTmp = mean(tRow), mVv = mean(wRow);
      const mU = mean(uRow), mV = mean(vRow);
      rh[li][ti] = mRh; tmp[li][ti] = mTmp; vvel[li][ti] = mVv; u[li][ti] = mU; v[li][ti] = mV;
      if (Number.isNaN(mRh)) missing.rh++; else { if (mRh < rhMin) rhMin = mRh; if (mRh > rhMax) rhMax = mRh; }
      if (Number.isNaN(mTmp)) missing.tmp++; else { if (mTmp < tmpMin) tmpMin = mTmp; if (mTmp > tmpMax) tmpMax = mTmp; }
      if (Number.isNaN(mVv)) missing.vvel++; else { if (mVv < vvelMin) vvelMin = mVv; if (mVv > vvelMax) vvelMax = mVv; }
      if (Number.isNaN(mU) || Number.isNaN(mV)) missing.wind++;
    }
  }

  const t = transect || buildTransectNodes(line.a, line.b, npoints);
  const mid = {
    lon: Math.round(((line.a.lon + line.b.lon) / 2) * 10000) / 10000,
    lat: Math.round(((line.a.lat + line.b.lat) / 2) * 10000) / 10000,
  };

  return {
    point: mid,
    cycle: levelMats.find((lm) => lm?.cycle)?.cycle || null,
    leads: [...leads],
    levels: [...levels],
    rh, tmp, vvel, u, v,
    line: {
      a: { ...line.a }, b: { ...line.b }, npoints,
      totalKm: t.totalKm ?? 0, distKm: [...(t.distKm || [])],
    },
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

/**
 * Line-averaged time-height load: one hovmoller transect fetch per profile
 * level (same total grid cost as a single-point load), averaged over nodes.
 * Progress aggregates across levels; cancellation via isCancelled + abort.
 */
export async function loadTimeHeightLineMatrix({
  win = null,
  model = "ECMWF_HR",
  cycle,
  leads = [0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 132, 144],
  levels = PROFILE_LEVELS,
  line = { a: { lon: 115, lat: 28 }, b: { lon: 125, lat: 38 } },
  npoints = 41,
  onProgress = null,
  isCancelled = null,
  abortController = null,
  concurrency = 4,
} = {}) {
  const total = leads.length * levels.length * 4;
  let loaded = 0, failed = 0, cacheHits = 0;
  const controller = abortController || new AbortController();
  const cancelled = () => {
    if (controller.signal.aborted) return true;
    if (typeof isCancelled === "function" && isCancelled()) return true;
    return false;
  };
  if (cancelled()) {
    return { cancelled: true, matrix: null, stats: { total, loaded: 0, ok: 0, failed: 0 } };
  }

  const perLevel = new Array(levels.length).fill(null);
  const progress = new Array(levels.length).fill(null).map(() => ({ loaded: 0, total: 0, failed: 0, cacheHits: 0 }));
  const report = () => {
    loaded = progress.reduce((s, p) => s + (p.loaded || 0), 0);
    failed = progress.reduce((s, p) => s + (p.failed || 0), 0);
    cacheHits = progress.reduce((s, p) => s + (p.cacheHits || 0), 0);
    if (typeof onProgress === "function") {
      onProgress({
        loaded, total,
        ok: Math.max(0, loaded - failed), failed,
        pct: total > 0 ? Math.round((loaded / total) * 100) : 100,
        cacheHits, lastSource: "cache", cancelled: cancelled(),
      });
    }
  };

  const runLevel = async (li) => {
    const res = await loadHovmollerMatrix({
      win, model, cycle, leads, level: levels[li], line, npoints,
      abortController: controller,
      isCancelled: cancelled,
      onProgress: (p) => { progress[li] = p; report(); },
    });
    if (cancelled() || !res || res.cancelled) return null;
    progress[li] = { loaded: res.stats?.total || 0, total: res.stats?.total || 0, failed: res.stats?.failed || 0, cacheHits: res.stats?.cacheHits || 0 };
    report();
    perLevel[li] = res.matrix;
    return res.matrix;
  };

  // Bounded fan-out so 10 concurrent NDJSON streams don't stampede the server
  const queue = levels.map((_, li) => li);
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, async () => {
    while (queue.length > 0) {
      if (cancelled()) return;
      const li = queue.shift();
      const r = await runLevel(li);
      if (r === null && !cancelled()) {
        // Level hard-failed (not cancelled): keep null slot, continue others
      }
    }
  });
  await Promise.all(workers);

  if (cancelled()) {
    return { cancelled: true, matrix: null, stats: { total, loaded, ok: 0, failed } };
  }
  if (perLevel.every((m) => !m)) {
    return { cancelled: false, matrix: null, stats: { total, loaded, ok: 0, failed, cacheHits } };
  }

  const matrix = averageLineProfiles(perLevel, { levels, leads, line, npoints });
  matrix.cycle = matrix.cycle || cycle;
  return {
    cancelled: false,
    matrix,
    stats: {
      total, loaded: loaded || total,
      ok: Math.max(0, (loaded || total) - failed),
      failed,
      cacheHits,
    },
  };
}

/**
 * Test-oracle matrix builder (kept client-side for numeric parity testing with synthetic grids)
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
