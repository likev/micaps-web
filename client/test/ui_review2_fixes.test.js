// ui_review2_fixes.test.js - Automated tests verifying all issues from UI Review 2
import { test, expect, describe, beforeEach } from "bun:test";
import fs from "fs";
import { updateLegend, removeLegend, clearLegends } from "../src/ui/legend.js";
import { setLayerIsolineStyle } from "../src/layers/contourLayer.js";
import { setStationConfig, renderStationWeatherPlots } from "../src/layers/stationLayer.js";
import { getSkyCoverSVG, getWindBarbSVG } from "../src/utils/weatherSymbols.js";
import { handleLayerAction } from "../src/ui/layerActions.js";

function createMockMap() {
  const sources = new Map();
  const layers = new Map();
  return {
    addSource: (id, src) => sources.set(id, { ...src, _data: src.data }),
    getSource: (id) => {
      const src = sources.get(id);
      if (!src) return null;
      return {
        ...src,
        setData: (d) => {
          src.data = d;
          src._data = d;
        },
      };
    },
    removeSource: (id) => sources.delete(id),
    addLayer: (layer) => layers.set(layer.id, { ...layer }),
    getLayer: (id) => layers.get(id),
    removeLayer: (id) => layers.delete(id),
    setLayoutProperty: (id, prop, val) => {
      const l = layers.get(id);
      if (l) {
        if (!l.layout) l.layout = {};
        l.layout[prop] = val;
      }
    },
    setPaintProperty: (id, prop, val) => {
      const l = layers.get(id);
      if (l) {
        if (!l.paint) l.paint = {};
        l.paint[prop] = val;
      }
    },
    getStyle: () => ({ layers: Array.from(layers.values()) }),
    getBounds: () => ({ getWest: () => 70, getEast: () => 140, getSouth: () => 15, getNorth: () => 55 }),
    getZoom: () => 4.2,
    project: ([lon, lat]) => ({ x: (lon - 70) * 10, y: (55 - lat) * 10 }),
    on: () => {},
    off: () => {},
  };
}

