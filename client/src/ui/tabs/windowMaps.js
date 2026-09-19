// windowMaps.js - Window MapLibre instance lifecycle and camera synchronization
import { createMapInstance, setActiveMap } from "../../map/mapInstance.js";
import { tabsState, getVisibleWindows, isWindowVisible } from "./tabsStore.js";

export function initWindowMap(win) {
  if (win.map) return;
  const container = document.getElementById(win.domId);
  if (!container) return;

  const map = createMapInstance(container);
  win.map = map;

  if (win.tabId === 1 && win.winIdx === 0) {
    setActiveMap(map);
    map.on("load", () => {
      window.__MAP_LOADED__ = true;
    });
  }

  map.on("load", () => {
    const tab = tabsState.tabs.find((t) => t.id === win.tabId);
    if (tab && tab.syncMap && tab.layout !== "1x1") {
      const activeWin = tab.windows[tab.activeWinIdx] || tab.windows[0];
      if (activeWin && activeWin !== win && activeWin.map) {
        map.jumpTo({
          center: activeWin.map.getCenter(),
          zoom: activeWin.map.getZoom(),
          pitch: activeWin.map.getPitch(),
          bearing: activeWin.map.getBearing(),
        });
      }
    }
  });

  // Camera synchronization across visible windows in split mode (throttled via rAF)
  let syncAnimId = null;
  map.on("move", () => {
    const tab = tabsState.tabs.find((t) => t.id === win.tabId);
    if (!tab || !tab.syncMap || tab.layout === "1x1" || tabsState.syncingTabs.has(tab.id)) return;

    if (!isWindowVisible(tab, win)) return;

    if (syncAnimId) return;
    const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
    syncAnimId = schedule(() => {
      syncAnimId = null;
      if (!tab.syncMap || tab.layout === "1x1" || tabsState.syncingTabs.has(tab.id)) return;
      tabsState.syncingTabs.add(tab.id);
      try {
        const center = map.getCenter();
        const zoom = map.getZoom();
        const pitch = map.getPitch();
        const bearing = map.getBearing();

        getVisibleWindows(tab).forEach((otherWin) => {
          if (otherWin !== win && otherWin.map && (otherWin.map.isStyleLoaded() || otherWin.map.loaded())) {
            otherWin.map.jumpTo({ center, zoom, pitch, bearing });
          }
        });
      } finally {
        tabsState.syncingTabs.delete(tab.id);
      }
    });
  });
}

export function syncTabCameras(tab) {
  if (!tab || !tab.syncMap || tab.layout === "1x1" || tabsState.syncingTabs.has(tab.id)) return;
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
      if (otherWin !== activeWin && otherWin.map && (otherWin.map.isStyleLoaded() || otherWin.map.loaded())) {
        otherWin.map.jumpTo({ center, zoom, pitch, bearing });
      }
    });
  } finally {
    tabsState.syncingTabs.delete(tab.id);
  }
}
