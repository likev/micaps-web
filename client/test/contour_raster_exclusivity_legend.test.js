// contour_raster_exclusivity_legend.test.js - Tests for mutual exclusivity and legend display
import { test, expect, describe, beforeAll, beforeEach } from "bun:test";
import { addOrUpdateLayer, getLayersForWindow, clearWindowWeatherLayers } from "../src/ui/layerControl.js";
import { handleLayerAction } from "../src/ui/layerActions.js";
import { updateLegend, removeLegend, clearLegends } from "../src/ui/legend.js";
import { renderContourLayers } from "../src/layers/contourLayer.js";

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
    getBounds: () => ({ toArray: () => [[60, 20], [80, 40]] }),
    getStyle: () => ({
      layers: Array.from(layers.values()),
      sources: Object.fromEntries(sources.entries()),
    }),
    _sources: sources,
    _layers: layers,
  };
}

describe("Contour Fills and Binary Raster Overlay Mutual Exclusivity", () => {
  const win = { id: "win-test-exclusivity", winIdx: 0 };

  beforeEach(() => {
    clearWindowWeatherLayers(win.id);
    clearLegends(win);
  });

  test("1. addOrUpdateLayer resolves { showFill: true, showRaster: true } by forcing showRaster = false", () => {
    const layer = addOrUpdateLayer({
      id: "contour-tmp-500",
      element: "TMP",
      type: "contour",
      config: {
        showFill: true,
        showRaster: true,
        showLine: true,
      },
    }, win);

    expect(layer.config.showFill).toBe(true);
    expect(layer.config.showRaster).toBe(false);
  });

  test("2. addOrUpdateLayer defaults showFill to false for HGT element", () => {
    const layer = addOrUpdateLayer({
      id: "contour-hgt-500",
      element: "HGT",
      type: "contour",
      config: {
        showLine: true,
      },
    }, win);

    expect(layer.config.showFill).toBe(false);
    expect(layer.config.showRaster).toBe(false);
    expect(layer.config.showLine).toBe(true);
  });

  test("3. Config action: checking showFill automatically unchecks showRaster and hides raster", () => {
    const map = createMockMap();
    // Simulate layer with raster initially enabled
    const layer = addOrUpdateLayer({
      id: "contour-tmp-500",
      element: "TMP",
      type: "contour",
      visible: true,
      config: {
        showFill: false,
        showRaster: true,
        showLine: true,
      },
      gridData: { stats: { min: -10, max: 30 }, values: new Float32Array(100) },
    }, win);

    // Initial mock raster layer on map
    map.addLayer({ id: "contour-tmp-500-raster-layer", layout: { visibility: "visible" } });

    // Action: user checks showFill -> { showFill: true, showRaster: false }
    handleLayerAction(map, "config", layer.id, { showFill: true, showRaster: false }, layer, win);

    expect(layer.config.showFill).toBe(true);
    expect(layer.config.showRaster).toBe(false);
    expect(map.getLayer("contour-tmp-500-raster-layer").layout.visibility).toBe("none");
  });

  test("4. Config action: checking showRaster automatically unchecks showFill and hides isoband", () => {
    const map = createMockMap();
    // Simulate layer with fill initially enabled
    const layer = addOrUpdateLayer({
      id: "contour-tmp-500",
      element: "TMP",
      type: "contour",
      visible: true,
      config: {
        showFill: true,
        showRaster: false,
        showLine: true,
      },
      gridData: { stats: { min: -10, max: 30 }, values: new Float32Array(100) },
    }, win);

    // Initial mock isoband layer on map
    map.addLayer({ id: "contour-tmp-500-isoband-layer", layout: { visibility: "visible" } });

    // Action: user checks showRaster -> { showRaster: true, showFill: false }
    handleLayerAction(map, "config", layer.id, { showRaster: true, showFill: false }, layer, win);

    expect(layer.config.showRaster).toBe(true);
    expect(layer.config.showFill).toBe(false);
    expect(map.getLayer("contour-tmp-500-isoband-layer").layout.visibility).toBe("none");
  });
});

