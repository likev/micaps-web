// kinematicContours.js - Unified kinematic contour analysis (vorticity and divergence) for surface and sounding
import { generateStationWindGrid } from "./stationWindGrid.js";
import { buildKinematicGridData } from "../kinematics.js";
import { SURFACE_CONTOUR_CONFIGS, normalizeSurfaceElementKey } from "./contourConfigsSurface.js";
import { SOUNDING_CONTOUR_CONFIGS, normalizeSoundingElementKey } from "./contourConfigsSounding.js";
import { tagLinesAndFills, resolveShowFlags, registerContourLayer } from "./objectiveAnalysis.js";
import { resolveRenderLevels } from "../contour/contourLevels.js";
import { clipLineFeatures } from "../../utils/geometry/clip.js";

export function analyzeKinematicContours({
  map,
  stationsGeoJSON,
  rawElement = "VOR",
  level = null,
  options = {},
  win = null,
  isSounding = false,
}) {
  const scopeName = isSounding ? "SoundingAnalysis" : "SurfaceAnalysis";
  if (!map || !stationsGeoJSON || !stationsGeoJSON.features || stationsGeoJSON.features.length < 3) {
    console.warn(`[${scopeName}] Insufficient stations for kinematic contour calculation`);
    return null;
  }

  try {
    const elementKey = isSounding
      ? normalizeSoundingElementKey(rawElement)
      : normalizeSurfaceElementKey(rawElement);

    const cfg = isSounding
      ? (SOUNDING_CONTOUR_CONFIGS[elementKey] || SOUNDING_CONTOUR_CONFIGS.VOR)
      : (SURFACE_CONTOUR_CONFIGS[elementKey] || SURFACE_CONTOUR_CONFIGS.VOR);

    // 1. Generate regular station wind grid
    const windGrid = generateStationWindGrid(stationsGeoJSON, isSounding ? level : null);
    if (!windGrid || !windGrid.u || !windGrid.v || !windGrid.header) {
      console.warn(`[${scopeName}] Fewer than 3 stations have valid wind observations for ${cfg.name}`);
      return null;
    }

    // 2. Compute kinematic grid (VOR or DIV) with pre-smoothing
    const kinData = buildKinematicGridData(elementKey, windGrid.u, windGrid.v, windGrid, {
      smoothInput: true,
      inputSmoothIterations: 1,
      inputSmoothWeight: 0.45,
      smoothOutput: options.smooth !== false,
      outputSmoothIterations: options.smoothIterations ?? 1,
      outputSmoothWeight: 0.4,
    });

    if (!kinData || !kinData.values || kinData.stats.count < 3) {
      console.warn(`[${scopeName}] Insufficient kinematic grid points for ${cfg.name}`);
      return null;
    }

    const { header, values, stats, x, y } = kinData;
    const nCols = x.length;
    const nRows = y.length;

    // Fill NaNs with field average for contour extraction
    const avgVal = stats.mean || 0;
    const filledValues = new Float32Array(values.length);
    for (let i = 0; i < values.length; i++) {
      filledValues[i] = Number.isNaN(values[i]) ? avgVal : values[i];
    }

    const customLevels = resolveRenderLevels(options);
    let levels = customLevels;
    if (!levels) {
      if (typeof cfg.getLevels === "function") {
        levels = cfg.getLevels.length >= 3
          ? cfg.getLevels(level, stats.min, stats.max)
          : cfg.getLevels(stats.min, stats.max);
      }
    }

    let boldValues = options.boldValues;
    if (!boldValues) {
      if (typeof cfg.getBoldValues === "function") {
        boldValues = cfg.getBoldValues(level);
      } else {
        boldValues = cfg.boldValues || [];
      }
    }

    const { lines, fills, levels: actualLevels } = tagLinesAndFills(
      filledValues,
      x,
      y,
      levels,
      cfg.element,
      cfg.colormap,
      boldValues,
      isSounding,
      filledValues,
      Boolean(customLevels)
    );

    const clipBBox = options.clipBounds || [x[0], y[0], x[x.length - 1], y[y.length - 1]];
    const clippedLines = clipLineFeatures(lines, clipBBox);

    const isolineFC = { type: "FeatureCollection", features: clippedLines };
    const isobandFC = { type: "FeatureCollection", features: fills || [] };

    const numLvl = isSounding ? (Number(level) || 500) : null;
    const layerId = options.layerId || (isSounding
      ? `contour-sounding-${elementKey.toLowerCase()}-${numLvl}`
      : `contour-surface-${elementKey.toLowerCase()}`);

    const lineColor = options.lineColor || cfg.defaultColor;
    const { showFill, showLine, showRaster } = resolveShowFlags(options, cfg, elementKey);
    const palettePath = options.palettePath || cfg.palettePath || null;
    const colormap = options.colormap || (palettePath ? `palette:${layerId}` : (cfg.colormap || cfg.element));

    const renderOptions = {
      layerId,
      showFill,
      showLine,
      visible: options.visible !== false,
      lineColor,
      lineWidth: options.lineWidth || 2.0,
      boldLineWidth: options.boldLineWidth || 4.0,
      boldValues,
      element: cfg.element,
      colormap,
      smooth: options.smooth !== false,
      smoothIterations: options.smoothIterations ?? 2,
      labelSize: options.labelSize,
      clipBounds: clipBBox,
    };

    const layerMeta = {
      id: layerId,
      name: isSounding ? `${numLvl} hPa Sounding ${cfg.name}` : `${cfg.name} (Surface Analysis)`,
      type: "contour",
      clipBounds: clipBBox,
      element: cfg.element,
      model: isSounding ? "UPPER_AIR" : "SURFACE",
      level: numLvl,
      derivedFrom: options.derivedFrom || (isSounding ? `upperair-obs-${numLvl}` : "surface-obs"),
      visible: options.visible !== false,
      colormap,
      gridData: {
        header: {
          start_lon: x[0],
          end_lon: x[x.length - 1],
          start_lat: y[0],
          end_lat: y[y.length - 1],
          n_lon: nCols,
          n_lat: nRows,
          d_lon: header.d_lon,
          d_lat: header.d_lat,
        },
        values: filledValues,
        stats,
      },
      color: lineColor,
      removable: true,
      config: {
        showFill,
        showLine,
        showRaster,
        lineColor,
        opacity: options.opacity ?? 0.75,
        lineWidth: options.lineWidth || 2.0,
        boldLineWidth: options.boldLineWidth || 4.0,
        boldValues,
        smooth: options.smooth !== false,
        smoothIterations: options.smoothIterations ?? 2,
        labelSize: options.labelSize,
        palettePath,
      },
    };

    registerContourLayer(map, isobandFC, isolineFC, renderOptions, layerMeta, win);

    return {
      lines,
      levels: actualLevels,
      pointsCount: kinData.stats.count,
      element: elementKey,
      layerId,
      isolineFC,
      isobandFC,
      gridData: layerMeta.gridData,
      stats,
    };
  } catch (err) {
    console.error(`[${scopeName}] Kinematic contour calculation error:`, err);
    return null;
  }
}
