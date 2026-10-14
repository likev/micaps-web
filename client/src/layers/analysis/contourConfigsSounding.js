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
  K_INDEX: {
    name: "K-Index",
    element: "K_INDEX",
    unit: "°C",
    defaultColor: "#f85149",
    colormap: "K_INDEX",
    extract: (p) => {
      const candidates = [p.k_index, p.K_INDEX, p["k-index"], p.val, p.value, p.temperature];
      for (const val of candidates) {
        if (typeof val === "number" && !isNaN(val) && val > -9000 && val >= -60 && val <= 70) {
          return val;
        }
      }
      return null;
    },
    getLevels: (level, minV, maxV) => {
      const std = [10, 15, 20, 25, 30, 35, 40];
      if (typeof minV === "number" && typeof maxV === "number" && (maxV < 10 || minV > 40)) {
        return Array.from(griddata.autoLevels(minV, maxV, 7));
      }
      return std;
    },
    getBoldValues: () => [20, 30, 35],
    showFill: true,
    showLine: true,
    showRaster: false,
  },
  SHOWALTER: {
    name: "Showalter Index (SSI)",
    element: "SHOWALTER",
    unit: "°C",
    defaultColor: "#e3b341",
    colormap: "SHOWALTER",
    extract: (p) => {
      const candidates = [p.showalter, p.ssi, p.SSI, p.val, p.value, p.temperature];
      for (const val of candidates) {
        if (typeof val === "number" && !isNaN(val) && val > -9000 && val >= -30 && val <= 30) {
          return val;
        }
      }
      return null;
    },
    getLevels: (level, minV, maxV) => {
      const std = [-8, -6, -4, -2, 0, 2, 4, 6, 8];
      if (typeof minV === "number" && typeof maxV === "number" && (maxV < -8 || minV > 8)) {
        return Array.from(griddata.autoLevels(minV, maxV, 7));
      }
      return std;
    },
    getBoldValues: () => [0, -3],
    showFill: false,
    showLine: true,
    showRaster: false,
  },
  LIFTED: {
    name: "Lifted Index (LI)",
    element: "LIFTED",
    unit: "°C",
    defaultColor: "#e3b341",
    colormap: "LIFTED",
    extract: (p) => {
      const candidates = [p.lifted, p.li, p.LI, p.val, p.value, p.temperature];
      for (const val of candidates) {
        if (typeof val === "number" && !isNaN(val) && val > -9000 && val >= -30 && val <= 30) {
          return val;
        }
      }
      return null;
    },
    getLevels: (level, minV, maxV) => {
      const std = [-8, -6, -4, -2, 0, 2, 4, 6];
      if (typeof minV === "number" && typeof maxV === "number" && (maxV < -8 || minV > 6)) {
        return Array.from(griddata.autoLevels(minV, maxV, 7));
      }
      return std;
    },
    getBoldValues: () => [0, -4],
    showFill: false,
    showLine: true,
    showRaster: false,
  },
  SWEAT: {
    name: "SWEAT Index",
    element: "SWEAT",
    unit: "",
    defaultColor: "#da3633",
    colormap: "SWEAT",
    extract: (p) => {
      const candidates = [p.sweat, p.SWEAT, p.val, p.value, p.temperature];
      for (const val of candidates) {
        if (typeof val === "number" && !isNaN(val) && val > -9000 && val >= 0 && val <= 800) {
          return val;
        }
      }
      return null;
    },
    getLevels: (level, minV, maxV) => {
      const std = [100, 150, 200, 250, 300, 400, 500];
      if (typeof minV === "number" && typeof maxV === "number" && (maxV < 100 || minV > 500)) {
        return Array.from(griddata.autoLevels(minV, maxV, 7));
      }
      return std;
    },
    getBoldValues: () => [300, 400],
    showFill: false,
    showLine: true,
    showRaster: false,
  },
  TT: {
    name: "Total Totals (TT)",
    element: "TT",
    unit: "°C",
    defaultColor: "#d29922",
    colormap: "TT",
    extract: (p) => {
      const candidates = [p.tt, p.TT, p.total_totals, p.val, p.value, p.temperature];
      for (const val of candidates) {
        if (typeof val === "number" && !isNaN(val) && val > -9000 && val >= 20 && val <= 80) {
          return val;
        }
      }
      return null;
    },
    getLevels: (level, minV, maxV) => {
      const std = [35, 40, 44, 46, 48, 50, 52, 54, 56, 60];
      if (typeof minV === "number" && typeof maxV === "number" && (maxV < 35 || minV > 60)) {
        return Array.from(griddata.autoLevels(minV, maxV, 8));
      }
      return std;
    },
    getBoldValues: () => [44, 50],
    showFill: false,
    showLine: true,
    showRaster: false,
  },
  SHEAR: {
    name: "Vertical Wind Shear",
    element: "SHEAR",
    unit: "m/s",
    defaultColor: "#58a6ff",
    colormap: "SHEAR",
    extract: (p) => {
      const candidates = [p.shear, p.SHEAR, p.val, p.value, p.wind_speed];
      for (const val of candidates) {
        if (typeof val === "number" && !isNaN(val) && val >= 0 && val <= 120) {
          return val;
        }
      }
      return null;
    },
    getLevels: (level, minV, maxV) => {
      const std = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40];
      if (typeof minV === "number" && typeof maxV === "number" && (maxV < 4 || minV > 40)) {
        return Array.from(griddata.autoLevels(minV, maxV, 8));
      }
      return std;
    },
    getBoldValues: () => [12, 20, 28],
    showFill: false,
    showLine: true,
    showRaster: false,
  },
  TMP_DIFF: {
    name: "Temperature Difference",
    element: "TMP_DIFF",
    unit: "°C",
    defaultColor: "#f85149",
    colormap: "TMP",
    extract: (p) => {
      const candidates = [p.tmp_diff, p.tmp, p.temperature, p.val, p.value];
      for (const val of candidates) {
        if (typeof val === "number" && !isNaN(val) && val > -9000 && val >= -60 && val <= 60) {
          return val;
        }
      }
      return null;
    },
    getLevels: (level, minV, maxV) => {
      const std = [-30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30];
      if (typeof minV === "number" && typeof maxV === "number" && (maxV < -30 || minV > 30)) {
        return Array.from(griddata.autoLevels(minV, maxV, 8));
      }
      return std;
    },
    getBoldValues: () => [0],
    showFill: false,
    showLine: true,
    showRaster: false,
  },
  THICKNESS: {
    name: "Thickness",
    element: "THICKNESS",
    unit: "gpm",
    defaultColor: "#58a6ff",
    colormap: "THICKNESS",
    extract: (p) => {
      const candidates = [p.thickness, p.height, p.val, p.value];
      for (const val of candidates) {
        if (typeof val === "number" && !isNaN(val) && val > -9000 && val >= 4000 && val <= 7000) {
          return val;
        }
      }
      return null;
    },
    getLevels: (level, minV, maxV) => {
      const std = [5100, 5220, 5280, 5340, 5400, 5460, 5520, 5580, 5640, 5700, 5760, 5820, 5880];
      if (typeof minV === "number" && typeof maxV === "number" && (maxV < 5100 || minV > 5880)) {
        return Array.from(griddata.autoLevels(minV, maxV, 8));
      }
      return std;
    },
    getBoldValues: () => [5400, 5460],
    showFill: false,
    showLine: true,
    showRaster: false,
  },
  T_VARIATION_24H: {
    name: "24h Temperature Variation",
    element: "T_VARIATION_24H",
    unit: "°C",
    defaultColor: "#f85149",
    colormap: "T_VAR",
    extract: (p) => {
      const candidates = [p.t_var_24h, p.t_var, p.temperature, p.temp, p.tmp, p.val, p.value];
      for (const val of candidates) {
        if (typeof val === "number" && !isNaN(val) && val > -9000 && val >= -60 && val <= 60) {
          return val;
        }
      }
      return null;
    },
    getLevels: (level, minV, maxV) => {
      const std = [-16, -12, -8, -6, -4, -2, 0, 2, 4, 6, 8, 12, 16];
      if (typeof minV === "number" && typeof maxV === "number" && (maxV < -16 || minV > 16)) {
        return Array.from(griddata.autoLevels(minV, maxV, 8));
      }
      return std;
    },
    getBoldValues: () => [0],
    showFill: false,
    showLine: true,
    showRaster: false,
  },
  T_VARIATION_48H: {
    name: "48h Temperature Variation",
    element: "T_VARIATION_48H",
    unit: "°C",
    defaultColor: "#f85149",
    colormap: "T_VAR",
    extract: (p) => {
      const candidates = [p.t_var_48h, p.t_var, p.temperature, p.temp, p.tmp, p.val, p.value];
      for (const val of candidates) {
        if (typeof val === "number" && !isNaN(val) && val > -9000 && val >= -60 && val <= 60) {
          return val;
        }
      }
      return null;
    },
    getLevels: (level, minV, maxV) => {
      const std = [-20, -16, -12, -8, -4, -2, 0, 2, 4, 8, 12, 16, 20];
      if (typeof minV === "number" && typeof maxV === "number" && (maxV < -20 || minV > 20)) {
        return Array.from(griddata.autoLevels(minV, maxV, 8));
      }
      return std;
    },
    getBoldValues: () => [0],
    showFill: false,
    showLine: true,
    showRaster: false,
  },
  SLP_VARIATION_24H: {
    name: "24h SLP Variation",
    element: "SLP_VARIATION_24H",
    unit: "hPa",
    defaultColor: "#58a6ff",
    colormap: "SLP_VAR",
    extract: (p) => {
      const candidates = [p.slp_var_24h, p.slp_var, p.slp, p.press_slp, p.val, p.value];
      for (const val of candidates) {
        if (typeof val === "number" && !isNaN(val) && val > -9000 && val >= -100 && val <= 100) {
          return val;
        }
      }
      return null;
    },
    getLevels: (level, minV, maxV) => {
      const std = [-16, -12, -8, -6, -4, -2, 0, 2, 4, 6, 8, 12, 16];
      if (typeof minV === "number" && typeof maxV === "number" && (maxV < -16 || minV > 16)) {
        return Array.from(griddata.autoLevels(minV, maxV, 8));
      }
      return std;
    },
    getBoldValues: () => [0],
    showFill: false,
    showLine: true,
    showRaster: false,
  },
  SLP_VARIATION_48H: {
    name: "48h SLP Variation",
    element: "SLP_VARIATION_48H",
    unit: "hPa",
    defaultColor: "#58a6ff",
    colormap: "SLP_VAR",
    extract: (p) => {
      const candidates = [p.slp_var_48h, p.slp_var, p.slp, p.press_slp, p.val, p.value];
      for (const val of candidates) {
        if (typeof val === "number" && !isNaN(val) && val > -9000 && val >= -100 && val <= 100) {
          return val;
        }
      }
      return null;
    },
    getLevels: (level, minV, maxV) => {
      const std = [-20, -16, -12, -8, -4, -2, 0, 2, 4, 8, 12, 16, 20];
      if (typeof minV === "number" && typeof maxV === "number" && (maxV < -20 || minV > 20)) {
        return Array.from(griddata.autoLevels(minV, maxV, 8));
      }
      return std;
    },
    getBoldValues: () => [0],
    showFill: false,
    showLine: true,
    showRaster: false,
  },
};

