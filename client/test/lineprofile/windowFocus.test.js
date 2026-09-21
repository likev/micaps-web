// windowFocus.test.js - Cross-window panel/overlay auto-toggle (bug 2) + resize API (bug 1)
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { lineHeightController } from "../../src/layers/lineprofile/lineHeightController.js";
import { hovmollerController } from "../../src/layers/lineprofile/hovmollerController.js";
import { timeHeightController } from "../../src/layers/timeheight/timeHeightLayer.js";
import { LineHeightPanel } from "../../src/layers/lineprofile/lineHeightPanel.js";
import { HovmollerPanel } from "../../src/layers/lineprofile/hovmollerPanel.js";

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
    getSource(id) { return sources.get(id); },
    addSource(id, def) {
      const src = { ...def, setData(d) { src.data = d; } };
      sources.set(id, src);
    },
    removeSource(id) { sources.delete(id); },
    getLayer(id) { return layers.get(id); },
    addLayer(def) { layers.set(def.id, { ...def, layout: def.layout || {} }); },
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

const fill = (rows, n, v) => Array.from({ length: rows }, () => Array.from({ length: n }, () => v));

let originalFetch;
beforeEach(() => {
  originalFetch = global.fetch;
  global.fetch = async (url) => {
    const s = String(url);
    if (s.includes("/api/data/lineheight/profile")) {
      const u = new URL(s, "http://localhost");
      const levels = (u.searchParams.get("levels") || "850").split(",").map(Number);
      return ndjsonResponse({
        type: "result", pointA: { lon: 100, lat: 25, i: 1, j: 1 }, pointB: { lon: 120, lat: 35, i: 2, j: 2 },
        distKm: 1500, lead: 24, cycle: "26091808", levels,
        rh: fill(levels.length, 5, 70), tmp: fill(levels.length, 5, 10), vvel: fill(levels.length, 5, -10),
        u: fill(levels.length, 5, 8), v: fill(levels.length, 5, 6),
        missing: { rh: 0, tmp: 0, vvel: 0, wind: 0 },
        stats: { total: levels.length * 4, failed: 0, cacheHits: 0, rhMin: 70, rhMax: 70, tmpMin: 10, tmpMax: 10, vvelMin: -10, vvelMax: -10 },
      }, levels.length * 4);
    }
    return { ok: false, status: 404, statusText: "not found", text: async () => "" };
  };
});
afterEach(() => { global.fetch = originalFetch; });

const haloVis = (map) => map.getLayer("lp-line-halo")?.layout?.visibility;
const thVis = (map) => map.getLayer("th-active-point-halo")?.layout?.visibility;

describe("bug 2: tab-win focus auto-toggle", () => {
  test("no-arg hide() clears every window; scoped hide(map, win) clears only that window", async () => {
    const mapA = createMockMap(), mapB = createMockMap();
    const winA = { id: "lh-focus-A", period: 24 };
    const winB = { id: "lh-focus-B", period: 24 };
    await lineHeightController.init(mapA, winA, { config: { lon0: 100, lat0: 25, lon1: 120, lat1: 35, npoints: 5 } });
    await lineHeightController.init(mapB, winB, { config: { lon0: 100, lat0: 25, lon1: 120, lat1: 35, npoints: 5 } });

    // Scoped hide touches only its own window (this is why bootstrap must use no-arg cross-type)
    lineHeightController.hide(mapA, winA);
    expect(haloVis(mapA)).toBe("none");
    expect(haloVis(mapB)).not.toBe("none");

    // No-arg hide clears all windows (bootstrap cross-controller contract)
    lineHeightController.show(mapA, winA);
    lineHeightController.hide();
    expect(haloVis(mapA)).toBe("none");
    expect(haloVis(mapB)).toBe("none");

    lineHeightController.destroy(mapA, winA);
    lineHeightController.destroy(mapB, winB);
  });

  test("time-height -> line-height focus sequence leaves exactly the line overlay visible", async () => {
    const mapTH = createMockMap(), mapLH = createMockMap();
    const winTH = { id: "th-focus-1", period: 24 };
    const winLH = { id: "lh-focus-2", period: 24 };
    // timeheight fetch 404s in this harness; overlay marker is still painted at init
    await timeHeightController.init(mapTH, winTH, { config: { lon: 121.5, lat: 31.4 } });
    await lineHeightController.init(mapLH, winLH, { config: { lon0: 100, lat0: 25, lon1: 120, lat1: 35, npoints: 5 } });
    expect(mapTH.sources.has("th-active-point-source")).toBe(true);
    expect(mapLH.sources.has("lp-line-source")).toBe(true);

    // Focus line-height window (fixed bootstrap sequence: show own, hide-all others)
    lineHeightController.show(mapLH, winLH);
    timeHeightController.hide();
    expect(haloVis(mapLH)).toBe("visible");
    expect(thVis(mapTH)).toBe("none");

    // Focus back to time-height window
    timeHeightController.show(mapTH, winTH);
    lineHeightController.hide();
    expect(thVis(mapTH)).toBe("visible");
    expect(haloVis(mapLH)).toBe("none");

    // Focus empty window: everything hidden
    timeHeightController.hide();
    lineHeightController.hide();
    hovmollerController.hide();
    expect(thVis(mapTH)).toBe("none");
    expect(haloVis(mapLH)).toBe("none");

    timeHeightController.destroy(mapTH, winTH);
    lineHeightController.destroy(mapLH, winLH);
  });
});

describe("bug 1: resize API parity with time-height", () => {
  test("both panels expose aspect-locked resize handles API", () => {
    for (const Panel of [LineHeightPanel, HovmollerPanel]) {
      expect(typeof Panel.prototype._initResizeHandles).toBe("function");
      expect(typeof Panel.prototype.setDimensions).toBe("function");
      expect(typeof Panel.prototype.toggleMinimize).toBe("function");
    }
  });

  test("resize bounds match the time-height geometry contract", async () => {
    const lh = await import("../../src/layers/lineprofile/lineHeightPanel.js");
    const hov = await import("../../src/layers/lineprofile/hovmollerPanel.js");
    expect(lh.DEFAULT_LH_WIDTH).toBe(680);
    expect(lh.DEFAULT_LH_HEIGHT).toBe(520);
    expect(lh.MIN_LH_WIDTH).toBe(480);
    expect(lh.LH_ASPECT_RATIO).toBeCloseTo(680 / 520, 5);
    expect(hov.DEFAULT_HOV_WIDTH).toBe(680);
    expect(hov.DEFAULT_HOV_HEIGHT).toBe(520);
    expect(hov.MIN_HOV_WIDTH).toBe(480);
    expect(hov.HOV_ASPECT_RATIO).toBeCloseTo(680 / 520, 5);
  });
});
