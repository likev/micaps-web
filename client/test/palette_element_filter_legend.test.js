// palette_element_filter_legend.test.js - Comprehensive tests for element-specific palette filtering and legend persistence
import { test, expect, describe, beforeEach } from "bun:test";
import { getPaletteCategory, listPaletteFiles, filterPalettesForElement, loadXMLPalette, clearPaletteCache } from "../src/utils/paletteLoader.js";
import { getColormap, setColormaps, COLORMAPS, getCSSGradient } from "../src/utils/colormaps.js";
import { addOrUpdateLayer, getLayerById, clearWindowWeatherLayers } from "../src/ui/layerControl.js";
import { autoSaveLayerConfig, savePresetConfig, CURRENT_CONFIG } from "../src/config/presets.js";
import { buildLegendItems, updateLegend, clearLegends } from "../src/lib/stores/legendCore.js";
import { syncLegendForLayer } from "../src/ui/layers/legendSync.js";

describe("1. Meteorological Element Palette Category Mapping", () => {
  test("Rain elements map to RAIN category folder, never falling back to TMP", () => {
    expect(getPaletteCategory("RAIN")).toBe("RAIN");
    expect(getPaletteCategory("RAIN6")).toBe("RAIN");
    expect(getPaletteCategory("RAIN06")).toBe("RAIN");
    expect(getPaletteCategory("RAIN01")).toBe("RAIN");
    expect(getPaletteCategory("RAIN12")).toBe("RAIN");
    expect(getPaletteCategory("RAIN24")).toBe("RAIN");
    expect(getPaletteCategory("RAIN48")).toBe("RAIN");
    expect(getPaletteCategory("APCP")).toBe("RAIN");
    expect(getPaletteCategory("TP")).toBe("RAIN");
    expect(getPaletteCategory("PRECIPITATION")).toBe("RAIN");
    expect(getPaletteCategory("SNOW")).toBe("RAIN");
  });

  test("Temperature and dew point elements map correctly and preserve DTD -> TMP", () => {
    expect(getPaletteCategory("TMP")).toBe("TMP");
    expect(getPaletteCategory("TEMP")).toBe("TMP");
    expect(getPaletteCategory("T")).toBe("TMP");
    expect(getPaletteCategory("2T")).toBe("TMP");
    expect(getPaletteCategory("T2M")).toBe("TMP");
    expect(getPaletteCategory("TD")).toBe("TMP");
    expect(getPaletteCategory("DTD")).toBe("TMP");
    expect(getPaletteCategory("T-TD")).toBe("TMP");
    expect(getPaletteCategory("T_TD")).toBe("TMP");
  });

  test("Pressure, height, divergence and vorticity map to PRS_HGT", () => {
    expect(getPaletteCategory("SLP")).toBe("PRS_HGT");
    expect(getPaletteCategory("PRMSL")).toBe("PRS_HGT");
    expect(getPaletteCategory("HGT")).toBe("PRS_HGT");
    expect(getPaletteCategory("DIV")).toBe("PRS_HGT");
    expect(getPaletteCategory("VOR")).toBe("PRS_HGT");
  });

  test("Visibility and air quality map to ENV_VIS", () => {
    expect(getPaletteCategory("VIS")).toBe("ENV_VIS");
    expect(getPaletteCategory("VISIB")).toBe("ENV_VIS");
    expect(getPaletteCategory("AQI")).toBe("ENV_VIS");
    expect(getPaletteCategory("PM25")).toBe("ENV_VIS");
    expect(getPaletteCategory("PM2.5")).toBe("ENV_VIS");
  });

  test("Wind and stability elements map correctly", () => {
    expect(getPaletteCategory("WIND")).toBe("WIND");
    expect(getPaletteCategory("VVEL")).toBe("WIND");
    expect(getPaletteCategory("CAPE")).toBe("STABILITY");
    expect(getPaletteCategory("K")).toBe("STABILITY");
    expect(getPaletteCategory("RH")).toBe("RH");
  });
});

