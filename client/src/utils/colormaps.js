// colormaps.js - Runtime-loaded meteorological color palettes

const FALLBACK_COLORMAP = [
  { val: -40, color: [130, 20, 160, 255] },
  { val: -20, color: [30, 120, 220, 255] },
  { val: 0, color: [180, 240, 240, 255] },
  { val: 20, color: [180, 230, 80, 255] },
  { val: 35, color: [230, 50, 40, 255] },
  { val: 40, color: [160, 20, 50, 255] },
];

export let COLORMAPS = { TMP: FALLBACK_COLORMAP };

export function setColormaps(colormaps) {
  if (!colormaps || typeof colormaps !== "object" || Array.isArray(colormaps)) {
    throw new Error("Preset config colormaps must be an object");
  }

  const normalized = {};
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

  if (!normalized.TMP && !normalized.default) {
    throw new Error("Preset config must define a TMP or default colormap");
  }
  COLORMAPS = normalized;
}

export function getColormap(reference = null, element = "TMP") {
  if (Array.isArray(reference)) return reference;
  if (typeof reference === "string" && COLORMAPS[reference]) return COLORMAPS[reference];
  return COLORMAPS[element] || COLORMAPS.TMP || COLORMAPS.default || FALLBACK_COLORMAP;
}

export function getColor(val, element = "TMP", colormap = null, zMin = undefined, zMax = undefined) {
  const palette = getColormap(colormap, element);
  if (!palette || palette.length === 0) return [100, 150, 240, 255];
  if (palette.length === 1) return palette[0].color;

  let checkVal = val;
  const palMin = palette[0].val;
  const palMax = palette[palette.length - 1].val;

  // Handle HGT decameter (dagpm) vs meter (gpm) scaling
  const isHGT = element === "HGT" || (typeof colormap === "string" && colormap.toLowerCase().includes("hgt"));
  if (isHGT && val < 2500 && palMax > 2500) {
    checkVal = val * 10;
  }

  // 1. Dynamic / Relative range mapping:
  // - Always for HGT (height ranges like 5340..5910 at 500hPa cluster tightly in a narrow level-specific altitude band)
  // - Or when values fall outside static palette bounds
  // - Or when data dynamic range (zMax - zMin) is much narrower than a broad general palette (< 35% of palette span)
  const isRelativeCandidate = isHGT || (zMin !== undefined && zMax !== undefined && (zMax - zMin > 0) && ((checkVal < palMin || checkVal > palMax) || ((zMax - zMin) < 0.35 * (palMax - palMin))));

  if (isRelativeCandidate && zMin !== undefined && zMax !== undefined && zMax > zMin) {
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

  // 2. Direct physical value interpolation across palette stops
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

  if (zMin !== undefined && zMax !== undefined && zMax > zMin) {
    const span = zMax - zMin;

    if (element === "HGT") {
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
