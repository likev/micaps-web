// stale_cpu_review_fixes.test.js - Regression and deep verification tests for stale tips & high CPU review
import { describe, it, expect } from "bun:test";
import { fetchTree } from "../src/api/catalogApi.js";
import {
  DEFAULT_TOLERANCES,
  getDefaultToleranceForLayer,
  resolveLayerTime,
  parseTimestamp,
} from "../src/utils/timeResolver.js";
import { createColorResolver } from "../src/utils/colormaps.js";
import { applyPresetToWindow } from "../src/lib/services/appWorkflow.js";

describe("Stale Tips & High CPU Review 1 Fixes", () => {
  describe("1. Catalog API cycle/prefix parameter forwarding", () => {
    it("fetchTree passes cycle parameter to /api/catalog/tree", async () => {
      // Mock global fetch to intercept query parameters
      const originalFetch = globalThis.fetch;
      let requestedUrl = "";
      globalThis.fetch = async (url) => {
        requestedUrl = String(url);
        return {
          ok: true,
          status: 200,
          json: async () => [{ name: "26101408.024", size: 100 }],
        };
      };

      try {
        await fetchTree("ECMWF_HR/TMP/850", 100, 850, { cycle: "26101408" });
        expect(requestedUrl).toContain("cycle=26101408");
        expect(requestedUrl).toContain("level=850");

        await fetchTree("ECMWF_HR/TMP", 100, { cycle: "26101408" });
        expect(requestedUrl).toContain("cycle=26101408");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("2. Color resolver robustness & LUT safety", () => {
    it("createColorResolver returns an allocated array when out is omitted", () => {
      const resolver = createColorResolver("RAIN");
      // Call without 'out' array - should not throw TypeError
      const color = resolver(15.0);
      expect(color).toBeDefined();
      expect(color.length).toBe(4);
      expect(color[3]).toBeGreaterThan(0); // Alpha > 0
    });

    it("createColorResolver skips dry rain pixels (< 0.1 mm) with alpha 0", () => {
      const resolver = createColorResolver("RAIN");
      const out = new Uint8ClampedArray(4);
      resolver(0.05, out, 0);
      expect(out[3]).toBe(0); // Transparent
    });
  });

  describe("3. Tolerances for NWP models and Surface elements", () => {
    it("assigns RAIN06, ECMWF_ENSEMBLE_PRODUCT, and FORECAST_PRODUCT correct tolerances", () => {
      expect(DEFAULT_TOLERANCES.RAIN06).toBe(360);
      expect(DEFAULT_TOLERANCES.ECMWF_ENSEMBLE_PRODUCT).toBe(360);
      expect(DEFAULT_TOLERANCES.FORECAST_PRODUCT).toBe(360);
    });

    it("checks element tolerance before generic SURFACE fallback", () => {
      const global3h = {
        model: "SURFACE",
        element: "PLOT_GLOBAL_3H",
        type: "station",
      };
      // Must receive 180 min, not generic SURFACE 90 min
      expect(getDefaultToleranceForLayer(global3h)).toBe(180);

      const surfaceRain24 = {
        model: "SURFACE",
        element: "RAIN24",
        type: "contour",
      };
      // Must receive 720 min, not generic SURFACE 90 min
      expect(getDefaultToleranceForLayer(surfaceRain24)).toBe(720);
    });

    it("assigns NWP tolerance to simulated radar reflectivity (GRAPES_3KM)", () => {
      const nwpRadar = {
        model: "GRAPES_3KM",
        element: "RADAR_COMBINATION_REFLECTIVITY",
        forecastCycle: "26101420",
        period: 12,
        type: "contour",
      };
      // Must receive 180 min (GRAPES_3KM), NOT 10 min observation radar tolerance!
      expect(getDefaultToleranceForLayer(nwpRadar)).toBe(180);
    });
  });

  describe("4. Observation Preset Reload Time Clearing", () => {
    it("applyPresetToWindow unconditionally clears obsTime and wallClockCursor on observation preset reload", () => {
      const win = {
        id: "win-1",
        obsTime: "20261014080000.000",
        wallClockCursor: 1760428800000,
        stepLength: 3,
        _obsTimeline: { files: ["20261014080000.000"] },
        _obsTimelinePath: "SURFACE/PLOT_GLOBAL_3H",
        activeGroup: {
          id: "surface-synoptic",
          name: "Surface Synoptic Plot",
          isObservation: true,
          layers: [
            { id: "stn-1", model: "SURFACE", element: "PLOT_GLOBAL_3H", sampleTimes: ["20261014080000.000"] },
          ],
        },
      };

      // Reload the SAME preset
      const groupToReload = win.activeGroup;
      applyPresetToWindow(win, groupToReload);

      // Must be cleared so loader initiates fresh catalog fetch
      expect(win.obsTime).toBeNull();
      expect(win._obsTimeline).toBeNull();
      expect(win._obsTimelinePath).toBeNull();
      expect(win.wallClockCursor).toBeNull();
      // Layers must have sampleTimes stripped so loader doesn't skip fetchTree
      expect(win.activeGroup.layers[0].sampleTimes).toBeUndefined();
    });
  });

  describe("5. Older NWP Cycle Resolution without False-Positive Stale Tip", () => {
    it("resolves older cycle lead time as exact when cycle lead times are provided", () => {
      const oldCycle = "26101208"; // 2 days old
      const period = 24;
      const targetCursorMs = parseTimestamp({ cycle: oldCycle, period });
      expect(targetCursorMs).not.toBeNull();

      const layer = {
        id: "ec-tmp-850",
        model: "ECMWF_HR",
        element: "TMP",
        level: 850,
        forecastCycle: oldCycle,
        period: 24,
        file: `${oldCycle}.024`,
        sampleTimes: [
          `${oldCycle}.000`,
          `${oldCycle}.012`,
          `${oldCycle}.024`,
          `${oldCycle}.036`,
          `${oldCycle}.048`,
        ],
      };

      const resolved = resolveLayerTime(layer, targetCursorMs);
      expect(resolved.status).toBe("current");
      expect(resolved.isHardStale).toBe(false);
      expect(resolved.sampleFile).toBe(`${oldCycle}.024`);
    });
  });
});
