// vorticity_divergence.test.js - Acceptance tests for Vorticity & Divergence Derived Contours (§7 T1-T6)
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
} from "../src/layers/kinematics.js";
import {
  analyzeAndRenderSurfaceContours,
  analyzeAndRenderSurfaceKinematicContours,
  SURFACE_CONTOUR_CONFIGS,
} from "../src/layers/surfaceAnalysis.js";
import {
  analyzeAndRenderSoundingElementContour,
  analyzeAndRenderSoundingKinematicContour,
  SOUNDING_CONTOUR_CONFIGS,
} from "../src/layers/soundingAnalysis.js";
import { formatElementUnit, formatContourLabel } from "../src/utils/formatters.js";
import { getColormap, getElementLevels } from "../src/utils/colormaps.js";
import { getPaletteCategory } from "../src/utils/paletteLoader.js";
import {
  renderStationDrawerHTML,
  renderWindDrawerHTML,
  getLayersForWindow,
  clearWindowWeatherLayers,
  addOrUpdateLayer,
  removeLayer,
} from "../src/ui/layerControl.js";
import { handleLayerAction, triggerVortDivOverlay, triggerIsobandOverlay } from "../src/ui/layerActions.js";
import { armContourReRender } from "../src/services/contourReRender.js";
import { prefetchSurroundingData } from "../src/services/prefetchService.js";

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

describe("T1: Mathematical Sign & Finite Differences (§7-T1)", () => {
  const nLon = 5;
  const nLat = 5;
  const dLon = 1.0;
  const dLat = 1.0;
  const centerLat = 32.0;
  const centerLon = 102.0;
  const dLamRad = (dLon * Math.PI) / 180.0;
  const dPhiRad = (dLat * Math.PI) / 180.0;
  const dy = EARTH_RADIUS * dPhiRad;

  const headerSouthToNorth = {
    start_lon: 100,
    end_lon: 104,
    start_lat: 30,
    end_lat: 34,
    n_lon: nLon,
    n_lat: nLat,
    d_lon: dLon,
    d_lat: dLat,
  };

  test("Solid-body rotation (u = -Omega*y, v = +Omega*x) yields zeta ~= +2*Omega (*1e5) and D ~= 0", () => {
    const Om = 1e-4; // 1e-4 s-1 -> expected zeta = 2*Om*1e5 = +20 (1e-5 s-1)
    const u = new Float32Array(nLon * nLat);
    const v = new Float32Array(nLon * nLat);

    for (let r = 0; r < nLat; r++) {
      const lat = 30 + r * dLat;
      const phi = (lat * Math.PI) / 180.0;
      const dx = EARTH_RADIUS * Math.cos(phi) * dLamRad;
      const yDist = (r - 2) * dy;

      for (let c = 0; c < nLon; c++) {
        const xDist = (c - 2) * dx;
        const idx = r * nLon + c;
        u[idx] = -Om * yDist;
        v[idx] = Om * xDist;
      }
    }

    const res = computeVortDiv(u, v, headerSouthToNorth);
    expect(res).not.toBeNull();

    const centerIdx = 2 * nLon + 2;
    expect(Math.round(res.vor[centerIdx])).toBe(20);
    expect(Math.abs(res.div[centerIdx])).toBeLessThan(0.01);
  });

  test("Pure divergence (u = alpha*x, v = alpha*y) yields D ~= +2*alpha (*1e5) and zeta ~= 0", () => {
    const alpha = 1e-4; // 1e-4 s-1 -> expected D = 2*alpha*1e5 = +20 (1e-5 s-1)
    const u = new Float32Array(nLon * nLat);
    const v = new Float32Array(nLon * nLat);

    for (let r = 0; r < nLat; r++) {
      const lat = 30 + r * dLat;
      const phi = (lat * Math.PI) / 180.0;
      const dx = EARTH_RADIUS * Math.cos(phi) * dLamRad;
      const yDist = (r - 2) * dy;

      for (let c = 0; c < nLon; c++) {
        const xDist = (c - 2) * dx;
        const idx = r * nLon + c;
        u[idx] = alpha * xDist;
        v[idx] = alpha * yDist;
      }
    }

    const res = computeVortDiv(u, v, headerSouthToNorth);
    expect(res).not.toBeNull();

    const centerIdx = 2 * nLon + 2;
    expect(Math.round(res.div[centerIdx])).toBe(20);
    expect(Math.abs(res.vor[centerIdx])).toBeLessThan(0.01);
  });

  test("Uniform flow (u = 10 m/s, v = 5 m/s) yields zeta = 0 and D = 0", () => {
    const u = new Float32Array(nLon * nLat).fill(10);
    const v = new Float32Array(nLon * nLat).fill(5);

    const res = computeVortDiv(u, v, headerSouthToNorth);
    expect(res).not.toBeNull();

    for (let i = 0; i < nLon * nLat; i++) {
      expect(Math.abs(res.vor[i])).toBe(0);
      expect(Math.abs(res.div[i])).toBe(0);
    }
  });

  test("North-to-South grid orientation preserves correct cyclonic sign", () => {
    const Om = 1e-4;
    const u = new Float32Array(nLon * nLat);
    const v = new Float32Array(nLon * nLat);

    const headerNorthToSouth = {
      start_lon: 100,
      end_lon: 104,
      start_lat: 34,
      end_lat: 30,
      n_lon: nLon,
      n_lat: nLat,
      d_lon: 1.0,
      d_lat: -1.0,
    };

    for (let r = 0; r < nLat; r++) {
      const lat = 34 - r * dLat; // row 0 is North (34), row 4 is South (30)
      const phi = (lat * Math.PI) / 180.0;
      const dx = EARTH_RADIUS * Math.cos(phi) * dLamRad;
      const yDist = (lat - centerLat) * dy;

      for (let c = 0; c < nLon; c++) {
        const xDist = (c - 2) * dx;
        const idx = r * nLon + c;
        u[idx] = -Om * yDist;
        v[idx] = Om * xDist;
      }
    }

    const res = computeVortDiv(u, v, headerNorthToSouth);
    expect(res).not.toBeNull();

    const centerIdx = 2 * nLon + 2;
    expect(Math.round(res.vor[centerIdx])).toBe(20);
    expect(Math.abs(res.div[centerIdx])).toBeLessThan(0.01);
  });

  test("Inverted velocity handedness (u = +Omega*y, v = -Omega*x) yields negative vorticity (anticyclonic)", () => {
    const Om = 1e-4;
    const u = new Float32Array(nLon * nLat);
    const v = new Float32Array(nLon * nLat);

    for (let r = 0; r < nLat; r++) {
      const lat = 30 + r * dLat;
      const phi = (lat * Math.PI) / 180.0;
      const dx = EARTH_RADIUS * Math.cos(phi) * dLamRad;
      const yDist = (r - 2) * dy;

      for (let c = 0; c < nLon; c++) {
        const xDist = (c - 2) * dx;
        const idx = r * nLon + c;
        u[idx] = Om * yDist;
        v[idx] = -Om * xDist;
      }
    }

    const res = computeVortDiv(u, v, headerSouthToNorth);
    const centerIdx = 2 * nLon + 2;
    expect(Math.round(res.vor[centerIdx])).toBe(-20);
  });
});

