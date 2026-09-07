// palette_persistence.test.js - Tests preserving custom XML raster palettes across timeline and layer updates
import { test, expect, describe, beforeEach } from "bun:test";
import { addOrUpdateLayer, getLayerById, clearWindowWeatherLayers } from "../src/ui/layerControl.js";
import { autoSaveLayerConfig, CURRENT_CONFIG } from "../src/config/presets.js";

describe("Raster Palette Configuration Persistence", () => {
  beforeEach(() => {
    clearWindowWeatherLayers("test-win");
  });

  test("addOrUpdateLayer preserves custom palettePath and colormap across re-registration", () => {
    const winId = "test-win";

    // 1. Initial layer creation
    addOrUpdateLayer(winId, {
      id: "contour-TMP",
      name: "500 hPa Temperature (ECMWF_HR)",
      type: "contour",
      element: "TMP",
      level: 500,
      config: {
        showFill: false,
        showLine: true,
        showRaster: true,
        palettePath: "/palettes/temperature/dark-temperature.xml",
      },
      colormap: "palette:contour-TMP",
    });

    let layer = getLayerById("contour-TMP", winId);
    expect(layer).not.toBeNull();
    expect(layer.config.palettePath).toBe("/palettes/temperature/dark-temperature.xml");
    expect(layer.colormap).toBe("palette:contour-TMP");

    // 2. Simulate timeline chip change: new time step data arrives and calls addOrUpdateLayer
    // The incoming definition from preset or loader might not have palettePath explicitly in config
    addOrUpdateLayer(winId, {
      id: "contour-TMP",
      name: "500 hPa Temperature (ECMWF_HR)",
      type: "contour",
      element: "TMP",
      level: 500,
      file: "2026082812.030",
      config: {
        showFill: false,
        showLine: true,
        showRaster: true,
      },
    });

    layer = getLayerById("contour-TMP", winId);
    expect(layer.config.palettePath).toBe("/palettes/temperature/dark-temperature.xml");
    expect(layer.colormap).toBe("palette:contour-TMP");
  });

  test("addOrUpdateLayer preserves custom palettePath and colormap on wind layers", () => {
    const winId = "test-win";

    // 1. Initial wind layer creation with custom palette
    addOrUpdateLayer(winId, {
      id: "wind-WIND",
      name: "500 hPa Wind Field (ECMWF_HR)",
      type: "wind",
      element: "WIND",
      level: 500,
      config: {
        showWind: true,
        showRaster: true,
        palettePath: "/palettes/wind/light-wind.xml",
      },
      colormap: "palette:wind-WIND",
    });

    let layer = getLayerById("wind-WIND", winId);
    expect(layer.config.palettePath).toBe("/palettes/wind/light-wind.xml");
    expect(layer.colormap).toBe("palette:wind-WIND");

    // 2. Timeline step change updates wind layer
    addOrUpdateLayer(winId, {
      id: "wind-WIND",
      name: "500 hPa Wind Field (ECMWF_HR)",
      type: "wind",
      element: "WIND",
      level: 500,
      file: "2026082812.036",
      config: {
        showWind: true,
        showRaster: true,
      },
    });

    layer = getLayerById("wind-WIND", winId);
    expect(layer.config.palettePath).toBe("/palettes/wind/light-wind.xml");
    expect(layer.colormap).toBe("palette:wind-WIND");
  });

  test("autoSaveLayerConfig preserves palettePath in preset layers", () => {
    // Setup in-memory config preset
    CURRENT_CONFIG.presets = [
      {
        id: "upper-air-500",
        name: "500 hPa Upper-Air",
        layers: [
          {
            id: "contour-sounding-dtd-500",
            type: "contour",
            model: "UPPER_AIR",
            element: "DTD",
            render: {},
          },
        ],
      },
    ];

    const testLayer = {
      id: "contour-sounding-dtd-500",
      type: "contour",
      model: "UPPER_AIR",
      element: "DTD",
      level: 500,
      config: {
        showRaster: true,
        palettePath: "/palettes/humidity/light-rh.xml",
      },
    };

    autoSaveLayerConfig(testLayer);

    const savedPresetLayer = CURRENT_CONFIG.presets[0].layers[0];
    expect(savedPresetLayer.render.palettePath).toBe("/palettes/humidity/light-rh.xml");
    expect(savedPresetLayer.render.showRaster).toBe(true);
  });

  test("addOrUpdateLayer preserves isExpanded state when layer is updated", () => {
    const winId = "test-win";

    addOrUpdateLayer(winId, {
      id: "contour-HGT",
      name: "500 hPa Height",
      type: "contour",
      element: "HGT",
      isExpanded: true,
      config: { palettePath: "/palettes/height/dark-height.xml" },
    });

    let layer = getLayerById("contour-HGT", winId);
    expect(layer.isExpanded).toBe(true);

    // Update on next time step without isExpanded in def
    addOrUpdateLayer(winId, {
      id: "contour-HGT",
      name: "500 hPa Height",
      type: "contour",
      element: "HGT",
      config: {},
    });

    layer = getLayerById("contour-HGT", winId);
    expect(layer.isExpanded).toBe(true);
    expect(layer.config.palettePath).toBe("/palettes/height/dark-height.xml");
  });
});
