// rain_accumulation_disabled_skipped.test.js
// Comprehensive verification for Bug 3 extension:
// Disabling and skipping nonexistent lead times for RAIN01 (<1h), RAIN03 (<3h), RAIN06 (<6h), RAIN12 (<12h), and RAIN24 (<24h)

import { describe, it, expect } from "bun:test";
import {
  isRain01Element,
  isRain03Element,
  isRain06Element,
  isRain12Element,
  isRain24Element,
  isWindowRain01,
  isWindowRain03,
  isWindowRain06,
  isWindowRain12,
  isWindowRain24,
  getRainAccumulationHours,
  getRainAccumulationHoursForWindow,
  isRainAccumulationElement,
  isWindowRainAccumulation,
  getDisabledPeriodsForRain,
  disabledPeriodsEqual,
} from "../src/utils/rain12.js";
import {
  createDefaultTab,
  createDefaultWindow,
  applyAutoAllocation,
} from "../src/lib/stores/tabsCore.js";
import { createTimelineState, getAdjacentTimeSteps } from "../src/lib/stores/timelineCore.js";
import { stepWindowTimeline } from "../src/lib/services/appWorkflow.js";
import { step as playbackStep } from "../src/ui/timeline/playbackController.js";
import { timelineState as playbackTlState } from "../src/ui/timeline/timelineStore.js";
import { setTimelineMode } from "../src/ui/timeline/timeSliderView.js";

