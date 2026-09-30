// legend.svelte.js - Svelte 5 reactive legend store
import {
  getWindowLegendsMap,
  buildLegendItems,
  updateLegend as coreUpdateLegend,
  removeLegend as coreRemoveLegend,
  clearLegends as coreClearLegends,
  deleteWindowLegends as coreDeleteWindowLegends,
  onLegendChange,
} from "./legendCore.js";
import { getCurrentActiveWinId } from "./layersCore.js";

// Svelte 5 reactive legends state: { [winId]: LegendEntry[] }
export const legends = $state({});

export function syncLegendState(winId = "default") {
  const map = getWindowLegendsMap();
  const elMap = map.get(winId);
  legends[winId] = elMap ? Array.from(elMap.values()) : [];
}

// Bridge: legacy producers (services/ui via ui/legend.js or legendCore)
// mutate outside Svelte reactivity — mirror every change into the store so
// the mounted Legend component never shows stale content or wipes fresh
// direct-DOM writes with an outdated render.
onLegendChange((winId) => {
  try {
    if (winId) syncLegendState(winId);
  } catch {}
});

export function updateLegend(element = "TMP", colormap = null, zMin = undefined, zMax = undefined, win = null, panelIdOrExtra = {}, maybeExtra = {}) {
  const isExtraObject = typeof panelIdOrExtra === "object" && panelIdOrExtra !== null;
  const extra = isExtraObject ? panelIdOrExtra : maybeExtra;
  coreUpdateLegend(element, colormap, zMin, zMax, win, extra);
  const winId = typeof win === "string" ? win : (win?.id || (typeof getCurrentActiveWinId === "function" ? getCurrentActiveWinId() : "default") || "default");
  syncLegendState(winId);
}

export function removeLegend(element, win = null) {
  coreRemoveLegend(element, win);
  const winId = typeof win === "string" ? win : (win?.id || (typeof getCurrentActiveWinId === "function" ? getCurrentActiveWinId() : "default") || "default");
  syncLegendState(winId);
}

export function clearLegends(win = null) {
  coreClearLegends(win);
  const winId = typeof win === "string" ? win : (win?.id || (typeof getCurrentActiveWinId === "function" ? getCurrentActiveWinId() : "default") || "default");
  syncLegendState(winId);
}

export function deleteWindowLegends(win = null) {
  coreDeleteWindowLegends(win);
  const winId = typeof win === "string" ? win : (win?.id || (typeof getCurrentActiveWinId === "function" ? getCurrentActiveWinId() : "default") || "default");
  if (legends[winId] !== undefined) delete legends[winId];
}

export { buildLegendItems };
