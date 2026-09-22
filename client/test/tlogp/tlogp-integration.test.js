// tlogp-integration.test.js - Comprehensive integration tests for Upper-Air T-lnP Sounding Diagram
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import { tlogpController } from "../../src/layers/tlogp/tlogpController.js";
import { computeParcelAscent, calculateThermodynamicIndices } from "../../src/layers/tlogp/tlogpMath.js";
import { setTLogPVisibility, loadTLogPLayer } from "../../src/layers/tlogp/tlogpLayer.js";
import { getPrefetchTargets, prefetchSurroundingData } from "../../src/services/prefetchService.js";
import { syncObservationTimeline } from "../../src/utils/timelineSync.js";
import { findStationAtPoint, handleStationClick } from "../../src/layers/station/stationHover.js";
import { getState } from "../../src/layers/station/stationState.js";
import { isCached, clearDataCache, fetchJson } from "../../src/api/apiClient.js";
import { filterObsFilesByStep } from "../../src/ui/timeline/timelineMath.js";
import { getLayersForWindow, getLayerById } from "../../src/ui/layers/layerStore.js";
import { loadPresetGroup } from "../../src/services/presetLoader.js";
import { readSrcText } from "../helpers/cssText.js";

let map;

function createMockMap() {
  const sources = new Map();
  const layers = new Map();
  return {
    _sources: sources,
    _layers: layers,
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
    on: () => {},
    off: () => {},
  };
}

const mockSoundingShanghai = {
  stationId: "58362",
  stationName: "上海/宝山 (Shanghai)",
  lon: 121.44,
  lat: 31.39,
  elevation: 5.5,
  obsTime: "2026-03-20 20:00",
  numLevels: 12,
  levels: [
    { pressure: 1016.3, height: 7, temp: 24.3, dewPoint: 18.9, windDir: 66, windSpeed: 3.0 },
    { pressure: 1000, height: 141, temp: 23.2, dewPoint: 17.5, windDir: 66, windSpeed: 5.0 },
    { pressure: 925, height: 834, temp: 18.2, dewPoint: 14.9, windDir: 97, windSpeed: 7.7 },
    { pressure: 850, height: 1536, temp: 14.0, dewPoint: 10.5, windDir: 120, windSpeed: 10.2 },
    { pressure: 700, height: 3150, temp: 5.8, dewPoint: -1.2, windDir: 210, windSpeed: 14.0 },
    { pressure: 500, height: 5880, temp: -11.5, dewPoint: -22.0, windDir: 250, windSpeed: 22.0 },
    { pressure: 400, height: 7540, temp: -22.0, dewPoint: -35.0, windDir: 260, windSpeed: 28.0 },
    { pressure: 300, height: 9600, temp: -38.0, dewPoint: -52.0, windDir: 270, windSpeed: 38.0 },
    { pressure: 250, height: 10850, temp: -48.0, dewPoint: -60.0, windDir: 270, windSpeed: 45.0 },
    { pressure: 200, height: 12350, temp: -58.0, dewPoint: -68.0, windDir: 275, windSpeed: 48.0 },
    { pressure: 150, height: 14150, temp: -63.0, dewPoint: -72.0, windDir: 280, windSpeed: 35.0 },
    { pressure: 100, height: 16550, temp: -68.0, dewPoint: -76.0, windDir: 280, windSpeed: 20.0 },
  ],
};

const mockSoundingBeijing = {
  stationId: "54511",
  stationName: "北京 (Beijing)",
  lon: 116.47,
  lat: 39.80,
  elevation: 31.3,
  obsTime: "2026-03-20 20:00",
  numLevels: 12,
  levels: [
    { pressure: 1012.0, height: 31, temp: 18.5, dewPoint: 11.2, windDir: 320, windSpeed: 4.0 },
    { pressure: 1000, height: 130, temp: 17.6, dewPoint: 10.0, windDir: 320, windSpeed: 5.5 },
    { pressure: 925, height: 810, temp: 12.0, dewPoint: 6.5, windDir: 340, windSpeed: 8.0 },
    { pressure: 850, height: 1500, temp: 7.2, dewPoint: 1.0, windDir: 350, windSpeed: 11.0 },
    { pressure: 700, height: 3100, temp: -1.5, dewPoint: -12.0, windDir: 280, windSpeed: 15.0 },
    { pressure: 500, height: 5760, temp: -18.2, dewPoint: -30.0, windDir: 270, windSpeed: 25.0 },
    { pressure: 400, height: 7400, temp: -29.0, dewPoint: -42.0, windDir: 275, windSpeed: 32.0 },
    { pressure: 300, height: 9400, temp: -44.0, dewPoint: -58.0, windDir: 280, windSpeed: 42.0 },
    { pressure: 250, height: 10600, temp: -53.0, dewPoint: -65.0, windDir: 280, windSpeed: 50.0 },
    { pressure: 200, height: 12100, temp: -60.0, dewPoint: -70.0, windDir: 285, windSpeed: 52.0 },
    { pressure: 150, height: 13900, temp: -62.0, dewPoint: -72.0, windDir: 285, windSpeed: 38.0 },
    { pressure: 100, height: 16300, temp: -65.0, dewPoint: -74.0, windDir: 290, windSpeed: 22.0 },
  ],
};

