// windowMaps.js - Window MapLibre instance lifecycle and camera synchronization
import { createMapInstance, setActiveMap } from "../../map/mapInstance.js";
import {
  tabsState as coreTabsState,
  getVisibleWindows as coreGetVisibleWindows,
  getActiveTab as coreGetActiveTab,
  getMapInstance as coreGetMapInstance,
  setMapInstance as coreSetMapInstance,
} from "../../lib/stores/tabsCore.js";

/**
 * Resolve the live MapLibre instance for a window id.
 * Primary: shared plain registry (written by App/mapViewport via
 * tabs.svelte.js which re-exports the SAME Map object — never forked).
 * Fallback: `win.map` property (legacy tests / callers that assign it).
 */
function resolveMap(winOrId, fallbackWin = null) {
  const id = typeof winOrId === "string" ? winOrId : winOrId?.id;
  if (id !== undefined && id !== null) {
    try {
      const m = coreGetMapInstance(id);
      if (m) return m;
    } catch {}
  }
  const w = (typeof winOrId === "object" && winOrId !== null ? winOrId : fallbackWin);
  if (w && w.map && typeof w.map.jumpTo === "function") return w.map;
  return null;
}

/**
 * ID-based visibility: never use reference equality (`includes`/`===`).
 * The tab object may be a Svelte 5 $state proxy while windows come from
 * another store copy — proxy !== raw under === even for the same win.id.
 */
function isVisibleById(tab, winId, getVisible) {
  if (!tab || winId === undefined || winId === null) return false;
  try {
    const visible = (getVisible || coreGetVisibleWindows)(tab);
    return Array.isArray(visible) && visible.some((w) => w && w.id === winId);
  } catch {
    return false;
  }
}

/**
 * Registers camera synchronization for a map instance attached to a window.
 * Returns an unregister function to remove listeners and cancel pending animation frames.
 *
 * @param {object} win - window handle (must carry stable `id` + `tabId`).
 * @param {object} map - MapLibre instance for `win`.
 * @param {object} [opts] - live resolvers injected by App.svelte.
 *   - getTab(): returns the LIVE tab object (Svelte proxy store). Falls back
 *     to the plain core store when omitted (plain-JS unit tests).
 *   - getMap(winId): returns the LIVE map instance (shared registry).
 *   - getVisible(tab): visible-windows selector (pure, defaults to core).
 *   Without live resolvers the sync engine reads the stale core copy:
 *   App mutates layout/syncMap through the $state proxy fork, so the core
 *   copy stays `layout === "1x1"` forever and every onMove bails — exactly
 *   the reported "move/zoom in one window didn't sync" bug.
 */
