// test/playback/speed-singleton-visibility.test.js - Tests R3, R4, m7, m8, m9, m10, m10 CSS
import { test, expect, describe, beforeAll, beforeEach } from "bun:test";
import fs from "fs";
import path from "path";
import { readStyleCss, readSrcText } from "../helpers/cssText.js";

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
const { initKeyboardShortcuts } = await import("../../src/ui/keyboardShortcuts.js");
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

describe("UI Play-Loop Review 1 (R3, R4, m7, m8, m9, m10, m10 CSS)", () => {
  test("R3: re-init does not duplicate select handlers", () => {
    initTimeSlider("timeslider-container", () => {});
    const selStep = globalThis.document.getElementById("select-step-length");
    const selSpeed = globalThis.document.getElementById("select-playback-speed");
    expect(selStep).not.toBeNull();
    expect(selSpeed).not.toBeNull();

    const stepHandler = selStep.onchange;
    const speedHandler = selSpeed.onchange;
    expect(typeof stepHandler).toBe("function");
    expect(typeof speedHandler).toBe("function");

    initTimeSlider("timeslider-container", () => {});
    expect(selStep.onchange).not.toBe(stepHandler);
    expect(selSpeed.onchange).not.toBe(speedHandler);
    expect(selStep._listeners?.get("change")?.length || 0).toBe(0);
    expect(selSpeed._listeners?.get("change")?.length || 0).toBe(0);
  });

  test("R4: Space on focused #btn-play does not double-toggle", () => {
    let toggles = 0;
    const windowListeners = new Map();
    const mockWindow = {
      addEventListener(evt, fn) {
        if (!windowListeners.has(evt)) windowListeners.set(evt, []);
        windowListeners.get(evt).push(fn);
      },
    };

    initKeyboardShortcuts({ onTogglePlay: () => { toggles++; } }, mockWindow);

    const focusedBtnEvent = {
      key: " ", code: "Space",
      target: { id: "btn-play", tagName: "BUTTON" },
      preventDefault: () => {},
    };
    windowListeners.get("keydown")?.forEach((fn) => fn(focusedBtnEvent));
    expect(toggles).toBe(0);

    const bodyEvent = {
      key: " ", code: "Space",
      target: { tagName: "BODY" },
      preventDefault: () => {},
    };
    windowListeners.get("keydown")?.forEach((fn) => fn(bodyEvent));
    expect(toggles).toBe(1);
  });

  test("m7: Space key triggers onTogglePlay shortcut", () => {
    let playToggled = false;
    const windowListeners = new Map();
    const mockWindow = {
      addEventListener(evt, fn) {
        if (!windowListeners.has(evt)) windowListeners.set(evt, []);
        windowListeners.get(evt).push(fn);
      },
    };

    initKeyboardShortcuts({ onTogglePlay: () => { playToggled = true; } }, mockWindow);

    let prevented = false;
    const spaceEvent = {
      key: " ", code: "Space",
      target: { tagName: "BODY" },
      preventDefault: () => { prevented = true; },
    };

    const listeners = windowListeners.get("keydown");
    expect(listeners?.length).toBeGreaterThan(0);
    listeners?.forEach((fn) => fn(spaceEvent));

    expect(playToggled).toBe(true);
    expect(prevented).toBe(true);
  });

  test("m7: Singleton / empty timeline disables play button and prevents playback", () => {
    initTimeSlider("timeslider-container", () => {});
    const btnPlay = globalThis.document.getElementById("btn-play");
    expect(btnPlay).not.toBeNull();

    setTimelineMode("obs", {
      files: ["20260828080000.000"],
      file: "20260828080000.000",
      stepLength: 3,
    });

    expect(btnPlay.getAttribute("disabled")).toBe("true");
    expect(btnPlay.classList.contains("disabled")).toBe(true);

    startPlayback();
    expect(appState.get("isPlaying")).toBe(false);
  });

  test("m8: document visibilitychange hidden pauses playback", () => {
    initTimeSlider("timeslider-container", () => {});
    setTimelineMode("nwp", { period: 24, cycles: ["26082820"], stepLength: 6 });

    startPlayback();
    expect(appState.get("isPlaying")).toBe(true);

    globalThis.document.hidden = true;
    const visListeners = docListeners.get("visibilitychange") || [];
    expect(visListeners.length).toBeGreaterThan(0);
    visListeners.forEach((fn) => fn({ type: "visibilitychange" }));

    expect(appState.get("isPlaying")).toBe(false);
    globalThis.document.hidden = false;
  });

  test("m9: NWP step updates win._nwpTimeline.period to keep window state in sync", () => {
    const bootstrapContent = readSrcText("app/bootstrap.js");

    expect(bootstrapContent).toContain("if (win._nwpTimeline) {");
    expect(bootstrapContent).toContain("win._nwpTimeline.period = period;");
  });

  test("m10: aria-label swaps between Play and Pause Animation; button has aria-keyshortcuts", () => {
    initTimeSlider("timeslider-container", () => {});
    setTimelineMode("nwp", { period: 24, cycles: ["26082820"], stepLength: 6 });

    const btnPlay = globalThis.document.getElementById("btn-play");
    expect(btnPlay).not.toBeNull();
    expect(btnPlay.getAttribute("aria-label")).toBe("Play Animation");
    expect(btnPlay.getAttribute("aria-keyshortcuts")).toBe("Space");
    expect(btnPlay.getAttribute("title")).toContain("loops");

    startPlayback();
    expect(btnPlay.getAttribute("aria-label")).toBe("Pause Animation");
    expect(btnPlay.getAttribute("aria-pressed")).toBe("true");
    expect(btnPlay.textContent).toBe("❚❚");

    pausePlayback();
    expect(btnPlay.getAttribute("aria-label")).toBe("Play Animation");
    expect(btnPlay.getAttribute("aria-pressed")).toBe("false");
    expect(btnPlay.textContent).toBe("▶");
  });

  test("m10 CSS: style.css defines focus-visible, loading, disabled, and speed control", () => {
    const styleCss = readStyleCss();

    expect(styleCss).toMatch(/\.play-btn:focus-visible/);
    expect(styleCss).toMatch(/\.step-nav-btn:focus-visible/);
    expect(styleCss).toMatch(/\.play-btn\.loading/);
    expect(styleCss).toMatch(/\.play-btn:disabled/);
    expect(styleCss).toMatch(/\.playback-speed-control/);
  });
});
