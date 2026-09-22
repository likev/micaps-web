// legendCore.js - Plain-core legend data structures and item builders
import { getColormap, getCSSGradient } from "../../utils/colormaps.js";
import { formatElementUnit } from "../../utils/formatters.js";
import { getWindowById } from "./tabsCore.js";

const windowLegends = new Map();

export function getWindowLegendsMap() {
  return windowLegends;
}

let defaultWinResolver = null;

export function setDefaultWinResolver(resolver) {
  defaultWinResolver = resolver;
}

// True while the Svelte Legend component is mounted and owns #legend-panel.
// Legacy direct-DOM writes must stand down then, or Svelte reconciliation
// fights them (stale wipes / partial renders ~0.1s after load).
let svelteOwner = false;

export function setSvelteLegendOwner(v) {
  svelteOwner = Boolean(v);
}

export function hasSvelteLegendOwner() {
  return svelteOwner;
}

// Change listeners for cross-module reactivity bridging (plain JS so both
// legacy ui/legend.js and the Svelte store can share one notification path
// without import cycles or .svelte.js runtime requirements).
const legendListeners = new Set();

export function onLegendChange(cb) {
  if (typeof cb !== "function") return () => {};
  legendListeners.add(cb);
  return () => { legendListeners.delete(cb); };
}

export function notifyLegendChanged(winId = null) {
  for (const cb of legendListeners) {
    try { cb(winId); } catch {}
  }
}

export function buildLegendItems(winOrId, legendsMap = windowLegends, winResolver = null) {
  const winId = typeof winOrId === "string" ? winOrId : (winOrId?.id || "default");
  const elMap = legendsMap.get(winId);
  if (!elMap || elMap.size === 0) return [];

  let livePrefix = null;
  const resolver = winResolver || defaultWinResolver || getWindowById;
  if (typeof resolver === "function") {
    try {
      const liveWin = resolver(winId);
      if (liveWin && typeof liveWin.winIdx === "number") livePrefix = `W${liveWin.winIdx + 1}`;
    } catch {}
  }
  if (!livePrefix && typeof winId === "string") {
    const m = winId.match(/win-(\d+)/);
    if (m) livePrefix = `W${parseInt(m[1], 10) + 1}`;
  }

  return Array.from(elMap.values()).map((item) => {
    const { element, colormap, zMin, zMax } = item;
    const palette = getColormap(colormap, element);
    const unit = formatElementUnit(element);
    const grad = getCSSGradient(element, colormap);

    let tickLabels = [];
    if (palette && palette.length > 0) {
      // Fixed-physical-scale elements (RH 0..100%, TMP, WIND, RAIN, DTD) are
      // rendered against an absolute palette, so the legend must show the
      // palette scale — never transient data min/max (e.g. RH stats -1..115
      // from supersaturation/overshoot would draw ticks past the scale).
      const fixedScale = new Set(["RH", "TMP", "TD", "DTD", "WIND", "RAIN", "RAIN6"]);
      if (!fixedScale.has(element) && zMin !== undefined && zMax !== undefined && zMax > zMin) {
        if (element === "HGT") {
          const isDam = zMax < 2500;
          const low = Math.round(zMin);
          const mid = Math.round((zMin + zMax) / 2);
          const high = Math.round(zMax);
          tickLabels = [`${low}`, `${mid}`, `${high} ${isDam ? "dam" : "gpm"}`];
        } else {
          const low = Math.round(zMin);
          const mid = Math.round((zMin + zMax) / 2);
          const high = Math.round(zMax);
          tickLabels = [`${low}`, `${mid}`, `${high} ${unit}`.trim()];
        }
      } else {
        const first = palette[0].val;
        const mid = palette[Math.floor(palette.length / 2)].val;
        const last = palette[palette.length - 1].val;
        tickLabels = [`${first}`, `${mid}`, `${last} ${unit}`.trim()];
      }
    }

    const displayTitle = (livePrefix || item.winPrefix) ? `[${livePrefix || item.winPrefix}] ${element}` : element;

    return {
      element,
      colormap,
      zMin,
      zMax,
      unit,
      gradient: grad,
      tickLabels,
      displayTitle,
    };
  });
}

export function updateLegend(element = "TMP", colormap = null, zMin = undefined, zMax = undefined, win = null) {
  const resolver = defaultWinResolver || getWindowById;
  const winObj = typeof win === "string" ? (typeof resolver === "function" ? resolver(win) : null) : win;
  const winId = typeof win === "string" ? win : (win?.id || "default");
  if (!windowLegends.has(winId)) {
    windowLegends.set(winId, new Map());
  }
  const elMap = windowLegends.get(winId);
  let winPrefix = winObj && typeof winObj.winIdx === "number" ? `W${winObj.winIdx + 1}` : null;
  if (!winPrefix && typeof winId === "string") {
    const m = winId.match(/win-(\d+)/);
    if (m) winPrefix = `W${parseInt(m[1], 10) + 1}`;
  }
  elMap.set(element, { element, colormap, zMin, zMax, winPrefix });
  notifyLegendChanged(winId);
}

export function removeLegend(element, win = null) {
  const winId = typeof win === "string" ? win : (win?.id || "default");
  if (windowLegends.has(winId)) {
    windowLegends.get(winId).delete(element);
  }
  notifyLegendChanged(winId);
}

export function clearLegends(win = null) {
  const winId = typeof win === "string" ? win : (win?.id || "default");
  if (windowLegends.has(winId)) {
    windowLegends.get(winId).clear();
  }
  notifyLegendChanged(winId);
}
