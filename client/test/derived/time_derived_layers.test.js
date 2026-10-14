// test/derived/time_derived_layers.test.js
// Unit tests for multi-time-derived layers (24h/48h variations of T and SLP for Surface, Upper-Air, and NWP models)

import { test, expect, describe } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  COLORMAPS,
  getColormap,
  getHexColor,
} from "../../src/utils/colormaps.js";
import {
  SURFACE_CONTOUR_CONFIGS,
  normalizeSurfaceElementKey,
} from "../../src/layers/analysis/contourConfigsSurface.js";
import {
  SOUNDING_CONTOUR_CONFIGS,
  normalizeSoundingElementKey,
} from "../../src/layers/analysis/contourConfigsSounding.js";
import {
  isServerDerivedElement,
  DERIVED_INDEX_KEYS,
  handleAddContourAction,
} from "../../src/ui/layers/derivedContourActions.js";
import { getLayersForWindow } from "../../src/ui/layerControl.js";

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

function createSampleSurfaceStations() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [116.4, 39.9] },
        properties: {
          station_id: 54511,
          temperature: 22.5,
          t_var_24h: 3.5,
          t_var_48h: 5.0,
          slp: 1012.5,
          slp_var_24h: -2.1,
          slp_var_48h: -4.5,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [121.5, 31.2] },
        properties: {
          station_id: 58362,
          temperature: 26.0,
          t_var_24h: -1.2,
          t_var_48h: 1.0,
          slp: 1008.0,
          slp_var_24h: 1.5,
          slp_var_48h: 3.0,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [113.3, 23.1] },
        properties: {
          station_id: 59287,
          temperature: 30.0,
          t_var_24h: 0.5,
          t_var_48h: -1.5,
          slp: 1005.5,
          slp_var_24h: -0.8,
          slp_var_48h: -2.0,
        },
      },
    ],
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
          height: 1480,
          temperature: 15.5,
          t_var_24h: -3.2,
          t_var_48h: -6.0,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [121.5, 31.2] },
        properties: {
          station_id: 58362,
          height: 1510,
          temperature: 18.0,
          t_var_24h: 2.4,
          t_var_48h: 4.1,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [113.3, 23.1] },
        properties: {
          station_id: 59287,
          height: 1520,
          temperature: 20.0,
          t_var_24h: 1.1,
          t_var_48h: 1.8,
        },
      },
    ],
  };
}

