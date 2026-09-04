// derived_layers.test.js - Unit tests for derived contour layer configuration, loaders, and persistence
import { test, expect, describe, beforeEach } from "bun:test";
import fs from "fs";
import {
  CURRENT_CONFIG,
  upsertDerivedLayerToPreset,
  removeDerivedLayerFromPreset,
  autoSaveLayerConfig,
} from "../src/config/presets.js";
import { handleLayerAction } from "../src/ui/layerActions.js";
import { getLayersForWindow, clearWindowWeatherLayers, addOrUpdateLayer, renderStationDrawerHTML } from "../src/ui/layerControl.js";
import { analyzeAndRenderSurfaceContours } from "../src/layers/surfaceAnalysis.js";
import { analyzeAndRenderSoundingElementContour } from "../src/layers/soundingAnalysis.js";

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
  test("public/config.json declares derived contour layers for surface and upper-air presets", () => {
    const raw = fs.readFileSync("./public/config.json", "utf8");
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

describe("Station Config Drawer HTML Layout (Review 1 Fix)", () => {
  test("renderStationDrawerHTML properly closes config-grid-2col before contour selector row with strict tag balance", () => {
    const layer = {
      id: "surface-obs",
      name: "Surface Station Observations",
      type: "station",
      model: "SURFACE",
      config: { showTemp: true, showStreamlines: false },
    };

    const html = renderStationDrawerHTML(layer);

    // Verify grid starts
    const gridStart = html.indexOf('<div class="config-grid-2col">');
    expect(gridStart).toBeGreaterThan(-1);

    // Verify selector row starts
    const selectorRowPos = html.indexOf('<div class="config-row station-contour-selector-row');
    expect(selectorRowPos).toBeGreaterThan(-1);

    // Verify tag balance: exactly 1 opening <div> and 1 closing </div> in chunk before selector row
    const chunkBeforeSelector = html.slice(gridStart, selectorRowPos);
    const opens = (chunkBeforeSelector.match(/<div\b/g) || []).length;
    const closes = (chunkBeforeSelector.match(/<\/div>/g) || []).length;
    expect(opens).toBe(1);
    expect(closes).toBe(1);

    // Verify labels are not truncated (shortened to Pressure (SLP), Tendency (ppa))
    expect(html).toContain("Pressure (SLP)");
    expect(html).toContain("Tendency (ppa)");
    expect(html).toContain("Weather (ww)");
    expect(html).toContain('title="Pressure (SLP)"');
    expect(html).not.toContain('title="Sea Level Pressure (SLP)"');
  });
});

describe("Derived Contour Visibility Persistence & Level Step Invariance (Review 2 Fixes)", () => {
  test("hidden derived contours remain hidden after re-derivation (visible: false preserved on MapLibre and registry)", () => {
    const map = createMockMap();
    const win = { id: "test-win-visibility" };
    clearWindowWeatherLayers(win);

    const stns = createSampleSurfaceStations();

    // 1. Render visible contour first
    analyzeAndRenderSurfaceContours(map, stns, "SLP", {
      layerId: "contour-surface-slp",
      visible: true,
    }, win);

    const isolineLayer = map.getLayer("contour-surface-slp-isoline-layer");
    expect(isolineLayer).toBeDefined();
    expect(isolineLayer.layout?.visibility).toBe("visible");

    let winLayers = getLayersForWindow(win);
    let slpLayer = winLayers.find((l) => l.id === "contour-surface-slp");
    expect(slpLayer.visible).toBe(true);

    // 2. User toggles eye icon to hide layer
    handleLayerAction(map, "visibility", "contour-surface-slp", false, slpLayer, win);
    expect(map.getLayer("contour-surface-slp-isoline-layer").layout?.visibility).toBe("none");

    // 3. Snapshot simulating obs time step
    const snapshot = {
      id: slpLayer.id,
      model: slpLayer.model,
      element: slpLayer.element,
      config: { ...(slpLayer.config || {}) },
      visible: false, // User hid it
    };

    // 4. Re-derive at next time step passing snapshot's visible: false
    analyzeAndRenderSurfaceContours(map, stns, snapshot.element, {
      ...snapshot.config,
      layerId: snapshot.id,
      visible: snapshot.visible,
    }, win);

    // Verify MapLibre isolines remain hidden ("none")
    expect(map.getLayer("contour-surface-slp-isoline-layer").layout?.visibility).toBe("none");

    // Verify registry maintains visible: false
    winLayers = getLayersForWindow(win);
    slpLayer = winLayers.find((l) => l.id === "contour-surface-slp");
    expect(slpLayer.visible).toBe(false);
  });

  test("upper-air contours snapshot preserves user-added elements and updates level & id across vertical levels", () => {
    const map = createMockMap();
    const win = { id: "test-win-levels", level: 500 };
    clearWindowWeatherLayers(win);

    const soundings = createSampleSoundingStations();

    // 1. Initial 500hPa state with HGT and added TD
    analyzeAndRenderSoundingElementContour(map, soundings, 500, "HGT", {
      layerId: "contour-sounding-hgt-500",
      visible: true,
    }, win);

    analyzeAndRenderSoundingElementContour(map, soundings, 500, "TD", {
      layerId: "contour-sounding-td-500",
      visible: false, // User had hidden TD
    }, win);

    const initialLayers = getLayersForWindow(win).filter((l) => l.type === "contour" && l.model === "UPPER_AIR");
    expect(initialLayers.length).toBe(2);

    // 2. Snapshot across level change to 700 hPa
    const targetLevel = 700;
    const snapshots = initialLayers.map((l) => ({
      id: `contour-sounding-${(l.element || "HGT").toLowerCase()}-${targetLevel}`,
      model: l.model,
      element: l.element,
      level: targetLevel,
      config: { ...(l.config || {}) },
      derivedFrom: l.derivedFrom,
      visible: l.visible !== false,
    }));
    win.derivedContourSnapshots = snapshots;

    // Simulate level change clear
    clearWindowWeatherLayers(win);
    expect(getLayersForWindow(win).filter((l) => l.type === "contour").length).toBe(0);

    // 3. Re-derive from snapshots at 700 hPa with 700 hPa sounding observations
    const soundings700 = createSampleSoundingStations(700);
    for (const snap of win.derivedContourSnapshots) {
      analyzeAndRenderSoundingElementContour(map, soundings700, targetLevel, snap.element, {
        ...snap.config,
        layerId: snap.id,
        visible: snap.visible,
      }, win);
    }
    win.derivedContourSnapshots = null;

    // 4. Verify both HGT and TD contours exist at 700hPa with correct IDs and visibility
    const newLayers = getLayersForWindow(win).filter((l) => l.type === "contour" && l.model === "UPPER_AIR");
    expect(newLayers.length).toBe(2);

    const hgt700 = newLayers.find((l) => l.element === "HGT");
    expect(hgt700).toBeDefined();
    expect(hgt700.id).toBe("contour-sounding-hgt-700");
    expect(hgt700.level).toBe(700);
    expect(hgt700.visible).toBe(true);

    const td700 = newLayers.find((l) => l.element === "TD");
    expect(td700).toBeDefined();
    expect(td700.id).toBe("contour-sounding-td-700");
    expect(td700.level).toBe(700);
    expect(td700.visible).toBe(false); // Visibility preserved as false!
  });

  test("model filtering ensures SURFACE and UPPER_AIR derived contours are not mixed", () => {
    const mixedLayers = [
      { id: "contour-surface-slp", model: "SURFACE", element: "SLP", derivedFrom: "surface-obs" },
      { id: "contour-sounding-hgt-500", model: "UPPER_AIR", element: "HGT", derivedFrom: "upperair-obs-500" },
      { id: "contour-sounding-tmp-500", model: "UPPER_AIR", element: "TMP", derivedFrom: "upperair-obs-500" },
    ];

    const surfaceDerived = mixedLayers.filter((l) => l.type !== "station" && l.model === "SURFACE" && Boolean(l.derivedFrom));
    const upperDerived = mixedLayers.filter((l) => l.type !== "station" && l.model === "UPPER_AIR" && Boolean(l.derivedFrom));

    expect(surfaceDerived.length).toBe(1);
    expect(surfaceDerived[0].element).toBe("SLP");

    expect(upperDerived.length).toBe(2);
    expect(upperDerived.map((l) => l.element)).toEqual(["HGT", "TMP"]);
  });
});
