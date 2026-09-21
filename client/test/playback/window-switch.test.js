// test/playback/window-switch.test.js - Tests L1, m6, R5, R1, R2 from ui_play_loop_review1_fixes.test.js
import { test, expect, describe, beforeAll, beforeEach } from "bun:test";
import fs from "fs";
import path from "path";
import { readSrcText } from "../helpers/cssText.js";

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
    if (!el) el = createMockElement(id);
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
    id, tagName: tagName.toUpperCase(), classes: new Set(), style: {},
    attributes: new Map(), dataset: {}, children: [], options: [],
    value: "", selectedIndex: 0, textContent: "", _html: "",
    get innerHTML() { return this._html; },
    set innerHTML(val) { this._html = val; if (typeof val === "string") parseAndRegisterElements(val); },
    setAttribute(k, v) { this.attributes.set(k, String(v)); },
    getAttribute(k) { return this.attributes.get(k) || null; },
    removeAttribute(k) { this.attributes.delete(k); },
    appendChild(child) { this.children.push(child); if (this.tagName === "SELECT") this.options.push(child); },
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
    dispatchEvent(evt) { this._listeners?.get(evt.type)?.forEach((fn) => fn(evt)); },
    querySelector(sel) {
      if (sel === ".chip-btn.active") return this.children.find((c) => c.classList?.contains("active")) || null;
      return null;
    },
    querySelectorAll(sel) { return []; },
  };
  if (className) className.split(/\s+/).filter(Boolean).forEach((c) => el.classes.add(c));
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
    if (sel.startsWith(".")) { const cls = sel.slice(1); if (el.classList.contains(cls)) res.push(el); }
  }
  return res;
};
globalThis.document.createElement = (tag) => createMockElement("", "", tag);
globalThis.document.body = createMockElement("body");

const { appState } = await import("../../src/store/appState.js");
const {
  initTimeSlider, setTimelineMode, startPlayback, pausePlayback, step, setPlaybackSpeed, bindVisibilityPause,
} = await import("../../src/ui/timeSlider.js");
const { initTabWindowManager, focusWindow } = await import("../../src/ui/tabWindowManager.js");

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

describe("UI Play-Loop Review 1 (L1, m6, R5, R1, R2)", () => {
  test("L1: Switching windows pauses playback and reseeds active period", async () => {
    initTimeSlider("timeslider-container", () => {});
    setTimelineMode("nwp", { period: 24, cycles: ["26082820"], stepLength: 6 });

    startPlayback();
    expect(appState.get("isPlaying")).toBe(true);

    focusWindow(1, 0);
    await new Promise((r) => setTimeout(r, 20));
    expect(appState.get("isPlaying")).toBe(false);
  });

  test("m6: Background preset update defers to _pendingNwp when window is not active", () => {
    const presetLoaderContent = readSrcText("services/presetLoader.js");

    expect(presetLoaderContent).toContain("if (getActiveWindow() === win) {");
    expect(presetLoaderContent).toContain("win._pendingNwp = nwpPayload;");
  });

  test("R5: P0 guard skips obs re-sync on time-step ticks with a valid file", () => {
    const presetLoaderContent = readSrcText("services/presetLoader.js");

    expect(presetLoaderContent).toContain("freshObsLoad");
    expect(presetLoaderContent).toContain("if (!file || freshObsLoad");
  });

  test("R1: speed change while a tick is loading does not re-arm a second chain", async () => {
    let releaseLoad;
    initTimeSlider("timeslider-container", () => new Promise((resolve) => { releaseLoad = resolve; }));
    setTimelineMode("obs", {
      files: ["20260828080000.000", "20260828110000.000"],
      file: "20260828080000.000",
      stepLength: 3,
    });

    startPlayback();
    expect(appState.get("isPlaying")).toBe(true);

    const tickPromise = step(1, { source: "btn-play", directions: ["next"] });
    setPlaybackSpeed(3000);
    releaseLoad();
    await tickPromise;

    expect(appState.get("isPlaying")).toBe(true);
    expect(appState.get("playbackSpeed")).toBe(3000);
    pausePlayback();
  });

  test("R2: throwing / rejecting time-change callbacks never reject unhandled", async () => {
    initTimeSlider("timeslider-container", () => { throw new Error("sync boom"); });
    setTimelineMode("nwp", { period: 24, cycles: ["26082820"], stepLength: 6 });

    const syncResult = await step(1, { source: "btn-next" });
    expect(syncResult.mode).toBe("nwp");

    initTimeSlider("timeslider-container", () => Promise.reject(new Error("async boom")));
    setTimelineMode("nwp", { period: 24, cycles: ["26082820"], stepLength: 6 });
    const asyncResult = await step(1, { source: "btn-next" });
    expect(asyncResult.mode).toBe("nwp");
  });
});