describe("2. Palette File Element-Level Filtering", () => {
  beforeEach(() => {
    clearPaletteCache();
  });

  test("Rain layers (RAIN6, RAIN06) list only rain/snow palettes and zero temperature palettes", async () => {
    const files = await listPaletteFiles("RAIN", "RAIN6");
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(f.path).toContain("/palettes/RAIN/");
      // Must not contain temperature files
      expect(f.name.toLowerCase()).not.toContain("mean");
      expect(f.name.toLowerCase()).not.toContain("temp");
    }
    // Calling with RAIN06
    const files06 = await listPaletteFiles("RAIN06");
    expect(files06.length).toBeGreaterThan(0);
    expect(files06.every((f) => f.path.startsWith("/palettes/RAIN/"))).toBe(true);
  });

  test("SLP layers list sea-level pressure palettes and exclude Divergence and Vorticity", async () => {
    const files = await listPaletteFiles("PRS_HGT", "SLP");
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const lower = f.name.toLowerCase();
      // Must NOT contain divergence or vorticity
      expect(lower).not.toContain("div");
      expect(lower).not.toContain("散度");
      expect(lower).not.toContain("vor");
      expect(lower).not.toContain("涡度");
      expect(lower).not.toContain("500hpahigh");
      // Must be SLP/pressure related
      expect(/prmsl|海平面气压|变压|bianya|slp|prs/i.test(f.name)).toBe(true);
    }

    // Direct invocation with "SLP"
    const directFiles = await listPaletteFiles("SLP");
    expect(directFiles.length).toEqual(files.length);
  });

  test("Divergence and Vorticity layers list only their respective palettes", async () => {
    const divFiles = await listPaletteFiles("PRS_HGT", "DIV");
    expect(divFiles.length).toBeGreaterThan(0);
    for (const f of divFiles) {
      expect(/div|散度/i.test(f.name)).toBe(true);
      expect(/prmsl|海平面气压|涡度/i.test(f.name)).toBe(false);
    }

    const vorFiles = await listPaletteFiles("PRS_HGT", "VOR");
    expect(vorFiles.length).toBeGreaterThan(0);
    for (const f of vorFiles) {
      expect(/vor|涡度/i.test(f.name)).toBe(true);
      expect(/div|散度|prmsl|海平面气压/i.test(f.name)).toBe(false);
    }
  });

  test("Visibility (VIS) layers exclude AQI and pollutant palettes", async () => {
    const visFiles = await listPaletteFiles("ENV_VIS", "VIS");
    expect(visFiles.length).toBeGreaterThan(0);
    for (const f of visFiles) {
      const lower = f.name.toLowerCase();
      expect(lower).toContain("vis");
      expect(lower).not.toContain("aqi");
      expect(lower).not.toContain("pm");
      expect(lower).not.toContain("so2");
      expect(lower).not.toContain("no2");
      expect(lower).not.toContain("co");
      expect(lower).not.toContain("o3");
      expect(lower).not.toContain("diamond120");
    }

    // Direct invocation with "VIS"
    const directVis = await listPaletteFiles("VIS");
    expect(directVis.length).toBe(visFiles.length);
  });

  test("DTD (T-Td) layers return ONLY T-Td palettes, excluding general temperature and Td", async () => {
    const dtdFiles = await listPaletteFiles("TMP", "DTD");
    expect(dtdFiles.length).toBe(4);
    const names = dtdFiles.map((f) => f.name).sort();
    expect(names).toEqual([
      "dark-T_Td.xml",
      "dark-t-td.xml",
      "light-T_Td.xml",
      "light-t-td.xml",
    ]);

    // Direct invocation with "DTD"
    const directDtd = await listPaletteFiles("DTD");
    expect(directDtd.length).toBe(4);

    // General temperature excludes DTD and TD
    const tmpFiles = await listPaletteFiles("TMP", "TMP");
    expect(tmpFiles.length).toBeGreaterThan(50);
    for (const f of tmpFiles) {
      expect(/(?:^|[-_])t[-_]td(?:\.|$)/i.test(f.name)).toBe(false);
      expect(/(?:^|[-_])td(?:\.|$)/i.test(f.name)).toBe(false);
    }
  });

  test("WIND excludes vertical velocity, and VVEL includes vertical velocity", async () => {
    const windFiles = await listPaletteFiles("WIND", "WIND");
    expect(windFiles.length).toBeGreaterThan(0);
    for (const f of windFiles) {
      expect(/垂直速度|vvel/i.test(f.name)).toBe(false);
    }

    const vvelFiles = await listPaletteFiles("WIND", "VVEL");
    expect(vvelFiles.length).toBeGreaterThan(0);
    for (const f of vvelFiles) {
      expect(/垂直速度|vvel/i.test(f.name)).toBe(true);
    }
  });

  test("CAPE and K index properly isolate stability palettes", async () => {
    const capeFiles = await listPaletteFiles("STABILITY", "CAPE");
    expect(capeFiles.length).toBeGreaterThan(0);
    for (const f of capeFiles) {
      expect(/k指数|k_/i.test(f.name)).toBe(false);
    }

    const kFiles = await listPaletteFiles("STABILITY", "K");
    expect(kFiles.length).toBeGreaterThan(0);
    for (const f of kFiles) {
      expect(/k指数|k_/i.test(f.name)).toBe(true);
    }
  });

  test("Temperature variants (TMAX, TMIN, T850, T700, T500, TMP_MAX) strictly exclude T-Td and Td palettes", async () => {
    const tempElements = ["T", "TMAX", "TMIN", "T850", "T700", "T500", "TMP_MAX", "TMP_MIN", "T2M", "TEMP"];
    for (const elem of tempElements) {
      const files = await listPaletteFiles("TMP", elem);
      expect(files.length).toBeGreaterThan(0);
      for (const f of files) {
        expect(/(?:^|[-_])t[-_]td(?:\.|$)/i.test(f.name)).toBe(false);
        expect(/(?:^|[-_])td(?:\.|$)/i.test(f.name)).toBe(false);
      }
    }
  });

  test("filterPalettesForElement isolates specific elements from a mixed list of palette files", () => {
    const mixedFiles = [
      { name: "dark-rain06.xml", path: "/palettes/RAIN/dark-rain06.xml" },
      { name: "light-24MeanTmp.xml", path: "/palettes/TMP/light-24MeanTmp.xml" },
      { name: "dark-T.xml", path: "/palettes/TMP/dark-T.xml" },
      { name: "dark-T_Td.xml", path: "/palettes/TMP/dark-T_Td.xml" },
      { name: "dark-Div.xml", path: "/palettes/PRS_HGT/dark-Div.xml" },
      { name: "light-散度.xml", path: "/palettes/PRS_HGT/light-散度.xml" },
      { name: "light-PRMSL.xml", path: "/palettes/PRS_HGT/light-PRMSL.xml" },
      { name: "dark-diamond120_AQI.xml", path: "/palettes/ENV_VIS/dark-diamond120_AQI.xml" },
      { name: "dark-Visib.xml", path: "/palettes/ENV_VIS/dark-Visib.xml" },
      { name: "light-diamond120_pm2.5.xml", path: "/palettes/ENV_VIS/light-diamond120_pm2.5.xml" },
    ];

    // RAIN6: strictly excludes temperature palettes
    const rainFiltered = filterPalettesForElement(mixedFiles, "RAIN6");
    expect(rainFiltered.map((f) => f.name)).toEqual(["dark-rain06.xml"]);

    // SLP: strictly excludes DIV and VOR palettes
    const slpFiltered = filterPalettesForElement(mixedFiles, "SLP");
    expect(slpFiltered.map((f) => f.name)).toEqual(["light-PRMSL.xml"]);

    // VIS: strictly excludes AQI and pollutant palettes
    const visFiltered = filterPalettesForElement(mixedFiles, "VIS");
    expect(visFiltered.map((f) => f.name)).toEqual(["dark-Visib.xml"]);

    // DTD: strictly returns only T-Td palettes
    const dtdFiltered = filterPalettesForElement(mixedFiles, "T-TD");
    expect(dtdFiltered.map((f) => f.name)).toEqual(["dark-T_Td.xml"]);

    // TMP: strictly excludes T-Td
    const tmpFiltered = filterPalettesForElement(mixedFiles, "TMP");
    expect(tmpFiltered.map((f) => f.name)).toEqual(["light-24MeanTmp.xml", "dark-T.xml"]);
  });

  test("Humidity and radar product palettes isolate respective elements", () => {
    const humidityFiles = [
      { name: "light-RH.xml" },
      { name: "light-比湿.xml" },
      { name: "dark-specific-humidity.xml" },
      { name: "dark-水汽通量.xml" },
    ];

    const qFiles = filterPalettesForElement(humidityFiles, "Q");
    expect(qFiles.map((f) => f.name)).toEqual(["light-比湿.xml", "dark-specific-humidity.xml"]);

    const vaporFiles = filterPalettesForElement(humidityFiles, "VAPOR");
    expect(vaporFiles.map((f) => f.name)).toEqual(["dark-水汽通量.xml"]);

    const rhFiles = filterPalettesForElement(humidityFiles, "RH");
    expect(rhFiles.map((f) => f.name)).toEqual(["light-RH.xml"]);

    const radarFiles = [
      { name: "dark-ref.xml" },
      { name: "light-qpe.xml" },
      { name: "dark-vil.xml" },
      { name: "light-kdp.xml" },
      { name: "dark-zdr.xml" },
    ];

    expect(filterPalettesForElement(radarFiles, "QPE").map((f) => f.name)).toEqual(["light-qpe.xml"]);
    expect(filterPalettesForElement(radarFiles, "VIL").map((f) => f.name)).toEqual(["dark-vil.xml"]);
    expect(filterPalettesForElement(radarFiles, "KDP").map((f) => f.name)).toEqual(["light-kdp.xml"]);
    expect(filterPalettesForElement(radarFiles, "ZDR").map((f) => f.name)).toEqual(["dark-zdr.xml"]);
    expect(filterPalettesForElement(radarFiles, "REF").map((f) => f.name)).toEqual(["dark-ref.xml"]);
  });
});

