// viewport_crop.test.js - Config-driven memory budget (no hardcoded cell counts)
import { test, expect, describe } from "bun:test";
import fs from "fs";
import {
  CURRENT_CONFIG,
  DEFAULT_MAX_EFFECTIVE_CELLS,
  getMaxEffectiveCells,
} from "../src/config/presets.js";
import {
  resolveContourStep,
  shouldBypassCrop,
  getFullGridStep,
} from "../src/utils/viewportCrop.js";

describe("performance.maxEffectiveCells config (Architecture §8.8.4)", () => {
  test("config.json declares performance.maxEffectiveCells = 50000", () => {
    const parsed = JSON.parse(fs.readFileSync("./config.json", "utf8"));
    expect(parsed).toHaveProperty("performance");
    expect(parsed.performance.maxEffectiveCells).toBe(50000);
  });

  test("getMaxEffectiveCells: default, config, override precedence, invalid fallback, clamping", () => {
    const savedPerf = CURRENT_CONFIG.performance;
    const savedWindow = typeof window !== "undefined" ? window.__MICAPS_CONFIG__ : undefined;
    try {
      delete CURRENT_CONFIG.performance;
      try { if (typeof window !== "undefined") delete window.__MICAPS_CONFIG__?.performance; } catch {}
      expect(getMaxEffectiveCells()).toBe(DEFAULT_MAX_EFFECTIVE_CELLS);

      CURRENT_CONFIG.performance = { maxEffectiveCells: 80000 };
      expect(getMaxEffectiveCells()).toBe(80000);

      // Explicit override wins over config
      expect(getMaxEffectiveCells(25000)).toBe(25000);

      // Invalid config falls back to default
      CURRENT_CONFIG.performance = { maxEffectiveCells: "huge" };
      expect(getMaxEffectiveCells()).toBe(DEFAULT_MAX_EFFECTIVE_CELLS);
      CURRENT_CONFIG.performance = { maxEffectiveCells: -5 };
      expect(getMaxEffectiveCells()).toBe(DEFAULT_MAX_EFFECTIVE_CELLS);

      // Clamping to sane bounds
      expect(getMaxEffectiveCells(1)).toBe(1000);
      expect(getMaxEffectiveCells(999999999)).toBe(4000000);
    } finally {
      if (savedPerf === undefined) delete CURRENT_CONFIG.performance;
      else CURRENT_CONFIG.performance = savedPerf;
      try {
        if (typeof window !== "undefined" && savedWindow !== undefined) {
          window.__MICAPS_CONFIG__ = savedWindow;
        }
      } catch {}
    }
  });
});

describe("cell-count LOD helpers (config-driven)", () => {
  test("resolveContourStep brackets at default 50k budget", () => {
    expect(resolveContourStep(45241, 50000)).toBe(1); // regional mesh: full res
    expect(resolveContourStep(49999, 50000)).toBe(1);
    expect(resolveContourStep(60000, 50000)).toBe(2); // 99%-pruned global view
    expect(resolveContourStep(200000, 50000)).toBe(2);
    expect(resolveContourStep(300000, 50000)).toBe(3);
    expect(resolveContourStep(6483600, 50000)).toBe(12); // full 0.1° global grid
  });

  test("shouldBypassCrop gates on configured budget", () => {
    expect(shouldBypassCrop(45241, 50000)).toBe(true);
    expect(shouldBypassCrop(60000, 50000)).toBe(false);
    expect(shouldBypassCrop(60000, 80000)).toBe(true); // raised budget bypasses
  });

  test("getFullGridStep preserves legacy guard, scaled from budget", () => {
    // Default budget 50k × factor 10 = 500k legacy threshold
    expect(getFullGridStep(281, 161, 50000)).toBe(1); // 45241 cells
    expect(getFullGridStep(720, 361, 50000)).toBe(1); // 259920 cells
    expect(getFullGridStep(1000, 600, 50000)).toBe(2); // 600k cells
    // Custom budget scales the guard
    expect(getFullGridStep(720, 361, 20000)).toBe(2); // 259920 > 200k
  });
});
