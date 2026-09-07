// prefetch.test.js - Comprehensive test suite for 3-minute TTL cache and Left/Right/Up/Down prefetch
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  fetchJson,
  fetchBinary,
  clearDataCache,
  getCachedEntry,
  isCached,
  pruneExpiredCache,
  getCacheStats,
  setCacheTTL,
  DEFAULT_CACHE_TTL_MS,
  buildUrl,
} from "../src/api/apiClient.js";
import {
  getAdjacentTimeSteps,
  setTimelineMode,
  setStepLength,
} from "../src/ui/timeSlider.js";
import {
  getPrefetchTargets,
  prefetchSurroundingData,
  schedulePrefetch,
  cancelScheduledPrefetch,
  VERTICAL_LEVELS,
} from "../src/services/prefetchService.js";

describe("1. 3-Minute TTL Cache & Network Deduplication (apiClient.js)", () => {
  let originalFetch;

  beforeEach(() => {
    clearDataCache();
    setCacheTTL(DEFAULT_CACHE_TTL_MS);
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearDataCache();
  });

  it("DEFAULT_CACHE_TTL_MS is strictly 3 minutes (180,000 ms)", () => {
    expect(DEFAULT_CACHE_TTL_MS).toBe(180000);
  });

  it("fetchJson caches responses and serves subsequent calls from cache without network fetch", async () => {
    let networkCallCount = 0;
    global.fetch = async (url) => {
      networkCallCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ simulated: "gridData", url }),
      };
    };

    const res1 = await fetchJson("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.024" });
    expect(networkCallCount).toBe(1);
    expect(res1.simulated).toBe("gridData");

    // Second call with same parameters should hit cache directly
    const res2 = await fetchJson("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.024" });
    expect(networkCallCount).toBe(1);
    expect(res2).toEqual(res1);

    // Call with different file should trigger another fetch
    await fetchJson("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.030" });
    expect(networkCallCount).toBe(2);
  });

  it("stable query string sorting produces identical cache key regardless of param property order", async () => {
    let networkCallCount = 0;
    global.fetch = async () => {
      networkCallCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ value: 42 }),
      };
    };

    await fetchJson("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.024" });
    // Same params but reversed object key order
    await fetchJson("/api/data/grid", { file: "26082820.024", path: "ECMWF_HR/TMP/500" });

    expect(networkCallCount).toBe(1);
  });

  it("in-flight requests are deduplicated and share the same Promise", async () => {
    let networkCallCount = 0;
    let resolveNetwork;

    global.fetch = () => {
      networkCallCount++;
      return new Promise((resolve) => {
        resolveNetwork = () =>
          resolve({
            ok: true,
            status: 200,
            json: async () => ({ deduplicated: true }),
          });
      });
    };

    // Fire two requests concurrently before network resolves
    const req1 = fetchJson("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.024" });
    const req2 = fetchJson("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.024" });

    expect(networkCallCount).toBe(1);

    resolveNetwork();
    const [data1, data2] = await Promise.all([req1, req2]);

    expect(data1.deduplicated).toBe(true);
    expect(data2.deduplicated).toBe(true);
    expect(networkCallCount).toBe(1);
  });

  it("cache drops / invalidates entries after 3 minutes (180,000 ms)", async () => {
    let networkCallCount = 0;
    global.fetch = async () => {
      networkCallCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ call: networkCallCount }),
      };
    };

    const startTime = 1700000000000;
    const originalNow = Date.now;
    let currentTime = startTime;
    Date.now = () => currentTime;

    try {
      const data1 = await fetchJson("/api/data/grid", { path: "ECMWF/HGT/500", file: "run.024" });
      expect(data1.call).toBe(1);
      expect(networkCallCount).toBe(1);

      // Fast forward time by 2 minutes (120,000 ms) -> still within 3 min TTL
      currentTime = startTime + 120000;
      const data2 = await fetchJson("/api/data/grid", { path: "ECMWF/HGT/500", file: "run.024" });
      expect(data2.call).toBe(1);
      expect(networkCallCount).toBe(1);

      // Fast forward past 3 minutes (180,001 ms) -> TTL expired!
      currentTime = startTime + 180001;
      expect(isCached("/api/data/grid", { path: "ECMWF/HGT/500", file: "run.024" })).toBe(false);

      const data3 = await fetchJson("/api/data/grid", { path: "ECMWF/HGT/500", file: "run.024" });
      expect(data3.call).toBe(2);
      expect(networkCallCount).toBe(2);
    } finally {
      Date.now = originalNow;
    }
  });

  it("pruneExpiredCache removes expired entries and retains valid entries", async () => {
    const startTime = 1700000000000;
    const originalNow = Date.now;
    let currentTime = startTime;
    Date.now = () => currentTime;

    try {
      // Manually simulate cache with 3 min TTL
      setCacheTTL(180000);
      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

      // Populate item 1 at t=0
      await fetchJson("/item1");

      // Advance by 2 minutes, populate item 2
      currentTime = startTime + 120000;
      await fetchJson("/item2");

      // Advance to 3.5 minutes (t=210,000 ms)
      currentTime = startTime + 210000;
      // Item 1 expired (age 3.5m > 3m), item 2 still valid (age 1.5m < 3m)
      const pruned = pruneExpiredCache(currentTime);
      expect(pruned).toBe(1);
      expect(isCached("/item1")).toBe(false);
      expect(isCached("/item2")).toBe(true);
    } finally {
      Date.now = originalNow;
    }
  });

  it("fetchBinary caches ArrayBuffer and returns independent clones", async () => {
    let networkCallCount = 0;
    const sampleBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    global.fetch = async () => {
      networkCallCount++;
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => sampleBytes.buffer.slice(0),
      };
    };

    const buf1 = await fetchBinary("/api/data/grid/binary", { path: "ECMWF_HR/TMP/500", file: "26082820.024" });
    expect(networkCallCount).toBe(1);
    expect(new Uint8Array(buf1)).toEqual(sampleBytes);

    // Second call should return cached clone
    const buf2 = await fetchBinary("/api/data/grid/binary", { path: "ECMWF_HR/TMP/500", file: "26082820.024" });
    expect(networkCallCount).toBe(1);
    expect(buf1).not.toBe(buf2); // Independent ArrayBuffer reference
    expect(new Uint8Array(buf2)).toEqual(sampleBytes);

    // Modifying buf1 must not corrupt cache or buf2
    new Uint8Array(buf1)[0] = 99;
    expect(new Uint8Array(buf2)[0]).toBe(1);
  });

  it("failed network requests are not cached", async () => {
    let attempts = 0;
    global.fetch = async () => {
      attempts++;
      if (attempts === 1) {
        return { ok: false, status: 500, statusText: "Internal Server Error" };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ recovered: true }),
      };
    };

    await expect(fetchJson("/api/data/grid", { path: "ERR", file: "000" })).rejects.toThrow();
    expect(isCached("/api/data/grid", { path: "ERR", file: "000" })).toBe(false);

    // Subsequent request retries over network and succeeds
    const recovered = await fetchJson("/api/data/grid", { path: "ERR", file: "000" });
    expect(recovered.recovered).toBe(true);
    expect(attempts).toBe(2);
  });

  it("fetchJson clones JSON responses so caller mutation does not corrupt cached data", async () => {
    let networkCallCount = 0;
    global.fetch = async () => {
      networkCallCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          metadata: { level: 500 },
          features: [{ id: 1, name: "StationA" }],
        }),
      };
    };

    const res1 = await fetchJson("/api/data/station", { path: "UPPER_AIR/PLOT/500", file: "run1" });
    expect(networkCallCount).toBe(1);
    expect(res1.features.length).toBe(1);

    // Caller mutates returned object
    res1.features.push({ id: 2, name: "MutatedStation" });
    res1.metadata.level = 999;
    expect(res1.features.length).toBe(2);

    // Second call should return pristine cached data
    const res2 = await fetchJson("/api/data/station", { path: "UPPER_AIR/PLOT/500", file: "run1" });
    expect(networkCallCount).toBe(1);
    expect(res2.features.length).toBe(1);
    expect(res2.features[0].name).toBe("StationA");
    expect(res2.metadata.level).toBe(500);
  });

  it("isCached and buildUrl correctly handle existing query strings merged with parameters", () => {
    const url1 = buildUrl("/api/data/grid?existing=1", { path: "ECMWF", file: "024" });
    const url2 = buildUrl("/api/data/grid", { file: "024", existing: "1", path: "ECMWF" });
    expect(url1).toBe(url2);
    expect(url1).toBe("/api/data/grid?existing=1&file=024&path=ECMWF");

    // Test isCached with full url and endpoint+params
    clearDataCache();
    expect(isCached(url1)).toBe(false);
  });
});

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

