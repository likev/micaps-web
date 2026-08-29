// contour_logic.test.js - Unit tests for characteristic bold contour lines & style parsing
import { test, expect, describe } from "bun:test";
import { parseBoldValues, isFeatureBold } from "../src/layers/contourLayer.js";

describe("Contour Line Bold Characteristic Values & Logic", () => {
  test("parseBoldValues extracts array from strings, numbers, and defaults", () => {
    // String input
    expect(parseBoldValues("5880, 588, 1010")).toEqual([5880, 588, 1010]);
    expect(parseBoldValues("0 -20")).toEqual([0, -20]);

    // Array input
    expect(parseBoldValues([5880, 588])).toEqual([5880, 588]);

    // Defaults by element
    expect(parseBoldValues(null, "HGT")).toEqual([5880, 588]);
    expect(parseBoldValues(null, "SLP")).toEqual([1010, 1000, 1020]);
    expect(parseBoldValues(null, "TMP")).toEqual([0]);
  });

  test("isFeatureBold correctly matches exact values and 10x decameter/meter conversions", () => {
    const bold5880 = [5880, 588];

    // Decameters: 588 dagpm should match 5880m / 588
    expect(isFeatureBold(588, bold5880)).toBe(true);
    expect(isFeatureBold(5880, bold5880)).toBe(true);
    expect(isFeatureBold(576, bold5880)).toBe(false);

    // Surface SLP: 1010 hPa
    const boldSLP = [1010];
    expect(isFeatureBold(1010, boldSLP)).toBe(true);
    expect(isFeatureBold(1012, boldSLP)).toBe(false);

    // Freezing isotherm: 0 °C
    const boldTMP = [0];
    expect(isFeatureBold(0, boldTMP)).toBe(true);
    expect(isFeatureBold(4, boldTMP)).toBe(false);
  });
});
