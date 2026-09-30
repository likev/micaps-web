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
  const base = up.includes("/") ? up.split("/").pop() : up;
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
  if (typeof reference === "string") {
    if (COLORMAPS[reference]) return COLORMAPS[reference];
    const up = reference.toUpperCase();
    if (COLORMAPS[up]) return COLORMAPS[up];
    const trimmed = reference.replace(/^\//, "");
    if (COLORMAPS[trimmed]) return COLORMAPS[trimmed];
    if (COLORMAPS["/" + trimmed]) return COLORMAPS["/" + trimmed];
    if (isRainElement(reference)) return COLORMAPS.RAIN || DEFAULT_COLORMAPS.RAIN;
  }
  const elUp = (element || "").toUpperCase();
  if (COLORMAPS[elUp]) return COLORMAPS[elUp];
  if (isRainElement(element)) return COLORMAPS.RAIN || DEFAULT_COLORMAPS.RAIN;
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
  const isRain = isRainElement(element) || isRainElement(colormap) || cmUpper.includes("RAIN");

  // Fixed physical scale fields must NEVER be dynamically stretched:
  // RH (0..100%), WIND (0..45 m/s), TMP (-40..40 C), RAIN (0.1..250 mm), DTD (0..30 C)
  const isFixedPhysical = elUpper === "RH" || cmUpper.includes("RH") ||
                          elUpper === "WIND" || cmUpper.includes("WIND") ||
                          elUpper === "TMP" || cmUpper.includes("TMP") ||
                          isRain ||
                          elUpper === "DTD" || cmUpper.includes("DTD");

  const isHGT = elUpper === "HGT" || cmUpper.includes("HGT");
  const isSLP = elUpper === "SLP" || cmUpper.includes("SLP");

  const palMin = palette[0].val;
  const palMax = palette[palette.length - 1].val;
  const palLen = palette.length;
  const hgtScale = isHGT && palMax > 2500;

  const canBeRelative = !isFixedPhysical && zMin !== undefined && zMax !== undefined && zMax > zMin;
  const effMin = (canBeRelative && hgtScale && zMax < 2500) ? zMin * 10 : zMin;
  const effMax = (canBeRelative && hgtScale && zMax < 2500) ? zMax * 10 : zMax;
  const relSpan = (canBeRelative && effMax > effMin) ? (effMax - effMin) : 0;
  const isAlwaysRelative = canBeRelative && relSpan > 0 && (isHGT || isSLP);

  return (val, out, offset = 0) => {
    let checkVal = val;
    if (hgtScale && val < 2500) {
      checkVal = val * 10;
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
