// derived_persist.test.js - Regression tests for layer-state persistence:
//
//  1. Upper-air eye-hide + config survive keyboard level steps (the
//     snapshot-config merge in derivedContours.js used to resurrect stale
//     level ids and un-hide layers).
//  2. Custom RH raster palette survives NWP time chips.
//
// The integration scenarios run in throwaway `bun` subprocesses (see
// test/helpers/*_scenario.js) because bun's mock.module leaks across test
// files in one process. This file itself uses no mocks and cannot pollute
// the suite.
import { test, expect, describe } from "bun:test";
import { readSrcText } from "../helpers/cssText.js";

function runScenario(relPath) {
  const abs = new URL(`../helpers/${relPath}`, import.meta.url).pathname;
  const proc = Bun.spawnSync(["bun", "test", abs], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120000,
  });
  const stdout = String(proc.stdout || "");
  const stderr = String(proc.stderr || "").slice(0, 500);
  const doc = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{") && l.endsWith("}"))
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .find((d) => d && typeof d.ok === "boolean");
  if (!doc) {
    throw new Error(`scenario ${relPath} produced no JSON (exit=${proc.exitCode}) stderr=${stderr}`);
  }
  if (!doc.ok) {
    throw new Error(`scenario ${relPath} failed: ${doc.error || "unknown"}`);
  }
  return doc;
}

describe("derived layer persistence (isolated subprocess scenarios)", () => {
  test("derivedContours.js re-asserts layerId/visible after snapshot merges", () => {
    const src = readSrcText("services/derivedContours.js");
    expect(src).toContain("cfg.layerId = targetId;");
    expect(src).toContain("cfg.visible = isVisible;");
  });

  test("upper-air hide/config survive keyboard level step 500->400", () => {
    const doc = runScenario("ua_level_scenario.js");
    expect(doc.levelStep.level).toBe(400);
    expect(doc.levelStep.stale500Gone).toBe(true);
    expect(doc.levelStep.hgt400Present).toBe(true);
    expect(doc.levelStep.hgt400Visible).toBe(false);
    expect(doc.levelStep.hgt400ShowLine).toBe(false);
    expect(doc.levelStep.station400Present).toBe(true);
    expect(doc.freshReload.present).toBe(true);
    expect(doc.freshReload.visible).toBe(true);
    expect(doc.freshReload.singleRow).toBe(true);
  });

  test("RH raster palette survives NWP time chip", () => {
    const doc = runScenario("rh_palette_scenario.js");
    expect(doc.chip.palettePath).toBe("/palettes/RH/custom-rh-raster.xml");
    expect(doc.chip.colormap).toBe("palette:rh");
    expect(doc.chip.rasterCalls).toBeGreaterThan(0);
    expect(doc.chip.rasterColormap).toBe("palette:rh");
    expect(doc.chip.legendCalls).toBeGreaterThan(0);
    expect(doc.chip.legendColormap).toBe("palette:rh");
  });
});
