// surfaceAnalysis.js - In-browser objective analysis & contour calculation for surface stations
import * as griddata from "griddata";
import { renderCustomContourGeoJSON, isFeatureBold } from "./contourLayer.js";
import { addOrUpdateLayer } from "../ui/layerControl.js";
import { smoothGrid2D } from "../utils/smoothContour.js";
import { getHexColor } from "../utils/colormaps.js";

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
  DTD: {
    name: "Dew-Point Depression",
    element: "DTD",
    unit: "°C",
    defaultColor: "#e3b341",
    colormap: "DTD",
    boldValues: [2, 10],
    showFill: false,
    showLine: false,
    showRaster: true,
    extract: (p) => {
      const tKeys = ["temperature", "temp", "TEM", "TT", "T", "TMP", "t", "temp_max", "tem"];
      let t = null;
      for (const k of tKeys) {
        const v = p[k];
        if (typeof v === "number" && !isNaN(v) && v > -90 && v < 65) {
          t = v;
          break;
        }
      }
      if (t === null) return null;

      const tdKeys = ["dewpoint", "dew_point", "DPT", "TD", "Td", "td", "dew", "dpt"];
      let td = null;
      for (const k of tdKeys) {
        const v = p[k];
        if (typeof v === "number" && !isNaN(v) && v > -90 && v < 50) {
          td = v;
          break;
        }
      }
      if (td === null) return null;

      if (td > t + 0.5) return null;
      let dtd = t - td;
      if (dtd < 0) dtd = 0;
      if (dtd > 45) return null;
      return dtd;
    },
    getLevels: (minV, maxV) => {
      if (typeof maxV === "number" && maxV < 5) return Array.from(griddata.autoLevels(minV, maxV, 8));
      return [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30];
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
  if (norm === "DTD" || norm === "T-TD" || norm === "TTD" || norm === "DEPRESSION" || norm === "DPTDPR") return "DTD";
  return "SLP";
}

export function analyzeAndRenderSurfaceContours(map, stationsGeoJSON, rawElement = "SLP", options = {}, win = null) {
  if (!map || !stationsGeoJSON || !stationsGeoJSON.features || stationsGeoJSON.features.length < 3) {
    console.warn("[SurfaceAnalysis] Insufficient surface stations for contour calculation");
    return null;
  }

  try {
    const elementKey = normalizeSurfaceElementKey(rawElement);
    const cfg = SURFACE_CONTOUR_CONFIGS[elementKey] || SURFACE_CONTOUR_CONFIGS.SLP;

    const points = [];
    const values = [];

    for (const f of stationsGeoJSON.features) {
      if (!f.geometry || !Array.isArray(f.geometry.coordinates) || f.geometry.coordinates.length < 2) continue;
      const [lon, lat] = f.geometry.coordinates;
      if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      if (lon < -180 || lon > 180 || lat < -90 || lat > 90) continue;
      const val = cfg.extract(f.properties || {});
      if (typeof val === "number" && Number.isFinite(val)) {
        points.push([lon, lat]);
        values.push(val);
      }
    }

    if (points.length < 3) {
      console.warn(`[SurfaceAnalysis] Fewer than 3 stations have valid ${cfg.name} measurements`);
      return null;
    }

    // Domain bounding box
    const stnMinLon = Math.min(...points.map((p) => p[0]));
    const stnMaxLon = Math.max(...points.map((p) => p[0]));
    const stnMinLat = Math.min(...points.map((p) => p[1]));
    const stnMaxLat = Math.max(...points.map((p) => p[1]));

    const padding = 2.5;
    let minLon = Math.floor(stnMinLon - padding);
    let maxLon = Math.ceil(stnMaxLon + padding);
    let minLat = Math.floor(stnMinLat - padding);
    let maxLat = Math.ceil(stnMaxLat + padding);

    // If stations overlap China/East Asia domain [60, 145] and [10, 60],
    // clip to that domain only if the overlap leaves a valid range (min < max).
    // Otherwise, use the station's actual extent bounded to physical Earth limits [-180, 180], [-85, 85].
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

    if (maxLon - minLon < 1.0) {
      maxLon = minLon + 1.0;
    }
    if (maxLat - minLat < 1.0) {
      maxLat = minLat + 1.0;
    }

    const dDeg = 0.5;
    const x = [];
    for (let lon = minLon; lon <= maxLon + 1e-6; lon += dDeg) x.push(Math.round(lon * 100) / 100);
    const y = [];
    for (let lat = minLat; lat <= maxLat + 1e-6; lat += dDeg) y.push(Math.round(lat * 100) / 100);

    if (x.length < 2 || y.length < 2) {
      console.warn(`[SurfaceAnalysis] Grid resolution too small (${x.length}x${y.length}) for ${cfg.name} contour calculation`);
      return null;
    }

    const [X, Y] = griddata.meshgrid(x, y);
    const xi = [X, Y];

    const avgVal = values.reduce((a, b) => a + b, 0) / values.length;
    let interpolated = griddata.griddata(points, values, xi, {
      method: "linear",
      fillValue: avgVal,
    });

    if (!interpolated || interpolated.length < y.length * x.length) {
      console.warn(`[SurfaceAnalysis] Grid interpolation failed for ${cfg.name}`);
      return null;
    }

    // Apply 2D spatial smoothing filter to eliminate triangular interpolation facet edges
    interpolated = smoothGrid2D(interpolated, 1, 0.45, y.length, x.length);

    const minV = Math.min(...values);
    const maxV = Math.max(...values);

    const levels = options.levels || cfg.getLevels(minV, maxV);
    const boldValues = options.boldValues || cfg.boldValues || [];

    let lines = [];
    try {
      lines = griddata.contour({ data: interpolated, rows: y.length, cols: x.length }, { x, y, levels }) || [];
    } catch (err) {
      console.warn(`[SurfaceAnalysis] contour calculation failed for ${cfg.name}:`, err);
      lines = [];
    }

    if (Array.isArray(lines)) {
      for (const f of lines) {
        if (!f.properties) f.properties = {};
        const val = f.value ?? f.properties.value ?? f.properties.level ?? 0;
        f.properties.value = val;
        f.properties.label = String(Math.round(val * 10) / 10);
        f.properties.isBold = isFeatureBold(val, boldValues);
      }
    }

    let fills = [];
    try {
      fills = griddata.contourf({ data: interpolated, rows: y.length, cols: x.length }, { x, y, levels }) || [];
      if (Array.isArray(fills)) {
        for (const feature of fills) {
          if (feature.properties && feature.properties.level) {
            const midVal = (feature.properties.level[0] + feature.properties.level[1]) / 2;
            feature.properties.fillColor = getHexColor(midVal, cfg.element, cfg.colormap);
          }
        }
      }
    } catch (err) {
      console.warn(`[SurfaceAnalysis] contourf calculation failed for ${cfg.name}:`, err);
      fills = [];
    }

    const isolineFC = { type: "FeatureCollection", features: lines || [] };
    const isobandFC = { type: "FeatureCollection", features: fills || [] };

    const layerId = options.layerId || `contour-surface-${elementKey.toLowerCase()}`;
    const lineColor = options.lineColor || cfg.defaultColor;

    const isDTD = elementKey === "DTD";
    const showFill = options.showFill !== undefined ? Boolean(options.showFill) : (cfg.showFill !== undefined ? Boolean(cfg.showFill) : false);
    const showLine = options.showLine !== undefined ? Boolean(options.showLine) : (cfg.showLine !== undefined ? Boolean(cfg.showLine) : (isDTD ? false : true));
    const showRaster = options.showRaster !== undefined ? Boolean(options.showRaster) : (cfg.showRaster !== undefined ? Boolean(cfg.showRaster) : (isDTD ? true : false));
    const palettePath = options.palettePath || cfg.palettePath || null;
    const colormap = options.colormap || (palettePath ? `palette:${layerId}` : (cfg.colormap || cfg.element));

    renderCustomContourGeoJSON(map, isobandFC, isolineFC, {
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
      colormap,
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
    }, win);

    return { lines, levels, pointsCount: points.length, element: elementKey, layerId };
  } catch (err) {
    console.warn(`[SurfaceAnalysis] Failed to analyze surface contours for ${rawElement}:`, err);
    return null;
  }
}

export function analyzeAndRenderSurfaceSLPContours(map, stationsGeoJSON, options = {}, win = null) {
  return analyzeAndRenderSurfaceContours(map, stationsGeoJSON, "SLP", options, win);
}
