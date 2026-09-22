// close-visibility.test.js - Panel close persists eye state; hidden panels stay
// hidden across window-tab toggles (store-authoritative visibility)
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { timeHeightController } from "../../src/layers/timeheight/timeHeightController.js";
import { lineHeightController } from "../../src/layers/lineprofile/lineHeightController.js";
import { hovmollerController } from "../../src/layers/lineprofile/hovmollerController.js";
import { tlogpController } from "../../src/layers/tlogp/tlogpController.js";
import { removeTLogPLayer } from "../../src/layers/tlogp/tlogpLayer.js";
import { hasProfilePanel } from "../../src/lib/stores/profilesCore.js";
import { setTimeHeightVisibility } from "../../src/layers/timeheight/timeHeightLayer.js";
import { syncProfilePanelsForWindow } from "../../src/lib/services/profileVisibility.js";
import { getLayersForWindow, addOrUpdateLayer } from "../../src/lib/stores/layersCore.js";

function mockMap() {
  const layers = new Map(), sources = new Map(), listeners = new Map();
  return {
    layers, sources, listeners,
    on(ev, cb) { if (!listeners.has(ev)) listeners.set(ev, []); listeners.get(ev).push(cb); },
    off(ev, cb) { const a = listeners.get(ev) || []; listeners.set(ev, a.filter((f) => f !== cb)); },
    getLayer(id) { return layers.get(id); },
    getSource(id) { return sources.get(id); },
    addLayer(d) { layers.set(d.id, { ...d, layout: d.layout || {} }); },
    removeLayer(id) { layers.delete(id); },
    addSource(id, d) { const s = { ...d, setData(x) { s.data = x; } }; sources.set(id, s); },
    removeSource(id) { sources.delete(id); },
    setLayoutProperty(id, p, v) { const l = layers.get(id); if (l) { l.layout = l.layout || {}; l.layout[p] = v; } },
    setFilter() {},
    unproject(p) { return { lng: p.x, lat: p.y }; },
  };
}

let originalFetch;
beforeEach(() => { originalFetch = global.fetch; });
afterEach(() => { global.fetch = originalFetch; });

describe("panel close persists eye state (bug 1)", () => {
  test("timeheight handlePanelClose hides and flips store visible=false", async () => {
    global.fetch = async () => ({ ok: false, status: 404, statusText: "nf", text: async () => "" });
    const map = mockMap();
    const win = { id: "close-eye-th", activeGroup: { id: "composite-ec-timeheight", layers: [{ id: "ec-timeheight-diagram", type: "timeheight", visible: true }] } };
    timeHeightController.destroy();
    await timeHeightController.init(map, win, { config: { lon: 121.5, lat: 31.4 } });
    expect(getLayersForWindow(win).find((l) => l.type === "timeheight")?.visible).not.toBe(false);

    timeHeightController.handlePanelClose(map, win);
    expect(getLayersForWindow(win).find((l) => l.type === "timeheight")?.visible).toBe(false);
    timeHeightController.destroy(map, win);
  });

  test("lineheight / hovmoller / tlogp handlePanelClose persist without full init", () => {
    const map = mockMap();
    const win = { id: "close-eye-multi" };
    addOrUpdateLayer({ id: "ec-lineheight-diagram", type: "lineheight", visible: true }, win);
    addOrUpdateLayer({ id: "ec-hovmoller-diagram", type: "hovmoller", visible: true }, win);
    addOrUpdateLayer({ id: "upperair-tlogp-diagram", type: "tlogp", visible: true }, win);

    lineHeightController.handlePanelClose(map, win);
    expect(getLayersForWindow(win).find((l) => l.id === "ec-lineheight-diagram")?.visible).toBe(false);

    hovmollerController.handlePanelClose(map, win);
    expect(getLayersForWindow(win).find((l) => l.id === "ec-hovmoller-diagram")?.visible).toBe(false);

    tlogpController.isLayerActive = true;
    tlogpController.activeWin = win;
    tlogpController.handlePanelClose(map, win);
    expect(getLayersForWindow(win).find((l) => l.id === "upperair-tlogp-diagram")?.visible).toBe(false);
    tlogpController.isLayerActive = false;
    tlogpController.activeWin = null;
  });
});