describe("Rain Accumulation Products Identification", () => {
  it("identifies RAIN01 / RAIN1 variants and rejects other products", () => {
    expect(isRain01Element("RAIN01")).toBe(true);
    expect(isRain01Element("rain01")).toBe(true);
    expect(isRain01Element("RAIN1")).toBe(true);
    expect(isRain01Element("rain1")).toBe(true);
    expect(isRain01Element("ECMWF_HR/RAIN01")).toBe(true);
    expect(isRain01Element("RAIN01_ACCUM")).toBe(true);
    expect(isRain01Element("RAIN01H")).toBe(true);
    expect(isRain01Element("RAIN_01")).toBe(true);
    expect(isRain01Element("RAIN_1H")).toBe(true);
    expect(isRain01Element("dark-rain01.xml")).toBe(true);

    expect(isRain01Element("RAIN03")).toBe(false);
    expect(isRain01Element("RAIN06")).toBe(false);
    expect(isRain01Element("RAIN12")).toBe(false);
    expect(isRain01Element("RAIN24")).toBe(false);
    expect(isRain01Element("TMP")).toBe(false);
    expect(isRain01Element("RAIN")).toBe(false);
  });

  it("identifies RAIN03 / RAIN3 variants and rejects other products", () => {
    expect(isRain03Element("RAIN03")).toBe(true);
    expect(isRain03Element("rain03")).toBe(true);
    expect(isRain03Element("RAIN3")).toBe(true);
    expect(isRain03Element("rain3")).toBe(true);
    expect(isRain03Element("ECMWF_HR/RAIN03")).toBe(true);
    expect(isRain03Element("RAIN03_ACCUM")).toBe(true);
    expect(isRain03Element("RAIN03H")).toBe(true);
    expect(isRain03Element("RAIN_03")).toBe(true);
    expect(isRain03Element("RAIN_3H")).toBe(true);
    expect(isRain03Element("dark-rain03.xml")).toBe(true);

    expect(isRain03Element("RAIN01")).toBe(false);
    expect(isRain03Element("RAIN06")).toBe(false);
    expect(isRain03Element("RAIN12")).toBe(false);
    expect(isRain03Element("RAIN24")).toBe(false);
    expect(isRain03Element("TMP")).toBe(false);
  });

  it("identifies RAIN06 / RAIN6 variants and rejects other products", () => {
    expect(isRain06Element("RAIN06")).toBe(true);
    expect(isRain06Element("rain06")).toBe(true);
    expect(isRain06Element("RAIN6")).toBe(true);
    expect(isRain06Element("rain6")).toBe(true);
    expect(isRain06Element("ECMWF_HR/RAIN06")).toBe(true);
    expect(isRain06Element("cma_gfs/rain6")).toBe(true);
    expect(isRain06Element("RAIN06_ACCUM")).toBe(true);
    expect(isRain06Element("RAIN06H")).toBe(true);
    expect(isRain06Element("RAIN_06")).toBe(true);
    expect(isRain06Element("RAIN_6H")).toBe(true);
    expect(isRain06Element("dark-rain06.xml")).toBe(true);

    expect(isRain06Element("RAIN01")).toBe(false);
    expect(isRain06Element("RAIN03")).toBe(false);
    expect(isRain06Element("RAIN12")).toBe(false);
    expect(isRain06Element("RAIN24")).toBe(false);
    expect(isRain06Element("TMP")).toBe(false);
  });

  it("identifies RAIN12 variants and rejects other products", () => {
    expect(isRain12Element("RAIN12")).toBe(true);
    expect(isRain12Element("rain12")).toBe(true);
    expect(isRain12Element("ECMWF_HR/RAIN12")).toBe(true);
    expect(isRain12Element("RAIN12_ACCUM")).toBe(true);
    expect(isRain12Element("RAIN12H")).toBe(true);
    expect(isRain12Element("RAIN_12")).toBe(true);
    expect(isRain12Element("RAIN_12H")).toBe(true);
    expect(isRain12Element("dark-rain12.xml")).toBe(true);

    expect(isRain12Element("RAIN01")).toBe(false);
    expect(isRain12Element("RAIN03")).toBe(false);
    expect(isRain12Element("RAIN06")).toBe(false);
    expect(isRain12Element("RAIN24")).toBe(false);
    expect(isRain12Element("TMP")).toBe(false);
  });

  it("identifies RAIN24 variants and rejects other products", () => {
    expect(isRain24Element("RAIN24")).toBe(true);
    expect(isRain24Element("rain24")).toBe(true);
    expect(isRain24Element("ECMWF_HR/RAIN24")).toBe(true);
    expect(isRain24Element("cma_gfs/rain24")).toBe(true);
    expect(isRain24Element("RAIN24_ACCUM")).toBe(true);
    expect(isRain24Element("RAIN24H")).toBe(true);
    expect(isRain24Element("RAIN_24")).toBe(true);
    expect(isRain24Element("RAIN_24H")).toBe(true);
    expect(isRain24Element("dark-rain24.xml")).toBe(true);

    expect(isRain24Element("RAIN01")).toBe(false);
    expect(isRain24Element("RAIN03")).toBe(false);
    expect(isRain24Element("RAIN06")).toBe(false);
    expect(isRain24Element("RAIN12")).toBe(false);
    expect(isRain24Element("TMP")).toBe(false);
  });

  it("getRainAccumulationHours returns correct hours or null", () => {
    expect(getRainAccumulationHours("RAIN01")).toBe(1);
    expect(getRainAccumulationHours("RAIN1")).toBe(1);
    expect(getRainAccumulationHours("RAIN001")).toBe(1);
    expect(getRainAccumulationHours("RAIN03")).toBe(3);
    expect(getRainAccumulationHours("RAIN3")).toBe(3);
    expect(getRainAccumulationHours("RAIN003")).toBe(3);
    expect(getRainAccumulationHours("RAIN06")).toBe(6);
    expect(getRainAccumulationHours("RAIN6")).toBe(6);
    expect(getRainAccumulationHours("RAIN006")).toBe(6);
    expect(getRainAccumulationHours("RAIN12")).toBe(12);
    expect(getRainAccumulationHours("RAIN012")).toBe(12); // Padded 12h, must NOT be parsed as 1h!
    expect(getRainAccumulationHours("RAIN24")).toBe(24);
    expect(getRainAccumulationHours("RAIN024")).toBe(24); // Padded 24h
    expect(getRainAccumulationHours("12h Rain")).toBe(12);
    expect(getRainAccumulationHours("24-hr Precip")).toBe(24);
    expect(getRainAccumulationHours("6h Accumulation")).toBe(6);
    expect(getRainAccumulationHours("APCP24")).toBe(24);
    expect(getRainAccumulationHours("TP06")).toBe(6);
    expect(getRainAccumulationHours("PRECIP12")).toBe(12);

    // False-positive rejection: lead forecasts > 48h must not match prefixes
    expect(getRainAccumulationHours("RAIN120")).toBeNull();
    expect(getRainAccumulationHours("RAIN240")).toBeNull();
    expect(getRainAccumulationHours("RAIN060")).toBeNull();
    expect(getRainAccumulationHours("TMP")).toBeNull();
    expect(getRainAccumulationHours("")).toBeNull();
    expect(getRainAccumulationHours(null)).toBeNull();
    expect(getRainAccumulationHours(undefined)).toBeNull();
    expect(getRainAccumulationHours("RAIN")).toBeNull();
  });

  it("identifies windows containing rain accumulation elements", () => {
    expect(isWindowRain01({ element: "RAIN01" })).toBe(true);
    expect(isWindowRain03({ activeGroup: { id: "nwp-rain03" } })).toBe(true);
    expect(isWindowRain06({ activeGroup: { layers: [{ element: "RAIN06" }] } })).toBe(true);
    expect(isWindowRain12({ layers: [{ path: "ECMWF/RAIN12" }] })).toBe(true);
    expect(isWindowRain24({ id: "tab-1-win-rain24" })).toBe(true);

    expect(isWindowRainAccumulation({ element: "RAIN24" })).toBe(true);
    expect(isWindowRainAccumulation({ element: "TMP" })).toBe(false);
    expect(getRainAccumulationHoursForWindow({ element: "RAIN24" })).toBe(24);
    expect(getRainAccumulationHoursForWindow({ element: "RAIN06" })).toBe(6);
    expect(getRainAccumulationHoursForWindow({ element: "TMP" })).toBeNull();
  });
});

