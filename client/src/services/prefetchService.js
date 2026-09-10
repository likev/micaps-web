// prefetchService.js - Intelligent prefetch engine for keyboard shortcuts (Left/Right/Up/Down)
import { getAdjacentTimeSteps } from "../ui/timeSlider.js";
import { fetchGridData, fetchGridBinaryStream, fetchStationObservations } from "../api/catalogApi.js";
import { isCached } from "../api/apiClient.js";
import { getLayersForWindow } from "../ui/layerControl.js";

export const VERTICAL_LEVELS = [1000, 925, 850, 700, 500, 400, 300, 200, 100];

const prefetchTimers = new Map(); // winKey -> timer
let lastPrefetchStats = {
  timestamp: 0,
  prefetchedCount: 0,
  successfulCount: 0,
  cachedCount: 0,
  targets: null,
};

/**
 * Normalizes input direction(s) into canonical direction names ('left', 'right', 'up', 'down').
 * Maps 'prev' -> 'left' and 'next' -> 'right'.
 *
 * @param {string|string[]} [directions]
 * @returns {Set<string>|null} Set of canonical directions, or null if no restriction
 */
export function normalizeDirections(directions) {
  if (!directions) return null;
  const list = Array.isArray(directions) ? directions : [directions];
  const set = new Set();
  for (const d of list) {
    if (!d) continue;
    const lower = String(d).trim().toLowerCase();
    if (lower === "prev" || lower === "left") set.add("left");
    else if (lower === "next" || lower === "right") set.add("right");
    else if (lower === "up") set.add("up");
    else if (lower === "down") set.add("down");
  }
  return set.size > 0 ? set : null;
}

/**
 * Computes prefetch targets for directional axes based on the window state.
 * If options.directions is specified (e.g. ['prev'] or ['next']), only items for those
 * directions will be resolved, leaving others empty.
 *
 * @param {Object} win - Window instance
 * @param {Object} [options] - Optional overrides (e.g. mock timelineSteps, directions)
 * @returns {Object} { left, right, up, down }
 */
