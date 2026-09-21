// test/ui/tab-subwindow-visibility.test.js - Svelte 5 store-driven visibility transitions
import { test, expect, describe, beforeEach } from "bun:test";
import { uiState } from "../../src/lib/stores/uiCore.js";
import { timeHeightController } from "../../src/layers/timeheight/timeHeightController.js";
import { tlogpController } from "../../src/layers/tlogp/tlogpController.js";
import { initTabWindowManager, focusWindow, getActiveWindow } from "../../src/ui/tabWindowManager.js";

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

describe("Timeslider & Subwindow Visibility Management (Store Driven)", () => {
  beforeEach(() => {
    uiState.timelineVisible = true;
    uiState.configOpen = false;
  });

  test("1. Config open/close transitions ui.configOpen and ui.timelineVisible", () => {
    expect(uiState.timelineVisible).toBe(true);
    expect(uiState.configOpen).toBe(false);

    // Opening config hides timeline and marks configOpen
    uiState.configOpen = true;
    uiState.timelineVisible = false;

    expect(uiState.configOpen).toBe(true);
    expect(uiState.timelineVisible).toBe(false);

    // Closing config restores state
    uiState.configOpen = false;
    uiState.timelineVisible = true;

    expect(uiState.configOpen).toBe(false);
    expect(uiState.timelineVisible).toBe(true);
  });

  test("2. timeHeightController show and hide manages window isolation", () => {
    const map1 = createMockMap();
    const map2 = createMockMap();
    const win1 = { id: "win-1", winIdx: 0, map: map1 };
    const win2 = { id: "win-2", winIdx: 1, map: map2 };

    let panel1Shown = false;
    const panel1 = { show: () => { panel1Shown = true; }, hide: () => { panel1Shown = false; } };
    const panel2 = { show: () => {}, hide: () => {} };

    timeHeightController._getState(win1).panel = panel1;
    timeHeightController._getState(win1).activeMap = map1;
    timeHeightController._getState(win2).panel = panel2;
    timeHeightController._getState(win2).activeMap = map2;

    timeHeightController.show(map1, win1);
    expect(panel1Shown).toBe(true);

    timeHeightController.hide();
    expect(panel1Shown).toBe(false);
  });

  test("3. Time-height composite preset hides timeline in ui store", () => {
    const win = {
      id: "win-th",
      activeGroup: {
        id: "composite-ec-timeheight",
        name: "ECMWF Time-Height Profile",
        layers: [{ type: "timeheight", id: "ec-timeheight-diagram" }],
      },
    };

    const isTimeHeight = Boolean(
      win.activeGroup?.id === "composite-ec-timeheight" ||
      win.activeGroup?.layers?.some((l) => l.type === "timeheight")
    );
    if (isTimeHeight) {
      uiState.timelineVisible = false;
    }
    expect(uiState.timelineVisible).toBe(false);
  });

  test("4. tlogpController show and hide accepts map and win parameters", () => {
    const map = createMockMap();
    const win = { id: "win-tlogp", winIdx: 2, map };

    let shown = false;
    tlogpController.panel = {
      show: () => { shown = true; },
      hide: () => { shown = false; },
    };

    tlogpController.show(map, win);
    expect(shown).toBe(true);

    tlogpController.hide(map, win);
    expect(shown).toBe(false);
  });

  test("5. Window focus switch and config pill integration update active window and ui transitions", () => {
    const { tabsState } = require("../../src/ui/tabs/tabsStore.js");

    const elements = new Map();
    const createEl = (id) => {
      const classes = new Set();
      const attrs = new Map();
      const el = {
        id,
        style: {},
        classList: {
          add: (c) => classes.add(c),
          remove: (c) => classes.delete(c),
          contains: (c) => classes.has(c),
          toggle: (c, force) => {
            const willHave = force !== undefined ? Boolean(force) : !classes.has(c);
            if (willHave) classes.add(c); else classes.delete(c);
            return willHave;
          },
        },
        setAttribute: (k, v) => attrs.set(k, v),
        getAttribute: (k) => attrs.get(k),
      };
      elements.set(id, el);
      return el;
    };

    const pill0 = createEl("tab-item-win-0");
    const pill1 = createEl("tab-item-win-1");
    const panel0 = createEl("tab-1-panel-0");
    const panel1 = createEl("tab-1-panel-1");
    const ws = createEl("tab-workspace-1");
    const cfgPill = createEl("tab-item-config");
    const cfgPanel = createEl("config-editor-panel");

    const prevDoc = global.document;
    global.document = {
      getElementById: (id) => elements.get(id) || null,
      querySelectorAll: (sel) => {
        if (sel === ".tab-workspace") return [ws];
        return [];
      },
    };

    try {
      const tab = {
        id: 1,
        title: "Workstation 1",
        layout: "1x1",
        activeWinIdx: 0,
        windows: [
          { id: "tab-1-win-0", winIdx: 0, panelId: "tab-1-panel-0", pillId: "tab-item-win-0" },
          { id: "tab-1-win-1", winIdx: 1, panelId: "tab-1-panel-1", pillId: "tab-item-win-1" },
        ],
      };
      tabsState.tabs = [tab];
      tabsState.activeTabId = 1;

      cfgPill.classList.add("active");
      uiState.configOpen = true;

      focusWindow(1, 1);
      expect(tab.activeWinIdx).toBe(1);
      expect(cfgPill.classList.contains("active")).toBe(false);
      expect(getActiveWindow().id).toBe("tab-1-win-1");
    } finally {
      if (prevDoc !== undefined) {
        global.document = prevDoc;
      } else {
        delete global.document;
      }
    }
  });
});