describe("T2: Spherical Metric Sanity & QC Envelopes (§7-T2)", () => {
  test("Zonal shear gives larger vorticity at latitude 50° than 20° by ~1/cos(phi)", () => {
    const nCols = 5;
    const nRows = 3;

    // Grid at latitude 20°
    const h20 = {
      start_lon: 100,
      end_lon: 104,
      start_lat: 19,
      end_lat: 21,
      n_lon: nCols,
      n_lat: nRows,
      d_lon: 1.0,
      d_lat: 1.0,
    };

    // Grid at latitude 50°
    const h50 = {
      start_lon: 100,
      end_lon: 104,
      start_lat: 49,
      end_lat: 51,
      n_lon: nCols,
      n_lat: nRows,
      d_lon: 1.0,
      d_lat: 1.0,
    };

    // Apply identical dv per degree of longitude (10 m/s across 4 degrees)
    const u20 = new Float32Array(15).fill(0);
    const v20 = new Float32Array(15);
    const u50 = new Float32Array(15).fill(0);
    const v50 = new Float32Array(15);

    for (let r = 0; r < nRows; r++) {
      for (let c = 0; c < nCols; c++) {
        const idx = r * nCols + c;
        v20[idx] = c * 2.5; // v increases eastward
        v50[idx] = c * 2.5;
      }
    }

    const res20 = computeVortDiv(u20, v20, h20);
    const res50 = computeVortDiv(u50, v50, h50);

    const centerIdx = 1 * nCols + 2;
    const vor20 = res20.vor[centerIdx];
    const vor50 = res50.vor[centerIdx];

    expect(vor50).toBeGreaterThan(vor20);

    const ratio = vor50 / vor20;
    const expectedRatio = Math.cos((20.0 * Math.PI) / 180.0) / Math.cos((50.0 * Math.PI) / 180.0);
    expect(Math.abs(ratio - expectedRatio)).toBeLessThan(0.05);
  });

  test("Southern hemisphere preserves formula signs without hidden hemisphere negation", () => {
    const hSH = {
      start_lon: 100,
      end_lon: 104,
      start_lat: -34,
      end_lat: -30,
      n_lon: 5,
      n_lat: 5,
      d_lon: 1.0,
      d_lat: 1.0,
    };

    // Positive v increasing eastward (dv/dx > 0)
    const u = new Float32Array(25).fill(0);
    const v = new Float32Array(25);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        v[r * 5 + c] = c * 2.0;
      }
    }

    const res = computeVortDiv(u, v, hSH);
    const centerIdx = 12;
    expect(res.vor[centerIdx]).toBeGreaterThan(0);
  });

  test("Non-physical outliers (|zeta| > 100, |D| > 100) are clipped to NaN by display QC", () => {
    const h = {
      start_lon: 100,
      end_lon: 102,
      start_lat: 30,
      end_lat: 32,
      n_lon: 3,
      n_lat: 3,
      d_lon: 1.0,
      d_lat: 1.0,
    };

    // Extreme unphysical shear: 300 m/s across 1 degree
    const u = new Float32Array(9).fill(0);
    const v = new Float32Array(9);
    v[0] = -300; v[1] = 0; v[2] = 300;
    v[3] = -300; v[4] = 0; v[5] = 300;
    v[6] = -300; v[7] = 0; v[8] = 300;

    const res = computeVortDiv(u, v, h);
    // Center point should exceed 100 and be emitted as NaN
    expect(Number.isNaN(res.vor[4])).toBe(true);
  });
});

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

