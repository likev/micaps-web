// lightingController.js - Coordinates workspace-wide live lighting compensation across split windows
import { appState } from "../store/appState.js";
import { getActiveTab, getVisibleWindows } from "../lib/stores/tabsCore.js";
import { getMapInstance } from "../lib/stores/tabsCore.js";
import { getLayersForWindow } from "../lib/stores/layersCore.js";
import { renderGridRaster } from "../layers/rasterLayer.js";
import { renderContourLayers } from "../layers/contourLayer.js";
import { loadImageLayer } from "../layers/imageLayer.js";
import { updateLegend } from "../lib/stores/legendCore.js";
import {
  classifyLightingMode,
  resolveSatelliteUtcMs,
  getCompensatedGridView,
} from "../utils/solarLighting.js";

function resolveMap(win) {
  if (!win) return null;
  const id = typeof win === "string" ? win : win.id;
  if (id) {
    try {
      const m = getMapInstance(id);
      if (m) return m;
    } catch {}
  }
  if (win && win.map && typeof win.map.getSource === "function") {
    return win.map;
  }
  return null;
}

/**
 * Builds lighting compensation options for a given layer.
 *
 * @param {object} layer - Layer object
 * @param {object} [win] - Window handle
 * @param {boolean} [isEnabled] - Explicit enabled flag override
 * @returns {object} Lighting options: { enabled, mode, utcMs, channel, satLon }
 */
export function buildLayerLightingOptions(layer, win = null, isEnabled = null) {
  const compActive = Boolean(appState.get("lightingCompensation"));
  const enabled = isEnabled !== null ? Boolean(isEnabled) : compActive;
  if (!layer) return { enabled: false, mode: "none" };

  const mode = classifyLightingMode(layer);
  if (mode === "none") return { enabled: false, mode: "none" };

  const gridHeader = layer.gridData?.header;
  const utcMs = resolveSatelliteUtcMs(layer, gridHeader);
  const element = layer.element || gridHeader?.element || "";

  let satLon = 133.0; // FY-4B sub-satellite point
  const path = String(layer.path || "").toUpperCase();
  const model = String(layer.model || "").toUpperCase();
  const file = String(layer.file || "").toUpperCase();
  if (path.includes("FY2G") || model.includes("FY2G") || file.includes("FY2G")) {
    satLon = 105.0; // FY-2G sub-satellite point
  }

  return {
    enabled,
    mode,
    utcMs,
    channel: element,
    satLon,
  };
}

/**
 * Re-renders all visible satellite layers across workspace windows with zero network requests (< 15ms).
 *
 * @param {object|object[]} [tabOrWindows] - Target tab or window list; defaults to active tab
 */
export function reapplyLightingCompensation(tabOrWindows = null) {
  let windows = [];
  if (Array.isArray(tabOrWindows)) {
    windows = tabOrWindows;
  } else if (tabOrWindows && typeof tabOrWindows === "object" && tabOrWindows.windows) {
    windows = getVisibleWindows(tabOrWindows);
  } else {
    const activeTab = getActiveTab();
    if (activeTab) {
      windows = getVisibleWindows(activeTab);
    }
  }

  if (!Array.isArray(windows) || windows.length === 0) return;

  for (const win of windows) {
    const map = resolveMap(win);
    if (!map) continue;

    const layers = getLayersForWindow(win) || [];
    for (const layer of layers) {
      const mode = classifyLightingMode(layer);
      if (mode === "none") continue;

      if (layer.type === "image") {
        try {
          loadImageLayer(map, layer, win);
        } catch (err) {
          console.warn("[LightingController] Error reloading image layer:", err);
        }
        continue;
      }

      if (layer.gridData) {
        const isCompActive = Boolean(appState.get("lightingCompensation"));
        const lightingOpts = buildLayerLightingOptions(layer, win, isCompActive);
        const colormap = layer.colormap || layer.config?.colormap || layer.element || "TMP";

        // Re-render raster quad texture
        if (layer.config?.showRaster && layer.visible !== false) {
          try {
            renderGridRaster(map, layer.gridData, layer.element, colormap, {
              layerId: layer.id,
              opacity: layer.config?.opacity ?? 0.85,
              status: layer.status,
              isSoftStale: layer.isSoftStale,
              isHardStale: layer.isHardStale,
              lighting: lightingOpts,
            });
          } catch (err) {
            console.warn("[LightingController] Error re-rendering raster:", err);
          }
        }

        // Re-render contour fills & isolines
        if ((layer.config?.showFill || layer.config?.showLine) && layer.visible !== false) {
          try {
            const effectiveGrid = isCompActive
              ? getCompensatedGridView(layer.gridData, lightingOpts)
              : layer.gridData;

            renderContourLayers(map, effectiveGrid, layer.element || "TMP", {
              ...layer.config,
              layerId: layer.id,
              colormap,
              showFill: layer.visible !== false && Boolean(layer.config?.showFill),
              showLine: layer.visible !== false && Boolean(layer.config?.showLine),
              showLabels: layer.visible !== false && layer.config?.showLabels !== false,
              viewportBounds: typeof map.getBounds === "function" ? map.getBounds().toArray() : null,
            });
          } catch (err) {
            console.warn("[LightingController] Error re-rendering contours:", err);
          }
        }

        // Update Legend badge (☀ SZA)
        try {
          updateLegend(
            layer.element,
            colormap,
            layer.gridData.stats?.min,
            layer.gridData.stats?.max,
            win,
            {
              layerId: layer.id,
              name: layer.name,
              lightingCompensated: Boolean(
                isCompActive && lightingOpts && lightingOpts.mode !== "none"
              ),
            }
          );
        } catch {}
      }
    }
  }

  // Refresh cursor probe probe values if currently active
  if (typeof window !== "undefined") {
    import("../lib/stores/cursorProbe.svelte.js")
      .then(({ cursorProbeState, updateCursorProbe }) => {
        if (cursorProbeState?.active && cursorProbeState.lng != null && cursorProbeState.lat != null) {
          const targetWin = windows[0] || null;
          updateCursorProbe(cursorProbeState.lng, cursorProbeState.lat, targetWin);
        }
      })
      .catch(() => {});
  }
}
