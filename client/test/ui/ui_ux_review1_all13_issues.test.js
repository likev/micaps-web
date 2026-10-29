import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isSatelliteGroup } from "../../src/ui/timeline/timelineMath.js";
import {
  getGlobalLocale,
  setGlobalLocale,
  normalizeLocale,
  splitBilingualString,
  localizeCategory,
  localizeEntityName,
} from "../../src/lib/stores/i18nCore.js";
import { getStationDatasetType } from "../../src/ui/layers/layerDefaults.js";
import { computeAllocBadgeText } from "../../src/lib/stores/tabsCore.js";
import { computeFullWindowTitle } from "../../src/ui/tabs/windowTitles.js";

const clientDir = resolve(__dirname, "../..");
function readSrc(relPath) {
  return readFileSync(resolve(clientDir, "src", relPath), "utf8");
}

describe("Comprehensive Verification of All 13 Issues in ui-ux-review1.md", () => {
  const statusBarSrc = readSrc("components/StatusBar.svelte");
  const layerRowSrc = readSrc("components/LayerRow.svelte");
  const presetMenuSrc = readSrc("components/PresetMenu.svelte");
  const presetFormSrc = readSrc("components/config/PresetForm.svelte");
  const navBarSrc = readSrc("components/NavBar.svelte");
  const tabsBarSrc = readSrc("components/TabsBar.svelte");
  const timeSliderSrc = readSrc("components/TimeSlider.svelte");
  const windowPanelSrc = readSrc("components/WindowPanel.svelte");
  const helpModalSrc = readSrc("components/HelpModal.svelte");
  const settingsFormSrc = readSrc("components/config/SettingsForm.svelte");
  const commandPaletteSrc = readSrc("components/CommandPalette.svelte");
  const tokensSrc = readSrc("styles/tokens.css");
  const polishSrc = readSrc("styles/polish.css");
  const config = JSON.parse(readFileSync(resolve(clientDir, "config.json"), "utf8"));

  test("Issue 1: Timeline info hidden on new empty windows or windows without weather layers", () => {
    expect(statusBarSrc).toContain("class:hidden={!showTimelineInfo}");
    expect(statusBarSrc).toContain("hidden={!showTimelineInfo}");
    expect(statusBarSrc).toContain(".timeline-info.hidden");
    expect(statusBarSrc).toContain("display: none !important");
  });

  test("Issue 2: Status bar uses theme color tokens and hides lighting toggle properly", () => {
    expect(statusBarSrc).not.toContain("color: #8b949e;");
    expect(statusBarSrc).toContain("var(--text-secondary,");
    expect(statusBarSrc).toContain("var(--text-primary,");
    expect(statusBarSrc).toContain("var(--accent-blue,");
    expect(statusBarSrc).toContain(".status-bar-lighting.hidden");
  });

  test("Issue 3: PMTiles Basemap row removes duplicate Scheme config-row and renames subtab to Projection", () => {
    expect(layerRowSrc).not.toContain('class="sel-basemap-scheme"');
    expect(layerRowSrc).not.toContain("🎨 Scheme:");
    expect(layerRowSrc).toContain('label: "Projection"');
    expect(layerRowSrc).toContain('class="sel-basemap-proj"');
  });

  test("Issue 4: timelineMath and StatusBar detect FY-4B and FY-2G as satellite groups", () => {
    expect(isSatelliteGroup({ model: "SATELLITE" })).toBe(true);
    expect(isSatelliteGroup({ id: "preset-fy4b_china_grouped" })).toBe(true);
    expect(isSatelliteGroup({ id: "preset-fy2g_ctt" })).toBe(true);
    expect(isSatelliteGroup({ layers: [{ type: "image" }] })).toBe(true);
    expect(isSatelliteGroup({ model: "ECMWF_HR" })).toBe(false);
    expect(statusBarSrc).toContain("class:hidden={!isSatellite || ui.configOpen}");
  });

  test("Issue 5: Badges format channels (C012), radar meters (m), and pressure levels (hPa)", () => {
    expect(presetMenuSrc).toContain("formatPresetBadge");
    expect(presetMenuSrc).toContain("C${String(lvl).padStart(3, \"0\")}");
    expect(presetMenuSrc).toContain("${lvl} m");
    expect(presetMenuSrc).toContain("${lvl} hPa");
    expect(presetFormSrc).toContain("formatPresetLevel");
    expect(presetFormSrc).toContain("formatLayerLevel");
  });

  test("Issue 6: Multi-language i18n support toggleable between en and zh", () => {
    expect(normalizeLocale("zh-CN")).toBe("zh");
    expect(normalizeLocale("en-US")).toBe("en");

    setGlobalLocale("en");
    expect(getGlobalLocale()).toBe("en");
    expect(localizeCategory("气象卫星遥感 (Satellite Remote Sensing)", "en")).toBe("Satellite Remote Sensing");
    expect(localizeCategory("气象卫星遥感 (Satellite Remote Sensing)", "zh")).toBe("气象卫星遥感");

    expect(splitBilingualString("雷达拼图 / Radar Mosaic", "en")).toBe("Radar Mosaic");
    expect(splitBilingualString("雷达拼图 / Radar Mosaic", "zh")).toBe("雷达拼图");

    setGlobalLocale("zh");
    expect(localizeEntityName({ id: "composite-upperair-500", name: "500 hPa Upper-Air Sounding" }, "zh")).toBe("500 hPa 高空探空综合图");
    expect(computeFullWindowTitle({ activeGroup: { id: "composite-upperair-500", name: "500 hPa Upper-Air Sounding", name_zh: "500 hPa 高空探空综合图" }, winIdx: 0 })).toBe("500 hPa 高空探空综合图");
    setGlobalLocale("en");
    expect(localizeEntityName({ id: "composite-upperair-500", name: "500 hPa Upper-Air Sounding" }, "en")).toBe("500 hPa Upper-Air Sounding");
    expect(computeFullWindowTitle({ activeGroup: { id: "composite-upperair-500", name: "500 hPa Upper-Air Sounding", name_en: "500 hPa Upper-Air Sounding" }, winIdx: 0 })).toBe("500 hPa Upper-Air Sounding");

    // All presets in config.json must have name_en and name_zh
    const missingLangs = config.presets.filter((p) => !p.divider && (!p.name_zh || !p.name_en));
    expect(missingLangs.length).toBe(0);

    expect(navBarSrc).toContain('id="menu-item-lang-en"');
    expect(navBarSrc).toContain('id="menu-item-lang-zh"');
    expect(settingsFormSrc).toContain('id="settings-language-options"');
    expect(commandPaletteSrc).toContain('id: "act-lang-en"');
    expect(commandPaletteSrc).toContain('id: "act-lang-zh"');
  });

  test("Issue 7: Sounding Station Network has StationID toggle, removed elements & filter subtab", () => {
    expect(getStationDatasetType({ path: "UPPER_AIR/TLOGP" })).toBe("tlogp");
    expect(getStationDatasetType({ name: "Sounding Station Network" })).toBe("tlogp");

    expect(layerRowSrc).toContain('chk-show-station-id');
    expect(layerRowSrc).toContain('Station ID');
    expect(layerRowSrc).toContain('stationType !== "tlogp"');
    expect(layerRowSrc).toContain('stationType === "tlogp"');

    const tlogpPreset = config.presets.find((p) => p.id === "composite-tlogp");
    expect(tlogpPreset).toBeDefined();
    const stationLayer = tlogpPreset.layers.find((l) => l.id === "upperair-tlogp-stations");
    expect(stationLayer).toBeDefined();
    expect(stationLayer.render.showStationId).toBe(true);
    expect(stationLayer.render.showTemp).toBeUndefined();
    expect(stationLayer.render.showWind).toBeUndefined();
  });

  test("Issue 8: Map sync toggle is independent and placed outside .layout-controls", () => {
    expect(tabsBarSrc).toContain('id="btn-sync-toggle"');
    const syncIdx = tabsBarSrc.indexOf('id="btn-sync-toggle"');
    const layoutIdx = tabsBarSrc.indexOf('class="layout-controls"');
    expect(syncIdx).toBeGreaterThan(layoutIdx);
    // Ensure it is placed outside the layout-controls div
    const afterLayout = tabsBarSrc.slice(layoutIdx);
    const closeDivIdx = afterLayout.indexOf("</div>");
    const relativeSyncIdx = syncIdx - layoutIdx;
    expect(relativeSyncIdx).toBeGreaterThan(closeDivIdx);
  });

  test("Issue 9: Window title displays proper units for satellite (C0xx) and radar (m)", () => {
    expect(windowPanelSrc).toContain('C${String(win.level).padStart(3, "0")}');
    expect(windowPanelSrc).toContain("${win.level} m");
    expect(windowPanelSrc).toContain("${win.level} hPa");

    expect(computeAllocBadgeText({ model: "SATELLITE", level: 12 }, "level")).toBe("C012");
    expect(computeAllocBadgeText({ activeGroup: { id: "swan-tdmosaic" }, level: 3000 }, "level")).toBe("3000m");
    expect(computeAllocBadgeText({ level: 500 }, "level")).toBe("500hPa");
    expect(computeAllocBadgeText({ level: null }, "level")).toBe("SFC");
  });

  test("Issue 10: Modal dialogs, headers, and timeline contrast conform to themes", () => {
    expect(tokensSrc).toContain(".config-editor-panel");
    expect(tokensSrc).toContain(".help-modal-dialog");
    expect(polishSrc).toContain(".config-editor-panel");
    expect(polishSrc).toContain(".help-modal-dialog");
    expect(polishSrc).toContain(".cmd-palette-backdrop");
    expect(windowPanelSrc).toContain("var(--bg-hover");
  });

  test("Issue 11: Auto-allocation guards check isObservation and hasLevel", () => {
    expect(navBarSrc).toContain("disabled={isObsOrNonNwp}");
    expect(navBarSrc).toContain("disabled={levelAllocDisabled}");
    expect(tabsBarSrc).toContain("if (hasNoLevel && val === \"level\") return;");
    expect(tabsBarSrc).toContain("if (isObsOrNonNwp && (val === \"step\" || val === \"model\")) return;");

    expect(tabsBarSrc).toContain('if (hasNoLevel && cur === "level") return "none";');
    expect(tabsBarSrc).toContain('if (isObsOrNonNwp && (cur === "step" || cur === "model")) return "none";');

    const appSrc = readSrc("App.svelte");
    expect(appSrc).toContain("hasNoLvl && curMode === \"level\"");
    expect(appSrc).toContain("(isObs || isSurfaceGroup(group) || isUpperAirGroup(group)) && (curMode === \"step\" || curMode === \"model\")");
  });

  test("Issue 12: Presets generation script deduplicates paths against existing presets", () => {
    const genSrc = readFileSync(resolve(clientDir, "../scripts/gen-presets.mjs"), "utf8");
    expect(genSrc).toContain("existingPaths = new Set()");
    expect(genSrc).toContain("seenPaths.has(item.dataPath)");
  });

  test("Issue 13: TimeSlider preserves loop range A/B markers when playback is paused", () => {
    expect(timeSliderSrc).toContain("id=\"sl-btn-toggle-loop\"");
    expect(timeSliderSrc).toContain("toggleLoopRange");
    expect(timeSliderSrc).toContain("let isLooping = $derived(Boolean(playback.isPlaying || timeline.loopRange?.active));");
    // Ensure pause() does not clobber loopRange.active
    const pauseStart = timeSliderSrc.indexOf("function pause()");
    const pauseEnd = timeSliderSrc.indexOf("function toggleLoopRange()");
    const pauseFnBody = timeSliderSrc.slice(pauseStart, pauseEnd);
    expect(pauseFnBody).not.toContain("timeline.loopRange.active = false");
  });
});
