// raster-hardening.test.js - Raster Hardening & Lifecycle Leak Prevention (§8.8.3, 3 tests)
import { test, expect, describe, beforeAll } from "bun:test";
import { renderContourLayers } from "../../src/layers/contourLayer.js";
import {
  renderGridRaster,
  removeRasterLayer,
} from "../../src/layers/rasterLayer.js";

// Ensure browser globals for headless test environment.
// NOTE: always (re)install: earlier suites may have set a minimal
// document.createElement without canvas getContext (cross-file global leak).
beforeAll(() => {
  if (typeof globalThis.document === "undefined") {
    globalThis.document = {};
  }
  const prevCreateElement = typeof globalThis.document.createElement === "function"
    ? globalThis.document.createElement.bind(globalThis.document)
    : null;
  const makeCanvasStub = (tag) => {
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
  globalThis.document.createElement = (tag, ...rest) => {
    if (tag === "canvas") return makeCanvasStub(tag);
    if (prevCreateElement) {
      try {
        const el = prevCreateElement(tag, ...rest);
        if (el && typeof el === "object") return el;
      } catch {}
    }
    return makeCanvasStub(tag);
  };

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
