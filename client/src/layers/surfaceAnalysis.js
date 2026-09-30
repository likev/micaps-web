// surfaceAnalysis.js - In-browser objective analysis & contour calculation for surface stations
import {
  SURFACE_CONTOUR_CONFIGS,
  normalizeSurfaceElementKey,
} from "./analysis/contourConfigsSurface.js";
import { clipLineFeatures } from "../utils/geometry/clip.js";
import {
  setLayerIsobandVisibility,
  setLayerIsolineVisibility,
} from "./contourLayer.js";
import { flushContourSource } from "./contour/contourMapSync.js";
import { addOrUpdateLayer } from "../ui/layerControl.js";
import { removeLegend } from "../ui/legend.js";
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
    const parentId = options.derivedFrom;
    const isDefaultParent = !parentId || parentId === "surface-obs" || parentId === "station-surface" || parentId === "surface" || parentId === "default";
    const layerId = options.layerId ||
      (!isDefaultParent
        ? `contour-surface-${elementKey.toLowerCase()}-${parentId}`
        : `contour-surface-${elementKey.toLowerCase()}`);
    const lineColor = options.lineColor || cfg.defaultColor;
    const { showFill, showLine, showRaster } = resolveShowFlags(options, cfg, elementKey);
    const { palettePath, colormap } = resolveContourColormap(options, cfg, layerId);
    const effectiveObsTime = options.obsTime || options.file || win?.obsTime || null;

    if (options.visible === false) {
      const layerMeta = buildContourLayerMeta({
        layerId,
        name: `${cfg.name} (Surface Analysis)`,
        element: cfg.element,
        model: "SURFACE",
        level: null,
        derivedFrom: options.derivedFrom || "surface-obs",
        colormap,
        lineColor,
        gridData: null,
        renderOptions: { ...options, layerId, visible: false },
        showRaster,
        palettePath,
        options: {
          ...options,
          visible: false,
          obsTime: effectiveObsTime,
          file: effectiveObsTime,
        },
      });
      if (map) {
        flushContourSource(map, layerId);
        setLayerIsobandVisibility(map, layerId, false);
        setLayerIsolineVisibility(map, layerId, false);
      }
      removeLegend(cfg.element, win);
      addOrUpdateLayer(layerMeta, win);
      return { lines: [], fills: [], gridData: null };
    }

    const { points, values } = extractPointsAndValues(stationsGeoJSON.features, cfg.extract, null);
    if (points.length < 3) {
      console.warn(`[SurfaceAnalysis] Fewer than 3 stations have valid ${cfg.name} measurements`);
      return null;
    }

    const padding = typeof options.padding === "number" ? options.padding : 1.0;
    const { x, y, dDeg, bounds, rawBounds } = computeDomain(points, padding, 0.5, options.regionBounds || options.clipBounds);
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

    // Clip isolines strictly to the surface station region bounding box
    const clipBBox = options.clipBounds || bounds || [x[0], y[0], x[x.length - 1], y[y.length - 1]];
    const clippedLines = clipLineFeatures(lines, clipBBox);

    const isolineFC = { type: "FeatureCollection", features: clippedLines };
    const isobandFC = { type: "FeatureCollection", features: fills || [] };

    const renderOptions = buildContourRenderOptions({
      layerId, element: cfg.element, colormap, lineColor, boldValues, showFill, showLine,
      options: { ...options, clipBounds: clipBBox },
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
      renderOptions, showRaster, palettePath,
      options: {
        ...options,
        clipBounds: clipBBox,
        bounds: clipBBox,
        obsTime: effectiveObsTime,
        file: effectiveObsTime,
      },
    });

    registerContourLayer(map, isobandFC, isolineFC, renderOptions, layerMeta, win);

    return {
      lines: clippedLines,
      levels: actualLevels,
      pointsCount: points.length,
      element: elementKey,
      layerId,
      bounds: clipBBox,
      rawBounds,
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
