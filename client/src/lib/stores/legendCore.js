// legendCore.js - Plain-core legend data structures and item builders
import { getColormap, getCSSGradient } from "../../utils/colormaps.js";
import { formatElementUnit } from "../../utils/formatters.js";
import { getWindowById } from "./tabsCore.js";
import { getLayersForWindow } from "./layersCore.js";
import { resolveLayerTime } from "../../utils/timeResolver.js";

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
  let liveWin = null;
  const resolver = winResolver || defaultWinResolver || getWindowById;
  if (typeof resolver === "function") {
    try {
      liveWin = resolver(winId);
      if (liveWin && typeof liveWin.winIdx === "number") livePrefix = `W${liveWin.winIdx + 1}`;
    } catch {}
  }
  if (!livePrefix && typeof winId === "string") {
    const m = winId.match(/win-(\d+)/);
    if (m) livePrefix = `W${parseInt(m[1], 10) + 1}`;
  }

  const layers = getLayersForWindow(winId) || [];

  return Array.from(elMap.values()).map((item) => {
    const { element, colormap, zMin, zMax } = item;
    const palette = getColormap(colormap, element);
    const unit = formatElementUnit(element);
    const grad = getCSSGradient(element, colormap);

    let tickLabels = [];
    if (palette && palette.length > 0) {
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

    const layer = (item.layerId ? layers.find((l) => l.id === item.layerId) : null) ||
      layers.find((l) => (l.element && l.element.toUpperCase() === element) || l.id === item.layerId) || null;

    const titleText = item.name || (layers.filter((l) => l.element && l.element.toUpperCase() === element).length > 1 ? layer?.name : null) || element;
    const displayTitle = (livePrefix || item.winPrefix) ? `[${livePrefix || item.winPrefix}] ${titleText}` : titleText;

    // Part 2: Time resolution & staleness for legend item (§2.4)
    let timeBadge = item.timeBadge || null;
    let resolvedTimeZ = item.resolvedTimeZ || null;
    let ageStr = item.ageStr || null;
    let status = item.status || "current";
    let statusIcon = item.statusIcon || "●";
    let statusText = item.statusText || "Current";
    let isStale = Boolean(item.isStale);
    let isHardStale = Boolean(item.isHardStale);
    let isDesync = Boolean(item.isDesync);

    if (layer) {
      if (layer.resolved) {
        resolvedTimeZ = layer.resolved.actualTimeZ;
        ageStr = layer.resolved.ageStr;
        timeBadge = `${resolvedTimeZ} (${ageStr})`;
        status = layer.resolved.status;
        statusIcon = layer.resolved.statusIcon;
        statusText = layer.resolved.statusText;
        isStale = layer.resolved.isStale;
        isHardStale = layer.resolved.isHardStale;
        isDesync = layer.resolved.isDesync;
      } else if (liveWin) {
        const cursor = liveWin.obsTime || (liveWin.period !== undefined ? { cycle: liveWin.forecastCycle, period: liveWin.period } : Date.now());
        const res = resolveLayerTime(layer, cursor);
        resolvedTimeZ = res.actualTimeZ;
        ageStr = res.ageStr;
        timeBadge = `${resolvedTimeZ} (${ageStr})`;
        status = res.status;
        statusIcon = res.statusIcon;
        statusText = res.statusText;
        isStale = res.isStale;
        isHardStale = res.isHardStale;
        isDesync = res.isDesync;
      }
    }

    const statusColors = {
      current: "#3fb950",
      "soft-stale": "#d29922",
      "hard-stale": "#f85149",
      desync: "#58a6ff",
    };
    const statusColor = statusColors[status] || "#3fb950";

    return {
      element,
      colormap,
      zMin,
      zMax,
      unit,
      gradient: grad,
      tickLabels,
      displayTitle,
      timeBadge,
      resolvedTimeZ,
      ageStr,
      status,
      statusIcon,
      statusColor,
      statusText,
      isStale,
      isHardStale,
      isDesync,
      layerId: layer?.id || item.layerId || null,
    };
  });
}

export function updateLegend(element = "TMP", colormap = null, zMin = undefined, zMax = undefined, win = null, extra = {}) {
  const normElement = (element || "TMP").toUpperCase();
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
  const extraObj = (typeof extra === "object" && extra !== null) ? extra : {};
  let timeBadge = extraObj.timeBadge;
  if (!timeBadge && extraObj.resolved?.actualTimeZ) {
    timeBadge = `${extraObj.resolved.actualTimeZ} (${extraObj.resolved.ageStr || "±0m"})`;
  }

  // Key by layerId when provided to avoid collapsing multi-time layers of the same element (§2.7)
  const layerId = extraObj.layerId || extraObj.id || null;
  const legendKey = layerId || normElement;

  elMap.set(legendKey, {
    key: legendKey,
    layerId,
    element: normElement,
    colormap,
    zMin,
    zMax,
    winPrefix,
    ...extraObj,
    timeBadge: timeBadge || extraObj.timeBadge || null,
    resolvedTimeZ: extraObj.resolvedTimeZ || extraObj.resolved?.actualTimeZ || null,
    ageStr: extraObj.ageStr || extraObj.resolved?.ageStr || null,
    status: extraObj.status || extraObj.resolved?.status || "current",
    statusIcon: extraObj.statusIcon || extraObj.resolved?.statusIcon || "●",
    statusText: extraObj.statusText || extraObj.resolved?.statusText || "Current",
    isStale: extraObj.isStale !== undefined ? extraObj.isStale : (extraObj.resolved?.isStale ?? false),
    isHardStale: extraObj.isHardStale !== undefined ? extraObj.isHardStale : (extraObj.resolved?.isHardStale ?? false),
    isDesync: extraObj.isDesync !== undefined ? extraObj.isDesync : (extraObj.resolved?.isDesync ?? false),
  });
  notifyLegendChanged(winId);
}

export function removeLegend(elementOrId, win = null) {
  if (!elementOrId) return;
  const winId = typeof win === "string" ? win : (win?.id || "default");
  if (windowLegends.has(winId)) {
    const elMap = windowLegends.get(winId);
    let matched = false;
    if (elMap.has(elementOrId)) {
      elMap.delete(elementOrId);
      matched = true;
    }
    for (const [k, v] of elMap.entries()) {
      if (v.layerId === elementOrId || k === elementOrId) {
        elMap.delete(k);
        matched = true;
      }
    }
    // Only fall back to element-name matching if elementOrId did not match a specific layer ID
    if (!matched) {
      const norm = String(elementOrId).toUpperCase();
      if (elMap.has(norm)) {
        elMap.delete(norm);
      }
      for (const [k, v] of elMap.entries()) {
        if (v.element === norm || v.element === elementOrId) {
          elMap.delete(k);
        }
      }
    }
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

export function deleteWindowLegends(win = null) {
  const winId = typeof win === "string" ? win : (win?.id || "default");
  if (windowLegends.has(winId)) {
    windowLegends.delete(winId);
  }
  notifyLegendChanged(winId);
}
