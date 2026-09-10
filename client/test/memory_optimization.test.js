// memory_optimization.test.js - Comprehensive tests for Architecture §8.8 & memory-optimization-plan1.md
import { test, expect, describe, beforeAll, beforeEach } from "bun:test";
import {
  computeCropIndices,
  cropGridValues,
  resolveContourStep,
  shouldBypassCrop,
  getFullGridStep,
} from "../src/utils/viewportCrop.js";
import {
  simplifyPolyline,
  simplifyFeatureCollection,
} from "../src/utils/smoothContour.js";
import {
  renderContourLayers,
  removeContourLayer,
  flushContourSource,
} from "../src/layers/contourLayer.js";
import {
  armContourReRender,
  disarmContourReRender,
  disarmAllContourReRenders,
} from "../src/services/contourReRender.js";
import {
  renderGridRaster,
  removeRasterLayer,
  revokeRasterUrl,
  getRasterDOMIds,
} from "../src/layers/rasterLayer.js";
import {
  renderWindStreamlines,
  stopWindAnimation,
  renderGridWindBarbs,
  removeGridWindBarbs,
  cleanupWindLayer,
} from "../src/layers/windLayer.js";
import { countGeoJSONPoints, estimateHeapMB } from "../src/utils/memStats.js";

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

describe("§8.8.5 Lifecycle Memory Management & Geometry Simplification", () => {
  test("simplifyPolyline prunes collinear vertices by >=40% while preserving endpoints", () => {
    // 10 collinear points along x axis
    const straightLine = [
      [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
      [5, 0], [6, 0], [7, 0], [8, 0], [9, 0],
    ];

    const simplified = simplifyPolyline(straightLine, 0.05);
    expect(simplified.length).toBe(2);
    expect(simplified[0]).toEqual([0, 0]);
    expect(simplified[1]).toEqual([9, 0]);

    // Reduction is 80% (exceeds target >=40%)
    const reduction = (straightLine.length - simplified.length) / straightLine.length;
    expect(reduction).toBeGreaterThanOrEqual(0.4);
  });

  test("simplifyFeatureCollection preserves closed loop boundaries", () => {
    const closedSquare = [
      [0, 0], [1, 0], [2, 0],
      [2, 1], [2, 2],
      [1, 2], [0, 2],
      [0, 1], [0, 0],
    ];

    const fc = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "LineString", coordinates: closedSquare },
        properties: { value: 588 },
      }],
    };

    const simplifiedFC = simplifyFeatureCollection(fc, 0.05);
    const simplifiedCoords = simplifiedFC.features[0].geometry.coordinates;

    // Corner points preserved, intermediate collinear points pruned
    expect(simplifiedCoords.length).toBe(5); // [0,0], [2,0], [2,2], [0,2], [0,0]
    expect(simplifiedCoords[0]).toEqual(simplifiedCoords[simplifiedCoords.length - 1]); // Closed loop preserved
  });

  test("flushContourSource empties vector tiles before removal", () => {
    const map = createMockMap();
    const layerId = "contour-TMP-test";

    // Add mock sources with data
    map.addSource(`${layerId}-isoband-source`, { type: "geojson", data: { type: "FeatureCollection", features: [{ type: "Feature" }] } });
    map.addSource(`${layerId}-isoline-source`, { type: "geojson", data: { type: "FeatureCollection", features: [{ type: "Feature" }] } });

    flushContourSource(map, layerId);

    const isobandSrc = map.getSource(`${layerId}-isoband-source`);
    const isolineSrc = map.getSource(`${layerId}-isoline-source`);

    expect(isobandSrc.data.features.length).toBe(0);
    expect(isolineSrc.data.features.length).toBe(0);
  });

  test("removeContourLayer flushes tiles, disarms re-renders, and removes layers and sources", () => {
    const map = createMockMap();
    const layerId = "test-cleanup-layer";

    map.addSource(`${layerId}-isoband-source`, { type: "geojson", data: { type: "FeatureCollection", features: [1, 2, 3] } });
    map.addSource(`${layerId}-isoline-source`, { type: "geojson", data: { type: "FeatureCollection", features: [1, 2, 3] } });
    map.addLayer({ id: `${layerId}-isoband-layer`, source: `${layerId}-isoband-source` });
    map.addLayer({ id: `${layerId}-isoline-layer`, source: `${layerId}-isoline-source` });
    map.addLayer({ id: `${layerId}-isoline-label-layer`, source: `${layerId}-isoline-source` });

    removeContourLayer(map, layerId);

    expect(map.getSource(`${layerId}-isoband-source`)).toBeNull();
    expect(map.getSource(`${layerId}-isoline-source`)).toBeNull();
    expect(map.getLayer(`${layerId}-isoband-layer`)).toBeNull();
    expect(map.getLayer(`${layerId}-isoline-layer`)).toBeNull();
  });
});

