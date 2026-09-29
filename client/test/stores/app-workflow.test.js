import { describe, it, expect, beforeEach } from "bun:test";
import { uiState } from "../../src/lib/stores/uiCore.js";
import {
  shouldHideTimelineForGroup,
  applyPresetToWindow,
  stepWindowTimeline,
} from "../../src/lib/services/appWorkflow.js";
import {
  createTimelineState,
  setTimeChangeCallback,
  fireTimeChange,
} from "../../src/lib/stores/timelineCore.js";
import {
  createDefaultWindow,
  applyAutoAllocation,
  prepareSplitWindows,
  isWindowEmpty,
} from "../../src/lib/stores/tabsCore.js";

describe("App Workflow & Preset Orchestration Integration (Phase 3 Gate)", () => {
  beforeEach(() => {
    uiState.timelineVisible = true;
  });

  describe("Timeline Visibility Policy by Preset Type", () => {
    it("identifies specialized 2D profile panels that require hiding the timeline", () => {
      const thGroup = { id: "composite-ec-timeheight", name: "Time Height" };
      const hovGroup = { id: "composite-ec-hovmoller", name: "Hovmoller" };
      const embeddedTh = { id: "custom-group", layers: [{ type: "timeheight", id: "th-1" }] };
      const nwpGroup = { id: "composite-500hpa", name: "500hPa Composite", layers: [{ type: "contour" }] };
      const obsGroup = { id: "surface-obs", name: "Surface Obs", isObservation: true };

      expect(shouldHideTimelineForGroup(thGroup)).toBe(true);
      expect(shouldHideTimelineForGroup(hovGroup)).toBe(true);
      expect(shouldHideTimelineForGroup(embeddedTh)).toBe(true);
      expect(shouldHideTimelineForGroup(nwpGroup)).toBe(false);
      expect(shouldHideTimelineForGroup(obsGroup)).toBe(false);
      expect(shouldHideTimelineForGroup(null)).toBe(false);
    });

    it("drives applyPresetToWindow with time-height preset and verifies ui.timelineVisible transitions to false", () => {
      const win = createDefaultWindow(0, 1);
      const timelines = new Map();
      const thGroup = {
        id: "composite-ec-timeheight",
        name: "ECMWF Time-Height Profile",
        layers: [{ type: "timeheight" }],
      };

      expect(uiState.timelineVisible).toBe(true);
      applyPresetToWindow(win, thGroup, null, timelines);

      expect(win.activeGroup.id).toBe("composite-ec-timeheight");
      expect(win.title).toBe("ECMWF Time-Height Profile");
      expect(win.baseTitle).toBe("ECMWF Time-Height Profile");
      expect(uiState.timelineVisible).toBe(false);
    });

    it("drives applyPresetToWindow with NWP synoptic preset and verifies ui.timelineVisible transitions to true", () => {
      const win = createDefaultWindow(0, 1);
      const timelines = new Map();
      uiState.timelineVisible = false; // Start hidden

      const nwpGroup = {
        id: "composite-500hpa",
        name: "500 hPa Height & Temp",
        defaultLevel: 500,
        layers: [{ type: "contour", element: "HGT" }],
      };

      applyPresetToWindow(win, nwpGroup, 850, timelines);

      expect(win.activeGroup.id).toBe("composite-500hpa");
      expect(win.level).toBe(850);
      expect(uiState.timelineVisible).toBe(true);
      const tl = timelines.get(win.id);
      expect(tl).toBeTruthy();
      expect(tl.currentMode).toBe("nwp");
    });

    it("drives applyPresetToWindow with Observation preset and sets timeline mode to obs", () => {
      const win = createDefaultWindow(1, 1);
      const timelines = new Map();
      const obsGroup = {
        id: "surface-plot",
        name: "Surface Station Plot",
        isObservation: true,
        layers: [{ type: "station" }],
      };

      applyPresetToWindow(win, obsGroup, null, timelines);

      expect(win.isObservation).toBe(true);
      expect(uiState.timelineVisible).toBe(true);
      const tl = timelines.get(win.id);
      expect(tl.currentMode).toBe("obs");
    });
  });

  describe("Concurrent Multi-Window Stepping & State Isolation", () => {
    it("steps two distinct windows concurrently with independent periods and monotonic sequence guards", () => {
      const win1Id = "tab-1-win-0";
      const win2Id = "tab-1-win-1";

      const tl1 = createTimelineState(win1Id, { currentPeriodIdx: 4 }); // 24h
      const tl2 = createTimelineState(win2Id, { currentPeriodIdx: 6 }); // 36h

      // Step Window 1 forward (+1 step = +6h => 30h)
      const res1a = stepWindowTimeline(tl1, 1);
      expect(res1a.period).toBe(30);
      expect(res1a._seq).toBe(1);
      expect(tl1.currentPeriodIdx).toBe(5);

      // Window 2 must remain completely unaffected
      expect(tl2.currentPeriodIdx).toBe(6);
      expect(tl2.periodStepSeq).toBe(0);

      // Step Window 2 backward (-1 step = -6h => 30h)
      const res2a = stepWindowTimeline(tl2, -1);
      expect(res2a.period).toBe(30);
      expect(res2a._seq).toBe(1);
      expect(tl2.currentPeriodIdx).toBe(5);

      // Step Window 1 again forward (+1 step => 36h)
      const res1b = stepWindowTimeline(tl1, 1);
      expect(res1b.period).toBe(36);
      expect(res1b._seq).toBe(2);

      // Verify final isolated states
      expect(tl1.discretePeriods[tl1.currentPeriodIdx]).toBe(36);
      expect(tl2.discretePeriods[tl2.currentPeriodIdx]).toBe(30);
    });

    it("verifies per-window timeline callback dispatch isolates cross-window events", () => {
      const win1Events = [];
      const win2Events = [];

      setTimeChangeCallback((payload) => {
        win1Events.push(payload);
      }, "win-alpha");

      setTimeChangeCallback((payload) => {
        win2Events.push(payload);
      }, "win-beta");

      fireTimeChange({ period: 24, _seq: 1 }, "win-alpha");
      expect(win1Events.length).toBe(1);
      expect(win2Events.length).toBe(0);

      fireTimeChange({ period: 48, _seq: 1 }, "win-beta");
      expect(win1Events.length).toBe(1);
      expect(win2Events.length).toBe(1);
      expect(win1Events[0].period).toBe(24);
      expect(win2Events[0].period).toBe(48);
    });
  });

  describe("Preset Loading & Multi-Window Orchestration", () => {
    it("verifies multi-window preset switching isolates active window and timeline visibility", () => {
      const win1 = createDefaultWindow(0, 1);
      const win2 = createDefaultWindow(1, 1);
      const timelines = new Map();

      // Win1: Time-Height profile -> should hide timeline
      const thGroup = {
        id: "composite-ec-timeheight",
        name: "Time-Height Profile",
        layers: [{ type: "timeheight" }],
      };
      applyPresetToWindow(win1, thGroup, null, timelines);
      expect(uiState.timelineVisible).toBe(false);

      // Win2: NWP 500hPa composite -> should show timeline
      const nwpGroup = {
        id: "composite-500hpa",
        name: "500 hPa Height & Temp",
        defaultLevel: 500,
        layers: [{ type: "contour" }],
      };
      applyPresetToWindow(win2, nwpGroup, 500, timelines);
      expect(uiState.timelineVisible).toBe(true);

      // Both windows have isolated timeline objects in timelines map
      const tl1 = timelines.get(win1.id);
      const tl2 = timelines.get(win2.id);
      expect(tl1).toBeDefined();
      expect(tl2).toBeDefined();
      expect(tl1.currentMode).not.toBe("obs");
      expect(tl2.currentMode).toBe("nwp");
    });
  });

  describe("Step-Length Select & Tab to Split Step Mode Workflow", () => {
    it("updates timeline discretePeriods when stepLength changes and allocates split windows with matching cadence", () => {
      // 1. Initial base window in tab mode with 6h step
      const win0 = createDefaultWindow(0, 1);
      win0.stepLength = 6;
      win0.period = 24;
      win0.discretePeriods = [0, 6, 12, 18, 24, 30, 36, 42, 48];

      const tl = createTimelineState(win0.id, {
        currentStepLength: 6,
        discretePeriods: [...win0.discretePeriods],
        currentPeriodIdx: 4, // 24h
      });

      // 2. User changes step-length to 12h in TimeSlider
      const newStep = 12;
      tl.currentStepLength = newStep;
      tl.discretePeriods = [0, 12, 24, 36, 48, 60, 72];
      tl.currentPeriodIdx = 2; // 24h
      win0.stepLength = newStep;
      win0.discretePeriods = [...tl.discretePeriods];

      // 3. User toggles to 2x2 split in step mode
      const tab = {
        id: 1,
        layout: "2x2",
        autoAllocation: "step",
        windows: [win0, createDefaultWindow(1, 1), createDefaultWindow(2, 1), createDefaultWindow(3, 1)],
      };

      // Base window sync logic from applyAutoAllocationModeToTab
      if (tl.currentStepLength) win0.stepLength = tl.currentStepLength;
      if (tl.discretePeriods) win0.discretePeriods = [...tl.discretePeriods];

      applyAutoAllocation(tab, "step", win0);

      // Verify each split window advances by 12h
      expect(tab.windows.map((w) => w.period)).toEqual([24, 36, 48, 60]);
      expect(tab.windows.every((w) => w.stepLength === 12)).toBe(true);
      expect(tab.windows.every((w) => w.discretePeriods[1] - w.discretePeriods[0] === 12)).toBe(true);
    });

    it("handles roundtrip tab <-> split step mode toggle with multiple step changes and no window leak", () => {
      const win0 = {
        ...createDefaultWindow(0, 1),
        id: "tab-1-win-0",
        level: 500,
        model: "ECMWF_HR",
        forecastCycle: "26092608",
        forecastCycles: ["26092608", "26092520"],
        period: 24,
        stepLength: 6,
        discretePeriods: [0, 6, 12, 18, 24, 30, 36, 42, 48],
        activeGroup: { id: "ecmwf-500", layers: [{ type: "contour", element: "TMP" }] },
      };

      const tab = {
        id: 1,
        layout: "1x1",
        autoAllocation: "step",
        windows: [win0],
        activeWinIdx: 0,
      };

      // 1. In 1x1, change step to 12h
      win0.stepLength = 12;
      win0.discretePeriods = [0, 12, 24, 36, 48, 60, 72];

      // 2. Toggle to 2x2 split
      tab.layout = "2x2";
      prepareSplitWindows(tab, 4, win0, isWindowEmpty, true);
      expect(tab.windows.length).toBe(4);
      applyAutoAllocation(tab, "step", win0);
      expect(tab.windows.map((w) => w.period)).toEqual([24, 36, 48, 60]);
      expect(tab.windows.every((w) => w.stepLength === 12)).toBe(true);

      // 3. Toggle back to 1x1
      tab.layout = "1x1";
      // Change step to 3h
      win0.stepLength = 3;
      win0.discretePeriods = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];

      // 4. Toggle back to 2x2
      tab.layout = "2x2";
      prepareSplitWindows(tab, 4, win0, isWindowEmpty, true);
      expect(tab.windows.length).toBe(4); // No duplicate windows
      applyAutoAllocation(tab, "step", win0);
      expect(tab.windows.map((w) => w.period)).toEqual([24, 27, 30, 33]);
      expect(tab.windows.every((w) => w.stepLength === 3)).toBe(true);

      // 5. Expand to 6-split (2x3) with 24h step
      win0.stepLength = 24;
      win0.discretePeriods = [0, 24, 48, 72, 96, 120, 144, 168];
      tab.layout = "2x3";
      prepareSplitWindows(tab, 6, win0, isWindowEmpty, false, 4);
      expect(tab.windows.length).toBe(6);
      applyAutoAllocation(tab, "step", win0);
      expect(tab.windows.map((w) => w.period)).toEqual([24, 48, 72, 96, 120, 144]);
      expect(tab.windows.every((w) => w.stepLength === 24)).toBe(true);
    });
  });
});
