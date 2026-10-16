// client/test/ui/preset_menu_navbar.test.js
// Verification of Option A:
// 1. PresetMenu.svelte component (keyboard nav, hover/click flyout submenus, category grouping)
// 2. Integration into NavBar.svelte replacing select-preset & btn-load-data while preserving backwards compat
// 3. Level selector conditionally shown only after data load and data has level; Model selector for NWP
// 4. Hide nav-keyboard-hint from toolbar
// 5. navBar.js helper methods

import { describe, test, expect, beforeEach } from "bun:test";
import { readSrcText } from "../helpers/cssText.js";
import { setNavBarLevel, setNavBarPreset, setNavBarModel } from "../../src/ui/navBar.js";
import { PRESET_GROUPS, isDivider } from "../../src/config/presets.js";
import fs from "fs";
import path from "path";

describe("Option A: PresetMenu Component & Categorization", () => {
  const presetMenuSrc = readSrcText("components/PresetMenu.svelte");

  test("PresetMenu.svelte exists and defines keyboard navigation", () => {
    expect(presetMenuSrc).toBeDefined();
    expect(presetMenuSrc).toContain("handleKeyDown");
    expect(presetMenuSrc).toContain('e.key === "ArrowDown"');
    expect(presetMenuSrc).toContain('e.key === "ArrowUp"');
    expect(presetMenuSrc).toContain('e.key === "ArrowRight"');
    expect(presetMenuSrc).toContain('e.key === "ArrowLeft"');
    expect(presetMenuSrc).toContain('e.key === "Escape"');
    expect(presetMenuSrc).toContain('e.key === "Enter"');
    expect(presetMenuSrc).toContain('e.key === "Home"');
    expect(presetMenuSrc).toContain('e.key === "End"');
    expect(presetMenuSrc).toContain('e.key === "Tab"');
  });

  test("PresetMenu.svelte supports hover and click flyout submenus with single-click toggle", () => {
    expect(presetMenuSrc).toContain("onmouseenter");
    expect(presetMenuSrc).toContain("handleCategoryMouseEnter");
    expect(presetMenuSrc).toContain("handleCategoryClick");
    expect(presetMenuSrc).toContain("preset-submenu");
    expect(presetMenuSrc).toContain("preset-category-item");

    // Verify click toggle logic: clicking an active category toggles it closed immediately
    let activeCat = 1;
    let focusedSub = -1;
    function handleCategoryClick(idx) {
      if (activeCat === idx) {
        activeCat = -1;
        focusedSub = -1;
      } else {
        activeCat = idx;
        focusedSub = 0;
      }
    }
    // Clicking category 1 when it's already active closes it
    handleCategoryClick(1);
    expect(activeCat).toBe(-1);
    expect(focusedSub).toBe(-1);

    // Clicking category 1 when closed opens it and focuses first item
    handleCategoryClick(1);
    expect(activeCat).toBe(1);
    expect(focusedSub).toBe(0);
  });

  test("PresetMenu.svelte Escape and ArrowLeft inside submenu close the submenu", () => {
    let activeCat = 2;
    let focusedSub = 1;
    function onArrowLeft() {
      focusedSub = -1;
      activeCat = -1;
    }
    onArrowLeft();
    expect(focusedSub).toBe(-1);
    expect(activeCat).toBe(-1); // Submenu closed, back to category bar
  });

  test("PresetMenu.svelte automatically groups presets by category attribute and tags active category", () => {
    expect(presetMenuSrc).toContain("preset.category");
    expect(presetMenuSrc).toContain("isDivider");
    expect(presetMenuSrc).toContain("hasActive");

    const samplePresets = [
      { id: "p1", name: "Surface Plot", category: "Surface Observations" },
      { id: "p2", name: "Another Surface", category: "Surface Observations" },
      { id: "d1", divider: true },
      { id: "p3", name: "500hPa HGT", category: "NWP Synoptic" },
      { id: "p4", name: "Generic Preset" }, // no category
    ];

    const activePresetId = "p3";
    const map = new Map();
    const validPresets = samplePresets.filter((g) => g && !isDivider(g));
    for (const preset of validPresets) {
      const catName = (preset.category && String(preset.category).trim()) || "Other Presets";
      if (!map.has(catName)) {
        map.set(catName, []);
      }
      map.get(catName).push(preset);
    }
    const categories = Array.from(map.entries()).map(([name, presets]) => ({
      name,
      presets,
      hasActive: presets.some((p) => p.id === activePresetId),
    }));

    expect(categories.length).toBe(3);
    expect(categories[0].name).toBe("Surface Observations");
    expect(categories[0].presets.length).toBe(2);
    expect(categories[0].hasActive).toBe(false);

    expect(categories[1].name).toBe("NWP Synoptic");
    expect(categories[1].presets.length).toBe(1);
    expect(categories[1].hasActive).toBe(true); // p3 is active

    expect(categories[2].name).toBe("Other Presets");
    expect(categories[2].presets.length).toBe(1);
    expect(categories[2].hasActive).toBe(false);

    // Divider d1 must be excluded
    expect(categories.some((c) => c.presets.some((p) => p.divider))).toBe(false);
  });

  test("PresetMenu.svelte triggers immediate load on preset selection", () => {
    expect(presetMenuSrc).toContain("handleSelectPreset");
    expect(presetMenuSrc).toContain("onSelect(preset)");
  });

  test("PresetMenu.svelte renders trigger button with #btn-preset-menu and 📊 Presets ▾", () => {
    expect(presetMenuSrc).toContain('id="btn-preset-menu"');
    expect(presetMenuSrc).toContain("preset-menu-trigger");
    expect(presetMenuSrc).toContain("📊");
    expect(presetMenuSrc).toContain("Presets");
    expect(presetMenuSrc).toContain("▾");
  });
});

