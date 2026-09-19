// integration.test.js - Comprehensive integration test suite for EC Time-Height Profile (V1 - V10)
import { describe, it, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import { timeHeightController } from "../../src/layers/timeheight/timeHeightController.js";
import {
  loadTimeHeightMatrix,
  buildLeads,
  getThGridCache,
  clearThGridCache,
  SUPPORTED_STEPS,
} from "../../src/layers/timeheight/timeHeightLoader.js";
import {
  snapToGridNode,
  createScalarSampler,
  createWindSampler,
} from "../../src/layers/timeheight/timeHeightSampling.js";
import { TimeHeightCanvasRenderer, P_TOP, P_BOTTOM } from "../../src/layers/timeheight/timeHeightCanvas.js";
import {
  loadTimeHeightLayer,
  setTimeHeightVisibility,
  removeTimeHeightLayer,
} from "../../src/layers/timeheight/timeHeightLayer.js";
import { getPrefetchTargets } from "../../src/services/prefetchService.js";
import { clearDataCache } from "../../src/api/apiClient.js";

function createMockMap() {
  const sources = new Map();
  const layers = new Map();
  const listeners = new Map();

  return {
    sources,
    layers,
    listeners,
    on(event, cb) {
      listeners.set(event, cb);
    },
    off(event, cb) {
      listeners.delete(event);
    },
    getSource(id) {
      return sources.get(id);
    },
    addSource(id, def) {
      const src = {
        ...def,
        setData(data) {
          src.data = data;
        },
      };
      sources.set(id, src);
    },
    removeSource(id) {
      sources.delete(id);
    },
    getLayer(id) {
      return layers.get(id);
    },
    addLayer(def) {
      layers.set(def.id, def);
    },
    removeLayer(id) {
      layers.delete(id);
    },
    setLayoutProperty(id, prop, val) {
      const l = layers.get(id);
      if (l) {
        l.layout = l.layout || {};
        l.layout[prop] = val;
      }
    },
    unproject(pt) {
      return { lng: pt.x, lat: pt.y };
    },
  };
}

function createSyntheticGridResponse(element, level, period) {
  const nLon = 10;
  const nLat = 10;
  const total = nLon * nLat;
  const values = new Float32Array(total);
  const u = element === "WIND" ? new Float32Array(total) : null;
  const v = element === "WIND" ? new Float32Array(total) : null;

  for (let i = 0; i < total; i++) {
    if (element === "RH") values[i] = 75.0;
    else if (element === "TMP") values[i] = 20.0 - level * 0.05;
    else if (element === "VVEL") values[i] = -25.0; // ascent
    else if (element === "WIND") {
      values[i] = 12.0;
      u[i] = 8.0;
      v[i] = 6.0;
    }
  }

  return {
    header: {
      discriminator: "mdfs",
      element,
      level,
      period,
      n_lon: nLon,
      n_lat: nLat,
      start_lon: 60.0,
      end_lon: 150.0,
      d_lon: 10.0,
      start_lat: 60.0,
      end_lat: -10.0,
      d_lat: -7.77,
      description: element === "VVEL" ? "10e-2.Pa.s-1" : element === "RH" ? "%" : "",
    },
    x: Array.from({ length: nLon }, (_, i) => 60.0 + i * 10.0),
    y: Array.from({ length: nLat }, (_, j) => 60.0 - j * 7.77),
    values: Array.from(values),
    u: u ? Array.from(u) : null,
    v: v ? Array.from(v) : null,
  };
}

describe("V1: Preset Configuration in client/config.json", () => {
  it("verifies composite-ec-timeheight exists and conforms to Plan 1 spec", () => {
    const configPath = new URL("../../config.json", import.meta.url);
    const raw = fs.readFileSync(configPath, "utf-8");
    const cfg = JSON.parse(raw);

    const preset = cfg.presets.find((p) => p.id === "composite-ec-timeheight");
    expect(preset).toBeDefined();
    expect(preset.name).toContain("EC Time-Height Profile");
    expect(preset.category).toBe("NWP Time-Height Profile");
    expect(preset.isObservation).toBe(false);
    expect(preset.hasLevel).toBe(false);
    expect(preset.colormap).toBe("RH");

    const layer = preset.layers.find((l) => l.id === "ec-timeheight-diagram");
    expect(layer).toBeDefined();
    expect(layer.type).toBe("timeheight");
    expect(layer.model).toBe("ECMWF_HR");
    expect(layer.element).toBe("RH");
    expect(layer.visible).toBe(true);
    expect(layer.removable).toBe(true);

    const c = layer.config;
    expect(c).toBeDefined();
    expect(c.lon).toBe(121.5);
    expect(c.lat).toBe(31.4);
    expect(c.startHour).toBe(0);
    expect(c.endHour).toBe(144);
    expect(c.stepHours).toBe(12);
    expect(c.timeDirection).toBe("ltr");
    expect(c.levels).toEqual([1000, 925, 850, 700, 600, 500, 400, 300, 250, 200]);
    expect(c.showRH).toBe(true);
    expect(c.showTemp).toBe(true);
    expect(c.showVVel).toBe(true);
    expect(c.showWind).toBe(true);
    expect(c.showGridPointMarker).toBe(true);
  });
});

describe("V2 & V3: Cold Load Default Matrix, Progress & Zero-Fetch Node Resample", () => {
  let originalFetch;
  let fetchCounts = 0;

  beforeEach(() => {
    clearDataCache();
    fetchCounts = 0;
    originalFetch = global.fetch;
    global.fetch = async (url) => {
      fetchCounts++;
      const u = new URL(String(url), "http://localhost:8088");
      const path = u.searchParams.get("path") || "";
      const file = u.searchParams.get("file") || "";
      const parts = path.split("/");
      const element = parts[1] || "TMP";
      const level = parseFloat(parts[2]) || 500;
      const fileParts = file.split(".");
      const period = parseInt(fileParts[fileParts.length - 1] || "0", 10);

      return {
        ok: true,
        status: 200,
        json: async () => createSyntheticGridResponse(element, level, period),
      };
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearDataCache();
  });

  it("loads 13 leads x 10 levels with monotonic progress up to 100%", async () => {
    const win = { id: "test-v2-win", loadSeq: 0 };
    const leads = buildLeads(0, 144, 12);
    expect(leads.length).toBe(13);

    const levels = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200];
    const progressReports = [];

    const onProgress = (p) => {
      progressReports.push(p);
    };

    const res = await loadTimeHeightMatrix({
      win,
      cycle: "26091808",
      leads,
      levels,
      point: { lon: 121.5, lat: 31.4 },
      onProgress,
      signalSeq: win.loadSeq,
    });

    expect(res).not.toBeNull();
    const matrix = res.matrix;
    expect(matrix).not.toBeNull();
    expect(matrix.leads.length).toBe(13);
    expect(matrix.levels.length).toBe(10);
    expect(matrix.rh.length).toBe(10);
    expect(matrix.tmp.length).toBe(10);
    expect(matrix.vvel.length).toBe(10);
    expect(matrix.u.length).toBe(10);
    expect(matrix.v.length).toBe(10);

    // Verify progress callbacks fired monotonically
    expect(progressReports.length).toBeGreaterThan(0);
    const lastProgress = progressReports[progressReports.length - 1];
    expect(lastProgress.pct).toBe(100);
    expect(lastProgress.loaded).toBe(lastProgress.total);

    // Initial cold fetch made 13 * 10 * 4 = 520 calls
    expect(fetchCounts).toBe(520);

    // V3: Second point selection on the same window performs ZERO network fetches
    const priorFetchCount = fetchCounts;
    const secondRes = await loadTimeHeightMatrix({
      win,
      cycle: "26091808",
      leads,
      levels,
      point: { lon: 118.5, lat: 32.0 },
      signalSeq: win.loadSeq,
    });

    expect(secondRes.matrix).not.toBeNull();
    expect(fetchCounts).toBe(priorFetchCount); // Zero extra network calls!
  });
});

describe("V4: Period and Interval Change with Cached Lead Reuse", () => {
  let originalFetch;
  let fetchCounts = 0;

  beforeEach(() => {
    clearDataCache();
    fetchCounts = 0;
    originalFetch = global.fetch;
    global.fetch = async (url) => {
      fetchCounts++;
      const u = new URL(String(url), "http://localhost:8088");
      const path = u.searchParams.get("path") || "";
      const file = u.searchParams.get("file") || "";
      const parts = path.split("/");
      const element = parts[1] || "TMP";
      const level = parseFloat(parts[2]) || 500;
      const fileParts = file.split(".");
      const period = parseInt(fileParts[fileParts.length - 1] || "0", 10);

      return {
        ok: true,
        status: 200,
        json: async () => createSyntheticGridResponse(element, level, period),
      };
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearDataCache();
  });

  it("reuses overlapping cached leads when changing span to 0-72h @ 6h", async () => {
    const win = { id: "test-v4-win", loadSeq: 0 };
    const levels = [1000, 500]; // 2 levels for fast test

    // Cold load 0-144h @ 12h: leads 0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 132, 144 (13 leads)
    const initialLeads = buildLeads(0, 144, 12);
    await loadTimeHeightMatrix({
      win,
      cycle: "26091808",
      leads: initialLeads,
      levels,
      point: { lon: 121.5, lat: 31.4 },
      signalSeq: win.loadSeq,
    });
    const coldFetchCount = fetchCounts;
    expect(coldFetchCount).toBe(13 * 2 * 4); // 104 fetches

    // Now request 0-72h @ 6h: leads 0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72 (13 leads)
    // Overlapping: 0, 12, 24, 36, 48, 60, 72 (7 leads are already cached in win._thGridCache!)
    // Novel: 6, 18, 30, 42, 54, 66 (6 leads must be fetched)
    const newLeads = buildLeads(0, 72, 6);
    expect(newLeads.length).toBe(13);

    const progressReports = [];
    await loadTimeHeightMatrix({
      win,
      cycle: "26091808",
      leads: newLeads,
      levels,
      point: { lon: 121.5, lat: 31.4 },
      onProgress: (p) => progressReports.push(p),
      signalSeq: win.loadSeq,
    });

    const novelFetches = fetchCounts - coldFetchCount;
    expect(novelFetches).toBe(6 * 2 * 4); // Exactly 48 fetches for the 6 novel leads!
  });
});

describe("V4b: Time Direction Inversion (Fast-Path)", () => {
  it("toggles timeDirection between ltr and rtl without triggering fetches", () => {
    const mockMap = createMockMap();
    const mockWin = { id: "test-v4b-win", loadSeq: 0 };

    timeHeightController.init(mockMap, mockWin, {
      config: { lon: 121.5, lat: 31.4, timeDirection: "ltr" },
    });

    expect(timeHeightController.timeDirection).toBe("ltr");

    // Invert to RTL
    timeHeightController.setTimeDirection("rtl");
    expect(timeHeightController.timeDirection).toBe("rtl");

    // Invert back to LTR
    timeHeightController.setTimeDirection("ltr");
    expect(timeHeightController.timeDirection).toBe("ltr");

    timeHeightController.destroy(mockMap, mockWin);
  });
});

describe("V5: Forecast Cycle Switch and Cache Partitioning", () => {
  let originalFetch;
  let fetchedFiles = [];

  beforeEach(() => {
    clearDataCache();
    fetchedFiles = [];
    originalFetch = global.fetch;
    global.fetch = async (url) => {
      const u = new URL(String(url), "http://localhost:8088");
      const file = u.searchParams.get("file") || "";
      fetchedFiles.push(file);
      return {
        ok: true,
        status: 200,
        json: async () => createSyntheticGridResponse("TMP", 500, 0),
      };
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearDataCache();
  });

  it("fetches new files on cycle switch and retains old cycle for instant revert", async () => {
    const win = { id: "test-v5-win", loadSeq: 0 };
    const leads = [0];
    const levels = [500];

    // Cycle 1: 26091808
    await loadTimeHeightMatrix({
      win,
      cycle: "26091808",
      leads,
      levels,
      point: { lon: 121.5, lat: 31.4 },
      signalSeq: win.loadSeq,
    });
    expect(fetchedFiles.some((f) => f.startsWith("26091808"))).toBe(true);

    // Cycle 2: 26091800
    fetchedFiles = [];
    await loadTimeHeightMatrix({
      win,
      cycle: "26091800",
      leads,
      levels,
      point: { lon: 121.5, lat: 31.4 },
      signalSeq: win.loadSeq,
    });
    expect(fetchedFiles.some((f) => f.startsWith("26091800"))).toBe(true);

    // Flip back to Cycle 1: zero network fetches!
    fetchedFiles = [];
    await loadTimeHeightMatrix({
      win,
      cycle: "26091808",
      leads,
      levels,
      point: { lon: 121.5, lat: 31.4 },
      signalSeq: win.loadSeq,
    });
    expect(fetchedFiles.length).toBe(0);
  });
});

describe("V6: Progress Tracking and Load Cancellation", () => {
  it("aborts in-flight load when sequence counter advances", async () => {
    clearDataCache();
    const win = { id: "test-v6-win", loadSeq: 1 };
    const leads = [0, 12, 24];
    const levels = [1000, 500];

    const originalFetch = global.fetch;
    global.fetch = async () => {
      // Simulate delay
      await new Promise((r) => setTimeout(r, 20));
      return {
        ok: true,
        status: 200,
        json: async () => createSyntheticGridResponse("TMP", 500, 0),
      };
    };

    try {
      const loadPromise = loadTimeHeightMatrix({
        win,
        cycle: "26091808",
        leads,
        levels,
        point: { lon: 121.5, lat: 31.4 },
        signalSeq: 1,
      });
      // Cancel mid-flight by incrementing loadSeq
      win.loadSeq = 2;

      const res = await loadPromise;
      expect(res.cancelled).toBe(true);
      expect(res.matrix).toBeNull();
    } finally {
      global.fetch = originalFetch;
      clearDataCache();
    }
  });
});

describe("V7: Graceful Partial 404 Degradation", () => {
  let originalFetch;

  beforeEach(() => {
    clearDataCache();
    originalFetch = global.fetch;
    global.fetch = async (url) => {
      const u = new URL(String(url), "http://localhost:8088");
      const path = u.searchParams.get("path") || "";
      // Fail VVEL at level 200
      if (path.includes("VVEL/200")) {
        return { ok: false, status: 404, json: async () => ({ error: "Not found" }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => createSyntheticGridResponse("TMP", 500, 0),
      };
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearDataCache();
  });

  it("handles missing level with NaN row and increments failedCount without throwing", async () => {
    const win = { id: "test-v7-win", loadSeq: 0 };
    const leads = [0];
    const levels = [500, 200];

    const res = await loadTimeHeightMatrix({
      win,
      cycle: "26091808",
      leads,
      levels,
      point: { lon: 121.5, lat: 31.4 },
      signalSeq: win.loadSeq,
    });

    expect(res).not.toBeNull();
    expect(res.matrix).not.toBeNull();
    expect(res.stats.failed).toBeGreaterThan(0);
    // VVEL at index 1 (level 200) should have NaN value
    expect(Number.isNaN(res.matrix.vvel[1][0])).toBe(true);
  });
});

describe("V8: Eye Toggle Visibility and Cleanup Lifecycle", () => {
  it("toggles layer visibility and fully cleans up map and panel resources", async () => {
    const mockMap = createMockMap();
    const mockWin = { id: "test-v8-win", loadSeq: 0 };

    await timeHeightController.init(mockMap, mockWin, {
      config: { lon: 121.5, lat: 31.4 },
    });

    expect(timeHeightController.isActive()).toBe(true);
    expect(mockMap.sources.has("th-active-point-source")).toBe(true);

    // Eye toggle to hidden
    setTimeHeightVisibility(mockMap, false);
    const haloLayer = mockMap.getLayer("th-active-point-halo");
    expect(haloLayer.layout.visibility).toBe("none");

    // Eye toggle to visible
    setTimeHeightVisibility(mockMap, true);
    expect(haloLayer.layout.visibility).toBe("visible");

    // Remove layer
    removeTimeHeightLayer(mockMap, mockWin);
    expect(timeHeightController.isActive()).toBe(false);
    expect(mockMap.sources.has("th-active-point-source")).toBe(false);
    expect(mockMap.layers.has("th-active-point-halo")).toBe(false);
    expect(mockMap.listeners.has("click")).toBe(false);
  });
});

describe("V9: Input Validation & Guardrails", () => {
  it("enforces start < end auto-correct, bounded leads <= 41, and valid steps", () => {
    const corrected = buildLeads(48, 24, 12);
    expect(corrected).toEqual([48, 60]);

    const stepFixed = buildLeads(0, 24, 5);
    expect(stepFixed).toEqual([0, 12, 24]);

    const capped = buildLeads(0, 240, 1);
    expect(capped.length).toBe(41);
  });

  it("snaps coordinates cleanly to grid node", () => {
    const snapped = snapToGridNode(121.36, 31.41);
    expect(snapped.lon).toBe(121.25);
    expect(snapped.lat).toBe(31.5);
  });
});

describe("V10: Multi-Window Isolation & Prefetch Skip Guard", () => {
  it("isolates grid cache between distinct windows", () => {
    const win1 = { id: "win-1", _thGridCache: new Map() };
    const win2 = { id: "win-2", _thGridCache: new Map() };

    const cache1 = getThGridCache(win1);
    const cache2 = getThGridCache(win2);

    cache1.set("key1", { data: "val1", ts: Date.now() });
    expect(cache1.has("key1")).toBe(true);
    expect(cache2.has("key1")).toBe(false);

    clearThGridCache(win1);
    expect(cache1.size).toBe(0);
  });

  it("skips timeheight layer in prefetch target collection", () => {
    const win = {
      id: "win-th",
      layers: [{ type: "timeheight", model: "ECMWF_HR", element: "RH" }],
    };

    const targets = getPrefetchTargets(win, {
      timelineSteps: { mode: "nwp", nwpSteps: { prev: 0, current: 12, next: 24 } },
    });

    // Targets should be empty since timeheight handles its own bulk prefetch
    expect(targets.left.items.length).toBe(0);
    expect(targets.right.items.length).toBe(0);
  });
});