describe("3. Map Move / Auto-Save Legend Colormap Persistence", () => {
  const winId = "test-map-move-win";

  beforeEach(() => {
    clearWindowWeatherLayers(winId);
    clearLegends(winId);
  });

  test("setColormaps preserves active runtime palette: entries across preset reload / auto-save", () => {
    const customStops = [
      { val: 0, color: [10, 20, 30, 255] },
      { val: 100, color: [200, 210, 220, 255] },
    ];
    const key = "palette:contour-RAIN6";

    // 1. User selects palette, registering key into COLORMAPS
    setColormaps({ ...COLORMAPS, [key]: customStops });
    expect(COLORMAPS[key]).toEqual(customStops);

    // 2. Preset auto-save triggers setColormaps with only config colormaps (e.g. without runtime key)
    const presetColormaps = {
      TMP: COLORMAPS.TMP,
      RH: COLORMAPS.RH,
    };
    setColormaps(presetColormaps);

    // 3. Runtime palette key MUST still be preserved in COLORMAPS!
    expect(COLORMAPS[key]).toBeDefined();
    expect(COLORMAPS[key]).toEqual(customStops);
    expect(getColormap(key, "RAIN")).toEqual(customStops);
  });

  test("loadXMLPalette registers stops into COLORMAPS under both full path and clean path", async () => {
    const path = "/palettes/TMP/dark-T_Td.xml";
    const stops = await loadXMLPalette(path);
    expect(stops).not.toBeNull();
    expect(stops.length).toBeGreaterThan(1);

    // Both path and trimmed path should resolve in getColormap
    expect(getColormap(path)).toEqual(stops);
    expect(getColormap("palettes/TMP/dark-T_Td.xml")).toEqual(stops);
  });

  test("syncLegendForLayer prioritizes palette:${layer.id} when palettePath is configured", () => {
    const layer = {
      id: "contour-SLP",
      element: "SLP",
      type: "contour",
      visible: true,
      config: {
        showFill: true,
        palettePath: "/palettes/PRS_HGT/light-PRMSL.xml",
      },
      colormap: "palette:contour-SLP",
      gridData: { stats: { min: 990, max: 1030 } },
    };

    const customStops = [
      { val: 980, color: [0, 50, 100, 255] },
      { val: 1040, color: [255, 100, 50, 255] },
    ];
    setColormaps({ ...COLORMAPS, "palette:contour-SLP": customStops });

    // Synchronize legend
    syncLegendForLayer(layer, { id: winId, winIdx: 0 });

    const items = buildLegendItems(winId);
    expect(items.length).toBe(1);
    expect(items[0].element).toBe("SLP");
    expect(items[0].colormap).toBe("palette:contour-SLP");

    // The gradient must reflect the custom stops rather than the default PRS_HGT/TMP gradient
    expect(items[0].gradient).toContain("rgb(0,50,100)");
    expect(items[0].gradient).toContain("rgb(255,100,50)");
  });

  test("Timeline step updates preserve custom palette colormap and legend when map pans/moves", () => {
    const customStops = [
      { val: 0, color: [15, 25, 35, 255] },
      { val: 30, color: [150, 45, 35, 255] },
    ];
    const key = "palette:contour-sounding-dtd-500";
    setColormaps({ ...COLORMAPS, [key]: customStops });

    // Initial layer creation with custom palette
    addOrUpdateLayer(winId, {
      id: "contour-sounding-dtd-500",
      element: "DTD",
      type: "contour",
      config: {
        showRaster: true,
        palettePath: "/palettes/TMP/dark-T_Td.xml",
      },
      colormap: key,
    });

    let layer = getLayerById("contour-sounding-dtd-500", winId);
    expect(layer.colormap).toBe(key);
    expect(layer.config.palettePath).toBe("/palettes/TMP/dark-T_Td.xml");

    // Simulate map move / timeline step incoming with generic colormap
    addOrUpdateLayer(winId, {
      id: "contour-sounding-dtd-500",
      element: "DTD",
      type: "contour",
      colormap: "DTD", // loader sets element as default colormap
      config: {
        showRaster: true,
      },
    });

    layer = getLayerById("contour-sounding-dtd-500", winId);
    // Must NOT revert to "DTD" — custom palettePath preserves palette key
    expect(layer.colormap).toBe(key);
    expect(layer.config.palettePath).toBe("/palettes/TMP/dark-T_Td.xml");

    // Auto-save runs in background and saves preset
    autoSaveLayerConfig(layer);

    // Preset reload preserves palette
    setColormaps({ TMP: COLORMAPS.TMP });
    expect(COLORMAPS[key]).toBeDefined();

    updateLegend("DTD", layer.colormap, 0, 30, { id: winId, winIdx: 0 });
    const items = buildLegendItems(winId);
    expect(items[0].colormap).toBe(key);
    expect(items[0].gradient).toContain("rgb(15,25,35)");
  });

  test("armContourReRender on map move/zoom preserves custom palette and re-asserts legend with custom colormap", async () => {
    const { armContourReRender, disarmContourReRender } = await import("../src/services/contourReRender.js");
    const customStops = [
      { val: 990, color: [10, 50, 90, 255] },
      { val: 1030, color: [210, 150, 90, 255] },
    ];
    const palKey = "palette:contour-move-slp";
    setColormaps({ ...COLORMAPS, [palKey]: customStops });

    const winObj = { id: winId, winIdx: 0 };
    let currentBounds = [[100, 20], [120, 40]];
    const layer = {
      id: "contour-move-slp",
      element: "SLP",
      type: "contour",
      visible: true,
      config: {
        showFill: true,
        showLine: true,
        palettePath: "/palettes/PRS_HGT/light-PRMSL.xml",
      },
      colormap: palKey,
      gridData: {
        header: { n_lon: 200, n_lat: 200 },
        values: Array.from({ length: 200 }, () => Array.from({ length: 200 }, () => 1010)),
        stats: { min: 990, max: 1030 },
      },
    };
    addOrUpdateLayer(winId, layer);

    let moveHandler = null;
    const mockMap = {
      on(e, fn) { if (e === "moveend") moveHandler = fn; },
      off() {},
      getBounds() {
        return {
          toArray: () => currentBounds,
        };
      },
      getSource() { return null; },
      getLayer() { return null; },
      addSource() {},
      addLayer() {},
      setLayoutProperty() {},
      setPaintProperty() {},
    };

    // Arm re-render with small budget override to ensure it hooks listeners
    armContourReRender(mockMap, layer, winObj, { maxEffectiveCells: 10 });

    // Initial legend update
    updateLegend("SLP", palKey, 990, 1030, winObj);
    let items = buildLegendItems(winId);
    expect(items[0].colormap).toBe(palKey);

    // Simulate map move to new bounds
    expect(moveHandler).not.toBeNull();
    currentBounds = [[90, 15], [130, 45]];
    moveHandler();

    // Wait for debounced compute
    await new Promise((r) => setTimeout(r, 600));

    // Legend must retain custom colormap
    items = buildLegendItems(winId);
    expect(items.length).toBe(1);
    expect(items[0].colormap).toBe(palKey);
    expect(items[0].gradient).toContain("rgb(10,50,90)");
    expect(items[0].gradient).toContain("rgb(210,150,90)");

    disarmContourReRender(mockMap, layer.id);
  });

  test("armContourReRender on wind layer with showRaster preserves custom palette and re-asserts WIND legend", async () => {
    const { armContourReRender, disarmContourReRender } = await import("../src/services/contourReRender.js");
    const customStops = [
      { val: 0, color: [0, 100, 200, 255] },
      { val: 35, color: [255, 50, 0, 255] },
    ];
    const palKey = "palette:wind-layer-1";
    setColormaps({ ...COLORMAPS, [palKey]: customStops });

    const winObj = {
      id: winId,
      winIdx: 0,
      windGridData: {
        header: { n_lon: 200, n_lat: 200 },
        u: Array.from({ length: 200 }, () => Array.from({ length: 200 }, () => 5)),
        v: Array.from({ length: 200 }, () => Array.from({ length: 200 }, () => 5)),
        stats: { min: 0, max: 35 },
      },
    };
    let currentBounds = [[100, 20], [120, 40]];
    const layer = {
      id: "wind-layer-1",
      element: "WIND",
      type: "wind",
      visible: true,
      config: {
        showWind: true,
        showRaster: true,
        palettePath: "/palettes/WIND/dark-wind.xml",
      },
      colormap: palKey,
      gridData: null,
    };
    addOrUpdateLayer(winId, layer);

    let moveHandler = null;
    const mockMap = {
      on(e, fn) { if (e === "moveend") moveHandler = fn; },
      off() {},
      getBounds() {
        return {
          toArray: () => currentBounds,
        };
      },
      getSource() { return null; },
      getLayer() { return null; },
      addSource() {},
      addLayer() {},
      setLayoutProperty() {},
      setPaintProperty() {},
    };

    armContourReRender(mockMap, layer, winObj, { maxEffectiveCells: 10 });

    updateLegend("WIND", palKey, 0, undefined, winObj);
    let items = buildLegendItems(winId);
    expect(items[0].colormap).toBe(palKey);

    expect(moveHandler).not.toBeNull();
    currentBounds = [[95, 18], [125, 42]];
    moveHandler();

    await new Promise((r) => setTimeout(r, 600));

    items = buildLegendItems(winId);
    expect(items.length).toBe(1);
    expect(items[0].element).toBe("WIND");
    expect(items[0].colormap).toBe(palKey);
    expect(items[0].gradient).toContain("rgb(0,100,200)");
    expect(items[0].gradient).toContain("rgb(255,50,0)");

    disarmContourReRender(mockMap, layer.id);
  });
});
