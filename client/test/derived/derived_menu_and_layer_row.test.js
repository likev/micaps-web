// client/test/derived/derived_menu_and_layer_row.test.js
// Verification of derived layers in PresetMenu/submenus and removal from single layer config rows

import { describe, test, expect } from "bun:test";
import fs from "fs";
import { readSrcText } from "../helpers/cssText.js";
import { isDivider } from "../../src/config/presets.js";

describe("Derived Layers in Menu/Submenu and Single Layer Row Cleanup", () => {
  const layerRowSrc = readSrcText("components/LayerRow.svelte");
  const presetMenuSrc = readSrcText("components/PresetMenu.svelte");
  const rawConfig = fs.readFileSync("/root/downloads/micaps-web/client/config.json", "utf-8");
  const config = JSON.parse(rawConfig);

  const DERIVED_MULTI_LAYER_ELEMENTS = [
    "K-INDEX",
    "SHOWALTER",
    "LIFTED",
    "SWEAT",
    "TT",
    "SHEAR",
    "T850-500",
  ];

  test("LayerRow.svelte: multi-layer derived elements are removed from isUpperStation single layer row", () => {
    // Locate the station branch in LayerRow.svelte
    const stationBranchStart = layerRowSrc.indexOf('{:else if layer.type === "station"}');
    const stationBranchEnd = layerRowSrc.indexOf('{:else if layer.type === "wind"}');
    expect(stationBranchStart).toBeGreaterThan(-1);
    expect(stationBranchEnd).toBeGreaterThan(stationBranchStart);
    const stationBranch = layerRowSrc.slice(stationBranchStart, stationBranchEnd);

    // Locate the isUpperStation branch inside stationBranch
    const isUpperStart = stationBranch.indexOf("{#if isUpperStation}");
    const isUpperEnd = stationBranch.indexOf("{:else}", isUpperStart);
    expect(isUpperStart).toBeGreaterThan(-1);
    expect(isUpperEnd).toBeGreaterThan(isUpperStart);
    const upperAirSlice = stationBranch.slice(isUpperStart, isUpperEnd);

    // Verify none of the multi-layer derived elements exist in upperAirSlice
    for (const elem of DERIVED_MULTI_LAYER_ELEMENTS) {
      expect(upperAirSlice).not.toContain(`value="${elem}"`);
    }

    // Verify single-level station derived elements are preserved
    expect(upperAirSlice).toContain('value="HGT"');
    expect(upperAirSlice).toContain('value="TMP"');
    expect(upperAirSlice).toContain('value="TD"');
    expect(upperAirSlice).toContain('value="DTD"');
    expect(upperAirSlice).toContain('value="WIND"');
    expect(upperAirSlice).toContain('value="VOR"');
    expect(upperAirSlice).toContain('value="DIV"');
  });

  test("LayerRow.svelte: Add Derived Layer row is removed from single contour layer config", () => {
    const contourBranchStart = layerRowSrc.indexOf('{#if layer.type === "contour"}');
    const contourBranchEnd = layerRowSrc.indexOf('{:else if layer.type === "station"}');
    expect(contourBranchStart).toBeGreaterThan(-1);
    expect(contourBranchEnd).toBeGreaterThan(contourBranchStart);
    const contourBranch = layerRowSrc.slice(contourBranchStart, contourBranchEnd);

    // "Add Derived Layer" and "sel-contour-derived-" must not exist in single contour layer row
    expect(contourBranch).not.toContain("Add Derived Layer");
    expect(contourBranch).not.toContain("sel-contour-derived-");
    for (const elem of DERIVED_MULTI_LAYER_ELEMENTS) {
      expect(contourBranch).not.toContain(`value="${elem}"`);
    }
  });

  test("LayerRow.svelte: multi-layer derived elements are removed from single wind layer row", () => {
    const windBranchStart = layerRowSrc.indexOf('{:else if layer.type === "wind"}');
    const windBranchEnd = layerRowSrc.indexOf('{:else if layer.type === "tlogp"}');
    expect(windBranchStart).toBeGreaterThan(-1);
    expect(windBranchEnd).toBeGreaterThan(windBranchStart);
    const windBranch = layerRowSrc.slice(windBranchStart, windBranchEnd);

    // Locate sel-wind-contour select
    const selStart = windBranch.indexOf("sel-wind-contour-");
    const selEnd = windBranch.indexOf("</select>", selStart);
    expect(selStart).toBeGreaterThan(-1);
    expect(selEnd).toBeGreaterThan(selStart);
    const selSlice = windBranch.slice(selStart, selEnd);

    // Multi-layer elements should not be in single-layer wind contour select
    expect(selSlice).not.toContain('value="K-INDEX"');
    expect(selSlice).not.toContain('value="SHOWALTER"');
    expect(selSlice).not.toContain('value="LIFTED"');
    expect(selSlice).not.toContain('value="SWEAT"');
    expect(selSlice).not.toContain('value="TT"');
    expect(selSlice).not.toContain('value="SHEAR"');
    expect(selSlice).not.toContain('value="T850-500"');

    // Single-level kinematic derivations are preserved
    expect(selSlice).toContain('value="VOR"');
    expect(selSlice).toContain('value="DIV"');
  });

  test("config.json: contains all derived layers as presets under Derived Diagnostics submenu", () => {
    const diagPresets = config.presets.filter((p) => p.category === "Derived Diagnostics");
    expect(diagPresets.length).toBeGreaterThanOrEqual(9);

    const requiredNwpElements = ["K-INDEX", "SHOWALTER", "LIFTED", "SWEAT", "TT", "SHEAR", "THICKNESS", "TMP"];
    for (const elem of requiredNwpElements) {
      const match = diagPresets.some((p) =>
        p.layers.some((l) => l.element === elem && l.path.startsWith("/api/derived/ECMWF_HR/"))
      );
      expect(match).toBe(true);
    }
  });

  test("config.json: contains all sounding derived layers as presets under Upper-Air Observations submenu", () => {
    const uaPresets = config.presets.filter((p) => p.category === "Upper-Air Observations");
    expect(uaPresets.length).toBeGreaterThanOrEqual(8);

    const requiredSoundingElements = ["K-INDEX", "SHOWALTER", "LIFTED", "SWEAT", "TT", "SHEAR", "THICKNESS", "TMP"];
    for (const elem of requiredSoundingElements) {
      const match = uaPresets.some((p) =>
        p.layers.some((l) => l.element === elem && l.path.startsWith("/api/derived/UPPER_AIR/PLOT/"))
      );
      expect(match).toBe(true);
    }
  });

  test("PresetMenu categorization maps all derived presets into functional submenus", () => {
    const validPresets = config.presets.filter((g) => g && !isDivider(g));
    const catMap = new Map();
    for (const p of validPresets) {
      const catName = (p.category && String(p.category).trim()) || "Other Presets";
      if (!catMap.has(catName)) catMap.set(catName, []);
      catMap.get(catName).push(p);
    }

    const diagList = catMap.get("Derived Diagnostics");
    expect(diagList).toBeDefined();
    expect(diagList.length).toBeGreaterThanOrEqual(17);

    // K-Index preset in submenu
    const kIndexPreset = diagList.find((p) => p.id === "derived-ecmwf-k-index");
    expect(kIndexPreset).toBeDefined();
    expect(kIndexPreset.hasLevel).toBe(false);
    expect(kIndexPreset.layers[0].path).toBe("/api/derived/ECMWF_HR/K-INDEX");

    // Sounding K-Index in Upper-Air Observations submenu
    const uaList = catMap.get("Upper-Air Observations");
    expect(uaList).toBeDefined();
    const soundingKPreset = uaList.find((p) => p.id === "derived-sounding-k-index");
    expect(soundingKPreset).toBeDefined();
    expect(soundingKPreset.isObservation).toBe(true);
    expect(soundingKPreset.layers[0].path).toBe("/api/derived/UPPER_AIR/PLOT/K-INDEX");
  });

  test("PresetMenu.svelte badge renders Diag for derived diagnostics rather than Sfc", () => {
    expect(presetMenuSrc).toContain(".category?.includes(\"Derived\") ? \"Diag\"");
  });

  test("replaceModelInPath correctly updates model in derived virtual paths and standard paths", async () => {
    const { replaceModelInPath } = await import("../../src/lib/stores/tabsCore.js");
    expect(replaceModelInPath("/api/derived/ECMWF_HR/K-INDEX", "JAPAN_MR")).toBe("/api/derived/JAPAN_MR/K-INDEX");
    expect(replaceModelInPath("/api/derived/ECMWF_HR/TMP/850-500", "GRAPES_GFS")).toBe("/api/derived/GRAPES_GFS/TMP/850-500");
    expect(replaceModelInPath("ECMWF_HR/TMP/850", "JAPAN_MR")).toBe("JAPAN_MR/TMP/850");
    expect(replaceModelInPath("UPPER_AIR/PLOT/500", "JAPAN_MR")).toBe("JAPAN_MR/PLOT/500");
  });

  test("App.svelte and visibilityActions preserve virtual /api/derived/ paths during model changes and visibility toggle", () => {
    const appSrc = readSrcText("App.svelte");
    const visSrc = readSrcText("ui/layers/visibilityActions.js");

    expect(appSrc).toContain("replaceModelInPath(l.path, newModel)");
    expect(appSrc).toContain("replaceModelInPath(l.path, w.model)");
    expect(visSrc).toContain(".includes(\"/api/derived/\")");
  });
});
