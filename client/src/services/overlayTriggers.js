// overlayTriggers.js - Service triggers for isobands, raster overlays, wind streamlines, and kinematic fields
import { showErrorToast } from "../ui/toast.js";
import {
  setLayerIsobandVisibility,
  renderContourLayers,
  getLayerDOMIds,
} from "../layers/contourLayer.js";
import {
  renderBinaryRaster,
  renderGridRaster,
} from "../layers/rasterLayer.js";
import {
  fetchGridBinaryStream,
  fetchGridData,
} from "../api/catalogApi.js";
import { appState } from "../store/appState.js";
import { getLayersForWindow } from "../ui/layerControl.js";
import { updateLegend } from "../ui/legend.js";
import { armContourReRender } from "./contourReRender.js";
import { triggerVortDivOverlay } from "./overlayKinematics.js";
import {
  triggerWindStreamlines,
  triggerWindBarbs,
  triggerStationStreamlines,
} from "./overlayWind.js";

export {
  triggerVortDivOverlay,
  triggerWindStreamlines,
  triggerWindBarbs,
  triggerStationStreamlines,
};

export function notifyError(msg) {
  try {
    showErrorToast(msg);
  } catch {}
}

export function getSourceFeatures(src) {
  if (!src) return [];
  const d = src._data?.geojson || src._data || src.data;
  return Array.isArray(d?.features) ? d.features : [];
}

export async function triggerIsobandOverlay(map, layer = null, win = null) {
  if (!map || !layer || layer.type === "wind") return;
  const layerId = layer.id || (layer.element ? `contour-${layer.element}` : "default");
  const { isobandSrcId } = getLayerDOMIds(layerId);
  const isobandSrc = map.getSource(isobandSrcId);
  const features = getSourceFeatures(isobandSrc);

  if (features.length > 0) {
    setLayerIsobandVisibility(map, layerId, layer.visible !== false);
    if (layer.visible !== false && layer.element) {
      const colormap = layer.colormap || layer.config?.palettePath || layer.element;
      updateLegend(layer.element, colormap, layer.gridData?.stats?.min, layer.gridData?.stats?.max, win);
    }
    return;
  }

  // 1. Direct in-memory gridData from layer
  if (layer.gridData && layer.gridData.header) {
    const isVisible = layer.visible !== false;
    renderContourLayers(map, layer.gridData, layer.element || "TMP", {
      ...layer.config,
      layerId,
      levels: layer.config?.levels,
      showFill: isVisible,
      showRaster: false,
      showLine: isVisible && layer.config?.showLine !== false,
      opacity: layer.config?.opacity ?? 0.75,
      lineColor: layer.config?.lineColor,
      lineWidth: layer.config?.lineWidth,
      boldValues: layer.config?.boldValues,
      boldLineWidth: layer.config?.boldLineWidth,
      colormap: layer.colormap || layer.element,
      smooth: layer.config?.smooth,
      smoothIterations: layer.config?.smoothIterations,
      labelSize: layer.config?.labelSize,
      viewportBounds: map && typeof map.getBounds === "function" ? map.getBounds().toArray() : null,
    });
    armContourReRender(map, layer, win);
    if (isVisible && layer.element) {
      const colormap = layer.colormap || layer.config?.palettePath || layer.element;
      updateLegend(layer.element, colormap, layer.gridData?.stats?.min, layer.gridData?.stats?.max, win);
    }
    return;
  }

  // 2. Fetch gridData if missing (for catalog-loaded NWP layers)
  const isUpper = layer.model === "UPPER_AIR" || (layer.id && layer.id.startsWith("contour-sounding-"));
  const isSurface =
    layer.model === "SURFACE" ||
    layer.model === "SURFACE_ANALYSIS" ||
    (layer.id && layer.id.startsWith("contour-surface-"));
  const isNwpKinematic =
    (layer.element === "VOR" || layer.element === "DIV" || (layer.element === "WIND" && layer.type === "contour")) &&
    !isUpper &&
    !isSurface;
  if (isNwpKinematic) {
    await triggerVortDivOverlay(map, layer, win);
    return;
  }

  const model = layer.model || win?.model || "ECMWF_HR";
  const level = layer.level !== undefined && layer.level !== null ? layer.level : (win?.level !== undefined ? win.level : null);
  let path = layer.path;
  if (!path) {
    const isUp = model === "UPPER_AIR" || (layer.element && layer.element.includes("UPPER"));
    path = isUp ? `UPPER_AIR/${layer.element}/${level || 500}` : `${model}/${layer.element}/${level !== null ? level : "0"}`;
  }
  let file = layer.file || win?.obsTime;
  if (!file && win?.forecastCycle) {
    file = `${win.forecastCycle}.${String(win.period ?? 24).padStart(3, "0")}`;
  }
  if (path && file) {
    try {
      const gridData = await fetchGridData(path, file);
      if (gridData && gridData.header) {
        layer.gridData = gridData;
        const isVisible = layer.visible !== false;
        renderContourLayers(map, gridData, layer.element || "TMP", {
          ...layer.config,
          layerId,
          levels: layer.config?.levels,
          showFill: isVisible,
          showRaster: false,
          showLine: isVisible && layer.config?.showLine !== false,
          opacity: layer.config?.opacity ?? 0.75,
          lineColor: layer.config?.lineColor,
          lineWidth: layer.config?.lineWidth,
          boldValues: layer.config?.boldValues,
          boldLineWidth: layer.config?.boldLineWidth,
          colormap: layer.colormap || layer.element,
          smooth: layer.config?.smooth,
          smoothIterations: layer.config?.smoothIterations,
          labelSize: layer.config?.labelSize,
          viewportBounds: map && typeof map.getBounds === "function" ? map.getBounds().toArray() : null,
        });
        armContourReRender(map, layer, win);
        if (isVisible && layer.element) {
          const colormap = layer.colormap || layer.config?.palettePath || layer.element;
          updateLegend(layer.element, colormap, gridData.stats?.min, gridData.stats?.max, win);
        }
        return;
      }
    } catch (err) {
      console.warn("[LayerActions] Failed to fetch gridData for isoband overlay:", err);
    }
  }

  // Fallback: sync visibility on existing layer
  setLayerIsobandVisibility(map, layerId, layer.visible !== false);
}