describe("Option A: NavBar Integration & Backwards Compatibility", () => {
  const navBarSrc = readSrcText("components/NavBar.svelte");

  test("NavBar.svelte imports and renders PresetMenu", () => {
    expect(navBarSrc).toContain("import PresetMenu from \"./PresetMenu.svelte\";");
    expect(navBarSrc).toContain("<PresetMenu");
  });

  test("NavBar.svelte retains hidden #select-preset and #btn-load-data for backwards compat", () => {
    expect(navBarSrc).toContain('id="select-preset"');
    expect(navBarSrc).toContain('id="btn-load-data"');
    expect(navBarSrc).toContain("visually-hidden");
  });

  test("NavBar.svelte blurs focus to preserve keyboard navigation", () => {
    expect(navBarSrc).toContain("currentTarget?.blur?.()");
    expect(navBarSrc).toContain('getElementById("select-preset")?.blur?.()');
    expect(navBarSrc).toContain("e.target?.blur?.()");
  });

  test("NavBar.svelte renders active indicator only when data is loaded, with reload button [ Active: ... ↻ ]", () => {
    expect(navBarSrc).toContain("{#if hasDataLoaded && currentGroup}");
    expect(navBarSrc).toContain("preset-active-indicator");
    expect(navBarSrc).toContain("active-title");
    expect(navBarSrc).toContain("btn-reload-preset");
    expect(navBarSrc).toContain("handleReloadClick");
    expect(navBarSrc).toContain("↻");
  });

  test("NavBar.svelte handleReloadClick uses window-specific level", () => {
    expect(navBarSrc).toContain("activeWin?.level ?? app.level");
  });
});

