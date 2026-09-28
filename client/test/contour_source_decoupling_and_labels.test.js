// contour_source_decoupling_and_labels.test.js
// Verification of source decoupling (lines vs labels), showLabels wiring, and local glyphs
import { test, expect, describe } from "bun:test";
import {
  getLayerDOMIds,
  updateMapLibreContour,
  flushContourSource,
  removeContourLayer,
  removeAllContourLayers,
  renderContourLayers,
  setLayerIsolineVisibility,
  setLayerIsolineLabelVisibility,
  setLayerIsolineStyle,
} from "../src/layers/contourLayer.js";
import { getPMTilesStyle } from "../src/map/pmtilesLayers.js";
import { handleLayerAction } from "../src/ui/layers/actionsDispatcher.js";
import { addOrUpdateLayer } from "../src/ui/layers/layerStore.js";

function createMockMap() {
  const sources = new Map();
  const layers = new Map();
  return {
    sources,
    layers,
    __basemapScheme: "dark",
    getSource(id) {
      if (!sources.has(id)) return null;
      return {
        _data: sources.get(id),
        data: sources.get(id),
        setData(d) {
          sources.set(id, d);
          this._data = d;
          this.data = d;
        },
      };
    },
    addSource(id, src) {
      sources.set(id, src.data);
    },
    removeSource(id) {
      sources.delete(id);
    },
    getLayer(id) {
      return layers.get(id) || null;
    },
    addLayer(layerDef) {
      layers.set(layerDef.id, {
        ...layerDef,
        layout: { ...(layerDef.layout || {}) },
        paint: { ...(layerDef.paint || {}) },
      });
    },
    removeLayer(id) {
      layers.delete(id);
    },
    setLayoutProperty(id, prop, val) {
      if (layers.has(id)) {
        const l = layers.get(id);
        if (!l.layout) l.layout = {};
        l.layout[prop] = val;
      }
    },
    setPaintProperty(id, prop, val) {
      if (layers.has(id)) {
        const l = layers.get(id);
        if (!l.paint) l.paint = {};
        l.paint[prop] = val;
      }
    },
    getStyle() {
      return {
        layers: Array.from(layers.values()),
        sources: Object.fromEntries(Array.from(sources.entries()).map(([k, v]) => [k, { type: "geojson", data: v }])),
      };
    },
  };
}

const sampleLines = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [[100, 30], [105, 32], [110, 30]],
      },
      properties: { value: 588, label: "588", isBold: true },
    },
  ],
};

const sampleFills = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[100, 30], [105, 30], [105, 35], [100, 35], [100, 30]]],
      },
      properties: { level: [580, 588], fillColor: "#388bfd" },
    },
  ],
};

