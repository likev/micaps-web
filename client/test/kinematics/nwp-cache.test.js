// vorticity_divergence.test.js - Acceptance tests for Vorticity & Divergence Derived Contours (§7 T5)
import { test, expect, describe, beforeEach } from "bun:test";
import fs from "fs";
import {
  computeVortDiv,
  buildKinematicGridData,
  EARTH_RADIUS,
  VOR_LEVELS,
  DIV_LEVELS,
  VOR_BOLD,
  DIV_BOLD,
  VOR_COLOR,
  DIV_COLOR,
} from "../../src/layers/kinematics.js";
import {
  analyzeAndRenderSurfaceContours,
  analyzeAndRenderSurfaceKinematicContours,
  SURFACE_CONTOUR_CONFIGS,
} from "../../src/layers/surfaceAnalysis.js";
import {
  analyzeAndRenderSoundingElementContour,
  analyzeAndRenderSoundingKinematicContour,
  SOUNDING_CONTOUR_CONFIGS,
} from "../../src/layers/soundingAnalysis.js";
import { formatElementUnit, formatContourLabel } from "../../src/utils/formatters.js";
import { getColormap, getElementLevels } from "../../src/utils/colormaps.js";
import { getPaletteCategory } from "../../src/utils/paletteLoader.js";
import {
  renderStationDrawerHTML,
  renderWindDrawerHTML,
  getLayersForWindow,
  clearWindowWeatherLayers,
  addOrUpdateLayer,
  removeLayer,
} from "../../src/ui/layerControl.js";
import { handleLayerAction, triggerVortDivOverlay, triggerIsobandOverlay } from "../../src/ui/layerActions.js";
import { armContourReRender } from "../../src/services/contourReRender.js";
import { prefetchSurroundingData } from "../../src/services/prefetchService.js";

// Mock Map implementation for headless testing
function createMockMap() {
  const sources = new Map();
  const layers = new Map();
  return {
    sources,
    layers,
    on: () => {},
    off: () => {},
    once: () => {},
    isStyleLoaded: () => true,
    loaded: () => true,
    addSource: (id, src) => sources.set(id, { ...src, _data: src.data }),
    getSource: (id) => {
      const src = sources.get(id);
      if (!src) return null;
      return {
        ...src,
        setData: (d) => {
          src.data = d;
          src._data = d;
        },
      };
    },
    removeSource: (id) => sources.delete(id),
    addLayer: (layer) => layers.set(layer.id, { ...layer }),
    getLayer: (id) => layers.get(id) || null,
    removeLayer: (id) => layers.delete(id),
    setLayoutProperty: (id, prop, val) => {
      const l = layers.get(id);
      if (l) {
        if (!l.layout) l.layout = {};
        l.layout[prop] = val;
      }
    },
    setPaintProperty: (id, prop, val) => {
      const l = layers.get(id);
      if (l) {
        if (!l.paint) l.paint = {};
        l.paint[prop] = val;
      }
    },
    getBounds: () => ({
      toArray: () => [[60, 10], [145, 60]],
    }),
    getContainer: () => ({
      querySelector: () => null,
      appendChild: () => {},
      getBoundingClientRect: () => ({ width: 800, height: 600 }),
    }),
  };
}

