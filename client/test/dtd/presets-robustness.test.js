// presets-robustness.test.js - Preset Configuration Validation (§5-E) + Robust Domain Bounding & Grid Dimension Guard (§5-§12)
import { test, expect, describe, beforeEach } from "bun:test";
import { analyzeAndRenderSurfaceContours, SURFACE_CONTOUR_CONFIGS } from "../../src/layers/surfaceAnalysis.js";
import { analyzeAndRenderSoundingElementContour, SOUNDING_CONTOUR_CONFIGS } from "../../src/layers/soundingAnalysis.js";
import { getFieldValue, matchesStationFilters, renderStationPlotToCanvas } from "../../src/layers/stationLayer.js";
import { formatElementUnit } from "../../src/utils/formatters.js";
import { getColormap, getColor, getElementLevels } from "../../src/utils/colormaps.js";
import { getPaletteCategory } from "../../src/utils/paletteLoader.js";
import { getLayersForWindow, clearWindowWeatherLayers, addOrUpdateLayer } from "../../src/ui/layerControl.js";
import fs from "fs";

// Recording Canvas 2D context: captures fillText with active fillStyle for color assertions
function createMockCtx() {
  const texts = [];
  return {
    texts,
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    stroke() {},
    fill() {},
    setLineDash() {},
    setTransform() {},
    clearRect() {},
    strokeText() {},
    fillText(text, x, y) {
      texts.push({ text, x, y, fillStyle: this.fillStyle, font: this.font });
    },
  };
}

// Setup minimal DOM for test environment
const mockElements = new Map();
function createMockElement(id = "", cls = "", tag = "div") {
  const classes = new Set(cls ? cls.split(" ").filter(Boolean) : []);
  const el = {
    id,
    tagName: tag.toUpperCase(),
    style: {},
    classList: {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      contains: (n) => classes.has(n),
    },
    innerHTML: "",
    appendChild: () => {},
    setAttribute: () => {},
    getAttribute: () => null,
    hasAttribute: () => false,
    addEventListener: () => {},
    removeEventListener: () => {},
    remove: () => {},
  };
  if (id) mockElements.set(id, el);
  return el;
}

if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}
if (typeof globalThis.document === "undefined") {
  globalThis.document = {};
}
globalThis.document.createElement = (tag) => createMockElement("", "", tag);
globalThis.document.getElementById = (id) => mockElements.get(id) || null;
globalThis.document.body = createMockElement("body");