// Aliases for derived stability indices and multi-level differences
SOUNDING_CONTOUR_CONFIGS["K-INDEX"] = SOUNDING_CONTOUR_CONFIGS.K_INDEX;
SOUNDING_CONTOUR_CONFIGS["T850-500"] = SOUNDING_CONTOUR_CONFIGS.TMP_DIFF;
SOUNDING_CONTOUR_CONFIGS["TMP850-500"] = SOUNDING_CONTOUR_CONFIGS.TMP_DIFF;
SOUNDING_CONTOUR_CONFIGS["DIFF"] = SOUNDING_CONTOUR_CONFIGS.TMP_DIFF;
SOUNDING_CONTOUR_CONFIGS["T-VARIATION-24H"] = SOUNDING_CONTOUR_CONFIGS.T_VARIATION_24H;
SOUNDING_CONTOUR_CONFIGS["T-VARIATION-48H"] = SOUNDING_CONTOUR_CONFIGS.T_VARIATION_48H;
SOUNDING_CONTOUR_CONFIGS["SLP-VARIATION-24H"] = SOUNDING_CONTOUR_CONFIGS.SLP_VARIATION_24H;
SOUNDING_CONTOUR_CONFIGS["SLP-VARIATION-48H"] = SOUNDING_CONTOUR_CONFIGS.SLP_VARIATION_48H;
SOUNDING_CONTOUR_CONFIGS["T_VAR_24H"] = SOUNDING_CONTOUR_CONFIGS.T_VARIATION_24H;
SOUNDING_CONTOUR_CONFIGS["T_VAR_48H"] = SOUNDING_CONTOUR_CONFIGS.T_VARIATION_48H;
SOUNDING_CONTOUR_CONFIGS["SLP_VAR_24H"] = SOUNDING_CONTOUR_CONFIGS.SLP_VARIATION_24H;
SOUNDING_CONTOUR_CONFIGS["SLP_VAR_48H"] = SOUNDING_CONTOUR_CONFIGS.SLP_VARIATION_48H;

