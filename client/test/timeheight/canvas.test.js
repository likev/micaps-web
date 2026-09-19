// canvas.test.js - Unit tests for timeHeightCanvas.js
import { describe, test, expect } from "bun:test";
import {
  pressureToFy,
  fyToPressure,
  getTempLevels,
  getVVelLevels,
  TimeHeightCanvasRenderer,
  P_TOP,
  P_BOTTOM,
} from "../../src/layers/timeheight/timeHeightCanvas.js";

describe("Time-Height Canvas Mathematics & Logic", () => {
  test("pressureToFy and fyToPressure perform accurate logarithmic transformations", () => {
    expect(pressureToFy(P_TOP)).toBeCloseTo(0.0, 5);
    expect(pressureToFy(P_BOTTOM)).toBeCloseTo(1.0, 5);

    // 500 hPa should be log10(5) ~ 0.69897
    const fy500 = pressureToFy(500);
    expect(fy500).toBeCloseTo(Math.log10(5), 4);

    // Test invertibility across standard isobars
    for (const p of [1000, 925, 850, 700, 500, 400, 300, 250, 200, 100]) {
      const fy = pressureToFy(p);
      const restoredP = fyToPressure(fy);
      expect(restoredP).toBeCloseTo(p, 2);
    }
  });

  test("VVEL levels include 0 and symmetrical signed ascent/descent thresholds", () => {
    const levels = getVVelLevels();
    expect(levels).toContain(0);
    expect(levels[0]).toBe(-800);
    expect(levels[levels.length - 1]).toBe(800);
    const negative = levels.filter((l) => l < 0);
    const positive = levels.filter((l) => l > 0);
    expect(negative.length).toBeGreaterThan(0);
    expect(positive.length).toBeGreaterThan(0);
  });

  test("TMP levels span meteorological range with 0C included", () => {
    const levels = getTempLevels();
    expect(levels).toContain(0);
    expect(levels[0]).toBe(-92);
    expect(levels[levels.length - 1]).toBe(48);
  });

  test("x(lead) and xToLead(x) accurately map and mirror in ltr vs rtl modes", () => {
    const mockCanvas = {
      getContext: () => null,
      addEventListener: () => {},
      getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
    };
    const renderer = new TimeHeightCanvasRenderer(mockCanvas);
    renderer.layout.plotRect = { x: 50, y: 30, width: 700, height: 500 };

    const leads = [0, 24, 48, 72, 96, 120, 144];
    renderer.matrix = { leads, levels: [1000, 500, 100] };

    // 1. LTR Mode (default: 0h left, 144h right)
    renderer.options.timeDirection = "ltr";
    expect(renderer.x(0)).toBeCloseTo(50, 2);
    expect(renderer.x(144)).toBeCloseTo(750, 2);
    expect(renderer.x(72)).toBeCloseTo(50 + 350, 2);

    expect(renderer.xToLead(50)).toBeCloseTo(0, 1);
    expect(renderer.xToLead(750)).toBeCloseTo(144, 1);
    expect(renderer.xToLead(400)).toBeCloseTo(72, 1);

    // 2. RTL Mode (144h left, 0h right)
    renderer.options.timeDirection = "rtl";
    expect(renderer.x(0)).toBeCloseTo(750, 2);
    expect(renderer.x(144)).toBeCloseTo(50, 2);
    expect(renderer.x(72)).toBeCloseTo(50 + 350, 2);

    expect(renderer.xToLead(50)).toBeCloseTo(144, 1);
    expect(renderer.xToLead(750)).toBeCloseTo(0, 1);
    expect(renderer.xToLead(400)).toBeCloseTo(72, 1);
  });

  test("renderer handles null/empty/NaN matrix gracefully without throwing", () => {
    const mockCanvas = {
      getContext: () => null,
      addEventListener: () => {},
      getBoundingClientRect: () => ({ width: 600, height: 400 }),
    };
    const renderer = new TimeHeightCanvasRenderer(mockCanvas);

    expect(() => renderer.render()).not.toThrow();

    // All-NaN matrix
    renderer.matrix = {
      leads: [0, 12, 24],
      levels: [1000, 850, 500],
      rh: [new Float32Array([NaN, NaN, NaN]), new Float32Array([NaN, NaN, NaN]), new Float32Array([NaN, NaN, NaN])],
      tmp: [new Float32Array([NaN, NaN, NaN]), new Float32Array([NaN, NaN, NaN]), new Float32Array([NaN, NaN, NaN])],
      vvel: [new Float32Array([NaN, NaN, NaN]), new Float32Array([NaN, NaN, NaN]), new Float32Array([NaN, NaN, NaN])],
      u: [new Float32Array([NaN, NaN, NaN]), new Float32Array([NaN, NaN, NaN]), new Float32Array([NaN, NaN, NaN])],
      v: [new Float32Array([NaN, NaN, NaN]), new Float32Array([NaN, NaN, NaN]), new Float32Array([NaN, NaN, NaN])],
    };
    expect(() => renderer.render()).not.toThrow();
  });
});
