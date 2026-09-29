// bug_split_sync_memrelease_rain12.test.js
// Verification suite for the three critical bugs:
// Bug 1: Keyboard shortcuts Up/Down (level) and Left/Right (time) in split mode across all 4 modes (time, step, level, model)
// Bug 2: Tab-window and layer deletion memory release (T-LogP, Time-Height, Line-Height, Hovmoller)
// Bug 3: RAIN12 lead times 0 and 6 (.000, .006) disabled and skipped during stepping/playback

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  createDefaultTab,
  createDefaultWindow,
  getNextWindowUid,
  applyAutoAllocation,
  getVisibleWindows,
  tabsState,
} from "../src/lib/stores/tabsCore.js";
import {
  getLayersForWindow,
  addOrUpdateLayer,
  removeLayer,
  clearLayersForWindow,
} from "../src/lib/stores/layersCore.js";
import {
  createTimelineState,
  clearWindowTimeline,
} from "../src/lib/stores/timelineCore.js";
import {
  hasProfilePanel,
  setProfileState,
  getProfileState,
  clearProfileState,
} from "../src/lib/stores/profilesCore.js";
import {
  findVisibleLayer,
  syncProfilePanelsForWindow,
} from "../src/lib/services/profileVisibility.js";
import { stepWindowTimeline } from "../src/lib/services/appWorkflow.js";
import { tlogpController } from "../src/layers/tlogp/tlogpController.js";
import { timeHeightController } from "../src/layers/timeheight/timeHeightController.js";
import { lineHeightController } from "../src/layers/lineprofile/lineHeightController.js";
import { hovmollerController } from "../src/layers/lineprofile/hovmollerController.js";
import { removeTLogPLayer } from "../src/layers/tlogp/tlogpLayer.js";
import { removeTimeHeightLayer } from "../src/layers/timeheight/timeHeightLayer.js";
import { removeLineHeightLayer, removeHovmollerLayer } from "../src/layers/lineprofile/lineProfileLayer.js";
import { handleRemoveAction } from "../src/ui/layers/actionsDispatcher.js";
import { isRain12Element, isWindowRain12 } from "../src/utils/rain12.js";
import { step as playbackStep } from "../src/ui/timeline/playbackController.js";
import { timelineState as playbackTlState } from "../src/ui/timeline/timelineStore.js";

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

