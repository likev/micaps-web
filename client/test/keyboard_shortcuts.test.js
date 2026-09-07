import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initKeyboardShortcuts } from "../src/ui/keyboardShortcuts.js";

describe("Keyboard Shortcuts Navigation (ArrowLeft/Right/Up/Down, F4/Alt+S)", () => {
  let periodSteps = [];
  let levelSteps = [];
  let splitCalls = 0;
  let listeners = [];

  class MockElement {
    constructor(tag = "DIV", id = "", className = "") {
      this.tagName = tag.toUpperCase();
      this.id = id;
      this.className = className;
      this.type = "text";
      this.isContentEditable = false;
      this.parentElement = null;
    }
    closest(selector) {
      let cur = this;
      while (cur) {
        if (selector === "#config-editor-panel" && cur.id === "config-editor-panel") return cur;
        if (selector.includes(".maplibregl-canvas") && cur.className?.includes("maplibregl-canvas")) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
    appendChild(child) {
      child.parentElement = this;
    }
    remove() {
      this.parentElement = null;
    }
  }

  const origWindow = globalThis.window;
  const origDocument = globalThis.document;

  beforeEach(() => {
    periodSteps = [];
    levelSteps = [];
    splitCalls = 0;
    listeners = [];

    globalThis.window = {
      addEventListener: (type, handler) => {
        listeners.push(handler);
      },
    };

    globalThis.document = {
      body: new MockElement("BODY"),
      createElement: (tag) => new MockElement(tag),
    };

    initKeyboardShortcuts({
      onPeriodStep: async (dir) => { periodSteps.push(dir); },
      onLevelStep: async (dir) => { levelSteps.push(dir); },
      onToggleSplit: () => { splitCalls++; },
    });
  });

  afterEach(() => {
    globalThis.window = origWindow;
    globalThis.document = origDocument;
  });

  function fireKey(key, options = {}) {
    const target = options.target || globalThis.document.body;
    let prevented = false;
    const evt = {
      key,
      code: options.code || key,
      altKey: options.altKey || false,
      repeat: options.repeat || false,
      target,
      preventDefault: () => { prevented = true; },
      get defaultPrevented() { return prevented; }
    };
    for (const fn of listeners) {
      fn(evt);
    }
    return evt;
  }

  it("ArrowLeft and ArrowRight step forecast / observation periods", async () => {
    const e1 = fireKey("ArrowLeft");
    expect(e1.defaultPrevented).toBe(true);
    expect(periodSteps).toEqual([-1]);

    const e2 = fireKey("ArrowRight");
    expect(e2.defaultPrevented).toBe(true);
    expect(periodSteps).toEqual([-1, 1]);
  });

  it("ArrowUp and ArrowDown step vertical levels", async () => {
    const e1 = fireKey("ArrowUp");
    expect(e1.defaultPrevented).toBe(true);
    expect(levelSteps).toEqual([1]);

    const e2 = fireKey("ArrowDown");
    expect(e2.defaultPrevented).toBe(true);
    expect(levelSteps).toEqual([1, -1]);
  });

  it("Supports legacy key names (Left, Right, Up, Down)", async () => {
    fireKey("Left");
    expect(periodSteps).toEqual([-1]);

    fireKey("Right");
    expect(periodSteps).toEqual([-1, 1]);

    fireKey("Up");
    expect(levelSteps).toEqual([1]);

    fireKey("Down");
    expect(levelSteps).toEqual([1, -1]);
  });

  it("Supports F4 and Alt+S for split view toggle", async () => {
    const e1 = fireKey("F4");
    expect(e1.defaultPrevented).toBe(true);
    expect(splitCalls).toBe(1);

    const e2 = fireKey("s", { altKey: true });
    expect(e2.defaultPrevented).toBe(true);
    expect(splitCalls).toBe(2);
  });

  it("Allows shortcuts when focused on map canvas (.maplibregl-canvas)", async () => {
    const canvas = new MockElement("CANVAS", "", "maplibregl-canvas");

    const e = fireKey("ArrowRight", { target: canvas });
    expect(e.defaultPrevented).toBe(true);
    expect(periodSteps).toEqual([1]);
  });

  it("Allows shortcuts when focused on buttons and button roles", async () => {
    const btn = new MockElement("BUTTON", "btn-load-data");

    const e = fireKey("ArrowUp", { target: btn });
    expect(e.defaultPrevented).toBe(true);
    expect(levelSteps).toEqual([1]);
  });

  it("Allows shortcuts when focused on checkboxes", async () => {
    const chk = new MockElement("INPUT");
    chk.type = "checkbox";

    const e = fireKey("ArrowDown", { target: chk });
    expect(e.defaultPrevented).toBe(true);
    expect(levelSteps).toEqual([-1]);
  });

  it("Ignores shortcuts when typing in text inputs, textareas, and selects", async () => {
    const textarea = new MockElement("TEXTAREA");
    const e1 = fireKey("ArrowLeft", { target: textarea });
    expect(e1.defaultPrevented).toBe(false);
    expect(periodSteps).toEqual([]);

    const input = new MockElement("INPUT");
    input.type = "text";
    const e2 = fireKey("ArrowRight", { target: input });
    expect(e2.defaultPrevented).toBe(false);
    expect(periodSteps).toEqual([]);

    const select = new MockElement("SELECT");
    const e3 = fireKey("ArrowUp", { target: select });
    expect(e3.defaultPrevented).toBe(false);
    expect(levelSteps).toEqual([]);
  });

  it("Ignores shortcuts when editing inside config-editor-panel", async () => {
    const panel = new MockElement("DIV", "config-editor-panel");
    const innerBtn = new MockElement("BUTTON");
    panel.appendChild(innerBtn);

    const e = fireKey("ArrowLeft", { target: innerBtn });
    expect(e.defaultPrevented).toBe(false);
    expect(periodSteps).toEqual([]);
  });

  it("Throttles rapid key repeat events", async () => {
    // First press (not repeat)
    fireKey("ArrowRight", { repeat: false });
    expect(periodSteps.length).toBe(1);

    // Immediate repeat (within 150ms) is throttled
    fireKey("ArrowRight", { repeat: true });
    expect(periodSteps.length).toBe(1);

    // Wait past throttle threshold
    await new Promise((r) => setTimeout(r, 160));
    fireKey("ArrowRight", { repeat: true });
    expect(periodSteps.length).toBe(2);
  });
});
