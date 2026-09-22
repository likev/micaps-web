// lineAverage.test.js - Time-height transect (line-average) mode: averaging math,
// per-level fan-out, controller mode/line lifecycle, and cache isolation
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  averageLineProfiles,
  loadTimeHeightLineMatrix,
} from "../../src/layers/timeheight/timeHeightLoader.js";
import { timeHeightController } from "../../src/layers/timeheight/timeHeightController.js";

function mockMap() {
  const layers = new Map(), sources = new Map(), listeners = new Map();
  return {
    layers, sources, listeners,
    on(ev, cb) { if (!listeners.has(ev)) listeners.set(ev, []); listeners.get(ev).push(cb); },
    off(ev, cb) { const a = listeners.get(ev) || []; listeners.set(ev, a.filter((f) => f !== cb)); },
    getLayer(id) { return layers.get(id); },
    getSource(id) { return sources.get(id); },
    addLayer(d) { layers.set(d.id, { ...d, layout: d.layout || {} }); },
    removeLayer(id) { layers.delete(id); },
    addSource(id, d) { const s = { ...d, setData(x) { s.data = x; } }; sources.set(id, s); },
    removeSource(id) { sources.delete(id); },
    setLayoutProperty(id, p, v) { const l = layers.get(id); if (l) { l.layout = l.layout || {}; l.layout[p] = v; } },
    setFilter() {},
    unproject(p) { return { lng: p.x, lat: p.y }; },
  };
}

const LINE = { a: { lon: 115, lat: 28 }, b: { lon: 125, lat: 38 } };

function hovText({ leads, level, n, fn }) {
  const col = (v) => Array.from({ length: leads.length }, () => Array.from({ length: n }, () => v));
  return JSON.stringify({
    type: "result", leads, level, distKm: 800,
    pointA: LINE.a, pointB: LINE.b,
    rh: col(fn.rh(level)), tmp: col(fn.tmp(level)), vvel: col(fn.vvel(level)),
    u: col(fn.u(level)), v: col(fn.v(level)),
    missing: { rh: 0, tmp: 0, vvel: 0, wind: 0 },
    stats: { total: leads.length * 4, failed: 0, cacheHits: 0 },
  }) + "\n";
}

let originalFetch;
beforeEach(() => { originalFetch = global.fetch; });
afterEach(() => { global.fetch = originalFetch; });

describe("averageLineProfiles math", () => {
  test("means over transect nodes per (level, lead), skipping NaN", () => {
    const levels = [1000, 500], leads = [0, 12];
    const mk = (rows) => rows.map((r) => Float32Array.from(r));
    const levelMats = [
      { cycle: "c1", rh: mk([[10, 20], [30, NaN]]), tmp: mk([[1, 2], [3, 4]]), vvel: mk([[0, 0], [0, 0]]), u: mk([[3, 4], [0, 0]]), v: mk([[4, 3], [0, 0]]) },
      { cycle: "c1", rh: mk([[50, 70], [90, 100]]), tmp: mk([[5, 6], [7, 8]]), vvel: mk([[1, 1], [1, 1]]), u: mk([[0, 0], [0, 0]]), v: mk([[0, 0], [0, 0]]) },
    ];
    const m = averageLineProfiles(levelMats, { levels, leads, line: LINE, npoints: 5 });
    // levelMats[li] holds [lead][pt] rows for levels[li]
    expect(m.rh[0][0]).toBeCloseTo(15, 5); // mean(10,20)
    expect(m.rh[0][1]).toBeCloseTo(30, 5); // mean(30,NaN) skips NaN
    expect(m.rh[1][0]).toBeCloseTo(60, 5); // mean(50,70)
    expect(m.tmp[1][1]).toBeCloseTo(7.5, 5); // mean(7,8)
    // U/V vector mean: level0 lead0 = u mean(3,4)=3.5, v mean(4,3)=3.5
    expect(m.u[0][0]).toBeCloseTo(3.5, 5);
    expect(m.v[0][0]).toBeCloseTo(3.5, 5);
    expect(m.leads).toEqual([0, 12]);
    expect(m.levels).toEqual([1000, 500]);
    expect(m.line.npoints).toBe(5);
    expect(m.line.totalKm).toBeGreaterThan(1000);
    expect(m.point.lon).toBeCloseTo(120, 5);
  });

  test("all-NaN columns stay NaN and count as missing", () => {
    const levels = [850], leads = [0];
    const levelMats = [{
      cycle: "c", rh: [Float32Array.from([NaN, NaN])], tmp: [Float32Array.from([NaN, NaN])],
      vvel: [Float32Array.from([NaN, NaN])], u: [Float32Array.from([NaN, NaN])], v: [Float32Array.from([NaN, NaN])],
    }];
    const m = averageLineProfiles(levelMats, { levels, leads, line: LINE, npoints: 2 });
    expect(Number.isNaN(m.rh[0][0])).toBe(true);
    expect(Number.isNaN(m.u[0][0])).toBe(true);
    expect(m.missing.rh).toBe(1);
    expect(m.missing.wind).toBe(1);
  });

  test("null level slots (failed levels) degrade to NaN, others intact", () => {
    const levels = [1000, 500], leads = [0];
    const levelMats = [
      { cycle: "c", rh: [Float32Array.from([40, 60])], tmp: [Float32Array.from([1, 2])], vvel: [Float32Array.from([0, 0])], u: [Float32Array.from([1, 1])], v: [Float32Array.from([0, 0])] },
      null,
    ];
    const m = averageLineProfiles(levelMats, { levels, leads, line: LINE, npoints: 2 });
    expect(m.rh[0][0]).toBeCloseTo(50, 5);
    expect(Number.isNaN(m.rh[1][0])).toBe(true);
  });
});

