// soundingAnalysis.js - In-browser objective analysis & contour calculation from sounding stations
import * as griddata from "griddata";
import { renderCustomContourGeoJSON, isFeatureBold } from "./contourLayer.js";
import { addOrUpdateLayer } from "../ui/layerControl.js";
import { formatContourLabel } from "../utils/formatters.js";
import { generateStationWindGrid } from "./analysis/stationWindGrid.js";
import {
  standardHgtLevels,
  boldMapHgt,
  HGT_QC_BOUNDS,
  TMP_QC_BOUNDS,
  WIND_QC_BOUNDS,
} from "./analysis/qcBounds.js";
import {
  SOUNDING_CONTOUR_CONFIGS,
  normalizeSoundingElementKey,
} from "./analysis/contourConfigsSounding.js";
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

export {
  standardHgtLevels,
  boldMapHgt,
  HGT_QC_BOUNDS,
  TMP_QC_BOUNDS,
  WIND_QC_BOUNDS,
  SOUNDING_CONTOUR_CONFIGS,
  generateStationWindGrid,
};

export function calculateFieldContours(stationsGeoJSON, valueExtractor, config = {}, level = 500) {
  if (!stationsGeoJSON || !stationsGeoJSON.features) return null;
  const { points, values } = extractPointsAndValues(stationsGeoJSON.features, valueExtractor, level);
  if (points.length < 3) return null;

  const { x, y, dDeg } = computeDomain(points, 2.5, 0.5);
  if (x.length < 2 || y.length < 2) return null;

  const interpolated = interpolateAndSmoothGrid(points, values, x, y, 1, 0.45);
  if (!interpolated) {
    console.warn(`[SoundingAnalysis] Grid interpolation failed for ${config.element || "contour"}`);
    return null;
  }

  const { minV, maxV } = computeValueRange(values);

  let levels = config.levels;
  if (!levels || !levels.length) {
    levels = griddata.autoLevels(minV, maxV, 8);
  }

  const isCustomLevels = config.isCustomLevels !== undefined ? Boolean(config.isCustomLevels) : false;

  const { lines, fills, levels: actualLevels } = tagLinesAndFills(
    interpolated,
    x,
    y,
    levels,
    config.element,
    config.colormap,
    [],
    true,
    values,
    isCustomLevels
  );

  return {
    lines,
    fills,
    levels: actualLevels,
    pointsCount: points.length,
    element: config.element,
    gridData: {
      header: {
        start_lon: x[0],
        end_lon: x[x.length - 1],
        start_lat: y[0],
        end_lat: y[y.length - 1],
        n_lon: x.length,
        n_lat: y.length,
        d_lon: dDeg,
        d_lat: dDeg,
      },
      values: interpolated,
    },
  };
}

export function analyzeAndRenderSoundingElementContour(map, stationsGeoJSON, level = 500, rawElement = "HGT", options = {}, win = null) {
  if (!map || !stationsGeoJSON || !stationsGeoJSON.features || stationsGeoJSON.features.length < 3) {
    console.warn("[SoundingAnalysis] Insufficient sounding stations for contour calculation");
    return null;
  }

  const elementKey = normalizeSoundingElementKey(rawElement);
  if (elementKey === "VOR" || elementKey === "DIV") {
    return analyzeAndRenderSoundingKinematicContour(map, stationsGeoJSON, level, elementKey, options, win);
  }

  try {
    const numLevel = parseInt(level, 10) || 500;
    const cfg = SOUNDING_CONTOUR_CONFIGS[elementKey] || SOUNDING_CONTOUR_CONFIGS.HGT;

    const isCustomLevels = Boolean(resolveRenderLevels(options));
    const result = calculateFieldContours(stationsGeoJSON, cfg.extract, {
      element: cfg.element,
      colormap: cfg.colormap || undefined,
      levels: isCustomLevels ? resolveRenderLevels(options) : cfg.getLevels(numLevel, -100, 100000),
      isCustomLevels,
    }, numLevel);

    if (!result || !result.lines || result.lines.length === 0) {
      console.warn(`[SoundingAnalysis] No contour lines generated for ${elementKey}`);
      return null;
    }

    const boldValues = options.boldValues || cfg.getBoldValues(level) || [];
    for (const f of result.lines) {
      const val = f.value ?? f.properties?.value ?? 0;
      f.properties.isBold = isFeatureBold(val, boldValues);
      f.properties.label = formatContourLabel(val, elementKey);
    }

    const layerId = options.layerId || `contour-sounding-${elementKey.toLowerCase()}-${level}`;
    const lineColor = options.lineColor || cfg.defaultColor;

    const { showFill, showLine, showRaster } = resolveShowFlags(options, cfg, elementKey);
    const { palettePath, colormap } = resolveContourColormap(options, cfg, layerId);

    const isolineFC = { type: "FeatureCollection", features: result.lines };
    const isobandFC = result.fills ? { type: "FeatureCollection", features: result.fills } : null;

    const renderOptions = buildContourRenderOptions({
      layerId, element: cfg.element, colormap, lineColor, boldValues, showFill, showLine, options,
    });

    const layerMeta = buildContourLayerMeta({
      layerId,
      name: `${level} hPa ${cfg.name} (Sounding Analysis)`,
      element: cfg.element,
      model: "UPPER_AIR",
      level,
      derivedFrom: options.derivedFrom || `upperair-obs-${level}`,
      colormap,
      lineColor,
      gridData: result.gridData,
      renderOptions, showRaster, palettePath, options,
    });

    registerContourLayer(map, isobandFC, isolineFC, renderOptions, layerMeta, win);

    return result;
  } catch (err) {
    console.warn(`[SoundingAnalysis] Failed to analyze sounding contour for ${rawElement}:`, err);
    return null;
  }
}

export function analyzeAndRenderSoundingContours(map, stationsGeoJSON, level = 500, options = {}, win = null) {
  const hgtResult = analyzeAndRenderSoundingElementContour(map, stationsGeoJSON, level, "HGT", {
    lineColor: options.hgtColor || "#58a6ff",
    ...options,
  }, win);

  const tmpResult = analyzeAndRenderSoundingElementContour(map, stationsGeoJSON, level, "TMP", {
    lineColor: options.tmpColor || "#f85149",
    ...options,
  }, win);

  return { hgtResult, tmpResult };
}

export function analyzeAndRenderSoundingKinematicContour(map, stationsGeoJSON, level = 500, rawElement = "VOR", options = {}, win = null) {
  return analyzeKinematicContours({
    map,
    stationsGeoJSON,
    rawElement,
    level,
    options,
    win,
    isSounding: true,
  });
}
