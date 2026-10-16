// contourConfigsSurface.js - Element definitions, extractors, and level calculators for surface stations
import * as griddata from "griddata";
import {
  VOR_LEVELS,
  DIV_LEVELS,
  VOR_BOLD,
  DIV_BOLD,
  VOR_COLOR,
  DIV_COLOR,
} from "../kinematics.js";

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
  VOR: {
    name: "Relative Vorticity",
    element: "VOR",
    unit: "1e-5/s",
    defaultColor: VOR_COLOR,
    colormap: "VOR",
    boldValues: VOR_BOLD,
    isKinematic: true,
    extract: null,
    showFill: false,
    showLine: true,
    showRaster: false,
    getLevels: (minV, maxV) => {
      if (typeof maxV === "number" && typeof minV === "number" && Math.abs(maxV - minV) < 5) {
        return Array.from(griddata.autoLevels(minV, maxV, 8));
      }
      return VOR_LEVELS;
    },
  },
  DIV: {
    name: "Divergence",
    element: "DIV",
    unit: "1e-5/s",
    defaultColor: DIV_COLOR,
    colormap: "DIV",
    boldValues: DIV_BOLD,
    isKinematic: true,
    extract: null,
    showFill: false,
    showLine: true,
    showRaster: false,
    getLevels: (minV, maxV) => {
      if (typeof maxV === "number" && typeof minV === "number" && Math.abs(maxV - minV) < 5) {
        return Array.from(griddata.autoLevels(minV, maxV, 8));
      }
      return DIV_LEVELS;
    },
  },
  T_VARIATION_24H: {
    name: "24h Temperature Variation",
    element: "T_VARIATION_24H",
    unit: "°C",
    defaultColor: "#f85149",
    colormap: "T_VAR",
    boldValues: [0],
    extract: (p) => {
      const keys = ["t_var_24h", "t_var", "temperature", "temp", "val", "value"];
      for (const k of keys) {
        const v = p[k];
        if (typeof v === "number" && !isNaN(v) && v > -90 && v < 90) return v;
      }
      return null;
    },
    getLevels: (minV, maxV) => {
      const std = [-16, -12, -8, -6, -4, -2, 0, 2, 4, 6, 8, 12, 16];
      if (typeof minV === "number" && typeof maxV === "number" && (maxV < -16 || minV > 16)) {
        return Array.from(griddata.autoLevels(minV, maxV, 8));
      }
      return std;
    },
  },
  T_VARIATION_48H: {
    name: "48h Temperature Variation",
    element: "T_VARIATION_48H",
    unit: "°C",
    defaultColor: "#f85149",
    colormap: "T_VAR",
    boldValues: [0],
    extract: (p) => {
      const keys = ["t_var_48h", "t_var", "temperature", "temp", "val", "value"];
      for (const k of keys) {
        const v = p[k];
        if (typeof v === "number" && !isNaN(v) && v > -90 && v < 90) return v;
      }
      return null;
    },
    getLevels: (minV, maxV) => {
      const std = [-20, -16, -12, -8, -4, -2, 0, 2, 4, 8, 12, 16, 20];
      if (typeof minV === "number" && typeof maxV === "number" && (maxV < -20 || minV > 20)) {
        return Array.from(griddata.autoLevels(minV, maxV, 8));
      }
      return std;
    },
  },
  SLP_VARIATION_24H: {
    name: "24h SLP Variation",
    element: "SLP_VARIATION_24H",
    unit: "hPa",
    defaultColor: "#58a6ff",
    colormap: "SLP_VAR",
    boldValues: [0],
    extract: (p) => {
      const keys = ["slp_var_24h", "slp_var", "slp", "SLP", "press_slp", "val", "value"];
      for (const k of keys) {
        const v = p[k];
        if (typeof v === "number" && !isNaN(v) && v > -100 && v < 100) return v;
      }
      return null;
    },
    getLevels: (minV, maxV) => {
      const std = [-16, -12, -8, -6, -4, -2, 0, 2, 4, 6, 8, 12, 16];
      if (typeof minV === "number" && typeof maxV === "number" && (maxV < -16 || minV > 16)) {
        return Array.from(griddata.autoLevels(minV, maxV, 8));
      }
      return std;
    },
  },
  SLP_VARIATION_48H: {
    name: "48h SLP Variation",
    element: "SLP_VARIATION_48H",
    unit: "hPa",
    defaultColor: "#58a6ff",
    colormap: "SLP_VAR",
    boldValues: [0],
    extract: (p) => {
      const keys = ["slp_var_48h", "slp_var", "slp", "SLP", "press_slp", "val", "value"];
      for (const k of keys) {
        const v = p[k];
        if (typeof v === "number" && !isNaN(v) && v > -100 && v < 100) return v;
      }
      return null;
    },
    getLevels: (minV, maxV) => {
      const std = [-20, -16, -12, -8, -4, -2, 0, 2, 4, 8, 12, 16, 20];
      if (typeof minV === "number" && typeof maxV === "number" && (maxV < -20 || minV > 20)) {
        return Array.from(griddata.autoLevels(minV, maxV, 8));
      }
      return std;
    },
  },
  SNOW_DEPTH: {
    name: "Snow Depth",
    element: "SNOW_DEPTH",
    unit: "cm",
    defaultColor: "#99e9f2",
    colormap: "SNOW",
    boldValues: [5, 10, 20, 50],
    extract: (p) => {
      const keys = ["snow_depth", "snowDepth", "snow", "SNOW", "sno", "SD", "sd", "snod"];
      for (const k of keys) {
        const v = p[k];
        if (typeof v === "number" && !isNaN(v) && v >= 0 && v <= 10000) return v;
      }
      return null;
    },
    getLevels: (minV, maxV) => {
      const std = [1, 2, 5, 10, 20, 30, 50, 75, 100];
      const filtered = std.filter((l) => l >= minV && l <= maxV + 5);
      return filtered.length >= 2 ? filtered : griddata.autoLevels(minV, maxV, 6);
    },
  },
  PRES_CHANGE_3H: {
    name: "3h Pressure Change",
    element: "PRES_CHANGE_3H",
    unit: "hPa",
    defaultColor: "#a5d8ff",
    colormap: "SLP_VAR",
    boldValues: [0],
    extract: (p) => {
      const keys = ["press_diff_3h", "pDiff3h", "press_diff", "PRS_Change_3h", "p3", "press_change_3h"];
      for (const k of keys) {
        const v = p[k];
        if (typeof v === "number" && !isNaN(v) && v > -500 && v < 500) return v;
      }
      return null;
    },
    getLevels: (minV, maxV) => {
      const std = [-10, -8, -6, -4, -2.5, -1, 0, 1, 2.5, 4, 6, 8, 10];
      const filtered = std.filter((l) => l >= minV - 1 && l <= maxV + 1);
      return filtered.length >= 2 ? filtered : griddata.autoLevels(minV, maxV, 6);
    },
  },
  PRES_CHANGE_24H: {
    name: "24h Pressure Change",
    element: "PRES_CHANGE_24H",
    unit: "hPa",
    defaultColor: "#58a6ff",
    colormap: "SLP_VAR",
    boldValues: [0],
    extract: (p) => {
      const keys = ["press_diff_24h", "pDiff24h", "press_diff_24", "PRS_Change_24h", "p24", "press_change_24h"];
      for (const k of keys) {
        const v = p[k];
        if (typeof v === "number" && !isNaN(v) && v > -500 && v < 500) return v;
      }
      return null;
    },
    getLevels: (minV, maxV) => {
      const std = [-16, -12, -8, -6, -4, -2, 0, 2, 4, 6, 8, 12, 16];
      const filtered = std.filter((l) => l >= minV - 2 && l <= maxV + 2);
      return filtered.length >= 2 ? filtered : griddata.autoLevels(minV, maxV, 6);
    },
  },
};