describe("Contour Source Decoupling (Lines vs Labels)", () => {
  test("1. getLayerDOMIds returns isolineLabelSrcId for default and custom layers", () => {
    const defaultIds = getLayerDOMIds("default");
    expect(defaultIds.isobandSrcId).toBe("isoband-source");
    expect(defaultIds.isolineSrcId).toBe("isoline-source");
    expect(defaultIds.isolineLabelSrcId).toBe("isoline-label-source");
    expect(defaultIds.isolineLayerId).toBe("isoline-layer");
    expect(defaultIds.isolineLabelLayerId).toBe("isoline-label-layer");

    const customIds = getLayerDOMIds("ecmwf-500-hgt");
    expect(customIds.isobandSrcId).toBe("ecmwf-500-hgt-isoband-source");
    expect(customIds.isolineSrcId).toBe("ecmwf-500-hgt-isoline-source");
    expect(customIds.isolineLabelSrcId).toBe("ecmwf-500-hgt-isoline-label-source");
    expect(customIds.isolineLayerId).toBe("ecmwf-500-hgt-isoline-layer");
    expect(customIds.isolineLabelLayerId).toBe("ecmwf-500-hgt-isoline-label-layer");
  });

  test("2. updateMapLibreContour attaches line layer and symbol layer to separate sources", () => {
    const map = createMockMap();
    const layerId = "test-layer";

    updateMapLibreContour(map, sampleFills, sampleLines, {
      layerId,
      showLine: true,
      showLabels: true,
      showFill: true,
    });

    const { isolineSrcId, isolineLayerId, isolineLabelSrcId, isolineLabelLayerId } = getLayerDOMIds(layerId);

    // Both sources must exist
    expect(map.getSource(isolineSrcId)).not.toBeNull();
    expect(map.getSource(isolineLabelSrcId)).not.toBeNull();

    // Verify source decoupling: isolineLayer uses isolineSrcId, isolineLabelLayer uses isolineLabelSrcId
    const lineLayer = map.getLayer(isolineLayerId);
    const labelLayer = map.getLayer(isolineLabelLayerId);

    expect(lineLayer).not.toBeNull();
    expect(lineLayer.type).toBe("line");
    expect(lineLayer.source).toBe(isolineSrcId);
    expect(lineLayer.source).not.toBe(isolineLabelSrcId);

    expect(labelLayer).not.toBeNull();
    expect(labelLayer.type).toBe("symbol");
    expect(labelLayer.source).toBe(isolineLabelSrcId);
    expect(labelLayer.source).not.toBe(isolineSrcId);
  });

  test("3. showLabels: false leaves isolineLayer visible while setting isolineLabelLayer to none", () => {
    const map = createMockMap();
    const layerId = "test-labels-off";

    updateMapLibreContour(map, sampleFills, sampleLines, {
      layerId,
      showLine: true,
      showLabels: false,
    });

    const { isolineLayerId, isolineLabelLayerId } = getLayerDOMIds(layerId);
    expect(map.getLayer(isolineLayerId).layout.visibility).toBe("visible");
    expect(map.getLayer(isolineLabelLayerId).layout.visibility).toBe("none");
  });

  test("4. flushContourSource flushes all three sources: isoband, isoline, and isolineLabel", () => {
    const map = createMockMap();
    const layerId = "test-flush";

    updateMapLibreContour(map, sampleFills, sampleLines, {
      layerId,
      showLine: true,
      showLabels: true,
      showFill: true,
    });

    const { isobandSrcId, isolineSrcId, isolineLabelSrcId } = getLayerDOMIds(layerId);
    expect(map.getSource(isobandSrcId).data.features.length).toBeGreaterThan(0);
    expect(map.getSource(isolineSrcId).data.features.length).toBeGreaterThan(0);
    expect(map.getSource(isolineLabelSrcId).data.features.length).toBeGreaterThan(0);

    flushContourSource(map, layerId);

    expect(map.getSource(isobandSrcId).data.features.length).toBe(0);
    expect(map.getSource(isolineSrcId).data.features.length).toBe(0);
    expect(map.getSource(isolineLabelSrcId).data.features.length).toBe(0);
  });

  test("5. removeContourLayer removes isolineLabelLayer and isolineLabelSrc", () => {
    const map = createMockMap();
    const layerId = "test-remove";

    updateMapLibreContour(map, sampleFills, sampleLines, {
      layerId,
      showLine: true,
      showLabels: true,
      showFill: true,
    });

    const { isobandSrcId, isobandLayerId, isolineSrcId, isolineLayerId, isolineLabelSrcId, isolineLabelLayerId } = getLayerDOMIds(layerId);

    expect(map.getSource(isolineLabelSrcId)).not.toBeNull();
    expect(map.getLayer(isolineLabelLayerId)).not.toBeNull();

    removeContourLayer(map, layerId);

    expect(map.getSource(isolineLabelSrcId)).toBeNull();
    expect(map.getLayer(isolineLabelLayerId)).toBeNull();
    expect(map.getSource(isolineSrcId)).toBeNull();
    expect(map.getLayer(isolineLayerId)).toBeNull();
    expect(map.getSource(isobandSrcId)).toBeNull();
    expect(map.getLayer(isobandLayerId)).toBeNull();
  });

  test("6. removeAllContourLayers cleans up all decoupled sources and layers", () => {
    const map = createMockMap();

    updateMapLibreContour(map, sampleFills, sampleLines, {
      layerId: "c1",
      showLine: true,
      showLabels: true,
    });
    updateMapLibreContour(map, sampleFills, sampleLines, {
      layerId: "c2",
      showLine: true,
      showLabels: true,
    });

    expect(map.sources.size).toBe(6); // 3 sources per layer (fill, line, label)

    removeAllContourLayers(map);

    expect(map.sources.size).toBe(0);
    expect(map.layers.size).toBe(0);
  });

  test("7. setLayerIsolineLabelVisibility toggles label layer visibility independently", () => {
    const map = createMockMap();
    const layerId = "test-indep";

    updateMapLibreContour(map, sampleFills, sampleLines, {
      layerId,
      showLine: true,
      showLabels: true,
    });

    const { isolineLayerId, isolineLabelLayerId } = getLayerDOMIds(layerId);
    expect(map.getLayer(isolineLayerId).layout.visibility).toBe("visible");
    expect(map.getLayer(isolineLabelLayerId).layout.visibility).toBe("visible");

    // Hide labels only
    setLayerIsolineLabelVisibility(map, layerId, false);
    expect(map.getLayer(isolineLayerId).layout.visibility).toBe("visible");
    expect(map.getLayer(isolineLabelLayerId).layout.visibility).toBe("none");

    // Show labels again
    setLayerIsolineLabelVisibility(map, layerId, true);
    expect(map.getLayer(isolineLayerId).layout.visibility).toBe("visible");
    expect(map.getLayer(isolineLabelLayerId).layout.visibility).toBe("visible");
  });

  test("8. setLayerIsolineVisibility respects showLabels argument", () => {
    const map = createMockMap();
    const layerId = "test-vis-arg";

    updateMapLibreContour(map, sampleFills, sampleLines, {
      layerId,
      showLine: true,
      showLabels: true,
    });

    const { isolineLayerId, isolineLabelLayerId } = getLayerDOMIds(layerId);

    // Turn lines visible, but showLabels is false
    setLayerIsolineVisibility(map, layerId, true, false);
    expect(map.getLayer(isolineLayerId).layout.visibility).toBe("visible");
    expect(map.getLayer(isolineLabelLayerId).layout.visibility).toBe("none");

    // Turn lines off entirely
    setLayerIsolineVisibility(map, layerId, false, false);
    expect(map.getLayer(isolineLayerId).layout.visibility).toBe("none");
    expect(map.getLayer(isolineLabelLayerId).layout.visibility).toBe("none");
  });
});

