// wind-lifecycle.test.js - NWP Wind Add/Remove Lifecycle: addContour VOR/WIND/DIV + remove-wind-preserves-DIV (§7-T6 wind lifecycle)
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
  getLayersForWindow,
  clearWindowWeatherLayers,
  addOrUpdateLayer,
  removeLayer,
} from "../../src/ui/layerControl.js";
import { readSrcText } from "../helpers/cssText.js";
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

  describe("NWP Wind Layer Add Contour Layer UI & Action", () => {
    test("Svelte wind drawer has Streamlines, Barbs, Raster, and Add Contour selector (VOR/DIV, no WIND)", () => {
      // Live drawer is components/LayerRow.svelte (legacy HTML renderer removed).
      const rowSrc = readSrcText("components/LayerRow.svelte");
      expect(rowSrc).toContain("Wind Streamlines");
      expect(rowSrc).toContain("Wind Barbs");
      expect(rowSrc).toContain("Wind Magnitude Raster");
      expect(rowSrc).toContain("Add Contour Layer");
      expect(rowSrc).toContain("sel-wind-contour-");
      expect(rowSrc).toContain('<option value="VOR">Relative Vorticity (VOR)</option>');
      expect(rowSrc).toContain('<option value="DIV">Divergence (DIV)</option>');
      const windSel = rowSrc.slice(rowSrc.indexOf("sel-wind-contour-"));
      expect(windSel.slice(0, windSel.indexOf("</select>"))).not.toContain('value="WIND"');
    });

    test("buildKinematicGridData computes scalar wind speed for WIND norm", () => {
      const u = new Float32Array([3, 0, -4, 6]);
      const v = new Float32Array([4, 5, 3, 8]);
      const header = {
        start_lon: 100,
        end_lon: 101,
        start_lat: 20,
        end_lat: 21,
        n_lon: 2,
        n_lat: 2,
        d_lon: 1,
        d_lat: 1,
      };
      const res = buildKinematicGridData("WIND", u, v, header, { smoothOutput: false });
      expect(res).not.toBeNull();
      expect(res.values[0]).toBeCloseTo(5.0, 2); // sqrt(3^2 + 4^2) = 5
      expect(res.values[1]).toBeCloseTo(5.0, 2); // sqrt(0^2 + 5^2) = 5
      expect(res.values[2]).toBeCloseTo(5.0, 2); // sqrt((-4)^2 + 3^2) = 5
      expect(res.values[3]).toBeCloseTo(10.0, 2); // sqrt(6^2 + 8^2) = 10
    });

    test("handleLayerAction(addContour) on ECMWF_HR/WIND layer creates and renders derived contour layer", async () => {
      const map = createMockMap();
      const winId = "test-win-wind";
      const u = new Float32Array([10, 12, 8, 14]);
      const v = new Float32Array([5, 6, 4, 7]);
      const windGrid = {
        header: {
          start_lon: 100,
          end_lon: 101,
          start_lat: 20,
          end_lat: 21,
          n_lon: 2,
          n_lat: 2,
          d_lon: 1,
          d_lat: 1,
        },
        x: [100, 101],
        y: [20, 21],
        u,
        v,
      };
      const windLayer = {
        id: "wind-850",
        name: "850hPa Wind Streamlines",
        type: "wind",
        model: "ECMWF_HR",
        element: "WIND",
        level: 850,
        gridData: windGrid,
        config: { showWind: true },
      };
      const mockWin = {
        id: winId,
        model: "ECMWF_HR",
        level: 850,
        period: 24,
        forecastCycle: "2026091600",
        windGridData: windGrid,
        activeGroup: { id: "test-group", layers: [] },
      };

      // Add VOR contour
      handleLayerAction(map, "addContour", windLayer.id, "VOR", windLayer, mockWin);

      // Allow async imports / operations to settle
      await new Promise((r) => setTimeout(r, 50));

      const winLayers = getLayersForWindow(mockWin);
      const vorLayer = winLayers.find((l) => l.id === "contour-ECMWF_HR-vor-850");
      expect(vorLayer).toBeDefined();
      expect(vorLayer.type).toBe("contour");
      expect(vorLayer.element).toBe("VOR");
      expect(vorLayer.visible).toBe(true);
      expect(vorLayer.config?.showLine).toBe(true);

      // Verify layer added to preset activeGroup
      const presetEntry = mockWin.activeGroup.layers.find((l) => l.id === "contour-ECMWF_HR-vor-850");
      expect(presetEntry).toBeDefined();
      expect(presetEntry.visible).toBe(true);

      // Add WIND contour
      handleLayerAction(map, "addContour", windLayer.id, "WIND", windLayer, mockWin);
      await new Promise((r) => setTimeout(r, 50));

      const windContourLayer = winLayers.find((l) => l.id === "contour-ECMWF_HR-wind-850");
      expect(windContourLayer).toBeDefined();
      expect(windContourLayer.type).toBe("contour");
      expect(windContourLayer.element).toBe("WIND");
      expect(windContourLayer.visible).toBe(true);
    });
  });

  describe("Removing Wind Layer while preserving Derived Divergence Contour Layer", () => {
    test("Removing wind layer stops wind animation, removes barbs, and leaves derived DIV contour intact", async () => {
      const map = createMockMap();
      const winId = "test-win-remove-wind";
      const u = new Float32Array([10, 12, 8, 14]);
      const v = new Float32Array([5, 6, 4, 7]);
      const windGrid = {
        header: { start_lon: 100, end_lon: 101, start_lat: 20, end_lat: 21, n_lon: 2, n_lat: 2, d_lon: 1, d_lat: 1 },
        x: [100, 101], y: [20, 21], u, v,
      };

      const mockWin = {
        id: winId,
        model: "ECMWF_HR",
        element: "WIND",
        level: 850,
        period: 24,
        forecastCycle: "2026091600",
        windGridData: windGrid,
        activeGroup: null,
      };

      const windLayer = addOrUpdateLayer({
        id: "wind-WIND",
        name: "850 hPa Wind Field (ECMWF_HR)",
        type: "wind",
        model: "ECMWF_HR",
        element: "WIND",
        level: 850,
        gridData: windGrid,
        removable: true,
        config: { showWind: true, showBarbs: false },
      }, mockWin);

      // Add DIV derived contour layer
      handleLayerAction(map, "addContour", windLayer.id, "DIV", windLayer, mockWin);
      await new Promise((r) => setTimeout(r, 50));

      const layersBefore = getLayersForWindow(mockWin);
      expect(layersBefore.find((l) => l.id === "wind-WIND")).toBeDefined();
      const divLayer = layersBefore.find((l) => l.id === "contour-ECMWF_HR-div-850");
      expect(divLayer).toBeDefined();

      // Now remove the wind layer
      removeLayer(windLayer.id, mockWin);
      handleLayerAction(map, "remove", windLayer.id, null, windLayer, mockWin);

      const layersAfter = getLayersForWindow(mockWin);
      expect(layersAfter.find((l) => l.id === "wind-WIND")).toBeUndefined();
      expect(layersAfter.find((l) => l.id === "contour-ECMWF_HR-div-850")).toBeDefined();

      // Verify win.element was updated to DIV since the base WIND layer was removed
      expect(mockWin.element).toBe("DIV");
    });

    test("Removing wind layer in preset removes it from activeGroup.layers and stops streamlines", async () => {
      const map = createMockMap();
      const winId = "test-win-preset-wind";
      const presetGroup = {
        id: "test-composite-850",
        name: "850hPa Composite",
        layers: [
          { id: "wind", element: "WIND", model: "ECMWF_HR", type: "wind", render: { colormap: "WIND", keepWind: true } },
          { id: "contour-ECMWF_HR-div-850", element: "DIV", model: "ECMWF_HR", type: "contour", derivedFrom: "wind" },
        ],
      };

      const mockWin = {
        id: winId,
        model: "ECMWF_HR",
        element: "WIND",
        level: 850,
        period: 24,
        activeGroup: presetGroup,
      };

      const windLayer = addOrUpdateLayer({
        id: "wind",
        name: "850hPa Wind Streamlines",
        type: "wind",
        model: "ECMWF_HR",
        element: "WIND",
        level: 850,
        removable: true,
        config: { showWind: true },
      }, mockWin);

      const divLayer = addOrUpdateLayer({
        id: "contour-ECMWF_HR-div-850",
        name: "850 hPa Derived Divergence",
        type: "contour",
        model: "ECMWF_HR",
        element: "DIV",
        level: 850,
        removable: true,
      }, mockWin);

      removeLayer("wind", mockWin);
      handleLayerAction(map, "remove", "wind", null, windLayer, mockWin);

      // Base preset layers survive ✕ in activeGroup.layers (per-window view
      // removal only) so a fresh Load Data restores them. Regression: deleted
      // ECMWF-HR base layers could never be loaded again because ✕ spliced the
      // shared preset definition.
      expect(presetGroup.layers.find((l) => l.id === "wind")).toBeDefined();
      expect(presetGroup.layers.find((l) => l.id === "contour-ECMWF_HR-div-850")).toBeDefined();

      const remaining = getLayersForWindow(mockWin);
      expect(remaining.find((l) => l.id === "wind")).toBeUndefined();
      expect(remaining.find((l) => l.id === "contour-ECMWF_HR-div-850")).toBeDefined();
    });

    test("Catalog drawer includes VOR and DIV in NWP element selection", async () => {
      const { resolveForecastCycles } = await import("../../src/utils/timelineSync.js");
      // resolveForecastCycles maps VOR and DIV to WIND
      const vorCycles = await resolveForecastCycles("ECMWF_HR", "VOR", 850);
      expect(Array.isArray(vorCycles)).toBe(true);
      const divCycles = await resolveForecastCycles("ECMWF_HR", "DIV", 850);
      expect(Array.isArray(divCycles)).toBe(true);
    });

    test("Adding derived divergence contour layer from ECMWF_HR/WIND does not create or render any wind speed contour layers", async () => {
      const map = createMockMap();
      const mockWin = {
        winIdx: 0,
        model: "ECMWF_HR",
        level: 850,
        period: 24,
        forecastCycle: "2026032000",
        activeGroup: null,
      };
      clearWindowWeatherLayers(mockWin);

      const header = {
        start_lon: 100,
        end_lon: 105,
        start_lat: 20,
        end_lat: 25,
        n_lon: 6,
        n_lat: 6,
        d_lon: 1,
        d_lat: 1,
      };
      const totalPoints = header.n_lon * header.n_lat;
      const u = new Float32Array(totalPoints).fill(10);
      const v = new Float32Array(totalPoints).fill(5);
      const windSpeed = new Float32Array(totalPoints).fill(Math.hypot(10, 5));

      const windLayer = addOrUpdateLayer({
        id: "wind-ECMWF_HR-850",
        name: "850hPa Wind Streamlines",
        type: "wind",
        model: "ECMWF_HR",
        element: "WIND",
        level: 850,
        gridData: { header, u, v, values: windSpeed },
        config: { showWind: true, showBarbs: false, showRaster: false },
      }, mockWin);

      // Verify triggerIsobandOverlay early returns on wind layer without rendering isolines
      await triggerIsobandOverlay(map, windLayer, mockWin);
      expect(map.layers.has("contour-isoline-wind-ECMWF_HR-850")).toBe(false);
      expect(map.layers.has("contour-isoline-contour-WIND")).toBe(false);

      // Now user triggers action: addContour with DIV
      handleLayerAction(map, "addContour", "wind-ECMWF_HR-850", "DIV", windLayer, mockWin);

      const layers = getLayersForWindow(mockWin);
      // Ensure only wind and derived divergence weather layers exist in window
      const weatherLayers = layers.filter((l) => l.type !== "pmtiles");
      expect(weatherLayers.length).toBe(2);
      expect(layers.find((l) => l.id === "wind-ECMWF_HR-850")).toBeDefined();
      const divLayer = layers.find((l) => l.id === "contour-ECMWF_HR-div-850");
      expect(divLayer).toBeDefined();
      expect(divLayer.element).toBe("DIV");
      expect(divLayer.type).toBe("contour");

      // Verify no unwanted wind speed contour layer was added to window layers
      expect(layers.find((l) => l.id === "contour-ECMWF_HR-wind-850")).toBeUndefined();
      expect(layers.find((l) => l.id === "contour-WIND")).toBeUndefined();
      expect(layers.filter((l) => l.type === "contour").map((l) => l.element)).toEqual(["DIV"]);

      // Verify armContourReRender does not arm wind layer without showRaster
      const armWindResult = armContourReRender(map, windLayer, mockWin);
      expect(armWindResult).toBeUndefined();

      // Verify no wind isolines are on the map
      expect(map.layers.has("contour-isoline-wind-ECMWF_HR-850")).toBe(false);
      expect(map.layers.has("contour-isoline-contour-ECMWF_HR-wind-850")).toBe(false);

      // Verify removing derived divergence layer cleanly cleans up DIV without stopping wind animation
      handleLayerAction(map, "remove", "contour-ECMWF_HR-div-850", null, divLayer, mockWin);
      expect(map.layers.has("contour-isoline-contour-ECMWF_HR-div-850")).toBe(false);
    });
  });