describe("Disabled Periods Calculation for Rain", () => {
  it("computes disabled periods for RAIN24 across different step lengths", () => {
    // 6h step
    const p6 = [0, 6, 12, 18, 24, 30, 36];
    expect(getDisabledPeriodsForRain(24, p6)).toEqual([0, 6, 12, 18]);

    // 3h step
    const p3 = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27];
    expect(getDisabledPeriodsForRain(24, p3)).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);

    // 12h step
    const p12 = [0, 12, 24, 36];
    expect(getDisabledPeriodsForRain(24, p12)).toEqual([0, 12]);

    // fallback when discretePeriods is omitted
    expect(getDisabledPeriodsForRain(24)).toEqual([0, 6, 12, 18]);
  });

  it("computes disabled periods for RAIN12 across different step lengths", () => {
    // 6h step
    const p6 = [0, 6, 12, 18, 24];
    expect(getDisabledPeriodsForRain(12, p6)).toEqual([0, 6]);

    // 3h step
    const p3 = [0, 3, 6, 9, 12, 15];
    expect(getDisabledPeriodsForRain(12, p3)).toEqual([0, 3, 6, 9]);

    // fallback
    expect(getDisabledPeriodsForRain(12)).toEqual([0, 6]);
  });

  it("computes disabled periods for RAIN06 across different step lengths", () => {
    // 6h step
    const p6 = [0, 6, 12, 18];
    expect(getDisabledPeriodsForRain(6, p6)).toEqual([0]);

    // 1h step
    const p1 = [0, 1, 2, 3, 4, 5, 6, 7];
    expect(getDisabledPeriodsForRain(6, p1)).toEqual([0, 1, 2, 3, 4, 5]);

    // 3h step
    const p3 = [0, 3, 6, 9];
    expect(getDisabledPeriodsForRain(6, p3)).toEqual([0, 3]);

    // fallback
    expect(getDisabledPeriodsForRain(6)).toEqual([0]);
  });

  it("computes disabled periods for RAIN03 across different step lengths", () => {
    // 3h step
    const p3 = [0, 3, 6, 9];
    expect(getDisabledPeriodsForRain(3, p3)).toEqual([0]);

    // 1h step
    const p1 = [0, 1, 2, 3, 4, 5];
    expect(getDisabledPeriodsForRain(3, p1)).toEqual([0, 1, 2]);

    // fallback
    expect(getDisabledPeriodsForRain(3)).toEqual([0]);
  });

  it("computes disabled periods for RAIN01 across different step lengths", () => {
    // 1h step
    const p1 = [0, 1, 2, 3];
    expect(getDisabledPeriodsForRain(1, p1)).toEqual([0]);

    // fallback
    expect(getDisabledPeriodsForRain(1)).toEqual([0]);
  });
});

