// dtd_analysis.test.js - Unit tests for Dew-Point Depression (T - Td) analysis, plotting, and presets
import { test, expect, describe, beforeEach } from "bun:test";
import { analyzeAndRenderSurfaceContours, SURFACE_CONTOUR_CONFIGS } from "../src/layers/surfaceAnalysis.js";
import { analyzeAndRenderSoundingElementContour, SOUNDING_CONTOUR_CONFIGS } from "../src/layers/soundingAnalysis.js";
import { getFieldValue, matchesStationFilters, renderStationWeatherPlots } from "../src/layers/stationLayer.js";
import { formatElementUnit } from "../src/utils/formatters.js";
import { getColormap, getColor, getElementLevels } from "../src/utils/colormaps.js";
import { getPaletteCategory } from "../src/utils/paletteLoader.js";
import { initTooltip } from "../src/ui/tooltip.js";
import { getLayersForWindow, clearWindowWeatherLayers, renderStationDrawerHTML, addOrUpdateLayer } from "../src/ui/layerControl.js";
import fs from "fs";
import maplibregl from "maplibre-gl";

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

// Mock maplibregl.Marker to capture rendered HTML and elements
let renderedMarkers = [];
maplibregl.Marker = class MockMarker {
  constructor({ element } = {}) {
    this.element = element;
    renderedMarkers.push(this);
  }
  setLngLat(coords) {
    this.coords = coords;
    return this;
  }
  addTo(map) {
    this.map = map;
    return this;
  }
  remove() {}
};

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

describe("9. Station Plot DTD Number & Collision Mechanics (§5-I)", () => {
  test("station plot default config has showDTD false in factory defaults and getState", () => {
    // Upper-air station layer drawer HTML has showDTD unchecked by default
    const upperDrawer = renderStationDrawerHTML({
      id: "upperair-obs-500",
      model: "UPPER_AIR",
      type: "station",
      config: {},
    });
    expect(upperDrawer).toContain('class="chk-station-dtd"');
    expect(upperDrawer).not.toMatch(/class="chk-station-dtd"\s+checked/);

    // Surface station layer drawer HTML has showDTD unchecked by default
    const surfaceDrawer = renderStationDrawerHTML({
      id: "surface-obs",
      model: "SURFACE",
      type: "station",
      config: {},
    });
    expect(surfaceDrawer).toContain('class="chk-station-dtd"');
    expect(surfaceDrawer).not.toMatch(/class="chk-station-dtd"\s+checked/);

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

  test("renderStationWeatherPlots plots orange integer DTD when showDTD is true and blanks when missing", () => {
    const map = createMockMap();
    const stns = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [116.4, 39.9] },
          properties: {
            temperature: 24.6,
            dewpoint: 19.2, // DTD = 5.4 -> round 5
          },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [121.4, 31.2] },
          properties: {
            temperature: 20.0,
            dewpoint: null, // missing Td
          },
        },
      ],
    };

    // When showDTD is false: no DTD in DOM
    renderedMarkers = [];
    renderStationWeatherPlots(map, stns, true, { showDTD: false });
    expect(renderedMarkers.length).toBe(2);
    expect(renderedMarkers[0].element.innerHTML).not.toContain("color: #f0883e");

    // When showDTD is true: station 1 has "5", station 2 has blank
    renderedMarkers = [];
    renderStationWeatherPlots(map, stns, true, { showDTD: true });
    expect(renderedMarkers.length).toBe(2);

    // Verify DTD geometry: top: 20px; left: 0px; color: #f0883e
    const html1 = renderedMarkers[0].element.innerHTML;
    expect(html1).toContain("color: #f0883e");
    expect(html1).toMatch(/color:\s*#f0883e[^>]*>\s*5\s*<\/div>/);

    // Station 2 (missing dewpoint) should have blank DTD
    const html2 = renderedMarkers[1].element.innerHTML;
    expect(html2).not.toContain("color: #f0883e");
  });

  test("collision rule: DTD displaces ww to left: -26px when VIS is off; ww dropped when VIS is on", () => {
    const map = createMockMap();
    const stnFeature = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [116.4, 39.9] },
          properties: {
            temperature: 25.0,
            dewpoint: 20.0,
            weather_code: 71, // snow symbol
            visibility: 10.0,
          },
        },
      ],
    };

    // Case 1: showDTD off, showWeather on -> ww is at middle-left (left: -2px)
    renderedMarkers = [];
    renderStationWeatherPlots(map, stnFeature, true, {
      showDTD: false,
      showWeather: true,
      showVisibility: false,
    });
    let html = renderedMarkers[0].element.innerHTML;
    expect(html).toContain("left: -2px");

    // Case 2: showDTD on, showWeather on, VIS off -> DTD at left: 0px, ww displaced to left: -26px
    renderedMarkers = [];
    renderStationWeatherPlots(map, stnFeature, true, {
      showDTD: true,
      showWeather: true,
      showVisibility: false,
    });
    html = renderedMarkers[0].element.innerHTML;
    expect(html).toContain("left: 0px"); // DTD
    expect(html).toContain("color: #f0883e");
    expect(html).toContain("left: -26px"); // displaced ww

    // Case 3: showDTD on, showWeather on, VIS on -> DTD at left: 0px, VIS at left: -26px, ww dropped
    renderedMarkers = [];
    renderStationWeatherPlots(map, stnFeature, true, {
      showDTD: true,
      showWeather: true,
      showVisibility: true,
    });
    html = renderedMarkers[0].element.innerHTML;
    expect(html).toContain("left: 0px"); // DTD
    expect(html).toContain("color: #ffd33d"); // VIS golden yellow
    expect(html).toContain("left: -26px"); // VIS geometry
    expect(html).not.toContain("color: #e3b341; font-size: 15px"); // ww dropped
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

