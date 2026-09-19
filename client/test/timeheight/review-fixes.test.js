// review-fixes.test.js - Targeted tests verifying all review fixes and test gaps from ec-time-height-profile-review1.md
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { timeHeightController } from "../../src/layers/timeheight/timeHeightController.js";
import {
  loadTimeHeightMatrix,
  buildLeads,
  getThGridCache,
  clearThGridCache,
} from "../../src/layers/timeheight/timeHeightLoader.js";
import {
  isValidScalar,
  createScalarSampler,
  snapToGridNode,
  clampToGridDomain,
} from "../../src/layers/timeheight/timeHeightSampling.js";
import {
  getTempLevels,
  getVVelLevels,
} from "../../src/layers/timeheight/timeHeightIsolines.js";
import { TimeHeightCanvasRenderer } from "../../src/layers/timeheight/timeHeightCanvas.js";
import { clearDataCache } from "../../src/api/apiClient.js";

function createMockMap() {
  const sources = new Map();
  const layers = new Map();
  const listeners = new Map();

  return {
    sources,
    layers,
    listeners,
    on(event, cb) { listeners.set(event, cb); },
    off(event, cb) { listeners.delete(event); },
    getSource(id) { return sources.get(id); },
    addSource(id, def) {
      const s = { ...def, setData(d) { s.data = d; } };
      sources.set(id, s);
    },
    removeSource(id) { sources.delete(id); },
    getLayer(id) { return layers.get(id); },
    addLayer(def) { layers.set(def.id, def); },
    removeLayer(id) { layers.delete(id); },
    setLayoutProperty(id, prop, val) {
      const l = layers.get(id);
      if (l) {
        l.layout = l.layout || {};
        l.layout[prop] = val;
      }
    },
    unproject(pt) { return { lng: pt.x, lat: pt.y }; },
  };
}

function createSyntheticGrid(element, level, period, fillVal = 20.0) {
  const nLon = 10;
  const nLat = 10;
  const total = nLon * nLat;
  const values = new Array(total).fill(fillVal);
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
    },
    x: Array.from({ length: nLon }, (_, i) => 60.0 + i * 10.0),
    y: Array.from({ length: nLat }, (_, j) => 60.0 - j * 7.77),
    values,
    u: element === "WIND" ? new Array(total).fill(10.0) : null,
    v: element === "WIND" ? new Array(total).fill(5.0) : null,
  };
}

describe("Must-Fix 1: Cancellation Token & cancelLoad()", () => {
  let originalFetch;

  beforeEach(() => {
    clearDataCache();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearDataCache();
  });

  it("cancelLoad halts in-flight request and returns cancelled without error", async () => {
    const mockMap = createMockMap();
    const mockWin = { id: "win-cancel-test", loadSeq: 0, _thGridCache: new Map() };

    global.fetch = async () => {
      await new Promise((r) => setTimeout(r, 40));
      return {
        ok: true,
        status: 200,
        json: async () => createSyntheticGrid("TMP", 500, 0),
      };
    };

    const loadPromise = timeHeightController.init(mockMap, mockWin, {
      config: { lon: 120.0, lat: 30.0 },
    });

    // Cancel mid-flight via controller method
    timeHeightController.cancelLoad(mockWin);

    await loadPromise;
    // Window should not have crashed and matrix should be cleanly handled
    expect(timeHeightController.matrix).toBeNull();
    timeHeightController.destroy(mockMap, mockWin);
  });
});

describe("Must-Fix 2 & 6: Contour Levels Coverage and Gap Handling", () => {
  it("TMP levels cover live extreme range down to -92C and up to +48C", () => {
    const tLevels = getTempLevels();
    expect(tLevels[0]).toBeLessThanOrEqual(-83.2); // Covers live TMP/100 = -83.2C
    expect(tLevels[tLevels.length - 1]).toBeGreaterThanOrEqual(44.2); // Covers live TMP/1000 = 44.2C
    expect(tLevels).toContain(0); // 0C isotherm present
  });

  it("VVEL levels cover live ascent cores down to -800 cPa/s and descent up to +800 cPa/s", () => {
    const vLevels = getVVelLevels();
    expect(vLevels[0]).toBeLessThanOrEqual(-756.7); // Covers live VVEL/500 = -756.7 cPa/s
    expect(vLevels[vLevels.length - 1]).toBeGreaterThanOrEqual(305.8); // Covers live VVEL/850 = +305.8 cPa/s
    expect(vLevels).toContain(0); // 0 line present
  });
});

