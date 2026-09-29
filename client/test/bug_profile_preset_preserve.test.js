// bug_profile_preset_preserve.test.js
// Regression test for 30925e3 follow-up: fresh-load clearing must NOT wipe the
// pending preset's profile layers (tlogp/timeheight/lineheight/hovmoller).
//
// Root cause: removeTLogPLayer/removeTimeHeightLayer/removeLineHeightLayer/
// removeHovmollerLayer spliced win.activeGroup.layers, and loadPresetGroup
// passes win.activeGroup BY REFERENCE as `group`. The clear step therefore
// deleted the tlogp diagram (etc.) from the array it was about to iterate,
// so fresh Load Data never loaded the panel (tlogp/timeline not shown).
// Explicit user removes still detach (persistence across timesteps); the
// clearing path now passes { preservePreset: true }.
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  getLayersForWindow,
  addOrUpdateLayer,
  clearLayersForWindow,
} from "../src/lib/stores/layersCore.js";
import {
  findVisibleLayer,
} from "../src/lib/services/profileVisibility.js";
import { removeTLogPLayer } from "../src/layers/tlogp/tlogpLayer.js";
import { removeTimeHeightLayer } from "../src/layers/timeheight/timeHeightLayer.js";
import {
  removeLineHeightLayer,
  removeHovmollerLayer,
} from "../src/layers/lineprofile/lineProfileLayer.js";
import { clearAllWeatherLayersFromMap } from "../src/services/presetLoader.js";

function mockMap() {
  const layers = new Map(), sources = new Map();
  return {
    getLayer: (id) => layers.get(id) || null,
    getSource: (id) => sources.get(id) || null,
    getStyle: () => null,
    addLayer: (d) => layers.set(d.id, d),
    removeLayer: (id) => layers.delete(id),
    addSource: (id, d) => sources.set(id, d),
    removeSource: (id) => sources.delete(id),
    on: () => {}, off: () => {},
  };
}

function tlogpWin(id = "test-win-preserve") {
  return {
    id,
    winIdx: 0,
    activeGroup: {
      id: "composite-tlogp",
      layers: [
        { id: "upperair-tlogp-stations", type: "station", element: "TLOGP", path: "UPPER_AIR/TLOGP" },
        { id: "upperair-tlogp-diagram", type: "tlogp", element: "TLOGP" },
      ],
    },
  };
}

describe("profile preset preservation on fresh-load clear", () => {
  it("clearAllWeatherLayersFromMap keeps the pending tlogp diagram in win.activeGroup.layers", () => {
    const map = mockMap();
    const win = tlogpWin();
    clearAllWeatherLayersFromMap(map, win, { resetVisibility: true });
    const ids = win.activeGroup.layers.map((l) => l.id);
    expect(ids).toContain("upperair-tlogp-diagram");
    expect(ids).toContain("upperair-tlogp-stations");
  });

  it("remove* with { preservePreset: true } keeps the preset; without it detaches (explicit remove)", () => {
    const map = mockMap();

    const winPreserve = tlogpWin("test-win-preserve-2");
    removeTLogPLayer(map, winPreserve, null, { preservePreset: true });
    expect(winPreserve.activeGroup.layers.map((l) => l.id)).toContain("upperair-tlogp-diagram");

    const winExplicit = tlogpWin("test-win-explicit");
    addOrUpdateLayer({ id: "upperair-tlogp-diagram", type: "tlogp", visible: true }, winExplicit);
    removeTLogPLayer(map, winExplicit, "upperair-tlogp-diagram");
    expect(findVisibleLayer(winExplicit, ["tlogp"], ["upperair-tlogp-diagram"])).toBeNull();
    clearLayersForWindow(winExplicit.id);
  });

  it("clearAllWeatherLayersFromMap keeps timeheight/lineheight/hovmoller pending layers", () => {
    const map = mockMap();
    const win = {
      id: "test-win-preserve-profiles",
      winIdx: 0,
      activeGroup: {
        id: "composite-profiles",
        layers: [
          { id: "ec-timeheight-diagram", type: "timeheight" },
          { id: "ec-lineheight-diagram", type: "lineheight" },
          { id: "ec-hovmoller-diagram", type: "hovmoller" },
        ],
      },
    };
    clearAllWeatherLayersFromMap(map, win, { resetVisibility: true });
    const ids = win.activeGroup.layers.map((l) => l.id);
    expect(ids).toContain("ec-timeheight-diagram");
    expect(ids).toContain("ec-lineheight-diagram");
    expect(ids).toContain("ec-hovmoller-diagram");

    // Explicit removes still detach so a user-removed panel is not resurrected.
    const win2 = {
      id: "test-win-explicit-profiles",
      winIdx: 0,
      activeGroup: {
        id: "composite-profiles",
        layers: [
          { id: "ec-timeheight-diagram", type: "timeheight", visible: true },
          { id: "ec-lineheight-diagram", type: "lineheight", visible: true },
          { id: "ec-hovmoller-diagram", type: "hovmoller", visible: true },
        ],
      },
    };
    addOrUpdateLayer({ id: "ec-timeheight-diagram", type: "timeheight", visible: true }, win2);
    addOrUpdateLayer({ id: "ec-lineheight-diagram", type: "lineheight", visible: true }, win2);
    addOrUpdateLayer({ id: "ec-hovmoller-diagram", type: "hovmoller", visible: true }, win2);
    removeTimeHeightLayer(map, win2, "ec-timeheight-diagram");
    removeLineHeightLayer(map, win2, "ec-lineheight-diagram");
    removeHovmollerLayer(map, win2, "ec-hovmoller-diagram");
    expect(findVisibleLayer(win2, ["timeheight"], ["ec-timeheight-diagram"])).toBeNull();
    expect(findVisibleLayer(win2, ["lineheight"], ["ec-lineheight-diagram"])).toBeNull();
    expect(findVisibleLayer(win2, ["hovmoller"], ["ec-hovmoller-diagram"])).toBeNull();
    clearLayersForWindow(win2.id);
  });
});
