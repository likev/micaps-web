// surfaceAnalysis.js - In-browser objective analysis & contour calculation for surface stations
import * as griddata from "griddata";
import { renderCustomContourGeoJSON } from "./contourLayer.js";
import { addOrUpdateLayer } from "../ui/layerControl.js";

export function analyzeAndRenderSurfaceSLPContours(map, stationsGeoJSON, options = {}, win = null) {
  if (!map || !stationsGeoJSON || !stationsGeoJSON.features || stationsGeoJSON.features.length < 3) {
    console.warn("[SurfaceAnalysis] Insufficient surface stations for SLP contour calculation");
    return null;
  }

  const points = [];
  const values = [];

  for (const f of stationsGeoJSON.features) {
    if (!f.geometry || !f.geometry.coordinates) continue;
    const [lon, lat] = f.geometry.coordinates;
    const slp = f.properties && f.properties.slp;
    if (typeof slp === "number" && slp > 850 && slp < 1090) {
      points.push([lon, lat]);
      values.push(slp);
    }
  }

  if (points.length < 3) {
    console.warn("[SurfaceAnalysis] Fewer than 3 stations have valid SLP measurements");
    return null;
  }

  // Domain bounding box
  const minLon = Math.max(60, Math.min(...points.map((p) => p[0])) - 2.5);
  const maxLon = Math.min(145, Math.max(...points.map((p) => p[0])) + 2.5);
  const minLat = Math.max(10, Math.min(...points.map((p) => p[1])) - 2.5);
  const maxLat = Math.min(60, Math.max(...points.map((p) => p[1])) + 2.5);

  const dDeg = 1.0;
  const x = [];
  for (let lon = minLon; lon <= maxLon; lon += dDeg) x.push(lon);
  const y = [];
  for (let lat = minLat; lat <= maxLat; lat += dDeg) y.push(lat);

  const [X, Y] = griddata.meshgrid(x, y);
  const xi = [X, Y];

  const avgVal = values.reduce((a, b) => a + b, 0) / values.length;
  const interpolated = griddata.griddata(points, values, xi, {
    method: "linear",
    fillValue: avgVal,
  });

  const minV = Math.min(...values);
  const maxV = Math.max(...values);

  // Standard synoptic isobar interval (every 2.5 or 4 hPa)
  const step = (maxV - minV) > 40 ? 5 : 2.5;
  const levels = [];
  const startP = Math.floor(minV / step) * step;
  for (let p = startP; p <= maxV + step; p += step) {
    levels.push(Math.round(p * 10) / 10);
  }

  const lines = griddata.contour({ data: interpolated, rows: y.length, cols: x.length }, { x, y, levels });
  if (Array.isArray(lines)) {
    for (const f of lines) {
      if (!f.properties) f.properties = {};
      const val = f.value ?? f.properties.value ?? f.properties.level ?? 0;
      f.properties.value = val;
      f.properties.label = String(Math.round(val));
    }
  }
  const fills = griddata.contourf({ data: interpolated, rows: y.length, cols: x.length }, { x, y, levels });

  const isolineFC = { type: "FeatureCollection", features: lines };
  const isobandFC = { type: "FeatureCollection", features: fills };

  const layerId = "contour-surface-slp";
  const lineColor = options.lineColor || "#388bfd";

  renderCustomContourGeoJSON(map, isobandFC, isolineFC, {
    layerId,
    showFill: false,
    showLine: true,
    lineColor,
    lineWidth: 1.5,
    element: "SLP",
  });

  addOrUpdateLayer({
    id: layerId,
    name: "Sea Level Pressure (Surface Analysis)",
    type: "contour",
    element: "SLP",
    model: "SURFACE",
    level: null,
    gridData: {
      header: {
        start_lon: minLon,
        end_lon: maxLon,
        start_lat: minLat,
        end_lat: maxLat,
        n_lon: x.length,
        n_lat: y.length,
        d_lon: dDeg,
        d_lat: dDeg,
      },
      values: interpolated,
    },
    color: lineColor,
    config: {
      showFill: false,
      showLine: true,
      lineColor,
      opacity: 0.75,
      lineWidth: 1.5,
    },
  }, win);

  return { lines, levels, pointsCount: points.length };
}
