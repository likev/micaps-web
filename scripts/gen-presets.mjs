// scripts/gen-presets.mjs - Generate client presets and colormaps from dataset manifest
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MANIFEST_PATH = resolve(ROOT, "server/testdata/dataset_manifest.json");
const CONFIG_PATH = resolve(ROOT, "client/config.json");

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));

// 1. Add new meteorological colormaps
const NEW_COLORMAPS = {
  CAPE: [
    { val: 0, color: [240, 240, 240, 0] },
    { val: 100, color: [180, 220, 250, 120] },
    { val: 500, color: [100, 200, 230, 180] },
    { val: 1000, color: [110, 210, 110, 220] },
    { val: 1500, color: [240, 220, 50, 240] },
    { val: 2000, color: [245, 140, 40, 255] },
    { val: 2500, color: [230, 40, 40, 255] },
    { val: 3000, color: [200, 20, 150, 255] },
    { val: 4000, color: [130, 0, 180, 255] },
  ],
  HELICITY: [
    { val: 0, color: [240, 240, 240, 0] },
    { val: 10, color: [180, 230, 245, 140] },
    { val: 25, color: [100, 200, 230, 190] },
    { val: 50, color: [120, 220, 100, 220] },
    { val: 100, color: [240, 220, 50, 240] },
    { val: 150, color: [245, 140, 40, 255] },
    { val: 200, color: [230, 40, 40, 255] },
    { val: 300, color: [180, 20, 160, 255] },
  ],
  RADAR: [
    { val: 0, color: [240, 240, 240, 0] },
    { val: 10, color: [160, 230, 255, 180] },
    { val: 15, color: [0, 160, 245, 220] },
    { val: 20, color: [0, 235, 235, 240] },
    { val: 25, color: [0, 215, 0, 255] },
    { val: 30, color: [0, 150, 0, 255] },
    { val: 35, color: [255, 255, 0, 255] },
    { val: 40, color: [230, 180, 0, 255] },
    { val: 45, color: [255, 140, 0, 255] },
    { val: 50, color: [255, 0, 0, 255] },
    { val: 55, color: [210, 0, 0, 255] },
    { val: 60, color: [200, 0, 200, 255] },
    { val: 65, color: [150, 0, 180, 255] },
    { val: 70, color: [255, 255, 255, 255] },
  ],
  ECHO_TOP: [
    { val: 0, color: [240, 240, 240, 0] },
    { val: 2, color: [170, 220, 250, 120] },
    { val: 4, color: [90, 190, 230, 180] },
    { val: 6, color: [70, 200, 120, 220] },
    { val: 8, color: [180, 230, 50, 240] },
    { val: 10, color: [240, 220, 40, 255] },
    { val: 12, color: [245, 140, 30, 255] },
    { val: 14, color: [230, 40, 40, 255] },
    { val: 16, color: [200, 20, 160, 255] },
    { val: 18, color: [255, 255, 255, 255] },
  ],
  VIL: [
    { val: 0, color: [240, 240, 240, 0] },
    { val: 5, color: [160, 220, 250, 140] },
    { val: 10, color: [80, 180, 230, 200] },
    { val: 15, color: [70, 200, 110, 220] },
    { val: 25, color: [240, 220, 40, 255] },
    { val: 35, color: [245, 140, 30, 255] },
    { val: 45, color: [230, 40, 40, 255] },
    { val: 55, color: [190, 20, 160, 255] },
    { val: 70, color: [120, 0, 160, 255] },
  ],
  QPE: [
    { val: 0.1, color: [166, 242, 143, 200] },
    { val: 1.0, color: [61, 186, 61, 230] },
    { val: 5.0, color: [97, 184, 255, 240] },
    { val: 10.0, color: [0, 120, 255, 255] },
    { val: 25.0, color: [250, 200, 0, 255] },
    { val: 50.0, color: [250, 0, 0, 255] },
    { val: 100.0, color: [180, 0, 160, 255] },
  ],
  SNOW: [
    { val: 0, color: [240, 240, 240, 0] },
    { val: 1, color: [210, 230, 250, 150] },
    { val: 5, color: [160, 210, 245, 200] },
    { val: 10, color: [110, 180, 240, 230] },
    { val: 20, color: [70, 140, 230, 255] },
    { val: 30, color: [30, 90, 200, 255] },
    { val: 50, color: [10, 40, 160, 255] },
  ],
  SST: [
    { val: 0, color: [40, 30, 150, 255] },
    { val: 5, color: [40, 100, 210, 255] },
    { val: 10, color: [60, 180, 230, 255] },
    { val: 15, color: [100, 220, 190, 255] },
    { val: 20, color: [160, 230, 100, 255] },
    { val: 25, color: [250, 220, 50, 255] },
    { val: 28, color: [245, 130, 30, 255] },
    { val: 32, color: [220, 30, 30, 255] },
    { val: 36, color: [150, 10, 20, 255] },
  ],
  TCWV: [
    { val: 0, color: [240, 240, 240, 0] },
    { val: 10, color: [220, 240, 255, 120] },
    { val: 20, color: [160, 215, 255, 180] },
    { val: 30, color: [90, 180, 245, 220] },
    { val: 45, color: [40, 130, 225, 240] },
    { val: 60, color: [20, 70, 190, 255] },
    { val: 75, color: [10, 20, 130, 255] },
  ],
  PROBABILITY: [
    { val: 0, color: [240, 240, 240, 0] },
    { val: 10, color: [210, 235, 255, 140] },
    { val: 25, color: [140, 200, 245, 180] },
    { val: 50, color: [245, 225, 60, 220] },
    { val: 70, color: [245, 140, 40, 240] },
    { val: 90, color: [225, 40, 40, 255] },
    { val: 100, color: [160, 10, 140, 255] },
  ],
  VARIANCE: [
    { val: 0, color: [245, 245, 245, 0] },
    { val: 1, color: [230, 245, 200, 140] },
    { val: 3, color: [255, 235, 130, 180] },
    { val: 6, color: [255, 180, 70, 220] },
    { val: 10, color: [240, 100, 50, 240] },
    { val: 16, color: [210, 30, 30, 255] },
    { val: 25, color: [130, 10, 20, 255] },
  ],
  PRECIP_TYPE: [
    { val: 0, color: [240, 240, 240, 0] },
    { val: 1, color: [60, 180, 75, 255] },
    { val: 2, color: [70, 150, 240, 255] },
    { val: 3, color: [245, 160, 30, 255] },
    { val: 4, color: [220, 30, 180, 255] },
  ],
  HAZARDS: [
    { val: 0, color: [240, 240, 240, 0] },
    { val: 1, color: [255, 220, 0, 220] },
    { val: 2, color: [255, 130, 0, 240] },
    { val: 3, color: [230, 30, 30, 255] },
  ],
};