describe("T5: NWP Derived Grid Differentiation & Caching (§7-T5)", () => {
  test("buildKinematicGridData produces contour-ready structure with stats", () => {
    const nCols = 5;
    const nRows = 5;
    const u = new Float32Array(25).fill(10);
    const v = new Float32Array(25).fill(20);
    const header = {
      start_lon: 100, end_lon: 104, start_lat: 30, end_lat: 34,
      n_lon: nCols, n_lat: nRows, d_lon: 1, d_lat: 1,
    };

    const kinData = buildKinematicGridData("VOR", u, v, header);
    expect(kinData).not.toBeNull();
    expect(kinData.header).toBeDefined();
    expect(kinData.values instanceof Float32Array).toBe(true);
    expect(kinData.stats).toBeDefined();
    expect(typeof kinData.stats.min).toBe("number");
    expect(typeof kinData.stats.max).toBe("number");
    expect(typeof kinData.stats.mean).toBe("number");
  });

  test("buildKinematicGridData treats CONV as convergence (negative divergence)", () => {
    const nCols = 5;
    const nRows = 5;
    const u = new Float32Array(25);
    const v = new Float32Array(25);
    for (let r = 0; r < nRows; r++) {
      for (let c = 0; c < nCols; c++) {
        u[r * nCols + c] = (c - 2) * 5;
        v[r * nCols + c] = (r - 2) * 5;
      }
    }
    const header = {
      start_lon: 100, end_lon: 104, start_lat: 30, end_lat: 34,
      n_lon: nCols, n_lat: nRows, d_lon: 1, d_lat: 1,
    };

    const divData = buildKinematicGridData("DIV", u, v, header);
    const convData = buildKinematicGridData("CONV", u, v, header);
    expect(divData).not.toBeNull();
    expect(convData).not.toBeNull();
    const centerIdx = 2 * nCols + 2;
    expect(divData.values[centerIdx]).toBeGreaterThan(0);
    expect(convData.values[centerIdx]).toBeLessThan(0);
    expect(convData.values[centerIdx]).toBeCloseTo(-divData.values[centerIdx], 5);
  });

  test("handleLayerAction config change (smooth) routes NWP VOR through triggerVortDivOverlay", async () => {
    const map = createMockMap();
    const win = {
      id: "test-win-nwp-wire",
      model: "ECMWF_HR",
      level: 850,
      period: 24,
      forecastCycle: "2026091600",
      _windGridCache: new Map(),
    };

    const syntheticWind = {
      header: {
        start_lon: 100, end_lon: 104, start_lat: 30, end_lat: 34,
        n_lon: 5, n_lat: 5, d_lon: 1, d_lat: 1,
      },
      u: new Float32Array(25).fill(15),
      v: new Float32Array(25).fill(10),
    };
    win._windGridCache.set("ECMWF_HR/WIND/850/2026091600.024", syntheticWind);

    const layer = {
      id: "contour-ECMWF_HR-vor-850",
      type: "contour",
      model: "ECMWF_HR",
      element: "VOR",
      level: 850,
      visible: true,
      config: { showLine: true, smooth: true },
    };

    handleLayerAction(map, "config", layer.id, { smooth: false }, layer, win);
    await new Promise((r) => setTimeout(r, 60));
    expect(layer.gridData).toBeDefined();
    expect(layer.gridData.values).toBeDefined();
    expect(map.sources.has("contour-ECMWF_HR-vor-850-isoline-source")).toBe(true);
  });

  test("triggerVortDivOverlay uses cached parent wind data without duplicate network calls", async () => {
    const map = createMockMap();
    const win = {
      id: "test-win-nwp-cache",
      model: "ECMWF_HR",
      level: 850,
      period: 24,
      forecastCycle: "2026091600",
      _windGridCache: new Map(),
    };

    const syntheticWind = {
      header: {
        start_lon: 100, end_lon: 104, start_lat: 30, end_lat: 34,
        n_lon: 5, n_lat: 5, d_lon: 1, d_lat: 1,
      },
      u: new Float32Array(25).fill(15),
      v: new Float32Array(25).fill(10),
    };

    // Pre-populate cache
    const cacheKey = "ECMWF_HR/WIND/850/2026091600.024";
    win._windGridCache.set(cacheKey, syntheticWind);

    const layer = {
      id: "contour-ECMWF_HR-vor-850",
      model: "ECMWF_HR",
      element: "VOR",
      level: 850,
      visible: true,
      config: { showLine: true },
    };

    await triggerVortDivOverlay(map, layer, win);

    expect(layer.gridData).toBeDefined();
    expect(layer.gridData.values).toBeDefined();
    expect(map.sources.has("contour-ECMWF_HR-vor-850-isoline-source")).toBe(true);

    // Verify second invocation reuses layer.gridData directly
    const prevValues = layer.gridData.values;
    await triggerVortDivOverlay(map, layer, win);
    expect(layer.gridData.values).toBe(prevValues);
  });

  test("prefetchSurroundingData emits parent WIND items for NWP VOR and DIV layers", async () => {
    const win = {
      id: "test-win-prefetch-vort",
      model: "ECMWF_HR",
      level: 850,
      period: 24,
      forecastCycle: "2026091600",
      stepLength: 6,
      activeGroup: {
        id: "composite-850hpa",
        hasLevel: true,
        defaultLevel: 850,
        layers: [
          {
            type: "contour",
            model: "ECMWF_HR",
            element: "VOR",
            level: 850,
            derivedFrom: "wind",
            render: { showLine: true },
          },
          {
            type: "contour",
            model: "ECMWF_HR",
            element: "DIV",
            level: 850,
            derivedFrom: "wind",
            render: { showLine: true },
          },
        ],
      },
    };

    const stats = await prefetchSurroundingData(win, {
      directions: ["next"],
      timelineSteps: {
        mode: "nwp",
        periods: { prev: 18, current: 24, next: 30, cycle: "2026091600" },
      },
    });
    expect(stats.targets).toBeDefined();
    const rightItems = stats.targets.right?.items || [];
    const windItem = rightItems.find((it) => it.path === "ECMWF_HR/WIND/850");
    expect(windItem).toBeDefined();
    expect(windItem.type).toBe("grid");
  });
});
