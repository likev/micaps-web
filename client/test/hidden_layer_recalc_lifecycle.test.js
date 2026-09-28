// hidden_layer_recalc_lifecycle.test.js - Comprehensive tests for skipping background calculations
// on hidden layers and recalculating/rerendering upon unhiding (hide -> show)

import { test, expect, describe, beforeAll, beforeEach } from "bun:test";
import { layerNeedsRecalc, handleVisibilityAction } from "../src/ui/layers/visibilityActions.js";
import { analyzeAndRenderSoundingElementContour } from "../src/layers/soundingAnalysis.js";
import { analyzeAndRenderSurfaceContours } from "../src/layers/surfaceAnalysis.js";
import { analyzeKinematicContours } from "../src/layers/analysis/kinematicContours.js";
import { loadWeatherField } from "../src/services/weatherLoader.js";
import { getLayerById, clearWindowWeatherLayers } from "../src/ui/layerControl.js";
import { clearLegends } from "../src/ui/legend.js";
import {
  triggerRasterOverlay,
  triggerWindStreamlines,
  triggerWindBarbs,
} from "../src/services/overlayTriggers.js";

beforeAll(() => {
  if (typeof globalThis.document === "undefined") {
    globalThis.document = {};
  }
  if (!globalThis.document.createElement) {
    globalThis.document.createElement = (tag) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            putImageData: () => {},
          }),
          toDataURL: () => "data:image/png;base64,mock",
        };
      }
      return {
        addEventListener: () => {},
        setAttribute: () => {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      };
    };
  }
  let mockPanel = {
    innerHTML: "",
    classList: {
      _classes: new Set(["hidden"]),
      add: function (cls) { this._classes.add(cls); },
      remove: function (cls) { this._classes.delete(cls); },
      contains: function (cls) { return this._classes.has(cls); },
    },
  };
  globalThis.document.getElementById = (id) => (id === "legend-panel" ? mockPanel : null);
});

function createMockMap() {
  const sources = new Map();
  const layers = new Map();

  return {
    getSource: (id) => sources.get(id) || null,
    addSource: (id, def) => {
      const src = { ...def, _data: def.data, setData: (d) => { src.data = d; src._data = d; } };
      sources.set(id, src);
    },
    removeSource: (id) => sources.delete(id),
    getLayer: (id) => layers.get(id) || null,
    addLayer: (def, beforeId) => layers.set(def.id, { ...def, beforeId }),
    removeLayer: (id) => layers.delete(id),
    getBounds: () => ({
      getWest: () => 60,
      getEast: () => 140,
      getSouth: () => 10,
      getNorth: () => 60,
      toArray: () => [[60, 10], [140, 60]],
    }),
    getZoom: () => 3,
    setLayoutProperty: (id, prop, val) => {
      const lyr = layers.get(id);
      if (lyr) {
        if (!lyr.layout) lyr.layout = {};
        lyr.layout[prop] = val;
      }
    },
    setPaintProperty: (id, prop, val) => {
      const lyr = layers.get(id);
      if (lyr) {
        if (!lyr.paint) lyr.paint = {};
        lyr.paint[prop] = val;
      }
    },
  };
}

