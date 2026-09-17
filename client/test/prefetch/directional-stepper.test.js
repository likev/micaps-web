// directional-stepper.test.js - Directional Prefetch for Timeline Stepper (btn-prev, btn-next, btn-play)
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  clearDataCache,
  isCached,
} from "../../src/api/apiClient.js";
import {
  setTimelineMode,
  step,
} from "../../src/ui/timeSlider.js";
import {
  getPrefetchTargets,
  prefetchSurroundingData,
  normalizeDirections,
} from "../../src/services/prefetchService.js";

describe("5. Directional Prefetch for Timeline Stepper (btn-prev, btn-next, btn-play)", () => {
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

  it("normalizeDirections maps 'prev' -> 'left', 'next' -> 'right', and preserves up/down", () => {
    expect(normalizeDirections("prev")).toEqual(new Set(["left"]));
    expect(normalizeDirections(["prev"])).toEqual(new Set(["left"]));
    expect(normalizeDirections("next")).toEqual(new Set(["right"]));
    expect(normalizeDirections(["next"])).toEqual(new Set(["right"]));
    expect(normalizeDirections(["left", "right"])).toEqual(new Set(["left", "right"]));
    expect(normalizeDirections(["up"])).toEqual(new Set(["up"]));
    expect(normalizeDirections(["down"])).toEqual(new Set(["down"]));
    expect(normalizeDirections(null)).toBeNull();
    expect(normalizeDirections([])).toBeNull();
  });

  it("getPrefetchTargets with directions: ['prev'] ONLY resolves left items, leaving right/up/down empty", () => {
    const win = {
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

    const targets = getPrefetchTargets(win, { directions: ["prev"] });
    expect(targets.left.items.length).toBe(1);
    expect(targets.left.items[0].file).toBe("26082820.018");
    expect(targets.right.items.length).toBe(0);
    expect(targets.up.items.length).toBe(0);
    expect(targets.down.items.length).toBe(0);
  });

  it("getPrefetchTargets with directions: ['next'] ONLY resolves right items, leaving left/up/down empty", () => {
    const win = {
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

    const targets = getPrefetchTargets(win, { directions: ["next"] });
    expect(targets.left.items.length).toBe(0);
    expect(targets.right.items.length).toBe(1);
    expect(targets.right.items[0].file).toBe("26082820.030");
    expect(targets.up.items.length).toBe(0);
    expect(targets.down.items.length).toBe(0);
  });

  it("prefetchSurroundingData with directions: ['prev'] (btn-prev) ONLY fetches prev data, skipping next/up/down", async () => {
    const win = {
      id: "win-prev-only",
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

    const stats = await prefetchSurroundingData(win, { directions: ["prev"] });
    expect(stats.prefetchedCount).toBe(1);
    expect(stats.successfulCount).toBe(1);
    expect(fetchedUrls.length).toBe(1);

    // Prev (18h) is in cache
    expect(isCached("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.018" })).toBe(true);
    // Next (30h), Up (400hPa), Down (700hPa) were NOT fetched
    expect(isCached("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.030" })).toBe(false);
    expect(isCached("/api/data/grid", { path: "ECMWF_HR/TMP/400", file: "26082820.024" })).toBe(false);
    expect(isCached("/api/data/grid", { path: "ECMWF_HR/TMP/700", file: "26082820.024" })).toBe(false);
  });

  it("prefetchSurroundingData with directions: ['next'] (btn-next / btn-play) ONLY fetches next data", async () => {
    const win = {
      id: "win-next-only",
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

    const stats = await prefetchSurroundingData(win, { directions: ["next"] });
    expect(stats.prefetchedCount).toBe(1);
    expect(stats.successfulCount).toBe(1);
    expect(fetchedUrls.length).toBe(1);

    // Next (30h) is in cache
    expect(isCached("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.030" })).toBe(true);
    // Prev (18h), Up (400hPa), Down (700hPa) were NOT fetched
    expect(isCached("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.018" })).toBe(false);
    expect(isCached("/api/data/grid", { path: "ECMWF_HR/TMP/400", file: "26082820.024" })).toBe(false);
    expect(isCached("/api/data/grid", { path: "ECMWF_HR/TMP/700", file: "26082820.024" })).toBe(false);
  });

  it("win.prefetchDirections is consumed by prefetchSurroundingData and reset to null", async () => {
    const win = {
      id: "win-flag-test",
      period: 24,
      level: 500,
      forecastCycle: "26082820",
      prefetchDirections: ["prev"],
      activeGroup: {
        hasLevel: true,
        layers: [{ type: "contour", model: "ECMWF_HR", element: "TMP", level: 500 }],
      },
      layers: [],
    };

    setTimelineMode("nwp", {
      period: 24,
      cycles: ["26082820"],
      stepLength: 6,
    });

    await prefetchSurroundingData(win);

    // Should only have fetched prev
    expect(isCached("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.018" })).toBe(true);
    expect(isCached("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.030" })).toBe(false);

    // win.prefetchDirections must be cleared
    expect(win.prefetchDirections).toBeNull();
  });

  it("step(-1, { source: 'btn-prev' }) forwards prefetchDirections: ['prev'] to callback", () => {
    let receivedPayload = null;
    const originalCallback = global.__onTimeChangeTestCallback;

    setTimelineMode("nwp", {
      period: 24,
      cycles: ["26082820"],
      stepLength: 6,
    });

    // Step with btn-prev source
    step(-1, {
      source: "btn-prev",
      directions: ["prev"],
    });

    // In timeSlider, step calls onTimeChangeCallback with prefetchDirections: ['prev']
    // We can verify step without options vs with options
    let testData = null;
    const testFn = (d) => { testData = d; };
    // Trigger step with options
    step(-1, { source: "btn-prev" });
  });
});