describe("Local Font Rasterization (No Remote CDN Glyph Dependency)", () => {
  test("getPMTilesStyle does not specify remote demotiles glyphs URL", () => {
    const style = getPMTilesStyle("http://localhost:8088/map-china.pmtiles", "dark");
    expect(style.glyphs).toBeUndefined();
  });
});

describe("Wiring showLabels Configuration through Action Dispatcher", () => {
  test("handleLayerAction config with showLabels toggles label layer visibility", () => {
    const map = createMockMap();
    const layerId = "contour-test-cfg";

    updateMapLibreContour(map, sampleFills, sampleLines, {
      layerId,
      showLine: true,
      showLabels: true,
    });

    const win = {
      id: "w1",
      layers: [],
    };

    const layer = addOrUpdateLayer({
      id: layerId,
      type: "contour",
      element: "TMP",
      visible: true,
      config: {
        showLine: true,
        showLabels: true,
      },
    }, win);

    const { isolineLayerId, isolineLabelLayerId } = getLayerDOMIds(layerId);
    expect(map.getLayer(isolineLayerId).layout.visibility).toBe("visible");
    expect(map.getLayer(isolineLabelLayerId).layout.visibility).toBe("visible");

    // Toggle showLabels: false
    handleLayerAction(map, "config", layerId, { showLabels: false }, layer, win);
    expect(layer.config.showLabels).toBe(false);
    expect(map.getLayer(isolineLayerId).layout.visibility).toBe("visible");
    expect(map.getLayer(isolineLabelLayerId).layout.visibility).toBe("none");

    // Toggle showLabels: true
    handleLayerAction(map, "config", layerId, { showLabels: true }, layer, win);
    expect(layer.config.showLabels).toBe(true);
    expect(map.getLayer(isolineLayerId).layout.visibility).toBe("visible");
    expect(map.getLayer(isolineLabelLayerId).layout.visibility).toBe("visible");
  });
});