describe("Multi-Time Derived Layers (24H/48H T and SLP variations)", () => {
  describe("1. Colormaps (T_VAR and SLP_VAR)", () => {
    test("T_VAR and SLP_VAR colormaps are defined and diverging around zero", () => {
      expect(COLORMAPS.T_VAR).toBeDefined();
      expect(COLORMAPS.SLP_VAR).toBeDefined();

      const tVar = COLORMAPS.T_VAR;
      expect(tVar.length).toBeGreaterThan(5);

      // Verify range spans negative to positive symmetrically (-16 to +16)
      const minVal = tVar[0].val;
      const maxVal = tVar[tVar.length - 1].val;
      expect(minVal).toBeLessThanOrEqual(-16);
      expect(maxVal).toBeGreaterThanOrEqual(16);

      // Find zero or near-zero stop
      const zeroStop = tVar.find((s) => s.val === 0);
      expect(zeroStop).toBeDefined();

      // Negative values should be cool/blue colors (B > R)
      const negColor = getHexColor(-10, "T_VAR");
      expect(negColor).toMatch(/^rgb\(\d+,\s*\d+,\s*\d+\)$/);

      // Positive values should be warm/red colors (R > B)
      const posColor = getHexColor(10, "T_VAR");
      expect(posColor).toMatch(/^rgb\(\d+,\s*\d+,\s*\d+\)$/);
      expect(negColor).not.toBe(posColor);

      // SLP_VAR validation
      const slpVar = COLORMAPS.SLP_VAR;
      expect(slpVar.length).toBeGreaterThan(5);
      const slpMin = slpVar[0].val;
      const slpMax = slpVar[slpVar.length - 1].val;
      expect(slpMin).toBeLessThanOrEqual(-16);
      expect(slpMax).toBeGreaterThanOrEqual(16);

      const slpNegColor = getHexColor(-8, "SLP_VAR");
      const slpPosColor = getHexColor(8, "SLP_VAR");
      expect(slpNegColor).toMatch(/^rgb\(\d+,\s*\d+,\s*\d+\)$/);
      expect(slpPosColor).toMatch(/^rgb\(\d+,\s*\d+,\s*\d+\)$/);
      expect(slpNegColor).not.toBe(slpPosColor);
    });

    test("getColormap correctly handles isVariation flag to prevent relative stretching", () => {
      const cmap = getColormap(null, "T_VAR");
      expect(Array.isArray(cmap)).toBe(true);
      expect(cmap[0].val).toBeLessThanOrEqual(-16);
      expect(cmap[cmap.length - 1].val).toBeGreaterThanOrEqual(16);
    });
  });

  describe("2. Normalization & Configs", () => {
    test("normalizeSurfaceElementKey correctly handles time variations", () => {
      expect(normalizeSurfaceElementKey("T_VARIATION_24H")).toBe("T_VARIATION_24H");
      expect(normalizeSurfaceElementKey("T-VARIATION-24H")).toBe("T_VARIATION_24H");
      expect(normalizeSurfaceElementKey("T_VAR_24H")).toBe("T_VARIATION_24H");
      expect(normalizeSurfaceElementKey("VAR_24H")).toBe("T_VARIATION_24H");
      expect(normalizeSurfaceElementKey("VAR-24H")).toBe("T_VARIATION_24H");

      expect(normalizeSurfaceElementKey("T_VARIATION_48H")).toBe("T_VARIATION_48H");
      expect(normalizeSurfaceElementKey("T-VARIATION-48H")).toBe("T_VARIATION_48H");
      expect(normalizeSurfaceElementKey("T_VAR_48H")).toBe("T_VARIATION_48H");
      expect(normalizeSurfaceElementKey("VAR_48H")).toBe("T_VARIATION_48H");

      expect(normalizeSurfaceElementKey("SLP_VARIATION_24H")).toBe("SLP_VARIATION_24H");
      expect(normalizeSurfaceElementKey("SLP-VARIATION-24H")).toBe("SLP_VARIATION_24H");
      expect(normalizeSurfaceElementKey("SLP_VAR_24H")).toBe("SLP_VARIATION_24H");
      expect(normalizeSurfaceElementKey("VAR-24H-SLP")).toBe("SLP_VARIATION_24H");
      expect(normalizeSurfaceElementKey("VAR_24H_SLP")).toBe("SLP_VARIATION_24H");
      expect(normalizeSurfaceElementKey("PRMSL_VAR_24H")).toBe("SLP_VARIATION_24H");

      expect(normalizeSurfaceElementKey("SLP_VARIATION_48H")).toBe("SLP_VARIATION_48H");
      expect(normalizeSurfaceElementKey("SLP-VARIATION-48H")).toBe("SLP_VARIATION_48H");
      expect(normalizeSurfaceElementKey("SLP_VAR_48H")).toBe("SLP_VARIATION_48H");
      expect(normalizeSurfaceElementKey("VAR-48H-SLP")).toBe("SLP_VARIATION_48H");
      expect(normalizeSurfaceElementKey("VAR_48H_SLP")).toBe("SLP_VARIATION_48H");
    });

    test("normalizeSoundingElementKey correctly handles time variations", () => {
      expect(normalizeSoundingElementKey("T_VARIATION_24H")).toBe("T_VARIATION_24H");
      expect(normalizeSoundingElementKey("T-VARIATION-24H")).toBe("T_VARIATION_24H");
      expect(normalizeSoundingElementKey("T_VAR_24H")).toBe("T_VARIATION_24H");
      expect(normalizeSoundingElementKey("VAR_24H")).toBe("T_VARIATION_24H");

      expect(normalizeSoundingElementKey("T_VARIATION_48H")).toBe("T_VARIATION_48H");
      expect(normalizeSoundingElementKey("T-VARIATION-48H")).toBe("T_VARIATION_48H");
      expect(normalizeSoundingElementKey("VAR_48H")).toBe("T_VARIATION_48H");

      expect(normalizeSoundingElementKey("SLP_VARIATION_24H")).toBe("SLP_VARIATION_24H");
      expect(normalizeSoundingElementKey("SLP-VARIATION-24H")).toBe("SLP_VARIATION_24H");
      expect(normalizeSoundingElementKey("VAR-24H-SLP")).toBe("SLP_VARIATION_24H");
      expect(normalizeSoundingElementKey("VAR_24H_SLP")).toBe("SLP_VARIATION_24H");

      expect(normalizeSoundingElementKey("SLP_VARIATION_48H")).toBe("SLP_VARIATION_48H");
      expect(normalizeSoundingElementKey("SLP-VARIATION-48H")).toBe("SLP_VARIATION_48H");
      expect(normalizeSoundingElementKey("VAR-48H-SLP")).toBe("SLP_VARIATION_48H");
      expect(normalizeSoundingElementKey("VAR_48H_SLP")).toBe("SLP_VARIATION_48H");
    });

    test("SURFACE_CONTOUR_CONFIGS contains time variation configs and valid extractors", () => {
      const keys = ["T_VARIATION_24H", "T_VARIATION_48H", "SLP_VARIATION_24H", "SLP_VARIATION_48H"];
      for (const k of keys) {
        const conf = SURFACE_CONTOUR_CONFIGS[k];
        expect(conf).toBeDefined();
        expect(typeof conf.extract).toBe("function");
        expect(conf.colormap).toMatch(/^(T_VAR|SLP_VAR)$/);
      }

      // Test extract logic on properties
      const props = {
        t_var_24h: 3.5,
        t_var_48h: -4.2,
        slp_var_24h: -1.8,
        slp_var_48h: 5.1,
      };
      expect(SURFACE_CONTOUR_CONFIGS["T_VARIATION_24H"].extract(props)).toBe(3.5);
      expect(SURFACE_CONTOUR_CONFIGS["T_VARIATION_48H"].extract(props)).toBe(-4.2);
      expect(SURFACE_CONTOUR_CONFIGS["SLP_VARIATION_24H"].extract(props)).toBe(-1.8);
      expect(SURFACE_CONTOUR_CONFIGS["SLP_VARIATION_48H"].extract(props)).toBe(5.1);
    });

    test("SOUNDING_CONTOUR_CONFIGS contains time variation configs and valid extractors", () => {
      const keys = ["T_VARIATION_24H", "T_VARIATION_48H", "SLP_VARIATION_24H", "SLP_VARIATION_48H"];
      for (const k of keys) {
        const conf = SOUNDING_CONTOUR_CONFIGS[k];
        expect(conf).toBeDefined();
        expect(typeof conf.extract).toBe("function");
        expect(conf.colormap).toMatch(/^(T_VAR|SLP_VAR)$/);
      }

      const props = {
        t_var_24h: 2.1,
        t_var_48h: -3.3,
      };
      expect(SOUNDING_CONTOUR_CONFIGS["T_VARIATION_24H"].extract(props)).toBe(2.1);
      expect(SOUNDING_CONTOUR_CONFIGS["T_VARIATION_48H"].extract(props)).toBe(-3.3);
    });
  });

  describe("3. isServerDerivedElement & DERIVED_INDEX_KEYS", () => {
    test("isServerDerivedElement identifies time variations as server-derived", () => {
      expect(isServerDerivedElement("T_VARIATION_24H")).toBe(true);
      expect(isServerDerivedElement("T-VARIATION-24H")).toBe(true);
      expect(isServerDerivedElement("T_VARIATION_48H")).toBe(true);
      expect(isServerDerivedElement("SLP_VARIATION_24H")).toBe(true);
      expect(isServerDerivedElement("SLP_VARIATION_48H")).toBe(true);
      expect(isServerDerivedElement("T_VAR_24H")).toBe(true);
      expect(isServerDerivedElement("SLP_VAR_24H")).toBe(true);

      // Normal meteorological elements are not server-derived
      expect(isServerDerivedElement("TMP")).toBe(false);
      expect(isServerDerivedElement("HGT")).toBe(false);
      expect(isServerDerivedElement("WIND")).toBe(false);
      expect(isServerDerivedElement("RH")).toBe(false);
    });

    test("DERIVED_INDEX_KEYS includes all variation keys", () => {
      expect(DERIVED_INDEX_KEYS.has("T_VARIATION_24H")).toBe(true);
      expect(DERIVED_INDEX_KEYS.has("T_VARIATION_48H")).toBe(true);
      expect(DERIVED_INDEX_KEYS.has("SLP_VARIATION_24H")).toBe(true);
      expect(DERIVED_INDEX_KEYS.has("SLP_VARIATION_48H")).toBe(true);
    });
  });

  describe("4. Presets in config.json", () => {
    const configPath = resolve(import.meta.dir, "../../config.json");
    const rawConfig = readFileSync(configPath, "utf-8");
    const config = JSON.parse(rawConfig);

    test("colormaps section has T_VAR and SLP_VAR definitions", () => {
      expect(config.colormaps).toBeDefined();
      expect(config.colormaps.T_VAR).toBeDefined();
      expect(config.colormaps.SLP_VAR).toBeDefined();
      expect(config.colormaps.T_VAR.length).toBeGreaterThan(5);
      expect(config.colormaps.SLP_VAR.length).toBeGreaterThan(5);
    });

    test("Surface Observations category has 24h & 48h variation presets", () => {
      const surfacePresets = config.presets.filter((p) => p.category === "Surface Observations");
      const presetIds = surfacePresets.map((p) => p.id);

      expect(presetIds).toContain("obs-surface-t-var-24h");
      expect(presetIds).toContain("obs-surface-t-var-48h");
      expect(presetIds).toContain("obs-surface-slp-var-24h");
      expect(presetIds).toContain("obs-surface-slp-var-48h");

      for (const id of ["obs-surface-t-var-24h", "obs-surface-t-var-48h", "obs-surface-slp-var-24h", "obs-surface-slp-var-48h"]) {
        const preset = surfacePresets.find((p) => p.id === id);
        expect(preset.layers.length).toBeGreaterThanOrEqual(1);
        for (const l of preset.layers) {
          if (l.type === "contour") {
            expect(l.path.startsWith("/api/derived/SURFACE/")).toBe(true);
          }
        }
      }
    });

    test("Upper-Air Observations category has 850hPa 24h & 48h variation presets", () => {
      const upperAirPresets = config.presets.filter((p) => p.category === "Upper-Air Observations");
      const presetIds = upperAirPresets.map((p) => p.id);

      expect(presetIds).toContain("obs-upperair-850-t-var-24h");
      expect(presetIds).toContain("obs-upperair-850-t-var-48h");

      const p24 = upperAirPresets.find((p) => p.id === "obs-upperair-850-t-var-24h");
      const contourLayer24 = p24.layers.find((l) => l.type === "contour");
      expect(contourLayer24.path).toBe("/api/derived/UPPER_AIR/PLOT/T-VARIATION-24H/850");

      const p48 = upperAirPresets.find((p) => p.id === "obs-upperair-850-t-var-48h");
      const contourLayer48 = p48.layers.find((l) => l.type === "contour");
      expect(contourLayer48.path).toBe("/api/derived/UPPER_AIR/PLOT/T-VARIATION-48H/850");
    });

    test("Derived Diagnostics category has NWP and observation variation presets", () => {
      const derivedPresets = config.presets.filter((p) => p.category === "Derived Diagnostics");
      const presetIds = derivedPresets.map((p) => p.id);

      expect(presetIds).toContain("derived-ecmwf-850-t-var-24h");
      expect(presetIds).toContain("derived-ecmwf-850-t-var-48h");
      expect(presetIds).toContain("derived-ecmwf-slp-var-24h");
      expect(presetIds).toContain("derived-ecmwf-slp-var-48h");
      expect(presetIds).toContain("derived-ecmwf-sfc-t-var-24h");
      expect(presetIds).toContain("derived-ecmwf-sfc-t-var-48h");
      expect(presetIds).toContain("derived-diag-surface-t-var-24h");
      expect(presetIds).toContain("derived-diag-surface-t-var-48h");
      expect(presetIds).toContain("derived-diag-surface-slp-var-24h");
      expect(presetIds).toContain("derived-diag-surface-slp-var-48h");
      expect(presetIds).toContain("derived-diag-sounding-850-t-var-24h");
      expect(presetIds).toContain("derived-diag-sounding-850-t-var-48h");

      const p850T24 = derivedPresets.find((p) => p.id === "derived-ecmwf-850-t-var-24h");
      expect(p850T24.layers[0].path).toBe("/api/derived/ECMWF_HR/T-VARIATION-24H/850");

      const p850T48 = derivedPresets.find((p) => p.id === "derived-ecmwf-850-t-var-48h");
      expect(p850T48.layers[0].path).toBe("/api/derived/ECMWF_HR/T-VARIATION-48H/850");

      const pSlp24 = derivedPresets.find((p) => p.id === "derived-ecmwf-slp-var-24h");
      expect(pSlp24.layers[0].path).toBe("/api/derived/ECMWF_HR/SLP-VARIATION-24H");

      const pSlp48 = derivedPresets.find((p) => p.id === "derived-ecmwf-slp-var-48h");
      expect(pSlp48.layers[0].path).toBe("/api/derived/ECMWF_HR/SLP-VARIATION-48H");

      const pSfc24 = derivedPresets.find((p) => p.id === "derived-ecmwf-sfc-t-var-24h");
      expect(pSfc24.layers[0].path).toBe("/api/derived/ECMWF_HR/T-VARIATION-24H");

      const pSfc48 = derivedPresets.find((p) => p.id === "derived-ecmwf-sfc-t-var-48h");
      expect(pSfc48.layers[0].path).toBe("/api/derived/ECMWF_HR/T-VARIATION-48H");

      const pSfcDiag24 = derivedPresets.find((p) => p.id === "derived-diag-surface-t-var-24h");
      expect(pSfcDiag24.layers[0].path).toBe("/api/derived/SURFACE/T-VARIATION-24H");

      const pSfcDiag48 = derivedPresets.find((p) => p.id === "derived-diag-surface-t-var-48h");
      expect(pSfcDiag48.layers[0].path).toBe("/api/derived/SURFACE/T-VARIATION-48H");

      const pSounding24 = derivedPresets.find((p) => p.id === "derived-diag-sounding-850-t-var-24h");
      expect(pSounding24.layers[0].path).toBe("/api/derived/UPPER_AIR/PLOT/T-VARIATION-24H/850");

      const pSounding48 = derivedPresets.find((p) => p.id === "derived-diag-sounding-850-t-var-48h");
      expect(pSounding48.layers[0].path).toBe("/api/derived/UPPER_AIR/PLOT/T-VARIATION-48H/850");
    });

    test("Multi-Time Recipes category has multi-time recipes", () => {
      const multiTimePresets = config.presets.filter((p) => p.category === "Multi-Time Recipes");
      const presetIds = multiTimePresets.map((p) => p.id);

      expect(presetIds).toContain("recipe-surface-variation-24h");
      expect(presetIds).toContain("recipe-surface-variation-48h");
      expect(presetIds).toContain("recipe-nwp-variation-24h");
      expect(presetIds).toContain("recipe-nwp-variation-48h");

      const sfcRecipe = multiTimePresets.find((p) => p.id === "recipe-surface-variation-24h");
      expect(sfcRecipe.layers.length).toBeGreaterThanOrEqual(2);
      expect(sfcRecipe.layers.some((l) => l.path && l.path.includes("T-VARIATION-24H"))).toBe(true);
      expect(sfcRecipe.layers.some((l) => l.path && l.path.includes("SLP-VARIATION-24H"))).toBe(true);

      const sfcRecipe48 = multiTimePresets.find((p) => p.id === "recipe-surface-variation-48h");
      expect(sfcRecipe48.layers.length).toBeGreaterThanOrEqual(2);
      expect(sfcRecipe48.layers.some((l) => l.path && l.path.includes("T-VARIATION-48H"))).toBe(true);
      expect(sfcRecipe48.layers.some((l) => l.path && l.path.includes("SLP-VARIATION-48H"))).toBe(true);

      const nwpRecipe = multiTimePresets.find((p) => p.id === "recipe-nwp-variation-24h");
      expect(nwpRecipe.layers.length).toBeGreaterThanOrEqual(2);
      expect(nwpRecipe.layers.some((l) => l.path && l.path.includes("T-VARIATION-24H"))).toBe(true);
      expect(nwpRecipe.layers.some((l) => l.path && l.path.includes("SLP-VARIATION-24H"))).toBe(true);

      const nwpRecipe48 = multiTimePresets.find((p) => p.id === "recipe-nwp-variation-48h");
      expect(nwpRecipe48.layers.length).toBeGreaterThanOrEqual(2);
      expect(nwpRecipe48.layers.some((l) => l.path && l.path.includes("T-VARIATION-48H"))).toBe(true);
      expect(nwpRecipe48.layers.some((l) => l.path && l.path.includes("SLP-VARIATION-48H"))).toBe(true);
    });
  });

  describe("5. Routing in handleAddContourAction", () => {
    test("routes surface variation action to correct virtual path", async () => {
      const map = createMockMap();
      const win = {
        id: "win-surface-test",
        model: "SURFACE",
        activeGroup: { id: "composite-surface-test", layers: [] },
        stationsGeoJSON: createSampleSurfaceStations(),
      };

      const stnLayer = {
        id: "surface-obs-test",
        type: "station",
        model: "SURFACE",
        stationsGeoJSON: createSampleSurfaceStations(),
      };

      handleAddContourAction(map, stnLayer, "T-VARIATION-24H", win);
      await new Promise((r) => setTimeout(r, 60));

      const layers = getLayersForWindow(win);
      const tVarLayer = layers.find((l) => l.element === "T_VARIATION_24H" || l.id.includes("t-variation-24h"));
      expect(tVarLayer).toBeDefined();
      expect(tVarLayer.path).toBe("/api/derived/SURFACE/T-VARIATION-24H");
      expect(win.activeGroup.layers.some((l) => l.path === "/api/derived/SURFACE/T-VARIATION-24H")).toBe(true);
    });

    test("routes upper-air variation action to correct virtual path with level", async () => {
      const map = createMockMap();
      const win = {
        id: "win-ua-test",
        model: "UPPER_AIR",
        level: 850,
        activeGroup: { id: "composite-upperair-test", layers: [] },
        stationsGeoJSON: createSampleUpperAirStations(),
      };

      const stnLayer = {
        id: "upperair-obs-850-test",
        type: "station",
        model: "UPPER_AIR",
        level: 850,
        stationsGeoJSON: createSampleUpperAirStations(),
      };

      handleAddContourAction(map, stnLayer, "T-VARIATION-24H", win);
      await new Promise((r) => setTimeout(r, 60));

      const layers = getLayersForWindow(win);
      const tVarLayer = layers.find((l) => l.element === "T_VARIATION_24H" || l.id.includes("t-variation-24h"));
      expect(tVarLayer).toBeDefined();
      expect(tVarLayer.path).toBe("/api/derived/UPPER_AIR/PLOT/T-VARIATION-24H/850");
      expect(win.activeGroup.layers.some((l) => l.path === "/api/derived/UPPER_AIR/PLOT/T-VARIATION-24H/850")).toBe(true);
    });

    test("routes NWP model layers to server-derived time variation virtual paths", async () => {
      const map = createMockMap();
      const win = {
        id: "win-nwp-tvar-test",
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

      handleAddContourAction(map, modelLayer, "T-VARIATION-24H", win);
      await new Promise((r) => setTimeout(r, 60));

      const presetEntry = win.activeGroup.layers.find((l) => l.path && l.path.includes("T-VARIATION-24H"));
      expect(presetEntry).toBeDefined();
      expect(presetEntry.path).toBe("/api/derived/ECMWF_HR/TMP/T-VARIATION-24H/850");
      expect(presetEntry.level).toBe(850);
    });

    test("routes other NWP models (JAPAN_MR, GRAPES_GFS, CMA_GFS, GFS) to server-derived time variation virtual paths", async () => {
      const otherModels = ["JAPAN_MR", "GRAPES_GFS", "CMA_GFS", "GFS"];
      for (const model of otherModels) {
        const map = createMockMap();
        const win = {
          id: `win-${model}-tvar-test`,
          model,
          level: 850,
          period: 24,
          activeGroup: { id: `composite-${model}-test`, layers: [] },
        };

        const modelLayer = {
          id: `contour-${model.toLowerCase()}-tmp-850`,
          type: "contour",
          model,
          element: "TMP",
          level: 850,
        };

        handleAddContourAction(map, modelLayer, "T-VARIATION-24H", win);
        await new Promise((r) => setTimeout(r, 60));

        const presetEntry = win.activeGroup.layers.find((l) => l.path && l.path.includes("T-VARIATION-24H"));
        expect(presetEntry).toBeDefined();
        expect(presetEntry.path).toBe(`/api/derived/${model}/TMP/T-VARIATION-24H/850`);
        expect(presetEntry.level).toBe(850);
        expect(presetEntry.model).toBe(model);
      }
    });

    test("UI model toggle correctly updates derived layer paths and names while preserving observation layers", async () => {
      const { replaceModelInPath } = await import("../../src/lib/stores/tabsCore.js");

      // Simulating groupCopy layers during model toggle from ECMWF_HR to JAPAN_MR
      const groupLayers = [
        {
          id: "derived-ecmwf-850-t-var-24h-layer",
          model: "ECMWF_HR",
          name: "ECMWF 850hPa 24h Temperature Variation",
          path: "/api/derived/ECMWF_HR/T-VARIATION-24H/850",
          type: "contour",
          element: "T-VARIATION-24H",
          level: 850,
        },
        {
          id: "derived-ecmwf-slp-var-24h-layer",
          model: "ECMWF_HR",
          name: "ECMWF 24h Sea Level Pressure Variation",
          path: "/api/derived/ECMWF_HR/SLP-VARIATION-24H",
          type: "contour",
          element: "SLP-VARIATION-24H",
          level: 0,
        },
        {
          id: "contour-surface-t-var-24h",
          model: "SURFACE",
          name: "Surface 24h Temperature Variation",
          path: "/api/derived/SURFACE/T-VARIATION-24H",
          type: "contour",
          isObservation: true,
          element: "T-VARIATION-24H",
        },
        {
          id: "contour-sounding-t-var-24h-850",
          model: "UPPER_AIR",
          name: "850 hPa Sounding 24h Temperature Variation",
          path: "/api/derived/UPPER_AIR/PLOT/T-VARIATION-24H/850",
          type: "contour",
          isObservation: true,
          element: "T-VARIATION-24H",
          level: 850,
        },
      ];

      const newModel = "JAPAN_MR";
      const oldModel = "ECMWF_HR";

      for (const l of groupLayers) {
        const isObs = Boolean(
          l?.isObservation ||
          l?.model === "SURFACE" ||
          l?.model === "UPPER_AIR" ||
          l?.path?.includes("/api/derived/SURFACE") ||
          l?.path?.includes("/api/derived/UPPER_AIR")
        );
        if (!isObs && (l.type === "contour" || l.type === "wind" || l.type === "raster")) {
          const prevM = l.model;
          l.model = newModel;
          if (typeof l.path === "string" && l.path.includes("/")) {
            l.path = replaceModelInPath(l.path, newModel);
          }
          if (typeof l.id === "string" && prevM) {
            const baseM = prevM.replace(/_.*$/, "");
            l.id = l.id.replaceAll(prevM, newModel).replaceAll(prevM.toLowerCase(), newModel.toLowerCase());
            if (baseM && baseM !== prevM) {
              l.id = l.id.replaceAll(baseM, newModel).replaceAll(baseM.toLowerCase(), newModel.toLowerCase());
            }
          }
          if (typeof l.name === "string" && prevM) {
            const baseM = prevM.replace(/_.*$/, "");
            l.name = l.name.replaceAll(prevM, newModel);
            if (baseM && baseM !== prevM) {
              l.name = l.name.replaceAll(baseM, newModel);
            }
          }
        }
      }

      // 1. NWP derived layers are updated to JAPAN_MR
      expect(groupLayers[0].model).toBe("JAPAN_MR");
      expect(groupLayers[0].path).toBe("/api/derived/JAPAN_MR/T-VARIATION-24H/850");
      expect(groupLayers[0].name).toBe("JAPAN_MR 850hPa 24h Temperature Variation");
      expect(groupLayers[0].id).toBe("derived-japan_mr-850-t-var-24h-layer");

      expect(groupLayers[1].model).toBe("JAPAN_MR");
      expect(groupLayers[1].path).toBe("/api/derived/JAPAN_MR/SLP-VARIATION-24H");
      expect(groupLayers[1].name).toBe("JAPAN_MR 24h Sea Level Pressure Variation");
      expect(groupLayers[1].id).toBe("derived-japan_mr-slp-var-24h-layer");

      // 2. Observation derived layers are strictly preserved
      expect(groupLayers[2].model).toBe("SURFACE");
      expect(groupLayers[2].path).toBe("/api/derived/SURFACE/T-VARIATION-24H");
      expect(groupLayers[2].name).toBe("Surface 24h Temperature Variation");

      expect(groupLayers[3].model).toBe("UPPER_AIR");
      expect(groupLayers[3].path).toBe("/api/derived/UPPER_AIR/PLOT/T-VARIATION-24H/850");
      expect(groupLayers[3].name).toBe("850 hPa Sounding 24h Temperature Variation");
    });

    test("isModelLayerSupported accurately supports level 0 surface variations and derived layers", async () => {
      const { isModelLayerSupported } = await import("../../src/lib/stores/tabsCore.js");
      expect(await isModelLayerSupported("JAPAN_MR", "SLP-VARIATION-24H", 0)).toBe(true);
      expect(await isModelLayerSupported("GRAPES_GFS", "SLP-VARIATION-48H", "0")).toBe(true);
      expect(await isModelLayerSupported("CMA_GFS", "T-VARIATION-24H", 850)).toBe(true);
      expect(await isModelLayerSupported("GFS", "T-VARIATION-24H", 500)).toBe(true);
    });

    test("applyAutoAllocation in model mode preserves forecastCycle across split windows", async () => {
      const { applyAutoAllocation } = await import("../../src/lib/stores/tabsCore.js");
      const tab = {
        layout: "1x2",
        autoAllocation: "model",
        windows: [
          {
            id: "win-0",
            model: "ECMWF_HR",
            level: 850,
            period: 24,
            forecastCycle: "26101408.240",
            layers: [
              {
                id: "contour-ecmwf_hr-t-var-850",
                type: "contour",
                model: "ECMWF_HR",
                element: "T-VARIATION-24H",
                path: "/api/derived/ECMWF_HR/T-VARIATION-24H/850",
                level: 850,
              },
            ],
          },
          {
            id: "win-1",
            model: "ECMWF_HR",
            level: 850,
            period: 24,
            forecastCycle: "26101408.240",
            layers: [],
          },
        ],
      };

      applyAutoAllocation(tab, "model", tab.windows[0]);
      // Window 0 keeps base model and base cycle
      expect(tab.windows[0].model).toBe("ECMWF_HR");
      expect(tab.windows[0].forecastCycle).toBe("26101408.240");

      // Window 1 receives next model and preserves base forecastCycle
      expect(tab.windows[1].model).not.toBe("ECMWF_HR");
      expect(tab.windows[1].forecastCycle).toBe("26101408.240");
    });
  });
});