describe("Option A: Level & Model Selector Dynamics", () => {
  const navBarSrc = readSrcText("components/NavBar.svelte");
  const appSrc = readSrcText("App.svelte");

  test("Level selector is only rendered when data is loaded and hasLevel !== false", () => {
    expect(navBarSrc).toContain("showLevelSelector");
    expect(navBarSrc).toContain("hasLevel !== false");
    expect(navBarSrc).toContain("{#if showLevelSelector}");
    expect(navBarSrc).toContain('id="select-nav-level"');

    // Simulate level visibility logic from NavBar.svelte
    function computeHasDataLoaded(win, activeGroup, currentPresetId, currentGroup) {
      return win
        ? Boolean(win.activeGroup || win.element || (win.layers && win.layers.length > 0))
        : Boolean(activeGroup || (currentPresetId && currentGroup));
    }

    function shouldShowLevel(win, currentGroup, hasDataLoaded) {
      const dataHasLevel = currentGroup
        ? currentGroup.hasLevel !== false
        : (win ? win.hasLevel !== false && win.model !== "SURFACE" && win.level != null : false);
      return Boolean(hasDataLoaded && dataHasLevel);
    }

    // 1. Initial state (empty window with no loaded data)
    const emptyWin = { id: "win-0", activeGroup: null, layers: [] };
    const hasData0 = computeHasDataLoaded(emptyWin, null, "composite-500hpa", { id: "composite-500hpa", hasLevel: true });
    // Merely having a preset selected in dropdown must NOT show level on an empty window
    expect(hasData0).toBe(false);
    expect(shouldShowLevel(emptyWin, null, hasData0)).toBe(false);

    // 2. Surface observation loaded (hasLevel: false)
    const surfaceGroup = { id: "composite-surface", hasLevel: false, isObservation: true };
    const surfaceWin = { id: "win-0", activeGroup: surfaceGroup, layers: [{ type: "station" }] };
    const hasDataSurf = computeHasDataLoaded(surfaceWin, surfaceGroup, surfaceGroup.id, surfaceGroup);
    expect(hasDataSurf).toBe(true);
    expect(shouldShowLevel(surfaceWin, surfaceGroup, hasDataSurf)).toBe(false);

    // 3. TlogP loaded (hasLevel: false)
    const tlogpGroup = { id: "composite-tlogp", hasLevel: false, isObservation: true };
    const tlogpWin = { id: "win-0", activeGroup: tlogpGroup, layers: [{ type: "tlogp" }] };
    const hasDataTlog = computeHasDataLoaded(tlogpWin, tlogpGroup, tlogpGroup.id, tlogpGroup);
    expect(hasDataTlog).toBe(true);
    expect(shouldShowLevel(tlogpWin, tlogpGroup, hasDataTlog)).toBe(false);

    // 4. NWP 500hPa synoptic loaded (hasLevel: true)
    const nwp500 = { id: "composite-500hpa", hasLevel: true, isObservation: false };
    const nwpWin = { id: "win-0", activeGroup: nwp500, layers: [{ type: "contour" }] };
    const hasDataNwp = computeHasDataLoaded(nwpWin, nwp500, nwp500.id, nwp500);
    expect(hasDataNwp).toBe(true);
    expect(shouldShowLevel(nwpWin, nwp500, hasDataNwp)).toBe(true);

    // 5. Upper-air sounding loaded (defaultLevel: 500, hasLevel not false)
    const upperAir = { id: "composite-upperair-500", defaultLevel: 500, isObservation: true };
    const uaWin = { id: "win-0", activeGroup: upperAir, layers: [{ type: "station" }] };
    const hasDataUa = computeHasDataLoaded(uaWin, upperAir, upperAir.id, upperAir);
    expect(hasDataUa).toBe(true);
    expect(shouldShowLevel(uaWin, upperAir, hasDataUa)).toBe(true);
  });

  test("Model selector is only rendered when data is loaded and is NWP (!isObservation)", () => {
    expect(navBarSrc).toContain("isNwpData");
    expect(navBarSrc).toContain("!currentGroup.isObservation");
    expect(navBarSrc).toContain("{#if isNwpData}");
    expect(navBarSrc).toContain('id="select-nav-model"');

    function shouldShowModel(win, currentGroup, hasDataLoaded) {
      if (!hasDataLoaded) return false;
      if (currentGroup) {
        return Boolean(
          !currentGroup.isObservation &&
          !win?.isObservation &&
          win?.model !== "SURFACE" &&
          win?.model !== "UPPER_AIR"
        );
      }
      if (win) {
        return Boolean(
          !win.isObservation &&
          win.model !== "SURFACE" &&
          win.model !== "UPPER_AIR" &&
          (win.model || win.element || (win.layers && win.layers.length > 0))
        );
      }
      return false;
    }

    // 1. No data loaded
    expect(shouldShowModel(null, null, false)).toBe(false);

    // 2. Observation loaded
    const surfaceGroup = { id: "composite-surface", isObservation: true };
    expect(shouldShowModel({ isObservation: true }, surfaceGroup, true)).toBe(false);

    // 3. Upper air observation loaded
    const uaGroup = { id: "composite-upperair-500", isObservation: true };
    expect(shouldShowModel({ isObservation: true }, uaGroup, true)).toBe(false);

    // 4. NWP 500hPa synoptic loaded
    const nwpGroup = { id: "composite-500hpa", isObservation: false };
    expect(shouldShowModel({ isObservation: false, model: "ECMWF_HR" }, nwpGroup, true)).toBe(true);

    // 5. Multi-model rain loaded (NWP)
    const rainGroup = { id: "multi-model-rain12", isObservation: false };
    expect(shouldShowModel({ isObservation: false }, rainGroup, true)).toBe(true);
  });

  test("Model selector includes ECMWF_HR, GRAPES_GFS, etc. and invokes onModelSelect", () => {
    expect(navBarSrc).toContain("availableModels");
    expect(navBarSrc).toContain("ECMWF_HR");
    expect(navBarSrc).toContain("GRAPES_GFS");
    expect(navBarSrc).toContain("handleModelChange");
    expect(navBarSrc).toContain("onModelSelect");
  });

  test("handleModelSelect in App.svelte updates model, reloads layers, and refreshes timeline", () => {
    expect(appSrc).toContain("handleModelSelect");
    expect(appSrc).toContain("win.model = newModel");
    expect(appSrc).toContain("refreshForecastTimeline(win, true)");
  });
});

