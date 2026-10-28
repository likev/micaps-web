// satellite_step_preserve.test.js - Up/Down (channel/level) steps must keep the user's
// step-length (e.g. 15 min) and time position; only a fresh load jumps to latest @ default step.
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { loadWeatherField } from "../src/services/weatherLoader.js";
import { syncObservationTimeline, matchCurrentObsFile } from "../src/utils/timelineSync.js";
import { filterObsFilesByStep } from "../src/ui/timeline/timelineMath.js";
import { clearDataCache } from "../src/api/apiClient.js";
import { createMockMap } from "./helpers/mockMap.js";

const p2 = (n) => String(n).padStart(2, "0");
function fy4bFiles(ch) {
  const out = [];
  for (let m = 0; m < 24 * 4; m++) {
    const t = new Date(Date.UTC(2026, 9, 27, 0, 0) + m * 15 * 60000);
    const ts = `${t.getUTCFullYear()}${p2(t.getUTCMonth() + 1)}${p2(t.getUTCDate())}${p2(t.getUTCHours())}${p2(t.getUTCMinutes())}00`;
    out.push({ name: `C${String(ch).padStart(3, "0")}_${ts}_FY4B.AWX`, size: 5000 });
  }
  return out;
}

const PATH = "SATELLITE/FY4B/L1/CHINA";
const LATEST_C013 = "C013_20261027234500_FY4B.AWX";

describe("satellite step length / time position on vertical (channel) step", () => {
  let originalFetch;
  beforeEach(() => {
    clearDataCache();
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const u = new URL(String(url), "http://x");
      const lvl = Number(u.searchParams.get("level") || 12);
      if (u.pathname === "/api/catalog/tree") return new Response(JSON.stringify(fy4bFiles(lvl)), { status: 200 });
      return new Response(JSON.stringify({ error: "n/a" }), { status: 404 });
    };
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearDataCache();
  });

  function levelStepWin(step) {
    const f = "C012_20261027120000_FY4B.AWX";
    return {
      id: "w-sat",
      isObservation: true,
      level: 13,
      stepLength: step,
      obsTime: f,
      _obsTimeline: { file: f, files: [], stepLength: step, path: PATH },
      activeGroup: { id: "preset-fy4b_china_grouped", hasLevel: true, levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
    };
  }

  for (const step of [0.25, 1, 3, 6]) {
    it(`loadWeatherField level step keeps ${step}h step and same timestamp`, async () => {
      const win = levelStepWin(step);
      await loadWeatherField(createMockMap(), "SATELLITE", "FY4B/L1/CHINA", 13, 0, { path: PATH, isObservation: true, id: "layer-fy4b" }, win, false);
      expect(win.stepLength).toBe(step);
      expect(win._obsTimeline.stepLength).toBe(step);
      expect(win.obsTime).toBe("C013_20261027120000_FY4B.AWX");
    });
  }

  it("fresh load (no timeline/file) still jumps to latest at the default step (3h -> 21:00)", async () => {
    const win = { id: "w-fresh", isObservation: true, level: 12, stepLength: 0.25, obsTime: null, _obsTimeline: null };
    await loadWeatherField(createMockMap(), "SATELLITE", "FY4B/L1/CHINA", 12, 0, { path: PATH, isObservation: true, id: "layer-fy4b" }, win, false);
    expect(win.stepLength).toBe(3);
    expect(win.obsTime).toBe("C012_20261027210000_FY4B.AWX");
  });

  it("syncObservationTimeline accepts the 15 min step for satellite paths", async () => {
    const win = { id: "w1", stepLength: 0.25, obsTime: null };
    await syncObservationTimeline(PATH, "C012_20261027140000_FY4B.AWX", "FY4B", win, { forceLatest: false, level: 12 });
    expect(win._obsTimeline.stepLength).toBe(0.25);
  });

  it("upper-air valid steps are unchanged (6 kept, 3 coerced to 12)", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify([
      { name: "20261027080000.000", size: 5000 }, { name: "20261027200000.000", size: 5000 },
    ]), { status: 200 });
    const w6 = { id: "u6", stepLength: 6 };
    await syncObservationTimeline("UPPER_AIR/PLOT/500", null, "500 hPa Upper-Air Sounding", w6, { forceLatest: false });
    expect(w6._obsTimeline.stepLength).toBe(6);
    clearDataCache();
    const w3 = { id: "u3", stepLength: 3 };
    await syncObservationTimeline("UPPER_AIR/PLOT/500", null, "500 hPa Upper-Air Sounding", w3, { forceLatest: false });
    expect(w3._obsTimeline.stepLength).toBe(12);
  });

  describe("matchCurrentObsFile", () => {
    const list = ["C013_20261027130000_FY4B.AWX", "C013_20261027131500_FY4B.AWX", "C013_20261027150000_FY4B.AWX"];
    it("exact name wins", () => {
      expect(matchCurrentObsFile(list[1], list, true)).toBe(list[1]);
    });
    it("maps sibling channel by timestamp (satellite)", () => {
      expect(matchCurrentObsFile("C012_20261027131500_FY4B.AWX", list, true)).toBe(list[1]);
    });
    it("nearest scan within 1h when the timestamp is missing", () => {
      expect(matchCurrentObsFile("C012_20261027133000_FY4B.AWX", list, true)).toBe(list[1]);
    });
    it("returns null beyond 1h, for non-satellite, or without a file", () => {
      expect(matchCurrentObsFile("C012_20261027180000_FY4B.AWX", list, true)).toBeNull();
      expect(matchCurrentObsFile("C012_20261027131500_FY4B.AWX", list, false)).toBeNull();
      expect(matchCurrentObsFile(null, list, true)).toBeNull();
    });
  });

  describe("filterObsFilesByStep on 15-minute satellite data", () => {
    const raw15m = fy4bFiles(12).map((f) => f.name);

    it("0.25h keeps all 15-minute files", () => {
      const res = filterObsFilesByStep(raw15m, 0.25);
      expect(res).toHaveLength(96);
    });

    it("1h keeps all on-the-hour files (24 files), never minutes", () => {
      const res = filterObsFilesByStep(raw15m, 1);
      expect(res).toHaveLength(24);
      res.forEach((f) => expect(f.slice(15, 17)).toBe("00"));
    });

    it("3h keeps on-the-hour clock files (00, 03, 06, ...), never 02:30 or 05:00", () => {
      const res = filterObsFilesByStep(raw15m, 3);
      expect(res).toHaveLength(8);
      const hours = res.map((f) => parseInt(f.slice(13, 15), 10));
      expect(hours).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);
      res.forEach((f) => expect(f.slice(15, 17)).toBe("00"));
    });

    it("6h keeps on-the-hour clock files (00, 06, 12, 18), never non-zero minutes", () => {
      const res = filterObsFilesByStep(raw15m, 6);
      expect(res).toHaveLength(4);
      const hours = res.map((f) => parseInt(f.slice(13, 15), 10));
      expect(hours).toEqual([0, 6, 12, 18]);
      res.forEach((f) => expect(f.slice(15, 17)).toBe("00"));
    });

    it("12h keeps on-the-hour clock files (00, 12)", () => {
      const res = filterObsFilesByStep(raw15m, 12);
      expect(res).toHaveLength(2);
      const hours = res.map((f) => parseInt(f.slice(13, 15), 10));
      expect(hours).toEqual([0, 12]);
      res.forEach((f) => expect(f.slice(15, 17)).toBe("00"));
    });
  });
});