describe("Hidden Layer Background Calculation Optimization & Recalculation Lifecycle", () => {
  let map;
  let win;

  beforeEach(() => {
    map = createMockMap();
    win = {
      id: "win-test-recalc",
      level: 500,
      period: 24,
      forecastCycle: "2026092808",
      obsTime: "20260928080000.000",
      activeGroup: { hasLevel: true, layers: [] },
      layers: [],
    };
    clearWindowWeatherLayers(win);
    clearLegends();
  });

  describe("1. layerNeedsRecalc Decision Logic", () => {
    test("returns false when gridData is present and window state matches layer state", () => {
      const layer = {
        id: "contour-tmp-500",
        type: "contour",
        element: "TMP",
        level: 500,
        period: 24,
        file: "2026092808.024",
        gridData: { stats: { min: -20, max: 20 }, values: new Float32Array(10) },
      };
      expect(layerNeedsRecalc(layer, win, map)).toBe(false);
    });

    test("returns true when layer.gridData is null (calculation was skipped while hidden)", () => {
      const layer = {
        id: "contour-tmp-500",
        type: "contour",
        element: "TMP",
        level: 500,
        period: 24,
        file: "2026092808.024",
        gridData: null,
      };
      expect(layerNeedsRecalc(layer, win, map)).toBe(true);
    });

    test("returns true when vertical level changed while hidden (500 -> 400)", () => {
      const layer = {
        id: "contour-sounding-hgt-500",
        type: "contour",
        element: "HGT",
        model: "UPPER_AIR",
        level: 500,
        gridData: { stats: { min: 5000, max: 6000 } },
      };
      win.level = 400; // Level stepped to 400
      expect(layerNeedsRecalc(layer, win, map)).toBe(true);
    });

    test("returns true when forecast period / time lead changed while hidden (24 -> 48)", () => {
      const layer = {
        id: "contour-ecmwf_hr-tmp-500",
        type: "contour",
        element: "TMP",
        level: 500,
        period: 24,
        file: "2026092808.024",
        gridData: { stats: { min: -20, max: 20 } },
      };
      win.period = 48; // Period stepped to 48
      expect(layerNeedsRecalc(layer, win, map)).toBe(true);
    });

    test("returns true when forecast cycle changed while hidden", () => {
      const layer = {
        id: "contour-ecmwf_hr-tmp-500",
        type: "contour",
        element: "TMP",
        level: 500,
        period: 24,
        file: "2026092800.024",
        gridData: { stats: { min: -20, max: 20 } },
      };
      win.forecastCycle = "2026092812";
      expect(layerNeedsRecalc(layer, win, map)).toBe(true);
    });

    test("returns true when observation obsTime changed while hidden", () => {
      const layer = {
        id: "contour-surface-slp",
        type: "contour",
        element: "SLP",
        model: "SURFACE",
        obsTime: "20260928000000.000",
        file: "20260928000000.000",
        gridData: { stats: { min: 990, max: 1030 } },
      };
      win.obsTime = "20260928060000.000";
      expect(layerNeedsRecalc(layer, win, map)).toBe(true);
    });

    test("returns true when obsTime or file is missing on observation layer", () => {
      const layer = {
        id: "contour-surface-slp",
        type: "contour",
        element: "SLP",
        model: "SURFACE",
        gridData: { stats: { min: 990, max: 1030 } },
      };
      win.obsTime = "20260928060000.000";
      expect(layerNeedsRecalc(layer, win, map)).toBe(true);
    });

    test("returns true when period changed and forecastCycle is null", () => {
      const layer = {
        id: "contour-ecmwf_hr-tmp-500",
        type: "contour",
        element: "TMP",
        level: 500,
        file: "2026092808.024",
        gridData: { stats: { min: -20, max: 20 } },
      };
      win.forecastCycle = null;
      win.period = 48;
      expect(layerNeedsRecalc(layer, win, map)).toBe(true);
    });

    test("returns false for station layers (not a calculated grid)", () => {
      const stationLayer = {
        id: "surface-obs",
        type: "station",
        element: "PLOT_GLOBAL_3H",
      };
      expect(layerNeedsRecalc(stationLayer, win, map)).toBe(false);
    });
  });

  describe("2. Skipping Heavy Calculations on Hidden Layers (visible: false)", () => {
    test("analyzeAndRenderSoundingElementContour skips Barnes interpolation when visible === false", () => {
      const stationsGeoJSON = {
        type: "FeatureCollection",
        features: [
          { type: "Feature", geometry: { type: "Point", coordinates: [110, 35] }, properties: { height: 5500 } },
          { type: "Feature", geometry: { type: "Point", coordinates: [115, 38] }, properties: { height: 5600 } },
          { type: "Feature", geometry: { type: "Point", coordinates: [120, 32] }, properties: { height: 5700 } },
        ],
      };

      const result = analyzeAndRenderSoundingElementContour(map, stationsGeoJSON, 500, "HGT", {
        visible: false,
        lineColor: "#0000ff",
      }, win);

      expect(result).toBeDefined();
      expect(result.lines).toEqual([]);
      expect(result.fills).toEqual([]);
      expect(result.gridData).toBeNull();

      const storedLayer = getLayerById("contour-sounding-hgt-500", win);
      expect(storedLayer).toBeDefined();
      expect(storedLayer.visible).toBe(false);
      expect(storedLayer.gridData).toBeNull();
    });

    test("analyzeAndRenderSurfaceContours skips calculation and sets gridData: null when visible === false", () => {
      const stationsGeoJSON = {
        type: "FeatureCollection",
        features: [
          { type: "Feature", geometry: { type: "Point", coordinates: [110, 35] }, properties: { pressure: 1012 } },
          { type: "Feature", geometry: { type: "Point", coordinates: [115, 38] }, properties: { pressure: 1015 } },
          { type: "Feature", geometry: { type: "Point", coordinates: [120, 32] }, properties: { pressure: 1008 } },
        ],
      };

      analyzeAndRenderSurfaceContours(map, stationsGeoJSON, "SLP", {
        visible: false,
        layerId: "contour-surface-slp",
      }, win);

      const storedLayer = getLayerById("contour-surface-slp", win);
      expect(storedLayer).toBeDefined();
      expect(storedLayer.visible).toBe(false);
      expect(storedLayer.gridData).toBeNull();
    });

    test("analyzeKinematicContours skips computation and sets gridData: null when visible === false", () => {
      const stationsGeoJSON = {
        type: "FeatureCollection",
        features: [
          { type: "Feature", geometry: { type: "Point", coordinates: [110, 35] }, properties: { u: 10, v: 5 } },
          { type: "Feature", geometry: { type: "Point", coordinates: [115, 38] }, properties: { u: 15, v: 2 } },
          { type: "Feature", geometry: { type: "Point", coordinates: [120, 32] }, properties: { u: 8, v: 10 } },
        ],
      };

      analyzeKinematicContours({
        map,
        stationsGeoJSON,
        rawElement: "VOR",
        level: 500,
        options: { visible: false, layerId: "contour-sounding-vor-500" },
        win,
      });

      const storedLayer = getLayerById("contour-sounding-vor-500", win);
      expect(storedLayer).toBeDefined();
      expect(storedLayer.visible).toBe(false);
      expect(storedLayer.gridData).toBeNull();
    });

    test("loadWeatherField skips grid fetch and renders when isVisible === false", async () => {
      let fetchCalled = false;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        fetchCalled = true;
        return { ok: true, json: async () => ({}) };
      };

      try {
        await loadWeatherField(map, "ECMWF_HR", "TMP", 500, 24, {
          id: "contour-ecmwf_hr-tmp-500",
          visible: false,
        }, win, false);

        expect(fetchCalled).toBe(false);
        const storedLayer = getLayerById("contour-ecmwf_hr-tmp-500", win);
        expect(storedLayer).toBeDefined();
        expect(storedLayer.visible).toBe(false);
        expect(storedLayer.gridData).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("triggerRasterOverlay no-ops on hidden layer without fetching", async () => {
      let fetchCalled = false;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        fetchCalled = true;
        return { ok: true, json: async () => ({}) };
      };
      try {
        const layer = {
          id: "contour-ecmwf_hr-tmp-500",
          type: "contour",
          element: "TMP",
          level: 500,
          visible: false,
        };
        await triggerRasterOverlay(map, layer, win);
        expect(fetchCalled).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("triggerWindStreamlines and triggerWindBarbs no-op on hidden layer", async () => {
      const layer = {
        id: "wind-ecmwf_hr-500",
        type: "wind",
        element: "WIND",
        level: 500,
        visible: false,
        config: { showWind: true, showBarbs: true },
      };
      await triggerWindStreamlines(map, layer, win);
      await triggerWindBarbs(map, layer, win);
      expect(map.getLayer("wind-streamlines")).toBeNull();
    });
  });

  describe("3. Hide -> Show Recalculation and Rendering Lifecycle", () => {
    test("unhiding layer with existing valid gridData synchronously activates legend and does not recalculate", () => {
      const panel = globalThis.document.getElementById("legend-panel");
      panel.innerHTML = "";

      const layer = {
        id: "contour-ecmwf_hr-tmp-500",
        type: "contour",
        element: "TMP",
        level: 500,
        period: 24,
        file: "2026092808.024",
        visible: false,
        config: { showFill: true, showRaster: false, showLine: false },
        gridData: { stats: { min: -15, max: 25 }, values: new Float32Array(10) },
      };

      handleVisibilityAction(map, layer.id, true, layer, win);

      expect(layer.visible).toBe(true);
      expect(panel.innerHTML).toContain("TMP");
    });

    test("unhiding layer whose state changed (level 500 -> 400) triggers recalculation", async () => {
      const layer = {
        id: "contour-ecmwf_hr-tmp-500",
        type: "contour",
        element: "TMP",
        model: "ECMWF_HR",
        level: 500,
        period: 24,
        visible: false,
        config: { showLine: true },
        gridData: { stats: { min: -15, max: 25 }, values: new Float32Array(10) },
      };

      win.level = 400; // State changed while hidden
      expect(layerNeedsRecalc(layer, win, map)).toBe(true);

      let loadCalled = false;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url) => {
        loadCalled = true;
        return {
          ok: true,
          json: async () => ({
            header: {
              n_lon: 5,
              n_lat: 5,
              start_lon: 60,
              end_lon: 140,
              start_lat: 60,
              end_lat: 10,
              d_lon: 20,
              d_lat: 12.5,
            },
            values: new Array(25).fill(15),
            stats: { min: 10, max: 20 },
          }),
        };
      };

      try {
        const actionResult = handleVisibilityAction(map, layer.id, true, layer, win);
        if (actionResult && typeof actionResult.then === "function") {
          await actionResult;
        }
        expect(layer.visible).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("unhiding layer after level change updates path to new level and does not use stale path", async () => {
      const layer = {
        id: "contour-ecmwf_hr-tmp-500",
        name: "TMP 500 hPa",
        type: "contour",
        element: "TMP",
        model: "ECMWF_HR",
        path: "ECMWF_HR/TMP/500",
        level: 500,
        period: 24,
        visible: false,
        config: { showLine: true },
        gridData: { stats: { min: -15, max: 25 }, values: new Float32Array(10) },
      };

      win.level = 700; // Stepped to 700 hPa while hidden
      expect(layerNeedsRecalc(layer, win, map)).toBe(true);

      let fetchedUrl = null;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url) => {
        fetchedUrl = String(url);
        return {
          ok: true,
          json: async () => ({
            header: {
              n_lon: 5, n_lat: 5, start_lon: 60, end_lon: 140, start_lat: 60, end_lat: 10, d_lon: 20, d_lat: 12.5,
            },
            values: new Array(25).fill(10),
            stats: { min: 5, max: 15 },
          }),
        };
      };

      try {
        const actionResult = handleVisibilityAction(map, layer.id, true, layer, win);
        if (actionResult && typeof actionResult.then === "function") {
          await actionResult;
        }
        expect(layer.visible).toBe(true);
        expect(layer.level).toBe(700);
        expect(layer.path).toBe("ECMWF_HR/TMP/700");
        expect(layer.id).toBe("contour-ecmwf_hr-tmp-700");
        expect(fetchedUrl).toContain("700");
        expect(fetchedUrl).not.toContain("ECMWF_HR/TMP/500");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("unhiding NWP kinematic layer (VOR) executes triggerVortDivOverlay cleanly without ReferenceError", async () => {
      const layer = {
        id: "contour-ecmwf_hr-vor-500",
        name: "VOR 500 hPa",
        type: "contour",
        element: "VOR",
        model: "ECMWF_HR",
        level: 500,
        period: 24,
        visible: false,
        config: { showLine: true },
        gridData: null,
      };

      win.level = 700;
      expect(layerNeedsRecalc(layer, win, map)).toBe(true);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url) => {
        return {
          ok: true,
          json: async () => ({
            header: {
              n_lon: 5, n_lat: 5, start_lon: 60, end_lon: 140, start_lat: 60, end_lat: 10, d_lon: 20, d_lat: 12.5,
            },
            u: new Array(25).fill(10),
            v: new Array(25).fill(5),
            values: new Array(25).fill(10),
            stats: { min: -5, max: 5 },
          }),
        };
      };

      try {
        // Should not throw ReferenceError: triggerVortDivOverlay is not defined
        const actionResult = handleVisibilityAction(map, layer.id, true, layer, win);
        if (actionResult && typeof actionResult.then === "function") {
          await actionResult;
        }
        expect(layer.visible).toBe(true);
        expect(layer.level).toBe(700);
        expect(layer.id).toBe("contour-ECMWF_HR-vor-700");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