describe("V1 & Preset Configuration", () => {
  it("verifies config.json contains composite-tlogp in TlogP Observation category", () => {
    const configPath = new URL("../../config.json", import.meta.url);
    const raw = fs.readFileSync(configPath, "utf-8");
    const cfg = JSON.parse(raw);
    const preset = cfg.presets.find((p) => p.id === "composite-tlogp");
    expect(preset).toBeDefined();
    expect(preset.category).toBe("TlogP Observation");
    expect(preset.isObservation).toBe(true);
    expect(preset.hasLevel).toBe(false);

    // Verify Station Network layer
    const stnLayer = preset.layers.find((l) => l.id === "upperair-tlogp-stations");
    expect(stnLayer).toBeDefined();
    expect(stnLayer.type).toBe("station");
    expect(stnLayer.path).toBe("UPPER_AIR/TLOGP");

    // Verify T-lnP Sounding Diagram layer
    const diagLayer = preset.layers.find((l) => l.id === "upperair-tlogp-diagram");
    expect(diagLayer).toBeDefined();
    expect(diagLayer.type).toBe("tlogp");
    expect(diagLayer.stationId).toBe("58362");
    expect(diagLayer.config?.stationId).toBe("58362");
    expect(diagLayer.config?.parcelLevel).toBe("surface");
  });
});

describe("V2 & V5: Multi-Level Convective Parcel Ascent (Surface, 925, 850, 700, Custom)", () => {
  it("computes surface-based parcel ascent (SBCAPE & SBCIN)", () => {
    const res = computeParcelAscent(mockSoundingShanghai.levels, "surface");
    expect(res).not.toBeNull();
    expect(res.initialPressure).toBe(1016.3);
    expect(res.initialTemp).toBe(24.3);
    expect(res.pLCL).toBeLessThan(1016.3);
    expect(res.cape).toBeGreaterThanOrEqual(0);
    expect(res.indices.precipitableWater).toBeGreaterThan(15);
  });

  it("elevates parcel starting level to 925 hPa with recomputed elevated LCL, CAPE & CIN", () => {
    const res925 = computeParcelAscent(mockSoundingShanghai.levels, "925");
    expect(res925).not.toBeNull();
    expect(res925.initialPressure).toBe(925);
    expect(res925.initialTemp).toBe(18.2);
    expect(res925.pLCL).toBeLessThanOrEqual(925);
    expect(res925.trajectory[0].p).toBe(925);
  });

  it("elevates parcel starting level to 850 hPa (Low-Level Jet / Nocturnal Convection)", () => {
    const res850 = computeParcelAscent(mockSoundingShanghai.levels, "850");
    expect(res850).not.toBeNull();
    expect(res850.initialPressure).toBe(850);
    expect(res850.initialTemp).toBe(14.0);
    expect(res850.pLCL).toBeLessThanOrEqual(850);
    expect(res850.trajectory[0].p).toBe(850);
  });

  it("elevates parcel starting level to 700 hPa", () => {
    const res700 = computeParcelAscent(mockSoundingShanghai.levels, "700");
    expect(res700).not.toBeNull();
    expect(res700.initialPressure).toBe(700);
    expect(res700.initialTemp).toBe(5.8);
    expect(res700.pLCL).toBeLessThanOrEqual(700);
    expect(res700.trajectory[0].p).toBe(700);
  });

  it("supports custom arbitrary isobaric parcel level (e.g. 780 hPa)", () => {
    const resCustom = computeParcelAscent(mockSoundingShanghai.levels, "custom", 780);
    expect(resCustom).not.toBeNull();
    expect(resCustom.initialPressure).toBe(780);
    expect(resCustom.trajectory[0].p).toBe(780);
  });
});

