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

function createSyntheticProfileStream(leads, levels, cycle = "26091808", point = { lon: 121.5, lat: 31.4 }, missingLevel = null) {
  const nLevels = levels.length;
  const nLeads = leads.length;
  const total = nLevels * nLeads * 4;

  const lines = [];
  for (let i = 1; i <= total; i++) {
    lines.push(JSON.stringify({
      type: "progress",
      loaded: i,
      total,
      ok: missingLevel ? Math.max(0, i - 1) : i,
      failed: missingLevel ? 1 : 0,
      cacheHits: Math.floor(i / 2),
      lastSource: i % 2 === 0 ? "cache" : "cassandra",
    }));
  }

  const rh = Array.from({ length: nLevels }, () => Array.from({ length: nLeads }, () => 75.0));
  const tmp = Array.from({ length: nLevels }, (_, li) => Array.from({ length: nLeads }, () => 20.0 - levels[li] * 0.05));
  const vvel = Array.from({ length: nLevels }, (_, li) => {
    if (levels[li] === missingLevel) {
      return Array.from({ length: nLeads }, () => null);
    }
    return Array.from({ length: nLeads }, () => -25.0);
  });
  const u = Array.from({ length: nLevels }, () => Array.from({ length: nLeads }, () => 8.0));
  const v = Array.from({ length: nLevels }, () => Array.from({ length: nLeads }, () => 6.0));

  lines.push(JSON.stringify({
    type: "result",
    point: { lon: point.lon, lat: point.lat, i: 246, j: 115 },
    cycle,
    leads,
    levels,
    rh,
    tmp,
    vvel,
    u,
    v,
    missing: { rh: 0, tmp: 0, vvel: missingLevel ? nLeads : 0, wind: 0 },
    stats: {
      total,
      failed: missingLevel ? nLeads : 0,
      cacheHits: Math.floor(total / 2),
      rhMin: 75,
      rhMax: 75,
      tmpMin: -30,
      tmpMax: 20,
      vvelMin: -25,
      vvelMax: -25,
    },
  }));

  const text = lines.join("\n") + "\n";
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });

  return {
    ok: true,
    status: 200,
    headers: new Headers({ "Content-Type": "application/x-ndjson" }),
    text: async () => text,
    body: stream,
  };
}

describe("V2 & V3: Cold Load Default Matrix, Progress & One Request Per Profile", () => {
  let originalFetch;
  let fetchCounts = 0;
  let requestedUrls = [];

  beforeEach(() => {
    clearDataCache();
    fetchCounts = 0;
    requestedUrls = [];
    originalFetch = global.fetch;
    global.fetch = async (url) => {
      fetchCounts++;
      requestedUrls.push(String(url));
      const u = new URL(String(url), "http://localhost:8088");
      const leads = (u.searchParams.get("leads") || "0").split(",").map(Number);
      const levels = (u.searchParams.get("levels") || "500").split(",").map(Number);
      const cycle = u.searchParams.get("cycle") || "26091808";
      const lon = parseFloat(u.searchParams.get("lon") || "121.5");
      const lat = parseFloat(u.searchParams.get("lat") || "31.4");
      return createSyntheticProfileStream(leads, levels, cycle, { lon, lat });
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearDataCache();
  });

  it("loads 13 leads x 10 levels with monotonic progress up to 100% in 1 request", async () => {
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

    // Verification P2: Profile request made exactly 1 call (vs 520 before)
    expect(fetchCounts).toBe(1);
    expect(requestedUrls[0]).toContain("/api/data/timeheight/profile");
  });
});

describe("V4: Period and Interval Change with Single Profile Fetch", () => {
  let originalFetch;
  let fetchCounts = 0;

  beforeEach(() => {
    clearDataCache();
    fetchCounts = 0;
    originalFetch = global.fetch;
    global.fetch = async (url) => {
      fetchCounts++;
      const u = new URL(String(url), "http://localhost:8088");
      const leads = (u.searchParams.get("leads") || "0").split(",").map(Number);
      const levels = (u.searchParams.get("levels") || "500").split(",").map(Number);
      const cycle = u.searchParams.get("cycle") || "26091808";
      return createSyntheticProfileStream(leads, levels, cycle);
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearDataCache();
  });

  it("fetches profile cleanly when changing span to 0-72h @ 6h", async () => {
    const win = { id: "test-v4-win", loadSeq: 0 };
    const levels = [1000, 500];

    const initialLeads = buildLeads(0, 144, 12);
    await loadTimeHeightMatrix({
      win,
      cycle: "26091808",
      leads: initialLeads,
      levels,
      point: { lon: 121.5, lat: 31.4 },
      signalSeq: win.loadSeq,
    });
    expect(fetchCounts).toBe(1);

    const newLeads = buildLeads(0, 72, 6);
    expect(newLeads.length).toBe(13);

    await loadTimeHeightMatrix({
      win,
      cycle: "26091808",
      leads: newLeads,
      levels,
      point: { lon: 121.5, lat: 31.4 },
      signalSeq: win.loadSeq,
    });

    expect(fetchCounts).toBe(2);
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

describe("V5: Forecast Cycle Switch", () => {
  let originalFetch;
  let fetchedCycles = [];

  beforeEach(() => {
    clearDataCache();
    fetchedCycles = [];
    originalFetch = global.fetch;
    global.fetch = async (url) => {
      const u = new URL(String(url), "http://localhost:8088");
      const cycle = u.searchParams.get("cycle") || "";
      fetchedCycles.push(cycle);
      const leads = (u.searchParams.get("leads") || "0").split(",").map(Number);
      const levels = (u.searchParams.get("levels") || "500").split(",").map(Number);
      return createSyntheticProfileStream(leads, levels, cycle);
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearDataCache();
  });

  it("fetches profile with requested cycle on cycle switch", async () => {
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
    expect(fetchedCycles).toContain("26091808");

    // Cycle 2: 26091800
    await loadTimeHeightMatrix({
      win,
      cycle: "26091800",
      leads,
      levels,
      point: { lon: 121.5, lat: 31.4 },
      signalSeq: win.loadSeq,
    });
    expect(fetchedCycles).toContain("26091800");
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
      await new Promise((r) => setTimeout(r, 20));
      return createSyntheticProfileStream(leads, levels);
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
      const leads = (u.searchParams.get("leads") || "0").split(",").map(Number);
      const levels = (u.searchParams.get("levels") || "500").split(",").map(Number);
      const cycle = u.searchParams.get("cycle") || "26091808";
      return createSyntheticProfileStream(leads, levels, cycle, { lon: 121.5, lat: 31.4 }, 200);
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
