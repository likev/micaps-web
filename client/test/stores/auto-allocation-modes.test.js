import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import {
  createDefaultTab,
  createDefaultWindow,
  applyAutoAllocation,
  revertAutoAllocation,
  prepareSplitWindows,
  isWindowEmpty,
  DEFAULT_LEVELS,
  DEFAULT_MODELS,
  stepCycleHours,
  getVisibleWindows,
  isModelLayerSupported,
  getEligibleModelsForAllocation,
  preloadModelLevels,
  modelLevelsRuntimeCache,
  setModelLevelsCache,
  queryModelSupportedLevels,
  getEligibleModelsForAllocationAsync,
  shouldSkipWindowReload,
} from "../../src/lib/stores/tabsCore.js";
import { getPeriodsForStep } from "../../src/ui/timeline/timelineMath.js";
import {
  isSurfaceGroup,
  isUpperAirGroup,
  isSurfaceWindow,
  isUpperAirWindow,
} from "../../src/lib/services/appWorkflow.js";
import { computeFullWindowTitle } from "../../src/ui/tabs/windowTitles.js";

describe("Auto-Allocation 5-Mode System & Synchronization", () => {
  let originalFetch;

  beforeAll(async () => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/catalog/levels")) {
        const u = new URL(urlStr, "http://localhost");
        const path = u.searchParams.get("path") || "";
        if (path.includes("SHANGHAI_MR") || path.includes("GRAPES_3KM")) {
          return new Response(JSON.stringify([1000, 925, 850]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify([1000, 925, 850, 700, 500, 400, 300, 250, 200, 100]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      if (typeof originalFetch === "function") {
        return originalFetch(url);
      }
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    };
    await preloadModelLevels();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });
  it("defaults to 'none' on new tabs and does not auto-allocate levels when none", () => {
    const tab = createDefaultTab(1);
    expect(tab.autoAllocation).toBe("none");

    // In 'none' mode, window should not receive DEFAULT_LEVELS[posIdx]
    const posIdx = 2; // in DEFAULT_LEVELS, idx 2 is 1000
    const activeLevel = 850;
    const computedLevel = (tab.autoAllocation && tab.autoAllocation !== "none")
      ? (DEFAULT_LEVELS[posIdx] ?? 500)
      : (activeLevel ?? 500);
    expect(computedLevel).toBe(850);
  });

  it("calculates cycle stepped hours correctly across day and month boundaries", () => {
    expect(stepCycleHours("26092608", -12)).toBe("26092520");
    expect(stepCycleHours("26092608", -24)).toBe("26092508");
    expect(stepCycleHours("26092608", -36)).toBe("26092420");
    expect(stepCycleHours("26092608.024", -12)).toBe("26092520");
    // 10-digit and 14-digit timestamps
    expect(stepCycleHours("2026092608", -12)).toBe("2026092520");
    expect(stepCycleHours("20260918080000", -12)).toBe("20260917200000");
    expect(stepCycleHours("20260918080000.000", -12)).toBe("20260917200000");
    // Forward stepping
    expect(stepCycleHours("26092520", 12)).toBe("26092608");
  });

  it("Mode 'level': assigns standard vertical levels across split windows", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x3";
    tab.windows = Array.from({ length: 6 }, (_, i) => ({
      ...createDefaultWindow(i, 1),
      level: 500,
      model: "ECMWF_HR",
      period: 24,
    }));

    applyAutoAllocation(tab, "level");
    expect(tab.autoAllocation).toBe("level");
    expect(tab.windows.map((w) => w.level)).toEqual([500, 850, 1000, 200, 700, 925]);
    // Keeps model and period identical
    expect(tab.windows.every((w) => w.model === "ECMWF_HR")).toBe(true);
    expect(tab.windows.every((w) => w.period === 24)).toBe(true);
  });

  it("Mode 'model': assigns distinct NWP models across split windows with same level and time", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x3";
    tab.windows = Array.from({ length: 6 }, (_, i) => ({
      ...createDefaultWindow(i, 1),
      level: 850,
      model: "ECMWF_HR",
      period: 24,
    }));

    applyAutoAllocation(tab, "model");
    expect(tab.autoAllocation).toBe("model");
    expect(tab.windows.map((w) => w.model)).toEqual([
      "ECMWF_HR",
      "GRAPES_GFS",
      "BEIJING_MR",
      "GRAPES_3KM",
      "JAPAN_MR",
      "SHANGHAI_MR",
    ]);
    // Keeps level and period uniform across models
    expect(tab.windows.every((w) => w.level === 850)).toBe(true);
    expect(tab.windows.every((w) => w.period === 24)).toBe(true);
  });

  it("Mode 'step': assigns consecutive forecast lead steps across split windows", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x2";
    tab.windows = Array.from({ length: 4 }, (_, i) => ({
      ...createDefaultWindow(i, 1),
      level: 500,
      model: "ECMWF_HR",
      forecastCycle: "26092508",
      period: 24,
      stepLength: 12,
    }));

    applyAutoAllocation(tab, "step", { period: 48, stepLength: 12, forecastCycle: "26092508" });
    expect(tab.autoAllocation).toBe("step");
    expect(tab.windows.map((w) => w.period)).toEqual([48, 60, 72, 84]);
    // Keeps cycle and model uniform
    expect(tab.windows.every((w) => w.forecastCycle === "26092508")).toBe(true);
  });

  it("Mode 'step': is aware of timeline stepLength and discretePeriods (6h step)", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x2";
    tab.windows = Array.from({ length: 4 }, (_, i) => ({
      ...createDefaultWindow(i, 1),
      level: 500,
      model: "ECMWF_HR",
      forecastCycle: "26092508",
      period: 24,
    }));

    const discretePeriods = [0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60];
    applyAutoAllocation(tab, "step", {
      period: 24,
      stepLength: 6,
      discretePeriods,
      forecastCycle: "26092508",
    });

    expect(tab.windows.map((w) => w.period)).toEqual([24, 30, 36, 42]);
    expect(tab.windows.every((w) => w.stepLength === 6)).toBe(true);
  });

  it("Mode 'step': is aware of timeline stepLength and discretePeriods (3h step)", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x3";
    tab.windows = Array.from({ length: 6 }, (_, i) => ({
      ...createDefaultWindow(i, 1),
      level: 500,
      model: "ECMWF_HR",
      period: 12,
    }));

    applyAutoAllocation(tab, "step", {
      period: 12,
      stepLength: 3,
      forecastCycle: "26092508",
    });

    // Should use getPeriodsForStep(3): 12, 15, 18, 21, 24, 27
    expect(tab.windows.map((w) => w.period)).toEqual([12, 15, 18, 21, 24, 27]);
    expect(tab.windows.every((w) => w.stepLength === 3)).toBe(true);
  });

  it("Mode 'step': changing step-length from 6h to 12h discards stale 6h discretePeriods and applies 12h progression", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x2";
    const stale6hPeriods = [0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60];
    tab.windows = Array.from({ length: 4 }, (_, i) => ({
      ...createDefaultWindow(i, 1),
      level: 500,
      model: "ECMWF_HR",
      forecastCycle: "26092508",
      period: 24,
      stepLength: 6,
      discretePeriods: [...stale6hPeriods],
    }));

    // User changes step-length to 12h and toggles tab to split
    applyAutoAllocation(tab, "step", {
      period: 24,
      stepLength: 12,
      discretePeriods: stale6hPeriods, // stale periods provided from prior 6h state
      forecastCycle: "26092508",
    });

    // 12h step progression: 24, 36, 48, 60 (NOT 24, 30, 36, 42)
    expect(tab.windows.map((w) => w.period)).toEqual([24, 36, 48, 60]);
    expect(tab.windows.every((w) => w.stepLength === 12)).toBe(true);
    expect(tab.windows.every((w) => w.discretePeriods[1] - w.discretePeriods[0] === 12)).toBe(true);
  });

  it("Mode 'step': changing step-length from 12h to 3h discards stale 12h discretePeriods and applies 3h progression", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x2";
    const stale12hPeriods = [0, 12, 24, 36, 48, 60, 72];
    tab.windows = Array.from({ length: 4 }, (_, i) => ({
      ...createDefaultWindow(i, 1),
      level: 500,
      model: "ECMWF_HR",
      forecastCycle: "26092508",
      period: 12,
      stepLength: 12,
      discretePeriods: [...stale12hPeriods],
    }));

    applyAutoAllocation(tab, "step", {
      period: 12,
      stepLength: 3,
      discretePeriods: stale12hPeriods,
      forecastCycle: "26092508",
    });

    expect(tab.windows.map((w) => w.period)).toEqual([12, 15, 18, 21]);
    expect(tab.windows.every((w) => w.stepLength === 3)).toBe(true);
    expect(tab.windows.every((w) => w.discretePeriods[1] - w.discretePeriods[0] === 3)).toBe(true);
  });

  it("Mode 'step': non-visible windows receive matching stepLength and discretePeriods", () => {
    const tab = createDefaultTab(1);
    tab.layout = "1x2"; // only first 2 visible
    tab.windows = Array.from({ length: 4 }, (_, i) => ({
      ...createDefaultWindow(i, 1),
      level: 500,
      model: "ECMWF_HR",
      forecastCycle: "26092508",
      period: 24,
      stepLength: 6,
    }));

    applyAutoAllocation(tab, "step", {
      period: 24,
      stepLength: 12,
      forecastCycle: "26092508",
    });

    expect(tab.windows.every((w) => w.stepLength === 12)).toBe(true);
    expect(tab.windows[2].discretePeriods[1] - tab.windows[2].discretePeriods[0]).toBe(12);
    expect(tab.windows[3].discretePeriods[1] - tab.windows[3].discretePeriods[0]).toBe(12);
  });

  it("Mode 'step': reuses auto-allocated windows across repeated 1x1 <-> split toggles without window leakage", () => {
    const tab = createDefaultTab(1);
    const win0 = {
      ...createDefaultWindow(0, 1),
      id: "tab-1-win-0",
      level: 500,
      model: "ECMWF_HR",
      forecastCycle: "26092608",
      forecastCycles: ["26092608", "26092520"],
      period: 24,
      stepLength: 6,
      activeGroup: { id: "ecmwf-500", layers: [{ type: "contour", element: "TMP" }] },
    };
    tab.windows = [win0];
    tab.activeWinIdx = 0;

    // 1. Initial 2x2 split
    tab.layout = "2x2";
    prepareSplitWindows(tab, 4, win0, isWindowEmpty, true);
    expect(tab.windows.length).toBe(4);
    applyAutoAllocation(tab, "step", win0);
    expect(tab.windows.map((w) => w.period)).toEqual([24, 30, 36, 42]);
    expect(tab.windows.every((w) => w.stepLength === 6)).toBe(true);

    // 2. User toggles to 1x1 tab mode and changes step length to 12h
    tab.layout = "1x1";
    win0.stepLength = 12;
    win0.discretePeriods = getPeriodsForStep(12);

    // 3. User toggles back to 2x2 split mode
    tab.layout = "2x2";
    prepareSplitWindows(tab, 4, win0, isWindowEmpty, true);
    // CRITICAL: Window count must stay 4, no new duplicate windows created
    expect(tab.windows.length).toBe(4);
    applyAutoAllocation(tab, "step", win0);
    expect(tab.windows.map((w) => w.period)).toEqual([24, 36, 48, 60]);
    expect(tab.windows.every((w) => w.stepLength === 12)).toBe(true);

    // 4. User toggles to 1x1 tab mode again and changes step length to 3h
    tab.layout = "1x1";
    win0.stepLength = 3;
    win0.discretePeriods = getPeriodsForStep(3);

    // 5. User toggles back to 2x2 split mode
    tab.layout = "2x2";
    prepareSplitWindows(tab, 4, win0, isWindowEmpty, true);
    expect(tab.windows.length).toBe(4);
    applyAutoAllocation(tab, "step", win0);
    expect(tab.windows.map((w) => w.period)).toEqual([24, 27, 30, 33]);
    expect(tab.windows.every((w) => w.stepLength === 3)).toBe(true);

    // 6. User expands to 6-split (2x3) with 24h step
    tab.layout = "2x3";
    win0.stepLength = 24;
    win0.discretePeriods = getPeriodsForStep(24);
    prepareSplitWindows(tab, 6, win0, isWindowEmpty, false, 4);
    expect(tab.windows.length).toBe(6);
    applyAutoAllocation(tab, "step", win0);
    expect(tab.windows.map((w) => w.period)).toEqual([24, 48, 72, 96, 120, 144]);
    expect(tab.windows.every((w) => w.stepLength === 24)).toBe(true);
  });

  it("Mode 'step': preserves foreign user windows with layers while reusing split windows", () => {
    const tab = createDefaultTab(1);
    const win0 = {
      ...createDefaultWindow(0, 1),
      id: "tab-1-win-0",
      level: 500,
      model: "ECMWF_HR",
      forecastCycle: "26092608",
      period: 24,
      stepLength: 6,
      activeGroup: { id: "ecmwf-500", layers: [{ type: "contour" }] },
    };
    const foreignWin = {
      ...createDefaultWindow(1, 1),
      id: "foreign-grapes",
      level: 850,
      model: "GRAPES_GFS",
      period: 12,
      activeGroup: { id: "grapes-850", layers: [{ type: "contour" }] },
      isAutoAllocated: false,
    };
    tab.windows = [win0, foreignWin];
    tab.activeWinIdx = 0;

    // Split 2x2 from tab mode: win0 + foreignWin
    tab.layout = "2x2";
    prepareSplitWindows(tab, 4, win0, isWindowEmpty, true);
    // 4 split slots + foreignWin preserved outside the split = 5 windows
    expect(tab.windows.length).toBe(5);
    expect(tab.windows[4].id).toBe("foreign-grapes");
    expect(tab.windows[4].activeGroup?.id).toBe("grapes-850");

    applyAutoAllocation(tab, "step", win0);
    expect(tab.windows.slice(0, 4).map((w) => w.period)).toEqual([24, 30, 36, 42]);
    // foreignWin untouched
    expect(tab.windows[4].period).toBe(12);

    // Toggle to 1x1, change step length to 12h, toggle back to 2x2
    tab.layout = "1x1";
    win0.stepLength = 12;
    win0.discretePeriods = getPeriodsForStep(12);

    tab.layout = "2x2";
    prepareSplitWindows(tab, 4, win0, isWindowEmpty, true);
    // Still 5 windows: split slots reused, foreignWin preserved
    expect(tab.windows.length).toBe(5);
    expect(tab.windows[4].id).toBe("foreign-grapes");

    applyAutoAllocation(tab, "step", win0);
    expect(tab.windows.slice(0, 4).map((w) => w.period)).toEqual([24, 36, 48, 60]);
    expect(tab.windows[4].period).toBe(12);
  });

  it("Mode 'step': propagates forecastCycles and _nwpTimeline to allocated windows", () => {
    const tab = createDefaultTab(1);
    tab.layout = "1x2";
    const win0 = {
      ...createDefaultWindow(0, 1),
      id: "tab-1-win-0",
      level: 500,
      model: "ECMWF_HR",
      forecastCycle: "26092608",
      forecastCycles: ["26092608", "26092520", "26092508"],
      period: 24,
      stepLength: 12,
      activeGroup: { id: "ecmwf-500", layers: [{ type: "contour" }] },
      _nwpTimeline: { stepLength: 12, cycle: "26092608" },
    };
    const win1 = createDefaultWindow(1, 1);
    tab.windows = [win0, win1];

    applyAutoAllocation(tab, "step", win0);
    expect(win1.forecastCycles).toEqual(["26092608", "26092520", "26092508"]);
    expect(win1._nwpTimeline?.stepLength).toBe(12);
    expect(win1._nwpTimeline?.cycle).toBe("26092608");
    expect(win1.isAutoAllocated).toBe(true);
    expect(win1.allocParentId).toBe("tab-1-win-0");
  });

  it("Mode 'time': assigns dProg/dt run-to-run consistency for NWP (same valid target time)", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x3";
    tab.windows = Array.from({ length: 6 }, (_, i) => ({
      ...createDefaultWindow(i, 1),
      level: 500,
      model: "ECMWF_HR",
      forecastCycle: "26092608",
      period: 24,
      isObservation: false,
    }));

    applyAutoAllocation(tab, "time", { forecastCycle: "26092608", period: 24, isObservation: false });
    expect(tab.autoAllocation).toBe("time");

    // Window 0: 26092608.024
    // Window 1: 26092520.036
    // Window 2: 26092508.048
    // Window 3: 26092420.060
    // Window 4: 26092408.072
    // Window 5: 26092320.084
    const formatted = tab.windows.map((w) => `${w.forecastCycle}.${String(w.period).padStart(3, "0")}`);
    expect(formatted).toEqual([
      "26092608.024",
      "26092520.036",
      "26092508.048",
      "26092420.060",
      "26092408.072",
      "26092320.084",
    ]);
  });

  it("Mode 'time': assigns reverse chronological observation times for Observation", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x3";
    tab.windows = Array.from({ length: 6 }, (_, i) => ({
      ...createDefaultWindow(i, 1),
      level: 500,
      model: "UPPER_AIR",
      obsTime: "26092608",
      isObservation: true,
    }));

    applyAutoAllocation(tab, "time", { obsTime: "26092608", isObservation: true });
    expect(tab.autoAllocation).toBe("time");
    expect(tab.windows.map((w) => w.obsTime)).toEqual([
      "26092608",
      "26092520",
      "26092508",
      "26092420",
      "26092408",
      "26092320",
    ]);
  });

  it("Mode 'none': unifies all windows back to active window settings", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x2";
    tab.windows = [
      { id: "w1", level: 500, model: "ECMWF_HR", period: 24 },
      { id: "w2", level: 850, model: "GRAPES_GFS", period: 36 },
      { id: "w3", level: 1000, model: "BEIJING_MR", period: 48 },
      { id: "w4", level: 200, model: "GRAPES_3KM", period: 60 },
    ];

    const activeWin = { level: 700, model: "ECMWF_HR", period: 48, forecastCycle: "26092608" };
    revertAutoAllocation(tab, activeWin);
    expect(tab.autoAllocation).toBe("none");
    expect(tab.windows.every((w) => w.level === 700)).toBe(true);
    expect(tab.windows.every((w) => w.model === "ECMWF_HR")).toBe(true);
    expect(tab.windows.every((w) => w.period === 48)).toBe(true);
  });

  it("Mode 'time': respects custom stepLength for 3h and 6h cadences", () => {
    const tab = createDefaultTab(1);
    tab.layout = "1x2";
    tab.windows = Array.from({ length: 2 }, (_, i) => ({
      ...createDefaultWindow(i, 1),
      level: 0,
      model: "ECMWF_HR",
      forecastCycle: "26092608",
      period: 6,
      stepLength: 3,
    }));

    applyAutoAllocation(tab, "time", { forecastCycle: "26092608", period: 6, stepLength: 3, level: 0 });
    expect(tab.windows[0].forecastCycle).toBe("26092608");
    expect(tab.windows[0].period).toBe(6);
    expect(tab.windows[1].forecastCycle).toBe("26092605");
    expect(tab.windows[1].period).toBe(9);
    // Level 0 is preserved
    expect(tab.windows.every((w) => w.level === 0)).toBe(true);
  });

  it("Mode 'step': discretePeriods is isolated (cloned) across windows", () => {
    const tab = createDefaultTab(1);
    tab.layout = "1x2";
    tab.windows = Array.from({ length: 2 }, (_, i) => createDefaultWindow(i, 1));
    const periods = [0, 6, 12, 18, 24];
    applyAutoAllocation(tab, "step", { period: 0, stepLength: 6, discretePeriods: periods });

    expect(tab.windows[0].discretePeriods).not.toBe(tab.windows[1].discretePeriods);
    expect(tab.windows[0].discretePeriods).toEqual(tab.windows[1].discretePeriods);
  });

  it("propagates activeGroup and metadata across all split-2, split-4, and split-6 windows", () => {
    for (const layout of ["1x2", "2x2", "2x3"]) {
      const tab = createDefaultTab(1);
      tab.layout = layout;
      const count = layout === "1x2" ? 2 : (layout === "2x2" ? 4 : 6);
      tab.windows = Array.from({ length: count }, (_, i) => createDefaultWindow(i, 1));
      const testGroup = {
        id: "composite-500hpa",
        name: "500 hPa Height & Wind",
        hasLevel: true,
        layers: [
          { type: "contour", element: "HGT", model: "ECMWF_HR" },
          { type: "wind", element: "WIND", model: "ECMWF_HR" },
        ],
      };
      tab.windows[0].activeGroup = testGroup;
      tab.windows[0].element = "HGT";
      tab.windows[0].level = 500;

      applyAutoAllocation(tab, "level", tab.windows[0]);

      for (let i = 0; i < count; i++) {
        expect(tab.windows[i].activeGroup).toBeDefined();
        expect(tab.windows[i].activeGroup?.id).toBe("composite-500hpa");
        expect(tab.windows[i].element).toBe("HGT");
        expect(tab.windows[i].level).toBe(DEFAULT_LEVELS[i]);
      }
    }
  });

  it("identifies profile panel presets and windows that require auto-allocation to be disabled", async () => {
    const { isProfilePanelGroup, isProfilePanelWindow } = await import("../../src/lib/services/appWorkflow.js");

    const tlogpGroup = { id: "sounding-tlogp", name: "T-LogP", layers: [{ type: "tlogp" }] };
    const timeheightGroup = { id: "composite-ec-timeheight", name: "Time Height", layers: [{ type: "timeheight" }] };
    const lineheightGroup = { id: "cross-section-lineheight", name: "Line Height", layers: [{ type: "lineheight" }] };
    const hovmollerGroup = { id: "composite-ec-hovmoller", name: "Hovmoller", layers: [{ type: "hovmoller" }] };
    const normalGroup = { id: "composite-500", name: "500hPa", layers: [{ type: "contour", element: "HGT" }] };

    expect(isProfilePanelGroup(tlogpGroup)).toBe(true);
    expect(isProfilePanelGroup(timeheightGroup)).toBe(true);
    expect(isProfilePanelGroup(lineheightGroup)).toBe(true);
    expect(isProfilePanelGroup(hovmollerGroup)).toBe(true);
    expect(isProfilePanelGroup(normalGroup)).toBe(false);

    const winTlogp = { ...createDefaultWindow(0, 1), activeGroup: tlogpGroup };
    const winTimeheight = { ...createDefaultWindow(0, 1), activeGroup: timeheightGroup };
    const winNormal = { ...createDefaultWindow(0, 1), activeGroup: normalGroup };

    expect(isProfilePanelWindow(winTlogp)).toBe(true);
    expect(isProfilePanelWindow(winTimeheight)).toBe(true);
    expect(isProfilePanelWindow(winNormal)).toBe(false);
  });

  it("allocates new split windows related to focused tab-win in level, model, step, and time modes", () => {
    // In tab mode (1x1), user focuses win0 with ECMWF 500hPa Height
    const tab = createDefaultTab(1);
    const focusedWin = {
      ...createDefaultWindow(0, 1),
      level: 500,
      model: "ECMWF_HR",
      element: "HGT",
      period: 24,
      forecastCycle: "26092608",
      activeGroup: { id: "composite-500", name: "500hPa HGT", hasLevel: true, layers: [{ type: "contour", element: "HGT", model: "ECMWF_HR" }] },
    };
    tab.windows = [focusedWin];
    tab.activeWinIdx = 0;

    // Split to 2x2 (4 windows) with alloc 'level'
    tab.layout = "2x2";
    while (tab.windows.length < 4) {
      tab.windows.push(createDefaultWindow(tab.windows.length, 1));
    }
    applyAutoAllocation(tab, "level", focusedWin);

    expect(tab.windows.length).toBe(4);
    expect(tab.windows[0].level).toBe(500);
    expect(tab.windows[1].level).toBe(850);
    expect(tab.windows[2].level).toBe(1000);
    expect(tab.windows[3].level).toBe(200);
    // All windows inherit focused window's activeGroup and model
    expect(tab.windows.every((w) => w.model === "ECMWF_HR")).toBe(true);
    expect(tab.windows.every((w) => w.element === "HGT")).toBe(true);
    expect(tab.windows.every((w) => w.activeGroup?.id === "composite-500")).toBe(true);
  });

  it("Bug 1 fix: upper_air tab to split-6 in alloc time mode gets 6 distinct observation times", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x3";
    tab.windows = Array.from({ length: 6 }, (_, i) => ({
      ...createDefaultWindow(i, 1),
      level: 500,
      model: "UPPER_AIR",
      element: "PLOT",
      isObservation: true,
      obsTime: "20260926080000.000",
      activeGroup: { id: "composite-upperair-500", name: "500 hPa Sounding", isObservation: true },
    }));

    applyAutoAllocation(tab, "time", tab.windows[0]);

    const times = tab.windows.map((w) => w.obsTime);
    expect(times).toEqual([
      "20260926080000.000",
      "20260925200000.000",
      "20260925080000.000",
      "20260924200000.000",
      "20260924080000.000",
      "20260923200000.000",
    ]);
    expect(new Set(times).size).toBe(6);
    expect(times.every((t) => t.endsWith(".000"))).toBe(true);
  });

  it("Bug 2 fix: alloc time for ECMWF_HR advances by 12h run cadence even when stepLength is 6", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x3";
    tab.windows = Array.from({ length: 6 }, (_, i) => ({
      ...createDefaultWindow(i, 1),
      level: 500,
      model: "ECMWF_HR",
      forecastCycle: "26092608",
      period: 24,
      stepLength: 6,
      isObservation: false,
    }));

    applyAutoAllocation(tab, "time", tab.windows[0]);

    // ECMWF_HR must step cycles by 12h (08/20), never invalid 6h intervals (02/14)
    const cycles = tab.windows.map((w) => w.forecastCycle);
    expect(cycles).toEqual([
      "26092608",
      "26092520",
      "26092508",
      "26092420",
      "26092408",
      "26092320",
    ]);
    // Target valid time remains identical (2026-09-27 08:00)
    const periods = tab.windows.map((w) => w.period);
    expect(periods).toEqual([24, 36, 48, 60, 72, 84]);
  });

  it("Bug 3 fix: split-6 in step mode has consistent stepLength and period progression", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x3";
    tab.windows = Array.from({ length: 6 }, (_, i) => ({
      ...createDefaultWindow(i, 1),
      level: 500,
      model: "ECMWF_HR",
      forecastCycle: "26092608",
      period: 24,
      stepLength: 6,
      isObservation: false,
    }));

    applyAutoAllocation(tab, "step", tab.windows[0]);

    expect(tab.windows.every((w) => w.stepLength === 6)).toBe(true);
    expect(tab.windows.map((w) => w.period)).toEqual([24, 30, 36, 42, 48, 54]);
  });

  it("Bug 4 fix: model name is added to win-title in alloc model mode", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x3";
    tab.autoAllocation = "model";
    tab.windows = Array.from({ length: 6 }, (_, i) => ({
      ...createDefaultWindow(i, 1),
      level: 500,
      model: DEFAULT_MODELS[i % DEFAULT_MODELS.length],
      period: 24,
      forecastCycle: "26092608",
      isObservation: false,
      activeGroup: { id: "composite-500", name: "500hPa Composite" },
      autoAllocation: "model",
    }));

    const title0 = computeFullWindowTitle(tab.windows[0]);
    const title1 = computeFullWindowTitle(tab.windows[1]);

    expect(title0).toContain("ECMWF_HR");
    expect(title1).toContain("GRAPES_GFS");
    expect(title0).toContain("500hPa Composite");
    expect(title1).toContain("500hPa Composite");
  });

  describe("Model Layer Support & Upper-Level Layer Absence", () => {
    beforeEach(async () => {
      await preloadModelLevels();
    });

    it("isModelLayerSupported: queries server at runtime and returns false for SHANGHAI_MR and GRAPES_3KM at <= 700 hPa", async () => {
      // 1. Clear cache to test runtime server query path
      modelLevelsRuntimeCache.clear();
      for (const elem of ["RH", "HGT", "WIND"]) {
        expect(await isModelLayerSupported("SHANGHAI_MR", elem, 500)).toBe(false);
        expect(await isModelLayerSupported("SHANGHAI_MR", elem, 700)).toBe(false);
        expect(await isModelLayerSupported("SHANGHAI_MR", elem, 200)).toBe(false);

        expect(await isModelLayerSupported("GRAPES_3KM", elem, 500)).toBe(false);
        expect(await isModelLayerSupported("GRAPES_3KM", elem, 700)).toBe(false);
        expect(await isModelLayerSupported("GRAPES_3KM", elem, 200)).toBe(false);

        // Lower levels (850, 925, 1000) are supported
        expect(await isModelLayerSupported("SHANGHAI_MR", elem, 850)).toBe(true);
        expect(await isModelLayerSupported("GRAPES_3KM", elem, 850)).toBe(true);
        expect(await isModelLayerSupported("SHANGHAI_MR", elem, 1000)).toBe(true);
        expect(await isModelLayerSupported("GRAPES_3KM", elem, 1000)).toBe(true);

        // Global/synoptic models support all levels
        expect(await isModelLayerSupported("ECMWF_HR", elem, 500)).toBe(true);
        expect(await isModelLayerSupported("GRAPES_GFS", elem, 500)).toBe(true);
        expect(await isModelLayerSupported("BEIJING_MR", elem, 500)).toBe(true);
        expect(await isModelLayerSupported("JAPAN_MR", elem, 700)).toBe(true);
        expect(await isModelLayerSupported("NCEP_GFS", elem, 500)).toBe(true);
      }

      // 2. Synchronous cached checks work once runtime query has completed
      expect(isModelLayerSupported("SHANGHAI_MR", "RH", 500)).toBe(false);
      expect(isModelLayerSupported("SHANGHAI_MR", "RH", 850)).toBe(true);
      expect(isModelLayerSupported("GRAPES_3KM", "HGT", 700)).toBe(false);
      expect(isModelLayerSupported("GRAPES_3KM", "HGT", 850)).toBe(true);
    });

    it("getEligibleModelsForAllocation: excludes SHANGHAI_MR and GRAPES_3KM when all layers do not exist at 500 or 700 hPa", () => {
      const composite500 = {
        id: "composite-500hpa",
        level: 500,
        layers: [
          { type: "contour", element: "RH" },
          { type: "contour", element: "HGT" },
          { type: "wind", element: "WIND" },
        ],
      };

      const eligible500 = getEligibleModelsForAllocation(composite500, 500);
      expect(eligible500).not.toContain("SHANGHAI_MR");
      expect(eligible500).not.toContain("GRAPES_3KM");
      expect(eligible500).toEqual([
        "ECMWF_HR",
        "GRAPES_GFS",
        "BEIJING_MR",
        "JAPAN_MR",
        "NCEP_GFS",
        "GERMAN_HR",
      ]);

      const eligible700 = getEligibleModelsForAllocation(composite500, 700);
      expect(eligible700).not.toContain("SHANGHAI_MR");
      expect(eligible700).not.toContain("GRAPES_3KM");

      // At 850 hPa, all models are eligible
      const composite850 = {
        id: "composite-850hpa",
        level: 850,
        layers: [
          { type: "contour", element: "HGT" },
          { type: "contour", element: "TMP" },
          { type: "wind", element: "WIND" },
        ],
      };
      const eligible850 = getEligibleModelsForAllocation(composite850, 850);
      expect(eligible850).toContain("SHANGHAI_MR");
      expect(eligible850).toContain("GRAPES_3KM");
      expect(eligible850).toEqual(DEFAULT_MODELS);
    });

    it("Mode 'model': does not allocate SHANGHAI_MR or GRAPES_3KM for 500hPa composite", () => {
      const tab = createDefaultTab(1);
      tab.layout = "2x3";
      const composite500 = {
        id: "composite-500hpa",
        name: "500hPa Composite",
        level: 500,
        layers: [
          { type: "contour", element: "RH", model: "ECMWF_HR" },
          { type: "contour", element: "HGT", model: "ECMWF_HR" },
          { type: "wind", element: "WIND", model: "ECMWF_HR" },
        ],
      };
      tab.windows = Array.from({ length: 6 }, (_, i) => ({
        ...createDefaultWindow(i, 1),
        level: 500,
        model: "ECMWF_HR",
        period: 24,
        activeGroup: composite500,
      }));

      applyAutoAllocation(tab, "model", tab.windows[0]);

      const allocatedModels = tab.windows.map((w) => w.model);
      expect(allocatedModels).not.toContain("SHANGHAI_MR");
      expect(allocatedModels).not.toContain("GRAPES_3KM");
      expect(allocatedModels).toEqual([
        "ECMWF_HR",
        "GRAPES_GFS",
        "BEIJING_MR",
        "JAPAN_MR",
        "NCEP_GFS",
        "GERMAN_HR",
      ]);
    });

    it("Mode 'model': allocates SHANGHAI_MR and GRAPES_3KM for 850hPa composite", () => {
      const tab = createDefaultTab(1);
      tab.layout = "2x3";
      const composite850 = {
        id: "composite-850hpa",
        name: "850hPa Composite",
        level: 850,
        layers: [
          { type: "contour", element: "HGT", model: "ECMWF_HR" },
          { type: "contour", element: "TMP", model: "ECMWF_HR" },
          { type: "wind", element: "WIND", model: "ECMWF_HR" },
        ],
      };
      tab.windows = Array.from({ length: 6 }, (_, i) => ({
        ...createDefaultWindow(i, 1),
        level: 850,
        model: "ECMWF_HR",
        period: 24,
        activeGroup: composite850,
      }));

      applyAutoAllocation(tab, "model", tab.windows[0]);

      const allocatedModels = tab.windows.map((w) => w.model);
      expect(allocatedModels).toContain("SHANGHAI_MR");
      expect(allocatedModels).toContain("GRAPES_3KM");
      expect(allocatedModels).toEqual([
        "ECMWF_HR",
        "GRAPES_GFS",
        "BEIJING_MR",
        "GRAPES_3KM",
        "JAPAN_MR",
        "SHANGHAI_MR",
      ]);
    });

    it("dynamically honors whatever levels the server returns without any hardcoded model assumptions", async () => {
      // Suppose an arbitrary or newly added model "REGIONAL_TEST" only returns [925, 850] from server
      setModelLevelsCache("REGIONAL_TEST", "TMP", [925, 850]);
      expect(isModelLayerSupported("REGIONAL_TEST", "TMP", 500)).toBe(false);
      expect(isModelLayerSupported("REGIONAL_TEST", "TMP", 700)).toBe(false);
      expect(isModelLayerSupported("REGIONAL_TEST", "TMP", 850)).toBe(true);
      expect(isModelLayerSupported("REGIONAL_TEST", "TMP", 925)).toBe(true);

      const comp = {
        layers: [{ element: "TMP" }],
      };
      const eligible500 = getEligibleModelsForAllocation(comp, 500, ["ECMWF_HR", "REGIONAL_TEST"]);
      expect(eligible500).toEqual(["ECMWF_HR"]);

      const eligible850 = getEligibleModelsForAllocation(comp, 850, ["ECMWF_HR", "REGIONAL_TEST"]);
      expect(eligible850).toEqual(["ECMWF_HR", "REGIONAL_TEST"]);

      // Test async resolver as well
      const asyncEligible500 = await getEligibleModelsForAllocationAsync(comp, 500, ["ECMWF_HR", "REGIONAL_TEST"]);
      expect(asyncEligible500).toEqual(["ECMWF_HR"]);
    });
  });

  describe("Surface & Upper-Air Auto-Allocation Restrictions", () => {
    it("detects surface and upper-air groups and windows accurately", () => {
      const surfaceGroup = { id: "composite-surface", category: "Surface Observations", layers: [{ model: "SURFACE" }] };
      const upperAirGroup = { id: "composite-upperair-500", category: "Upper-Air Observations", layers: [{ model: "UPPER_AIR" }] };
      const nwpGroup = { id: "composite-500hpa", category: "NWP Synoptic", layers: [{ model: "ECMWF_HR" }] };

      expect(isSurfaceGroup(surfaceGroup)).toBe(true);
      expect(isSurfaceGroup(upperAirGroup)).toBe(false);
      expect(isSurfaceGroup(nwpGroup)).toBe(false);

      expect(isUpperAirGroup(upperAirGroup)).toBe(true);
      expect(isUpperAirGroup(surfaceGroup)).toBe(false);
      expect(isUpperAirGroup(nwpGroup)).toBe(false);

      const winSurface = { id: "w-surf", model: "SURFACE", activeGroup: surfaceGroup };
      const winUpperAir = { id: "w-up", model: "UPPER_AIR", level: 500, activeGroup: upperAirGroup };
      const winNwp = { id: "w-nwp", model: "ECMWF_HR", level: 500, activeGroup: nwpGroup };

      expect(isSurfaceWindow(winSurface)).toBe(true);
      expect(isSurfaceWindow(winUpperAir)).toBe(false);
      expect(isSurfaceWindow(winNwp)).toBe(false);

      expect(isUpperAirWindow(winUpperAir)).toBe(true);
      expect(isUpperAirWindow(winSurface)).toBe(false);
      expect(isUpperAirWindow(winNwp)).toBe(false);
    });

    it("surface restricts step/level/model; upper_air restricts step/model", () => {
      const isAllocAllowed = (isSurf, isUp, mode) => {
        if (mode === "none") return true;
        if (isSurf && (mode === "step" || mode === "level" || mode === "model")) return false;
        if (isUp && (mode === "step" || mode === "model")) return false;
        return true;
      };

      // Surface
      expect(isAllocAllowed(true, false, "none")).toBe(true);
      expect(isAllocAllowed(true, false, "time")).toBe(true);
      expect(isAllocAllowed(true, false, "step")).toBe(false);
      expect(isAllocAllowed(true, false, "level")).toBe(false);
      expect(isAllocAllowed(true, false, "model")).toBe(false);

      // Upper-air
      expect(isAllocAllowed(false, true, "none")).toBe(true);
      expect(isAllocAllowed(false, true, "time")).toBe(true);
      expect(isAllocAllowed(false, true, "level")).toBe(true);
      expect(isAllocAllowed(false, true, "step")).toBe(false);
      expect(isAllocAllowed(false, true, "model")).toBe(false);

      // NWP
      expect(isAllocAllowed(false, false, "none")).toBe(true);
      expect(isAllocAllowed(false, false, "time")).toBe(true);
      expect(isAllocAllowed(false, false, "level")).toBe(true);
      expect(isAllocAllowed(false, false, "step")).toBe(true);
      expect(isAllocAllowed(false, false, "model")).toBe(true);
    });
  });
});


