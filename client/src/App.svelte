<script>
  import { onMount, onDestroy } from "svelte";
  import NavBar from "./components/NavBar.svelte";
  import TabsBar from "./components/TabsBar.svelte";
  import WindowPanel from "./components/WindowPanel.svelte";
  import LayersPanel from "./components/LayersPanel.svelte";
  import TimeSlider from "./components/TimeSlider.svelte";
  import Legend from "./components/Legend.svelte";
  import Tooltip from "./components/Tooltip.svelte";
  import Toast from "./components/Toast.svelte";
  import FullscreenButton from "./components/FullscreenButton.svelte";
  import ConfigEditor from "./components/ConfigEditor.svelte";

  import { ui, showToast, showTooltip, hideTooltip } from "./lib/stores/ui.svelte.js";
  import { app } from "./lib/stores/app.svelte.js";
  import { tabsState, getVisibleWindows, getWindowById, setMapInstance, getMapInstance, mapInstances } from "./lib/stores/tabs.svelte.js";
  import { syncLayersState } from "./lib/stores/layers.svelte.js";
  import { syncLegendState, deleteWindowLegends } from "./lib/stores/legend.svelte.js";
  import { getOrCreateTimeline, playback, selectObsChipsWindow, filterObsFilesByStep, getPeriodsForStep, timelinesByWindow } from "./lib/stores/timeline.svelte.js";
  import { setLiveTimelineResolver, cancelScheduledPrefetch } from "./services/prefetchService.js";

  // Feed the prefetch engine the live per-window timeline (not the frozen
  // legacy global) so left/right keyboard steps warm the actual adjacent
  // periods / obs files.
  setLiveTimelineResolver((winId) => (winId ? timelinesByWindow[winId] : null) || null);

  import { loadPresetGroups, PRESET_GROUPS, onConfigLoaded, CURRENT_CONFIG, autoSaveLayerConfig } from "./config/presets.js";
  import { loadPresetGroup, reloadConfiguration } from "./services/presetLoader.js";
  import { changeVerticalLevel } from "./services/levelController.js";
  import { handleLayerAction as serviceHandleLayerAction } from "./ui/layerActions.js";
  import { resolveForecastCycles } from "./utils/timelineSync.js";
  import { resolveLayerTime } from "./utils/timeResolver.js";
  import {
    DEFAULT_LEVELS,
    DEFAULT_MODELS,
    stepCycleHours,
    createDefaultTab,
    createDefaultWindow,
    getNumVisible,
    isWindowVisible,
    applyAutoAllocation,
    revertAutoAllocation,
    getEligibleModelsForAllocation,
    preloadModelLevels,
    prepareSplitWindows,
    isWindowEmpty,
    hasWeatherLayers,
    getNextWindowUid,
    shouldSkipWindowReload,
  } from "./lib/stores/tabsCore.js";
  import { getLayersForWindow, clearLayersForWindow } from "./lib/stores/layersCore.js";
  import { deleteWindowTimeline } from "./lib/stores/timeline.svelte.js";
  import { stopWindAnimation, removeGridWindBarbs } from "./layers/windLayer.js";
  import { removeRasterLayer, removeAllRasterLayers } from "./layers/rasterLayer.js";
  import { removeStationLayer } from "./layers/stationLayer.js";
  import { disarmAllContourReRenders } from "./services/contourReRender.js";
  import {
    shouldHideTimelineForGroup,
    isProfilePanelGroup,
    isProfilePanelWindow,
    isSurfaceGroup,
    isUpperAirGroup,
    isSurfaceWindow,
    isUpperAirWindow,
    applyPresetToWindow,
    stepWindowTimeline,
    beginSharedSweep,
    sharedSweepAlive,
  } from "./lib/services/appWorkflow.js";
  import { isTextInput } from "./actions/keyboardShortcuts.js";
  import { registerWindowMapSync, syncTabCameras } from "./ui/tabs/windowMaps.js";
  import { setMapProjection } from "./map/mapInstance.js";
  import { applyBasemapScheme } from "./map/pmtilesLayers.js";
  import { updateGraticuleScheme } from "./map/graticule.js";
  import { hovmollerController, lineHeightController } from "./layers/lineprofile/lineProfileLayer.js";
  import { tlogpController } from "./layers/tlogp/tlogpController.js";
  import { timeHeightController } from "./layers/timeheight/timeHeightController.js";
  import { clearProfileState } from "./lib/stores/profilesCore.js";
  import { syncProfilePanelsForWindow, hideAllProfilePanels, findVisibleLayer } from "./lib/services/profileVisibility.js";
  import {
    isRain12Element,
    isWindowRain12,
    getRainAccumulationHours,
    getRainAccumulationHoursForWindow,
    getDisabledPeriodsForRain,
  } from "./utils/rain12.js";
  import { updateWindowTitle } from "./ui/tabs/windowTitles.js";

  let activeTab = $derived(tabsState.tabs.find((t) => t.id === tabsState.activeTabId) || tabsState.tabs[0] || null);
  let activeWin = $derived(activeTab && activeTab.windows ? (activeTab.windows[activeTab.activeWinIdx] || activeTab.windows[0]) : null);
  let visibleWindows = $derived(getVisibleWindows(activeTab));

  let presetGroups = $state(PRESET_GROUPS);

  // Station canvas hover is implemented in plain JS and uses this small
  // bridge so it can update the Svelte tooltip without the retired DOM
  // tooltip initializer.
  if (typeof window !== "undefined") {
    window.__SHOW_TOOLTIP__ = showTooltip;
    window.__HIDE_TOOLTIP__ = hideTooltip;
  }

  const syncCleanups = new Map();
  let forecastRefreshTimer = null;

  async function waitForMapStyle(map, timeoutMs = 4000) {
    if (!map) return false;
    const isReady = () => {
      try {
        return Boolean(
          (typeof map.isStyleLoaded === "function" && map.isStyleLoaded()) ||
          map._loaded ||
          (typeof map.loaded === "function" && map.loaded())
        );
      } catch {
        return false;
      }
    };
    if (isReady()) return true;
    if (typeof map.once !== "function") return true;

    return await new Promise((resolve) => {
      let settled = false;
      let timer = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(isReady() || true);
      };
      timer = setTimeout(finish, timeoutMs);
      if (typeof map.once === "function") {
        map.once("load", finish);
        map.once("styledata", finish);
      }
    });
  }

  async function waitForMapInstance(winId, timeoutMs = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const map = getMapInstance(winId);
      if (map) return map;
      await new Promise((r) => setTimeout(r, 50));
    }
    return getMapInstance(winId);
  }

  const unsubConfig = onConfigLoaded((cfg, groups) => {
    presetGroups = [...groups];
  });
  onDestroy(() => {
    unsubConfig();
    if (forecastRefreshTimer) {
      clearInterval(forecastRefreshTimer);
      forecastRefreshTimer = null;
    }
    for (const cleanup of syncCleanups.values()) {
      if (typeof cleanup === "function") cleanup();
    }
    syncCleanups.clear();
  });

  function ensureInitialTab() {
    if (tabsState.tabs.length === 0) {
      const defaultTab = createDefaultTab(1);
      tabsState.tabs = [defaultTab];
      tabsState.activeTabId = 1;
    }
    const tab = tabsState.tabs[0];
    if (tab) {
      const maxUid = (tab.windows || []).reduce((max, w) => Math.max(max, typeof w?.uid === "number" ? w.uid : -1), -1);
      tab._nextWinSeq = Math.max(tab._nextWinSeq || 0, (tab.windows || []).length, maxUid + 1);
      if (!tab.windows || tab.windows.length === 0) {
        tab.windows = [createDefaultWindow(0, tab.id)];
      }
      syncLayersState(tab.windows[tab.activeWinIdx || 0]?.id);
    }
  }

  onMount(async () => {
    ensureInitialTab();
    forecastRefreshTimer = setInterval(() => {
      if (activeWin) refreshForecastTimeline(activeWin, true);
    }, 60 * 1000);
    try {
      const groups = await loadPresetGroups();
      presetGroups = [...groups];
      const cfgProj = CURRENT_CONFIG?.basemap?.projection;
      if (cfgProj) {
        for (const [winId, map] of mapInstances.entries()) {
          if (map && map.__mapProjection !== cfgProj) {
            try { setMapProjection(map, cfgProj); } catch {}
          }
        }
      }
      const cfgScheme = CURRENT_CONFIG?.basemap?.scheme;
      if (cfgScheme) {
        for (const [winId, map] of mapInstances.entries()) {
          if (map && map.__basemapScheme !== cfgScheme) {
            try {
              applyBasemapScheme(map, cfgScheme);
              updateGraticuleScheme(map, cfgScheme);
            } catch {}
          }
        }
      }
    } catch (e) {
      console.error("[App] loadPresetGroups error:", e);
    }
  });

  function getForecastLayer(win) {
    return win?.activeGroup?.layers?.find((layer) =>
      layer.type === "contour" || layer.type === "wind" || layer.type === "lineheight" || layer.type === "hovmoller"
    ) || null;
  }

  async function refreshForecastTimeline(win, forceRefresh = false) {
    if (!win || win.isObservation || !win.activeGroup) return;
    if (shouldHideTimelineForGroup(win.activeGroup)) return;

    const layer = getForecastLayer(win);
    const model = layer?.model || "ECMWF_HR";
    const element = ["VOR", "DIV"].includes(layer?.element) ? "WIND" : (layer?.element || "TMP");
    const refreshSeq = (win._forecastRefreshSeq || 0) + 1;
    win._forecastRefreshSeq = refreshSeq;
    const targetLevel = win.activeGroup?.hasLevel === false ? null : (win.level ?? 500);
    const cycles = await resolveForecastCycles(model, element, targetLevel, forceRefresh);
    if (win._forecastRefreshSeq !== refreshSeq) return;
    if (!cycles.length) return;

    const timeline = getOrCreateTimeline(win.id);
    const previousCycles = timeline.forecastCycles || [];
    const previousCycle = timeline.currentInitCycle || win.forecastCycle;
    const wasFollowingLatest = !previousCycle || !previousCycles.length || previousCycle === previousCycles[0];
    const nextCycle = wasFollowingLatest || !cycles.includes(previousCycle) ? cycles[0] : previousCycle;

    timeline.currentMode = "nwp";
    timeline.forecastCycles = cycles;
    timeline.currentInitCycle = nextCycle;
    const rainHours = getRainAccumulationHoursForWindow(win) ??
      getRainAccumulationHours(win.element) ??
      getRainAccumulationHours(app.element);
    let periodChanged = false;
    if (rainHours !== null && rainHours > 0) {
      timeline.disabledPeriods = getDisabledPeriodsForRain(rainHours, timeline.discretePeriods);
      if (win.period !== undefined && Number(win.period) < rainHours) {
        const firstValid = Array.isArray(timeline.discretePeriods)
          ? timeline.discretePeriods.find((p) => Number(p) >= rainHours)
          : null;
        win.period = firstValid !== undefined && firstValid !== null ? firstValid : rainHours;
        if (win === activeWin) app.period = win.period;
        periodChanged = true;
      }
      if (Array.isArray(timeline.discretePeriods)) {
        const pIdx = timeline.discretePeriods.indexOf(win.period);
        if (pIdx !== -1) timeline.currentPeriodIdx = pIdx;
      }
    } else if (timeline.disabledPeriods && timeline.disabledPeriods.length > 0) {
      timeline.disabledPeriods = [];
    }

    if (win.forecastCycle !== nextCycle || periodChanged) {
      win.forecastCycle = nextCycle;
      if (getMapInstance(win.id) && win === activeWin) {
        if (win.activeGroup) {
          // Timestep reload preserves eye-hidden + custom palette via snapshots;
          // fresh (!isTimeStep) would force everything visible on every auto-refresh.
          const loadSeq = (win.loadSeq || 0) + 1;
          win.loadSeq = loadSeq;
          await loadPresetGroup(getMapInstance(win.id), win.activeGroup, win.period, win.level, win, true, loadSeq);
        }
      }
    }
  }

  function findWindowIndex(windows, win) {
    // Identity-proof lookup by stable window id. Svelte 5 $state wraps
    // objects stored in reactive arrays, so a raw (never-rendered) window
    // reference never matches Array#indexOf (always -1). Freshly created
    // windows in handleAddWindow hit exactly this trap.
    if (!Array.isArray(windows) || !win) return -1;
    if (win.id !== undefined && win.id !== null) {
      const byId = windows.findIndex((w) => w && w.id === win.id);
      if (byId !== -1) return byId;
    }
    return windows.indexOf(win);
  }

  function handleWindowFocus(win) {
    if (!activeTab || !win) return;
    const idx = findWindowIndex(activeTab.windows, win);
    if (idx !== -1) {
      activeTab.activeWinIdx = idx;
    }
    // Keep global navbar selects in sync with the focused window, including
    // null levels for presets without vertical levels.
    app.level = win.level ?? null;
    syncLayersState(win.id);
    syncLegendState(win.id);

    const hasData = Boolean(win.activeGroup);
    ui.timelineVisible = hasData && !shouldHideTimelineForGroup(win.activeGroup);
    // Auto hide/show floating profile panels (T-LogP, Time-Height, Line-Height,
    // Time-Line) so toggling window tabs swaps diagrams instead of sticking.
    try {
      syncProfilePanelsForWindow(win, getMapInstance(win.id));
    } catch {}
    if (hasData && !win.isObservation) refreshForecastTimeline(win, true);
  }

  function handleAddWindow() {
    if (!activeTab) return;
    // Leave the config editor so the newly created tab-win is visible.
    ui.configOpen = false;
    const uid = getNextWindowUid(activeTab);
    const posIdx = activeTab.windows.length;
    const winObj = createDefaultWindow(posIdx, activeTab.id);
    winObj.uid = uid;
    winObj.id = `tab-${activeTab.id}-win-${uid}`;
    winObj.level = (activeTab.autoAllocation === "level") ? (DEFAULT_LEVELS[posIdx] ?? 500) : (activeWin?.level ?? 500);
    if (activeTab.autoAllocation === "model") {
      const eligible = getEligibleModelsForAllocation(activeWin, winObj.level, DEFAULT_MODELS);
      winObj.model = eligible[posIdx % eligible.length];
    }
    clearLayersForWindow(winObj.id);
    deleteWindowTimeline(winObj.id);
    clearProfileState("timeheight", winObj.id);
    clearProfileState("lineheight", winObj.id);
    clearProfileState("hovmoller", winObj.id);
    clearProfileState("tlogp", winObj.id);
    activeTab.windows.push(winObj);
    // The pushed window is stored wrapped by $state: focus it by position
    // id so the new tab-win is always selected, then sync the rest.
    activeTab.activeWinIdx = posIdx;
    handleWindowFocus(winObj);
  }

  function cleanupWindowResources(win) {
    if (!win) return;
    const winId = win.id;
    const map = getMapInstance(winId) || win.map || null;

    // 1. Destroy profile controllers for this window
    try { timeHeightController.destroy(map, win); } catch {}
    try { lineHeightController.destroy(map, win); } catch {}
    try { hovmollerController.destroy(map, win); } catch {}
    let otherHasTlogp = false;
    try {
      const remainingWindows = activeTab?.windows?.filter((w) => w && w.id !== winId && w !== win) || [];
      otherHasTlogp = remainingWindows.some((w) =>
        findVisibleLayer(w, ["tlogp"], ["upperair-tlogp-diagram"])
      );
      if (!otherHasTlogp) {
        tlogpController.activeWin = win;
        tlogpController.destroy(map, win);
      } else if (tlogpController.activeWin?.id === winId) {
        const otherWin = remainingWindows.find((w) => findVisibleLayer(w, ["tlogp"], ["upperair-tlogp-diagram"]));
        tlogpController.activeWin = otherWin || null;
        tlogpController.removeStationHighlight(map || win.map);
      }
    } catch {}

    // 2. Clear layers from layer store
    try { clearLayersForWindow(winId); } catch {}

    // 2b. Release map-bound resources immediately: re-render registrations
    // hold the map plus layer closures (with gridData), wind loops hold rAF
    // + document listeners, raster holds blob URLs, and pending prefetch
    // timers hold the win object. map.remove() alone does not free these.
    try { disarmAllContourReRenders(map, win); } catch {}
    try { if (map) stopWindAnimation(map); } catch {}
    try { if (map) removeGridWindBarbs(map); } catch {}
    try { if (map) removeStationLayer(map); } catch {}
    try { if (map) removeAllRasterLayers(map); } catch {}
    try { deleteWindowLegends(winId); } catch {}
    try { cancelScheduledPrefetch(win); } catch {}
    try {
      if (win._windGridCache instanceof Map) win._windGridCache.clear();
      win.windGridData = null;
      win.gridData = null;
      win.layerSnapshots = null;
      win.derivedContourSnapshots = null;
      win._obsTimeline = null;
      win._obsTimelinePath = null;
      win._nwpTimeline = null;
      win._pendingNwp = null;
      win.prefetchDirections = null;
    } catch {}

    // 3. Clear timeline from timeline store
    try {
      deleteWindowTimeline(winId);
    } catch {}

    // 4. Clear profile state
    try {
      clearProfileState("timeheight", winId);
      clearProfileState("lineheight", winId);
      clearProfileState("hovmoller", winId);
      if (!otherHasTlogp) {
        clearProfileState("tlogp");
      }
    } catch {}

    // 5. Clean map bindings
    try {
      if (syncCleanups.has(winId)) {
        syncCleanups.get(winId)();
        syncCleanups.delete(winId);
      }
      setMapInstance(winId, null);
      win.map = null;
    } catch {}
  }

  function handleCloseWindow(win) {
    if (!activeTab || activeTab.windows.length <= 1) return;
    const idx = findWindowIndex(activeTab.windows, win);
    if (idx !== -1) {
      cleanupWindowResources(win);
      const wasActive = idx === activeTab.activeWinIdx;
      const currentActiveWin = activeTab.windows[activeTab.activeWinIdx];
      activeTab.windows.splice(idx, 1);
      activeTab.windows.forEach((w, i) => {
        w.winIdx = i;
        if (w.title) w.title = String(w.title).replace(/^W\d+:\s*/, "");
        if (w.baseTitle) w.baseTitle = String(w.baseTitle).replace(/^W\d+:\s*/, "");
      });
      if (wasActive) {
        const nextIdx = Math.max(0, Math.min(idx, activeTab.windows.length - 1));
        handleWindowFocus(activeTab.windows[nextIdx]);
      } else {
        activeTab.activeWinIdx = Math.max(0, findWindowIndex(activeTab.windows, currentActiveWin));
      }
      if (activeTab.windows.length <= 1 && activeTab.layout !== "1x1") {
        activeTab.layout = "1x1";
      }
    }
  }

  function handleReorderWindows(fromIndex, toIndex) {
    // toIndex is a post-removal splice index: TabsBar converts its visual
    // insert slot p (before pill p, p == n means append) via
    // to = from < p ? p - 1 : p, so splice(to, 0, moved) lands exactly
    // where the drop indicator pointed.
    if (!activeTab || fromIndex === toIndex) return;
    const windows = activeTab.windows;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= windows.length || toIndex >= windows.length) return;
    const activeWindow = windows[activeTab.activeWinIdx];
    const [moved] = windows.splice(fromIndex, 1);
    windows.splice(toIndex, 0, moved);
    windows.forEach((win, idx) => {
      win.winIdx = idx;
      // Titles store the base name only; the "Wn: " prefix is derived at
      // render time from winIdx. Strip any stale prefix carried from a
      // previous position so tab-title and win-title stay consistent.
      if (win.title) win.title = String(win.title).replace(/^W\d+:\s*/, "");
      if (win.baseTitle) win.baseTitle = String(win.baseTitle).replace(/^W\d+:\s*/, "");
    });
    activeTab.activeWinIdx = Math.max(0, findWindowIndex(windows, activeWindow));
  }

  function toggleTabsAndSplit() {
    if (!activeTab) return;
    const newLayout = activeTab.layout === "1x1" ? (activeTab._lastSplitLayout || "2x2") : "1x1";
    if (activeTab.layout !== "1x1") {
      activeTab._lastSplitLayout = activeTab.layout;
    }
    handleChangeLayout(newLayout);
  }

  async function handleChangeLayout(layout) {
    if (!activeTab) return;
    const prevLayout = activeTab.layout;
    activeTab.layout = layout;
    const numNeeded = getNumVisible(layout);
    const prevNumNeeded = getNumVisible(prevLayout);
    const isSplit = layout !== "1x1";
    const wasTab = prevLayout === "1x1";

    const baseWin = (activeWin && activeWin.activeGroup)
      ? activeWin
      : (activeTab.windows.find((w) => w && w.activeGroup) || activeWin || activeTab.windows[0]);

    if (isProfilePanelWindow(baseWin)) {
      activeTab.autoAllocation = "none";
    } else if (isSurfaceWindow(baseWin) && (activeTab.autoAllocation === "step" || activeTab.autoAllocation === "level" || activeTab.autoAllocation === "model")) {
      activeTab.autoAllocation = "none";
    } else if (isUpperAirWindow(baseWin) && (activeTab.autoAllocation === "step" || activeTab.autoAllocation === "model")) {
      activeTab.autoAllocation = "none";
    }

    if (!isSplit || activeTab.autoAllocation === "none") {
      // Prior logic: load already-existed tab-windows
      while (activeTab.windows.length < numNeeded) {
        const uid = getNextWindowUid(activeTab);
        const posIdx = activeTab.windows.length;
        const winObj = createDefaultWindow(posIdx, activeTab.id);
        winObj.uid = uid;
        winObj.id = `tab-${activeTab.id}-win-${uid}`;
        activeTab.windows.push(winObj);
        syncLayersState(winObj.id);
      }
      if (wasTab && isSplit) {
        setTimeout(async () => {
          const visible = getVisibleWindows(activeTab);
          for (const w of visible) {
            let map = getMapInstance(w.id);
            if (!map) map = await waitForMapInstance(w.id, 2000);
            if (map) {
              if (typeof map.resize === "function") {
                try { map.resize(); } catch {}
              }
              if (w.activeGroup && (!w.layers || w.layers.length === 0)) {
                const loadSeq = (w.loadSeq || 0) + 1;
                w.loadSeq = loadSeq;
                await loadPresetGroup(map, w.activeGroup, w.period, w.level, w, false, loadSeq).catch(console.error);
                syncLayersState(w.id);
                syncLegendState(w.id);
              }
            }
          }
        }, 60);
      }
    } else {
      // Other alloc mode (level, model, step, time):
      // Don't add/clear layers to exist tab-win with layers: only add to empty tab-win or create new tab-win.
      prepareSplitWindows(activeTab, numNeeded, baseWin, (w) => isWindowEmpty(w, getLayersForWindow), wasTab, prevNumNeeded);
      for (const w of activeTab.windows) {
        syncLayersState(w.id);
      }
      await applyAutoAllocationModeToTab(activeTab, activeTab.autoAllocation);
    }

    if (isSplit && activeTab.syncMap !== false) {
      setTimeout(() => {
        syncTabCameras(activeTab, { getMap: (id) => getMapInstance(id) });
      }, 80);
    }
  }

  function handleToggleSync() {
    if (!activeTab) return;
    activeTab.syncMap = activeTab.syncMap === false ? true : false;
    if (activeTab.syncMap) {
      syncTabCameras(activeTab, { getMap: (id) => getMapInstance(id) });
    }
  }

  async function applyAutoAllocationModeToTab(tab, mode) {
    if (!tab) return;
    const allocSeq = (tab._allocSeq || 0) + 1;
    tab._allocSeq = allocSeq;
    tab.autoAllocation = mode;
    const baseWin = (activeWin && activeWin.activeGroup) ? activeWin : (tab.windows.find((w) => w && w.activeGroup) || activeWin || tab.windows[0]);

    if (isProfilePanelWindow(baseWin)) {
      tab.autoAllocation = "none";
      return;
    }
    const isSurf = isSurfaceWindow(baseWin);
    const isUp = isUpperAirWindow(baseWin);
    if (isSurf && (mode === "step" || mode === "level" || mode === "model")) {
      tab.autoAllocation = "none";
      return;
    }
    if (isUp && (mode === "step" || mode === "model")) {
      tab.autoAllocation = "none";
      return;
    }

    if (baseWin) {
      const tl = getOrCreateTimeline(baseWin.id);
      if (tl) {
        if (tl.currentStepLength) {
          baseWin.stepLength = tl.currentStepLength;
        }
        if (Array.isArray(tl.discretePeriods) && tl.discretePeriods.length > 0) {
          baseWin.discretePeriods = [...tl.discretePeriods];
        }
        if (!baseWin.forecastCycles && Array.isArray(tl.forecastCycles) && tl.forecastCycles.length > 0) {
          baseWin.forecastCycles = tl.forecastCycles;
        }
        if (tl.currentInitCycle && !baseWin.forecastCycle) {
          baseWin.forecastCycle = tl.currentInitCycle;
        }
        if (tl.currentPeriodIdx !== undefined && tl.discretePeriods?.[tl.currentPeriodIdx] !== undefined) {
          if (baseWin.period === undefined || baseWin.period === null || !tl.discretePeriods.includes(baseWin.period)) {
            baseWin.period = tl.discretePeriods[tl.currentPeriodIdx];
          }
        }
        if (!baseWin.obsTime && tl.obsFiles && tl.currentObsIdx !== undefined && tl.obsFiles[tl.currentObsIdx]) {
          baseWin.obsTime = tl.obsFiles[tl.currentObsIdx];
        }
      }
    }
    const prevBaseState = baseWin ? {
      level: baseWin.level,
      model: baseWin.model,
      period: baseWin.period,
      forecastCycle: baseWin.forecastCycle,
      obsTime: baseWin.obsTime,
      groupId: baseWin.activeGroup?.id,
    } : null;

    if (mode === "model") {
      const layers = (baseWin?.activeGroup?.layers && baseWin.activeGroup.layers.length > 0)
        ? baseWin.activeGroup.layers
        : (baseWin?.layers || []);
      const elements = layers.map((l) => l.element || (l.type === "wind" ? "WIND" : null)).filter(Boolean);
      await preloadModelLevels(DEFAULT_MODELS, elements.length > 0 ? elements : ["RH", "HGT", "WIND", "TMP"]);
    }
    applyAutoAllocation(tab, mode, baseWin);
    const visible = getVisibleWindows(tab);
    for (let i = 0; i < visible.length; i++) {
      updateWindowTitle(visible[i]);
    }

    await new Promise((r) => setTimeout(r, 60));

    const loadTasks = visible.map(async (w, i) => {
      let map = getMapInstance(w.id);
      if (!map) {
        map = await waitForMapInstance(w.id, 2500);
      }
      if (!map) {
        console.warn(`[AutoAlloc] Map instance not ready for window ${w.id}`);
        return;
      }
      if (typeof map.resize === "function") {
        try { map.resize(); } catch {}
      }
      await waitForMapStyle(map, 2500);
      if (typeof map.resize === "function") {
        try { map.resize(); } catch {}
      }

      const isInitial = isWindowEmpty(w, getLayersForWindow);

      const shouldSkipMapReload = Boolean(!isInitial && shouldSkipWindowReload(w, baseWin, prevBaseState, mode));
      // Bump the stale-guard sequence only for windows that will actually
      // reload: a skipped baseWin must not invalidate the in-flight load of
      // a previous fan-out that already cleared its map, or the map is left
      // blank with no restore following.
      let loadSeq = w.loadSeq || 0;
      if (!shouldSkipMapReload) {
        loadSeq += 1;
        w.loadSeq = loadSeq;
      }

      if (mode === "level") {
        if (w.activeGroup && w.activeGroup.hasLevel !== false) {
          const groupCopy = JSON.parse(JSON.stringify(w.activeGroup));
          groupCopy.defaultLevel = w.level;
          if (Array.isArray(groupCopy.layers)) {
            for (const l of groupCopy.layers) {
              if (l.model === "UPPER_AIR" || l.type === "contour" || l.type === "wind" || l.type === "station") {
                if (l.model !== "SURFACE" && l.level !== 0) {
                  l.level = w.level;
                }
              }
            }
          }
          w.activeGroup = groupCopy;
          if (!shouldSkipMapReload) {
            await loadPresetGroup(map, groupCopy, w.period, w.level, w, false, loadSeq).catch((e) =>
              console.error("[AutoAlloc] level failed:", e)
            );
          }
        }
      } else if (mode === "model") {
        if (w.activeGroup) {
          const groupCopy = JSON.parse(JSON.stringify(w.activeGroup));
          if (Array.isArray(groupCopy.layers)) {
            for (const l of groupCopy.layers) {
              if (l.type === "contour" || l.type === "wind" || l.type === "raster") {
                l.model = w.model;
                if (typeof l.path === "string" && l.path.includes("/")) {
                  l.path = l.path.replace(/^[^\/]+/, w.model);
                }
              }
            }
          }
          w.activeGroup = groupCopy;
          if (!shouldSkipMapReload) {
            await loadPresetGroup(map, groupCopy, w.period, w.level, w, false, loadSeq).catch((e) =>
              console.error("[AutoAlloc] model failed:", e)
            );
          }
        }
      } else if (mode === "step") {
        const tl = getOrCreateTimeline(w.id);
        if (w.isObservation) {
          // NOTE: no wind/barb/raster teardown here. The fresh load below
          // clears internally, and a skipped reload (shouldSkipMapReload)
          // must not wipe visuals it never restores (unintended hide).
          if (baseWin?._obsTimeline) {
            w._obsTimeline = { ...baseWin._obsTimeline, file: w.obsTime, stepLength: w.stepLength };
          }
          const baseTl = baseWin ? getOrCreateTimeline(baseWin.id) : null;
          if (baseTl && tl) {
            tl.currentMode = "obs";
            tl.currentStepLength = w.stepLength || baseTl.currentStepLength;
            tl.isUpperAirMode = baseTl.isUpperAirMode;
            tl.currentWinTitle = baseTl.currentWinTitle;
            if (baseTl.rawObsFiles) tl.rawObsFiles = [...baseTl.rawObsFiles];
            if (baseTl.obsFiles) tl.obsFiles = [...baseTl.obsFiles];
            if (tl.obsFiles && w.obsTime) {
              const idx = tl.obsFiles.indexOf(w.obsTime);
              if (idx !== -1) tl.currentObsIdx = idx;
            }
          }
          if (w.activeGroup && !shouldSkipMapReload) {
            await loadPresetGroup(map, w.activeGroup, w.period, w.level, w, false, loadSeq).catch((e) =>
              console.error("[AutoAlloc] obs step failed:", e)
            );
          }
        } else {
          if (tl) {
            tl.currentMode = "nwp";
            const cycle = w.forecastCycle || baseWin?.forecastCycle;
            if (cycle) tl.currentInitCycle = cycle;
            const fCycles = w.forecastCycles || baseWin?.forecastCycles;
            if (fCycles) tl.forecastCycles = [...fCycles];
            if (w.stepLength) tl.currentStepLength = w.stepLength;
            if (w.discretePeriods) tl.discretePeriods = [...w.discretePeriods];
            if (Array.isArray(tl.discretePeriods)) {
              const idx = tl.discretePeriods.indexOf(w.period);
              if (idx !== -1) tl.currentPeriodIdx = idx;
            }
          }
          if (baseWin?._nwpTimeline || w._nwpTimeline) {
            w._nwpTimeline = { ...(baseWin?._nwpTimeline || {}), ...w._nwpTimeline, stepLength: w.stepLength, cycle: w.forecastCycle };
          }
          if (w.activeGroup && !shouldSkipMapReload) {
            await loadPresetGroup(map, w.activeGroup, w.period, w.level, w, false, loadSeq).catch((e) =>
              console.error("[AutoAlloc] step failed:", e)
            );
          }
        }
      } else if (mode === "time") {
        const tl = getOrCreateTimeline(w.id);
        if (w.isObservation) {
          // Same no-teardown rule as the step branch above: a skipped baseWin
          // reload must leave its map (e.g. DTD raster) untouched.
          if (baseWin?._obsTimeline) {
            w._obsTimeline = { ...baseWin._obsTimeline, file: w.obsTime, stepLength: w.stepLength };
          }
          const baseTl = baseWin ? getOrCreateTimeline(baseWin.id) : null;
          if (baseTl && tl) {
            tl.currentMode = "obs";
            tl.currentStepLength = w.stepLength || baseTl.currentStepLength;
            tl.isUpperAirMode = baseTl.isUpperAirMode;
            tl.currentWinTitle = baseTl.currentWinTitle;
            if (baseTl.rawObsFiles) tl.rawObsFiles = [...baseTl.rawObsFiles];
            if (baseTl.obsFiles) tl.obsFiles = [...baseTl.obsFiles];
            if (tl.obsFiles && w.obsTime) {
              const idx = tl.obsFiles.indexOf(w.obsTime);
              if (idx !== -1) tl.currentObsIdx = idx;
            }
          }
          if (w.activeGroup && !shouldSkipMapReload) {
            await loadPresetGroup(map, w.activeGroup, w.period, w.level, w, false, loadSeq).catch((e) =>
              console.error("[AutoAlloc] obs time failed:", e)
            );
          }
        } else {
          if (tl) {
            tl.currentMode = "nwp";
            if (w.forecastCycle) tl.currentInitCycle = w.forecastCycle;
            if (w.stepLength) tl.currentStepLength = w.stepLength;
            if (w.discretePeriods) tl.discretePeriods = [...w.discretePeriods];
            if (w.forecastCycles) tl.forecastCycles = [...w.forecastCycles];
            if (Array.isArray(tl.discretePeriods)) {
              const idx = tl.discretePeriods.indexOf(w.period);
              if (idx !== -1) tl.currentPeriodIdx = idx;
            }
          }
          if (w.activeGroup && !shouldSkipMapReload) {
            await loadPresetGroup(map, w.activeGroup, w.period, w.level, w, false, loadSeq).catch((e) =>
              console.error("[AutoAlloc] nwp time failed:", e)
            );
          }
        }
      } else if (mode === "none") {
        if (w.activeGroup) {
          await loadPresetGroup(map, w.activeGroup, w.period, w.level, w, false, loadSeq).catch((e) =>
            console.error("[AutoAlloc] none revert failed:", e)
          );
        }
      }
    });

    if (loadTasks.length > 0) {
      await Promise.allSettled(loadTasks);
    }
    if (tab._allocSeq !== allocSeq) return;
    for (let i = 0; i < visible.length; i++) {
      updateWindowTitle(visible[i]);
      syncLayersState(visible[i].id);
      syncLegendState(visible[i].id);
    }
  }

  async function handleSelectAutoAlloc(mode) {
    if (!activeTab) return;
    if (isProfilePanelWindow(activeWin)) {
      activeTab.autoAllocation = "none";
      return;
    }
    const isSurf = isSurfaceWindow(activeWin);
    const isUp = isUpperAirWindow(activeWin);
    if (isSurf && (mode === "step" || mode === "level" || mode === "model")) {
      activeTab.autoAllocation = "none";
      return;
    }
    if (isUp && (mode === "step" || mode === "model")) {
      activeTab.autoAllocation = "none";
      return;
    }
    activeTab.autoAllocation = mode;
    if (activeTab.layout !== "1x1") {
      await applyAutoAllocationModeToTab(activeTab, mode);
    }
  }

  async function handleToggleAutoAlloc(modeOrState) {
    if (!activeTab) return;
    if (isProfilePanelWindow(activeWin)) {
      activeTab.autoAllocation = "none";
      return;
    }
    const isSurf = isSurfaceWindow(activeWin);
    const isUp = isUpperAirWindow(activeWin);
    const defaultMode = isSurf ? "time" : "level";
    const mode = typeof modeOrState === "string" ? modeOrState : (activeTab.autoAllocation === "none" ? defaultMode : "none");
    if (isSurf && (mode === "step" || mode === "level" || mode === "model")) {
      activeTab.autoAllocation = "none";
      return;
    }
    if (isUp && (mode === "step" || mode === "model")) {
      activeTab.autoAllocation = "none";
      return;
    }
    await handleSelectAutoAlloc(mode);
  }

  async function handleLoadData(group, overrideLevel = null, targetWin = activeWin) {
    const win = targetWin;
    if (!win || !group) {
      console.warn("[App] Load Data skipped: missing window or group");
      return;
    }
    win.isAutoAllocated = false;
    win.allocParentId = null;
    win.allocMode = null;
    console.log(`[App] Load Data: group=${group.id} overrideLevel=${overrideLevel} win=${win.id} period=${win.period}`);
    const map = getMapInstance(win.id);
    if (!map) {
      console.warn(`[App] Load Data skipped: map not ready for window ${win.id}`);
      showToast("error", "Map not ready — please retry Load Data in a moment.");
      return;
    }
    if (!(await waitForMapStyle(map))) {
      console.warn(`[App] Load Data skipped: map style did not finish loading for window ${win.id}`);
      showToast("error", "Map is still loading — please retry Load Data in a moment.");
      return;
    }
    const loadSeq = (win.loadSeq || 0) + 1;
    win.loadSeq = loadSeq;
    win._forecastRefreshSeq = (win._forecastRefreshSeq || 0) + 1;
    const previousGroupId = win.activeGroup?.id;
    applyPresetToWindow(win, group, overrideLevel);
    const groupCopy = win.activeGroup;
    if (!groupCopy || !Array.isArray(groupCopy.layers)) {
      console.error("[App] Load Data aborted: activeGroup has no layers", groupCopy);
      showToast("error", "Load Data failed: preset has no layers.");
      return;
    }
    ui.timelineVisible = !shouldHideTimelineForGroup(groupCopy);
    if (isProfilePanelGroup(groupCopy) && activeTab) {
      activeTab.autoAllocation = "none";
    }
    if (activeTab && activeTab.autoAllocation && activeTab.autoAllocation !== "none") {
      const curMode = activeTab.autoAllocation;
      if (isSurfaceGroup(groupCopy) && (curMode === "step" || curMode === "level" || curMode === "model")) {
        activeTab.autoAllocation = "none";
      } else if (isUpperAirGroup(groupCopy) && (curMode === "step" || curMode === "model")) {
        activeTab.autoAllocation = "none";
      }
    }

    const effectiveLevel = overrideLevel || win.level || groupCopy.defaultLevel || 500;
    const isSpecialProfile = shouldHideTimelineForGroup(groupCopy);

    if (win.isObservation) {
      // Clear stale obs state so loadPresetGroup per-layer sync lands on latest
      // (single source of truth, per-layer path, bypassCache). Do NOT pre-sync
      // here with a generic path — it would set _obsTimeline and prevent
      // forceLatest detection inside the loader, or downgrade via stale cache.
      win.obsTime = null;
      win._obsTimeline = null;
      win._obsTimelinePath = null;
      // v1.1.0 step defaults: upper-air/TLOGP 12h (08:00/20:00), surface 3h.
      // Coerce BEFORE the loader syncs so its 08:00/20:00 filter and latest
      // target use a valid step (a stale 3h carried from surface would admit
      // 02:00/14:00 soundings and desync map vs chips).
      const isUpperLoad =
        /upper|tlogp/i.test(groupCopy.id || "") ||
        (Array.isArray(groupCopy.layers) && groupCopy.layers.some((l) =>
          l?.model === "UPPER_AIR" || String(l?.path || "").includes("TLOGP") || l?.element === "TLOGP"));
      const defaultStep = isUpperLoad ? 12 : 3;
      const validSteps = isUpperLoad ? [12, 24, 6] : [1, 3, 6, 12, 24];
      let coercedStep = parseInt(win.stepLength, 10);
      if (!validSteps.includes(coercedStep)) coercedStep = defaultStep;
      if (previousGroupId !== groupCopy.id) coercedStep = defaultStep;
      win.stepLength = coercedStep;
      const tl = getOrCreateTimeline(win.id);
      tl.currentMode = "obs";
      tl.currentStepLength = coercedStep;
      tl.isUpperAirMode = isUpperLoad;
    } else if (!isSpecialProfile) {
      const pLayer = groupCopy.layers?.find((l) => l.type === "contour" || l.type === "wind");
      const targetLevel = groupCopy.hasLevel === false ? null : (win.level || 500);
      const cycles = await resolveForecastCycles(pLayer?.model || "ECMWF_HR", pLayer?.element || "TMP", targetLevel, true);
      win.forecastCycle = cycles[0];
      const tl = getOrCreateTimeline(win.id);
      tl.currentMode = "nwp";
      tl.forecastCycles = cycles;
      tl.currentInitCycle = cycles[0];
      // v1.1.0 setTimelineMode(nwp): init step + rebuild periods from it so
      // the step select and chips always have coherent init values.
      let nwpStep = parseInt(win.stepLength, 10);
      if (![1, 3, 6, 12, 24].includes(nwpStep) || previousGroupId !== groupCopy.id) nwpStep = 6;
      win.stepLength = nwpStep;
      tl.currentStepLength = nwpStep;
      tl.discretePeriods = getPeriodsForStep(nwpStep);
      const pIdx = tl.discretePeriods.indexOf(win.period ?? 24);
      tl.currentPeriodIdx = pIdx !== -1 ? pIdx : Math.min(4, tl.discretePeriods.length - 1);
      const rainHours = getRainAccumulationHoursForWindow(win) ??
        getRainAccumulationHours(groupCopy?.id) ??
        getRainAccumulationHours(groupCopy?.name) ??
        getRainAccumulationHours(win.element);
      if (rainHours !== null && rainHours > 0) {
        tl.disabledPeriods = getDisabledPeriodsForRain(rainHours, tl.discretePeriods);
        if (win.period !== undefined && Number(win.period) < rainHours) {
          const firstValid = Array.isArray(tl.discretePeriods)
            ? tl.discretePeriods.find((p) => Number(p) >= rainHours)
            : null;
          win.period = firstValid !== undefined && firstValid !== null ? firstValid : rainHours;
          if (win === activeWin) app.period = win.period;
        }
        const pIdx = tl.discretePeriods.indexOf(win.period);
        if (pIdx !== -1) tl.currentPeriodIdx = pIdx;
      } else if (tl.disabledPeriods && tl.disabledPeriods.length > 0) {
        tl.disabledPeriods = [];
      }
    }

    try {
      const targetLevel = groupCopy.hasLevel === false ? null : overrideLevel;
      await loadPresetGroup(map, groupCopy, win.period, targetLevel, win, false, loadSeq);
    } catch (err) {
      console.error("[App] Load Data failed:", err);
      showToast("error", `Load Data failed: ${err?.message || err}`);
    }
    // Bridge loader's legacy timeline (win._obsTimeline) into the Svelte
    // per-window store the TimeSlider actually renders. Without this the
    // obs chips stay empty/stale for surface + upper-air loads.
    // v1.1.0: step already coerced above (upper 12h 08:00/20:00, surface 3h);
    // re-validate here in case the loader ran from another entry point.
    if (win.isObservation && win._obsTimeline) {
      try {
        const t = win._obsTimeline;
        const tl = getOrCreateTimeline(win.id);
        tl.currentMode = "obs";
        tl.isUpperAirMode = Boolean(t.isUpper);
        const defaultStep = tl.isUpperAirMode ? 12 : 3;
        const validSteps = tl.isUpperAirMode ? [12, 24, 6] : [1, 3, 6, 12, 24];
        let step = parseInt(win.stepLength, 10);
        if (!validSteps.includes(step)) step = parseInt(t.stepLength, 10);
        if (!validSteps.includes(step)) step = defaultStep;
        if (previousGroupId !== groupCopy.id) step = defaultStep;
        win.stepLength = step;
        tl.currentStepLength = step;
        if (win._obsTimeline) win._obsTimeline.stepLength = step;
        tl.currentWinTitle = t.winTitle || "";
        if (Array.isArray(t.files) && t.files.length > 0) {
          tl.rawObsFiles = [...t.files];
          const filtered = filterObsFilesByStep(tl.rawObsFiles, tl.currentStepLength, tl.isUpperAirMode);
          const chips = selectObsChipsWindow(filtered, t.file);
          tl.obsFiles = chips.length > 0 ? chips : filtered;
          const idx = t.file ? tl.obsFiles.indexOf(t.file) : -1;
          tl.currentObsIdx = idx !== -1 ? idx : Math.max(0, tl.obsFiles.length - 1);
          const latest = tl.obsFiles[tl.currentObsIdx];
          if (latest && win.obsTime !== latest) win.obsTime = latest;
          if (latest && win._obsTimeline) win._obsTimeline.file = latest;
        }
      } catch (e) {
        console.warn("[App] Obs timeline bridge failed:", e);
      }
    }
    syncLayersState(win.id);
    syncLegendState(win.id);
    if (activeTab?.autoAllocation && activeTab.autoAllocation !== "none" && activeTab.layout !== "1x1" && win === activeWin) {
      await applyAutoAllocationModeToTab(activeTab, activeTab.autoAllocation);
    }
  }

  async function handleTimeChange(payload) {
    if (!payload) return;

    if (activeTab?.layout !== "1x1" && activeTab?.autoAllocation === "step" && !payload.isObs) {
      const sweepGen = beginSharedSweep(activeTab);
      const visible = getVisibleWindows(activeTab);
      const win0 = visible[0] || activeWin;
      const tl0 = win0 ? getOrCreateTimeline(win0.id) : null;
      const stepLen = payload.stepLength || win0?.stepLength || tl0?.currentStepLength || 6;
      const periods = getPeriodsForStep(stepLen);
      const baseCycle = payload.cycle || win0?.forecastCycle;

      const targetWin = (payload.winId ? getWindowById(payload.winId) : activeWin) || win0;
      const targetPos = Math.max(0, visible.indexOf(targetWin));
      let targetPeriod = payload.period !== undefined ? payload.period : (targetWin.period ?? 24);
      let targetIdx = Array.isArray(periods) ? periods.indexOf(targetPeriod) : -1;
      if (targetIdx === -1 && Array.isArray(periods) && periods.length > 0) {
        let minDiff = Infinity;
        periods.forEach((p, idx) => {
          const diff = Math.abs(p - targetPeriod);
          if (diff < minDiff) { minDiff = diff; targetIdx = idx; }
        });
      }
      const rainHours0 = getRainAccumulationHoursForWindow(win0) ?? getRainAccumulationHours(win0?.element);
      const minValidIdx = (rainHours0 !== null && rainHours0 > 0 && Array.isArray(periods))
        ? periods.findIndex((p) => Number(p) >= rainHours0)
        : 0;
      const startIdx = Math.max(minValidIdx !== -1 ? minValidIdx : 0, (targetIdx !== -1 ? targetIdx : 0) - targetPos);

      for (let i = 0; i < visible.length; i++) {
        // Superseded by a newer shared sweep (rapid ←/→): stop issuing
        // loads. The newer sweep covers every visible window, so bailing
        // here can never leave one behind — it just drops wasted work.
        if (!sharedSweepAlive(activeTab, sweepGen)) return;
        const win = visible[i];
        const loadSeq = (win.loadSeq || 0) + 1;
        win.loadSeq = loadSeq;
        win.prefetchDirections = payload.prefetchDirections || payload.directions || null;

        if (baseCycle) {
          win.forecastCycle = baseCycle;
        }
        win.stepLength = stepLen;
        win.discretePeriods = periods;

        let periodForWin;
        const pIdx = startIdx + i;
        if (Array.isArray(periods) && pIdx < periods.length) {
          periodForWin = periods[pIdx];
        } else {
          const lastP = (periods && periods.length > 0 ? periods[periods.length - 1] : 0);
          periodForWin = lastP + (pIdx - (periods ? periods.length - 1 : 0)) * stepLen;
        }
        win.period = periodForWin;

        const tl = getOrCreateTimeline(win.id);
        if (tl) {
          tl.currentStepLength = stepLen;
          tl.discretePeriods = periods;
          const rainHours = getRainAccumulationHoursForWindow(win) ?? getRainAccumulationHours(win.element);
          if (rainHours !== null && rainHours > 0) {
            tl.disabledPeriods = getDisabledPeriodsForRain(rainHours, tl.discretePeriods);
          } else if (tl.disabledPeriods && tl.disabledPeriods.length > 0) {
            tl.disabledPeriods = [];
          }
          const idx = periods.indexOf(periodForWin);
          if (idx !== -1) tl.currentPeriodIdx = idx;
          if (baseCycle) tl.currentInitCycle = baseCycle;
        }

        if (win === activeWin) {
          app.period = periodForWin;
          if (baseCycle) app.cycle = baseCycle;
        }

        updateWindowTitle(win);
        const map = getMapInstance(win.id);
        if (map && win.activeGroup) {
          await loadPresetGroup(map, win.activeGroup, win.period, win.level, win, true, loadSeq);
        }
        syncLayersState(win.id);
        syncLegendState(win.id);
      }
      if (Array.isArray(activeTab.windows)) {
        for (const w of activeTab.windows) {
          if (!visible.includes(w)) {
            w.stepLength = stepLen;
            w.discretePeriods = [...periods];
            if (w._nwpTimeline) w._nwpTimeline.stepLength = stepLen;
            const tl = timelinesByWindow[w.id];
            if (tl) {
              tl.currentStepLength = stepLen;
              tl.discretePeriods = [...periods];
            }
          }
        }
      }
      return;
    }

    if (activeTab?.layout !== "1x1" && activeTab?.autoAllocation === "time" && !payload.isObs) {
      const sweepGen = beginSharedSweep(activeTab);
      const visible = getVisibleWindows(activeTab);
      const win0 = visible[0] || activeWin;
      const targetWin = (payload.winId ? getWindowById(payload.winId) : activeWin) || win0;
      const baseCycle = payload.cycle || win0?.forecastCycle;
      let targetPeriod = payload.period !== undefined ? payload.period : (targetWin?.period ?? 24);

      const parseCycleEpoch = (str) => {
        const clean = String(str || "").replace(/[^\d]/g, "").slice(0, 10);
        if (clean.length < 8) return NaN;
        const y = clean.length === 8 ? parseInt(`20${clean.slice(0, 2)}`, 10) : parseInt(clean.slice(0, 4), 10);
        const m = (clean.length === 8 ? parseInt(clean.slice(2, 4), 10) : parseInt(clean.slice(4, 6), 10)) - 1;
        const d = clean.length === 8 ? parseInt(clean.slice(4, 6), 10) : parseInt(clean.slice(6, 8), 10);
        const h = clean.length === 8 ? parseInt(clean.slice(6, 8), 10) : parseInt(clean.slice(8, 10), 10);
        return Date.UTC(y, m, d, h);
      };

      const t0 = parseCycleEpoch(baseCycle);
      const tTarget = parseCycleEpoch(targetWin?.forecastCycle || payload.cycle);
      const deltaH = (!isNaN(t0) && !isNaN(tTarget)) ? Math.round((t0 - tTarget) / 3600000) : 0;
      const basePeriod = targetPeriod - deltaH;
      const stepLen = payload.stepLength || win0?.stepLength || 6;
      if (baseCycle) win0.forecastCycle = baseCycle;
      win0.period = basePeriod;
      applyAutoAllocation(activeTab, "time", win0);

      for (let i = 0; i < visible.length; i++) {
        if (!sharedSweepAlive(activeTab, sweepGen)) return;
        const win = visible[i];
        const map = getMapInstance(win.id);
        if (!map) continue;
        const loadSeq = (win.loadSeq || 0) + 1;
        win.loadSeq = loadSeq;
        win.prefetchDirections = payload.prefetchDirections || payload.directions || null;

        const tl = getOrCreateTimeline(win.id);
        if (tl) {
          tl.currentMode = "nwp";
          if (win.forecastCycle) tl.currentInitCycle = win.forecastCycle;
          if (win.stepLength) tl.currentStepLength = win.stepLength;
          if (win.discretePeriods) tl.discretePeriods = [...win.discretePeriods];
          if (win.forecastCycles) tl.forecastCycles = [...win.forecastCycles];
          const rainHours = getRainAccumulationHoursForWindow(win) ?? getRainAccumulationHours(win.element);
          if (rainHours !== null && rainHours > 0) {
            tl.disabledPeriods = getDisabledPeriodsForRain(rainHours, tl.discretePeriods);
          } else if (tl.disabledPeriods && tl.disabledPeriods.length > 0) {
            tl.disabledPeriods = [];
          }
          if (Array.isArray(tl.discretePeriods)) {
            const idx = tl.discretePeriods.indexOf(win.period);
            if (idx !== -1) tl.currentPeriodIdx = idx;
          }
        }

        if (win === activeWin) {
          app.period = win.period;
          if (win.forecastCycle) app.cycle = win.forecastCycle;
        }

        updateWindowTitle(win);
        if (win.activeGroup) {
          await loadPresetGroup(map, win.activeGroup, win.period, win.level, win, true, loadSeq);
        }
        syncLayersState(win.id);
        syncLegendState(win.id);
      }
      return;
    }

    if (activeTab?.layout !== "1x1" && (activeTab?.autoAllocation === "step" || activeTab?.autoAllocation === "time") && payload.isObs) {
      const sweepGen = beginSharedSweep(activeTab);
      const visible = getVisibleWindows(activeTab);
      const win0 = visible[0] || activeWin;
      const tl0 = win0 ? getOrCreateTimeline(win0.id) : null;
      const stepLen = payload.stepLength || win0?.stepLength || tl0?.currentStepLength || 12;
      const targetWin = (payload.winId ? getWindowById(payload.winId) : activeWin) || win0;
      const targetPos = Math.max(0, visible.indexOf(targetWin));
      const targetFile = payload.file || targetWin?.obsTime || win0?.obsTime;
      const baseFile = stepCycleHours(targetFile, targetPos * stepLen);

      for (let i = 0; i < visible.length; i++) {
        if (!sharedSweepAlive(activeTab, sweepGen)) return;
        const win = visible[i];
        const map = getMapInstance(win.id);
        if (!map) continue;
        const loadSeq = (win.loadSeq || 0) + 1;
        win.loadSeq = loadSeq;
        win.prefetchDirections = payload.prefetchDirections || payload.directions || null;

        const stepped = stepCycleHours(baseFile, -i * stepLen);
        win.obsTime = (typeof baseFile === "string" && baseFile.endsWith(".000") && !stepped.endsWith(".000"))
          ? `${stepped}.000`
          : stepped;
        win.stepLength = stepLen;
        if (win._obsTimeline) {
          win._obsTimeline.file = win.obsTime;
          win._obsTimeline.stepLength = stepLen;
        }
        const tl = getOrCreateTimeline(win.id);
        if (tl) {
          tl.currentStepLength = stepLen;
          if (Array.isArray(tl.obsFiles)) {
            const idx = tl.obsFiles.indexOf(win.obsTime);
            if (idx !== -1) tl.currentObsIdx = idx;
          }
        }
        updateWindowTitle(win);
        if (win.activeGroup) {
          await loadPresetGroup(map, win.activeGroup, win.period, win.level, win, true, loadSeq);
        }
        syncLayersState(win.id);
        syncLegendState(win.id);
      }
      return;
    }

    const isShared = activeTab?.layout !== "1x1" &&
      (activeTab?.autoAllocation === "level" || activeTab?.autoAllocation === "model");

    const targets = isShared
      ? getVisibleWindows(activeTab)
      : (payload?.winId ? [getWindowById(payload.winId)].filter(Boolean) : (activeWin ? [activeWin] : []));
    const sweepGen = isShared ? beginSharedSweep(activeTab) : 0;

    for (const win of targets) {
      if (!sharedSweepAlive(activeTab, sweepGen)) return;
      const map = getMapInstance(win.id);
      const loadSeq = (win.loadSeq || 0) + 1;
      win.loadSeq = loadSeq;
      win.prefetchDirections = payload.prefetchDirections || payload.directions || null;

      if (payload.cursorTime !== undefined && payload.cursorTime !== null) {
        win.wallClockCursor = payload.cursorTime;
        const tl = getOrCreateTimeline(win.id);
        if (tl) tl.wallClockCursor = payload.cursorTime;

        if (win.activeGroup?.isObservation || win._obsTimeline) {
          const obsFiles = win._obsTimeline?.files || tl?.rawObsFiles || [];
          if (obsFiles.length > 0) {
            const matched = resolveLayerTime({ sampleTimes: obsFiles, policy: "latest-at" }, payload.cursorTime);
            if (matched?.sampleFile) {
              win.obsTime = matched.sampleFile;
              if (win._obsTimeline) win._obsTimeline.file = matched.sampleFile;
              updateWindowTitle(win);
            }
          }
        }
      }

      if (payload.isObs) {
        win.obsTime = payload.file;
        if (!payload.cursorTime && payload.file) {
          const ts = parseTimestamp(payload.file);
          if (ts) {
            win.wallClockCursor = ts;
            const tl = getOrCreateTimeline(win.id);
            if (tl) tl.wallClockCursor = ts;
          }
        }
        if (win._obsTimeline) win._obsTimeline.file = payload.file;
        if (payload.stepLength) {
          win.stepLength = payload.stepLength;
          if (win._obsTimeline) win._obsTimeline.stepLength = payload.stepLength;
          if (Array.isArray(activeTab?.windows)) {
            for (const otherWin of activeTab.windows) {
              if (otherWin && otherWin !== win) {
                otherWin.stepLength = payload.stepLength;
                if (otherWin._obsTimeline) otherWin._obsTimeline.stepLength = payload.stepLength;
                const otherTl = timelinesByWindow[otherWin.id];
                if (otherTl) {
                  otherTl.currentStepLength = payload.stepLength;
                }
              }
            }
          }
        }
        const tl = getOrCreateTimeline(win.id);
        if (tl) {
          if (payload.stepLength) tl.currentStepLength = payload.stepLength;
          if (Array.isArray(tl.obsFiles)) {
            const idx = tl.obsFiles.indexOf(payload.file);
            if (idx !== -1) tl.currentObsIdx = idx;
          }
        }
        if (map) {
          // NOTE: no pre-load teardown here. Teardown of the previous
          // time-step's wind/barbs/raster happens inside
          // loadObservationProduct AFTER its stale-guard passes, so a
          // discarded or failed load leaves current visuals intact instead
          // of blanking layers the store still reports visible.
          if (win.activeGroup) {
            await loadPresetGroup(map, win.activeGroup, win.period, win.level, win, true, loadSeq);
          }
        }
      } else {
        if (payload.cycle) {
          win.forecastCycle = payload.cycle;
          const timeline = getOrCreateTimeline(win.id);
          timeline.currentInitCycle = payload.cycle;
        }
        if (payload.stepLength) {
          win.stepLength = payload.stepLength;
          win.discretePeriods = payload.discretePeriods || getPeriodsForStep(payload.stepLength);
          if (win._nwpTimeline) win._nwpTimeline.stepLength = payload.stepLength;
          const tl = getOrCreateTimeline(win.id);
          if (tl) {
            tl.currentStepLength = payload.stepLength;
            tl.discretePeriods = [...win.discretePeriods];
          }
          if (Array.isArray(activeTab?.windows)) {
            for (const otherWin of activeTab.windows) {
              if (otherWin && otherWin !== win) {
                otherWin.stepLength = payload.stepLength;
                otherWin.discretePeriods = [...win.discretePeriods];
                if (otherWin._nwpTimeline) otherWin._nwpTimeline.stepLength = payload.stepLength;
                const otherTl = timelinesByWindow[otherWin.id];
                if (otherTl) {
                  otherTl.currentStepLength = payload.stepLength;
                  otherTl.discretePeriods = [...win.discretePeriods];
                }
              }
            }
          }
        }
        if (payload.period !== undefined) {
          win.period = payload.period;
        }
        const tl = getOrCreateTimeline(win.id);
        if (tl && Array.isArray(tl.discretePeriods) && payload.period !== undefined) {
          const idx = tl.discretePeriods.indexOf(payload.period);
          if (idx !== -1) tl.currentPeriodIdx = idx;
        }
        if (win === activeWin && payload.period !== undefined) {
          app.period = payload.period;
        }
        if (map && win.activeGroup) {
          await loadPresetGroup(map, win.activeGroup, win.period, win.level, win, true, loadSeq);
        }
      }
      updateWindowTitle(win);
      syncLayersState(win.id);
      syncLegendState(win.id);
    }
  }

  function handleLayerAction(event) {
    const win = activeWin;
    if (!win) return;
    const map = getMapInstance(win.id);
    const valPayload = event.field !== undefined ? { [event.field]: event.value } : event.value;
    serviceHandleLayerAction(map, event.action, event.layer?.id, valPayload, event.layer, win);
    if (event.action === "remove") {
      syncLayersState(win.id);
      syncLegendState(win.id);
      try {
        syncProfilePanelsForWindow(win, map);
      } catch {}
    }
    if (event.action === "config" && event.layer) {
      if (valPayload && typeof valPayload === "object" && win.activeGroup?.layers) {
        const presetLayer = win.activeGroup.layers.find((candidate) =>
          candidate?.id === event.layer.id ||
          (candidate?.model === event.layer.model && candidate?.element === event.layer.element &&
            Boolean(candidate?.derivedFrom) === Boolean(event.layer.derivedFrom) &&
            (candidate?.level === undefined || event.layer?.level === undefined || candidate.level === event.layer.level))
        );
        if (presetLayer) {
          // Keep both representations in the per-window preset copy. The
          // loader consumes render, while the layer panel edits config.
          presetLayer.config = { ...(presetLayer.config || {}), ...valPayload };
          presetLayer.render = { ...(presetLayer.render || {}), ...valPayload };
          if (valPayload.policy !== undefined) presetLayer.policy = valPayload.policy;
          if (valPayload.offset !== undefined) presetLayer.offset = valPayload.offset;
          if (valPayload.tolerance !== undefined) presetLayer.tolerance = valPayload.tolerance;
          if (valPayload.lineColor !== undefined) presetLayer.color = valPayload.lineColor;
          if (valPayload.palettePath !== undefined) {
            presetLayer.colormap = valPayload.palettePath ? `palette:${event.layer.id}` : (presetLayer.element || event.layer.element);
          }
        }
      }
      autoSaveLayerConfig(event.layer);
      if (valPayload && typeof valPayload === "object") {
        if (valPayload.policy !== undefined) event.layer.policy = valPayload.policy;
        if (valPayload.offset !== undefined) event.layer.offset = valPayload.offset;
        if (valPayload.tolerance !== undefined) event.layer.tolerance = valPayload.tolerance;
        if ((valPayload.policy !== undefined || valPayload.offset !== undefined || valPayload.tolerance !== undefined) && win.activeGroup && map) {
          loadPresetGroup(map, win.activeGroup, win.period, win.level, win, true);
        }
      }
      if (event.layer.type === "pmtiles" || event.layer.id?.startsWith("layer-pmtiles")) {
        if (valPayload && typeof valPayload === "object") {
          if (valPayload.projection !== undefined) {
            for (const [wId, m] of mapInstances.entries()) {
              if (m && m !== map) {
                try { setMapProjection(m, valPayload.projection); } catch {}
              }
            }
          }
          if (valPayload.scheme !== undefined) {
            for (const [wId, m] of mapInstances.entries()) {
              if (m && m !== map) {
                try {
                  applyBasemapScheme(m, valPayload.scheme);
                  updateGraticuleScheme(m, valPayload.scheme);
                } catch {}
              }
            }
          }
        }
      }
    }
    syncLayersState(win.id);
    syncLegendState(win.id);
  }

  function handleMapCreated(win, map) {
    win.map = map;
    setMapInstance(win.id, map);
    if (syncCleanups.has(win.id)) {
      try { syncCleanups.get(win.id)(); } catch {}
    }
    // Pass LIVE resolvers closing over the Svelte $state proxy store.
    // windowMaps must never read layout/syncMap from the plain core copy:
    // the proxy fork keeps layout === "1x1" stale there, which silently
    // disabled all move/zoom sync in split mode. Maps resolve via the
    // shared (never-proxied) registry so MapLibre instances stay raw.
    const winTabId = win.tabId;
    const cleanup = registerWindowMapSync(win, map, {
      getTab: () => tabsState.tabs.find((t) => t.id === winTabId) || tabsState.tabs[0] || null,
      getMap: (id) => getMapInstance(id),
      getVisible: (tab) => getVisibleWindows(tab),
    });
    syncCleanups.set(win.id, cleanup);

    const tab = tabsState.tabs.find((t) => t.id === winTabId) || activeTab;
    if (tab && isWindowVisible(tab, win)) {
      if (win.activeGroup && (!win.layers || win.layers.length === 0)) {
        setTimeout(async () => {
          try {
            if (typeof map.resize === "function") {
              try { map.resize(); } catch {}
            }
            await waitForMapStyle(map, 2500);
            if (typeof map.resize === "function") {
              try { map.resize(); } catch {}
            }
            const loadSeq = (win.loadSeq || 0) + 1;
            win.loadSeq = loadSeq;
            await loadPresetGroup(map, win.activeGroup, win.period, win.level, win, false, loadSeq);
            syncLayersState(win.id);
            syncLegendState(win.id);
          } catch (e) {
            console.error("[AutoAlloc] handleMapCreated fallback load failed:", e);
          }
        }, 100);
      }
    }
  }

  function handleMapDestroyed(win) {
    if (syncCleanups.has(win.id)) {
      try { syncCleanups.get(win.id)(); } catch {}
      syncCleanups.delete(win.id);
    }
    win.map = null;
    setMapInstance(win.id, null);
  }

  function handlePresetSelect(group) {
    if (isProfilePanelGroup(group) && activeTab) {
      activeTab.autoAllocation = "none";
    }
    if (activeTab && activeTab.autoAllocation && activeTab.autoAllocation !== "none") {
      const curMode = activeTab.autoAllocation;
      if (isSurfaceGroup(group) && (curMode === "step" || curMode === "level" || curMode === "model")) {
        activeTab.autoAllocation = "none";
      } else if (isUpperAirGroup(group) && (curMode === "step" || curMode === "model")) {
        activeTab.autoAllocation = "none";
      }
    }
    if (group && (group.defaultLevel != null || group.hasLevel)) {
      const nextLvl = group.defaultLevel != null ? group.defaultLevel : app.level;
      if (nextLvl != null) {
        app.level = nextLvl;
      }
    } else if (group && group.hasLevel === false) {
      app.level = null;
    }
  }

  async function handleConfigSaved(draft) {
    try {
      await reloadConfiguration();
      presetGroups = [...PRESET_GROUPS];
      if (draft?.basemap?.projection) {
        for (const [winId, map] of mapInstances.entries()) {
          if (map) {
            try { setMapProjection(map, draft.basemap.projection); } catch {}
          }
        }
      }
      if (draft?.basemap?.scheme) {
        for (const [winId, map] of mapInstances.entries()) {
          if (map) {
            try {
              applyBasemapScheme(map, draft.basemap.scheme);
              updateGraticuleScheme(map, draft.basemap.scheme);
            } catch {}
          }
        }
      }
    } catch (e) {
      console.error("[App] reloadConfiguration error:", e);
    }
  }

  async function handleLevelSelect(lvl, targetWin = activeWin, syncModelSplit = true) {
    const win = targetWin;
    if (!win) return;
    win.level = lvl;
    if (win === activeWin) app.level = lvl;
    const map = getMapInstance(win.id);
    if (map) {
      try {
        await changeVerticalLevel(map, 0, lvl, win);
      } catch (err) {
        console.error("[App] Level change error:", err);
      }
    }
    if (win.isObservation && win._obsTimeline) {
      try {
        const t = win._obsTimeline;
        const tl = getOrCreateTimeline(win.id);
        tl.currentMode = "obs";
        tl.isUpperAirMode = Boolean(t.isUpper);
        tl.currentStepLength = t.stepLength || (t.isUpper ? 12 : 3);
        tl.currentWinTitle = t.winTitle || "";
        if (Array.isArray(t.files) && t.files.length > 0) {
          tl.rawObsFiles = [...t.files];
          const filtered = filterObsFilesByStep(tl.rawObsFiles, tl.currentStepLength, tl.isUpperAirMode);
          const currentFile = win.obsTime || t.file;
          const chips = selectObsChipsWindow(filtered, currentFile);
          tl.obsFiles = chips.length > 0 ? chips : filtered;
          const idx = currentFile ? tl.obsFiles.indexOf(currentFile) : -1;
          tl.currentObsIdx = idx !== -1 ? idx : Math.max(0, tl.obsFiles.length - 1);
          const activeFile = tl.obsFiles[tl.currentObsIdx];
          if (activeFile) {
            win.obsTime = activeFile;
            if (win._obsTimeline) win._obsTimeline.file = activeFile;
          }
        }
      } catch (e) {
        console.warn("[App] Obs timeline bridge (level) failed:", e);
      }
    }
    updateWindowTitle(win);
    syncLayersState(win.id);
    syncLegendState(win.id);

    if (syncModelSplit && targetWin === activeWin && activeTab?.layout !== "1x1" && activeTab?.autoAllocation === "model") {
      applyAutoAllocationModeToTab(activeTab, "model").catch((err) =>
        console.error("[AutoAlloc] Model level sync error:", err)
      );
    }
  }

  async function stepVerticalLevel(delta) {
    const isSplit = activeTab?.layout !== "1x1";
    const alloc = activeTab?.autoAllocation;
    const visible = isSplit ? getVisibleWindows(activeTab) : (activeWin ? [activeWin] : []);
    const win = activeWin || visible[0];
    if (!win) return;

    // Line-profile diagrams own the vertical axis — Up/Down never touch win.level while active.
    try {
      if (lineHeightController.isActive(win) || hovmollerController.isActive(win)) return;
    } catch {}

    const levels = [1000, 925, 850, 700, 500, 400, 300, 200, 100];

    if (isSplit && alloc === "level") {
      for (const w of visible) {
        if (!w || ((w.model === "SURFACE" || w.level === 0) && !w.activeGroup?.hasLevel)) continue;
        const wIdx = levels.indexOf(w.level ?? 500);
        if (wIdx !== -1) {
          const shifted = Math.max(0, Math.min(levels.length - 1, wIdx + delta));
          if (shifted !== wIdx) {
            await handleLevelSelect(levels[shifted], w, false);
          }
        }
      }
      if (activeWin?.level != null) app.level = activeWin.level;
      return;
    }

    if (isSplit && (alloc === "model" || alloc === "step" || alloc === "time")) {
      const curLvl = activeWin?.level ?? visible.find((w) => w && w.level != null)?.level ?? app.level ?? 500;
      const idx = levels.indexOf(curLvl);
      if (idx === -1) return;
      const nextIdx = Math.max(0, Math.min(levels.length - 1, idx + delta));
      if (nextIdx === idx) return;
      const targetLevel = levels[nextIdx];
      for (const w of visible) {
        if (!w || ((w.model === "SURFACE" || w.level === 0) && !w.activeGroup?.hasLevel)) continue;
        await handleLevelSelect(targetLevel, w, false);
      }
      app.level = targetLevel;
      return;
    }

    if ((win.model === "SURFACE" || win.level === 0) && !win.activeGroup?.hasLevel) return;
    const cur = app.level ?? win?.level ?? 500;
    const idx = levels.indexOf(cur);
    if (idx === -1) return;
    const nextIdx = Math.max(0, Math.min(levels.length - 1, idx + delta));
    if (nextIdx !== idx) {
      await handleLevelSelect(levels[nextIdx], win);
    }
  }

  let lastKeyTime = 0;
  const REPEAT_THROTTLE_MS = 150;



  async function stepTimelineDelta(delta) {
    const isSplit = activeTab?.layout !== "1x1";
    const alloc = activeTab?.autoAllocation;
    const isSharedSplit = isSplit &&
      (alloc === "step" || alloc === "time" || alloc === "level" || alloc === "model");
    const visible = isSplit ? getVisibleWindows(activeTab) : (activeWin ? [activeWin] : []);
    const win = isSharedSplit
      ? ((activeWin && visible.includes(activeWin)) ? activeWin : (visible[0] || activeWin))
      : activeWin;
    if (!win) return;
    // v1.1.0: Hovmöller panel owns its time axis — global ←/→ are swallowed.
    try {
      if (hovmollerController.isActive(win)) return;
    } catch {}
    const tl = getOrCreateTimeline(win.id);
    if (!tl.discretePeriods || tl.discretePeriods.length === 0) {
      const baseTl = visible[0] ? timelinesByWindow[visible[0].id] : null;
      if (baseTl && Array.isArray(baseTl.discretePeriods) && baseTl.discretePeriods.length > 0) {
        tl.discretePeriods = [...baseTl.discretePeriods];
        tl.currentStepLength = baseTl.currentStepLength;
        tl.currentPeriodIdx = baseTl.currentPeriodIdx;
        tl.currentInitCycle = baseTl.currentInitCycle;
        tl.disabledPeriods = baseTl.disabledPeriods ? [...baseTl.disabledPeriods] : [];
      } else if (Array.isArray(win.discretePeriods) && win.discretePeriods.length > 0) {
        tl.discretePeriods = [...win.discretePeriods];
        tl.currentStepLength = win.stepLength || 6;
        const pIdx = tl.discretePeriods.indexOf(win.period ?? 24);
        tl.currentPeriodIdx = pIdx !== -1 ? pIdx : 0;
      }
    }
    const rainHours = getRainAccumulationHoursForWindow(win) ?? getRainAccumulationHours(win.element);
    if (rainHours !== null && rainHours > 0) {
      tl.disabledPeriods = getDisabledPeriodsForRain(rainHours, tl.discretePeriods);
    } else if (tl.disabledPeriods && tl.disabledPeriods.length > 0) {
      tl.disabledPeriods = [];
    }
    const res = stepWindowTimeline(tl, delta);
    if (!res) return;
    res.winId = win.id;
    // v1.1.0: keyboard steps hint prefetch direction (prev/next).
    res.prefetchDirections = delta < 0 ? ["prev"] : ["next"];
    if (!res.isObs) {
      app.period = res.period;
    }
    await handleTimeChange(res);
  }

  function togglePlayback() {
    playback.isPlaying = !playback.isPlaying;
    app.isPlaying = playback.isPlaying;
  }

  function cycleLayout() {
    // F4 toggles split 1x1 <-> split layout (1x2 / 2x2 / 2x3 reachable via layout buttons).
    if (!activeTab) return;
    const newLayout = activeTab.layout === "1x1" ? (activeTab._lastSplitLayout || "2x2") : "1x1";
    if (activeTab.layout !== "1x1") {
      activeTab._lastSplitLayout = activeTab.layout;
    }
    handleChangeLayout(newLayout);
  }

  function handleToggleConfig() {
    const opening = !ui.configOpen;
    ui.configOpen = opening;
    // $effect below hides/restores floating panels; apply immediately too
    // so body-appended panels never cover the editor on the same tick.
    if (opening) {
      try { hideAllProfilePanels(); } catch {}
    } else {
      try {
        if (activeWin) syncProfilePanelsForWindow(activeWin, getMapInstance(activeWin.id));
      } catch {}
    }
  }

  // Opening the config editor auto-hides floating profile panels
  // (T-LogP, Time-Height, Line-Height, Hovmoller/Time-Line). The timeline
  // already hides via `!ui.configOpen`. Closing re-syncs the focused
  // window so its panels come back.
  let prevConfigOpen = $state(false);
  $effect(() => {
    const isOpen = ui.configOpen;
    if (isOpen === prevConfigOpen) return;
    prevConfigOpen = isOpen;
    if (isOpen) {
      try { hideAllProfilePanels(); } catch {}
    } else {
      try {
        if (activeWin) syncProfilePanelsForWindow(activeWin, getMapInstance(activeWin.id));
      } catch {}
    }
  });

  async function handleKeydown(e) {
    if (e.key === "Escape") {
      ui.configOpen = false;
      return;
    }
    if (isTextInput(e.target)) {
      return;
    }

    const isLeft = e.key === "ArrowLeft" || e.key === "Left" || e.code === "ArrowLeft";
    const isRight = e.key === "ArrowRight" || e.key === "Right" || e.code === "ArrowRight";
    const isUp = e.key === "ArrowUp" || e.key === "Up" || e.code === "ArrowUp";
    const isDown = e.key === "ArrowDown" || e.key === "Down" || e.code === "ArrowDown";
    const isSplit = e.key === "F4" || (e.altKey && (e.key === "s" || e.key === "S" || e.code === "KeyS"));
    const isSpace = e.code === "Space" || e.key === " " || e.key === "Spacebar";

    if (!isLeft && !isRight && !isUp && !isDown && !isSplit && !isSpace) {
      return;
    }

    if (isSpace && (e.target?.id === "sl-btn-play" || e.target?.tagName === "BUTTON")) {
      return;
    }

    if (e.repeat) {
      const now = Date.now();
      if (now - lastKeyTime < REPEAT_THROTTLE_MS) {
        e.preventDefault();
        return;
      }
    }
    lastKeyTime = Date.now();

    if (isSpace) {
      e.preventDefault();
      togglePlayback();
    } else if (isLeft) {
      e.preventDefault();
      await stepTimelineDelta(-1);
    } else if (isRight) {
      e.preventDefault();
      await stepTimelineDelta(1);
    } else if (isUp) {
      e.preventDefault();
      await stepVerticalLevel(1);
    } else if (isDown) {
      e.preventDefault();
      await stepVerticalLevel(-1);
    } else if (isSplit) {
      e.preventDefault();
      cycleLayout();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div id="app" class="app-container">
  <NavBar
    {presetGroups}
    presetId={activeWin?.activeGroup?.id || ""}
    level={app.level}
    onPresetSelect={handlePresetSelect}
    onLoadData={handleLoadData}
    onLevelSelect={handleLevelSelect}
    onOpenConfig={handleToggleConfig}
  />

  <TabsBar
    windows={activeTab?.windows || []}
    activeWinIdx={activeTab?.activeWinIdx ?? 0}
    layout={activeTab?.layout || "1x1"}
    syncMap={activeTab?.syncMap !== false}
    autoAllocation={activeTab?.autoAllocation || "none"}
    onSelectWin={handleWindowFocus}
    onAddWin={handleAddWindow}
    onCloseWin={handleCloseWindow}
    onReorder={handleReorderWindows}
    onChangeLayout={handleChangeLayout}
    onToggleSync={handleToggleSync}
    onSelectAutoAlloc={handleSelectAutoAlloc}
    onToggleAutoAlloc={handleToggleAutoAlloc}
  />

  <main id="main-content" class="main-content">
    <div id="workspace-container">
      <div class="windows-grid layout-{activeTab?.layout || '1x1'}">
        {#each activeTab?.windows || [] as win (win.id)}
          <WindowPanel
            {win}
            isActive={win === activeWin}
            isVisible={visibleWindows.includes(win)}
            onFocus={handleWindowFocus}
            onToggleMax={toggleTabsAndSplit}
            onMapCreated={(map) => handleMapCreated(win, map)}
            onMapDestroyed={() => handleMapDestroyed(win)}
          />
        {/each}
      </div>
    </div>

    <FullscreenButton />
    <LayersPanel winId={activeWin?.id} onLayerAction={handleLayerAction} />
    <Legend winId={activeWin?.id} />
    <Tooltip />
    <Toast />
    <ConfigEditor onConfigSaved={handleConfigSaved} />
  </main>

  <TimeSlider
    winId={activeWin?.id}
    onTimeChange={handleTimeChange}
  />
</div>

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }

  .main-content {
    position: relative;
    flex: 1;
    min-height: 0;
    width: 100%;
  }

  #workspace-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    overflow: hidden;
  }

  .windows-grid {
    width: 100%;
    height: 100%;
    background: #010409;
  }

  .windows-grid.layout-1x1 {
    display: block;
  }

  .windows-grid.layout-1x2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr;
    gap: 2px;
  }

  .windows-grid.layout-2x2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 2px;
  }

  .windows-grid.layout-2x3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(2, 1fr);
    gap: 2px;
  }

  .windows-grid.layout-3x2 {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: 2px;
  }
</style>