describe("V3 & V4: Station Switching Interaction (Map Click & Controller)", () => {
  let originalFetch;

  beforeEach(() => {
    map = createMockMap();
    clearDataCache();
    originalFetch = global.fetch;
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes("station=54511")) {
        return {
          ok: true,
          status: 200,
          json: async () => mockSoundingBeijing,
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => mockSoundingShanghai,
      };
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearDataCache();
  });

  it("initializes controller with station 58362 and creates map highlight layers", async () => {
    const win = { obsTime: "20260320200000.000", layers: [] };
    const layerDef = { type: "tlogp", stationId: "58362", config: { stationId: "58362", parcelLevel: "surface" } };

    await tlogpController.init(map, win, layerDef);
    expect(tlogpController.activeStationId).toBe("58362");
    expect(tlogpController.isActive()).toBe(true);

    // Verify MapLibre highlight source and layers
    const source = map.getSource("tlogp-active-station-source");
    expect(source).toBeDefined();
    expect(source.data.features[0].geometry.coordinates).toEqual([121.44, 31.39]);

    expect(map.getLayer("tlogp-active-station-halo")).toBeDefined();
    expect(map.getLayer("tlogp-active-station-center")).toBeDefined();
  });

  it("switches station to 54511 Beijing and updates map coordinates", async () => {
    const win = {
      obsTime: "20260320200000.000",
      layers: [{ type: "tlogp", stationId: "58362", config: { stationId: "58362" } }],
    };

    await tlogpController.setStation("54511", win, map);
    expect(tlogpController.activeStationId).toBe("54511");
    expect(tlogpController.sounding.stationId).toBe("54511");
    expect(tlogpController.sounding.stationName).toBe("北京 (Beijing)");

    // Map highlight coordinates updated to Beijing
    const source = map.getSource("tlogp-active-station-source");
    expect(source.data.features[0].geometry.coordinates).toEqual([116.47, 39.80]);
  });

  it("hit-tests station markers on map click", () => {
    const mapState = getState(map);
    mapState.visible = true;
    mapState.activeVisibleStations = [
      {
        pt: { x: 200, y: 150 },
        lon: 116.47,
        lat: 39.80,
        feature: { properties: { station_id: "54511", name: "北京" } },
      },
    ];

    const hit = findStationAtPoint(map, { x: 202, y: 151 });
    expect(hit).not.toBeNull();
    expect(hit.feature.properties.station_id).toBe("54511");

    // Outside click returns null
    const miss = findStationAtPoint(map, { x: 50, y: 50 });
    expect(miss).toBeNull();
  });
});

describe("V6 & V7: Timeline Integration for UPPER_AIR/TLOGP", () => {
  it("engages isUpper=true and 12h stepLength for UPPER_AIR/TLOGP", async () => {
    const win = { stepLength: 12, obsTime: "20260320200000.000" };
    const res = await syncObservationTimeline("UPPER_AIR/TLOGP", "20260320200000.000", "W1: T-lnP Sounding Analysis", win);
    expect(res).toBeDefined();
    expect(win._obsTimeline).toBeDefined();
    expect(win._obsTimeline.isUpper).toBe(true);
    expect(win._obsTimeline.stepLength).toBe(12);
  });
});

