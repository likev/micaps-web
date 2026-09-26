// canvas.test.js - Transect canvas math: section x(dist), hov swap/rev, zero-fetch views
import { describe, test, expect } from "bun:test";
import { LineHeightCanvasRenderer, pressureToFy } from "../../src/layers/lineprofile/lineHeightCanvas.js";
import { HovmollerCanvasRenderer } from "../../src/layers/lineprofile/hovmollerCanvas.js";
import { pressureToFy as thPressureToFy } from "../../src/layers/timeheight/timeHeightCanvas.js";

function mockCanvas() {
  return {
    getContext: () => null,
    addEventListener: () => {},
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
  };
}

function sectionMatrix() {
  const n = 5;
  const row = (v) => new Float32Array(Array.from({ length: n }, () => v));
  return {
    pointA: { lon: 100, lat: 25 }, pointB: { lon: 120, lat: 35 },
    distKm: 1000, lead: 24, cycle: "26091808",
    levels: [1000, 850, 500, 200],
    rh: [row(70), row(70), row(70), row(70)],
    tmp: [row(10), row(5), row(-20), row(-50)],
    vvel: [row(-10), row(-10), row(-10), row(-10)],
    u: [row(8), row(8), row(8), row(8)],
    v: [row(6), row(6), row(6), row(6)],
    missing: { rh: 0, tmp: 0, vvel: 0, wind: 0 },
    stats: {},
  };
}

function hovMatrix() {
  const n = 5;
  const row = (v) => new Float32Array(Array.from({ length: n }, () => v));
  return {
    pointA: { lon: 100, lat: 25 }, pointB: { lon: 120, lat: 35 },
    distKm: 1000, cycle: "26091808", leads: [0, 72, 144], level: 850,
    rh: [row(60), row(60), row(60)],
    tmp: [row(5), row(5), row(5)],
    vvel: [row(-10), row(-10), row(-10)],
    u: [row(7), row(7), row(7)],
    v: [row(5), row(5), row(5)],
    missing: { rh: 0, tmp: 0, vvel: 0, wind: 0 },
    stats: {},
  };
}

describe("LineHeight canvas", () => {
  test("x(0)=left, x(L)=right; flip mirrors; pressureToFy reused", () => {
    const r = new LineHeightCanvasRenderer(mockCanvas());
    r.layout.plotRect = { x: 50, y: 30, width: 700, height: 500 };
    r.setData(sectionMatrix(), [0, 250, 500, 750, 1000], 24);
    expect(r.x(0)).toBeCloseTo(50, 2);
    expect(r.x(1000)).toBeCloseTo(750, 2);
    r.setFlip(true);
    expect(r.x(0)).toBeCloseTo(750, 2);
    expect(r.x(1000)).toBeCloseTo(50, 2);
    r.setFlip(false);
    expect(r.xToDist(50)).toBeCloseTo(0, 0);
    expect(r.xToDist(750)).toBeCloseTo(1000, 0);
    // pressureToFy reuse: identical to time-height mapping
    for (const p of [1000, 850, 500, 200]) {
      expect(pressureToFy(p)).toBeCloseTo(thPressureToFy(p), 10);
    }
    // all-NaN matrix renders without throw (ctx null -> no-op path)
    const nan = sectionMatrix();
    nan.rh = nan.rh.map(() => new Float32Array(5).fill(NaN));
    expect(() => r.setData(nan, [0, 250, 500, 750, 1000], 24)).not.toThrow();
  });
});

