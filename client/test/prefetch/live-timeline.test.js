// live-timeline.test.js - Left/Right prefetch must use the live per-window
// timeline, not the frozen legacy global singleton.
import { describe, it, expect, afterEach } from "bun:test";
import {
  getPrefetchTargets,
  setLiveTimelineResolver,
  schedulePrefetch,
  cancelScheduledPrefetch,
} from "../../src/services/prefetchService.js";
import { clearDataCache } from "../../src/api/apiClient.js";

function nwpWin() {
  return {
    id: "win-live",
    period: 30,
    level: 500,
    forecastCycle: "26082820",
    isObservation: false,
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
}

function liveNwpAt30() {
  return {
    currentMode: "nwp",
    discretePeriods: [0, 6, 12, 18, 24, 30, 36, 42, 48],
    currentPeriodIdx: 5, // 30h — NOT the legacy default (24h)
    obsFiles: [],
    currentObsIdx: 0,
    currentInitCycle: "26082820",
  };
}

afterEach(() => {
  setLiveTimelineResolver(null);
  cancelScheduledPrefetch();
  clearDataCache();
});

describe("Live per-window timeline prefetch (left/right keyboard axis)", () => {
  it("resolves left/right from the live timeline instead of frozen defaults", () => {
    setLiveTimelineResolver(() => liveNwpAt30());
    const targets = getPrefetchTargets(nwpWin());
    expect(targets.left.period).toBe(24);
    expect(targets.right.period).toBe(36);
    expect(targets.left.items[0]).toMatchObject({ file: "26082820.024", direction: "left" });
    expect(targets.right.items[0]).toMatchObject({ file: "26082820.036", direction: "right" });
  });

  it("resolves obs left/right from live obs chips instead of mock defaults", () => {
    setLiveTimelineResolver(() => ({
      currentMode: "obs",
      discretePeriods: [],
      currentPeriodIdx: 0,
      obsFiles: ["20260904080000.000", "20260904110000.000", "20260904140000.000"],
      currentObsIdx: 1,
      currentInitCycle: "",
    }));
    const win = {
      id: "win-obs",
      isObservation: true,
      obsTime: "20260904110000.000",
      activeGroup: {
        id: "surface-plot",
        isObservation: true,
        layers: [{ type: "station", model: "SURFACE", element: "PLOT" }],
      },
      layers: [],
    };
    const targets = getPrefetchTargets(win);
    expect(targets.left.obsFile).toBe("20260904080000.000");
    expect(targets.right.obsFile).toBe("20260904140000.000");
    expect(targets.left.items[0]).toMatchObject({ file: "20260904080000.000", direction: "left" });
    expect(targets.right.items[0]).toMatchObject({ file: "20260904140000.000", direction: "right" });
  });

  it("explicit options.timelineSteps still wins over the resolver", () => {
    setLiveTimelineResolver(() => liveNwpAt30());
    const targets = getPrefetchTargets(nwpWin(), {
      timelineSteps: { mode: "nwp", periods: { prev: 6, current: 12, next: 18, cycle: "26082820" } },
    });
    expect(targets.left.period).toBe(6);
    expect(targets.right.period).toBe(18);
  });

  it("schedulePrefetch consumes win.prefetchDirections single-use for the hinted axis", async () => {
    const originalFetch = global.fetch;
    const fetchedUrls = [];
    global.fetch = async (url) => {
      fetchedUrls.push(String(url));
      return { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(8) };
    };
    try {
      setLiveTimelineResolver(() => liveNwpAt30());
      const win = nwpWin();
      win.prefetchDirections = ["prev"];
      schedulePrefetch(win, 5);
      expect(win.prefetchDirections).toBe(null); // consumed synchronously
      await new Promise((r) => setTimeout(r, 120));
      const joined = fetchedUrls.join("|");
      expect(joined).toContain("26082820.024"); // prev axis warmed
      expect(joined).not.toContain("26082820.036"); // next axis untouched
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("explicit options.directions wins and clears a stale win hint", async () => {
    const originalFetch = global.fetch;
    const fetchedUrls = [];
    global.fetch = async (url) => {
      fetchedUrls.push(String(url));
      return { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(8) };
    };
    try {
      setLiveTimelineResolver(() => liveNwpAt30());
      const win = nwpWin();
      win.prefetchDirections = ["prev"]; // stale hint from an earlier action
      schedulePrefetch(win, 5, { directions: ["next"] });
      expect(win.prefetchDirections).toBe(null);
      await new Promise((r) => setTimeout(r, 120));
      const joined = fetchedUrls.join("|");
      expect(joined).toContain("26082820.036");
      expect(joined).not.toContain("26082820.024");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
