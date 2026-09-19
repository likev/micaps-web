// loaders.test.js - NDJSON loaders: 1 fetch/load, monotonic progress, cancel, gaps
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadLineHeightMatrix } from "../../src/layers/lineprofile/lineHeightLoader.js";
import { loadHovmollerMatrix } from "../../src/layers/lineprofile/hovmollerLoader.js";

function makeNdjsonStream({ total, resultObj }) {
  const lines = [];
  for (let i = 1; i <= total; i++) {
    lines.push(JSON.stringify({
      type: "progress", loaded: i, total, ok: i, failed: 0,
      cacheHits: Math.floor(i / 2), lastSource: i % 2 === 0 ? "cache" : "mock",
    }));
  }
  lines.push(JSON.stringify(resultObj));
  const text = lines.join("\n") + "\n";
  const encoder = new TextEncoder();
  return {
    ok: true, status: 200,
    headers: new Headers({ "Content-Type": "application/x-ndjson" }),
    text: async () => text,
    body: new ReadableStream({
      start(c) { c.enqueue(encoder.encode(text)); c.close(); },
    }),
  };
}

const LINE_A = { lon: 100, lat: 25 }, LINE_B = { lon: 120, lat: 35 };

function lineResult(levels, npoints, lead = 24) {
  const fill = (v) => Array.from({ length: levels.length }, () => Array.from({ length: npoints }, () => v));
  return {
    type: "result",
    pointA: { lon: 100, lat: 25, i: 1, j: 1 }, pointB: { lon: 120, lat: 35, i: 2, j: 2 },
    distKm: 1500, lead, cycle: "26091808", levels,
    rh: fill(75), tmp: fill(10), vvel: fill(-20), u: fill(8), v: fill(6),
    missing: { rh: 0, tmp: 0, vvel: 0, wind: 0 },
    stats: { total: levels.length * 4, failed: 0, cacheHits: 4, rhMin: 75, rhMax: 75, tmpMin: 10, tmpMax: 10, vvelMin: -20, vvelMax: -20 },
  };
}

function hovResult(leads, npoints, level = 850) {
  const fill = (v) => Array.from({ length: leads.length }, () => Array.from({ length: npoints }, () => v));
  return {
    type: "result",
    pointA: { lon: 100, lat: 25, i: 1, j: 1 }, pointB: { lon: 120, lat: 35, i: 2, j: 2 },
    distKm: 1500, cycle: "26091808", leads, level,
    rh: fill(60), tmp: fill(5), vvel: fill(-10), u: fill(7), v: fill(5),
    missing: { rh: 0, tmp: 0, vvel: 0, wind: 0 },
    stats: { total: leads.length * 4, failed: 0, cacheHits: 6, rhMin: 60, rhMax: 60, tmpMin: 5, tmpMax: 5, vvelMin: -10, vvelMax: -10 },
  };
}

let originalFetch;
let fetchCount;
let requestedUrls;

beforeEach(() => {
  fetchCount = 0;
  requestedUrls = [];
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("lineHeightLoader", () => {
  test("one fetch per load, monotonic progress, cacheHits/lastSource surfaced", async () => {
    const levels = [850, 500];
    global.fetch = async (url) => {
      fetchCount++;
      requestedUrls.push(String(url));
      return makeNdjsonStream({ total: 8, resultObj: lineResult(levels, 5) });
    };
    const seen = [];
    const res = await loadLineHeightMatrix({
      win: { id: "lh-1", loadSeq: 0 }, cycle: "26091808", lead: 24,
      levels, line: { a: LINE_A, b: LINE_B }, npoints: 5,
      onProgress: (p) => seen.push(p),
    });
    expect(fetchCount).toBe(1);
    expect(requestedUrls[0]).toContain("/api/data/lineheight/profile");
    expect(requestedUrls[0]).toContain("lead=24");
    expect(res.cancelled).toBe(false);
    expect(res.matrix.levels).toEqual([850, 500]);
    expect(res.matrix.rh.length).toBe(2);
    expect(res.matrix.rh[0].length).toBe(5);
    expect(res.matrix.lead).toBe(24);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].loaded).toBeGreaterThanOrEqual(seen[i - 1].loaded);
    }
    expect(seen[seen.length - 1].pct).toBe(100);
    expect(typeof seen[seen.length - 1].cacheHits).toBe("number");
    expect(typeof seen[seen.length - 1].lastSource).toBe("string");
  });

  test("cancel aborts + keeps prior shape; null->NaN gaps", async () => {
    const levels = [850, 500];
    const gap = lineResult(levels, 3);
    gap.vvel = [Array.from({ length: 3 }, () => null), Array.from({ length: 3 }, () => -10)];
    global.fetch = async () => {
      await new Promise((r) => setTimeout(r, 30));
      return makeNdjsonStream({ total: 8, resultObj: gap });
    };
    const ac = new AbortController();
    const p = loadLineHeightMatrix({
      win: { id: "lh-2" }, cycle: "26091808", lead: 24, levels,
      line: { a: LINE_A, b: LINE_B }, npoints: 3, abortController: ac,
    });
    ac.abort();
    const cancelled = await p;
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.matrix).toBeNull();

    global.fetch = async () => makeNdjsonStream({ total: 8, resultObj: gap });
    const res = await loadLineHeightMatrix({
      win: { id: "lh-3", loadSeq: 0 }, cycle: "26091808", lead: 24, levels,
      line: { a: LINE_A, b: LINE_B }, npoints: 3,
    });
    expect(Number.isNaN(res.matrix.vvel[0][0])).toBe(true);
    expect(res.matrix.vvel[1][0]).toBe(-10);
  });
});

describe("hovmollerLoader", () => {
  test("one fetch per span load, [lead][pt] shape, monotonic progress", async () => {
    const leads = [0, 12, 24];
    global.fetch = async (url) => {
      fetchCount++;
      requestedUrls.push(String(url));
      return makeNdjsonStream({ total: 12, resultObj: hovResult(leads, 5) });
    };
    const seen = [];
    const res = await loadHovmollerMatrix({
      win: { id: "hov-1", loadSeq: 0 }, cycle: "26091808", leads, level: 850,
      line: { a: LINE_A, b: LINE_B }, npoints: 5,
      onProgress: (p) => seen.push(p),
    });
    expect(fetchCount).toBe(1);
    expect(requestedUrls[0]).toContain("/api/data/hovmoller/profile");
    expect(requestedUrls[0]).toContain("level=850");
    expect(res.matrix.leads).toEqual([0, 12, 24]);
    expect(res.matrix.rh.length).toBe(3);
    expect(res.matrix.rh[0].length).toBe(5);
    expect(res.matrix.level).toBe(850);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].loaded).toBeGreaterThanOrEqual(seen[i - 1].loaded);
    }
    expect(seen[seen.length - 1].pct).toBe(100);
  });

  test("cancel aborts in-flight span", async () => {
    const leads = [0, 12];
    global.fetch = async () => {
      await new Promise((r) => setTimeout(r, 30));
      return makeNdjsonStream({ total: 8, resultObj: hovResult(leads, 3) });
    };
    const ac = new AbortController();
    const p = loadHovmollerMatrix({
      win: { id: "hov-2" }, cycle: "26091808", leads, level: 850,
      line: { a: LINE_A, b: LINE_B }, npoints: 3, abortController: ac,
    });
    ac.abort();
    const res = await p;
    expect(res.cancelled).toBe(true);
    expect(res.matrix).toBeNull();
  });
});
