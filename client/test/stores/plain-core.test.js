import { describe, it, expect } from "bun:test";
import { createInitialAppState } from "../../src/lib/stores/appCore.js";
import { createInitialUIState, clampTooltipPosition } from "../../src/lib/stores/uiCore.js";
import {
  getVisibleWindows,
  isWindowVisible,
  getNumVisible,
  createDefaultTab,
  applyAutoAllocation,
  revertAutoAllocation,
  DEFAULT_LEVELS,
  DEFAULT_MODELS,
  stepCycleHours,
} from "../../src/lib/stores/tabsCore.js";
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

      // 1. Layer control
      expect(ui.layersOpen).toBe(true);
      ui.layersOpen = false;
      expect(ui.layersOpen).toBe(false);
      ui.layersOpen = true;
      expect(ui.layersOpen).toBe(true);

      // 2. Time slider
      expect(ui.timelineVisible).toBe(false);
      ui.timelineVisible = true;
      expect(ui.timelineVisible).toBe(true);
      ui.timelineVisible = false;
      expect(ui.timelineVisible).toBe(false);

      // 3. Tooltip
      expect(ui.tooltip).toBeNull();
      ui.tooltip = { lngLat: [116.4, 39.9], props: { name: "Beijing" }, x: 120, y: 80 };
      expect(ui.tooltip.props.name).toBe("Beijing");
      ui.tooltip = null;
      expect(ui.tooltip).toBeNull();

      // 4. Toast
      expect(ui.toast).toBeNull();
      ui.toast = { kind: "error", message: "Failed to load" };
      expect(ui.toast.kind).toBe("error");
      ui.toast = null;
      expect(ui.toast).toBeNull();

      // 5. Config editor & subtabs & dirty flag
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

      // 6. Layer row expansion (single-expanded accordion model)
      expect(ui.expandedLayerId).toBeNull();
      ui.expandedLayerId = "layer-contour-500";
      expect(ui.expandedLayerId).toBe("layer-contour-500");
      ui.expandedLayerId = "layer-station-surface";
      expect(ui.expandedLayerId).toBe("layer-station-surface");
      ui.expandedLayerId = null;
      expect(ui.expandedLayerId).toBeNull();

      // 7. Fullscreen
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

    const tab2x3 = {
      layout: "2x3",
      activeWinIdx: 4,
      windows: [{ id: "w1" }, { id: "w2" }, { id: "w3" }, { id: "w4" }, { id: "w5" }, { id: "w6" }, { id: "w7" }],
    };

    it("getNumVisible returns correct split capacities", () => {
      expect(getNumVisible("1x1")).toBe(1);
      expect(getNumVisible("1x2")).toBe(2);
      expect(getNumVisible("2x2")).toBe(4);
      expect(getNumVisible("2x3")).toBe(6);
      expect(getNumVisible("3x2")).toBe(6);
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

      // In 2x3 with active = w5 (index 4 < 6), visible is first 6
      const vis2x3 = getVisibleWindows(tab2x3);
      expect(vis2x3.map((w) => w.id)).toEqual(["w1", "w2", "w3", "w4", "w5", "w6"]);
      expect(isWindowVisible(tab2x3, tab2x3.windows[4])).toBe(true);
      expect(isWindowVisible(tab2x3, tab2x3.windows[6])).toBe(false);
    });

    it("defaults autoAllocation to 'none' and supports stepCycleHours helper", () => {
      const tab = createDefaultTab(1);
      expect(tab.autoAllocation).toBe("none");

      expect(stepCycleHours("26092608", -12)).toBe("26092520");
      expect(stepCycleHours("26092608", -24)).toBe("26092508");
      expect(stepCycleHours("26092608.024", -12)).toBe("26092520");
    });

    it("supports all 5 Auto-Allocation modes: none, level, model, step, time", () => {
      const tab = createDefaultTab(1);
      tab.layout = "2x3";
      tab.windows = [
        { id: "w1", level: 500, model: "ECMWF_HR", period: 24, forecastCycle: "26092608", obsTime: "26092608" },
        { id: "w2", level: 500, model: "ECMWF_HR", period: 24, forecastCycle: "26092608", obsTime: "26092608" },
        { id: "w3", level: 500, model: "ECMWF_HR", period: 24, forecastCycle: "26092608", obsTime: "26092608" },
        { id: "w4", level: 500, model: "ECMWF_HR", period: 24, forecastCycle: "26092608", obsTime: "26092608" },
        { id: "w5", level: 500, model: "ECMWF_HR", period: 24, forecastCycle: "26092608", obsTime: "26092608" },
        { id: "w6", level: 500, model: "ECMWF_HR", period: 24, forecastCycle: "26092608", obsTime: "26092608" },
      ];

      // 1. Level allocation
      applyAutoAllocation(tab, "level");
      expect(tab.autoAllocation).toBe("level");
      expect(tab.windows.map((w) => w.level)).toEqual([500, 850, 1000, 200, 700, 925]);

      // 2. Model allocation (NWP comparison: ECMWF, GRAPES_GFS, BEIJING_MR, GRAPES_3KM, JAPAN_MR, SHANGHAI_MR)
      applyAutoAllocation(tab, "model");
      expect(tab.autoAllocation).toBe("model");
      expect(tab.windows.map((w) => w.model)).toEqual([
        "ECMWF_HR",
        "GRAPES_GFS",
        "GRAPES_3KM",
        "SHANGHAI_MR",
        "BEIJING_MR",
        "JAPAN_MR",
      ]);

      // 3. Step allocation (same cycle, increasing forecast leads: 24h, 36h, 48h, 60h, 72h, 84h)
      applyAutoAllocation(tab, "step", { period: 24, stepLength: 12 });
      expect(tab.autoAllocation).toBe("step");
      expect(tab.windows.map((w) => w.period)).toEqual([24, 36, 48, 60, 72, 84]);

      // 4. Time allocation for NWP (run-to-run dProg/dt consistency: 26092608.024, 26092520.036, 26092508.048...)
      applyAutoAllocation(tab, "time", { forecastCycle: "26092608", period: 24, isObservation: false });
      expect(tab.autoAllocation).toBe("time");
      expect(tab.windows.map((w) => `${w.forecastCycle}.${String(w.period).padStart(3, "0")}`)).toEqual([
        "26092608.024",
        "26092520.036",
        "26092508.048",
        "26092420.060",
        "26092408.072",
        "26092320.084",
      ]);

      // 5. Time allocation for Observation (stepping backwards: 26092608, 26092520, 26092508...)
      applyAutoAllocation(tab, "time", { obsTime: "26092608", isObservation: true });
      expect(tab.windows.map((w) => w.obsTime)).toEqual([
        "26092608",
        "26092520",
        "26092508",
        "26092420",
        "26092408",
        "26092320",
      ]);

      // 6. Revert to 'none' unifying to active window level
      revertAutoAllocation(tab, 850);
      expect(tab.autoAllocation).toBe("none");
      expect(tab.windows.map((w) => w.level)).toEqual([850, 850, 850, 850, 850, 850]);
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
