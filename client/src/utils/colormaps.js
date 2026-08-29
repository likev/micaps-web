// colormaps.js - Runtime-loaded meteorological color palettes

const DEFAULT_COLORMAPS = {
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
};

const FALLBACK_COLORMAP = DEFAULT_COLORMAPS.TMP;

export let COLORMAPS = { ...DEFAULT_COLORMAPS };

export function setColormaps(colormaps) {
  if (!colormaps || typeof colormaps !== "object" || Array.isArray(colormaps)) {
    throw new Error("Preset config colormaps must be an object");
  }

  const normalized = { ...DEFAULT_COLORMAPS };
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

export function getColormap(reference = null, element = "TMP") {
  if (Array.isArray(reference)) return reference;
  if (typeof reference === "string") {
    if (COLORMAPS[reference]) return COLORMAPS[reference];
    const up = reference.toUpperCase();
    if (COLORMAPS[up]) return COLORMAPS[up];
  }
  const elUp = (element || "").toUpperCase();
  if (COLORMAPS[elUp]) return COLORMAPS[elUp];
  return COLORMAPS[element] || COLORMAPS.TMP || COLORMAPS.default || FALLBACK_COLORMAP;
}

export function getColor(val, element = "TMP", colormap = null, zMin = undefined, zMax = undefined) {
  const palette = getColormap(colormap, element);
  if (!palette || palette.length === 0) return [100, 150, 240, 255];
  if (palette.length === 1) return palette[0].color;

  const elUpper = (element || "").toUpperCase();
  const cmUpper = (typeof colormap === "string" ? colormap : "").toUpperCase();

  // Fixed physical scale fields must NEVER be dynamically stretched:
  // RH (0..100%), WIND (0..45 m/s), TMP (-40..40 C), RAIN (0..250 mm)
  const isFixedPhysical = elUpper === "RH" || cmUpper.includes("RH") ||
                          elUpper === "WIND" || cmUpper.includes("WIND") ||
                          elUpper === "TMP" || cmUpper.includes("TMP") ||
                          elUpper === "RAIN" || cmUpper.includes("RAIN");

  const isHGT = elUpper === "HGT" || cmUpper.includes("HGT");
  const isSLP = elUpper === "SLP" || cmUpper.includes("SLP");

  let checkVal = val;
  const palMin = palette[0].val;
  const palMax = palette[palette.length - 1].val;

  // Handle HGT decameter (dagpm) vs meter (gpm) scaling
  if (isHGT && val < 2500 && palMax > 2500) {
    checkVal = val * 10;
  }

  // 1. Fixed physical scale elements (RH, WIND, TMP, RAIN):
  // Cleanly clamp to physical bounds [palMin, palMax] and interpolate directly across defined stops
  if (isFixedPhysical) {
    if (checkVal <= palMin) return palette[0].color;
    if (checkVal >= palMax) return palette[palette.length - 1].color;

    for (let i = 0; i < palette.length - 1; i++) {
      const c0 = palette[i];
      const c1 = palette[i + 1];
      if (checkVal >= c0.val && checkVal <= c1.val) {
        const denom = c1.val - c0.val;
        const t = denom > 0 ? (checkVal - c0.val) / denom : 0;
        return [
          Math.round(c0.color[0] + t * (c1.color[0] - c0.color[0])),
          Math.round(c0.color[1] + t * (c1.color[1] - c0.color[1])),
          Math.round(c0.color[2] + t * (c1.color[2] - c0.color[2])),
          Math.round(c0.color[3] + t * (c1.color[3] - c0.color[3])),
        ];
      }
    }
    return palette[0].color;
  }

  // 2. Relative Level-Adaptive elements (HGT, SLP, or unspecified broad-range fields):
  // Stretch palette across actual field range [zMin, zMax] so narrow height/pressure bands have rich contrast.
  if ((isHGT || isSLP || (checkVal < palMin || checkVal > palMax)) && zMin !== undefined && zMax !== undefined && zMax > zMin) {
    const effMin = (isHGT && zMax < 2500 && palMax > 2500) ? zMin * 10 : zMin;
    const effMax = (isHGT && zMax < 2500 && palMax > 2500) ? zMax * 10 : zMax;
    if (effMax > effMin) {
      const fraction = Math.max(0, Math.min(1, (checkVal - effMin) / (effMax - effMin)));
      const targetIdx = fraction * (palette.length - 1);
      const i0 = Math.floor(targetIdx);
      const i1 = Math.min(i0 + 1, palette.length - 1);
      const t = targetIdx - i0;
      const c0 = palette[i0].color;
      const c1 = palette[i1].color;
      return [
        Math.round(c0[0] + t * (c1[0] - c0[0])),
        Math.round(c0[1] + t * (c1[1] - c0[1])),
        Math.round(c0[2] + t * (c1[2] - c0[2])),
        Math.round(c0[3] + t * (c1[3] - c0[3])),
      ];
    }
  }

  // 3. Fallback direct physical value interpolation across palette stops
  if (checkVal <= palMin) return palette[0].color;
  if (checkVal >= palMax) return palette[palette.length - 1].color;

  for (let i = 0; i < palette.length - 1; i++) {
    const c0 = palette[i];
    const c1 = palette[i + 1];
    if (checkVal >= c0.val && checkVal <= c1.val) {
      const denom = c1.val - c0.val;
      const t = denom > 0 ? (checkVal - c0.val) / denom : 0;
      return [
        Math.round(c0.color[0] + t * (c1.color[0] - c0.color[0])),
        Math.round(c0.color[1] + t * (c1.color[1] - c0.color[1])),
        Math.round(c0.color[2] + t * (c1.color[2] - c0.color[2])),
        Math.round(c0.color[3] + t * (c1.color[3] - c0.color[3])),
      ];
    }
  }
  return palette[0].color;
}

export function getHexColor(val, element = "TMP", colormap = null, zMin = undefined, zMax = undefined) {
  const [r, g, b] = getColor(val, element, colormap, zMin, zMax);
  return `rgb(${r},${g},${b})`;
}

export function getElementLevels(element = "TMP", zMin, zMax, colormap = null) {
  const palette = getColormap(colormap, element);
  const elUpper = (element || "").toUpperCase();

  if (elUpper === "RH") {
    return [50, 60, 70, 80, 90, 100];
  }
  if (elUpper === "WIND") {
    return [4, 8, 12, 16, 20, 24, 28, 32, 40];
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

export function getCSSGradient(element = "TMP", colormap = null) {
  const palette = getColormap(colormap, element);
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
