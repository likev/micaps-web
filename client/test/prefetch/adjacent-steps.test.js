// adjacent-steps.test.js - Adjacent Time Step Resolution (timeSlider.js)
import { describe, it, expect } from "bun:test";
import {
  getAdjacentTimeSteps,
  setTimelineMode,
  setStepLength,
  step,
} from "../../src/ui/timeSlider.js";

describe("2. Adjacent Time Step Resolution (timeSlider.js)", () => {
  it("resolves prev and next periods accurately in NWP forecast mode", () => {
    setTimelineMode("nwp", {
      period: 24,
      cycles: ["26082820"],
      stepLength: 6,
    });

    const steps = getAdjacentTimeSteps();
    expect(steps.mode).toBe("nwp");
    expect(steps.periods.current).toBe(24);
    expect(steps.periods.prev).toBe(18); // Left: -6h
    expect(steps.periods.next).toBe(30); // Right: +6h
    expect(steps.periods.cycle).toBe("26082820");
  });

  it("wraps correctly at boundaries of discrete forecast periods", () => {
    setTimelineMode("nwp", {
      period: 0,
      cycles: ["26082820"],
      stepLength: 6,
    });

    const steps = getAdjacentTimeSteps();
    expect(steps.periods.current).toBe(0);
    // Prev from 0 wraps to last period in array
    expect(typeof steps.periods.prev).toBe("number");
    expect(steps.periods.prev).toBeGreaterThan(0);
    expect(steps.periods.next).toBe(6);
  });

  it("resolves prev and next observation files in Observation mode", () => {
    const files = [
      "20260828080000.000",
      "20260828110000.000",
      "20260828140000.000",
      "20260828170000.000",
      "20260828200000.000",
    ];

    setTimelineMode("obs", {
      files,
      file: "20260828140000.000",
      stepLength: 3,
    });

    const steps = getAdjacentTimeSteps();
    expect(steps.mode).toBe("obs");
    expect(steps.obsFiles.current).toBe("20260828140000.000");
    expect(steps.obsFiles.prev).toBe("20260828110000.000"); // Left
    expect(steps.obsFiles.next).toBe("20260828170000.000"); // Right
  });
});
