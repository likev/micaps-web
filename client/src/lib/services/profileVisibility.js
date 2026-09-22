// profileVisibility.js - Central auto hide/show for floating profile panels on window focus.
//
// Regression: the Svelte refactor dropped the legacy bootstrap onWindowFocus
// controller show/hide sequence. Toggling window tabs left T-LogP, Time-Height,
// Line-Height and Time-Line (Hovmoller) panels stuck visible (or hidden).
// Both App.svelte handleWindowFocus and legacy callers must route through
// syncProfilePanelsForWindow(win, map) on every window-tab toggle.
import { getLayersForWindow } from "../stores/layersCore.js";
import { hasProfilePanel } from "../stores/profilesCore.js";
import { tlogpController } from "../../layers/tlogp/tlogpController.js";
import { timeHeightController } from "../../layers/timeheight/timeHeightController.js";
import { lineHeightController } from "../../layers/lineprofile/lineHeightController.js";
import { hovmollerController } from "../../layers/lineprofile/hovmollerController.js";

function findStoreLayer(win, types, ids = []) {
  try {
    const stored = getLayersForWindow(win);
    if (Array.isArray(stored)) {
      return stored.find((l) => l && (types.includes(l.type) || (l.id && ids.includes(l.id)))) || null;
    }
  } catch {}
  return null;
}

function findVisibleLayer(win, types, ids = []) {
  // The layer store is authoritative: an eye-hidden (visible === false) entry
  // stays hidden even if a stale preset copy still claims visible.
  const storeLayer = findStoreLayer(win, types, ids);
  if (storeLayer) return storeLayer.visible === false ? null : storeLayer;
  // No store record (never loaded in this session): fall back to preset copies.
  const fallback = [];
  try {
    if (Array.isArray(win.activeGroup?.layers)) fallback.push(...win.activeGroup.layers);
  } catch {}
  try {
    if (Array.isArray(win.layers)) fallback.push(...win.layers);
  } catch {}
  for (const l of fallback) {
    if (!l) continue;
    const typeMatch = types.includes(l.type);
    const idMatch = l.id && ids.includes(l.id);
    if (!typeMatch && !idMatch) continue;
    if (l.visible === false) continue;
    return l;
  }
  return null;
}

function hasPanel(type, win) {
  // Readiness comes from the shared profile registry (maintained by the
  // controllers on init/show/destroy) — never probe controller internals.
  // Falls back to legacy probing for states seeded outside init (tests).
  try {
    if (hasProfilePanel(type, win?.id)) return true;
  } catch {}
  try {
    const map = { timeheight: timeHeightController, lineheight: lineHeightController, hovmoller: hovmollerController };
    const controller = map[type];
    if (controller) {
      if (typeof controller.isActive === "function" && controller.isActive(win)) return true;
      const winId = win?.id;
      if (winId && controller?.windows instanceof Map) {
        if (controller.windows.get(winId)?.panel) return true;
      }
    } else if (type === "tlogp") {
      if (typeof tlogpController.isActive === "function" && tlogpController.isActive()) return true;
      if (tlogpController.panel) return true;
    }
  } catch {}
  return false;
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
    if (thLayer && hasPanel("timeheight", win)) {
      timeHeightController.show(targetMap, win);
    } else {
      timeHeightController.hide();
    }
  } catch {}

  // Line-Height section (per-window state)
  try {
    if (lhLayer && hasPanel("lineheight", win)) {
      lineHeightController.show(targetMap, win);
    } else {
      lineHeightController.hide();
    }
  } catch {}

  // Time-Line Hovmoller (per-window state)
  try {
    if (hovLayer && hasPanel("hovmoller", win)) {
      hovmollerController.show(targetMap, win);
    } else {
      hovmollerController.hide();
    }
  } catch {}

  // T-LogP (global singleton: one floating panel shared by all windows)
  try {
    if (tlogpLayer && hasPanel("tlogp", win)) {
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
