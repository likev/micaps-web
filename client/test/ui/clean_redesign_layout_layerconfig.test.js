import { describe, test, expect } from "bun:test";
import { readSrcText, readStyleCss } from "../helpers/cssText.js";
import { isSurfaceWindow, isUpperAirWindow } from "../../src/lib/services/appWorkflow.js";

describe("UI Clean Redesign: Layout Select & Auto-Alloc Ordering", () => {
  const tabsBarSrc = readSrcText("components/TabsBar.svelte");

  test("btn-layout-1/2/4/6 buttons replaced by options of select #btn-layout-select", () => {
    // Assert select element exists with required ID and testid
    expect(tabsBarSrc).toContain('id="btn-layout-select"');
    expect(tabsBarSrc).toContain('data-testid="btn-layout-select"');

    // Assert buttons no longer exist as standalone button tags
    expect(tabsBarSrc).not.toContain('<button\n      id="btn-layout-1"');
    expect(tabsBarSrc).not.toContain('<button id="btn-layout-1"');
    expect(tabsBarSrc).not.toContain('id="btn-layout-1"\n      type="button"');

    // Assert options exist within the select with backward-compatible IDs and correct values
    expect(tabsBarSrc).toContain('<option id="btn-layout-1" value="1x1">');
    expect(tabsBarSrc).toContain('<option id="btn-layout-2" value="1x2">');
    expect(tabsBarSrc).toContain('<option id="btn-layout-4" value="2x2">');
    expect(tabsBarSrc).toContain('<option id="btn-layout-6" value="2x3">');

    // Assert select onChange dispatches setLayout
    expect(tabsBarSrc).toContain('onchange={(e) => setLayout(e.currentTarget.value)}');
  });

  test("auto-alloc-container is moved BEFORE btn-layout-select in the DOM tree", () => {
    const layoutControlsIndex = tabsBarSrc.indexOf('class="layout-controls"');
    const autoAllocIndex = tabsBarSrc.indexOf('class="auto-alloc-container"', layoutControlsIndex);
    const layoutSelectIndex = tabsBarSrc.indexOf('id="btn-layout-select"', layoutControlsIndex);

    expect(layoutControlsIndex).toBeGreaterThan(-1);
    expect(autoAllocIndex).toBeGreaterThan(layoutControlsIndex);
    expect(layoutSelectIndex).toBeGreaterThan(autoAllocIndex);
  });

  test("sel-auto-alloc option time names: multi-time-contrast for obs, multi-init-contrast for nwp", () => {
    expect(tabsBarSrc).toContain('let isObs = $derived(Boolean(isSurface || isUpperAir || activeWindow?.isObservation || activeWindow?.activeGroup?.isObservation));');
    expect(tabsBarSrc).toContain('{isObs ? "multi-time-contrast" : "multi-init-contrast"}');

    // Verification of Observation vs NWP detection logic
    const surfaceWin = {
      model: "SURFACE",
      isObservation: true,
      activeGroup: { id: "surface-obs", hasLevel: false, isObservation: true },
    };
    expect(isSurfaceWindow(surfaceWin)).toBe(true);
    expect(Boolean(isSurfaceWindow(surfaceWin) || isUpperAirWindow(surfaceWin) || surfaceWin.isObservation || surfaceWin.activeGroup?.isObservation)).toBe(true);

    const upperAirWin = {
      model: "UPPER_AIR",
      isObservation: true,
      level: 500,
      activeGroup: { id: "upperair-obs", hasLevel: true, isObservation: true },
    };
    expect(isUpperAirWindow(upperAirWin)).toBe(true);
    expect(Boolean(isSurfaceWindow(upperAirWin) || isUpperAirWindow(upperAirWin) || upperAirWin.isObservation || upperAirWin.activeGroup?.isObservation)).toBe(true);

    const customObsWin = {
      model: "RADAR",
      activeGroup: { id: "radar-obs", isObservation: true },
    };
    expect(Boolean(isSurfaceWindow(customObsWin) || isUpperAirWindow(customObsWin) || customObsWin.isObservation || customObsWin.activeGroup?.isObservation)).toBe(true);

    const nwpWin = {
      model: "ECMWF_HR",
      isObservation: false,
      level: 500,
      activeGroup: { id: "ecmwf-hgt", hasLevel: true, isObservation: false },
    };
    expect(isSurfaceWindow(nwpWin)).toBe(false);
    expect(isUpperAirWindow(nwpWin)).toBe(false);
    expect(Boolean(isSurfaceWindow(nwpWin) || isUpperAirWindow(nwpWin) || nwpWin.isObservation || nwpWin.activeGroup?.isObservation)).toBe(false);

    const japanWin = {
      model: "JAPAN_HR",
      isObservation: false,
      level: 850,
      activeGroup: { id: "japan-tmp", hasLevel: true, isObservation: false },
    };
    expect(isSurfaceWindow(japanWin)).toBe(false);
    expect(isUpperAirWindow(japanWin)).toBe(false);
    expect(Boolean(isSurfaceWindow(japanWin) || isUpperAirWindow(japanWin) || japanWin.isObservation || japanWin.activeGroup?.isObservation)).toBe(false);
  });

  test("sel-auto-alloc option level name is multi-level-contrast", () => {
    expect(tabsBarSrc).toContain('<option value="level" disabled={isSurface}>multi-level-contrast</option>');
  });

  test("sel-auto-alloc option step and model names are multi-step-contrast and multi-model-contrast", () => {
    expect(tabsBarSrc).toContain('<option value="step" disabled={isSurface || isUpperAir}>multi-step-contrast</option>');
    expect(tabsBarSrc).toContain('<option value="model" disabled={isSurface || isUpperAir}>multi-model-contrast</option>');

    // Extract options from sel-auto-alloc select block to verify values and order
    const allocSelectStart = tabsBarSrc.indexOf('id="sel-auto-alloc"');
    const allocSelectEnd = tabsBarSrc.indexOf('</select>', allocSelectStart);
    const allocSelectBlock = tabsBarSrc.slice(allocSelectStart, allocSelectEnd);

    const optionRegex = /<option\s+value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/g;
    const options = [];
    let match;
    while ((match = optionRegex.exec(allocSelectBlock)) !== null) {
      options.push({ value: match[1], label: match[2].trim() });
    }

    expect(options).toHaveLength(5);
    expect(options[0]).toEqual({ value: "none", label: "none" });
    expect(options[1]).toEqual({ value: "time", label: '{isObs ? "multi-time-contrast" : "multi-init-contrast"}' });
    expect(options[2]).toEqual({ value: "step", label: "multi-step-contrast" });
    expect(options[3]).toEqual({ value: "level", label: "multi-level-contrast" });
    expect(options[4]).toEqual({ value: "model", label: "multi-model-contrast" });

    // Verify option values are preserved ("step", "model") so store/backend logic remains compatible
    expect(options.map((o) => o.value)).toEqual(["none", "time", "step", "level", "model"]);

    // Verify onchange and effectiveAlloc continue to guard and process "step" and "model"
    expect(tabsBarSrc).toContain('if (isSurface && (val === "step" || val === "level" || val === "model")) return;');
    expect(tabsBarSrc).toContain('if (isUpperAir && (val === "step" || val === "model")) return;');
    expect(tabsBarSrc).toContain('if (isSurface && (cur === "step" || cur === "level" || cur === "model")) return "none";');
    expect(tabsBarSrc).toContain('if (isUpperAir && (cur === "step" || cur === "model")) return "none";');
  });
});

