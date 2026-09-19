// controllers.test.js - Window isolation, pick machine, G1 lead-follow, G2 no-op + views
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { lineHeightController } from "../../src/layers/lineprofile/lineHeightController.js";
import { hovmollerController } from "../../src/layers/lineprofile/hovmollerController.js";
import { loadPresetGroup } from "../../src/services/presetLoader.js";

function createMockMap() {
  const sources = new Map();
  const layers = new Map();
  const listeners = new Map();
  return {
    sources, layers, listeners,
    on(ev, cb) {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(cb);
    },
    off(ev, cb) {
      const arr = listeners.get(ev) || [];
      listeners.set(ev, arr.filter((f) => f !== cb));
      if (listeners.get(ev).length === 0) listeners.delete(ev);
    },
    emit(ev, e) { for (const cb of [...(listeners.get(ev) || [])]) cb(e); },
    getSource(id) { return sources.get(id); },
    addSource(id, def) {
      const src = { ...def, setData(d) { src.data = d; } };
      sources.set(id, src);
    },
    removeSource(id) { sources.delete(id); },
    getLayer(id) { return layers.get(id); },
    addLayer(def) { layers.set(def.id, def); },
    removeLayer(id) { layers.delete(id); },
    setLayoutProperty(id, prop, val) {
      const l = layers.get(id);
      if (l) { l.layout = l.layout || {}; l.layout[prop] = val; }
    },
    setFilter() {},
    unproject(pt) { return { lng: pt.x, lat: pt.y }; },
  };
}

function ndjsonResponse(resultObj, total) {
  const lines = [];
  for (let i = 1; i <= total; i++) {
    lines.push(JSON.stringify({ type: "progress", loaded: i, total, ok: i, failed: 0, cacheHits: 0, lastSource: "mock" }));
  }
  lines.push(JSON.stringify(resultObj));
  const text = lines.join("\n") + "\n";
  const encoder = new TextEncoder();
  return {
    ok: true, status: 200,
    headers: new Headers({ "Content-Type": "application/x-ndjson" }),
    text: async () => text,
    body: new ReadableStream({ start(c) { c.enqueue(encoder.encode(text)); c.close(); } }),
  };
}

function lineResult(levels = [850, 500], n = 5, lead = 24) {
  const fill = (v) => Array.from({ length: levels.length }, () => Array.from({ length: n }, () => v));
  return {
    type: "result",
    pointA: { lon: 100, lat: 25, i: 1, j: 1 }, pointB: { lon: 120, lat: 35, i: 2, j: 2 },
    distKm: 1500, lead, cycle: "26091808", levels,
    rh: fill(70), tmp: fill(10), vvel: fill(-10), u: fill(8), v: fill(6),
    missing: { rh: 0, tmp: 0, vvel: 0, wind: 0 },
    stats: { total: levels.length * 4, failed: 0, cacheHits: 0, rhMin: 70, rhMax: 70, tmpMin: 10, tmpMax: 10, vvelMin: -10, vvelMax: -10 },
  };
}

function hovResult(leads = [0, 12, 24], n = 5) {
  const fill = (v) => Array.from({ length: leads.length }, () => Array.from({ length: n }, () => v));
  return {
    type: "result",
    pointA: { lon: 100, lat: 25, i: 1, j: 1 }, pointB: { lon: 120, lat: 35, i: 2, j: 2 },
    distKm: 1500, cycle: "26091808", leads, level: 850,
    rh: fill(60), tmp: fill(5), vvel: fill(-10), u: fill(7), v: fill(5),
    missing: { rh: 0, tmp: 0, vvel: 0, wind: 0 },
    stats: { total: leads.length * 4, failed: 0, cacheHits: 0, rhMin: 60, rhMax: 60, tmpMin: 5, tmpMax: 5, vvelMin: -10, vvelMax: -10 },
  };
}

let originalFetch;
let lineFetches;
let hovFetches;

