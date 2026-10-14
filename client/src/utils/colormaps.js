// colormaps.js - Runtime-loaded meteorological color palettes

export const DEFAULT_COLORMAPS = {
  TMP: [
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
  WIND: [
    { val: 0, color: [220, 240, 255, 0] },
    { val: 2, color: [170, 220, 250, 0] },
    { val: 6, color: [120, 190, 245, 140] },
    { val: 12, color: [70, 200, 120, 180] },
    { val: 18, color: [230, 210, 50, 220] },
    { val: 25, color: [240, 120, 40, 240] },
    { val: 32, color: [230, 40, 40, 255] },
    { val: 45, color: [160, 20, 120, 255] },
  ],
  RH: [
    { val: 0, color: [245, 245, 245, 0] },
    { val: 45, color: [220, 240, 255, 0] },
    { val: 60, color: [160, 215, 255, 150] },
    { val: 70, color: [90, 175, 245, 190] },
    { val: 80, color: [40, 120, 220, 220] },
    { val: 90, color: [20, 60, 180, 240] },
    { val: 100, color: [10, 20, 120, 255] },
  ],
  HGT: [
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
  RAIN: [
    { val: 0.1, color: [166, 242, 143, 220] },
    { val: 1, color: [61, 186, 61, 230] },
    { val: 10, color: [97, 184, 255, 240] },
    { val: 25, color: [0, 0, 255, 255] },
    { val: 50, color: [250, 0, 250, 255] },
    { val: 100, color: [128, 0, 64, 255] },
    { val: 250, color: [80, 0, 0, 255] },
  ],
  RAIN12: [
    { val: 0.1, color: [166, 242, 143, 220] },
    { val: 1, color: [61, 186, 61, 230] },
    { val: 10, color: [97, 184, 255, 240] },
    { val: 25, color: [0, 0, 255, 255] },
    { val: 50, color: [250, 0, 250, 255] },
    { val: 100, color: [128, 0, 64, 255] },
    { val: 250, color: [80, 0, 0, 255] },
  ],
  RAIN6: [
    { val: 0.1, color: [166, 242, 143, 220] },
    { val: 1, color: [61, 186, 61, 230] },
    { val: 10, color: [97, 184, 255, 240] },
    { val: 25, color: [0, 0, 255, 255] },
    { val: 50, color: [250, 0, 250, 255] },
    { val: 100, color: [128, 0, 64, 255] },
    { val: 250, color: [80, 0, 0, 255] },
  ],
  RAIN24: [
    { val: 0.1, color: [166, 242, 143, 220] },
    { val: 10, color: [61, 186, 61, 230] },
    { val: 25, color: [97, 184, 255, 240] },
    { val: 50, color: [0, 0, 255, 255] },
    { val: 100, color: [250, 0, 250, 255] },
    { val: 250, color: [128, 0, 64, 255] },
  ],
  DTD: [
    { val: 0, color: [20, 90, 200, 255] },
    { val: 2, color: [40, 160, 140, 255] },
    { val: 5, color: [90, 190, 90, 255] },
    { val: 8, color: [220, 220, 80, 255] },
    { val: 12, color: [240, 150, 40, 255] },
    { val: 18, color: [220, 70, 40, 255] },
    { val: 30, color: [140, 40, 30, 255] },
  ],
  VOR: [
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
  DIV: [
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
  K_INDEX: [
    { val: 0, color: [240, 240, 240, 0] },
    { val: 15, color: [160, 220, 240, 180] },
    { val: 20, color: [100, 190, 220, 220] },
    { val: 25, color: [120, 210, 120, 240] },
    { val: 30, color: [240, 220, 60, 255] },
    { val: 35, color: [245, 140, 40, 255] },
    { val: 40, color: [230, 40, 40, 255] },
    { val: 45, color: [160, 20, 160, 255] },
  ],
  SHOWALTER: [
    { val: -8, color: [160, 20, 160, 255] },
    { val: -6, color: [220, 30, 30, 255] },
    { val: -4, color: [245, 120, 30, 255] },
    { val: -2, color: [245, 200, 50, 255] },
    { val: 0, color: [240, 240, 240, 0] },
    { val: 2, color: [140, 210, 230, 180] },
    { val: 6, color: [60, 140, 210, 240] },
  ],
  LIFTED: [
    { val: -8, color: [160, 20, 160, 255] },
    { val: -6, color: [220, 30, 30, 255] },
    { val: -4, color: [245, 120, 30, 255] },
    { val: -2, color: [245, 200, 50, 255] },
    { val: 0, color: [240, 240, 240, 0] },
    { val: 2, color: [140, 210, 230, 180] },
    { val: 6, color: [60, 140, 210, 240] },
  ],
  SWEAT: [
    { val: 100, color: [240, 240, 240, 0] },
    { val: 200, color: [100, 200, 220, 200] },
    { val: 250, color: [120, 220, 100, 240] },
    { val: 300, color: [240, 210, 50, 255] },
    { val: 350, color: [240, 130, 30, 255] },
    { val: 400, color: [220, 30, 30, 255] },
    { val: 500, color: [160, 20, 160, 255] },
  ],
  TT: [
    { val: 35, color: [240, 240, 240, 0] },
    { val: 44, color: [100, 200, 220, 220] },
    { val: 48, color: [240, 210, 50, 255] },
    { val: 52, color: [240, 130, 30, 255] },
    { val: 56, color: [220, 30, 30, 255] },
    { val: 65, color: [160, 20, 160, 255] },
  ],
  SHEAR: [
    { val: 0, color: [240, 240, 240, 0] },
    { val: 6, color: [120, 190, 245, 140] },
    { val: 12, color: [70, 200, 120, 180] },
    { val: 18, color: [230, 210, 50, 220] },
    { val: 25, color: [240, 120, 40, 240] },
    { val: 35, color: [230, 40, 40, 255] },
    { val: 45, color: [160, 20, 120, 255] },
  ],
  THICKNESS: [
    { val: 5100, color: [30, 50, 140, 255] },
    { val: 5280, color: [70, 160, 235, 255] },
    { val: 5400, color: [100, 210, 200, 255] },
    { val: 5520, color: [140, 230, 130, 255] },
    { val: 5640, color: [230, 220, 50, 255] },
    { val: 5760, color: [245, 140, 40, 255] },
    { val: 5880, color: [230, 50, 40, 255] },
  ],
  T_VAR: [
    { val: -16, color: [20, 30, 140, 255] },
    { val: -12, color: [30, 80, 200, 255] },
    { val: -8, color: [50, 140, 230, 255] },
    { val: -4, color: [120, 200, 245, 230] },
    { val: -2, color: [190, 235, 250, 200] },
    { val: 0, color: [245, 245, 245, 0] },
    { val: 2, color: [254, 230, 170, 200] },
    { val: 4, color: [253, 175, 95, 230] },
    { val: 8, color: [235, 95, 55, 255] },
    { val: 12, color: [200, 30, 30, 255] },
    { val: 16, color: [130, 15, 20, 255] },
  ],
  SLP_VAR: [
    { val: -16, color: [110, 30, 140, 255] },
    { val: -12, color: [30, 60, 180, 255] },
    { val: -8, color: [50, 130, 220, 255] },
    { val: -4, color: [130, 195, 245, 230] },
    { val: -2, color: [195, 235, 250, 200] },
    { val: 0, color: [245, 245, 245, 0] },
    { val: 2, color: [254, 230, 170, 200] },
    { val: 4, color: [253, 175, 95, 230] },
    { val: 8, color: [235, 95, 55, 255] },
    { val: 12, color: [190, 35, 35, 255] },
    { val: 16, color: [120, 15, 20, 255] },
  ],
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
  IR_TEMP: [
    { val: 180, color: [255, 255, 255, 255] },
    { val: 195, color: [200, 30, 200, 255] },
    { val: 210, color: [230, 40, 40, 255] },
    { val: 220, color: [245, 140, 40, 255] },
    { val: 230, color: [250, 220, 50, 255] },
    { val: 240, color: [50, 180, 50, 255] },
    { val: 250, color: [40, 140, 220, 255] },
    { val: 260, color: [140, 200, 240, 220] },
    { val: 275, color: [200, 200, 200, 180] },
    { val: 290, color: [140, 140, 140, 220] },
    { val: 305, color: [80, 80, 80, 255] },
    { val: 320, color: [30, 30, 30, 255] },
  ],
  ALBEDO: [
    { val: 0, color: [0, 0, 0, 255] },
    { val: 10, color: [35, 35, 35, 255] },
    { val: 25, color: [75, 75, 75, 255] },
    { val: 50, color: [140, 140, 140, 255] },
    { val: 75, color: [200, 200, 200, 255] },
    { val: 100, color: [255, 255, 255, 255] },
  ],
  WV: [
    { val: 190, color: [255, 255, 255, 255] },
    { val: 205, color: [160, 30, 180, 255] },
    { val: 215, color: [40, 90, 220, 255] },
    { val: 225, color: [40, 180, 220, 255] },
    { val: 235, color: [50, 190, 90, 255] },
    { val: 245, color: [240, 210, 40, 255] },
    { val: 255, color: [220, 110, 30, 255] },
    { val: 265, color: [120, 50, 20, 255] },
    { val: 275, color: [60, 20, 10, 255] },
  ],
  CTT: [
    { val: 180, color: [255, 255, 255, 255] },
    { val: 195, color: [200, 30, 200, 255] },
    { val: 210, color: [230, 40, 40, 255] },
    { val: 220, color: [245, 140, 40, 255] },
    { val: 230, color: [250, 220, 50, 255] },
    { val: 240, color: [50, 180, 50, 255] },
    { val: 250, color: [40, 140, 220, 255] },
    { val: 265, color: [140, 200, 240, 220] },
    { val: 280, color: [180, 180, 180, 180] },
    { val: 300, color: [100, 100, 100, 220] },
    { val: 320, color: [30, 30, 30, 255] },
  ],
  DUST: [
    { val: 0, color: [240, 240, 240, 0] },
    { val: 10, color: [254, 237, 177, 160] },
    { val: 25, color: [254, 209, 114, 200] },
    { val: 50, color: [230, 150, 50, 240] },
    { val: 75, color: [180, 90, 30, 255] },
    { val: 100, color: [120, 40, 10, 255] },
  ],
};

const FALLBACK_COLORMAP = DEFAULT_COLORMAPS.TMP;

export let COLORMAPS = { ...DEFAULT_COLORMAPS };

export function setColormaps(colormaps) {
  if (!colormaps || typeof colormaps !== "object" || Array.isArray(colormaps)) {
    throw new Error("Preset config colormaps must be an object");
  }

  // Preserve runtime custom palettes (e.g. "palette:layerId" or "/palettes/...")
  const preserved = {};
  for (const [k, v] of Object.entries(COLORMAPS)) {
    if (k.startsWith("palette:") || k.startsWith("/palettes/") || k.startsWith("palettes/") || k.startsWith("palette/")) {
      preserved[k] = v;
    }
  }

  const normalized = { ...DEFAULT_COLORMAPS, ...preserved };
  for (const [name, palette] of Object.entries(colormaps)) {
    if (!name || !Array.isArray(palette) || palette.length < 2) {
      throw new Error(`Colormap "${name}" must contain at least two stops`);
    }

    normalized[name] = palette.map((stop) => {
      if (!Number.isFinite(stop?.val) || !Array.isArray(stop.color) || (stop.color.length !== 3 && stop.color.length !== 4)) {
        throw new Error(`Colormap "${name}" contains an invalid stop`);
      }
      if (stop.color.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)) {
        throw new Error(`Colormap "${name}" contains an invalid color channel`);
      }
      return {
        val: stop.val,
        color: stop.color.length === 4 ? [...stop.color] : [...stop.color, 255],
      };
    }).sort((a, b) => a.val - b.val);
  }

  COLORMAPS = normalized;
}

export function isRainElement(name) {
  if (!name || typeof name !== "string") return false;
  const up = name.toUpperCase();
  if (up.includes("PRECIPITATION_TYPE") || up.includes("PRECIP_TYPE")) return false;
  const base = up.includes("/") ? up.split("/").pop() : up;
  if (base.includes("PRECIPITATION_TYPE") || base.includes("PRECIP_TYPE")) return false;
  return (
    base.startsWith("RAIN") ||
    base === "APCP" ||
    base === "TP" ||
    base.startsWith("PRECIP") ||
    base.startsWith("SNOW") ||
    up.includes("RAIN")
  );
}

export {
  isRain12Element,
  isRain01Element,
  isRain03Element,
  isRain06Element,
  isRain24Element,
  getRainAccumulationHours,
  getRainAccumulationHoursForWindow,
  isRainAccumulationElement,
  isWindowRainAccumulation,
  getDisabledPeriodsForRain,
} from "./rain12.js";

export function getColormap(reference = null, element = "TMP") {
  if (Array.isArray(reference)) return reference;

  const matchElement = (name) => {
    if (!name || typeof name !== "string") return null;
    const up = name.toUpperCase();
    if (COLORMAPS[name]) return COLORMAPS[name];
    if (COLORMAPS[up]) return COLORMAPS[up];
    const trimmed = name.replace(/^\//, "");
    if (COLORMAPS[trimmed]) return COLORMAPS[trimmed];
    if (COLORMAPS["/" + trimmed]) return COLORMAPS["/" + trimmed];
    if (up.includes("PROB")) return COLORMAPS.PROBABILITY || DEFAULT_COLORMAPS.PROBABILITY;
    if (up.includes("PRECIPITATION_TYPE") || up.includes("PRECIP_TYPE")) return COLORMAPS.PRECIP_TYPE || DEFAULT_COLORMAPS.PRECIP_TYPE;
    if (isRainElement(name)) return COLORMAPS.RAIN || DEFAULT_COLORMAPS.RAIN;
    if (up.includes("SLP_VAR") || up.includes("SLP-VAR") || (up.includes("SLP") && up.includes("VAR"))) {
      return COLORMAPS.SLP_VAR || DEFAULT_COLORMAPS.SLP_VAR;
    }
    if (up.includes("T_VAR") || up.includes("T-VAR") || (up.includes("TMP") && up.includes("VAR")) || (up.startsWith("T") && up.includes("VAR"))) {
      return COLORMAPS.T_VAR || DEFAULT_COLORMAPS.T_VAR;
    }
    if (up.includes("CAPE") || up.includes("DCAPE") || up.includes("CIN")) return COLORMAPS.CAPE || DEFAULT_COLORMAPS.CAPE;
    if (up.includes("HELICITY") || up.includes("UPDRAFT_HELICITY") || up.endsWith("_UH")) return COLORMAPS.HELICITY || DEFAULT_COLORMAPS.HELICITY;
    if (up.includes("DBZ") || up.includes("MCR") || up.includes("RADAR") || up.includes("REFLECTIVITY") || up.includes("REF_FST")) return COLORMAPS.RADAR || DEFAULT_COLORMAPS.RADAR;
    if (up.includes("MTOP") || up.includes("ECHO_TOP")) return COLORMAPS.ECHO_TOP || DEFAULT_COLORMAPS.ECHO_TOP;
    if (up.includes("MVIL") || up.includes("VIL")) return COLORMAPS.VIL || DEFAULT_COLORMAPS.VIL;
    if (up.includes("QPE") || up.includes("QPF")) return COLORMAPS.QPE || DEFAULT_COLORMAPS.QPE;
    if (up.includes("SNOW") || up.includes("SNOD") || up.includes("ASNOW")) return COLORMAPS.SNOW || DEFAULT_COLORMAPS.SNOW;
    if (up.includes("SST")) return COLORMAPS.SST || DEFAULT_COLORMAPS.SST;
    if (up.includes("TCWV")) return COLORMAPS.TCWV || DEFAULT_COLORMAPS.TCWV;
    if (up.includes("PROB")) return COLORMAPS.PROBABILITY || DEFAULT_COLORMAPS.PROBABILITY;
    if (up.includes("VARIANCE")) return COLORMAPS.VARIANCE || DEFAULT_COLORMAPS.VARIANCE;
    if (up.includes("PRECIPITATION_TYPE") || up.includes("PRECIP_TYPE")) return COLORMAPS.PRECIP_TYPE || DEFAULT_COLORMAPS.PRECIP_TYPE;
    if (up.includes("HAZARD") || up.includes("HAIL") || up.includes("GALE") || up.includes("WINDY") || up.includes("HEAVY_RAIN") || up.includes("FOG") || up.includes("HAZE")) return COLORMAPS.HAZARDS || DEFAULT_COLORMAPS.HAZARDS;
    if (up.includes("IR_TEMP") || up.includes("IR1") || up.includes("IR2") || up.includes("IR3") || up.includes("IR4") || up.includes("LWIR") || up.includes("WINDOW_IR")) return COLORMAPS.IR_TEMP || DEFAULT_COLORMAPS.IR_TEMP;
    if (up.includes("ALBEDO") || up.includes("VIS") || up.includes("SWIR")) return COLORMAPS.ALBEDO || DEFAULT_COLORMAPS.ALBEDO;
    if (up.includes("WV") || up.includes("WATER_VAPOR")) return COLORMAPS.WV || DEFAULT_COLORMAPS.WV;
    if (up.includes("CTT") || up.includes("CLOUD_TOP_TEMP")) return COLORMAPS.CTT || DEFAULT_COLORMAPS.CTT;
    if (up.includes("DUST")) return COLORMAPS.DUST || DEFAULT_COLORMAPS.DUST;
    return null;
  };

  const refMatch = matchElement(reference);
  if (refMatch) return refMatch;
  const elMatch = matchElement(element);
  if (elMatch) return elMatch;

  return COLORMAPS[element] || COLORMAPS.TMP || COLORMAPS.default || FALLBACK_COLORMAP;
}

export function createColorResolver(element = "TMP", colormap = null, zMin = undefined, zMax = undefined) {
  const palette = getColormap(colormap, element);
  if (!palette || palette.length === 0) {
    return (val, out, offset = 0) => {
      out[offset] = 100;
      out[offset + 1] = 150;
      out[offset + 2] = 240;
      out[offset + 3] = 255;
    };
  }
  if (palette.length === 1) {
    const [r, g, b, a] = palette[0].color;
    return (val, out, offset = 0) => {
      out[offset] = r;
      out[offset + 1] = g;
      out[offset + 2] = b;
      out[offset + 3] = a;
    };
  }

  const elUpper = (element || "").toUpperCase();
  const cmUpper = (typeof colormap === "string" ? colormap : "").toUpperCase();
  const isVariation = elUpper.includes("VAR") || cmUpper.includes("VAR");
  const isRain = isRainElement(element) || isRainElement(colormap) || cmUpper.includes("RAIN");

  // Fixed physical scale fields must NEVER be dynamically stretched:
  // RH (0..100%), WIND (0..45 m/s), TMP (-40..40 C), RAIN (0.1..250 mm), DTD (0..30 C), and Variations
  const isFixedPhysical = isVariation ||
                          elUpper === "RH" || cmUpper.includes("RH") ||
                          elUpper === "WIND" || cmUpper.includes("WIND") ||
                          (!isVariation && (elUpper === "TMP" || cmUpper.includes("TMP"))) ||
                          isRain ||
                          elUpper === "DTD" || cmUpper.includes("DTD") ||
                          elUpper === "RADAR" || cmUpper.includes("RADAR") || elUpper === "DBZ" || cmUpper.includes("DBZ") ||
                          elUpper === "PROBABILITY" || cmUpper.includes("PROB") ||
                          elUpper === "PRECIP_TYPE" || cmUpper.includes("PRECIP_TYPE") ||
                          elUpper === "HAZARDS" || cmUpper.includes("HAZARD") ||
                          elUpper === "IR_TEMP" || cmUpper.includes("IR_TEMP") ||
                          elUpper === "ALBEDO" || cmUpper.includes("ALBEDO") ||
                          elUpper === "WV" || cmUpper.includes("WV") ||
                          elUpper === "CTT" || cmUpper.includes("CTT") ||
                          elUpper === "DUST" || cmUpper.includes("DUST");

  const isHGT = (elUpper === "HGT" || cmUpper.includes("HGT")) && !isVariation;
  const isSLP = (elUpper === "SLP" || cmUpper.includes("SLP")) && !isVariation;
  const isAlbedo = elUpper === "ALBEDO" || cmUpper.includes("ALBEDO");

  const palMin = palette[0].val;
  const palMax = palette[palette.length - 1].val;
  const palLen = palette.length;
  const hgtScale = isHGT && palMax > 2500;
  const albedoFractionScale = isAlbedo && palMax >= 50 && zMax !== undefined && zMax <= 1.0;

  const canBeRelative = !isFixedPhysical && zMin !== undefined && zMax !== undefined && zMax > zMin;
  const effMin = (canBeRelative && hgtScale && zMax < 2500) ? zMin * 10 : zMin;
  const effMax = (canBeRelative && hgtScale && zMax < 2500) ? zMax * 10 : zMax;
  const relSpan = (canBeRelative && effMax > effMin) ? (effMax - effMin) : 0;
  const isAlwaysRelative = canBeRelative && relSpan > 0 && (isHGT || isSLP);

  return (val, out, offset = 0) => {
    let checkVal = val;
    if (hgtScale && val < 2500) {
      checkVal = val * 10;
    } else if (albedoFractionScale && val <= 1.0 && val >= 0) {
      checkVal = val * 100;
    }

    if (isFixedPhysical) {
      if (isRain && (checkVal < 0.1 || checkVal < palMin)) {
        out[offset] = 0; out[offset + 1] = 0; out[offset + 2] = 0; out[offset + 3] = 0;
        return;
      }
      if (checkVal <= palMin) {
        const c = palette[0].color;
        out[offset] = c[0]; out[offset + 1] = c[1]; out[offset + 2] = c[2]; out[offset + 3] = c[3];
        return;
      }
      if (checkVal >= palMax) {
        const c = palette[palLen - 1].color;
        out[offset] = c[0]; out[offset + 1] = c[1]; out[offset + 2] = c[2]; out[offset + 3] = c[3];
        return;
      }

      for (let i = 0; i < palLen - 1; i++) {
        const c0 = palette[i];
        const c1 = palette[i + 1];
        if (checkVal >= c0.val && checkVal <= c1.val) {
          const denom = c1.val - c0.val;
          const t = denom > 0 ? (checkVal - c0.val) / denom : 0;
          out[offset] = Math.round(c0.color[0] + t * (c1.color[0] - c0.color[0]));
          out[offset + 1] = Math.round(c0.color[1] + t * (c1.color[1] - c0.color[1]));
          out[offset + 2] = Math.round(c0.color[2] + t * (c1.color[2] - c0.color[2]));
          out[offset + 3] = Math.round(c0.color[3] + t * (c1.color[3] - c0.color[3]));
          return;
        }
      }
      const c = palette[0].color;
      out[offset] = c[0]; out[offset + 1] = c[1]; out[offset + 2] = c[2]; out[offset + 3] = c[3];
      return;
    }

    if (isAlwaysRelative || (relSpan > 0 && (checkVal < palMin || checkVal > palMax))) {
      const fraction = Math.max(0, Math.min(1, (checkVal - effMin) / relSpan));
      const targetIdx = fraction * (palLen - 1);
      const i0 = Math.floor(targetIdx);
      const i1 = Math.min(i0 + 1, palLen - 1);
      const t = targetIdx - i0;
      const c0 = palette[i0].color;
      const c1 = palette[i1].color;
      out[offset] = Math.round(c0[0] + t * (c1[0] - c0[0]));
      out[offset + 1] = Math.round(c0[1] + t * (c1[1] - c0[1]));
      out[offset + 2] = Math.round(c0[2] + t * (c1[2] - c0[2]));
      out[offset + 3] = Math.round(c0[3] + t * (c1[3] - c0[3]));
      return;
    }

    if (checkVal <= palMin) {
      const c = palette[0].color;
      out[offset] = c[0]; out[offset + 1] = c[1]; out[offset + 2] = c[2]; out[offset + 3] = c[3];
      return;
    }
    if (checkVal >= palMax) {
      const c = palette[palLen - 1].color;
      out[offset] = c[0]; out[offset + 1] = c[1]; out[offset + 2] = c[2]; out[offset + 3] = c[3];
      return;
    }

    for (let i = 0; i < palLen - 1; i++) {
      const c0 = palette[i];
      const c1 = palette[i + 1];
      if (checkVal >= c0.val && checkVal <= c1.val) {
        const denom = c1.val - c0.val;
        const t = denom > 0 ? (checkVal - c0.val) / denom : 0;
        out[offset] = Math.round(c0.color[0] + t * (c1.color[0] - c0.color[0]));
        out[offset + 1] = Math.round(c0.color[1] + t * (c1.color[1] - c0.color[1]));
        out[offset + 2] = Math.round(c0.color[2] + t * (c1.color[2] - c0.color[2]));
        out[offset + 3] = Math.round(c0.color[3] + t * (c1.color[3] - c0.color[3]));
        return;
      }
    }
    const c = palette[0].color;
    out[offset] = c[0]; out[offset + 1] = c[1]; out[offset + 2] = c[2]; out[offset + 3] = c[3];
  };
}

export function getColor(val, element = "TMP", colormap = null, zMin = undefined, zMax = undefined) {
  const resolver = createColorResolver(element, colormap, zMin, zMax);
  const out = [0, 0, 0, 0];
  resolver(val, out, 0);
  return out;
}

export function getHexColor(val, element = "TMP", colormap = null, zMin = undefined, zMax = undefined) {
  const [r, g, b, a] = getColor(val, element, colormap, zMin, zMax);
  if (a === 0) {
    return "rgba(0,0,0,0)";
  }
  return `rgb(${r},${g},${b})`;
}

export function getElementLevels(element = "TMP", zMin, zMax, colormap = null) {
  const palette = getColormap(colormap, element);
  const elUpper = (element || "").toUpperCase();
  const cmUpper = (typeof colormap === "string" ? colormap : "").toUpperCase();

  if (isRainElement(element) || isRainElement(colormap) || cmUpper.includes("RAIN")) {
    const rawLevels = (palette && palette.length >= 2)
      ? palette.map((s) => (s.val < 0.1 ? 0.1 : s.val))
      : [0.1, 1, 10, 25, 50, 100, 250];
    const uniqueSorted = Array.from(new Set(rawLevels)).sort((a, b) => a - b);
    return uniqueSorted.length >= 2 ? uniqueSorted : [0.1, 1, 10, 25, 50, 100, 250];
  }

  if (elUpper === "RH") {
    return [50, 60, 70, 80, 90, 100];
  }
  if (elUpper === "WIND") {
    return [4, 8, 12, 16, 20, 24, 28, 32, 40];
  }
  if (elUpper === "DTD") {
    return [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30];
  }
  if (elUpper === "VOR") {
    return [-20, -15, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 15, 20];
  }
  if (elUpper === "DIV") {
    return [-20, -15, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 15, 20];
  }

  if (zMin !== undefined && zMax !== undefined && zMax > zMin) {
    const span = zMax - zMin;

    if (elUpper === "HGT") {
      // Determine if height is in dagpm (e.g. 0..2000) or gpm (e.g. > 2000)
      const isDam = zMax < 2500;
      let step;
      if (isDam) {
        if (span <= 15) step = 1;
        else if (span <= 30) step = 2;
        else if (span <= 90) step = 4; // Standard synoptic 4 dagpm interval
        else if (span <= 180) step = 8;
        else step = 10;
      } else {
        if (span <= 150) step = 10;
        else if (span <= 300) step = 20;
        else if (span <= 900) step = 40; // Standard synoptic 40 gpm interval
        else if (span <= 1800) step = 80;
        else step = 100;
      }

      const start = Math.floor(zMin / step) * step;
      const end = Math.ceil(zMax / step) * step;
      const denseLevels = [];
      for (let v = start; v <= end; v += step) {
        denseLevels.push(Math.round(v * 100) / 100);
      }
      if (denseLevels.length >= 2) {
        return denseLevels;
      }
    }

    // If palette stops are within [zMin, zMax], use them
    const palMin = palette[0].val;
    const palMax = palette[palette.length - 1].val;
    if (palMin <= zMin && palMax >= zMax) {
      return palette.map((stop) => stop.val);
    }

    // Auto-generate 8~12 nice levels across [zMin, zMax] (e.g. for 10 colors)
    const rawStep = span / 10;
    const power = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const fraction = rawStep / power;
    let step;
    if (fraction <= 1.5) step = 1 * power;
    else if (fraction <= 3.5) step = 2 * power;
    else if (fraction <= 7.5) step = 5 * power;
    else step = 10 * power;

    const start = Math.floor(zMin / step) * step;
    const end = Math.ceil(zMax / step) * step;
    const autoLevels = [];
    for (let v = start; v <= end; v += step) {
      autoLevels.push(Math.round(v * 100) / 100);
    }
    if (autoLevels.length >= 2) {
      return autoLevels;
    }
  }

  return palette.map((stop) => stop.val);
}

export function getPaletteBandsAndTicks(palette, element = "TMP", options = {}) {
  let effectivePalette = palette;
  if (!effectivePalette || !Array.isArray(effectivePalette) || effectivePalette.length === 0) {
    effectivePalette = getColormap(null, element);
  }
  if (!effectivePalette || effectivePalette.length === 0) {
    return { isDiscrete: true, bands: [], ticks: [], steppedGradient: "" };
  }

  // Deduplicate and sort stops by val
  const sorted = [...effectivePalette]
    .filter((s) => s && Number.isFinite(s?.val) && Array.isArray(s?.color))
    .sort((a, b) => a.val - b.val);

  if (sorted.length === 0) {
    return { isDiscrete: true, bands: [], ticks: [], steppedGradient: "" };
  }

  const seen = new Set();
  const uniqueStops = [];
  for (const s of sorted) {
    if (!seen.has(s.val)) {
      seen.add(s.val);
      uniqueStops.push(s);
    }
  }

  const N = uniqueStops.length;
  const unit = options.unit || "";

  function formatTickVal(val) {
    if (!Number.isFinite(val)) return "";
    if (Math.abs(val) >= 1000) return `${Math.round(val)}`;
    if (Number.isInteger(val)) return `${val}`;
    const r1 = Math.round(val * 10) / 10;
    if (r1 === val) return `${val}`;
    const r2 = Math.round(val * 100) / 100;
    return `${r2}`;
  }

  if (N === 1) {
    const s0 = uniqueStops[0];
    const cStr = `rgb(${s0.color.slice(0, 3).join(",")})`;
    return {
      isDiscrete: true,
      bands: [{ startVal: s0.val, endVal: s0.val, startPct: 0, endPct: 100, colorStr: cStr }],
      ticks: [{ value: s0.val, label: `${formatTickVal(s0.val)}${unit ? ` ${unit}` : ""}`.trim(), percent: 50, isFirst: true, isLast: true, showLabel: true }],
      steppedGradient: `linear-gradient(to right, ${cStr} 0%, ${cStr} 100%)`,
    };
  }

  const isRain = isRainElement(element) || (typeof options.colormap === "string" && isRainElement(options.colormap));

  const bands = [];
  const ticks = [];

  if (isRain) {
    // For precipitation categorized palettes (ranks: light, moderate, heavy, downpour...)
    // Each stop defines a distinct category band of equal width
    // E.g. 7 stops: 7 bands of 100/7% = 14.29% each.
    // Tick i is placed at the start boundary of band i: i * (100 / N)%
    const stepPct = 100 / N;
    for (let i = 0; i < N; i++) {
      const s = uniqueStops[i];
      const startPct = Math.round(i * stepPct * 100) / 100;
      const endPct = Math.round((i + 1) * stepPct * 100) / 100;
      const cStr = `rgb(${s.color.slice(0, 3).join(",")})`;
      bands.push({
        startVal: s.val,
        endVal: i < N - 1 ? uniqueStops[i + 1].val : Infinity,
        startPct,
        endPct,
        color: s.color,
        colorStr: cStr,
      });

      const label = `${formatTickVal(s.val)}${i === N - 1 && unit ? ` ${unit}` : ""}`.trim();
      ticks.push({
        value: s.val,
        label,
        percent: startPct,
        isFirst: i === 0,
        isLast: false,
        color: cStr,
      });
    }
  } else {
    // Linear / continuous physical scale (e.g. TMP, RH, WIND, DTD, VOR, DIV, HGT)
    // Ticks positioned at proportional percentages according to threshold values
    let minVal = uniqueStops[0].val;
    let maxVal = uniqueStops[N - 1].val;

    // Handle relative/stretched layers (e.g. HGT) if zMin and zMax specified
    const fixedScale = new Set(["RH", "TMP", "TD", "DTD", "WIND", "RAIN", "RAIN6", "RAIN12", "RAIN24"]);
    if (!fixedScale.has(element) && options.zMin !== undefined && options.zMax !== undefined && options.zMax > options.zMin) {
      minVal = options.zMin;
      maxVal = options.zMax;
    }

    const span = maxVal - minVal;

    for (let i = 0; i < N; i++) {
      const s = uniqueStops[i];
      let pct = span > 0 ? ((s.val - minVal) / span) * 100 : (i / (N - 1)) * 100;
      pct = Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
      const cStr = `rgb(${s.color.slice(0, 3).join(",")})`;
      const isFirst = i === 0;
      const isLast = i === N - 1;
      const label = `${formatTickVal(s.val)}${isLast && unit ? ` ${unit}` : ""}`.trim();

      ticks.push({
        value: s.val,
        label,
        percent: isFirst ? 0 : (isLast ? 100 : pct),
        isFirst,
        isLast,
        color: cStr,
      });
    }

    // Build N - 1 bands between adjacent ticks
    for (let i = 0; i < N - 1; i++) {
      const startPct = ticks[i].percent;
      const endPct = ticks[i + 1].percent;
      if (endPct > startPct) {
        const s = uniqueStops[i];
        const cStr = `rgb(${s.color.slice(0, 3).join(",")})`;
        bands.push({
          startVal: uniqueStops[i].val,
          endVal: uniqueStops[i + 1].val,
          startPct,
          endPct,
          color: s.color,
          colorStr: cStr,
        });
      }
    }
  }

  // Label density management:
  const totalTicks = ticks.length;
  if (totalTicks <= 9) {
    for (const t of ticks) t.showLabel = true;
  } else {
    const stride = Math.ceil(totalTicks / 7);
    for (let i = 0; i < totalTicks; i++) {
      const isFirst = i === 0;
      const isLast = i === totalTicks - 1;
      const isZero = Math.abs(ticks[i].value) < 1e-4;
      const isStep = i % stride === 0;
      ticks[i].showLabel = isFirst || isLast || isZero || isStep;
    }
  }

  // Generate CSS stepped linear-gradient
  let steppedGradient = "";
  if (bands.length > 0) {
    const stops = bands.map((b) => `${b.colorStr} ${b.startPct.toFixed(2)}% ${b.endPct.toFixed(2)}%`);
    steppedGradient = `linear-gradient(to right, ${stops.join(", ")})`;
  } else {
    steppedGradient = getCSSGradient(element, options.colormap);
  }

  return {
    isDiscrete: true,
    bands,
    ticks,
    steppedGradient,
  };
}

export function getSteppedCSSGradient(element = "TMP", colormap = null, options = {}) {
  const palette = getColormap(colormap, element);
  const { steppedGradient } = getPaletteBandsAndTicks(palette, element, options);
  return steppedGradient;
}

export function getCSSGradient(element = "TMP", colormap = null, options = {}) {
  if (options && (options.discrete || options.stepped)) {
    return getSteppedCSSGradient(element, colormap, options);
  }
  let palette = getColormap(colormap, element);
  if (!palette || palette.length === 0) {
    palette = getColormap(null, "TMP");
  }
  const stops = palette.map((stop) => `rgb(${stop.color.slice(0, 3).join(",")})`).join(", ");
  return `linear-gradient(to right, ${stops})`;
}

export function resolveColormap(group, render, level) {
  const levelKey = level === null || level === undefined ? null : String(level);
  return render?.colormapByLevel?.[levelKey]
    || render?.colormap
    || group?.colormapByLevel?.[levelKey]
    || group?.levels?.[levelKey]?.colormap
    || group?.colormap
    || null;
}