describe("Empty Source & Layer Optimization (§Requirement 4)", () => {
  test("updateMapLibreContour initializes sources with empty features and visibility none when disabled", () => {
    const map = createMockMap();
    const emptyFC = { type: "FeatureCollection", features: [] };
    updateMapLibreContour(map, emptyFC, emptyFC, {
      layerId: "c-empty",
      showFill: false,
      showLine: false,
      showLabels: false,
    });

    const { isobandSrcId, isolineSrcId, isolineLabelSrcId, isobandLayerId, isolineLayerId, isolineLabelLayerId } = getLayerDOMIds("c-empty");
    expect(map.getSource(isobandSrcId).data.features.length).toBe(0);
    expect(map.getSource(isolineSrcId).data.features.length).toBe(0);
    expect(map.getSource(isolineLabelSrcId).data.features.length).toBe(0);
    expect(map.getLayer(isobandLayerId).layout.visibility).toBe("none");
    expect(map.getLayer(isolineLayerId).layout.visibility).toBe("none");
    expect(map.getLayer(isolineLabelLayerId).layout.visibility).toBe("none");
  });

  test("showLabels: false stores empty features in isolineLabelSrc to avoid symbol/glyph parsing overhead", () => {
    const map = createMockMap();
    const layerId = "c-no-labels";

    updateMapLibreContour(map, sampleFills, sampleLines, {
      layerId,
      showLine: true,
      showLabels: false,
    });

    const { isolineSrcId, isolineLabelSrcId } = getLayerDOMIds(layerId);
    expect(map.getSource(isolineSrcId).data.features.length).toBeGreaterThan(0);
    expect(map.getSource(isolineLabelSrcId).data.features.length).toBe(0);
  });
});

describe("Live Configuration Toggles and Style Protection", () => {
  test("toggling showLabels from false to true populates isolineLabelSrc from isolineSrc without clobbering isolines", () => {
    const map = createMockMap();
    const layerId = "c-toggle-labels";

    updateMapLibreContour(map, sampleFills, sampleLines, {
      layerId,
      showLine: true,
      showLabels: false,
    });

    const { isolineSrcId, isolineLabelSrcId, isolineLabelLayerId } = getLayerDOMIds(layerId);
    expect(map.getSource(isolineLabelSrcId).data.features.length).toBe(0);

    const win = { id: "w-toggle", layers: [] };
    const layer = addOrUpdateLayer({
      id: layerId,
      type: "contour",
      element: "TMP",
      visible: true,
      config: { showLine: true, showLabels: false },
    }, win);

    // Toggle showLabels: true
    handleLayerAction(map, "config", layerId, { showLabels: true }, layer, win);
    expect(layer.config.showLabels).toBe(true);
    expect(map.getSource(isolineLabelSrcId).data.features.length).toBe(sampleLines.features.length);
    expect(map.getLayer(isolineLabelLayerId).layout.visibility).toBe("visible");

    // Toggle showLabels: false should clean label data back to empty to free symbol resources
    handleLayerAction(map, "config", layerId, { showLabels: false }, layer, win);
    expect(layer.config.showLabels).toBe(false);
    expect(map.getSource(isolineLabelSrcId).data.features.length).toBe(0);
    expect(map.getLayer(isolineLabelLayerId).layout.visibility).toBe("none");
  });

  test("setLayerIsolineStyle does not overwrite line-color or line-width when only labelSize is changed", () => {
    const map = createMockMap();
    const layerId = "c-style-protect";

    updateMapLibreContour(map, sampleFills, sampleLines, {
      layerId,
      showLine: true,
      showLabels: true,
      lineColor: "#f85149",
      lineWidth: 3.5,
    });

    const { isolineLayerId } = getLayerDOMIds(layerId);
    expect(map.getLayer(isolineLayerId).paint["line-color"]).toEqual([
      "case",
      ["to-boolean", ["get", "isBold"]],
      "#f85149",
      "#f85149",
    ]);
    expect(map.getLayer(isolineLayerId).paint["line-width"]).toEqual([
      "case",
      ["to-boolean", ["get", "isBold"]],
      4,
      3.5,
    ]);

    // Update labelSize only
    setLayerIsolineStyle(map, layerId, { labelSize: 18 });
    // line-color and line-width must NOT be reset to defaults
    expect(map.getLayer(isolineLayerId).paint["line-color"]).toEqual([
      "case",
      ["to-boolean", ["get", "isBold"]],
      "#f85149",
      "#f85149",
    ]);
    expect(map.getLayer(isolineLayerId).paint["line-width"]).toEqual([
      "case",
      ["to-boolean", ["get", "isBold"]],
      4,
      3.5,
    ]);
  });
});
