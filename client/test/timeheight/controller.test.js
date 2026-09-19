// controller.test.js - Unit tests for timeHeightController.js
import { describe, test, expect, beforeEach } from "bun:test";
import { timeHeightController } from "../../src/layers/timeheight/timeHeightController.js";
import { getThGridCache } from "../../src/layers/timeheight/timeHeightLoader.js";

function createMockMap() {
  const sources = new Map();
  const layers = new Map();
  const listeners = new Map();

  return {
    sources,
    layers,
    listeners,
    on(event, cb) {
      listeners.set(event, cb);
    },
    off(event, cb) {
      listeners.delete(event);
    },
    getSource(id) {
      return sources.get(id);
    },
    addSource(id, def) {
      const sourceObj = {
        ...def,
        setData(data) {
          sourceObj.data = data;
        },
      };
      sources.set(id, sourceObj);
    },
    removeSource(id) {
      sources.delete(id);
    },
    getLayer(id) {
      return layers.get(id);
    },
    addLayer(def) {
      layers.set(def.id, def);
    },
    removeLayer(id) {
      layers.delete(id);
    },
    setLayoutProperty(id, prop, val) {
      const l = layers.get(id);
      if (l) {
        l.layout = l.layout || {};
        l.layout[prop] = val;
      }
    },
    unproject(pt) {
      return { lng: pt.x, lat: pt.y };
    },
  };
}

describe("Time-Height Controller & Map Interactions", () => {
  let mockMap;
  let mockWin;

  beforeEach(() => {
    mockMap = createMockMap();
    mockWin = { id: "test-win", _thGridCache: new Map(), loadSeq: 0 };
    timeHeightController.destroy(mockMap, mockWin);
  });

  test("init registers map click and creates highlight marker source and layers", async () => {
    const layerDef = {
      id: "ec-timeheight-diagram",
      config: { lon: 120.0, lat: 30.0, startHour: 0, endHour: 24, stepHours: 12 },
    };

    await timeHeightController.init(mockMap, mockWin, layerDef);

    expect(timeHeightController.isActive()).toBe(true);
    expect(mockMap.listeners.has("click")).toBe(true);
    expect(mockMap.sources.has("th-active-point-source")).toBe(true);
    expect(mockMap.layers.has("th-active-point-halo")).toBe(true);
    expect(mockMap.layers.has("th-active-point-center")).toBe(true);
  });

  test("setTimeDirection updates direction without triggering grid reload", () => {
    timeHeightController.timeDirection = "ltr";
    timeHeightController.setTimeDirection("rtl");

    expect(timeHeightController.timeDirection).toBe("rtl");
    if (timeHeightController.panel) {
      expect(timeHeightController.panel.timeDirection).toBe("rtl");
    }

    // Flip back
    timeHeightController.setTimeDirection("ltr");
    expect(timeHeightController.timeDirection).toBe("ltr");
  });

  test("setPoint updates coordinates and moves map highlight marker", async () => {
    const layerDef = {
      id: "ec-timeheight-diagram",
      config: { lon: 120.0, lat: 30.0 },
    };
    await timeHeightController.init(mockMap, mockWin, layerDef);

    timeHeightController.setPoint(125.4, 32.8, mockWin, mockMap);

    expect(timeHeightController.activePoint.lon).toBeCloseTo(125.5, 2);
    expect(timeHeightController.activePoint.lat).toBeCloseTo(32.75, 2);

    const src = mockMap.getSource("th-active-point-source");
    expect(src).toBeDefined();
    expect(src.data.features[0].geometry.coordinates[0]).toBeCloseTo(125.5, 2);
    expect(src.data.features[0].geometry.coordinates[1]).toBeCloseTo(32.75, 2);
  });

  test("fast-path resample succeeds when raw grids are cached in window", async () => {
    const win = { id: "cached-win", _thGridCache: new Map() };
    const cache = getThGridCache(win);

    timeHeightController.cycle = "26091808";
    timeHeightController.leads = [0];
    timeHeightController.levels = [850];

    // Seed window cache with all required grids for this lead/level
    for (const el of ["RH", "TMP", "VVEL", "WIND"]) {
      cache.set(`ECMWF_HR/${el}/850|26091808.000`, {
        data: {
          header: { n_lon: 2, n_lat: 2, start_lon: 110, end_lon: 130, d_lon: 20, start_lat: 40, end_lat: 20, d_lat: -20, element: el },
          values: [50, 50, 50, 50],
          u: [10, 10, 10, 10],
          v: [5, 5, 5, 5],
        },
        ts: Date.now(),
      });
    }

    const matrix = await timeHeightController.setPoint(120.0, 30.0, win, mockMap);
    expect(matrix).not.toBeNull();
    expect(matrix.rh[0][0]).toBeCloseTo(50, 1);
    expect(matrix.u[0][0]).toBeCloseTo(10, 1);
  });

  test("destroy cleans up map listener, marker source/layers, and panel", () => {
    timeHeightController.destroy(mockMap, mockWin);

    expect(timeHeightController.isActive()).toBe(false);
    expect(mockMap.listeners.has("click")).toBe(false);
    expect(mockMap.sources.has("th-active-point-source")).toBe(false);
    expect(mockMap.layers.has("th-active-point-halo")).toBe(false);
    expect(mockMap.layers.has("th-active-point-center")).toBe(false);
  });
});