config.colormaps = { ...config.colormaps, ...NEW_COLORMAPS };

function getRenderOptions(dataPath) {
  const p = dataPath.toUpperCase();
  if (p.includes("MCR") || p.includes("RADAR_COMBINATION_REFLECTIVITY") || p.includes("REF_FST") || p.includes("TDMOSAIC")) {
    return { colormap: "RADAR", showRaster: true, showFill: false, showLine: false };
  }
  if (p.includes("MTOP")) {
    return { colormap: "ECHO_TOP", showRaster: true, showFill: false, showLine: false };
  }
  if (p.includes("MVIL")) {
    return { colormap: "VIL", showRaster: true, showFill: false, showLine: false };
  }
  if (p.includes("QPE") || p.includes("QPF")) {
    return { colormap: "QPE", showRaster: true, showFill: false, showLine: false };
  }
  if (p.includes("PRECIPITATION_TYPE")) {
    return { colormap: "PRECIP_TYPE", showRaster: true, showFill: false, showLine: false };
  }
  if (p.includes("HAIL") || p.includes("WINDY") || p.includes("FOG") || p.includes("HAZE") || p.includes("GALE") || p.includes("HEAVY_RAIN") || p.includes("SAND") || p.includes("THUNDER")) {
    return { colormap: "HAZARDS", showRaster: true, showFill: false, showLine: false };
  }
  if (p.includes("PROBABILITY")) {
    return { colormap: "PROBABILITY", showRaster: true, showFill: false, showLine: false };
  }
  if (p.includes("VARIANCE")) {
    return { colormap: "VARIANCE", showFill: true, showLine: true, lineWidth: 1.5, lineColor: "#f85149" };
  }
  if (p.includes("CAPE") || p.includes("CIN") || p.includes("DCAPE") || p.includes("SWEAT") || p.includes("K_INDEX")) {
    return { colormap: "CAPE", showFill: true, showLine: true, lineWidth: 1.5, lineColor: "#e3b341" };
  }
  if (p.includes("HELICITY") || p.includes("UPDRAFT_HELICITY") || p.includes("PVORT")) {
    return { colormap: "HELICITY", showFill: true, showLine: true, lineWidth: 1.5, lineColor: "#3fb950" };
  }
  if (p.includes("SNOW") || p.includes("SNOD") || p.includes("ASNOW") || p.includes("WATER_EQUIVALENT")) {
    return { colormap: "SNOW", showFill: true, showLine: false };
  }
  if (p.includes("SST")) {
    return { colormap: "SST", showFill: true, showLine: true, lineWidth: 1.5, lineColor: "#58a6ff" };
  }
  if (p.includes("TCWV") || p.includes("TCW")) {
    return { colormap: "TCWV", showFill: true, showLine: true, lineWidth: 1.5, lineColor: "#58a6ff" };
  }
  if (p.includes("WIND") || p.includes("GUST") || p.includes("UGRD") || p.includes("VGRD") || p.includes("SHEAR")) {
    return { colormap: "WIND", showFill: true, showLine: true, lineWidth: 1.5, lineColor: "#58a6ff" };
  }
  if (p.includes("RAIN") || p.includes("APCP")) {
    return { colormap: "RAIN", showFill: true, showLine: false };
  }
  if (p.includes("TMP") || p.includes("TMAX") || p.includes("TMIN") || p.includes("ZERO_DEGREE_LEVEL")) {
    return { colormap: "TMP", showFill: true, showLine: true, lineWidth: 1.5, lineColor: "#f85149" };
  }
  return { colormap: "TMP", showFill: true, showLine: true, lineWidth: 1.5, lineColor: "#58a6ff" };
}