beforeEach(() => {
  lineFetches = 0;
  hovFetches = 0;
  originalFetch = global.fetch;
  global.fetch = async (url) => {
    const s = String(url);
    if (s.includes("/api/data/lineheight/profile")) {
      lineFetches++;
      const u = new URL(s, "http://localhost");
      const levels = (u.searchParams.get("levels") || "850").split(",").map(Number);
      const n = parseInt(u.searchParams.get("npoints") || "5", 10);
      const lead = parseInt(u.searchParams.get("lead") || "24", 10);
      return ndjsonResponse(lineResult(levels, n, lead), levels.length * 4);
    }
    if (s.includes("/api/data/hovmoller/profile")) {
      hovFetches++;
      const u = new URL(s, "http://localhost");
      const leads = (u.searchParams.get("leads") || "0").split(",").map(Number);
      const n = parseInt(u.searchParams.get("npoints") || "5", 10);
      const level = parseInt(u.searchParams.get("level") || "850", 10);
      const res = hovResult(leads, n);
      res.level = level;
      return ndjsonResponse(res, leads.length * 4);
    }
    // catalog/cycle lookups: fail fast so controllers fall back to "latest"
    return { ok: false, status: 404, statusText: "not found", text: async () => "" };
  };
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("window isolation", () => {
  test("two windows hold independent line state", async () => {
    const map1 = createMockMap(), map2 = createMockMap();
    const win1 = { id: "lh-iso-1", loadSeq: 0, period: 24 };
    const win2 = { id: "lh-iso-2", loadSeq: 0, period: 24 };
    await lineHeightController.init(map1, win1, { config: { lon0: 100, lat0: 25, lon1: 120, lat1: 35, npoints: 5 } });
    await lineHeightController.init(map2, win2, { config: { lon0: 100, lat0: 25, lon1: 120, lat1: 35, npoints: 5 } });
    expect(lineHeightController.isActive(win1)).toBe(true);
    expect(lineHeightController.isActive(win2)).toBe(true);
    lineHeightController.destroy(map1, win1);
    expect(lineHeightController.isActive(win1)).toBe(false);
    expect(lineHeightController.isActive(win2)).toBe(true);
    lineHeightController.destroy(map2, win2);
  });
});

describe("G1 pick state machine", () => {
  test("draw two-click commits; disarmed click is no-op; Esc/contextmenu cancel", async () => {
    const map = createMockMap();
    const win = { id: "lh-pick-1", loadSeq: 0, period: 24 };
    await lineHeightController.init(map, win, { config: { lon0: 100, lat0: 25, lon1: 120, lat1: 35, npoints: 5 } });
    const baseFetches = lineFetches;

    // Disarmed click: zero fetches
    map.emit("click", { lngLat: { lng: 110, lat: 30 } });
    expect(lineFetches).toBe(baseFetches);

    // Draw mode: 1st click sets pending A (preview arm, no fetch)
    lineHeightController.startDraw(win);
    map.emit("click", { lngLat: { lng: 105, lat: 30 } });
    expect(lineFetches).toBe(baseFetches);
    expect(map.sources.has("lp-line-pending")).toBe(true);

    // mousemove rubber-band preview
    map.emit("mousemove", { lngLat: { lng: 112, lat: 33 } });
    expect(map.sources.has("lp-line-preview")).toBe(true);

    // 2nd click commits B -> reload
    map.emit("click", { lngLat: { lng: 118, lat: 34 } });
    // loadMatrix is async; wait a tick
    await new Promise((r) => setTimeout(r, 50));
    expect(lineFetches).toBeGreaterThan(baseFetches);

    // SetA arm then Esc cancels (zero extra fetches)
    const f2 = lineFetches;
    lineHeightController.setAFromMap(win);
    map.emit("contextmenu", { preventDefault() {} });
    map.emit("click", { lngLat: { lng: 101, lat: 26 } });
    expect(lineFetches).toBe(f2);

    // Degenerate line rejected with zero fetches
    const f3 = lineFetches;
    await lineHeightController.setLine({ lon: 110, lat: 30 }, { lon: 110.01, lat: 30.01 }, null, win);
    expect(lineFetches).toBe(f3);

    lineHeightController.destroy(map, win);
  });
});

describe("G1 timeline follow", () => {
  test("setLead reloads section (debounced); loadPresetGroup isTimeStep routes to setLead", async () => {
    const map = createMockMap();
    const win = { id: "lh-lead-1", loadSeq: 0, period: 24, activeGroup: { id: "composite-ec-lineheight", layers: [{ id: "ec-lineheight-diagram", type: "lineheight", model: "ECMWF_HR", element: "RH", config: {} }] } };
    await lineHeightController.init(map, win, { config: { lon0: 100, lat0: 25, lon1: 120, lat1: 35, npoints: 5 } });
    const f0 = lineFetches;
    lineHeightController.setLead(48, win);
    await new Promise((r) => setTimeout(r, 250));
    expect(lineFetches).toBe(f0 + 1);
    const m48 = lineHeightController._getState(win).matrix;
    expect(m48).not.toBeNull();

    // presetLoader fan-out: isTimeStep with lineheight active -> setLead path (1 fetch), no full init storm
    const f1 = lineFetches;
    win.period = 60;
    await loadPresetGroup(map, win.activeGroup, 60, null, win, true);
    await new Promise((r) => setTimeout(r, 250));
    expect(lineFetches).toBe(f1 + 1);

    // L3 revisit: stepping back to a cached lead serves memory (zero new fetches)
    const f2 = lineFetches;
    lineHeightController.setLead(48, win);
    await new Promise((r) => setTimeout(r, 250));
    expect(lineFetches).toBe(f2); // cache hit: no fetch, no progress flash
    const st = lineHeightController._getState(win);
    expect(st.lead).toBe(48);
    expect(st.matrix).toBe(m48); // same memory object served
    // M3 lead-null contract: init followed win.period; first step persists concrete
    // lead on the window layer copy only (shipped preset keeps lead:null = follow)
    expect(lineHeightController._findLayer(win)?.config?.lead).toBe(48);
    lineHeightController.destroy(map, win);
  });
});

describe("M5 drawer window threading", () => {
  test("drawer edit on B mutates B only; A line + cache untouched", async () => {
    const { bindHovmollerDrawerEvents } = await import("../../src/ui/layers/lineProfileDrawerBindings.js");
    const mapA = createMockMap(), mapB = createMockMap();
    const winA = { id: "hov-drawer-A", loadSeq: 0, period: 24 };
    const winB = { id: "hov-drawer-B", loadSeq: 0, period: 24 };
    const cfg = { lon0: 100, lat0: 25, lon1: 120, lat1: 35, npoints: 5, startHour: 0, endHour: 24, stepHours: 12, level: 850 };
    await hovmollerController.init(mapA, winA, { config: { ...cfg } });
    await hovmollerController.init(mapB, winB, { config: { ...cfg } });
    const lineABefore = JSON.stringify(hovmollerController._getState(winA).line);
    const cacheABefore = hovmollerController._getState(winA).matrixCache.size;

    // Mock drawer DOM for window B (inputs carry value + change handler surface)
    const handlers = {};
    const mkInput = (value) => ({
      value,
      addEventListener(ev, cb) { handlers[ev] = cb; },
    });
    const inputs = {
      ".input-hov-alon": mkInput("102"), ".input-hov-alat": mkInput("26"),
      ".input-hov-blon": mkInput("122"), ".input-hov-blat": mkInput("36"),
      ".sel-hov-n": mkInput("5"),
    };
    const btnHandlers = {};
    const drawerB = {
      querySelector(sel) {
        if (inputs[sel]) return inputs[sel];
        return { addEventListener(ev, cb) { btnHandlers[`${sel}:${ev}`] = cb; } };
      },
    };
    const layerB = { type: "hovmoller", config: { ...cfg } };
    bindHovmollerDrawerEvents(layerB, drawerB, winB);
    // Fire B's Apply button
    btnHandlers[".btn-hov-apply:click"]({ stopPropagation() {} });
    await new Promise((r) => setTimeout(r, 50));
    const lineBAfter = hovmollerController._getState(winB).line;
    expect(lineBAfter.a.lon).toBeCloseTo(102, 2);
    // A untouched
    expect(JSON.stringify(hovmollerController._getState(winA).line)).toBe(lineABefore);
    expect(hovmollerController._getState(winA).matrixCache.size).toBe(cacheABefore);
    hovmollerController.destroy(mapA, winA);
    hovmollerController.destroy(mapB, winB);
  });
});

describe("G2 hovmoller", () => {
  test("isTimeStep is no-op (zero fetches); span/level reload (1 req); swap+reverse zero-fetch + persist", async () => {
    const map = createMockMap();
    const win = {
      id: "hov-ctl-1", loadSeq: 0, period: 24,
      activeGroup: {
        id: "composite-ec-hovmoller",
        layers: [{ id: "ec-hovmoller-diagram", type: "hovmoller", model: "ECMWF_HR", element: "RH", config: { lon0: 100, lat0: 25, lon1: 120, lat1: 35, npoints: 5, startHour: 0, endHour: 24, stepHours: 12, level: 850 } }],
      },
    };
    await hovmollerController.init(map, win, win.activeGroup.layers[0]);
    const f0 = hovFetches;

    // Global time step: swallowed
    await loadPresetGroup(map, win.activeGroup, 48, null, win, true);
    expect(hovFetches).toBe(f0);

    // Level change: exactly 1 request
    await hovmollerController.setLevel(500, win);
    expect(hovFetches).toBe(f0 + 1);
    expect(hovmollerController._getState(win).matrix.level).toBe(500);

    // Span change: exactly 1 request, 13 rows for 0-72@6
    await hovmollerController.setSpan(0, 72, 6, win);
    expect(hovFetches).toBe(f0 + 2);
    expect(hovmollerController._getState(win).leads.length).toBe(13);

    // Swap + reverse: zero fetches, state flips
    const f1 = hovFetches;
    hovmollerController.setAxisSwap("time-x", win);
    hovmollerController.setTimeDir("rev", win);
    expect(hovFetches).toBe(f1);
    expect(hovmollerController._getState(win).axisSwap).toBe("time-x");
    expect(hovmollerController._getState(win).timeDir).toBe("rev");
    // all 4 views render without throw
    for (const [sw, td] of [["dist-x", "fwd"], ["time-x", "fwd"], ["dist-x", "rev"], ["time-x", "rev"]]) {
      expect(() => hovmollerController.setAxisSwap(sw, win)).not.toThrow();
      expect(() => hovmollerController.setTimeDir(td, win)).not.toThrow();
    }
    expect(hovFetches).toBe(f1);

    // G2 pick machine: disarmed no-op
    const f2 = hovFetches;
    map.emit("click", { lngLat: { lng: 110, lat: 30 } });
    expect(hovFetches).toBe(f2);

    hovmollerController.destroy(map, win);
  });
});
