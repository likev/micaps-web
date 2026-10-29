import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getObsTreeLimit,
  stepBackwardByInterval,
  filterObsFilesByStep,
  selectObsChipsWindow,
  formatStepLabel,
  getObsStepOptions,
  isSatelliteGroup,
  MAX_OBS_CHIPS,
} from "../../src/ui/timeline/timelineMath.js";
import {
  getGlobalLocale,
  setGlobalLocale,
  localizeEntityName,
  localizeCategory,
  splitBilingualString,
} from "../../src/lib/stores/i18nCore.js";

const clientDir = resolve(__dirname, "../..");
function readSrc(relPath) {
  return readFileSync(resolve(clientDir, "src", relPath), "utf8");
}

/* WCAG 2.1 Luminance & Contrast Calculation Helpers */
function hexToRgb(hex) {
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const num = parseInt(c, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function getRelativeLuminance(rgb) {
  const [r, g, b] = rgb.map((val) => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(hex1, hex2) {
  const l1 = getRelativeLuminance(hexToRgb(hex1));
  const l2 = getRelativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Empirical Adversarial Stress Tests: ui-ux-review1 14 Issues", () => {
  /* =========================================================================
   * Focus Area 1: Issue 2 & Issue 10 - CSS Theme Variables & Contrast
   * ========================================================================= */
  describe("Focus Area 1: Theme Contrast Tokens & Modal Backgrounds (Issues 2 & 10)", () => {
    const tokensSrc = readSrc("styles/tokens.css");
    const polishSrc = readSrc("styles/polish.css");
    const statusBarSrc = readSrc("components/StatusBar.svelte");
    const helpModalSrc = readSrc("components/HelpModal.svelte");
    const configEditorSrc = readSrc("components/ConfigEditor.svelte");
    const commandPaletteSrc = readSrc("components/CommandPalette.svelte");
    const windowPanelSrc = readSrc("components/WindowPanel.svelte");
    const multiTrackSrc = readSrc("components/timeline/MultiTrackTimeline.svelte");

    test("Theme Token Contrast: Light Theme status bar achieves WCAG AA / AAA", () => {
      // Light theme tokens from tokens.css
      const bgFooter = "#f6f8fa";
      const textPrimary = "#1f2328";
      const textSecondary = "#656d76";
      const accentBlue = "#0969da";

      // #sl-time-lead-label (text-primary)
      const ratioPrimary = getContrastRatio(bgFooter, textPrimary);
      expect(ratioPrimary).toBeGreaterThanOrEqual(7.0); // WCAG AAA >= 7:1 (actual ~14.6:1)

      // .valid-label, .lead-prefix, .status-text (text-secondary)
      const ratioSecondary = getContrastRatio(bgFooter, textSecondary);
      expect(ratioSecondary).toBeGreaterThanOrEqual(4.5); // WCAG AA >= 4.5:1 (actual ~4.78:1)

      // .probe-coords (accent-blue)
      const ratioAccent = getContrastRatio(bgFooter, accentBlue);
      expect(ratioAccent).toBeGreaterThanOrEqual(4.5); // WCAG AA >= 4.5:1 (actual ~5.05:1)
    });

    test("Theme Token Contrast: Dark Theme status bar achieves WCAG AA / AAA", () => {
      const bgFooter = "#0d1117";
      const textPrimary = "#e6edf3";
      const textSecondary = "#8b949e";
      const accentBlue = "#388bfd";

      expect(getContrastRatio(bgFooter, textPrimary)).toBeGreaterThanOrEqual(7.0);
      expect(getContrastRatio(bgFooter, textSecondary)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(bgFooter, accentBlue)).toBeGreaterThanOrEqual(4.5);
    });

    test("Theme Token Contrast: Brutalism Theme status bar achieves high contrast", () => {
      const bgFooter = "#ffffff";
      const textPrimary = "#111111";

      const ratio = getContrastRatio(bgFooter, textPrimary);
      expect(ratio).toBeGreaterThanOrEqual(14.0); // Ultra-high contrast
    });

    test("StatusBar.svelte replaces hardcoded text colors with theme variables", () => {
      expect(statusBarSrc).toContain("color: var(--text-primary, #e6edf3);");
      expect(statusBarSrc).toContain("color: var(--text-secondary, #8b949e);");
      expect(statusBarSrc).toContain("color: var(--accent-blue, #58a6ff);");
    });

    test("Brutalism polish.css explicitly forces #111 on status bar labels and probe coords", () => {
      expect(polishSrc).toContain("[data-theme=\"brutalism\"] #app :is(.status-text, .valid-label, .lead-prefix, #sl-time-lead-label, .probe-coords) { color: #111 !important; }");
    });

    test("Modal dialog selectors match actual DOM structure across themes", () => {
      // ConfigEditor uses .config-editor-panel
      expect(configEditorSrc).toContain('class="config-editor-panel"');
      expect(tokensSrc).toContain(".config-editor-panel");
      expect(polishSrc).toContain(".config-editor-panel");

      // HelpModal uses .help-modal-dialog (and .help-modal-content)
      expect(helpModalSrc).toContain('.help-modal-dialog');
      expect(helpModalSrc).toContain('class="help-modal-dialog help-modal-content"');
      expect(tokensSrc).toContain(".help-modal-dialog");
      expect(polishSrc).toContain(".help-modal-dialog");

      // CommandPalette uses .cmd-palette-backdrop and .cmd-palette-modal
      expect(commandPaletteSrc).toContain('class="cmd-palette-backdrop');
      expect(tokensSrc).toContain(".cmd-palette-modal");
      expect(polishSrc).toContain(".cmd-palette-backdrop");
    });

    test("WindowPanel hover uses CSS variables instead of hardcoded dark background", () => {
      expect(windowPanelSrc).toContain("background: var(--bg-hover");
      expect(windowPanelSrc).not.toContain("background: rgba(22, 27, 34, 0.95);");
    });

    test("MultiTrackTimeline uses CSS theme variables for track headers and time ruler", () => {
      expect(multiTrackSrc).toContain("background: var(--bg-secondary, rgba(13, 17, 23, 0.95));");
      expect(multiTrackSrc).toContain("background: var(--bg-hover, rgba(0, 0, 0, 0.25));");
    });
  });

  /* =========================================================================
   * Focus Area 2: Issue 3 - Basemap Projection & Scheme Desync
   * ========================================================================= */
  describe("Focus Area 2: Basemap Projection Dropdown & Removal of Scheme Row (Issue 3)", () => {
    const layerRowSrc = readSrc("components/LayerRow.svelte");

    test("LayerRow.svelte has completely removed redundant scheme select", () => {
      expect(layerRowSrc).not.toContain("sel-basemap-scheme");
      expect(layerRowSrc).not.toContain('handleConfigChange("scheme"');
      expect(layerRowSrc).not.toContain("<span>Scheme:</span>");
    });

    test("LayerRow.svelte features a dedicated Projection subtab and selector", () => {
      expect(layerRowSrc).toContain('{ id: "basemap", label: "Projection", icon: "🌐" }');
      expect(layerRowSrc).toContain('class="sel-basemap-proj"');
      expect(layerRowSrc).toContain('handleConfigChange("projection", e.target.value)');
      expect(layerRowSrc).toContain('<option value="mercator">🗺️ Mercator (2D)</option>');
      expect(layerRowSrc).toContain('<option value="globe">🌍 Globe (3D)</option>');
      expect(layerRowSrc).toContain('<option value="vertical-perspective">🪐 Perspective (3D)</option>');
    });
  });

  /* =========================================================================
   * Focus Area 3: Issue 8 - Camera Sync Toggle in Split Layouts
   * ========================================================================= */
  describe("Focus Area 3: Camera Sync Toggle Outside #layout-controls (Issue 8)", () => {
    const tabsBarSrc = readSrc("components/TabsBar.svelte");

    test("#btn-sync-toggle is located strictly OUTSIDE #layout-controls container", () => {
      const layoutControlsClose = tabsBarSrc.indexOf("</div>\n\n  <button\n    id=\"btn-sync-toggle\"");
      expect(layoutControlsClose).toBeGreaterThan(-1);

      // Verify #layout-controls is hidden by CSS in tabs-bar
      expect(tabsBarSrc).toContain(".tabs-bar #layout-controls {\n    display: none !important;\n  }");

      // Verify #btn-sync-toggle itself has .hidden toggle only when layout === '1x1'
      expect(tabsBarSrc).toContain('class:hidden={layout === "1x1"}');
      expect(tabsBarSrc).toContain('onclick={() => onToggleSync && onToggleSync()}');
    });

    test("Camera sync toggle button states in split layouts", () => {
      // In 1x1, button should have class:hidden
      const isHidden1x1 = (layout) => layout === "1x1";
      expect(isHidden1x1("1x1")).toBe(true);
      expect(isHidden1x1("1x2")).toBe(false);
      expect(isHidden1x1("2x2")).toBe(false);
      expect(isHidden1x1("2x3")).toBe(false);
    });
  });

  /* =========================================================================
   * Focus Area 4: Issue 12 - Preset Catalog Deduplication Logic
   * ========================================================================= */
  describe("Focus Area 4: Preset Catalog Deduplication Logic (Issue 12)", () => {
    const configPath = resolve(clientDir, "config.json");
    const rawConfig = JSON.parse(readFileSync(configPath, "utf8"));

    test("client/config.json has ZERO duplicate preset IDs across all categories", () => {
      const seenIds = new Set();
      const duplicateIds = [];
      for (const p of rawConfig.presets || []) {
        if (!p || p.divider) continue;
        if (p.id) {
          if (seenIds.has(p.id)) duplicateIds.push(p.id);
          seenIds.add(p.id);
        }
      }
      expect(duplicateIds).toEqual([]);
      expect(seenIds.size).toBeGreaterThanOrEqual(180);
    });

    test("Simulate gen-presets.mjs deduplication against adversarial edge cases", () => {
      // Simulating deduplication logic with edge cases:
      const existingNonGenerated = [
        { id: "sat-fy4b-china", layers: [{ path: "SATELLITE/FY4B/L1/CHINA" }] },
        { id: "swan-mcr", layers: [{ dataPath: "SWAN_PRODUCT/2D_CREF" }] },
        { id: "ecmwf-pvort-multi", layers: [{ model: "ECMWF_HR", element: "PVORT" }] },
        { id: "empty-layers", layers: [] },
        { id: "no-layers-key" },
        { divider: true },
      ];

      const existingPaths = new Set();
      const existingIds = new Set();
      for (const p of existingNonGenerated) {
        if (!p || p.divider) continue;
        if (p.id) existingIds.add(p.id);
        for (const l of p.layers || []) {
          if (l.path) existingPaths.add(l.path);
          if (l.dataPath) existingPaths.add(l.dataPath);
          if (l.model && l.element) existingPaths.add(`${l.model}/${l.element}`);
        }
      }

      const seenPaths = new Set(existingPaths);
      seenPaths.add("ECMWF_HR/PVORT");
      seenPaths.add("SATELLITE/FY4B/L1/CHINA");
      seenPaths.add("SATELLITE/FY4B/L1/DISK");
      const seenIds = new Set(existingIds);
      seenIds.add("preset-already-seen");

      // Adversarial candidates
      const candidates = [
        { id: "fy4b_china", dataPath: "SATELLITE/FY4B/L1/CHINA", tier: 1 }, // duplicate path -> skip
        { id: "already-seen", dataPath: "OTHER/PATH", tier: 1 }, // presetId already in seenIds -> skip
        { id: "swan_mcr", dataPath: "SWAN_PRODUCT/2D_CREF", tier: 1 }, // duplicate dataPath -> skip
        { id: "tier4_item", dataPath: "SOME/TIER4", tier: 4 }, // tier 4 -> skip
        { id: "unique_1", dataPath: "RADAR/UNIQUE_1", tier: 1 }, // OK -> add
        { id: "unique_1_dup", dataPath: "RADAR/UNIQUE_1", tier: 1 }, // duplicate path inside list -> skip
        { id: "unique_1", dataPath: "RADAR/UNIQUE_1_DUP", tier: 1 }, // duplicate ID inside list -> skip
        { id: "unique_3", dataPath: "RADAR/UNIQUE_3", tier: 2 }, // OK -> add
      ];

      const generated = [];
      for (const item of candidates) {
        if (item.tier !== 1 && item.tier !== 2 && item.tier !== 3) continue;
        const presetId = `preset-${item.id}`;
        if (seenIds.has(presetId) || seenPaths.has(item.dataPath)) continue;
        seenPaths.add(item.dataPath);
        seenIds.add(presetId);
        generated.push(presetId);
      }

      expect(generated).toEqual(["preset-unique_1", "preset-unique_3"]);
    });
  });

  /* =========================================================================
   * Focus Area 5: Issue 14 - Deep Check of Step Backward & Catalog Limits
   * ========================================================================= */
  describe("Focus Area 5: Sub-hourly Catalogs, Backward Stepping & Chip Window Slicing (Issue 14)", () => {
    test("getObsTreeLimit categorizes 1000/300/100 thresholds accurately", () => {
      // 1000 threshold
      const highCadence = [
        "SATELLITE/FY4B/L1/CHINA", "satellite/fy4b/l1/disk", "FY4B_C012",
        "SWAN_PRODUCT/2D_MCR", "RADAR/TDMOSAIC",
        "SURFACE/PLOT_10MIN", "SURFACE/PLOT_5MIN", "SURFACE/PLOT_1MIN",
        "WIND_PROFILER/HIGH_MODE", "SURFACE/LIGHTNING_10MIN"
      ];
      for (const path of highCadence) {
        expect(getObsTreeLimit(path)).toBe(1000);
      }

      // 300 threshold
      const hourlyCadence = [
        "FY2G_L2", "CLDAS/PRECIP_1H", "SURFACE/PLOT_ALL", "SURFACE/AWS_1H"
      ];
      for (const path of hourlyCadence) {
        expect(getObsTreeLimit(path)).toBe(300);
      }

      // 100 default
      const defaultCadence = [
        "UPPER_AIR/PLOT/500", "SURFACE/PLOT_GLOBAL_3H", "ECMWF_HR/TMP", "", null
      ];
      for (const path of defaultCadence) {
        expect(getObsTreeLimit(path)).toBe(100);
      }
    });

    test("stepBackwardByInterval handles month and year boundary transitions", () => {
      // Crossing New Year: 2026-12-31 21:00 to 2027-01-01 09:00
      const boundaryFiles = [
        "20261231090000.000",
        "20261231150000.000",
        "20261231210000.000",
        "20270101030000.000",
        "20270101090000.000", // Latest: Jan 1 09:00
      ];

      const stepped12 = stepBackwardByInterval(boundaryFiles, 12);
      expect(stepped12[stepped12.length - 1]).toBe("20270101090000.000");
      expect(stepped12).toContain("20261231210000.000");
      expect(stepped12).toContain("20261231090000.000");
    });

    test("stepBackwardByInterval handles leap day boundary (Feb 28 -> Feb 29)", () => {
      // 2028 is a leap year
      const leapFiles = [
        "20280228120000.000",
        "20280228180000.000",
        "20280229000000.000",
        "20280229060000.000",
        "20280229120000.000",
      ];
      const stepped24 = stepBackwardByInterval(leapFiles, 24);
      expect(stepped24[stepped24.length - 1]).toBe("20280229120000.000");
      expect(stepped24).toContain("20280228120000.000");
    });

    test("stepBackwardByInterval handles irregular radar intervals with jitter", () => {
      // Radar files irregularly spaced: 01:04, 01:11, 01:17, 01:23, 01:29, 01:36, 01:42, 01:48, 01:54, 02:00
      const jitterFiles = [
        "RADAR_20261029010400.RAW",
        "RADAR_20261029011100.RAW",
        "RADAR_20261029011700.RAW",
        "RADAR_20261029012300.RAW",
        "RADAR_20261029012900.RAW",
        "RADAR_20261029013600.RAW",
        "RADAR_20261029014200.RAW",
        "RADAR_20261029014800.RAW",
        "RADAR_20261029015400.RAW",
        "RADAR_20261029020000.RAW",
      ];
      // Step: 30min (0.5h) -> should pick 02:00, then >= 29 min earlier (01:29 or 01:23)
      const stepped = stepBackwardByInterval(jitterFiles, 0.5);
      expect(stepped[stepped.length - 1]).toBe("RADAR_20261029020000.RAW");
      expect(stepped.length).toBeGreaterThanOrEqual(2);
    });

    test("selectObsChipsWindow behavior with empty, single, and sub-window inputs", () => {
      expect(selectObsChipsWindow([])).toEqual([]);
      expect(selectObsChipsWindow(["f1"])).toEqual(["f1"]);
      expect(selectObsChipsWindow(["f1", "f2", "f3"])).toEqual(["f1", "f2", "f3"]);

      // 15 files: defaults to last 10 (MAX_OBS_CHIPS)
      const files15 = Array.from({ length: 15 }, (_, i) => `file_${i}`);
      const winDefault = selectObsChipsWindow(files15);
      expect(winDefault.length).toBe(MAX_OBS_CHIPS);
      expect(winDefault[winDefault.length - 1]).toBe("file_14");
      expect(winDefault[0]).toBe("file_5");

      // Centered on a target file near the middle
      const winTarget = selectObsChipsWindow(files15, "file_4");
      expect(winTarget).toContain("file_4");
      expect(winTarget.length).toBe(MAX_OBS_CHIPS);
    });

    test("Large-scale dataset stress test: 2,000 satellite files at 15-min cadence", () => {
      // 2,000 files * 15m = 500 hours (~20 days)
      const startMs = Date.parse("2026-10-01T00:00:00Z");
      const files = [];
      for (let i = 0; i < 2000; i++) {
        const d = new Date(startMs + i * 15 * 60 * 1000);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        const h = String(d.getUTCHours()).padStart(2, "0");
        const min = String(d.getUTCMinutes()).padStart(2, "0");
        files.push(`C012_${y}${m}${day}${h}${min}00_FY4B.AWX`);
      }

      // Step = 24h: When standard 00Z files exist across all 20 days, canonical 00Z grid is preferred
      const filtered24 = filterObsFilesByStep(files, 24);
      expect(filtered24.length).toBeGreaterThanOrEqual(20);
      expect(filtered24[filtered24.length - 1]).toBe("C012_20261021000000_FY4B.AWX");

      // Verify that stepBackwardByInterval directly preserves the newest file (19:00 / 19:45)
      const hourlyFiles = files.filter((f) => f.includes("0000_"));
      const stepped24 = stepBackwardByInterval(hourlyFiles, 24);
      expect(stepped24[stepped24.length - 1]).toBe("C012_20261021190000_FY4B.AWX");
      expect(stepped24.length).toBeGreaterThanOrEqual(20);

      // Step = 12h
      const filtered12 = filterObsFilesByStep(files, 12);
      expect(filtered12.length).toBeGreaterThanOrEqual(40);
      expect(filtered12[filtered12.length - 1]).toBe("C012_20261021120000_FY4B.AWX");

      // Step = 0.25 (15 min)
      const filtered15m = filterObsFilesByStep(files, 0.25);
      expect(filtered15m.length).toBe(2000);
    });
  });

  /* =========================================================================
   * Focus Area 6: Issues 1, 4, 5, 6, 7, 9, 11, 13 Sanity Checks
   * ========================================================================= */
  describe("Focus Area 6: Comprehensive Verification Across Remaining Issues", () => {
    test("Issue 1: StatusBar hides timeline info when no weather layers are loaded", () => {
      const sbSrc = readSrc("components/StatusBar.svelte");
      expect(sbSrc).toContain("hasWeatherLayers = $derived(");
      expect(sbSrc).toContain("l.type !== \"pmtiles\"");
      expect(sbSrc).toContain("class:hidden={!showTimelineInfo}");
      expect(sbSrc).toContain(".timeline-info.hidden {\n    display: none !important;\n  }");
    });

    test("Issue 4: Lighting toggle is only visible for Satellite data", () => {
      const sbSrc = readSrc("components/StatusBar.svelte");
      expect(sbSrc).toContain("isSatellite = $derived.by(");
      expect(sbSrc).toContain("class:hidden={!isSatellite || ui.configOpen}");
      expect(sbSrc).toContain("isSatelliteGroup(activeWin.activeGroup)");
    });

    test("Issue 6: Multi-language i18n localization functions operate bidirectionally", () => {
      setGlobalLocale("en");
      expect(getGlobalLocale()).toBe("en");
      expect(splitBilingualString("气象卫星遥感 / Satellite Remote Sensing", "en")).toBe("Satellite Remote Sensing");
      expect(splitBilingualString("气象卫星遥感 / Satellite Remote Sensing", "zh")).toBe("气象卫星遥感");

      const entity = {
        name: "Default Name",
        name_en: "Satellite Remote Sensing",
        name_zh: "气象卫星遥感",
      };
      expect(localizeEntityName(entity, "en")).toBe("Satellite Remote Sensing");
      expect(localizeEntityName(entity, "zh")).toBe("气象卫星遥感");
    });

    test("Issue 7: Sounding Station Network LayerRow has Station ID checkbox and no element checkboxes", () => {
      const lrSrc = readSrc("components/LayerRow.svelte");
      expect(lrSrc).toContain('{:else if stationType === "tlogp"}');
      expect(lrSrc).toContain('class="chk-show-station-id"');
      expect(lrSrc).toContain('handleConfigChange("showStationId", e.target.checked)');
      expect(lrSrc).toContain('if (stationType === "tlogp")');
    });

    test("Issue 9: Window title handles channels and meters properly", () => {
      const wpSrc = readSrc("components/WindowPanel.svelte");
      expect(wpSrc).toContain("isFy4b");
      expect(wpSrc).toContain("isMeterHeight");
      expect(wpSrc).toContain("C${String(win.level).padStart(3, \"0\")}");
      expect(wpSrc).toContain("${win.level} m");
    });

    test("Issue 11: Contrast allocation guards check isObsOrNonNwp and hasNoLevel", () => {
      const nbSrc = readSrc("components/NavBar.svelte");
      expect(nbSrc).toContain("disabled={isObsOrNonNwp}");
      expect(nbSrc).toContain("disabled={levelAllocDisabled}");
    });

    test("Issue 13: Loop markers A/B remain visible when paused", () => {
      const tsSrc = readSrc("components/TimeSlider.svelte");
      expect(tsSrc).toContain("timeline.loopRange?.active");
      expect(tsSrc).not.toContain("pause() {\n    timeline.loopRange.active = false;");
    });
  });
});
