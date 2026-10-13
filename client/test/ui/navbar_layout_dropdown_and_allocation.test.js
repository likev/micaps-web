import { describe, test, expect } from "bun:test";
import { readSrcText } from "../helpers/cssText.js";
import {
  createDefaultTab,
  createDefaultWindow,
  applyAutoAllocation,
  prepareSplitWindows,
} from "../../src/lib/stores/tabsCore.js";
import { generateDynamicForecastCycles } from "../../src/utils/timelineSync.js";
import { formatForecastInitTime, formatForecastValidTime } from "../../src/utils/formatters.js";
import { parseTimestamp } from "../../src/utils/timeResolver.js";

describe("NavBar Layout Dropdown & Allocation Menu", () => {
  const navBarSrc = readSrcText("components/NavBar.svelte");
  const tabsBarSrc = readSrcText("components/TabsBar.svelte");
  const appSrc = readSrcText("App.svelte");

  test("NavBar renders layout dropdown trigger #btn-nav-layout next to preset active indicator", () => {
    expect(navBarSrc).toContain('id="btn-nav-layout"');
    expect(navBarSrc).toContain('class="btn-nav-layout"');
    expect(navBarSrc).toContain("nav-layout-dropdown-container");
    expect(navBarSrc).toContain("preset-active-indicator");

    const indicatorIdx = navBarSrc.indexOf('class="preset-active-indicator"');
    const layoutIdx = navBarSrc.indexOf('id="btn-nav-layout"');
    expect(indicatorIdx).toBeGreaterThan(-1);
    expect(layoutIdx).toBeGreaterThan(indicatorIdx);
  });

  test("NavBar layout menu includes 1x1, 1x2, 2x2, 2x3, 3x2 and dynamic allocation modes", () => {
    expect(navBarSrc).toContain('handleLayoutSelect("1x1", "none")');
    expect(navBarSrc).toContain("SPLIT_LAYOUTS");
    expect(navBarSrc).toContain('{ key: "1x2", label: "1x2 Split", icon: "◫" }');
    expect(navBarSrc).toContain('{ key: "2x2", label: "2x2 Split", icon: "⊞" }');
    expect(navBarSrc).toContain('{ key: "2x3", label: "2x3 Split", icon: "▦" }');
    expect(navBarSrc).toContain('{ key: "3x2", label: "3x2 Split", icon: "▦" }');

    expect(navBarSrc).toContain('handleLayoutSelect(item.key, "none")');
    expect(navBarSrc).toContain('handleLayoutSelect(item.key, "time")');
    expect(navBarSrc).toContain('handleLayoutSelect(item.key, "step")');
    expect(navBarSrc).toContain('handleLayoutSelect(item.key, "level")');
    expect(navBarSrc).toContain('handleLayoutSelect(item.key, "model")');
  });

  test("NavBar accepts layout props and callbacks and App.svelte passes them", () => {
    expect(navBarSrc).toContain('layout = "1x1"');
    expect(navBarSrc).toContain('autoAllocation = "none"');
    expect(navBarSrc).toContain("onChangeLayout = null");
    expect(navBarSrc).toContain("onSelectAutoAlloc = null");

    expect(appSrc).toContain("onChangeLayout={handleChangeLayout}");
    expect(appSrc).toContain("onSelectAutoAlloc={handleSelectAutoAlloc}");
    expect(appSrc).toContain('layout={activeTab?.layout || "1x1"}');
    expect(appSrc).toContain('autoAllocation={activeTab?.autoAllocation || "none"}');
  });

  test("TabsBar hides legacy layout select and auto-alloc via CSS", () => {
    expect(tabsBarSrc).toContain(".tabs-bar #layout-controls");
    expect(tabsBarSrc).toContain(".tabs-bar #layout-controls .auto-alloc-container");
    expect(tabsBarSrc).toContain(".tabs-bar #layout-controls .layout-label");
    expect(tabsBarSrc).toContain(".tabs-bar #layout-controls #btn-layout-select");
    expect(tabsBarSrc).toContain("display: none !important");
  });
});

