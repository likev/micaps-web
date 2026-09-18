// config-divider-render.test.js - Unit tests for divider rendering in dropdowns and loader resilience
import { test, expect, describe } from "bun:test";
import { isDivider, formatDividerOption, getLoadableGroups, renderPresetOptions } from "../src/config/presets.js";

describe("Divider Dropdown Rendering & Resilience", () => {
  const mockGroups = [
    { id: "g1", name: "Group 1", layers: [{ id: "l1" }] },
    { id: "div-1", divider: true },
    { id: "g2", name: "Group 2", layers: [{ id: "l2" }] },
    { id: "div-2", divider: true, label: "Observations" },
    { id: "g3", name: "Group 3", layers: [{ id: "l3" }] },
  ];

  test("isDivider identifies divider entries correctly", () => {
    expect(isDivider(mockGroups[0])).toBe(false);
    expect(isDivider(mockGroups[1])).toBe(true);
    expect(isDivider(mockGroups[3])).toBe(true);
    expect(isDivider(null)).toBe(false);
    expect(isDivider({})).toBe(false);
  });

  test("formatDividerOption formats bare and labeled dividers as expected", () => {
    expect(formatDividerOption(mockGroups[1])).toBe("────────");
    expect(formatDividerOption(mockGroups[3])).toBe("───── Observations ─────");
    expect(formatDividerOption({ divider: true, label: "" })).toBe("────────");
  });

  test("getLoadableGroups strips dividers while preserving group order", () => {
    const loadable = getLoadableGroups(mockGroups);
    expect(loadable.length).toBe(3);
    expect(loadable.map((g) => g.id)).toEqual(["g1", "g2", "g3"]);
  });

  test("renderPresetOptions produces disabled options for dividers and selected option", () => {
    const optionsHTML = renderPresetOptions(mockGroups, "g2");

    expect(optionsHTML).toContain('<option value="" disabled class="preset-divider-option">────────</option>');
    expect(optionsHTML).toContain('<option value="" disabled class="preset-divider-option">───── Observations ─────</option>');
    expect(optionsHTML).toContain('<option value="g1">Group 1</option>');
    expect(optionsHTML).toContain('<option value="g2" selected>Group 2</option>');

    // Verify disabled options have empty value and divider label/dash
    const optionMatches = [...optionsHTML.matchAll(/<option\s+([^>]*?)>(.*?)<\/option>/g)];
    const disabledOptions = optionMatches.filter((m) => m[1].includes("disabled"));
    expect(disabledOptions.length).toBe(2);
    disabledOptions.forEach((m) => {
      expect(m[1]).toContain('value=""');
      expect(m[2]).toMatch(/───/);
    });

    // Resolving divider id as current selection yields empty string
    const resolveSelection = (id) =>
      mockGroups.some((g) => !isDivider(g) && g.id === id) ? id : "";

    expect(resolveSelection("div-1")).toBe("");
    expect(resolveSelection("div-2")).toBe("");
    expect(resolveSelection("g2")).toBe("g2");
  });
});