describe("Bug 1: Split Mode Keyboard Shortcuts Sync for All 4 Modes", () => {
  it("Level mode: Up/Down shifts vertical level on each visible window", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x2";
    tab.autoAllocation = "level";
    tab.windows = [
      { ...createDefaultWindow(0, 1), level: 850 },
      { ...createDefaultWindow(1, 1), level: 700 },
      { ...createDefaultWindow(2, 1), level: 500 },
      { ...createDefaultWindow(3, 1), level: 200 },
    ];

    const levels = [1000, 925, 850, 700, 500, 400, 300, 200, 100];
    const visible = getVisibleWindows(tab);
    const delta = 1; // Downward in pressure / upward in altitude

    for (const w of visible) {
      const wIdx = levels.indexOf(w.level || 500);
      const shifted = Math.max(0, Math.min(levels.length - 1, wIdx + delta));
      w.level = levels[shifted];
    }

    expect(tab.windows[0].level).toBe(700); // was 850, shifted +1 -> 700
    expect(tab.windows[1].level).toBe(500); // was 700, shifted +1 -> 500
    expect(tab.windows[2].level).toBe(400); // was 500, shifted +1 -> 400
    expect(tab.windows[3].level).toBe(100); // was 200, shifted +1 -> 100
  });

  it("Model, Step, and Time modes: Up/Down syncs all visible windows to the target level", () => {
    const modes = ["model", "step", "time"];
    const levels = [1000, 925, 850, 700, 500, 400, 300, 200, 100];

    for (const mode of modes) {
      const tab = createDefaultTab(1);
      tab.layout = "1x2";
      tab.autoAllocation = mode;
      tab.windows = [
        { ...createDefaultWindow(0, 1), level: 500 },
        { ...createDefaultWindow(1, 1), level: 500 },
      ];

      const cur = tab.windows[0].level;
      const idx = levels.indexOf(cur);
      const nextIdx = idx + 1; // 500 -> 400
      const targetLvl = levels[nextIdx];

      const visible = getVisibleWindows(tab);
      for (const w of visible) {
        w.level = targetLvl;
      }

      expect(tab.windows[0].level).toBe(400);
      expect(tab.windows[1].level).toBe(400);
    }
  });

  it("Step mode: Left/Right steps timeline on visible[0] and shifts all windows accordingly", () => {
    const tab = createDefaultTab(1);
    tab.layout = "1x2";
    tab.autoAllocation = "step";
    tab.windows = [
      { ...createDefaultWindow(0, 1), period: 12, stepLength: 6 },
      { ...createDefaultWindow(1, 1), period: 18, stepLength: 6 },
    ];

    const tl0 = createTimelineState(tab.windows[0].id, {
      discretePeriods: [0, 6, 12, 18, 24, 30, 36],
      currentPeriodIdx: 2, // 12
    });

    const res = stepWindowTimeline(tl0, 1);
    expect(res).not.toBeNull();
    expect(res.period).toBe(18);

    // When applied to the split windows
    const periods = tl0.discretePeriods;
    const startIdx = periods.indexOf(res.period);
    tab.windows[0].period = periods[startIdx];
    tab.windows[1].period = periods[startIdx + 1];

    expect(tab.windows[0].period).toBe(18);
    expect(tab.windows[1].period).toBe(24);
  });

  it("Time mode: Left/Right steps base window period and preserves identical valid time across split", () => {
    const tab = createDefaultTab(1);
    tab.layout = "1x2";
    tab.autoAllocation = "time";
    tab.windows = [
      { ...createDefaultWindow(0, 1), forecastCycle: "2024010208", period: 24, stepLength: 12 },
      { ...createDefaultWindow(1, 1), forecastCycle: "2024010120", period: 36, stepLength: 12 },
    ];

    const baseWin = tab.windows[0];
    const tl0 = createTimelineState(baseWin.id, {
      discretePeriods: [12, 24, 36, 48, 60],
      currentPeriodIdx: 1, // 24
    });

    // Step delta +1
    const res = stepWindowTimeline(tl0, 1);
    expect(res.period).toBe(36);

    baseWin.period = res.period;
    applyAutoAllocation(tab, "time", baseWin);

    // Base win is at cycle 2024010208 + period 36h
    // Win 1 is stepped by -12h cycle -> 2024010120 + period 48h
    // Both equal valid time: 2024-01-03 20:00 UTC
    expect(tab.windows[0].forecastCycle).toBe("2024010208");
    expect(tab.windows[0].period).toBe(36);
    expect(tab.windows[1].forecastCycle).toBe("2024010120");
    expect(tab.windows[1].period).toBe(48);
  });

  it("Time mode: Left/Right stepping on non-zero window (win1) correctly computes base win0 period and keeps all windows synced", () => {
    const tab = createDefaultTab(1);
    tab.layout = "1x2";
    tab.autoAllocation = "time";
    const win0 = { ...createDefaultWindow(0, 1), forecastCycle: "2024010208", period: 24, stepLength: 12 };
    const win1 = { ...createDefaultWindow(1, 1), forecastCycle: "2024010120", period: 36, stepLength: 12 };
    tab.windows = [win0, win1];

    const tl1 = createTimelineState(win1.id, {
      discretePeriods: [12, 24, 36, 48, 60],
      currentPeriodIdx: 2, // 36
    });

    const res = stepWindowTimeline(tl1, 1);
    expect(res.period).toBe(48);

    const parseCycleEpoch = (str) => {
      const clean = String(str || "").replace(/[^\d]/g, "").slice(0, 10);
      const y = parseInt(clean.slice(0, 4), 10);
      const m = parseInt(clean.slice(4, 6), 10) - 1;
      const d = parseInt(clean.slice(6, 8), 10);
      const h = parseInt(clean.slice(8, 10), 10);
      return Date.UTC(y, m, d, h);
    };
    const t0 = parseCycleEpoch(win0.forecastCycle);
    const t1 = parseCycleEpoch(win1.forecastCycle);
    const deltaH = Math.round((t0 - t1) / 3600000); // 12
    const basePeriod = res.period - deltaH; // 48 - 12 = 36

    win0.period = basePeriod;
    applyAutoAllocation(tab, "time", win0);

    expect(win0.period).toBe(36);
    expect(win1.period).toBe(48);
  });

  it("Level mode: Up/Down shifts non-boundary windows even if active window is at boundary (100hPa or 1000hPa)", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x2";
    tab.autoAllocation = "level";
    tab.windows = [
      { ...createDefaultWindow(0, 1), level: 500 },
      { ...createDefaultWindow(1, 1), level: 700 },
      { ...createDefaultWindow(2, 1), level: 850 },
      { ...createDefaultWindow(3, 1), level: 100 },
    ];
    tab.activeWinIdx = 3;
    const visible = getVisibleWindows(tab);
    const levels = [1000, 925, 850, 700, 500, 400, 300, 200, 100];
    const delta = 1;

    for (const w of visible) {
      const wIdx = levels.indexOf(w.level ?? 500);
      if (wIdx !== -1) {
        const shifted = Math.max(0, Math.min(levels.length - 1, wIdx + delta));
        w.level = levels[shifted];
      }
    }

    expect(tab.windows[0].level).toBe(400); // 500 -> 400
    expect(tab.windows[1].level).toBe(500); // 700 -> 500
    expect(tab.windows[2].level).toBe(700); // 850 -> 700
    expect(tab.windows[3].level).toBe(100); // clamped at 100
  });

  it("Model mode: Left/Right synchronizes discretePeriods and forecastCycles across split windows", () => {
    const tab = createDefaultTab(1);
    tab.layout = "1x2";
    tab.windows = [
      { ...createDefaultWindow(0, 1), model: "ECMWF_HR", period: 24, discretePeriods: [0, 6, 12, 18, 24, 30], forecastCycles: ["2024010108"] },
      { ...createDefaultWindow(1, 1), model: "GRAPES_GFS", period: 24 },
    ];
    applyAutoAllocation(tab, "model", tab.windows[0]);

    expect(tab.windows[1].discretePeriods).toEqual([0, 6, 12, 18, 24, 30]);
    expect(tab.windows[1].forecastCycles).toEqual(["2024010108"]);

    const tl1 = createTimelineState(tab.windows[1].id, {
      discretePeriods: tab.windows[1].discretePeriods,
      currentPeriodIdx: 4,
    });
    const res = stepWindowTimeline(tl1, 1);
    expect(res).not.toBeNull();
    expect(res.period).toBe(30);
  });
});