export function getPrefetchTargets(win, options = {}) {
  if (!win) {
    return { left: null, right: null, up: null, down: null };
  }

  const timelineSteps = options.timelineSteps || getAdjacentTimeSteps();
  const mode = timelineSteps.mode || (win.isObservation ? "obs" : "nwp");
  const activeGroup = win.activeGroup;

  // Retrieve active window layers if available
  let winLayers = [];
  try {
    if (typeof getLayersForWindow === "function") {
      winLayers = getLayersForWindow(win) || [];
    }
  } catch {}
  if ((!winLayers || winLayers.length === 0) && Array.isArray(win.layers)) {
    winLayers = win.layers;
  }

  const hasRasterActive = (element, model) => {
    const matched = winLayers.find(
      (l) => (l.element === element && l.model === model) || (l.type === "raster" && l.model === model)
    );
    return Boolean(matched?.config?.showRaster);
  };

  const allowed = normalizeDirections(options.directions);
  const shouldFetchLeft = !allowed || allowed.has("left");
  const shouldFetchRight = !allowed || allowed.has("right");
  const shouldFetchUp = !allowed || allowed.has("up");
  const shouldFetchDown = !allowed || allowed.has("down");

  const targets = {
    left: { direction: "left", mode, items: [] },
    right: { direction: "right", mode, items: [] },
    up: { direction: "up", mode, items: [] },
    down: { direction: "down", mode, items: [] },
  };

  // ── 1. Left & Right (Time steps) ──────────────────────────────────────────
  if (mode === "nwp") {
    const cycle = win.forecastCycle || timelineSteps.periods?.cycle;
    const curPeriod = timelineSteps.periods?.current ?? win.period ?? 24;
    const prevPeriod = timelineSteps.periods?.prev;
    const nextPeriod = timelineSteps.periods?.next;

    targets.left.period = prevPeriod;
    targets.right.period = nextPeriod;
    targets.left.cycle = cycle;
    targets.right.cycle = cycle;

    if (cycle) {
      if (shouldFetchLeft && prevPeriod !== null && prevPeriod !== undefined && prevPeriod !== curPeriod) {
        targets.left.items = collectNwpItems(win, prevPeriod, cycle, hasRasterActive, "left");
      }
      if (shouldFetchRight && nextPeriod !== null && nextPeriod !== undefined && nextPeriod !== curPeriod) {
        targets.right.items = collectNwpItems(win, nextPeriod, cycle, hasRasterActive, "right");
      }
    }
  } else {
    // Observation mode
    const curObsFile = timelineSteps.obsFiles?.current ?? win.obsTime;
    const prevObsFile = timelineSteps.obsFiles?.prev;
    const nextObsFile = timelineSteps.obsFiles?.next;

    targets.left.obsFile = prevObsFile;
    targets.right.obsFile = nextObsFile;

    if (shouldFetchLeft && prevObsFile && prevObsFile !== curObsFile) {
      targets.left.items = collectObsItems(win, prevObsFile, "left");
    }
    if (shouldFetchRight && nextObsFile && nextObsFile !== curObsFile) {
      targets.right.items = collectObsItems(win, nextObsFile, "right");
    }
  }

  // ── 2. Up & Down (Vertical levels) ────────────────────────────────────────
  let supportsLevels = false;
  if (activeGroup) {
    // Explicit preset configuration contract: hasLevel === true
    supportsLevels = Boolean(activeGroup.hasLevel);
  } else if (win.model === "SURFACE" || win.level === 0) {
    supportsLevels = false;
  } else if (win.model === "UPPER_AIR" || (!win.isObservation && win.level !== null && win.level > 0)) {
    supportsLevels = true;
  }

  if (supportsLevels) {
    const curLevel = win.level || (activeGroup?.hasLevel ? activeGroup.defaultLevel : 500);
    let idx = VERTICAL_LEVELS.indexOf(curLevel);
    if (idx === -1) idx = 4; // Default 500 hPa

    const upLevel = idx + 1 < VERTICAL_LEVELS.length ? VERTICAL_LEVELS[idx + 1] : null;
    const downLevel = idx - 1 >= 0 ? VERTICAL_LEVELS[idx - 1] : null;

    targets.up.level = upLevel;
    targets.down.level = downLevel;

    if (shouldFetchUp && upLevel !== null) {
      if (mode === "nwp") {
        const cycle = win.forecastCycle || timelineSteps.periods?.cycle;
        const curPeriod = timelineSteps.periods?.current ?? win.period ?? 24;
        if (cycle) {
          targets.up.items = collectNwpItems(win, curPeriod, cycle, hasRasterActive, "up", upLevel);
        }
      } else {
        const curObsFile = timelineSteps.obsFiles?.current ?? win.obsTime;
        if (curObsFile) {
          targets.up.items = collectObsItems(win, curObsFile, "up", upLevel);
        }
      }
    }

    if (shouldFetchDown && downLevel !== null) {
      if (mode === "nwp") {
        const cycle = win.forecastCycle || timelineSteps.periods?.cycle;
        const curPeriod = timelineSteps.periods?.current ?? win.period ?? 24;
        if (cycle) {
          targets.down.items = collectNwpItems(win, curPeriod, cycle, hasRasterActive, "down", downLevel);
        }
      } else {
        const curObsFile = timelineSteps.obsFiles?.current ?? win.obsTime;
        if (curObsFile) {
          targets.down.items = collectObsItems(win, curObsFile, "down", downLevel);
        }
      }
    }
  }

  return targets;
}

