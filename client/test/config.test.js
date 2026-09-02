// config.test.js - Unit tests for config.json multi-line human-readable formatting and auto-save
import { test, expect, describe } from "bun:test";
import { formatCompactJSON, autoSaveLayerConfig, CURRENT_CONFIG } from "../src/config/presets.js";
import fs from "fs";

describe("Configuration File Validation & Auto-Save (config.json)", () => {
  test("config.json is human-readable, multi-line indented and contains preset groups", () => {
    const raw = fs.readFileSync("./public/config.json", "utf8");
    const lines = raw.split("\n");
    expect(lines.length).toBeGreaterThan(50); // Must not be minified into 1 line

    const parsed = JSON.parse(raw);
    expect(parsed).toHaveProperty("presets");
    expect(parsed).toHaveProperty("colormaps");
    expect(Array.isArray(parsed.presets)).toBe(true);
    expect(parsed.presets.length).toBeGreaterThan(0);

    for (const group of parsed.presets) {
      expect(group).toHaveProperty("id");
      expect(group).toHaveProperty("name");
      expect(Array.isArray(group.layers)).toBe(true);
    }
  });

  test("formatCompactJSON keeps color arrays on single lines while maintaining multi-line formatting", () => {
    const sample = {
      colormaps: {
        TMP: [
          { val: 0, color: [180, 240, 240, 255] },
          { val: 10, color: [100, 210, 110, 255] },
        ],
      },
      presets: [
        {
          id: "test",
          name: "Test Group",
          layers: [],
        },
      ],
    };
    const formatted = formatCompactJSON(sample);
    expect(formatted.split("\n").length).toBeGreaterThan(5);
    expect(formatted).toContain('"color": [180, 240, 240, 255]');
    expect(formatted).toContain('{ "val": 0, "color": [180, 240, 240, 255] }');
  });

  test("autoSaveLayerConfig propagates contour, wind, station filter rules, and basemap to in-memory config", () => {
    // Populate CURRENT_CONFIG with dummy presets
    CURRENT_CONFIG.presets = [
      {
        id: "composite-500hpa",
        layers: [
          { id: "hgt", model: "ECMWF_HR", element: "HGT", level: 500, render: {} },
          { id: "wind", model: "ECMWF_HR", element: "WIND", level: 500, render: {} },
        ],
      },
      {
        id: "composite-surface",
        layers: [
          { id: "surface-obs", model: "SURFACE", element: "PLOT_GLOBAL_3H", render: {} },
        ],
      },
    ];

    // 1. Update Contour Line config
    autoSaveLayerConfig({
      id: "hgt",
      model: "ECMWF_HR",
      element: "HGT",
      level: 500,
      config: {
        showLine: true,
        showFill: false,
        lineColor: "#ff0000",
        lineWidth: 3.5,
        boldValues: [5880, 588],
        boldLineWidth: 5.0,
        smooth: true,
        smoothIterations: 2,
      },
    });

    const hgtLayer = CURRENT_CONFIG.presets[0].layers[0];
    expect(hgtLayer.render.showLine).toBe(true);
    expect(hgtLayer.render.showFill).toBe(false);
    expect(hgtLayer.render.lineColor).toBe("#ff0000");
    expect(hgtLayer.render.lineWidth).toBe(3.5);
    expect(hgtLayer.render.boldValues).toEqual([5880, 588]);
    expect(hgtLayer.render.boldLineWidth).toBe(5.0);
    expect(hgtLayer.render.smooth).toBe(true);
    expect(hgtLayer.render.smoothIterations).toBe(2);

    // 2. Update Wind Streamlines & Barbs config
    autoSaveLayerConfig({
      id: "wind",
      model: "ECMWF_HR",
      element: "WIND",
      level: 500,
      config: {
        showWind: true,
        showBarbs: true,
        showRaster: false,
      },
    });

    const windLayer = CURRENT_CONFIG.presets[0].layers[1];
    expect(windLayer.render.showWind).toBe(true);
    expect(windLayer.render.showBarbs).toBe(true);

    // 3. Update Station Filter Rules & Field toggles
    autoSaveLayerConfig({
      id: "surface-obs",
      model: "SURFACE",
      element: "PLOT_GLOBAL_3H",
      config: {
        showTemp: true,
        showDewpoint: false,
        showWind: true,
        showStreamlines: true,
        filterLogic: "AND",
        filterRules: [
          { field: "Wind", op: ">", val: "5" },
          { field: "Rain", op: ">", val: "10" },
        ],
      },
    });

    const stationLayer = CURRENT_CONFIG.presets[1].layers[0];
    expect(stationLayer.render.showTemp).toBe(true);
    expect(stationLayer.render.showDewpoint).toBe(false);
    expect(stationLayer.render.showStreamlines).toBe(true);
    expect(stationLayer.render.filterLogic).toBe("AND");
    expect(stationLayer.render.filterRules.length).toBe(2);
    expect(stationLayer.render.filterRules[0].field).toBe("Wind");

    // 4. Update Basemap settings
    autoSaveLayerConfig({
      type: "pmtiles",
      id: "pmtiles-base",
      config: {
        showGraticule: true,
        showProvinces: true,
        showCities: false,
      },
    });
    expect(CURRENT_CONFIG.basemap.showGraticule).toBe(true);
    expect(CURRENT_CONFIG.basemap.showCities).toBe(false);
  });
});
