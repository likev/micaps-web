// vorticity_divergence.test.js - Acceptance tests for Vorticity & Divergence Derived Contours (§7 T3)
import { test, expect, describe, beforeEach } from "bun:test";
import fs from "fs";
import {
  computeVortDiv,
  buildKinematicGridData,
  EARTH_RADIUS,
  VOR_LEVELS,
  DIV_LEVELS,
  VOR_BOLD,
  DIV_BOLD,
  VOR_COLOR,
  DIV_COLOR,
} from "../../src/layers/kinematics.js";
import {
  analyzeAndRenderSurfaceContours,
  analyzeAndRenderSurfaceKinematicContours,
  SURFACE_CONTOUR_CONFIGS,
} from "../../src/layers/surfaceAnalysis.js";
import {
  analyzeAndRenderSoundingElementContour,
  analyzeAndRenderSoundingKinematicContour,
  SOUNDING_CONTOUR_CONFIGS,
} from "../../src/layers/soundingAnalysis.js";
import { formatElementUnit, formatContourLabel } from "../../src/utils/formatters.js";
import { getColormap, getElementLevels } from "../../src/utils/colormaps.js";
import { getPaletteCategory } from "../../src/utils/paletteLoader.js";
import {
  renderStationDrawerHTML,
  renderWindDrawerHTML,
  getLayersForWindow,
  clearWindowWeatherLayers,
  addOrUpdateLayer,
  removeLayer,
} from "../../src/ui/layerControl.js";
import { handleLayerAction, triggerVortDivOverlay, triggerIsobandOverlay } from "../../src/ui/layerActions.js";
import { armContourReRender } from "../../src/services/contourReRender.js";
import { prefetchSurroundingData } from "../../src/services/prefetchService.js";

// Mock Map implementation for headless testing
function createMockMap() {
  const sources = new Map();
  const layers = new Map();
  return {
    sources,
    layers,
    on: () => {},
    off: () => {},
    once: () => {},
    isStyleLoaded: () => true,
    loaded: () => true,
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
    getLayer: (id) => layers.get(id) || null,
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
    getBounds: () => ({
      toArray: () => [[60, 10], [145, 60]],
    }),
    getContainer: () => ({
      querySelector: () => null,
      appendChild: () => {},
      getBoundingClientRect: () => ({ width: 800, height: 600 }),
    }),
  };
}

describe("T3: Surface Kinematic Adapter & Station Extraction (§7-T3)", () => {
  test("4-station surface cyclonic swirl generates non-null contour-surface-vor layer", () => {
    const map = createMockMap();
    const win = { id: "test-win-surface-vor" };
    clearWindowWeatherLayers(win);

    // 4 stations positioned around (116.0, 35.0) with cyclonic wind pattern
    const cyclonicObs = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [116.0, 37.0] }, properties: { station_id: 1, wind_speed: 15, wind_dir: 90 } }, // North station: East wind
        { type: "Feature", geometry: { type: "Point", coordinates: [118.0, 35.0] }, properties: { station_id: 2, wind_speed: 15, wind_dir: 180 } }, // East station: South wind
        { type: "Feature", geometry: { type: "Point", coordinates: [116.0, 33.0] }, properties: { station_id: 3, wind_speed: 15, wind_dir: 270 } }, // South station: West wind
        { type: "Feature", geometry: { type: "Point", coordinates: [114.0, 35.0] }, properties: { station_id: 4, wind_speed: 15, wind_dir: 360 } }, // West station: North wind
      ],
    };

    const res = analyzeAndRenderSurfaceKinematicContours(map, cyclonicObs, "VOR", {}, win);
    expect(res).not.toBeNull();
    expect(res.layerId).toBe("contour-surface-vor");
    expect(res.element).toBe("VOR");

    const winLayers = getLayersForWindow(win);
    const vorLayer = winLayers.find((l) => l.id === "contour-surface-vor");
    expect(vorLayer).toBeDefined();
    expect(vorLayer.type).toBe("contour");
    expect(vorLayer.element).toBe("VOR");
    expect(vorLayer.model).toBe("SURFACE");
    expect(vorLayer.color).toBe(VOR_COLOR);
    expect(vorLayer.config.showLine).toBe(true);
    expect(vorLayer.config.showFill).toBe(false);
  });

  test("4-station surface divergent pattern generates non-null contour-surface-div layer", () => {
    const map = createMockMap();
    const win = { id: "test-win-surface-div" };
    clearWindowWeatherLayers(win);

    const divergentObs = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [116.0, 37.0] }, properties: { station_id: 1, wind_speed: 15, wind_dir: 360 } }, // North station: blowing North
        { type: "Feature", geometry: { type: "Point", coordinates: [118.0, 35.0] }, properties: { station_id: 2, wind_speed: 15, wind_dir: 90 } }, // East station: blowing East
        { type: "Feature", geometry: { type: "Point", coordinates: [116.0, 33.0] }, properties: { station_id: 3, wind_speed: 15, wind_dir: 180 } }, // South station: blowing South
        { type: "Feature", geometry: { type: "Point", coordinates: [114.0, 35.0] }, properties: { station_id: 4, wind_speed: 15, wind_dir: 270 } }, // West station: blowing West
      ],
    };

    const res = analyzeAndRenderSurfaceContours(map, divergentObs, "DIV", {}, win);
    expect(res).not.toBeNull();
    expect(res.layerId).toBe("contour-surface-div");
    expect(res.element).toBe("DIV");

    const winLayers = getLayersForWindow(win);
    const divLayer = winLayers.find((l) => l.id === "contour-surface-div");
    expect(divLayer).toBeDefined();
    expect(divLayer.color).toBe(DIV_COLOR);
  });

  test("Fewer than 3 valid wind stations returns null gracefully", () => {
    const map = createMockMap();
    const win = { id: "test-win-insufficient" };
    clearWindowWeatherLayers(win);

    const invalidObs = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [116.0, 37.0] }, properties: { station_id: 1, wind_speed: 10, wind_dir: 90 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [118.0, 35.0] }, properties: { station_id: 2, wind_speed: 10, wind_dir: -9999 } }, // Missing dir
        { type: "Feature", geometry: { type: "Point", coordinates: [116.0, 33.0] }, properties: { station_id: 3, wind_speed: 9999, wind_dir: 180 } }, // Missing speed
      ],
    };

    const res = analyzeAndRenderSurfaceKinematicContours(map, invalidObs, "VOR", {}, win);
    expect(res).toBeNull();
  });
});