describe("shouldSkipWindowReload fan-out guard", () => {
  const baseGroup = { id: "composite-upperair-500", layers: [] };
  function baseWin(over = {}) {
    return {
      id: "tab-1-win-0", winIdx: 0, level: 500, period: 24, model: "UPPER_AIR",
      element: "PLOT", isObservation: true, obsTime: "20260320200000.000",
      forecastCycle: "20260320", activeGroup: baseGroup, ...over,
    };
  }
  function prevOf(win) {
    return {
      level: win.level, model: win.model, period: win.period,
      forecastCycle: win.forecastCycle, obsTime: win.obsTime, groupId: win.activeGroup?.id,
    };
  }

  it("skips the unchanged base window per allocation mode", () => {
    const win = baseWin();
    const prev = prevOf(win);
    expect(shouldSkipWindowReload(win, win, prev, "level")).toBe(true);
    expect(shouldSkipWindowReload(win, win, prev, "step")).toBe(true);
    expect(shouldSkipWindowReload(win, win, prev, "time")).toBe(true);
    const nwpWin = baseWin({ model: "ECMWF_HR", element: "TMP", isObservation: false, forecastCycle: "20260320" });
    expect(shouldSkipWindowReload(nwpWin, nwpWin, prevOf(nwpWin), "model")).toBe(true);
  });

  it("reloads on any material change, other windows, or missing baseline", () => {
    const win = baseWin();
    const prev = prevOf(win);
    expect(shouldSkipWindowReload({ ...win, level: 850 }, win, prev, "level")).toBe(false);
    expect(shouldSkipWindowReload({ ...win, period: 30 }, win, prev, "step")).toBe(false);
    expect(shouldSkipWindowReload({ ...win, obsTime: "20260320080000.000" }, win, prev, "time")).toBe(false);
    expect(shouldSkipWindowReload({ ...win, activeGroup: { id: "other" } }, win, prev, "level")).toBe(false);
    const other = baseWin({ id: "tab-1-win-1", winIdx: 1 });
    expect(shouldSkipWindowReload(other, win, prev, "level")).toBe(false);
    expect(shouldSkipWindowReload(win, win, null, "level")).toBe(false);
    expect(shouldSkipWindowReload(win, win, prev, "none")).toBe(false);
  });
});
