// legendFirstLoad.test.js - First-load sequence (clear -> layer completes with
// data stats) must render a COMPLETE legend: title, unit, gradient bar,
// palette ticks — in both the legacy DOM renderer and the Svelte builder
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { updateLegend, clearLegends } from "../../src/ui/legend.js";
import { buildLegendItems, clearLegends as coreClear } from "../../src/lib/stores/legendCore.js";

function mockPanel() {
  const panel = {
    innerHTML: "",
    _cls: new Set(),
    classList: {
      add(c) { panel._cls.add(c); },
      remove(c) { panel._cls.delete(c); },
      contains(c) { return panel._cls.has(c); },
    },
  };
  return panel;
}

describe("first-load legend completeness", () => {
  let panel;
  let prevDoc;
  beforeEach(() => {
    prevDoc = globalThis.document;
    panel = mockPanel();
    globalThis.document = { getElementById: (id) => (id === "legend-panel" ? panel : null) };
  });
  afterEach(() => {
    if (prevDoc !== undefined) globalThis.document = prevDoc;
    else delete globalThis.document;
  });

  test("RH first load renders bar with valid gradient + palette ticks", () => {
    const win = { id: "tab-9-win-3", winIdx: 3 };
    clearLegends(win);
    expect(panel.innerHTML).toBe("");
    updateLegend("RH", "RH", -1, 115, win);

    // Title + unit
    expect(panel.innerHTML).toContain("RH");
    expect(panel.innerHTML).toContain("(%)");
    // Ticks are palette scale, not data stats
    expect(panel.innerHTML).toContain("<span>0</span><span>70</span><span>100 %</span>");
    // Bar present with a VALID non-empty gradient (the reported missing-bar bug)
    const m = panel.innerHTML.match(/legend-bar"[^>]*style="background: ([^;"]+);?"/);
    expect(m).not.toBeNull();
    expect(m[1]).toMatch(/^linear-gradient\(to right, (rgb\(\d+,\d+,\d+\)(, )?)+\)$/);

    // Svelte builder agrees on the same data
    const items = buildLegendItems("tab-9-win-3");
    expect(items.length).toBe(1);
    expect(items[0].gradient).toBe(m[1]);
    expect(items[0].tickLabels).toEqual(["0", "70", "100 %"]);
    coreClear("tab-9-win-3");
  });

  test("gradient never degrades to an empty/invalid value", () => {
    const win = { id: "tab-9-win-4", winIdx: 4 };
    clearLegends(win);
    updateLegend("RH", [], 0, 100, win); // degenerate empty-array colormap
    const m = panel.innerHTML.match(/style="background: ([^;"]+);?"/);
    expect(m).not.toBeNull();
    expect(m[1]).toMatch(/^linear-gradient\(to right, rgb\(/);
    coreClear("tab-9-win-4");
  });
});

describe("single-renderer ownership", () => {
  test("legacy stands down while a Svelte owner holds the panel", async () => {
    const core = await import("../../src/lib/stores/legendCore.js");
    const legacy = await import("../../src/ui/legend.js");
    const p = mockPanel();
    const prevDoc = globalThis.document;
    globalThis.document = { getElementById: (id) => (id === "legend-panel" ? p : null) };
    try {
      const win = { id: "owner-win", winIdx: 0 };
      legacy.clearLegends(win);
      core.setSvelteLegendOwner(true);
      legacy.updateLegend("RH", "RH", -1, 115, win);
      // No direct write while Svelte owns the panel...
      expect(p.innerHTML).toBe("");
      // ...but the shared store still carries the full item (Svelte renders it)
      const items = core.buildLegendItems("owner-win");
      expect(items.length).toBe(1);
      expect(items[0].gradient).toMatch(/^linear-gradient\(/);
      core.setSvelteLegendOwner(false);
      legacy.updateLegend("RH", "RH", -1, 115, win);
      expect(p.innerHTML).toContain("legend-bar");
      core.clearLegends("owner-win");
    } finally {
      const core2 = await import("../../src/lib/stores/legendCore.js");
      core2.setSvelteLegendOwner(false);
      if (prevDoc !== undefined) globalThis.document = prevDoc;
      else delete globalThis.document;
    }
  });
});
