// hovmollerLoader.js - Span fetch + [lead][pt] matrix builder (NDJSON stream)
import { readNdjsonStream } from "./lineHeightLoader.js";

export async function loadHovmollerMatrix({
  win = null,
  model = "ECMWF_HR",
  cycle,
  leads = [0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 132, 144],
  level = 850,
  line = { a: { lon: 115, lat: 28 }, b: { lon: 125, lat: 38 } },
  npoints = 41,
  onProgress = null,
  isCancelled = null,
  abortController = null,
} = {}) {
  let total = leads.length * 4;
  let loaded = 0, ok = 0, failed = 0, cacheHits = 0, lastSource = "cache";
  const controller = abortController || new AbortController();
  const signal = controller.signal;
  const shouldCancel = () => {
    if (signal.aborted) return true;
    if (typeof isCancelled === "function" && isCancelled()) return true;
    return false;
  };
  if (shouldCancel()) return { cancelled: true, matrix: null, stats: { total, loaded: 0, ok: 0, failed: 0 } };

  const query = new URLSearchParams({
    model, cycle, leads: leads.join(","), level: String(level),
    lon0: String(line.a.lon), lat0: String(line.a.lat),
    lon1: String(line.b.lon), lat1: String(line.b.lat),
    npoints: String(npoints),
  });
  const url = `/api/data/hovmoller/profile?${query.toString()}`;
  let response;
  try {
    response = await fetch(url, { signal });
  } catch (err) {
    if (shouldCancel()) return { cancelled: true, matrix: null, stats: { total, loaded, ok, failed } };
    throw err;
  }
  if (!response.ok) throw new Error(`Hovmoller fetch failed: ${response.status} ${response.statusText}`);
  const { resultObj } = await readNdjsonStream(response, {
    shouldCancel,
    onProgress: (p) => {
      loaded = p.loaded ?? loaded; total = p.total ?? total; ok = p.ok ?? ok;
      failed = p.failed ?? failed; cacheHits = p.cacheHits ?? cacheHits; lastSource = p.lastSource ?? lastSource;
      onProgress?.({ loaded, total, ok, failed, pct: total > 0 ? Math.round((loaded / total) * 100) : 100, cacheHits, lastSource, cancelled: shouldCancel() });
    },
  });
  if (shouldCancel()) return { cancelled: true, matrix: null, stats: { total, loaded, ok, failed, cacheHits } };
  if (!resultObj) return { cancelled: false, matrix: null, stats: { total, loaded, ok, failed, cacheHits } };

  const nLeads = resultObj.leads ? resultObj.leads.length : leads.length;
  const nPts = resultObj.rh?.[0]?.length ?? npoints;
  const toArr = (m2d) => Array.from({ length: nLeads }, (_, li) => {
    const row = (m2d && m2d[li]) || [];
    const arr = new Float32Array(nPts);
    for (let pi = 0; pi < nPts; pi++) {
      const v = row[pi];
      arr[pi] = v === null || v === undefined || Number.isNaN(v) ? NaN : v;
    }
    return arr;
  });
  const matrix = {
    pointA: resultObj.pointA || line.a, pointB: resultObj.pointB || line.b,
    distKm: resultObj.distKm ?? 0,
    cycle: resultObj.cycle || cycle, leads: [...(resultObj.leads || leads)], level: resultObj.level ?? level,
    rh: toArr(resultObj.rh), tmp: toArr(resultObj.tmp), vvel: toArr(resultObj.vvel),
    u: toArr(resultObj.u), v: toArr(resultObj.v),
    missing: resultObj.missing || { rh: 0, tmp: 0, vvel: 0, wind: 0 },
    stats: {
      rhMin: resultObj.stats?.rhMin ?? 0, rhMax: resultObj.stats?.rhMax ?? 100,
      tmpMin: resultObj.stats?.tmpMin ?? -40, tmpMax: resultObj.stats?.tmpMax ?? 40,
      vvelMin: resultObj.stats?.vvelMin ?? -100, vvelMax: resultObj.stats?.vvelMax ?? 100,
    },
  };
  return {
    cancelled: false, matrix,
    stats: { total: resultObj.stats?.total ?? total, loaded: loaded || total, ok: ok || total - (resultObj.stats?.failed || 0), failed: resultObj.stats?.failed ?? failed, cacheHits: resultObj.stats?.cacheHits ?? cacheHits },
  };
}
