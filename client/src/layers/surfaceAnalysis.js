// surfaceAnalysis.js - In-browser objective analysis & contour calculation for surface stations
import * as griddata from "griddata";
import { renderCustomContourGeoJSON, isFeatureBold } from "./contourLayer.js";
import { addOrUpdateLayer } from "../ui/layerControl.js";
import { smoothGrid2D } from "../utils/smoothContour.js";

export const SURFACE_CONTOUR_CONFIGS = {
  SLP: {
    name: "Sea Level Pressure",
    element: "SLP",
    unit: "hPa",
    defaultColor: "#58a6ff",
    boldValues: [1000, 1010, 1020],
    extract: (p) => {
      const keys = ["slp", "SLP", "press_slp", "PRS_Sea", "press_stn", "stn_press", "PRS"];
      for (const k of keys) {
        const v = p[k];
        if (typeof v === "number" && !isNaN(v)) {
          let num = v > 8000 ? v / 10.0 : v;
          if (num > 850 && num < 1090) return num;
        }
      }
      return null;
    },
    getLevels: (minV, maxV) => {
      const step = (maxV - minV) > 40 ? 5 : 2.5;
      const levels = [];
      const startP = Math.floor(minV / step) * step;
      for (let p = startP; p <= maxV + step; p += step) {
        levels.push(Math.round(p * 10) / 10);
      }
      return levels;
    },
  },
  TMP: {
    name: "Surface Temperature",
    element: "TMP",
    unit: "°C",
    defaultColor: "#f85149",
    colormap: "TMP",
    boldValues: [0, -20, 20, 30],
    extract: (p) => {
      const keys = ["temperature", "temp", "TEM", "TT", "T", "TMP", "t", "temp_max", "tem"];
      for (const k of keys) {
        const v = p[k];
        if (typeof v === "number" && !isNaN(v) && v > -90 && v < 65) return v;
      }
      return null;
    },
    getLevels: (minV, maxV) => {
      const span = maxV - minV;
      const step = span > 40 ? 4 : (span > 15 ? 2 : 1);
      const levels = [];
      const start = Math.floor(minV / step) * step;
      for (let t = start; t <= maxV + step; t += step) {
        levels.push(Math.round(t * 10) / 10);
      }
      return levels;
    },
  },
  TD: {
    name: "Surface Dew Point",
    element: "TD",
    unit: "°C",
    defaultColor: "#3fb950",
    colormap: "TMP",
    boldValues: [0, 10, 20],
    extract: (p) => {
      const keys = ["dewpoint", "dew_point", "DPT", "TD", "Td", "td", "dew", "dpt"];
      for (const k of keys) {
        const v = p[k];
        if (typeof v === "number" && !isNaN(v) && v > -90 && v < 50) return v;
      }
      return null;
    },
    getLevels: (minV, maxV) => {
      const span = maxV - minV;
      const step = span > 40 ? 4 : (span > 15 ? 2 : 1);
      const levels = [];
      const start = Math.floor(minV / step) * step;
      for (let t = start; t <= maxV + step; t += step) {
        levels.push(Math.round(t * 10) / 10);
      }
      return levels;
    },
  },
  VIS: {
    name: "Surface Visibility",
    element: "VIS",
    unit: "km",
    defaultColor: "#e3b341",
    boldValues: [1, 5, 10],
    extract: (p) => {
      const keys = ["visibility", "VIS", "vis", "VV", "vv", "VIS_Avg", "VIS_Min"];
      for (const k of keys) {
        let v = p[k];
        if (typeof v === "number" && !isNaN(v) && v >= 0) {
          if (v > 150) v = v / 1000.0;
          if (v >= 0.01 && v <= 150) return v;
        }
      }
      return null;
    },
    getLevels: (minV, maxV) => {
      const standardLevels = [0.5, 1, 2, 3, 5, 8, 10, 15, 20, 30, 50];
      const filtered = standardLevels.filter((l) => l >= Math.max(0, minV - 0.5) && l <= maxV + 1);
      return filtered.length >= 2 ? filtered : griddata.autoLevels(minV, maxV, 6);
    },
  },
  RAIN6: {
    name: "6h Precipitation",
    element: "RAIN6",
    unit: "mm",
    defaultColor: "#a371f7",
    colormap: "RAIN",
    boldValues: [10, 25, 50],
    extract: (p) => {
      const keys = ["rain_6h", "RAIN_6H", "rain6h", "PRE_6h", "RAIN_6h", "rain_1h", "rain_24h"];
      for (const k of keys) {
        const v = p[k];
        if (typeof v === "number" && !isNaN(v) && v >= 0 && v <= 1000) return v;
      }
      return null;
    },
    getLevels: (minV, maxV) => {
      const thresholds = [0.1, 1, 5, 10, 25, 50, 100, 150];
      const filtered = thresholds.filter((l) => l <= maxV + 1);
      return filtered.length >= 2 ? filtered : [0.1, 1, 5, 10];
    },
  },
  WIND: {
    name: "Surface Wind Speed",
    element: "WIND",
    unit: "m/s",
    defaultColor: "#388bfd",
    colormap: "WIND",
    boldValues: [8, 12, 16],
    extract: (p) => {
      const keys = ["wind_speed", "windSpeed", "ws", "WIN_S_Avg", "WIN_S", "FF", "ff", "speed"];
      for (const k of keys) {
        let v = p[k];
        if (typeof v === "number" && !isNaN(v) && v >= 0) {
          if (v > 100) v = v / 10.0;
          if (v <= 150) return v;
        }
      }
      return null;
    },
    getLevels: (minV, maxV) => {
      const standard = [2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32];
      const filtered = standard.filter((l) => l <= maxV + 2);
      return filtered.length >= 2 ? filtered : griddata.autoLevels(minV, maxV, 6);
    },
  },
};

