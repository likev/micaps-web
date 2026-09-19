// loader.test.js - Unit tests for timeHeightLoader.js
import { describe, test, expect, beforeEach, mock } from "bun:test";
import {
  buildLeads,
  formatGridFileName,
  getThGridCache,
  clearThGridCache,
  loadTimeHeightMatrix,
  buildProfileMatrix,
  PROFILE_LEVELS,
} from "../../src/layers/timeheight/timeHeightLoader.js";

describe("Time-Height Loader & Bulk Fetching", () => {
  let mockWin;

  beforeEach(() => {
    mockWin = { _thGridCache: new Map(), loadSeq: 1 };
  });

  test("buildLeads produces correct 13 leads for standard 0-144h @12h", () => {
    const leads = buildLeads(0, 144, 12);
    expect(leads).toEqual([0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 132, 144]);
    expect(leads.length).toBe(13);
  });

  test("buildLeads clamps bounds, validates step, and enforces 41 column limit", () => {
    // Unsupported step length falls back to 12
    const leadsBadStep = buildLeads(0, 48, 7);
    expect(leadsBadStep).toEqual([0, 12, 24, 36, 48]);

    // start >= end adjusts end
    const leadsInverted = buildLeads(48, 24, 12);
    expect(leadsInverted[0]).toBe(48);
    expect(leadsInverted[1]).toBe(60);

    // Fine step 1h over 0-120h would be 121 leads, but capped at 41
    const fineLeads = buildLeads(0, 120, 1);
    expect(fineLeads.length).toBe(41);
    expect(fineLeads[0]).toBe(0);
    expect(fineLeads[40]).toBe(40);
  });

  test("formatGridFileName formats cycle and padded lead hour", () => {
    expect(formatGridFileName("26091808", 0)).toBe("26091808.000");
    expect(formatGridFileName("26091808", 24)).toBe("26091808.024");
    expect(formatGridFileName("26091808", 144)).toBe("26091808.144");
  });

  test("Window-scoped grid cache isolates separate windows and clears correctly", () => {
    const win1 = { _thGridCache: new Map() };
    const win2 = { _thGridCache: new Map() };

    const cache1 = getThGridCache(win1);
    const cache2 = getThGridCache(win2);

    cache1.set("key1", { data: { val: 1 }, ts: Date.now() });
    expect(cache1.has("key1")).toBe(true);
    expect(cache2.has("key1")).toBe(false);

    clearThGridCache(win1);
    expect(cache1.size).toBe(0);
  });

  test("buildProfileMatrix handles present and missing data with NaN and stats", () => {
    const cycle = "26091808";
    const leads = [0, 12];
    const levels = [850, 500];
    const point = { lon: 120.0, lat: 30.0, i: 10, j: 10 };
    const gridMap = new Map();

    // Add mock RH for 850 hPa at lead 0
    gridMap.set("ECMWF_HR/RH/850|26091808.000", {
      header: {
        n_lon: 2, n_lat: 2, start_lon: 119.0, end_lon: 121.0, d_lon: 2.0,
        start_lat: 31.0, end_lat: 29.0, d_lat: -2.0, element: "RH",
      },
      values: [70, 70, 70, 70],
    });

    const matrix = buildProfileMatrix({
      cycle,
      leads,
      levels,
      point,
      model: "ECMWF_HR",
      gridMap,
    });

    expect(matrix.point).toEqual(point);
    expect(matrix.leads).toEqual(leads);
    expect(matrix.levels).toEqual(levels);

    // Level 0 (850), lead 0 (0h) has value 70
    expect(matrix.rh[0][0]).toBeCloseTo(70, 1);
    // Level 0 (850), lead 1 (12h) is missing -> NaN
    expect(Number.isNaN(matrix.rh[0][1])).toBe(true);
    // Missing count recorded
    expect(matrix.missing.rh).toBeGreaterThan(0);
    expect(matrix.stats.rhMin).toBeCloseTo(70, 1);
    expect(matrix.stats.rhMax).toBeCloseTo(70, 1);
  });

  test("loadTimeHeightMatrix aborts when cancelled and does not overwrite matrix", async () => {
    let cancelledFlag = false;
    const progressList = [];

    const promise = loadTimeHeightMatrix({
      win: mockWin,
      cycle: "26091808",
      leads: [0, 12, 24, 36],
      levels: [500],
      point: { lon: 120, lat: 30 },
      isCancelled: () => cancelledFlag,
      onProgress: (p) => progressList.push(p),
    });

    // Cancel after first tick
    cancelledFlag = true;
    const res = await promise;

    expect(res.cancelled).toBe(true);
    expect(res.matrix).toBeNull();
  });
});
