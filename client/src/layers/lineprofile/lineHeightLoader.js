// lineHeightLoader.js - One-lead transect fetch + [level][pt] matrix builder (NDJSON stream)
export async function loadLineHeightMatrix({
  win = null,
  model = "ECMWF_HR",
  cycle,
  lead = 24,
  levels = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200],
  line = { a: { lon: 115, lat: 28 }, b: { lon: 125, lat: 38 } },
  npoints = 41,
  onProgress = null,
  isCancelled = null,
  abortController = null,
} = {}) {
  let total = levels.length * 4;
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
    model, cycle, lead: String(lead), levels: levels.join(","),
    lon0: String(line.a.lon), lat0: String(line.a.lat),
    lon1: String(line.b.lon), lat1: String(line.b.lat),
    npoints: String(npoints),
  });
  const url = `/api/data/lineheight/profile?${query.toString()}`;
  let response;
  try {
    response = await fetch(url, { signal });
  } catch (err) {
    if (shouldCancel()) return { cancelled: true, matrix: null, stats: { total, loaded, ok, failed } };
    throw err;
  }
  if (!response.ok) throw new Error(`LineHeight fetch failed: ${response.status} ${response.statusText}`);
  const { resultObj, progress } = await readNdjsonStream(response, {
    shouldCancel,
    onProgress: (p) => {
      loaded = p.loaded ?? loaded; total = p.total ?? total; ok = p.ok ?? ok;
      failed = p.failed ?? failed; cacheHits = p.cacheHits ?? cacheHits; lastSource = p.lastSource ?? lastSource;
      onProgress?.({ loaded, total, ok, failed, pct: total > 0 ? Math.round((loaded / total) * 100) : 100, cacheHits, lastSource, cancelled: shouldCancel() });
    },
  });
  void progress;
  if (shouldCancel()) return { cancelled: true, matrix: null, stats: { total, loaded, ok, failed, cacheHits } };
  if (!resultObj) return { cancelled: false, matrix: null, stats: { total, loaded, ok, failed, cacheHits } };

  const nLevels = resultObj.levels ? resultObj.levels.length : levels.length;
  const nPts = resultObj.rh?.[0]?.length ?? npoints;
  const toArr = (m2d) => Array.from({ length: nLevels }, (_, li) => {
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
    distKm: resultObj.distKm ?? 0, lead: resultObj.lead ?? lead,
    cycle: resultObj.cycle || cycle, levels: [...(resultObj.levels || levels)],
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

export async function readNdjsonStream(response, { shouldCancel, onProgress } = {}) {
  let resultObj = null, progress = [];
  const reader = response.body ? response.body.getReader() : null;
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  const handleLine = (trimmed) => {
    if (!trimmed) return;
    let evt;
    try { evt = JSON.parse(trimmed); } catch { return; }
    if (evt.type === "progress") {
      progress.push(evt);
      onProgress?.(evt);
    } else if (evt.type === "result") {
      resultObj = evt;
    }
  };
  if (reader) {
    try {
      while (true) {
        if (shouldCancel?.()) { try { await reader.cancel(); } catch {} break; }
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) handleLine(line.trim());
      }
      if (buffer.trim()) handleLine(buffer.trim());
    } catch (err) {
      if (shouldCancel?.()) return { resultObj, progress };
      throw err;
    }
  } else if (typeof response.text === "function") {
    const fullText = await response.text();
    for (const line of fullText.split("\n")) handleLine(line.trim());
  } else if (typeof response.json === "function") {
    const data = await response.json();
    if (data?.type === "result") resultObj = data;
  }
  return { resultObj, progress };
}
