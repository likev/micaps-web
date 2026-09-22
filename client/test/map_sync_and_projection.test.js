import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { registerWindowMapSync, syncTabCameras } from "../src/ui/tabs/windowMaps.js";
import { tabsState, createDefaultTab, createDefaultWindow } from "../src/lib/stores/tabsCore.js";
import {
  CURRENT_CONFIG,
  savePresetConfig,
  autoSaveLayerConfig,
  loadPresetGroups,
} from "../src/config/presets.js";
import { resolveInitialProjection, setMapProjection, getMapProjection } from "../src/map/mapInstance.js";
import { resolveDefaultProjection } from "../src/ui/layers/layerDefaults.js";

describe("Map Camera Synchronization in Split View", () => {
  let mockMap1, mockMap2;
  let moveListeners1 = [];
  let moveListeners2 = [];
  let cleanup1 = null;
  let cleanup2 = null;

  beforeEach(() => {
    moveListeners1 = [];
    moveListeners2 = [];

    mockMap1 = {
      isStyleLoaded: () => true,
      loaded: () => true,
      center: [116.4, 39.9],
      zoom: 4,
      pitch: 0,
      bearing: 0,
      getCenter: function () { return this.center; },
      getZoom: function () { return this.zoom; },
      getPitch: function () { return this.pitch; },
      getBearing: function () { return this.bearing; },
      jumpTo: function (opts) {
        if (opts.center) this.center = opts.center;
        if (opts.zoom !== undefined) this.zoom = opts.zoom;
        if (opts.pitch !== undefined) this.pitch = opts.pitch;
        if (opts.bearing !== undefined) this.bearing = opts.bearing;
      },
      on: function (event, cb) {
        if (event === "move") moveListeners1.push(cb);
      },
      off: function (event, cb) {
        if (event === "move") {
          moveListeners1 = moveListeners1.filter((fn) => fn !== cb);
        }
      },
      fireMove: function () {
        moveListeners1.forEach((fn) => fn());
      },
    };

    mockMap2 = {
      isStyleLoaded: () => true,
      loaded: () => true,
      center: [0, 0],
      zoom: 1,
      pitch: 0,
      bearing: 0,
      getCenter: function () { return this.center; },
      getZoom: function () { return this.zoom; },
      getPitch: function () { return this.pitch; },
      getBearing: function () { return this.bearing; },
      jumpTo: function (opts) {
        if (opts.center) this.center = opts.center;
        if (opts.zoom !== undefined) this.zoom = opts.zoom;
        if (opts.pitch !== undefined) this.pitch = opts.pitch;
        if (opts.bearing !== undefined) this.bearing = opts.bearing;
      },
      on: function (event, cb) {
        if (event === "move") moveListeners2.push(cb);
      },
      off: function (event, cb) {
        if (event === "move") {
          moveListeners2 = moveListeners2.filter((fn) => fn !== cb);
        }
      },
      fireMove: function () {
        moveListeners2.forEach((fn) => fn());
      },
    };

    // Setup 2-split tab (1x2)
    const testTab = createDefaultTab(1);
    testTab.layout = "1x2";
    testTab.syncMap = true;
    testTab.activeWinIdx = 0;

    const win0 = testTab.windows[0];
    win0.map = mockMap1;

    const win1 = createDefaultWindow(1, 1);
    win1.map = mockMap2;
    testTab.windows.push(win1);

    tabsState.tabs = [testTab];
    tabsState.activeTabId = 1;
    tabsState.syncingTabs.clear();
  });

  afterEach(() => {
    if (cleanup1) cleanup1();
    if (cleanup2) cleanup2();
    tabsState.syncingTabs.clear();
  });

  it("registers map sync and aligns newly created map to active window camera", () => {
    const tab = tabsState.tabs[0];
    const win1 = tab.windows[1];

    cleanup2 = registerWindowMapSync(win1, mockMap2);

    // mockMap2 should jumpTo mockMap1's camera
    expect(mockMap2.center).toEqual([116.4, 39.9]);
    expect(mockMap2.zoom).toBe(4);
  });

  it("synchronizes camera across visible windows on move", async () => {
    const tab = tabsState.tabs[0];
    const win0 = tab.windows[0];
    const win1 = tab.windows[1];

    cleanup1 = registerWindowMapSync(win0, mockMap1);
    cleanup2 = registerWindowMapSync(win1, mockMap2);

    // Pan map 1 to Shanghai
    mockMap1.center = [121.5, 31.2];
    mockMap1.zoom = 6;
    mockMap1.fireMove();

    // Wait for rAF/setTimeout throttling
    await new Promise((r) => setTimeout(r, 40));

    expect(mockMap2.center).toEqual([121.5, 31.2]);
    expect(mockMap2.zoom).toBe(6);
  });

  it("does not synchronize when syncMap is false", async () => {
    const tab = tabsState.tabs[0];
    tab.syncMap = false;

    const win0 = tab.windows[0];
    const win1 = tab.windows[1];

    cleanup1 = registerWindowMapSync(win0, mockMap1);
    cleanup2 = registerWindowMapSync(win1, mockMap2);

    // Change map 1
    mockMap1.center = [100, 30];
    mockMap1.fireMove();

    await new Promise((r) => setTimeout(r, 40));

    // mockMap2 should NOT have changed to [100, 30]
    expect(mockMap2.center).not.toEqual([100, 30]);
  });

  it("syncTabCameras explicitly aligns all visible windows to active window", () => {    const tab = tabsState.tabs[0];
    mockMap1.center = [110, 35];
    mockMap1.zoom = 7;
    mockMap1.pitch = 15;
    mockMap1.bearing = 30;

    syncTabCameras(tab);

    expect(mockMap2.center).toEqual([110, 35]);
    expect(mockMap2.zoom).toBe(7);
    expect(mockMap2.pitch).toBe(15);
    expect(mockMap2.bearing).toBe(30);
  });

  it("synchronizes when registered with an identity-mismatched handle (Svelte $state proxy)", async () => {
    // Production: App.svelte passes $state proxy windows while windowMaps
    // reads the raw core store. Proxy !== raw under ===/includes, so
    // identity MUST be compared by stable win.id. A shallow copy has the
    // same id with a different identity, faithfully simulating the proxy.
    const tab = tabsState.tabs[0];
    const win0Proxy = { ...tab.windows[0] };
    const win1Proxy = { ...tab.windows[1] };

    cleanup1 = registerWindowMapSync(win0Proxy, mockMap1);
    cleanup2 = registerWindowMapSync(win1Proxy, mockMap2);

    mockMap1.center = [121.5, 31.2];
    mockMap1.zoom = 6;
    mockMap1.fireMove();

    await new Promise((r) => setTimeout(r, 40));

    expect(mockMap2.center).toEqual([121.5, 31.2]);
    expect(mockMap2.zoom).toBe(6);
  });
});

