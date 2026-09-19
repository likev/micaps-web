// timeheight-resize.test.js - Tests verifying timeheight-subwindow resizability with aspect ratio lock and axis label clearing on direction toggle
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  TimeHeightPanel,
  DEFAULT_TH_WIDTH,
  DEFAULT_TH_HEIGHT,
  TH_ASPECT_RATIO,
  MIN_TH_WIDTH,
  MIN_TH_HEIGHT,
} from "../../src/layers/timeheight/timeHeightPanel.js";
import { TimeHeightCanvasRenderer } from "../../src/layers/timeheight/timeHeightCanvas.js";

describe("Time-Height Window Resizeable with Aspect Ratio Lock & Axis Label Clearing", () => {
  let panel;
  let elements;
  let listeners;

  beforeEach(() => {
    elements = new Map();
    listeners = new Map();

    const createMockElement = (id = "", className = "", tag = "div") => {
      const elListeners = new Map();
      const childList = [];
      const el = {
        id,
        className,
        tagName: tag.toUpperCase(),
        style: {},
        innerHTML: "",
        classList: {
          _classes: new Set(className ? className.split(/\s+/) : []),
          add(c) { this._classes.add(c); },
          remove(c) { this._classes.delete(c); },
          contains(c) { return this._classes.has(c); },
        },
        children: childList,
        offsetWidth: DEFAULT_TH_WIDTH,
        offsetHeight: DEFAULT_TH_HEIGHT,
        clientWidth: DEFAULT_TH_WIDTH,
        clientHeight: DEFAULT_TH_HEIGHT,
        getBoundingClientRect: () => ({
          left: 100,
          top: 60,
          right: 100 + (el.offsetWidth || DEFAULT_TH_WIDTH),
          bottom: 60 + (el.offsetHeight || DEFAULT_TH_HEIGHT),
          width: el.offsetWidth || DEFAULT_TH_WIDTH,
          height: el.offsetHeight || DEFAULT_TH_HEIGHT,
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
          if (sel === ".th-btn-min") return cachedElements.btnMin;
          if (sel === ".th-btn-close") return cachedElements.btnClose;
          if (sel === ".th-btn-direction") return cachedElements.btnDir;
          if (sel === ".th-body") return cachedElements.body;
          if (sel === ".th-controls-row") return cachedElements.controls;
          return null;
        },
        querySelectorAll: (sel) => {
          if (sel.includes(".th-resize-handle")) {
            return cachedHandles;
          }
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
      btnMin: createMockElement("btn-min", "th-btn-min", "button"),
      btnClose: createMockElement("btn-close", "th-btn-close", "button"),
      btnDir: createMockElement("btn-dir", "th-btn-direction", "button"),
      body: createMockElement("body", "th-body"),
      controls: createMockElement("controls", "th-controls-row"),
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
      addEventListener: (evt, fn) => {
        if (!listeners.has(evt)) listeners.set(evt, []);
        listeners.get(evt).push(fn);
      },
      removeEventListener: (evt, fn) => {
        if (!listeners.has(evt)) return;
        listeners.set(evt, listeners.get(evt).filter((f) => f !== fn));
      },
      _fire: (evt, data = {}) => {
        const fns = listeners.get(evt) || [];
        fns.forEach((f) => f({ preventDefault: () => {}, stopPropagation: () => {}, ...data }));
      },
    };
  });

  afterEach(() => {
    panel?.destroy();
    delete global.document;
    delete global.window;
  });

  it("verifies default dimensions and aspect ratio constants", () => {
    expect(DEFAULT_TH_WIDTH).toBe(680);
    expect(DEFAULT_TH_HEIGHT).toBe(520);
    expect(TH_ASPECT_RATIO).toBeCloseTo(680 / 520, 4);
    expect(MIN_TH_WIDTH).toBe(480);
    expect(MIN_TH_HEIGHT).toBe(Math.round(480 / TH_ASPECT_RATIO));
  });

  it("contains resize handles for se, e, s, and sw in HTML structure", () => {
    panel = new TimeHeightPanel();
    const html = panel.container.innerHTML;

    expect(html).toContain("th-resize-handle");
    expect(html).toContain("th-resize-se");
    expect(html).toContain("th-resize-e");
    expect(html).toContain("th-resize-s");
    expect(html).toContain("th-resize-sw");
    expect(html).toContain("nwse-resize");
    expect(html).toContain("ew-resize");
    expect(html).toContain("ns-resize");
    expect(html).toContain("nesw-resize");
  });

  it("resizes window via setDimensions while strictly preserving width/height ratio", () => {
    panel = new TimeHeightPanel();

    panel.setDimensions(850);
    const expectedHeight850 = Math.round(850 / TH_ASPECT_RATIO);
    expect(panel.width).toBe(850);
    expect(panel.height).toBe(expectedHeight850);
    expect(panel.container.style.width).toBe("850px");
    expect(panel.container.style.height).toBe(`${expectedHeight850}px`);
    expect(panel.width / panel.height).toBeCloseTo(TH_ASPECT_RATIO, 2);

    panel.setDimensions(550);
    const expectedHeight550 = Math.round(550 / TH_ASPECT_RATIO);
    expect(panel.width).toBe(550);
    expect(panel.height).toBe(expectedHeight550);
    expect(panel.container.style.width).toBe("550px");
    expect(panel.container.style.height).toBe(`${expectedHeight550}px`);
    expect(panel.width / panel.height).toBeCloseTo(TH_ASPECT_RATIO, 2);
  });

  it("preserves aspect ratio during drag resize simulation on SE handle", () => {
    panel = new TimeHeightPanel();
    const handles = panel.container.querySelectorAll(".th-resize-handle");
    const seHandle = handles.find((h) => h.classList.contains("th-resize-se"));
    expect(seHandle).toBeDefined();

    seHandle._fire("mousedown", { clientX: 780, clientY: 580 });
    global.window._fire("mousemove", { clientX: 880, clientY: 656 });

    expect(panel.width).toBe(780); // 680 + 100
    const expectedH = Math.round(780 / TH_ASPECT_RATIO);
    expect(panel.height).toBe(expectedH);
    expect(panel.container.style.width).toBe("780px");
    expect(panel.container.style.height).toBe(`${expectedH}px`);
    expect(panel.width / panel.height).toBeCloseTo(TH_ASPECT_RATIO, 2);

    global.window._fire("mouseup");
  });

  it("handles minimize and restore without losing custom aspect-ratio dimensions", () => {
    panel = new TimeHeightPanel();
    panel.setDimensions(800);
    const customH = panel.height;

    panel.toggleMinimize();
    expect(panel.isMinimized).toBe(true);
    expect(panel.container.style.height).toBe("auto");

    panel.toggleMinimize();
    expect(panel.isMinimized).toBe(false);
    expect(panel.container.style.height).toBe(`${customH}px`);
    expect(panel.width).toBe(800);
    expect(panel.height).toBe(customH);
  });

  it("resets to default dimensions on double-click of bottom-right resize handle", () => {
    panel = new TimeHeightPanel();
    panel.setDimensions(950);
    expect(panel.width).toBe(950);

    const handles = panel.container.querySelectorAll(".th-resize-handle");
    const seHandle = handles.find((h) => h.classList.contains("th-resize-se"));

    seHandle._fire("dblclick");

    expect(panel.width).toBe(DEFAULT_TH_WIDTH);
    expect(panel.height).toBe(DEFAULT_TH_HEIGHT);
    expect(panel.container.style.width).toBe(`${DEFAULT_TH_WIDTH}px`);
    expect(panel.container.style.height).toBe(`${DEFAULT_TH_HEIGHT}px`);
  });

  it("clears canvas buffer and labels on direction toggle", () => {
    const clearCalls = [];
    const fillCalls = [];
    const textDrawn = [];

    const mockCtx = {
      clearRect: (x, y, w, h) => clearCalls.push({ x, y, w, h }),
      fillRect: (x, y, w, h) => fillCalls.push({ x, y, w, h }),
      strokeRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      rect: () => {},
      clip: () => {},
      closePath: () => {},
      arc: () => {},
      stroke: () => {},
      fill: () => {},
      fillText: (text, x, y) => textDrawn.push({ text, x, y }),
      save: () => {},
      restore: () => {},
      setTransform: () => {},
      scale: () => {},
      resetTransform: () => {},
    };

    const mockCanvas = {
      getContext: () => mockCtx,
      clientWidth: 800,
      clientHeight: 600,
      width: 800,
      height: 600,
      addEventListener: () => {},
      removeEventListener: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    };

    const renderer = new TimeHeightCanvasRenderer(mockCanvas);
    const row7 = [50, 50, 50, 50, 50, 50, 50];
    const zero7 = [0, 0, 0, 0, 0, 0, 0];
    renderer.matrix = {
      leads: [0, 24, 48, 72, 96, 120, 144],
      levels: [1000, 500, 100],
      rh: [row7, row7, row7],
      tmp: [zero7, zero7, zero7],
      vvel: [zero7, zero7, zero7],
      u: [zero7, zero7, zero7],
      v: [zero7, zero7, zero7],
    };
    renderer.layout.plotRect = { x: 50, y: 30, width: 700, height: 500 };

    clearCalls.length = 0;
    fillCalls.length = 0;
    textDrawn.length = 0;

    // Toggle direction to RTL
    renderer.setTimeDirection("rtl");

    // Must have wiped the entire canvas with clearRect AND fillRect
    expect(clearCalls.length).toBeGreaterThan(0);
    expect(clearCalls[0].w).toBe(800);
    expect(clearCalls[0].h).toBe(600);

    expect(fillCalls.length).toBeGreaterThan(0);
    expect(fillCalls[0].w).toBe(800);
    expect(fillCalls[0].h).toBe(600);

    // RTL x coordinates: +0h should be on right (~750), +144h on left (~50)
    const label0 = textDrawn.find((t) => t.text === "+0h");
    const label144 = textDrawn.find((t) => t.text === "+144h");
    expect(label0).toBeDefined();
    expect(label144).toBeDefined();
    expect(label0.x).toBeGreaterThan(label144.x);

    // Toggle back to LTR
    clearCalls.length = 0;
    fillCalls.length = 0;
    textDrawn.length = 0;

    renderer.setTimeDirection("ltr");

    // Canvas cleared again on LTR switch
    expect(clearCalls.length).toBeGreaterThan(0);
    expect(clearCalls[0].w).toBe(800);
    expect(clearCalls[0].h).toBe(600);

    // LTR x coordinates: +0h on left (~50), +144h on right (~750)
    const label0Ltr = textDrawn.find((t) => t.text === "+0h");
    const label144Ltr = textDrawn.find((t) => t.text === "+144h");
    expect(label0Ltr.x).toBeLessThan(label144Ltr.x);
  });
});
