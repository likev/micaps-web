// objectiveAnalysis.js - Shared objective analysis, 2D mesh interpolation, and contour generation
import * as griddata from "griddata";
import { renderCustomContourGeoJSON, isFeatureBold } from "../contourLayer.js";
import { addOrUpdateLayer } from "../../ui/layerControl.js";
import { smoothGrid2D } from "../../utils/smoothContour.js";
import { getHexColor } from "../../utils/colormaps.js";
import { formatContourLabel } from "../../utils/formatters.js";
import { clipLevelsToRange } from "../contour/contourLevels.js";

export function extractPointsAndValues(features, extractFn, level = null) {
  const points = [];
  const values = [];

  for (const f of features) {
    if (!f.geometry || !Array.isArray(f.geometry.coordinates) || f.geometry.coordinates.length < 2) continue;
    const [lon, lat] = f.geometry.coordinates;
    if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) continue;

    const val = extractFn(f.properties || {}, level);
    if (typeof val === "number" && Number.isFinite(val)) {
      points.push([lon, lat]);
      values.push(val);
    }
  }

  return { points, values };
}

export function computeDomain(points, padding = 2.5, dDeg = 0.5, regionBounds = null) {
  let stnMinLon = Infinity, stnMaxLon = -Infinity;
  let stnMinLat = Infinity, stnMaxLat = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p[0] < stnMinLon) stnMinLon = p[0];
    if (p[0] > stnMaxLon) stnMaxLon = p[0];
    if (p[1] < stnMinLat) stnMinLat = p[1];
    if (p[1] > stnMaxLat) stnMaxLat = p[1];
  }

  let minLon = Math.floor(stnMinLon - padding);
  let maxLon = Math.ceil(stnMaxLon + padding);
  let minLat = Math.floor(stnMinLat - padding);
  let maxLat = Math.ceil(stnMaxLat + padding);

  if (regionBounds && Array.isArray(regionBounds) && regionBounds.length >= 4) {
    minLon = Math.max(regionBounds[0], minLon);
    minLat = Math.max(regionBounds[1], minLat);
    maxLon = Math.min(regionBounds[2], maxLon);
    maxLat = Math.min(regionBounds[3], maxLat);
  } else {
    if (minLon < 145 && maxLon > 60) {
      minLon = Math.max(60, minLon);
      maxLon = Math.min(145, maxLon);
    } else {
      minLon = Math.max(-180, minLon);
      maxLon = Math.min(180, maxLon);
    }

    if (minLat < 60 && maxLat > 10) {
      minLat = Math.max(10, minLat);
      maxLat = Math.min(60, maxLat);
    } else {
      minLat = Math.max(-85, minLat);
      maxLat = Math.min(85, maxLat);
    }
  }

  if (maxLon - minLon < 1.0) maxLon = minLon + 1.0;
  if (maxLat - minLat < 1.0) maxLat = minLat + 1.0;

  const x = [];
  for (let lon = minLon; lon <= maxLon + 1e-6; lon += dDeg) x.push(Math.round(lon * 100) / 100);
  const y = [];
  for (let lat = minLat; lat <= maxLat + 1e-6; lat += dDeg) y.push(Math.round(lat * 100) / 100);

  return {
    x,
    y,
    minLon,
    maxLon,
    minLat,
    maxLat,
    dDeg,
    bounds: [minLon, minLat, maxLon, maxLat],
    rawBounds: [stnMinLon, stnMinLat, stnMaxLon, stnMaxLat],
  };
}

export function interpolateAndSmoothGrid(points, values, x, y, smoothIterations = 1, smoothWeight = 0.45) {
  const [X, Y] = griddata.meshgrid(x, y);
  const xi = [X, Y];
  const avgVal = values.reduce((a, b) => a + b, 0) / values.length;

  let interpolated = griddata.griddata(points, values, xi, {
    method: "linear",
    fillValue: avgVal,
  });

  if (!interpolated || interpolated.length < y.length * x.length) {
    return null;
  }

  return smoothGrid2D(interpolated, smoothIterations, smoothWeight, y.length, x.length);
}

