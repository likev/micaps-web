<script>
  import { onMount } from "svelte";
  import NavBar from "./components/NavBar.svelte";
  import TabsBar from "./components/TabsBar.svelte";
  import WindowPanel from "./components/WindowPanel.svelte";
  import CatalogDrawer from "./components/CatalogDrawer.svelte";
  import LayersPanel from "./components/LayersPanel.svelte";
  import TimeSlider from "./components/TimeSlider.svelte";
  import Legend from "./components/Legend.svelte";
  import Tooltip from "./components/Tooltip.svelte";
  import Toast from "./components/Toast.svelte";
  import FullscreenButton from "./components/FullscreenButton.svelte";
  import ConfigEditor from "./components/ConfigEditor.svelte";

  import { ui } from "./lib/stores/ui.svelte.js";
  import { app } from "./lib/stores/app.svelte.js";
  import { tabsState, getVisibleWindows, getActiveTab, getActiveWindow, setMapInstance, getMapInstance } from "./lib/stores/tabs.svelte.js";
  import { syncLayersState } from "./lib/stores/layers.svelte.js";
  import { syncLegendState } from "./lib/stores/legend.svelte.js";
  import { getOrCreateTimeline, setTimeChangeCallback, playback } from "./lib/stores/timeline.svelte.js";

  import { loadPresetGroups } from "./config/presets.js";
  import { loadPresetGroup, clearAllWeatherLayersFromMap, reloadConfiguration } from "./services/presetLoader.js";
  import { loadWeatherField } from "./services/weatherLoader.js";
  import { changeVerticalLevel } from "./services/levelController.js";
  import { loadUpperAirComposite, loadObservationProduct } from "./services/derivedContours.js";
  import { loadTLogPLayer } from "./layers/tlogp/tlogpLayer.js";
  import { handleLayerAction as serviceHandleLayerAction } from "./ui/layerActions.js";
  import { resolveForecastCycles, syncObservationTimeline } from "./utils/timelineSync.js";
  import { DEFAULT_LEVELS, createDefaultTab, createDefaultWindow, getNumVisible } from "./lib/stores/tabsCore.js";
  import { stopWindAnimation, removeGridWindBarbs } from "./layers/windLayer.js";
  import { removeRasterLayer } from "./layers/rasterLayer.js";
  import { shouldHideTimelineForGroup, applyPresetToWindow, applyProductToWindow, stepWindowTimeline } from "./lib/services/appWorkflow.js";
  import { isTextInput } from "./actions/keyboardShortcuts.js";

  let activeTab = $derived(tabsState.tabs.find((t) => t.id === tabsState.activeTabId) || tabsState.tabs[0] || null);
  let activeWin = $derived(activeTab && activeTab.windows ? (activeTab.windows[activeTab.activeWinIdx] || activeTab.windows[0]) : null);
  let visibleWindows = $derived(getVisibleWindows(activeTab));

  function ensureInitialTab() {
    if (tabsState.tabs.length === 0) {
      const defaultTab = createDefaultTab(1);
      tabsState.tabs = [defaultTab];
      tabsState.activeTabId = 1;
      syncLayersState(defaultTab.windows[0].id);
    } else if (tabsState.tabs[0]?.windows?.[0]) {
      syncLayersState(tabsState.tabs[0].windows[0].id);
    }
  }

  onMount(async () => {
    ensureInitialTab();
    try {
      await loadPresetGroups();
    } catch (e) {
      console.error("[App] loadPresetGroups error:", e);
    }
  });

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

    const hasData = Boolean(win.activeGroup || win.model || win.isObservation || win.obsTime);
    ui.timelineVisible = hasData;
  }

  function handleAddTab() {
    const nextId = tabsState.tabs.length > 0 ? Math.max(...tabsState.tabs.map((t) => t.id)) + 1 : 1;
    const newTab = createDefaultTab(nextId);
    newTab.title = `Workstation ${nextId}`;
    tabsState.tabs.push(newTab);
    tabsState.activeTabId = nextId;
    syncLayersState(newTab.windows[0].id);
  }

  function handleCloseTab(id) {
    if (tabsState.tabs.length <= 1) return;
    const idx = tabsState.tabs.findIndex((t) => t.id === id);
    if (idx !== -1) {
      tabsState.tabs.splice(idx, 1);
      if (tabsState.activeTabId === id) {
        tabsState.activeTabId = tabsState.tabs[Math.max(0, idx - 1)].id;
      }
    }
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
  }

  function handleCloseWindow(win) {
    if (!activeTab || activeTab.windows.length <= 1) return;
    const idx = activeTab.windows.indexOf(win);
    if (idx !== -1) {
      activeTab.windows.splice(idx, 1);
      activeTab.windows.forEach((w, i) => {
        w.winIdx = i;
      });
      activeTab.activeWinIdx = Math.max(0, idx - 1);
    }
  }

  async function handleLoadData(group, overrideLevel = null) {
    const win = activeWin;
    if (!win || !group) return;
    const groupCopy = applyPresetToWindow(win, group, overrideLevel);
    ui.timelineVisible = !shouldHideTimelineForGroup(groupCopy);

    const effectiveLevel = overrideLevel || win.level || groupCopy.defaultLevel || 500;
    const isSpecialProfile = shouldHideTimelineForGroup(groupCopy);

    if (win.isObservation) {
      const isTLogP = groupCopy.id === "composite-tlogp" || groupCopy.layers?.some((l) => l.element === "TLOGP");
      const obsPath = isTLogP
        ? "UPPER_AIR/TLOGP"
        : (groupCopy.id?.includes("upper") ? `UPPER_AIR/PLOT/${effectiveLevel}` : "SURFACE/PLOT_GLOBAL_3H");
      const latestFile = await syncObservationTimeline(obsPath, win.obsTime, win.title, win);
      win.obsTime = latestFile;
      const tl = getOrCreateTimeline(win.id);
      tl.currentMode = "obs";
    } else if (!isSpecialProfile) {
      const pLayer = groupCopy.layers?.find((l) => l.type === "contour" || l.type === "wind");
      const cycles = await resolveForecastCycles(pLayer?.model || win.model || "ECMWF_HR", pLayer?.element || win.element || "TMP", win.level || 500);
      win.forecastCycle = cycles[0];
      const tl = getOrCreateTimeline(win.id);
      tl.currentMode = "nwp";
      tl.forecastCycles = cycles;
      tl.currentInitCycle = cycles[0];
    }

    const map = getMapInstance(win.id);
    if (map) {
      await loadPresetGroup(map, groupCopy, win.period, overrideLevel, win);
    }
    syncLayersState(win.id);
    syncLegendState(win.id);
  }

  async function handleLoadProduct(product) {
    const win = activeWin;
    if (!win) return;
    const map = getMapInstance(win.id);
    await applyProductToWindow(win, map, product, {
      clearAllWeatherLayersFromMap,
      syncObservationTimeline,
      getOrCreateTimeline,
      loadObservationProduct,
      loadTLogPLayer,
      loadUpperAirComposite,
      resolveForecastCycles,
      loadWeatherField,
    });
    app.level = win.level;
    syncLayersState(win.id);
    syncLegendState(win.id);
  }

  async function handleTimeChange(payload) {
    const win = activeWin;
    const map = win ? getMapInstance(win.id) : null;
    if (!win || !map) return;

    if (payload.isObs) {
      win.obsTime = payload.file;
      stopWindAnimation(map);
      removeGridWindBarbs(map);
      removeRasterLayer(map);

      if (win.activeGroup) {
        await loadPresetGroup(map, win.activeGroup, win.period, win.level, win, true);
      } else {
        const model = win.model || "SURFACE";
        const element = win.element || "PLOT_GLOBAL_3H";
        if (model === "UPPER_AIR") {
          await loadUpperAirComposite(map, win.level || 500, payload.file, win);
        } else {
          await loadObservationProduct(map, model, element, win.level, payload.file, win);
        }
      }
    } else {
      win.period = payload.period;
      app.period = payload.period;
      if (win.activeGroup) {
        await loadPresetGroup(map, win.activeGroup, payload.period, win.level, win, false);
      } else if (win.model && win.element) {
        await loadWeatherField(map, win.model, win.element, win.level, payload.period, null, win, false);
      }
    }
    syncLayersState(win.id);
    syncLegendState(win.id);
  }

  function handleLayerAction(event) {
    const win = activeWin;
    if (!win) return;
    const map = getMapInstance(win.id);
    serviceHandleLayerAction(map, event.action, event.layer?.id, event.value, event.layer, win);
    syncLayersState(win.id);
    syncLegendState(win.id);
  }

  function handleMapCreated(win, map) {
    setMapInstance(win.id, map);
  }

  async function handleLevelSelect(lvl) {
    const win = activeWin;
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
    syncLayersState(win.id);
    syncLegendState(win.id);
  }

  function stepVerticalLevel(delta) {
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
    const tl = getOrCreateTimeline(win.id);
    const res = stepWindowTimeline(tl, delta);
    if (!res) return;
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
    if (!activeTab) return;
    const order = ["1x1", "1x2", "2x2"];
    const curIdx = order.indexOf(activeTab.layout || "1x1");
    const nextLayout = order[(curIdx + 1) % order.length];
    handleChangeLayout(nextLayout);
  }

  async function handleKeydown(e) {
    if (e.key === "Escape") {
      ui.catalogOpen = false;
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

    if (isSpace && (e.target?.id === "btn-play" || e.target?.tagName === "BUTTON")) {
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
    presetId={activeWin?.activeGroup?.id || ""}
    level={app.level}
    onLoadData={handleLoadData}
    onLevelSelect={handleLevelSelect}
  />

  <TabsBar
    tabs={tabsState.tabs}
    activeTabId={tabsState.activeTabId}
    layout={activeTab?.layout || "1x1"}
    onAddTab={handleAddTab}
    onCloseTab={handleCloseTab}
    onChangeLayout={handleChangeLayout}
  />

  <main id="main-content" class="main-content">
    <div id="workspace-container">
      <div class="windows-grid layout-{activeTab?.layout || '1x1'}">
        {#each visibleWindows as win (win.id)}
          <WindowPanel
            {win}
            isActive={win === activeWin}
            onFocus={handleWindowFocus}
            onClose={handleCloseWindow}
            onMapCreated={(map) => handleMapCreated(win, map)}
          />
        {/each}
      </div>
    </div>

    <FullscreenButton />
    <CatalogDrawer onLoadProduct={handleLoadProduct} />
    <LayersPanel winId={activeWin?.id} onLayerAction={handleLayerAction} />
    <Legend winId={activeWin?.id} />
    <Tooltip />
    <Toast />
    <ConfigEditor onConfigSaved={reloadConfiguration} />
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
