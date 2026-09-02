// soundingAnalysis.js - In-browser objective analysis & contour calculation from sounding stations
import * as griddata from "griddata";
import { renderCustomContourGeoJSON, isFeatureBold } from "./contourLayer.js";
import { addOrUpdateLayer } from "../ui/layerControl.js";
import { smoothGrid2D } from "../utils/smoothContour.js";

const standardHgtLevels = {
  1000: [0, 40, 80, 120, 160, 200, 240, 280],
  925: [640, 680, 720, 760, 800, 840, 880, 920, 960],
  850: [1320, 1360, 1400, 1440, 1480, 1520, 1560, 1600, 1640],
  700: [2800, 2840, 2880, 2920, 2960, 3000, 3040, 3080, 3120, 3160, 3200],
  500: [5200, 5240, 5280, 5320, 5360, 5400, 5440, 5480, 5520, 5560, 5600, 5640, 5680, 5720, 5760, 5800, 5840, 5880, 5920, 5960, 6000],
  400: [6800, 6880, 6960, 7040, 7120, 7200, 7280, 7360, 7440, 7520, 7600],
  300: [8800, 8900, 9000, 9100, 9200, 9300, 9400, 9500, 9600],
  250: [9800, 10000, 10200, 10400, 10600, 10800, 11000, 11200],
  200: [11200, 11400, 11600, 11800, 12000, 12200, 12400, 12600],
  150: [13200, 13400, 13600, 13800, 14000, 14200, 14400],
  100: [15600, 15800, 16000, 16200, 16400, 16600, 16800, 17000],
  70: [17800, 18000, 18200, 18400, 18600, 18800, 19000],
  50: [20000, 20200, 20400, 20600, 20800, 21000, 21200],
  30: [23200, 23400, 23600, 23800, 24000, 24200],
  10: [30000, 30400, 30800, 31200, 31600, 32000],
};

const boldMapHgt = {
  500: [5880, 588],
  700: [3120, 312],
  850: [1520, 152],
  925: [800, 80],
  1000: [120, 12],
  400: [7200, 720],
  300: [9600, 960],
  200: [12000, 1200],
  100: [16600, 1660],
};

export const SOUNDING_CONTOUR_CONFIGS = {
  HGT: {
    name: "Height",
    element: "HGT",
    unit: "gpm",
    defaultColor: "#58a6ff",
    extract: (p) => {
      if (typeof p.height === "number" && !isNaN(p.height) && p.height > -200 && p.height < 45000) return p.height;
      if (typeof p.slp === "number" && p.slp > 2000) return p.slp;
      if (typeof p.slp === "number" && p.slp > 300 && p.slp < 1000) return p.slp * 10;
      return null;
    },
    getLevels: (level, minV, maxV) => standardHgtLevels[level] || griddata.autoLevels(minV, maxV, 8),
    getBoldValues: (level) => boldMapHgt[level] || [],
  },
  TMP: {
    name: "Temperature",
    element: "TMP",
    unit: "°C",
    defaultColor: "#f85149",
    colormap: "TMP",
    extract: (p) => {
      if (typeof p.temperature === "number" && !isNaN(p.temperature) && p.temperature > -90 && p.temperature < 60) {
        return p.temperature;
      }
      return null;
    },
    getLevels: () => {
      const lvls = [];
      for (let t = -60; t <= 36; t += 4) lvls.push(t);
      return lvls;
    },
    getBoldValues: () => [0, -20],
  },
  TD: {
    name: "Dew Point",
    element: "TD",
    unit: "°C",
    defaultColor: "#3fb950",
    colormap: "TMP",
    extract: (p) => {
      if (typeof p.dewpoint === "number" && !isNaN(p.dewpoint) && p.dewpoint > -90 && p.dewpoint < 50) {
        return p.dewpoint;
      }
      return null;
    },
    getLevels: () => {
      const lvls = [];
      for (let t = -60; t <= 36; t += 4) lvls.push(t);
      return lvls;
    },
    getBoldValues: () => [0, -20],
  },
  WIND: {
    name: "Wind Speed",
    element: "WIND",
    unit: "m/s",
    defaultColor: "#388bfd",
    colormap: "WIND",
    extract: (p) => {
      if (typeof p.wind_speed === "number" && !isNaN(p.wind_speed) && p.wind_speed >= 0 && p.wind_speed <= 200) {
        return p.wind_speed > 100 ? p.wind_speed / 10.0 : p.wind_speed;
      }
      return null;
    },
    getLevels: (level, minV, maxV) => {
      const standard = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 56];
      const filtered = standard.filter((l) => l <= maxV + 2);
      return filtered.length >= 2 ? filtered : griddata.autoLevels(minV, maxV, 6);
    },
    getBoldValues: () => [20, 30, 40],
  },
};

