// rerender-registry.test.js - Viewport Re-render Registry (contourReRender.js, 3 tests)
import { test, expect, describe, beforeAll } from "bun:test";
import {
  armContourReRender,
  disarmContourReRender,
  disarmAllContourReRenders,
} from "../../src/services/contourReRender.js";

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