function getCategory(item) {
  const p = item.dataPath;
  if (p.startsWith("SWAN_PRODUCT/") || p.includes("LIGHTNING") || p.includes("UPDRAFT_HELICITY") || (p.includes("DCAPE") && p.startsWith("GRAPES_3KM")) || p.includes("RADAR_COMBINATION_REFLECTIVITY")) {
    return "强对流与短临 (Severe Convective & Nowcasting)";
  }
  if (p.startsWith("NWFD_SCMOC")) {
    return "智能网格预报 (National Gridded Guidance)";
  }
  if (p.startsWith("SURFACE/") || p.startsWith("MARINE/") || p.startsWith("WIND_PROFILER/")) {
    return "高密地面与海洋观测 (High-Density Observations)";
  }
  if (p.startsWith("ECMWF_HR/") || p.startsWith("GRAPES_GFS/") || p.startsWith("GRAPES_3KM/")) {
    return "数值预报高影响要素 (High-Impact NWP Fields)";
  }
  if (p.startsWith("CLDAS/")) {
    return "实况融合 (Land Surface Reanalysis)";
  }
  if (p.startsWith("ECMWF_ENSEMBLE_PRODUCT/")) {
    return "集合预报与概率 (Ensemble & Probability)";
  }
  if (p.startsWith("FORECAST_PRODUCT/")) {
    return "预报员指导 (Forecaster Guidance)";
  }
  return "Other Presets";
}

const newPresets = [];

// 1. Grouped PVORT Preset
newPresets.push({
  category: "数值预报高影响要素 (High-Impact NWP Fields)",
  hasLevel: true,
  defaultLevel: 500,
  levels: [10, 20, 50, 70, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 850, 900, 925, 950, 1000],
  id: "preset-ecmwf_pvort",
  name: "位涡多层分析 (10-1000hPa) / ECMWF Potential Vorticity (PVORT)",
  layers: [
    {
      id: "layer-ecmwf_pvort",
      name: "ECMWF PVORT (10-1000hPa)",
      type: "contour",
      model: "ECMWF_HR",
      element: "PVORT",
      path: "ECMWF_HR/PVORT",
      level: 500,
      render: {
        colormap: "HELICITY",
        showFill: true,
        showLine: true,
        lineWidth: 1.5,
        lineColor: "#58a6ff",
      },
    },
  ],
});

