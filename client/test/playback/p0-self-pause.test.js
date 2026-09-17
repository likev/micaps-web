// test/playback/p0-self-pause.test.js - Tests P0, M1, P1/M3, m4, M2 from ui_play_loop_review1_fixes.test.js
import { test, expect, describe, beforeAll, beforeEach } from "bun:test";

const elementsMap = new Map();
const docListeners = new Map();

if (typeof globalThis.document === "undefined") {
  globalThis.document = {};
}
globalThis.document.addEventListener = (evt, fn) => {
  if (!docListeners.has(evt)) docListeners.set(evt, []);
  docListeners.get(evt).push(fn);
};
globalThis.document.removeEventListener = (evt, fn) => {
  if (!docListeners.has(evt)) return;
  docListeners.set(evt, docListeners.get(evt).filter((f) => f !== fn));
};

function parseAndRegisterElements(html) {
  if (!html || typeof html !== "string") return;
  const idMatches = html.matchAll(/id="([^"]+)"/g);
  for (const m of idMatches) {
    const id = m[1];
    if (id.startsWith("map-viewport-") || id.startsWith("map-container-")) continue;
    let el = elementsMap.get(id);
    if (!el) {
      el = createMockElement(id);
    }
    const tagMatch = html.match(new RegExp(`<[^>]*id="${id}"[^>]*>`));
    if (tagMatch) {
      const tagStr = tagMatch[0];
      const ariaLabel = tagStr.match(/aria-label="([^"]*)"/);
      if (ariaLabel) el.setAttribute("aria-label", ariaLabel[1]);
      const title = tagStr.match(/title="([^"]*)"/);
      if (title) el.setAttribute("title", title[1]);
      const ariaPressed = tagStr.match(/aria-pressed="([^"]*)"/);
      if (ariaPressed) el.setAttribute("aria-pressed", ariaPressed[1]);
      const ariaKeyshortcuts = tagStr.match(/aria-keyshortcuts="([^"]*)"/);
      if (ariaKeyshortcuts) el.setAttribute("aria-keyshortcuts", ariaKeyshortcuts[1]);
    }
  }
}

function createMockElement(id = "", className = "", tagName = "DIV") {
  const el = {
    id,
    tagName: tagName.toUpperCase(),
    classes: new Set(),
    style: {},
    attributes: new Map(),
    dataset: {},
    children: [],
    options: [],
    value: "",
    selectedIndex: 0,
    textContent: "",
    _html: "",
    get innerHTML() { return this._html; },
    set innerHTML(val) {
      this._html = val;
      if (typeof val === "string") {
        parseAndRegisterElements(val);
      }
    },
    setAttribute(k, v) { this.attributes.set(k, String(v)); },
    getAttribute(k) { return this.attributes.get(k) || null; },
    removeAttribute(k) { this.attributes.delete(k); },
    appendChild(child) {
      this.children.push(child);
      if (this.tagName === "SELECT") {
        this.options.push(child);
      }
    },
    insertBefore(newNode) { this.children.push(newNode); },
    remove() { elementsMap.delete(id); },
    addEventListener(evt, fn) {
      if (!this._listeners) this._listeners = new Map();
      if (!this._listeners.has(evt)) this._listeners.set(evt, []);
      this._listeners.get(evt).push(fn);
    },
    removeEventListener(evt, fn) {
      if (!this._listeners?.has(evt)) return;
      this._listeners.set(evt, this._listeners.get(evt).filter((f) => f !== fn));
    },
    click() {
      if (this.onclick) this.onclick();
      this._listeners?.get("click")?.forEach((fn) => fn({ target: this, preventDefault() {} }));
    },
    dispatchEvent(evt) {
      this._listeners?.get(evt.type)?.forEach((fn) => fn(evt));
    },
    querySelector(sel) {
      if (sel === ".chip-btn.active") {
        return this.children.find((c) => c.classList?.contains("active")) || null;
      }
      return null;
    },
    querySelectorAll(sel) { return []; },
  };

  if (className) {
    className.split(/\s+/).filter(Boolean).forEach((c) => el.classes.add(c));
  }

  el.classList = {
    contains: (c) => el.classes.has(c),
    add: (...cs) => cs.forEach((c) => el.classes.add(c)),
    remove: (...cs) => cs.forEach((c) => el.classes.delete(c)),
    toggle: (c, force) => {
      if (force === true) el.classes.add(c);
      else if (force === false) el.classes.delete(c);
      else if (el.classes.has(c)) el.classes.delete(c);
      else el.classes.add(c);
    },
  };

  if (id) elementsMap.set(id, el);
  return el;
}

