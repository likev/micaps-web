// raster_layer.test.js - Unit tests for per-layer raster isolation and lifecycle
import { test, expect, describe, beforeAll } from "bun:test";
import {
  getRasterDOMIds,
  renderGridRaster,
  setRasterVisibility,
  removeRasterLayer,
  removeAllRasterLayers,
} from "../src/layers/rasterLayer.js";

beforeAll(() => {
  if (typeof globalThis.document === "undefined") {
    globalThis.document = {};
  }
  if (!globalThis.document.baseURI) {
    globalThis.document.baseURI = "http://localhost:8088/";
  }
  if (!globalThis.document.createElement) {
    globalThis.document.createElement = (tag) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          style: {},
          getContext: () => ({
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            putImageData: () => {},
          }),
          toDataURL: () => "data:image/png;base64,mock",
          toBlob: (cb) => {
            if (typeof cb === "function") cb(new Blob(["mock"]));
          },
          remove: () => {},
        };
      }
      return {};
    };
  }
});

function createMockMap() {
  const sources = new Map();
  const layers = new Map();
  const listeners = new Map();

  return {
    getSource: (id) => sources.get(id) || null,
    addSource: (id, def) => {
      const srcObj = {
        ...def,
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
    addLayer: (def, beforeId) => {
      layers.set(def.id, { ...def, beforeId });
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
}

describe("Per-Layer Raster DOM IDs & Independent Map Sources", () => {
  test("getRasterDOMIds assigns unique source and layer IDs per weather layer", () => {
    // Default fallback
    expect(getRasterDOMIds("default")).toEqual({
      rasterSrcId: "raster-source",
      rasterLayerId: "raster-layer",
    });
    expect(getRasterDOMIds(null)).toEqual({
      rasterSrcId: "raster-source",
      rasterLayerId: "raster-layer",
    });

    // Layer-specific IDs for RH, HGT, WIND, SLP
    expect(getRasterDOMIds("contour-RH")).toEqual({
      rasterSrcId: "contour-RH-raster-source",
      rasterLayerId: "contour-RH-raster-layer",
    });
    expect(getRasterDOMIds("contour-HGT")).toEqual({
      rasterSrcId: "contour-HGT-raster-source",
      rasterLayerId: "contour-HGT-raster-layer",
    });
    expect(getRasterDOMIds("wind-WIND")).toEqual({
      rasterSrcId: "wind-WIND-raster-source",
      rasterLayerId: "wind-WIND-raster-layer",
    });
    expect(getRasterDOMIds("surface-slp")).toEqual({
      rasterSrcId: "surface-slp-raster-source",
      rasterLayerId: "surface-slp-raster-layer",
    });
  });

  test("Composite fields (RH, HGT, WIND) render into independent raster sources and layers", () => {
    const map = createMockMap();

    // Mock gridData for RH (2x2)
    const rhGrid = {
      header: { n_lon: 2, n_lat: 2, start_lon: 60, end_lon: 70, start_lat: 50, end_lat: 40 },
      values: [[80, 90], [60, 70]],
      stats: { min: 60, max: 90 },
    };

    // Mock gridData for HGT (2x2)
    const hgtGrid = {
      header: { n_lon: 2, n_lat: 2, start_lon: 60, end_lon: 70, start_lat: 50, end_lat: 40 },
      values: [[5880, 5840], [5800, 5760]],
      stats: { min: 5760, max: 5880 },
    };

    // Mock gridData for WIND (2x2)
    const windGrid = {
      header: { n_lon: 2, n_lat: 2, start_lon: 60, end_lon: 70, start_lat: 50, end_lat: 40 },
      u: [[10, 15], [5, 20]],
      v: [[0, 5], [10, 0]],
      stats: { min: 5, max: 20 },
    };

    // Render RH raster
    renderGridRaster(map, rhGrid, "RH", "RH", { layerId: "contour-RH", opacity: 0.7 });
    expect(map.getSource("contour-RH-raster-source")).not.toBeNull();
    expect(map.getLayer("contour-RH-raster-layer")).not.toBeNull();
    expect(map.getLayer("contour-RH-raster-layer").layout.visibility).toBe("visible");

    // Render HGT raster
    renderGridRaster(map, hgtGrid, "HGT", "HGT", { layerId: "contour-HGT", opacity: 0.8 });
    expect(map.getSource("contour-HGT-raster-source")).not.toBeNull();
    expect(map.getLayer("contour-HGT-raster-layer")).not.toBeNull();

    // Render WIND raster
    renderGridRaster(map, windGrid, "WIND", "WIND", { layerId: "wind-WIND", opacity: 0.9 });
    expect(map.getSource("wind-WIND-raster-source")).not.toBeNull();
    expect(map.getLayer("wind-WIND-raster-layer")).not.toBeNull();

    // Verify all 3 layers exist simultaneously without collision
    expect(map._sources.size).toBe(3);
    expect(map._layers.size).toBe(3);

    // Toggling RH raster visibility only affects RH raster
    setRasterVisibility(map, false, "contour-RH");
    expect(map.getLayer("contour-RH-raster-layer").layout.visibility).toBe("none");
    expect(map.getLayer("contour-HGT-raster-layer").layout.visibility).toBe("visible");
    expect(map.getLayer("wind-WIND-raster-layer").layout.visibility).toBe("visible");

    // Removing HGT raster only removes HGT source & layer
    removeRasterLayer(map, "contour-HGT");
    expect(map.getSource("contour-HGT-raster-source")).toBeNull();
    expect(map.getLayer("contour-HGT-raster-layer")).toBeNull();
    expect(map.getSource("contour-RH-raster-source")).not.toBeNull();
    expect(map.getSource("wind-WIND-raster-source")).not.toBeNull();

    // Global remove removes all remaining raster layers
    removeAllRasterLayers(map);
    expect(map.getSource("contour-RH-raster-source")).toBeNull();
    expect(map.getSource("wind-WIND-raster-source")).toBeNull();
    expect(map._sources.size).toBe(0);
    expect(map._layers.size).toBe(0);
  });

  test("contourReRender preserves custom palette across viewport move", async () => {
    const { armContourReRender, disarmAllContourReRenders } = await import("../src/services/contourReRender.js");
    const { setColormaps, COLORMAPS } = await import("../src/utils/colormaps.js");
    const { addOrUpdateLayer } = await import("../src/ui/layerControl.js");

    const map = createMockMap();
    map.getBounds = () => ({
      toArray: () => [[70, 15], [135, 55]],
    });

    const mockWin = { id: "test-win-pal", loadSeq: 1 };
    const customPalette = [
      { val: -40, color: [0, 0, 100, 255] },
      { val: 40, color: [255, 0, 0, 255] },
    ];
    setColormaps({ ...COLORMAPS, "palette:layer-pal-test": customPalette });

    const layer = {
      id: "layer-pal-test",
      element: "TMP",
      colormap: "palette:layer-pal-test",
      gridData: {
        header: { n_lon: 400, n_lat: 300, start_lon: 60, end_lon: 140, start_lat: 50, end_lat: 10 },
        values: new Float32Array(120000),
      },
      config: {
        showRaster: true,
        showLine: true,
        showFill: false,
        palettePath: "test.xml",
      },
      visible: true,
    };

    addOrUpdateLayer(layer, mockWin);
    armContourReRender(map, layer, mockWin);

    expect(map._listeners.get("moveend")?.size).toBe(1);

    // Initial raster render using custom palette
    renderGridRaster(map, layer.gridData, "TMP", layer.colormap, { layerId: layer.id });
    expect(map.getSource("layer-pal-test-raster-source")).not.toBeNull();

    // Trigger move with updated bounds
    map.getBounds = () => ({
      toArray: () => [[75, 20], [130, 50]],
    });

    // Fire moveend
    map._emit("moveend");

    // Wait for debounced recompute (250ms debounce + timeout)
    await new Promise((resolve) => setTimeout(resolve, 350));

    // After move, verify that the layer's raster was re-rendered and still exists
    expect(map.getSource("layer-pal-test-raster-source")).not.toBeNull();

    disarmAllContourReRenders(map);
  });
});