function normalizeSurfaceElementKey(elem) {
  const norm = (elem || "").toUpperCase();
  if (norm === "SLP" || norm === "PRESSURE" || norm === "PRS") return "SLP";
  if (norm === "TMP" || norm === "TT" || norm === "TEMPERATURE" || norm === "TEMP") return "TMP";
  if (norm === "TD" || norm === "DPT" || norm === "DEWPOINT" || norm === "DEW_POINT") return "TD";
  if (norm === "VIS" || norm === "VISIBILITY" || norm === "VV") return "VIS";
  if (norm === "RAIN6" || norm === "RAIN6H" || norm === "RAIN_6H" || norm === "RAIN" || norm === "PRECIPITATION") return "RAIN6";
  if (norm === "WIND" || norm === "WS" || norm === "WINDSPEED" || norm === "WIND_SPEED" || norm === "FF") return "WIND";
  return "SLP";
}

export function analyzeAndRenderSurfaceContours(map, stationsGeoJSON, rawElement = "SLP", options = {}, win = null) {
  if (!map || !stationsGeoJSON || !stationsGeoJSON.features || stationsGeoJSON.features.length < 3) {
    console.warn("[SurfaceAnalysis] Insufficient surface stations for contour calculation");
    return null;
  }

  const elementKey = normalizeSurfaceElementKey(rawElement);
  const cfg = SURFACE_CONTOUR_CONFIGS[elementKey] || SURFACE_CONTOUR_CONFIGS.SLP;

  const points = [];
  const values = [];

  for (const f of stationsGeoJSON.features) {
    if (!f.geometry || !f.geometry.coordinates) continue;
    const [lon, lat] = f.geometry.coordinates;
    const val = cfg.extract(f.properties || {});
    if (typeof val === "number" && !isNaN(val)) {
      points.push([lon, lat]);
      values.push(val);
    }
  }

  if (points.length < 3) {
    console.warn(`[SurfaceAnalysis] Fewer than 3 stations have valid ${cfg.name} measurements`);
    return null;
  }

  // Domain bounding box
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

  // Apply 2D spatial smoothing filter to eliminate triangular interpolation facet edges
  interpolated = smoothGrid2D(interpolated, 1, 0.45, y.length, x.length);

  const minV = Math.min(...values);
  const maxV = Math.max(...values);

  const levels = options.levels || cfg.getLevels(minV, maxV);
  const boldValues = options.boldValues || cfg.boldValues || [];

  const lines = griddata.contour({ data: interpolated, rows: y.length, cols: x.length }, { x, y, levels });
  if (Array.isArray(lines)) {
    for (const f of lines) {
      if (!f.properties) f.properties = {};
      const val = f.value ?? f.properties.value ?? f.properties.level ?? 0;
      f.properties.value = val;
      f.properties.label = String(Math.round(val * 10) / 10);
      f.properties.isBold = isFeatureBold(val, boldValues);
    }
  }

  const fills = griddata.contourf({ data: interpolated, rows: y.length, cols: x.length }, { x, y, levels });

  const isolineFC = { type: "FeatureCollection", features: lines || [] };
  const isobandFC = { type: "FeatureCollection", features: fills || [] };

  const layerId = options.layerId || `contour-surface-${elementKey.toLowerCase()}`;
  const lineColor = options.lineColor || cfg.defaultColor;

  renderCustomContourGeoJSON(map, isobandFC, isolineFC, {
    layerId,
    showFill: Boolean(options.showFill),
    showLine: options.showLine !== false,
    visible: options.visible !== false,
    lineColor,
    lineWidth: options.lineWidth || 2.0,
    boldLineWidth: options.boldLineWidth || 4.0,
    boldValues,
    element: cfg.element,
    colormap: cfg.colormap || undefined,
    smooth: options.smooth !== false,
    smoothIterations: options.smoothIterations ?? 2,
  });

  addOrUpdateLayer({
    id: layerId,
    name: `${cfg.name} (Surface Analysis)`,
    type: "contour",
    element: cfg.element,
    model: "SURFACE",
    level: null,
    derivedFrom: options.derivedFrom || "surface-obs",
    visible: options.visible !== false,
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

  return { lines, levels, pointsCount: points.length, element: elementKey, layerId };
}

export function analyzeAndRenderSurfaceSLPContours(map, stationsGeoJSON, options = {}, win = null) {
  return analyzeAndRenderSurfaceContours(map, stationsGeoJSON, "SLP", options, win);
}
