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

  import { ui, showToast } from "./lib/stores/ui.svelte.js";
  import { app } from "./lib/stores/app.svelte.js";
  import { tabsState, getVisibleWindows, getWindowById, setMapInstance, getMapInstance, mapInstances } from "./lib/stores/tabs.svelte.js";
  import { syncLayersState } from "./lib/stores/layers.svelte.js";
  import { syncLegendState } from "./lib/stores/legend.svelte.js";
  import { getOrCreateTimeline, playback, selectObsChipsWindow, filterObsFilesByStep, getPeriodsForStep } from "./lib/stores/timeline.svelte.js";

  import { loadPresetGroups, PRESET_GROUPS, onConfigLoaded, CURRENT_CONFIG, autoSaveLayerConfig } from "./config/presets.js";
  import { loadPresetGroup, reloadConfiguration } from "./services/presetLoader.js";
  import { changeVerticalLevel } from "./services/levelController.js";
  import { handleLayerAction as serviceHandleLayerAction } from "./ui/layerActions.js";
  import { resolveForecastCycles } from "./utils/timelineSync.js";
  import { DEFAULT_LEVELS, createDefaultTab, createDefaultWindow, getNumVisible } from "./lib/stores/tabsCore.js";
  import { stopWindAnimation, removeGridWindBarbs } from "./layers/windLayer.js";
  import { removeRasterLayer } from "./layers/rasterLayer.js";
  import { shouldHideTimelineForGroup, applyPresetToWindow, stepWindowTimeline } from "./lib/services/appWorkflow.js";
  import { isTextInput } from "./actions/keyboardShortcuts.js";
  import { registerWindowMapSync, syncTabCameras } from "./ui/tabs/windowMaps.js";
  import { setMapProjection } from "./map/mapInstance.js";
  import { applyBasemapScheme } from "./map/pmtilesLayers.js";
  import { updateGraticuleScheme } from "./map/graticule.js";
  import { hovmollerController, lineHeightController } from "./layers/lineprofile/lineProfileLayer.js";

  let activeTab = $derived(tabsState.tabs.find((t) => t.id === tabsState.activeTabId) || tabsState.tabs[0] || null);
  let activeWin = $derived(activeTab && activeTab.windows ? (activeTab.windows[activeTab.activeWinIdx] || activeTab.windows[0]) : null);
  let visibleWindows = $derived(getVisibleWindows(activeTab));

  let presetGroups = $state(PRESET_GROUPS);

  const syncCleanups = new Map();
  let forecastRefreshTimer = null;

  async function waitForMapStyle(map, timeoutMs = 15000) {
    if (!map) return false;
    const isReady = () => {
      try {
        return Boolean(
          (typeof map.isStyleLoaded === "function" && map.isStyleLoaded()) ||
          (typeof map.loaded === "function" && map.loaded())
        );
      } catch {
        return false;
      }
    };
    if (isReady()) return true;
    if (typeof map.once !== "function") return false;

    return await new Promise((resolve) => {
      let settled = false;
      let timer = null;
      const finish = (ready) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(Boolean(ready) && isReady());
      };
      timer = setTimeout(() => finish(false), timeoutMs);
      map.once("load", () => finish(true));
    });
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
      if (tab._nextWinSeq == null) tab._nextWinSeq = tab.windows?.length || 0;
      while (tab.windows.length < 4) {
        const uid = tab._nextWinSeq++;
        const posIdx = tab.windows.length;
        const winObj = createDefaultWindow(posIdx, tab.id);
        winObj.uid = uid;
        winObj.id = `tab-${tab.id}-win-${uid}`;
        winObj.level = DEFAULT_LEVELS[posIdx] || 500;
        tab.windows.push(winObj);
      }
      syncLayersState(tab.windows[tab.activeWinIdx || 0].id);
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
    const cycles = await resolveForecastCycles(model, element, win.level || 500, forceRefresh);
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
    if (win.forecastCycle !== nextCycle) {
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

  function handleWindowFocus(win) {
    if (!activeTab || !win) return;
    const idx = activeTab.windows.indexOf(win);
    if (idx !== -1) {
      activeTab.activeWinIdx = idx;
    }
    if (win.level) {
      app.level = win.level;
    }
    syncLayersState(win.id);
    syncLegendState(win.id);

    const hasData = Boolean(win.activeGroup);
    ui.timelineVisible = hasData && !shouldHideTimelineForGroup(win.activeGroup);
    if (hasData && !win.isObservation) refreshForecastTimeline(win, true);
  }

  function handleAddWindow() {
    if (!activeTab) return;
    if (activeTab._nextWinSeq == null) activeTab._nextWinSeq = activeTab.windows.length;
    const uid = activeTab._nextWinSeq++;
    const posIdx = activeTab.windows.length;
    const winObj = createDefaultWindow(posIdx, activeTab.id);
    winObj.uid = uid;
    winObj.id = `tab-${activeTab.id}-win-${uid}`;
    winObj.level = DEFAULT_LEVELS[posIdx] || 500;
    activeTab.windows.push(winObj);
    handleWindowFocus(winObj);
  }

  function handleCloseWindow(win) {
    if (!activeTab || activeTab.windows.length <= 1) return;
    const idx = activeTab.windows.indexOf(win);
    if (idx !== -1) {
      const wasActive = idx === activeTab.activeWinIdx;
      activeTab.windows.splice(idx, 1);
      activeTab.windows.forEach((w, i) => {
        w.winIdx = i;
      });
      if (wasActive) {
        const nextIdx = Math.max(0, Math.min(idx, activeTab.windows.length - 1));
        handleWindowFocus(activeTab.windows[nextIdx]);
      }
    }
  }

  function handleReorderWindows(fromIndex, toIndex) {
    if (!activeTab || fromIndex === toIndex) return;
    const windows = activeTab.windows;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= windows.length || toIndex >= windows.length) return;
    const activeWindow = windows[activeTab.activeWinIdx];
    const [moved] = windows.splice(fromIndex, 1);
    windows.splice(toIndex, 0, moved);
    windows.forEach((win, idx) => {
      win.winIdx = idx;
      if (win.title) win.title = win.title.replace(/^W\d+:\s*/, `W${idx + 1}: `);
    });
    activeTab.activeWinIdx = Math.max(0, windows.indexOf(activeWindow));
  }

  async function handleWindowGroupSelect(win, group) {
    if (!win || !group) return;
    handleWindowFocus(win);
    await handleLoadData(group, group.hasLevel === false ? null : (win.level || group.defaultLevel || 500), win);
  }

  async function handleWindowLevelSelect(win, level) {
    if (!win || level === null || level === undefined) return;
    handleWindowFocus(win);
    await handleLevelSelect(level, win);
  }

  function toggleTabsAndSplit() {
    if (!activeTab) return;
    const newLayout = activeTab.layout === "1x1" ? "2x2" : "1x1";
    handleChangeLayout(newLayout);
  }

  function handleChangeLayout(layout) {
    if (!activeTab) return;
    activeTab.layout = layout;
    const numNeeded = getNumVisible(layout);
    while (activeTab.windows.length < numNeeded) {
      const uid = activeTab._nextWinSeq++;
      const posIdx = activeTab.windows.length;
      const winObj = createDefaultWindow(posIdx, activeTab.id);
      winObj.uid = uid;
      winObj.id = `tab-${activeTab.id}-win-${uid}`;
      winObj.level = DEFAULT_LEVELS[posIdx] || 500;
      activeTab.windows.push(winObj);
      syncLayersState(winObj.id);
    }
    if (layout !== "1x1" && activeTab.syncMap !== false) {
      setTimeout(() => {
        syncTabCameras(activeTab);
      }, 50);
    }
  }

  function handleToggleSync() {
    if (!activeTab) return;
    activeTab.syncMap = activeTab.syncMap === false ? true : false;
    if (activeTab.syncMap) {
      syncTabCameras(activeTab);
    }
  }

  async function handleLoadData(group, overrideLevel = null, targetWin = activeWin) {
    const win = targetWin;
    if (!win || !group) {
      console.warn("[App] Load Data skipped: missing window or group");
      return;
    }
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
    applyPresetToWindow(win, group, overrideLevel);
    const groupCopy = win.activeGroup;
    if (!groupCopy || !Array.isArray(groupCopy.layers)) {
      console.error("[App] Load Data aborted: activeGroup has no layers", groupCopy);
      showToast("error", "Load Data failed: preset has no layers.");
      return;
    }
    ui.timelineVisible = !shouldHideTimelineForGroup(groupCopy);

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
      const validSteps = isUpperLoad ? [12, 24, 6] : [1, 3, 6, 12, 24];
      let coercedStep = parseInt(win.stepLength, 10);
      if (!validSteps.includes(coercedStep)) coercedStep = isUpperLoad ? 12 : 3;
      win.stepLength = coercedStep;
      const tl = getOrCreateTimeline(win.id);
      tl.currentMode = "obs";
      tl.currentStepLength = coercedStep;
      tl.isUpperAirMode = isUpperLoad;
    } else if (!isSpecialProfile) {
      const pLayer = groupCopy.layers?.find((l) => l.type === "contour" || l.type === "wind");
      const cycles = await resolveForecastCycles(pLayer?.model || "ECMWF_HR", pLayer?.element || "TMP", win.level || 500, true);
      win.forecastCycle = cycles[0];
      const tl = getOrCreateTimeline(win.id);
      tl.currentMode = "nwp";
      tl.forecastCycles = cycles;
      tl.currentInitCycle = cycles[0];
      // v1.1.0 setTimelineMode(nwp): init step + rebuild periods from it so
      // the step select and chips always have coherent init values.
      let nwpStep = parseInt(win.stepLength, 10);
      if (![1, 3, 6, 12, 24].includes(nwpStep)) nwpStep = 6;
      win.stepLength = nwpStep;
      tl.currentStepLength = nwpStep;
      tl.discretePeriods = getPeriodsForStep(nwpStep);
      const pIdx = tl.discretePeriods.indexOf(win.period ?? 24);
      tl.currentPeriodIdx = pIdx !== -1 ? pIdx : Math.min(4, tl.discretePeriods.length - 1);
    }

    try {
      await loadPresetGroup(map, groupCopy, win.period, overrideLevel, win, false, loadSeq);
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
        const validSteps = tl.isUpperAirMode ? [12, 24, 6] : [1, 3, 6, 12, 24];
        let step = parseInt(win.stepLength, 10);
        if (!validSteps.includes(step)) step = parseInt(t.stepLength, 10);
        if (!validSteps.includes(step)) step = tl.isUpperAirMode ? 12 : 3;
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
        }
      } catch (e) {
        console.warn("[App] Obs timeline bridge failed:", e);
      }
    }
    syncLayersState(win.id);
    syncLegendState(win.id);
  }

  async function handleTimeChange(payload) {
    const win = payload?.winId ? getWindowById(payload.winId) : activeWin;
    const map = win ? getMapInstance(win.id) : null;
    if (!win || !map) return;
    const loadSeq = (win.loadSeq || 0) + 1;
    win.loadSeq = loadSeq;

    // v1.1.0: per-event prefetch hint (keyboard steps pass prev/next,
    // chip/cycle jumps carry none) — consumed by loadPresetGroup prefetch.
    win.prefetchDirections = payload.prefetchDirections || payload.directions || null;

    if (payload.isObs) {
      win.obsTime = payload.file;
      if (payload.stepLength) {
        win.stepLength = payload.stepLength;
        if (win._obsTimeline) win._obsTimeline.stepLength = payload.stepLength;
      }
      stopWindAnimation(map);
      removeGridWindBarbs(map);
      removeRasterLayer(map);

      if (win.activeGroup) {
        await loadPresetGroup(map, win.activeGroup, win.period, win.level, win, true, loadSeq);
      }
    } else {
      if (payload.cycle) {
        win.forecastCycle = payload.cycle;
        const timeline = getOrCreateTimeline(win.id);
        timeline.currentInitCycle = payload.cycle;
      }
      win.period = payload.period;
      app.period = payload.period;
      if (win.activeGroup) {
        await loadPresetGroup(map, win.activeGroup, payload.period, win.level, win, true, loadSeq);
      }
    }
    syncLayersState(win.id);
    syncLegendState(win.id);
  }

  function handleLayerAction(event) {
    const win = activeWin;
    if (!win) return;
    const map = getMapInstance(win.id);
    const valPayload = event.field !== undefined ? { [event.field]: event.value } : event.value;
    serviceHandleLayerAction(map, event.action, event.layer?.id, valPayload, event.layer, win);
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
          if (valPayload.lineColor !== undefined) presetLayer.color = valPayload.lineColor;
        }
      }
      autoSaveLayerConfig(event.layer);
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
    const cleanup = registerWindowMapSync(win, map);
    syncCleanups.set(win.id, cleanup);
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

  async function handleLevelSelect(lvl, targetWin = activeWin) {
    const win = targetWin;
    if (!win) return;
    app.level = lvl;
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
          const chips = selectObsChipsWindow(filtered, t.file);
          tl.obsFiles = chips.length > 0 ? chips : filtered;
          const idx = t.file ? tl.obsFiles.indexOf(t.file) : -1;
          tl.currentObsIdx = idx !== -1 ? idx : Math.max(0, tl.obsFiles.length - 1);
        }
      } catch (e) {
        console.warn("[App] Obs timeline bridge (level) failed:", e);
      }
    }
    syncLayersState(win.id);
    syncLegendState(win.id);
  }

  function stepVerticalLevel(delta) {
    // v1.1.0: line-profile diagrams own the vertical axis — Up/Down never
    // touch win.level while they are active.
    try {
      const win = activeWin;
      if (win && (lineHeightController.isActive(win) || hovmollerController.isActive(win))) return;
    } catch {}
    const levels = [1000, 925, 850, 700, 500, 400, 300, 200, 100];
    const cur = app.level || activeWin?.level || 500;
    const idx = levels.indexOf(cur);
    if (idx === -1) return;
    const nextIdx = Math.max(0, Math.min(levels.length - 1, idx + delta));
    if (nextIdx !== idx) {
      handleLevelSelect(levels[nextIdx]);
    }
  }

  let lastKeyTime = 0;
  const REPEAT_THROTTLE_MS = 150;



  async function stepTimelineDelta(delta) {
    const win = activeWin;
    if (!win) return;
    // v1.1.0: Hovmöller panel owns its time axis — global ←/→ are swallowed.
    try {
      if (hovmollerController.isActive(win)) return;
    } catch {}
    const tl = getOrCreateTimeline(win.id);
    const res = stepWindowTimeline(tl, delta);
    if (!res) return;
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
    // v1.1.0: F4 toggles split 1x1 <-> 2x2 (1x2 reachable via layout buttons).
    if (!activeTab) return;
    handleChangeLayout(activeTab.layout === "1x1" ? "2x2" : "1x1");
  }

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
      stepVerticalLevel(1);
    } else if (isDown) {
      e.preventDefault();
      stepVerticalLevel(-1);
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
    onOpenConfig={() => (ui.configOpen = !ui.configOpen)}
  />

  <TabsBar
    windows={activeTab?.windows || []}
    activeWinIdx={activeTab?.activeWinIdx ?? 0}
    layout={activeTab?.layout || "1x1"}
    syncMap={activeTab?.syncMap !== false}
    onSelectWin={handleWindowFocus}
    onAddWin={handleAddWindow}
    onCloseWin={handleCloseWindow}
    onReorder={handleReorderWindows}
    onChangeLayout={handleChangeLayout}
    onToggleSync={handleToggleSync}
  />

  <main id="main-content" class="main-content">
    <div id="workspace-container">
      <div class="windows-grid layout-{activeTab?.layout || '1x1'}">
        {#each activeTab?.windows || [] as win (win.id)}
          <WindowPanel
            {win}
            isActive={win === activeWin}
            isVisible={visibleWindows.includes(win)}
            {presetGroups}
            onFocus={handleWindowFocus}
            onToggleMax={toggleTabsAndSplit}
            onGroupSelect={handleWindowGroupSelect}
            onLevelSelect={handleWindowLevelSelect}
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

  <TimeSlider winId={activeWin?.id} onTimeChange={handleTimeChange} />
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
</style>
