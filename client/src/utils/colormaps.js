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

export function getColor(val, element = "TMP", colormap = null) {
  const palette = getColormap(colormap, element);
  if (val <= palette[0].val) return palette[0].color;
  if (val >= palette[palette.length - 1].val) return palette[palette.length - 1].color;

  for (let i = 0; i < palette.length - 1; i++) {
    const c0 = palette[i];
    const c1 = palette[i + 1];
    if (val >= c0.val && val <= c1.val) {
      const t = (val - c0.val) / (c1.val - c0.val);
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

export function getHexColor(val, element = "TMP", colormap = null) {
  const [r, g, b] = getColor(val, element, colormap);
  return `rgb(${r},${g},${b})`;
}

export function getElementLevels(element = "TMP", zMin, zMax, colormap = null) {
  return getColormap(colormap, element).map((stop) => stop.val);
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