function normalizeSoundingElementKey(elem) {
  const norm = (elem || "").toUpperCase();
  if (norm === "HGT" || norm === "HEIGHT" || norm === "GH" || norm === "GEO" || norm === "H") return "HGT";
  if (norm === "TMP" || norm === "TT" || norm === "TEMPERATURE" || norm === "TEMP" || norm === "T") return "TMP";
  if (norm === "TD" || norm === "DPT" || norm === "DEWPOINT" || norm === "DEW_POINT") return "TD";
  if (norm === "WIND" || norm === "WS" || norm === "WINDSPEED" || norm === "WIND_SPEED" || norm === "FF") return "WIND";
  return "HGT";
}

export function analyzeAndRenderSoundingElementContour(map, stationsGeoJSON, level = 500, rawElement = "HGT", options = {}, win = null) {
  if (!map || !stationsGeoJSON || !stationsGeoJSON.features || stationsGeoJSON.features.length < 3) {
    console.warn("[SoundingAnalysis] Insufficient sounding stations for contour calculation");
    return null;
  }

  const elementKey = normalizeSoundingElementKey(rawElement);
  const cfg = SOUNDING_CONTOUR_CONFIGS[elementKey] || SOUNDING_CONTOUR_CONFIGS.HGT;

  const result = calculateFieldContours(stationsGeoJSON, cfg.extract, {
    element: cfg.element,
    levels: options.levels || cfg.getLevels(level, -100, 100000),
  });

  if (!result || !result.lines || result.lines.length === 0) {
    console.warn(`[SoundingAnalysis] No contour lines generated for ${elementKey}`);
    return null;
  }

  const boldValues = options.boldValues || cfg.getBoldValues(level) || [];
  for (const f of result.lines) {
    const val = f.value ?? f.properties?.value ?? 0;
    f.properties.isBold = isFeatureBold(val, boldValues);
  }

  const layerId = options.layerId || `contour-sounding-${elementKey.toLowerCase()}-${level}`;
  const lineColor = options.lineColor || cfg.defaultColor;

  const isolineFC = { type: "FeatureCollection", features: result.lines };
  renderCustomContourGeoJSON(map, null, isolineFC, {
    layerId,
    showFill: Boolean(options.showFill),
    showLine: options.showLine !== false,
    lineColor,
    lineWidth: options.lineWidth || 2.0,
    boldLineWidth: options.boldLineWidth || 4.0,
    boldValues,
    element: cfg.element,
    smooth: options.smooth !== false,
    smoothIterations: options.smoothIterations ?? 2,
  });

  addOrUpdateLayer({
    id: layerId,
    name: `${level} hPa ${cfg.name} (Sounding Analysis)`,
    type: "contour",
    element: cfg.element,
    model: "UPPER_AIR",
    level,
    gridData: result.gridData,
    color: lineColor,
    removable: true,
    config: {
      showFill: Boolean(options.showFill),
      showLine: options.showLine !== false,
      lineColor,
      opacity: options.opacity ?? 0.75,
      lineWidth: options.lineWidth || 2.0,
      boldLineWidth: options.boldLineWidth || 4.0,
      boldValues,
      smooth: options.smooth !== false,
      smoothIterations: options.smoothIterations ?? 2,
    },
  }, win);

  return result;
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

  const dDeg = 0.5;
  const x = [];
  for (let lon = minLon; lon <= maxLon; lon += dDeg) x.push(lon);
  const y = [];
  for (let lat = minLat; lat <= maxLat; lat += dDeg) y.push(lat);

  const [X, Y] = griddata.meshgrid(x, y);
  const xi = [X, Y];

  const avgVal = values.reduce((a, b) => a + b, 0) / values.length;
  let interpolated = griddata.griddata(points, values, xi, {
    method: "linear",
    fillValue: avgVal,
  });

  // Apply 2D spatial smoothing filter to reduce interpolation mesh facets
  interpolated = smoothGrid2D(interpolated, 1, 0.45, y.length, x.length);

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
