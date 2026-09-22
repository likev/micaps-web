// add-remove-actions.test.js - Runtime addContour and remove Actions with Preset Persistence
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

describe("Runtime addContour and remove Actions with Preset Persistence", () => {
  beforeEach(() => {
    CURRENT_CONFIG.presets = [
      {
        id: "composite-surface",
        layers: [
          { id: "surface-obs", model: "SURFACE", element: "PLOT_GLOBAL_3H", type: "station" },
          { id: "contour-surface-slp", model: "SURFACE", element: "SLP", type: "contour", derivedFrom: "surface-obs", render: { lineColor: "#58a6ff" } },
        ],
      },
    ];
  });

  test("handleLayerAction 'addContour' generates contour, sets derivedFrom, and persists to preset", async () => {
    const map = createMockMap();
    const win = {
      id: "test-win-derived",
      activeGroup: CURRENT_CONFIG.presets[0],
    };
    clearWindowWeatherLayers(win);

    const stns = createSampleSurfaceStations();
    const stnLayer = addOrUpdateLayer({
      id: "surface-obs",
      name: "Surface Station Observations",
      type: "station",
      model: "SURFACE",
      stationsGeoJSON: stns,
    }, win);

    // User clicks '＋ Add' for RAIN6
    handleLayerAction(map, "addContour", "surface-obs", "RAIN6", stnLayer, win);

    // Await dynamic import tick
    await new Promise((r) => setTimeout(r, 60));

    // Verify map layer was added
    expect(map.getLayer("contour-surface-rain6-isoline-layer")).not.toBeNull();

    // Verify window registry has derivedFrom marker
    const winLayers = getLayersForWindow(win);
    const rain6Layer = winLayers.find((l) => l.id === "contour-surface-rain6");
    expect(rain6Layer).toBeDefined();
    expect(rain6Layer.derivedFrom).toBe("surface-obs");
    expect(rain6Layer.element).toBe("RAIN6");

    // Verify activeGroup in CURRENT_CONFIG was updated
    const presetLayers = win.activeGroup.layers;
    const persistedRain6 = presetLayers.find((l) => l.element === "RAIN6");
    expect(persistedRain6).toBeDefined();
    expect(persistedRain6.derivedFrom).toBe("surface-obs");
    expect(persistedRain6.type).toBe("contour");
  });

  test("handleLayerAction 'remove' deletes derived contour from MapLibre, registry, and preset config", async () => {
    const map = createMockMap();
    const win = {
      id: "test-win-remove",
      activeGroup: CURRENT_CONFIG.presets[0],
    };
    clearWindowWeatherLayers(win);

    const stns = createSampleSurfaceStations();
    const stnLayer = addOrUpdateLayer({
      id: "surface-obs",
      name: "Surface Station Observations",
      type: "station",
      model: "SURFACE",
      stationsGeoJSON: stns,
    }, win);

    // First add VIS contour
    handleLayerAction(map, "addContour", "surface-obs", "VIS", stnLayer, win);
    await new Promise((r) => setTimeout(r, 60));

    const winLayers = getLayersForWindow(win);
    const visLayer = winLayers.find((l) => l.id === "contour-surface-vis");
    expect(visLayer).toBeDefined();
    expect(win.activeGroup.layers.some((l) => l.element === "VIS")).toBe(true);

    // Now remove it
    handleLayerAction(map, "remove", "contour-surface-vis", null, visLayer, win);

    // Verify removed from map
    expect(map.getLayer("contour-surface-vis-isoline-layer")).toBeUndefined();

    // Verify removed from preset config
    expect(win.activeGroup.layers.some((l) => l.element === "VIS")).toBe(false);
  });
});