describe("Model Catalog Cleanliness: Removal of CMA_GFS / GFS", () => {
  const navBarSrc = readSrcText("components/NavBar.svelte");
  const layerFormSrc = readSrcText("components/config/LayerForm.svelte");
  const multiTrackSrc = readSrcText("components/timeline/MultiTrackTimeline.svelte");

  test("NavBar BASE_NWP_MODELS lists verified models and excludes CMA_GFS and GFS from active array", () => {
    expect(navBarSrc).toContain('"ECMWF_HR"');
    expect(navBarSrc).toContain('"GRAPES_GFS"');
    expect(navBarSrc).toContain('"GRAPES_3KM"');
    expect(navBarSrc).toContain('"SHANGHAI_MR"');
    expect(navBarSrc).toContain('"BEIJING_MR"');
    expect(navBarSrc).toContain('"JAPAN_MR"');

    // Extract BASE_NWP_MODELS array definition
    const baseModelsStart = navBarSrc.indexOf("BASE_NWP_MODELS = [");
    const baseModelsEnd = navBarSrc.indexOf("];", baseModelsStart);
    const baseModelsBlock = navBarSrc.slice(baseModelsStart, baseModelsEnd);
    expect(baseModelsBlock).not.toContain('"CMA_GFS"');
    expect(baseModelsBlock).not.toContain('"GFS"');
  });

  test("LayerForm COMMON_MODELS replaces CMA_GFS with GRAPES_GFS", () => {
    expect(layerFormSrc).toContain('"GRAPES_GFS"');
    expect(layerFormSrc).not.toContain('"CMA_GFS"');
  });

  test("MultiTrackTimeline hasForecast checks GRAPES_GFS and not CMA_GFS / GFS", () => {
    expect(multiTrackSrc).toContain('l.model === "GRAPES_GFS"');
    expect(multiTrackSrc).not.toContain('l.model === "CMA_GFS"');
    expect(multiTrackSrc).not.toContain('l.model === "GFS"');
  });
});

describe("generateDynamicForecastCycles: UTC Hour Preservation", () => {
  test("preserves 02:00 UTC initialization run (26101302)", () => {
    const cycles = generateDynamicForecastCycles("26101302", 4);
    expect(cycles[0]).toBe("26101302");
    expect(cycles[0].slice(6, 8)).toBe("02");
  });

  test("preserves other hours without hardcoded coercion to 08 or 20", () => {
    const cycles00 = generateDynamicForecastCycles("26101300", 2);
    expect(cycles00[0]).toBe("26101300");

    const cycles08 = generateDynamicForecastCycles("26101308", 2);
    expect(cycles08[0]).toBe("26101308");

    const cycles12 = generateDynamicForecastCycles("26101312", 2);
    expect(cycles12[0]).toBe("26101312");

    const cycles14 = generateDynamicForecastCycles("26101314", 2);
    expect(cycles14[0]).toBe("26101314");

    const cycles20 = generateDynamicForecastCycles("26101320", 2);
    expect(cycles20[0]).toBe("26101320");
  });

  test("preserves 02:00 from space/formatted strings like '20261013 02:00' and '202610130200'", () => {
    const cyclesSpace = generateDynamicForecastCycles("20261013 02:00", 3);
    expect(cyclesSpace[0]).toBe("26101302");

    const cycles12 = generateDynamicForecastCycles("202610130200", 3);
    expect(cycles12[0]).toBe("26101302");
  });
});

describe("Split-Model Allocation Focus & Cross-Tab Isolation", () => {
  test("splitting by model allocates NWP composite on Tab 2 when Tab 1 is upper-air observation", () => {
    // Tab 1: Upper-Air Observation
    const tab1 = createDefaultTab(1);
    tab1.windows = [
      {
        ...createDefaultWindow(0, 1),
        model: "UPPER_AIR",
        isObservation: true,
        level: 500,
        activeGroup: { id: "upper-air-obs", isObservation: true },
      },
    ];

    // Tab 2: NWP 500 Composite
    const tab2 = createDefaultTab(2);
    tab2.layout = "2x2";
    tab2.activeWinIdx = 0;
    tab2.windows = Array.from({ length: 4 }, (_, i) => ({
      ...createDefaultWindow(i, 2),
      model: "ECMWF_HR",
      level: 500,
      forecastCycle: "26101302",
      activeGroup: {
        id: "nwp-500-composite",
        isObservation: false,
        layers: [
          {
            id: `layer-${i}-contour`,
            type: "contour",
            model: "ECMWF_HR",
            path: "ECMWF_HR/TMP/500",
          },
          {
            id: `layer-${i}-wind`,
            type: "wind",
            model: "ECMWF_HR",
            path: "ECMWF_HR/WIND/500",
          },
        ],
      },
    }));

    // Apply auto allocation mode 'model' on Tab 2
    applyAutoAllocation(tab2, "model");

    expect(tab2.autoAllocation).toBe("model");
    expect(tab2.windows.map((w) => w.model)).toEqual([
      "ECMWF_HR",
      "GRAPES_GFS",
      "GRAPES_3KM",
      "SHANGHAI_MR",
    ]);

    // Check layer model and path rewriting for split windows
    const win1 = tab2.windows[1];
    expect(win1.model).toBe("GRAPES_GFS");
    expect(win1.activeGroup.layers[0].model).toBe("GRAPES_GFS");
    expect(win1.activeGroup.layers[0].path).toBe("GRAPES_GFS/TMP/500");
    expect(win1.activeGroup.layers[1].model).toBe("GRAPES_GFS");
    expect(win1.activeGroup.layers[1].path).toBe("GRAPES_GFS/WIND/500");

    // Init forecastCycle preserved across windows
    expect(tab2.windows.every((w) => w.forecastCycle === "26101302")).toBe(true);
  });

  test("prepareSplitWindows prioritizes activeWinIdx over window 0", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x2";
    tab.activeWinIdx = 1;
    tab.windows = [
      { ...createDefaultWindow(0, 1), model: "SURFACE", isObservation: true },
      { ...createDefaultWindow(1, 1), model: "ECMWF_HR", level: 500, forecastCycle: "26101302" },
    ];

    const split = prepareSplitWindows(tab, 4);
    expect(split.length).toBe(4);
    // Base window used for the split is the active window (index 1), positioned at index 0
    expect(split[0].model).toBe("ECMWF_HR");
    expect(split[0].level).toBe(500);
    expect(split[0].forecastCycle).toBe("26101302");

    // When auto allocation is applied to this split, it allocates from targetBase (ECMWF_HR)
    applyAutoAllocation(tab, "model");
    expect(tab.windows[0].model).toBe("ECMWF_HR");
    expect(tab.windows[1].model).toBe("GRAPES_GFS");
    expect(tab.windows[2].model).toBe("GRAPES_3KM");
    expect(tab.windows[3].model).toBe("SHANGHAI_MR");
    expect(tab.windows.every((w) => w.forecastCycle === "26101302")).toBe(true);
  });
});

