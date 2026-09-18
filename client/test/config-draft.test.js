// config-draft.test.js - Unit tests for draft cloning, copy helpers, and divider manipulation
import { test, expect, describe } from "bun:test";
import {
  createFormState,
  clonePresetGroup,
  cloneLayer,
  insertDivider,
  moveEntry,
  deleteDivider,
  escapeHtml,
} from "../src/ui/config/formState.js";
import { rewriteColormapReferences } from "../src/ui/config/colormapForm.js";
import { formatCompactJSON } from "../src/config/presets.js";

describe("Config Form State & Draft Helpers (formState.js)", () => {
  const sampleConfig = {
    performance: { maxEffectiveCells: 50000 },
    basemap: { scheme: "dark", projection: "mercator" },
    colormaps: {
      TMP: [
        { val: -20, color: [0, 0, 255, 255] },
        { val: 0, color: [255, 255, 255, 255] },
        { val: 20, color: [255, 0, 0, 255] },
      ],
    },
    presets: [
      {
        id: "composite-500hpa",
        name: "500hPa Composite",
        layers: [
          {
            id: "ecmwf-hgt-500",
            name: "HGT 500",
            type: "contour",
            model: "ECMWF_HR",
            element: "HGT",
            level: 500,
            render: { lineColor: "#58a6ff", lineWidth: 2 },
          },
          {
            id: "ecmwf-tmp-500",
            name: "TMP 500",
            type: "contour",
            model: "ECMWF_HR",
            element: "TMP",
            level: 500,
            render: { lineColor: "#f85149" },
          },
        ],
      },
      {
        id: "surface-obs",
        name: "Surface Observations",
        layers: [
          {
            id: "station-sfc",
            name: "Surface Stations",
            type: "station",
            model: "SURFACE",
            element: "STATION",
            render: {},
          },
          {
            id: "derived-tmp-sfc",
            name: "Derived TMP",
            type: "contour",
            model: "SURFACE",
            element: "TMP",
            derivedFrom: "station-sfc",
            render: {},
          },
        ],
      },
    ],
  };

  test("draft clone isolation: mutating draft does not mutate original config", () => {
    const pristine = JSON.parse(JSON.stringify(sampleConfig));
    const formState = createFormState(pristine);
    const draft = formState.getDraft();

    draft.presets[0].name = "Modified Name";
    draft.presets[0].layers[0].render.lineWidth = 10;

    expect(pristine.presets[0].name).toBe("500hPa Composite");
    expect(pristine.presets[0].layers[0].render.lineWidth).toBe(2);
  });

  test("isDirty tracks unsaved draft changes accurately", () => {
    const formState = createFormState(sampleConfig);
    expect(formState.isDirty()).toBe(false);

    formState.updateDraft((d) => {
      d.presets[0].name = "Dirty Name";
    });
    expect(formState.isDirty()).toBe(true);

    formState.reset();
    expect(formState.isDirty()).toBe(false);
  });

  test("formatCompactJSON serialization preserves single-line color arrays", () => {
    const formatted = formatCompactJSON(sampleConfig);
    expect(formatted).toContain('{ "val": -20, "color": [0, 0, 255, 255] }');
    expect(formatted.split("\n").length).toBeGreaterThan(15);
  });

  describe("clonePresetGroup", () => {
    test("deep clones preset, auto-uniquifies id, sets (Copy) name, and forces removable: true on layers", () => {
      const draft = JSON.parse(JSON.stringify(sampleConfig));
      const res = clonePresetGroup(draft, "composite-500hpa");

      expect(res.ok).toBe(true);
      expect(res.newId).toBe("composite-500hpa-copy");
      expect(draft.presets.length).toBe(3);
      expect(draft.presets[1].id).toBe("composite-500hpa-copy");
      expect(draft.presets[1].name).toBe("500hPa Composite (Copy)");
      expect(draft.presets[1].layers.every((l) => l.removable === true)).toBe(true);

      // Mutating clone does not touch source
      draft.presets[1].layers[0].render.lineColor = "#000000";
      expect(draft.presets[0].layers[0].render.lineColor).toBe("#58a6ff");

      // Cloning again creates -copy-2
      const res2 = clonePresetGroup(draft, "composite-500hpa");
      expect(res2.ok).toBe(true);
      expect(res2.newId).toBe("composite-500hpa-copy-2");
    });

    test("returns { ok: false } for non-existent source", () => {
      const draft = JSON.parse(JSON.stringify(sampleConfig));
      const res = clonePresetGroup(draft, "non-existent");
      expect(res.ok).toBe(false);
    });
  });

  describe("cloneLayer", () => {
    test("same-group clone inserts directly below source with uniquified id and preserved derivedFrom", () => {
      const draft = JSON.parse(JSON.stringify(sampleConfig));
      const res = cloneLayer(draft, "surface-obs", "derived-tmp-sfc");

      expect(res.ok).toBe(true);
      expect(res.newId).toBe("derived-tmp-sfc-copy");

      const preset = draft.presets.find((p) => p.id === "surface-obs");
      expect(preset.layers.length).toBe(3);
      expect(preset.layers[2].id).toBe("derived-tmp-sfc-copy");
      expect(preset.layers[2].name).toBe("Derived TMP (Copy)");
      expect(preset.layers[2].derivedFrom).toBe("station-sfc");
      expect(preset.layers[2].removable).toBe(true);
    });

    test("cross-group clone clears dangling derivedFrom with warning when sibling is missing in target", () => {
      const draft = JSON.parse(JSON.stringify(sampleConfig));
      const res = cloneLayer(draft, "surface-obs", "derived-tmp-sfc", "composite-500hpa");

      expect(res.ok).toBe(true);
      expect(res.warning).toBeDefined();
      expect(res.warning).toContain('derivedFrom "station-sfc" not found');

      const target = draft.presets.find((p) => p.id === "composite-500hpa");
      const clonedLayer = target.layers.find((l) => l.id === res.newId);
      expect(clonedLayer).toBeDefined();
      expect(clonedLayer.derivedFrom).toBeUndefined();
    });
  });

  describe("Divider Helpers", () => {
    test("insertDivider appends by default and inserts at index with auto div-N id", () => {
      const draft = JSON.parse(JSON.stringify(sampleConfig));
      const res1 = insertDivider(draft, -1, "Section 1");
      expect(res1.ok).toBe(true);
      expect(res1.newId).toBe("div-1");
      expect(draft.presets[draft.presets.length - 1].id).toBe("div-1");
      expect(draft.presets[draft.presets.length - 1].label).toBe("Section 1");

      const res2 = insertDivider(draft, 1);
      expect(res2.ok).toBe(true);
      expect(res2.newId).toBe("div-2");
      expect(draft.presets[1].id).toBe("div-2");
      expect(draft.presets[1].divider).toBe(true);
      expect(draft.presets[1].label).toBeUndefined();
    });

    test("moveEntry correctly reorders groups and dividers in place", () => {
      const draft = JSON.parse(JSON.stringify(sampleConfig));
      insertDivider(draft, 1, "Middle Divider");
      expect(draft.presets[1].id).toBe("div-1");

      // Move divider to index 0
      const moveRes = moveEntry(draft, 1, 0);
      expect(moveRes.ok).toBe(true);
      expect(draft.presets[0].id).toBe("div-1");
      expect(draft.presets[1].id).toBe("composite-500hpa");
    });

    test("deleteDivider removes only target divider without touching neighboring presets", () => {
      const draft = JSON.parse(JSON.stringify(sampleConfig));
      insertDivider(draft, 1, "To Delete");
      expect(draft.presets.length).toBe(3);

      const delRes = deleteDivider(draft, "div-1");
      expect(delRes.ok).toBe(true);
      expect(draft.presets.length).toBe(2);
      expect(draft.presets.some((p) => p.id === "div-1")).toBe(false);
    });

    test("divider round-trip through formatCompactJSON preserves shape and order", () => {
      const draft = JSON.parse(JSON.stringify(sampleConfig));
      insertDivider(draft, 1, "Observations");
      const serialized = formatCompactJSON(draft);
      const reparsed = JSON.parse(serialized);

      expect(reparsed.presets[1].id).toBe("div-1");
      expect(reparsed.presets[1].divider).toBe(true);
      expect(reparsed.presets[1].label).toBe("Observations");
      expect(reparsed.presets[1].layers).toBeUndefined();
    });
  });

  describe("HTML Escaping (escapeHtml)", () => {
    test("properly escapes characters & < > \" ' and handles null/undefined", () => {
      expect(escapeHtml(null)).toBe("");
      expect(escapeHtml(undefined)).toBe("");
      expect(escapeHtml('"><img src=x onerror=alert(1)>')).toBe("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
      expect(escapeHtml("Tom & Jerry's \"Adventure\"")).toBe("Tom &amp; Jerry&#39;s &quot;Adventure&quot;");
    });
  });

  describe("Cross-Preset Layer Cloning with hasLevel Warning", () => {
    test("detects hasLevel mismatch between source and target preset", () => {
      const draft = {
        presets: [
          { id: "p1", name: "Multi", hasLevel: true, layers: [{ id: "l1", name: "L1" }] },
          { id: "p2", name: "Single", hasLevel: false, layers: [] },
        ],
      };
      const res = cloneLayer(draft, "p1", "l1", "p2");
      expect(res.ok).toBe(true);
      expect(res.warning).toContain("hasLevel mismatch");
    });
  });

  describe("Colormap Reference Rewriting", () => {
    test("rewrites layer colormap and colormapByLevel references", () => {
      const draft = {
        presets: [
          {
            id: "p1",
            layers: [
              { id: "l1", render: { colormap: "OLD_RAMP" } },
              { id: "l2", render: { colormapByLevel: { "500": "OLD_RAMP", "850": "OTHER_RAMP" } } },
            ],
          },
        ],
      };
      rewriteColormapReferences(draft, "OLD_RAMP", "NEW_RAMP");
      expect(draft.presets[0].layers[0].render.colormap).toBe("NEW_RAMP");
      expect(draft.presets[0].layers[1].render.colormapByLevel["500"]).toBe("NEW_RAMP");
      expect(draft.presets[0].layers[1].render.colormapByLevel["850"]).toBe("OTHER_RAMP");
    });
  });
});
