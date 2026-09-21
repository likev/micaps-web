// windowMaps.js - Window MapLibre instance lifecycle and camera synchronization
import { createMapInstance, setActiveMap } from "../../map/mapInstance.js";
import { tabsState, getVisibleWindows, isWindowVisible, getActiveTab } from "./tabsStore.js";

/**
 * Registers camera synchronization for a map instance attached to a window.
 * Returns an unregister function to remove listeners and cancel pending animation frames.
 */
export function registerWindowMapSync(win, map) {
  if (!win || !map) return () => {};

  const alignToActive = () => {
    const tab = tabsState.tabs.find((t) => t.id === win.tabId) || getActiveTab();
    if (!tab || tab.syncMap === false || tab.layout === "1x1") return;
    const activeWin = tab.windows[tab.activeWinIdx] || tab.windows[0];
    if (activeWin && activeWin !== win && activeWin.map) {
      try {
        map.jumpTo({
          center: activeWin.map.getCenter(),
          zoom: activeWin.map.getZoom(),
          pitch: activeWin.map.getPitch(),
          bearing: activeWin.map.getBearing(),
        });
      } catch {}
    }
  };

  if (map.isStyleLoaded && map.isStyleLoaded()) {
    alignToActive();
  } else if (typeof map.once === "function") {
    map.once("load", alignToActive);
  }

  let syncAnimId = null;
  const onMove = () => {
    const tab = tabsState.tabs.find((t) => t.id === win.tabId) || getActiveTab();
    if (!tab || tab.syncMap === false || tab.layout === "1x1" || tabsState.syncingTabs.has(tab.id)) return;
    if (!isWindowVisible(tab, win)) return;

    if (syncAnimId) return;
    const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
    syncAnimId = schedule(() => {
      syncAnimId = null;
      if (!tab || tab.syncMap === false || tab.layout === "1x1" || tabsState.syncingTabs.has(tab.id)) return;
      tabsState.syncingTabs.add(tab.id);
      try {
        const center = map.getCenter();
        const zoom = map.getZoom();
        const pitch = map.getPitch();
        const bearing = map.getBearing();

        getVisibleWindows(tab).forEach((otherWin) => {
          if (otherWin !== win && otherWin.map && (typeof otherWin.map.jumpTo === "function")) {
            const isLoaded = typeof otherWin.map.isStyleLoaded === "function" ? otherWin.map.isStyleLoaded() : true;
            if (isLoaded) {
              otherWin.map.jumpTo({ center, zoom, pitch, bearing });
            }
          }
        });
      } catch (err) {
        // ignore disposed map instances
      } finally {
        tabsState.syncingTabs.delete(tab.id);
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

export function initWindowMap(win) {
  if (win.map) return;
  const container = document.getElementById(win.domId);
  if (!container) return;

  const map = createMapInstance(container);
  win.map = map;

  if (win.tabId === 1 && win.winIdx === 0) {
    setActiveMap(map);
    if (typeof map.on === "function") {
      map.on("load", () => {
        window.__MAP_LOADED__ = true;
      });
    }
  }

  registerWindowMapSync(win, map);
}

export function syncTabCameras(tab) {
  if (!tab || tab.syncMap === false || tab.layout === "1x1" || tabsState.syncingTabs.has(tab.id)) return;
  const activeWin = tab.windows[tab.activeWinIdx] || tab.windows[0];
  if (!activeWin || !activeWin.map) return;

  const map = activeWin.map;
  tabsState.syncingTabs.add(tab.id);
  try {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const pitch = map.getPitch();
    const bearing = map.getBearing();

    getVisibleWindows(tab).forEach((otherWin) => {
      if (otherWin !== activeWin && otherWin.map && typeof otherWin.map.jumpTo === "function") {
        const isLoaded = typeof otherWin.map.isStyleLoaded === "function" ? otherWin.map.isStyleLoaded() : true;
        if (isLoaded) {
          otherWin.map.jumpTo({ center, zoom, pitch, bearing });
        }
      }
    });
  } catch (err) {
    // ignore
  } finally {
    tabsState.syncingTabs.delete(tab.id);
  }
}

