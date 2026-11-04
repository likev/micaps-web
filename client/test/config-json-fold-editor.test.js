// config-json-fold-editor.test.js - Tests for foldable dual-document JSON editor and intra-item folding
import { test, expect, describe } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  createFormState,
  clonePresetGroup,
  insertDivider,
  moveEntry,
  deleteDivider,
} from "../src/ui/config/formState.js";
import {
  collectItemCollapsibleKeys,
  foldAllItemKeys,
  unfoldAllItemKeys,
  unfoldItemKey,
  formatItemWithFoldedKeys,
  formatPresetLevel,
  formatLayerLevel,
  isPrimitiveArray,
  isStopObject,
  toCompactOneLine,
  formatJsonError,
} from "../src/ui/config/jsonFoldState.js";
import {
  stopsToCSSGradient,
  getColormapUsageCounts,
  rewriteColormapReferences,
} from "../src/ui/config/colormapUtils.js";
import { formatCompactJSON } from "../src/config/presets.js";

const clientDir = resolve(__dirname, "..");
const configPath = resolve(clientDir, "config.json");
const colormapsPath = resolve(clientDir, "colormaps.json");

describe("Config Panel Redesign - Foldable Dual-Document JSON Editor", () => {
  const diskConfig = JSON.parse(readFileSync(configPath, "utf8"));
  const diskColormaps = JSON.parse(readFileSync(colormapsPath, "utf8"));

  test("1. Direct loading & separation of config.json and colormaps.json", () => {
    const fullMerged = {
      ...diskConfig,
      colormaps: diskColormaps,
    };
    const formState = createFormState(fullMerged);

    // configDraft contains presets, renderProfiles, basemap, performance, but NOT colormaps
    const configDraft = formState.getConfigDraft();
    expect(configDraft.colormaps).toBeUndefined();
    expect(Array.isArray(configDraft.presets)).toBe(true);
    expect(configDraft.presets.length).toBeGreaterThan(150);
    expect(configDraft.renderProfiles).toBeDefined();
    expect(Object.keys(configDraft.renderProfiles).length).toBeGreaterThan(10);
    expect(configDraft.basemap).toBeDefined();
    expect(configDraft.performance).toBeDefined();

    // colormapsDraft contains all color ramps from colormaps.json
    const colormapsDraft = formState.getColormapsDraft();
    expect(colormapsDraft.TMP).toBeDefined();
    expect(colormapsDraft.WIND).toBeDefined();
    expect(colormapsDraft.RH).toBeDefined();
    expect(Object.keys(colormapsDraft).length).toBeGreaterThanOrEqual(30);

    // getDraft() combines them seamlessly for backward compatibility
    const merged = formState.getDraft();
    expect(merged.presets).toBeDefined();
    expect(merged.colormaps).toBeDefined();
    expect(merged.colormaps.TMP).toBeDefined();
  });

  test("2. Document-level default all-folded state, single-unfold accordion, and foldAll()", () => {
    const formState = createFormState({
      ...diskConfig,
      colormaps: diskColormaps,
    });

    // Default: all items folded (unfoldedItemPath is null)
    expect(formState.getUnfoldedItemPath()).toBeNull();

    // Unfold item presets.0
    formState.unfoldItem("presets.0");
    expect(formState.getUnfoldedItemPath()).toBe("presets.0");

    // Unfold item presets.1 folds presets.0 and unfolds presets.1 (single-unfold accordion)
    formState.unfoldItem("presets.1");
    expect(formState.getUnfoldedItemPath()).toBe("presets.1");

    // toggleItem toggles the item
    formState.toggleItem("presets.1");
    expect(formState.getUnfoldedItemPath()).toBeNull();

    // foldAll() closes any open item
    formState.unfoldItem("colormaps.TMP");
    expect(formState.getUnfoldedItemPath()).toBe("colormaps.TMP");
    formState.foldAll();
    expect(formState.getUnfoldedItemPath()).toBeNull();

    // Verify reactive subscription notifications, revision counter, and state properties
    let notifiedCount = 0;
    let lastNotifiedState = null;
    const unsub = formState.subscribe((s) => {
      notifiedCount++;
      lastNotifiedState = s;
    });
    expect(notifiedCount).toBe(1); // Immediate sync notification on subscribe
    expect(lastNotifiedState).toBe(formState);

    const prevRev = formState.revision;
    formState.unfoldItem("presets.2");
    expect(notifiedCount).toBe(2);
    expect(formState.revision).toBe(prevRev + 1);
    expect(formState.unfoldedItemPath).toBe("presets.2");
    expect(formState.getUnfoldedItemPath()).toBe("presets.2");

    formState.foldAll();
    expect(notifiedCount).toBe(3);
    expect(formState.revision).toBe(prevRev + 2);
    expect(formState.unfoldedItemPath).toBeNull();
    expect(formState.getUnfoldedItemPath()).toBeNull();

    unsub();
  });

  test("3. Intra-item folding: primitive arrays always stay on a single line", () => {
    const samplePreset = {
      id: "composite-500hpa",
      name: "500hPa Composite",
      levels: [1000, 925, 850, 700, 500, 400, 300, 250, 200, 150, 100],
      layers: [
        {
          id: "rh",
          element: "RH",
          render: {
            colormap: "RH",
            levels: [0.1, 1, 5, 10, 50, 100],
            boldValues: [5880, 588],
          },
        },
      ],
    };

    expect(isPrimitiveArray(samplePreset.levels)).toBe(true);
    expect(isPrimitiveArray(samplePreset.layers[0].render.levels)).toBe(true);
    expect(isPrimitiveArray(samplePreset.layers[0].render.boldValues)).toBe(true);

    // When unfoldAllItemKeys is applied, primitive arrays must NOT be split into 10+ lines
    const allUnfoldedPaths = unfoldAllItemKeys();
    const formatted = formatItemWithFoldedKeys(samplePreset, allUnfoldedPaths);

    // Verify levels and boldValues are single horizontal lines
    const lines = formatted.text.split("\n");
    const levelsLine = lines.find((l) => l.includes('"levels":'));
    expect(levelsLine).toBeDefined();
    expect(levelsLine).toContain("[1000, 925, 850, 700, 500, 400, 300, 250, 200, 150, 100]");

    const boldLine = lines.find((l) => l.includes('"boldValues":'));
    expect(boldLine).toBeDefined();
    expect(boldLine).toContain("[5880, 588]");

    // The result must be 100% valid JSON parseable without error
    const parsed = JSON.parse(formatted.text);
    expect(parsed.levels.length).toBe(11);
    expect(parsed.layers[0].render.boldValues).toEqual([5880, 588]);
  });

  test("4. Intra-item folding: Fold All collapses nested blocks to single lines", () => {
    const samplePreset = {
      id: "composite-500hpa",
      name: "500hPa Composite",
      hasLevel: true,
      defaultLevel: 500,
      layers: [
        { id: "rh", element: "RH", render: { colormap: "RH" } },
        { id: "hgt", element: "HGT", render: { lineColor: "#917373" } },
      ],
      levels: [1000, 850, 500],
    };

    const foldedPaths = foldAllItemKeys(samplePreset);
    expect(foldedPaths.has("layers")).toBe(true);
    expect(foldedPaths.has("levels")).toBe(true);

    const res = formatItemWithFoldedKeys(samplePreset, foldedPaths);
    const lines = res.text.split("\n");

    // Top-level scalars remain on their own lines
    expect(lines.some((l) => l.includes('"id": "composite-500hpa"'))).toBe(true);
    expect(lines.some((l) => l.includes('"name": "500hPa Composite"'))).toBe(true);

    // layers is collapsed onto a single line
    const layersLine = lines.find((l) => l.includes('"layers":'));
    expect(layersLine).toBeDefined();
    expect(layersLine).toContain('"id": "rh"');
    expect(layersLine).toContain('"id": "hgt"');

    // Round-trip parse is losslessly preserved
    const parsed = JSON.parse(res.text);
    expect(parsed.id).toBe("composite-500hpa");
    expect(parsed.layers.length).toBe(2);
  });

  test("5. Intra-item folding: Unfold Key 'layers' expands with 1 line per layer", () => {
    const samplePreset = {
      id: "composite-500hpa",
      name: "500hPa Composite",
      layers: [
        { id: "rh", element: "RH", render: { colormap: "RH" } },
        { id: "hgt", element: "HGT", render: { lineColor: "#917373" } },
      ],
      levels: [1000, 500],
    };

    const foldSet = unfoldItemKey(samplePreset, "layers");
    expect(foldSet.has("layers")).toBe(false); // layers is unfolded
    expect(foldSet.has("layers[0]")).toBe(true); // individual layers remain compact single lines
    expect(foldSet.has("layers[1]")).toBe(true);
    expect(foldSet.has("levels")).toBe(true); // sibling levels remains folded

    const res = formatItemWithFoldedKeys(samplePreset, foldSet);
    const lines = res.text.split("\n");

    // layers[0] is on a single line
    const l0 = lines.find((l) => l.includes('"id": "rh"'));
    expect(l0).toBeDefined();
    expect(l0).toContain('"element": "RH"');

    // layers[1] is on a single line
    const l1 = lines.find((l) => l.includes('"id": "hgt"'));
    expect(l1).toBeDefined();
    expect(l1).toContain('"element": "HGT"');

    // Valid JSON
    const parsed = JSON.parse(res.text);
    expect(parsed.layers.length).toBe(2);
  });

  test("6. Intra-item folding: Unfold Key 'render' unfolds target and ancestor chain", () => {
    const samplePreset = {
      id: "composite-500hpa",
      layers: [
        { id: "rh", element: "RH", render: { colormap: "RH", opacity: 0.5 } },
      ],
      levels: [1000, 500],
    };

    const foldSet = unfoldItemKey(samplePreset, "render");
    // Ancestors "layers" and "layers[0]" must be unfolded so render is visible
    expect(foldSet.has("layers")).toBe(false);
    expect(foldSet.has("layers[0]")).toBe(false);
    expect(foldSet.has("layers[0].render")).toBe(false);
    // Sibling levels remains folded
    expect(foldSet.has("levels")).toBe(true);

    const res = formatItemWithFoldedKeys(samplePreset, foldSet);
    const parsed = JSON.parse(res.text);
    expect(parsed.layers[0].render.colormap).toBe("RH");
  });

  test("7. Colormap utilities: gradient calculation and usage tracking", () => {
    const stops = [
      { val: -40, color: [130, 20, 160, 255] },
      { val: 0, color: [255, 255, 255, 255] },
      { val: 40, color: [255, 0, 0, 255] },
    ];
    const grad = stopsToCSSGradient(stops);
    expect(grad).toContain("linear-gradient");
    expect(grad).toContain("rgba(130, 20, 160, 1.00) 0%");
    expect(grad).toContain("rgba(255, 0, 0, 1.00) 100%");

    // Usage tracking counts references
    const usage = getColormapUsageCounts(diskConfig);
    expect(typeof usage).toBe("object");
    expect(usage.TMP).toBeGreaterThan(0);
    expect(usage.RH).toBeGreaterThan(0);
  });

  test("8. Badge formatters for satellite channels, radar meters, and isobaric levels", () => {
    expect(formatPresetLevel({ id: "fy4b-true-color", defaultLevel: 12 })).toBe("C012");
    expect(formatPresetLevel({ id: "radar-mosaic-3000m", defaultLevel: 3000 })).toBe("3000 m");
    expect(formatPresetLevel({ id: "composite-500hpa", defaultLevel: 500 })).toBe("500 hPa");
    expect(formatPresetLevel({ id: "surface-obs", defaultLevel: 0 })).toBe("Sfc");
    expect(formatPresetLevel({ id: "custom", hasLevel: true })).toBe("Multi-Lvl");

    expect(formatLayerLevel({ model: "SATELLITE", level: 12 })).toBe("C012");
    expect(formatLayerLevel({ model: "RADAR", level: 3000 })).toBe("3000 m");
    expect(formatLayerLevel({ model: "ECMWF_HR", level: 850 })).toBe("850 hPa");
    expect(formatLayerLevel({ model: "SURFACE", level: null })).toBe("Sfc");
  });

  test("9. FormState item-level value modification and syntax error handling", () => {
    const formState = createFormState({
      ...diskConfig,
      colormaps: diskColormaps,
    });

    const origPreset = formState.getItemValue("presets.0");
    expect(origPreset).toBeDefined();

    // Modify preset via setItemValue
    const modified = { ...origPreset, name: "Updated Test Name" };
    formState.setItemValue("presets.0", modified);

    expect(formState.getItemValue("presets.0").name).toBe("Updated Test Name");
    expect(formState.isDirty()).toBe(true);

    // Syntax error tracking
    formState.setItemSyntaxError("presets.0", "Unexpected token , at line 4");
    expect(formState.hasSyntaxErrors()).toBe(true);
    expect(formState.getItemSyntaxError("presets.0")).toContain("Unexpected token");

    formState.clearItemSyntaxError("presets.0");
    expect(formState.hasSyntaxErrors()).toBe(false);
  });

  test("10. Gutter chevron line-to-key mapping and toggling", () => {
    const samplePreset = {
      id: "composite-500hpa",
      layers: [
        { id: "rh", element: "RH", render: { colormap: "RH" } },
      ],
      levels: [1000, 500],
    };

    const res = formatItemWithFoldedKeys(samplePreset, new Set(["layers[0].render"]));
    expect(res.lineKeys.size).toBeGreaterThan(0);

    // Gutter chevron entry for layers
    let foundLayersKey = false;
    for (const [lineNum, info] of res.lineKeys.entries()) {
      if (info.path === "layers") {
        foundLayersKey = true;
        expect(info.isFolded).toBe(false);
      }
    }
    expect(foundLayersKey).toBe(true);
  });

  test("11. Colormap stop editing and validation in colormapsDraft", () => {
    const formState = createFormState({
      ...diskConfig,
      colormaps: diskColormaps,
    });

    // Valid colormap modification
    const validStops = [
      { val: -10, color: [0, 0, 255, 255] },
      { val: 10, color: [255, 0, 0, 255] },
    ];
    formState.setItemValue("colormaps.TEST_PALETTE", validStops);
    expect(formState.getColormapsDraft().TEST_PALETTE).toEqual(validStops);
    expect(formState.isDirty()).toBe(true);
    expect(formState.getValidation().isValid).toBe(true);

    // Invalid colormap: less than 2 stops
    formState.setItemValue("colormaps.BAD_PALETTE", [{ val: 0, color: [0, 0, 0, 255] }]);
    expect(formState.getValidation().isValid).toBe(false);
    expect(formState.getValidation().colormapErrors.get("BAD_PALETTE")).toBeDefined();

    // Cleanup
    formState.deleteItem("colormaps.BAD_PALETTE");
    expect(formState.getColormapsDraft().BAD_PALETTE).toBeUndefined();
    expect(formState.getValidation().isValid).toBe(true);
  });

  test("12. Divider and preset operations on draft", () => {
    const formState = createFormState({
      ...diskConfig,
      colormaps: diskColormaps,
    });

    const initLen = formState.getConfigDraft().presets.length;
    formState.updateDraft((d) => {
      insertDivider(d, 0, "Top Divider");
    });
    expect(formState.getConfigDraft().presets.length).toBe(initLen + 1);
    expect(formState.getConfigDraft().presets[0].divider).toBe(true);

    // Move entry
    formState.updateDraft((d) => {
      moveEntry(d, 0, 1);
    });
    expect(formState.getConfigDraft().presets[1].divider).toBe(true);

    // Delete divider
    const divId = formState.getConfigDraft().presets[1].id;
    formState.updateDraft((d) => {
      deleteDivider(d, divId);
    });
    expect(formState.getConfigDraft().presets.length).toBe(initLen);
  });

  test("13. Legacy config form components are deleted from disk", () => {
    const removedFiles = [
      "client/src/components/config/PresetForm.svelte",
      "client/src/components/config/LayerForm.svelte",
      "client/src/components/config/ColormapForm.svelte",
      "client/src/components/config/SettingsForm.svelte",
      "client/src/components/config/JSONFallbackForm.svelte",
      "client/src/ui/config/colormapForm.js",
      "client/src/ui/config/colormapStops.js",
    ];

    for (const relPath of removedFiles) {
      const fullPath = resolve(clientDir, "..", relPath);
      expect(existsSync(fullPath)).toBe(false);
    }
  });

  test("14. All new and updated config redesign files are strictly < 600 lines", () => {
    const redesignFiles = [
      "client/src/components/config/FoldableJsonItem.svelte",
      "client/src/components/config/JsonDocEditor.svelte",
      "client/src/components/ConfigEditor.svelte",
      "client/src/ui/config/jsonFoldState.js",
      "client/src/ui/config/formState.js",
      "client/src/ui/config/colormapUtils.js",
      "client/src/components/config/foldableJsonItem.css",
    ];

    for (const relPath of redesignFiles) {
      const fullPath = resolve(clientDir, "..", relPath);
      expect(existsSync(fullPath)).toBe(true);
      const text = readFileSync(fullPath, "utf8");
      const lineCount = text.split("\n").length;
      expect(lineCount).toBeLessThan(600);
    }
  });

  test("15. Safe compact formatting preserves strings with commas, colons, and formulas across cycles", () => {
    let sample = {
      id: "test-special-chars",
      name: "Sounding (HGT, TMP: RH) [500hPa], 00Z",
      desc: "Formula: val >= 5} && {a}",
      layers: [
        {
          id: "l1",
          name: "Layer 1, with comma and colon: check",
          formula: "x > {val}}",
          render: { colormap: "TMP", boldValues: [5880, 588] },
        },
      ],
    };

    // Run formatItemWithFoldedKeys multiple times through JSON parse-roundtrips
    for (let i = 0; i < 5; i++) {
      const folded = foldAllItemKeys(sample);
      const res = formatItemWithFoldedKeys(sample, folded);
      sample = JSON.parse(res.text);
    }

    expect(sample.name).toBe("Sounding (HGT, TMP: RH) [500hPa], 00Z");
    expect(sample.desc).toBe("Formula: val >= 5} && {a}");
    expect(sample.layers[0].name).toBe("Layer 1, with comma and colon: check");
    expect(sample.layers[0].formula).toBe("x > {val}}");
    expect(sample.layers[0].render.boldValues).toEqual([5880, 588]);
  });

  test("16. Colormap stops format to single lines and are atomic in collectItemCollapsibleKeys", () => {
    const stops = [
      { val: -40, color: [130, 20, 160, 255] },
      { val: 0, color: [255, 255, 255, 255] },
      { val: 40, color: [255, 0, 0, 255] },
    ];

    expect(isStopObject(stops[0])).toBe(true);
    expect(isStopObject({ val: "invalid" })).toBe(false);

    // Stops array formatting keeps each stop on 1 line
    const res = formatItemWithFoldedKeys(stops, new Set());
    const lines = res.text.split("\n");
    expect(lines.length).toBe(5); // [, 3 stops, ]
    expect(lines[1].trim()).toBe('{ "val": -40, "color": [130, 20, 160, 255] },');

    // collectItemCollapsibleKeys should not drill into colormap stops
    const keys = collectItemCollapsibleKeys(stops);
    expect(keys.length).toBe(0);
  });

  test("17. formState.renameColormap renames colormap and rewrites references across presets", () => {
    const formState = createFormState({
      presets: [
        {
          id: "p1",
          name: "P1",
          layers: [{ id: "l1", render: { colormap: "OLD_RAMP" } }],
        },
        {
          id: "p2",
          name: "P2",
          layers: [{ id: "l2", render: { colormapByLevel: { 500: "OLD_RAMP", 850: "OTHER" } } }],
        },
      ],
      colormaps: {
        OLD_RAMP: [
          { val: 0, color: [0, 0, 0, 255] },
          { val: 100, color: [255, 255, 255, 255] },
        ],
      },
    });

    formState.unfoldItem("colormaps.OLD_RAMP");
    expect(formState.getUnfoldedItemPath()).toBe("colormaps.OLD_RAMP");

    // Attempt invalid rename
    expect(formState.renameColormap("OLD_RAMP", "").ok).toBe(false);

    // Valid rename
    const res = formState.renameColormap("OLD_RAMP", "NEW_RAMP");
    expect(res.ok).toBe(true);
    expect(res.name).toBe("NEW_RAMP");

    // Draft reflects new name and deletes old
    expect(formState.getColormapsDraft().OLD_RAMP).toBeUndefined();
    expect(formState.getColormapsDraft().NEW_RAMP).toBeDefined();

    // Preset layer references were rewritten
    expect(formState.getConfigDraft().presets[0].layers[0].render.colormap).toBe("NEW_RAMP");
    expect(formState.getConfigDraft().presets[1].layers[0].render.colormapByLevel[500]).toBe("NEW_RAMP");
    expect(formState.getConfigDraft().presets[1].layers[0].render.colormapByLevel[850]).toBe("OTHER");

    // Unfolded path updated
    expect(formState.getUnfoldedItemPath()).toBe("colormaps.NEW_RAMP");
    expect(formState.isDirty()).toBe(true);
  });

  test("18. formatJsonError provides relative line and column diagnostics", () => {
    const badJson = '{\n  "id": "test",\n  "name": ,\n}';
    let caughtMsg = "";
    try {
      JSON.parse(badJson);
    } catch (e) {
      caughtMsg = e.message;
    }
    const diag = formatJsonError(caughtMsg, badJson);
    expect(diag).toBeDefined();
    // In V8/node/bun with position:
    const matchDiag = formatJsonError("Unexpected token , at position 28", badJson);
    expect(matchDiag).toContain("line 3, column 11");
  });

  test("19. formatCompactJSON in presets.js collapses primitive arrays onto single lines", () => {
    const sample = {
      levels: [1000, 925, 850, 700, 500],
      boldValues: [5880, 588],
      bounds: [70, 15, 140, 55],
      sampleTimes: ["00Z", "12Z"],
      nested: {
        levels: [0.1, 1, 5, 10, 50, 100],
      },
    };
    const formatted = formatCompactJSON(sample);
    expect(formatted).toContain('"levels": [1000, 925, 850, 700, 500]');
    expect(formatted).toContain('"boldValues": [5880, 588]');
    expect(formatted).toContain('"bounds": [70, 15, 140, 55]');
    expect(formatted).toContain('"sampleTimes": ["00Z", "12Z"]');
    expect(formatted).toContain('"levels": [0.1, 1, 5, 10, 50, 100]');

    const reparsed = JSON.parse(formatted);
    expect(reparsed.levels).toEqual(sample.levels);
  });

  test("20. i18nCore.js is strictly < 600 lines (< 580 lines per redesign plan)", () => {
    const fullPath = resolve(clientDir, "src/lib/stores/i18nCore.js");
    expect(existsSync(fullPath)).toBe(true);
    const text = readFileSync(fullPath, "utf8");
    const lineCount = text.split("\n").length;
    expect(lineCount).toBeLessThan(580);
  });

  test("21. Single-click unfold contract: JsonDocEditor guards tab changes with prevTab and never resets on same-tab renders", () => {
    const jsonDocEditorSrc = readFileSync(resolve(clientDir, "src/components/config/JsonDocEditor.svelte"), "utf8");
    // Ensure the rogue unconditional effect is gone
    expect(jsonDocEditorSrc).not.toContain("const _tab = activeTab;\n    unfoldedPath = null;");
    // Ensure tab-change guard is present
    expect(jsonDocEditorSrc).toContain("let prevTab = activeTab;");
    expect(jsonDocEditorSrc).toContain("if (activeTab !== prevTab)");

    // Ensure FoldableJsonItem receives direct reactive props
    expect(jsonDocEditorSrc).toContain("isUnfolded={unfoldedPath === pPath}");
    expect(jsonDocEditorSrc).toContain("onToggle={() => handleToggleItem(pPath)}");
  });

  test("22. Source line count verification for all redesign components (strictly < 600 lines, target < 580)", () => {
    const files = [
      "src/components/config/JsonDocEditor.svelte",
      "src/components/config/FoldableJsonItem.svelte",
      "src/components/ConfigEditor.svelte",
      "src/ui/config/formState.js",
      "src/ui/config/jsonFoldState.js",
      "src/ui/config/colormapUtils.js",
    ];
    for (const rel of files) {
      const fullPath = resolve(clientDir, rel);
      expect(existsSync(fullPath)).toBe(true);
      const text = readFileSync(fullPath, "utf8");
      const lines = text.split("\n").length;
      expect(lines).toBeLessThan(600);
    }
  });

  test("23. Single-click unfold contract on proxy wrapper: getUnfoldedItemPath reflects closure variable immediately on click 1", () => {
    const fs = createFormState({ presets: [{ id: "test-p1" }, { id: "test-p2" }] });
    const p = new Proxy(fs, {
      get(target, prop, receiver) {
        return Reflect.get(target, prop, receiver);
      },
    });

    let currentUnfolded = p.getUnfoldedItemPath();
    p.subscribe(() => {
      currentUnfolded = p.getUnfoldedItemPath();
    });

    expect(currentUnfolded).toBeNull();

    // Click 1 on presets.0 -> must be unfolded on click 1!
    p.unfoldItem("presets.0");
    expect(currentUnfolded).toBe("presets.0");
    expect(p.getUnfoldedItemPath()).toBe("presets.0");

    // Click 2 to fold
    p.foldAll();
    expect(currentUnfolded).toBeNull();
    expect(p.getUnfoldedItemPath()).toBeNull();

    // Click 3 on presets.1 -> must be unfolded on click 1!
    p.unfoldItem("presets.1");
    expect(currentUnfolded).toBe("presets.1");
    expect(p.getUnfoldedItemPath()).toBe("presets.1");
  });
});

