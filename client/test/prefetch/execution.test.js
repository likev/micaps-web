// execution.test.js - End-to-End Prefetch Execution (prefetchSurroundingData)
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  fetchJson,
  clearDataCache,
  isCached,
} from "../../src/api/apiClient.js";
import {
  setTimelineMode,
} from "../../src/ui/timeSlider.js";
import {
  prefetchSurroundingData,
  schedulePrefetch,
  cancelScheduledPrefetch,
} from "../../src/services/prefetchService.js";

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
