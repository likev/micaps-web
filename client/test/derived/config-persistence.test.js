// config-persistence.test.js - Derived Layer Config Specification & Declared Presets
import { test, expect, describe, beforeEach } from "bun:test";
import fs from "fs";
import {
  CURRENT_CONFIG,
  upsertDerivedLayerToPreset,
  removeDerivedLayerFromPreset,
  autoSaveLayerConfig,
} from "../../src/config/presets.js";
import { handleLayerAction } from "../../src/ui/layerActions.js";
import { getLayersForWindow, clearWindowWeatherLayers, addOrUpdateLayer } from "../../src/ui/layerControl.js";
import { analyzeAndRenderSurfaceContours } from "../../src/layers/surfaceAnalysis.js";
import { analyzeAndRenderSoundingElementContour, SOUNDING_CONTOUR_CONFIGS } from "../../src/layers/soundingAnalysis.js";
import { generateStationWindGrid } from "../../src/layers/windLayer.js";

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
  };
}

function createSampleSurfaceStations() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [116.4, 39.9] },
        properties: { station_id: 54511, slp: 1012.5, visibility: 12.0, rain_6h: 0.0, temperature: 24.5 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [121.5, 31.2] },
        properties: { station_id: 58362, slp: 1008.2, visibility: 8.5, rain_6h: 12.4, temperature: 28.0 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [113.3, 23.1] },
        properties: { station_id: 59287, slp: 1004.5, visibility: 20.0, rain_6h: 35.8, temperature: 31.0 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [104.0, 30.6] },
        properties: { station_id: 56294, slp: 1014.0, visibility: 4.2, rain_6h: 5.2, temperature: 22.0 },
      },
    ],
  };
}

function createSampleSoundingStations(level = 500) {
  const hgtBase = level === 700 ? 3120 : (level === 850 ? 1520 : 5880);
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [116.4, 39.9] },
        properties: { station_id: 54511, height: hgtBase - 40, temperature: -14.5, dewpoint: -22.0, wind_speed: 18.5 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [121.4, 31.2] },
        properties: { station_id: 58362, height: hgtBase, temperature: -10.0, dewpoint: -15.5, wind_speed: 24.0 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [113.3, 23.1] },
        properties: { station_id: 59287, height: hgtBase + 40, temperature: -6.5, dewpoint: -11.0, wind_speed: 12.0 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [104.0, 30.6] },
        properties: { station_id: 56294, height: hgtBase - 20, temperature: -12.0, dewpoint: -18.0, wind_speed: 14.0 },
      },
    ],
  };
}

