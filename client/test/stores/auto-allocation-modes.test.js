import { describe, it, expect } from "bun:test";
import {
  createDefaultTab,
  createDefaultWindow,
  applyAutoAllocation,
  revertAutoAllocation,
  DEFAULT_LEVELS,
  DEFAULT_MODELS,
  stepCycleHours,
  getVisibleWindows,
} from "../../src/lib/stores/tabsCore.js";
import { computeFullWindowTitle } from "../../src/ui/tabs/windowTitles.js";

describe("Auto-Allocation 5-Mode System & Synchronization", () => {
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
});

