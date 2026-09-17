// targets.test.js - Prefetch Target Calculation (prefetchService.js)
import { describe, it, expect } from "bun:test";
import {
  getPrefetchTargets,
  VERTICAL_LEVELS,
} from "../../src/services/prefetchService.js";

describe("3. Prefetch Target Calculation (prefetchService.js)", () => {
  it("generates correct Left, Right, Up, Down targets for NWP Preset Group (500 hPa HGT & TMP)", () => {
    const win = {
      id: "win-nwp",
      period: 24,
      level: 500,
      forecastCycle: "26082820",
      isObservation: false,
      activeGroup: {
        id: "ecmwf-500",
        name: "500 hPa Height & Temperature (ECMWF)",
        hasLevel: true,
        defaultLevel: 500,
        layers: [
          { type: "contour", model: "ECMWF_HR", element: "HGT", level: 500 },
          { type: "contour", model: "ECMWF_HR", element: "TMP", level: 500 },
        ],
      },
      layers: [],
    };

    const mockTimeline = {
      mode: "nwp",
      periods: { prev: 18, current: 24, next: 30, cycle: "26082820" },
    };

    const targets = getPrefetchTargets(win, { timelineSteps: mockTimeline });

    // Left: period 18
    expect(targets.left.period).toBe(18);
    expect(targets.left.items.length).toBe(2);
    expect(targets.left.items[0]).toMatchObject({ type: "grid", path: "ECMWF_HR/HGT/500", file: "26082820.018", direction: "left" });
    expect(targets.left.items[1]).toMatchObject({ type: "grid", path: "ECMWF_HR/TMP/500", file: "26082820.018", direction: "left" });

    // Right: period 30
    expect(targets.right.period).toBe(30);
    expect(targets.right.items.length).toBe(2);
    expect(targets.right.items[0]).toMatchObject({ type: "grid", path: "ECMWF_HR/HGT/500", file: "26082820.030", direction: "right" });
    expect(targets.right.items[1]).toMatchObject({ type: "grid", path: "ECMWF_HR/TMP/500", file: "26082820.030", direction: "right" });

    // Up: level 400 hPa (from 500 hPa: index 4 -> 5 is 400 hPa)
    expect(targets.up.level).toBe(400);
    expect(targets.up.items.length).toBe(2);
    expect(targets.up.items[0]).toMatchObject({ type: "grid", path: "ECMWF_HR/HGT/400", file: "26082820.024", direction: "up" });
    expect(targets.up.items[1]).toMatchObject({ type: "grid", path: "ECMWF_HR/TMP/400", file: "26082820.024", direction: "up" });

    // Down: level 700 hPa (from 500 hPa: index 4 -> 3 is 700 hPa)
    expect(targets.down.level).toBe(700);
    expect(targets.down.items.length).toBe(2);
    expect(targets.down.items[0]).toMatchObject({ type: "grid", path: "ECMWF_HR/HGT/700", file: "26082820.024", direction: "down" });
    expect(targets.down.items[1]).toMatchObject({ type: "grid", path: "ECMWF_HR/TMP/700", file: "26082820.024", direction: "down" });
  });

  it("includes binary stream prefetch if layer has showRaster enabled", () => {
    const win = {
      id: "win-raster",
      period: 24,
      level: 850,
      forecastCycle: "26082820",
      activeGroup: {
        id: "rh-raster",
        hasLevel: true,
        layers: [
          { type: "contour", model: "ECMWF_HR", element: "RH", level: 850, render: { showRaster: true } },
        ],
      },
      layers: [],
    };

    const mockTimeline = {
      mode: "nwp",
      periods: { prev: 18, current: 24, next: 30, cycle: "26082820" },
    };

    const targets = getPrefetchTargets(win, { timelineSteps: mockTimeline });
    // Left should have both grid JSON and binary stream
    expect(targets.left.items.length).toBe(2);
    expect(targets.left.items[0]).toMatchObject({ type: "grid", path: "ECMWF_HR/RH/850", file: "26082820.018" });
    expect(targets.left.items[1]).toMatchObject({ type: "binary", path: "ECMWF_HR/RH/850", file: "26082820.018" });
  });

  it("generates correct Left, Right, Up, Down targets for Upper-Air Sounding observation preset", () => {
    const win = {
      id: "win-sounding",
      level: 500,
      obsTime: "20260828200000.000",
      isObservation: true,
      activeGroup: {
        id: "sounding-500",
        name: "500 hPa Upper-Air Sounding",
        hasLevel: true,
        isObservation: true,
        defaultLevel: 500,
        layers: [
          { type: "station", model: "UPPER_AIR", element: "PLOT", level: 500 },
          // Derived contours should be ignored from network fetch
          { type: "contour", model: "UPPER_AIR", element: "HGT", derivedFrom: "upperair-obs-500" },
          { type: "contour", model: "UPPER_AIR", element: "TMP", derivedFrom: "upperair-obs-500" },
        ],
      },
      layers: [],
    };

    const mockTimeline = {
      mode: "obs",
      obsFiles: {
        prev: "20260828080000.000",
        current: "20260828200000.000",
        next: "20260829080000.000",
      },
    };

    const targets = getPrefetchTargets(win, { timelineSteps: mockTimeline });

    // Left: prev observation file
    expect(targets.left.obsFile).toBe("20260828080000.000");
    expect(targets.left.items.length).toBe(1);
    expect(targets.left.items[0]).toMatchObject({
      type: "station",
      path: "UPPER_AIR/PLOT/500",
      file: "20260828080000.000",
      direction: "left",
    });

    // Right: next observation file
    expect(targets.right.obsFile).toBe("20260829080000.000");
    expect(targets.right.items.length).toBe(1);
    expect(targets.right.items[0]).toMatchObject({
      type: "station",
      path: "UPPER_AIR/PLOT/500",
      file: "20260829080000.000",
      direction: "right",
    });

    // Up: level 400 hPa
    expect(targets.up.level).toBe(400);
    expect(targets.up.items.length).toBe(1);
    expect(targets.up.items[0]).toMatchObject({
      type: "station",
      path: "UPPER_AIR/PLOT/400",
      file: "20260828200000.000",
      direction: "up",
    });

    // Down: level 700 hPa
    expect(targets.down.level).toBe(700);
    expect(targets.down.items.length).toBe(1);
    expect(targets.down.items[0]).toMatchObject({
      type: "station",
      path: "UPPER_AIR/PLOT/700",
      file: "20260828200000.000",
      direction: "down",
    });
  });

  it("skips Up/Down prefetch for surface products that do not have vertical levels", () => {
    const win = {
      id: "win-surface",
      isObservation: true,
      obsTime: "20260828200000.000",
      model: "SURFACE",
      element: "PLOT_GLOBAL_3H",
      activeGroup: {
        id: "surface-synoptic",
        name: "Surface Synoptic Analysis",
        hasLevel: false,
        isObservation: true,
        layers: [
          { type: "station", model: "SURFACE", element: "PLOT_GLOBAL_3H" },
        ],
      },
      layers: [],
    };

    const mockTimeline = {
      mode: "obs",
      obsFiles: {
        prev: "20260828170000.000",
        current: "20260828200000.000",
        next: "20260828230000.000",
      },
    };

    const targets = getPrefetchTargets(win, { timelineSteps: mockTimeline });

    // Left and Right exist
    expect(targets.left.items.length).toBe(1);
    expect(targets.right.items.length).toBe(1);

    // Up and Down are disabled
    expect(targets.up.items.length).toBe(0);
    expect(targets.down.items.length).toBe(0);
    expect(targets.up.level).toBeUndefined();
    expect(targets.down.level).toBeUndefined();
  });

  it("handles level boundaries cleanly (top level 100hPa has no Up; bottom level 1000hPa has no Down)", () => {
    const topWin = {
      level: 100, // Top of atmosphere
      forecastCycle: "26082820",
      period: 24,
      model: "ECMWF_HR",
      element: "TMP",
      layers: [],
    };
    const topTargets = getPrefetchTargets(topWin, {
      timelineSteps: { mode: "nwp", periods: { prev: 18, current: 24, next: 30, cycle: "26082820" } },
    });
    expect(topTargets.up.level).toBeNull();
    expect(topTargets.up.items.length).toBe(0);
    expect(topTargets.down.level).toBe(200);
    expect(topTargets.down.items.length).toBe(1);

    const bottomWin = {
      level: 1000, // Surface / 1000 hPa
      forecastCycle: "26082820",
      period: 24,
      model: "ECMWF_HR",
      element: "TMP",
      layers: [],
    };
    const bottomTargets = getPrefetchTargets(bottomWin, {
      timelineSteps: { mode: "nwp", periods: { prev: 18, current: 24, next: 30, cycle: "26082820" } },
    });
    expect(bottomTargets.down.level).toBeNull();
    expect(bottomTargets.down.items.length).toBe(0);
    expect(bottomTargets.up.level).toBe(925);
    expect(bottomTargets.up.items.length).toBe(1);
  });

  it("respects explicit hasLevel: false even for custom IDs or level: 0", () => {
    const customGroupWin = {
      id: "win-custom",
      level: 0,
      activeGroup: {
        id: "custom-regional-marine", // Does NOT contain 'surface' in name or id
        name: "Regional Marine Analysis",
        hasLevel: false, // Explicitly false!
        layers: [
          { type: "contour", model: "CMA_TYP", element: "SLP", level: 0 },
        ],
      },
      layers: [],
    };

    const targets = getPrefetchTargets(customGroupWin, {
      timelineSteps: { mode: "nwp", periods: { prev: 18, current: 24, next: 30, cycle: "26082820" } },
    });

    // Should NOT have Up or Down targets because hasLevel is false
    expect(targets.up.level).toBeUndefined();
    expect(targets.down.level).toBeUndefined();
    expect(targets.up.items.length).toBe(0);
    expect(targets.down.items.length).toBe(0);
  });
});
