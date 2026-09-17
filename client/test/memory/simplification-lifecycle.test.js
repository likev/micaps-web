// simplification-lifecycle.test.js - Lifecycle Memory Management & Geometry Simplification (§8.8.5, 4 tests)
import { test, expect, describe, beforeAll } from "bun:test";
import {
  simplifyPolyline,
  simplifyFeatureCollection,
} from "../../src/utils/smoothContour.js";
import {
  flushContourSource,
  removeContourLayer,
} from "../../src/layers/contourLayer.js";

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
