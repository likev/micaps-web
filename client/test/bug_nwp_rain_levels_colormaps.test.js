// bug_nwp_rain_levels_colormaps.test.js - Unit tests verifying NWP rain level thresholds and transparency
import { describe, it, expect } from "bun:test";
import {
  isRainElement,
  getColormap,
  getElementLevels,
  getColor,
  getHexColor,
} from "../src/utils/colormaps.js";
import { formatContourLabel, formatElementUnit } from "../src/utils/formatters.js";

describe("Bug 3 Fix: NWP Rain Levels & Colormap Scaling", () => {
  describe("isRainElement", () => {
    it("identifies standard and model path rain element identifiers", () => {
      expect(isRainElement("RAIN")).toBe(true);
      expect(isRainElement("rain")).toBe(true);
      expect(isRainElement("RAIN6")).toBe(true);
      expect(isRainElement("RAIN12")).toBe(true);
      expect(isRainElement("rain12")).toBe(true);
      expect(isRainElement("RAIN24")).toBe(true);
      expect(isRainElement("ecmwf_hr/rain12")).toBe(true);
      expect(isRainElement("cma_gfs/rain24")).toBe(true);
      expect(isRainElement("APCP")).toBe(true);
      expect(isRainElement("TP")).toBe(true);
      expect(isRainElement("PRECIPITATION")).toBe(true);
      expect(isRainElement("SNOW")).toBe(true);

      // Non-rain elements
      expect(isRainElement("TMP")).toBe(false);
      expect(isRainElement("HGT")).toBe(false);
      expect(isRainElement("WIND")).toBe(false);
      expect(isRainElement("RH")).toBe(false);
      expect(isRainElement("SLP")).toBe(false);
      expect(isRainElement("DTD")).toBe(false);
      expect(isRainElement("VOR")).toBe(false);
      expect(isRainElement("DIV")).toBe(false);
    });
  });

  describe("getColormap for Rain", () => {
    it("resolves rain colormap for RAIN12 and path references", () => {
      const cmap12 = getColormap(null, "RAIN12");
      expect(cmap12).toBeDefined();
      expect(cmap12[0].val).toBe(0.1);

      const cmapPath = getColormap(null, "ecmwf_hr/rain12");
      expect(cmapPath).toBeDefined();
      expect(cmapPath[0].val).toBe(0.1);
    });
  });

  describe("getElementLevels for Rain", () => {
    it("starts rain levels at 0.1 mm, never at 0", () => {
      const levels12 = getElementLevels("RAIN12", 0, 50);
      expect(levels12[0]).toBe(0.1);
      expect(levels12).not.toContain(0);
      expect(levels12).toEqual([0.1, 1, 10, 25, 50, 100, 250]);

      const levelsNwp = getElementLevels("ecmwf_hr/rain12", 0, 80);
      expect(levelsNwp[0]).toBe(0.1);
      expect(levelsNwp).not.toContain(0);
    });

    it("ensures custom palettes containing 0 or < 0.1 start at 0.1 mm", () => {
      const customZeroPalette = [
        { val: 0, color: [200, 200, 200, 255] },
        { val: 5, color: [100, 200, 100, 255] },
        { val: 15, color: [50, 150, 250, 255] },
        { val: 30, color: [0, 0, 255, 255] },
      ];
      const levels = getElementLevels("RAIN12", 0, 40, customZeroPalette);
      expect(levels[0]).toBe(0.1);
      expect(levels).not.toContain(0);
      expect(levels).toEqual([0.1, 5, 15, 30]);
    });
  });

  describe("getColor Transparency for Rain < 0.1 mm", () => {
    it("renders rain values below 0.1 mm (such as 0 mm) completely transparent", () => {
      const color0 = getColor(0, "RAIN12");
      expect(color0).toEqual([0, 0, 0, 0]);

      const colorTrace = getColor(0.05, "RAIN12");
      expect(colorTrace).toEqual([0, 0, 0, 0]);

      const color0Path = getColor(0, "ecmwf_hr/rain12");
      expect(color0Path).toEqual([0, 0, 0, 0]);
    });

    it("renders rain values at or above 0.1 mm with visible opacity", () => {
      const colorAtMin = getColor(0.1, "RAIN12");
      expect(colorAtMin[3]).toBeGreaterThan(0); // alpha > 0

      const color10 = getColor(10, "RAIN12");
      expect(color10[3]).toBeGreaterThan(0);
    });

    it("outputs transparent rgba(0,0,0,0) from getHexColor for values below 0.1 mm", () => {
      const hex0 = getHexColor(0, "RAIN12");
      expect(hex0).toBe("rgba(0,0,0,0)");

      const hexTrace = getHexColor(0.05, "RAIN12");
      expect(hexTrace).toBe("rgba(0,0,0,0)");

      const hex0Path = getHexColor(0, "ecmwf_hr/rain12");
      expect(hex0Path).toBe("rgba(0,0,0,0)");

      // Valid rain value >= 0.1 mm should output visible rgb color, not transparent
      const hexRain = getHexColor(10, "RAIN12");
      expect(hexRain).toBe("rgb(97,184,255)");
      expect(hexRain).not.toBe("rgba(0,0,0,0)");
    });
  });

  describe("formatContourLabel and formatElementUnit for Rain", () => {
    it("preserves decimal 0.1 label for rain and does not round to 0", () => {
      expect(formatContourLabel(0.1, "RAIN12")).toBe("0.1");
      expect(formatContourLabel(0.1, "ecmwf_hr/rain12")).toBe("0.1");
      expect(formatContourLabel(1, "RAIN12")).toBe("1");
      expect(formatContourLabel(10, "RAIN12")).toBe("10");
      expect(formatContourLabel(25, "RAIN12")).toBe("25");
    });

    it("formats rain element units as mm", () => {
      expect(formatElementUnit("RAIN12")).toBe("mm");
      expect(formatElementUnit("ecmwf_hr/rain12")).toBe("mm");
      expect(formatElementUnit("APCP")).toBe("mm");
      expect(formatElementUnit("TP")).toBe("mm");
    });
  });
});
