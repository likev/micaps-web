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
