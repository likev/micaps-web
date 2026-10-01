// time-range-swap.test.js - Unit tests for timeheight time-range state and swap axis label synchronization
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { TimeHeightPanel } from "../../src/layers/timeheight/timeHeightPanel.js";
import { timeHeightController } from "../../src/layers/timeheight/timeHeightController.js";

function setupMockEnvironment() {
  const elements = new Map();

  const createMockElement = (id = "", className = "", tag = "div") => {
    const elListeners = new Map();
    const childList = [];

    const el = {
      id,
      className,
      tagName: tag.toUpperCase(),
      style: {},
      value: "",
      textContent: "",
      innerHTML: "",
      classList: {
        _classes: new Set(className ? className.split(/\s+/) : []),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        contains(c) { return this._classes.has(c); },
      },
      children: childList,
      offsetWidth: 680,
      offsetHeight: 520,
      clientWidth: 680,
      clientHeight: 520,
      getBoundingClientRect: () => ({
        left: 100,
        top: 60,
        right: 780,
        bottom: 580,
        width: 680,
        height: 520,
      }),
      setAttribute: () => {},
      getAttribute: () => null,
      appendChild: (child) => { childList.push(child); },
      removeChild: (child) => {
        const idx = childList.indexOf(child);
        if (idx !== -1) childList.splice(idx, 1);
      },
      querySelector: (sel) => {
        if (sel === ".th-canvas") {
          return {
            getContext: () => ({
              setTransform: () => {},
              clearRect: () => {},
              fillRect: () => {},
              strokeRect: () => {},
              beginPath: () => {},
              moveTo: () => {},
              lineTo: () => {},
              stroke: () => {},
              fill: () => {},
              fillText: () => {},
              save: () => {},
              restore: () => {},
              scale: () => {},
              resetTransform: () => {},
            }),
            clientWidth: 640,
            clientHeight: 480,
            width: 640,
            height: 480,
            addEventListener: () => {},
            removeEventListener: () => {},
            getBoundingClientRect: () => ({ left: 100, top: 100, width: 640, height: 480 }),
          };
        }
        if (sel === ".th-panel-header") return cachedElements.header;
        if (sel === ".th-header-model") return cachedElements.headerModel;
        if (sel === ".th-header-cycle") return cachedElements.headerCycle;
        if (sel === ".th-btn-min") return cachedElements.btnMin;
        if (sel === ".th-btn-close") return cachedElements.btnClose;
        if (sel === ".th-btn-export") return cachedElements.btnExport;
        if (sel === ".th-btn-direction") return cachedElements.btnDir;
        if (sel === ".th-btn-apply") return cachedElements.btnApply;
        if (sel === ".th-input-start") return cachedElements.inputStart;
        if (sel === ".th-input-end") return cachedElements.inputEnd;
        if (sel === ".th-select-step") return cachedElements.selectStep;
        if (sel === ".th-select-model") return cachedElements.selectModel;
        if (sel === ".th-select-cycle") return cachedElements.selectCycle;
        if (sel === ".th-body") return cachedElements.body;
        if (sel === ".th-controls-row") return cachedElements.controls;
        if (sel === ".th-footer-meta") return cachedElements.footerMeta;
        if (sel === ".th-progress-wrap") return cachedElements.progressWrap;
        if (sel === ".th-progress-bar") return cachedElements.progressBar;
        if (sel === ".th-progress-label") return cachedElements.progressLabel;
        if (sel === ".th-btn-mode-point") return cachedElements.btnModePoint;
        if (sel === ".th-btn-mode-line") return cachedElements.btnModeLine;
        return null;
      },
      querySelectorAll: (sel) => {
        if (sel.includes(".th-resize-handle")) return cachedHandles;
        return [];
      },
      addEventListener: (evt, fn) => {
        if (!elListeners.has(evt)) elListeners.set(evt, []);
        elListeners.get(evt).push(fn);
      },
      removeEventListener: (evt, fn) => {
        if (!elListeners.has(evt)) return;
        elListeners.set(evt, elListeners.get(evt).filter((f) => f !== fn));
      },
      _fire: (evt, data = {}) => {
        const fns = elListeners.get(evt) || [];
        fns.forEach((f) => f({ preventDefault: () => {}, stopPropagation: () => {}, ...data }));
      },
    };
    if (id) elements.set(id, el);
    return el;
  };

  const cachedElements = {
    header: createMockElement("header", "th-panel-header"),
    headerModel: createMockElement("header-model", "th-header-model"),
    headerCycle: createMockElement("header-cycle", "th-header-cycle"),
    btnMin: createMockElement("btn-min", "th-btn-min", "button"),
    btnClose: createMockElement("btn-close", "th-btn-close", "button"),
    btnExport: createMockElement("btn-export", "th-btn-export", "button"),
    btnDir: createMockElement("btn-dir", "th-btn-direction", "button"),
    btnApply: createMockElement("btn-apply", "th-btn-apply", "button"),
    inputStart: createMockElement("input-start", "th-input-start", "input"),
    inputEnd: createMockElement("input-end", "th-input-end", "input"),
    selectStep: createMockElement("select-step", "th-select-step", "select"),
    selectModel: createMockElement("select-model", "th-select-model", "select"),
    selectCycle: createMockElement("select-cycle", "th-select-cycle", "select"),
    body: createMockElement("body", "th-body"),
    controls: createMockElement("controls", "th-controls-row"),
    footerMeta: createMockElement("footer-meta", "th-footer-meta"),
    progressWrap: createMockElement("progress-wrap", "th-progress-wrap"),
    progressBar: createMockElement("progress-bar", "th-progress-bar"),
    progressLabel: createMockElement("progress-label", "th-progress-label"),
    btnModePoint: createMockElement("mode-point", "th-btn-mode-point", "button"),
    btnModeLine: createMockElement("mode-line", "th-btn-mode-line", "button"),
  };

  const cachedHandles = [
    createMockElement("se", "th-resize-handle th-resize-se"),
    createMockElement("e", "th-resize-handle th-resize-e"),
    createMockElement("s", "th-resize-handle th-resize-s"),
    createMockElement("sw", "th-resize-handle th-resize-sw"),
  ];

  const mockBody = createMockElement("body", "");

  global.document = {
    body: mockBody,
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => createMockElement("", "", tag),
  };

  global.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  return { elements, cachedElements };
}