export function normalizeSoundingElementKey(elem) {
  const upper = (elem || "").toUpperCase().trim();
  const hyphen = upper.replace(/_/g, "-");

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
  if (upper === "HGT" || upper === "HEIGHT" || upper === "GH" || upper === "GEO" || upper === "H") return "HGT";
  if (upper === "TD" || upper === "DPT" || upper === "DEWPOINT" || upper === "DEW_POINT" || hyphen === "DEW-POINT") return "TD";
  if (upper === "WIND" || upper === "WS" || upper === "WINDSPEED" || upper === "WIND_SPEED" || hyphen === "WIND-SPEED" || upper === "FF") return "WIND";
  if (upper === "DTD" || upper === "T-TD" || upper === "TTD" || upper === "DEPRESSION" || upper === "DPTDPR") return "DTD";
  if (upper === "VOR" || upper === "VORT" || upper === "VORTICITY" || upper === "RVOR" || upper === "REL_VOR" || hyphen === "REL-VOR") return "VOR";
  if (upper === "DIV" || upper === "DIVERGENCE") return "DIV";
  if (upper === "K" || upper === "K_INDEX" || upper === "K-INDEX" || upper === "KINDEX") return "K_INDEX";
  if (upper === "SHOWALTER" || upper === "SHOWALTER_INDEX" || hyphen === "SHOWALTER-INDEX" || upper === "SSI" || upper === "SI") return "SHOWALTER";
  if (upper === "LIFTED" || upper === "LIFTED_INDEX" || hyphen === "LIFTED-INDEX" || upper === "LI") return "LIFTED";
  if (upper === "SWEAT" || upper === "SWEAT_INDEX" || hyphen === "SWEAT-INDEX" || upper === "SEVERE_WEATHER_THREAT") return "SWEAT";
  if (upper === "TT" || upper === "TOTAL_TOTALS" || hyphen === "TOTAL-TOTALS" || upper === "TOTAL_TOTALS_INDEX" || hyphen === "TOTAL-TOTALS-INDEX" || upper === "TOTALTOTALS") return "TT";
  if (upper === "SHEAR" || upper === "WIND_SHEAR" || hyphen === "WIND-SHEAR" || upper === "VERTICAL_SHEAR" || hyphen === "VERTICAL-SHEAR") return "SHEAR";
  if (upper === "THICKNESS" || upper === "HGT_DIFF" || hyphen === "HGT-DIFF") return "THICKNESS";
  if (upper === "TMP_DIFF" || hyphen === "TMP-DIFF" || upper === "T_DIFF" || hyphen === "T-DIFF" || upper === "T850-500" || upper === "TMP850-500" || upper === "850-500") return "TMP_DIFF";
  if (upper === "TMP" || upper === "TEMPERATURE" || upper === "TEMP" || upper === "T") return "TMP";
  return "HGT";
}