describe("Legend Lifecycle: Show for Shading (Fill or Raster), Hide for Lines-Only", () => {
  const win = { id: "win-test-legend", winIdx: 0 };
  let panel;

  beforeEach(() => {
    clearWindowWeatherLayers(win.id);
    panel = {
      innerHTML: "",
      classList: {
        _classes: new Set(["hidden"]),
        add: function (cls) { this._classes.add(cls); },
        remove: function (cls) { this._classes.delete(cls); },
        contains: function (cls) { return this._classes.has(cls); },
      },
    };
    globalThis.document.getElementById = (id) => (id === "legend-panel" ? panel : null);
    clearLegends(win);
  });

  test("1. Visibility action: lines-only layer (500 hPa HGT) does NOT show legend on visible = true", () => {
    const map = createMockMap();
    const hgtLayer = {
      id: "contour-hgt-500",
      element: "HGT",
      type: "contour",
      visible: true,
      config: {
        showFill: false,
        showRaster: false,
        showLine: true,
      },
      gridData: { stats: { min: 5000, max: 6000 } },
    };

    handleLayerAction(map, "visibility", hgtLayer.id, true, hgtLayer, win);
    // Legend must be empty / hidden since no fill or raster
    expect(panel.innerHTML).toBe("");
  });

  test("2. Visibility action: layer with showFill = true shows legend on visible = true", () => {
    const map = createMockMap();
    const tmpLayer = {
      id: "contour-tmp-500",
      element: "TMP",
      type: "contour",
      visible: true,
      config: {
        showFill: true,
        showRaster: false,
        showLine: true,
      },
      gridData: { stats: { min: -20, max: 20 } },
    };

    handleLayerAction(map, "visibility", tmpLayer.id, true, tmpLayer, win);
    expect(panel.innerHTML).toContain("TMP");
    expect(panel.innerHTML).toContain("legend-bar");
  });

  test("3. Visibility action: layer with showRaster = true shows legend on visible = true", () => {
    const map = createMockMap();
    const rasterLayer = {
      id: "contour-rh-500",
      element: "RH",
      type: "contour",
      visible: true,
      config: {
        showFill: false,
        showRaster: true,
        showLine: false,
      },
      gridData: { stats: { min: 0, max: 100 } },
    };

    handleLayerAction(map, "visibility", rasterLayer.id, true, rasterLayer, win);
    expect(panel.innerHTML).toContain("RH");
    expect(panel.innerHTML).toContain("legend-bar");
  });

  test("4. Config action: toggling showFill on an HGT layer shows legend; toggling off hides legend", () => {
    const map = createMockMap();
    const layer = {
      id: "contour-hgt-500",
      element: "HGT",
      type: "contour",
      visible: true,
      config: {
        showFill: false,
        showRaster: false,
        showLine: true,
      },
      gridData: { stats: { min: 5000, max: 6000 } },
    };

    // Initially lines-only -> no legend
    handleLayerAction(map, "visibility", layer.id, true, layer, win);
    expect(panel.innerHTML).toBe("");

    // User checks Contour Fills -> showFill: true
    layer.config.showFill = true;
    handleLayerAction(map, "config", layer.id, { showFill: true, showRaster: false }, layer, win);
    expect(panel.innerHTML).toContain("HGT");
    expect(panel.innerHTML).toContain("legend-bar");

    // User unchecks Contour Fills -> showFill: false (lines only remain)
    layer.config.showFill = false;
    handleLayerAction(map, "config", layer.id, { showFill: false }, layer, win);
    expect(panel.innerHTML).toBe("");
  });

  test("5. Config action: toggling showRaster on an HGT layer shows legend; toggling off hides legend", () => {
    const map = createMockMap();
    const layer = {
      id: "contour-hgt-500",
      element: "HGT",
      type: "contour",
      visible: true,
      config: {
        showFill: false,
        showRaster: false,
        showLine: true,
      },
      gridData: { stats: { min: 5000, max: 6000 }, values: new Float32Array(100) },
    };

    // User checks Binary Raster -> showRaster: true
    layer.config.showRaster = true;
    handleLayerAction(map, "config", layer.id, { showRaster: true, showFill: false }, layer, win);
    expect(panel.innerHTML).toContain("HGT");
    expect(panel.innerHTML).toContain("legend-bar");

    // User unchecks Binary Raster -> showRaster: false
    layer.config.showRaster = false;
    handleLayerAction(map, "config", layer.id, { showRaster: false }, layer, win);
    expect(panel.innerHTML).toBe("");
  });

  test("6. Toggling showLine on/off does not show legend when neither fill nor raster is active", () => {
    const map = createMockMap();
    const layer = {
      id: "contour-hgt-500",
      element: "HGT",
      type: "contour",
      visible: true,
      config: {
        showFill: false,
        showRaster: false,
        showLine: false,
      },
      gridData: { stats: { min: 5000, max: 6000 } },
    };

    handleLayerAction(map, "config", layer.id, { showLine: true }, layer, win);
    expect(panel.innerHTML).toBe("");

    handleLayerAction(map, "config", layer.id, { showLine: false }, layer, win);
    expect(panel.innerHTML).toBe("");
  });
});

