// contourReRender.js - Viewport-bounded debounced contour re-rendering for massive grids (§8.8.4)
import { getMaxEffectiveCells } from "../config/presets.js";
import { shouldBypassCrop } from "../utils/viewportCrop.js";
import { renderContourLayers } from "../layers/contourLayer.js";
import { renderGridRaster } from "../layers/rasterLayer.js";

const reRenderTimers = new Map();   // key: `${winKey}::${layerId}` -> timeout ID
const reRenderHandlers = new Map(); // key -> handler function
const reRenderBusy = new Set();     // keys with an active recompute in flight
const pendingReRenders = new Map(); // key -> boolean
const lastBoundsKey = new Map();    // key -> serialized bounds string
const handlerMaps = new Map();      // key -> map instance

function getWinKey(win) {
  if (!win) return "default";
  if (win.id) return win.id;
  if (win.winIdx !== undefined) return `w-${win.winIdx}`;
  return "default";
}

function cleanupKey(key, map = null) {
  if (reRenderTimers.has(key)) {
    clearTimeout(reRenderTimers.get(key));
    reRenderTimers.delete(key);
  }
  const handler = reRenderHandlers.get(key);
  const targetMap = map || handlerMaps.get(key);
  if (handler && targetMap && typeof targetMap.off === "function") {
    try {
      targetMap.off("moveend", handler);
      targetMap.off("zoomend", handler);
    } catch {}
  }
  reRenderHandlers.delete(key);
  handlerMaps.delete(key);
  reRenderBusy.delete(key);
  pendingReRenders.delete(key);
  lastBoundsKey.delete(key);
}

/**
 * Arms debounced viewport re-rendering for massive grids (Ncells >= budget).
 * Regional meshes (< budget) bypass listeners entirely to preserve locked 60 FPS.
 *
 * @param {Object} map - MapLibre map instance
 * @param {Object} layer - Layer configuration object with gridData, element, config, visible, colormap
 * @param {Object} [win=null] - Multi-window workspace reference
 * @param {Object} [opts={}] - Optional overrides (maxEffectiveCells, onStats)
 */