describe("hidden panels stay hidden across toggles (bug 2)", () => {
  test("eye-hidden timeheight never re-shows on focus", async () => {
    global.fetch = async () => ({ ok: false, status: 404, statusText: "nf", text: async () => "" });
    const map = mockMap();
    const win = { id: "toggle-eye-th", activeGroup: { id: "composite-ec-timeheight", layers: [{ id: "ec-timeheight-diagram", type: "timeheight", visible: true }] } };
    timeHeightController.destroy();
    await timeHeightController.init(map, win, { config: { lon: 121.5, lat: 31.4 } });
    addOrUpdateLayer({ id: "ec-timeheight-diagram", type: "timeheight", visible: true }, win);

    setTimeHeightVisibility(map, false, win);
    expect(getLayersForWindow(win).find((l) => l.type === "timeheight")?.visible).toBe(false);

    const flags = syncProfilePanelsForWindow(win, map);
    expect(flags.timeheight).toBe(false);
    timeHeightController.destroy(map, win);
  });

  test("stale preset copy cannot resurrect an eye-hidden store layer", () => {
    const map = mockMap();
    const win = {
      id: "toggle-stale-copy",
      activeGroup: { id: "composite-ec-timeheight", layers: [{ id: "ec-timeheight-diagram", type: "timeheight", visible: true }] },
    };
    addOrUpdateLayer({ id: "ec-timeheight-diagram", type: "timeheight", visible: false }, win);
    timeHeightController.windows.set(win.id, { winId: win.id, panel: { show() {}, hide() {} }, activeMap: map, isLayerActive: true });

    const flags = syncProfilePanelsForWindow(win, map);
    expect(flags.timeheight).toBe(false);
    timeHeightController.windows.delete(win.id);
  });

  test("closed-then-toggled timeheight stays hidden", async () => {    global.fetch = async () => ({ ok: false, status: 404, statusText: "nf", text: async () => "" });
    const map = mockMap();
    const win = { id: "toggle-close-th", activeGroup: { id: "composite-ec-timeheight", layers: [{ id: "ec-timeheight-diagram", type: "timeheight", visible: true }] } };
    timeHeightController.destroy();
    await timeHeightController.init(map, win, { config: { lon: 121.5, lat: 31.4 } });

    timeHeightController.handlePanelClose(map, win);
    const other = { id: "toggle-close-other", activeGroup: { id: "nwp", layers: [] } };
    syncProfilePanelsForWindow(other, mockMap());
    const flags = syncProfilePanelsForWindow(win, map);
    expect(flags.timeheight).toBe(false);
    timeHeightController.destroy(map, win);
  });
});

describe("tlogp singleton survives foreign-window teardown", () => {
  test("preset reload in another window must not destroy the shared panel", async () => {
    global.fetch = async () => ({ ok: false, status: 404, statusText: "nf", text: async () => "" });
    const map1 = mockMap();
    const map2 = mockMap();
    const owner = { id: "tlogp-owner-win" };
    const other = { id: "tlogp-foreign-win" };
    tlogpController.destroy();
    await tlogpController.init(map1, owner, { config: { stationId: "58362" }, visible: true });
    expect(tlogpController.isActive()).toBe(true);

    // Fresh load in a DIFFERENT window (clearAllWeatherLayers path)
    removeTLogPLayer(map2, other);
    expect(tlogpController.isActive()).toBe(true);
    expect(tlogpController.panel).not.toBeNull();
    expect(hasProfilePanel("tlogp", "x")).toBe(true);

    // Owner teardown still fully cleans up
    removeTLogPLayer(map1, owner);
    expect(tlogpController.isActive()).toBe(false);
    expect(tlogpController.panel).toBeNull();
    expect(hasProfilePanel("tlogp", "x")).toBe(false);
  });
});
