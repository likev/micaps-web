// profileVisibility.js - Central auto hide/show for floating profile panels on window focus.
//
// Regression: the Svelte refactor dropped the legacy bootstrap onWindowFocus
// controller show/hide sequence. Toggling window tabs left T-LogP, Time-Height,
// Line-Height and Time-Line (Hovmoller) panels stuck visible (or hidden).
// Both App.svelte handleWindowFocus and legacy windowFocus.js focusWindow must
// call syncProfilePanelsForWindow(win, map).
import { getLayersForWindow } from "../stores/layersCore.js";
import { tlogpController } from "../../layers/tlogp/tlogpController.js";
import { timeHeightController } from "../../layers/timeheight/timeHeightController.js";
import { lineHeightController } from "../../layers/lineprofile/lineHeightController.js";
import { hovmollerController } from "../../layers/lineprofile/hovmollerController.js";

function collectCandidateLayers(win) {
  const out = [];
  if (!win) return out;
  try {
    const stored = getLayersForWindow(win);
    if (Array.isArray(stored)) out.push(...stored);
  } catch {}
  try {
    if (Array.isArray(win.activeGroup?.layers)) out.push(...win.activeGroup.layers);
  } catch {}
  try {
    if (Array.isArray(win.layers)) out.push(...win.layers);
  } catch {}
  return out;
}

function findVisibleLayer(win, types, ids = []) {
  const candidates = collectCandidateLayers(win);
  for (const l of candidates) {
    if (!l) continue;
    const typeMatch = types.includes(l.type);
    const idMatch = l.id && ids.includes(l.id);
    if (!typeMatch && !idMatch) continue;
    if (l.visible === false) continue;
    return l;
  }
  return null;
}

function peekPanel(controller, win) {
  try {
    const winId = win?.id;
    if (winId && controller?.windows instanceof Map) {
      const s = controller.windows.get(winId);
      if (s?.panel) return true;
    }
  } catch {}
  try {
    if (winId === undefined || win?.id === undefined) {
      if (controller?._defaultState?.panel) return true;
    }
  } catch {}
  try {
    if (controller?.panel) return true;
  } catch {}
  return false;
}

function hasPanel(controller, win) {
  try {
    if (typeof controller.isActive === "function" && controller.isActive(win)) return true;
  } catch {}
  return peekPanel(controller, win);
}

function targetStationForWin(win, layer) {
  return (
    layer?.config?.stationId ||
    layer?.stationId ||
    win?.tlogpStation ||
    null
  );
}

function ensureTlogpHighlight(map) {
  try {
    if (!map || typeof map.getSource !== "function") return;
    const sounding = tlogpController.sounding;
    if (!sounding || sounding.lon === undefined || sounding.lat === undefined) return;
    if (map.getSource("tlogp-active-station-source")) return;
    const stn = String(tlogpController.activeStationId || sounding.stationId || "58362");
    tlogpController.highlightStationOnMap(map, sounding.lon, sounding.lat, stn);
  } catch {}
}

/**
 * Show the active window's profile panels, hide all others.
 * Call on every window-tab toggle with the newly focused win + its map.
 * Eye-hidden layers (visible === false) stay hidden.
 */
export function syncProfilePanelsForWindow(win, map = null) {
  if (!win) {
    try { timeHeightController.hide(); } catch {}
    try { lineHeightController.hide(); } catch {}
    try { hovmollerController.hide(); } catch {}
    try { tlogpController.hide(); } catch {}
    return {
      tlogp: false, timeheight: false, lineheight: false, hovmoller: false,
    };
  }

  const targetMap = map || win.map || null;

  const tlogpLayer = findVisibleLayer(win, ["tlogp"], ["upperair-tlogp-diagram"]);
  const thLayer = findVisibleLayer(win, ["timeheight"], ["ec-timeheight-diagram"]);
  const lhLayer = findVisibleLayer(win, ["lineheight"], ["ec-lineheight-diagram"]);
  const hovLayer = findVisibleLayer(win, ["hovmoller"], ["ec-hovmoller-diagram"]);

  // Time-Height (per-window state)
  try {
    if (thLayer && hasPanel(timeHeightController, win)) {
      timeHeightController.show(targetMap, win);
    } else {
      timeHeightController.hide();
    }
  } catch {}

  // Line-Height section (per-window state)
  try {
    if (lhLayer && hasPanel(lineHeightController, win)) {
      lineHeightController.show(targetMap, win);
    } else {
      lineHeightController.hide();
    }
  } catch {}

  // Time-Line Hovmoller (per-window state)
  try {
    if (hovLayer && hasPanel(hovmollerController, win)) {
      hovmollerController.show(targetMap, win);
    } else {
      hovmollerController.hide();
    }
  } catch {}

  // T-LogP (global singleton: one floating panel shared by all windows)
  try {
    if (tlogpLayer && hasPanel(tlogpController, win)) {
      tlogpController.show(targetMap, win);
      ensureTlogpHighlight(targetMap || tlogpController.activeMap);
      // A second window may carry a different sounding station. Reload so the
      // shared panel reflects the focused window instead of the stale one.
      const targetStation = targetStationForWin(win, tlogpLayer);
      if (
        targetStation &&
        String(targetStation) !== String(tlogpController.activeStationId) &&
        typeof tlogpController.setStation === "function"
      ) {
        try {
          const p = tlogpController.setStation(String(targetStation), win, targetMap || tlogpController.activeMap);
          if (p && typeof p.catch === "function") p.catch(() => {});
        } catch {}
      }
    } else {
      tlogpController.hide();
    }
  } catch {}

  return {
    tlogp: Boolean(tlogpLayer),
    timeheight: Boolean(thLayer),
    lineheight: Boolean(lhLayer),
    hovmoller: Boolean(hovLayer),
  };
}

export function hideAllProfilePanels() {
  return syncProfilePanelsForWindow(null, null);
}