describe("UI Clean Redesign: Layer Config Grouping with Subtabs", () => {
  const layerRowSrc = readSrcText("components/LayerRow.svelte");
  const layersPanelCss = readStyleCss();

  test("LayerRow defines reactive subtabs navigation header", () => {
    expect(layerRowSrc).toContain('class="config-subtabs-nav"');
    expect(layerRowSrc).toContain('role="tablist"');
    expect(layerRowSrc).toContain('class="config-subtab-btn"');
    expect(layerRowSrc).toContain('class:active={currentSubtab === tab.id}');
    expect(layerRowSrc).toContain('onclick={() => (activeSubtab = tab.id)}');
  });

  test("Contour layer groups Style, Interval, and Time into distinct subtab panes", () => {
    const contourStart = layerRowSrc.indexOf('{#if layer.type === "contour"}');
    const contourEnd = layerRowSrc.indexOf('{:else if layer.type === "station"}');
    expect(contourStart).toBeGreaterThan(-1);
    expect(contourEnd).toBeGreaterThan(contourStart);

    const contourBlock = layerRowSrc.slice(contourStart, contourEnd);
    expect(contourBlock).toContain('class="config-subtab-pane" class:active={currentSubtab === "style"}');
    expect(contourBlock).toContain('class="config-subtab-pane" class:active={currentSubtab === "interval"}');
    expect(contourBlock).toContain('class="chk-show-line"');
    expect(contourBlock).toContain('class="slider-fill-opacity"');
    expect(contourBlock).toContain('class="input-interval-start"');
    expect(contourBlock).toContain('class="sel-palette"');
  });

  test("Station layer isolates Elements and StationFilter into separate subtabs", () => {
    const stationStart = layerRowSrc.indexOf('{:else if layer.type === "station"}');
    const stationEnd = layerRowSrc.indexOf('{:else if layer.type === "wind"}');
    expect(stationStart).toBeGreaterThan(-1);
    expect(stationEnd).toBeGreaterThan(stationStart);

    const stationBlock = layerRowSrc.slice(stationStart, stationEnd);
    expect(stationBlock).toContain('class="config-subtab-pane" class:active={currentSubtab === "elements"}');
    expect(stationBlock).toContain('class="config-subtab-pane" class:active={currentSubtab === "filter"}');

    // Elements pane contains the observation toggles
    expect(stationBlock).toContain('class="chk-show-temp"');
    expect(stationBlock).toContain('class="chk-show-dewpoint"');
    expect(stationBlock).toContain('class="chk-show-streamlines"');
    expect(stationBlock).toContain('class="sel-contour-element"');

    // Filter pane contains StationFilter component
    expect(stationBlock).toContain('<StationFilter');
    expect(stationBlock).toContain('onFilterChange={(filterData) => handleConfigPatch(filterData)}');
  });

  test("Wind layer groups Display and Palette into subtabs", () => {
    const windStart = layerRowSrc.indexOf('{:else if layer.type === "wind"}');
    const windEnd = layerRowSrc.indexOf('{:else if layer.type === "tlogp"}');
    expect(windStart).toBeGreaterThan(-1);
    expect(windEnd).toBeGreaterThan(windStart);

    const windBlock = layerRowSrc.slice(windStart, windEnd);
    expect(windBlock).toContain('class="config-subtab-pane" class:active={currentSubtab === "display"}');
    expect(windBlock).toContain('class="config-subtab-pane" class:active={currentSubtab === "palette"}');
    expect(windBlock).toContain('class="chk-show-wind"');
    expect(windBlock).toContain('class="chk-show-barbs"');
    expect(windBlock).toContain('class="sel-palette"');
  });

  test("T-LogP sounding layer groups Station and Curves into subtabs", () => {
    const tlogpStart = layerRowSrc.indexOf('{:else if layer.type === "tlogp"}');
    const tlogpEnd = layerRowSrc.indexOf('{:else if layer.type === "timeheight"}');
    expect(tlogpStart).toBeGreaterThan(-1);
    expect(tlogpEnd).toBeGreaterThan(tlogpStart);

    const tlogpBlock = layerRowSrc.slice(tlogpStart, tlogpEnd);
    expect(tlogpBlock).toContain('class="config-subtab-pane" class:active={currentSubtab === "station"}');
    expect(tlogpBlock).toContain('class="config-subtab-pane" class:active={currentSubtab === "curves"}');
    expect(tlogpBlock).toContain('class="input-tlogp-station"');
    expect(tlogpBlock).toContain('class="sel-tlogp-parcel-level"');
  });

  test("Cross-section layers (timeheight, lineheight, hovmoller) group spatial/temporal params from fields", () => {
    expect(layerRowSrc).toContain('class="config-subtab-pane" class:active={currentSubtab === "point"}');
    expect(layerRowSrc).toContain('class="config-subtab-pane" class:active={currentSubtab === "transect"}');
    expect(layerRowSrc).toContain('class="config-subtab-pane" class:active={currentSubtab === "fields"}');
  });

  test("PMTiles layer groups Features from Style & Projection", () => {
    const pmtilesStart = layerRowSrc.indexOf('{:else if layer.type === "pmtiles"}');
    const pmtilesEnd = layerRowSrc.indexOf('{/if}\n\n      {#if layer.type !== "pmtiles"}');
    expect(pmtilesStart).toBeGreaterThan(-1);

    const pmtilesBlock = layerRowSrc.slice(pmtilesStart);
    expect(pmtilesBlock).toContain('class="config-subtab-pane" class:active={currentSubtab === "features"}');
    expect(pmtilesBlock).toContain('class="config-subtab-pane" class:active={currentSubtab === "basemap"}');
    expect(pmtilesBlock).toContain('class="chk-pmtiles-graticule"');
    expect(pmtilesBlock).toContain('class="sel-basemap-scheme"');
  });

  test("Non-pmtiles layers have a dedicated Time subtab for observation time matching & offset", () => {
    expect(layerRowSrc).toContain('class="config-subtab-pane" class:active={currentSubtab === "time"}');
    expect(layerRowSrc).toContain('class="config-time-section"');
    expect(layerRowSrc).toContain('class="sel-time-policy"');
    expect(layerRowSrc).toContain('class="sel-time-tolerance"');
    expect(layerRowSrc).toContain('class="input-time-offset"');
  });

  test("CSS rules ensure inactive subtab panes are hidden and active panes are flex", () => {
    expect(layersPanelCss).toMatch(/\.config-subtab-pane\s*\{[^}]*display:\s*none/);
    expect(layersPanelCss).toMatch(/\.config-subtab-pane\.active\s*\{[^}]*display:\s*flex/);
  });

  test("Fallback general pane renders for unknown or generic layer types", () => {
    expect(layerRowSrc).toContain('class="config-subtab-pane" class:active={currentSubtab === "general"}');
    expect(layerRowSrc).toContain('Type: {layer.type || "generic"}');
  });

  test("Time subtab dot reflects soft-stale in amber alongside desync blue and hard-stale red", () => {
    expect(layerRowSrc).toContain('class="subtab-dot dot-amber" title="Soft-stale"');
    expect(layersPanelCss).toContain(".subtab-dot.dot-amber");
  });

  test("LayerRow resets activeSubtab when current tab is invalid for layer type", () => {
    expect(layerRowSrc).toContain('if (activeSubtab && !subtabs.some((t) => t.id === activeSubtab))');
    expect(layerRowSrc).toContain('activeSubtab = "";');
  });
});
