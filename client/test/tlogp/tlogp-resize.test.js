// tlogp-resize.test.js - Tests verifying TLogP window resizability with preserved width/height aspect ratio
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  TLogPPanel,
  DEFAULT_TLOGP_WIDTH,
  DEFAULT_TLOGP_HEIGHT,
  TLOGP_ASPECT_RATIO,
  MIN_TLOGP_WIDTH,
  MIN_TLOGP_HEIGHT,
} from "../../src/layers/tlogp/tlogpPanel.js";

describe("TLogP Window Resizeable with Aspect Ratio Lock", () => {
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
        classList: {
          _classes: new Set(className ? className.split(/\s+/) : []),
          add(c) { this._classes.add(c); },
          remove(c) { this._classes.delete(c); },
          contains(c) { return this._classes.has(c); },
        },
        children: childList,
        offsetWidth: DEFAULT_TLOGP_WIDTH,
        offsetHeight: DEFAULT_TLOGP_HEIGHT,
        clientWidth: DEFAULT_TLOGP_WIDTH,
        clientHeight: 440,
        getBoundingClientRect: () => ({
          left: 100,
          top: 60,
          right: 100 + (el.offsetWidth || DEFAULT_TLOGP_WIDTH),
          bottom: 60 + (el.offsetHeight || DEFAULT_TLOGP_HEIGHT),
          width: el.offsetWidth || DEFAULT_TLOGP_WIDTH,
          height: el.offsetHeight || DEFAULT_TLOGP_HEIGHT,
        }),
        setAttribute: () => {},
        getAttribute: () => null,
        appendChild: (child) => { childList.push(child); },
        removeChild: (child) => {
          const idx = childList.indexOf(child);
          if (idx !== -1) childList.splice(idx, 1);
        },
        querySelector: (sel) => {
          if (sel === ".tlogp-canvas") {
            return {
              getContext: () =>
                new Proxy(
                  {
                    setTransform: () => {},
                    clearRect: () => {},
                    fillRect: () => {},
                    strokeRect: () => {},
                    beginPath: () => {},
                    moveTo: () => {},
                    lineTo: () => {},
                    rect: () => {},
                    clip: () => {},
                    closePath: () => {},
                    stroke: () => {},
                    fill: () => {},
                    fillText: () => {},
                    save: () => {},
                    restore: () => {},
                    setLineDash: () => {},
                  },
                  {
                    get: (target, prop) => {
                      if (prop in target) return target[prop];
                      return () => {};
                    },
                  }
                ),
              clientWidth: 520,
              clientHeight: 440,
              width: 580,
              height: 440,
              addEventListener: () => {},
              removeEventListener: () => {},
              getBoundingClientRect: () => ({ left: 100, top: 100, width: 500, height: 400 }),
            };
          }
          if (sel === ".tlogp-header") return cachedElements.header;
          if (sel === ".tlogp-btn-min") return cachedElements.btnMin;
          if (sel === ".tlogp-btn-close") return cachedElements.btnClose;
          if (sel === ".tlogp-btn-export") return cachedElements.btnExport;
          if (sel === ".tlogp-body-wrap") return cachedElements.bodyWrap;
          return null;
        },
        querySelectorAll: (sel) => {
          if (sel.includes(".tlogp-resize-handle")) {
            return cachedHandles;
          }
          if (sel.includes(".tlogp-btn-level")) {
            return [];
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
      header: createMockElement("header", "tlogp-header"),
      btnMin: createMockElement("btn-min", "tlogp-btn-min", "button"),
      btnClose: createMockElement("btn-close", "tlogp-btn-close", "button"),
      btnExport: createMockElement("btn-export", "tlogp-btn-export", "button"),
      bodyWrap: createMockElement("body", "tlogp-body-wrap"),
    };

    const cachedHandles = [
      createMockElement("se", "tlogp-resize-handle tlogp-resize-se"),
      createMockElement("e", "tlogp-resize-handle tlogp-resize-e"),
      createMockElement("s", "tlogp-resize-handle tlogp-resize-s"),
      createMockElement("sw", "tlogp-resize-handle tlogp-resize-sw"),
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
      devicePixelRatio: 1,
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
    if (panel) {
      panel.destroy();
      panel = null;
    }
  });

  it("verifies default dimensions and aspect ratio constants", () => {
    expect(DEFAULT_TLOGP_WIDTH).toBe(620);
    expect(DEFAULT_TLOGP_HEIGHT).toBe(568);
    expect(TLOGP_ASPECT_RATIO).toBeCloseTo(620 / 568, 4);

    panel = new TLogPPanel();
    expect(panel.width).toBe(620);
    expect(panel.height).toBe(568);
    expect(panel.aspectRatio).toBeCloseTo(TLOGP_ASPECT_RATIO, 4);
    expect(panel.container.style.width).toBe("620px");
    expect(panel.container.style.height).toBe("568px");
  });

  it("resizes window via setDimensions while strictly preserving width/height ratio", () => {
    panel = new TLogPPanel();

    // Scale up to 800px width
    panel.setDimensions(800);
    const expectedHeight800 = Math.round(800 / TLOGP_ASPECT_RATIO);
    expect(panel.width).toBe(800);
    expect(panel.height).toBe(expectedHeight800);
    expect(panel.container.style.width).toBe("800px");
    expect(panel.container.style.height).toBe(`${expectedHeight800}px`);
    expect(panel.width / panel.height).toBeCloseTo(TLOGP_ASPECT_RATIO, 2);

    // Scale down to 500px width
    panel.setDimensions(500);
    const expectedHeight500 = Math.round(500 / TLOGP_ASPECT_RATIO);
    expect(panel.width).toBe(500);
    expect(panel.height).toBe(expectedHeight500);
    expect(panel.container.style.width).toBe("500px");
    expect(panel.container.style.height).toBe(`${expectedHeight500}px`);
    expect(panel.width / panel.height).toBeCloseTo(TLOGP_ASPECT_RATIO, 2);
  });

  it("contains resize handles for se, e, s, and sw in HTML structure", () => {
    panel = new TLogPPanel();
    const html = panel.container.innerHTML;

    expect(html).toContain("tlogp-resize-handle");
    expect(html).toContain("tlogp-resize-se");
    expect(html).toContain("tlogp-resize-e");
    expect(html).toContain("tlogp-resize-s");
    expect(html).toContain("tlogp-resize-sw");
    expect(html).toContain("nwse-resize");
    expect(html).toContain("ew-resize");
    expect(html).toContain("ns-resize");
    expect(html).toContain("nesw-resize");
  });

  it("preserves aspect ratio during drag resize simulation on SE handle", () => {
    panel = new TLogPPanel();
    const handles = panel.container.querySelectorAll(".tlogp-resize-handle");
    const seHandle = handles.find((h) => h.classList.contains("tlogp-resize-se"));
    expect(seHandle).toBeDefined();

    // Trigger mousedown on SE handle
    seHandle._fire("mousedown", { clientX: 720, clientY: 628 });

    // Drag 100px right, 50px down
    global.window._fire("mousemove", { clientX: 820, clientY: 678 });

    // Verify width and height scaled in locked aspect ratio
    expect(panel.width).toBe(720); // 620 + 100
    const expectedH = Math.round(720 / TLOGP_ASPECT_RATIO);
    expect(panel.height).toBe(expectedH);
    expect(panel.container.style.width).toBe("720px");
    expect(panel.container.style.height).toBe(`${expectedH}px`);
    expect(panel.width / panel.height).toBeCloseTo(TLOGP_ASPECT_RATIO, 2);

    // End drag
    global.window._fire("mouseup");
  });

  it("handles minimize and restore without losing custom aspect-ratio dimensions", () => {
    panel = new TLogPPanel();
    panel.setDimensions(750);
    const customH = panel.height;

    // Minimize
    panel.toggleMinimize();
    expect(panel.isMinimized).toBe(true);
    expect(panel.container.style.height).toBe("auto");

    // Restore
    panel.toggleMinimize();
    expect(panel.isMinimized).toBe(false);
    expect(panel.container.style.height).toBe(`${customH}px`);
    expect(panel.width).toBe(750);
    expect(panel.height).toBe(customH);
  });

  it("resets to default dimensions on double-click of bottom-right resize handle", () => {
    panel = new TLogPPanel();
    panel.setDimensions(900);
    expect(panel.width).toBe(900);

    const handles = panel.container.querySelectorAll(".tlogp-resize-handle");
    const seHandle = handles.find((h) => h.classList.contains("tlogp-resize-se"));

    seHandle._fire("dblclick");

    expect(panel.width).toBe(DEFAULT_TLOGP_WIDTH);
    expect(panel.height).toBe(DEFAULT_TLOGP_HEIGHT);
    expect(panel.container.style.width).toBe(`${DEFAULT_TLOGP_WIDTH}px`);
    expect(panel.container.style.height).toBe(`${DEFAULT_TLOGP_HEIGHT}px`);
  });
});