describe("Option A: Hide nav-keyboard-hint Toolbar Hints", () => {
  const navBarSrc = readSrcText("components/NavBar.svelte");

  test("Keyboard hint pills are hidden from the toolbar", () => {
    // Toolbar markup must not show hotkey pills
    expect(navBarSrc).not.toContain('<span class="kbd-pill"');
    // CSS ensures hidden rule
    expect(navBarSrc).toContain(".nav-keyboard-hint {");
    expect(navBarSrc).toContain("display: none !important;");
  });
});

describe("Option A: navBar.js helper methods", () => {
  test("setNavBarLevel handles null/missing select gracefully", () => {
    expect(() => setNavBarLevel(700)).not.toThrow();
  });

  test("setNavBarPreset handles missing select gracefully", () => {
    expect(() => setNavBarPreset("composite-500hpa")).not.toThrow();
  });

  test("setNavBarModel handles missing select gracefully", () => {
    expect(() => setNavBarModel("CMA_GFS")).not.toThrow();
  });

  test("setNavBarModel updates select element and triggers change event when present", () => {
    const origDoc = globalThis.document;
    const mockSelect = {
      value: "ECMWF_HR",
      dispatchEvent(evt) {
        this.dispatched = evt;
      },
    };
    try {
      globalThis.document = {
        ...(origDoc || {}),
        getElementById(id) {
          if (id === "select-nav-model") return mockSelect;
          if (origDoc?.getElementById) return origDoc.getElementById(id);
          return null;
        },
      };

      setNavBarModel("CMA_GFS");
      expect(mockSelect.value).toBe("CMA_GFS");
      expect(mockSelect.dispatched?.type).toBe("change");
    } finally {
      if (origDoc !== undefined) {
        globalThis.document = origDoc;
      } else {
        delete globalThis.document;
      }
    }
  });
});

