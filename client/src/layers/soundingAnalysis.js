// soundingAnalysis.js - In-browser objective analysis & contour calculation from sounding stations
import * as griddata from "griddata";
import { renderCustomContourGeoJSON } from "./contourLayer.js";
import { addOrUpdateLayer } from "../ui/layerControl.js";

export function analyzeAndRenderSoundingContours(map, stationsGeoJSON, level = 500, options = {}, win = null) {
  if (!map || !stationsGeoJSON || !stationsGeoJSON.features || stationsGeoJSON.features.length < 3) {
    console.warn("[SoundingAnalysis] Insufficient sounding stations for contour calculation");
    return null;
  }

  // 1. Calculate Geopotential Height Contours from Soundings
  const standardHgtLevels = {
    500: [5200, 5240, 5280, 5320, 5360, 5400, 5440, 5480, 5520, 5560, 5600, 5640, 5680, 5720, 5760, 5800, 5840, 5880, 5920, 5960, 6000],
    700: [2800, 2840, 2880, 2920, 2960, 3000, 3040, 3080, 3120, 3160, 3200],
    850: [1320, 1360, 1400, 1440, 1480, 1520, 1560, 1600, 1640],
    200: [11200, 11400, 11600, 11800, 12000, 12200, 12400, 12600],
    300: [8800, 8900, 9000, 9100, 9200, 9300, 9400, 9500, 9600],
  };

  const hgtResult = calculateFieldContours(stationsGeoJSON, (p) => {
    if (typeof p.height === "number" && p.height > 100 && p.height < 35000) return p.height;
    if (typeof p.slp === "number" && p.slp > 2000) return p.slp;
    if (typeof p.slp === "number" && p.slp > 300 && p.slp < 1000) return p.slp * 10;
    return null;
  }, {
    element: "HGT",
    levels: standardHgtLevels[level] || undefined,
  });

  // 2. Calculate Temperature Contours from Soundings (4°C isotherm interval)
  const tmpLevels = [];
  for (let t = -60; t <= 36; t += 4) tmpLevels.push(t);

  const tmpResult = calculateFieldContours(stationsGeoJSON, (p) => {
    if (typeof p.temperature === "number" && p.temperature > -90 && p.temperature < 60) {
      return p.temperature;
    }
    return null;
  }, {
    element: "TMP",
    levels: tmpLevels,
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
      model: "UPPER_AIR",
      level,
      gridData: hgtResult.gridData,
      color: options.hgtColor || "#58a6ff",
      config: {
        showFill: false,
        showLine: true,
        lineColor: options.hgtColor || "#58a6ff",
        opacity: 0.75,
        lineWidth: 1.5,
      },
    }, win);
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
      model: "UPPER_AIR",
      level,
      gridData: tmpResult.gridData,
      color: options.tmpColor || "#f85149",
      config: {
        showFill: false,
        showLine: true,
        lineColor: options.tmpColor || "#f85149",
        opacity: 0.75,
        lineWidth: 1.5,
      },
    }, win);
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
  if (Array.isArray(lines)) {
    for (const f of lines) {
      if (!f.properties) f.properties = {};
      const val = f.value ?? f.properties.value ?? f.properties.level ?? 0;
      f.properties.value = val;
      f.properties.label = String(Math.round(val));
    }
  }
  return {
    lines,
    levels,
    pointsCount: points.length,
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
  };
}
