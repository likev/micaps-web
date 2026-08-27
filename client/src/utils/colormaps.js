// colormaps.js - Standard CMA & WMO meteorological color palettes

export const COLORMAPS = {
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
  RAIN: [
    { val: 0.1, color: [166, 242, 143, 220] },
    { val: 1.0, color: [61, 186, 61, 230] },
    { val: 10.0, color: [97, 184, 255, 240] },
    { val: 25.0, color: [0, 0, 255, 255] },
    { val: 50.0, color: [250, 0, 250, 255] },
    { val: 100.0, color: [128, 0, 64, 255] },
    { val: 250.0, color: [80, 0, 0, 255] },
  ],
  HGT: [
    { val: 4900, color: [40, 40, 180, 255] },
    { val: 5200, color: [60, 130, 220, 255] },
    { val: 5500, color: [80, 200, 160, 255] },
    { val: 5700, color: [140, 220, 80, 255] },
    { val: 5880, color: [250, 210, 40, 255] }, // Subtropical high benchmark
    { val: 5920, color: [240, 80, 40, 255] },
  ],
  WIND: [
    { val: 2, color: [180, 220, 250, 200] },
    { val: 6, color: [100, 180, 240, 220] },
    { val: 12, color: [70, 200, 120, 240] },
    { val: 18, color: [230, 210, 50, 255] },
    { val: 25, color: [240, 120, 40, 255] },
    { val: 32, color: [230, 40, 40, 255] },
    { val: 45, color: [160, 20, 120, 255] },
  ],
};

export function getColor(val, element = "TMP") {
  const palette = COLORMAPS[element] || COLORMAPS.TMP;
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

export function getHexColor(val, element = "TMP") {
  const [r, g, b] = getColor(val, element);
  return `rgb(${r},${g},${b})`;
}

export function getElementLevels(element = "TMP", zMin, zMax) {
  const palette = COLORMAPS[element] || COLORMAPS.TMP;
  return palette.map((p) => p.val);
}

export function getCSSGradient(element = "TMP") {
  const palette = COLORMAPS[element] || COLORMAPS.TMP;
  const stops = palette.map((p) => `rgb(${p.color.slice(0, 3).join(",")})`).join(", ");
  return `linear-gradient(to right, ${stops})`;
}
