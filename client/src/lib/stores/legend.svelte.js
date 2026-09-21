// legend.svelte.js - Svelte 5 reactive legend store
import {
  getWindowLegendsMap,
  buildLegendItems,
  updateLegend as coreUpdateLegend,
  removeLegend as coreRemoveLegend,
  clearLegends as coreClearLegends,
} from "./legendCore.js";

// Svelte 5 reactive legends state: { [winId]: LegendEntry[] }
export const legends = $state({});

export function syncLegendState(winId = "default") {
  const map = getWindowLegendsMap();
  const elMap = map.get(winId);
  legends[winId] = elMap ? Array.from(elMap.values()) : [];
}

export function updateLegend(element, colormap, zMin, zMax, win = null) {
  coreUpdateLegend(element, colormap, zMin, zMax, win);
  const winId = typeof win === "string" ? win : (win?.id || "default");
  syncLegendState(winId);
}

export function removeLegend(element, win = null) {
  coreRemoveLegend(element, win);
  const winId = typeof win === "string" ? win : (win?.id || "default");
  syncLegendState(winId);
}

export function clearLegends(win = null) {
  coreClearLegends(win);
  const winId = typeof win === "string" ? win : (win?.id || "default");
  syncLegendState(winId);
}

export { buildLegendItems };
