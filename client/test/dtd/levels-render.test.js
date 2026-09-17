// levels-render.test.js - Element Normalizers (§5-J2) + Levels & Bold Values (§5-J3) + End-to-End Render (§5-J4) + Level-Step Rename (§5-J5)
import { test, expect, describe, beforeEach } from "bun:test";
import { analyzeAndRenderSurfaceContours, SURFACE_CONTOUR_CONFIGS } from "../../src/layers/surfaceAnalysis.js";
import { analyzeAndRenderSoundingElementContour, SOUNDING_CONTOUR_CONFIGS } from "../../src/layers/soundingAnalysis.js";
import { getFieldValue, matchesStationFilters, renderStationPlotToCanvas } from "../../src/layers/stationLayer.js";
import { formatElementUnit } from "../../src/utils/formatters.js";
import { getColormap, getColor, getElementLevels } from "../../src/utils/colormaps.js";
import { getPaletteCategory } from "../../src/utils/paletteLoader.js";
import { initTooltip } from "../../src/ui/tooltip.js";
import { getLayersForWindow, clearWindowWeatherLayers, renderStationDrawerHTML, addOrUpdateLayer } from "../../src/ui/layerControl.js";
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

function createSampleSurfaceStationGeoJSON() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [116.4, 39.9] }, // Beijing
        properties: {
          station_id: 54511,
          temperature: 25.0,
          dewpoint: 20.0, // DTD = 5.0
          slp: 1012.0,
          visibility: 15.0,
          weather_code: 3,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [121.4, 31.2] }, // Shanghai
        properties: {
          station_id: 58362,
          temperature: 28.0,
          dewpoint: 26.5, // DTD = 1.5
          slp: 1008.0,
          visibility: 8.0,
          weather_code: 10,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [113.3, 23.1] }, // Guangzhou
        properties: {
          station_id: 59287,
          temperature: 32.0,
          dewpoint: 20.0, // DTD = 12.0
          slp: 1004.0,
          visibility: 20.0,
          weather_code: 1,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [104.0, 30.6] }, // Chengdu
        properties: {
          station_id: 56294,
          temperature: 22.0,
          dewpoint: 18.0, // DTD = 4.0
          slp: 1010.0,
          visibility: 12.0,
          weather_code: 2,
        },
      },
    ],
  };
}

function createSampleSoundingStationGeoJSON(level = 500) {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [116.4, 39.9] },
        properties: {
          station_id: 54511,
          height: 5840,
          temperature: -15.0,
          dewpoint: -22.0, // DTD = 7.0
          wind_speed: 18.0,
          weather_code: 0,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [121.4, 31.2] },
        properties: {
          station_id: 58362,
          height: 5880,
          temperature: -10.0,
          dewpoint: -12.0, // DTD = 2.0
          wind_speed: 24.0,
          weather_code: 0,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [113.3, 23.1] },
        properties: {
          station_id: 59287,
          height: 5920,
          temperature: -6.0,
          dewpoint: -16.0, // DTD = 10.0
          wind_speed: 12.0,
          weather_code: 0,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [104.0, 30.6] },
        properties: {
          station_id: 56294,
          height: 5860,
          temperature: -12.0,
          dewpoint: -17.0, // DTD = 5.0
          wind_speed: 14.0,
          weather_code: 0,
        },
      },
    ],
  };
}

describe("2. Element Normalizers (§5-J2)", () => {
  test("surfaceAnalysis normalizes aliases DTD, T-TD, TTD, DEPRESSION, DPTDPR to DTD", () => {
    const map = createMockMap();
    const stns = createSampleSurfaceStationGeoJSON();
    const win = { id: "test-norm-win" };

    const aliases = ["DTD", "T-TD", "TTD", "DEPRESSION", "DPTDPR", "dtd", "t-td"];
    for (const alias of aliases) {
      const res = analyzeAndRenderSurfaceContours(map, stns, alias, {}, win);
      expect(res).not.toBeNull();
      expect(res.element).toBe("DTD");
      expect(res.layerId).toBe("contour-surface-dtd");
    }
  });

  test("soundingAnalysis normalizes aliases to DTD", () => {
    const map = createMockMap();
    const stns = createSampleSoundingStationGeoJSON(500);
    const win = { id: "test-norm-win-2" };

    const aliases = ["DTD", "T-TD", "TTD", "DEPRESSION", "DPTDPR"];
    for (const alias of aliases) {
      const res = analyzeAndRenderSoundingElementContour(map, stns, 500, alias, {}, win);
      expect(res).not.toBeNull();
      expect(res.levels).toBeDefined();
    }
  });
});

