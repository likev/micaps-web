// overlayKinematics.js - Kinematic vorticity/divergence contour and raster overlay triggers
import { renderContourLayers } from "../layers/contourLayer.js";
import { renderGridRaster } from "../layers/rasterLayer.js";
import { updateLegend, removeLegend } from "../ui/legend.js";
import { armContourReRender } from "./contourReRender.js";

export async function triggerVortDivOverlay(map, layer = null, win = null) {
  if (!map || !layer) return;
  const element = (layer.element || "VOR").toUpperCase();
  const model = layer.model || win?.model || "ECMWF_HR";
  const level = layer.level !== undefined && layer.level !== null ? layer.level : (win?.level !== undefined ? win.level : 850);
  const layerId = layer.id || `contour-${model}-${element.toLowerCase()}-${level}`;
  const isVisible = layer.visible !== false;

  let colormap = layer.colormap || layer.render?.colormap || element;
  const palettePath = layer.config?.palettePath || layer.render?.palettePath;
  if (palettePath && (!layer.colormap || !layer.colormap.startsWith("palette:"))) {
    const paletteKey = `palette:${layerId}`;
    try {
      const { loadXMLPalette } = await import("../utils/paletteLoader.js");
      const { setColormaps, COLORMAPS } = await import("../utils/colormaps.js");
      const stops = await loadXMLPalette(palettePath);
      if (stops) {
        setColormaps({ ...COLORMAPS, [paletteKey]: stops });
        layer.colormap = paletteKey;
        colormap = paletteKey;
      }
    } catch {}
  }

  const period = win?.period ?? 24;
  let cycle = win?.forecastCycle || (layer.file ? layer.file.split(".")[0] : null);
  if (!cycle) {
    try {
      const { resolveLatestForecastCycle } = await import("../utils/timelineSync.js");
      cycle = await resolveLatestForecastCycle(model, "WIND", level);
    } catch {}
  }
  const file = cycle ? `${cycle}.${String(period).padStart(3, "0")}` : (layer.file || null);
  if (file && layer.file !== file) {
    layer.file = file;
    layer.gridData = null;
  }

  // 1. Check if layer already has computed kinematic gridData
  if (layer.gridData && layer.gridData.header && layer.gridData.values) {
    renderContourLayers(map, layer.gridData, element, {
      ...layer.config,
      layerId,
      showFill: isVisible && Boolean(layer.config?.showFill),
      showRaster: isVisible && Boolean(layer.config?.showRaster),
      showLine: isVisible && layer.config?.showLine !== false,
      lineColor: layer.config?.lineColor || (element === "VOR" ? "#c678dd" : (element === "DIV" ? "#56d4dd" : "#58a6ff")),
      lineWidth: layer.config?.lineWidth,
      boldValues: layer.config?.boldValues,
      boldLineWidth: layer.config?.boldLineWidth,
      colormap,
      smooth: layer.config?.smooth,
      smoothIterations: layer.config?.smoothIterations,
      labelSize: layer.config?.labelSize,
      viewportBounds: map && typeof map.getBounds === "function" ? map.getBounds().toArray() : null,
    });
    armContourReRender(map, layer, win);
    if (layer.config?.showRaster && isVisible) {
      renderGridRaster(map, layer.gridData, element, colormap, { layerId, opacity: layer.config?.opacity ?? 0.75 });
    }
    const hasShading = isVisible && (Boolean(layer.config?.showFill) || Boolean(layer.config?.showRaster));
    if (hasShading) {
      updateLegend(element, colormap, layer.gridData.stats?.min, layer.gridData.stats?.max, win);
    } else {
      removeLegend(element, win);
    }
    return;
  }

  // 2. Resolve parent wind field via three-tier fallback
  let windGrid = null;
  const cacheKey = file ? `${model}/WIND/${level}/${file}` : null;

  if (cacheKey && win?._windGridCache?.has(cacheKey)) {
    windGrid = win._windGridCache.get(cacheKey);
  } else if (
    win?.windGridData &&
    win.windGridData._file === file &&
    (win.level === level || !level) &&
    win.windGridData.u &&
    win.windGridData.v
  ) {
    windGrid = win.windGridData;
  } else if (file) {
    try {
      const { fetchGridData } = await import("../api/catalogApi.js");
      windGrid = await fetchGridData(`${model}/WIND/${level}`, file);
      if (windGrid) windGrid._file = file;
      if (win && cacheKey) {
        if (!win._windGridCache) win._windGridCache = new Map();
        win._windGridCache.set(cacheKey, windGrid);
      }
    } catch (err) {
      console.warn(`[LayerActions] Failed to fetch wind grid for ${model}/WIND/${level}/${file}:`, err);
      return;
    }
  }

  if (!windGrid || !windGrid.u || !windGrid.v) {
    console.warn(`[LayerActions] No valid wind vectors found for kinematic calculation: ${model}/WIND/${level}`);
    return;
  }

  // 3. Compute kinematic grid
  const { buildKinematicGridData } = await import("../layers/kinematics.js");
  const kinGrid = buildKinematicGridData(element, windGrid.u, windGrid.v, windGrid, {
    smoothOutput: layer.config?.smooth !== false,
    outputSmoothIterations: layer.config?.smoothIterations ?? 1,
  });

  if (!kinGrid) return;
  layer.gridData = kinGrid;

  // 4. Render contour layers
  renderContourLayers(map, kinGrid, element, {
    ...layer.config,
    layerId,
    showFill: isVisible && Boolean(layer.config?.showFill),
    showRaster: isVisible && Boolean(layer.config?.showRaster),
    showLine: isVisible && layer.config?.showLine !== false,
    lineColor: layer.config?.lineColor || (element === "VOR" ? "#c678dd" : (element === "DIV" ? "#56d4dd" : "#58a6ff")),
    lineWidth: layer.config?.lineWidth,
    boldValues: layer.config?.boldValues,
    boldLineWidth: layer.config?.boldLineWidth,
    colormap,
    smooth: layer.config?.smooth,
    smoothIterations: layer.config?.smoothIterations,
    labelSize: layer.config?.labelSize,
    viewportBounds: map && typeof map.getBounds === "function" ? map.getBounds().toArray() : null,
  });
  armContourReRender(map, layer, win);

  if (layer.config?.showRaster && isVisible) {
    renderGridRaster(map, kinGrid, element, colormap, { layerId, opacity: layer.config?.opacity ?? 0.75 });
  }

  const hasShading = isVisible && (Boolean(layer.config?.showFill) || Boolean(layer.config?.showRaster));
  if (hasShading) {
    updateLegend(element, colormap, kinGrid.stats?.min, kinGrid.stats?.max, win);
  } else {
    removeLegend(element, win);
  }
}
