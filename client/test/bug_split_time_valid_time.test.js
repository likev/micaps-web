// bug_split_time_valid_time.test.js - Unit tests verifying NWP valid time synchronization in split time mode
import { describe, it, expect } from "bun:test";
import {
  applyAutoAllocation,
  createDefaultTab,
  createDefaultWindow,
  stepCycleHours,
} from "../src/lib/stores/tabsCore.js";
import { formatForecastValidTime } from "../src/utils/formatters.js";
import { computeFullWindowTitle } from "../src/ui/tabs/windowTitles.js";

describe("Bug 1 Fix: NWP Valid Time Synchronization in Split Time Mode", () => {
  it("allocates stepped forecastCycles and periods such that Valid Time is identical across all split windows", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x2";
    tab.windows = [
      createDefaultWindow(0, 1),
      createDefaultWindow(1, 1),
      createDefaultWindow(2, 1),
      createDefaultWindow(3, 1),
    ];

    const baseWin = tab.windows[0];
    baseWin.element = "TMP";
    baseWin.model = "ECMWF_HR";
    baseWin.level = 850;
    baseWin.forecastCycle = "2024010208";
    baseWin.period = 24;

    applyAutoAllocation(tab, "time", baseWin);

    expect(tab.windows.length).toBe(4);

    // Extract target valid time date-hour (ignoring the lead-time (+XXh) suffix)
    const getTargetValidMoment = (cycle, period) => {
      const formatted = formatForecastValidTime(cycle, period);
      return formatted.replace(/\s*\(\+\d+h\)$/, "");
    };

    // Base window valid time: 2024-01-02 08:00 + 24h = 2024-01-03 08:00 (UTC+8)
    const baseTargetTime = getTargetValidMoment(baseWin.forecastCycle, baseWin.period);
    expect(baseTargetTime).toBe("2024-01-03 08:00 (UTC+8)");

    for (let i = 0; i < tab.windows.length; i++) {
      const win = tab.windows[i];
      const expectedCycle = stepCycleHours("2024010208", -i * 12);
      const expectedPeriod = 24 + i * 12;

      expect(win.forecastCycle).toBe(expectedCycle);
      expect(win.period).toBe(expectedPeriod);

      const winTargetTime = getTargetValidMoment(win.forecastCycle, win.period);
      expect(winTargetTime).toBe(baseTargetTime);
    }
  });

  it("updates window titles so all visible split windows reflect matching valid times", () => {
    const tab = createDefaultTab(1);
    tab.layout = "1x2";
    tab.windows = [
      createDefaultWindow(0, 1),
      createDefaultWindow(1, 1),
    ];

    const win0 = tab.windows[0];
    const win1 = tab.windows[1];

    win0.baseTitle = "ECMWF 850 hPa TMP";
    win0.element = "TMP";
    win0.model = "ECMWF_HR";
    win0.level = 850;
    win0.forecastCycle = "2024010208";
    win0.period = 12;

    win1.baseTitle = "ECMWF 850 hPa TMP";

    applyAutoAllocation(tab, "time", win0);

    const title0 = computeFullWindowTitle(win0);
    const title1 = computeFullWindowTitle(win1);

    // Win 0: Cycle 2024010208, Period 12 -> Valid 2024-01-02 20:00 (UTC+8) (+012h)
    // Win 1: Cycle 2024010120, Period 24 -> Valid 2024-01-02 20:00 (UTC+8) (+024h)
    expect(title0).toContain("Valid: 2024-01-02 20:00 (UTC+8)");
    expect(title1).toContain("Valid: 2024-01-02 20:00 (UTC+8)");
    expect(win0.forecastCycle).toBe("2024010208");
    expect(win0.period).toBe(12);
    expect(win1.forecastCycle).toBe("2024010120");
    expect(win1.period).toBe(24);
  });

  it("dynamically respects forecast cycle intervals (e.g. 6h GFS model) from forecastCycles", () => {
    const tab = createDefaultTab(1);
    tab.layout = "1x2";
    tab.windows = [
      createDefaultWindow(0, 1),
      createDefaultWindow(1, 1),
    ];

    const win0 = tab.windows[0];
    win0.element = "TMP";
    win0.model = "GFS";
    win0.level = 500;
    win0.forecastCycle = "2024010218";
    win0.period = 24;
    // 6h cycles available
    win0.forecastCycles = ["2024010218", "2024010212", "2024010206", "2024010200"];

    applyAutoAllocation(tab, "time", win0);

    const win1 = tab.windows[1];
    expect(win0.forecastCycle).toBe("2024010218");
    expect(win0.period).toBe(24);
    // Win 1 should step by 6h to 2024010212 and period +6h to 30h
    expect(win1.forecastCycle).toBe("2024010212");
    expect(win1.period).toBe(30);

    const getTargetValidMoment = (cycle, period) => {
      const formatted = formatForecastValidTime(cycle, period);
      return formatted.replace(/\s*\(\+\d+h\)$/, "");
    };
    expect(getTargetValidMoment(win1.forecastCycle, win1.period)).toBe(getTargetValidMoment(win0.forecastCycle, win0.period));
  });
});