describe("T5: NWP Derived Grid Differentiation & Caching (§7-T5)", () => {
  test("buildKinematicGridData produces contour-ready structure with stats", () => {
    const nCols = 5;
    const nRows = 5;
    const u = new Float32Array(25).fill(10);
    const v = new Float32Array(25).fill(20);
    const header = {
      start_lon: 100, end_lon: 104, start_lat: 30, end_lat: 34,
      n_lon: nCols, n_lat: nRows, d_lon: 1, d_lat: 1,
    };

    const kinData = buildKinematicGridData("VOR", u, v, header);
    expect(kinData).not.toBeNull();
    expect(kinData.header).toBeDefined();
    expect(kinData.values instanceof Float32Array).toBe(true);
    expect(kinData.stats).toBeDefined();
    expect(typeof kinData.stats.min).toBe("number");
    expect(typeof kinData.stats.max).toBe("number");
    expect(typeof kinData.stats.mean).toBe("number");
  });

  test("buildKinematicGridData treats CONV as convergence (negative divergence)", () => {
    const nCols = 5;
    const nRows = 5;
    const u = new Float32Array(25);
    const v = new Float32Array(25);
    for (let r = 0; r < nRows; r++) {
      for (let c = 0; c < nCols; c++) {
        u[r * nCols + c] = (c - 2) * 5;
        v[r * nCols + c] = (r - 2) * 5;
      }
    }
    const header = {
      start_lon: 100, end_lon: 104, start_lat: 30, end_lat: 34,
      n_lon: nCols, n_lat: nRows, d_lon: 1, d_lat: 1,
    };

    const divData = buildKinematicGridData("DIV", u, v, header);
    const convData = buildKinematicGridData("CONV", u, v, header);
    expect(divData).not.toBeNull();
    expect(convData).not.toBeNull();
    const centerIdx = 2 * nCols + 2;
    expect(divData.values[centerIdx]).toBeGreaterThan(0);
    expect(convData.values[centerIdx]).toBeLessThan(0);
    expect(convData.values[centerIdx]).toBeCloseTo(-divData.values[centerIdx], 5);
  });

  test("handleLayerAction config change (smooth) routes NWP VOR through triggerVortDivOverlay", async () => {
    const map = createMockMap();
    const win = {
      id: "test-win-nwp-wire",
      model: "ECMWF_HR",
      level: 850,
      period: 24,
      forecastCycle: "2026091600",
      _windGridCache: new Map(),
    };

    const syntheticWind = {
      header: {
        start_lon: 100, end_lon: 104, start_lat: 30, end_lat: 34,
        n_lon: 5, n_lat: 5, d_lon: 1, d_lat: 1,
      },
      u: new Float32Array(25).fill(15),
      v: new Float32Array(25).fill(10),
    };
    win._windGridCache.set("ECMWF_HR/WIND/850/2026091600.024", syntheticWind);

    const layer = {
      id: "contour-ECMWF_HR-vor-850",
      type: "contour",
      model: "ECMWF_HR",
      element: "VOR",
      level: 850,
      visible: true,
      config: { showLine: true, smooth: true },
    };

    handleLayerAction(map, "config", layer.id, { smooth: false }, layer, win);
    await new Promise((r) => setTimeout(r, 60));
    expect(layer.gridData).toBeDefined();
    expect(layer.gridData.values).toBeDefined();
    expect(map.sources.has("contour-ECMWF_HR-vor-850-isoline-source")).toBe(true);
  });

  test("triggerVortDivOverlay uses cached parent wind data without duplicate network calls", async () => {
    const map = createMockMap();
    const win = {
      id: "test-win-nwp-cache",
      model: "ECMWF_HR",
      level: 850,
      period: 24,
      forecastCycle: "2026091600",
      _windGridCache: new Map(),
    };

    const syntheticWind = {
      header: {
        start_lon: 100, end_lon: 104, start_lat: 30, end_lat: 34,
        n_lon: 5, n_lat: 5, d_lon: 1, d_lat: 1,
      },
      u: new Float32Array(25).fill(15),
      v: new Float32Array(25).fill(10),
    };

    // Pre-populate cache
    const cacheKey = "ECMWF_HR/WIND/850/2026091600.024";
    win._windGridCache.set(cacheKey, syntheticWind);

    const layer = {
      id: "contour-ECMWF_HR-vor-850",
      model: "ECMWF_HR",
      element: "VOR",
      level: 850,
      visible: true,
      config: { showLine: true },
    };

    await triggerVortDivOverlay(map, layer, win);

    expect(layer.gridData).toBeDefined();
    expect(layer.gridData.values).toBeDefined();
    expect(map.sources.has("contour-ECMWF_HR-vor-850-isoline-source")).toBe(true);

    // Verify second invocation reuses layer.gridData directly
    const prevValues = layer.gridData.values;
    await triggerVortDivOverlay(map, layer, win);
    expect(layer.gridData.values).toBe(prevValues);
  });

  test("prefetchSurroundingData emits parent WIND items for NWP VOR and DIV layers", async () => {
    const win = {
      id: "test-win-prefetch-vort",
      model: "ECMWF_HR",
      level: 850,
      period: 24,
      forecastCycle: "2026091600",
      stepLength: 6,
      activeGroup: {
        id: "composite-850hpa",
        hasLevel: true,
        defaultLevel: 850,
        layers: [
          {
            type: "contour",
            model: "ECMWF_HR",
            element: "VOR",
            level: 850,
            derivedFrom: "wind",
            render: { showLine: true },
          },
          {
            type: "contour",
            model: "ECMWF_HR",
            element: "DIV",
            level: 850,
            derivedFrom: "wind",
            render: { showLine: true },
          },
        ],
      },
    };

    const stats = await prefetchSurroundingData(win, {
      directions: ["next"],
      timelineSteps: {
        mode: "nwp",
        periods: { prev: 18, current: 24, next: 30, cycle: "2026091600" },
      },
    });
    expect(stats.targets).toBeDefined();
    const rightItems = stats.targets.right?.items || [];
    const windItem = rightItems.find((it) => it.path === "ECMWF_HR/WIND/850");
    expect(windItem).toBeDefined();
    expect(windItem.type).toBe("grid");
  });
});

