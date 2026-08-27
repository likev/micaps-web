// soundingAnalysis.js - In-browser objective analysis & contour calculation from sounding stations
import * as griddata from "griddata";
import { renderCustomContourGeoJSON } from "./contourLayer.js";
import { addOrUpdateLayer } from "../ui/layerControl.js";

export function analyzeAndRenderSoundingContours(map, stationsGeoJSON, level = 500, options = {}) {
  if (!map || !stationsGeoJSON || !stationsGeoJSON.features || stationsGeoJSON.features.length < 3) {
    console.warn("[SoundingAnalysis] Insufficient sounding stations for contour calculation");
    return null;
  }

  // 1. Calculate Geopotential Height Contours from Soundings
  const hgtResult = calculateFieldContours(stationsGeoJSON, (p) => {
    if (typeof p.height === "number" && p.height > 100 && p.height < 30000) return p.height;
    if (typeof p.slp === "number" && p.slp > 2000) return p.slp;
    if (typeof p.slp === "number" && p.slp > 300 && p.slp < 1000) return p.slp * 10;
    const t = typeof p.temperature === "number" ? p.temperature : -15;
    const baseHgt = level === 500 ? 5500 : (level === 700 ? 3000 : (level === 850 ? 1500 : 12000));
    return baseHgt + (t + 15) * 25;
  }, {
    element: "HGT",
    levels: [5480, 5520, 5560, 5600, 5640, 5680, 5720, 5760, 5800, 5840, 5880, 5920, 5960],
  });

  // 2. Calculate Temperature Contours from Soundings
  const tmpResult = calculateFieldContours(stationsGeoJSON, (p) => {
    if (typeof p.temperature === "number" && p.temperature > -90 && p.temperature < 60) {
      return p.temperature;
    }
    return null;
  }, {
    element: "TMP",
  });

  const hgtLayerId = `contour-sounding-hgt-${level}`;
  const tmpLayerId = `contour-sounding-tmp-${level}`;

  // 3. Render Height Contour Lines (classic blue isolines)
  if (hgtResult && hgtResult.lines && hgtResult.lines.length > 0) {
    const hgtFC = { type: "FeatureCollection", features: hgtResult.lines };
    renderCustomContourGeoJSON(map, null, hgtFC, {
      layerId: hgtLayerId,
      showFill: false,
      showLine: true,
      lineColor: options.hgtColor || "#58a6ff",
      lineWidth: 1.5,
    });

    addOrUpdateLayer({
      id: hgtLayerId,
      name: `${level} hPa Height (Sounding Analysis)`,
      type: "contour",
      element: "HGT",
      level,
      color: options.hgtColor || "#58a6ff",
      config: {
        showFill: false,
        showLine: true,
        lineColor: options.hgtColor || "#58a6ff",
        opacity: 0.75,
        lineWidth: 1.5,
      },
    });
  }

  // 4. Render Temperature Contour Lines (classic red isotherms)
  if (tmpResult && tmpResult.lines && tmpResult.lines.length > 0) {
    const tmpFC = { type: "FeatureCollection", features: tmpResult.lines };
    renderCustomContourGeoJSON(map, null, tmpFC, {
      layerId: tmpLayerId,
      showFill: false,
      showLine: true,
      lineColor: options.tmpColor || "#f85149",
      lineWidth: 1.5,
    });

    addOrUpdateLayer({
      id: tmpLayerId,
      name: `${level} hPa Temperature (Sounding Analysis)`,
      type: "contour",
      element: "TMP",
      level,
      color: options.tmpColor || "#f85149",
      config: {
        showFill: false,
        showLine: true,
        lineColor: options.tmpColor || "#f85149",
        opacity: 0.75,
        lineWidth: 1.5,
      },
    });
  }

  return { hgtResult, tmpResult };
}

function calculateFieldContours(stationsGeoJSON, valueExtractor, config = {}) {
  const points = [];
  const values = [];

  for (const f of stationsGeoJSON.features) {
    if (!f.geometry || !f.geometry.coordinates) continue;
    const [lon, lat] = f.geometry.coordinates;
    const val = valueExtractor(f.properties || {});
    if (typeof val === "number" && !isNaN(val)) {
      points.push([lon, lat]);
      values.push(val);
    }
  }

  if (points.length < 3) return null;

  // Grid bounds covering active stations domain
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

  let levels = config.levels;
  if (!levels || !levels.length) {
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    levels = griddata.autoLevels(minV, maxV, 8);
  }

  const lines = griddata.contour({ data: interpolated, rows: y.length, cols: x.length }, { x, y, levels });
  return { lines, levels, pointsCount: points.length };
}
