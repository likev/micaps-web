// test/ui/tab-subwindow-visibility.test.js - Tests timeslider hiding and subwindow toggling for config and timeheight tabs
import { test, expect, describe, beforeAll, beforeEach } from "bun:test";
import { timeHeightController } from "../../src/layers/timeheight/timeHeightController.js";
import { tlogpController } from "../../src/layers/tlogp/tlogpController.js";
import { activateConfigTab, deactivateConfigTab } from "../../src/ui/configEditor.js";
import { initTimeSlider, setTimeSliderVisible } from "../../src/ui/timeSlider.js";
import { initTabWindowManager, focusWindow, getActiveWindow } from "../../src/ui/tabWindowManager.js";

const elementsMap = new Map();

function createMockElement(id = "", className = "", tagName = "DIV") {
  const el = {
    id,
    tagName: tagName.toUpperCase(),
    classes: new Set(),
    style: {},
    attributes: new Map(),
    dataset: {},
    children: [],
    value: "",
    textContent: "",
    _html: "",
    get innerHTML() { return this._html; },
    set innerHTML(val) { this._html = val; },
    setAttribute(k, v) { this.attributes.set(k, String(v)); },
    getAttribute(k) { return this.attributes.get(k) || null; },
    removeAttribute(k) { this.attributes.delete(k); },
    appendChild(child) { this.children.push(child); },
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
    querySelector() { return null; },
    querySelectorAll() { return []; },
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

if (typeof globalThis.document === "undefined") {
  globalThis.document = {};
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

function createMockMap() {
  const layers = new Map();
  const sources = new Map();
  return {
    layers,
    sources,
    getLayer(id) { return layers.get(id); },
    getSource(id) { return sources.get(id); },
    addLayer(def) { layers.set(def.id, def); },
    removeLayer(id) { layers.delete(id); },
    addSource(id, def) { sources.set(id, def); },
    removeSource(id) { sources.delete(id); },
    setLayoutProperty(id, prop, val) {
      const l = layers.get(id);
      if (l) {
        l.layout = l.layout || {};
        l.layout[prop] = val;
      }
    },
  };
}

describe("Timeslider & Subwindow Visibility Management", () => {
  let tsContainer;
  let tlogpEl;
  let thSubwindowEl;
  let cfgPill;
  let cfgPanel;

  beforeAll(() => {
    createMockElement("tabs-list");
    createMockElement("btn-add-tab");
    createMockElement("workspace-container");
    tsContainer = createMockElement("timeslider-container");
    tlogpEl = createMockElement("tlogp-panel");
    thSubwindowEl = createMockElement("timeheight-panel-win-1", "timeheight-subwindow");
    cfgPill = createMockElement("tab-item-config", "tab-item");
    cfgPanel = createMockElement("config-editor-panel");

    initTimeSlider("timeslider-container", () => {});
    initTabWindowManager();
  });

  beforeEach(() => {
    setTimeSliderVisible(true);
    tlogpEl.style.display = "block";
    thSubwindowEl.style.display = "block";
  });

  test("1. activateConfigTab hides timeslider and all subwindows", () => {
    expect(tsContainer.classList.contains("hidden")).toBe(false);

    activateConfigTab();

    expect(tsContainer.classList.contains("hidden")).toBe(true);
    expect(tlogpEl.style.display).toBe("none");
    expect(thSubwindowEl.style.display).toBe("none");

    deactivateConfigTab();
    expect(cfgPill.classList.contains("active")).toBe(false);
    expect(cfgPanel.style.display).toBe("none");
  });

  test("2. timeHeightController show and hide manages window isolation and highlight", () => {
    const map1 = createMockMap();
    const map2 = createMockMap();
    const win1 = { id: "win-1", winIdx: 0, map: map1 };
    const win2 = { id: "win-2", winIdx: 1, map: map2 };

    const panel1 = { show: () => { thSubwindowEl.style.display = "flex"; }, hide: () => { thSubwindowEl.style.display = "none"; } };
    const panel2 = { show: () => {}, hide: () => {} };

    timeHeightController._getState(win1).panel = panel1;
    timeHeightController._getState(win1).activeMap = map1;
    timeHeightController._getState(win2).panel = panel2;
    timeHeightController._getState(win2).activeMap = map2;

    timeHeightController.show(map1, win1);
    expect(thSubwindowEl.style.display).toBe("flex");

    timeHeightController.hide();
    expect(thSubwindowEl.style.display).toBe("none");
  });

  test("3. focusWindow on EC Time-Height Profile window hides timeslider", () => {
    const win = getActiveWindow();
    expect(win).toBeDefined();

    win.activeGroup = {
      id: "composite-ec-timeheight",
      name: "ECMWF Time-Height Profile",
      layers: [{ type: "timeheight", id: "ec-timeheight-diagram" }],
    };

    setTimeSliderVisible(true);
    expect(tsContainer.classList.contains("hidden")).toBe(false);

    focusWindow(win.tabId, win.winIdx);

    expect(tsContainer.classList.contains("hidden")).toBe(true);
  });

  test("4. tlogpController show and hide accepts map and win parameters", () => {
    const map = createMockMap();
    const win = { id: "win-tlogp", winIdx: 2, map };

    tlogpController.panel = {
      show: () => { tlogpEl.style.display = "flex"; },
      hide: () => { tlogpEl.style.display = "none"; },
    };

    tlogpController.show(map, win);
    expect(tlogpEl.style.display).toBe("flex");

    tlogpController.hide(map, win);
    expect(tlogpEl.style.display).toBe("none");
  });
});