SURFACE_CONTOUR_CONFIGS["T-VARIATION-24H"] = SURFACE_CONTOUR_CONFIGS.T_VARIATION_24H;
SURFACE_CONTOUR_CONFIGS["T-VARIATION-48H"] = SURFACE_CONTOUR_CONFIGS.T_VARIATION_48H;
SURFACE_CONTOUR_CONFIGS["SLP-VARIATION-24H"] = SURFACE_CONTOUR_CONFIGS.SLP_VARIATION_24H;
SURFACE_CONTOUR_CONFIGS["SLP-VARIATION-48H"] = SURFACE_CONTOUR_CONFIGS.SLP_VARIATION_48H;
SURFACE_CONTOUR_CONFIGS["T_VAR_24H"] = SURFACE_CONTOUR_CONFIGS.T_VARIATION_24H;
SURFACE_CONTOUR_CONFIGS["T_VAR_48H"] = SURFACE_CONTOUR_CONFIGS.T_VARIATION_48H;
SURFACE_CONTOUR_CONFIGS["SLP_VAR_24H"] = SURFACE_CONTOUR_CONFIGS.SLP_VARIATION_24H;
SURFACE_CONTOUR_CONFIGS["SLP_VAR_48H"] = SURFACE_CONTOUR_CONFIGS.SLP_VARIATION_48H;
SURFACE_CONTOUR_CONFIGS["SNOW"] = SURFACE_CONTOUR_CONFIGS.SNOW_DEPTH;
SURFACE_CONTOUR_CONFIGS["SNOW-DEPTH"] = SURFACE_CONTOUR_CONFIGS.SNOW_DEPTH;
SURFACE_CONTOUR_CONFIGS["SNOD"] = SURFACE_CONTOUR_CONFIGS.SNOW_DEPTH;
SURFACE_CONTOUR_CONFIGS["PRES_CHANGE_3H"] = SURFACE_CONTOUR_CONFIGS.PRES_CHANGE_3H;
SURFACE_CONTOUR_CONFIGS["PRES_CHANGE_24H"] = SURFACE_CONTOUR_CONFIGS.PRES_CHANGE_24H;
SURFACE_CONTOUR_CONFIGS["PRESS_DIFF_3H"] = SURFACE_CONTOUR_CONFIGS.PRES_CHANGE_3H;
SURFACE_CONTOUR_CONFIGS["PRESS_DIFF_24H"] = SURFACE_CONTOUR_CONFIGS.PRES_CHANGE_24H;

