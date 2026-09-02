// station_contour_analysis.test.js - Unit tests for multi-element station contour analysis & Add Contour Layer select control
import { test, expect, describe } from "bun:test";
import { analyzeAndRenderSurfaceContours, SURFACE_CONTOUR_CONFIGS } from "../src/layers/surfaceAnalysis.js";
import { analyzeAndRenderSoundingElementContour, SOUNDING_CONTOUR_CONFIGS } from "../src/layers/soundingAnalysis.js";
import { handleLayerAction } from "../src/ui/layerActions.js";
import { getLayersForWindow, clearWindowWeatherLayers } from "../src/ui/layerControl.js";

function createMockMap() {
  const sources = new Map();
  const layers = new Map();
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
          temperature: 24.5,
          dewpoint: 16.2,
          slp: 1012.4,
          visibility: 15.0,
          rain_6h: 0.0,
          wind_speed: 3.5,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [121.4, 31.2] }, // Shanghai
        properties: {
          station_id: 58362,
          temperature: 28.0,
          dewpoint: 22.5,
          slp: 1008.2,
          visibility: 8.5,
          rain_6h: 12.4,
          wind_speed: 6.2,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [113.3, 23.1] }, // Guangzhou
        properties: {
          station_id: 59287,
          temperature: 31.2,
          dewpoint: 25.0,
          slp: 1004.5,
          visibility: 20.0,
          rain_6h: 35.8,
          wind_speed: 4.0,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [104.0, 30.6] }, // Chengdu
        properties: {
          station_id: 56294,
          temperature: 22.0,
          dewpoint: 18.0,
          slp: 1014.0,
          visibility: 4.2,
          rain_6h: 5.2,
          wind_speed: 2.1,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [108.9, 34.3] }, // Xi'an
        properties: {
          station_id: 57036,
          temperature: 21.0,
          dewpoint: 14.5,
          slp: 1016.8,
          visibility: 9.0,
          rain_6h: 0.0,
          wind_speed: 2.8,
        },
      },
    ],
  };
}

function createSampleSoundingStationGeoJSON() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [116.4, 39.9] },
        properties: {
          station_id: 54511,
          height: 5840,
          temperature: -14.5,
          dewpoint: -22.0,
          wind_speed: 18.5,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [121.4, 31.2] },
        properties: {
          station_id: 58362,
          height: 5880,
          temperature: -10.0,
          dewpoint: -15.5,
          wind_speed: 24.0,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [113.3, 23.1] },
        properties: {
          station_id: 59287,
          height: 5920,
          temperature: -6.5,
          dewpoint: -11.0,
          wind_speed: 12.0,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [104.0, 30.6] },
        properties: {
          station_id: 56294,
          height: 5860,
          temperature: -12.0,
          dewpoint: -18.0,
          wind_speed: 14.0,
        },
      },
    ],
  };
}

describe("Surface Station Multi-Element Contour Analysis", () => {
  test("SURFACE_CONTOUR_CONFIGS contains valid extractors and metadata for all surface elements", () => {
    expect(SURFACE_CONTOUR_CONFIGS).toHaveProperty("SLP");
    expect(SURFACE_CONTOUR_CONFIGS).toHaveProperty("TMP");
    expect(SURFACE_CONTOUR_CONFIGS).toHaveProperty("TD");
    expect(SURFACE_CONTOUR_CONFIGS).toHaveProperty("VIS");
    expect(SURFACE_CONTOUR_CONFIGS).toHaveProperty("RAIN6");
    expect(SURFACE_CONTOUR_CONFIGS).toHaveProperty("WIND");

    const sampleProps = {
      temperature: 24.5,
      dewpoint: 16.2,
      slp: 1012.4,
      visibility: 15.0,
      rain_6h: 10.5,
      wind_speed: 4.2,
    };

    expect(SURFACE_CONTOUR_CONFIGS.SLP.extract(sampleProps)).toBe(1012.4);
    expect(SURFACE_CONTOUR_CONFIGS.TMP.extract(sampleProps)).toBe(24.5);
    expect(SURFACE_CONTOUR_CONFIGS.TD.extract(sampleProps)).toBe(16.2);
    expect(SURFACE_CONTOUR_CONFIGS.VIS.extract(sampleProps)).toBe(15.0);
    expect(SURFACE_CONTOUR_CONFIGS.RAIN6.extract(sampleProps)).toBe(10.5);
    expect(SURFACE_CONTOUR_CONFIGS.WIND.extract(sampleProps)).toBe(4.2);
  });

  test("analyzeAndRenderSurfaceContours calculates and renders SLP, TMP, TD, VIS, RAIN6 contours", () => {
    const map = createMockMap();
    const stns = createSampleSurfaceStationGeoJSON();
    const win = { id: "test-win-1" };

    // 1. SLP
    const resSLP = analyzeAndRenderSurfaceContours(map, stns, "SLP", {}, win);
    expect(resSLP).not.toBeNull();
    expect(resSLP.element).toBe("SLP");
    expect(map.getLayer("contour-surface-slp-isoline-layer")).not.toBeNull();

    // 2. Temperature (TMP)
    const resTMP = analyzeAndRenderSurfaceContours(map, stns, "TMP", {}, win);
    expect(resTMP).not.toBeNull();
    expect(resTMP.element).toBe("TMP");
    expect(map.getLayer("contour-surface-tmp-isoline-layer")).not.toBeNull();

    // 3. Dew Point (TD)
    const resTD = analyzeAndRenderSurfaceContours(map, stns, "TD", {}, win);
    expect(resTD).not.toBeNull();
    expect(resTD.element).toBe("TD");
    expect(map.getLayer("contour-surface-td-isoline-layer")).not.toBeNull();

    // 4. Visibility (VIS)
    const resVIS = analyzeAndRenderSurfaceContours(map, stns, "VIS", {}, win);
    expect(resVIS).not.toBeNull();
    expect(resVIS.element).toBe("VIS");
    expect(map.getLayer("contour-surface-vis-isoline-layer")).not.toBeNull();

    // 5. 6h Rain (RAIN6)
    const resRAIN = analyzeAndRenderSurfaceContours(map, stns, "RAIN6", {}, win);
    expect(resRAIN).not.toBeNull();
    expect(resRAIN.element).toBe("RAIN6");
    expect(map.getLayer("contour-surface-rain6-isoline-layer")).not.toBeNull();
  });
});

