// soundingAnalysis.js - In-browser objective analysis & contour calculation from sounding stations
import * as griddata from "griddata";
import { renderCustomContourGeoJSON, isFeatureBold } from "./contourLayer.js";
import { addOrUpdateLayer } from "../ui/layerControl.js";
import { smoothGrid2D } from "../utils/smoothContour.js";
import { getHexColor } from "../utils/colormaps.js";
import { formatContourLabel } from "../utils/formatters.js";

const standardHgtLevels = {
  1000: [-80, -40, 0, 40, 80, 120, 160, 200, 240, 280, 320],
  925: [600, 640, 680, 720, 760, 800, 840, 880, 920, 960, 1000, 1040],
  850: [1240, 1280, 1320, 1360, 1400, 1440, 1480, 1520, 1560, 1600, 1640, 1680, 1720],
  700: [2680, 2720, 2760, 2800, 2840, 2880, 2920, 2960, 3000, 3040, 3080, 3120, 3160, 3200, 3240, 3280, 3320],
  500: [5000, 5080, 5160, 5200, 5240, 5280, 5320, 5360, 5400, 5440, 5480, 5520, 5560, 5600, 5640, 5680, 5720, 5760, 5800, 5840, 5880, 5920, 5960, 6000, 6040, 6080],
  400: [6720, 6800, 6880, 6960, 7040, 7120, 7200, 7280, 7360, 7440, 7520, 7600, 7680],
  300: [8600, 8700, 8800, 8900, 9000, 9100, 9200, 9300, 9400, 9500, 9600, 9700, 9800],
  250: [9600, 9800, 10000, 10200, 10400, 10600, 10800, 11000, 11200, 11400],
  200: [11000, 11200, 11400, 11600, 11800, 12000, 12200, 12400, 12600, 12800],
  150: [13000, 13200, 13400, 13600, 13800, 14000, 14200, 14400, 14600],
  100: [15400, 15600, 15800, 16000, 16200, 16400, 16600, 16800, 17000, 17200],
  70: [17600, 17800, 18000, 18200, 18400, 18600, 18800, 19000, 19200],
  50: [19800, 20000, 20200, 20400, 20600, 20800, 21000, 21200, 21400],
  30: [23000, 23200, 23400, 23600, 23800, 24000, 24200, 24400],
  10: [29600, 30000, 30400, 30800, 31200, 31600, 32000, 32400],
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

export const HGT_QC_BOUNDS = {
  1000: [-400, 800],
  925: [200, 1600],
  850: [800, 2200],
  700: [2200, 3800],
  500: [4400, 6400],
  400: [6000, 8200],
  300: [7500, 11000],
  250: [8500, 12200],
  200: [9800, 13800],
  150: [11500, 15800],
  100: [14000, 18500],
  70: [16000, 21000],
  50: [18000, 23500],
  30: [21000, 27500],
  20: [23500, 30000],
  10: [28000, 35000],
};

export const TMP_QC_BOUNDS = {
  1000: [-60, 50],
  925: [-60, 45],
  850: [-50, 45],
  700: [-50, 30],
  500: [-60, 10],
  400: [-70, 5],
  300: [-80, 0],
  250: [-85, -10],
  200: [-85, -15],
  150: [-90, -20],
  100: [-95, -25],
};

export const WIND_QC_BOUNDS = {
  1000: [0, 50],
  925: [0, 60],
  850: [0, 70],
  700: [0, 80],
  500: [0, 95],
  400: [0, 115],
  300: [0, 140],
  250: [0, 140],
  200: [0, 140],
  150: [0, 100],
  100: [0, 85],
  70: [0, 80],
  50: [0, 80],
  30: [0, 80],
  20: [0, 80],
  10: [0, 85],
};

export const SOUNDING_CONTOUR_CONFIGS = {
  HGT: {
    name: "Height",
    element: "HGT",
    unit: "gpm",
    defaultColor: "#58a6ff",
    extract: (p, level) => {
      let val = null;
      if (typeof p.height === "number" && !isNaN(p.height) && p.height > -9000) {
        val = p.height;
      }
      if (val === null) return null;
      const numLvl = Number(level);
      const bounds = HGT_QC_BOUNDS[numLvl];
      if (bounds) {
        if (val < bounds[0] || val > bounds[1]) return null;
      } else if (val <= -500 || val >= 45000) {
        return null;
      }
      return val;
    },
    getLevels: (level, minV, maxV) => standardHgtLevels[Number(level)] || standardHgtLevels[level] || griddata.autoLevels(minV, maxV, 8),
    getBoldValues: (level) => boldMapHgt[Number(level)] || boldMapHgt[level] || [],
  },
  TMP: {
    name: "Temperature",
    element: "TMP",
    unit: "°C",
    defaultColor: "#f85149",
    colormap: "TMP",
    extract: (p, level) => {
      if (typeof p.temperature === "number" && !isNaN(p.temperature) && p.temperature > -9000) {
        const numLvl = Number(level);
        const bounds = TMP_QC_BOUNDS[numLvl];
        if (bounds) {
          if (p.temperature < bounds[0] || p.temperature > bounds[1]) return null;
        } else if (p.temperature < -90 || p.temperature > 60) {
          return null;
        }
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
    extract: (p, level) => {
      if (typeof p.dewpoint === "number" && !isNaN(p.dewpoint) && p.dewpoint > -9000) {
        const numLvl = Number(level);
        const bounds = TMP_QC_BOUNDS[numLvl];
        if (bounds) {
          if (p.dewpoint < bounds[0] - 25 || p.dewpoint > bounds[1]) return null;
        } else if (p.dewpoint < -110 || p.dewpoint > 50) {
          return null;
        }
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
    extract: (p, level) => {
      if (typeof p.wind_speed !== "number" || isNaN(p.wind_speed) || p.wind_speed < 0 || p.wind_speed > 900) {
        return null;
      }
      const ws = p.wind_speed;
      const numLvl = Number(level);
      const bounds = WIND_QC_BOUNDS[numLvl];
      if (bounds) {
        if (ws < bounds[0] || ws > bounds[1]) return null;
      } else if (ws < 0 || ws > 140) {
        return null;
      }
      return ws;
    },
    getLevels: (level, minV, maxV) => {
      const standard = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 56];
      const filtered = standard.filter((l) => l <= maxV + 2);
      return filtered.length >= 2 ? filtered : griddata.autoLevels(minV, maxV, 6);
    },
    getBoldValues: () => [20, 30, 40],
  },
  DTD: {
    name: "Dew-Point Depression",
    element: "DTD",
    unit: "°C",
    defaultColor: "#e3b341",
    colormap: "DTD",
    extract: (p, level) => {
      if (typeof p.temperature !== "number" || isNaN(p.temperature) || p.temperature <= -9000) return null;
      if (typeof p.dewpoint !== "number" || isNaN(p.dewpoint) || p.dewpoint <= -9000) return null;
      const numLvl = Number(level);
      const bounds = TMP_QC_BOUNDS[numLvl];
      if (bounds) {
        if (p.temperature < bounds[0] || p.temperature > bounds[1]) return null;
        if (p.dewpoint < bounds[0] - 25 || p.dewpoint > bounds[1]) return null;
      } else {
        if (p.temperature < -90 || p.temperature > 60) return null;
        if (p.dewpoint < -110 || p.dewpoint > 50) return null;
      }
      if (p.dewpoint > p.temperature + 0.5) return null;
      let dtd = p.temperature - p.dewpoint;
      if (dtd < 0) dtd = 0;
      if (dtd > 45) return null;
      return dtd;
    },
    getLevels: (level, minV, maxV) => {
      let max = maxV;
      let min = minV;
      if (typeof level === "number" && typeof minV === "number" && maxV === undefined) {
        min = level;
        max = minV;
      }
      if (typeof max === "number" && max < 5) return Array.from(griddata.autoLevels(min, max, 8));
      return [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30];
    },
    getBoldValues: () => [2, 10],
    showFill: false,
    showLine: false,
    showRaster: true,
  },
};

function normalizeSoundingElementKey(elem) {
  const norm = (elem || "").toUpperCase();
  if (norm === "HGT" || norm === "HEIGHT" || norm === "GH" || norm === "GEO" || norm === "H") return "HGT";
  if (norm === "TMP" || norm === "TT" || norm === "TEMPERATURE" || norm === "TEMP" || norm === "T") return "TMP";
  if (norm === "TD" || norm === "DPT" || norm === "DEWPOINT" || norm === "DEW_POINT") return "TD";
  if (norm === "WIND" || norm === "WS" || norm === "WINDSPEED" || norm === "WIND_SPEED" || norm === "FF") return "WIND";
  if (norm === "DTD" || norm === "T-TD" || norm === "TTD" || norm === "DEPRESSION" || norm === "DPTDPR") return "DTD";
  return "HGT";
}

export function analyzeAndRenderSoundingElementContour(map, stationsGeoJSON, level = 500, rawElement = "HGT", options = {}, win = null) {
  if (!map || !stationsGeoJSON || !stationsGeoJSON.features || stationsGeoJSON.features.length < 3) {
    console.warn("[SoundingAnalysis] Insufficient sounding stations for contour calculation");
    return null;
  }

  try {
    const numLevel = parseInt(level, 10) || 500;
    const elementKey = normalizeSoundingElementKey(rawElement);
    const cfg = SOUNDING_CONTOUR_CONFIGS[elementKey] || SOUNDING_CONTOUR_CONFIGS.HGT;

    const result = calculateFieldContours(stationsGeoJSON, cfg.extract, {
      element: cfg.element,
      colormap: cfg.colormap || undefined,
      levels: options.levels || cfg.getLevels(numLevel, -100, 100000),
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

    const isDTD = elementKey === "DTD";
    const showFill = options.showFill !== undefined ? Boolean(options.showFill) : (cfg.showFill !== undefined ? Boolean(cfg.showFill) : false);
    const showLine = options.showLine !== undefined ? Boolean(options.showLine) : (cfg.showLine !== undefined ? Boolean(cfg.showLine) : (isDTD ? false : true));
    const showRaster = options.showRaster !== undefined ? Boolean(options.showRaster) : (cfg.showRaster !== undefined ? Boolean(cfg.showRaster) : (isDTD ? true : false));
    const palettePath = options.palettePath || cfg.palettePath || null;
    const colormap = options.colormap || (palettePath ? `palette:${layerId}` : (cfg.colormap || cfg.element));

    const isolineFC = { type: "FeatureCollection", features: result.lines };
    const isobandFC = result.fills ? { type: "FeatureCollection", features: result.fills } : null;
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
      name: `${level} hPa ${cfg.name} (Sounding Analysis)`,
      type: "contour",
      element: cfg.element,
      model: "UPPER_AIR",
      level,
      derivedFrom: options.derivedFrom || `upperair-obs-${level}`,
      visible: options.visible !== false,
      colormap,
      gridData: result.gridData,
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

function calculateFieldContours(stationsGeoJSON, valueExtractor, config = {}, level = 500) {
  const points = [];
  const values = [];

  for (const f of stationsGeoJSON.features) {
    if (!f.geometry || !Array.isArray(f.geometry.coordinates) || f.geometry.coordinates.length < 2) continue;
    const [lon, lat] = f.geometry.coordinates;
    if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) continue;
    const val = valueExtractor(f.properties || {}, level);
    if (typeof val === "number" && Number.isFinite(val)) {
      points.push([lon, lat]);
      values.push(val);
    }
  }

  if (points.length < 3) return null;

  // Grid bounds covering active stations domain
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
    console.warn(`[SoundingAnalysis] Grid resolution too small (${x.length}x${y.length}) for ${config.element || "contour"} calculation`);
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
    console.warn(`[SoundingAnalysis] Grid interpolation failed for ${config.element || "contour"}`);
    return null;
  }

  // Apply 2D spatial smoothing filter to reduce interpolation mesh facets
  interpolated = smoothGrid2D(interpolated, 1, 0.45, y.length, x.length);

  let levels = config.levels;
  if (!levels || !levels.length) {
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    levels = griddata.autoLevels(minV, maxV, 8);
  }

  let lines = [];
  try {
    lines = griddata.contour({ data: interpolated, rows: y.length, cols: x.length }, { x, y, levels }) || [];
    if ((!lines || lines.length === 0) && values.length > 0) {
      const minV = Math.min(...values);
      const maxV = Math.max(...values);
      if (maxV > minV) {
        const fallbackLevels = griddata.autoLevels(minV, maxV, 8);
        const fallbackLines = griddata.contour({ data: interpolated, rows: y.length, cols: x.length }, { x, y, levels: fallbackLevels });
        if (fallbackLines && fallbackLines.length > 0) {
          lines = fallbackLines;
          levels = fallbackLevels;
        }
      }
    }
  } catch (err) {
    console.warn(`[SoundingAnalysis] contour calculation failed for ${config.element}:`, err);
    lines = [];
  }

  if (Array.isArray(lines)) {
    for (const f of lines) {
      if (!f.properties) f.properties = {};
      const val = f.value ?? f.properties.value ?? f.properties.level ?? 0;
      f.properties.value = val;
      f.properties.label = formatContourLabel(val, config.element);
    }
  }

  let fills = [];
  try {
    fills = griddata.contourf({ data: interpolated, rows: y.length, cols: x.length }, { x, y, levels }) || [];
    if (Array.isArray(fills)) {
      for (const feature of fills) {
        if (feature.properties && feature.properties.level) {
          const midVal = (feature.properties.level[0] + feature.properties.level[1]) / 2;
          feature.properties.fillColor = getHexColor(midVal, config.element, config.colormap);
        }
      }
    }
  } catch (err) {
    console.warn(`[SoundingAnalysis] contourf calculation failed for ${config.element}:`, err);
    fills = [];
  }

  return {
    lines,
    fills,
    levels,
    pointsCount: points.length,
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
