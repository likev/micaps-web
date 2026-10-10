// server-derived-enhancements.test.js - Verification of server-side derived contour layers, configs, normalizers, and virtual paths
import { test, expect, describe, beforeEach } from "bun:test";
import fs from "fs";
import {
  SOUNDING_CONTOUR_CONFIGS,
  normalizeSoundingElementKey,
} from "../../src/layers/analysis/contourConfigsSounding.js";
import {
  isServerDerivedElement,
  handleAddContourAction,
  handleDerivedServerContourAction,
} from "../../src/ui/layers/derivedContourActions.js";
import { getLayersForWindow, clearWindowWeatherLayers, addOrUpdateLayer } from "../../src/ui/layerControl.js";

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

function createSampleUpperAirStations() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [116.4, 39.9] },
        properties: {
          station_id: 54511,
          height: 5560,
          temperature: -12.5,
          dewpoint: -20.0,
          wind_speed: 25.0,
          wind_dir: 270.0,
          k_index: 34.5,
          showalter: -3.2,
          lifted: -4.1,
          sweat: 320.0,
          tt: 52.0,
          shear: 18.5,
          tmp_diff: -28.0,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [121.5, 31.2] },
        properties: {
          station_id: 58362,
          height: 5880,
          temperature: -8.0,
          dewpoint: -12.0,
          wind_speed: 18.0,
          wind_dir: 250.0,
          k_index: 38.0,
          showalter: -5.0,
          lifted: -6.0,
          sweat: 410.0,
          tt: 55.0,
          shear: 22.0,
          tmp_diff: -25.0,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [113.3, 23.1] },
        properties: {
          station_id: 59287,
          height: 5890,
          temperature: -5.5,
          dewpoint: -8.0,
          wind_speed: 12.0,
          wind_dir: 230.0,
          k_index: 42.0,
          showalter: -7.0,
          lifted: -7.5,
          sweat: 460.0,
          tt: 57.0,
          shear: 15.0,
          tmp_diff: -22.0,
        },
      },
    ],
  };
}

