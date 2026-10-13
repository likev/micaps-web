import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import {
  createDefaultTab,
  createDefaultWindow,
  applyAutoAllocation,
  prepareSplitWindows,
  DEFAULT_MODELS,
  getVisibleWindows,
  isModelLayerSupported,
  getEligibleModelsForAllocation,
  getEligibleModelsForAllocationAsync,
  preloadModelLevels,
  setModelLevelsCache,
} from "../src/lib/stores/tabsCore.js";
import { applyPresetToWindow } from "../src/lib/services/appWorkflow.js";
import { loadPresetGroup } from "../src/services/presetLoader.js";
import { resolveLayerTime, parseTimestamp } from "../src/utils/timeResolver.js";

describe("Bug Fix Verification: NWP chip-age +1068h and 6-Model Split Allocation", () => {
  let originalFetch;
  let originalWindow;

  beforeAll(async () => {
    originalFetch = globalThis.fetch;
    originalWindow = globalThis.window;
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/catalog/levels")) {
        const u = new URL(urlStr, "http://localhost");
        const path = u.searchParams.get("path") || "";
        if (path.includes("SHANGHAI_MR") || path.includes("GRAPES_3KM")) {
          return new Response(JSON.stringify([1000, 925, 850]));
        }
        return new Response(JSON.stringify([1000, 925, 850, 700, 500, 400, 300, 200, 100]));
      }
      if (urlStr.includes("/api/catalog/latest")) {
        return new Response(JSON.stringify({ cycle: "26101208" }));
      }
      if (urlStr.includes("/api/catalog/cycles")) {
        return new Response(JSON.stringify(["26101208", "26101202", "26101120"]));
      }
      if (urlStr.includes("/api/catalog/tree")) {
        return new Response(JSON.stringify([
          { name: "26101208.024", size: 1000 },
          { name: "26101208.012", size: 1000 },
        ]));
      }
      if (urlStr.includes("/api/data/grid")) {
        return new Response(JSON.stringify({
          header: {
            element: "RAIN12",
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
          values: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 20)),
          stats: { min: 0, max: 50 },
        }), { status: 200 });
      }
      if (typeof originalFetch === "function") {
        return originalFetch(url);
      }
      return new Response(JSON.stringify([]));
    };

    // Pre-populate level cache so sync calls behave deterministically
    await preloadModelLevels();
    setModelLevelsCache("SHANGHAI_MR", "RAIN12", [1000, 925, 850]);
    setModelLevelsCache("GRAPES_3KM", "RAIN12", [1000, 925, 850]);
    setModelLevelsCache("ECMWF_HR", "RAIN12", [1000, 925, 850, 700, 500, 400, 300, 200, 100]);
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  describe("Issue 1: NWP chip-age +1068h cursor mismatch fix", () => {
    it("clears stale observation wallClockCursor and obsTime when applying NWP preset", () => {
      const win = createDefaultWindow(0, 1);
      // Simulate existing observation window state (Aug 28, 2026 20:00)
      win.isObservation = true;
      win.obsTime = "26082820.000";
      win.wallClockCursor = parseTimestamp("26082820.000");

      const rainPreset = {
        id: "multi-model-rain12",
        name: "ECMWF Rain12",
        category: "NWP Synoptic Rain",
        hasLevel: false,
        isObservation: false,
        layers: [
          {
            id: "rain12-ec",
            name: "Rain12 ECMWF_HR",
            model: "ECMWF_HR",
            element: "RAIN12",
            type: "contour",
          },
        ],
      };

      applyPresetToWindow(win, rainPreset);

      expect(win.isObservation).toBe(false);
      expect(win.obsTime).toBeNull();
      expect(win.wallClockCursor).toBeNull();
      expect(win.level).toBeNull();
    });

    it("applyPresetToWindow clears window.__MICAPS_CURSOR__ when switching to NWP preset without cycle", () => {
      const prevWin = globalThis.window;
      globalThis.window = globalThis.window || {
        addEventListener: () => {},
        removeEventListener: () => {},
      };
      globalThis.window.__MICAPS_CURSOR__ = parseTimestamp("26082820.000");

      try {
        const win = createDefaultWindow(0, 1);
        win.isObservation = true;
        win.obsTime = "26082820.000";

        const rainPreset = {
          id: "multi-model-rain12",
          hasLevel: false,
          isObservation: false,
          layers: [{ id: "rain12-ec", model: "ECMWF_HR", element: "RAIN12" }],
        };

        applyPresetToWindow(win, rainPreset);
        expect(globalThis.window.__MICAPS_CURSOR__).toBeNull();

        // When forecastCycle is provided on group, it initializes window.__MICAPS_CURSOR__
        const rainWithCycle = {
          ...rainPreset,
          forecastCycle: "26101208",
          period: 24,
        };
        applyPresetToWindow(win, rainWithCycle);
        expect(globalThis.window.__MICAPS_CURSOR__).toBe(parseTimestamp({ cycle: "26101208", period: 24 }));
      } finally {
        if (prevWin === undefined) {
          delete globalThis.window;
        } else {
          globalThis.window = prevWin;
        }
      }
    });

    it("loadPresetGroup initializes win.wallClockCursor to NWP forecast valid time", async () => {
      const win = createDefaultWindow(0, 1);
      // Stale observation cursor that previously caused +1068h
      win.obsTime = "26082820.000";
      win.wallClockCursor = parseTimestamp("26082820.000");

      const rainPreset = {
        id: "multi-model-rain12",
        name: "ECMWF Rain12",
        hasLevel: false,
        isObservation: false,
        layers: [
          {
            id: "rain12-ec",
            name: "Rain12 ECMWF_HR",
            model: "ECMWF_HR",
            element: "RAIN12",
            type: "contour",
          },
        ],
      };

      const mockMap = {
        getSource: () => null,
        getLayer: () => null,
        addSource: () => {},
        addLayer: () => {},
        removeSource: () => {},
        removeLayer: () => {},
        isStyleLoaded: () => true,
        loaded: () => true,
        setLayoutProperty: () => {},
      };

      // Period +24h on cycle 26101208 -> Valid time 2026-10-13 08:00:00 UTC
      await loadPresetGroup(mockMap, rainPreset, 24, null, win, false);

      expect(win.forecastCycle).toBe("26101208");
      expect(win.period).toBe(24);
      expect(win.wallClockCursor).not.toBeNull();

      const expectedValidTime = parseTimestamp({ cycle: "26101208", period: 24 });
      expect(win.wallClockCursor).toBe(expectedValidTime);

      // Verify resolved layer time with active cursor produces 0m age, NOT +1068h
      const layer = {
        id: "rain12-ec",
        model: "ECMWF_HR",
        element: "RAIN12",
        cycle: "26101208",
        period: 24,
      };

      const status = resolveLayerTime(layer, win.wallClockCursor);
      expect(status.ageStr).toBe("±0m");
      expect(status.ageMinutes).toBe(0);
      expect(status.ageStr).not.toContain("1068h");
    });

    it("NWP window derives cursorTime from forecastCycle + period, avoiding stale obsTime or global cursor", () => {
      // Simulate the derivation logic in LayersPanel.svelte and WindowPanel.svelte
      const winObj = {
        isObservation: false,
        forecastCycle: "26101208",
        period: 24,
        obsTime: "26082820.000", // Stale obsTime leftover
        wallClockCursor: null,
      };

      // When isObservation is false, forecast valid time must win over obsTime
      const nwpValidTime = winObj.forecastCycle
        ? parseTimestamp({ cycle: winObj.forecastCycle, period: winObj.period ?? 0 })
        : null;

      const cursorTime = winObj.isObservation
        ? (winObj.wallClockCursor || (winObj.obsTime ? parseTimestamp(winObj.obsTime) : null))
        : (nwpValidTime || winObj.wallClockCursor);

      const expectedValidTime = parseTimestamp({ cycle: "26101208", period: 24 });
      expect(cursorTime).toBe(expectedValidTime);

      // Diff between cursor and NWP layer must be 0
      const layer = { forecastCycle: "26101208", period: 24, element: "RAIN12" };
      const resolved = resolveLayerTime(layer, cursorTime);
      expect(resolved.ageMinutes).toBe(0);
      expect(resolved.ageStr).toBe("±0m");
    });
  });

  describe("Issue 2: 6 Valid Models in 2x3 and 3x2 Split with hasLevel: false", () => {
    it("getEligibleModelsForAllocation does NOT filter by level when hasLevel: false", () => {
      const rainPreset = {
        id: "multi-model-rain12",
        hasLevel: false,
        layers: [
          { element: "RAIN12", model: "ECMWF_HR", type: "contour" },
        ],
      };

      const eligible = getEligibleModelsForAllocation(rainPreset, 500, DEFAULT_MODELS);
      // All 6 models must be present despite GRAPES_3KM and SHANGHAI_MR not having 500 hPa level
      expect(eligible).toHaveLength(6);
      expect(eligible).toEqual([
        "ECMWF_HR",
        "GRAPES_GFS",
        "GRAPES_3KM",
        "SHANGHAI_MR",
        "BEIJING_MR",
        "JAPAN_MR",
      ]);
    });

    it("getEligibleModelsForAllocation does NOT filter by level when layers declare no level (even with default level=500)", () => {
      const surfaceWindow = {
        layers: [
          { element: "RAIN12" }, // Note: no hasLevel: false or level property on layer!
        ],
      };

      // Calling without specifying level uses default level=null
      const eligible = getEligibleModelsForAllocation(surfaceWindow);
      expect(eligible).toEqual(DEFAULT_MODELS);
      expect(eligible).toHaveLength(6);
    });

    it("getEligibleModelsForAllocationAsync does NOT filter by level when layers declare no level (uses default level=null)", async () => {
      const surfaceWindow = {
        layers: [
          { element: "RAIN12" },
        ],
      };

      const eligible = await getEligibleModelsForAllocationAsync(surfaceWindow);
      expect(eligible).toEqual(DEFAULT_MODELS);
      expect(eligible).toHaveLength(6);
    });

    it("preserves 500 hPa exclusion for upper-air presets that actually have vertical levels", () => {
      const upperAir500 = {
        id: "composite-500hpa",
        level: 500,
        hasLevel: true,
        layers: [
          { element: "RH", type: "contour" },
          { element: "TMP", type: "contour" },
        ],
      };

      const eligible = getEligibleModelsForAllocation(upperAir500, 500, DEFAULT_MODELS);
      // GRAPES_3KM and SHANGHAI_MR only support [1000, 925, 850], so excluded at 500 hPa
      expect(eligible).not.toContain("GRAPES_3KM");
      expect(eligible).not.toContain("SHANGHAI_MR");
      expect(eligible).toEqual([
        "ECMWF_HR",
        "GRAPES_GFS",
        "BEIJING_MR",
        "JAPAN_MR",
      ]);
    });

    it("applyAutoAllocation in 2x3 split populates all 6 windows with the 6 DEFAULT_MODELS for multi-model-rain12", () => {
      const tab = createDefaultTab(1);
      tab.layout = "2x3";

      const rainPreset = {
        id: "multi-model-rain12",
        name: "ECMWF Rain12",
        hasLevel: false,
        isObservation: false,
        layers: [
          { element: "RAIN12", model: "ECMWF_HR", type: "contour" },
        ],
      };

      const win0 = {
        ...createDefaultWindow(0, 1),
        model: "ECMWF_HR",
        element: "RAIN12",
        level: null,
        hasLevel: false,
        period: 24,
        forecastCycle: "26101208",
        activeGroup: rainPreset,
      };

      tab.windows = [
        win0,
        ...Array.from({ length: 5 }, (_, i) => ({
          ...createDefaultWindow(i + 1, 1),
          activeGroup: JSON.parse(JSON.stringify(rainPreset)),
        })),
      ];

      applyAutoAllocation(tab, "model", win0);

      expect(tab.autoAllocation).toBe("model");
      const allocatedModels = tab.windows.map((w) => w.model);

      expect(allocatedModels).toEqual([
        "ECMWF_HR",
        "GRAPES_GFS",
        "GRAPES_3KM",
        "SHANGHAI_MR",
        "BEIJING_MR",
        "JAPAN_MR",
      ]);

      // None of the windows should have level forced to 500
      expect(tab.windows.every((w) => w.level === null)).toBe(true);
      // All layers inside activeGroup should have their model updated
      expect(tab.windows[2].activeGroup.layers[0].model).toBe("GRAPES_3KM");
      expect(tab.windows[3].activeGroup.layers[0].model).toBe("SHANGHAI_MR");
    });

    it("applyAutoAllocation in 3x2 split populates all 6 windows with the 6 DEFAULT_MODELS", () => {
      const tab = createDefaultTab(1);
      tab.layout = "3x2";

      const rainPreset = {
        id: "multi-model-rain12",
        name: "ECMWF Rain12",
        hasLevel: false,
        isObservation: false,
        layers: [
          { element: "RAIN12", model: "ECMWF_HR", type: "contour" },
        ],
      };

      const win0 = {
        ...createDefaultWindow(0, 1),
        model: "ECMWF_HR",
        element: "RAIN12",
        level: null,
        hasLevel: false,
        period: 24,
        forecastCycle: "26101208",
        activeGroup: rainPreset,
      };

      tab.windows = [
        win0,
        ...Array.from({ length: 5 }, (_, i) => ({
          ...createDefaultWindow(i + 1, 1),
          activeGroup: JSON.parse(JSON.stringify(rainPreset)),
        })),
      ];

      applyAutoAllocation(tab, "model", win0);

      expect(tab.autoAllocation).toBe("model");
      const allocatedModels = tab.windows.map((w) => w.model);

      expect(allocatedModels).toEqual([
        "ECMWF_HR",
        "GRAPES_GFS",
        "GRAPES_3KM",
        "SHANGHAI_MR",
        "BEIJING_MR",
        "JAPAN_MR",
      ]);
    });

    it("prepareSplitWindows preserves/assigns models for created windows when autoAllocation is model", () => {
      const tab = createDefaultTab(1);
      tab.layout = "2x3";
      tab.autoAllocation = "model";

      const rainPreset = {
        id: "multi-model-rain12",
        hasLevel: false,
        layers: [{ element: "RAIN12", model: "ECMWF_HR", type: "contour" }],
      };

      const win0 = {
        ...createDefaultWindow(0, 1),
        model: "ECMWF_HR",
        level: null,
        hasLevel: false,
        activeGroup: rainPreset,
      };
      tab.windows = [win0];

      prepareSplitWindows(tab, 6, win0, () => true, true);

      expect(tab.windows).toHaveLength(6);
      expect(tab.windows.map((w) => w.model)).toEqual([
        "ECMWF_HR",
        "GRAPES_GFS",
        "GRAPES_3KM",
        "SHANGHAI_MR",
        "BEIJING_MR",
        "JAPAN_MR",
      ]);
      expect(tab.windows.every((w) => w.level === null)).toBe(true);
    });

    it("prepareSplitWindows assigns models and sets level null across existing empty windows when autoAllocation is model", () => {
      const tab = createDefaultTab(1);
      tab.layout = "2x3";
      tab.autoAllocation = "model";

      const rainPreset = {
        id: "multi-model-rain12",
        hasLevel: false,
        layers: [{ element: "RAIN12", model: "ECMWF_HR", type: "contour" }],
      };

      const win0 = {
        ...createDefaultWindow(0, 1),
        model: "ECMWF_HR",
        level: null,
        hasLevel: false,
        activeGroup: rainPreset,
      };
      // Window 1 and 2 are empty windows already in tab.windows
      const win1 = createDefaultWindow(1, 1);
      const win2 = createDefaultWindow(2, 1);
      tab.windows = [win0, win1, win2];

      prepareSplitWindows(tab, 6, win0, (w) => !w.layers || w.layers.length === 0, true);

      expect(tab.windows).toHaveLength(6);
      expect(tab.windows.map((w) => w.model)).toEqual([
        "ECMWF_HR",
        "GRAPES_GFS",
        "GRAPES_3KM",
        "SHANGHAI_MR",
        "BEIJING_MR",
        "JAPAN_MR",
      ]);
      expect(tab.windows.every((w) => w.level === null)).toBe(true);
    });
  });
});