export function tagLinesAndFills(interpolated, x, y, levels, element, colormap, boldValues = [], isSounding = false, values = null, isCustomLevels = false) {
  let lines = [];
  let actualLevels = levels;
  // Custom interval levels may extend beyond the observed data range.
  // Clip to the in-range subset up front so contouring runs on levels that
  // can actually produce isolines (e.g. Start 5000/End 6000/Span 100 on a
  // 5400-5600 field contours [5400, 5500, 5600]). Never auto-fallback below.
  if (isSounding && isCustomLevels && Array.isArray(levels) && levels.length >= 2 && values && values.length > 0) {
    let minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < values.length; i++) {
      if (values[i] < minV) minV = values[i];
      if (values[i] > maxV) maxV = values[i];
    }
    if (maxV > minV) {
      const clipped = clipLevelsToRange(levels, minV, maxV);
      if (clipped.length >= 1) {
        actualLevels = clipped;
      }
    }
  }
  try {
    lines = griddata.contour({ data: interpolated, rows: y.length, cols: x.length }, { x, y, levels: actualLevels }) || [];
    if (isSounding && !isCustomLevels && (!lines || lines.length === 0) && values && values.length > 0) {
      let minV = Infinity, maxV = -Infinity;
      for (let i = 0; i < values.length; i++) {
        if (values[i] < minV) minV = values[i];
        if (values[i] > maxV) maxV = values[i];
      }
      if (maxV > minV) {
        const fallback = griddata.autoLevels(minV, maxV, 8);
        const fallbackLines = griddata.contour({ data: interpolated, rows: y.length, cols: x.length }, { x, y, levels: fallback });
        if (fallbackLines && fallbackLines.length > 0) {
          lines = fallbackLines;
          actualLevels = fallback;
        }
      }
    }
  } catch (err) {
    console.warn(`[ObjectiveAnalysis] contour calculation failed for ${element}:`, err);
    lines = [];
  }

  if (Array.isArray(lines)) {
    for (const f of lines) {
      if (!f.properties) f.properties = {};
      const val = f.value ?? f.properties.value ?? f.properties.level ?? 0;
      f.properties.value = val;
      f.properties.label = isSounding
        ? formatContourLabel(val, element)
        : String(Math.round(val * 10) / 10);
      f.properties.isBold = isFeatureBold(val, boldValues);
    }
  }

  let fills = [];
  try {
    fills = griddata.contourf({ data: interpolated, rows: y.length, cols: x.length }, { x, y, levels: actualLevels }) || [];
    if (Array.isArray(fills)) {
      for (const feature of fills) {
        if (feature.properties && feature.properties.level) {
          const midVal = (feature.properties.level[0] + feature.properties.level[1]) / 2;
          feature.properties.fillColor = getHexColor(midVal, element, colormap);
        }
      }
    }
  } catch (err) {
    console.warn(`[ObjectiveAnalysis] contourf calculation failed for ${element}:`, err);
    fills = [];
  }

  return { lines, fills, levels: actualLevels };
}

export function resolveShowFlags(options, cfg, elementKey) {
  const isDTD = elementKey === "DTD";
  const showFill = options.showFill !== undefined
    ? Boolean(options.showFill)
    : (cfg.showFill !== undefined ? Boolean(cfg.showFill) : false);
  const showLine = options.showLine !== undefined
    ? Boolean(options.showLine)
    : (cfg.showLine !== undefined ? Boolean(cfg.showLine) : (isDTD ? false : true));
  const showRaster = options.showRaster !== undefined
    ? Boolean(options.showRaster)
    : (cfg.showRaster !== undefined ? Boolean(cfg.showRaster) : (isDTD ? true : false));

  return { showFill, showLine, showRaster };
}

export function registerContourLayer(map, isobandFC, isolineFC, renderOptions, layerMeta, win = null) {
  renderCustomContourGeoJSON(map, isobandFC, isolineFC, renderOptions);
  addOrUpdateLayer(layerMeta, win);
}

export function computeValueRange(values) {
  let minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (values[i] < minV) minV = values[i];
    if (values[i] > maxV) maxV = values[i];
  }
  return { minV, maxV };
}

export function resolveContourColormap(options, cfg, layerId) {
  const palettePath = options.palettePath || cfg.palettePath || null;
  const colormap = options.colormap || (palettePath ? `palette:${layerId}` : (cfg.colormap || cfg.element));
  return { palettePath, colormap };
}

export function buildContourRenderOptions({ layerId, element, colormap, lineColor, boldValues, showFill, showLine, options = {} }) {
  return {
    layerId,
    showFill,
    showLine,
    visible: options.visible !== false,
    lineColor,
    lineWidth: options.lineWidth || 2.0,
    boldLineWidth: options.boldLineWidth || 4.0,
    boldValues,
    element,
    colormap,
    smooth: options.smooth !== false,
    smoothIterations: options.smoothIterations ?? 2,
    labelSize: options.labelSize,
    interval: options.interval || null,
    levels: options.levels || null,
  };
}

export function buildContourLayerMeta({ layerId, name, element, model, level, derivedFrom, colormap, lineColor, x, y, dDeg, interpolated, gridData = null, renderOptions, showRaster, palettePath, options = {} }) {
  return {
    id: layerId,
    name,
    type: "contour",
    element,
    model,
    level,
    derivedFrom,
    visible: options.visible !== false,
    colormap,
    gridData: gridData || {
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
    color: lineColor,
    removable: true,
    config: {
      ...renderOptions,
      showRaster,
      palettePath,
      lineColor,
      opacity: options.opacity ?? 0.75,
    },
  };
}
