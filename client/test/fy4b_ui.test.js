// fy4b_ui.test.js - FY-4B: channel labels, 15 min step, group-level stepping
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatFy4bChannel, FY4B_CHANNELS } from "../src/utils/fy4bChannels.js";
import { formatObsChipLabel, formatObsTimestamp } from "../src/utils/formatters.js";
import { parseTimestamp } from "../src/utils/timeResolver.js";
import {
  filterObsFilesByStep,
  getObsStepOptions,
  formatStepLabel,
  isSatelliteGroup,
} from "../src/ui/timeline/timelineMath.js";

const src = (p) => readFileSync(resolve(import.meta.dir, "../src", p), "utf8");

describe("FY-4B channel labels", () => {
  it("covers all 15 channels with wavelength and band", () => {
    expect(Object.keys(FY4B_CHANNELS)).toHaveLength(15);
    expect(formatFy4bChannel(1)).toBe("C001 \u00b7 0.47\u00b5m Vis \u00b7 Blue");
    expect(formatFy4bChannel(8)).toContain("6.25\u00b5m Vapor");
    expect(formatFy4bChannel(12)).toContain("C012 \u00b7 10.8\u00b5m IR");
  });
  it("falls back for out-of-range values", () => {
    expect(formatFy4bChannel(99)).toBe("99");
  });
});

describe("15 min step", () => {
  // 15-min cadence, two hours (UTC)
  const files = [];
  for (let m = 0; m <= 120; m += 15) {
    const h = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    files.push(`20261016${h}${mm}00`);
  }
  it("only satellite groups offer 0.25", () => {
    expect(getObsStepOptions({ isSatellite: true })[0]).toBe(0.25);
    expect(getObsStepOptions({})).not.toContain(0.25);
    expect(getObsStepOptions({ isUpper: true })).not.toContain(0.25);
    expect(formatStepLabel(0.25)).toBe("15min");
    expect(formatStepLabel(3)).toBe("3h");
  });
  it("detects satellite groups", () => {
    expect(isSatelliteGroup({ layers: [{ model: "SATELLITE" }] })).toBe(true);
    expect(isSatelliteGroup({ layers: [{ path: "SATELLITE/FY4B/L1/CHINA" }] })).toBe(true);
    expect(isSatelliteGroup({ layers: [{ model: "SURFACE" }] })).toBe(false);
  });
  it("0.25 keeps every 15 min file, 1h keeps only on-the-hour files", () => {
    expect(filterObsFilesByStep(files, 0.25)).toHaveLength(files.length);
    const hourly = filterObsFilesByStep(files, 1);
    expect(hourly).toHaveLength(3);
    hourly.forEach((f) => expect(f.slice(10, 12)).toBe("00"));
  });
});

describe("select wiring", () => {
  it("TimeSlider builds step options from the shared helper", () => {
    const s = src("components/TimeSlider.svelte");
    expect(s).toContain("getObsStepOptions");
    expect(s).toContain("parseFloat(e.target.value)");
  });
  it("Up/Down steps through the active group's own level list", () => {
    const s = src("App.svelte");
    expect(s).toContain("levelsFor");
    expect(s).toContain("activeGroup?.levels");
  });
  it("NavBar uses detailed FY-4B channel labels", () => {
    expect(src("components/NavBar.svelte")).toContain("formatFy4bChannel(lvl)");
  });
});

describe("satellite timeline-chip timezone (UTC+8 / BJT)", () => {
  it("parses FY-4B filename timestamps aligned with UTC+8", () => {
    const fn = "C012_20261016114500_FY4B.AWX";
    const ts = parseTimestamp(fn);
    expect(ts).toBe(Date.UTC(2026, 9, 16, 11, 45, 0));
    expect(formatObsChipLabel(fn)).toBe("10/16 11:45");
    expect(formatObsTimestamp(fn)).toBe("2026-10-16 11:45 (UTC+8)");
  });

  it("parses FY-2G filename timestamps aligned with UTC+8", () => {
    const fn = "CTT_MLT_OTG_20261016_1000_FY2G.AWX";
    const ts = parseTimestamp(fn);
    expect(ts).toBe(Date.UTC(2026, 9, 16, 10, 0, 0));
    expect(formatObsChipLabel(fn)).toBe("10/16 10:00");
    expect(formatObsTimestamp(fn)).toBe("2026-10-16 10:00 (UTC+8)");
  });
});