// Filter to active Tier 1 and Tier 2 datasets
const targetItems = manifest.filter((item) => (item.tier === 1 || item.tier === 2));

for (const item of targetItems) {
  // Skip individual PVORT entries since they are consolidated in preset-ecmwf_pvort
  if (item.dataPath.startsWith("ECMWF_HR/PVORT/")) {
    continue;
  }

  const category = getCategory(item);
  const parts = item.dataPath.split("/");
  const model = parts[0];
  const element = parts.slice(1).join("/");
  const displayName = `${item.name_zh} / ${item.name_en}`;
  const presetId = `preset-${item.id}`;
  const layerId = `layer-${item.id}`;

  let layerType = "contour";
  let hasLevel = false;
  let defaultLevel = undefined;
  let levels = undefined;
  let isObservation = Boolean(item.format === "station" || item.format === "wind_profiler" || item.format === "lightning" || item.format === "swan_text" || item.table === "CLDAS" || item.table === "SURFACE" || item.table === "MARINE" || item.table === "SWAN_PRODUCT");
  let eventType = undefined;
  let product = undefined;
  let stationId = undefined;

  let render = getRenderOptions(item.dataPath);

  if (item.format === "wind_profiler") {
    layerType = "profiler";
    product = item.dataPath.includes("RAD") ? "RAD" : "ROBS";
    stationId = "54511";
  } else if (item.format === "swan_text" || item.format === "lightning") {
    layerType = "event";
    if (item.dataPath.includes("LIGHTNING")) eventType = "lightning";
    else if (item.dataPath.includes("TVS")) eventType = "tvs";
    else if (item.dataPath.includes("HAIL")) eventType = "hail";
    else if (item.dataPath.includes("GALE")) eventType = "gale";
    else eventType = "default";
  } else if (item.format === "station") {
    layerType = "station";
    render = {
      showTemp: true,
      showDewpoint: true,
      showPressure: true,
      showWind: true,
      showVisibility: true,
    };
  } else if (item.format === "grid_type_11" || item.dataPath.endsWith("WIND") || item.dataPath.includes("COTRECWIND")) {
    layerType = "wind";
    render = {
      colormap: "WIND",
      showWind: false,
      showBarbs: true,
      showRaster: false,
      keepWind: true,
    };
  }

  if (item.dataPath.includes("TDMOSAIC")) {
    hasLevel = true;
    defaultLevel = 500;
    levels = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 7000, 8000, 9000, 10000, 12000, 14000, 15500, 17000, 19000];
  }

  const layerDef = {
    id: layerId,
    name: displayName,
    type: layerType,
    model,
    element,
    path: item.dataPath,
    render,
  };

  if (eventType) layerDef.eventType = eventType;
  if (product) layerDef.product = product;
  if (stationId) layerDef.stationId = stationId;
  if (hasLevel) layerDef.level = defaultLevel;

  const presetDef = {
    category,
    hasLevel,
    id: presetId,
    name: displayName,
    isObservation,
    layers: [layerDef],
  };

  if (hasLevel) {
    presetDef.defaultLevel = defaultLevel;
    presetDef.levels = levels;
  }

  newPresets.push(presetDef);
}

// Retain all existing non-generated presets from origin/main
const existingNonGenerated = config.presets.filter((p) => {
  if (!p || p.divider) return true;
  return !p.id?.startsWith("preset-");
});

config.presets = [...existingNonGenerated, ...newPresets];

// Keep color arrays formatted compactly on one line
const jsonStr = JSON.stringify(config, null, 2).replace(
  /\[\s+(-?\d+(?:\.\d+)?),\s+(-?\d+(?:\.\d+)?),\s+(-?\d+(?:\.\d+)?),\s+(-?\d+(?:\.\d+)?)\s+\]/g,
  "[$1, $2, $3, $4]"
);

writeFileSync(CONFIG_PATH, jsonStr + "\n", "utf8");
console.log(`Successfully generated ${newPresets.length} new presets across 7 categories into ${CONFIG_PATH}`);