export function armContourReRender(map, layer, win = null, opts = {}) {
  if (!map || !layer || !layer.id || !layer.gridData) return;

  const winKey = getWinKey(win);
  const layerId = layer.id;
  const key = `${winKey}::${layerId}`;

  // Idempotent re-arm: disarm any existing registration for this key
  cleanupKey(key, map);

  const gridData = layer.gridData;
  const h = gridData.header;
  const nLon = h?.n_lon || h?.LongitudeGridNumber || (gridData.values ? gridData.values[0]?.length : 0);
  const nLat = h?.n_lat || h?.LatitudeGridNumber || (gridData.values ? gridData.values.length : 0);
  const totalCells = (nLon && nLat) ? nLon * nLat : (Array.isArray(gridData.values) ? gridData.values.length : 0);

  const budget = Number.isFinite(opts.maxEffectiveCells) && opts.maxEffectiveCells > 0
    ? getMaxEffectiveCells(opts.maxEffectiveCells)
    : getMaxEffectiveCells();

  // §8.8.4 Gate: If grid cells < budget, bypass viewport re-render entirely (Zero pan/zoom re-computation)
  if (shouldBypassCrop(totalCells, budget)) {
    return;
  }

  // Record initial bounds key
  if (typeof map.getBounds === "function") {
    try {
      const b = map.getBounds().toArray();
      const bKey = `${b[0][0].toFixed(2)},${b[0][1].toFixed(2)},${b[1][0].toFixed(2)},${b[1][1].toFixed(2)}`;
      lastBoundsKey.set(key, bKey);
    } catch {}
  }

  const triggerReRender = () => {
    if (reRenderTimers.has(key)) {
      clearTimeout(reRenderTimers.get(key));
    }

    const capturedSeq = win?.loadSeq;
    const capturedPath = layer.path;
    const capturedFile = layer.file;
    const capturedLevel = layer.level;

    const timerId = setTimeout(() => {
      reRenderTimers.delete(key);

      // Visibility check: pause re-rendering in hidden tabs until foregrounded
      if (typeof document !== "undefined" && document.hidden) {
        const onVisible = () => {
          if (!document.hidden) {
            document.removeEventListener("visibilitychange", onVisible);
            triggerReRender();
          }
        };
        document.addEventListener("visibilitychange", onVisible);
        return;
      }

      // Stale guard: discard if timeline stepped or layer identity changed
      if (win && capturedSeq !== undefined && win.loadSeq !== capturedSeq) {
        return;
      }
      if (layer.path !== capturedPath || layer.file !== capturedFile || layer.level !== capturedLevel) {
        return;
      }

      if (!map || typeof map.getBounds !== "function") return;
      let b;
      try {
        b = map.getBounds().toArray();
      } catch {
        return;
      }
      const bKey = `${b[0][0].toFixed(2)},${b[0][1].toFixed(2)},${b[1][0].toFixed(2)},${b[1][1].toFixed(2)}`;
      if (lastBoundsKey.get(key) === bKey) {
        return; // Bounds unchanged
      }

      const runCompute = () => {
        if (!map || !layer || !layer.gridData) return;
        if (reRenderBusy.has(key)) {
          pendingReRenders.set(key, true);
          return;
        }

        reRenderBusy.add(key);
        lastBoundsKey.set(key, bKey);

        try {
          renderContourLayers(map, layer.gridData, layer.element || "TMP", {
            ...layer.config,
            layerId: layer.id,
            showFill: false, // NEVER contourf on move (spec §8.8.4: isolines + raster only)
            showLine: layer.visible !== false && layer.config?.showLine !== false,
            viewportBounds: map.getBounds().toArray(),
            maxEffectiveCells: budget,
            onStats: (s) => {
              layer._lastContourStats = s;
              if (typeof opts.onStats === "function") opts.onStats(s);
            },
          });

          if (layer.visible !== false && layer.config?.showRaster && layer.gridData) {
            renderGridRaster(map, layer.gridData, layer.element || "TMP", layer.colormap, {
              layerId: layer.id,
              opacity: layer.config?.opacity ?? 0.85,
            });
          }
        } catch (err) {
          console.warn("[ContourReRender] Background re-render failed:", err);
        } finally {
          reRenderBusy.delete(key);
          if (pendingReRenders.get(key)) {
            pendingReRenders.delete(key);
            triggerReRender();
          }
        }
      };

      if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(runCompute, { timeout: 500 });
      } else {
        setTimeout(runCompute, 0);
      }
    }, 250);

    reRenderTimers.set(key, timerId);
  };

  reRenderHandlers.set(key, triggerReRender);
  handlerMaps.set(key, map);

  if (typeof map.on === "function") {
    map.on("moveend", triggerReRender);
    map.on("zoomend", triggerReRender);
  }
}

/**
 * Disarms viewport contour re-rendering for a specific layer.
 */
export function disarmContourReRender(map, layerId, win = null) {
  if (!layerId) return;
  if (win) {
    const winKey = getWinKey(win);
    const key = `${winKey}::${layerId}`;
    cleanupKey(key, map);
  } else {
    for (const key of Array.from(reRenderHandlers.keys())) {
      if (key.endsWith(`::${layerId}`)) {
        cleanupKey(key, map);
      }
    }
  }
}

/**
 * Disarms all contour re-renders for a window or across all windows.
 */
export function disarmAllContourReRenders(map = null, win = null) {
  if (win) {
    const winKey = getWinKey(win);
    const prefix = `${winKey}::`;
    for (const key of Array.from(reRenderHandlers.keys())) {
      if (key.startsWith(prefix)) {
        cleanupKey(key, map);
      }
    }
  } else {
    for (const key of Array.from(reRenderHandlers.keys())) {
      cleanupKey(key, map);
    }
  }
}
