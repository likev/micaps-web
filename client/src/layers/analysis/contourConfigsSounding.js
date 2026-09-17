// contourConfigsSounding.js - Element definitions, extractors, and level calculators for upper-air sounding stations
import * as griddata from "griddata";
import {
  VOR_LEVELS,
  DIV_LEVELS,
  VOR_BOLD,
  DIV_BOLD,
  VOR_COLOR,
  DIV_COLOR,
} from "../kinematics.js";
import {
  standardHgtLevels,
  boldMapHgt,
  HGT_QC_BOUNDS,
  TMP_QC_BOUNDS,
  WIND_QC_BOUNDS,
} from "./qcBounds.js";

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
  VOR: {
    name: "Relative Vorticity",
    element: "VOR",
    unit: "1e-5/s",
    defaultColor: VOR_COLOR,
    colormap: "VOR",
    isKinematic: true,
    extract: null,
    showFill: false,
    showLine: true,
    showRaster: false,
    getLevels: (level, minV, maxV) => {
      let min = minV;
      let max = maxV;
      if (typeof level === "number" && typeof minV === "number" && maxV === undefined) {
        min = level;
        max = minV;
      }
      if (typeof max === "number" && typeof min === "number" && Math.abs(max - min) < 5) {
        return Array.from(griddata.autoLevels(min, max, 8));
      }
      return VOR_LEVELS;
    },
    getBoldValues: () => VOR_BOLD,
  },
  DIV: {
    name: "Divergence",
    element: "DIV",
    unit: "1e-5/s",
    defaultColor: DIV_COLOR,
    colormap: "DIV",
    isKinematic: true,
    extract: null,
    showFill: false,
    showLine: true,
    showRaster: false,
    getLevels: (level, minV, maxV) => {
      let min = minV;
      let max = maxV;
      if (typeof level === "number" && typeof minV === "number" && maxV === undefined) {
        min = level;
        max = minV;
      }
      if (typeof max === "number" && typeof min === "number" && Math.abs(max - min) < 5) {
        return Array.from(griddata.autoLevels(min, max, 8));
      }
      return DIV_LEVELS;
    },
    getBoldValues: () => DIV_BOLD,
  },
};

export function normalizeSoundingElementKey(elem) {
  const norm = (elem || "").toUpperCase();
  if (norm === "HGT" || norm === "HEIGHT" || norm === "GH" || norm === "GEO" || norm === "H") return "HGT";
  if (norm === "TMP" || norm === "TT" || norm === "TEMPERATURE" || norm === "TEMP" || norm === "T") return "TMP";
  if (norm === "TD" || norm === "DPT" || norm === "DEWPOINT" || norm === "DEW_POINT") return "TD";
  if (norm === "WIND" || norm === "WS" || norm === "WINDSPEED" || norm === "WIND_SPEED" || norm === "FF") return "WIND";
  if (norm === "DTD" || norm === "T-TD" || norm === "TTD" || norm === "DEPRESSION" || norm === "DPTDPR") return "DTD";
  if (norm === "VOR" || norm === "VORT" || norm === "VORTICITY" || norm === "RVOR" || norm === "REL_VOR") return "VOR";
  if (norm === "DIV" || norm === "DIVERGENCE") return "DIV";
  return "HGT";
}
