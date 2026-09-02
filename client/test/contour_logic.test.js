// contour_logic.test.js - Unit tests for characteristic bold contour lines & style parsing
import { test, expect, describe } from "bun:test";
import { parseBoldValues, isFeatureBold } from "../src/layers/contourLayer.js";

describe("Contour Line Bold Characteristic Values & Logic", () => {
  test("parseBoldValues extracts array from strings, numbers, and defaults", () => {
    // String input
    expect(parseBoldValues("5880, 588, 1010")).toEqual([5880, 588, 1010]);
    expect(parseBoldValues("0 -20")).toEqual([0, -20]);

    // Array input
    expect(parseBoldValues([5880, 588])).toEqual([5880, 588]);

    // Defaults by element
    expect(parseBoldValues(null, "HGT")).toEqual([5880, 588]);
    expect(parseBoldValues(null, "SLP")).toEqual([1010, 1000, 1020]);
    expect(parseBoldValues(null, "TMP")).toEqual([0]);
  });

  test("isFeatureBold correctly matches exact values and 10x decameter/meter conversions", () => {
    const bold5880 = [5880, 588];

    // Decameters: 588 dagpm should match 5880m / 588
    expect(isFeatureBold(588, bold5880)).toBe(true);
    expect(isFeatureBold(5880, bold5880)).toBe(true);
    expect(isFeatureBold(576, bold5880)).toBe(false);

    // Surface SLP: 1010 hPa
    const boldSLP = [1010];
    expect(isFeatureBold(1010, boldSLP)).toBe(true);
    expect(isFeatureBold(1012, boldSLP)).toBe(false);

    // Freezing isotherm: 0 °C
    const boldTMP = [0];
    expect(isFeatureBold(0, boldTMP)).toBe(true);
    expect(isFeatureBold(4, boldTMP)).toBe(false);
  });
});

describe("Contour Line Rendering and Smoothing Integration", () => {
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

  test("renderContourLayers applies smoothing and round line-joins to MapLibre layers", async () => {
    const { renderContourLayers } = await import("../src/layers/contourLayer.js");
    const map = createMockMap();

    const nLon = 10;
    const nLat = 10;
    const values = [];
    for (let j = 0; j < nLat; j++) {
      for (let i = 0; i < nLon; i++) {
        // Temperature gradient
        values.push(-20 + j * 4 + Math.sin(i / 2) * 5);
      }
    }

    const gridData = {
      header: {
        start_lon: 70,
        end_lon: 130,
        start_lat: 10,
        end_lat: 55,
        n_lon: nLon,
        n_lat: nLat,
        d_lon: 6,
        d_lat: 4.5,
      },
      values,
      stats: { min: -25, max: 25 },
    };

    // Render with smoothing (default)
    renderContourLayers(map, gridData, "TMP", {
      layerId: "test-contour",
      smooth: true,
      smoothIterations: 2,
    });

    const isolineLayer = map.getLayer("test-contour-isoline-layer");
    expect(isolineLayer).not.toBeNull();
    expect(isolineLayer.layout["line-join"]).toBe("round");
    expect(isolineLayer.layout["line-cap"]).toBe("round");

    const isolineSrc = map.getSource("test-contour-isoline-source");
    expect(isolineSrc).not.toBeNull();
    expect(isolineSrc._data.features.length).toBeGreaterThan(0);

    // Verify coordinates were subdivided and smoothed
    const featureWithCoords = isolineSrc._data.features.find((f) => f.geometry && f.geometry.coordinates?.length > 0);
    expect(featureWithCoords).toBeDefined();

    // Re-render with smooth: false to verify un-smoothed mode produces fewer points
    const mapRaw = createMockMap();
    renderContourLayers(mapRaw, gridData, "TMP", {
      layerId: "test-contour-raw",
      smooth: false,
    });
    const rawSrc = mapRaw.getSource("test-contour-raw-isoline-source");
    const rawFeature = rawSrc._data.features.find((f) => f.geometry && f.geometry.coordinates?.length > 0);
    expect(rawFeature).toBeDefined();

    const smoothedCoordCount = Array.isArray(featureWithCoords.geometry.coordinates[0][0])
      ? featureWithCoords.geometry.coordinates[0].length
      : featureWithCoords.geometry.coordinates.length;
    const rawCoordCount = Array.isArray(rawFeature.geometry.coordinates[0][0])
      ? rawFeature.geometry.coordinates[0].length
      : rawFeature.geometry.coordinates.length;

    expect(smoothedCoordCount).toBeGreaterThan(rawCoordCount);
  });
});