describe("V8: Time-Directional Prefetch Engine (prefetchService.js)", () => {
  const win = {
    id: "win-tlogp",
    obsTime: "20260320200000.000",
    isObservation: true,
    tlogpStation: "58362",
    activeGroup: {
      id: "composite-tlogp",
      name: "T-lnP Sounding Analysis (TlogP)",
      category: "TlogP Observation",
      isObservation: true,
      hasLevel: false,
      layers: [
        { type: "station", model: "UPPER_AIR", element: "TLOGP", path: "UPPER_AIR/TLOGP" },
        { type: "tlogp", model: "UPPER_AIR", element: "TLOGP", stationId: "58362", config: { stationId: "58362" } },
      ],
    },
    layers: [],
  };

  const mockTimeline = {
    mode: "obs",
    obsFiles: {
      prev: "20260320080000.000",
      current: "20260320200000.000",
      next: "20260321080000.000",
    },
  };

  it("collects tlogp profile and station network items for adjacent cycles", () => {
    const targets = getPrefetchTargets(win, { timelineSteps: mockTimeline });

    // Left (prev 03/20 08:00)
    expect(targets.left.items.length).toBe(3); // 1 station from layer0, 1 tlogp + 1 station from layer1
    const tlogpLeft = targets.left.items.find((i) => i.type === "tlogp");
    expect(tlogpLeft).toBeDefined();
    expect(tlogpLeft.file).toBe("20260320080000.000");
    expect(tlogpLeft.station).toBe("58362");

    // Right (next 03/21 08:00)
    expect(targets.right.items.length).toBe(3);
    const tlogpRight = targets.right.items.find((i) => i.type === "tlogp");
    expect(tlogpRight).toBeDefined();
    expect(tlogpRight.file).toBe("20260321080000.000");
    expect(tlogpRight.station).toBe("58362");

    // No vertical levels for surface/tlogp group
    expect(targets.up.items.length).toBe(0);
    expect(targets.down.items.length).toBe(0);
  });

  it("respects directional constraint directions: ['prev'] (btn-prev / keyboard ◀)", () => {
    const targets = getPrefetchTargets(win, { timelineSteps: mockTimeline, directions: ["prev"] });
    expect(targets.left.items.length).toBeGreaterThan(0);
    expect(targets.right.items.length).toBe(0);
  });

  it("respects directional constraint directions: ['next'] (btn-next / keyboard ▶)", () => {
    const targets = getPrefetchTargets(win, { timelineSteps: mockTimeline, directions: ["next"] });
    expect(targets.left.items.length).toBe(0);
    expect(targets.right.items.length).toBeGreaterThan(0);
  });

  it("verifies prefetch data caching in dataCache delivers 0ms hits", async () => {
    clearDataCache();
    expect(isCached("/api/data/tlogp", { file: "20260321080000.000", station: "58362" })).toBe(false);

    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => mockSoundingShanghai,
    });

    await fetchJson("/api/data/tlogp", { file: "20260321080000.000", station: "58362" });
    expect(isCached("/api/data/tlogp", { file: "20260321080000.000", station: "58362" })).toBe(true);
  });
});

describe("V10: Eye Toggle Visibility", () => {
  it("hides and shows panel on visibility toggle", () => {
    const prevPanel = tlogpController.panel;
    try {
      let panelShown = true;
      let haloVisible = true;
      const mockPanel = {
        show: () => { panelShown = true; },
        hide: () => { panelShown = false; },
        destroy: () => {},
        setParcelLevel: () => {},
        update: () => {},
      };
      tlogpController.panel = mockPanel;

      const mockMap = {
        getLayer: () => true,
        setLayoutProperty: (_id, _prop, val) => {
          haloVisible = val === "visible";
        },
      };

      setTLogPVisibility(mockMap, false);
      expect(panelShown).toBe(false);
      expect(haloVisible).toBe(false);

      setTLogPVisibility(mockMap, true);
      expect(panelShown).toBe(true);
      expect(haloVisible).toBe(true);
    } finally {
      tlogpController.panel = prevPanel;
    }
  });
});

describe("V4 & V9: Station ID Input Validation & Rejection", () => {
  beforeEach(() => {
    map = createMockMap();
    clearDataCache();
  });

  it("rejects non-5-digit station ID without network fetch and preserves active station", async () => {
    let fetchCalled = false;
    global.fetch = async () => {
      fetchCalled = true;
      return { ok: true, status: 200, json: async () => mockSoundingShanghai };
    };

    const win = { obsTime: "20260320200000.000", layers: [] };
    await tlogpController.init(map, win, { config: { stationId: "58362" } });
    expect(tlogpController.activeStationId).toBe("58362");

    fetchCalled = false;
    await tlogpController.setStation("ABCDE", win, map);
    expect(fetchCalled).toBe(false);
    expect(tlogpController.activeStationId).toBe("58362");

    await tlogpController.setStation("123", win, map);
    expect(fetchCalled).toBe(false);
    expect(tlogpController.activeStationId).toBe("58362");

    await tlogpController.setStation("583621", win, map);
    expect(fetchCalled).toBe(false);
    expect(tlogpController.activeStationId).toBe("58362");
  });

  it("accepts valid 5-digit station ID and syncs win.tlogpStation", async () => {
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes("station=59287")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...mockSoundingShanghai,
            stationId: "59287",
            stationName: "广州 (Guangzhou)",
            lon: 113.27,
            lat: 23.13,
          }),
        };
      }
      return { ok: true, status: 200, json: async () => mockSoundingShanghai };
    };

    const win = { obsTime: "20260320200000.000", layers: [] };
    await tlogpController.init(map, win, { config: { stationId: "58362" } });
    expect(win.tlogpStation).toBe("58362");

    await tlogpController.setStation("59287", win, map);
    expect(tlogpController.activeStationId).toBe("59287");
    expect(win.tlogpStation).toBe("59287");
    expect(tlogpController.sounding.stationName).toBe("广州 (Guangzhou)");
  });
});