export function normalizeSurfaceElementKey(elem) {
  const upper = (elem || "").toUpperCase().trim();
  const hyphen = upper.replace(/_/g, "-");

  if (upper === "SNOW_DEPTH" || upper === "SNOW" || upper === "SNOD" || hyphen === "SNOW-DEPTH") return "SNOW_DEPTH";
  if (upper === "PRES_CHANGE_3H" || upper === "PRESS_DIFF_3H" || hyphen === "PRES-CHANGE-3H" || hyphen === "PRESS-DIFF-3H") return "PRES_CHANGE_3H";
  if (upper === "PRES_CHANGE_24H" || upper === "PRESS_DIFF_24H" || hyphen === "PRES-CHANGE-24H" || hyphen === "PRESS-DIFF-24H") return "PRES_CHANGE_24H";

  if (
    hyphen.includes("SLP-VAR") ||
    hyphen.includes("PRS-VAR") ||
    hyphen.includes("PRESS-VAR") ||
    hyphen.includes("PRESSURE-VAR") ||
    hyphen.includes("PRMSL-VAR") ||
    ((hyphen.includes("SLP") || hyphen.includes("PRS") || hyphen.includes("PRMSL")) && (hyphen.includes("VAR") || hyphen.includes("24") || hyphen.includes("48")))
  ) {
    if (hyphen.includes("48")) return "SLP_VARIATION_48H";
    return "SLP_VARIATION_24H";
  }
  if (hyphen.includes("T-VAR") || hyphen.includes("TEM-VAR") || hyphen.includes("TEMP-VAR") || hyphen.startsWith("VAR-") || hyphen.includes("VARIATION")) {
    if (hyphen.includes("48")) return "T_VARIATION_48H";
    return "T_VARIATION_24H";
  }
  if (upper === "SLP" || upper === "PRESSURE" || upper === "PRS") return "SLP";
  if (upper === "TMP" || upper === "TT" || upper === "TEMPERATURE" || upper === "TEMP") return "TMP";
  if (upper === "TD" || upper === "DPT" || upper === "DEWPOINT" || upper === "DEW_POINT" || hyphen === "DEW-POINT") return "TD";
  if (upper === "VIS" || upper === "VISIBILITY" || upper === "VV") return "VIS";
  if (upper === "RAIN6" || upper === "RAIN6H" || upper === "RAIN_6H" || hyphen === "RAIN-6H" || upper === "RAIN" || upper === "PRECIPITATION") return "RAIN6";
  if (upper === "WIND" || upper === "WS" || upper === "WINDSPEED" || upper === "WIND_SPEED" || hyphen === "WIND-SPEED" || upper === "FF") return "WIND";
  if (upper === "DTD" || upper === "T-TD" || upper === "TTD" || upper === "DEPRESSION" || upper === "DPTDPR") return "DTD";
  if (upper === "VOR" || upper === "VORT" || upper === "VORTICITY" || upper === "RVOR" || upper === "REL_VOR" || hyphen === "REL-VOR") return "VOR";
  if (upper === "DIV" || upper === "DIVERGENCE") return "DIV";
  return "SLP";
}
