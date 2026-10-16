// client/test/history_mode.test.js
// Unit tests for History Mode frontend integration

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { appState, getActiveHistoryDate } from "../src/store/appState.js";
import {
  generateDynamicForecastCycles,
  generateHistoricalMockObsFiles,
  resolveForecastCycles,
  invalidateForecastCyclesCache,
} from "../src/utils/timelineSync.js";
import { getReferenceNowMs, resolveLayerTime, parseTimestamp } from "../src/utils/timeResolver.js";
import { createTimelineState, updateLayerResolutions } from "../src/lib/stores/timelineCore.js";
import * as catalogApi from "../src/api/catalogApi.js";

describe("History Mode Frontend Tests", () => {
  const originalHistoryMode = appState.state.historyMode;
  const originalHistoryDate = appState.state.historyDate;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    appState.set("historyMode", false);
    appState.set("historyDate", "");
    invalidateForecastCyclesCache();
  });

  afterEach(() => {
    appState.set("historyMode", originalHistoryMode);
    appState.set("historyDate", originalHistoryDate);
    globalThis.fetch = originalFetch;
    invalidateForecastCyclesCache();
  });

  describe("1. App State & History Date Resolution", () => {
    test("getActiveHistoryDate returns null when historyMode is false", () => {
      appState.set("historyMode", false);
      appState.set("historyDate", "2026-09-10");
      expect(getActiveHistoryDate()).toBe(null);
    });

    test("getActiveHistoryDate returns date string when historyMode is true", () => {
      appState.set("historyMode", true);
      appState.set("historyDate", "2026-09-10");
      expect(getActiveHistoryDate()).toBe("2026-09-10");
    });

    test("appState store updates historyMode and historyDate correctly", () => {
      appState.set("historyMode", true);
      appState.set("historyDate", "2026-09-10");
      expect(appState.state.historyMode).toBe(true);
      expect(appState.state.historyDate).toBe("2026-09-10");
    });
  });

  describe("2. Catalog API Query Parameter Injection", () => {
    test("fetchTree injects date parameter when historyMode is active", async () => {
      appState.set("historyMode", true);
      appState.set("historyDate", "2026-09-10");

      let requestedUrl = null;
      globalThis.fetch = async (url) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify([]), { status: 200 });
      };

      await catalogApi.fetchTree("SURFACE/PLOT_10MIN", 50);
      expect(requestedUrl).not.toBeNull();
      const parsed = new URL(requestedUrl, "http://localhost");
      expect(parsed.pathname).toBe("/api/catalog/tree");
      expect(parsed.searchParams.get("path")).toBe("SURFACE/PLOT_10MIN");
      expect(parsed.searchParams.get("limit")).toBe("50");
      expect(parsed.searchParams.get("date")).toBe("2026-09-10");
    });

    test("fetchTree does not inject date when historyMode is inactive", async () => {
      appState.set("historyMode", false);
      appState.set("historyDate", "");

      let requestedUrl = null;
      globalThis.fetch = async (url) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify([]), { status: 200 });
      };

      await catalogApi.fetchTree("SURFACE/PLOT_10MIN", 50);
      expect(requestedUrl).not.toBeNull();
      const parsed = new URL(requestedUrl, "http://localhost");
      expect(parsed.searchParams.get("date")).toBeNull();
    });

    test("fetchTree respects explicit date in options", async () => {
      appState.set("historyMode", false);

      let requestedUrl = null;
      globalThis.fetch = async (url) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify([]), { status: 200 });
      };

      await catalogApi.fetchTree("SURFACE/PLOT_10MIN", 50, { date: "2026-08-15" });
      expect(requestedUrl).not.toBeNull();
      const parsed = new URL(requestedUrl, "http://localhost");
      expect(parsed.searchParams.get("date")).toBe("2026-08-15");
    });

    test("fetchLatest injects date parameter when historyMode is active", async () => {
      appState.set("historyMode", true);
      appState.set("historyDate", "2026-09-10");

      let requestedUrl = null;
      globalThis.fetch = async (url) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify({ latest: "26091020.024" }), { status: 200 });
      };

      await catalogApi.fetchLatest("ECMWF_HR/TMP/500", "*.024");
      expect(requestedUrl).not.toBeNull();
      const parsed = new URL(requestedUrl, "http://localhost");
      expect(parsed.pathname).toBe("/api/catalog/latest");
      expect(parsed.searchParams.get("path")).toBe("ECMWF_HR/TMP/500");
      expect(parsed.searchParams.get("date")).toBe("2026-09-10");
    });

    test("fetchGridData and fetchStationObservations inject date parameter in history mode", async () => {
      appState.set("historyMode", true);
      appState.set("historyDate", "2026-09-10");

      const urls = [];
      globalThis.fetch = async (url) => {
        urls.push(String(url));
        return new Response(JSON.stringify({}), { status: 200 });
      };

      await catalogApi.fetchGridData("ECMWF_HR/TMP", "latest", 500);
      await catalogApi.fetchStationObservations("SURFACE/PLOT_10MIN", "latest");

      expect(urls.length).toBe(2);
      const parsedGrid = new URL(urls[0], "http://localhost");
      expect(parsedGrid.pathname).toBe("/api/data/grid");
      expect(parsedGrid.searchParams.get("date")).toBe("2026-09-10");

      const parsedStation = new URL(urls[1], "http://localhost");
      expect(parsedStation.pathname).toBe("/api/data/station");
      expect(parsedStation.searchParams.get("date")).toBe("2026-09-10");
    });
  });

  describe("3. Dynamic Cycles & Historical Mock Generation", () => {
    test("generateDynamicForecastCycles anchors at historyDate 20:00 UTC", () => {
      appState.set("historyMode", true);
      appState.set("historyDate", "2026-09-10");

      const cycles = generateDynamicForecastCycles(null, 5);
      expect(cycles.length).toBe(5);
      expect(cycles[0]).toBe("26091020");
      expect(cycles[1]).toBe("26091008");
      expect(cycles[2]).toBe("26090920");
      expect(cycles[3]).toBe("26090908");
      expect(cycles[4]).toBe("26090820");
    });

    test("generateHistoricalMockObsFiles creates timestamps for historyDate", () => {
      const files = generateHistoricalMockObsFiles("2026-09-10");
      expect(files.length).toBeGreaterThan(0);
      expect(files[files.length - 1].startsWith("20260910")).toBe(true);
    });
  });

  describe("4. Reference Clock & Staleness Engine", () => {
    test("getReferenceNowMs returns 23:59:59 UTC on historyDate", () => {
      appState.set("historyMode", true);
      appState.set("historyDate", "2026-09-10");

      const refMs = getReferenceNowMs();
      const expected = Date.UTC(2026, 8, 10, 23, 59, 59); // Month is 0-indexed: 8 = Sept
      expect(refMs).toBe(expected);
    });

    test("getReferenceNowMs returns current Date.now() when historyMode is off", () => {
      appState.set("historyMode", false);
      const before = Date.now();
      const refMs = getReferenceNowMs();
      const after = Date.now();
      expect(refMs).toBeGreaterThanOrEqual(before);
      expect(refMs).toBeLessThanOrEqual(after);
    });

    test("resolveLayerTime marks a historical observation within tolerance as current", () => {
      appState.set("historyMode", true);
      appState.set("historyDate", "2026-09-10");

      const layer = {
        id: "surface-obs-layer",
        type: "station",
        model: "SURFACE",
        element: "TMP",
        time: "20260910233000.000",
        file: "20260910233000.000",
      };

      const cursor = getReferenceNowMs(); // 2026-09-10 23:59:59 UTC (within 30m of 23:30)
      const res = resolveLayerTime(layer, cursor);

      expect(res.status).toBe("current");
      expect(res.isHardStale).toBe(false);
    });

    test("resolveLayerTime marks 2026-09-10 observation as hard-stale if evaluated against real current time", () => {
      appState.set("historyMode", false);

      const layer = {
        id: "surface-obs-layer",
        type: "station",
        model: "SURFACE",
        element: "TMP",
        time: "20260910233000.000",
        file: "20260910233000.000",
      };

      // In real current time (October 2026), 2026-09-10 is > 1 month old
      const realNow = Date.now();
      const res = resolveLayerTime(layer, realNow);

      expect(res.isHardStale).toBe(true);
    });
  });

  describe("5. Timeline Core Store Integration", () => {
    test("createTimelineState initial cursor anchors to getReferenceNowMs in history mode", () => {
      appState.set("historyMode", true);
      appState.set("historyDate", "2026-09-10");

      const state = createTimelineState("win1", { currentMode: "obs", rawObsFiles: [] });
      const expected = Date.UTC(2026, 8, 10, 23, 59, 59);
      expect(state.wallClockCursor).toBe(expected);
    });

    test("updateLayerResolutions uses getReferenceNowMs when wallClockCursor is missing", () => {
      appState.set("historyMode", true);
      appState.set("historyDate", "2026-09-10");

      const tl = { wallClockCursor: null, timelineMode: "review" };
      const layers = [
        {
          id: "l1",
          type: "station",
          model: "SURFACE",
          time: "20260910233000.000",
        },
      ];

      const res = updateLayerResolutions(tl, layers);
      expect(res.l1).toBeDefined();
      expect(res.l1.status).toBe("current");
      expect(res.l1.isHardStale).toBe(false);
    });
  });

  describe("6. resolveForecastCycles in History Mode", () => {
    test("resolveForecastCycles filters out any cycles newer than historyDate", async () => {
      appState.set("historyMode", true);
      appState.set("historyDate", "2026-09-10");

      globalThis.fetch = async (url) => {
        const u = String(url);
        if (u.includes("/api/catalog/tree")) {
          // Mock files returned from treeview: some on 2026-09-10, some newer (if server had returned any)
          return new Response(
            JSON.stringify([
              { name: "26091108.024" }, // Should be excluded
              { name: "26091020.024" },
              { name: "26091020.012" },
              { name: "26091008.024" },
              { name: "26090920.024" },
            ]),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({}), { status: 404 });
      };

      const cycles = await resolveForecastCycles("ECMWF_HR", "TMP", 500, true);
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles.includes("26091108")).toBe(false);
      expect(cycles[0]).toBe("26091020");
      expect(cycles[1]).toBe("26091008");
      expect(cycles[2]).toBe("26090920");
    });
  });
});