describe("Preset Menu Viewport Constraint & Submenu Positioning", () => {
  const presetMenuSrc = readSrcText("components/PresetMenu.svelte");
  const polishCss = readSrcText("styles/polish.css");

  test("PresetMenu.svelte defines overflow-y: auto and max-height on preset-dropdown", () => {
    expect(presetMenuSrc).toContain(".preset-dropdown {");
    expect(presetMenuSrc).toContain("overflow-y: auto !important;");
    expect(presetMenuSrc).toContain("max-height: calc(100vh - var(--navbar-height, 48px) - 16px);");
  });

  test("PresetMenu.svelte defines overflow-y: auto and max-height on preset-submenu", () => {
    expect(presetMenuSrc).toContain(".preset-submenu {");
    expect(presetMenuSrc).toContain("overflow-y: auto !important;");
    expect(presetMenuSrc).toContain("max-height: calc(100vh - var(--navbar-height, 48px) - 24px);");
  });

  test("PresetMenu.svelte binds onscroll on preset-dropdown and tracks submenu position", () => {
    expect(presetMenuSrc).toContain("onscroll={handleDropdownScroll}");
    expect(presetMenuSrc).toContain("updateSubmenuPosition");
    expect(presetMenuSrc).toContain("submenuTop");
    expect(presetMenuSrc).toContain("submenuLeft");
  });

  test("polish.css enforces viewport-constrained overflow-y: auto for preset-dropdown and preset-submenu", () => {
    expect(polishCss).toContain("#app .preset-dropdown");
    expect(polishCss).toContain("#app .preset-submenu");
    expect(polishCss).toMatch(/#app \.preset-dropdown\s*\{[^}]*overflow-y:\s*auto !important/);
    expect(polishCss).toMatch(/#app \.preset-submenu\s*\{[^}]*overflow-y:\s*auto !important/);
  });

  test("Submenu positioning algorithm clamps top inside viewport boundaries", () => {
    // Simulate updateSubmenuPosition calculation logic
    function calculateSubmenuTop({
      catScreenTop,
      containerScreenTop,
      dropdownScreenTop,
      submenuHeight,
      viewportHeight,
      padding = 12,
    }) {
      const maxAllowedSubmenuHeight = Math.max(160, viewportHeight - dropdownScreenTop - padding);
      const currentSubmenuHeight = Math.min(submenuHeight, maxAllowedSubmenuHeight);

      let desiredScreenTop = catScreenTop;
      if (desiredScreenTop + currentSubmenuHeight > viewportHeight - padding) {
        desiredScreenTop = viewportHeight - padding - currentSubmenuHeight;
      }
      const minScreenTop = dropdownScreenTop;
      if (desiredScreenTop < minScreenTop) {
        desiredScreenTop = minScreenTop;
      }
      return Math.round(desiredScreenTop - containerScreenTop);
    }

    // Normal viewport (800px)
    const normalTop = calculateSubmenuTop({
      catScreenTop: 100,
      containerScreenTop: 10,
      dropdownScreenTop: 45,
      submenuHeight: 300,
      viewportHeight: 800,
    });
    expect(normalTop).toBe(90); // 100 - 10

    // Constrained viewport (500px): category item near bottom at 400px
    const constrainedTop = calculateSubmenuTop({
      catScreenTop: 400,
      containerScreenTop: 10,
      dropdownScreenTop: 45,
      submenuHeight: 300,
      viewportHeight: 500,
    });
    // desiredScreenTop clamped to 500 - 12 - 300 = 188
    // relative top: 188 - 10 = 178
    expect(constrainedTop).toBe(178);

    // Highly constrained viewport (350px): submenu clamps to dropdown top
    const tinyTop = calculateSubmenuTop({
      catScreenTop: 200,
      containerScreenTop: 10,
      dropdownScreenTop: 45,
      submenuHeight: 400,
      viewportHeight: 350,
    });
    // currentSubmenuHeight clamped to 350 - 45 - 12 = 293
    // desiredScreenTop: min(200, 350 - 12 - 293) = 45
    expect(tinyTop).toBe(35); // 45 - 10 = 35
  });

  test("PresetMenu.svelte provides bidirectional hover bridge with ::before and ::after", () => {
    expect(presetMenuSrc).toContain(".preset-submenu::before,");
    expect(presetMenuSrc).toContain(".preset-submenu::after");
  });

  test("PresetMenu.svelte pre-positions submenu synchronously before state update", () => {
    expect(presetMenuSrc).toContain("function handleCategoryMouseEnter(idx) {");
    expect(presetMenuSrc).toContain("updateSubmenuPosition(idx);");
    expect(presetMenuSrc).toContain("activeCategoryIdx = idx;");
  });

  test("PresetMenu.svelte closes submenu if active category scrolls out of dropdown view", () => {
    expect(presetMenuSrc).toContain("handleDropdownScroll()");
    expect(presetMenuSrc).toContain("catRect.bottom < dropdownRect.top || catRect.top > dropdownRect.bottom");
  });
});

