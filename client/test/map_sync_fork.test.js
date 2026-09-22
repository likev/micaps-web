// map_sync_fork.test.js - Regression for split-view sync under the real
// production fork topology.
//
// Production: App.svelte mutates layout/syncMap through the Svelte 5 $state
// proxy fork, which does NOT write through to the plain core copy that
// windowMaps.js falls back to. Maps live only in the shared (never-proxied)
// registry, never on `win.map`. The legacy stale-core read therefore sees
// layout === "1x1" forever and every onMove bails.
//
// This test models the fork faithfully (deep CLONE, no write-through) and
// asserts: (1) legacy fallback does not sync (documents the bug), (2) the
// live-resolver path App.svelte now uses DOES sync move/zoom.
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { registerWindowMapSync, syncTabCameras } from "../src/ui/tabs/windowMaps.js";
import {
  tabsState as coreState,
  createDefaultTab,
  createDefaultWindow,
  setMapInstance,
  mapInstances,
} from "../src/lib/stores/tabsCore.js";

function makeMap(center = [0, 0], zoom = 1) {
  const listeners = { move: [] };
  const st = { center: [...center], zoom, pitch: 0, bearing: 0 };
  return {
    _st: st,
    isStyleLoaded: () => true,
    getCenter: () => [...st.center],
    getZoom: () => st.zoom,
    getPitch: () => st.pitch,
    getBearing: () => st.bearing,
    jumpTo(opts) {
      if (opts.center) st.center = [...opts.center];
      if (opts.zoom !== undefined) st.zoom = opts.zoom;
      if (opts.pitch !== undefined) st.pitch = opts.pitch;
      if (opts.bearing !== undefined) st.bearing = opts.bearing;
      [...listeners.move].forEach((fn) => fn());
    },
    on: (ev, cb) => { if (ev === "move") listeners.move.push(cb); },
    off: (ev, cb) => { if (ev === "move") listeners.move.splice(listeners.move.indexOf(cb), 1); },
    fireUserMove(c, z) {
      st.center = [...c];
      st.zoom = z;
      [...listeners.move].forEach((fn) => fn());
    },
  };
}

describe("Map sync under forked store (no write-through, registry-only maps)", () => {
  let cleanups = [];
  let liveTab;
  let mapA;
  let mapB;

  beforeEach(() => {
    cleanups = [];
    // Core stays at initial 1x1 — stale, as in production.
    coreState.tabs = [createDefaultTab(1)];
    coreState.activeTabId = 1;
    coreState.syncingTabs.clear();
    mapInstances.clear();

    // Live fork: clone (NO write-through), split layout only here.
    liveTab = JSON.parse(JSON.stringify(coreState.tabs[0]));
    liveTab.layout = "1x2";
    liveTab.syncMap = true;
    liveTab.activeWinIdx = 0;
    const liveWin1 = JSON.parse(JSON.stringify(createDefaultWindow(1, 1)));
    liveWin1.id = "tab-1-win-1";
    liveWin1.tabId = 1;
    liveTab.windows.push(liveWin1);
    liveTab.windows[0].id = coreState.tabs[0].windows[0].id;

    mapA = makeMap([116.4, 39.9], 4);
    mapB = makeMap([0, 0], 1);
    setMapInstance(liveTab.windows[0].id, mapA);
    setMapInstance(liveTab.windows[1].id, mapB);
  });

  afterEach(() => {
    cleanups.forEach((fn) => { try { fn(); } catch {} });
    coreState.syncingTabs.clear();
    mapInstances.clear();
  });

  it("stale-core fallback does NOT sync (documents the reported bug)", async () => {
    cleanups.push(registerWindowMapSync({ id: liveTab.windows[0].id, tabId: 1 }, mapA));
    cleanups.push(registerWindowMapSync({ id: liveTab.windows[1].id, tabId: 1 }, mapB));
    mapA.fireUserMove([121.5, 31.2], 6);
    await new Promise((r) => setTimeout(r, 80));
    expect(mapB._st.center).toEqual([0, 0]);
    expect(mapB._st.zoom).toBe(1);
  });

  it("live resolvers (App.svelte path) sync move/zoom to other windows", async () => {
    const opts = {
      getTab: () => liveTab,
      getMap: (id) => mapInstances.get(id) || null,
    };
    cleanups.push(registerWindowMapSync({ id: liveTab.windows[0].id, tabId: 1 }, mapA, opts));
    cleanups.push(registerWindowMapSync({ id: liveTab.windows[1].id, tabId: 1 }, mapB, opts));
    mapA.fireUserMove([121.5, 31.2], 6);
    await new Promise((r) => setTimeout(r, 80));
    expect(mapB._st.center).toEqual([121.5, 31.2]);
    expect(mapB._st.zoom).toBe(6);
  });

  it("syncTabCameras with live registry aligns split windows", () => {
    mapA._st.center = [110, 35];
    mapA._st.zoom = 7;
    syncTabCameras(liveTab, { getMap: (id) => mapInstances.get(id) || null });
    expect(mapB._st.center).toEqual([110, 35]);
    expect(mapB._st.zoom).toBe(7);
  });
});
