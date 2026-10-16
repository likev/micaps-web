import { describe, it, expect } from "bun:test";
import { getStationDatasetType, isUpperAirStationLayer } from "../../src/ui/layers/layerDefaults.js";
import { extractSnowDepth, extractPressureChange, getFieldValue } from "../../src/layers/station/stationExtract.js";
import { VIEW_FIELD_ALIASES, FIELD_CONFIG_FLAGS, normalizeFilterField, filterFieldToConfigFlag } from "../../src/layers/station/stationFilter.js";
import {
  SURFACE_CONTOUR_CONFIGS,
  normalizeSurfaceElementKey,
} from "../../src/layers/analysis/contourConfigsSurface.js";
import { shouldAutoDeriveDefaultSLP } from "../../src/services/derivedContours.js";
import { renderStationPlotToCanvas } from "../../src/layers/station/stationPlot.js";

describe("Specialized Station Datasets", () => {
  describe("1. Dataset Type Identification (getStationDatasetType & isUpperAirStationLayer)", () => {
    it("identifies snow depth datasets", () => {
      expect(getStationDatasetType({ model: "SURFACE", element: "SNOW_DEPTH_ALL_STATION" })).toBe("snow_depth");
      expect(getStationDatasetType({ path: "/api/data/surface/snow_depth_all_station" })).toBe("snow_depth");
      expect(getStationDatasetType({ id: "stn-snow_depth" })).toBe("snow_depth");
    });

    it("identifies 3h and 24h pressure change datasets", () => {
      expect(getStationDatasetType({ model: "SURFACE", element: "PRES_CHANGE_3H_NATIONAL" })).toBe("pres_change_3h");
      expect(getStationDatasetType({ path: "/api/data/surface/pres_change_3h" })).toBe("pres_change_3h");

      expect(getStationDatasetType({ model: "SURFACE", element: "PRES_CHANGE_24H_NATIONAL" })).toBe("pres_change_24h");
      expect(getStationDatasetType({ path: "/api/data/surface/pres_change_24h" })).toBe("pres_change_24h");
    });

    it("identifies 1-minute visibility datasets", () => {
      expect(getStationDatasetType({ model: "SURFACE", element: "HORIZONTAL_VISIBILITY_1MIN_ALL_STATION" })).toBe("visibility");
      expect(getStationDatasetType({ path: "/api/data/surface/horizontal_visibility_1min" })).toBe("visibility");
    });

    it("identifies satellite AMV wind vector datasets", () => {
      expect(getStationDatasetType({ model: "SATELLITE", element: "AMV", path: "SATELLITE/FY2G/L2/AMV/IR1" })).toBe("amv");
      expect(getStationDatasetType({ path: "SATELLITE/FY2G/L2/AMV/IR3" })).toBe("amv");
    });

    it("excludes AMV layers from isUpperAirStationLayer even if level is set", () => {
      const amvLayer = {
        type: "station",
        model: "SATELLITE",
        element: "AMV",
        path: "SATELLITE/FY2G/L2/AMV/IR1",
        level: 200,
      };
      expect(isUpperAirStationLayer(amvLayer)).toBe(false);

      const soundingLayer = {
        type: "station",
        model: "UPPER_AIR",
        element: "PLOT_GLOBAL_SOUNDING",
        level: 500,
      };
      expect(isUpperAirStationLayer(soundingLayer)).toBe(true);
    });

    it("returns standard for default synoptic surface station", () => {
      expect(getStationDatasetType({ model: "SURFACE", element: "PLOT_GLOBAL_3H" })).toBe("standard");
      expect(getStationDatasetType(null)).toBe("standard");
    });
  });

  describe("2. Field Extraction (extractSnowDepth, extractPressureChange, getFieldValue)", () => {
    it("extracts snow depth correctly from diverse property keys", () => {
      expect(extractSnowDepth({ snow_depth: 15.5 })).toBe(15.5);
      expect(extractSnowDepth({ snow_depth_24h: 22 })).toBe(22);
      expect(extractSnowDepth({ snowDepth: 8.0 })).toBe(8.0);
      expect(extractSnowDepth({ depth: 5 })).toBe(5);
      expect(extractSnowDepth({ val: 12 })).toBe(12);
      expect(extractSnowDepth({ value: 3.5 })).toBe(3.5);
      expect(extractSnowDepth({ snow_depth: 999999 })).toBeNull();
      expect(extractSnowDepth({})).toBeNull();
    });

    it("extracts pressure change (3h and 24h) correctly", () => {
      expect(extractPressureChange({ press_diff_3h: -2.4 }, 3)).toBe(-2.4);
      expect(extractPressureChange({ pDiff: 1.8 }, 3)).toBe(1.8);
      expect(extractPressureChange({ press_diff_24h: 5.2 }, 24)).toBe(5.2);
      expect(extractPressureChange({ pDiff24: -3.1 }, 24)).toBe(-3.1);
      expect(extractPressureChange({ press_diff_24h: 999999 }, 24)).toBeNull();
    });

    it("getFieldValue resolves SNOW_DEPTH, PRESS_DIFF_3H, and PRESS_DIFF_24H", () => {
      const props = {
        snow_depth: 14,
        press_diff_3h: -1.5,
        press_diff_24h: 3.2,
      };
      expect(getFieldValue(props, "SNOW_DEPTH")).toBe(14);
      expect(getFieldValue(props, "PRESS_DIFF_3H")).toBe(-1.5);
      expect(getFieldValue(props, "PRESS_DIFF_24H")).toBe(3.2);
    });
  });

  describe("3. Station Filter Aliases & Field Configuration", () => {
    it("normalizes snow depth and pressure change aliases via normalizeFilterField", () => {
      expect(normalizeFilterField("snow_depth")).toBe("SnowDepth");
      expect(normalizeFilterField("SNOWDEPTH")).toBe("SnowDepth");
      expect(normalizeFilterField("press_diff_3h")).toBe("PressDiff");
      expect(normalizeFilterField("press_diff_24h")).toBe("PressDiff");
      expect(normalizeFilterField("pres_change_3h")).toBe("PressDiff");
      expect(normalizeFilterField("pres_change_24h")).toBe("PressDiff");
      expect(VIEW_FIELD_ALIASES.SNOW_DEPTH).toBe("SnowDepth");
      expect(VIEW_FIELD_ALIASES.PRESS_DIFF_3H).toBe("PressDiff");
    });

    it("maps SnowDepth and PressDiff to FIELD_CONFIG_FLAGS via filterFieldToConfigFlag", () => {
      expect(filterFieldToConfigFlag("SnowDepth")).toBe("showSnowDepth");
      expect(filterFieldToConfigFlag("snow_depth")).toBe("showSnowDepth");
      expect(filterFieldToConfigFlag("PressDiff")).toBe("showTendency");
      expect(filterFieldToConfigFlag("press_diff_3h")).toBe("showTendency");
      expect(FIELD_CONFIG_FLAGS.SnowDepth).toBe("showSnowDepth");
      expect(FIELD_CONFIG_FLAGS.PressDiff).toBe("showTendency");
    });
  });

  describe("4. Surface Contour Configurations for Specialized Elements", () => {
    it("defines SNOW_DEPTH contour configuration", () => {
      const config = SURFACE_CONTOUR_CONFIGS.SNOW_DEPTH;
      expect(config).toBeDefined();
      expect(config.colormap).toBe("SNOW");
      expect(config.unit).toBe("cm");
      expect(typeof config.extract).toBe("function");
      expect(config.extract({ snow_depth: 12 })).toBe(12);
    });

    it("defines PRES_CHANGE_3H and PRES_CHANGE_24H contour configurations", () => {
      const p3 = SURFACE_CONTOUR_CONFIGS.PRES_CHANGE_3H;
      expect(p3).toBeDefined();
      expect(p3.unit).toBe("hPa");
      expect(p3.colormap).toBe("SLP_VAR");
      expect(p3.extract({ press_diff_3h: -1.2 })).toBe(-1.2);

      const p24 = SURFACE_CONTOUR_CONFIGS.PRES_CHANGE_24H;
      expect(p24).toBeDefined();
      expect(p24.unit).toBe("hPa");
      expect(p24.colormap).toBe("SLP_VAR");
      expect(p24.extract({ press_diff_24h: 3.5 })).toBe(3.5);
    });

    it("normalizes alias keys to primary keys", () => {
      expect(normalizeSurfaceElementKey("snow_depth")).toBe("SNOW_DEPTH");
      expect(normalizeSurfaceElementKey("press_diff_3h")).toBe("PRES_CHANGE_3H");
      expect(normalizeSurfaceElementKey("press_diff_24h")).toBe("PRES_CHANGE_24H");
      expect(normalizeSurfaceElementKey("PRESS_DIFF_3H")).toBe("PRES_CHANGE_3H");
      expect(normalizeSurfaceElementKey("PRESS_DIFF_24H")).toBe("PRES_CHANGE_24H");
    });
  });

  describe("5. Auto-Derive Contour Guard", () => {
    it("allows auto SLP contours for standard synoptic layers", () => {
      const layer = {
        model: "SURFACE",
        element: "PLOT_GLOBAL_3H",
        path: "SURFACE/PLOT_GLOBAL_3H",
      };
      expect(shouldAutoDeriveDefaultSLP(layer)).toBe(true);
    });

    it("suppresses auto SLP contours for specialized single-element station datasets", () => {
      expect(shouldAutoDeriveDefaultSLP({ element: "SNOW_DEPTH_ALL_STATION" })).toBe(false);
      expect(shouldAutoDeriveDefaultSLP({ path: "SURFACE/PRES_CHANGE_3H_NATIONAL" })).toBe(false);
      expect(shouldAutoDeriveDefaultSLP({ path: "SURFACE/PRES_CHANGE_24H_NATIONAL" })).toBe(false);
      expect(shouldAutoDeriveDefaultSLP({ element: "HORIZONTAL_VISIBILITY_1MIN_ALL_STATION" })).toBe(false);
      expect(shouldAutoDeriveDefaultSLP({ path: "SATELLITE/FY2G/L2/AMV/IR1" })).toBe(false);
    });
  });

  describe("6. Canvas Plotting for Specialized Elements", () => {
    it("renders snow depth and pressure change onto canvas mock without throwing", () => {
      const calls = [];
      const mockCtx = {
        font: "",
        fillStyle: "",
        textAlign: "",
        textBaseline: "",
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        strokeText: () => {},
        fillText: (text, x, y) => calls.push({ text, x, y }),
        measureText: () => ({ width: 20 }),
      };

      const point = {
        x: 100,
        y: 100,
        snowDepth: 18,
        pDiff24: -2.3,
      };

      // When snow depth enabled
      renderStationPlotToCanvas(mockCtx, point, {
        showSnowDepth: true,
        showTendency: true,
      }, "dark", false);

      const renderedTexts = calls.map((c) => c.text);
      expect(renderedTexts).toContain("18");
      expect(renderedTexts.some((t) => t.includes("-2.3"))).toBe(true);
    });
  });
});
