// viewport-crop.test.js - Viewport BBox Spatial Culling & Cell-Count-Driven LOD (§8.8.4 crop/LOD, 4 tests)
import { test, expect, describe, beforeAll } from "bun:test";
import {
  computeCropIndices,
  cropGridValues,
  resolveContourStep,
} from "../../src/utils/viewportCrop.js";
import { renderContourLayers } from "../../src/layers/contourLayer.js";

// Ensure browser globals for headless test environment
beforeAll(() => {
  if (typeof globalThis.document === "undefined") {
    globalThis.document = {};
  }
  if (!globalThis.document.createElement) {
    globalThis.document.createElement = (tag) => {
      let width = 0;
      let height = 0;
      return {
        tagName: tag.toUpperCase(),
        style: {},
        className: "",
        get width() { return width; },
        set width(v) { width = v; },
        get height() { return height; },
        set height(v) { height = v; },
        getContext: () => ({
          createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: () => {},
          fillRect: () => {},
          clearRect: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          stroke: () => {},
          arc: () => {},
          fill: () => {},
          closePath: () => {},
          setTransform: () => {},
        }),
        toDataURL: () => "data:image/png;base64,mock",
        toBlob: (cb) => {
          if (typeof cb === "function") cb(new Blob(["mock-blob"]));
        },
        remove: () => {},
      };
    };
  }

  if (typeof globalThis.URL === "undefined") {
    globalThis.URL = {};
  }
});

function createMockMap(bounds = [[60, 15], [140, 55]]) {
  const sources = new Map();
  const layers = new Map();
  const listeners = new Map();
  const container = {
    isConnected: true,
    querySelector: (sel) => null,
    appendChild: () => {},
    getBoundingClientRect: () => ({ width: 1000, height: 700 }),
  };

  const map = {
    getContainer: () => container,
    getZoom: () => 4.5,
    getBounds: () => ({
      toArray: () => bounds,
      getWest: () => bounds[0][0],
      getSouth: () => bounds[0][1],
      getEast: () => bounds[1][0],
      getNorth: () => bounds[1][1],
    }),
    project: (coord) => ({ x: coord[0] * 5, y: coord[1] * 5 }),
    unproject: (pt) => ({ lng: pt[0] / 5, lat: pt[1] / 5 }),
    getSource: (id) => sources.get(id) || null,
    addSource: (id, def) => {
      const srcObj = {
        ...def,
        setData: (fc) => {
          srcObj.data = fc;
          srcObj._setDataCalls = (srcObj._setDataCalls || 0) + 1;
        },
        updateImage: (opts) => {
          Object.assign(srcObj, opts);
        },
      };
      sources.set(id, srcObj);
    },
    removeSource: (id) => {
      sources.delete(id);
    },
    getLayer: (id) => layers.get(id) || null,
    addLayer: (def) => {
      layers.set(def.id, { ...def });
    },
    removeLayer: (id) => {
      layers.delete(id);
    },
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
    getStyle: () => ({
      layers: Array.from(layers.values()),
      sources: Object.fromEntries(sources.entries()),
    }),
    on: (evt, handler) => {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt).add(handler);
    },
    off: (evt, handler) => {
      if (listeners.has(evt)) listeners.get(evt).delete(handler);
    },
    _emit: (evt) => {
      if (listeners.has(evt)) {
        for (const h of listeners.get(evt)) h();
      }
    },
    _sources: sources,
    _layers: layers,
    _listeners: listeners,
  };

  return map;
}