describe("Hovmoller canvas views", () => {
  test("leadToFy(0)=0 top in fwd; swap transposes hover; rev mirrors time; 4 views render", () => {
    const r = new HovmollerCanvasRenderer(mockCanvas());
    r.layout.plotRect = { x: 50, y: 30, width: 700, height: 500 };
    r.setData(hovMatrix(), [0, 250, 500, 750, 1000]);
    // fwd dist-x: lead 0 at top
    expect(r.leadFrac(0)).toBeCloseTo(0, 5);
    expect(r.leadFrac(144)).toBeCloseTo(1, 5);
    // dist-x hover: (+lead | dist)
    const inv = r.invertPixel(50, 30);
    expect(inv.lead).toBeCloseTo(0, 0);
    expect(inv.dist).toBeCloseTo(0, 0);
    // swap to time-x: x becomes lead axis
    r.setView("time-x", "fwd");
    const inv2 = r.invertPixel(50, 30 + 500);
    expect(inv2.dist).toBeCloseTo(0, 0);
    expect(inv2.lead).toBeCloseTo(0, 0);
    // rev mirrors time axis
    r.setView("dist-x", "rev");
    expect(r.leadFrac(0)).toBeCloseTo(1, 5);
    expect(r.leadFrac(144)).toBeCloseTo(0, 5);
    // all 4 views render without throw (null ctx path exercises mapping code only)
    for (const [swap, dir] of [["dist-x", "fwd"], ["time-x", "fwd"], ["dist-x", "rev"], ["time-x", "rev"]]) {
      expect(() => r.setView(swap, dir)).not.toThrow();
    }
    // all-NaN no throw
    const nan = hovMatrix();
    nan.rh = nan.rh.map(() => new Float32Array(5).fill(NaN));
    expect(() => r.setData(nan, [0, 250, 500, 750, 1000])).not.toThrow();
  });

  test("view badge state persists in options (config persistence surface)", () => {
    const r = new HovmollerCanvasRenderer(mockCanvas());
    r.setView("time-x", "rev");
    expect(r.options.axisSwap).toBe("time-x");
    expect(r.options.timeDir).toBe("rev");
    expect(r.swapped).toBe(true);
    expect(r.rev).toBe(true);
  });

  test("showTemp/showVVel/showWind/showRH toggles gate the Hov render path", () => {
    const calls = [];
    const ctx = {
      save: () => calls.push("save"),
      restore: () => calls.push("restore"),
      beginPath: () => {}, rect: () => {}, clip: () => {},
      moveTo: () => {}, lineTo: () => {}, closePath: () => {},
      stroke: () => calls.push("stroke"),
      strokeRect: () => {}, clearRect: () => {},
      fill: () => calls.push("fill"),
      fillRect: () => calls.push("fillRect"),
      fillText: () => {}, measureText: () => ({ width: 10 }),
      setLineDash: () => {},
    };
    const canvas = {
      getContext: () => ctx,
      addEventListener: () => {},
      getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
      clientWidth: 800, clientHeight: 480,
    };
    const r = new HovmollerCanvasRenderer(canvas);
    r.layout.plotRect = { x: 56, y: 28, width: 700, height: 420 };
    const n = 5;
    const vary = (fn) => [0, 1, 2].map((li) => new Float32Array(Array.from({ length: n }, (_, pi) => fn(li, pi))));
    const m = hovMatrix();
    m.rh = vary((li, pi) => 20 + li * 20 + pi * 5);
    m.tmp = vary((li, pi) => -20 + li * 15 + pi * 4);
    m.vvel = vary((li, pi) => (li - 1) * 40 + pi * 5);
    r.setData(m, [0, 250, 500, 750, 1000]);

    calls.length = 0;
    r.render();
    const strokesAll = calls.filter((c) => c === "stroke").length;
    const fillsAll = calls.filter((c) => c === "fill").length;
    expect(strokesAll).toBeGreaterThan(0);
    expect(fillsAll).toBeGreaterThan(0); // smooth RH contour-fill bands

    r.setOptions({ showTemp: false, showVVel: false, showWind: false, showRH: false });
    calls.length = 0;
    r.render();
    // Only axes gridlines stroke now; only the background fillRect remains
    const strokesNone = calls.filter((c) => c === "stroke").length;
    expect(strokesNone).toBeLessThan(strokesAll);
    expect(calls.filter((c) => c === "fill").length).toBe(0);
    expect(calls.filter((c) => c === "fillRect").length).toBe(1);

    r.setOptions({ showTemp: true, showVVel: true, showWind: true, showRH: true });
    calls.length = 0;
    r.render();
    expect(calls.filter((c) => c === "stroke").length).toBe(strokesAll);
    expect(calls.filter((c) => c === "fill").length).toBe(fillsAll);
  });

  test("showRain renders rectangle-tile-fill (not contour lines) where rain12 represents past 12 hour rain", () => {
    const calls = [];
    const fillRects = [];
    const ctx = {
      save: () => calls.push("save"),
      restore: () => calls.push("restore"),
      beginPath: () => {}, rect: () => {}, clip: () => {},
      moveTo: () => {}, lineTo: () => {}, closePath: () => {},
      stroke: () => calls.push("stroke"),
      strokeRect: () => {}, clearRect: () => {},
      fill: () => calls.push("fill"),
      fillRect: (x, y, w, h) => {
        calls.push("fillRect");
        fillRects.push({ x, y, w, h });
      },
      fillText: () => {}, measureText: () => ({ width: 10 }),
      setLineDash: () => {},
    };
    const canvas = {
      getContext: () => ctx,
      addEventListener: () => {},
      getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
      clientWidth: 800, clientHeight: 480,
    };
    const r = new HovmollerCanvasRenderer(canvas);
    r.layout.plotRect = { x: 50, y: 30, width: 700, height: 420 };
    const n = 5;
    const m = hovMatrix();
    // leads: [0, 12, 24] with RAIN12 accumulation
    m.leads = [0, 12, 24];
    m.rainStep = "RAIN12";
    m.rain = [
      new Float32Array([0, 0, 0, 0, 0]),           // lead 0: no past forecast rain (skipped)
      new Float32Array([0, 2.5, 5.0, 12.0, 25.0]), // lead 12: past 12h rain [0, 12]
      new Float32Array([1.0, 8.0, 15.0, 30.0, 60.0]),// lead 24: past 12h rain [12, 24]
    ];
    r.setData(m, [0, 250, 500, 750, 1000]);

    // 1. dist-x mode: rain rendered as rectangle tiles (fillRect), NOT contour lines (fill/stroke)
    r.setOptions({ showRH: false, showTemp: false, showVVel: false, showWind: false, showRain: true, axisSwap: "dist-x" });
    calls.length = 0;
    fillRects.length = 0;
    r.render();

    // Background fillRect (1) + rain tiles for values >= 0.1 mm
    const tileFills = fillRects.slice(1);
    expect(tileFills.length).toBeGreaterThan(0);
    // No contour polygon fill calls were made
    expect(calls.filter((c) => c === "fill").length).toBe(0);

    // Verify lead 12 tile covers [0, 12] on Y axis: y starts at plotRect.y (30)
    // lead 24 tile covers [12, 24]: y starts at plotRect.y + height/2 (240)
    const lead12Tile = tileFills.find((tf) => Math.abs(tf.y - 30) < 1);
    expect(lead12Tile).toBeDefined();
    expect(lead12Tile.h).toBeCloseTo(420 / 2 + 0.5, 1); // spans 12h out of 24h total = half height + 0.5 subpixel

    const lead24Tile = tileFills.find((tf) => Math.abs(tf.y - (30 + 210)) < 1);
    expect(lead24Tile).toBeDefined();
    expect(lead24Tile.h).toBeCloseTo(420 / 2 + 0.5, 1);

    // 2. time-x swapped mode: time is on X axis
    r.setOptions({ axisSwap: "time-x" });
    calls.length = 0;
    fillRects.length = 0;
    r.render();
    const swappedTiles = fillRects.slice(1);
    expect(swappedTiles.length).toBe(tileFills.length);
    // On X axis, lead 12 tile covers [0, 12] -> x starts at plotRect.x (50), width is 700 / 2 + 0.5
    const swappedLead12 = swappedTiles.find((tf) => Math.abs(tf.x - 50) < 1);
    expect(swappedLead12).toBeDefined();
    expect(swappedLead12.w).toBeCloseTo(700 / 2 + 0.5, 1);

    // 3. Hover sampling resolves rain accurately within the [T - 12, T] tile interval
    // Lead 0 has no past accumulation -> hover must return null
    const hoverAt0 = r._sampleAtHover(0, 500);
    expect(hoverAt0.rain).toBeNull();

    // Hover at lead=6 (within [0, 12]): should sample from lead 12 data (index 1)
    const hoverAt6 = r._sampleAtHover(6, 500);
    expect(hoverAt6.rain).toBeCloseTo(5.0, 1);

    // Exact boundary at lead=12: belongs to past 12h accumulation [0, 12] (index 1)
    const hoverAt12 = r._sampleAtHover(12, 500);
    expect(hoverAt12.rain).toBeCloseTo(5.0, 1);

    // Hover at lead=18 (within [12, 24]): should sample from lead 24 data (index 2)
    const hoverAt18 = r._sampleAtHover(18, 500);
    expect(hoverAt18.rain).toBeCloseTo(15.0, 1);

    // 4. Gap coverage: RAIN03 with 12h leads [0, 12, 24] -> [9, 12] and [21, 24]
    r.setOptions({ rainStep: "RAIN03" });
    const hoverInGap = r._sampleAtHover(6, 500);
    expect(hoverInGap.rain).toBeNull();

    // 5. Overlap coverage: RAIN12 over 6h leads
    const mOverlap = {
      leads: [0, 6, 12, 18, 24],
      rainStep: "RAIN12",
      rain: [
        new Float32Array([0, 0, 0]),
        new Float32Array([1.0, 1.0, 1.0]), // lead 6 [0, 6]
        new Float32Array([4.0, 4.0, 4.0]), // lead 12 [0, 12] (painted over lead 6)
        new Float32Array([8.0, 8.0, 8.0]), // lead 18 [6, 18]
        new Float32Array([16.0, 16.0, 16.0]), // lead 24 [12, 24]
      ],
      tmp: [new Float32Array([10, 10, 10]), new Float32Array([10, 10, 10]), new Float32Array([10, 10, 10]), new Float32Array([10, 10, 10]), new Float32Array([10, 10, 10])],
    };
    r.setData(mOverlap, [0, 500, 1000]);
    r.setOptions({ rainStep: "RAIN12" });
    // At lead=5: tile 2 [0, 12] was painted over tile 1 [0, 6], so lead 12 value (4.0) must be returned
    const hoverOverlap = r._sampleAtHover(5, 500);
    expect(hoverOverlap.rain).toBeCloseTo(4.0, 1);

    // 6. Reverse time direction
    r.setView("dist-x", "rev");
    calls.length = 0;
    fillRects.length = 0;
    r.render();
    const revTiles = fillRects.slice(1);
    expect(revTiles.length).toBeGreaterThan(0);
  });
});
