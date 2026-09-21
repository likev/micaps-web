import { describe, it, expect } from "bun:test";
import { createInitialAppState } from "../../src/lib/stores/appCore.js";
import { createInitialUIState, clampTooltipPosition } from "../../src/lib/stores/uiCore.js";
import { getVisibleWindows, isWindowVisible, getNumVisible } from "../../src/lib/stores/tabsCore.js";
import { createTimelineState, getAdjacentTimeSteps } from "../../src/lib/stores/timelineCore.js";
import { buildLegendItems, updateLegend, getWindowLegendsMap, clearLegends } from "../../src/lib/stores/legendCore.js";
import {
  getLayersForWindow,
  addOrUpdateLayer,
  removeLayer,
  clearWindowWeatherLayers,
  setOnLayersChangeCallback,
} from "../../src/lib/stores/layersCore.js";

describe("Plain-Core Stores (Phase 1 Foundations)", () => {
  describe("AppState Core", () => {
    it("creates initial state with expected default fields", () => {
      const state = createInitialAppState();
      expect(state.model).toBe("ECMWF_HR");
      expect(state.element).toBe("TMP");
      expect(state.level).toBe(850);
      expect(state.layers.pmtiles).toBe(true);
      expect(state.layers.contour).toBe(true);
      expect(state.isPlaying).toBe(false);
      expect(state.playbackSpeed).toBe(1500);
    });
  });

  describe("UI Core & Tooltip Clamp", () => {
    it("creates initial UI state matching Section 1.5 inventory", () => {
      const ui = createInitialUIState();
      expect(ui.catalogOpen).toBe(false);
      expect(ui.layersOpen).toBe(true);
      expect(ui.timelineVisible).toBe(false);
      expect(ui.configOpen).toBe(false);
      expect(ui.activeConfigSubtab).toBe("presets");
      expect(ui.tooltip).toBeNull();
      expect(ui.toast).toBeNull();
      expect(ui.expandedLayerId).toBeNull();
    });

    it("clampTooltipPosition clamps within viewport bounds", () => {
      // Default fallback
      expect(clampTooltipPosition(null, null)).toEqual({ x: 20, y: 60 });

      // Inside bounds
      const p1 = clampTooltipPosition(100, 100, 1000, 800);
      expect(p1.x).toBe(116);
      expect(p1.y).toBe(116);

      // Overflow right & bottom
      const p2 = clampTooltipPosition(950, 750, 1000, 800);
      expect(p2.x).toBeLessThanOrEqual(1000 - 280);
      expect(p2.y).toBeGreaterThanOrEqual(52);
    });

    it("verifies the complete Section 1.5 UI toggle matrix transitions", () => {
      const ui = createInitialUIState();

      // 1. Catalog drawer
      expect(ui.catalogOpen).toBe(false);
      ui.catalogOpen = true;
      expect(ui.catalogOpen).toBe(true);
      ui.catalogOpen = false;
      expect(ui.catalogOpen).toBe(false);

      // 2. Layer control
      expect(ui.layersOpen).toBe(true);
      ui.layersOpen = false;
      expect(ui.layersOpen).toBe(false);
      ui.layersOpen = true;
      expect(ui.layersOpen).toBe(true);

      // 3. Time slider
      expect(ui.timelineVisible).toBe(false);
      ui.timelineVisible = true;
      expect(ui.timelineVisible).toBe(true);
      ui.timelineVisible = false;
      expect(ui.timelineVisible).toBe(false);

      // 4. Tooltip
      expect(ui.tooltip).toBeNull();
      ui.tooltip = { lngLat: [116.4, 39.9], props: { name: "Beijing" }, x: 120, y: 80 };
      expect(ui.tooltip.props.name).toBe("Beijing");
      ui.tooltip = null;
      expect(ui.tooltip).toBeNull();

      // 5. Toast
      expect(ui.toast).toBeNull();
      ui.toast = { kind: "error", message: "Failed to load" };
      expect(ui.toast.kind).toBe("error");
      ui.toast = null;
      expect(ui.toast).toBeNull();

      // 6. Config editor & subtabs & dirty flag
      expect(ui.configOpen).toBe(false);
      expect(ui.activeConfigSubtab).toBe("presets");
      expect(ui.configDirty).toBe(false);
      ui.configOpen = true;
      ui.activeConfigSubtab = "colormaps";
      ui.configDirty = true;
      expect(ui.configOpen).toBe(true);
      expect(ui.activeConfigSubtab).toBe("colormaps");
      expect(ui.configDirty).toBe(true);
      ui.activeConfigSubtab = "settings";
      expect(ui.activeConfigSubtab).toBe("settings");
      ui.activeConfigSubtab = "json";
      expect(ui.activeConfigSubtab).toBe("json");
      ui.configOpen = false;
      ui.configDirty = false;
      expect(ui.configOpen).toBe(false);

      // 7. Layer row expansion (single-expanded accordion model)
      expect(ui.expandedLayerId).toBeNull();
      ui.expandedLayerId = "layer-contour-500";
      expect(ui.expandedLayerId).toBe("layer-contour-500");
      ui.expandedLayerId = "layer-station-surface";
      expect(ui.expandedLayerId).toBe("layer-station-surface");
      ui.expandedLayerId = null;
      expect(ui.expandedLayerId).toBeNull();

      // 8. Fullscreen
      expect(ui.isFullscreen).toBe(false);
      ui.isFullscreen = true;
      expect(ui.isFullscreen).toBe(true);
      ui.isFullscreen = false;
      expect(ui.isFullscreen).toBe(false);
    });
  });

  describe("Tabs Core Split Visibility", () => {
    const tab1x1 = {
      layout: "1x1",
      activeWinIdx: 0,
      windows: [{ id: "w1" }, { id: "w2" }, { id: "w3" }],
    };

    const tab1x2 = {
      layout: "1x2",
      activeWinIdx: 2,
      windows: [{ id: "w1" }, { id: "w2" }, { id: "w3" }],
    };

    const tab2x2 = {
      layout: "2x2",
      activeWinIdx: 1,
      windows: [{ id: "w1" }, { id: "w2" }, { id: "w3" }, { id: "w4" }, { id: "w5" }],
    };

    it("getNumVisible returns correct split capacities", () => {
      expect(getNumVisible("1x1")).toBe(1);
      expect(getNumVisible("1x2")).toBe(2);
      expect(getNumVisible("2x2")).toBe(4);
    });

    it("getVisibleWindows enforces active window inclusion in split views", () => {
      expect(getVisibleWindows(tab1x1).map((w) => w.id)).toEqual(["w1"]);

      // In 1x2 with active = w3, visible must include w3 + first other window
      const vis1x2 = getVisibleWindows(tab1x2);
      expect(vis1x2.map((w) => w.id)).toEqual(["w3", "w1"]);
      expect(isWindowVisible(tab1x2, tab1x2.windows[2])).toBe(true);
      expect(isWindowVisible(tab1x2, tab1x2.windows[0])).toBe(true);
      expect(isWindowVisible(tab1x2, tab1x2.windows[1])).toBe(false);

      // In 2x2 with active = w2 (index 1 < 4), visible is first 4
      const vis2x2 = getVisibleWindows(tab2x2);
      expect(vis2x2.map((w) => w.id)).toEqual(["w1", "w2", "w3", "w4"]);
    });
  });

  describe("Timeline Core Per-Window Isolation", () => {
    it("creates isolated timeline state per window preventing cross-window clobber", () => {
      const win1Timeline = createTimelineState("win-1", { currentMode: "nwp", currentPeriodIdx: 2 });
      const win2Timeline = createTimelineState("win-2", { currentMode: "obs", currentPeriodIdx: 5 });

      expect(win1Timeline.winId).toBe("win-1");
      expect(win1Timeline.currentMode).toBe("nwp");
      expect(win1Timeline.currentPeriodIdx).toBe(2);

      expect(win2Timeline.winId).toBe("win-2");
      expect(win2Timeline.currentMode).toBe("obs");
      expect(win2Timeline.currentPeriodIdx).toBe(5);

      win1Timeline.currentPeriodIdx = 3;
      expect(win1Timeline.currentPeriodIdx).toBe(3);
      expect(win2Timeline.currentPeriodIdx).toBe(5);

      const adj = getAdjacentTimeSteps(win1Timeline);
      expect(adj.mode).toBe("nwp");
      expect(adj.periods.current).toBe(win1Timeline.discretePeriods[3]);
    });
  });

  describe("Legend Core Builder", () => {
    it("builds formatted legend items with unit and display title", () => {
      clearLegends("win-test");
      updateLegend("TMP", "temperature", -20, 40, { id: "win-test", winIdx: 0 });

      const items = buildLegendItems("win-test");
      expect(items.length).toBe(1);
      expect(items[0].element).toBe("TMP");
      expect(items[0].unit).toBe("°C");
      expect(items[0].displayTitle).toContain("TMP");
      expect(items[0].gradient).toBeTruthy();
      expect(items[0].tickLabels.length).toBeGreaterThan(0);

      clearLegends("win-test");
      expect(buildLegendItems("win-test").length).toBe(0);
    });
  });

  describe("Layers Core", () => {
    it("creates default layers for window on first read without side-effects", () => {
      const layers = getLayersForWindow("win-layers-test");
      expect(Array.isArray(layers)).toBe(true);
      expect(layers.length).toBeGreaterThan(0);
      expect(layers.some((l) => l.type === "pmtiles")).toBe(true);
    });

    it("notifies layers changed callback on layer addition and removal", () => {
      let notifiedWinId = null;
      setOnLayersChangeCallback((winId) => {
        notifiedWinId = winId;
      });

      const newLayer = addOrUpdateLayer("win-layers-test", {
        id: "test-contour-1",
        name: "Test Contour",
        type: "contour",
      });
      expect(notifiedWinId).toBe("win-layers-test");
      expect(newLayer.id).toBe("test-contour-1");

      removeLayer("test-contour-1", "win-layers-test");
      expect(notifiedWinId).toBe("win-layers-test");
      expect(getLayersForWindow("win-layers-test").some((l) => l.id === "test-contour-1")).toBe(false);
    });
  });
});