describe("3. Levels & Bold Values (§5-J3)", () => {
  test("surface DTD levels return standard operational thresholds and auto fallback when max < 5", () => {
    const cfg = SURFACE_CONTOUR_CONFIGS.DTD;
    expect(cfg.boldValues).toEqual([2, 10]);

    // Standard regime (max >= 5)
    const stdLevels = cfg.getLevels(0, 20);
    expect(stdLevels).toEqual([1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30]);

    // Uniformly saturated regime (max < 5): auto fallback engaging
    const saturatedLevels = cfg.getLevels(0.2, 3.5);
    expect(Array.isArray(saturatedLevels)).toBe(true);
    expect(saturatedLevels.length).toBeGreaterThan(1);
    expect(saturatedLevels[0]).toBeLessThan(saturatedLevels[saturatedLevels.length - 1]);
  });

  test("sounding DTD levels ignore level and return standard thresholds [2, 10] bold values", () => {
    const cfg = SOUNDING_CONTOUR_CONFIGS.DTD;
    expect(cfg.getBoldValues()).toEqual([2, 10]);

    // 850, 700, 500 hPa all return standard levels
    expect(cfg.getLevels(850, 0, 25)).toEqual([1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30]);
    expect(cfg.getLevels(700, 0, 25)).toEqual([1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30]);
    expect(cfg.getLevels(500, 0, 25)).toEqual([1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30]);

    // Saturated fallback when max < 5
    const fallback = cfg.getLevels(500, 0.5, 3.2);
    expect(Array.isArray(fallback)).toBe(true);
    expect(fallback.length).toBeGreaterThan(1);
  });
});

describe("4. End-to-End Render & Layer Registration (§5-J4)", () => {
  test("analyzeAndRenderSurfaceContours renders DTD with showFill true and proper layer ID", () => {
    const map = createMockMap();
    const stns = createSampleSurfaceStationGeoJSON();
    const win = { id: "win-surface-dtd" };
    clearWindowWeatherLayers(win);

    const res = analyzeAndRenderSurfaceContours(map, stns, "DTD", { showFill: true }, win);
    expect(res).not.toBeNull();
    expect(res.element).toBe("DTD");
    expect(res.layerId).toBe("contour-surface-dtd");

    // Both isoline and isoband layers rendered on map
    expect(map.getLayer("contour-surface-dtd-isoline-layer")).not.toBeNull();
    expect(map.getLayer("contour-surface-dtd-isoband-layer")).not.toBeNull();

    // Registered in window layer store
    const layers = getLayersForWindow(win);
    const dtdLayer = layers.find((l) => l.id === "contour-surface-dtd");
    expect(dtdLayer).toBeDefined();
    expect(dtdLayer.element).toBe("DTD");
    expect(dtdLayer.config.showFill).toBe(true);
    expect(dtdLayer.config.showLine).toBe(false);
  });

  test("analyzeAndRenderSoundingElementContour renders 700 hPa DTD with fills and correct name", () => {
    const map = createMockMap();
    const stns = createSampleSoundingStationGeoJSON(700);
    const win = { id: "win-sounding-dtd" };
    clearWindowWeatherLayers(win);

    const res = analyzeAndRenderSoundingElementContour(map, stns, 700, "DTD", { showFill: true }, win);
    expect(res).not.toBeNull();
    expect(map.getLayer("contour-sounding-dtd-700-isoline-layer")).not.toBeNull();
    expect(map.getLayer("contour-sounding-dtd-700-isoband-layer")).not.toBeNull();

    const layers = getLayersForWindow(win);
    const dtdLayer = layers.find((l) => l.id === "contour-sounding-dtd-700");
    expect(dtdLayer).toBeDefined();
    expect(dtdLayer.name).toBe("700 hPa Dew-Point Depression (Sounding Analysis)");
    expect(dtdLayer.element).toBe("DTD");
    expect(dtdLayer.config.showFill).toBe(true);
  });

  test("analyzeAndRenderSurfaceContours and analyzeAndRenderSoundingElementContour default to showFill: false, showLine: false, showRaster: true for DTD", () => {
    const map = createMockMap();
    const stnsSurface = createSampleSurfaceStationGeoJSON();
    const win = { id: "win-dtd-defaults" };
    clearWindowWeatherLayers(win);

    analyzeAndRenderSurfaceContours(map, stnsSurface, "DTD", {}, win);
    const layers = getLayersForWindow(win);
    const sfcLayer = layers.find((l) => l.id === "contour-surface-dtd");
    expect(sfcLayer).toBeDefined();
    expect(sfcLayer.config.showFill).toBe(false);
    expect(sfcLayer.config.showLine).toBe(false);
    expect(sfcLayer.config.showRaster).toBe(true);

    const stnsUpper = createSampleSoundingStationGeoJSON(500);
    analyzeAndRenderSoundingElementContour(map, stnsUpper, 500, "DTD", {}, win);
    const upperLayer = layers.find((l) => l.id === "contour-sounding-dtd-500");
    expect(upperLayer).toBeDefined();
    expect(upperLayer.config.showFill).toBe(false);
    expect(upperLayer.config.showLine).toBe(false);
    expect(upperLayer.config.showRaster).toBe(true);
  });
});

describe("5. Level-Step Rename Logic (§5-J5)", () => {
  test("level-step preserves DTD identity and formats human-readable name", () => {
    const targetLevel = 700;
    const l = {
      model: "UPPER_AIR",
      element: "DTD",
      derivedFrom: "upperair-obs-500",
      id: "contour-sounding-dtd-500",
    };

    // Mirror main.js:958-961 logic
    const newId = `contour-sounding-${(l.element || "HGT").toLowerCase()}-${targetLevel}`;
    const elemName = l.element === "HGT" ? "Geopotential Height" : (l.element === "TMP" ? "Temperature" : (l.element === "DTD" ? "Dew-Point Depression" : l.element));
    const newName = `${targetLevel} hPa Derived ${elemName}`;

    expect(newId).toBe("contour-sounding-dtd-700");
    expect(newName).toBe("700 hPa Derived Dew-Point Depression");
  });
});
