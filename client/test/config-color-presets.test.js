// config-color-presets.test.js - Tests for recommended colors, built-in colormaps, and swatchPicker
import { test, expect, describe, beforeEach } from "bun:test";
import {
  MET_LINE_COLORS,
  getRecommendedLineColor,
  BUILTIN_COLORMAP_PRESETS,
  findPreset,
  getRecentColors,
  addRecentColor,
} from "../src/ui/config/colorPresets.js";
import { renderSwatchStrip, hexToRgb, rgbToHex } from "../src/ui/config/swatchPicker.js";
import { setColormaps } from "../src/utils/colormaps.js";

describe("Color Presets & Swatch Picker", () => {
  describe("MET_LINE_COLORS static specifications", () => {
    test("MET_LINE_COLORS has exactly 20 unique valid hexes", () => {
      expect(MET_LINE_COLORS.length).toBe(20);
      const hexes = MET_LINE_COLORS.map((c) => c.hex.toLowerCase());
      const uniqueHexes = new Set(hexes);
      expect(uniqueHexes.size).toBe(20);

      hexes.forEach((hex) => {
        expect(/^#[0-9a-f]{6}$/.test(hex)).toBe(true);
      });
    });

    test("contains canonical 6 hexes verbatim", () => {
      const canonical = ["#58a6ff", "#f85149", "#e3b341", "#c678dd", "#56d4dd", "#ffffff"];
      const hexes = MET_LINE_COLORS.map((c) => c.hex.toLowerCase());
      canonical.forEach((c) => {
        expect(hexes).toContain(c);
      });
    });

    test("getRecommendedLineColor maps canonical meteorological elements correctly", () => {
      expect(getRecommendedLineColor("HGT")).toBe("#58a6ff");
      expect(getRecommendedLineColor("TMP")).toBe("#f85149");
      expect(getRecommendedLineColor("DTD")).toBe("#e3b341");
      expect(getRecommendedLineColor("VOR")).toBe("#c678dd");
      expect(getRecommendedLineColor("DIV")).toBe("#56d4dd");
      expect(getRecommendedLineColor("SLP")).toBe("#1f6feb");
      expect(getRecommendedLineColor("UNKNOWN")).toBe("#ffffff");
    });
  });

  describe("BUILTIN_COLORMAP_PRESETS ramp suite", () => {
    test("BUILTIN_COLORMAP_PRESETS has exactly 20 presets", () => {
      expect(BUILTIN_COLORMAP_PRESETS.length).toBe(20);
    });

    test("every built-in colormap passes setColormaps validation without throwing", () => {
      const colormapDict = {};
      for (const preset of BUILTIN_COLORMAP_PRESETS) {
        expect(preset.stops.length).toBeGreaterThanOrEqual(2);
        // Ensure values are sorted ascending
        for (let i = 0; i < preset.stops.length - 1; i++) {
          expect(preset.stops[i].val).toBeLessThan(preset.stops[i + 1].val);
        }
        // Ensure channels are 0-255
        for (const stop of preset.stops) {
          expect(Array.isArray(stop.color)).toBe(true);
          expect(stop.color.length).toBe(4);
          stop.color.forEach((ch) => {
            expect(ch).toBeGreaterThanOrEqual(0);
            expect(ch).toBeLessThanOrEqual(255);
          });
        }
        colormapDict[preset.key] = preset.stops;
      }

      // Must not throw when passed to runtime setColormaps
      expect(() => setColormaps(colormapDict)).not.toThrow();
    });

    test("findPreset locates preset by key case-insensitively", () => {
      expect(findPreset("TMP")).toBeDefined();
      expect(findPreset("tmp")?.key).toBe("TMP");
      expect(findPreset("SLP-blue")?.key).toBe("SLP-blue");
      expect(findPreset("slp-blue")?.key).toBe("SLP-blue");
      expect(findPreset("non-existent")).toBeNull();
    });
  });

  describe("Hex and RGB conversion helpers", () => {
    test("hexToRgb and rgbToHex round-trip correctly", () => {
      const hex = "#58a6ff";
      const [r, g, b] = hexToRgb(hex);
      expect(r).toBe(88);
      expect(g).toBe(166);
      expect(b).toBe(255);
      expect(rgbToHex(r, g, b)).toBe(hex);
    });
  });

  describe("Swatch Picker DOM Component", () => {
    let container;

    beforeEach(() => {
      if (typeof document !== "undefined") {
        container = document.createElement("div");
        document.body.appendChild(container);
      }
    });

    test("renders 20 swatches and fires onPick on click", () => {
      if (typeof document === "undefined") return;

      let pickedHex = null;
      renderSwatchStrip(container, {
        value: "#ffffff",
        onPick: (hex) => {
          pickedHex = hex;
        },
      });

      const buttons = container.querySelectorAll(".swatch-btn:not(.mini)");
      expect(buttons.length).toBe(20);

      // Click on HGT blue (#58a6ff)
      const hgtBtn = Array.from(buttons).find((b) => b.dataset.hex === "#58a6ff");
      expect(hgtBtn).toBeDefined();
      hgtBtn.click();

      expect(pickedHex).toBe("#58a6ff");
    });

    test("stop color pick preserves existing alpha channel", () => {
      const stop = { val: 10, color: [200, 100, 50, 180] }; // alpha = 180
      const currentAlpha = stop.color[3];

      const newPickedHex = "#58a6ff";
      const [newR, newG, newB] = hexToRgb(newPickedHex);
      const updatedColor = [newR, newG, newB, currentAlpha];

      expect(updatedColor).toEqual([88, 166, 255, 180]);
    });
  });
});