describe("§8.8.4 Viewport Re-render Registry (contourReRender.js)", () => {
  test("armContourReRender gates on budget: attaches 0 listeners for small grids (<50k)", () => {
    const map = createMockMap();
    const smallLayer = {
      id: "small-layer",
      gridData: {
        header: { n_lon: 200, n_lat: 100 }, // 20,000 cells < 50,000 budget
        values: new Float32Array(20000),
      },
      element: "TMP",
      config: {},
      visible: true,
    };

    armContourReRender(map, smallLayer);

    // Spec contract: Zero pan/zoom re-computation on small grids (0 listeners)
    expect(map._listeners.get("moveend")?.size || 0).toBe(0);
    expect(map._listeners.get("zoomend")?.size || 0).toBe(0);
  });

  test("armContourReRender attaches exactly 1 listener per layer for large grids (>=50k)", () => {
    const map = createMockMap();
    const largeLayer = {
      id: "large-layer",
      gridData: {
        header: { n_lon: 500, n_lat: 400 }, // 200,000 cells >= 50,000 budget
        values: new Float32Array(200000),
      },
      element: "HGT",
      config: {},
      visible: true,
    };

    armContourReRender(map, largeLayer);

    expect(map._listeners.get("moveend")?.size).toBe(1);
    expect(map._listeners.get("zoomend")?.size).toBe(1);

    // Re-arm is idempotent: does not duplicate listeners
    armContourReRender(map, largeLayer);
    expect(map._listeners.get("moveend")?.size).toBe(1);

    // Disarm detaches listeners cleanly
    disarmContourReRender(map, largeLayer.id);
    expect(map._listeners.get("moveend")?.size).toBe(0);
  });

  test("disarmAllContourReRenders cleans up all listeners across all layers", () => {
    const map = createMockMap();
    const layer1 = {
      id: "layer-1",
      gridData: { header: { n_lon: 400, n_lat: 300 }, values: new Float32Array(120000) },
      element: "TMP",
      visible: true,
    };
    const layer2 = {
      id: "layer-2",
      gridData: { header: { n_lon: 400, n_lat: 300 }, values: new Float32Array(120000) },
      element: "WIND",
      visible: true,
    };

    armContourReRender(map, layer1);
    armContourReRender(map, layer2);

    expect(map._listeners.get("moveend")?.size).toBe(2);

    disarmAllContourReRenders(map);
    expect(map._listeners.get("moveend")?.size).toBe(0);
  });
});

describe("§8.8.3 Raster Hardening & Lifecycle Leak Prevention", () => {
  test("showRaster: true and showFill: false computes zero contourf features", () => {
    const map = createMockMap();
    const gridData = {
      header: { n_lon: 20, n_lat: 20, start_lon: 60, end_lon: 80, start_lat: 40, end_lat: 20, d_lon: 1, d_lat: -1 },
      x: Array.from({ length: 20 }, (_, i) => 60 + i),
      y: Array.from({ length: 20 }, (_, i) => 40 - i),
      values: new Float32Array(400).fill(15),
      stats: { min: 10, max: 20 },
    };

    let stats = null;
    renderContourLayers(map, gridData, "TMP", {
      layerId: "raster-exclusive-test",
      showFill: false,
      showRaster: true,
      showLine: true,
      onStats: (s) => { stats = s; },
    });

    const isobandSrc = map.getSource("raster-exclusive-test-isoband-source");
    expect(isobandSrc.data.features.length).toBe(0);
    expect(stats.isobandPoints).toBe(0);
  });

  test("renderGridRaster revokes previous Blob URL on re-render", () => {
    const map = createMockMap();
    const revokedUrls = [];
    const origRevoke = globalThis.URL.revokeObjectURL;
    const origCreate = globalThis.URL.createObjectURL;

    let blobCounter = 0;
    globalThis.URL.createObjectURL = () => `blob:http://localhost/test-blob-${++blobCounter}`;
    globalThis.URL.revokeObjectURL = (url) => { revokedUrls.push(url); };

    const origCreateEl = globalThis.document.createElement;
    globalThis.document.createElement = (tag) => {
      const el = (origCreateEl ? origCreateEl(tag) : null) || {};
      if (tag === "canvas") {
        el.style = el.style || {};
        el.getContext = el.getContext || (() => ({
          createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: () => {},
        }));
        el.toBlob = (cb) => {
          if (typeof cb === "function") cb(new Blob(["mock-blob"]));
        };
      }
      return el;
    };

    try {
      const grid = {
        header: { n_lon: 10, n_lat: 10, start_lon: 60, end_lon: 70, start_lat: 50, end_lat: 40 },
        values: new Float32Array(100).fill(20),
        stats: { min: 10, max: 30 },
      };

      renderGridRaster(map, grid, "TMP", null, { layerId: "blob-test" });
      const firstUrl = map.getSource("blob-test-raster-source")?.url;
      expect(firstUrl).toMatch(/^blob:/);

      // Re-render layer
      renderGridRaster(map, grid, "TMP", null, { layerId: "blob-test" });
      const secondUrl = map.getSource("blob-test-raster-source")?.url;

      // Prior URL must be revoked (§8.8.3 P3-2)
      expect(revokedUrls).toContain(firstUrl);
      expect(secondUrl).not.toBe(firstUrl);

      // Removal revokes the active URL
      removeRasterLayer(map, "blob-test");
      expect(revokedUrls).toContain(secondUrl);
    } finally {
      globalThis.document.createElement = origCreateEl;
      globalThis.URL.createObjectURL = origCreate;
      globalThis.URL.revokeObjectURL = origRevoke;
    }
  });

  test("renderGridRaster caps massive grid dimensions to max 2048", () => {
    const map = createMockMap();
    const grid = {
      header: { n_lon: 3600, n_lat: 1801, start_lon: 0, end_lon: 360, start_lat: 90, end_lat: -90 },
      values: new Float32Array(100), // dummy
      stats: { min: 0, max: 100 },
    };

    let createdCanvas = null;
    const origCreateEl = globalThis.document.createElement;
    globalThis.document.createElement = (tag) => {
      const el = origCreateEl(tag);
      if (tag === "canvas") createdCanvas = el;
      return el;
    };

    try {
      renderGridRaster(map, grid, "TMP", null, { layerId: "dim-cap-test" });
      expect(createdCanvas).not.toBeNull();
      expect(createdCanvas.width).toBeLessThanOrEqual(2048);
      expect(createdCanvas.height).toBeLessThanOrEqual(2048);
    } finally {
      globalThis.document.createElement = origCreateEl;
    }
  });
});

