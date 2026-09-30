// legend_discrete_stepped_ticks.test.js - Verification of discrete banded legends,
// stepped CSS gradients, proportional tick positioning, and label density management.
import { test, expect, describe, beforeEach } from "bun:test";
import {
  getColormap,
  getCSSGradient,
  getSteppedCSSGradient,
  getPaletteBandsAndTicks,
  DEFAULT_COLORMAPS,
} from "../src/utils/colormaps.js";
import {
  buildLegendItems,
  updateLegend,
  clearLegends,
} from "../src/lib/stores/legendCore.js";

describe("1. Meteorological Palette Bands & Stepped Gradient", () => {
  test("getSteppedCSSGradient produces stepped double-position stops for RAIN", () => {
    const rainGrad = getSteppedCSSGradient("RAIN", "RAIN");
    expect(rainGrad).toMatch(/^linear-gradient\(to right, /);
    // Should contain stepped color stops with percentage ranges (e.g. "0.00% 14.29%")
    expect(rainGrad).toContain("0.00% 14.29%");
    expect(rainGrad).toContain("14.29% 28.57%");
    expect(rainGrad).toContain("85.71% 100.00%");
    // All 7 distinct palette colors appear as stepped blocks
    expect(rainGrad).toContain("rgb(166,242,143)"); // Light green (0.1~1)
    expect(rainGrad).toContain("rgb(61,186,61)");   // Green (1~10)
    expect(rainGrad).toContain("rgb(97,184,255)");  // Light blue (10~25)
    expect(rainGrad).toContain("rgb(0,0,255)");     // Blue (25~50)
    expect(rainGrad).toContain("rgb(250,0,250)");   // Magenta (50~100)
    expect(rainGrad).toContain("rgb(128,0,64)");    // Purple (100~250)
    expect(rainGrad).toContain("rgb(80,0,0)");      // Dark red (>=250)
  });

  test("getCSSGradient with options.discrete=true returns stepped gradient", () => {
    const grad = getCSSGradient("RAIN", "RAIN", { discrete: true });
    expect(grad).toMatch(/^linear-gradient\(to right, /);
    expect(grad).toContain("0.00% 14.29%");
  });

  test("getCSSGradient default returns continuous gradient without percentages", () => {
    const grad = getCSSGradient("RAIN", "RAIN");
    expect(grad).toMatch(/^linear-gradient\(to right, /);
    expect(grad).not.toContain("%");
  });

  test("TMP stepped gradient has 0°C transition at exactly 50%", () => {
    const tmpGrad = getSteppedCSSGradient("TMP", "TMP");
    expect(tmpGrad).toMatch(/^linear-gradient\(to right, /);
    // TMP range -40..+40: 0°C is at 50%
    expect(tmpGrad).toContain("37.50% 50.00%");
    expect(tmpGrad).toContain("50.00% 62.50%");
  });

  test("RH stepped gradient aligns with relative humidity physical thresholds", () => {
    const rhGrad = getSteppedCSSGradient("RH", "RH");
    expect(rhGrad).toMatch(/^linear-gradient\(to right, /);
    expect(rhGrad).toContain("0.00% 45.00%");
    expect(rhGrad).toContain("45.00% 60.00%");
    expect(rhGrad).toContain("60.00% 70.00%");
    expect(rhGrad).toContain("70.00% 80.00%");
    expect(rhGrad).toContain("80.00% 90.00%");
    expect(rhGrad).toContain("90.00% 100.00%");
  });
});

describe("2. Proportional Tick Positioning & Alignment with Color Bands", () => {
  test("RAIN ticks align with band boundary start percentages", () => {
    const res = getPaletteBandsAndTicks(DEFAULT_COLORMAPS.RAIN, "RAIN", { unit: "mm" });
    expect(res.isDiscrete).toBe(true);
    expect(res.ticks.length).toBe(7);

    // Thresholds: 0.1, 1, 10, 25, 50, 100, 250
    expect(res.ticks[0].value).toBe(0.1);
    expect(res.ticks[0].percent).toBe(0);
    expect(res.ticks[0].label).toBe("0.1");

    expect(res.ticks[1].value).toBe(1);
    expect(res.ticks[1].percent).toBe(14.29);
    expect(res.ticks[1].label).toBe("1");

    expect(res.ticks[2].value).toBe(10);
    expect(res.ticks[2].percent).toBe(28.57);
    expect(res.ticks[2].label).toBe("10");

    expect(res.ticks[3].value).toBe(25);
    expect(res.ticks[3].percent).toBe(42.86);
    expect(res.ticks[3].label).toBe("25");

    expect(res.ticks[4].value).toBe(50);
    expect(res.ticks[4].percent).toBe(57.14);
    expect(res.ticks[4].label).toBe("50");

    expect(res.ticks[5].value).toBe(100);
    expect(res.ticks[5].percent).toBe(71.43);
    expect(res.ticks[5].label).toBe("100");

    expect(res.ticks[6].value).toBe(250);
    expect(res.ticks[6].percent).toBe(85.71);
    expect(res.ticks[6].label).toBe("250 mm");

    // Verify tick positions match band boundaries
    for (let i = 0; i < res.bands.length; i++) {
      expect(res.bands[i].startPct).toBe(res.ticks[i].percent);
    }
  });

  test("TMP ticks place 0°C at 50% and align with subzero/positive bands", () => {
    const res = getPaletteBandsAndTicks(DEFAULT_COLORMAPS.TMP, "TMP", { unit: "°C" });
    expect(res.isDiscrete).toBe(true);
    expect(res.ticks.length).toBe(11);

    const zeroTick = res.ticks.find((t) => t.value === 0);
    expect(zeroTick).toBeDefined();
    expect(zeroTick.percent).toBe(50);
    expect(zeroTick.label).toBe("0");

    expect(res.ticks[0].value).toBe(-40);
    expect(res.ticks[0].percent).toBe(0);
    expect(res.ticks[0].isFirst).toBe(true);

    expect(res.ticks[res.ticks.length - 1].value).toBe(40);
    expect(res.ticks[res.ticks.length - 1].percent).toBe(100);
    expect(res.ticks[res.ticks.length - 1].isLast).toBe(true);
    expect(res.ticks[res.ticks.length - 1].label).toBe("40 °C");
  });

  test("RH ticks position 0 at 0% and 100 at 100% with intermediate thresholds", () => {
    const res = getPaletteBandsAndTicks(DEFAULT_COLORMAPS.RH, "RH", { unit: "%" });
    expect(res.ticks.length).toBe(7);

    const pcts = res.ticks.map((t) => t.percent);
    expect(pcts).toEqual([0, 45, 60, 70, 80, 90, 100]);
    expect(res.ticks[res.ticks.length - 1].label).toBe("100 %");
  });

  test("WIND ticks position 0..45 m/s proportionally across scale", () => {
    const res = getPaletteBandsAndTicks(DEFAULT_COLORMAPS.WIND, "WIND", { unit: "m/s" });
    expect(res.ticks.length).toBe(8);
    expect(res.ticks[0].percent).toBe(0);
    expect(res.ticks[res.ticks.length - 1].percent).toBe(100);
    expect(res.ticks[res.ticks.length - 1].label).toBe("45 m/s");

    // 18 m/s out of 45 m/s is exactly 40%
    const tick18 = res.ticks.find((t) => t.value === 18);
    expect(tick18).toBeDefined();
    expect(tick18.percent).toBe(40);
  });
});

describe("3. buildLegendItems Stores Integration", () => {
  const winId = "win-discrete-test";

  beforeEach(() => {
    clearLegends(winId);
  });

  test("buildLegendItems populates steppedGradient, ticks, and legacy tickLabels for RAIN", () => {
    updateLegend("RAIN", "RAIN", 0, 150, { id: winId, winIdx: 0 });
    const items = buildLegendItems(winId);
    expect(items.length).toBe(1);

    const item = items[0];
    expect(item.element).toBe("RAIN");
    expect(item.steppedGradient).toMatch(/^linear-gradient\(to right, /);
    expect(item.steppedGradient).toContain("0.00% 14.29%");
    expect(item.ticks.length).toBe(7);
    expect(item.ticks[0].label).toBe("0.1");
    expect(item.ticks[6].label).toBe("250 mm");

    // Legacy tickLabels remains available
    expect(item.tickLabels).toBeDefined();
    expect(item.tickLabels.length).toBeGreaterThan(0);
  });

  test("buildLegendItems handles relative zMin/zMax stretched HGT layer", () => {
    updateLegend("HGT", "HGT", 5000, 5900, { id: winId, winIdx: 0 });
    const items = buildLegendItems(winId);
    expect(items.length).toBe(1);

    const item = items[0];
    expect(item.steppedGradient).toBeTruthy();
    expect(item.ticks.length).toBeGreaterThan(1);
    expect(item.ticks[0].percent).toBe(0);
    expect(item.ticks[item.ticks.length - 1].percent).toBe(100);
  });
});

describe("4. Edge Cases & Robustness", () => {
  test("Single-stop colormap handles gracefully with centered tick and solid gradient", () => {
    const single = [{ val: 15, color: [255, 100, 50, 255] }];
    const res = getPaletteBandsAndTicks(single, "TMP");
    expect(res.ticks.length).toBe(1);
    expect(res.ticks[0].percent).toBe(50);
    expect(res.steppedGradient).toContain("rgb(255,100,50)");
  });

  test("Null or empty palette falls back safely without throwing", () => {
    const res1 = getPaletteBandsAndTicks(null, "TMP");
    expect(res1.ticks.length).toBeGreaterThan(0);

    const res2 = getPaletteBandsAndTicks([], "TMP");
    expect(res2.ticks.length).toBeGreaterThan(0);
  });

  test("Duplicate stop values are deduplicated to prevent division-by-zero or zero-width ticks", () => {
    const dup = [
      { val: 10, color: [100, 100, 100, 255] },
      { val: 10, color: [150, 150, 150, 255] },
      { val: 20, color: [200, 200, 200, 255] },
    ];
    const res = getPaletteBandsAndTicks(dup, "TMP");
    expect(res.ticks.length).toBe(2);
    expect(res.ticks[0].value).toBe(10);
    expect(res.ticks[1].value).toBe(20);
  });

  test("Label density management keeps all labels when totalTicks <= 9", () => {
    const res = getPaletteBandsAndTicks(DEFAULT_COLORMAPS.RAIN, "RAIN");
    expect(res.ticks.every((t) => t.showLabel === true)).toBe(true);
  });

  test("Dense palette (PRMSL with 20 stops) selectively hides intermediate labels to prevent collision", () => {
    const denseStops = Array.from({ length: 20 }, (_, i) => ({
      val: 900 + i * 5,
      color: [i * 10, 100, 200, 255],
    }));
    const res = getPaletteBandsAndTicks(denseStops, "PRMSL");
    expect(res.ticks.length).toBe(20);
    // First, last, and zero (if in range) must show
    expect(res.ticks[0].showLabel).toBe(true);
    expect(res.ticks[19].showLabel).toBe(true);
    // Not all ticks show labels (prevents collision)
    const shownCount = res.ticks.filter((t) => t.showLabel).length;
    expect(shownCount).toBeLessThan(20);
    expect(shownCount).toBeGreaterThanOrEqual(5);
  });
});