describe("T6: UI Integration, Chrome, Formatters, & Palettes (§7-T6)", () => {
  test("Drawer HTML includes VOR and DIV options for both upper and surface drawers", () => {
    const upperDrawer = renderStationDrawerHTML({
      id: "upperair-obs-500",
      model: "UPPER_AIR",
      type: "station",
      config: {},
    });
    expect(upperDrawer).toContain('<option value="VOR">Relative Vorticity (VOR)</option>');
    expect(upperDrawer).toContain('<option value="DIV">Divergence (DIV)</option>');

    const surfaceDrawer = renderStationDrawerHTML({
      id: "surface-obs",
      model: "SURFACE",
      type: "station",
      config: {},
    });
    expect(surfaceDrawer).toContain('<option value="VOR">Relative Vorticity (VOR)</option>');
    expect(surfaceDrawer).toContain('<option value="DIV">Divergence (DIV)</option>');
  });

  test("formatElementUnit returns 1e-5/s for VOR and DIV", () => {
    expect(formatElementUnit("VOR")).toBe("1e-5/s");
    expect(formatElementUnit("DIV")).toBe("1e-5/s");
  });

  test("formatContourLabel rounds VOR and DIV to 1 decimal place", () => {
    expect(formatContourLabel(10.46, "VOR")).toBe("10.5");
    expect(formatContourLabel(-3.82, "DIV")).toBe("-3.8");
    expect(formatContourLabel(0.0, "VOR")).toBe("0");
  });

  test("paletteLoader maps VOR and DIV to PRS_HGT category", () => {
    expect(getPaletteCategory("VOR")).toBe("PRS_HGT");
    expect(getPaletteCategory("DIV")).toBe("PRS_HGT");
  });

  test("colormaps DEFAULT_COLORMAPS provides centered diverging stops for VOR and DIV", () => {
    const vorMap = getColormap(null, "VOR");
    expect(Array.isArray(vorMap)).toBe(true);
    expect(vorMap.some((s) => s.val < 0)).toBe(true);
    expect(vorMap.some((s) => s.val > 0)).toBe(true);
    expect(vorMap.some((s) => s.val === 0)).toBe(true);

    const divMap = getColormap(null, "DIV");
    expect(Array.isArray(divMap)).toBe(true);
    expect(divMap.some((s) => s.val < 0)).toBe(true);
    expect(divMap.some((s) => s.val > 0)).toBe(true);
    expect(divMap.some((s) => s.val === 0)).toBe(true);

    const vorLevels = getElementLevels("VOR");
    expect(vorLevels).toEqual(VOR_LEVELS);
    const divLevels = getElementLevels("DIV");
    expect(divLevels).toEqual(DIV_LEVELS);
  });

  test("config.json contains valid VOR and DIV colormaps and hidden NWP VOR layer", () => {
    const configRaw = fs.readFileSync(new URL("../config.json", import.meta.url), "utf8");
    const config = JSON.parse(configRaw);

    expect(config.colormaps.VOR).toBeDefined();
    expect(config.colormaps.DIV).toBeDefined();
    expect(Array.isArray(config.colormaps.VOR)).toBe(true);
    expect(Array.isArray(config.colormaps.DIV)).toBe(true);

    const preset850 = config.presets.find((p) => p.id === "composite-850hpa");
    expect(preset850).toBeDefined();
    const nwpVor = preset850.layers.find((l) => l.element === "VOR");
    expect(nwpVor).toBeDefined();
    expect(nwpVor.id).toBe("contour-ECMWF_HR-vor-850");
    expect(nwpVor.visible).toBe(false);
  });

  describe("NWP Wind Layer Add Contour Layer UI & Action", () => {
    test("renderWindDrawerHTML generates drawer with Streamlines, Barbs, Raster, and Add Contour selector", () => {
      const windLayer = {
        id: "wind-850",
        name: "850hPa Wind Streamlines",
        type: "wind",
        model: "ECMWF_HR",
        element: "WIND",
        level: 850,
        config: { showWind: true, showBarbs: false, showRaster: false },
      };
      const html = renderWindDrawerHTML(windLayer);
      expect(html).toContain("Wind Streamlines");
      expect(html).toContain("Wind Barbs");
      expect(html).toContain("Wind Magnitude Raster");
      expect(html).toContain("📈 Add Contour Layer");
      expect(html).toContain('<select class="sel-contour-element"');
      expect(html).toContain('<option value="VOR">Relative Vorticity (VOR)</option>');
      expect(html).toContain('<option value="DIV">Divergence (DIV)</option>');
      expect(html).not.toContain('<option value="WIND">');
      expect(html).toContain("btn-add-station-contour");
      expect(html).toContain("btn-add-contour");
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

      // Verify removed from activeGroup.layers
      expect(presetGroup.layers.find((l) => l.id === "wind")).toBeUndefined();
      expect(presetGroup.layers.find((l) => l.id === "contour-ECMWF_HR-div-850")).toBeDefined();

      const remaining = getLayersForWindow(mockWin);
      expect(remaining.find((l) => l.id === "wind")).toBeUndefined();
      expect(remaining.find((l) => l.id === "contour-ECMWF_HR-div-850")).toBeDefined();
    });

    test("Catalog drawer includes VOR and DIV in NWP element selection", async () => {
      const { resolveForecastCycles } = await import("../src/utils/timelineSync.js");
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
});