describe("Map Config Projection Persistence", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.clear();
      }
    } catch {}
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("savePresetConfig persists projection and scheme to localStorage and window.__MICAPS_CONFIG__", async () => {
    let savedBody = null;
    globalThis.fetch = async (url, opts) => {
      if (opts?.method === "POST") {
        savedBody = JSON.parse(opts.body);
        return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("{}", { status: 200 });
    };

    const newCfg = {
      basemap: {
        projection: "globe",
        scheme: "light",
      },
      presets: [
        { id: "p1", name: "Preset 1", layers: [] }
      ],
    };

    const res = await savePresetConfig(newCfg);
    expect(res.ok).toBe(true);
    expect(savedBody.basemap.projection).toBe("globe");
    expect(savedBody.basemap.scheme).toBe("light");

    if (typeof localStorage !== "undefined") {
      expect(localStorage.getItem("micaps-map-projection")).toBe("globe");
      expect(localStorage.getItem("micaps-basemap-scheme")).toBe("light");
    }
    if (typeof window !== "undefined") {
      expect(window.__MICAPS_CONFIG__.basemap.projection).toBe("globe");
    }
  });

  it("autoSaveLayerConfig updates CURRENT_CONFIG.basemap and localStorage for pmtiles layer", () => {
    if (!CURRENT_CONFIG.basemap) CURRENT_CONFIG.basemap = {};
    const pmtilesLayer = {
      id: "layer-pmtiles-win-0",
      type: "pmtiles",
      config: {
        projection: "vertical-perspective",
        scheme: "micaps",
        showGraticule: true,
      },
    };

    autoSaveLayerConfig(pmtilesLayer);

    expect(CURRENT_CONFIG.basemap.projection).toBe("vertical-perspective");
    expect(CURRENT_CONFIG.basemap.scheme).toBe("micaps");
    if (typeof localStorage !== "undefined") {
      expect(localStorage.getItem("micaps-map-projection")).toBe("vertical-perspective");
      expect(localStorage.getItem("micaps-basemap-scheme")).toBe("micaps");
    }
  });

  it("resolveInitialProjection prioritizes config projection over stale localStorage", () => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("micaps-map-projection", "mercator");
    }
    if (typeof window !== "undefined") {
      window.__MICAPS_CONFIG__ = { basemap: { projection: "globe" } };
    }
    if (typeof globalThis !== "undefined") {
      globalThis.__MICAPS_CONFIG__ = { basemap: { projection: "globe" } };
    }

    expect(resolveInitialProjection()).toBe("globe");
    expect(resolveDefaultProjection()).toBe("globe");
  });
});