describe("V6 & V7: Upper-Air Cadence (12h, 24h, 6h) & updateCycle on Time-Step", () => {
  beforeEach(() => {
    map = createMockMap();
    clearDataCache();
  });

  const sampleFiles = [
    "20260322200000.000",
    "20260322140000.000", // intensive run
    "20260322080000.000",
    "20260322020000.000", // intensive run
    "20260321200000.000",
    "20260321080000.000",
    "20260320200000.000",
  ];

  it("filters observation files strictly to synoptic 08:00 and 20:00 runs for 12h step", () => {
    const filtered12h = filterObsFilesByStep(sampleFiles, 12, true);
    expect(filtered12h).toEqual([
      "20260322200000.000",
      "20260322080000.000",
      "20260321200000.000",
      "20260321080000.000",
      "20260320200000.000",
    ]);
    // Verifies 02:00 and 14:00 intermediate runs are excluded
    expect(filtered12h).not.toContain("20260322140000.000");
    expect(filtered12h).not.toContain("20260322020000.000");
  });

  it("filters observation files to 24h step selecting same synoptic hour across days", () => {
    const filtered24h = filterObsFilesByStep(sampleFiles, 24, true);
    expect(filtered24h).toEqual([
      "20260322080000.000",
      "20260321080000.000",
    ]);
  });

  it("includes all 6h intensive runs when stepLength is 6", () => {
    const filtered6h = filterObsFilesByStep(sampleFiles, 6, true);
    expect(filtered6h.length).toBe(sampleFiles.length);
    expect(filtered6h).toContain("20260322140000.000");
  });

  it("updateCycle advances observation cycle without resetting active station", async () => {
    global.fetch = async (url) => {
      const u = String(url);
      const isNewCycle = u.includes("file=20260321080000.000");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ...mockSoundingShanghai,
          stationId: "54511",
          stationName: "北京 (Beijing)",
          obsTime: isNewCycle ? "2026-03-21 08:00" : "2026-03-20 20:00",
        }),
      };
    };

    const win = { obsTime: "20260320200000.000", layers: [] };
    await tlogpController.init(map, win, { config: { stationId: "54511" } });
    expect(tlogpController.activeStationId).toBe("54511");
    expect(tlogpController.sounding.obsTime).toBe("2026-03-20 20:00");

    // Advance cycle via updateCycle
    await tlogpController.updateCycle("20260321080000.000", win, map);
    // Active station preserved, sounding timestamp updated
    expect(tlogpController.activeStationId).toBe("54511");
    expect(tlogpController.sounding.obsTime).toBe("2026-03-21 08:00");
    expect(win.tlogpStation).toBe("54511");
  });
});

describe("Plan §8.5: Pre-Sorted Sounding Levels & Memoized Parcel Cache", () => {
  beforeEach(() => {
    map = createMockMap();
    clearDataCache();
  });

  it("pre-sorts sounding levels descending by pressure and memoizes standard parcel levels", async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => mockSoundingShanghai,
    });

    const win = { obsTime: "20260320200000.000", layers: [] };
    await tlogpController.init(map, win, { config: { stationId: "58362" } });

    // Pre-sorted array attached to levels
    expect(tlogpController.sounding.levels._sorted).toBeDefined();
    expect(tlogpController.sounding.levels._sorted[0].pressure).toBeGreaterThan(
      tlogpController.sounding.levels._sorted[1].pressure
    );

    // Parcel calculation cache holds precomputed ascents
    expect(tlogpController.parcelCache.has("surface")).toBe(true);
    expect(tlogpController.parcelCache.has("925")).toBe(true);
    expect(tlogpController.parcelCache.has("850")).toBe(true);
    expect(tlogpController.parcelCache.has("700")).toBe(true);

    // Switching parcel level pulls from cache
    tlogpController.setParcelLevel("850");
    expect(tlogpController.parcelResult).toBe(tlogpController.parcelCache.get("850"));

    // Custom level without explicit pressure falls back to 700 hPa rather than surface
    tlogpController.setParcelLevel("custom", null);
    expect(tlogpController.parcelResult.pInit).toBe(700);
  });
});

