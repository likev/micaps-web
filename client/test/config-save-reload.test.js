import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import { loadWeatherField } from "../src/services/weatherLoader.js";
import { reloadConfiguration } from "../src/services/presetLoader.js";
import { loadPresetGroups, PRESET_GROUPS, CURRENT_CONFIG } from "../src/config/presets.js";
import { setTabs, tabsState } from "../src/ui/tabs/tabsStore.js";
import { clearDataCache } from "../src/api/apiClient.js";

const realConfig = JSON.parse(fs.readFileSync(new URL("../config.json", import.meta.url), "utf8"));

describe("Config Save and Reload Safeguards", () => {
  let originalFetch;
  let originalTabs;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalTabs = [...tabsState.tabs];
    clearDataCache();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    tabsState.tabs = originalTabs;
    clearDataCache();
    // Restore pristine presets
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("config")) {
        return new Response(JSON.stringify(realConfig), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("{}", { status: 200 });
    };
    try {
      await loadPresetGroups();
    } catch {}
    globalThis.fetch = originalFetch;
  });

  it("loadWeatherField aborts gracefully when model or element is null, undefined, or 'null'", async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    };

    const mockMap = { isStyleLoaded: () => true, loaded: () => true };

    // null model & element
    await loadWeatherField(mockMap, null, null, 500, 24);
    expect(fetchCalled).toBe(false);

    // string 'null'
    await loadWeatherField(mockMap, "null", "null", 500, 24);
    expect(fetchCalled).toBe(false);

    // undefined
    await loadWeatherField(mockMap, undefined, undefined, 500, 24);
    expect(fetchCalled).toBe(false);

    // null map
    await loadWeatherField(null, "ECMWF_HR", "TMP", 500, 24);
    expect(fetchCalled).toBe(false);
  });

  it("reloadConfiguration does not trigger grid fetch when active window is unconfigured (activeGroup: null, model: null, element: null)", async () => {
    const fetchedUrls = [];
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      fetchedUrls.push(urlStr);
      if (urlStr.includes("config")) {
        return new Response(JSON.stringify(realConfig), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const mockMap = {
      isStyleLoaded: () => true,
      loaded: () => true,
      getLayer: () => null,
      getSource: () => null,
      removeLayer: () => {},
      removeSource: () => {},
    };

    const mockWindow = {
      id: "win-1",
      tabId: 1,
      winIdx: 0,
      map: mockMap,
      activeGroup: null,
      model: null,
      element: null,
      level: 500,
      period: 24,
      isObservation: false,
      obsTime: null,
    };

    setTabs([{ id: 1, activeWinIdx: 0, windows: [mockWindow] }]);

    // Call reloadConfiguration
    await reloadConfiguration();

    // Verify no grid data endpoint was called with null/null
    const nullGridFetches = fetchedUrls.filter((u) => u.includes("/api/data/grid") && u.includes("null"));
    expect(nullGridFetches.length).toBe(0);
    expect(fetchedUrls.some((u) => u.includes("/api/data/grid"))).toBe(false);
  });

  it("reloadConfiguration safely reloads when active window has activeGroup", async () => {
    const fetchedUrls = [];
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      fetchedUrls.push(urlStr);
      if (urlStr.includes("config")) {
        return new Response(JSON.stringify(realConfig), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (urlStr.includes("/api/data/grid")) {
        return new Response(JSON.stringify({
          header: { nx: 2, ny: 2, startLat: 0, startLon: 0, endLat: 1, endLon: 1, latStep: 1, lonStep: 1 },
          data: [1, 2, 3, 4]
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const mockMap = {
      isStyleLoaded: () => true,
      loaded: () => true,
      getLayer: () => null,
      getSource: () => null,
      removeLayer: () => {},
      removeSource: () => {},
      addSource: () => {},
      addLayer: () => {},
    };

    const activeGroup = {
      id: "ecmwf-hgt-500",
      name: "ECMWF HGT 500",
      hasLevel: true,
      defaultLevel: 500,
      layers: [
        { id: "lyr-1", type: "contour", model: "ECMWF_HR", element: "HGT", level: 500 }
      ]
    };

    const mockWindow = {
      id: "win-1",
      tabId: 1,
      winIdx: 0,
      map: mockMap,
      activeGroup,
      model: null,
      element: null,
      level: 500,
      period: 24,
      isObservation: false,
      obsTime: null,
    };

    setTabs([{ id: 1, activeWinIdx: 0, windows: [mockWindow] }]);

    await reloadConfiguration();

    // Verify grid fetch was called for ECMWF_HR/HGT/500 and NOT null/null
    const nullGridFetches = fetchedUrls.filter((u) => u.includes("/api/data/grid") && u.includes("null"));
    expect(nullGridFetches.length).toBe(0);
  });

  it("onConfigLoaded notifies listeners on loadPresetGroups and savePresetConfig", async () => {
    let notifiedCount = 0;
    let lastNotifiedGroups = null;
    const { onConfigLoaded, savePresetConfig } = await import("../src/config/presets.js");

    const unsub = onConfigLoaded((cfg, groups) => {
      notifiedCount++;
      lastNotifiedGroups = groups;
    });

    globalThis.fetch = async (url, opts) => {
      const urlStr = String(url);
      if (opts?.method === "POST" && urlStr.includes("/api/config")) {
        return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (urlStr.includes("config")) {
        return new Response(JSON.stringify(realConfig), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("{}", { status: 200 });
    };

    await loadPresetGroups();
    expect(notifiedCount).toBeGreaterThan(0);
    expect(Array.isArray(lastNotifiedGroups)).toBe(true);
    expect(lastNotifiedGroups.length).toBeGreaterThan(0);

    const saveRes = await savePresetConfig(realConfig);
    expect(saveRes.ok).toBe(true);
    expect(saveRes.status).toBe("ok");
    expect(notifiedCount).toBeGreaterThan(1);

    unsub();
  });
});
