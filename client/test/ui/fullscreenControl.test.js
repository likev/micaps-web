// fullscreenControl.test.js - Unit and integration tests for fullscreen button control
import { test, expect, describe, beforeEach } from "bun:test";
import fs from "fs";
import path from "path";
import {
  initFullscreenControl,
  toggleFullscreen,
  enterFullscreen,
  exitFullscreen,
  isFullscreen,
  updateFullscreenButton,
  ENTER_FULLSCREEN_SVG,
  EXIT_FULLSCREEN_SVG,
} from "../../src/ui/fullscreenControl.js";

describe("Fullscreen Button Control", () => {
  let mockDoc;
  let mockWin;
  let mockTarget;
  let btn;
  let listeners;
  let windowEvents;

  beforeEach(() => {
    listeners = new Map();
    windowEvents = [];

    mockTarget = {
      requestFullscreen: async () => {
        mockDoc.fullscreenElement = mockTarget;
      },
      webkitRequestFullscreen: null,
    };

    btn = {
      id: "btn-fullscreen-toggle",
      className: "btn-fullscreen-toggle",
      classList: {
        _classes: new Set(["btn-fullscreen-toggle"]),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        contains(c) { return this._classes.has(c); },
      },
      attributes: new Map(),
      setAttribute(k, v) { this.attributes.set(k, String(v)); },
      getAttribute(k) { return this.attributes.get(k) || null; },
      innerHTML: "",
      title: "",
      addEventListener(evt, fn) {
        if (!listeners.has(evt)) listeners.set(evt, []);
        listeners.get(evt).push(fn);
      },
      removeEventListener(evt, fn) {
        if (!listeners.has(evt)) return;
        listeners.set(evt, listeners.get(evt).filter((f) => f !== fn));
      },
      async click() {
        const fns = listeners.get("click") || [];
        for (const f of fns) {
          await f({ preventDefault: () => {} });
        }
      },
    };

    const docListeners = new Map();

    mockWin = {
      dispatchEvent: (evt) => {
        windowEvents.push(evt.type);
      },
    };

    mockDoc = {
      fullscreenElement: null,
      documentElement: mockTarget,
      defaultView: mockWin,
      getElementById: (id) => (id === "btn-fullscreen-toggle" ? btn : null),
      createElement: (tag) => {
        if (tag === "button") return btn;
        return {};
      },
      exitFullscreen: async () => {
        mockDoc.fullscreenElement = null;
      },
      addEventListener(evt, fn) {
        if (!docListeners.has(evt)) docListeners.set(evt, []);
        docListeners.get(evt).push(fn);
      },
      removeEventListener(evt, fn) {
        if (!docListeners.has(evt)) return;
        docListeners.set(evt, docListeners.get(evt).filter((f) => f !== fn));
      },
      _fireEvent(evtType) {
        const fns = docListeners.get(evtType) || [];
        fns.forEach((f) => f({ type: evtType }));
      },
    };
  });

  test("initializes control and sets default non-fullscreen state and SVG", () => {
    const ctrl = initFullscreenControl("btn-fullscreen-toggle", {
      document: mockDoc,
      target: mockTarget,
    });

    expect(ctrl).not.toBeNull();
    expect(ctrl.button).toBe(btn);
    expect(btn.classList.contains("is-fullscreen")).toBe(false);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.getAttribute("aria-label")).toBe("Toggle Fullscreen");
    expect(btn.getAttribute("title")).toBe("Toggle Fullscreen");
    expect(btn.innerHTML).toBe(ENTER_FULLSCREEN_SVG);
    ctrl.destroy();
  });

  test("toggles fullscreen entering mode on button click", async () => {
    const ctrl = initFullscreenControl("btn-fullscreen-toggle", {
      document: mockDoc,
      target: mockTarget,
    });

    expect(isFullscreen(mockDoc)).toBe(false);

    // Click button to enter fullscreen
    await btn.click();

    expect(isFullscreen(mockDoc)).toBe(true);
    expect(btn.classList.contains("is-fullscreen")).toBe(true);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.getAttribute("aria-label")).toBe("Exit Fullscreen");
    expect(btn.getAttribute("title")).toBe("Exit Fullscreen");
    expect(btn.innerHTML).toBe(EXIT_FULLSCREEN_SVG);
    expect(windowEvents).toContain("resize");

    ctrl.destroy();
  });

  test("toggles fullscreen exiting mode on subsequent click", async () => {
    const ctrl = initFullscreenControl("btn-fullscreen-toggle", {
      document: mockDoc,
      target: mockTarget,
    });

    // Enter fullscreen
    await btn.click();
    expect(isFullscreen(mockDoc)).toBe(true);

    // Exit fullscreen
    await btn.click();
    expect(isFullscreen(mockDoc)).toBe(false);
    expect(btn.classList.contains("is-fullscreen")).toBe(false);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.getAttribute("title")).toBe("Toggle Fullscreen");
    expect(btn.innerHTML).toBe(ENTER_FULLSCREEN_SVG);

    ctrl.destroy();
  });

  test("responds to external fullscreenchange event (e.g. keyboard Esc)", () => {
    const ctrl = initFullscreenControl("btn-fullscreen-toggle", {
      document: mockDoc,
      target: mockTarget,
    });

    // Simulate browser entering fullscreen externally
    mockDoc.fullscreenElement = mockTarget;
    mockDoc._fireEvent("fullscreenchange");

    expect(btn.classList.contains("is-fullscreen")).toBe(true);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.innerHTML).toBe(EXIT_FULLSCREEN_SVG);

    // Simulate browser exiting fullscreen (e.g. Esc key pressed)
    mockDoc.fullscreenElement = null;
    mockDoc._fireEvent("fullscreenchange");

    expect(btn.classList.contains("is-fullscreen")).toBe(false);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.innerHTML).toBe(ENTER_FULLSCREEN_SVG);

    ctrl.destroy();
  });

  test("auto-creates button element inside main-content if absent", () => {
    let appended = null;
    const mainContent = {
      id: "main-content",
      appendChild: (child) => { appended = child; },
    };

    const docWithoutBtn = {
      fullscreenElement: null,
      documentElement: mockTarget,
      defaultView: mockWin,
      getElementById: (id) => (id === "main-content" ? mainContent : null),
      createElement: (tag) => {
        if (tag === "button") return btn;
        return {};
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    const ctrl = initFullscreenControl("btn-fullscreen-toggle", {
      document: docWithoutBtn,
      target: mockTarget,
    });

    expect(ctrl).not.toBeNull();
    expect(appended).toBe(btn);
    expect(btn.className).toBe("btn-fullscreen-toggle");
    ctrl.destroy();
  });

  test("verifies FullscreenButton places btn-fullscreen-toggle with correct id and class inside main-content", () => {
    const sveltePath = path.resolve(__dirname, "../../src/components/FullscreenButton.svelte");
    const svelteCode = fs.readFileSync(sveltePath, "utf-8");

    expect(svelteCode).toContain('id="btn-fullscreen-toggle"');
    expect(svelteCode).toContain('class="btn-fullscreen-toggle"');

    const appPath = path.resolve(__dirname, "../../src/App.svelte");
    const appCode = fs.readFileSync(appPath, "utf-8");
    const mainContentIdx = appCode.indexOf('<main id="main-content"');
    const fsBtnIdx = appCode.indexOf('<FullscreenButton');
    const mainCloseIdx = appCode.indexOf('</main>');
    expect(mainContentIdx).toBeGreaterThan(-1);
    expect(fsBtnIdx).toBeGreaterThan(mainContentIdx);
    expect(fsBtnIdx).toBeLessThan(mainCloseIdx);
  });

  test("verifies tokens.css defines .btn-fullscreen-toggle with left-middle positioning", () => {
    const cssPath = path.resolve(__dirname, "../../src/styles/tokens.css");
    const css = fs.readFileSync(cssPath, "utf-8");

    expect(css).toContain(".btn-fullscreen-toggle");
    expect(css).toContain("position: absolute;");
    expect(css).toContain("left: 12px;");
    expect(css).toContain("top: 50%;");
    expect(css).toContain("transform: translateY(-50%);");
    expect(css).toContain("z-index: 520;");
  });
});
