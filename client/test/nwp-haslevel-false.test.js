import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { loadWeatherField } from "../src/services/weatherLoader.js";
import { loadPresetGroup } from "../src/services/presetLoader.js";
import { resolveForecastCycles } from "../src/utils/timelineSync.js";
import { getPrefetchTargets } from "../src/services/prefetchService.js";
import { getLayersForWindow } from "../src/ui/layerControl.js";
import { clearDataCache } from "../src/api/apiClient.js";

describe("hasLevel: false NWP field loading and preset handling", () => {
  let originalFetch;
  let fetchedRequests = [];

  const mockMap = {
    isStyleLoaded: () => true,
    loaded: () => true,
    getSource: () => null,
    getLayer: () => null,
    addSource: () => {},
    addLayer: () => {},
    removeLayer: () => {},
    removeSource: () => {},
    setLayoutProperty: () => {},
    setPaintProperty: () => {},
    getBounds: () => ({
      toArray: () => [[70, 15], [140, 55]],
    }),
  };

  beforeEach(() => {
    clearDataCache();
    fetchedRequests = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      fetchedRequests.push(urlStr);

      if (urlStr.includes("/api/catalog/latest")) {
        return new Response(JSON.stringify({ latest: "26092608.024" }), { status: 200 });
      }
      if (urlStr.includes("/api/catalog/tree")) {
        return new Response(JSON.stringify([
          { name: "26092608.024", size: 1000 },
          { name: "26092608.012", size: 1000 }
        ]), { status: 200 });
      }
      if (urlStr.includes("/api/data/grid")) {
        return new Response(JSON.stringify({
          header: {
            element: "RAIN",
            level: 0,
            period: 24,
            start_lat: 55,
            end_lat: 15,
            start_lon: 70,
            end_lon: 140,
            n_lat: 10,
            n_lon: 10,
            d_lat: -4,
            d_lon: 7,
          },
          values: new Array(100).fill(5),
          stats: { min: 0, max: 20, mean: 5 },
        }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    };
  });

  afterEach(() => {
    clearDataCache();
    globalThis.fetch = originalFetch;
  });

  it("loadWeatherField constructs path without /null when level is null", async () => {
    const win = {
      id: "test-win-1",
      forecastCycle: "26092608",
      period: 24,
      level: null,
      layers: [],
    };

    await loadWeatherField(mockMap, "ECMWF_HR", "RAIN12", null, 24, null, win);

    const gridReqs = fetchedRequests.filter((r) => r.includes("/api/data/grid"));
    expect(gridReqs.length).toBeGreaterThan(0);
    for (const req of gridReqs) {
      expect(req).not.toContain("null");
      expect(req).toContain("path=ECMWF_HR%2FRAIN12");
      expect(req).toContain("file=26092608.024");
    }

    const layers = getLayersForWindow(win);
    const rainLayer = layers.find((l) => l.element === "RAIN12");
    expect(rainLayer).toBeDefined();
    expect(rainLayer.path).toBe("ECMWF_HR/RAIN12");
    expect(rainLayer.level).toBe(null);
    expect(rainLayer.name).toBe("RAIN12 (ECMWF_HR)");
  });

  it("loadWeatherField respects customOptions.path", async () => {
    const win = {
      id: "test-win-2",
      forecastCycle: "26092608",
      period: 24,
      level: null,
      layers: [],
    };

    await loadWeatherField(mockMap, "ECMWF_HR", "RAIN12", null, 24, {
      path: "CUSTOM_TABLE/RAIN12",
      name: "Custom 12h Rain",
    }, win);

    const gridReqs = fetchedRequests.filter((r) => r.includes("/api/data/grid"));
    expect(gridReqs.length).toBeGreaterThan(0);
    for (const req of gridReqs) {
      expect(req).toContain("path=CUSTOM_TABLE%2FRAIN12");
      expect(req).not.toContain("null");
    }

    const layers = getLayersForWindow(win);
    const rainLayer = layers.find((l) => l.element === "RAIN12");
    expect(rainLayer.name).toBe("Custom 12h Rain");
    expect(rainLayer.path).toBe("CUSTOM_TABLE/RAIN12");
  });

  it("loadPresetGroup with hasLevel: false loads ECMWF_HR/RAIN12 correctly without /null", async () => {
    const win = {
      id: "test-win-3",
      forecastCycle: "26092608",
      period: 24,
      level: null,
      layers: [],
    };

    const preset = {
      id: "ec-rain12",
      name: "ECMWF 12h Rain",
      hasLevel: false,
      defaultLevel: null,
      layers: [
        {
          id: "ec-rain12-layer",
          name: "12h Precipitation",
          model: "ECMWF_HR",
          element: "RAIN12",
          type: "contour",
          render: {
            colormap: "RAIN",
            showFill: true,
          },
        },
      ],
    };

    await loadPresetGroup(mockMap, preset, 24, null, win);

    const gridReqs = fetchedRequests.filter((r) => r.includes("/api/data/grid"));
    expect(gridReqs.length).toBeGreaterThan(0);
    for (const req of gridReqs) {
      expect(req).not.toContain("null");
      expect(req).toContain("path=ECMWF_HR%2FRAIN12");
      expect(req).toContain("file=26092608.024");
    }

    expect(win.level).toBe(null);
  });

  it("resolveForecastCycles with level: null queries ECMWF_HR/RAIN12 without /500", async () => {
    const cycles = await resolveForecastCycles("ECMWF_HR", "RAIN12", null, true);
    expect(cycles.length).toBeGreaterThan(0);

    const latestReqs = fetchedRequests.filter((r) => r.includes("/api/catalog/latest"));
    expect(latestReqs.length).toBeGreaterThan(0);
    for (const req of latestReqs) {
      expect(req).toContain("path=ECMWF_HR%2FRAIN12");
      expect(req).not.toContain("/500");
      expect(req).not.toContain("null");
    }
  });

  it("getPrefetchTargets with hasLevel: false suppresses Up/Down levels and prefetches path without level", () => {
    const win = {
      id: "test-win-prefetch",
      forecastCycle: "26092608",
      period: 24,
      level: null,
      activeGroup: {
        id: "ec-rain12",
        name: "ECMWF 12h Rain",
        hasLevel: false,
        defaultLevel: null,
        layers: [
          {
            id: "ec-rain12-layer",
            model: "ECMWF_HR",
            element: "RAIN12",
            type: "contour",
          },
        ],
      },
      layers: [],
    };

    const mockTimeline = {
      mode: "nwp",
      periods: {
        cycle: "26092608",
        current: 24,
        next: 30,
        prev: 18,
      },
    };

    const targets = getPrefetchTargets(win, { timelineSteps: mockTimeline });

    // Up and down must have undefined level and empty items because hasLevel is false
    expect(targets.up.level).toBeUndefined();
    expect(targets.up.items.length).toBe(0);
    expect(targets.down.level).toBeUndefined();
    expect(targets.down.items.length).toBe(0);

    // Left and right must prefetch ECMWF_HR/RAIN12 without level
    expect(targets.left.items).toBeDefined();
    expect(targets.left.items.length).toBeGreaterThan(0);
    expect(targets.left.items[0].path).toBe("ECMWF_HR/RAIN12");
    expect(targets.left.items[0].level).toBeNull();

    expect(targets.right.items).toBeDefined();
    expect(targets.right.items.length).toBeGreaterThan(0);
    expect(targets.right.items[0].path).toBe("ECMWF_HR/RAIN12");
    expect(targets.right.items[0].level).toBeNull();
  });
});