describe("§8.8.4 Viewport BBox Spatial Culling & Cell-Count-Driven LOD", () => {
  test("computeCropIndices clamps to grid boundaries with safety buffer margin", () => {
    // 0.1° global grid: 3600 x 1801
    const header = {
      n_lon: 3600,
      n_lat: 1801,
      start_lon: 0,
      end_lon: 359.9,
      start_lat: 90,
      end_lat: -90,
      d_lon: 0.1,
      d_lat: -0.1,
    };
    const x = Array.from({ length: 3600 }, (_, i) => i * 0.1);
    const y = Array.from({ length: 1801 }, (_, i) => 90 - i * 0.1);

    // Viewport: China region [70, 15] to [135, 55], buffer = 1.75°
    const viewport = [[70, 15], [135, 55]];
    const crop = computeCropIndices(header, x, y, viewport, 1.75);

    expect(crop.iMin).toBeGreaterThanOrEqual(0);
    expect(crop.iMax).toBeLessThan(3600);
    expect(crop.jMin).toBeGreaterThanOrEqual(0);
    expect(crop.jMax).toBeLessThan(1801);

    // Check that longitude extent is approximately (135 + 1.75) - (70 - 1.75) = 68.5° -> ~685 indices
    expect(crop.nLonCrop).toBeGreaterThan(650);
    expect(crop.nLonCrop).toBeLessThan(750);

    // Total cells in crop is a small fraction (<10%) of the global 6.48M cells
    expect(crop.nCrop).toBeLessThan(400000);
    expect(crop.nCrop).toBeGreaterThan(50000);

    // Step calculation: for ~300k cells against 50k budget, step should be 3
    const step = resolveContourStep(crop.nCrop, 50000);
    expect(step).toBeGreaterThanOrEqual(2);
    expect(step).toBeLessThanOrEqual(3);
  });

  test("cropGridValues decimates and normalizes latitude to ascending order", () => {
    // 10 x 10 grid with descending lat
    const nLon = 10;
    const nLat = 10;
    const header = { n_lon: nLon, n_lat: nLat, start_lon: 60, end_lon: 70, start_lat: 50, end_lat: 40, d_lon: 1, d_lat: -1 };
    const x = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69];
    const y = [50, 49, 48, 47, 46, 45, 44, 43, 42, 41];
    const values = [];
    for (let r = 0; r < nLat; r++) {
      for (let c = 0; c < nLon; c++) {
        values.push(r * 10 + c);
      }
    }

    const cropIdx = { iMin: 2, iMax: 8, jMin: 2, jMax: 8, nLonCrop: 7, nLatCrop: 7, nCrop: 49 };
    const cropped = cropGridValues({ header, x, y, values }, cropIdx, 2);

    expect(cropped.step).toBe(2);
    expect(cropped.x.length).toBe(4); // indices 2, 4, 6, 8
    expect(cropped.y.length).toBe(4);

    // Ascending latitude contract (§8.6.2 & §8.8.4)
    expect(cropped.y[0]).toBeLessThan(cropped.y[cropped.y.length - 1]);

    // Z dimensions match y and x
    expect(cropped.Z.length).toBe(cropped.y.length);
    expect(cropped.Z[0].length).toBe(cropped.x.length);
  });

  test("renderContourLayers: regional mesh bypasses BBox crop and locks step=1", () => {
    const map = createMockMap();
    const nLon = 281;
    const nLat = 161;
    const values = new Float32Array(nLon * nLat);
    for (let i = 0; i < values.length; i++) values[i] = 10 + Math.sin(i * 0.05) * 15;

    const regionalGrid = {
      header: { n_lon: nLon, n_lat: nLat, start_lon: 60, end_lon: 130, start_lat: 55, end_lat: 15, d_lon: 0.25, d_lat: -0.25 },
      x: Array.from({ length: nLon }, (_, i) => 60 + i * 0.25),
      y: Array.from({ length: nLat }, (_, i) => 55 - i * 0.25),
      values,
      stats: { min: -5, max: 25 },
    };

    let statsCaptured = null;
    renderContourLayers(map, regionalGrid, "TMP", {
      layerId: "test-regional",
      showFill: false,
      showLine: true,
      viewportBounds: [[70, 20], [120, 50]],
      onStats: (s) => { statsCaptured = s; },
    });

    expect(statsCaptured).not.toBeNull();
    expect(statsCaptured.totalCells).toBe(45241);
    expect(statsCaptured.step).toBe(1); // Locked step = 1 (Zero downsampling)
    expect(statsCaptured.effectiveCells).toBe(45241);
  });

  test("renderContourLayers: large grid with viewport applies BBox crop & computes step by Ncrop", () => {
    const map = createMockMap();
    const nLon = 1000;
    const nLat = 800; // 800,000 cells >= 50,000 budget
    const values = new Float32Array(nLon * nLat);

    const largeGrid = {
      header: { n_lon: nLon, n_lat: nLat, start_lon: 60, end_lon: 140, start_lat: 60, end_lat: 10, d_lon: 0.08, d_lat: -0.0625 },
      x: Array.from({ length: nLon }, (_, i) => 60 + i * 0.08),
      y: Array.from({ length: nLat }, (_, i) => 60 - i * 0.0625),
      values,
      stats: { min: 0, max: 30 },
    };

    let statsCaptured = null;
    renderContourLayers(map, largeGrid, "TMP", {
      layerId: "test-large",
      showFill: false,
      showLine: true,
      viewportBounds: [[75, 25], [95, 40]], // regional viewport
      onStats: (s) => { statsCaptured = s; },
    });

    expect(statsCaptured).not.toBeNull();
    expect(statsCaptured.totalCells).toBe(800000);
    expect(statsCaptured.nCrop).toBeLessThan(statsCaptured.totalCells);
    expect(statsCaptured.effectiveCells).toBeLessThanOrEqual(50000);
  });
});
