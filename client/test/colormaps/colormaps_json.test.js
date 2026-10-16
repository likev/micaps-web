// colormaps_json.test.js - Unit tests for standalone colormaps.json configuration and loader
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadColormaps, loadPresetGroups, CURRENT_CONFIG } from "../../src/config/presets.js";
import { COLORMAPS } from "../../src/utils/colormaps.js";

const ROOT = resolve(import.meta.dir, "../../..");
const COLORMAPS_PATH = resolve(ROOT, "client/colormaps.json");
const CONFIG_PATH = resolve(ROOT, "client/config.json");

describe("Standalone colormaps.json Specification & Loader", () => {
  it("colormaps.json exists on disk and is valid JSON", () => {
    expect(existsSync(COLORMAPS_PATH)).toBe(true);
    const content = readFileSync(COLORMAPS_PATH, "utf8");
    const parsed = JSON.parse(content);
    expect(typeof parsed).toBe("object");
    expect(parsed).not.toBeNull();
    expect(Array.isArray(parsed)).toBe(false);
  });

  it("colormaps.json contains all required meteorological palettes", () => {
    const parsed = JSON.parse(readFileSync(COLORMAPS_PATH, "utf8"));
    const requiredPalettes = [
      "TMP", "WIND", "RH", "HGT", "RAIN", "DTD", "VOR", "DIV",
      "K_INDEX", "SHOWALTER", "LIFTED", "SWEAT", "TT", "SHEAR", "THICKNESS",
      "T_VAR", "SLP_VAR", "CAPE", "HELICITY", "RADAR", "ECHO_TOP", "VIL",
      "QPE", "SNOW", "SST", "TCWV", "PROBABILITY", "VARIANCE", "PRECIP_TYPE",
      "HAZARDS", "IR_TEMP", "ALBEDO", "WV", "CTT", "DUST",
    ];

    for (const key of requiredPalettes) {
      expect(parsed[key]).toBeDefined();
      expect(Array.isArray(parsed[key])).toBe(true);
      expect(parsed[key].length).toBeGreaterThanOrEqual(2);
    }
  });

  it("every palette in colormaps.json has valid numeric stops and 4-channel colors", () => {
    const parsed = JSON.parse(readFileSync(COLORMAPS_PATH, "utf8"));
    for (const [key, stops] of Object.entries(parsed)) {
      expect(stops.length).toBeGreaterThanOrEqual(2);
      let lastVal = -Infinity;
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        expect(typeof stop.val).toBe("number");
        expect(Number.isFinite(stop.val)).toBe(true);
        expect(stop.val).toBeGreaterThanOrEqual(lastVal);
        lastVal = stop.val;

        expect(Array.isArray(stop.color)).toBe(true);
        expect(stop.color.length).toBe(4);
        for (const channel of stop.color) {
          expect(Number.isInteger(channel)).toBe(true);
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it("config.json does not duplicate the 18 new meteorological colormaps, minimizing file size", () => {
    const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    const colormapsJson = JSON.parse(readFileSync(COLORMAPS_PATH, "utf8"));

    const newPalettes = [
      "CAPE", "HELICITY", "RADAR", "ECHO_TOP", "VIL", "QPE",
      "SNOW", "SST", "TCWV", "PROBABILITY", "VARIANCE", "PRECIP_TYPE",
      "HAZARDS", "IR_TEMP", "ALBEDO", "WV", "CTT", "DUST",
    ];

    for (const key of newPalettes) {
      expect(colormapsJson[key]).toBeDefined();
      expect(config.colormaps?.[key]).toBeUndefined();
    }
  });

  describe("Runtime Loader Integration", () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("loadColormaps loads and applies colormaps from colormaps.json", async () => {
      const mockColormaps = {
        TEST_RAMP: [
          { val: 0, color: [0, 0, 0, 0] },
          { val: 100, color: [255, 255, 255, 255] },
        ],
      };

      globalThis.fetch = async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("colormaps")) {
          return new Response(JSON.stringify(mockColormaps), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("{}", { status: 404 });
      };

      const result = await loadColormaps();
      expect(result).not.toBeNull();
      expect(result.TEST_RAMP).toBeDefined();
      expect(COLORMAPS.TEST_RAMP).toBeDefined();
    });

    it("loadPresetGroups loads colormaps.json and config.json together and merges them", async () => {
      const mockColormaps = {
        STANDALONE_PALETTE: [
          { val: 0, color: [10, 20, 30, 255] },
          { val: 50, color: [100, 200, 250, 255] },
        ],
      };

      const mockConfig = {
        presets: [
          {
            id: "preset-test-1",
            name: "Test Group",
            layers: [],
          },
        ],
        colormaps: {
          CONFIG_PALETTE: [
            { val: -10, color: [50, 50, 50, 255] },
            { val: 10, color: [200, 200, 200, 255] },
          ],
        },
      };

      globalThis.fetch = async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("colormaps")) {
          return new Response(JSON.stringify(mockColormaps), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (urlStr.includes("config")) {
          return new Response(JSON.stringify(mockConfig), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("{}", { status: 404 });
      };

      const groups = await loadPresetGroups();
      expect(Array.isArray(groups)).toBe(true);
      expect(groups.length).toBe(1);
      expect(groups[0].id).toBe("preset-test-1");

      // Both palettes must be populated in CURRENT_CONFIG and COLORMAPS
      expect(CURRENT_CONFIG.colormaps.STANDALONE_PALETTE).toBeDefined();
      expect(CURRENT_CONFIG.colormaps.CONFIG_PALETTE).toBeDefined();
      expect(COLORMAPS.STANDALONE_PALETTE).toBeDefined();
      expect(COLORMAPS.CONFIG_PALETTE).toBeDefined();
    });
  });
});