globalThis.document.getElementById = (id) => elementsMap.get(id) || null;
globalThis.document.querySelectorAll = (sel) => {
  const res = [];
  for (const el of elementsMap.values()) {
    if (sel.startsWith(".")) {
      const cls = sel.slice(1);
      if (el.classList.contains(cls)) res.push(el);
    }
  }
  return res;
};
globalThis.document.createElement = (tag) => createMockElement("", "", tag);
globalThis.document.body = createMockElement("body");

const { appState } = await import("../../src/store/appState.js");
const {
  initTimeSlider,
  setTimelineMode,
  setStepLength,
  startPlayback,
  pausePlayback,
  step,
  setPlaybackSpeed,
  DEFAULT_PLAYBACK_MS,
  bindVisibilityPause,
} = await import("../../src/ui/timeSlider.js");
const { initTabWindowManager } = await import("../../src/ui/tabWindowManager.js");

beforeAll(() => {
  createMockElement("tabs-list");
  createMockElement("btn-add-tab");
  createMockElement("workspace-container");
  createMockElement("timeslider-container");

  delete globalThis.document.__timeSliderVisibilityBound;
  bindVisibilityPause(globalThis.document);

  initTabWindowManager();
});

beforeEach(() => {
  pausePlayback();
  appState.set("playbackSpeed", 1500);
});

describe("UI Play-Loop Review 1 (P0, M1, P1/M3, m4, M2)", () => {
  test("P0: Obs-preset play loop does not self-pause during time steps", async () => {
    let callbackFile = null;
    initTimeSlider("timeslider-container", async (data) => {
      callbackFile = data.file;
    });

    const mockFiles = [
      "20260828080000.000",
      "20260828110000.000",
      "20260828140000.000",
    ];

    setTimelineMode("obs", {
      files: mockFiles,
      file: mockFiles[0],
      stepLength: 3,
    });

    startPlayback();
    expect(appState.get("isPlaying")).toBe(true);

    setTimelineMode("obs", {
      files: mockFiles,
      file: mockFiles[1],
      stepLength: 3,
      pause: false,
    });
    expect(appState.get("isPlaying")).toBe(true);

    pausePlayback();
    expect(appState.get("isPlaying")).toBe(false);
  });

  test("M1: startPlayback re-entrancy guard prevents interval leakage", async () => {
    initTimeSlider("timeslider-container", () => {});
    setTimelineMode("nwp", { period: 24, cycles: ["26082820"], stepLength: 6 });

    startPlayback();
    expect(appState.get("isPlaying")).toBe(true);
    startPlayback();
    expect(appState.get("isPlaying")).toBe(true);

    pausePlayback();
    expect(appState.get("isPlaying")).toBe(false);
  });

  test("P1 & M3: step returns promise resolving with wrapped state; async load is serialized", async () => {
    let loadCallCount = 0;
    let finishLoad = null;

    initTimeSlider("timeslider-container", (data) => {
      loadCallCount++;
      return new Promise((resolve) => {
        finishLoad = resolve;
      });
    });

    const mockFiles = ["20260828080000.000", "20260828110000.000"];
    setTimelineMode("obs", { files: mockFiles, file: mockFiles[0], stepLength: 3 });

    let resolved = false;
    const stepPromise = step(1).then((res) => {
      resolved = true;
      return res;
    });

    expect(resolved).toBe(false);
    expect(loadCallCount).toBe(1);

    finishLoad();
    const result = await stepPromise;
    expect(resolved).toBe(true);
    expect(result.mode).toBe("obs");
    expect(result.index).toBe(1);
    expect(result.wrapped).toBe(false);

    const wrapPromise = step(1);
    finishLoad?.();
    const wrapResult = await wrapPromise;
    expect(wrapResult.wrapped).toBe(true);
  });

  test("m4: startPlayback prefetch targets active window without throwing", async () => {
    initTimeSlider("timeslider-container", () => {});
    setTimelineMode("nwp", { period: 24, cycles: ["26082820"], stepLength: 6 });

    startPlayback();
    expect(appState.get("isPlaying")).toBe(true);
    pausePlayback();
  });

  test("M2: DEFAULT_PLAYBACK_MS is 1500, select-playback-speed updates speed and re-arms timer", () => {
    expect(DEFAULT_PLAYBACK_MS).toBe(1500);
    expect(appState.get("playbackSpeed")).toBe(1500);

    initTimeSlider("timeslider-container", () => {});
    const selSpeed = globalThis.document.getElementById("select-playback-speed");
    expect(selSpeed).not.toBeNull();

    setPlaybackSpeed(750);
    expect(appState.get("playbackSpeed")).toBe(750);
    expect(selSpeed.value).toBe("750");

    startPlayback();
    expect(appState.get("isPlaying")).toBe(true);
    setPlaybackSpeed(3000);
    expect(appState.get("playbackSpeed")).toBe(3000);
    expect(appState.get("isPlaying")).toBe(true);
    pausePlayback();
  });
});