describe("Upper-Air Sounding Station Multi-Element Contour Analysis", () => {
  test("SOUNDING_CONTOUR_CONFIGS contains valid extractors for HGT, TMP, TD, WIND", () => {
    expect(SOUNDING_CONTOUR_CONFIGS).toHaveProperty("HGT");
    expect(SOUNDING_CONTOUR_CONFIGS).toHaveProperty("TMP");
    expect(SOUNDING_CONTOUR_CONFIGS).toHaveProperty("TD");
    expect(SOUNDING_CONTOUR_CONFIGS).toHaveProperty("WIND");

    const sampleProps = {
      height: 5880,
      temperature: -12.5,
      dewpoint: -20.0,
      wind_speed: 25.0,
    };

    expect(SOUNDING_CONTOUR_CONFIGS.HGT.extract(sampleProps)).toBe(5880);
    expect(SOUNDING_CONTOUR_CONFIGS.TMP.extract(sampleProps)).toBe(-12.5);
    expect(SOUNDING_CONTOUR_CONFIGS.TD.extract(sampleProps)).toBe(-20.0);
    expect(SOUNDING_CONTOUR_CONFIGS.WIND.extract(sampleProps)).toBe(25.0);
  });

  test("analyzeAndRenderSoundingElementContour calculates height with 5880 bold tagging and isotherms", () => {
    const map = createMockMap();
    const stns = createSampleSoundingStationGeoJSON();
    const win = { id: "test-win-2" };

    // Height (HGT) at 500 hPa
    const resHGT = analyzeAndRenderSoundingElementContour(map, stns, 500, "HGT", {}, win);
    expect(resHGT).not.toBeNull();
    expect(map.getLayer("contour-sounding-hgt-500-isoline-layer")).not.toBeNull();
    const hgtSrc = map.getSource("contour-sounding-hgt-500-isoline-source");
    expect(hgtSrc).not.toBeNull();
    const boldFeature = hgtSrc._data.features.find((f) => f.properties.value === 5880);
    if (boldFeature) {
      expect(boldFeature.properties.isBold).toBe(true);
    }

    // Temperature (TMP) at 500 hPa
    const resTMP = analyzeAndRenderSoundingElementContour(map, stns, 500, "TMP", {}, win);
    expect(resTMP).not.toBeNull();
    expect(map.getLayer("contour-sounding-tmp-500-isoline-layer")).not.toBeNull();
  });
});

describe("Add Contour Layer Action via layerActions", () => {
  test("handleLayerAction 'addContour' adds and registers new surface contour layer", async () => {
    const map = createMockMap();
    const win = { id: "test-win-3" };
    clearWindowWeatherLayers(win);

    const stns = createSampleSurfaceStationGeoJSON();
    const stnLayer = {
      id: "station-surface",
      name: "Surface Station Observations",
      type: "station",
      model: "SURFACE",
      stationsGeoJSON: stns,
    };

    // Add Visibility contour via action
    handleLayerAction(map, "addContour", "station-surface", "VIS", stnLayer, win);

    // Wait for promise tick
    await new Promise((r) => setTimeout(r, 20));

    const layers = getLayersForWindow(win);
    const visLayer = layers.find((l) => l.id === "contour-surface-vis");
    expect(visLayer).toBeDefined();
    expect(visLayer.type).toBe("contour");
    expect(visLayer.element).toBe("VIS");
    expect(visLayer.removable).toBe(true);
    expect(map.getLayer("contour-surface-vis-isoline-layer")).not.toBeNull();
  });
});