function createMockMap() {
  const sources = new Map();
  const layers = new Map();
  const listeners = new Map();
  return {
    sources,
    layers,
    getSource(id) {
      if (!sources.has(id)) return null;
      return {
        _data: sources.get(id),
        setData(d) {
          sources.set(id, d);
          this._data = d;
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
      layers.set(layerDef.id, layerDef);
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
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
    },
    off(event, fn) {
      if (!listeners.has(event)) return;
      const arr = listeners.get(event).filter((f) => f !== fn);
      listeners.set(event, arr);
    },
    getBounds: () => ({
      getWest: () => 60,
      getEast: () => 145,
      getSouth: () => 10,
      getNorth: () => 60,
    }),
    getZoom: () => 5,
    project: ([lon, lat]) => ({ x: (lon - 60) * 10, y: (60 - lat) * 10 }),
  };
}

describe("11. Preset Configuration Validation in config.json (§5-E)", () => {
  test("config.json observation presets declare station + derived layers (DTD is runtime-added)", () => {
    const raw = fs.readFileSync("./config.json", "utf8");
    const config = JSON.parse(raw);

    // Surface preset ships station plots plus SLP / RAIN6 derived contours.
    // DTD is NOT pre-declared: operators add it at runtime via addContour
    // (see SURFACE_CONFIGS.DTD defaults: showFill false, showLine false,
    // showRaster true, defaultColor #e3b341).
    const surfacePreset = config.presets.find((p) => p.id === "composite-surface");
    expect(surfacePreset).toBeDefined();
    const surfaceObs = surfacePreset.layers.find((l) => l.id === "surface-obs");
    expect(surfaceObs).toBeDefined();
    expect(surfaceObs.type).toBe("station");
    const surfaceSlp = surfacePreset.layers.find((l) => l.id === "contour-surface-slp");
    expect(surfaceSlp).toBeDefined();
    expect(surfaceSlp.element).toBe("SLP");
    expect(surfaceSlp.model).toBe("SURFACE");
    expect(surfaceSlp.derivedFrom).toBe("surface-obs");
    expect(surfaceSlp.render.showLine).toBe(true);
    expect(surfaceSlp.render.showFill).toBe(false);
    const surfaceRain6 = surfacePreset.layers.find((l) => l.id === "contour-surface-rain6");
    expect(surfaceRain6).toBeDefined();
    expect(surfaceRain6.element).toBe("RAIN6");
    expect(surfaceRain6.derivedFrom).toBe("surface-obs");
    expect(surfacePreset.layers.find((l) => l.id === "contour-surface-dtd")).toBeUndefined();

    // Upper-air 500 hPa preset ships bare station plots only; HGT / TMP /
    // DTD derived contours are runtime-added, never pre-declared.
    const upperPreset = config.presets.find((p) => p.id === "composite-upperair-500");
    expect(upperPreset).toBeDefined();
    const upperObs = upperPreset.layers.find((l) => l.id === "upperair-obs-500");
    expect(upperObs).toBeDefined();
    expect(upperObs.type).toBe("station");
    expect(upperPreset.layers.find((l) => l.id === "contour-sounding-dtd-500")).toBeUndefined();
    expect(upperPreset.layers.filter((l) => l.type === "contour").length).toBe(0);

    // Opt-in check: station layers in config.json must NOT specify showDTD: true.
    // Divider entries carry no layers array, so guard before iterating.
    for (const preset of config.presets) {
      if (!Array.isArray(preset.layers)) continue;
      for (const layer of preset.layers) {
        if (layer.type === "station") {
          expect(layer.render?.showDTD).toBeUndefined();
        }
      }
    }
  });
});

describe("12. Robust Domain Bounding & Grid Dimension Guard", () => {
  test("stations outside East Asia (North America, Europe, Arctic) compute contours without Z array errors", () => {
    const map = createMockMap();
    const win = { id: "win-na-sounding" };
    clearWindowWeatherLayers(win);

    // North America soundings (lon ~ -108..-80, lat ~ 25..39)
    const naSoundings = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { coordinates: [-108.5, 39.1] }, properties: { height: 5880, temperature: -12, dewpoint: -20 } },
        { type: "Feature", geometry: { coordinates: [-95.3, 29.7] }, properties: { height: 5890, temperature: -10, dewpoint: -18 } },
        { type: "Feature", geometry: { coordinates: [-80.2, 25.8] }, properties: { height: 5900, temperature: -8, dewpoint: -15 } },
      ],
    };

    // Should NOT throw "Z must be a 2D array [[z00, z01...]] or an object { data, rows, cols }"
    expect(() => {
      const res = analyzeAndRenderSoundingElementContour(map, naSoundings, 500, "DTD", { showFill: true }, win);
      expect(res).not.toBeNull();
      expect(res.lines.length).toBeGreaterThan(0);
    }).not.toThrow();

    // Europe soundings (lon ~ 2..21, lat ~ 48..52)
    const euSoundings = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { coordinates: [2.3, 48.8] }, properties: { height: 5880, temperature: -12, dewpoint: -20 } },
        { type: "Feature", geometry: { coordinates: [13.4, 52.5] }, properties: { height: 5890, temperature: -10, dewpoint: -18 } },
        { type: "Feature", geometry: { coordinates: [21.0, 52.2] }, properties: { height: 5900, temperature: -8, dewpoint: -15 } },
      ],
    };
    expect(() => {
      const res = analyzeAndRenderSoundingElementContour(map, euSoundings, 500, "HGT", { showFill: false }, win);
      expect(res).not.toBeNull();
      expect(res.lines.length).toBeGreaterThan(0);
    }).not.toThrow();
  });

  test("degenerate station coordinates or insufficient grid resolution returns null safely without throwing", () => {
    const map = createMockMap();
    const win = { id: "win-degenerate" };
    clearWindowWeatherLayers(win);

    // 3 stations with identical coordinates (0 span)
    const identicalStations = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { coordinates: [116.4, 39.9] }, properties: { height: 5880, temperature: -12, dewpoint: -20 } },
        { type: "Feature", geometry: { coordinates: [116.4, 39.9] }, properties: { height: 5885, temperature: -12, dewpoint: -20 } },
        { type: "Feature", geometry: { coordinates: [116.4, 39.9] }, properties: { height: 5890, temperature: -12, dewpoint: -20 } },
      ],
    };

    expect(() => {
      const res = analyzeAndRenderSoundingElementContour(map, identicalStations, 500, "DTD", {}, win);
      // Either produces contours or safely returns null, never throws
    }).not.toThrow();

    // Features with invalid / non-finite coordinates are ignored
    const malformedStations = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { coordinates: [null, NaN] }, properties: { height: 5880, temperature: -12, dewpoint: -20 } },
        { type: "Feature", geometry: null, properties: { height: 5885, temperature: -12, dewpoint: -20 } },
        { type: "Feature", geometry: { coordinates: [116.4, 39.9] }, properties: { height: 5890, temperature: -12, dewpoint: -20 } },
      ],
    };

    expect(() => {
      const res = analyzeAndRenderSoundingElementContour(map, malformedStations, 500, "DTD", {}, win);
      expect(res).toBeNull(); // Less than 3 valid points
    }).not.toThrow();
  });
});