function createMockMap() {
  const sources = new Map();
  const layers = new Map();
  const listeners = new Map();

  return {
    sources,
    layers,
    listeners,
    on(event, cb) { listeners.set(event, cb); },
    off(event, cb) { listeners.delete(event); },
    getSource(id) { return sources.get(id); },
    addSource(id, def) {
      const sourceObj = { ...def, setData(data) { sourceObj.data = data; } };
      sources.set(id, sourceObj);
    },
    removeSource(id) { sources.delete(id); },
    getLayer(id) { return layers.get(id); },
    addLayer(def) { layers.set(def.id, def); },
    removeLayer(id) { layers.delete(id); },
    setLayoutProperty() {},
    unproject(pt) { return { lng: pt.x, lat: pt.y }; },
  };
}

describe("Time-Height Cross-Section Range Selection & Swap Axis State Synchronization", () => {
  let mockEnv;
  let panel;

  beforeEach(() => {
    mockEnv = setupMockEnvironment();
  });

  afterEach(() => {
    if (panel) {
      panel = null;
    }
  });

  it("defaults to 0->144h on LTR and swaps to 144->0h on RTL", () => {
    panel = new TimeHeightPanel({ windowId: "test-def" });
    const btnDir = mockEnv.cachedElements.btnDir;

    expect(btnDir.textContent).toBe("⇄ 0→144h");

    // Click swap direction
    btnDir._fire("click");
    expect(panel.timeDirection).toBe("rtl");
    expect(btnDir.textContent).toBe("⇄ 144→0h");

    // Click swap direction again
    btnDir._fire("click");
    expect(panel.timeDirection).toBe("ltr");
    expect(btnDir.textContent).toBe("⇄ 0→144h");
  });

  it("preserves 48-72h range when swapping time axis (does NOT revert to 144h-0h)", () => {
    panel = new TimeHeightPanel({ windowId: "test-48-72" });
    const btnDir = mockEnv.cachedElements.btnDir;

    // User selects 48-72h range
    panel.setRange(48, 72, 12);
    expect(panel.startHour).toBe(48);
    expect(panel.endHour).toBe(72);
    expect(btnDir.textContent).toBe("⇄ 48→72h");

    // User clicks swap time axis
    btnDir._fire("click");
    expect(panel.timeDirection).toBe("rtl");
    // CRITICAL: Must be ⇄ 72→48h, NOT ⇄ 144→0h!
    expect(btnDir.textContent).toBe("⇄ 72→48h");

    // User clicks swap time axis again to return to LTR
    btnDir._fire("click");
    expect(panel.timeDirection).toBe("ltr");
    // CRITICAL: Must be ⇄ 48→72h, NOT ⇄ 0→144h!
    expect(btnDir.textContent).toBe("⇄ 48→72h");
  });

  it("respects initial startHour and endHour options upon construction", () => {
    const ltrPanel = new TimeHeightPanel({ windowId: "init-ltr", startHour: 48, endHour: 72, timeDirection: "ltr" });
    expect(ltrPanel.startHour).toBe(48);
    expect(ltrPanel.endHour).toBe(72);
    expect(mockEnv.cachedElements.btnDir.textContent).toBe("⇄ 48→72h");

    const rtlPanel = new TimeHeightPanel({ windowId: "init-rtl", startHour: 48, endHour: 72, timeDirection: "rtl" });
    expect(rtlPanel.startHour).toBe(48);
    expect(rtlPanel.endHour).toBe(72);
    expect(mockEnv.cachedElements.btnDir.textContent).toBe("⇄ 72→48h");
  });

  it("updates direction button when range inputs are submitted via Apply button", () => {
    let rangeChanged = null;
    panel = new TimeHeightPanel({
      windowId: "test-apply",
      onRangeChange: (s, e, st) => {
        rangeChanged = { s, e, st };
        panel.setRange(s, e, st);
      },
    });

    const inputStart = mockEnv.cachedElements.inputStart;
    const inputEnd = mockEnv.cachedElements.inputEnd;
    const btnApply = mockEnv.cachedElements.btnApply;
    const btnDir = mockEnv.cachedElements.btnDir;

    // Simulate user typing 48 and 72 into input fields
    inputStart.value = "48";
    inputEnd.value = "72";
    btnApply._fire("click");

    expect(rangeChanged).toEqual({ s: 48, e: 72, st: 12 });
    expect(btnDir.textContent).toBe("⇄ 48→72h");

    // Now click swap time axis
    btnDir._fire("click");
    expect(btnDir.textContent).toBe("⇄ 72→48h");
  });

  it("synchronizes range and direction button when setData provides loaded matrix leads", () => {
    panel = new TimeHeightPanel({ windowId: "test-matrix" });
    const btnDir = mockEnv.cachedElements.btnDir;

    const mockMatrix = {
      leads: [48, 60, 72],
      levels: [1000, 850, 500],
      point: { lon: 120.0, lat: 30.0 },
      missing: {},
    };

    panel.setData(mockMatrix);

    expect(panel.startHour).toBe(48);
    expect(panel.endHour).toBe(72);
    expect(btnDir.textContent).toBe("⇄ 48→72h");

    // Toggle direction
    panel.setTimeDirection("rtl");
    expect(btnDir.textContent).toBe("⇄ 72→48h");

    // Toggle back
    panel.setTimeDirection("ltr");
    expect(btnDir.textContent).toBe("⇄ 48→72h");
  });

  it("handles arbitrary ranges (e.g. 24-48h, 0-240h, and boundary 24-24h)", () => {
    panel = new TimeHeightPanel({ windowId: "test-ranges" });
    const btnDir = mockEnv.cachedElements.btnDir;

    // 24-48h
    panel.setRange(24, 48, 6);
    expect(btnDir.textContent).toBe("⇄ 24→48h");
    panel.setTimeDirection("rtl");
    expect(btnDir.textContent).toBe("⇄ 48→24h");

    // 0-240h
    panel.setRange(0, 240, 12);
    expect(btnDir.textContent).toBe("⇄ 240→0h");
    panel.setTimeDirection("ltr");
    expect(btnDir.textContent).toBe("⇄ 0→240h");

    // Single lead edge case: 24-24h
    panel.setRange(24, 24, 12);
    expect(btnDir.textContent).toBe("⇄ 24→24h");
    panel.setTimeDirection("rtl");
    expect(btnDir.textContent).toBe("⇄ 24→24h");
  });

  it("integrates with TimeHeightController: range selection + swap axis sync", async () => {
    const mockMap = createMockMap();
    const mockWin = { id: "ctrl-win", _thGridCache: new Map(), loadSeq: 0 };

    await timeHeightController.init(mockMap, mockWin, {
      config: { lon: 121.5, lat: 31.4, startHour: 48, endHour: 72, timeDirection: "ltr" },
    });

    const state = timeHeightController._getState(mockWin);
    expect(state.startHour).toBe(48);
    expect(state.endHour).toBe(72);

    const btnDir = mockEnv.cachedElements.btnDir;
    expect(btnDir.textContent).toBe("⇄ 48→72h");

    // Swap time axis via controller
    timeHeightController.setTimeDirection("rtl", mockWin);
    expect(state.timeDirection).toBe("rtl");
    expect(btnDir.textContent).toBe("⇄ 72→48h");

    // Swap back via controller
    timeHeightController.setTimeDirection("ltr", mockWin);
    expect(state.timeDirection).toBe("ltr");
    expect(btnDir.textContent).toBe("⇄ 48→72h");

    // Change range via controller
    timeHeightController.setRange(24, 96, 12, mockWin);
    expect(state.startHour).toBe(24);
    expect(state.endHour).toBe(96);
    expect(btnDir.textContent).toBe("⇄ 24→96h");

    // Swap axis on new range
    timeHeightController.setTimeDirection("rtl", mockWin);
    expect(btnDir.textContent).toBe("⇄ 96→24h");

    timeHeightController.destroy(mockMap, mockWin);
  });

  it("isolates range and direction state across multiple windows without cross-contamination", async () => {
    const mockMap = createMockMap();
    const mockWin1 = { id: "trs-win-1", _thGridCache: new Map(), loadSeq: 0 };
    const mockWin2 = { id: "trs-win-2", _thGridCache: new Map(), loadSeq: 0 };

    timeHeightController.destroy(mockMap, mockWin1);
    timeHeightController.destroy(mockMap, mockWin2);

    await timeHeightController.init(mockMap, mockWin1, {
      config: { lon: 120.0, lat: 30.0, startHour: 48, endHour: 72, timeDirection: "ltr" },
    });
    await timeHeightController.init(mockMap, mockWin2, {
      config: { lon: 110.0, lat: 20.0, startHour: 0, endHour: 144, timeDirection: "rtl" },
    });

    const state1 = timeHeightController._getState(mockWin1);
    const state2 = timeHeightController._getState(mockWin2);

    expect(state1.startHour).toBe(48);
    expect(state1.endHour).toBe(72);
    expect(state1.timeDirection).toBe("ltr");

    expect(state2.startHour).toBe(0);
    expect(state2.endHour).toBe(144);
    expect(state2.timeDirection).toBe("rtl");

    // Swap time axis in win1 only
    timeHeightController.setTimeDirection("rtl", mockWin1);
    expect(state1.timeDirection).toBe("rtl");
    expect(state2.timeDirection).toBe("rtl");

    // Win1 panel has 72->48h
    expect(state1.panel.startHour).toBe(48);
    expect(state1.panel.endHour).toBe(72);
    expect(state1.panel._formatDirectionLabel()).toBe("⇄ 72→48h");

    // Win2 panel has 144->0h
    expect(state2.panel.startHour).toBe(0);
    expect(state2.panel.endHour).toBe(144);
    expect(state2.panel._formatDirectionLabel()).toBe("⇄ 144→0h");

    timeHeightController.destroy(mockMap, mockWin1);
    timeHeightController.destroy(mockMap, mockWin2);
  });

  it("preserves input values in DOM when toggling direction button (does NOT reset to 0/144)", () => {
    panel = new TimeHeightPanel({ windowId: "test-input-preservation" });
    const inputStart = mockEnv.cachedElements.inputStart;
    const inputEnd = mockEnv.cachedElements.inputEnd;
    const btnDir = mockEnv.cachedElements.btnDir;

    // Set range to 48-72h
    panel.setRange(48, 72, 12);
    expect(inputStart.value).toBe(48);
    expect(inputEnd.value).toBe(72);
    expect(btnDir.textContent).toBe("⇄ 48→72h");

    // Click swap direction
    btnDir._fire("click");
    expect(btnDir.textContent).toBe("⇄ 72→48h");
    // Ensure inputs did NOT revert to 0 / 144
    expect(inputStart.value).toBe(48);
    expect(inputEnd.value).toBe(72);

    // Click swap direction back to LTR
    btnDir._fire("click");
    expect(btnDir.textContent).toBe("⇄ 48→72h");
    expect(inputStart.value).toBe(48);
    expect(inputEnd.value).toBe(72);
  });

  it("handles inverted range bounds consistently (e.g. 72-48h still formats 48→72h for LTR and 72→48h for RTL)", () => {
    panel = new TimeHeightPanel({ windowId: "test-inverted" });
    const btnDir = mockEnv.cachedElements.btnDir;

    panel.setRange(72, 48, 12);
    expect(btnDir.textContent).toBe("⇄ 48→72h");

    panel.setTimeDirection("rtl");
    expect(btnDir.textContent).toBe("⇄ 72→48h");

    panel.setTimeDirection("ltr");
    expect(btnDir.textContent).toBe("⇄ 48→72h");
  });

  it("handles string numbers cleanly in setRange and setTimeDirection", () => {
    panel = new TimeHeightPanel({ windowId: "test-string-input" });
    const btnDir = mockEnv.cachedElements.btnDir;

    panel.setRange("48", "72", "6");
    expect(panel.startHour).toBe(48);
    expect(panel.endHour).toBe(72);
    expect(panel.stepHours).toBe(6);
    expect(btnDir.textContent).toBe("⇄ 48→72h");

    panel.setTimeDirection("rtl", "24", "96");
    expect(panel.startHour).toBe(24);
    expect(panel.endHour).toBe(96);
    expect(btnDir.textContent).toBe("⇄ 96→24h");
  });

  it("handles reverse-ordered matrix leads in setData safely", () => {
    panel = new TimeHeightPanel({ windowId: "test-rev-leads" });
    const btnDir = mockEnv.cachedElements.btnDir;

    panel.setData({
      leads: [72, 60, 48],
      levels: [1000, 850],
      point: { lon: 120.0, lat: 30.0 },
      missing: {},
    });

    expect(panel.startHour).toBe(48);
    expect(panel.endHour).toBe(72);
    expect(btnDir.textContent).toBe("⇄ 48→72h");

    panel.setTimeDirection("rtl");
    expect(btnDir.textContent).toBe("⇄ 72→48h");
  });

  it("initializes TimeHeightController with pre-configured startHour: 48, endHour: 72, timeDirection: rtl", async () => {
    const mockMap = createMockMap();
    const mockWin = { id: "ctrl-win-rtl", _thGridCache: new Map(), loadSeq: 0 };

    await timeHeightController.init(mockMap, mockWin, {
      config: { lon: 121.5, lat: 31.4, startHour: 48, endHour: 72, timeDirection: "rtl" },
    });

    const state = timeHeightController._getState(mockWin);
    expect(state.startHour).toBe(48);
    expect(state.endHour).toBe(72);
    expect(state.timeDirection).toBe("rtl");

    const btnDir = mockEnv.cachedElements.btnDir;
    expect(btnDir.textContent).toBe("⇄ 72→48h");

    timeHeightController.setTimeDirection("ltr", mockWin);
    expect(btnDir.textContent).toBe("⇄ 48→72h");

    timeHeightController.destroy(mockMap, mockWin);
  });

  it("verifies HovmollerPanel initial HTML renders dynamic span bounds", async () => {
    const { HovmollerPanel } = await import("../../src/layers/lineprofile/hovmollerPanel.js");
    const hovPanel = new HovmollerPanel({ startHour: 48, endHour: 72, stepHours: 12 });
    expect(hovPanel.span.start).toBe(48);
    expect(hovPanel.span.end).toBe(72);
  });

  it("verifies LayerRow.svelte renders dynamic startHour and endHour in timeDirection dropdown", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const sveltePath = path.resolve(import.meta.dir, "../../src/components/LayerRow.svelte");
    const svelteSrc = fs.readFileSync(sveltePath, "utf-8");

    // Ensure hardcoded 0 → 144h dropdown options are removed
    expect(svelteSrc).not.toContain('<option value="ltr">0 → 144h</option>');
    expect(svelteSrc).not.toContain('<option value="rtl">144 → 0h</option>');

    // Ensure dynamic interpolation of startHour and endHour is used
    expect(svelteSrc).toContain("{layer.config?.startHour ?? 0} → {layer.config?.endHour ?? 144}h");
    expect(svelteSrc).toContain("{layer.config?.endHour ?? 144} → {layer.config?.startHour ?? 0}h");
  });
});

