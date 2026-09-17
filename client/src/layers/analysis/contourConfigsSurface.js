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
};

export function normalizeSurfaceElementKey(elem) {
  const norm = (elem || "").toUpperCase();
  if (norm === "SLP" || norm === "PRESSURE" || norm === "PRS") return "SLP";
  if (norm === "TMP" || norm === "TT" || norm === "TEMPERATURE" || norm === "TEMP") return "TMP";
  if (norm === "TD" || norm === "DPT" || norm === "DEWPOINT" || norm === "DEW_POINT") return "TD";
  if (norm === "VIS" || norm === "VISIBILITY" || norm === "VV") return "VIS";
  if (norm === "RAIN6" || norm === "RAIN6H" || norm === "RAIN_6H" || norm === "RAIN" || norm === "PRECIPITATION") return "RAIN6";
  if (norm === "WIND" || norm === "WS" || norm === "WINDSPEED" || norm === "WIND_SPEED" || norm === "FF") return "WIND";
  if (norm === "DTD" || norm === "T-TD" || norm === "TTD" || norm === "DEPRESSION" || norm === "DPTDPR") return "DTD";
  if (norm === "VOR" || norm === "VORT" || norm === "VORTICITY" || norm === "RVOR" || norm === "REL_VOR") return "VOR";
  if (norm === "DIV" || norm === "DIVERGENCE") return "DIV";
  return "SLP";
}
