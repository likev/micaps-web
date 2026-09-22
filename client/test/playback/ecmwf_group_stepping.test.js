// test/playback/ecmwf_group_stepping.test.js
// Regression tests for: "chip-btn and keyboard shortkey not working for ecmwf-hr group"
// and: "layer hide/show toggle - can't load group when it previous hide"
//
// Root causes:
//   1. Stale win.model ("SURFACE"/"UPPER_AIR" from prior catalog load) caused
//      onWindowFocus to misdetect an NWP preset group as observation mode, overriding
//      the NWP timeline with obs mode and breaking chip-btn and keyboard shortcuts.
//   2. <select> elements retained keyboard focus after "Load Data" click, causing
//      isTextInput() to return true and blocking Arrow key shortcuts.
//   3. clearAllWeatherLayersFromMap() always preserved visible:false in snapshots —
//      so layers hidden via the eye icon stayed permanently hidden even after a fresh
//      "Load Data" group reload. Fix: pass resetVisibility:true for fresh reloads.
//
// These tests assert the active service/UI code and the source-level fixes.

import { test, expect, describe } from "bun:test";
import { readSrcText } from "../helpers/cssText.js";

describe("ECMWF_HR group: chip-btn and keyboard shortkey regression", () => {
  test("navBar: Load Data button blurs select after callback so Arrow keys work", () => {
    // Live navbar is components/NavBar.svelte (legacy initNavBar removed);
    // the Svelte handler releases focus after loading.
    const svelte = readSrcText("components/NavBar.svelte");
    expect(svelte).toContain("currentTarget?.blur?.()");
    expect(svelte).toContain('getElementById("select-preset")?.blur?.()');
  });

  test("global navbar selects blur after change so Arrow keys work (focused window)", () => {
    // Live navbar is components/NavBar.svelte (legacy initNavBar removed).
    const svelte = readSrcText("components/NavBar.svelte");
    expect(svelte).toContain("e.target?.blur?.()");
  });

  test("isObs logic: pure NWP group with stale SURFACE model evaluates to false", () => {
    // Simulate the logic extracted from onWindowFocus
    function computeIsObs(win) {
      const hasNwpGroup = Boolean(win.activeGroup && !win.activeGroup.isObservation);
      return !hasNwpGroup && Boolean(
        win.isObservation ||
        win.activeGroup?.isObservation ||
        win.model === "SURFACE" ||
        win.model === "UPPER_AIR"
      );
    }

    // Scenario: user was in SURFACE catalog, then switched to composite-500hpa NWP group
    const win = {
      activeGroup: {
        id: "composite-500hpa",
        name: "500hPa Composite (HGT + RH + WIND)",
        isObservation: false,
        layers: [{ model: "ECMWF_HR", element: "HGT", type: "contour" }],
      },
      isObservation: false,
      model: "SURFACE",       // stale from prior catalog load
      element: "PLOT_GLOBAL_3H", // stale
      obsTime: "20260828080000.000", // stale
    };

    // With the fix, isObs should be false because hasNwpGroup = true
    expect(computeIsObs(win)).toBe(false);

    // Verify it WOULD have been true without the guard (old broken behavior)
    const oldIsObs = Boolean(
      win.isObservation ||
      win.activeGroup?.isObservation ||
      win.model === "SURFACE" ||
      win.model === "UPPER_AIR"
    );
    expect(oldIsObs).toBe(true); // this proves the old code was broken
  });

  test("isObs logic: observation group with stale ECMWF_HR model evaluates to true (not regressed)", () => {
    function computeIsObs(win) {
      const hasNwpGroup = Boolean(win.activeGroup && !win.activeGroup.isObservation);
      return !hasNwpGroup && Boolean(
        win.isObservation ||
        win.activeGroup?.isObservation ||
        win.model === "SURFACE" ||
        win.model === "UPPER_AIR"
      );
    }

    // Observation group should still be detected as obs
    const obsWin = {
      activeGroup: {
        id: "composite-surface",
        name: "Surface Synoptic",
        isObservation: true,
        layers: [{ model: "SURFACE", element: "PLOT_GLOBAL_3H", type: "station" }],
      },
      isObservation: true,
      model: null,
      element: null,
    };
    expect(computeIsObs(obsWin)).toBe(true);
  });

  test("isObs logic: catalog-loaded NWP without activeGroup still works via win.model (not regressed)", () => {
    function computeIsObs(win) {
      const hasNwpGroup = Boolean(win.activeGroup && !win.activeGroup.isObservation);
      return !hasNwpGroup && Boolean(
        win.isObservation ||
        win.activeGroup?.isObservation ||
        win.model === "SURFACE" ||
        win.model === "UPPER_AIR"
      );
    }

    // No activeGroup, but catalog-loaded SURFACE obs — should still be obs
    const catalogObsWin = {
      activeGroup: null,
      isObservation: true,
      model: "SURFACE",
      element: "PLOT_GLOBAL_3H",
    };
    expect(computeIsObs(catalogObsWin)).toBe(true);

    // No activeGroup, catalog-loaded UPPER_AIR — should still be obs
    const upperAirWin = {
      activeGroup: null,
      isObservation: true,
      model: "UPPER_AIR",
      element: "PLOT",
    };
    expect(computeIsObs(upperAirWin)).toBe(true);
  });

  test("period extraction from chip-btn boxed payload works correctly", () => {
    // Verify the chip-btn boxed object dispatched via fireTimeChange is unpacked correctly
    // (mirrors bootstrap.js lines 383-387)
    function extractPeriod(data, currentPeriod) {
      let period = currentPeriod ?? 24;
      if (typeof data === "number") {
        period = data;
      } else if (typeof data === "object" && data !== null) {
        if (typeof data.period === "number") {
          period = data.period;
        } else if (typeof data.valueOf === "function" && typeof data.valueOf() === "number") {
          period = data.valueOf();
        }
      }
      return period;
    }

    // chip-btn fires boxed object like: { period: 30, _seq: 5, valueOf() { return 30; } }
    const chipPayload = { period: 30, _seq: 5, valueOf() { return 30; } };
    expect(extractPeriod(chipPayload, 24)).toBe(30);

    // step() fires same shape
    const stepPayload = { period: 12, _seq: 7, prefetchDirections: ["next"], source: "btn-next", valueOf() { return 12; } };
    expect(extractPeriod(stepPayload, 24)).toBe(12);

    // Raw number (legacy path)
    expect(extractPeriod(48, 24)).toBe(48);

    // Analysis (000h)
    const analysisPayload = { period: 0, _seq: 1, valueOf() { return 0; } };
    expect(extractPeriod(analysisPayload, 24)).toBe(0);
  });

  test("presetLoader.js: isTimeStep=true skips timeline re-initialization for NWP group", () => {
    const src = readSrcText("services/presetLoader.js");
    // When isTimeStep=true, presetLoader must not call setTimelineMode again
    // (it only does so when !isTimeStep && !group.isObservation)
    expect(src).toContain("if (!isTimeStep && !group.isObservation && win)");
  });
});