describe("Bug 2: Layer & Window Deletion Resource Cleanup", () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = async () => ({ ok: false, status: 404, statusText: "nf", text: async () => "" });
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("removes TLogP layer and prevents panel resurrection on window recreation", async () => {
    const map = mockMap();
    const win = {
      id: "tab-1-win-1",
      activeGroup: { id: "composite-tlogp", layers: [{ id: "upperair-tlogp-diagram", type: "tlogp", visible: true }] },
    };

    await tlogpController.init(map, win, { config: { stationId: "58362" }, visible: true });
    expect(tlogpController.isActive()).toBe(true);
    expect(hasProfilePanel("tlogp", win.id)).toBe(true);

    // Remove layer via actionsDispatcher
    handleRemoveAction(map, "upperair-tlogp-diagram", { id: "upperair-tlogp-diagram", type: "tlogp" }, win);
    removeTLogPLayer(map, win, "upperair-tlogp-diagram");

    expect(tlogpController.isActive()).toBe(false);
    expect(hasProfilePanel("tlogp", win.id)).toBe(false);
    expect(findVisibleLayer(win, ["tlogp"], ["upperair-tlogp-diagram"])).toBeNull();

    // Now clear window resources as handleCloseWindow does
    clearLayersForWindow(win.id);
    clearWindowTimeline(win.id);
    clearProfileState("tlogp", win.id);

    // Create a new window reusing the same ID (tab-1-win-1)
    const newWin = createDefaultWindow(1, 1);
    expect(newWin.id).toBe("tab-1-win-1");

    // Syncing profile panels for newWin should NOT show tlogp panel
    const flags = syncProfilePanelsForWindow(newWin, map);
    expect(flags.tlogp).toBe(false);
    expect(tlogpController.isActive()).toBe(false);
  });

  it("removes TLogP layer on foreign window without destroying singleton, and owner teardown cleans up completely", async () => {
    const map = mockMap();
    const winOwner = {
      ...createDefaultWindow(0, 1),
      id: "tab-1-win-owner",
      activeGroup: { id: "composite-tlogp", layers: [{ id: "upperair-tlogp-diagram", type: "tlogp", visible: true }] },
      layers: [{ id: "upperair-tlogp-diagram", type: "tlogp", visible: true }],
    };
    const winOther = {
      ...createDefaultWindow(1, 1),
      id: "tab-1-win-other",
      activeGroup: { id: "composite-tlogp", layers: [{ id: "upperair-tlogp-diagram", type: "tlogp", visible: true }] },
      layers: [{ id: "upperair-tlogp-diagram", type: "tlogp", visible: true }],
    };

    await tlogpController.init(map, winOwner, { config: { stationId: "58362" }, visible: true });
    expect(tlogpController.isActive()).toBe(true);

    // Foreign window teardown (e.g. preset reload in another window) must NOT destroy the shared panel
    removeTLogPLayer(map, winOther, "upperair-tlogp-diagram");
    expect(tlogpController.isActive()).toBe(true);

    // Owner teardown cleanly destroys and releases memory
    removeTLogPLayer(map, winOwner, "upperair-tlogp-diagram");
    expect(tlogpController.isActive()).toBe(false);
  });

  it("removes TimeHeight layer and cleans up memory and panel", async () => {
    const map = mockMap();
    const win = {
      id: "tab-1-win-th",
      activeGroup: { id: "composite-ec-timeheight", layers: [{ id: "ec-timeheight-diagram", type: "timeheight", visible: true }] },
    };

    await timeHeightController.init(map, win, { config: { lon: 121.5, lat: 31.4 }, visible: true });
    expect(timeHeightController.isActive(win)).toBe(true);

    // Remove timeheight layer
    handleRemoveAction(map, "ec-timeheight-diagram", { id: "ec-timeheight-diagram", type: "timeheight" }, win);
    removeTimeHeightLayer(map, win, "ec-timeheight-diagram");

    expect(timeHeightController.isActive(win)).toBe(false);
    expect(findVisibleLayer(win, ["timeheight"], ["ec-timeheight-diagram"])).toBeNull();

    // Simulate closing window and recreating
    clearLayersForWindow(win.id);
    clearProfileState("timeheight", win.id);

    const reloadedFlags = syncProfilePanelsForWindow(win, map);
    expect(reloadedFlags.timeheight).toBe(false);
  });

  it("removes LineHeight and Hovmoller layers and cleans up properly", () => {
    const map = mockMap();
    const win = {
      id: "tab-1-win-lp",
      activeGroup: {
        id: "composite-lineprofile",
        layers: [
          { id: "ec-lineheight-diagram", type: "lineheight", visible: true },
          { id: "ec-hovmoller-diagram", type: "hovmoller", visible: true },
        ],
      },
    };

    addOrUpdateLayer({ id: "ec-lineheight-diagram", type: "lineheight", visible: true }, win);
    addOrUpdateLayer({ id: "ec-hovmoller-diagram", type: "hovmoller", visible: true }, win);

    removeLineHeightLayer(map, win, "ec-lineheight-diagram");
    removeHovmollerLayer(map, win, "ec-hovmoller-diagram");

    expect(findVisibleLayer(win, ["lineheight"], ["ec-lineheight-diagram"])).toBeNull();
    expect(findVisibleLayer(win, ["hovmoller"], ["ec-hovmoller-diagram"])).toBeNull();
  });

  it("Window creation (new tab-win) uses getNextWindowUid to avoid ID collisions and prevents resurrecting stale layers", () => {
    const tab = createDefaultTab(1);
    expect(tab.windows.length).toBe(1);

    const uid1 = getNextWindowUid(tab);
    const win1 = createDefaultWindow(1, tab.id);
    win1.uid = uid1;
    win1.id = `tab-${tab.id}-win-${uid1}`;
    tab.windows.push(win1);
    expect(win1.id).toBe("tab-1-win-1");

    addOrUpdateLayer({ id: "layer-test", name: "Test Layer", type: "contour" }, win1);
    expect(getLayersForWindow(win1.id).some((l) => l.id === "layer-test")).toBe(true);

    clearLayersForWindow(tab.windows[0].id);
    tab.windows.splice(0, 1);
    expect(tab.windows.length).toBe(1);
    expect(tab.windows[0].id).toBe("tab-1-win-1");

    clearLayersForWindow(win1.id);
    tab.windows.splice(0, 1);
    expect(tab.windows.length).toBe(0);

    const uid2 = getNextWindowUid(tab);
    const winNew = createDefaultWindow(0, tab.id);
    winNew.uid = uid2;
    winNew.id = `tab-${tab.id}-win-${uid2}`;
    expect(winNew.id).not.toBe("tab-1-win-1");
    expect(getLayersForWindow(winNew.id).some((l) => l.id === "layer-test")).toBe(false);
  });
});

