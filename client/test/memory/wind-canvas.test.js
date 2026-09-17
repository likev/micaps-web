// wind-canvas.test.js - Vector Wind Direct Canvas Hardening (§8.8.2, 2 tests)
import { test, expect, describe, beforeAll } from "bun:test";
import {
  renderWindStreamlines,
  stopWindAnimation,
  renderGridWindBarbs,
  cleanupWindLayer,
} from "../../src/layers/windLayer.js";

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
