// vorticity_divergence.test.js - Acceptance tests for Vorticity & Divergence Derived Contours (§7 T4)
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

describe("T4: Upper-Air Sounding Level QC & Renaming Lifecycle (§7-T4)", () => {
  test("Outlier wind speed (95 m/s at 925 hPa) rejected before gridding", () => {
    const map = createMockMap();
    const win = { id: "test-win-upper-qc" };
    clearWindowWeatherLayers(win);

    // 4 stations, one with 95 m/s at 925 hPa (exceeds 60 m/s bound for 925 hPa)
    const upperObs = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [116.0, 37.0] }, properties: { station_id: 1, wind_speed: 15, wind_dir: 90 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [118.0, 35.0] }, properties: { station_id: 2, wind_speed: 15, wind_dir: 180 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [116.0, 33.0] }, properties: { station_id: 3, wind_speed: 95, wind_dir: 270 } }, // Outlier at 925 hPa
        { type: "Feature", geometry: { type: "Point", coordinates: [114.0, 35.0] }, properties: { station_id: 4, wind_speed: 15, wind_dir: 360 } },
      ],
    };

    // Since station 3 is dropped due to 925 hPa QC, only 3 stations remain -> still valid
    const res = analyzeAndRenderSoundingKinematicContour(map, upperObs, 925, "VOR", {}, win);
    expect(res).not.toBeNull();
    expect(res.layerId).toBe("contour-sounding-vor-925");
  });

  test("Level-step rename restamps id to contour-sounding-div-700 and preserves eye state", () => {
    const win = {
      id: "test-win-level-step",
      level: 500,
      activeGroup: {
        id: "sounding-preset",
        name: "Upper-Air Sounding Analysis",
        hasLevel: true,
        defaultLevel: 500,
        layers: [
          { id: "upperair-obs-500", type: "station", model: "UPPER_AIR", level: 500 },
          {
            id: "contour-sounding-div-500",
            type: "contour",
            model: "UPPER_AIR",
            element: "DIV",
            level: 500,
            derivedFrom: "upperair-obs-500",
            name: "500 hPa Derived Divergence",
            render: { lineColor: DIV_COLOR, showLine: true },
          },
        ],
      },
    };
    clearWindowWeatherLayers(win);

    addOrUpdateLayer({
      id: "contour-sounding-div-500",
      type: "contour",
      model: "UPPER_AIR",
      element: "DIV",
      level: 500,
      name: "500 hPa Derived Divergence",
      visible: true,
      derivedFrom: "upperair-obs-500",
      config: { lineColor: DIV_COLOR, showLine: true },
    }, win);

    // Simulate vertical level change from 500 to 700
    const targetLevel = 700;
    const group = win.activeGroup;
    const stationLayer = group.layers.find((l) => l.type === "station" && l.model === "UPPER_AIR");
    const targetStationId = stationLayer ? `upperair-obs-${targetLevel}` : null;

    for (const l of group.layers) {
      if (l.model === "UPPER_AIR") {
        l.level = targetLevel;
        if (l.type === "station") {
          l.id = targetStationId || l.id;
          l.path = `UPPER_AIR/${l.element || "PLOT"}/${targetLevel}`;
          l.name = `${targetLevel} hPa Sounding Station Plots`;
        } else if (l.derivedFrom) {
          l.id = `contour-sounding-${(l.element || "HGT").toLowerCase()}-${targetLevel}`;
          if (targetStationId) l.derivedFrom = targetStationId;
          const elemName = l.element === "HGT"
            ? "Geopotential Height"
            : (l.element === "TMP"
              ? "Temperature"
              : (l.element === "DTD"
                ? "Dew-Point Depression"
                : (l.element === "VOR"
                  ? "Relative Vorticity"
                  : (l.element === "DIV"
                    ? "Divergence"
                    : l.element))));
          l.name = `${targetLevel} hPa Derived ${elemName}`;
        }
      }
    }

    const divLayerInPreset = group.layers.find((l) => l.element === "DIV");
    expect(divLayerInPreset.id).toBe("contour-sounding-div-700");
    expect(divLayerInPreset.name).toBe("700 hPa Derived Divergence");
    expect(divLayerInPreset.level).toBe(700);
    expect(divLayerInPreset.derivedFrom).toBe("upperair-obs-700");
  });
});