describe("Timeline Stepping Skips Disabled Periods", () => {
  it("RAIN24: forward and backward stepping wraps and skips [0, 6, 12, 18]", () => {
    const tl = createTimelineState("rain24-win", {
      discretePeriods: [0, 6, 12, 18, 24, 30, 36],
      currentPeriodIdx: 4, // 24
      disabledPeriods: [0, 6, 12, 18],
    });

    // Advance 24 -> 30 -> 36
    expect(stepWindowTimeline(tl, 1).period).toBe(30);
    expect(stepWindowTimeline(tl, 1).period).toBe(36);

    // From 36, step +1 wraps around and skips 0, 6, 12, 18 -> lands on 24!
    const wrapForward = stepWindowTimeline(tl, 1);
    expect(wrapForward.period).toBe(24);
    expect(tl.currentPeriodIdx).toBe(4);

    // From 24, step -1 wraps backward and skips 18, 12, 6, 0 -> lands on 36!
    const wrapBackward = stepWindowTimeline(tl, -1);
    expect(wrapBackward.period).toBe(36);
    expect(tl.currentPeriodIdx).toBe(6);
  });

  it("RAIN06: forward and backward stepping wraps and skips [0]", () => {
    const tl = createTimelineState("rain06-win", {
      discretePeriods: [0, 6, 12, 18, 24],
      currentPeriodIdx: 4, // 24
      disabledPeriods: [0],
    });

    // From 24, step +1 wraps around and skips 0 -> lands on 6!
    const wrapForward = stepWindowTimeline(tl, 1);
    expect(wrapForward.period).toBe(6);
    expect(tl.currentPeriodIdx).toBe(1);

    // From 6, step -1 wraps backward and skips 0 -> lands on 24!
    const wrapBackward = stepWindowTimeline(tl, -1);
    expect(wrapBackward.period).toBe(24);
    expect(tl.currentPeriodIdx).toBe(4);
  });

  it("RAIN03: forward and backward stepping with 1h step wraps and skips [0, 1, 2]", () => {
    const tl = createTimelineState("rain03-win", {
      discretePeriods: [0, 1, 2, 3, 4, 5],
      currentPeriodIdx: 5, // 5
      disabledPeriods: [0, 1, 2],
    });

    // From 5, step +1 wraps around and skips 0, 1, 2 -> lands on 3!
    const wrapForward = stepWindowTimeline(tl, 1);
    expect(wrapForward.period).toBe(3);
    expect(tl.currentPeriodIdx).toBe(3);

    // From 3, step -1 wraps backward and skips 2, 1, 0 -> lands on 5!
    const wrapBackward = stepWindowTimeline(tl, -1);
    expect(wrapBackward.period).toBe(5);
    expect(tl.currentPeriodIdx).toBe(5);
  });

  it("RAIN01: forward and backward stepping with 1h step wraps and skips [0]", () => {
    const tl = createTimelineState("rain01-win", {
      discretePeriods: [0, 1, 2, 3],
      currentPeriodIdx: 3, // 3
      disabledPeriods: [0],
    });

    // From 3, step +1 wraps around and skips 0 -> lands on 1!
    const wrapForward = stepWindowTimeline(tl, 1);
    expect(wrapForward.period).toBe(1);
    expect(tl.currentPeriodIdx).toBe(1);

    // From 1, step -1 wraps backward and skips 0 -> lands on 3!
    const wrapBackward = stepWindowTimeline(tl, -1);
    expect(wrapBackward.period).toBe(3);
    expect(tl.currentPeriodIdx).toBe(3);
  });
});