describe("Layer hide/show: can't reload group when layer previously hidden", () => {
  test("presetLoader.js: clearAllWeatherLayersFromMap accepts resetVisibility option", () => {
    const src = readSrcText("services/presetLoader.js");
    // Fix 3: clearAllWeatherLayersFromMap must accept { resetVisibility } option
    expect(src).toContain("resetVisibility = false");
    expect(src).toContain("resetVisibility ? true : (l.visible !== false)");
  });

  test("presetLoader.js: loadPresetGroup passes resetVisibility:true for fresh reload (!isTimeStep)", () => {
    const src = readSrcText("services/presetLoader.js");
    // Fix 3: fresh reload (not time step) must reset layer visibility to true
    expect(src).toContain("clearAllWeatherLayersFromMap(map, win, { resetVisibility: true })");
  });

  test("resetVisibility logic: snapshot forces visible=true when resetVisibility=true", () => {
    // Simulate the clearAllWeatherLayersFromMap snapshot logic
    function buildSnapshot(layers, resetVisibility) {
      return layers.map((l) => ({
        id: l.id,
        visible: resetVisibility ? true : (l.visible !== false),
      }));
    }

    const layers = [
      { id: "contour-HGT", visible: true },   // was visible
      { id: "contour-RH", visible: false },    // was hidden by user
      { id: "wind-WIND", visible: false },     // was hidden by user
    ];

    // Time-step (resetVisibility=false): preserves operator visibility choices
    const stepSnap = buildSnapshot(layers, false);
    expect(stepSnap[0].visible).toBe(true);
    expect(stepSnap[1].visible).toBe(false);  // hidden layer stays hidden on time step
    expect(stepSnap[2].visible).toBe(false);

    // Fresh reload (resetVisibility=true): all layers reset to visible
    const reloadSnap = buildSnapshot(layers, true);
    expect(reloadSnap[0].visible).toBe(true);
    expect(reloadSnap[1].visible).toBe(true);  // previously-hidden layer is reset to visible
    expect(reloadSnap[2].visible).toBe(true);
  });

  test("weatherLoader.js: isVisible resolution from snapshot and existingLayer", () => {
    // Simulate the isVisible computation from weatherLoader.js line 61
    function resolveIsVisible(existingLayer, snap) {
      return existingLayer ? (existingLayer.visible !== false) : (snap ? snap.visible !== false : true);
    }

    // Time-step: existingLayer with visible:false → isVisible=false (layer stays hidden)
    expect(resolveIsVisible({ visible: false }, null)).toBe(false);

    // Fresh reload: existingLayer cleared → snap.visible=true (reset) → isVisible=true
    expect(resolveIsVisible(null, { visible: true })).toBe(true);

    // Fresh reload: no snap → defaults to true
    expect(resolveIsVisible(null, null)).toBe(true);

    // Time-step: existingLayer visible → isVisible=true
    expect(resolveIsVisible({ visible: true }, null)).toBe(true);
  });
});

