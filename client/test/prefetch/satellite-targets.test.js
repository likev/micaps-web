// satellite-targets.test.js - Unit tests for satellite prefetch target resolution & server warming
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  clearDataCache,
  isCached,
  getCacheStats,
  buildUrl,
} from "../../src/api/apiClient.js";
import {
  gridParams,
  warmServerCache,
  fetchGridData,
} from "../../src/api/catalogApi.js";
import {
  getPrefetchTargets,
  prefetchSurroundingData,
} from "../../src/services/prefetchService.js";
import {
  collectSatelliteItems,
  isSatelliteLayer,
} from "../../src/services/satellitePrefetch.js";
import { swapChannelPrefix } from "../../src/utils/fy4bChannels.js";
import { appState } from "../../src/store/appState.js";

describe("Satellite Prefetch Engine (satellite-prefetch-plan1.md)", () => {
  let originalFetch;
  const postedRequests = [];

  beforeEach(() => {
    clearDataCache();
    appState.set("historyMode", false);
    appState.set("historyDate", null);
    postedRequests.length = 0;
    originalFetch = global.fetch;
    global.fetch = async (url, opts = {}) => {
      postedRequests.push({ url, opts });
      return {
        ok: true,
        status: 202,
        json: async () => ({ accepted: 1, alreadyCached: 0, rejected: 0, disabled: false }),
        text: async () => JSON.stringify({ status: "ok" }),
      };
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearDataCache();
    appState.set("historyMode", false);
    appState.set("historyDate", null);
  });

  it("identifies satellite layers correctly via isSatelliteLayer", () => {
    expect(isSatelliteLayer({ model: "SATELLITE" })).toBe(true);
    expect(isSatelliteLayer({ type: "image" })).toBe(true);
    expect(isSatelliteLayer({ path: "SATELLITE/FY4B/L1/CHINA" })).toBe(true);
    expect(isSatelliteLayer({ path: "SATELLITE/FY2G/L2/CTT" })).toBe(true);
    expect(isSatelliteLayer(null, { model: "SATELLITE" })).toBe(true);
    expect(isSatelliteLayer({ model: "ECMWF_HR", path: "ECMWF_HR/TMP/500" })).toBe(false);
  });

  it("resolves FY-4B CHINA channel 12 neighbours: prev/next scan, sibling channels 11 & 13, no 400/700", () => {
    const win = {
      id: "win-fy4b",
      level: 12,
      obsTime: "C012_20261028120000_FY4B.AWX",
      isObservation: true,
      activeGroup: {
        id: "preset-fy4b_china_grouped",
        name: "FY-4B CHINA 15 Channels",
        hasLevel: true,
        defaultLevel: 12,
        levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        layers: [
          {
            type: "contour",
            model: "SATELLITE",
            element: "FY4B/L1/CHINA",
            path: "SATELLITE/FY4B/L1/CHINA",
            level: 12,
          },
        ],
      },
      layers: [],
    };

    const mockTimeline = {
      mode: "obs",
      obsFiles: {
        prev: "C012_20261028114500_FY4B.AWX",
        current: "C012_20261028120000_FY4B.AWX",
        next: "C012_20261028121500_FY4B.AWX",
      },
    };

    const targets = getPrefetchTargets(win, { timelineSteps: mockTimeline });

    // Left: prev scan, same channel
    expect(targets.left.items.length).toBe(1);
    expect(targets.left.items[0]).toMatchObject({
      type: "sat-grid",
      kind: "grid",
      path: "SATELLITE/FY4B/L1/CHINA",
      file: "C012_20261028114500_FY4B.AWX",
      level: "12",
      direction: "left",
    });

    // Right: next scan, same channel
    expect(targets.right.items.length).toBe(1);
    expect(targets.right.items[0]).toMatchObject({
      type: "sat-grid",
      kind: "grid",
      path: "SATELLITE/FY4B/L1/CHINA",
      file: "C012_20261028121500_FY4B.AWX",
      level: "12",
      direction: "right",
    });

    // Up: sibling channel N+1 (13), same timestamp
    expect(targets.up.level).toBe(13);
    expect(targets.up.items.length).toBe(1);
    expect(targets.up.items[0]).toMatchObject({
      type: "sat-grid",
      kind: "grid",
      path: "SATELLITE/FY4B/L1/CHINA",
      file: "C013_20261028120000_FY4B.AWX",
      level: "13",
      direction: "up",
    });

    // Down: sibling channel N-1 (11), same timestamp
    expect(targets.down.level).toBe(11);
    expect(targets.down.items.length).toBe(1);
    expect(targets.down.items[0]).toMatchObject({
      type: "sat-grid",
      kind: "grid",
      path: "SATELLITE/FY4B/L1/CHINA",
      file: "C011_20261028120000_FY4B.AWX",
      level: "11",
      direction: "down",
    });

    // Verify 400 and 700 are nowhere in targets
    expect(targets.up.level).not.toBe(400);
    expect(targets.down.level).not.toBe(700);
  });

  it("handles boundary channels cleanly (C001 has no down, C015 has no up) and supports DISK path", () => {
    // 1. C001 lower boundary
    const winC001 = {
      level: 1,
      obsTime: "C001_20261028120000_FY4B.AWX",
      activeGroup: {
        hasLevel: true,
        levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        layers: [{ type: "contour", model: "SATELLITE", path: "SATELLITE/FY4B/L1/DISK", level: 1 }],
      },
    };
    const mockTimeline = {
      mode: "obs",
      obsFiles: {
        prev: "C001_20261028114500_FY4B.AWX",
        current: "C001_20261028120000_FY4B.AWX",
        next: "C001_20261028121500_FY4B.AWX",
      },
    };
    const targets1 = getPrefetchTargets(winC001, { timelineSteps: mockTimeline });
    expect(targets1.up.level).toBe(2);
    expect(targets1.up.items.length).toBe(1);
    expect(targets1.up.items[0].file).toBe("C002_20261028120000_FY4B.AWX");
    expect(targets1.up.items[0].path).toBe("SATELLITE/FY4B/L1/DISK");
    expect(targets1.down.level).toBeNull();
    expect(targets1.down.items.length).toBe(0);

    // 2. C015 upper boundary
    const winC015 = {
      level: 15,
      obsTime: "C015_20261028120000_FY4B.AWX",
      activeGroup: {
        hasLevel: true,
        levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        layers: [{ type: "contour", model: "SATELLITE", path: "SATELLITE/FY4B/L1/DISK", level: 15 }],
      },
    };
    const targets15 = getPrefetchTargets(winC015, { timelineSteps: mockTimeline });
    expect(targets15.up.level).toBeNull();
    expect(targets15.up.items.length).toBe(0);
    expect(targets15.down.level).toBe(14);
    expect(targets15.down.items.length).toBe(1);
    expect(targets15.down.items[0].file).toBe("C014_20261028120000_FY4B.AWX");
  });

  it("handles hasLevel:false products (FY-2G CTT and Dust RGB image)", () => {
    // 1. FY-2G CTT (grid, no vertical level)
    const winCtt = {
      obsTime: "FY2G_CTT_202610281200.AWX",
      activeGroup: {
        hasLevel: false,
        layers: [{ type: "contour", model: "SATELLITE", path: "SATELLITE/FY2G/L2/CTT" }],
      },
    };
    const targetsCtt = getPrefetchTargets(winCtt, {
      timelineSteps: {
        mode: "obs",
        obsFiles: {
          prev: "FY2G_CTT_202610281100.AWX",
          current: "FY2G_CTT_202610281200.AWX",
          next: "FY2G_CTT_202610281300.AWX",
        },
      },
    });
    expect(targetsCtt.left.items.length).toBe(1);
    expect(targetsCtt.left.items[0]).toMatchObject({ kind: "grid", type: "sat-grid" });
    expect(targetsCtt.right.items.length).toBe(1);
    expect(targetsCtt.up.items.length).toBe(0);
    expect(targetsCtt.down.items.length).toBe(0);

    // 2. FY-2G Dust RGB (image, kind: image)
    const winDust = {
      obsTime: "FY2G_DST_RGB_20261028_0400.BMP",
      activeGroup: {
        hasLevel: false,
        layers: [{ type: "image", model: "SATELLITE", path: "SATELLITE/FY2G/L2/DUST" }],
      },
    };
    const targetsDust = getPrefetchTargets(winDust, {
      timelineSteps: {
        mode: "obs",
        obsFiles: {
          prev: "FY2G_DST_RGB_20261028_0300.BMP",
          current: "FY2G_DST_RGB_20261028_0400.BMP",
          next: "FY2G_DST_RGB_20261028_0500.BMP",
        },
      },
    });
    expect(targetsDust.left.items.length).toBe(1);
    expect(targetsDust.left.items[0]).toMatchObject({ kind: "image", type: "sat-image" });
    expect(targetsDust.right.items.length).toBe(1);
    expect(targetsDust.right.items[0]).toMatchObject({ kind: "image", type: "sat-image" });
    expect(targetsDust.up.items.length).toBe(0);
    expect(targetsDust.down.items.length).toBe(0);
  });

  it("directions: ['next'] on satellite restricts time axis to right but still includes up/down", () => {
    const win = {
      level: 12,
      obsTime: "C012_20261028120000_FY4B.AWX",
      activeGroup: {
        hasLevel: true,
        levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        layers: [{ type: "contour", model: "SATELLITE", path: "SATELLITE/FY4B/L1/CHINA", level: 12 }],
      },
    };
    const timelineSteps = {
      mode: "obs",
      obsFiles: {
        prev: "C012_20261028114500_FY4B.AWX",
        current: "C012_20261028120000_FY4B.AWX",
        next: "C012_20261028121500_FY4B.AWX",
      },
    };

    const targets = getPrefetchTargets(win, { timelineSteps, directions: ["next"] });
    expect(targets.left.items.length).toBe(0); // Left is restricted
    expect(targets.right.items.length).toBe(1); // Right is present
    expect(targets.up.items.length).toBe(1);    // Up is preserved
    expect(targets.down.items.length).toBe(1);  // Down is preserved
  });

  it("non-matching file name (no C0xx_ prefix) returns no channel items and does not throw", () => {
    const win = {
      level: 12,
      obsTime: "UNKNOWN_20261028120000_FY4B.AWX",
      activeGroup: {
        hasLevel: true,
        levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        layers: [{ type: "contour", model: "SATELLITE", path: "SATELLITE/FY4B/L1/CHINA", level: 12 }],
      },
    };
    const timelineSteps = {
      mode: "obs",
      obsFiles: {
        prev: "UNKNOWN_20261028114500_FY4B.AWX",
        current: "UNKNOWN_20261028120000_FY4B.AWX",
        next: "UNKNOWN_20261028121500_FY4B.AWX",
      },
    };

    expect(() => {
      const targets = getPrefetchTargets(win, { timelineSteps });
      expect(targets.up.items.length).toBe(0);
      expect(targets.down.items.length).toBe(0);
    }).not.toThrow();
  });

  it("playback look-ahead warms 2 frames ahead during playback when stepLength <= 0.25h", () => {
    const allFiles = [
      "C012_20261028114500_FY4B.AWX",
      "C012_20261028120000_FY4B.AWX",
      "C012_20261028121500_FY4B.AWX",
      "C012_20261028123000_FY4B.AWX",
      "C012_20261028124500_FY4B.AWX",
    ];
    const win = {
      id: "win-play",
      level: 12,
      stepLength: 0.25,
      isPlaying: true,
      obsTime: "C012_20261028120000_FY4B.AWX",
      _obsTimeline: {
        file: "C012_20261028120000_FY4B.AWX",
        files: allFiles,
      },
      activeGroup: {
        hasLevel: true,
        levels: [12],
        layers: [{ type: "contour", model: "SATELLITE", path: "SATELLITE/FY4B/L1/CHINA", level: 12 }],
      },
    };
    const timelineSteps = {
      mode: "obs",
      obsFiles: {
        prev: "C012_20261028114500_FY4B.AWX",
        current: "C012_20261028120000_FY4B.AWX",
        next: "C012_20261028121500_FY4B.AWX",
      },
    };

    // 1. Playback with lookahead=2 warms next + 1 additional frame
    const targetsPlaying = getPrefetchTargets(win, {
      timelineSteps,
      isPlaying: true,
      playbackLookahead: 2,
    });
    expect(targetsPlaying.right.items.length).toBe(2);
    expect(targetsPlaying.right.items[0].file).toBe("C012_20261028121500_FY4B.AWX");
    expect(targetsPlaying.right.items[1].file).toBe("C012_20261028123000_FY4B.AWX");
    expect(targetsPlaying.right.items[1].lookahead).toBe(true);

    // 2. Clamps at end of list with no wrap
    const winNearEnd = {
      ...win,
      obsTime: "C012_20261028123000_FY4B.AWX",
      _obsTimeline: {
        file: "C012_20261028123000_FY4B.AWX",
        files: allFiles,
      },
    };
    const targetsEnd = getPrefetchTargets(winNearEnd, {
      timelineSteps: {
        mode: "obs",
        obsFiles: {
          prev: "C012_20261028121500_FY4B.AWX",
          current: "C012_20261028123000_FY4B.AWX",
          next: "C012_20261028124500_FY4B.AWX",
        },
      },
      isPlaying: true,
      playbackLookahead: 2,
    });
    expect(targetsEnd.right.items.length).toBe(1); // Clamps, no extra beyond 124500

    // 3. Outside playback (isPlaying: false) warms 1 frame only
    const targetsManual = getPrefetchTargets(win, {
      timelineSteps,
      isPlaying: false,
      playbackLookahead: 2,
    });
    expect(targetsManual.right.items.length).toBe(1);

    // 4. stepLength > 0.25h warms 1 frame only
    const win3h = { ...win, stepLength: 3 };
    const targets3h = getPrefetchTargets(win3h, {
      timelineSteps,
      isPlaying: true,
      playbackLookahead: 2,
    });
    expect(targets3h.right.items.length).toBe(1);

    // 5. playbackLookahead: 1 restores single-frame behaviour
    const targetsL1 = getPrefetchTargets(win, {
      timelineSteps,
      isPlaying: true,
      playbackLookahead: 1,
    });
    expect(targetsL1.right.items.length).toBe(1);
  });

  it("satellite items never populate browser dataCache and send POST /api/prefetch", async () => {
    const win = {
      id: "win-sat-cache",
      level: 12,
      obsTime: "C012_20261028120000_FY4B.AWX",
      isObservation: true,
      activeGroup: {
        hasLevel: true,
        levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        layers: [{ type: "contour", model: "SATELLITE", path: "SATELLITE/FY4B/L1/CHINA", level: 12 }],
      },
    };
    const timelineSteps = {
      mode: "obs",
      obsFiles: {
        prev: "C012_20261028114500_FY4B.AWX",
        current: "C012_20261028120000_FY4B.AWX",
        next: "C012_20261028121500_FY4B.AWX",
      },
    };

    const initialCacheSize = getCacheStats().size;

    await prefetchSurroundingData(win, { timelineSteps });

    // Satellite items do NOT populate dataCache
    expect(getCacheStats().size).toBe(initialCacheSize);

    // Instead, POST /api/prefetch was called with correct payload
    expect(postedRequests.length).toBe(1);
    expect(postedRequests[0].url).toBe("/api/prefetch");
    const body = JSON.parse(postedRequests[0].opts.body);
    expect(body.scope).toBe("win-sat-cache");
    expect(body.items.length).toBe(4);
    expect(body.items.some((it) => it.dir === "up" && it.file === "C013_20261028120000_FY4B.AWX")).toBe(true);
    expect(body.items.some((it) => it.dir === "down" && it.file === "C011_20261028120000_FY4B.AWX")).toBe(true);
  });

  it("warmServerCache deduplicates requests within TTL and swallows errors", async () => {
    const items = [
      { kind: "grid", path: "SATELLITE/FY4B/L1/CHINA", file: "C013_20261028120000_FY4B.AWX", level: "13" },
    ];

    // First call sends network POST
    await warmServerCache(items, { scope: "win-test", gen: 1 });
    expect(postedRequests.length).toBe(1);

    // Second call with same item is deduped by TTL
    await warmServerCache(items, { scope: "win-test", gen: 2 });
    expect(postedRequests.length).toBe(1); // No new request sent

    // Error swallowing: if fetch throws, warmServerCache does not throw
    global.fetch = async () => {
      throw new Error("Network offline");
    };
    expect(async () => {
      await warmServerCache(
        [{ kind: "grid", path: "SATELLITE/FY4B/L1/CHINA", file: "C014_20261028120000_FY4B.AWX", level: "14" }],
        { scope: "win-err", gen: 3 }
      );
    }).not.toThrow();
  });

  it("G4 regression: NWP grid prefetch URL matches weatherLoader load and isCached flips to true", async () => {
    const win = {
      id: "win-nwp-g4",
      period: 24,
      level: 500,
      forecastCycle: "26082820",
      activeGroup: {
        id: "ecmwf-500",
        hasLevel: true,
        layers: [
          { type: "contour", model: "ECMWF_HR", element: "TMP", level: 500 },
        ],
      },
    };
    const timelineSteps = {
      mode: "nwp",
      periods: { prev: 18, current: 24, next: 30, cycle: "26082820" },
    };

    // 1. Without history date
    await prefetchSurroundingData(win, { timelineSteps });
    const expectedParams = gridParams("ECMWF_HR/TMP/500", "26082820.018", 500);
    expect(isCached("/api/data/grid", expectedParams)).toBe(true);

    // 2. With history date
    clearDataCache();
    appState.set("historyMode", true);
    appState.set("historyDate", "2026-03-20");
    await prefetchSurroundingData(win, { timelineSteps });
    const expectedHistParams = gridParams("ECMWF_HR/TMP/500", "26082820.018", 500, { date: "2026-03-20" });
    expect(isCached("/api/data/grid", expectedHistParams)).toBe(true);
  });
});
