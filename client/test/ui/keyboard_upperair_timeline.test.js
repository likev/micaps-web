// keyboard_upperair_timeline.test.js - Regression test verifying that keyboard shortcuts / level steps
// in upper-air maintain timeline consistency with real data and do NOT reset to latest time.
import { test, expect, describe, beforeEach } from "bun:test";
import { createTimelineState } from "../../src/lib/stores/timelineCore.js";
import { filterObsFilesByStep, selectObsChipsWindow } from "../../src/lib/stores/timelineMath.js";
import { DEFAULT_MOCK_OBS_FILES } from "../../src/config/presets.js";
import { changeVerticalLevel } from "../../src/services/levelController.js";
import { syncObservationTimeline } from "../../src/utils/timelineSync.js";

function createMockMap() {
  const sources = new Map();
  const layers = new Map();
  return {
    addSource: (id, src) => sources.set(id, { ...src, _data: src.data }),
    getSource: (id) => sources.get(id) || null,
    removeSource: (id) => sources.delete(id),
    addLayer: (layer) => layers.set(layer.id, { ...layer }),
    getLayer: (id) => layers.get(id) || null,
    removeLayer: (id) => layers.delete(id),
    setLayoutProperty: () => {},
    setPaintProperty: () => {},
    getBounds: () => ({ toArray: () => [[70, 10], [140, 60]] }),
    isStyleLoaded: () => true,
    loaded: () => true,
    once: () => {},
    on: () => {},
    off: () => {},
  };
}

describe("Upper-Air Level Step Timeline Consistency (ArrowUp/Down)", () => {
  let win;
  let map;

  beforeEach(() => {
    map = createMockMap();
    win = {
      id: "ua-test-win-1",
      winIdx: 0,
      level: 500,
      period: 24,
      isObservation: true,
      obsTime: null,
      stepLength: 12,
      activeGroup: {
        id: "composite-upperair-500",
        name: "500 hPa Upper-Air Sounding",
        hasLevel: true,
        defaultLevel: 500,
        isObservation: true,
        layers: [
          {
            id: "upperair-obs-500",
            name: "500 hPa Sounding Station Plots",
            type: "station",
            model: "UPPER_AIR",
            element: "PLOT",
            level: 500,
            path: "UPPER_AIR/PLOT/500",
            render: {},
          },
          {
            id: "contour-sounding-hgt-500",
            name: "500 hPa Derived Height",
            type: "contour",
            model: "UPPER_AIR",
            element: "HGT",
            level: 500,
            derivedFrom: "upperair-obs-500",
            render: { showLine: true },
          },
        ],
      },
    };
  });

  test("syncObservationTimeline preserves selected earlier obsTime when valid at target level", async () => {
    const rawFiles = [...DEFAULT_MOCK_OBS_FILES].sort();
    const filtered = filterObsFilesByStep(rawFiles, 12, true);
    expect(filtered.length).toBeGreaterThanOrEqual(4);

    // Pick an earlier sounding, not the latest one
    const earlierFile = filtered[1];
    const latestFile = filtered[filtered.length - 1];
    expect(earlierFile).not.toBe(latestFile);

    // Initial load: sync 500 hPa
    const initialFile = await syncObservationTimeline("UPPER_AIR/PLOT/500", earlierFile, "500 hPa Sounding", win, { forceLatest: false });
    win.obsTime = initialFile;
    expect(initialFile).toBe(earlierFile);
    expect(win.obsTime).toBe(earlierFile);
    expect(win._obsTimeline.file).toBe(earlierFile);
    expect(win._obsTimelinePath).toBe("UPPER_AIR/PLOT/500");

    // Level step to 700 hPa with earlierFile selected
    const steppedFile = await syncObservationTimeline("UPPER_AIR/PLOT/700", win.obsTime, "700 hPa Sounding", win, { forceLatest: false });
    win.obsTime = steppedFile;
    expect(steppedFile).toBe(earlierFile);
    expect(win.obsTime).toBe(earlierFile);
    expect(win._obsTimeline.file).toBe(earlierFile);
    expect(win._obsTimelinePath).toBe("UPPER_AIR/PLOT/700");
  });

  test("changeVerticalLevel in upper-air preserves selected observation time and updates timeline path", async () => {
    const rawFiles = [...DEFAULT_MOCK_OBS_FILES].sort();
    const filtered = filterObsFilesByStep(rawFiles, 12, true);
    const earlierFile = filtered[2];
    const latestFile = filtered[filtered.length - 1];
    expect(earlierFile).not.toBe(latestFile);

    // Simulate initial load at 500 hPa with earlier time selected by user
    win.obsTime = earlierFile;
    await syncObservationTimeline("UPPER_AIR/PLOT/500", earlierFile, "500 hPa Sounding", win, { forceLatest: false });

    // User presses ArrowDown (stepping from 500 to 700 hPa)
    await changeVerticalLevel(map, 0, 700, win);

    expect(win.level).toBe(700);
    expect(win.obsTime).toBe(earlierFile);
    expect(win._obsTimeline.file).toBe(earlierFile);
    expect(win._obsTimelinePath).toBe("UPPER_AIR/PLOT/700");

    // Verify Svelte timeline store bridge logic (mirrored from App.svelte handleLevelSelect)
    const t = win._obsTimeline;
    const tl = createTimelineState(win.id);
    tl.currentMode = "obs";
    tl.isUpperAirMode = Boolean(t.isUpper);
    tl.currentStepLength = t.stepLength || 12;

    const filteredFiles = filterObsFilesByStep(t.files, tl.currentStepLength, tl.isUpperAirMode);
    const currentFile = win.obsTime || t.file;
    const chips = selectObsChipsWindow(filteredFiles, currentFile);
    tl.obsFiles = chips.length > 0 ? chips : filteredFiles;
    const idx = currentFile ? tl.obsFiles.indexOf(currentFile) : -1;
    tl.currentObsIdx = idx !== -1 ? idx : Math.max(0, tl.obsFiles.length - 1);

    // Timeline chip must be the selected earlier file, NOT the latest file
    expect(tl.obsFiles[tl.currentObsIdx]).toBe(earlierFile);
    expect(tl.obsFiles[tl.currentObsIdx]).not.toBe(latestFile);
  });

  test("changeVerticalLevel for non-preset Upper-Air window preserves obsTime", async () => {
    const rawFiles = [...DEFAULT_MOCK_OBS_FILES].sort();
    const filtered = filterObsFilesByStep(rawFiles, 12, true);
    const earlierFile = filtered[1];

    // Single-field UPPER_AIR without preset group
    const nonPresetWin = {
      id: "ua-test-win-2",
      winIdx: 1,
      level: 500,
      model: "UPPER_AIR",
      element: "PLOT",
      isObservation: true,
      obsTime: earlierFile,
      stepLength: 12,
      activeGroup: null,
    };

    await changeVerticalLevel(map, 0, 850, nonPresetWin);

    expect(nonPresetWin.level).toBe(850);
    expect(nonPresetWin.obsTime).toBe(earlierFile);
    expect(nonPresetWin._obsTimeline.file).toBe(earlierFile);
    expect(nonPresetWin._obsTimelinePath).toBe("UPPER_AIR/PLOT/850");
  });
});
