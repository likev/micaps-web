// colormapUtils.js - Pure colormap helpers (CSS gradients, usage tracking, reference rewriting)

/**
 * Computes a linear-gradient CSS string from an array of colormap stops.
 * @param {Array<{ val: number, color: number[] }>} stops
 * @returns {string} CSS linear-gradient string
 */
export function stopsToCSSGradient(stops) {
  if (!Array.isArray(stops) || stops.length === 0) {
    return "linear-gradient(to right, #888, #fff)";
  }
  const min = stops[0].val;
  const max = stops[stops.length - 1].val;
  const span = max - min || 1;
  const parts = stops.map((s) => {
    const pct = Math.max(0, Math.min(100, Math.round(((s.val - min) / span) * 100)));
    const a = (s.color && s.color[3] !== undefined ? s.color[3] / 255 : 1).toFixed(2);
    const r = s.color ? s.color[0] : 0;
    const g = s.color ? s.color[1] : 0;
    const b = s.color ? s.color[2] : 0;
    return `rgba(${r}, ${g}, ${b}, ${a}) ${pct}%`;
  });
  return `linear-gradient(to right, ${parts.join(", ")})`;
}

/**
 * Counts how many preset layers reference each colormap name across the draft.
 * @param {Object} draft - config draft containing presets
 * @returns {Record<string, number>}
 */
export function getColormapUsageCounts(draft) {
  const counts = {};
  if (!draft) return counts;
  const presets = Array.isArray(draft) ? draft : draft.presets;
  if (!Array.isArray(presets)) return counts;
  for (const p of presets) {
    if (p.divider || !Array.isArray(p.layers)) continue;
    for (const l of p.layers) {
      if (l?.render?.colormap) {
        counts[l.render.colormap] = (counts[l.render.colormap] || 0) + 1;
      }
      if (l?.render?.colormapByLevel && typeof l.render.colormapByLevel === "object") {
        for (const cmap of Object.values(l.render.colormapByLevel)) {
          if (cmap) counts[cmap] = (counts[cmap] || 0) + 1;
        }
      }
    }
  }
  return counts;
}

/**
 * Rewrites all references to a colormap across preset layers in place.
 * @param {Object} draft - config draft containing presets
 * @param {string} oldName
 * @param {string} newName
 */
export function rewriteColormapReferences(draft, oldName, newName) {
  if (!draft || !oldName || !newName || oldName === newName) return;
  const presets = Array.isArray(draft) ? draft : draft.presets;
  if (!Array.isArray(presets)) return;
  for (const p of presets) {
    if (p.divider || !Array.isArray(p.layers)) continue;
    for (const l of p.layers) {
      if (l?.render?.colormap === oldName) {
        l.render.colormap = newName;
      }
      if (l?.render?.colormapByLevel && typeof l.render.colormapByLevel === "object") {
        for (const [lvl, cmap] of Object.entries(l.render.colormapByLevel)) {
          if (cmap === oldName) {
            l.render.colormapByLevel[lvl] = newName;
          }
        }
      }
    }
  }
}