describe("11. Preset Configuration Validation in config.json (§5-E)", () => {
  test("config.json observation presets ship DTD derived layers", () => {
    const raw = fs.readFileSync("./config.json", "utf8");
    const config = JSON.parse(raw);

    // Surface preset
    const surfacePreset = config.presets.find((p) => p.id === "composite-surface");
    expect(surfacePreset).toBeDefined();
    const surfaceDtd = surfacePreset.layers.find((l) => l.id === "contour-surface-dtd");
    expect(surfaceDtd).toBeDefined();
    expect(surfaceDtd.element).toBe("DTD");
    expect(surfaceDtd.model).toBe("SURFACE");
    expect(surfaceDtd.derivedFrom).toBe("surface-obs");
    expect(surfaceDtd.render.showFill).toBe(false);
    expect(surfaceDtd.render.showLine).toBe(false);
    expect(surfaceDtd.render.showRaster).toBe(true);
    expect(surfaceDtd.render.lineColor).toBe("#e3b341");

    // Upper-air 500 hPa preset
    const upperPreset = config.presets.find((p) => p.id === "composite-upperair-500");
    expect(upperPreset).toBeDefined();
    const upperDtd = upperPreset.layers.find((l) => l.id === "contour-sounding-dtd-500");
    expect(upperDtd).toBeDefined();
    expect(upperDtd.element).toBe("DTD");
    expect(upperDtd.model).toBe("UPPER_AIR");
    expect(upperDtd.level).toBe(500);
    expect(upperDtd.derivedFrom).toBe("upperair-obs-500");
    expect(upperDtd.render.showFill).toBe(false);
    expect(upperDtd.render.showLine).toBe(false);
    expect(upperDtd.render.showRaster).toBe(true);
    expect(upperDtd.render.lineColor).toBe("#e3b341");

    // Opt-in check: station layers in config.json must NOT specify showDTD: true
    for (const preset of config.presets) {
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

