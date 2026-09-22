// filter-viewonly.test.js - ViewOnly per-element match mode for station filters
import { describe, it, expect } from "bun:test";
import {
  isViewOnly,
  normalizeFilterField,
  collectActiveRules,
  isFieldVisibleInView,
  matchesStationFilters,
  compileStationFilter,
  VIEW_LOGIC,
} from "../../src/layers/station/stationFilter.js";

const calm = { WIN_S_Avg: 3, TT: 22, VIS: 10, TEM: 22 };
const windy = { WIN_S_Avg: 12, TT: 22, VIS: 10, TEM: 22 };

function viewCfg(rules) {
  return { filterLogic: "VIEW", filterRules: rules };
}

describe("ViewOnly match mode", () => {
  it("detects VIEW mode case-insensitively, keeps AND/OR/none as station modes", () => {
    expect(VIEW_LOGIC).toBe("VIEW");
    expect(isViewOnly({ filterLogic: "VIEW" })).toBe(true);
    expect(isViewOnly({ filterLogic: "view" })).toBe(true);
    expect(isViewOnly({ filterLogic: "View" })).toBe(true);
    expect(isViewOnly({ filterLogic: "AND" })).toBe(false);
    expect(isViewOnly({ filterLogic: "OR" })).toBe(false);
    expect(isViewOnly({ filterLogic: "none" })).toBe(false);
    expect(isViewOnly({})).toBe(false);
    expect(isViewOnly(null)).toBe(false);
  });

  it("normalizes field aliases to canonical elements", () => {
    expect(normalizeFilterField("Wind")).toBe("Wind");
    expect(normalizeFilterField("Vis")).toBe("Visibility");
    expect(normalizeFilterField("VV")).toBe("Visibility");
    expect(normalizeFilterField("Rain6h")).toBe("Rain6");
    expect(normalizeFilterField("HGT")).toBe("Height");
    expect(normalizeFilterField("Td")).toBe("Td");
    expect(normalizeFilterField("none")).toBe(null);
    expect(normalizeFilterField("Cloud")).toBe(null);
    expect(normalizeFilterField(null)).toBe(null);
  });

  it("never hides whole stations in ViewOnly, AND still filters (regression)", () => {
    const cfg = viewCfg([{ field: "Wind", op: ">", val: "5" }]);
    expect(matchesStationFilters(calm, cfg)).toBe(true);
    expect(compileStationFilter(cfg)(calm)).toBe(true);
    const andCfg = { filterLogic: "AND", filterRules: [{ field: "Wind", op: ">", val: "5" }] };
    expect(matchesStationFilters(calm, andCfg)).toBe(false);
    expect(matchesStationFilters(windy, andCfg)).toBe(true);
  });

  it("wind rule hides only wind, other elements default to show", () => {
    const cfg = viewCfg([{ field: "Wind", op: ">", val: "5" }]);
    expect(isFieldVisibleInView(calm, cfg, "Wind")).toBe(false);
    expect(isFieldVisibleInView(calm, cfg, "Visibility")).toBe(true);
    expect(isFieldVisibleInView(calm, cfg, "TT")).toBe(true);
    expect(isFieldVisibleInView(calm, cfg, "Td")).toBe(true);
    expect(isFieldVisibleInView(windy, cfg, "Wind")).toBe(true);
  });

  it("multiple rules on the same field combine with AND", () => {
    const cfg = viewCfg([
      { field: "Wind", op: ">", val: "5" },
      { field: "Wind", op: "<", val: "20" },
    ]);
    expect(isFieldVisibleInView(windy, cfg, "Wind")).toBe(true); // 12 in (5,20)
    expect(isFieldVisibleInView({ WIN_S_Avg: 25, TT: 22 }, cfg, "Wind")).toBe(false);
    // Other fields unaffected by Wind rules
    expect(isFieldVisibleInView({ WIN_S_Avg: 25, TT: 22 }, cfg, "TT")).toBe(true);
  });

  it("alias rules gate their canonical element", () => {
    const cfg = viewCfg([{ field: "Vis", op: "<", val: "1" }]);
    // Station vis is 10km: fails "Vis < 1", so only visibility hides.
    expect(isFieldVisibleInView(calm, cfg, "Visibility")).toBe(false);
    expect(isFieldVisibleInView(calm, cfg, "Vis")).toBe(false);
    expect(isFieldVisibleInView(calm, cfg, "Wind")).toBe(true);
    const foggy = { WIN_S_Avg: 3, VIS: 0.5 };
    expect(isFieldVisibleInView(foggy, cfg, "Visibility")).toBe(true);
  });

  it("legacy filterField1 shape works in ViewOnly", () => {
    const cfg = { filterLogic: "VIEW", filterField1: "Wind", filterOp1: ">", filterVal1: "5" };
    expect(matchesStationFilters(calm, cfg)).toBe(true);
    expect(isFieldVisibleInView(calm, cfg, "Wind")).toBe(false);
    expect(isFieldVisibleInView(calm, cfg, "TT")).toBe(true);
    expect(collectActiveRules(cfg)).toHaveLength(1);
  });

  it("missing value hides only that element, unknown fields always show", () => {
    const cfg = viewCfg([{ field: "Wind", op: ">", val: "5" }]);
    expect(isFieldVisibleInView({ TT: 22 }, cfg, "Wind")).toBe(false);
    expect(isFieldVisibleInView({ TT: 22 }, cfg, "TT")).toBe(true);
    expect(isFieldVisibleInView(calm, cfg, "Cloud")).toBe(true);
    expect(isFieldVisibleInView(calm, cfg, "Weather")).toBe(true);
  });

  it("empty rules show everything", () => {
    const cfg = viewCfg([{ field: "none", op: ">", val: "" }]);
    for (const f of ["TT", "Td", "Wind", "SLP", "Height", "Visibility", "Rain", "Rain6", "DTD"]) {
      expect(isFieldVisibleInView(calm, cfg, f)).toBe(true);
    }
    expect(matchesStationFilters(calm, cfg)).toBe(true);
  });
});
