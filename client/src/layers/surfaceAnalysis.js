// surfaceAnalysis.js - In-browser objective analysis & contour calculation for surface stations
import {
  SURFACE_CONTOUR_CONFIGS,
  normalizeSurfaceElementKey,
} from "./analysis/contourConfigsSurface.js";
import {
  extractPointsAndValues,
  computeDomain,
  interpolateAndSmoothGrid,
  tagLinesAndFills,
  resolveShowFlags,
  registerContourLayer,
  computeValueRange,
  resolveContourColormap,
  buildContourRenderOptions,
  buildContourLayerMeta,
} from "./analysis/objectiveAnalysis.js";
import { analyzeKinematicContours } from "./analysis/kinematicContours.js";
import { resolveRenderLevels } from "./contour/contourLevels.js";

export { SURFACE_CONTOUR_CONFIGS };

export function analyzeAndRenderSurfaceContours(map, stationsGeoJSON, rawElement = "SLP", options = {}, win = null) {
  if (!map || !stationsGeoJSON || !stationsGeoJSON.features || stationsGeoJSON.features.length < 3) {
    console.warn("[SurfaceAnalysis] Insufficient surface stations for contour calculation");
    return null;
  }

  const elementKey = normalizeSurfaceElementKey(rawElement);
  if (elementKey === "VOR" || elementKey === "DIV") {
    return analyzeAndRenderSurfaceKinematicContours(map, stationsGeoJSON, elementKey, options, win);
  }

  try {
    const cfg = SURFACE_CONTOUR_CONFIGS[elementKey] || SURFACE_CONTOUR_CONFIGS.SLP;

    const { points, values } = extractPointsAndValues(stationsGeoJSON.features, cfg.extract, null);
    if (points.length < 3) {
      console.warn(`[SurfaceAnalysis] Fewer than 3 stations have valid ${cfg.name} measurements`);
      return null;
    }

    const { x, y, dDeg } = computeDomain(points, 2.5, 0.5);
    if (x.length < 2 || y.length < 2) {
      console.warn(`[SurfaceAnalysis] Grid resolution too small (${x.length}x${y.length}) for ${cfg.name} contour calculation`);
      return null;
    }

    const interpolated = interpolateAndSmoothGrid(points, values, x, y, 1, 0.45);
    if (!interpolated) {
      console.warn(`[SurfaceAnalysis] Grid interpolation failed for ${cfg.name}`);
      return null;
    }

    const { minV, maxV } = computeValueRange(values);
    const customLevels = resolveRenderLevels(options);
    const levels = customLevels || cfg.getLevels(minV, maxV);
    const boldValues = options.boldValues || cfg.boldValues || [];

    const { lines, fills, levels: actualLevels } = tagLinesAndFills(
      interpolated,
      x,
      y,
      levels,
      cfg.element,
      cfg.colormap,
      boldValues,
      false,
      values,
      Boolean(customLevels)
    );

    const isolineFC = { type: "FeatureCollection", features: lines || [] };
    const isobandFC = { type: "FeatureCollection", features: fills || [] };

    const layerId = options.layerId || `contour-surface-${elementKey.toLowerCase()}`;
    const lineColor = options.lineColor || cfg.defaultColor;

    const { showFill, showLine, showRaster } = resolveShowFlags(options, cfg, elementKey);
    const { palettePath, colormap } = resolveContourColormap(options, cfg, layerId);

    const renderOptions = buildContourRenderOptions({
      layerId, element: cfg.element, colormap, lineColor, boldValues, showFill, showLine, options,
    });

    const layerMeta = buildContourLayerMeta({
      layerId,
      name: `${cfg.name} (Surface Analysis)`,
      element: cfg.element,
      model: "SURFACE",
      level: null,
      derivedFrom: options.derivedFrom || "surface-obs",
      colormap,
      lineColor,
      x, y, dDeg, interpolated,
      renderOptions, showRaster, palettePath, options,
    });

    registerContourLayer(map, isobandFC, isolineFC, renderOptions, layerMeta, win);

    return {
      lines,
      levels: actualLevels,
      pointsCount: points.length,
      element: elementKey,
      layerId,
      isolineFC,
      isobandFC,
      gridData: layerMeta.gridData,
    };
  } catch (err) {
    console.error(`[SurfaceAnalysis] Contour calculation error for ${rawElement}:`, err);
    return null;
  }
}

export function analyzeAndRenderSurfaceSLPContours(map, stationsGeoJSON, options = {}, win = null) {
  return analyzeAndRenderSurfaceContours(map, stationsGeoJSON, "SLP", options, win);
}

export function analyzeAndRenderSurfaceKinematicContours(map, stationsGeoJSON, rawElement = "VOR", options = {}, win = null) {
  return analyzeKinematicContours({
    map,
    stationsGeoJSON,
    rawElement,
    level: null,
    options,
    win,
    isSounding: false,
  });
}