describe("§8.8.2 Vector Wind Direct Canvas Hardening", () => {
  test("renderWindStreamlines makes 0 GeoJSON setData calls", () => {
    const map = createMockMap();
    const gridData = {
      header: { n_lon: 20, n_lat: 20, start_lon: 60, end_lon: 80, start_lat: 40, end_lat: 20 },
      u: new Float32Array(400).fill(5),
      v: new Float32Array(400).fill(10),
    };

    renderWindStreamlines(map, gridData);

    // Bypasses GeoJSON completely: 0 setData calls
    for (const src of map._sources.values()) {
      expect(src._setDataCalls || 0).toBe(0);
    }

    stopWindAnimation(map);
  });

  test("cleanupWindLayer cancels animation frame and removes listeners and canvases", () => {
    const map = createMockMap();
    let cancelledId = null;
    const origCancel = globalThis.cancelAnimationFrame;
    const origRequest = globalThis.requestAnimationFrame;

    globalThis.requestAnimationFrame = () => 12345;
    globalThis.cancelAnimationFrame = (id) => { cancelledId = id; };

    try {
      const gridData = {
        header: { n_lon: 20, n_lat: 20, start_lon: 60, end_lon: 80, start_lat: 40, end_lat: 20 },
        u: new Float32Array(400).fill(5),
        v: new Float32Array(400).fill(10),
      };

      renderWindStreamlines(map, gridData);
      renderGridWindBarbs(map, gridData);

      expect(map._windAnimId).toBe(12345);
      expect(map._windBarbMoveListener).toBeDefined();

      cleanupWindLayer(map);

      expect(cancelledId).toBe(12345);
      expect(map._windAnimId).toBeNull();
      expect(map._windBarbMoveListener).toBeNull();
      expect(map._windStreamlineMoveListener).toBeNull();
    } finally {
      globalThis.cancelAnimationFrame = origCancel;
      globalThis.requestAnimationFrame = origRequest;
    }
  });
});

describe("memStats Utilities (Architecture §8.8 & memStats.js)", () => {
  test("countGeoJSONPoints and estimateHeapMB correctly measure LineString and Polygon features", () => {
    const lines = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [[0, 0], [1, 1], [2, 2], [3, 3]],
          },
        },
      ],
    };

    expect(countGeoJSONPoints(lines)).toBe(4);
    expect(estimateHeapMB(lines)).toBeGreaterThan(0);

    const polygons = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
            ],
          },
        },
      ],
    };

    expect(countGeoJSONPoints(polygons)).toBe(5);
    expect(estimateHeapMB(polygons)).toBeGreaterThan(0);
  });
});
