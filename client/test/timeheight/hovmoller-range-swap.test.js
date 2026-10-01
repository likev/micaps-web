// hovmoller-range-swap.test.js - Unit tests for HovmollerPanel label state
// and HovmollerController init() preservation of pre-existing startHour/endHour.
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { HovmollerPanel } from "../../src/layers/lineprofile/hovmollerPanel.js";
import { hovmollerController } from "../../src/layers/lineprofile/hovmollerController.js";

// ---------------------------------------------------------------------------
// Mock DOM environment
// ---------------------------------------------------------------------------
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
      checked: false,
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
        left: 100, top: 60, right: 780, bottom: 580, width: 680, height: 520,
      }),
      setAttribute: () => {},
      getAttribute: () => null,
      appendChild: (child) => { childList.push(child); },
      removeChild: (child) => {
        const idx = childList.indexOf(child);
        if (idx !== -1) childList.splice(idx, 1);
      },
      querySelector: (sel) => cachedElements[selectorMap[sel]] || null,
      querySelectorAll: (sel) => {
        if (sel.includes(".hov-resize-handle")) return cachedHandles;
        if (sel.includes(".hov-controls-row") || sel.includes(".hov-line-row")) return [cachedElements.controlsRow];
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
        fns.forEach((f) => f({ preventDefault: () => {}, stopPropagation: () => {}, key: data.key, target: el, ...data }));
      },
    };
    if (id) elements.set(id, el);
    return el;
  };

  // Created before selectorMap so cachedElements can reference them
  const cachedElements = {};
  const selectorMap = {};

  const addEl = (key, sel, id, cls, tag = "div") => {
    cachedElements[key] = createMockElement(id, cls, tag);
    selectorMap[sel] = key;
  };

  addEl("canvas", ".hov-canvas", "hov-canvas", "hov-canvas", "canvas");
  addEl("btnRev", ".hov-btn-rev", "hov-btn-rev", "hov-btn-rev", "button");
  addEl("btnSwap", ".hov-btn-swap", "hov-btn-swap", "hov-btn-swap", "button");
  addEl("btnSpan", ".hov-btn-span", "hov-btn-span", "hov-btn-span", "button");
  addEl("btnClose", ".hov-btn-close", "hov-btn-close", "hov-btn-close", "button");
  addEl("btnMin", ".hov-btn-min", "hov-btn-min", "hov-btn-min", "button");
  addEl("btnExport", ".hov-btn-export", "hov-btn-export", "hov-btn-export", "button");
  addEl("btnCancel", ".hov-btn-cancel", "hov-btn-cancel", "hov-btn-cancel", "button");
  addEl("btnDraw", ".hov-btn-draw", "hov-btn-draw", "hov-btn-draw", "button");
  addEl("btnSeta", ".hov-btn-seta", "hov-btn-seta", "hov-btn-seta", "button");
  addEl("btnSetb", ".hov-btn-setb", "hov-btn-setb", "hov-btn-setb", "button");
  addEl("btnLineapply", ".hov-btn-lineapply", "hov-btn-lineapply", "hov-btn-lineapply", "button");
  addEl("inputStart", ".hov-input-start", "hov-input-start", "hov-input-start", "input");
  addEl("inputEnd", ".hov-input-end", "hov-input-end", "hov-input-end", "input");
  addEl("selectStep", ".hov-select-step", "hov-select-step", "hov-select-step", "select");
  addEl("selectLevel", ".hov-select-level", "hov-select-level", "hov-select-level", "select");
  addEl("selectModel", ".hov-select-model", "hov-select-model", "hov-select-model", "select");
  addEl("selectCycle", ".hov-select-cycle", "hov-select-cycle", "hov-select-cycle", "select");
  addEl("selectN", ".hov-select-n", "hov-select-n", "hov-select-n", "select");
  addEl("selectRainStep", ".hov-select-rain-step", "hov-select-rain-step", "hov-select-rain-step", "select");
  addEl("headerModel", ".hov-header-model", "hov-header-model", "hov-header-model", "span");
  addEl("headerMeta", ".hov-header-meta", "hov-header-meta", "hov-header-meta", "span");
  addEl("footerMeta", ".hov-footer-meta", "hov-footer-meta", "hov-footer-meta", "div");
  addEl("footerView", ".hov-footer-view", "hov-footer-view", "hov-footer-view", "div");
  addEl("progressWrap", ".hov-progress-wrap", "hov-progress-wrap", "hov-progress-wrap", "div");
  addEl("progressBar", ".hov-progress-bar", "hov-progress-bar", "hov-progress-bar", "div");
  addEl("progressLabel", ".hov-progress-label", "hov-progress-label", "hov-progress-label", "span");
  addEl("body", ".hov-body", "hov-body", "hov-body", "div");
  addEl("controlsRow", ".hov-controls-row", "hov-controls-row", "hov-controls-row", "div");
  addEl("lineRow", ".hov-line-row", "hov-line-row", "hov-line-row", "div");
  addEl("header", ".hov-panel-header", "hov-panel-header", "hov-panel-header", "div");
  addEl("inputAlon", ".hov-input-alon", "hov-input-alon", "hov-input-alon", "input");
  addEl("inputAlat", ".hov-input-alat", "hov-input-alat", "hov-input-alat", "input");
  addEl("inputBlon", ".hov-input-blon", "hov-input-blon", "hov-input-blon", "input");
  addEl("inputBlat", ".hov-input-blat", "hov-input-blat", "hov-input-blat", "input");
  addEl("cbRh", ".hov-cb-rh", "hov-cb-rh", "hov-cb-rh", "input");
  addEl("cbTemp", ".hov-cb-temp", "hov-cb-temp", "hov-cb-temp", "input");
  addEl("cbVvel", ".hov-cb-vvel", "hov-cb-vvel", "hov-cb-vvel", "input");
  addEl("cbWind", ".hov-cb-wind", "hov-cb-wind", "hov-cb-wind", "input");
  addEl("cbRain", ".hov-cb-rain", "hov-cb-rain", "hov-cb-rain", "input");

  // Canvas context stub
  cachedElements.canvas.getContext = () => ({
    setTransform: () => {}, clearRect: () => {}, fillRect: () => {},
    strokeRect: () => {}, beginPath: () => {}, moveTo: () => {},
    lineTo: () => {}, stroke: () => {}, fill: () => {}, fillText: () => {},
    save: () => {}, restore: () => {}, scale: () => {}, resetTransform: () => {},
    measureText: () => ({ width: 40 }), createLinearGradient: () => ({ addColorStop: () => {} }),
    drawImage: () => {}, rect: () => {}, clip: () => {}, closePath: () => {},
    arc: () => {}, bezierCurveTo: () => {}, quadraticCurveTo: () => {},
    setLineDash: () => {}, translate: () => {}, rotate: () => {},
    isPointInPath: () => false, createRadialGradient: () => ({ addColorStop: () => {} }),
  });
  cachedElements.canvas.width = 640;
  cachedElements.canvas.height = 480;
  cachedElements.canvas.clientWidth = 640;
  cachedElements.canvas.clientHeight = 480;

  // Checkbox stubs
  cachedElements.cbRh.checked = true;
  cachedElements.cbTemp.checked = true;
  cachedElements.cbVvel.checked = true;
  cachedElements.cbWind.checked = true;

  // Selects default values
  cachedElements.selectStep.value = "12";
  cachedElements.inputStart.value = "0";
  cachedElements.inputEnd.value = "144";

  const cachedHandles = [
    createMockElement("se", "hov-resize-handle hov-resize-se"),
    createMockElement("e", "hov-resize-handle hov-resize-e"),
    createMockElement("s", "hov-resize-handle hov-resize-s"),
    createMockElement("sw", "hov-resize-handle hov-resize-sw"),
  ];

  const mockBody = createMockElement("body", "");
  mockBody.querySelector = () => null;
  mockBody.querySelectorAll = () => [];

  global.document = {
    body: mockBody,
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => {
      const el2 = createMockElement("", "", tag);
      el2.querySelector = (sel) => cachedElements[selectorMap[sel]] || null;
      el2.querySelectorAll = (sel) => {
        if (sel.includes(".hov-resize-handle")) return cachedHandles;
        if (sel.includes(".hov-controls-row") || sel.includes(".hov-line-row")) return [cachedElements.controlsRow];
        return [];
      };
      return el2;
    },
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
    sources, layers, listeners,
    on(ev, cb) {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(cb);
    },
    off(ev, cb) {
      const arr = listeners.get(ev) || [];
      listeners.set(ev, arr.filter((f) => f !== cb));
    },
    emit(ev, e) { for (const cb of [...(listeners.get(ev) || [])]) cb(e); },
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
    setFilter() {},
    unproject(pt) { return { lng: pt.x, lat: pt.y }; },
  };
}

