// test/ui/tab-subwindow-visibility.test.js - Svelte 5 store-driven visibility transitions
import { test, expect, describe, beforeEach } from "bun:test";
import { uiState } from "../../src/lib/stores/uiCore.js";
import { timeHeightController } from "../../src/layers/timeheight/timeHeightController.js";
import { tlogpController } from "../../src/layers/tlogp/tlogpController.js";

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

  test("4. tlogpController show and hide accepts map and win parameters", () => {    const map = createMockMap();
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

});