export async function triggerRasterOverlay(map, layer = null, win = null) {
  if (!map) return;

  // If no specific layer is supplied (e.g. global aux raster action), trigger for all active weather layers in window
  if (!layer) {
    const layers = getLayersForWindow(win);
    const weatherLayers = layers.filter(
      (l) => (l.type === "contour" || l.type === "wind" || l.gridData) && l.visible !== false && l.config?.showRaster !== false
    );
    if (weatherLayers.length > 0) {
      weatherLayers.forEach((l) => triggerRasterOverlay(map, l, win));
      return;
    }
  }

  const layerId =
    layer?.id ||
    (layer?.type === "wind" || layer?.element === "WIND"
      ? "wind-WIND"
      : layer?.element
      ? `contour-${layer.element}`
      : "default");
  const element = layer?.element || win?.element || "TMP";
  let colormap = layer?.colormap || layer?.render?.colormap || win?.colormap || element;
  const opacity = layer?.config?.opacity !== undefined ? layer.config.opacity : 0.85;

  const palettePath = layer?.config?.palettePath || layer?.render?.palettePath;
  if (palettePath) {
    const paletteKey = `palette:${layerId}`;
    try {
      const { loadXMLPalette } = await import("../utils/paletteLoader.js");
      const { setColormaps, COLORMAPS } = await import("../utils/colormaps.js");
      const stops = await loadXMLPalette(palettePath);
      if (stops) {
        setColormaps({ ...COLORMAPS, [paletteKey]: stops });
        if (layer) layer.colormap = paletteKey;
        colormap = paletteKey;
      }
    } catch {}
  }

  // 1. Direct in-memory gridData from layer (e.g. RH, HGT, Wind, Surface SLP, or Sounding Analysis)
  if (layer?.gridData) {
    renderGridRaster(map, layer.gridData, element, colormap, { layerId, opacity });
    if (layer.visible !== false) {
      updateLegend(element, colormap, layer.gridData.stats?.min, layer.gridData.stats?.max, win);
    }
    armContourReRender(map, layer, win);
    return;
  }

  // 2. Wind gridData from window (if wind layer without attached gridData)
  if ((layer?.type === "wind" || layer?.element === "WIND") && win?.windGridData) {
    renderGridRaster(map, win.windGridData, "WIND", colormap, { layerId, opacity });
    if (layer?.visible !== false) {
      updateLegend("WIND", colormap, 0, undefined, win);
    }
    return;
  }

  // 3. Dynamic model, element, level and file from layer or window
  const isUpper = layer?.model === "UPPER_AIR" || (layer?.id && layer?.id.startsWith("contour-sounding-"));
  const isSurface =
    layer?.model === "SURFACE" ||
    layer?.model === "SURFACE_ANALYSIS" ||
    (layer?.id && layer?.id.startsWith("contour-surface-"));
  const isNwpKinematic =
    (element === "VOR" || element === "DIV" || (element === "WIND" && layer?.type === "contour")) &&
    !isUpper &&
    !isSurface;
  if (isNwpKinematic) {
    await triggerVortDivOverlay(map, layer, win);
    return;
  }

  const model = layer?.model || win?.model || "ECMWF_HR";
  const level = layer?.level !== undefined && layer?.level !== null ? layer.level : (win?.level !== undefined ? win.level : null);

  let path = layer?.path;
  if (!path) {
    if (model === "SURFACE") {
      path = `SURFACE/${element}`;
    } else if (level && level > 0) {
      path = `${model}/${element}/${level}`;
    } else {
      path = `${model}/${element}`;
    }
  }

  let file = layer?.file || win?.obsTime || win?.file;
  if (!file) {
    const period = win?.period ?? 24;
    let cycle = win?.forecastCycle || appState.get("forecastCycle");
    if (!cycle) {
      try {
        const { resolveLatestForecastCycle } = await import("../utils/timelineSync.js");
        cycle = await resolveLatestForecastCycle(model, element, level);
      } catch {}
    }
    if (!cycle) {
      const { generateDynamicForecastCycles } = await import("../utils/timelineSync.js");
      cycle = generateDynamicForecastCycles(null, 1)[0];
    }
    file = `${cycle}.${String(period).padStart(3, "0")}`;
  }

  fetchGridBinaryStream(path, file)
    .then((bin) => {
      renderBinaryRaster(map, bin, element, colormap, { layerId, opacity });
      if (layer?.visible !== false) {
        updateLegend(element, colormap, layer?.gridData?.stats?.min, layer?.gridData?.stats?.max, win);
      }
    })
    .catch((err) => {
      console.warn(`[Raster] Binary stream fetch failed for ${path}/${file}, trying JSON gridData:`, err);
      fetchGridData(path, file)
        .then((grid) => {
          if (grid && (grid.values || (grid.u && grid.v))) {
            if (layer) layer.gridData = grid;
            renderGridRaster(map, grid, element, colormap, { layerId, opacity });
            if (layer?.visible !== false) {
              updateLegend(element, colormap, grid.stats?.min, grid.stats?.max, win);
            }
            if (layer) armContourReRender(map, layer, win);
          } else {
            notifyError(`Failed to load raster overlay data for ${element}.`);
          }
        })
        .catch((jsonErr) => {
          console.warn(`[Raster] JSON gridData fetch failed for ${path}/${file}:`, jsonErr);
          notifyError(`Failed to load raster overlay for ${element}: ${jsonErr?.message || jsonErr}`);
        });
    });
}
