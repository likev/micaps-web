// colorPresets.js - Meteorological recommended colors, ramps, and recent-color store

export const MET_LINE_COLORS = [
  // Canonical 6
  { hex: "#58a6ff", name: "HGT blue", use: "height contours" },
  { hex: "#f85149", name: "TMP red", use: "temperature isotherms" },
  { hex: "#e3b341", name: "DTD gold", use: "dewpoint depression" },
  { hex: "#c678dd", name: "VOR purple", use: "vorticity contours" },
  { hex: "#56d4dd", name: "DIV cyan", use: "divergence contours" },
  { hex: "#ffffff", name: "White default", use: "standard neutral" },

  // Synoptic 8
  { hex: "#1f6feb", name: "SLP navy", use: "sea level pressure isobars" },
  { hex: "#79c0ff", name: "Isoband edge", use: "light highlight" },
  { hex: "#39c5bb", name: "Freezing isotherm", use: "0°C isotherm" },
  { hex: "#f2cc60", name: "Subtropical-ridge yellow", use: "ridge line / axis" },
  { hex: "#f0883e", name: "Jet-stream orange", use: "jet stream core" },
  { hex: "#56d364", name: "Rain green", use: "precipitation boundaries" },
  { hex: "#8b949e", name: "Calm gray", use: "secondary / neutral isolines" },
  { hex: "#ff7b72", name: "Alert red", use: "severe weather / thermal axis" },

  // Extended 6
  { hex: "#ff9ece", name: "Magenta", use: "frontogenesis / convective boundary" },
  { hex: "#b8e62e", name: "Lime", use: "instability / moisture tongue" },
  { hex: "#0e9b8b", name: "Teal dark", use: "marine wind / surface moisture" },
  { hex: "#8256d0", name: "Violet deep", use: "stratospheric / upper level anomaly" },
  { hex: "#d2a679", name: "Sand", use: "dust / dry intrusion" },
  { hex: "#b3f0ff", name: "Ice", use: "icing / high cloud boundary" },
];

export function getRecommendedLineColor(element) {
  const el = (element || "").toUpperCase();
  switch (el) {
    case "HGT":
      return "#58a6ff";
    case "TMP":
      return "#f85149";
    case "DTD":
      return "#e3b341";
    case "VOR":
      return "#c678dd";
    case "DIV":
      return "#56d4dd";
    case "SLP":
      return "#1f6feb";
    case "WIND":
    case "STREAMLINES":
      return "#79c0ff";
    case "RH":
    case "TD":
      return "#39c5bb";
    case "RAIN":
    case "RAIN6":
      return "#56d364";
    default:
      return "#ffffff";
  }
}