describe("V11: End-to-End Stability Indices", () => {
  it("computes physical thermodynamic indices on the sounding profile", () => {
    const indices = calculateThermodynamicIndices(mockSoundingShanghai.levels);
    expect(indices).toBeDefined();
    expect(indices.kIndex).toBeGreaterThan(-50);
    expect(indices.kIndex).toBeLessThan(100);
    expect(indices.totalTotals).toBeGreaterThan(0);
    expect(indices.showalterIndex).toBeDefined();
    expect(indices.precipitableWater).toBeGreaterThan(0);
  });
});

describe("V12: Layer Control Configuration for TLogP & 500hPa Exclusion", () => {
  beforeEach(() => {
    map = createMockMap();
    clearDataCache();
  });

  it("registers upperair-tlogp-diagram layer in layerStore when loaded", async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => mockSoundingShanghai,
    });

    const win = { id: "test-win-tlogp-1", obsTime: "20260320200000.000", layers: [] };
    await loadTLogPLayer(map, { id: "upperair-tlogp-diagram", type: "tlogp" }, null, null, win);

    const layer = getLayerById("upperair-tlogp-diagram", win);
    expect(layer).toBeDefined();
    expect(layer.type).toBe("tlogp");
    expect(layer.stationId).toBe("58362");
    expect(layer.config?.parcelLevel).toBe("surface");
  });

  it("Svelte LayerRow renders T-LogP drawer with station input, quick stations, parcel selector, and curve toggles", () => {
    // Live drawer is components/LayerRow.svelte (legacy renderLayerRow removed).
    const src = readSrcText("components/LayerRow.svelte");
    expect(src).toContain("input-tlogp-station");
    expect(src).toContain("sel-tlogp-quick-station");
    expect(src).toContain("sel-tlogp-parcel-level");
    expect(src).toContain("showTemp");
    expect(src).toContain("showDewpoint");
    expect(src).toContain("showWind");
    expect(src).toContain("showParcel");
  });

  it("Svelte LayerRow omits contour selector row from TLogP sounding station network drawer", () => {
    // Live drawer guards the contour selector behind a non-TLOGP condition.
    const src = readSrcText("components/LayerRow.svelte");
    expect(src).toContain('layer.element !== "TLOGP"');
    expect(src).toContain("sel-station-contour-");
  });

  it("loads composite-tlogp preset without retaining 500hPa sounding contours and with win.level=null", async () => {
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/api/data/tlogp")) {
        return { ok: true, status: 200, json: async () => mockSoundingShanghai };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          type: "FeatureCollection",
          features: [
            { type: "Feature", geometry: { type: "Point", coordinates: [121.44, 31.39] }, properties: { station_id: "58362" } },
          ],
        }),
      };
    };

    const win = {
      id: "test-win-tlogp-preset",
      obsTime: "20260320200000.000",
      level: 500, // previously on 500hPa
      layers: [],
    };

    const cfg = JSON.parse(fs.readFileSync("config.json", "utf-8"));
    const tlogpPreset = cfg.presets.find((p) => p.id === "composite-tlogp");
    expect(tlogpPreset).toBeDefined();

    await loadPresetGroup(map, tlogpPreset, 24, null, win);

    // win.level must be null for full-column TLogP sounding
    expect(win.level).toBeNull();

    const winLayers = getLayersForWindow(win);
    // TLogP diagram layer must be present
    const tlogpDiagram = winLayers.find((l) => l.type === "tlogp");
    expect(tlogpDiagram).toBeDefined();
    expect(tlogpDiagram.id).toBe("upperair-tlogp-diagram");

    // No 500hPa derived contour layers should exist
    const contourLayers = winLayers.filter((l) => l.type === "contour");
    expect(contourLayers.length).toBe(0);

    const old500Plots = winLayers.find((l) => l.id === "upperair-obs-500");
    expect(old500Plots).toBeUndefined();
  });
});