// ---------------------------------------------------------------------------
// HovmollerPanel unit tests
// ---------------------------------------------------------------------------
describe("HovmollerPanel – label state & range-swap synchronization", () => {
  let mockEnv;
  let panel;

  beforeEach(() => {
    mockEnv = setupMockEnvironment();
  });

  afterEach(() => {
    panel = null;
  });

  it("defaults to 0→144h forward label and 144→0h reverse label", () => {
    panel = new HovmollerPanel({ windowId: "hov-def" });
    const btnRev = mockEnv.cachedElements.btnRev;

    // Forward direction default
    expect(panel.timeDir).toBe("fwd");
    expect(btnRev.textContent).toBe("⇄ 0→144h");

    // Click rev button (no onTimeDir callback → internal toggle)
    btnRev._fire("click");
    expect(panel.timeDir).toBe("rev");
    expect(btnRev.textContent).toBe("⇄ 144→0h");

    // Click again to revert
    btnRev._fire("click");
    expect(panel.timeDir).toBe("fwd");
    expect(btnRev.textContent).toBe("⇄ 0→144h");
  });

  it("preserves 48→72h label when swap direction is toggled (does NOT revert to 0→144h)", () => {
    panel = new HovmollerPanel({ windowId: "hov-48-72", startHour: 48, endHour: 72 });
    const btnRev = mockEnv.cachedElements.btnRev;

    // After construction with custom span
    expect(panel.span.start).toBe(48);
    expect(panel.span.end).toBe(72);
    expect(btnRev.textContent).toBe("⇄ 48→72h");

    // Toggle to reverse — CRITICAL: must stay 48/72, not revert to 0/144
    btnRev._fire("click");
    expect(panel.timeDir).toBe("rev");
    expect(btnRev.textContent).toBe("⇄ 72→48h");

    // Toggle back to forward
    btnRev._fire("click");
    expect(panel.timeDir).toBe("fwd");
    expect(btnRev.textContent).toBe("⇄ 48→72h");
  });

  it("setView(axisSwap, timeDir) keeps 48→72h label when called with custom span", () => {
    panel = new HovmollerPanel({ windowId: "hov-setview" });
    const btnRev = mockEnv.cachedElements.btnRev;

    // Set custom span first
    panel.setSpan(48, 72, 12);
    expect(btnRev.textContent).toBe("⇄ 48→72h");

    // Swap axis (display-only) — label should preserve 48/72
    panel.setView("time-x", "fwd");
    expect(btnRev.textContent).toBe("⇄ 48→72h");

    // Reverse direction with time-x axis
    panel.setView("time-x", "rev");
    expect(btnRev.textContent).toBe("⇄ 72→48h");

    // Return to dist-x fwd
    panel.setView("dist-x", "fwd");
    expect(btnRev.textContent).toBe("⇄ 48→72h");
  });

  it("setData(matrix) with leads [48, 60, 72] updates inputs and button label", () => {
    panel = new HovmollerPanel({ windowId: "hov-setdata" });
    const btnRev = mockEnv.cachedElements.btnRev;
    const inputStart = mockEnv.cachedElements.inputStart;
    const inputEnd = mockEnv.cachedElements.inputEnd;

    const mockMatrix = {
      leads: [48, 60, 72],
      distKm: 1500,
      missing: { rh: 0, tmp: 0, vvel: 0 },
    };

    panel.setData(mockMatrix);

    expect(panel.span.start).toBe(48);
    expect(panel.span.end).toBe(72);
    expect(inputStart.value).toBe(48);
    expect(inputEnd.value).toBe(72);
    expect(btnRev.textContent).toBe("⇄ 48→72h");

    // Toggle reverse — must use the matrix-derived 48/72 NOT 0/144
    panel.setView(panel.axisSwap, "rev");
    expect(btnRev.textContent).toBe("⇄ 72→48h");

    panel.setView(panel.axisSwap, "fwd");
    expect(btnRev.textContent).toBe("⇄ 48→72h");
  });

  it("setData with reverse-ordered leads normalises correctly", () => {
    panel = new HovmollerPanel({ windowId: "hov-revleads" });
    const btnRev = mockEnv.cachedElements.btnRev;

    panel.setData({ leads: [72, 60, 48], distKm: 500, missing: {} });

    expect(panel.span.start).toBe(48);
    expect(panel.span.end).toBe(72);
    expect(btnRev.textContent).toBe("⇄ 48→72h");
  });

  it("Enter key on hov-input-start triggers span update (same as Apply button)", () => {
    let spannedValues = null;
    panel = new HovmollerPanel({
      windowId: "hov-enter-start",
      onSpanChange: (s, e, st) => { spannedValues = { s, e, st }; },
    });
    const inputStart = mockEnv.cachedElements.inputStart;
    const inputEnd = mockEnv.cachedElements.inputEnd;
    const selectStep = mockEnv.cachedElements.selectStep;

    inputStart.value = "48";
    inputEnd.value = "96";
    selectStep.value = "6";

    inputStart._fire("keydown", { key: "Enter" });

    expect(spannedValues).not.toBeNull();
    expect(spannedValues.s).toBe(48);
    expect(spannedValues.e).toBe(96);
    expect(spannedValues.st).toBe(6);
  });

  it("Enter key on hov-input-end triggers span update", () => {
    let spannedValues = null;
    panel = new HovmollerPanel({
      windowId: "hov-enter-end",
      onSpanChange: (s, e, st) => { spannedValues = { s, e, st }; },
    });
    const inputStart = mockEnv.cachedElements.inputStart;
    const inputEnd = mockEnv.cachedElements.inputEnd;
    const selectStep = mockEnv.cachedElements.selectStep;

    inputStart.value = "24";
    inputEnd.value = "72";
    selectStep.value = "12";

    inputEnd._fire("keydown", { key: "Enter" });

    expect(spannedValues).not.toBeNull();
    expect(spannedValues.s).toBe(24);
    expect(spannedValues.e).toBe(72);
  });

  it("Enter key on input falls back to setSpan() when onSpanChange is absent", () => {
    panel = new HovmollerPanel({ windowId: "hov-fallback" });
    const inputStart = mockEnv.cachedElements.inputStart;
    const inputEnd = mockEnv.cachedElements.inputEnd;
    const selectStep = mockEnv.cachedElements.selectStep;
    const btnRev = mockEnv.cachedElements.btnRev;

    inputStart.value = "48";
    inputEnd.value = "72";
    selectStep.value = "12";

    inputStart._fire("keydown", { key: "Enter" });

    expect(panel.span.start).toBe(48);
    expect(panel.span.end).toBe(72);
    expect(btnRev.textContent).toBe("⇄ 48→72h");
  });

  it("Apply button fires onSpanChange when provided", () => {
    let spannedValues = null;
    panel = new HovmollerPanel({
      windowId: "hov-apply-cb",
      onSpanChange: (s, e, st) => { spannedValues = { s, e, st }; },
    });
    const inputStart = mockEnv.cachedElements.inputStart;
    const inputEnd = mockEnv.cachedElements.inputEnd;
    const selectStep = mockEnv.cachedElements.selectStep;
    const btnSpan = mockEnv.cachedElements.btnSpan;

    inputStart.value = "0";
    inputEnd.value = "120";
    selectStep.value = "6";

    btnSpan._fire("click");

    expect(spannedValues).toEqual({ s: 0, e: 120, st: 6 });
  });

  it("normalises inverted span bounds in label (72-48h input → 48→72h fwd, 72→48h rev)", () => {
    panel = new HovmollerPanel({ windowId: "hov-inverted" });
    const btnRev = mockEnv.cachedElements.btnRev;

    panel.setSpan(72, 48, 12);
    expect(btnRev.textContent).toBe("⇄ 48→72h");

    panel.setView(panel.axisSwap, "rev");
    expect(btnRev.textContent).toBe("⇄ 72→48h");

    panel.setView(panel.axisSwap, "fwd");
    expect(btnRev.textContent).toBe("⇄ 48→72h");
  });

  it("_formatTimeDirLabel() uses span state not options defaults", () => {
    panel = new HovmollerPanel({ windowId: "hov-fmt", startHour: 0, endHour: 144 });
    panel.setSpan(24, 96, 12);

    expect(panel._formatTimeDirLabel("fwd")).toBe("⇄ 24→96h");
    expect(panel._formatTimeDirLabel("rev")).toBe("⇄ 96→24h");
  });

  it("DOM inputs are NOT reset to 0/144 when toggling time direction", () => {
    panel = new HovmollerPanel({ windowId: "hov-dom-preserve" });
    const inputStart = mockEnv.cachedElements.inputStart;
    const inputEnd = mockEnv.cachedElements.inputEnd;
    const btnRev = mockEnv.cachedElements.btnRev;

    panel.setSpan(48, 72, 12);
    expect(inputStart.value).toBe(48);
    expect(inputEnd.value).toBe(72);

    // Toggle direction
    btnRev._fire("click");
    expect(btnRev.textContent).toBe("⇄ 72→48h");
    // Inputs must NOT have reverted
    expect(inputStart.value).toBe(48);
    expect(inputEnd.value).toBe(72);

    // Toggle back
    btnRev._fire("click");
    expect(inputStart.value).toBe(48);
    expect(inputEnd.value).toBe(72);
  });

  it("span state is respected after multiple setView calls (no stale options fallback)", () => {
    panel = new HovmollerPanel({ windowId: "hov-multi-view", startHour: 0, endHour: 144 });
    const btnRev = mockEnv.cachedElements.btnRev;

    // Custom span overrides options
    panel.setSpan(12, 60, 12);
    panel.setView("dist-x", "fwd");
    expect(btnRev.textContent).toBe("⇄ 12→60h");

    panel.setView("time-x", "rev");
    expect(btnRev.textContent).toBe("⇄ 60→12h");

    panel.setView("dist-x", "rev");
    expect(btnRev.textContent).toBe("⇄ 60→12h");

    panel.setView("time-x", "fwd");
    expect(btnRev.textContent).toBe("⇄ 12→60h");
  });
});

