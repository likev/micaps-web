// station-plot.test.js - Station Plot DTD Number & Collision Mechanics (§5-I)
import { test, expect, describe, beforeEach } from "bun:test";
import { analyzeAndRenderSurfaceContours, SURFACE_CONTOUR_CONFIGS } from "../../src/layers/surfaceAnalysis.js";
import { analyzeAndRenderSoundingElementContour, SOUNDING_CONTOUR_CONFIGS } from "../../src/layers/soundingAnalysis.js";
import { getFieldValue, matchesStationFilters, renderStationPlotToCanvas } from "../../src/layers/stationLayer.js";
import { formatElementUnit } from "../../src/utils/formatters.js";
import { getColormap, getColor, getElementLevels } from "../../src/utils/colormaps.js";
import { getPaletteCategory } from "../../src/utils/paletteLoader.js";
import { getLayersForWindow, clearWindowWeatherLayers, addOrUpdateLayer } from "../../src/ui/layerControl.js";
import { getPlotTokens } from "../../src/map/themeTokens.js";
import { readSrcText } from "../helpers/cssText.js";
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

describe("9. Station Plot DTD Number & Collision Mechanics (§5-I)", () => {
  test("station plot default config has showDTD false in factory defaults and getState", () => {
    // Live drawer is components/LayerRow.svelte (legacy HTML renderer removed):
    // the DTD toggle binds unchecked to an unset config value.
    const rowSrc = readSrcText("components/LayerRow.svelte");
    expect(rowSrc).toContain("showDTD");
    expect(rowSrc).toContain("T−Td");

    // Add layer factory defaults preserve showDTD: false
    const win = { id: "test-factory-win" };
    clearWindowWeatherLayers(win);
    addOrUpdateLayer({
      id: "test-stn",
      type: "station",
      model: "SURFACE",
    }, win);
    const stnLayer = getLayersForWindow(win).find((l) => l.type === "station");
    expect(stnLayer).toBeDefined();
    expect(stnLayer.config.showDTD).toBe(false);
  });

  test("renderStationPlotToCanvas plots orange integer DTD when showDTD is true and blanks when missing", () => {
    const dtdColor = getPlotTokens("dark").dtd.color;
    const p1 = { temperature: 24.6, dewpoint: 19.2 }; // DTD = 5.4 -> round 5
    const p2 = { temperature: 20.0, dewpoint: null }; // missing Td

    // When showDTD is false: no orange DTD text on canvas
    let ctx = createMockCtx();
    renderStationPlotToCanvas(ctx, p1, 100, 100, { showDTD: false }, 1.0);
    expect(ctx.texts.some((t) => t.text === "5" && t.fillStyle === dtdColor)).toBe(false);

    // When showDTD is true: station 1 draws "5" in orange at middle-left (cx-8, cy)
    ctx = createMockCtx();
    renderStationPlotToCanvas(ctx, p1, 100, 100, { showDTD: true }, 1.0);
    const dtd = ctx.texts.find((t) => t.text === "5" && t.fillStyle === dtdColor);
    expect(dtd).toBeDefined();
    expect(dtd.x).toBe(92);
    expect(dtd.y).toBe(100);

    // Station 2 (missing dewpoint) draws no orange DTD
    ctx = createMockCtx();
    renderStationPlotToCanvas(ctx, p2, 100, 100, { showDTD: true }, 1.0);
    expect(ctx.texts.some((t) => t.fillStyle === dtdColor)).toBe(false);
  });

  test("collision rule: DTD displaces ww to cx-22 when VIS is off; ww dropped when VIS is on", () => {
    const dtdColor = getPlotTokens("dark").dtd.color;
    const visColor = getPlotTokens("dark").vis.color;
    const props = {
      temperature: 25.0,
      dewpoint: 20.0, // DTD = 5
      weather_code: 71, // snow symbol "✶"
      visibility: 10.0, // canvas draws "10"
    };

    // Case 1: showDTD off, showWeather on -> ww at middle (cx-8 = 92)
    let ctx = createMockCtx();
    renderStationPlotToCanvas(ctx, props, 100, 100, {
      showDTD: false,
      showWeather: true,
      showVisibility: false,
    }, 1.0);
    let ww = ctx.texts.find((t) => t.text === "✶");
    expect(ww).toBeDefined();
    expect(ww.x).toBe(92);

    // Case 2: showDTD on, showWeather on, VIS off -> DTD at 92, ww displaced to 78
    ctx = createMockCtx();
    renderStationPlotToCanvas(ctx, props, 100, 100, {
      showDTD: true,
      showWeather: true,
      showVisibility: false,
    }, 1.0);
    const dtd = ctx.texts.find((t) => t.text === "5" && t.fillStyle === dtdColor);
    expect(dtd).toBeDefined();
    expect(dtd.x).toBe(92);
    ww = ctx.texts.find((t) => t.text === "✶");
    expect(ww).toBeDefined();
    expect(ww.x).toBe(78);

    // Case 3: showDTD on, showWeather on, VIS on -> DTD at 92, VIS at 78 in gold, ww dropped
    ctx = createMockCtx();
    renderStationPlotToCanvas(ctx, props, 100, 100, {
      showDTD: true,
      showWeather: true,
      showVisibility: true,
    }, 1.0);
    expect(ctx.texts.some((t) => t.text === "5" && t.fillStyle === dtdColor && t.x === 92)).toBe(true);
    const vis = ctx.texts.find((t) => t.fillStyle === visColor);
    expect(vis).toBeDefined();
    expect(vis.x).toBe(78);
    expect(ctx.texts.some((t) => t.text === "✶")).toBe(false);
  });
});
