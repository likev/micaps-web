// model-and-rain-controls.test.js - Verification of model selection & rain controls across profile panels
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { hovmollerController } from "../../src/layers/lineprofile/hovmollerController.js";
import { lineHeightController } from "../../src/layers/lineprofile/lineHeightController.js";
import { timeHeightController } from "../../src/layers/timeheight/timeHeightController.js";
import { HovmollerPanel } from "../../src/layers/lineprofile/hovmollerPanel.js";
import { LineHeightPanel } from "../../src/layers/lineprofile/lineHeightPanel.js";
import { TimeHeightPanel } from "../../src/layers/timeheight/timeHeightPanel.js";
import { DEFAULT_MODELS } from "../../src/lib/stores/tabsCore.js";
import { validateNPoints } from "../../src/layers/lineprofile/lineUtils.js";
import { loadHovmollerMatrix } from "../../src/layers/lineprofile/hovmollerLoader.js";

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

    test("loadHovmollerMatrix sends rain_step query param only when not auto", async () => {
      const origFetch = globalThis.fetch;
      const urls = [];
      globalThis.fetch = async (url) => {
        urls.push(String(url));
        const dummyNdjson = JSON.stringify({ type: "result", result: { leads: [0, 12], rh: [[50], [55]] } }) + "\n";
        return new Response(dummyNdjson, {
          status: 200,
          headers: { "Content-Type": "application/x-ndjson" },
        });
      };

      try {
        await loadHovmollerMatrix({
          model: "ECMWF_HR",
          cycle: "2026092600",
          leads: [0, 12],
          rainStep: "RAIN06",
        });
        expect(urls.length).toBe(1);
        expect(urls[0]).toContain("rain_step=RAIN06");

        await loadHovmollerMatrix({
          model: "ECMWF_HR",
          cycle: "2026092600",
          leads: [0, 12],
          rainStep: "auto",
        });
        expect(urls.length).toBe(2);
        expect(urls[1]).not.toContain("rain_step");
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    test("HovmollerPanel forwards matrix.rainStep to canvasRenderer", () => {
      const panel = new HovmollerPanel({ windowId: "test-hov-step" });
      let forwardedOptions = null;
      panel.canvasRenderer = {
        setOptions(opts) { forwardedOptions = opts; },
        setData() {},
      };

      panel.setData({ leads: [0, 12], rainStep: "RAIN12" }, 500);
      expect(forwardedOptions).toEqual({ rainStep: "RAIN12" });

      panel.destroy();
    });

    test("setAxisSwap is zero-fetch and updates state and persists config", () => {
      const layer = { id: "ec-hovmoller-diagram", config: {} };
      const win = { id: "axis-swap-test", layers: [layer] };
      hovmollerController.init(mockMap, win, { config: layer.config });

      const origFetch = globalThis.fetch;
      let fetchCalled = false;
      globalThis.fetch = () => {
        fetchCalled = true;
        return Promise.reject(new Error("Should not fetch"));
      };

      try {
        hovmollerController.setAxisSwap("time-x", win);
        const s = hovmollerController._getState(win);
        expect(s.axisSwap).toBe("time-x");
        expect(layer.config.axisSwap).toBe("time-x");
        expect(fetchCalled).toBe(false);
      } finally {
        globalThis.fetch = origFetch;
        hovmollerController.destroy(mockMap, win);
      }
    });

    test("syncDrawerCheckbox persists element visibility without fetch", () => {
      const layer = { id: "ec-hovmoller-diagram", config: {} };
      const win = { id: "drawer-test", layers: [layer] };
      hovmollerController.init(mockMap, win, { config: layer.config });

      hovmollerController.syncDrawerCheckbox("RAIN", true, win);
      const found1 = hovmollerController._findLayer(win);
      expect(found1?.config.showRain).toBe(true);

      hovmollerController.syncDrawerCheckbox("RH", false, win);
      const found2 = hovmollerController._findLayer(win);
      expect(found2?.config.showRH).toBe(false);

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

  describe("Transect Resolution & N-Points Validation", () => {
    test("validateNPoints accepts all select options [11, 21, 41, 61, 81] and enforces 2..81 range", () => {
      const selectOptions = [11, 21, 41, 61, 81];
      for (const n of selectOptions) {
        const res = validateNPoints(n);
        expect(res.ok).toBe(true);
        expect(res.value).toBe(n);
      }

      // Valid boundary values
      expect(validateNPoints(2).ok).toBe(true);
      expect(validateNPoints(2).value).toBe(2);
      expect(validateNPoints(81).ok).toBe(true);
      expect(validateNPoints(81).value).toBe(81);

      // Invalid out-of-range values
      expect(validateNPoints(1).ok).toBe(false);
      expect(validateNPoints(82).ok).toBe(false);
      expect(validateNPoints(0).ok).toBe(false);
      expect(validateNPoints(-10).ok).toBe(false);
      expect(validateNPoints("invalid").ok).toBe(false);
    });
  });
});