describe("Preserve Forecast Init Cycle on Model Change and Split", () => {
  const appSrc = readSrcText("App.svelte");

  test("App.svelte refreshForecastTimeline preserves previousCycle when switching models", () => {
    // Assert logic pattern in App.svelte
    expect(appSrc).toContain("const previousCycle = timeline.currentInitCycle || win.forecastCycle;");
    expect(appSrc).toContain("const nextCycle = (previousCycle && (cycles.includes(previousCycle) || cycles.length === 0))");
    expect(appSrc).toContain("const effectiveCycles = (cycles && nextCycle && !cycles.includes(nextCycle))");

    // Pure logic simulation of refreshForecastTimeline cycle resolution
    function resolveNextInitCycle(cycles, previousCycle) {
      const nextCycle = (previousCycle && (cycles.includes(previousCycle) || cycles.length === 0))
        ? previousCycle
        : (previousCycle || cycles[0]);
      const effectiveCycles = (cycles && nextCycle && !cycles.includes(nextCycle))
        ? [nextCycle, ...cycles]
        : cycles;
      return { nextCycle, effectiveCycles };
    }

    // Scenario 1: New model has the same init cycle available
    const res1 = resolveNextInitCycle(["26101312", "26101302"], "26101302");
    expect(res1.nextCycle).toBe("26101302");
    expect(res1.effectiveCycles).toEqual(["26101312", "26101302"]);

    // Scenario 2: Previous cycle preserved even if new model latest cycle is different
    const res2 = resolveNextInitCycle(["26101312", "26101300"], "26101302");
    expect(res2.nextCycle).toBe("26101302");
    expect(res2.effectiveCycles).toEqual(["26101302", "26101312", "26101300"]);
  });

  test("applyAutoAllocation maintains base window forecastCycle across all split windows", () => {
    const tab = createDefaultTab(1);
    tab.layout = "2x2";
    tab.windows = Array.from({ length: 4 }, (_, i) => ({
      ...createDefaultWindow(i, 1),
      model: "ECMWF_HR",
      forecastCycle: "26101302",
      period: 24,
    }));

    applyAutoAllocation(tab, "level");
    expect(tab.windows.every((w) => w.forecastCycle === "26101302")).toBe(true);

    applyAutoAllocation(tab, "model");
    expect(tab.windows.every((w) => w.forecastCycle === "26101302")).toBe(true);
  });

  test("formatForecastInitTime formats 02:00 correctly without timezone offset discrepancy", () => {
    expect(formatForecastInitTime("26101302")).toBe("2026-10-13 02:00 (UTC+8)");
    expect(formatForecastInitTime("202610130200")).toBe("2026-10-13 02:00 (UTC+8)");
    expect(formatForecastInitTime("20261013 02:00")).toBe("2026-10-13 02:00 (UTC+8)");
    expect(formatForecastInitTime("2026-10-13 02:00")).toBe("2026-10-13 02:00 (UTC+8)");
  });

  test("parseTimestamp accurately parses 20261013 02:00 in UTC", () => {
    const tsSpace = parseTimestamp("20261013 02:00");
    expect(tsSpace).toBe(Date.UTC(2026, 9, 13, 2, 0, 0));

    const tsDash = parseTimestamp("2026-10-13 02:00");
    expect(tsDash).toBe(Date.UTC(2026, 9, 13, 2, 0, 0));

    const ts12 = parseTimestamp("202610130200");
    expect(ts12).toBe(Date.UTC(2026, 9, 13, 2, 0, 0));
  });
});
