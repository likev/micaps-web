// windGridCache.js - Bounded per-window cache for parent WIND gridData.
//
// Several overlays (VOR/DIV kinematics, derived wind contours, wind barbs)
// share one parent wind field per (model, level, file). The cache dedupes
// repeat fetches within a load, but its key includes the file — so every
// timeline step appends entries that are never evicted. In split mode the
// growth is multiplied by the window count (full u+v grids per entry), which
// shows up as steadily climbing memory while stepping. Cap entries per
// window with oldest-first eviction; stepping back and forth only ever needs
// the current file plus its immediate neighbours.
export const MAX_WIND_GRID_CACHE_ENTRIES = 6;

export function getWindGridCache(win) {
  if (!win || typeof win !== "object") return null;
  if (!(win._windGridCache instanceof Map)) {
    win._windGridCache = new Map();
  }
  return win._windGridCache;
}

export function getCachedWindGrid(win, cacheKey) {
  if (!win || !cacheKey) return null;
  try {
    return win._windGridCache instanceof Map ? (win._windGridCache.get(cacheKey) || null) : null;
  } catch {
    return null;
  }
}

export function setCachedWindGrid(win, cacheKey, gridData) {
  if (!win || typeof win !== "object" || !cacheKey || !gridData) return gridData;
  const cache = getWindGridCache(win);
  // Refresh recency on re-set so hot entries are not evicted first.
  if (cache.has(cacheKey)) cache.delete(cacheKey);
  cache.set(cacheKey, gridData);
  while (cache.size > MAX_WIND_GRID_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return gridData;
}