export function registerWindowMapSync(win, map, opts = {}) {
  if (!win || !map) return () => {};
  const winId = win.id;
  const winTabId = win.tabId;

  const getTab = typeof opts.getTab === "function"
    ? opts.getTab
    : () => coreTabsState.tabs.find((t) => t.id === winTabId) || coreGetActiveTab();
  const getMap = typeof opts.getMap === "function" ? opts.getMap : (id) => resolveMap(id);
  const getVisible = typeof opts.getVisible === "function" ? opts.getVisible : coreGetVisibleWindows;

  const findSelf = (tab) => {
    if (!tab || !Array.isArray(tab.windows)) return null;
    if (winId !== undefined && winId !== null) {
      return tab.windows.find((w) => w && w.id === winId) || null;
    }
    return null;
  };

  const alignToActive = () => {
    const tab = getTab();
    if (!tab || tab.syncMap === false || tab.layout === "1x1") return;
    const self = findSelf(tab);
    const activeWin = tab.windows[tab.activeWinIdx] || tab.windows[0];
    if (!activeWin || !self || activeWin.id === self.id) return;
    const activeMap = getMap(activeWin.id) || activeWin.map;
    if (!activeMap || typeof activeMap.getCenter !== "function") return;
    try {
      map.jumpTo({
        center: activeMap.getCenter(),
        zoom: activeMap.getZoom(),
        pitch: activeMap.getPitch(),
        bearing: activeMap.getBearing(),
      });
    } catch {}
  };

  if (map.isStyleLoaded && map.isStyleLoaded()) {
    alignToActive();
  } else if (typeof map.once === "function") {
    map.once("load", alignToActive);
  }

  let syncAnimId = null;
  const onMove = () => {
    // Read the tab LIVE on every event: layout/syncMap may have changed
    // since registration (1x1 -> 1x2/2x2, sync toggled).
    const tab = getTab();
    if (!tab || tab.syncMap === false || tab.layout === "1x1") return;
    if (coreTabsState.syncingTabs.has(tab.id)) return;
    if (!isVisibleById(tab, winId, getVisible)) return;

    if (syncAnimId) return;
    const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
    syncAnimId = schedule(() => {
      syncAnimId = null;
      // Re-read inside the frame: the toggle may have flipped mid-throttle.
      const liveTab = getTab();
      if (!liveTab || liveTab.syncMap === false || liveTab.layout === "1x1") return;
      if (coreTabsState.syncingTabs.has(liveTab.id)) return;
      coreTabsState.syncingTabs.add(liveTab.id);
      try {
        const center = map.getCenter();
        const zoom = map.getZoom();
        const pitch = map.getPitch();
        const bearing = map.getBearing();

        getVisible(liveTab).forEach((otherWin) => {
          if (!otherWin || otherWin.id === winId) return;
          const otherMap = getMap(otherWin.id) || otherWin.map;
          if (!otherMap || typeof otherMap.jumpTo !== "function") return;
          const isLoaded = typeof otherMap.isStyleLoaded === "function" ? otherMap.isStyleLoaded() : true;
          if (isLoaded) {
            otherMap.jumpTo({ center, zoom, pitch, bearing });
          }
        });
      } catch (err) {
        // ignore disposed map instances
      } finally {
        coreTabsState.syncingTabs.delete(liveTab.id);
      }
    });
  };

  if (typeof map.on === "function") {
    map.on("move", onMove);
  }

  return () => {
    if (syncAnimId) {
      const cancel = typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : clearTimeout;
      cancel(syncAnimId);
      syncAnimId = null;
    }
    if (typeof map.off === "function") {
      map.off("move", onMove);
    }
  };
}

export function initWindowMap(win, opts = {}) {
  const existing = resolveMap(win?.id, win);
  if (existing) return existing;
  const container = typeof document !== "undefined" ? document.getElementById(win.domId) : null;
  if (!container) return null;

  const map = createMapInstance(container);
  try { coreSetMapInstance(win.id, map); } catch {}
  try { win.map = map; } catch {}

  if (win.tabId === 1 && win.winIdx === 0) {
    setActiveMap(map);
    if (typeof map.on === "function") {
      map.on("load", () => {
        try { window.__MAP_LOADED__ = true; } catch {}
      });
    }
  }

  registerWindowMapSync(win, map, opts);
  return map;
}

/**
 * Explicitly align all visible windows to the active window's camera
 * (used on layout change 1x1 -> split and on sync-toggle on).
 * Accepts the same live `getMap` resolver; falls back to registry/win.map.
 */
export function syncTabCameras(tab, opts = {}) {
  if (!tab || tab.syncMap === false || tab.layout === "1x1") return;
  if (coreTabsState.syncingTabs.has(tab.id)) return;
  const getMap = typeof opts.getMap === "function" ? opts.getMap : (id) => resolveMap(id);
  const getVisible = typeof opts.getVisible === "function" ? opts.getVisible : coreGetVisibleWindows;
  const activeWin = tab.windows[tab.activeWinIdx] || tab.windows[0];
  if (!activeWin) return;
  const map = getMap(activeWin.id) || activeWin.map;
  if (!map || typeof map.getCenter !== "function") return;

  coreTabsState.syncingTabs.add(tab.id);
  try {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const pitch = map.getPitch();
    const bearing = map.getBearing();

    getVisible(tab).forEach((otherWin) => {
      if (!otherWin || otherWin.id === activeWin.id) return;
      const otherMap = getMap(otherWin.id) || otherWin.map;
      if (!otherMap || typeof otherMap.jumpTo !== "function") return;
      const isLoaded = typeof otherMap.isStyleLoaded === "function" ? otherMap.isStyleLoaded() : true;
      if (isLoaded) {
        otherMap.jumpTo({ center, zoom, pitch, bearing });
      }
    });
  } catch (err) {
    // ignore
  } finally {
    coreTabsState.syncingTabs.delete(tab.id);
  }
}