function collectNwpItems(win, targetPeriod, cycle, hasRasterActive, direction, overrideLevel = null) {
  const items = [];
  const activeGroup = win.activeGroup;
  const file = `${cycle}.${String(targetPeriod).padStart(3, "0")}`;

  if (activeGroup && Array.isArray(activeGroup.layers) && activeGroup.layers.length > 0) {
    for (const layer of activeGroup.layers) {
      if (layer.derivedFrom) {
        // Skip derived contour layers (computed client-side from station observations)
        continue;
      }
      if (layer.type === "contour" || layer.type === "wind") {
        const model = layer.model || win.model || "ECMWF_HR";
        const element = layer.element || win.element || "TMP";
        let lvl =
          overrideLevel !== null
            ? overrideLevel
            : (win.level || layer.level || (activeGroup.hasLevel ? activeGroup.defaultLevel : 500));
        if (layer.model === "SURFACE" || layer.level === 0) lvl = null;

        const path = lvl ? `${model}/${element}/${lvl}` : `${model}/${element}`;
        items.push({ type: "grid", path, file, direction, level: lvl, period: targetPeriod });

        if (layer.render?.showRaster || hasRasterActive(element, model)) {
          items.push({ type: "binary", path, file, direction, level: lvl, period: targetPeriod });
        }
      }
    }
  } else {
    // Single NWP field
    const model = win.model || "ECMWF_HR";
    const element = win.element || "TMP";
    const lvl = overrideLevel !== null ? overrideLevel : (win.level || 500);
    const path = lvl ? `${model}/${element}/${lvl}` : `${model}/${element}`;
    items.push({ type: "grid", path, file, direction, level: lvl, period: targetPeriod });

    if (hasRasterActive(element, model)) {
      items.push({ type: "binary", path, file, direction, level: lvl, period: targetPeriod });
    }
  }

  return items;
}

function collectObsItems(win, targetObsFile, direction, overrideLevel = null) {
  const items = [];
  const activeGroup = win.activeGroup;

  if (activeGroup && Array.isArray(activeGroup.layers) && activeGroup.layers.length > 0) {
    for (const layer of activeGroup.layers) {
      if (layer.type === "station") {
        const model = layer.model || win.model || "SURFACE";
        const element = layer.element || win.element || "PLOT";
        let lvl = overrideLevel !== null ? overrideLevel : (win.level || layer.level);

        const obsPath =
          model === "UPPER_AIR" && lvl
            ? `UPPER_AIR/${element}/${lvl}`
            : (layer.path || (model === "UPPER_AIR" ? `UPPER_AIR/${element}/${lvl || 500}` : `${model}/${element}`));

        items.push({ type: "station", path: obsPath, file: targetObsFile, direction, level: lvl });
      }
    }
  } else {
    // Single Observation product
    const model = win.model || "SURFACE";
    const element = win.element || "PLOT_GLOBAL_3H";
    const lvl = overrideLevel !== null ? overrideLevel : win.level;
    const obsPath =
      model === "SURFACE"
        ? `SURFACE/${element}`
        : (model === "UPPER_AIR" ? `UPPER_AIR/${element}/${lvl || 500}` : `${model}/${element}`);

    items.push({ type: "station", path: obsPath, file: targetObsFile, direction, level: lvl });
  }

  return items;
}

/**
 * Immediately triggers prefetching of surrounding Left/Right/Up/Down data.
 * All requests run in the background with silent error catching.
 *
 * @param {Object} [win] - Target window instance
 * @param {Object} [options] - Optional overrides (e.g. directions: ['prev'] or ['next'])
 * @returns {Promise<Object>} Statistics of prefetched items
 */