describe("Derived Layer Config Specification & Declared Presets", () => {
  test("config.json declares derived contour layers for surface and upper-air presets", () => {
    const raw = fs.readFileSync("./config.json", "utf8");
    const parsed = JSON.parse(raw);

    // Surface preset check
    const surfacePreset = parsed.presets.find((p) => p.id === "composite-surface");
    expect(surfacePreset).toBeDefined();
    const surfaceObs = surfacePreset.layers.find((l) => l.id === "surface-obs");
    expect(surfaceObs).toBeDefined();
    expect(surfaceObs.type).toBe("station");

    const surfaceDerivedSLP = surfacePreset.layers.find((l) => l.id === "contour-surface-slp");
    expect(surfaceDerivedSLP).toBeDefined();
    expect(surfaceDerivedSLP.type).toBe("contour");
    expect(surfaceDerivedSLP.model).toBe("SURFACE");
    expect(surfaceDerivedSLP.element).toBe("SLP");
    expect(surfaceDerivedSLP.derivedFrom).toBe("surface-obs");
    expect(surfaceDerivedSLP.render.showLine).toBe(true);
    expect(surfaceDerivedSLP.render.showFill).toBe(false);

    // Upper-air preset check
    const upperPreset = parsed.presets.find((p) => p.id === "composite-upperair-500");
    expect(upperPreset).toBeDefined();
    const upperObs = upperPreset.layers.find((l) => l.id === "upperair-obs-500");
    expect(upperObs).toBeDefined();
    expect(upperObs.type).toBe("station");

    const upperDerivedHGT = upperPreset.layers.find((l) => l.id === "contour-sounding-hgt-500");
    expect(upperDerivedHGT).toBeDefined();
    expect(upperDerivedHGT.type).toBe("contour");
    expect(upperDerivedHGT.element).toBe("HGT");
    expect(upperDerivedHGT.level).toBe(500);
    expect(upperDerivedHGT.derivedFrom).toBe("upperair-obs-500");

    const upperDerivedTMP = upperPreset.layers.find((l) => l.id === "contour-sounding-tmp-500");
    expect(upperDerivedTMP).toBeDefined();
    expect(upperDerivedTMP.type).toBe("contour");
    expect(upperDerivedTMP.element).toBe("TMP");
    expect(upperDerivedTMP.level).toBe(500);
    expect(upperDerivedTMP.derivedFrom).toBe("upperair-obs-500");
  });

  test("upsertDerivedLayerToPreset adds and updates derived layers in in-memory config", () => {
    CURRENT_CONFIG.presets = [
      {
        id: "composite-surface",
        layers: [
          { id: "surface-obs", model: "SURFACE", element: "PLOT_GLOBAL_3H", type: "station" },
          { id: "contour-surface-slp", model: "SURFACE", element: "SLP", type: "contour", derivedFrom: "surface-obs", render: { lineColor: "#58a6ff" } },
        ],
      },
    ];

    // 1. Add new derived layer: VIS
    upsertDerivedLayerToPreset("composite-surface", {
      id: "contour-surface-vis",
      model: "SURFACE",
      element: "VIS",
      name: "Surface Derived Visibility",
      type: "contour",
      derivedFrom: "surface-obs",
      render: { showFill: false, showLine: true, lineColor: "#e3b341" },
    });

    const preset = CURRENT_CONFIG.presets[0];
    expect(preset.layers.length).toBe(3);
    const visLayer = preset.layers.find((l) => l.element === "VIS");
    expect(visLayer).toBeDefined();
    expect(visLayer.derivedFrom).toBe("surface-obs");
    expect(visLayer.render.lineColor).toBe("#e3b341");

    // 2. Upsert existing layer: update render config
    upsertDerivedLayerToPreset("composite-surface", {
      id: "contour-surface-vis",
      model: "SURFACE",
      element: "VIS",
      render: { lineWidth: 3.5 },
    });

    expect(preset.layers.length).toBe(3); // Not duplicated
    expect(visLayer.render.lineWidth).toBe(3.5);
    expect(visLayer.render.lineColor).toBe("#e3b341"); // preserved
  });

  test("removeDerivedLayerFromPreset deletes derived layer by id or element", () => {
    CURRENT_CONFIG.presets = [
      {
        id: "composite-surface",
        layers: [
          { id: "surface-obs", model: "SURFACE", element: "PLOT_GLOBAL_3H", type: "station" },
          { id: "contour-surface-slp", model: "SURFACE", element: "SLP", type: "contour", derivedFrom: "surface-obs" },
          { id: "contour-surface-vis", model: "SURFACE", element: "VIS", type: "contour", derivedFrom: "surface-obs" },
        ],
      },
    ];

    removeDerivedLayerFromPreset("composite-surface", { id: "contour-surface-vis" });
    const preset = CURRENT_CONFIG.presets[0];
    expect(preset.layers.length).toBe(2);
    expect(preset.layers.find((l) => l.element === "VIS")).toBeUndefined();

    // Verify removing non-derived station layer is rejected
    removeDerivedLayerFromPreset("composite-surface", { id: "surface-obs" });
    expect(preset.layers.length).toBe(2);
  });

  test("autoSaveLayerConfig matches derived layers across vertical levels", () => {
    CURRENT_CONFIG.presets = [
      {
        id: "composite-upperair-500",
        hasLevel: true,
        defaultLevel: 500,
        layers: [
          { id: "upperair-obs-500", model: "UPPER_AIR", element: "PLOT", level: 500, type: "station" },
          { id: "contour-sounding-hgt-500", model: "UPPER_AIR", element: "HGT", level: 500, type: "contour", derivedFrom: "upperair-obs-500", render: { lineColor: "#58a6ff" } },
        ],
      },
    ];

    // User is viewing 700 hPa and tweaks line color
    autoSaveLayerConfig({
      id: "contour-sounding-hgt-700",
      model: "UPPER_AIR",
      element: "HGT",
      level: 700,
      derivedFrom: "upperair-obs-500",
      config: {
        lineColor: "#00ff00",
        lineWidth: 3.0,
      },
    });

    const hgtEntry = CURRENT_CONFIG.presets[0].layers[1];
    expect(hgtEntry.render.lineColor).toBe("#00ff00");
    expect(hgtEntry.render.lineWidth).toBe(3.0);
  });
});