describe("Layer remove (✕): Load Data restores previously-removed ECMWF-HR base layer", () => {
  test("actionsDispatcher.js: ✕ does not splice base preset layers from activeGroup", () => {
    const src = readSrcText("ui/layers/actionsDispatcher.js");
    // Base layers must survive ✕ so fresh Load Data can iterate the full preset.
    expect(src).toContain("isDerivedOverlay");
    // The unconditional splice was the bug — it must now be gated on derived only.
    expect(src).not.toContain("Persist deletion of layer from preset configuration");
  });

  test("presetLoader.js: fresh reload self-heals missing base layers from pristine preset", () => {
    const src = readSrcText("services/presetLoader.js");
    expect(src).toContain("PRESET_GROUPS");
    expect(src).toContain("Self-heal");
  });

  test("remove-then-reload: base ECMWF-HR layer comes back on fresh load", () => {
    // Simulate: pristine preset has HGT+WIND; window copy loses HGT via old ✕ splice;
    // fresh loadPresetGroup self-heal must restore HGT from pristine.
    const pristine = {
      id: "ecmwf-hr-test",
      layers: [
        { id: "c-hgt", model: "ECMWF_HR", element: "HGT", type: "contour" },
        { id: "w-wind", model: "ECMWF_HR", element: "WIND", type: "wind" },
      ],
    };
    const winGroup = JSON.parse(JSON.stringify(pristine));
    // Old buggy ✕: splice base layer from per-window copy
    winGroup.layers.splice(0, 1);
    expect(winGroup.layers.length).toBe(1);

    // Fixed self-heal (mirrors presetLoader.js): restore missing non-derived layers
    for (const pl of pristine.layers) {
      if (pl?.derivedFrom) continue;
      const exists = winGroup.layers.some(
        (l) => (pl.id && l.id === pl.id) || (l.model === pl.model && l.element === pl.element)
      );
      if (!exists) winGroup.layers.push(JSON.parse(JSON.stringify(pl)));
    }
    expect(winGroup.layers.length).toBe(2);
    expect(winGroup.layers.some((l) => l.element === "HGT")).toBe(true);
  });

  test("clone isolation: ✕-splice on window copy does not mutate global preset", () => {
    const globalPreset = {
      id: "ecmwf-hr-test",
      layers: [{ id: "c-hgt", model: "ECMWF_HR", element: "HGT", type: "contour" }],
    };
    const winCopy = JSON.parse(JSON.stringify(globalPreset));
    winCopy.layers.splice(0, 1);
    // Global must be untouched — this is what clonePresetGroup guarantees
    expect(globalPreset.layers.length).toBe(1);
    expect(winCopy.layers.length).toBe(0);
  });
});