describe("Contour Fills (isoband) Dynamic Computation & Viewport Move Preservation", () => {
  const win = { id: "win-test-fills", winIdx: 0 };

  const sampleGridData = {
    header: {
      n_lon: 20,
      n_lat: 20,
      start_lon: 60,
      end_lon: 80,
      start_lat: 40,
      end_lat: 20,
      d_lon: 1,
      d_lat: -1,
    },
    x: Array.from({ length: 20 }, (_, i) => 60 + i),
    y: Array.from({ length: 20 }, (_, i) => 40 - i),
    values: Array.from({ length: 400 }, (_, i) => 10 + (i % 20)),
    stats: { min: 10, max: 30 },
  };

  test("1. Viewport pan/zoom re-render with preserveIsobands: true does not wipe out existing isobands", () => {
    const map = createMockMap();
    renderContourLayers(map, sampleGridData, "TMP", {
      layerId: "preserve-test",
      showFill: true,
      showRaster: false,
      showLine: true,
    });

    const isobandSrc = map.getSource("preserve-test-isoband-source");
    expect(isobandSrc).toBeTruthy();
    expect(isobandSrc.data.features.length).toBeGreaterThan(0);
    const initialCount = isobandSrc.data.features.length;

    // Simulate pan/zoom moveend re-render in contourReRender.js
    renderContourLayers(map, sampleGridData, "TMP", {
      layerId: "preserve-test",
      preserveIsobands: true,
      visibleIsoband: true,
      showFill: false,
      showLine: true,
    });

    // Isobands must remain intact, not wiped out to 0
    expect(map.getSource("preserve-test-isoband-source").data.features.length).toBe(initialCount);
    expect(map.getLayer("preserve-test-isoband-layer").layout.visibility).toBe("visible");
  });

  test("2. Toggling showFill: true on an HGT layer dynamically computes and populates isobands", () => {
    const map = createMockMap();
    // Initially load layer with showFill: false (default for HGT)
    renderContourLayers(map, sampleGridData, "HGT", {
      layerId: "contour-hgt-fill-test",
      showFill: false,
      showLine: true,
    });

    const isobandSrc = map.getSource("contour-hgt-fill-test-isoband-source");
    expect(isobandSrc.data.features.length).toBe(0);

    const layer = addOrUpdateLayer({
      id: "contour-hgt-fill-test",
      element: "HGT",
      type: "contour",
      visible: true,
      gridData: sampleGridData,
      config: {
        showFill: false,
        showRaster: false,
        showLine: true,
      },
    }, win);

    // User checks Contour Fills (isoband) in Layer Control
    handleLayerAction(map, "config", layer.id, { showFill: true, showRaster: false }, layer, win);

    expect(layer.config.showFill).toBe(true);
    expect(layer.config.showRaster).toBe(false);
    expect(map.getSource("contour-hgt-fill-test-isoband-source").data.features.length).toBeGreaterThan(0);
    expect(map.getLayer("contour-hgt-fill-test-isoband-layer").layout.visibility).toBe("visible");
  });

  test("3. Toggling showFill: false hides isobands; subsequent showFill: true reuses existing features without wiping", () => {
    const map = createMockMap();
    const layer = addOrUpdateLayer({
      id: "contour-tmp-toggle-test",
      element: "TMP",
      type: "contour",
      visible: true,
      gridData: sampleGridData,
      config: {
        showFill: true,
        showRaster: false,
        showLine: true,
      },
    }, win);

    // Initial render with fill
    renderContourLayers(map, sampleGridData, "TMP", {
      layerId: layer.id,
      showFill: true,
      showRaster: false,
    });

    const count = map.getSource("contour-tmp-toggle-test-isoband-source").data.features.length;
    expect(count).toBeGreaterThan(0);

    // User unchecks Fill -> hide isoband
    handleLayerAction(map, "config", layer.id, { showFill: false }, layer, win);
    expect(map.getLayer("contour-tmp-toggle-test-isoband-layer").layout.visibility).toBe("none");
    expect(map.getSource("contour-tmp-toggle-test-isoband-source").data.features.length).toBe(count);

    // User re-checks Fill -> reuse isoband features and show
    handleLayerAction(map, "config", layer.id, { showFill: true, showRaster: false }, layer, win);
    expect(map.getLayer("contour-tmp-toggle-test-isoband-layer").layout.visibility).toBe("visible");
    expect(map.getSource("contour-tmp-toggle-test-isoband-source").data.features.length).toBe(count);
  });
});