describe("4. End-to-End Prefetch Execution (prefetchSurroundingData)", () => {
  let originalFetch;
  const fetchedUrls = [];

  beforeEach(() => {
    clearDataCache();
    fetchedUrls.length = 0;
    originalFetch = global.fetch;
    global.fetch = async (url) => {
      fetchedUrls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "ok", url }),
        arrayBuffer: async () => new ArrayBuffer(16),
      };
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearDataCache();
  });

  it("prefetches Left, Right, Up, Down data and populates cache so keyboard shortcuts hit 0ms cache", async () => {
    const win = {
      id: "win-e2e",
      period: 24,
      level: 500,
      forecastCycle: "26082820",
      activeGroup: {
        id: "ecmwf-500",
        hasLevel: true,
        defaultLevel: 500,
        layers: [
          { type: "contour", model: "ECMWF_HR", element: "TMP", level: 500 },
        ],
      },
      layers: [],
    };

    setTimelineMode("nwp", {
      period: 24,
      cycles: ["26082820"],
      stepLength: 6,
    });

    const stats = await prefetchSurroundingData(win);
    expect(stats.prefetchedCount).toBeGreaterThanOrEqual(4); // Left(18h), Right(30h), Up(400hPa), Down(700hPa)
    expect(stats.successfulCount).toBeGreaterThanOrEqual(4);

    // Verify all 4 endpoints are in cache
    expect(isCached("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.018" })).toBe(true); // Left
    expect(isCached("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.030" })).toBe(true); // Right
    expect(isCached("/api/data/grid", { path: "ECMWF_HR/TMP/400", file: "26082820.024" })).toBe(true); // Up
    expect(isCached("/api/data/grid", { path: "ECMWF_HR/TMP/700", file: "26082820.024" })).toBe(true); // Down

    const networkCountBeforeShortcut = fetchedUrls.length;

    // Simulate user pressing Left arrow (lead time becomes 18h)
    const leftData = await fetchJson("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.018" });
    expect(leftData.status).toBe("ok");
    // ZERO additional network requests made!
    expect(fetchedUrls.length).toBe(networkCountBeforeShortcut);

    // Simulate user pressing Up arrow (level becomes 400hPa)
    const upData = await fetchJson("/api/data/grid", { path: "ECMWF_HR/TMP/400", file: "26082820.024" });
    expect(upData.status).toBe("ok");
    // ZERO additional network requests made!
    expect(fetchedUrls.length).toBe(networkCountBeforeShortcut);
  });

  it("handles network failure during prefetch silently without throwing", async () => {
    global.fetch = async () => {
      throw new Error("Temporary network timeout");
    };

    const win = {
      period: 24,
      level: 500,
      forecastCycle: "26082820",
      activeGroup: {
        hasLevel: true,
        layers: [{ type: "contour", model: "ECMWF_HR", element: "TMP", level: 500 }],
      },
      layers: [],
    };

    // Should complete cleanly and not throw
    const result = await prefetchSurroundingData(win);
    expect(result.successfulCount).toBe(0);
  });

  it("supports independent per-window debounce timers without cancelling each other", async () => {
    let winAPrefetched = false;
    let winBPrefetched = false;

    const winA = {
      id: "win-A",
      period: 24,
      level: 500,
      forecastCycle: "26082820",
      activeGroup: {
        hasLevel: true,
        layers: [{ type: "contour", model: "ECMWF_HR", element: "TMP", level: 500 }],
      },
      layers: [],
    };

    const winB = {
      id: "win-B",
      period: 24,
      level: 850,
      forecastCycle: "26082820",
      activeGroup: {
        hasLevel: true,
        layers: [{ type: "contour", model: "ECMWF_HR", element: "HGT", level: 850 }],
      },
      layers: [],
    };

    global.fetch = async (url) => {
      if (url.includes("TMP")) winAPrefetched = true;
      if (url.includes("HGT")) winBPrefetched = true;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      };
    };

    // Schedule both windows with short debounce
    schedulePrefetch(winA, 20);
    schedulePrefetch(winB, 20);

    // Wait for debounce timers to fire
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(winAPrefetched).toBe(true);
    expect(winBPrefetched).toBe(true);
  });
});
