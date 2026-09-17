// extract-qc.test.js - DTD Extract Math & QC Rules (§4, §5-J1) + Station Filter Evaluation (§5-J6)
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

describe("1. DTD Extract Math & QC Rules (§4, §5-J1)", () => {
  test("surface DTD extraction validates T - Td and enforces Q1-Q3", () => {
    const dtdExt = SURFACE_CONTOUR_CONFIGS.DTD.extract;

    // Normal extraction: T=25, Td=20 -> 5
    expect(dtdExt({ temperature: 25, dewpoint: 20 })).toBe(5);

    // Aliases support (TT, Td)
    expect(dtdExt({ TT: 30, TD: 22 })).toBe(8);

    // Missing Td -> null
    expect(dtdExt({ temperature: 25 })).toBeNull();
    // Missing T -> null
    expect(dtdExt({ dewpoint: 20 })).toBeNull();

    // Q1 bounds: T out of bounds [-90, 65] -> null
    expect(dtdExt({ temperature: 70, dewpoint: 20 })).toBeNull();
    expect(dtdExt({ temperature: -95, dewpoint: -98 })).toBeNull();
    // Td out of bounds [-90, 50] -> null
    expect(dtdExt({ temperature: 55, dewpoint: 52 })).toBeNull();

    // Q2: Supersaturation cap: allow rounding noise within 0.5 (clamped to 0), reject if Td > T + 0.5
    expect(dtdExt({ temperature: 20, dewpoint: 20.4 })).toBe(0);
    expect(dtdExt({ temperature: 20, dewpoint: 20.6 })).toBeNull();
    expect(dtdExt({ temperature: 20, dewpoint: 25 })).toBeNull();

    // Q3: Range cap: reject if DTD > 45
    expect(dtdExt({ temperature: 48, dewpoint: 0 })).toBeNull();
    // Valid boundary 45: T=45, Td=0 -> 45
    expect(dtdExt({ temperature: 45, dewpoint: 0 })).toBe(45);
    // Valid boundary 0: T=20, Td=20 -> 0
    expect(dtdExt({ temperature: 20, dewpoint: 20 })).toBe(0);
  });

  test("sounding DTD extraction enforces level-specific QC and Q1-Q3", () => {
    const dtdExt = SOUNDING_CONTOUR_CONFIGS.DTD.extract;

    // Normal extraction at 500 hPa
    expect(dtdExt({ temperature: -12.5, dewpoint: -20.0 }, 500)).toBe(7.5);

    // TMP_QC_BOUNDS[500] = [-60, 10]: T=-65 out of bounds -> null
    expect(dtdExt({ temperature: -65, dewpoint: -70 }, 500)).toBeNull();
    expect(dtdExt({ temperature: 15, dewpoint: 5 }, 500)).toBeNull();

    // Supersaturation cap (Q2): allow within 0.5, reject if Td > T + 0.5
    expect(dtdExt({ temperature: -10, dewpoint: -9.8 }, 500)).toBe(0);
    expect(dtdExt({ temperature: -10, dewpoint: -8 }, 500)).toBeNull();

    // Range cap (Q3): DTD > 45 -> null
    expect(dtdExt({ temperature: 0, dewpoint: -50 }, 500)).toBeNull();

    // Missing operands -> null
    expect(dtdExt({ temperature: -10 }, 500)).toBeNull();
    expect(dtdExt({ dewpoint: -20 }, 500)).toBeNull();
  });
});

describe("6. Station Filter Evaluation for DTD (§5-J6)", () => {
  test("getFieldValue extracts DTD accurately with Q1-Q3 enforcement", () => {
    // Normal case
    expect(getFieldValue({ temperature: 25, dewpoint: 20 }, "DTD")).toBe(5);
    // Boundary saturation DTD = 0
    expect(getFieldValue({ temperature: 18, dewpoint: 18 }, "DTD")).toBe(0);
    // Missing dewpoint -> null
    expect(getFieldValue({ temperature: 25 }, "DTD")).toBeNull();
    // Supersaturated Td > T + 0.5 -> null
    expect(getFieldValue({ temperature: 20, dewpoint: 22 }, "DTD")).toBeNull();
    // DTD > 45 -> null
    expect(getFieldValue({ temperature: 48, dewpoint: 0 }, "DTD")).toBeNull();
  });

  test("matchesStationFilters filters stations by DTD thresholds", () => {
    const dryStation = { temperature: 30, dewpoint: 12 }; // DTD = 18
    const moistStation = { temperature: 22, dewpoint: 21 }; // DTD = 1
    const frontalStation = { temperature: 26, dewpoint: 20 }; // DTD = 6

    // 1. DTD > 10 (Dry-outbreak stations)
    const ruleDry = { filterField1: "DTD", filterOp1: ">", filterVal1: "10" };
    expect(matchesStationFilters(dryStation, ruleDry)).toBe(true);
    expect(matchesStationFilters(moistStation, ruleDry)).toBe(false);
    expect(matchesStationFilters(frontalStation, ruleDry)).toBe(false);

    // 2. DTD < 2 (Saturated / fog stations)
    const ruleSaturated = { filterField1: "DTD", filterOp1: "<", filterVal1: "2" };
    expect(matchesStationFilters(moistStation, ruleSaturated)).toBe(true);
    expect(matchesStationFilters(dryStation, ruleSaturated)).toBe(false);

    // 3. DTD between 2..10 (Frontal transition zone)
    const ruleBetween = { filterField1: "DTD", filterOp1: "between", filterVal1: "2", filterVal2: "10" };
    expect(matchesStationFilters(frontalStation, ruleBetween)).toBe(true);
    expect(matchesStationFilters(dryStation, ruleBetween)).toBe(false);
    expect(matchesStationFilters(moistStation, ruleBetween)).toBe(false);
  });
});