describe("Playback Controller Skips Disabled Periods", () => {
  it("RAIN24: playbackController.step skips [0, 6, 12, 18]", async () => {
    playbackTlState.currentMode = "nwp";
    playbackTlState.discretePeriods = [0, 6, 12, 18, 24, 30];
    playbackTlState.currentPeriodIdx = 5; // 30
    playbackTlState.disabledPeriods = [0, 6, 12, 18];

    // Stepping forward from 30 wraps and skips 0, 6, 12, 18 -> lands on 24
    await playbackStep(1, { source: "btn-play" });
    expect(playbackTlState.currentPeriodIdx).toBe(4);
    expect(playbackTlState.discretePeriods[playbackTlState.currentPeriodIdx]).toBe(24);

    // Stepping backward from 24 wraps and skips 18, 12, 6, 0 -> lands on 30
    await playbackStep(-1, { source: "btn-prev" });
    expect(playbackTlState.currentPeriodIdx).toBe(5);
    expect(playbackTlState.discretePeriods[playbackTlState.currentPeriodIdx]).toBe(30);
  });

  it("RAIN06: playbackController.step skips [0]", async () => {
    playbackTlState.currentMode = "nwp";
    playbackTlState.discretePeriods = [0, 6, 12, 18];
    playbackTlState.currentPeriodIdx = 3; // 18
    playbackTlState.disabledPeriods = [0];

    // Stepping forward from 18 wraps and skips 0 -> lands on 6
    await playbackStep(1, { source: "btn-play" });
    expect(playbackTlState.currentPeriodIdx).toBe(1);
    expect(playbackTlState.discretePeriods[playbackTlState.currentPeriodIdx]).toBe(6);

    // Stepping backward from 6 wraps and skips 0 -> lands on 18
    await playbackStep(-1, { source: "btn-prev" });
    expect(playbackTlState.currentPeriodIdx).toBe(3);
    expect(playbackTlState.discretePeriods[playbackTlState.currentPeriodIdx]).toBe(18);
  });
});

describe("Auto Allocation Period Snapping for All Rain Products", () => {
  it("applyAutoAllocation snaps RAIN24 base period to >= 24h", () => {
    const tab = createDefaultTab(1);
    tab.layout = "1x2";
    const win0 = {
      ...createDefaultWindow(0, 1),
      element: "RAIN24",
      period: 0,
    };
    tab.windows = [win0, createDefaultWindow(1, 1)];

    applyAutoAllocation(tab, "step", win0);
    expect(tab.windows[0].period).toBe(24);
    expect(tab.windows[1].period).toBe(30);
  });

  it("applyAutoAllocation snaps RAIN06 base period to >= 6h", () => {
    const tab = createDefaultTab(1);
    tab.layout = "1x2";
    const win0 = {
      ...createDefaultWindow(0, 1),
      element: "RAIN06",
      period: 0,
    };
    tab.windows = [win0, createDefaultWindow(1, 1)];

    applyAutoAllocation(tab, "step", win0);
    expect(tab.windows[0].period).toBe(6);
    expect(tab.windows[1].period).toBe(12);
  });

  it("applyAutoAllocation snaps RAIN03 base period to >= 3h", () => {
    const tab = createDefaultTab(1);
    tab.layout = "1x2";
    const win0 = {
      ...createDefaultWindow(0, 1),
      element: "RAIN03",
      period: 0,
      stepLength: 3,
      discretePeriods: [0, 3, 6, 9, 12],
    };
    tab.windows = [win0, createDefaultWindow(1, 1)];

    applyAutoAllocation(tab, "step", win0);
    expect(tab.windows[0].period).toBe(3);
    expect(tab.windows[1].period).toBe(6);
  });

  it("applyAutoAllocation snaps RAIN01 base period to >= 1h", () => {
    const tab = createDefaultTab(1);
    tab.layout = "1x2";
    const win0 = {
      ...createDefaultWindow(0, 1),
      element: "RAIN01",
      period: 0,
      stepLength: 1,
      discretePeriods: [0, 1, 2, 3, 4],
    };
    tab.windows = [win0, createDefaultWindow(1, 1)];

    applyAutoAllocation(tab, "step", win0);
    expect(tab.windows[0].period).toBe(1);
    expect(tab.windows[1].period).toBe(2);
  });

  it("applyAutoAllocation preserves existing valid period >= accumulation period", () => {
    const tab = createDefaultTab(1);
    tab.layout = "1x2";
    const win0 = {
      ...createDefaultWindow(0, 1),
      element: "RAIN24",
      period: 36,
    };
    tab.windows = [win0, createDefaultWindow(1, 1)];

    applyAutoAllocation(tab, "step", win0);
    expect(tab.windows[0].period).toBe(36);
    expect(tab.windows[1].period).toBe(42);
  });
});

