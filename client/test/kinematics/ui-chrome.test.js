// vorticity_divergence.test.js - Acceptance tests for Vorticity & Divergence Derived Contours (§7 T6)
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

describe("T6: UI Integration, Chrome, Formatters, & Palettes (§7-T6)", () => {
  test("Svelte drawer includes VOR and DIV options for station and wind contour selectors", () => {
    // Live drawer is components/LayerRow.svelte (legacy HTML renderer removed).
    const rowSrc = readSrcText("components/LayerRow.svelte");
    expect(rowSrc).toContain('<option value="VOR">Relative Vorticity (VOR)</option>');
    expect(rowSrc).toContain('<option value="DIV">Divergence (DIV)</option>');
    expect(rowSrc).toContain("sel-station-contour-");
    expect(rowSrc).toContain("sel-wind-contour-");
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
    const configRaw = fs.readFileSync(new URL("../../config.json", import.meta.url), "utf8");
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
});
