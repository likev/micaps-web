// colormaps.test.js - Unit tests for meteorological colormaps and dynamic level scaling
import { test, expect, describe } from "bun:test";
import {
  getHexColor,
  getColormap,
  getElementLevels,
  setColormaps,
  COLORMAPS,
} from "../src/utils/colormaps.js";

describe("Colormap & Dynamic Scale Calculation", () => {
  test("getHexColor returns valid rgb string for TMP", () => {
    const colorNeg20 = getHexColor(-20, "TMP");
    expect(colorNeg20).toMatch(/^rgb\(\d+,\s*\d+,\s*\d+\)$/);
    const colorPos30 = getHexColor(30, "TMP");
    expect(colorPos30).toMatch(/^rgb\(\d+,\s*\d+,\s*\d+\)$/);
    expect(colorNeg20).not.toBe(colorPos30);
  });

  test("getColormap returns mapped color stop list", () => {
    const arr = getColormap(null, "TMP");
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBeGreaterThan(0);
    expect(arr[0]).toHaveProperty("val");
    expect(arr[0]).toHaveProperty("color");
  });

  test("getElementLevels computes adaptive synoptic levels for HGT at 500hPa and 100hPa", () => {
    // 500hPa in decameters (530 - 590 dagpm)
    const levels500 = getElementLevels("HGT", 530, 592);
    expect(levels500.length).toBeGreaterThanOrEqual(5);
    expect(levels500).toContain(588);

    // 500hPa in meters (5200 - 6000 gpm)
    const levels500m = getElementLevels("HGT", 5200, 6000);
    expect(levels500m.length).toBeGreaterThanOrEqual(5);
    expect(levels500m).toContain(5880);

    // 100hPa in decameters (1620 - 1690 dagpm)
    const levels100 = getElementLevels("HGT", 1620, 1690);
    expect(levels100.length).toBeGreaterThanOrEqual(5);
    expect(levels100[0]).toBeGreaterThanOrEqual(1600);
  });

  test("setColormaps allows registering dynamic runtime colormap overrides", () => {
    setColormaps({
      "TEST_CMAP": [
        { val: 0, color: [0, 0, 0, 255] },
        { val: 100, color: [255, 255, 255, 255] },
      ],
      "TMP": COLORMAPS.TMP,
    });
    const c0 = getHexColor(0, "TEST_CMAP");
    expect(c0).toBe("rgb(0,0,0)");
    const c100 = getHexColor(100, "TEST_CMAP");
    expect(c100).toBe("rgb(255,255,255)");
  });

  test("RH and WIND retain strict physical scale without distortion", () => {
    // RH standard levels
    const rhLevels = getElementLevels("RH", 0, 102);
    expect(rhLevels).toEqual([50, 60, 70, 80, 90, 100]);

    // WIND standard levels
    const windLevels = getElementLevels("WIND", 0, 45);
    expect(windLevels).toEqual([4, 8, 12, 16, 20, 24, 28, 32, 40]);

    // RH and WIND should return valid rgb colors for values
    expect(getHexColor(70, "RH")).toMatch(/^rgb\(\d+,\s*\d+,\s*\d+\)$/);
    expect(getHexColor(18, "WIND")).toMatch(/^rgb\(\d+,\s*\d+,\s*\d+\)$/);
  });
});