describe("Adjacent Time Steps and Prefetch Skip Disabled Periods", () => {
  it("RAIN24: getAdjacentTimeSteps skips disabled lead periods [0, 6, 12, 18]", () => {
    const state = createTimelineState("rain24-adjacent", {
      currentMode: "nwp",
      discretePeriods: [0, 6, 12, 18, 24, 30, 36],
      currentPeriodIdx: 4, // 24
      disabledPeriods: [0, 6, 12, 18],
      currentInitCycle: "2026092900",
    });

    const adj = getAdjacentTimeSteps(state);
    expect(adj.periods.current).toBe(24);
    // Prev from 24 wraps backward and skips 18, 12, 6, 0 -> lands on 36
    expect(adj.periods.prev).toBe(36);
    // Next from 24 is 30
    expect(adj.periods.next).toBe(30);

    // From 36:
    state.currentPeriodIdx = 6;
    const adj36 = getAdjacentTimeSteps(state);
    expect(adj36.periods.current).toBe(36);
    expect(adj36.periods.prev).toBe(30);
    // Next from 36 wraps forward and skips 0, 6, 12, 18 -> lands on 24!
    expect(adj36.periods.next).toBe(24);
  });

  it("RAIN06: getAdjacentTimeSteps skips disabled period [0]", () => {
    const state = createTimelineState("rain06-adjacent", {
      currentMode: "nwp",
      discretePeriods: [0, 6, 12, 18],
      currentPeriodIdx: 1, // 6
      disabledPeriods: [0],
      currentInitCycle: "2026092900",
    });

    const adj = getAdjacentTimeSteps(state);
    expect(adj.periods.current).toBe(6);
    // Prev from 6 wraps backward and skips 0 -> lands on 18
    expect(adj.periods.prev).toBe(18);
    expect(adj.periods.next).toBe(12);
  });
});

describe("Timeline View Mode Snapping & Playback Safeguards", () => {
  it("setTimelineMode snaps invalid initial period to first non-disabled period", () => {
    setTimelineMode("nwp", {
      period: 0, // Disabled for RAIN24!
      stepLength: 6,
      disabledPeriods: [0, 6, 12, 18],
      cycles: ["2026092900"],
      silent: true,
      visible: false,
    });

    // Should have snapped past 0, 6, 12, 18 to 24 (index 4)
    expect(playbackTlState.currentPeriodIdx).toBe(4);
    expect(playbackTlState.discretePeriods[playbackTlState.currentPeriodIdx]).toBe(24);
  });

  it("playbackStep no-ops when valid non-disabled periods count <= 1", async () => {
    playbackTlState.currentMode = "nwp";
    playbackTlState.discretePeriods = [0, 6, 12, 18, 24]; // 5 periods, but 4 disabled
    playbackTlState.disabledPeriods = [0, 6, 12, 18];
    playbackTlState.currentPeriodIdx = 4; // 24

    const result = await playbackStep(1, { source: "btn-play" });
    expect(result.noop).toBe(true);
    expect(playbackTlState.currentPeriodIdx).toBe(4);
  });
});


describe("disabledPeriodsEqual compare-then-assign guard", () => {
  it("treats recomputed filter output as equal (effect must not re-assign)", () => {
    const periods = [0, 6, 12, 18, 24, 30];
    const first = getDisabledPeriodsForRain(12, periods);
    const second = getDisabledPeriodsForRain(12, periods);
    expect(first).not.toBe(second); // fresh array identity each call
    expect(disabledPeriodsEqual(first, second)).toBe(true);
  });

  it("is order-insensitive and numeric-coerced, Set-tolerant", () => {
    expect(disabledPeriodsEqual([0, 6], [6, 0])).toBe(true);
    expect(disabledPeriodsEqual(["0", "6"], [0, 6])).toBe(true);
    expect(disabledPeriodsEqual(new Set([0, 6]), [0, 6])).toBe(true);
    expect(disabledPeriodsEqual([], [])).toBe(true);
    expect(disabledPeriodsEqual([0, 6], [0, 12])).toBe(false);
    expect(disabledPeriodsEqual([0, 6], [0, 6, 12])).toBe(false);
    expect(disabledPeriodsEqual(null, [])).toBe(false);
    expect(disabledPeriodsEqual(undefined, undefined)).toBe(true);
  });

  it("detects genuine membership changes from step-length switches", () => {
    // 6h cadence vs 12h cadence produce different disabled sets for RAIN12.
    const six = getDisabledPeriodsForRain(12, [0, 6, 12, 18, 24]);
    const twelve = getDisabledPeriodsForRain(12, [0, 12, 24]);
    expect(disabledPeriodsEqual(six, twelve)).toBe(false);
  });
});
