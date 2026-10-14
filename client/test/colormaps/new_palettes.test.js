import { describe, it, expect } from "bun:test";
import { getColormap, createColorResolver, COLORMAPS } from "../../src/utils/colormaps.js";

describe("New Meteorological Palettes", () => {
  const newPaletteKeys = [
    "CAPE", "HELICITY", "RADAR", "ECHO_TOP", "VIL", "QPE",
    "SNOW", "SST", "TCWV", "PROBABILITY", "VARIANCE", "PRECIP_TYPE", "HAZARDS"
  ];

  for (const key of newPaletteKeys) {
    it(`palette "${key}" exists in COLORMAPS with valid stops`, () => {
      const palette = COLORMAPS[key];
      expect(Array.isArray(palette)).toBe(true);
      expect(palette.length).toBeGreaterThanOrEqual(2);
      for (const stop of palette) {
        expect(typeof stop.val).toBe("number");
        expect(Array.isArray(stop.color)).toBe(true);
        expect(stop.color.length).toBe(4);
        for (const ch of stop.color) {
          expect(ch).toBeGreaterThanOrEqual(0);
          expect(ch).toBeLessThanOrEqual(255);
        }
      }
    });
  }

  it("getColormap maps convective indices correctly", () => {
    expect(getColormap(null, "CAPE")).toBe(COLORMAPS.CAPE);
    expect(getColormap(null, "DCAPE")).toBe(COLORMAPS.CAPE);
    expect(getColormap(null, "CIN")).toBe(COLORMAPS.CAPE);
    expect(getColormap(null, "UPDRAFT_HELICITY")).toBe(COLORMAPS.HELICITY);
  });

  it("getColormap maps SWAN radar elements correctly", () => {
    expect(getColormap(null, "MCR")).toBe(COLORMAPS.RADAR);
    expect(getColormap(null, "REFLECTIVITY")).toBe(COLORMAPS.RADAR);
    expect(getColormap(null, "REF_FST")).toBe(COLORMAPS.RADAR);
    expect(getColormap(null, "MTOP")).toBe(COLORMAPS.ECHO_TOP);
    expect(getColormap(null, "MVIL")).toBe(COLORMAPS.VIL);
    expect(getColormap(null, "QPE6MIN")).toBe(COLORMAPS.QPE);
  });

  it("getColormap maps probability, variance, and precip type", () => {
    expect(getColormap(null, "RAIN24/10.0MM_PROB")).toBe(COLORMAPS.PROBABILITY);
    expect(getColormap(null, "VARIANCE")).toBe(COLORMAPS.VARIANCE);
    expect(getColormap(null, "PRECIPITATION_TYPE")).toBe(COLORMAPS.PRECIP_TYPE);
  });

  it("createColorResolver resolves physical colors for radar reflectivity", () => {
    const resolver = createColorResolver("RADAR");
    const out = new Uint8ClampedArray(4);

    // 0 dBZ -> transparent
    resolver(0, out, 0);
    expect(out[3]).toBe(0);

    // 50 dBZ -> Red
    resolver(50, out, 0);
    expect(out[0]).toBe(255);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(0);
    expect(out[3]).toBe(255);
  });
});