export const BUILTIN_COLORMAP_PRESETS = [
  // 1-8: Built-in colormaps matching default colormaps in colormaps.js
  {
    key: "TMP",
    label: "TMP (Temperature Standard)",
    family: "Thermal",
    elementHint: "TMP",
    stops: [
      { val: -40, color: [130, 20, 160, 255] },
      { val: -30, color: [40, 50, 180, 255] },
      { val: -20, color: [30, 120, 220, 255] },
      { val: -10, color: [70, 190, 230, 255] },
      { val: 0, color: [180, 240, 240, 255] },
      { val: 10, color: [100, 210, 110, 255] },
      { val: 18, color: [180, 230, 80, 255] },
      { val: 24, color: [250, 220, 50, 255] },
      { val: 28, color: [245, 140, 40, 255] },
      { val: 35, color: [230, 50, 40, 255] },
      { val: 40, color: [160, 20, 50, 255] },
    ],
  },
  {
    key: "WIND",
    label: "WIND (Speed Ramp)",
    family: "Kinematics",
    elementHint: "WIND",
    stops: [
      { val: 0, color: [220, 240, 255, 0] },
      { val: 2, color: [170, 220, 250, 0] },
      { val: 6, color: [120, 190, 245, 140] },
      { val: 12, color: [70, 200, 120, 180] },
      { val: 18, color: [230, 210, 50, 220] },
      { val: 25, color: [240, 120, 40, 240] },
      { val: 32, color: [230, 40, 40, 255] },
      { val: 45, color: [160, 20, 120, 255] },
    ],
  },
  {
    key: "RH",
    label: "RH (Relative Humidity)",
    family: "Moisture",
    elementHint: "RH",
    stops: [
      { val: 0, color: [245, 245, 245, 0] },
      { val: 45, color: [220, 240, 255, 0] },
      { val: 60, color: [160, 215, 255, 150] },
      { val: 70, color: [90, 175, 245, 190] },
      { val: 80, color: [40, 120, 220, 220] },
      { val: 90, color: [20, 60, 180, 240] },
      { val: 100, color: [10, 20, 120, 255] },
    ],
  },
  {
    key: "HGT",
    label: "HGT (Geopotential Height)",
    family: "Pressure/Height",
    elementHint: "HGT",
    stops: [
      { val: 0, color: [30, 50, 140, 255] },
      { val: 1500, color: [50, 100, 210, 255] },
      { val: 3000, color: [70, 160, 235, 255] },
      { val: 5000, color: [100, 210, 200, 255] },
      { val: 5600, color: [140, 230, 130, 255] },
      { val: 5880, color: [230, 220, 50, 255] },
      { val: 7000, color: [245, 140, 40, 255] },
      { val: 9000, color: [230, 50, 40, 255] },
      { val: 12000, color: [190, 20, 100, 255] },
      { val: 17000, color: [130, 20, 160, 255] },
    ],
  },
  {
    key: "RAIN",
    label: "RAIN (Precipitation)",
    family: "Moisture",
    elementHint: "RAIN",
    stops: [
      { val: 0.1, color: [166, 242, 143, 220] },
      { val: 1, color: [61, 186, 61, 230] },
      { val: 10, color: [97, 184, 255, 240] },
      { val: 25, color: [0, 0, 255, 255] },
      { val: 50, color: [250, 0, 250, 255] },
      { val: 100, color: [128, 0, 64, 255] },
      { val: 250, color: [80, 0, 0, 255] },
    ],
  },
  {
    key: "DTD",
    label: "DTD (Dewpoint Depression)",
    family: "Moisture",
    elementHint: "DTD",
    stops: [
      { val: 0, color: [20, 90, 200, 255] },
      { val: 2, color: [40, 160, 140, 255] },
      { val: 5, color: [90, 190, 90, 255] },
      { val: 8, color: [220, 220, 80, 255] },
      { val: 12, color: [240, 150, 40, 255] },
      { val: 18, color: [220, 70, 40, 255] },
      { val: 30, color: [140, 40, 30, 255] },
    ],
  },
  {
    key: "VOR",
    label: "VOR (Relative Vorticity)",
    family: "Kinematics",
    elementHint: "VOR",
    stops: [
      { val: -20, color: [30, 60, 180, 255] },
      { val: -10, color: [60, 120, 220, 255] },
      { val: -4, color: [140, 190, 240, 255] },
      { val: -2, color: [200, 225, 250, 255] },
      { val: 0, color: [240, 240, 240, 0] },
      { val: 2, color: [254, 224, 182, 255] },
      { val: 4, color: [253, 174, 97, 255] },
      { val: 10, color: [227, 74, 51, 255] },
      { val: 20, color: [179, 0, 0, 255] },
    ],
  },
  {
    key: "DIV",
    label: "DIV (Horizontal Divergence)",
    family: "Kinematics",
    elementHint: "DIV",
    stops: [
      { val: -20, color: [118, 42, 131, 255] },
      { val: -10, color: [153, 112, 171, 255] },
      { val: -4, color: [194, 165, 207, 255] },
      { val: -2, color: [231, 212, 232, 255] },
      { val: 0, color: [245, 245, 245, 0] },
      { val: 2, color: [254, 224, 182, 255] },
      { val: 4, color: [253, 174, 97, 255] },
      { val: 10, color: [227, 74, 51, 255] },
      { val: 20, color: [179, 0, 0, 255] },
    ],
  },

  // 9-20: 12 curated additions
  {
    key: "SLP-blue",
    label: "SLP-blue (Mean Sea Level Pressure)",
    family: "Pressure/Height",
    elementHint: "SLP",
    stops: [
      { val: 980, color: [160, 20, 50, 255] },
      { val: 995, color: [230, 90, 40, 255] },
      { val: 1010, color: [240, 240, 240, 180] },
      { val: 1020, color: [70, 170, 230, 255] },
      { val: 1030, color: [30, 100, 210, 255] },
      { val: 1045, color: [20, 40, 140, 255] },
    ],
  },
  {
    key: "TMP-extreme",
    label: "TMP-extreme (−60…45°C Extended)",
    family: "Thermal",
    elementHint: "TMP",
    stops: [
      { val: -60, color: [75, 0, 130, 255] },
      { val: -40, color: [130, 20, 160, 255] },
      { val: -20, color: [30, 120, 220, 255] },
      { val: -10, color: [70, 190, 230, 255] },
      { val: 0, color: [180, 240, 240, 255] },
      { val: 10, color: [100, 210, 110, 255] },
      { val: 25, color: [250, 220, 50, 255] },
      { val: 35, color: [230, 50, 40, 255] },
      { val: 45, color: [120, 0, 20, 255] },
    ],
  },
  {
    key: "RAIN-log",
    label: "RAIN-log (Log-Spaced Precip)",
    family: "Moisture",
    elementHint: "RAIN",
    stops: [
      { val: 0.1, color: [210, 245, 200, 180] },
      { val: 0.5, color: [140, 225, 130, 200] },
      { val: 2, color: [50, 180, 50, 220] },
      { val: 10, color: [30, 140, 240, 240] },
      { val: 50, color: [220, 20, 220, 255] },
      { val: 250, color: [110, 0, 30, 255] },
    ],
  },
  {
    key: "VIS-gray",
    label: "VIS-gray (Visibility/Fog)",
    family: "Aviation",
    elementHint: "VIS",
    stops: [
      { val: 0, color: [255, 255, 255, 255] },
      { val: 500, color: [250, 200, 100, 255] },
      { val: 1000, color: [220, 140, 60, 220] },
      { val: 3000, color: [150, 150, 160, 180] },
      { val: 10000, color: [60, 70, 80, 100] },
    ],
  },
  {
    key: "WIND-jet",
    label: "WIND-jet (Jet Stream Emphasis)",
    family: "Kinematics",
    elementHint: "WIND",
    stops: [
      { val: 0, color: [200, 220, 240, 0] },
      { val: 20, color: [100, 180, 240, 120] },
      { val: 30, color: [240, 210, 50, 200] },
      { val: 40, color: [240, 110, 30, 240] },
      { val: 50, color: [220, 30, 30, 255] },
      { val: 65, color: [160, 0, 150, 255] },
    ],
  },
  {
    key: "RH-night",
    label: "RH-night (Dark Background RH)",
    family: "Moisture",
    elementHint: "RH",
    stops: [
      { val: 0, color: [20, 25, 35, 0] },
      { val: 50, color: [25, 60, 100, 100] },
      { val: 70, color: [30, 110, 180, 180] },
      { val: 85, color: [40, 170, 220, 220] },
      { val: 95, color: [100, 230, 230, 255] },
      { val: 100, color: [220, 255, 255, 255] },
    ],
  },
  {
    key: "HGT-dam",
    label: "HGT-dam (Sounding Decameters 500-600)",
    family: "Pressure/Height",
    elementHint: "HGT",
    stops: [
      { val: 500, color: [40, 80, 180, 255] },
      { val: 540, color: [80, 170, 220, 255] },
      { val: 560, color: [120, 210, 140, 255] },
      { val: 580, color: [240, 210, 60, 255] },
      { val: 600, color: [220, 40, 40, 255] },
    ],
  },
  {
    key: "CAPE-green",
    label: "CAPE-green (Convective Energy J/kg)",
    family: "Thermodynamic",
    elementHint: "CAPE",
    stops: [
      { val: 0, color: [240, 240, 240, 0] },
      { val: 500, color: [180, 230, 150, 180] },
      { val: 1000, color: [100, 200, 80, 220] },
      { val: 2000, color: [240, 220, 50, 240] },
      { val: 3000, color: [230, 110, 30, 255] },
      { val: 4000, color: [180, 20, 40, 255] },
    ],
  },
  {
    key: "RADAR-dBZ",
    label: "RADAR-dBZ (Reflectivity −10…75 dBZ)",
    family: "Radar",
    elementHint: "RADAR",
    stops: [
      { val: -10, color: [60, 60, 60, 0] },
      { val: 10, color: [4, 233, 231, 200] },
      { val: 20, color: [1, 159, 244, 220] },
      { val: 30, color: [0, 0, 246, 240] },
      { val: 40, color: [0, 255, 0, 255] },
      { val: 50, color: [255, 255, 0, 255] },
      { val: 60, color: [255, 0, 0, 255] },
      { val: 75, color: [214, 0, 255, 255] },
    ],
  },
  {
    key: "TD-dewpoint",
    label: "TD-dewpoint (Moisture −20…30°C)",
    family: "Moisture",
    elementHint: "TD",
    stops: [
      { val: -20, color: [150, 120, 90, 200] },
      { val: -5, color: [180, 200, 150, 220] },
      { val: 10, color: [100, 190, 140, 240] },
      { val: 18, color: [40, 160, 150, 255] },
      { val: 24, color: [20, 110, 150, 255] },
      { val: 30, color: [10, 50, 120, 255] },
    ],
  },
  {
    key: "GRAY-print",
    label: "GRAY-print (Grayscale for Print)",
    family: "Special",
    elementHint: null,
    stops: [
      { val: 0, color: [240, 240, 240, 255] },
      { val: 25, color: [190, 190, 190, 255] },
      { val: 50, color: [130, 130, 130, 255] },
      { val: 75, color: [80, 80, 80, 255] },
      { val: 100, color: [20, 20, 20, 255] },
    ],
  },
  {
    key: "OCEAN-depth",
    label: "OCEAN-depth (SST / Marine Backdrop)",
    family: "Marine",
    elementHint: "SST",
    stops: [
      { val: -2, color: [230, 245, 255, 255] },
      { val: 5, color: [150, 210, 245, 255] },
      { val: 15, color: [70, 150, 220, 255] },
      { val: 24, color: [20, 90, 180, 255] },
      { val: 30, color: [10, 40, 120, 255] },
      { val: 35, color: [5, 15, 60, 255] },
    ],
  },
];

export function findPreset(key) {
  if (!key) return null;
  const up = key.toUpperCase();
  return BUILTIN_COLORMAP_PRESETS.find((p) => p.key === key || p.key.toUpperCase() === up) || null;
}

const RECENT_COLORS_KEY = "micaps-recent-colors";
const MAX_RECENT_COLORS = 8;

export function getRecentColors() {
  try {
    if (typeof localStorage === "undefined") return [];
    const stored = localStorage.getItem(RECENT_COLORS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return parsed.filter((c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c));
    }
  } catch {}
  return [];
}

export function addRecentColor(hex) {
  if (!hex || typeof hex !== "string" || !/^#[0-9a-f]{6}$/i.test(hex)) return;
  try {
    if (typeof localStorage === "undefined") return;
    const lower = hex.toLowerCase();
    const current = getRecentColors().filter((c) => c.toLowerCase() !== lower);
    current.unshift(lower);
    if (current.length > MAX_RECENT_COLORS) {
      current.length = MAX_RECENT_COLORS;
    }
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(current));
  } catch {}
}
