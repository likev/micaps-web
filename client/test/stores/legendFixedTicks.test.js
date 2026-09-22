// legendFixedTicks.test.js - Fixed-physical-scale elements (RH/TMP/WIND/...)
// legend the palette scale, never transient data min/max
import { describe, test, expect } from "bun:test";
import {
  buildLegendItems,
  updateLegend,
  clearLegends,
} from "../../src/lib/stores/legendCore.js";

describe("fixed-scale legend ticks", () => {
  test("RH with supersaturated stats (-1..115) shows palette ticks 0/70/100 %", () => {
    clearLegends("w-rh");
    updateLegend("RH", "RH", -1, 115, { id: "w-rh", winIdx: 0 });
    const items = buildLegendItems("w-rh");
    expect(items[0]?.tickLabels).toEqual(["0", "70", "100 %"]);
    clearLegends("w-rh");
  });

  test("TMP with data stats shows palette ticks, HGT stays data-driven", () => {
    clearLegends("w-tmp");
    updateLegend("TMP", null, -15, 32, { id: "w-tmp", winIdx: 0 });
    expect(buildLegendItems("w-tmp")[0]?.tickLabels).toEqual(["-40", "10", "40 °C"]);
    clearLegends("w-tmp");

    clearLegends("w-hgt");
    updateLegend("HGT", null, 5000, 6000, { id: "w-hgt", winIdx: 0 });
    expect(buildLegendItems("w-hgt")[0]?.tickLabels).toEqual(["5000", "5500", "6000 gpm"]);
    clearLegends("w-hgt");
  });
});
