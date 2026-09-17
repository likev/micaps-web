// tooltip-units-palettes.test.js - Units & Legend Formatting (§5-J7) + Colormap & Palette (§3.3, §5-G) + Station Tooltip DTD Audit Row (§5-H)
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

describe("7. Units & Legend Formatting (§5-J7)", () => {
  test("formatElementUnit returns °C for DTD and backfills TD, SLP, VIS, RAIN6", () => {
    expect(formatElementUnit("DTD")).toBe("°C");
    expect(formatElementUnit("TD")).toBe("°C");
    expect(formatElementUnit("SLP")).toBe("hPa");
    expect(formatElementUnit("VIS")).toBe("km");
    expect(formatElementUnit("RAIN6")).toBe("mm");
    expect(formatElementUnit("TMP")).toBe("°C");
    expect(formatElementUnit("HGT")).toBe("gpm");
    expect(formatElementUnit("WIND")).toBe("m/s");
    expect(formatElementUnit("RH")).toBe("%");
  });
});

describe("8. Colormap & Palette Configuration (§3.3, §5-G)", () => {
  test("DTD colormap contains inverted moisture ramp and fixed physical scale", () => {
    const palette = getColormap("DTD");
    expect(Array.isArray(palette)).toBe(true);
    expect(palette.length).toBe(7);

    // 0: saturated blue [20, 90, 200]
    expect(palette[0].val).toBe(0);
    expect(palette[0].color.slice(0, 3)).toEqual([20, 90, 200]);

    // 30: dark dry red [140, 40, 30]
    expect(palette[6].val).toBe(30);
    expect(palette[6].color.slice(0, 3)).toEqual([140, 40, 30]);

    // Fixed physical scale clamps to bounds without dynamic stretching
    const col0 = getColor(0, "DTD");
    expect(col0.slice(0, 3)).toEqual([20, 90, 200]);

    const colLevels = getElementLevels("DTD");
    expect(colLevels).toEqual([1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30]);

    // Palette category maps to TMP
    expect(getPaletteCategory("DTD")).toBe("TMP");
  });
});

describe("10. Station Tooltip DTD Audit Row (§5-H)", () => {
  let tooltipEl;
  beforeEach(() => {
    mockElements.clear();
    tooltipEl = createMockElement("tooltip");
    initTooltip("tooltip");
  });

  test("tooltip displays DTD (T−Td) when TT and Td are valid and '--' when missing", () => {
    expect(tooltipEl).not.toBeNull();

    // Valid station observation: TT=24.5, Td=18.3 -> DTD = 6.2 °C
    window.__SHOW_TOOLTIP__([116.4, 39.9], {
      station_id: 54511,
      temperature: 24.5,
      dewpoint: 18.3,
    });

    expect(tooltipEl.innerHTML).toContain("DTD (T−Td):");
    expect(tooltipEl.innerHTML).toContain("6.2 °C");

    // Missing dewpoint observation
    window.__SHOW_TOOLTIP__([116.4, 39.9], {
      station_id: 54511,
      temperature: 24.5,
      dewpoint: -999, // missing sentinel
    });

    expect(tooltipEl.innerHTML).toContain("DTD (T−Td):");
    expect(tooltipEl.innerHTML).toContain("--");
  });
});