describe("Server-Side Derived Layers & Index Configuration", () => {
  test("normalizeSoundingElementKey correctly categorizes meteorological indices and differences", () => {
    // K-Index
    expect(normalizeSoundingElementKey("K_INDEX")).toBe("K_INDEX");
    expect(normalizeSoundingElementKey("K-INDEX")).toBe("K_INDEX");
    expect(normalizeSoundingElementKey("kindex")).toBe("K_INDEX");
    expect(normalizeSoundingElementKey("k")).toBe("K_INDEX");

    // Showalter
    expect(normalizeSoundingElementKey("SHOWALTER")).toBe("SHOWALTER");
    expect(normalizeSoundingElementKey("SHOWALTER_INDEX")).toBe("SHOWALTER");
    expect(normalizeSoundingElementKey("SSI")).toBe("SHOWALTER");
    expect(normalizeSoundingElementKey("si")).toBe("SHOWALTER");

    // Lifted Index
    expect(normalizeSoundingElementKey("LIFTED")).toBe("LIFTED");
    expect(normalizeSoundingElementKey("LIFTED_INDEX")).toBe("LIFTED");
    expect(normalizeSoundingElementKey("LI")).toBe("LIFTED");

    // SWEAT
    expect(normalizeSoundingElementKey("SWEAT")).toBe("SWEAT");
    expect(normalizeSoundingElementKey("SWEAT_INDEX")).toBe("SWEAT");

    // Total Totals vs Temperature
    expect(normalizeSoundingElementKey("TT")).toBe("TT");
    expect(normalizeSoundingElementKey("TOTAL_TOTALS")).toBe("TT");
    expect(normalizeSoundingElementKey("TMP")).toBe("TMP");
    expect(normalizeSoundingElementKey("TEMPERATURE")).toBe("TMP");

    // Shear
    expect(normalizeSoundingElementKey("SHEAR")).toBe("SHEAR");
    expect(normalizeSoundingElementKey("WIND_SHEAR")).toBe("SHEAR");
    expect(normalizeSoundingElementKey("VERTICAL_SHEAR")).toBe("SHEAR");

    // Multi-level difference
    expect(normalizeSoundingElementKey("T850-500")).toBe("TMP_DIFF");
    expect(normalizeSoundingElementKey("TMP850-500")).toBe("TMP_DIFF");
    expect(normalizeSoundingElementKey("850-500")).toBe("TMP_DIFF");
    expect(normalizeSoundingElementKey("TMP_DIFF")).toBe("TMP_DIFF");

    // Thickness
    expect(normalizeSoundingElementKey("THICKNESS")).toBe("THICKNESS");
    expect(normalizeSoundingElementKey("HGT_DIFF")).toBe("THICKNESS");

    // Core elements preserved
    expect(normalizeSoundingElementKey("HGT")).toBe("HGT");
    expect(normalizeSoundingElementKey("TD")).toBe("TD");
    expect(normalizeSoundingElementKey("WIND")).toBe("WIND");
    expect(normalizeSoundingElementKey("DTD")).toBe("DTD");
    expect(normalizeSoundingElementKey("VOR")).toBe("VOR");
    expect(normalizeSoundingElementKey("DIV")).toBe("DIV");
  });

  test("SOUNDING_CONTOUR_CONFIGS contains valid extractors, colormaps, and level calculators", () => {
    const requiredKeys = ["K_INDEX", "SHOWALTER", "LIFTED", "SWEAT", "TT", "SHEAR", "TMP_DIFF", "THICKNESS"];
    for (const key of requiredKeys) {
      const cfg = SOUNDING_CONTOUR_CONFIGS[key];
      expect(cfg).toBeDefined();
      expect(typeof cfg.name).toBe("string");
      expect(typeof cfg.extract).toBe("function");
      expect(typeof cfg.getLevels).toBe("function");
      expect(typeof cfg.getBoldValues).toBe("function");
    }

    // Aliases exist
    expect(SOUNDING_CONTOUR_CONFIGS["K-INDEX"]).toBe(SOUNDING_CONTOUR_CONFIGS.K_INDEX);
    expect(SOUNDING_CONTOUR_CONFIGS["T850-500"]).toBe(SOUNDING_CONTOUR_CONFIGS.TMP_DIFF);

    // Test extractor outputs and QC bounds
    const sampleProps = {
      k_index: 35.2,
      showalter: -4.5,
      lifted: -5.0,
      sweat: 350.0,
      tt: 53.0,
      shear: 20.0,
      tmp_diff: -26.0,
      thickness: 5520,
    };

    expect(SOUNDING_CONTOUR_CONFIGS.K_INDEX.extract(sampleProps)).toBe(35.2);
    expect(SOUNDING_CONTOUR_CONFIGS.SHOWALTER.extract(sampleProps)).toBe(-4.5);
    expect(SOUNDING_CONTOUR_CONFIGS.LIFTED.extract(sampleProps)).toBe(-5.0);
    expect(SOUNDING_CONTOUR_CONFIGS.SWEAT.extract(sampleProps)).toBe(350.0);
    expect(SOUNDING_CONTOUR_CONFIGS.TT.extract(sampleProps)).toBe(53.0);
    expect(SOUNDING_CONTOUR_CONFIGS.SHEAR.extract(sampleProps)).toBe(20.0);
    expect(SOUNDING_CONTOUR_CONFIGS.TMP_DIFF.extract(sampleProps)).toBe(-26.0);
    expect(SOUNDING_CONTOUR_CONFIGS.THICKNESS.extract(sampleProps)).toBe(5520);

    // Fallback candidates (val / value)
    expect(SOUNDING_CONTOUR_CONFIGS.K_INDEX.extract({ val: 28.5 })).toBe(28.5);
    expect(SOUNDING_CONTOUR_CONFIGS.TT.extract({ value: 49.0 })).toBe(49.0);

    // Invalid / out-of-range returns null
    expect(SOUNDING_CONTOUR_CONFIGS.K_INDEX.extract({ k_index: -9999 })).toBeNull();
    expect(SOUNDING_CONTOUR_CONFIGS.SHOWALTER.extract({ showalter: 9999 })).toBeNull();
  });

  test("isServerDerivedElement identifies indices and level ranges while rejecting standard elements", () => {
    expect(isServerDerivedElement("T850-500")).toBe(true);
    expect(isServerDerivedElement("850-500")).toBe(true);
    expect(isServerDerivedElement("K-INDEX")).toBe(true);
    expect(isServerDerivedElement("k_index")).toBe(true);
    expect(isServerDerivedElement("SHOWALTER")).toBe(true);
    expect(isServerDerivedElement("LIFTED")).toBe(true);
    expect(isServerDerivedElement("SWEAT")).toBe(true);
    expect(isServerDerivedElement("TT")).toBe(true);
    expect(isServerDerivedElement("SHEAR")).toBe(true);
    expect(isServerDerivedElement("THICKNESS")).toBe(true);
    expect(isServerDerivedElement("TMP_DIFF")).toBe(true);

    // Standard client elements are NOT routed to server derivation
    expect(isServerDerivedElement("HGT")).toBe(false);
    expect(isServerDerivedElement("TMP")).toBe(false);
    expect(isServerDerivedElement("TD")).toBe(false);
    expect(isServerDerivedElement("DTD")).toBe(false);
    expect(isServerDerivedElement("VOR")).toBe(false);
    expect(isServerDerivedElement("DIV")).toBe(false);
    expect(isServerDerivedElement("WIND")).toBe(false);
    expect(isServerDerivedElement("SLP")).toBe(false);
  });

  test("handleAddContourAction routes UPPER_AIR station indices to server virtual paths", async () => {
    const map = createMockMap();
    const win = {
      id: "win-ua-derived",
      model: "UPPER_AIR",
      level: 500,
      activeGroup: { id: "composite-upperair-test", layers: [] },
      stationsGeoJSON: createSampleUpperAirStations(),
    };

    const stnLayer = {
      id: "upperair-obs-500",
      type: "station",
      model: "UPPER_AIR",
      level: 500,
      stationsGeoJSON: createSampleUpperAirStations(),
    };

    // Add K-INDEX contour from station layer
    handleAddContourAction(map, stnLayer, "K-INDEX", win);

    // Wait microtask tick for async dynamic import
    await new Promise((r) => setTimeout(r, 60));

    const layers = getLayersForWindow(win);
    const kLayer = layers.find((l) => l.element === "K_INDEX" || l.id.includes("k-index"));
    expect(kLayer).toBeDefined();
    expect(kLayer.path).toBe("/api/derived/UPPER_AIR/PLOT/K-INDEX");
    expect(win.activeGroup.layers.some((l) => l.path === "/api/derived/UPPER_AIR/PLOT/K-INDEX")).toBe(true);
  });

  test("handleAddContourAction routes NWP model layers to server-derived virtual paths", async () => {
    const map = createMockMap();
    const win = {
      id: "win-nwp-derived",
      model: "ECMWF_HR",
      level: 850,
      period: 24,
      activeGroup: { id: "composite-ecmwf-test", layers: [] },
    };

    const modelLayer = {
      id: "contour-ecmwf-tmp-850",
      type: "contour",
      model: "ECMWF_HR",
      element: "TMP",
      level: 850,
    };

    // Add T850-500 difference layer from NWP layer
    handleAddContourAction(map, modelLayer, "T850-500", win);

    await new Promise((r) => setTimeout(r, 60));

    const presetEntry = win.activeGroup.layers.find((l) => l.path && l.path.includes("850-500"));
    expect(presetEntry).toBeDefined();
    expect(presetEntry.path).toBe("/api/derived/ECMWF_HR/TMP/850-500");
    expect(presetEntry.level).toBe("850-500");
  });

  test("config.json contains derived colormaps and presets with /api/derived/... virtual paths", () => {
    const raw = fs.readFileSync("/root/downloads/micaps-web/client/config.json", "utf-8");
    const cfg = JSON.parse(raw);

    // Verify all 7 colormaps are in config.json
    expect(cfg.colormaps.K_INDEX).toBeDefined();
    expect(cfg.colormaps.K_INDEX.length).toBeGreaterThanOrEqual(2);
    expect(cfg.colormaps.SHOWALTER).toBeDefined();
    expect(cfg.colormaps.LIFTED).toBeDefined();
    expect(cfg.colormaps.SWEAT).toBeDefined();
    expect(cfg.colormaps.TT).toBeDefined();
    expect(cfg.colormaps.SHEAR).toBeDefined();
    expect(cfg.colormaps.THICKNESS).toBeDefined();

    // Verify derived presets exist
    const stabilityPreset = cfg.presets.find((p) => p.id === "composite-derived-stability");
    expect(stabilityPreset).toBeDefined();
    expect(stabilityPreset.layers.some((l) => l.path === "/api/derived/ECMWF_HR/K-INDEX")).toBe(true);
    expect(stabilityPreset.layers.some((l) => l.path === "/api/derived/ECMWF_HR/TMP/850-500")).toBe(true);

    const uaPreset = cfg.presets.find((p) => p.id === "composite-upperair-derived");
    expect(uaPreset).toBeDefined();
    expect(uaPreset.layers.some((l) => l.path === "/api/derived/UPPER_AIR/PLOT/K-INDEX")).toBe(true);
    expect(uaPreset.layers.some((l) => l.path === "/api/derived/UPPER_AIR/PLOT/TMP/850-500")).toBe(true);
  });

  test("handleAddContourAction preserves existing client-side derivation for standard elements", async () => {
    const map = createMockMap();
    const win = {
      id: "win-client-standard",
      model: "ECMWF_HR",
      level: 850,
      activeGroup: { id: "composite-test", layers: [] },
      windGridData: {
        u: new Float32Array([1, 2, 3, 4]),
        v: new Float32Array([5, 6, 7, 8]),
        header: { start_lon: 100, end_lon: 101, start_lat: 30, end_lat: 31, n_lon: 2, n_lat: 2, d_lon: 1, d_lat: 1 },
      },
    };

    const windLayer = {
      id: "wind-ECMWF_HR-850",
      type: "wind",
      element: "WIND",
      model: "ECMWF_HR",
      level: 850,
      gridData: win.windGridData,
    };

    // VOR on wind layer must use local client kinematic calculation
    handleAddContourAction(map, windLayer, "VOR", win);

    const layers = getLayersForWindow(win);
    const vorLayer = layers.find((l) => l.element === "VOR");
    expect(vorLayer).toBeDefined();
    expect(vorLayer.path).toBeUndefined(); // Local kinematic layer has no server /api/derived/ path
    expect(vorLayer.derivedFrom).toBe("wind-ECMWF_HR-850");
  });

  test("prefetchSurroundingData includes server-derived NWP layers with derivedFrom", async () => {
    const { prefetchSurroundingData } = await import("../../src/services/prefetchService.js");
    const win = {
      id: "win-prefetch-derived",
      model: "ECMWF_HR",
      level: 850,
      period: 24,
      forecastCycle: "2026100920",
      stepLength: 6,
      activeGroup: {
        id: "composite-derived-test",
        hasLevel: true,
        defaultLevel: 850,
        layers: [
          {
            id: "derived-ecmwf-t850-500",
            type: "contour",
            model: "ECMWF_HR",
            element: "TMP",
            level: "850-500",
            path: "/api/derived/ECMWF_HR/TMP/850-500",
            derivedFrom: "base-tmp",
          },
          {
            id: "derived-sounding-k-index",
            type: "contour",
            model: "UPPER_AIR",
            element: "K-INDEX",
            path: "/api/derived/UPPER_AIR/PLOT/K-INDEX",
            derivedFrom: "upperair-obs-500",
          },
        ],
      },
    };

    const stats = await prefetchSurroundingData(win, {
      directions: ["next"],
      timelineSteps: {
        mode: "nwp",
        periods: { prev: 18, current: 24, next: 30, cycle: "2026100920" },
      },
    });

    expect(stats.targets).toBeDefined();
    const rightItems = stats.targets.right?.items || [];
    // Should include NWP derived grid
    const derivedNwp = rightItems.find((it) => it.path === "/api/derived/ECMWF_HR/TMP/850-500");
    expect(derivedNwp).toBeDefined();
    expect(derivedNwp.type).toBe("grid");
    // Should NOT include UPPER_AIR station derived contour in NWP grid prefetch
    const derivedUa = rightItems.find((it) => it.path === "/api/derived/UPPER_AIR/PLOT/K-INDEX");
    expect(derivedUa).toBeUndefined();
  });

  test("renderSoundingDerivedContoursForStation fetches multi-level derived station observations", async () => {
    const { renderSoundingDerivedContoursForStation } = await import("../../src/services/derivedContours.js");
    const map = createMockMap();
    const win = {
      id: "win-sounding-multi",
      obsTime: "20261010080000.000",
      activeGroup: {
        id: "composite-sounding-derived",
        hasLevel: true,
        layers: [
          {
            id: "derived-sounding-k-index",
            type: "contour",
            model: "UPPER_AIR",
            element: "K-INDEX",
            path: "/api/derived/UPPER_AIR/PLOT/K-INDEX",
            derivedFrom: "upperair-obs-500",
            visible: true,
          },
        ],
      },
    };

    // Base 500 hPa stations with NO k_index
    const baseStations500 = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [116.4, 39.9] },
          properties: { station_id: 54511, temperature: -12.5, height: 5560 },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [121.5, 31.2] },
          properties: { station_id: 58362, temperature: -8.0, height: 5880 },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [113.3, 23.1] },
          properties: { station_id: 59287, temperature: -5.5, height: 5890 },
        },
      ],
    };

    // Mock catalogApi fetchStationObservations by providing global fetch or testing call
    let requestedPath = null;
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/data/station")) {
        requestedPath = urlStr;
        return new Response(JSON.stringify(createSampleUpperAirStations()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 200 });
    };

    try {
      await renderSoundingDerivedContoursForStation(map, baseStations500, 500, win.activeGroup, win, "upperair-obs-500");
      expect(requestedPath).toContain("path=%2Fapi%2Fderived%2FUPPER_AIR%2FPLOT%2FK-INDEX");
      const layers = getLayersForWindow(win);
      const kLayer = layers.find((l) => l.id === "derived-sounding-k-index");
      expect(kLayer).toBeDefined();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("composite-upperair-derived has isObservation: true in config.json", () => {
    const raw = fs.readFileSync("/root/downloads/micaps-web/client/config.json", "utf-8");
    const cfg = JSON.parse(raw);
    const uaPreset = cfg.presets.find((p) => p.id === "composite-upperair-derived");
    expect(uaPreset).toBeDefined();
    expect(uaPreset.isObservation).toBe(true);
  });

  test("all derived preset layer paths strictly start with /api/derived/ and not /derived/", () => {
    const raw = fs.readFileSync("/root/downloads/micaps-web/client/config.json", "utf-8");
    const cfg = JSON.parse(raw);
    for (const preset of cfg.presets || []) {
      for (const layer of preset.layers || []) {
        if (layer.path && layer.path.includes("derived")) {
          expect(layer.path.startsWith("/api/derived/")).toBe(true);
          expect(layer.path.startsWith("/derived/")).toBe(false);
        }
      }
    }
  });
});