// ---------------------------------------------------------------------------
// HovmollerController – init() startHour/endHour preservation
// ---------------------------------------------------------------------------
describe("HovmollerController – init() preserves pre-existing startHour/endHour when config omits them", () => {
  let mockEnv;
  let mockMap;

  function hovResult(leads = [0, 12, 24], n = 5) {
    const fill = (v) => Array.from({ length: leads.length }, () => Array.from({ length: n }, () => v));
    return {
      type: "result",
      pointA: { lon: 100, lat: 25, i: 1, j: 1 }, pointB: { lon: 120, lat: 35, i: 2, j: 2 },
      distKm: 1500, cycle: "26091808", leads, level: 850,
      rh: fill(60), tmp: fill(5), vvel: fill(-10), u: fill(7), v: fill(5),
      missing: { rh: 0, tmp: 0, vvel: 0, wind: 0 },
      stats: { total: leads.length * 4, failed: 0, cacheHits: 0, rhMin: 60, rhMax: 60, tmpMin: 5, tmpMax: 5, vvelMin: -10, vvelMax: -10 },
    };
  }

  function ndjsonResponse(obj, total) {
    const lines = [];
    for (let i = 1; i <= total; i++) {
      lines.push(JSON.stringify({ type: "progress", loaded: i, total, ok: i, failed: 0, cacheHits: 0, lastSource: "mock" }));
    }
    lines.push(JSON.stringify(obj));
    const text = lines.join("\n") + "\n";
    const encoder = new TextEncoder();
    return {
      ok: true, status: 200,
      headers: new Headers({ "Content-Type": "application/x-ndjson" }),
      text: async () => text,
      body: new ReadableStream({ start(c) { c.enqueue(encoder.encode(text)); c.close(); } }),
    };
  }

  let originalFetch;

  beforeEach(() => {
    mockEnv = setupMockEnvironment();
    mockMap = createMockMap();
    originalFetch = global.fetch;
    global.fetch = async (url) => {
      const s = String(url);
      if (s.includes("/api/data/hovmoller/profile")) {
        const u = new URL(s, "http://localhost");
        const leads = (u.searchParams.get("leads") || "0").split(",").map(Number);
        const n = parseInt(u.searchParams.get("npoints") || "5", 10);
        const level = parseInt(u.searchParams.get("level") || "850", 10);
        const res = hovResult(leads, n);
        res.level = level;
        return ndjsonResponse(res, leads.length * 4);
      }
      return { ok: false, status: 404, statusText: "not found", text: async () => "" };
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("uses cfg.startHour/endHour when explicitly provided in config", async () => {
    const win = { id: "hov-init-explicit", loadSeq: 0, period: 24 };
    const cfg = { lon0: 100, lat0: 25, lon1: 120, lat1: 35, npoints: 5, startHour: 48, endHour: 72, stepHours: 12, level: 850 };
    await hovmollerController.init(mockMap, win, { config: cfg });

    const s = hovmollerController._getState(win);
    expect(s.startHour).toBe(48);
    expect(s.endHour).toBe(72);
    hovmollerController.destroy(mockMap, win);
  });

  it("preserves pre-existing s.startHour/endHour when config omits them", async () => {
    const win = { id: "hov-init-preserve", loadSeq: 0, period: 24 };
    const s = hovmollerController._getState(win);
    // Manually set pre-existing state (simulating a second init after setSpan)
    s.startHour = 48;
    s.endHour = 72;
    s.stepHours = 12;

    // Config that omits startHour / endHour / stepHours
    const cfg = { lon0: 100, lat0: 25, lon1: 120, lat1: 35, npoints: 5, level: 850 };
    await hovmollerController.init(mockMap, win, { config: cfg });

    const state = hovmollerController._getState(win);
    // CRITICAL: Must preserve 48/72, NOT reset to 0/144
    expect(state.startHour).toBe(48);
    expect(state.endHour).toBe(72);
    hovmollerController.destroy(mockMap, win);
  });

  it("falls back to 0/144/12 when both config and state are absent", async () => {
    const win = { id: "hov-init-fallback", loadSeq: 0, period: 24 };
    // Fresh window: no pre-existing state — WindowState constructor sets startHour=0, endHour=144
    const cfg = { lon0: 100, lat0: 25, lon1: 120, lat1: 35, npoints: 5, level: 850 };
    await hovmollerController.init(mockMap, win, { config: cfg });

    const state = hovmollerController._getState(win);
    expect(state.startHour).toBe(0);
    expect(state.endHour).toBe(144);
    expect(state.stepHours).toBe(12);
    hovmollerController.destroy(mockMap, win);
  });

  it("custom span 48-72h set, setView called → label stays 48→72h not 0→144h", async () => {
    const win = { id: "hov-ctrl-swap", loadSeq: 0, period: 24 };
    const cfg = { lon0: 100, lat0: 25, lon1: 120, lat1: 35, npoints: 5, startHour: 48, endHour: 72, stepHours: 12, level: 850 };
    await hovmollerController.init(mockMap, win, { config: cfg });

    const s = hovmollerController._getState(win);
    expect(s.startHour).toBe(48);
    expect(s.endHour).toBe(72);

    const btnRev = mockEnv.cachedElements.btnRev;
    expect(btnRev.textContent).toBe("⇄ 48→72h");

    // Swap axis via controller
    hovmollerController.setAxisSwap("time-x", win);
    expect(btnRev.textContent).toBe("⇄ 48→72h");

    // Reverse direction
    hovmollerController.setTimeDir("rev", win);
    expect(btnRev.textContent).toBe("⇄ 72→48h");

    // Back to fwd
    hovmollerController.setTimeDir("fwd", win);
    expect(btnRev.textContent).toBe("⇄ 48→72h");

    hovmollerController.destroy(mockMap, win);
  });

  it("reverse direction renders 72→48h when span is 48-72h", async () => {
    const win = { id: "hov-ctrl-rev", loadSeq: 0, period: 24 };
    const cfg = { lon0: 100, lat0: 25, lon1: 120, lat1: 35, npoints: 5, startHour: 48, endHour: 72, stepHours: 12, level: 850, timeDir: "rev" };
    await hovmollerController.init(mockMap, win, { config: cfg });

    const btnRev = mockEnv.cachedElements.btnRev;
    expect(btnRev.textContent).toBe("⇄ 72→48h");

    hovmollerController.setTimeDir("fwd", win);
    expect(btnRev.textContent).toBe("⇄ 48→72h");

    hovmollerController.destroy(mockMap, win);
  });

  it("setData(matrix) with leads [48,60,72] updates panel inputs and label", async () => {
    const win = { id: "hov-ctrl-setdata", loadSeq: 0, period: 24 };
    const cfg = { lon0: 100, lat0: 25, lon1: 120, lat1: 35, npoints: 5, level: 850 };
    await hovmollerController.init(mockMap, win, { config: cfg });

    const s = hovmollerController._getState(win);
    const btnRev = mockEnv.cachedElements.btnRev;
    const inputStart = mockEnv.cachedElements.inputStart;
    const inputEnd = mockEnv.cachedElements.inputEnd;

    // Manually call setData on panel with custom leads
    s.panel.setData({ leads: [48, 60, 72], distKm: 1500, missing: {} });

    expect(inputStart.value).toBe(48);
    expect(inputEnd.value).toBe(72);
    expect(btnRev.textContent).toBe("⇄ 48→72h");

    hovmollerController.setTimeDir("rev", win);
    expect(btnRev.textContent).toBe("⇄ 72→48h");

    hovmollerController.destroy(mockMap, win);
  });
});
