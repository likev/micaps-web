import {
  buildLegendItems,
  updateLegend as coreUpdateLegend,
  clearLegends as coreClearLegends,
  removeLegend as coreRemoveLegend,
  getWindowLegendsMap,
  onLegendChange,
} from "../src/lib/stores/legendCore.js";
import { updateLegend as uiUpdateLegend, clearLegends as uiClearLegends } from "../src/ui/legend.js";
import { syncLegendForLayer } from "../src/ui/layers/legendSync.js";
import { handleConfigAction } from "../src/ui/layers/configActions.js";
import { addOrUpdateLayer, clearWindowWeatherLayers, getLayerById } from "../src/ui/layerControl.js";
import { setColormaps, COLORMAPS } from "../src/utils/colormaps.js";

describe("Legend Palette Duplication Prevention", () => {
  const winId = "test-dedup-win";
  const winObj = { id: winId, winIdx: 0 };

  beforeEach(() => {
    coreClearLegends(winId);
    clearWindowWeatherLayers(winId);
  });

  test("Changing palette for an existing layer updates the legend item in-place without duplicating", () => {
    const layer = {
      id: "contour-TMP",
      element: "TMP",
      type: "contour",
      name: "Temperature 2m",
      visible: true,
      colormap: "TMP",
      config: { showFill: true, showRaster: false },
      gridData: { stats: { min: -10, max: 35 } },
    };
    addOrUpdateLayer(winId, layer);

    // Initial load: layer synced to legend
    syncLegendForLayer(layer, winObj);

    let items = buildLegendItems(winId);
    expect(items.length).toBe(1);
    expect(items[0].element).toBe("TMP");
    expect(items[0].colormap).toBe("TMP");
    expect(items[0].layerId).toBe("contour-TMP");

    // Register a custom colormap
    const customStops = [
      { val: -10, color: [0, 0, 255, 255] },
      { val: 35, color: [255, 0, 0, 255] },
    ];
    const palKey = "palette:contour-TMP";
    setColormaps({ ...COLORMAPS, [palKey]: customStops });

    // User changes palette via updateLegend with palette: key and extra layerId
    uiUpdateLegend("TMP", palKey, -10, 35, winObj, {
      layerId: layer.id,
      name: layer.name,
    });

    items = buildLegendItems(winId);
    expect(items.length).toBe(1);
    expect(items[0].element).toBe("TMP");
    expect(items[0].colormap).toBe(palKey);
    expect(items[0].layerId).toBe("contour-TMP");
    expect(items[0].gradient).toContain("rgb(0,0,255)");

    // User changes palette again without extra (legacy or minimal caller)
    uiUpdateLegend("TMP", palKey, -10, 35, winObj);

    items = buildLegendItems(winId);
    expect(items.length).toBe(1);
    expect(items[0].colormap).toBe(palKey);

    // User changes palette back to default colormap "TMP"
    uiUpdateLegend("TMP", "TMP", -10, 35, winObj, {
      layerId: layer.id,
      name: layer.name,
    });

    items = buildLegendItems(winId);
    expect(items.length).toBe(1);
    expect(items[0].colormap).toBe("TMP");
    expect(items[0].layerId).toBe("contour-TMP");

    // Also reset without extra: must not create duplicate
    uiUpdateLegend("TMP", "TMP", -10, 35, winObj);
    items = buildLegendItems(winId);
    expect(items.length).toBe(1);
  });

  test("handleConfigAction palettePath change replaces existing legend entry without duplicating", async () => {
    const layer = {
      id: "contour-RH",
      element: "RH",
      type: "contour",
      name: "Relative Humidity",
      visible: true,
      colormap: "RH",
      config: { showFill: true, showRaster: false },
      gridData: { stats: { min: 10, max: 95 } },
    };
    addOrUpdateLayer(winId, layer);
    syncLegendForLayer(layer, winObj);

    let items = buildLegendItems(winId);
    expect(items.length).toBe(1);
    expect(items[0].element).toBe("RH");
    expect(items[0].colormap).toBe("RH");

    const mockMap = {
      getSource() { return null; },
      getLayer() { return null; },
      addSource() {},
      addLayer() {},
      setLayoutProperty() {},
      setPaintProperty() {},
      getBounds() { return { toArray: () => [[0, 0], [10, 10]] }; },
      on() {},
      off() {},
    };

    // User selects a palette via handleConfigAction
    handleConfigAction(mockMap, layer.id, { palettePath: "/palettes/TMP/dark-T_Td.xml" }, layer, winObj);

    // Wait for async loadXMLPalette and setColormaps to complete
    await new Promise((r) => setTimeout(r, 100));

    items = buildLegendItems(winId);
    expect(items.length).toBe(1);
    expect(items[0].element).toBe("RH");
    expect(items[0].colormap).toBe(`palette:${layer.id}`);

    // User resets palette back to default
    handleConfigAction(mockMap, layer.id, { palettePath: null }, layer, winObj);
    await new Promise((r) => setTimeout(r, 50));

    items = buildLegendItems(winId);
    expect(items.length).toBe(1);
    expect(items[0].element).toBe("RH");
    expect(items[0].colormap).toBe("RH");
  });

  test("Wind layer palette changes update single WIND legend item without duplicating", async () => {
    const layer = {
      id: "wind-layer-main",
      element: "WIND",
      type: "wind",
      name: "Wind Streamlines",
      visible: true,
      colormap: "WIND",
      config: { showWind: true, showRaster: true },
      gridData: null,
    };
    addOrUpdateLayer(winId, layer);
    syncLegendForLayer(layer, winObj);

    let items = buildLegendItems(winId);
    expect(items.length).toBe(1);
    expect(items[0].element).toBe("WIND");
    expect(items[0].colormap).toBe("WIND");

    const mockMap = {
      getSource() { return null; },
      getLayer() { return null; },
      addSource() {},
      addLayer() {},
      setLayoutProperty() {},
      setPaintProperty() {},
      getBounds() { return { toArray: () => [[0, 0], [10, 10]] }; },
      on() {},
      off() {},
    };

    // User changes wind palette
    handleConfigAction(mockMap, layer.id, { palettePath: "/palettes/TMP/dark-T_Td.xml" }, layer, winObj);
    await new Promise((r) => setTimeout(r, 100));

    items = buildLegendItems(winId);
    expect(items.length).toBe(1);
    expect(items[0].element).toBe("WIND");
    expect(items[0].colormap).toBe(`palette:${layer.id}`);

    // Reset to default
    handleConfigAction(mockMap, layer.id, { palettePath: null }, layer, winObj);
    await new Promise((r) => setTimeout(r, 50));

    items = buildLegendItems(winId);
    expect(items.length).toBe(1);
    expect(items[0].element).toBe("WIND");
    expect(items[0].colormap).toBe("WIND");
  });

  test("Multiple distinct layers of same element maintain separate legend items without cross-clobbering", () => {
    const layer500 = {
      id: "contour-hgt-500",
      element: "HGT",
      type: "contour",
      name: "HGT 500 hPa",
      visible: true,
      colormap: "HGT",
      config: { showFill: true },
      gridData: { stats: { min: 5000, max: 5900 } },
    };
    const layer850 = {
      id: "contour-hgt-850",
      element: "HGT",
      type: "contour",
      name: "HGT 850 hPa",
      visible: true,
      colormap: "HGT",
      config: { showFill: true },
      gridData: { stats: { min: 1400, max: 1600 } },
    };

    addOrUpdateLayer(winId, layer500);
    addOrUpdateLayer(winId, layer850);

    syncLegendForLayer(layer500, winObj);
    syncLegendForLayer(layer850, winObj);

    let items = buildLegendItems(winId);
    expect(items.length).toBe(2);

    // Update palette on layer500 only
    const palKey = "palette:contour-hgt-500";
    setColormaps({ ...COLORMAPS, [palKey]: [{ val: 5000, color: [1, 2, 3, 255] }, { val: 5900, color: [4, 5, 6, 255] }] });

    uiUpdateLegend("HGT", palKey, 5000, 5900, winObj, {
      layerId: layer500.id,
      name: layer500.name,
    });

    items = buildLegendItems(winId);
    expect(items.length).toBe(2);

    const item500 = items.find((i) => i.layerId === "contour-hgt-500");
    const item850 = items.find((i) => i.layerId === "contour-hgt-850");

    expect(item500).toBeDefined();
    expect(item850).toBeDefined();
    expect(item500.colormap).toBe(palKey);
    expect(item850.colormap).toBe("HGT");
  });

  test("onLegendChange reactive bridge and legends map maintain deduplicated state", () => {
    let notifiedWin = null;
    const unsub = onLegendChange((id) => {
      notifiedWin = id;
    });

    const layer = {
      id: "contour-test-sveltestore",
      element: "TMP",
      type: "contour",
      name: "Temperature",
      visible: true,
      colormap: "TMP",
      config: { showFill: true },
      gridData: { stats: { min: 0, max: 30 } },
    };
    addOrUpdateLayer(winId, layer);

    coreUpdateLegend("TMP", "TMP", 0, 30, winId, {
      layerId: layer.id,
      name: layer.name,
    });

    expect(notifiedWin).toBe(winId);
    const map = getWindowLegendsMap().get(winId);
    expect(map).toBeDefined();
    expect(map.size).toBe(1);

    // Update with new palette
    coreUpdateLegend("TMP", "palette:contour-test-sveltestore", 0, 30, winId, {
      layerId: layer.id,
      name: layer.name,
    });

    expect(map.size).toBe(1);
    const entry = Array.from(map.values())[0];
    expect(entry.colormap).toBe("palette:contour-test-sveltestore");

    const items = buildLegendItems(winId);
    expect(items.length).toBe(1);
    expect(items[0].colormap).toBe("palette:contour-test-sveltestore");

    unsub();
  });

  test("Multiple sequential palette switches maintain exactly one legend item at all times", () => {
    const layer = {
      id: "contour-multi-switch",
      element: "TMP",
      type: "contour",
      name: "Temperature",
      visible: true,
      colormap: "TMP",
      config: { showFill: true },
      gridData: { stats: { min: -10, max: 40 } },
    };
    addOrUpdateLayer(winId, layer);
    syncLegendForLayer(layer, winObj);

    expect(buildLegendItems(winId).length).toBe(1);

    // Switch 1: Custom palette A
    uiUpdateLegend("TMP", "palette:contour-multi-switch", -10, 40, winObj);
    expect(buildLegendItems(winId).length).toBe(1);
    expect(buildLegendItems(winId)[0].colormap).toBe("palette:contour-multi-switch");

    // Switch 2: Custom palette B (different colormap path)
    uiUpdateLegend("TMP", "/palettes/TMP/dark-temp.xml", -10, 40, winObj);
    expect(buildLegendItems(winId).length).toBe(1);
    expect(buildLegendItems(winId)[0].colormap).toBe("/palettes/TMP/dark-temp.xml");

    // Switch 3: Built-in default
    uiUpdateLegend("TMP", "TMP", -10, 40, winObj);
    expect(buildLegendItems(winId).length).toBe(1);
    expect(buildLegendItems(winId)[0].colormap).toBe("TMP");

    // Switch 4: Custom palette C
    uiUpdateLegend("TMP", "palette:contour-multi-switch", -10, 40, winObj, { layerId: layer.id });
    expect(buildLegendItems(winId).length).toBe(1);
    expect(buildLegendItems(winId)[0].colormap).toBe("palette:contour-multi-switch");

    // Switch 5: Back to default with extra layerId
    uiUpdateLegend("TMP", "TMP", -10, 40, winObj, { layerId: layer.id });
    expect(buildLegendItems(winId).length).toBe(1);
    expect(buildLegendItems(winId)[0].colormap).toBe("TMP");
  });

  test("Transition from untagged generic element entry to layerId-tagged entry deduplicates cleanly", () => {
    // 1. Initial entry created without layerId
    coreUpdateLegend("RH", "RH", 0, 100, winId);
    let items = buildLegendItems(winId);
    expect(items.length).toBe(1);
    expect(items[0].element).toBe("RH");
    expect(items[0].layerId).toBeNull();

    // 2. Layer is registered and updated with layerId
    const layer = {
      id: "contour-rh-layer",
      element: "RH",
      type: "contour",
      name: "RH Layer",
      visible: true,
      colormap: "palette:contour-rh-layer",
      config: { showFill: true },
      gridData: { stats: { min: 20, max: 90 } },
    };
    addOrUpdateLayer(winId, layer);

    // Update with layerId: must replace the untagged entry rather than adding a second one
    coreUpdateLegend("RH", "palette:contour-rh-layer", 20, 90, winId, {
      layerId: layer.id,
      name: layer.name,
    });

    items = buildLegendItems(winId);
    expect(items.length).toBe(1);
    expect(items[0].element).toBe("RH");
    expect(items[0].layerId).toBe("contour-rh-layer");
    expect(items[0].colormap).toBe("palette:contour-rh-layer");

    // 3. User switches palette back without extra layerId
    coreUpdateLegend("RH", "RH", 20, 90, winId);
    items = buildLegendItems(winId);
    expect(items.length).toBe(1);
    expect(items[0].colormap).toBe("RH");
  });

  test("DOM renderLegendPanel contains exactly one legend-item element across palette switches", () => {
    const mockDOMPanel = {
      innerHTML: "",
      _cls: new Set(),
      classList: {
        add(c) { mockDOMPanel._cls.add(c); },
        remove(c) { mockDOMPanel._cls.delete(c); },
        contains(c) { return mockDOMPanel._cls.has(c); },
      },
    };
    const prevDoc = globalThis.document;
    globalThis.document = { getElementById: (id) => (id === "legend-panel" ? mockDOMPanel : null) };

    try {
      const layer = {
        id: "contour-dom-test",
        element: "TMP",
        type: "contour",
        name: "Surface Temp",
        visible: true,
        colormap: "TMP",
        config: { showFill: true },
        gridData: { stats: { min: -5, max: 30 } },
      };
      addOrUpdateLayer(winId, layer);

      // Initial render
      uiUpdateLegend("TMP", "TMP", -5, 30, winObj, { layerId: layer.id, name: layer.name });
      const count1 = (mockDOMPanel.innerHTML.match(/class="legend-item"/g) || []).length;
      expect(count1).toBe(1);

      // Palette change
      uiUpdateLegend("TMP", "palette:contour-dom-test", -5, 30, winObj);
      const count2 = (mockDOMPanel.innerHTML.match(/class="legend-item"/g) || []).length;
      expect(count2).toBe(1);

      // Palette reset
      uiUpdateLegend("TMP", "TMP", -5, 30, winObj);
      const count3 = (mockDOMPanel.innerHTML.match(/class="legend-item"/g) || []).length;
      expect(count3).toBe(1);
    } finally {
      if (prevDoc !== undefined) globalThis.document = prevDoc;
      else delete globalThis.document;
    }
  });

  test("Updating legend without layerId in a window without registered layers replaces in-place without duplicating", () => {
    const standaloneWin = "win-repro-standalone";
    coreClearLegends(standaloneWin);

    // Initial layer legend setup with layerId
    coreUpdateLegend("TMP", "TMP", -10, 35, standaloneWin, { layerId: "contour-TMP", name: "Temperature" });
    let map = getWindowLegendsMap().get(standaloneWin);
    expect(map.size).toBe(1);

    // Palette change called with only element and colormap (no layerId)
    coreUpdateLegend("TMP", "JET", -10, 35, standaloneWin);
    map = getWindowLegendsMap().get(standaloneWin);
    expect(map.size).toBe(1);
    expect(Array.from(map.keys())).toEqual(["contour-TMP"]);

    const items = buildLegendItems(standaloneWin);
    expect(items.length).toBe(1);
    expect(items[0].colormap).toBe("JET");
    expect(items[0].layerId).toBe("contour-TMP");
    expect(items[0].key).toBe("contour-TMP");
  });

  test("Multi-layer same element disambiguation by name updates target layer in-place and leaves sibling intact", () => {
    const multiWin = "win-multi-hgt-test";
    coreClearLegends(multiWin);
    clearWindowWeatherLayers(multiWin);

    addOrUpdateLayer(multiWin, { id: "hgt-500", element: "HGT", name: "HGT 500" });
    addOrUpdateLayer(multiWin, { id: "hgt-850", element: "HGT", name: "HGT 850" });

    coreUpdateLegend("HGT", "HGT", 5000, 5900, multiWin, { layerId: "hgt-500", name: "HGT 500" });
    coreUpdateLegend("HGT", "HGT", 1400, 1600, multiWin, { layerId: "hgt-850", name: "HGT 850" });

    expect(buildLegendItems(multiWin).length).toBe(2);

    // Update HGT 500 palette using name disambiguation
    coreUpdateLegend("HGT", "JET", 5000, 5900, multiWin, { name: "HGT 500" });

    const map = getWindowLegendsMap().get(multiWin);
    expect(map.size).toBe(2);
    expect(Array.from(map.keys())).toContain("hgt-500");
    expect(Array.from(map.keys())).toContain("hgt-850");

    const items = buildLegendItems(multiWin);
    expect(items.length).toBe(2);
    const item500 = items.find((i) => i.layerId === "hgt-500");
    const item850 = items.find((i) => i.layerId === "hgt-850");
    expect(item500.colormap).toBe("JET");
    expect(item850.colormap).toBe("HGT");

    // Removing hgt-500 removes only hgt-500
    coreRemoveLegend("hgt-500", multiWin);
    expect(map.size).toBe(1);
    expect(Array.from(map.keys())).toEqual(["hgt-850"]);
    expect(buildLegendItems(multiWin).length).toBe(1);
    expect(buildLegendItems(multiWin)[0].layerId).toBe("hgt-850");
  });

  test("handleConfigAction with direct colormap update modifies legend in-place without duplicating", () => {
    const layer = {
      id: "contour-colormap-test",
      element: "TMP",
      type: "contour",
      name: "Temperature",
      visible: true,
      colormap: "TMP",
      config: { showFill: true },
      gridData: { stats: { min: -10, max: 35 } },
    };
    addOrUpdateLayer(winId, layer);
    syncLegendForLayer(layer, winObj);

    expect(buildLegendItems(winId).length).toBe(1);

    const mockMap = {
      getSource() { return null; },
      getLayer() { return null; },
      addSource() {},
      addLayer() {},
      setLayoutProperty() {},
      setPaintProperty() {},
      getBounds() { return { toArray: () => [[0, 0], [10, 10]] }; },
      on() {},
      off() {},
    };

    handleConfigAction(mockMap, layer.id, { colormap: "JET" }, layer, winObj);

    const items = buildLegendItems(winId);
    expect(items.length).toBe(1);
    expect(items[0].colormap).toBe("JET");
    expect(items[0].layerId).toBe("contour-colormap-test");
  });

  test("Empty or invalid inputs do not throw and handle safely", () => {
    expect(() => coreUpdateLegend(null, null, undefined, undefined, null)).not.toThrow();
    expect(() => coreRemoveLegend(null, null)).not.toThrow();
    expect(() => coreRemoveLegend("", null)).not.toThrow();
    expect(() => buildLegendItems(null)).not.toThrow();
  });
});
