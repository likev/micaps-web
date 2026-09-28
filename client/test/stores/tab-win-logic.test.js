import { describe, it, expect, beforeEach } from "bun:test";
import {
  createDefaultTab,
  createDefaultWindow,
  prepareSplitWindows,
  isWindowEmpty,
  hasWeatherLayers,
  applyAutoAllocation,
  revertAutoAllocation,
  getNumVisible,
  getVisibleWindows,
  getNextWindowUid,
} from "../../src/lib/stores/tabsCore.js";

describe("Tab-Win Logic & Consistent Split Lifecycle", () => {
  describe("Emptiness Detection: isWindowEmpty & hasWeatherLayers", () => {
    it("identifies a freshly created default window as empty", () => {
      const win = createDefaultWindow(0, 1);
      expect(isWindowEmpty(win)).toBe(true);
      expect(hasWeatherLayers(win)).toBe(false);
    });

    it("identifies a window with activeGroup layers as non-empty", () => {
      const win = {
        ...createDefaultWindow(0, 1),
        activeGroup: {
          id: "composite-500",
          name: "500hPa Composite",
          layers: [{ id: "l1", type: "contour", element: "HGT" }],
        },
      };
      expect(isWindowEmpty(win)).toBe(false);
      expect(hasWeatherLayers(win)).toBe(true);
    });

    it("identifies a window with layers array as non-empty", () => {
      const win = {
        ...createDefaultWindow(0, 1),
        layers: [{ id: "l1", type: "wind" }],
      };
      expect(isWindowEmpty(win)).toBe(false);
      expect(hasWeatherLayers(win)).toBe(true);
    });

    it("uses layerResolver to distinguish base pmtiles layer from weather layers", () => {
      const win = createDefaultWindow(0, 1);
      // Only basemap pmtiles layer (non-removable)
      const mockResolverBasemapOnly = () => [
        { id: "layer-pmtiles-win-0", type: "pmtiles", removable: false },
      ];
      expect(isWindowEmpty(win, mockResolverBasemapOnly)).toBe(true);

      // Has contour weather layer (removable: true)
      const mockResolverWithWeather = () => [
        { id: "layer-pmtiles-win-0", type: "pmtiles", removable: false },
        { id: "contour-layer-1", type: "contour", removable: true },
      ];
      expect(isWindowEmpty(win, mockResolverWithWeather)).toBe(false);
      expect(hasWeatherLayers(win, mockResolverWithWeather)).toBe(true);
    });
  });

  describe("Change 6: Split from tab-win mode protects existing tab-wins with layers", () => {
    it("splits into empty tab-wins and creates new wins without overwriting existing tab-wins with layers", () => {
      const tab = createDefaultTab(1);
      tab.layout = "1x1";

      const win0 = {
        ...createDefaultWindow(0, 1),
        id: "tab-1-win-0",
        model: "ECMWF_HR",
        element: "TMP",
        level: 500,
        period: 24,
        activeGroup: {
          id: "g-500",
          name: "500hPa TMP",
          layers: [{ type: "contour", element: "TMP", level: 500 }],
        },
      };

      const win1 = {
        ...createDefaultWindow(1, 1),
        id: "tab-1-win-1",
        model: "GRAPES_GFS",
        element: "RH",
        level: 850,
        period: 12,
        activeGroup: {
          id: "g-850",
          name: "850hPa RH",
          layers: [{ type: "contour", element: "RH", level: 850 }],
        },
      };

      const win2 = {
        ...createDefaultWindow(2, 1),
        id: "tab-1-win-2",
        // empty window (e.g. user clicked + earlier)
        activeGroup: null,
      };

      tab.windows = [win0, win1, win2];
      tab.activeWinIdx = 0; // Focusing win0

      // Split 4-way (layout 2x2, numNeeded = 4)
      tab.layout = "2x2";
      prepareSplitWindows(tab, 4, win0, isWindowEmpty, true);

      // 4 split slots: win0 (base), win2 (was empty, reused), + 2 newly created wins
      // win1 (had layers) MUST be preserved after the 4 split slots!
      expect(tab.windows.length).toBe(5);
      const splitSlots = tab.windows.slice(0, 4);
      expect(splitSlots[0].id).toBe("tab-1-win-0");
      expect(splitSlots[1].id).toBe("tab-1-win-2");
      // Newly created windows
      expect(splitSlots[2].id).toBeDefined();
      expect(splitSlots[3].id).toBeDefined();

      // win1 is parked at index 4, intact with its original group and data
      const preservedWin = tab.windows[4];
      expect(preservedWin.id).toBe("tab-1-win-1");
      expect(preservedWin.activeGroup?.id).toBe("g-850");
      expect(preservedWin.model).toBe("GRAPES_GFS");
      expect(preservedWin.level).toBe(850);
      expect(preservedWin.period).toBe(12);

      // Applying auto-allocation 'level' only modifies visible split windows
      applyAutoAllocation(tab, "level", win0);
      expect(splitSlots[0].level).toBe(500);
      expect(splitSlots[1].level).toBe(850);
      expect(splitSlots[2].level).toBe(1000);
      expect(splitSlots[3].level).toBe(200);

      // win1 was NOT touched by auto-allocation
      expect(preservedWin.level).toBe(850);
      expect(preservedWin.model).toBe("GRAPES_GFS");
      expect(preservedWin.activeGroup?.id).toBe("g-850");
    });

    it("splits from a non-zero focused window, preserving preceding busy windows", () => {
      const tab = createDefaultTab(1);
      tab.layout = "1x1";

      const win0 = {
        ...createDefaultWindow(0, 1),
        id: "win-surface",
        activeGroup: { id: "surf-plot", layers: [{ type: "station", model: "SURFACE" }] },
      };
      const win1 = {
        ...createDefaultWindow(1, 1),
        id: "win-radar",
        activeGroup: { id: "radar-mosaic", layers: [{ type: "raster" }] },
      };

      tab.windows = [win0, win1];
      tab.activeWinIdx = 1; // User is looking at win1

      // 2-split (numNeeded = 2) from tab mode
      prepareSplitWindows(tab, 2, win1, isWindowEmpty, true);

      // Split slots: win1 (base) + newly created window (since win0 has layers)
      expect(tab.windows.length).toBe(3);
      expect(tab.windows[0].id).toBe("win-radar");
      expect(tab.windows[1].activeGroup).toBeNull(); // Freshly created
      // win0 is preserved at index 2
      expect(tab.windows[2].id).toBe("win-surface");
      expect(tab.windows[2].activeGroup?.id).toBe("surf-plot");
    });

    it("creates all new windows when all other existing windows have layers", () => {
      const tab = createDefaultTab(1);
      const w0 = { ...createDefaultWindow(0, 1), id: "w0", activeGroup: { id: "g0", layers: [{ type: "contour" }] } };
      const w1 = { ...createDefaultWindow(1, 1), id: "w1", activeGroup: { id: "g1", layers: [{ type: "contour" }] } };
      const w2 = { ...createDefaultWindow(2, 1), id: "w2", activeGroup: { id: "g2", layers: [{ type: "contour" }] } };

      tab.windows = [w0, w1, w2];
      tab.activeWinIdx = 0;

      // 4-split
      prepareSplitWindows(tab, 4, w0, isWindowEmpty, true);

      // We needed 3 additional windows, all created brand new because w1 and w2 have layers
      expect(tab.windows.length).toBe(6);
      expect(tab.windows[0].id).toBe("w0");
      expect(tab.windows[1].activeGroup).toBeNull();
      expect(tab.windows[2].activeGroup).toBeNull();
      expect(tab.windows[3].activeGroup).toBeNull();
      // w1 and w2 preserved at indices 4 and 5
      expect(tab.windows[4].id).toBe("w1");
      expect(tab.windows[5].id).toBe("w2");
    });

    it("expanding from 2-split to 4-split preserves existing busy tabs outside the visible split", () => {
      const tab = createDefaultTab(1);
      tab.layout = "1x2";

      const w0 = { ...createDefaultWindow(0, 1), id: "w0", activeGroup: { id: "g0", layers: [{ type: "contour" }] } };
      const w1 = { ...createDefaultWindow(1, 1), id: "w1", activeGroup: { id: "g1", layers: [{ type: "contour" }] } };
      const w2 = { ...createDefaultWindow(2, 1), id: "w2-busy", activeGroup: { id: "g-busy", layers: [{ type: "station" }] } };
      const w3 = { ...createDefaultWindow(3, 1), id: "w3-empty", activeGroup: null };

      tab.windows = [w0, w1, w2, w3];
      tab.activeWinIdx = 0;

      // Expand to 2x2 (numNeeded = 4), wasTab = false, prevNumVisible = 2
      prepareSplitWindows(tab, 4, w0, isWindowEmpty, false, 2);

      // 4 split slots: w0, w1 (previous visible), w3 (reused empty), + 1 newly created
      // w2-busy MUST be preserved outside the 4 split slots!
      expect(tab.windows.length).toBe(5);
      const splitSlots = tab.windows.slice(0, 4);
      expect(splitSlots[0].id).toBe("w0");
      expect(splitSlots[1].id).toBe("w1");
      expect(splitSlots[2].id).toBe("w3-empty");
      expect(splitSlots[3].id).toBeDefined();
      expect(splitSlots[3].id).not.toBe("w2-busy");

      // w2-busy is preserved at index 4 with its original layers intact!
      const preservedBusy = tab.windows[4];
      expect(preservedBusy.id).toBe("w2-busy");
      expect(preservedBusy.activeGroup?.id).toBe("g-busy");
    });
  });

  describe("Change 3: User can delete any tab-win if more than one tab", () => {
    function simulateCloseWindow(activeTab, winToClose) {
      if (!activeTab || activeTab.windows.length <= 1) return false;
      const idx = activeTab.windows.findIndex((w) => w.id === winToClose.id);
      if (idx === -1) return false;

      const wasActive = idx === activeTab.activeWinIdx;
      const currentActiveWin = activeTab.windows[activeTab.activeWinIdx];
      activeTab.windows.splice(idx, 1);
      activeTab.windows.forEach((w, i) => {
        w.winIdx = i;
        if (w.title) w.title = String(w.title).replace(/^W\d+:\s*/, "");
      });
      if (wasActive) {
        const nextIdx = Math.max(0, Math.min(idx, activeTab.windows.length - 1));
        activeTab.activeWinIdx = nextIdx;
      } else {
        activeTab.activeWinIdx = Math.max(0, activeTab.windows.indexOf(currentActiveWin));
      }
      if (activeTab.windows.length <= 1 && activeTab.layout !== "1x1") {
        activeTab.layout = "1x1";
      }
      return true;
    }

    it("allows deleting the first window (index 0) when multiple tabs exist", () => {
      const tab = createDefaultTab(1);
      const w0 = { ...createDefaultWindow(0, 1), id: "win-0", title: "W1: Height" };
      const w1 = { ...createDefaultWindow(1, 1), id: "win-1", title: "W2: Temp" };
      const w2 = { ...createDefaultWindow(2, 1), id: "win-2", title: "W3: Wind" };
      tab.windows = [w0, w1, w2];
      tab.activeWinIdx = 0;

      const closed = simulateCloseWindow(tab, w0);
      expect(closed).toBe(true);
      expect(tab.windows.length).toBe(2);
      expect(tab.windows[0].id).toBe("win-1");
      expect(tab.windows[0].winIdx).toBe(0);
      expect(tab.windows[1].id).toBe("win-2");
      expect(tab.windows[1].winIdx).toBe(1);
      expect(tab.activeWinIdx).toBe(0); // focused on new first window (win-1)
    });

    it("allows deleting any intermediate window (index 1 of 4)", () => {
      const tab = createDefaultTab(1);
      tab.windows = [
        { ...createDefaultWindow(0, 1), id: "w0" },
        { ...createDefaultWindow(1, 1), id: "w1" },
        { ...createDefaultWindow(2, 1), id: "w2" },
        { ...createDefaultWindow(3, 1), id: "w3" },
      ];
      tab.activeWinIdx = 2; // w2 active

      const closed = simulateCloseWindow(tab, tab.windows[1]); // Close w1
      expect(closed).toBe(true);
      expect(tab.windows.length).toBe(3);
      expect(tab.windows.map((w) => w.id)).toEqual(["w0", "w2", "w3"]);
      // w2 was active, its new index is 1
      expect(tab.activeWinIdx).toBe(1);
      expect(tab.windows[tab.activeWinIdx].id).toBe("w2");
    });

    it("prevents deleting when only one tab remains", () => {
      const tab = createDefaultTab(1);
      tab.windows = [{ ...createDefaultWindow(0, 1), id: "sole-win" }];
      tab.activeWinIdx = 0;

      const closed = simulateCloseWindow(tab, tab.windows[0]);
      expect(closed).toBe(false);
      expect(tab.windows.length).toBe(1);
    });

    it("reverts split layout to 1x1 when deletions reduce windows to 1", () => {
      const tab = createDefaultTab(1);
      tab.layout = "1x2";
      tab.windows = [
        { ...createDefaultWindow(0, 1), id: "w0" },
        { ...createDefaultWindow(1, 1), id: "w1" },
      ];
      tab.activeWinIdx = 1;

      simulateCloseWindow(tab, tab.windows[0]);
      expect(tab.windows.length).toBe(1);
      expect(tab.layout).toBe("1x1");
    });

    it("getNextWindowUid avoids collisions even after arbitrary middle-window deletions", () => {
      const tab = createDefaultTab(1);
      tab.windows = [
        { ...createDefaultWindow(0, 1), uid: 0, id: "w0" },
        { ...createDefaultWindow(1, 1), uid: 1, id: "w1" },
        { ...createDefaultWindow(2, 1), uid: 2, id: "w2" },
        { ...createDefaultWindow(3, 1), uid: 3, id: "w3" },
      ];
      tab._nextWinSeq = 4;

      // Delete window 1 (uid 1)
      simulateCloseWindow(tab, tab.windows[1]);
      expect(tab.windows.length).toBe(3);
      expect(tab.windows.map((w) => w.uid)).toEqual([0, 2, 3]);

      // Adding new windows must NOT reuse uid 2 or 3
      const nextUid1 = getNextWindowUid(tab);
      expect(nextUid1).toBe(4);
      expect(tab.windows.some((w) => w.uid === nextUid1)).toBe(false);

      const nextUid2 = getNextWindowUid(tab);
      expect(nextUid2).toBe(5);
    });

    it("detects when baseWin parameters change vs when they match", () => {
      const baseWin = {
        ...createDefaultWindow(0, 1),
        id: "base",
        level: 850,
        model: "ECMWF_HR",
        period: 24,
        activeGroup: { id: "g1", layers: [{ type: "contour" }] },
      };

      const prevBaseState = {
        level: baseWin.level,
        model: baseWin.model,
        period: baseWin.period,
        forecastCycle: baseWin.forecastCycle,
        obsTime: baseWin.obsTime,
        groupId: baseWin.activeGroup?.id,
      };

      const tab = createDefaultTab(1);
      tab.windows = [baseWin, createDefaultWindow(1, 1)];
      applyAutoAllocation(tab, "level", baseWin);

      // In mode 'level', slot 0 is assigned DEFAULT_LEVELS[0] = 500
      expect(baseWin.level).toBe(500);

      // Check early-return condition:
      // Since baseWin had 850 previously, baseWin.level (500) !== prevBaseState.level (850) -> must reload!
      const shouldSkipReloadDifferent = (baseWin.level === prevBaseState.level);
      expect(shouldSkipReloadDifferent).toBe(false);

      // If baseWin already had 500:
      const prevBaseStateSame = { ...prevBaseState, level: 500 };
      const shouldSkipReloadSame = (baseWin.level === prevBaseStateSame.level);
      expect(shouldSkipReloadSame).toBe(true);
    });
  });
});