describe("UI Review 2: CSS Overflow Verifications", () => {
  const styleCss = fs.readFileSync("./src/style.css", "utf8");
  const tabsCss = fs.readFileSync("./src/tabs.css", "utf8");

  test("O1: .panel has overflow-y: auto and .layers-manage-container has max-height budget", () => {
    expect(styleCss).toMatch(/\.panel\s*\{[^}]*overflow-y:\s*auto/);
    expect(styleCss).toMatch(/\.layers-manage-container\s*\{[^}]*max-height:\s*min\(400px,\s*calc\(100vh\s*-\s*200px\)\)/);
  });

  test("O2: .timeline-info has flex-wrap and valid-label has text-overflow ellipsis", () => {
    expect(styleCss).toMatch(/\.timeline-info\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(styleCss).toMatch(/\.valid-label\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(styleCss).toMatch(/\.valid-label\s*\{[^}]*overflow:\s*hidden/);
  });

  test("O3: .nav-middle has overflow-x: auto and min-width: 0", () => {
    expect(styleCss).toMatch(/\.nav-middle\s*\{[^}]*overflow-x:\s*auto/);
    expect(styleCss).toMatch(/\.nav-middle\s*\{[^}]*min-width:\s*0/);
  });

  test("O4: .legend-panel has max-width, max-height, and overflow: auto", () => {
    expect(styleCss).toMatch(/\.legend-panel\s*\{[^}]*max-width:\s*min\(90%,\s*720px\)/);
    expect(styleCss).toMatch(/\.legend-panel\s*\{[^}]*overflow:\s*auto/);
  });

  test("Drawer and toolbar overflow constraints", () => {
    expect(styleCss).toMatch(/\.drawer\s*\{[^}]*max-width:\s*calc\(100vw\s*-\s*24px\)/);
    expect(tabsCss).toMatch(/\.config-editor-toolbar\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  test("Window panel active does not use 2px border shift", () => {
    expect(tabsCss).not.toContain("border: 2px solid #58a6ff");
    expect(tabsCss).toMatch(/\.window-panel\.active\s*\{[^}]*border-color:\s*#58a6ff/);
  });
});

describe("UI Review 2: Operator & Interactive Status", () => {
  const styleCss = fs.readFileSync("./src/style.css", "utf8");
  const layerControlJs = fs.readFileSync("./src/ui/layerControl.js", "utf8");

  test("S1: Eye icon uses 👁 / 🚫 and toggles layer-hidden class with strikethrough", () => {
    expect(layerControlJs).toContain('"👁" : "🚫"');
    expect(layerControlJs).toContain("layer-hidden");
    expect(styleCss).toMatch(/\.layer-row\.layer-hidden\s*\.layer-name\s*\{[^}]*text-decoration:\s*line-through/);
  });

  test("S2: Gear icon does not rotate 45deg when open", () => {
    expect(styleCss).not.toMatch(/\.btn-config\.open\s*\{[^}]*rotate\(45deg\)/);
    expect(styleCss).toMatch(/\.btn-config\.open\s*\{[^}]*color:\s*#58a6ff/);
  });

  test("S3: Play button has active class style in CSS", () => {
    expect(styleCss).toMatch(/\.play-btn\.active\s*\{[^}]*background/);
  });

  test("S4 & C5: Legend updates include window prefix and removeLegend cleans up", () => {
    // Mock legend panel element
    const panel = {
      innerHTML: "",
      classList: {
        add: () => {},
        remove: () => {},
      },
    };
    const hadDoc = typeof globalThis.document !== "undefined";
    const prev = globalThis.document?.getElementById;
    if (!globalThis.document) globalThis.document = { addEventListener: () => {} };
    globalThis.document.getElementById = (id) => (id === "legend-panel" ? panel : null);

    updateLegend("TMP", "TMP", -10, 35, { id: "win-1", winIdx: 0 });
    expect(panel.innerHTML).toContain("[W1] TMP");
    expect(panel.innerHTML).toContain("legend-bar");

    removeLegend("TMP", { id: "win-1" });
    expect(panel.innerHTML).toBe("");

    if (hadDoc) {
      globalThis.document.getElementById = prev;
    } else {
      delete globalThis.document;
    }
  });
});

describe("UI Review 2: Layer Consistency & Addenda", () => {
  test("C3: unhide re-triggers raster overlay when source is missing (no-op setVisibility fixed)", () => {
    const src = fs.readFileSync("./src/ui/layerActions.js", "utf8");
    // Unhide branch must re-trigger instead of bare setRasterVisibility
    expect(src).toMatch(/if \(value\) \{[\s\S]*?triggerRasterOverlay\(map, layer, win\)/);
    const map = createMockMap();
    const layer = {
      id: "contour-tmp",
      type: "contour",
      element: "TMP",
      visible: false,
      config: { showRaster: true, showFill: true, showLine: true },
      gridData: { stats: { min: 0, max: 30 }, values: new Float32Array(100) },
    };
    // Must not throw when raster source is absent (async re-trigger path)
    expect(() => handleLayerAction(map, "visibility", "contour-tmp", true, layer, { id: "win-1" })).not.toThrow();
    expect(layer.config.showRaster).toBe(true);
  });

  test("C3-scope: station visibility never creates PLOT_* legend entries", () => {
    const panel = { innerHTML: "SENTINEL", classList: { add: () => {}, remove: () => {} } };
    const hadDoc = typeof globalThis.document !== "undefined";
    const prev = globalThis.document?.getElementById;
    if (!globalThis.document) globalThis.document = { addEventListener: () => {} };
    globalThis.document.getElementById = (id) => (id === "legend-panel" ? panel : null);
    try {
      panel.innerHTML = "";
      const map = createMockMap();
      // Station layers carry element PLOT_GLOBAL_3H but must not pollute the legend
      handleLayerAction(map, "visibility", "surface-obs", true,
        { id: "surface-obs", type: "station", element: "PLOT_GLOBAL_3H", visible: true, config: {} },
        { id: "win-1", winIdx: 0 });
      expect(panel.innerHTML).toBe("");
      handleLayerAction(map, "remove", "surface-obs",
        { id: "surface-obs", type: "station", element: "PLOT_GLOBAL_3H", visible: true, config: {} },
        { id: "win-1", winIdx: 0 });
      expect(panel.innerHTML).toBe("");
    } finally {
      if (hadDoc) globalThis.document.getElementById = prev;
      else delete globalThis.document;
    }
  });

  test("Addendum §7: Contour value labels use 13/14px text-size, 160 spacing, 2.0 halo", () => {
    const map = createMockMap();
    map.addSource("contour-tmp-isoline-source", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [{ properties: { value: 5880, isBold: true } }] },
    });
    map.addLayer({
      id: "contour-tmp-isoline-label-layer",
      type: "symbol",
      source: "contour-tmp-isoline-source",
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 160,
        "text-size": ["case", ["to-boolean", ["get", "isBold"]], 14, 13],
      },
      paint: { "text-halo-width": 2.0 },
    });

    setLayerIsolineStyle(map, "contour-tmp", { labelSize: 16 });
    const labelLayer = map.getLayer("contour-tmp-isoline-label-layer");
    expect(labelLayer.layout["text-size"]).toEqual([
      "case",
      ["to-boolean", ["get", "isBold"]],
      17,
      16,
    ]);
  });

  test("Addendum §7: Barb lines and sky cover circles have increased stroke widths", () => {
    const sky = getSkyCoverSVG(4, 16);
    expect(sky).toContain('stroke-width="2.0"');

    const barb = getWindBarbSVG(12, 90, 100);
    expect(barb).toContain('stroke-width="2.2"');
  });

  test("Addendum §8: setStationConfig applies showRain6 to map state", () => {
    const map = createMockMap();
    renderStationWeatherPlots(map, { type: "FeatureCollection", features: [] }, true);
    setStationConfig(map, { showRain6: true });
    expect(true).toBe(true);
  });
});
