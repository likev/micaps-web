// contourReRender.js - Viewport-bounded debounced contour re-rendering for massive grids (§8.8.4)
import { getMaxEffectiveCells } from "../config/presets.js";
import { shouldBypassCrop, normalizeBounds } from "../utils/viewportCrop.js";
import { renderContourLayers, setLayerIsolineStyle } from "../layers/contourLayer.js";
import { renderGridRaster } from "../layers/rasterLayer.js";
import { getLayerById } from "../ui/layerControl.js";
import { COLORMAPS, setColormaps } from "../utils/colormaps.js";
import { loadXMLPalette } from "../utils/paletteLoader.js";

const reRenderTimers = new Map();   // key: `${winKey}::${layerId}` -> timeout ID
const reRenderHandlers = new Map(); // key -> handler function
const reRenderBusy = new Set();     // keys with an active recompute in flight
const pendingReRenders = new Map(); // key -> boolean
const lastBoundsKey = new Map();    // key -> serialized bounds string
const handlerMaps = new Map();      // key -> map instance
// Fill coverage tracking (expand-on-demand fills): key -> expanded [w, s, e, n]
// lon/lat box the last isoband-fill computation covered. Fills are computed
// once at load for the load-time viewport; without this, zooming out or
// panning leaves the fill confined to that stale patch while isolines keep
// refreshing around it.
const lastFillBounds = new Map();

// Must match the render path default (options.bufferDelta ?? 1.75 in
// computeCropIndices) so coverage bookkeeping agrees with what was drawn.
export const FILL_BOUNDS_BUFFER_DEG = 1.75;
// Inset required between viewport edge and fill edge before triggering a
// recompute; absorbs sub-pixel jitter between moveend bounds reads.
export const FILL_BOUNDS_TOLERANCE_DEG = 0.02;

export function expandFillBounds(bounds, deltaDeg = FILL_BOUNDS_BUFFER_DEG) {
  const norm = normalizeBounds(bounds);
  if (!norm) return null;
  const d = Number.isFinite(deltaDeg) && deltaDeg > 0 ? deltaDeg : FILL_BOUNDS_BUFFER_DEG;
  return [norm[0] - d, norm[1] - d, norm[2] + d, norm[3] + d];
}

