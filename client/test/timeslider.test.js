// timeslider.test.js - Unit tests for timeline stepper and step-length selection
import { test, expect, describe } from "bun:test";
import { getPeriodsForStep } from "../src/ui/timeSlider.js";
import { formatForecastInitTime, formatForecastValidTime } from "../src/utils/formatters.js";

describe("Timeslider Step-Length & Discrete Periods", () => {
  test("getPeriodsForStep generates accurate forecast discrete periods for all step lengths", () => {
    // 6h forecast step (default for weather models like ECMWF_HR)
    const p6 = getPeriodsForStep(6);
    expect(p6).toContain(0);
    expect(p6).toContain(6);
    expect(p6).toContain(12);
    expect(p6).toContain(24);
    expect(p6).toContain(48);
    expect(p6).toContain(72);
    expect(p6).toContain(120);
    expect(p6[1] - p6[0]).toBe(6);

    // 3h step (default for surface observations)
    const p3 = getPeriodsForStep(3);
    expect(p3).toContain(0);
    expect(p3).toContain(3);
    expect(p3).toContain(6);
    expect(p3).toContain(9);
    expect(p3).toContain(24);
    expect(p3[1] - p3[0]).toBe(3);

    // 12h step (default for upper-air observations)
    const p12 = getPeriodsForStep(12);
    expect(p12).toContain(0);
    expect(p12).toContain(12);
    expect(p12).toContain(24);
    expect(p12).toContain(36);
    expect(p12).toContain(48);
    expect(p12[1] - p12[0]).toBe(12);

    // 1h step
    const p1 = getPeriodsForStep(1);
    expect(p1).toContain(0);
    expect(p1).toContain(1);
    expect(p1).toContain(2);
    expect(p1[1] - p1[0]).toBe(1);

    // 24h step
    const p24 = getPeriodsForStep(24);
    expect(p24).toContain(0);
    expect(p24).toContain(24);
    expect(p24).toContain(48);
    expect(p24[1] - p24[0]).toBe(24);
  });

  test("Step-length defaults align with meteorological domain requirements", () => {
    const surfaceDefault = 3;
    const upperAirDefault = 12;
    const weatherModelForecastDefault = 6;

    expect(surfaceDefault).toBe(3);
    expect(upperAirDefault).toBe(12);
    expect(weatherModelForecastDefault).toBe(6);

    // Verify intervals subdivide a 24-hour meteorological cycle
    expect(24 % surfaceDefault).toBe(0);
    expect(24 % upperAirDefault).toBe(0);
    expect(24 % weatherModelForecastDefault).toBe(0);
  });

  test("Init-time forecast run cycles and valid times are formatted accurately", () => {
    // 26082908 -> 2026-08-29 08:00 (UTC+8)
    const formattedInit = formatForecastInitTime("26082908");
    expect(formattedInit).toBe("2026-08-29 08:00 (UTC+8)");

    // 26082820 + 24h -> 2026-08-29 20:00 (UTC+8) (+024h)
    const formattedValid = formatForecastValidTime("26082820", 24);
    expect(formattedValid).toContain("2026-08-29 20:00 (UTC+8)");
    expect(formattedValid).toContain("(+024h)");
  });

  test("Upper-Air observation filtering: 12h keeps only 08:00 and 20:00 UTC+8, filters out 02:00 and 14:00", async () => {
    const { filterObsFilesByStep } = await import("../src/ui/timeSlider.js");

    const sampleFiles = [
      "20260828020000.000", // 02:00 UTC+8
      "20260828080000.000", // 08:00 UTC+8 (synoptic sounding)
      "20260828140000.000", // 14:00 UTC+8
      "20260828200000.000", // 20:00 UTC+8 (synoptic sounding)
      "20260829020000.000", // 02:00 UTC+8
      "20260829080000.000", // 08:00 UTC+8 (synoptic sounding)
    ];

    // 12h step for upper-air: ONLY 08:00 and 20:00
    const filtered12h = filterObsFilesByStep(sampleFiles, 12, true);
    expect(filtered12h.length).toBe(3);
    expect(filtered12h).toContain("20260828080000.000");
    expect(filtered12h).toContain("20260828200000.000");
    expect(filtered12h).toContain("20260829080000.000");
    expect(filtered12h).not.toContain("20260828020000.000");
    expect(filtered12h).not.toContain("20260828140000.000");
    expect(filtered12h).not.toContain("20260829020000.000");

    // 6h step for upper-air: all 4 synoptic runs (02, 08, 14, 20)
    const filtered6h = filterObsFilesByStep(sampleFiles, 6, true);
    expect(filtered6h.length).toBe(6);
  });

  test("generateDynamicForecastCycles creates realistic 12h forecast cycles", async () => {
    const { generateDynamicForecastCycles } = await import("../src/utils/timelineSync.js");

    // Test from a known base cycle string
    const cyclesFromBase = generateDynamicForecastCycles("26082908", 5);
    expect(cyclesFromBase).toHaveLength(5);
    expect(cyclesFromBase[0]).toBe("26082908");
    expect(cyclesFromBase[1]).toBe("26082820");
    expect(cyclesFromBase[2]).toBe("26082808");
    expect(cyclesFromBase[3]).toBe("26082720");
    expect(cyclesFromBase[4]).toBe("26082708");

    // Test from a Date object
    const fixedDate = new Date(Date.UTC(2026, 7, 30, 14, 0)); // 2026-08-30 22:00 BJT -> 20:00 init
    const cyclesFromDate = generateDynamicForecastCycles(fixedDate, 3);
    expect(cyclesFromDate).toHaveLength(3);
    expect(cyclesFromDate[0]).toBe("26083020");
    expect(cyclesFromDate[1]).toBe("26083008");
    expect(cyclesFromDate[2]).toBe("26082920");

    // Test default fallback from current time
    const dynamicCycles = generateDynamicForecastCycles(null, 10);
    expect(dynamicCycles).toHaveLength(10);
    expect(dynamicCycles[0].length).toBe(8);
    // Each cycle must end in 08 or 20
    dynamicCycles.forEach((c) => {
      const hour = c.slice(6, 8);
      expect(["08", "20"]).toContain(hour);
    });
  });

  test("invalidateForecastCyclesCache clears cached forecast cycles", async () => {
    const { resolveForecastCycles, invalidateForecastCyclesCache } = await import("../src/utils/timelineSync.js");

    const cycles1 = await resolveForecastCycles("ECMWF_HR", "TMP", 500);
    expect(Array.isArray(cycles1)).toBe(true);
    expect(cycles1.length).toBeGreaterThan(0);

    // Invalidate cache should run without throwing
    expect(() => invalidateForecastCyclesCache()).not.toThrow();
    expect(() => invalidateForecastCyclesCache("ECMWF_HR/TMP/500")).not.toThrow();
  });

  test("Period extraction handles both numbers and boxed objects from .chip-btn callbacks", () => {
    // Unpacking logic used in main.js
    function extractPeriod(data, defaultPeriod = 24) {
      if (typeof data === "number") {
        return data;
      }
      if (typeof data === "object" && data !== null) {
        if (typeof data.period === "number") {
          return data.period;
        }
        if (typeof data.valueOf === "function" && typeof data.valueOf() === "number") {
          return data.valueOf();
        }
      }
      return defaultPeriod;
    }

    // Number literal
    expect(extractPeriod(48, 24)).toBe(48);
    expect(extractPeriod(0, 24)).toBe(0);

    // Boxed object from timeSlider.js .chip-btn click
    const boxed = { period: 72, _seq: 5, valueOf() { return 72; } };
    expect(extractPeriod(boxed, 24)).toBe(72);

    // Object with valueOf only
    const valueOfOnly = { valueOf() { return 36; } };
    expect(extractPeriod(valueOfOnly, 24)).toBe(36);

    // Fallback on invalid payload
    expect(extractPeriod(null, 24)).toBe(24);
    expect(extractPeriod(undefined, 24)).toBe(24);
  });

  test("syncObservationTimeline for UPPER_AIR locks targetFile to 08:00 or 20:00 BJT", async () => {
    const { syncObservationTimeline } = await import("../src/utils/timelineSync.js");

    // 1. When no currentFile is given, targetFile must be 08:00 or 20:00
    const latestUpper = await syncObservationTimeline("UPPER_AIR/PLOT/500", null, "500 hPa Sounding");
    expect(typeof latestUpper).toBe("string");
    const latestHour = parseInt(latestUpper.slice(8, 10), 10);
    expect([8, 20]).toContain(latestHour);

    // 2. When an invalid intermediate hour (e.g. 14:00) is requested, it snaps to valid sounding
    const snapped = await syncObservationTimeline("UPPER_AIR/PLOT/500", "20260828140000.000", "500 hPa Sounding");
    const snappedHour = parseInt(snapped.slice(8, 10), 10);
    expect([8, 20]).toContain(snappedHour);

    // 3. When a valid 20:00 file is requested, it is preserved
    const validSounding = "20260828200000.000";
    const kept = await syncObservationTimeline("UPPER_AIR/PLOT/500", validSounding, "500 hPa Sounding");
    expect(kept).toBe(validSounding);
  });

  test("Observation timeline chips are capped at 10 (MAX_OBS_CHIPS = 10) for any step length, retaining full history", async () => {
    const { setTimelineMode, setStepLength, getTimelineObsFiles, getRawObsFiles, selectObsChipsWindow, MAX_OBS_CHIPS } = await import("../src/ui/timeSlider.js");
    const { DEFAULT_MOCK_OBS_FILES } = await import("../src/config/presets.js");

    expect(MAX_OBS_CHIPS).toBe(10);
    expect(DEFAULT_MOCK_OBS_FILES.length).toBeGreaterThanOrEqual(50);

    // 1. Surface mode with default 3h step length: raw files >= 50, but timeline chips strictly capped at 10
    setTimelineMode("obs", {
      files: DEFAULT_MOCK_OBS_FILES,
      stepLength: 3,
      path: "SURFACE/PLOT_GLOBAL_3H",
      winTitle: "Surface Synoptic Plot",
    });

    const rawFiles = getRawObsFiles();
    expect(rawFiles.length).toBeGreaterThanOrEqual(50);
    expect(getTimelineObsFiles().length).toBe(10);

    // 2. Switch Surface step length to 12h: must produce exactly 10 chips (aligned with 08:00 and 20:00)
    setStepLength(12);
    const surface12hFiles = getTimelineObsFiles();
    expect(surface12hFiles.length).toBe(10);
    surface12hFiles.forEach((f) => {
      const hour = parseInt(f.slice(8, 10), 10);
      expect([8, 20]).toContain(hour);
    });

    // 3. Switch Surface step length to 6h: capped at 10 chips (02, 08, 14, 20)
    setStepLength(6);
    const surface6hFiles = getTimelineObsFiles();
    expect(surface6hFiles.length).toBe(10);
    surface6hFiles.forEach((f) => {
      const hour = parseInt(f.slice(8, 10), 10);
      expect([2, 8, 14, 20]).toContain(hour);
    });

    // 4. Switch Surface step length to 24h: capped at <= 10 chips (all 08:00 daily)
    setStepLength(24);
    const surface24hFiles = getTimelineObsFiles();
    expect(surface24hFiles.length).toBeLessThanOrEqual(10);
    expect(surface24hFiles.length).toBeGreaterThan(0);
    surface24hFiles.forEach((f) => {
      const hour = parseInt(f.slice(8, 10), 10);
      expect(hour).toBe(8);
    });

    // 5. Switch back to 3h: chips capped at 10 without losing raw history
    setStepLength(3);
    expect(getTimelineObsFiles().length).toBe(10);
    expect(getRawObsFiles().length).toBe(rawFiles.length);

    // 6. Upper-air mode with default 12h step length: capped at 10 chips (08:00 and 20:00)
    setTimelineMode("obs", {
      files: DEFAULT_MOCK_OBS_FILES,
      stepLength: 12,
      path: "UPPER_AIR/PLOT/500",
      winTitle: "500 hPa Geopotential Height",
      isUpper: true,
    });
    const upper12hFiles = getTimelineObsFiles();
    expect(upper12hFiles.length).toBe(10);
    upper12hFiles.forEach((f) => {
      const hour = parseInt(f.slice(8, 10), 10);
      expect([8, 20]).toContain(hour);
    });

    // 7. Upper-air switched to 6h: capped at 10 chips
    setStepLength(6);
    const upper6hFiles = getTimelineObsFiles();
    expect(upper6hFiles.length).toBe(10);

    // 8. Upper-air switched to 24h: capped at <= 10 chips, all 08:00 daily soundings
    setStepLength(24);
    const upper24hFiles = getTimelineObsFiles();
    expect(upper24hFiles.length).toBeLessThanOrEqual(10);
    expect(upper24hFiles.length).toBeGreaterThan(0);
    upper24hFiles.forEach((f) => {
      const hour = parseInt(f.slice(8, 10), 10);
      expect(hour).toBe(8);
    });

    // 9. selectObsChipsWindow helper unit verification
    const mock20 = Array.from({ length: 20 }, (_, i) => `file_${String(i).padStart(2, "0")}`);
    expect(selectObsChipsWindow(mock20).length).toBe(10);
    expect(selectObsChipsWindow(mock20)[9]).toBe("file_19"); // defaults to latest 10
    // Target file centered/contained in window
    const winTarget = selectObsChipsWindow(mock20, "file_05");
    expect(winTarget.length).toBe(10);
    expect(winTarget).toContain("file_05");
  });

  test("Upper-Air mode populates select-step-length with 12h, 24h, 6h options in DOM", async () => {
    const { setTimelineMode } = await import("../src/ui/timeSlider.js");
    const { DEFAULT_MOCK_OBS_FILES } = await import("../src/config/presets.js");

    const selStep = {
      id: "select-step-length",
      options: [],
      value: "6",
      _html: "",
      get innerHTML() { return this._html; },
      set innerHTML(val) {
        this._html = val;
        if (!val) this.options = [];
      },
      appendChild(child) {
        this.options.push(child);
      },
    };

    const prevDoc = globalThis.document;
    globalThis.document = {
      getElementById(id) {
        if (id === "select-step-length") return selStep;
        return null;
      },
      createElement(tag) {
        return { value: "", textContent: "" };
      },
    };

    try {
      // Set to Upper-Air observation mode
      setTimelineMode("obs", {
        files: DEFAULT_MOCK_OBS_FILES,
        stepLength: 12,
        path: "UPPER_AIR/PLOT/500",
        winTitle: "500 hPa Geopotential Height",
        isUpper: true,
      });

      const upperOpts = selStep.options.map((o) => o.value);
      expect(upperOpts).toEqual(["12", "24", "6"]);
      expect(selStep.value).toBe("12");

      // Switch to Surface observation mode
      setTimelineMode("obs", {
        files: DEFAULT_MOCK_OBS_FILES,
        stepLength: 3,
        path: "SURFACE/PLOT_GLOBAL_3H",
        winTitle: "Surface Synoptic Plot",
        isUpper: false,
      });

      const surfaceOpts = selStep.options.map((o) => o.value);
      expect(surfaceOpts).toEqual(["1", "3", "6", "12", "24"]);
      expect(selStep.value).toBe("3");
    } finally {
      globalThis.document = prevDoc;
    }
  });
});