export async function prefetchSurroundingData(win, options = {}) {
  if (!win) {
    try {
      const { getActiveWindow } = await import("../ui/tabWindowManager.js");
      win = getActiveWindow?.();
    } catch {}
  }
  if (!win) return { prefetchedCount: 0, successfulCount: 0, cachedCount: 0, targets: null };

  const effectiveDirections = options.directions || win.prefetchDirections || null;
  const targets = getPrefetchTargets(win, { ...options, directions: effectiveDirections });

  if (win.prefetchDirections) {
    win.prefetchDirections = null;
  }

  const allItems = [
    ...(targets.left?.items || []),
    ...(targets.right?.items || []),
    ...(targets.up?.items || []),
    ...(targets.down?.items || []),
  ];

  // Deduplicate items
  const seen = new Set();
  const uniqueItems = [];
  for (const item of allItems) {
    const key = `${item.type}:${item.path}:${item.file}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueItems.push(item);
    }
  }

  if (uniqueItems.length === 0) {
    lastPrefetchStats = {
      timestamp: Date.now(),
      prefetchedCount: 0,
      successfulCount: 0,
      cachedCount: 0,
      targets,
    };
    return lastPrefetchStats;
  }

  // Filter out items already cached within TTL
  let cachedCount = 0;
  const itemsToFetch = uniqueItems.filter((item) => {
    let cached = false;
    if (item.type === "grid") {
      cached = isCached("/api/data/grid", { path: item.path, file: item.file });
    } else if (item.type === "binary") {
      cached = isCached("/api/data/grid/binary", { path: item.path, file: item.file });
    } else if (item.type === "station") {
      cached = isCached("/api/data/station", { path: item.path, file: item.file });
    }
    if (cached) {
      cachedCount++;
      return false;
    }
    return true;
  });

  if (itemsToFetch.length === 0) {
    lastPrefetchStats = {
      timestamp: Date.now(),
      prefetchedCount: uniqueItems.length,
      successfulCount: uniqueItems.length,
      cachedCount,
      targets,
    };
    return lastPrefetchStats;
  }

  const results = await Promise.allSettled(
    itemsToFetch.map(async (item) => {
      try {
        if (item.type === "grid") {
          return await fetchGridData(item.path, item.file);
        } else if (item.type === "binary") {
          return await fetchGridBinaryStream(item.path, item.file);
        } else if (item.type === "station") {
          return await fetchStationObservations(item.path, item.file);
        }
      } catch (err) {
        // Silent catch: prefetch is best-effort and must not throw or alert
        return null;
      }
    })
  );

  const newSuccessCount = results.filter((r) => r.status === "fulfilled" && r.value !== null).length;
  const successfulCount = cachedCount + newSuccessCount;

  lastPrefetchStats = {
    timestamp: Date.now(),
    prefetchedCount: uniqueItems.length,
    fetchedCount: itemsToFetch.length,
    successfulCount,
    cachedCount,
    targets,
  };

  return lastPrefetchStats;
}

/**
 * Schedules debounced prefetch (default 150ms) per window to ensure prefetch triggers once after state settles.
 *
 * @param {Object} [win] - Target window instance
 * @param {number} [delayMs=150] - Debounce delay in milliseconds
 * @param {Object} [options] - Optional prefetch options (e.g. { directions: ['next'] })
 */
export function schedulePrefetch(win, delayMs = 150, options = {}) {
  const winKey = win?.id || (win?.winIdx !== undefined ? `w-${win.winIdx}` : "default");
  if (prefetchTimers.has(winKey)) {
    clearTimeout(prefetchTimers.get(winKey));
    prefetchTimers.delete(winKey);
  }
  const timer = setTimeout(() => {
    prefetchTimers.delete(winKey);
    prefetchSurroundingData(win, options).catch(() => {});
  }, delayMs);
  prefetchTimers.set(winKey, timer);
}

export function cancelScheduledPrefetch(win = null) {
  if (win) {
    const winKey = win?.id || (win?.winIdx !== undefined ? `w-${win.winIdx}` : "default");
    if (prefetchTimers.has(winKey)) {
      clearTimeout(prefetchTimers.get(winKey));
      prefetchTimers.delete(winKey);
    }
  } else {
    for (const timer of prefetchTimers.values()) {
      clearTimeout(timer);
    }
    prefetchTimers.clear();
  }
}

export function getLastPrefetchStats() {
  return lastPrefetchStats;
}
