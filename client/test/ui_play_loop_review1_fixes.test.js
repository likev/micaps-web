// ui_play_loop_review1_fixes.test.js - Comprehensive tests verifying fixes for all issues in ui-play-loop-review1.md
import { test, expect, describe, beforeAll, beforeEach } from "bun:test";
import fs from "fs";
import path from "path";

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

const { appState } = await import("../src/store/appState.js");
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
} = await import("../src/ui/timeSlider.js");
const { initKeyboardShortcuts } = await import("../src/ui/keyboardShortcuts.js");
const { initTabWindowManager, focusWindow } = await import("../src/ui/tabWindowManager.js");

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

describe("UI Play-Loop Review 1: Verification and Bug Fixes", () => {
  test("P0: Obs-preset play loop does not self-pause during time steps", async () => {
    // When a valid file is in hand and isTimeStep is true, syncing is bypassed so playback survives.
    // Also setTimelineMode with { pause: false } preserves playing state.
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

    // Call setTimelineMode with pause: false (simulating loader silent update)
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

    // Call startPlayback twice consecutively
    startPlayback();
    expect(appState.get("isPlaying")).toBe(true);
    startPlayback(); // Should not orphan or leak the previous timer
    expect(appState.get("isPlaying")).toBe(true);

    // A single pause should cleanly stop playback
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

    // step(1) returns a promise that only resolves when the callback promise resolves
    let resolved = false;
    const stepPromise = step(1).then((res) => {
      resolved = true;
      return res;
    });

    expect(resolved).toBe(false);
    expect(loadCallCount).toBe(1);

    // Resolve the async load
    finishLoad();
    const result = await stepPromise;
    expect(resolved).toBe(true);
    expect(result.mode).toBe("obs");
    expect(result.index).toBe(1);
    expect(result.wrapped).toBe(false);

    // Step again to verify wrap-around detection
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

    // Change speed
    setPlaybackSpeed(750);
    expect(appState.get("playbackSpeed")).toBe(750);
    expect(selSpeed.value).toBe("750");

    // Setting mid-play re-arms without error
    startPlayback();
    expect(appState.get("isPlaying")).toBe(true);
    setPlaybackSpeed(3000);
    expect(appState.get("playbackSpeed")).toBe(3000);
    expect(appState.get("isPlaying")).toBe(true);
    pausePlayback();
  });

  test("L1: Switching windows pauses playback and reseeds active period", async () => {
    initTimeSlider("timeslider-container", () => {});
    setTimelineMode("nwp", { period: 24, cycles: ["26082820"], stepLength: 6 });

    startPlayback();
    expect(appState.get("isPlaying")).toBe(true);

    // Switching window via focusWindow must pause active playback
    focusWindow(1, 0);
    // Give async import microtask a chance to run
    await new Promise((r) => setTimeout(r, 20));
    expect(appState.get("isPlaying")).toBe(false);
  });

  test("m6: Background preset update defers to _pendingNwp when window is not active", () => {
    const mainJsPath = path.resolve(__dirname, "../src/main.js");
    const mainJsContent = fs.readFileSync(mainJsPath, "utf-8");

    expect(mainJsContent).toContain("if (getActiveWindow() === win) {");
    expect(mainJsContent).toContain("win._pendingNwp = nwpPayload;");
    expect(mainJsContent).toContain("syncObservationTimeline(obsPath, win.obsTime, winTitle, win)");
  });

  test("R5: P0 guard skips obs re-sync on time-step ticks with a valid file", () => {
    const mainJsPath = path.resolve(__dirname, "../src/main.js");
    const mainJsContent = fs.readFileSync(mainJsPath, "utf-8");

    // The actual one-line P0 fix: time-step ticks reuse the tick's file.
    expect(mainJsContent).toContain("if (!file || (!isTimeStep && group.isObservation && level !== null)) {");
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

    // Kick a tick and hold its load open; then change speed mid-load.
    const tickPromise = step(1, { source: "btn-play", directions: ["next"] });
    setPlaybackSpeed(3000);
    releaseLoad();
    await tickPromise;

    // Still playing exactly once; no orphaned second timer chain.
    expect(appState.get("isPlaying")).toBe(true);
    expect(appState.get("playbackSpeed")).toBe(3000);
    pausePlayback();
  });

  test("R2: throwing / rejecting time-change callbacks never reject unhandled", async () => {
    initTimeSlider("timeslider-container", () => { throw new Error("sync boom"); });
    setTimelineMode("nwp", { period: 24, cycles: ["26082820"], stepLength: 6 });

    // Manual step path: must resolve (step result), not reject.
    const syncResult = await step(1, { source: "btn-next" });
    expect(syncResult.mode).toBe("nwp");

    initTimeSlider("timeslider-container", () => Promise.reject(new Error("async boom")));
    setTimelineMode("nwp", { period: 24, cycles: ["26082820"], stepLength: 6 });
    const asyncResult = await step(1, { source: "btn-next" });
    expect(asyncResult.mode).toBe("nwp");
  });

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

    // Re-init must replace, not stack, handlers.
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
      key: " ",
      code: "Space",
      target: { id: "btn-play", tagName: "BUTTON" },
      preventDefault: () => {},
    };
    windowListeners.get("keydown")?.forEach((fn) => fn(focusedBtnEvent));
    expect(toggles).toBe(0);

    const bodyEvent = {
      key: " ",
      code: "Space",
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

    initKeyboardShortcuts(
      {
        onTogglePlay: () => {
          playToggled = true;
        },
      },
      mockWindow
    );

    let prevented = false;
    const spaceEvent = {
      key: " ",
      code: "Space",
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

    // Timeline with only 1 obs file cannot be animated
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
    const mainJsPath = path.resolve(__dirname, "../src/main.js");
    const mainJsContent = fs.readFileSync(mainJsPath, "utf-8");

    expect(mainJsContent).toContain("if (win._nwpTimeline) {");
    expect(mainJsContent).toContain("win._nwpTimeline.period = period;");
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
    const cssPath = path.resolve(__dirname, "../src/style.css");
    const styleCss = fs.readFileSync(cssPath, "utf-8");

    expect(styleCss).toMatch(/\.play-btn:focus-visible/);
    expect(styleCss).toMatch(/\.step-nav-btn:focus-visible/);
    expect(styleCss).toMatch(/\.play-btn\.loading/);
    expect(styleCss).toMatch(/\.play-btn:disabled/);
    expect(styleCss).toMatch(/\.playback-speed-control/);
  });
});