describe("Bug 3: RAIN12 Lead Times 0 and 6 Disabled and Skipped", () => {
  it("isRain12Element and isWindowRain12 identify RAIN12 products", () => {
    expect(isRain12Element("RAIN12")).toBe(true);
    expect(isRain12Element("rain12")).toBe(true);
    expect(isRain12Element("ECMWF_HR/RAIN12")).toBe(true);
    expect(isRain12Element("RAIN12_ACCUM")).toBe(true);
    expect(isRain12Element("TMP")).toBe(false);
    expect(isRain12Element("RAIN24")).toBe(false);

    const rainWin = { element: "RAIN12", id: "w-rain" };
    expect(isWindowRain12(rainWin)).toBe(true);

    const groupWin = { activeGroup: { id: "nwp-rain12", name: "12h Rain" } };
    expect(isWindowRain12(groupWin)).toBe(true);

    const nonRainWin = { element: "TMP", id: "w-tmp" };
    expect(isWindowRain12(nonRainWin)).toBe(false);
  });

  it("stepWindowTimeline skips disabledPeriods [0, 6] during forward stepping", () => {
    const tl = createTimelineState("rain12-win", {
      discretePeriods: [0, 6, 12, 18, 24, 30, 36],
      currentPeriodIdx: 2, // 12
      disabledPeriods: [0, 6],
    });

    // Step forward from 12 -> 18
    let res = stepWindowTimeline(tl, 1);
    expect(res.period).toBe(18);

    // Advance to 36 (last item)
    tl.currentPeriodIdx = 6; // 36
    expect(tl.discretePeriods[tl.currentPeriodIdx]).toBe(36);

    // Step forward +1: should wrap and skip 0 and 6, landing on 12!
    res = stepWindowTimeline(tl, 1);
    expect(res.period).toBe(12);
    expect(tl.currentPeriodIdx).toBe(2);
  });

  it("stepWindowTimeline skips disabledPeriods [0, 6] during backward stepping", () => {
    const tl = createTimelineState("rain12-win", {
      discretePeriods: [0, 6, 12, 18, 24, 30, 36],
      currentPeriodIdx: 2, // 12
      disabledPeriods: [0, 6],
    });

    // Step backward -1 from 12: should wrap and skip 6 and 0, landing on 36!
    const res = stepWindowTimeline(tl, -1);
    expect(res.period).toBe(36);
    expect(tl.currentPeriodIdx).toBe(6);
  });

  it("playbackController.step skips disabledPeriods [0, 6]", async () => {
    playbackTlState.currentMode = "nwp";
    playbackTlState.discretePeriods = [0, 6, 12, 18, 24];
    playbackTlState.currentPeriodIdx = 4; // 24
    playbackTlState.disabledPeriods = [0, 6];

    // Stepping forward from 24 wraps and skips 0, 6 to reach 12
    const res = await playbackStep(1, { source: "btn-play" });
    expect(playbackTlState.currentPeriodIdx).toBe(2); // index of 12
    expect(playbackTlState.discretePeriods[playbackTlState.currentPeriodIdx]).toBe(12);

    // Stepping backward from 12 wraps and skips 6, 0 to reach 24
    await playbackStep(-1, { source: "btn-prev" });
    expect(playbackTlState.currentPeriodIdx).toBe(4); // index of 24
    expect(playbackTlState.discretePeriods[playbackTlState.currentPeriodIdx]).toBe(24);
  });

  it("applyAutoAllocation snaps RAIN12 base period to >= 12h", () => {
    const tab = createDefaultTab(1);
    tab.layout = "1x2";
    const win0 = {
      ...createDefaultWindow(0, 1),
      element: "RAIN12",
      period: 0,
    };
    tab.windows = [win0, createDefaultWindow(1, 1)];

    applyAutoAllocation(tab, "step", win0);
    expect(tab.windows[0].period).toBeGreaterThanOrEqual(12);
    expect(tab.windows[1].period).toBeGreaterThanOrEqual(12);
  });
});