describe("loadTimeHeightLineMatrix fan-out", () => {
  test("one request per level, averaged matrix, aggregated progress", async () => {
    let calls = 0;
    const seenLevels = [];
    global.fetch = async (url) => {
      const u = new URL(String(url), "http://localhost");
      if (!String(url).includes("/api/data/hovmoller/profile")) {
        return { ok: false, status: 404, statusText: "nf", text: async () => "" };
      }
      calls++;
      const level = Number(u.searchParams.get("level"));
      seenLevels.push(level);
      const leads = u.searchParams.get("leads").split(",").map(Number);
      const n = Number(u.searchParams.get("npoints"));
      return {
        ok: true, status: 200, body: null,
        text: async () => hovText({ leads, level, n, fn: { rh: (lv) => lv / 10, tmp: () => 5, vvel: () => 0, u: () => 3, v: () => 4 } }),
      };
    };
    const prog = [];
    const res = await loadTimeHeightLineMatrix({
      cycle: "26091808", leads: [0, 12], levels: [1000, 500],
      line: LINE, npoints: 5,
      onProgress: (p) => prog.push(p),
    });
    expect(res.cancelled).toBe(false);
    expect(calls).toBe(2);
    expect(seenLevels.sort((a, b) => a - b)).toEqual([500, 1000]);
    expect(res.matrix.rh[0][0]).toBeCloseTo(100, 5); // 1000/10
    expect(res.matrix.rh[1][0]).toBeCloseTo(50, 5); // 500/10
    expect(res.matrix.u[0][0]).toBeCloseTo(3, 5);
    expect(res.matrix.line.npoints).toBe(5);
    expect(prog.length).toBeGreaterThan(0);
    expect(prog[prog.length - 1].pct).toBe(100);
  });

  test("isCancelled aborts the fan-out", async () => {
    global.fetch = async (url) => {
      const u = new URL(String(url), "http://localhost");
      const leads = (u.searchParams.get("leads") || "0").split(",").map(Number);
      const level = Number(u.searchParams.get("level") || 1000);
      await new Promise((r) => setTimeout(r, 30));
      return {
        ok: true, status: 200, body: null,
        text: async () => hovText({ leads, level, n: 2, fn: { rh: () => 60, tmp: () => 10, vvel: () => 0, u: () => 1, v: () => 0 } }),
      };
    };
    let flag = false;
    const p = loadTimeHeightLineMatrix({
      cycle: "c", leads: [0], levels: [1000, 500], line: LINE, npoints: 2,
      isCancelled: () => flag,
    });
    flag = true;
    const res = await p;
    expect(res.cancelled).toBe(true);
    expect(res.matrix).toBeNull();
  });
});

describe("controller line mode lifecycle", () => {
  test("setLine validates, persists, overlays, caches; setMode toggles", async () => {
    global.fetch = async (url) => {
      const u = new URL(String(url), "http://localhost");
      if (String(url).includes("/api/data/hovmoller/profile")) {
        const level = Number(u.searchParams.get("level"));
        const leads = u.searchParams.get("leads").split(",").map(Number);
        const n = Number(u.searchParams.get("npoints"));
        return {
          ok: true, status: 200, body: null,
          text: async () => hovText({ leads, level, n, fn: { rh: () => 60, tmp: () => 10, vvel: () => 0, u: () => 1, v: () => 0 } }),
        };
      }
      return { ok: false, status: 404, statusText: "nf", text: async () => "" };
    };
    const map = mockMap();
    const win = { id: "th-line-test" };
    timeHeightController.destroy();
    await timeHeightController.init(map, win, { config: { lon: 121.5, lat: 31.4 } });
    expect(timeHeightController._getState(win).mode).toBe("point");

    // Degenerate line rejected
    expect(await timeHeightController.setLine({ lon: 115, lat: 28 }, { lon: 115, lat: 28 }, 9, win)).toBeNull();
    expect(timeHeightController._getState(win).mode).toBe("point");

    const m = await timeHeightController.setLine(LINE.a, LINE.b, 9, win);
    const st = timeHeightController._getState(win);
    expect(st.mode).toBe("line");
    expect(m).not.toBeNull();
    expect(map.sources.has("lp-line-source")).toBe(true);

    // Repeat load served from cache (spy via fetch counter)
    let n = 0;
    const f = global.fetch;
    global.fetch = async (...a) => { n++; return f(...a); };
    await timeHeightController.setLine(LINE.a, LINE.b, 9, win);
    expect(n).toBe(0);

    // Back to point removes line overlay
    await timeHeightController.setMode("point", win);
    expect(timeHeightController._getState(win).mode).toBe("point");
    expect(map.sources.has("lp-line-source")).toBe(false);

    timeHeightController.destroy(map, win);
  });
});