// True when the current viewport sits strictly inside the last fill box.
// False (=> recompute fills) on nulls, edge contact, overflow, or
// antimeridian crossing (safe side: recompute rather than reason about wrap).
export function isViewportWithinFill(viewportBounds, fillBounds, toleranceDeg = FILL_BOUNDS_TOLERANCE_DEG) {
  const inner = normalizeBounds(viewportBounds);
  const outer = normalizeBounds(fillBounds);
  if (!inner || !outer) return false;
  const [w, s, e, n] = inner;
  const [fw, fs, fe, fn] = outer;
  if (!(w <= e && fw <= fe)) return false;
  const tol = Number.isFinite(toleranceDeg) && toleranceDeg >= 0 ? toleranceDeg : 0;
  return (w - fw) > tol && (s - fs) > tol && (fe - e) > tol && (fn - n) > tol;
}

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
  lastFillBounds.delete(key);
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
  if (layer.type === "wind" && !layer.config?.showRaster) return;

  const winKey = getWinKey(win);
  const layerId = layer.id;
  const key = `${winKey}::${layerId}`;

  // Idempotent re-arm: disarm any existing registration for this key
  cleanupKey(key, map);

  const gridData = layer.gridData;
  const h = gridData.header;
  const nLon = h?.n_lon || h?.LongitudeGridNumber || (gridData.values ? gridData.values[0]?.length : (gridData.u ? gridData.u[0]?.length : 0));
  const nLat = h?.n_lat || h?.LatitudeGridNumber || (gridData.values ? gridData.values.length : (gridData.u ? gridData.u.length : 0));
  const totalCells = (nLon && nLat) ? nLon * nLat : (Array.isArray(gridData.values) ? gridData.values.length : (Array.isArray(gridData.u) ? gridData.u.length : 0));

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

  // Record initial fill coverage: the load-time render cropped fills to the
  // load-time viewport (+buffer). Later moves expand on demand from here.
  try {
    const fb = expandFillBounds(map.getBounds().toArray(), opts.bufferDelta ?? FILL_BOUNDS_BUFFER_DEG);
    if (fb) lastFillBounds.set(key, fb);
    else lastFillBounds.delete(key);
  } catch {
    lastFillBounds.delete(key);
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

      const runCompute = async () => {
        if (!map || !layer) return;
        const liveLayer = (win && typeof getLayerById === "function" ? getLayerById(layer.id, win) : null) || layer;
        if (!liveLayer.gridData) return;
        if (reRenderBusy.has(key)) {
          pendingReRenders.set(key, true);
          return;
        }

        reRenderBusy.add(key);
        lastBoundsKey.set(key, bKey);

        try {
          const palettePath = liveLayer.config?.palettePath || liveLayer.render?.palettePath;
          let targetColormap = liveLayer.colormap || (palettePath ? `palette:${liveLayer.id}` : null) || liveLayer.element || "TMP";

          if (palettePath && (!COLORMAPS || !COLORMAPS[targetColormap])) {
            try {
              const stops = await loadXMLPalette(palettePath);
              if (stops) {
                targetColormap = `palette:${liveLayer.id}`;
                setColormaps({ ...COLORMAPS, [targetColormap]: stops });
                liveLayer.colormap = targetColormap;
              }
            } catch {}
          }

          if (liveLayer.type === "contour" && liveLayer.gridData?.values) {
            // Resolve style explicitly from the LIVE layer (same fallbacks as
            // weatherLoader) so a map move can never resurrect a stale color.
            const el = liveLayer.element || "TMP";
            const isHgt = el === "HGT";
            const isTmp = el === "TMP";
            const styleLineColor = liveLayer.config?.lineColor || liveLayer.color
              || (isHgt ? "#58a6ff" : (isTmp ? "#f85149" : "#58a6ff"));
            const styleLineWidth = liveLayer.config?.lineWidth ?? 2.0;
            const styleBoldLineWidth = liveLayer.config?.boldLineWidth ?? 4.0;
            // Expand-on-demand fills: the load-time fill only covers the
            // load-time viewport. If the map moved outside that box,
            // recompute fills for the new viewport instead of preserving a
            // stale patch (which would cover only part of the map after
            // zoom-out/pan). Inside the box, keep the cheap path: refresh
            // isolines only, never contourf on move.
            let recomputeFill = false;
            try {
              if (liveLayer.visible !== false && liveLayer.config?.showFill !== false && !liveLayer.config?.showRaster) {
                if (!isViewportWithinFill(b, lastFillBounds.get(key))) {
                  recomputeFill = true;
                  const fb = expandFillBounds(b, opts.bufferDelta ?? FILL_BOUNDS_BUFFER_DEG);
                  if (fb) lastFillBounds.set(key, fb);
                }
              }
            } catch {}
            renderContourLayers(map, liveLayer.gridData, liveLayer.element || "TMP", {
              ...liveLayer.config,
              layerId: liveLayer.id,
              colormap: targetColormap,
              lineColor: styleLineColor,
              lineWidth: styleLineWidth,
              boldLineWidth: styleBoldLineWidth,
              preserveIsobands: recomputeFill ? false : true, // Preserve existing contour fill polygons (§8.8.4)
              visibleIsoband: liveLayer.visible !== false && Boolean(liveLayer.config?.showFill),
              showFill: recomputeFill ? liveLayer.config?.showFill : false, // NEVER contourf on move unless out of fill bounds
              showLine: liveLayer.visible !== false && liveLayer.config?.showLine !== false,
              viewportBounds: map.getBounds().toArray(),
              maxEffectiveCells: budget,
              onStats: (s) => {
                liveLayer._lastContourStats = s;
                if (typeof opts.onStats === "function") opts.onStats(s);
              },
            });
            // Re-assert paint after rebuild: the render path may recreate
            // layers with default paint, which would revert a user-picked
            // color/width on every pan/zoom.
            try {
              setLayerIsolineStyle(map, liveLayer.id, {
                lineColor: styleLineColor,
                lineWidth: styleLineWidth,
                boldValues: liveLayer.config?.boldValues,
                boldLineWidth: styleBoldLineWidth,
                labelSize: liveLayer.config?.labelSize,
              });
            } catch {}
          }

          if (liveLayer.visible !== false && liveLayer.config?.showRaster && liveLayer.gridData) {
            renderGridRaster(map, liveLayer.gridData, liveLayer.element || "TMP", targetColormap, {
              layerId: liveLayer.id,
              opacity: liveLayer.config?.opacity ?? 0.85,
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