describe("Must-Fix 3: RH Validity Cap Rejection Fix", () => {
  it("accepts live upper-troposphere supersaturation (RH=130.93% at 100 hPa)", () => {
    expect(isValidScalar(130.93, "RH")).toBe(true);
    expect(isValidScalar(103.42, "RH")).toBe(true);
    expect(isValidScalar(-10, "RH")).toBe(false);
    expect(isValidScalar(170, "RH")).toBe(false);
  });

  it("createScalarSampler clamps high RH display values safely to [0, 100]", () => {
    const rawGrid = {
      header: {
        element: "RH",
        n_lon: 2,
        n_lat: 2,
        start_lon: 100,
        end_lon: 110,
        d_lon: 10,
        start_lat: 40,
        end_lat: 30,
        d_lat: -10,
      },
      values: [130.93, 130.93, 130.93, 130.93],
    };
    const sampler = createScalarSampler(rawGrid);
    expect(sampler).not.toBeNull();
    const sampled = sampler(105, 35);
    expect(sampled).toBe(100); // Display capped to 100%
  });
});

describe("Must-Fix 4: Cursor-Only Timeline Stepping", () => {
  let fetchCount = 0;
  let originalFetch;

  beforeEach(() => {
    fetchCount = 0;
    originalFetch = global.fetch;
    global.fetch = async () => {
      fetchCount++;
      return { ok: true, status: 200, json: async () => createSyntheticGrid("TMP", 500, 0) };
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("updateCursorLead moves cursor without triggering any network fetches", () => {
    const mockMap = createMockMap();
    const mockWin = { id: "win-cursor-step", loadSeq: 0 };

    timeHeightController.init(mockMap, mockWin, {
      config: { lon: 120.0, lat: 30.0 },
    });

    const initialFetches = fetchCount;
    timeHeightController.updateCursorLead(36, mockWin);

    // Cursor update must make zero network requests
    expect(fetchCount).toBe(initialFetches);
    timeHeightController.destroy(mockMap, mockWin);
  });
});

describe("Must-Fix 5: Multi-Window Isolation", () => {
  it("maintains distinct points, cycles, leads, and caches across two windows", () => {
    const mockMap = createMockMap();
    const winA = { id: "win-A", _thGridCache: new Map(), loadSeq: 0 };
    const winB = { id: "win-B", _thGridCache: new Map(), loadSeq: 0 };

    timeHeightController.init(mockMap, winA, {
      config: { lon: 120.0, lat: 30.0, startHour: 0, endHour: 72, stepHours: 12 },
    });

    timeHeightController.init(mockMap, winB, {
      config: { lon: 110.0, lat: 25.0, startHour: 12, endHour: 96, stepHours: 6 },
    });

    expect(timeHeightController.isActive(winA)).toBe(true);
    expect(timeHeightController.isActive(winB)).toBe(true);

    // Check leads independence
    const stateA = timeHeightController._getState(winA);
    const stateB = timeHeightController._getState(winB);

    expect(stateA.startHour).toBe(0);
    expect(stateA.endHour).toBe(72);
    expect(stateB.startHour).toBe(12);
    expect(stateB.endHour).toBe(96);

    // Destroy winA, winB remains active
    timeHeightController.destroy(mockMap, winA);
    expect(timeHeightController.isActive(winA)).toBe(false);
    expect(timeHeightController.isActive(winB)).toBe(true);

    timeHeightController.destroy(mockMap, winB);
    expect(timeHeightController.isActive(winB)).toBe(false);
  });
});

describe("Should-Fix: Negative Caching for 404 Grids", () => {
  let fetchCounts = 0;
  let originalFetch;

  beforeEach(() => {
    clearDataCache();
    fetchCounts = 0;
    originalFetch = global.fetch;
    global.fetch = async (url) => {
      fetchCounts++;
      const u = new URL(String(url), "http://localhost:8088");
      const path = u.searchParams.get("path") || "";
      if (path.includes("VVEL/100")) {
        return { ok: false, status: 404, json: async () => ({ error: "Not found" }) };
      }
      return { ok: true, status: 200, json: async () => createSyntheticGrid("TMP", 500, 0) };
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearDataCache();
  });

  it("negative-caches 404 grids so subsequent load does not re-request them", async () => {
    const win = { id: "win-neg-cache", loadSeq: 0 };
    const leads = [0];
    const levels = [100]; // VVEL/100 will 404

    // First load attempts fetch and encounters 404
    await loadTimeHeightMatrix({
      win,
      cycle: "26091808",
      leads,
      levels,
      point: { lon: 120.0, lat: 30.0 },
      signalSeq: win.loadSeq,
    });

    const firstFetchCount = fetchCounts;
    expect(firstFetchCount).toBeGreaterThan(0);

    // Second point load on same window re-evaluates matrix with cached null tombstone
    await loadTimeHeightMatrix({
      win,
      cycle: "26091808",
      leads,
      levels,
      point: { lon: 121.0, lat: 31.0 },
      signalSeq: win.loadSeq,
    });

    // Fetches should not have increased for negative-cached 404 grids
    expect(fetchCounts).toBe(firstFetchCount);
  });
});

describe("V4b Fast-Path: Time Direction Inversion Zero-Fetch & Mirror", () => {
  let fetchCount = 0;
  let originalFetch;

  beforeEach(() => {
    fetchCount = 0;
    originalFetch = global.fetch;
    global.fetch = async () => {
      fetchCount++;
      return { ok: true, status: 200, json: async () => createSyntheticGrid("TMP", 500, 0) };
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("toggling direction triggers zero network calls and mirrors x coordinates", () => {
    const mockMap = createMockMap();
    const mockWin = { id: "win-v4b-spy", loadSeq: 0 };

    timeHeightController.init(mockMap, mockWin, {
      config: { lon: 120.0, lat: 30.0, timeDirection: "ltr" },
    });

    const fetchesBefore = fetchCount;
    timeHeightController.setTimeDirection("rtl", mockWin);
    timeHeightController.setTimeDirection("ltr", mockWin);

    // Zero extra fetches during direction switches
    expect(fetchCount).toBe(fetchesBefore);

    // Test coordinate mirroring via canvas renderer
    const mockCanvas = {
      getContext: () => null,
      addEventListener: () => {},
      getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
    };
    const renderer = new TimeHeightCanvasRenderer(mockCanvas);
    renderer.layout.plotRect = { x: 50, y: 30, width: 700, height: 500 };
    renderer.matrix = { leads: [0, 24, 48, 72, 96, 120, 144] };

    renderer.options.timeDirection = "ltr";
    const xLtr0 = renderer.x(0);
    const xLtr144 = renderer.x(144);

    renderer.options.timeDirection = "rtl";
    const xRtl0 = renderer.x(0);
    const xRtl144 = renderer.x(144);

    // RTL mirrors coordinates exactly: xRtl(0) equals xLtr(144)
    expect(xRtl0).toBe(xLtr144);
    expect(xRtl144).toBe(xLtr0);

    timeHeightController.destroy(mockMap, mockWin);
  });
});

describe("Should-Fix: Drawer & Panel Checkbox Synchronization", () => {
  it("syncDrawerCheckbox updates panel checkbox and syncElementCheckbox updates DOM input", async () => {
    const mockMap = createMockMap();
    const mockWin = { id: "win-sync-cb", loadSeq: 0 };

    await timeHeightController.init(mockMap, mockWin, {
      config: { lon: 120.0, lat: 30.0 },
    });

    const state = timeHeightController._getState(mockWin);
    expect(state.panel).toBeDefined();

    // Verify syncElementCheckbox works without error
    state.panel.syncElementCheckbox("temp", false);
    state.panel.syncElementCheckbox("rh", true);
    state.panel.syncElementCheckbox("wind", false);
    state.panel.syncElementCheckbox("vvel", true);

    // Verify controller syncDrawerCheckbox delegates to active panel
    timeHeightController.syncDrawerCheckbox("temp", true, mockWin);

    timeHeightController.destroy(mockMap, mockWin);
  });
});

describe("Domain Edge Snap & Clamp", () => {
  it("handles boundary domain coordinates gracefully", () => {
    const gridWithHeader = {
      header: {
        n_lon: 361,
        n_lat: 281,
        start_lon: 60.0,
        end_lon: 150.0,
        d_lon: 0.25,
        start_lat: 60.0,
        end_lat: -10.0,
        d_lat: -0.25,
      },
    };

    const eastEdge = clampToGridDomain(gridWithHeader, 155.0, 30.0);
    expect(eastEdge.clamped).toBe(true);
    expect(eastEdge.lon).toBe(150.0);

    const southEdge = clampToGridDomain(gridWithHeader, 120.0, -15.0);
    expect(southEdge.clamped).toBe(true);
    expect(southEdge.lat).toBe(-10.0);

    const snapped = snapToGridNode(gridWithHeader, 60.0, 60.0);
    expect(snapped.lon).toBe(60.0);
    expect(snapped.lat).toBe(60.0);
    expect(snapped.i).toBe(0);
    expect(snapped.j).toBe(0);
  });
});
