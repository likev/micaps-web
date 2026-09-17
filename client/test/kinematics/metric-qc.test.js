// vorticity_divergence.test.js - Acceptance tests for Vorticity & Divergence Derived Contours (§7 T2)
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
