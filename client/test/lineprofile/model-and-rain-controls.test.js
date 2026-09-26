// model-and-rain-controls.test.js - Verification of model selection & rain controls across profile panels
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { hovmollerController } from "../../src/layers/lineprofile/hovmollerController.js";
import { lineHeightController } from "../../src/layers/lineprofile/lineHeightController.js";
import { timeHeightController } from "../../src/layers/timeheight/timeHeightController.js";
import { HovmollerPanel } from "../../src/layers/lineprofile/hovmollerPanel.js";
import { LineHeightPanel } from "../../src/layers/lineprofile/lineHeightPanel.js";
import { TimeHeightPanel } from "../../src/layers/timeheight/timeHeightPanel.js";
import { DEFAULT_MODELS } from "../../src/lib/stores/tabsCore.js";

function createMockMap() {
  const sources = new Map();
  const layers = new Map();
  const listeners = new Map();
  return {
    sources, layers, listeners,
    on(ev, cb) {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(cb);
    },
    off(ev, cb) {
      const arr = listeners.get(ev) || [];
      listeners.set(ev, arr.filter((f) => f !== cb));
      if (listeners.get(ev).length === 0) listeners.delete(ev);
    },
    getSource(id) { return sources.get(id); },
    addSource(id, def) {
      const src = { ...def, setData(d) { src.data = d; } };
      sources.set(id, src);
    },
    removeSource(id) { sources.delete(id); },
    getLayer(id) { return layers.get(id); },
    addLayer(def) { layers.set(def.id, def); },
    removeLayer(id) { layers.delete(id); },
    setLayoutProperty() {},
    unproject(pt) { return { lng: pt.x, lat: pt.y }; },
  };
}

describe("Model & Rain Controls for Profile Panels", () => {
  let mockMap;
  beforeEach(() => {
    mockMap = createMockMap();
  });

  describe("Hovmoller (Time-Line) Model and Rain Controls", () => {
    test("Hovmoller panel defaults model to ECMWF_HR, rain unchecked, and rain step auto", () => {
      const panel = new HovmollerPanel({ windowId: "test-hov" });
      expect(panel.model).toBe("ECMWF_HR");
      expect(panel.rainStep).toBe("auto");

      panel.setModel("GRAPES_GFS");
      expect(panel.model).toBe("GRAPES_GFS");

      panel.setRainStep("RAIN06");
      expect(panel.rainStep).toBe("RAIN06");

      panel.destroy();
    });

    test("Hovmoller controller tracks model and rainStep and sets them", async () => {
      const win = { id: "hov-ctrl-test" };
      await hovmollerController.init(mockMap, win, { config: {} });

      const state = hovmollerController._getState(win);
      expect(state.model).toBe("ECMWF_HR");
      expect(state.rainStep).toBe("auto");

      // Update rainStep
      hovmollerController.setRainStep("RAIN06", win);
      expect(state.rainStep).toBe("RAIN06");

      // Update model
      await hovmollerController.setModel("GRAPES_GFS", win);
      expect(state.model).toBe("GRAPES_GFS");

      hovmollerController.destroy(mockMap, win);
    });
  });

  describe("Line-Height Cross-Section Model Controls", () => {
    test("LineHeight panel defaults model to ECMWF_HR and supports setModel", () => {
      const panel = new LineHeightPanel({ windowId: "test-lh" });
      expect(panel.model).toBe("ECMWF_HR");

      panel.setModel("GRAPES_GFS");
      expect(panel.model).toBe("GRAPES_GFS");

      panel.destroy();
    });

    test("LineHeight controller manages model in state and supports setModel", async () => {
      const win = { id: "lh-ctrl-test" };
      await lineHeightController.init(mockMap, win, { config: {} });

      const state = lineHeightController._getState(win);
      expect(state.model).toBe("ECMWF_HR");

      await lineHeightController.setModel("JAPAN_MR", win);
      expect(state.model).toBe("JAPAN_MR");

      lineHeightController.destroy(mockMap, win);
    });
  });

  describe("Time-Height Cross-Section Model Controls", () => {
    test("TimeHeight panel defaults model to ECMWF_HR and supports setModel", () => {
      const panel = new TimeHeightPanel({ windowId: "test-th" });
      expect(panel.model).toBe("ECMWF_HR");

      panel.setModel("SHANGHAI_MR");
      expect(panel.model).toBe("SHANGHAI_MR");

      panel.destroy();
    });

    test("TimeHeight controller manages model in state and supports setModel", async () => {
      const win = { id: "th-ctrl-test" };
      await timeHeightController.init(mockMap, win, { config: {} });

      const state = timeHeightController._getState(win);
      expect(state.model).toBe("ECMWF_HR");

      await timeHeightController.setModel("BEIJING_MR", win);
      expect(state.model).toBe("BEIJING_MR");

      timeHeightController.destroy(mockMap, win);
    });
  });
});
