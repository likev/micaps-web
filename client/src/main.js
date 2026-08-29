// main.js - Application bootstrap and orchestrator
import { getActiveMap } from "./map/mapInstance.js";
import { initNavBar, refreshNavBarPresets, setNavBarLevel, setNavBarPreset } from "./ui/navBar.js";
import { initCatalogDrawer } from "./ui/catalogDrawer.js";
import { initLayerControl, addOrUpdateLayer, syncLayerControlForWindow, clearWindowWeatherLayers, getLayerById } from "./ui/layerControl.js";
import { initTimeSlider, setTimelineMode, setTimeSliderVisible, step as timeSliderStep } from "./ui/timeSlider.js";
import { handleLayerAction } from "./ui/layerActions.js";
import { initTooltip } from "./ui/tooltip.js";
import { renderContourLayers, removeAllContourLayers } from "./layers/contourLayer.js";
import { renderBinaryRaster, removeRasterLayer } from "./layers/rasterLayer.js";
import { renderStationWeatherPlots, setStationVisibility, removeStationLayer } from "./layers/stationLayer.js";
import { renderWindStreamlines, stopWindAnimation, renderGridWindBarbs, removeGridWindBarbs } from "./layers/windLayer.js";
import { analyzeAndRenderSoundingContours } from "./layers/soundingAnalysis.js";
import { analyzeAndRenderSurfaceSLPContours } from "./layers/surfaceAnalysis.js";
import { fetchGridData, fetchGridBinaryStream, fetchStationObservations, fetchTree, fetchLatest } from "./api/catalogApi.js";
import { updateLegend } from "./ui/legend.js";
import { initKeyboardShortcuts } from "./ui/keyboardShortcuts.js";
import { initConfigEditor, openConfigTab } from "./ui/configEditor.js";
import { appState } from "./store/appState.js";
import { loadPresetGroups, DEFAULT_MOCK_OBS_FILES } from "./config/presets.js";
import { resolveColormap } from "./utils/colormaps.js";
import {
  initTabWindowManager,
  getActiveWindow,
  refreshPresetControls,
  toggleTabsAndSplit,
  updateWindowTitle,
  setWindowHeaderPreset,
  setWindowHeaderLevel,
} from "./ui/tabWindowManager.js";

function getMap() {
  const win = getActiveWindow();
  return (win && win.map) || getActiveMap();
}

async function reloadConfiguration() {
  await loadPresetGroups();
  refreshPresetControls();
  refreshNavBarPresets();
  console.log("[Config] Preset configuration reloaded");
  const win = getActiveWindow();
  if (win?.map) {
    if (win.activeGroup) {
      await loadPresetGroup(win.map, win.activeGroup, win.period, win.level, win);
    } else if (!win.isObservation) {
      await loadWeatherField(win.map, win.model, win.element, win.level, win.period, null, win);
    }
  }
}

async function bootstrap() {
  console.log("[MICAPS-Web] Initializing meteorological workstation...");

  try {
    await loadPresetGroups();
  } catch (error) {
    console.error("[Config] Initial preset configuration load failed:", error);
  }

  // ── Tab / Window Manager ─────────────────────────────────────────────────
  const firstTab = initTabWindowManager({
    onWindowFocus: (win) => {
      if (!win) return;
      setNavBarPreset(win.activeGroup?.id || "");
      if (win.level) setNavBarLevel(win.level);

      let winTitle = "";
      if (win.activeGroup) {
        winTitle = `W${win.winIdx + 1}: ${win.activeGroup.name}`;
      } else if (win.model && win.element) {
        const isUpper = win.model === "UPPER_AIR" || win.element.includes("UPPER");
        const name = win.isObservation
          ? (isUpper ? `${win.level || 500} hPa Sounding (${win.model})` : `${win.element} (${win.model})`)
          : `${win.level ? `${win.level} hPa ` : ""}${win.element} (${win.model})`;
        winTitle = `W${win.winIdx + 1}: ${name}`;
      }

      // Synchronously update layer panel for focused window
      syncLayerControlForWindow(win);
      setNavBarPreset(win.activeGroup?.id || "");

      const hasData = Boolean(win.activeGroup || win.model || win.isObservation || win.gridData || win.obsTime);
      if (!hasData) {
        setTimeSliderVisible(false);
        return;
      }

      const isObs = Boolean(win.isObservation || win.activeGroup?.isObservation || win.model === "SURFACE" || win.model === "UPPER_AIR");
      if (isObs) {
        const obsPath = win.model === "UPPER_AIR"
          ? `UPPER_AIR/${win.element || "PLOT"}/${win.level || 500}`
          : (win.model === "SURFACE" ? `SURFACE/${win.element || "PLOT_GLOBAL_3H"}` : "SURFACE/PLOT_GLOBAL_3H");
        syncObservationTimeline(obsPath, win.obsTime, winTitle, win).then((latestFile) => {
          if (getActiveWindow() === win) {
            win.obsTime = latestFile;
          }
        });
      } else {
        setTimelineMode("nwp", { period: win.period ?? 24, winTitle, initCycle: win.forecastCycle });
      }
    },
    onWindowGroupChange: async (win, group) => {
      if (!win.map || !group) return;
      win.activeGroup = group;
      win.isObservation = Boolean(group.isObservation);
      win.forecastCycle = null;
      if (group.defaultLevel) win.level = group.defaultLevel;
      const winTitle = `W${win.winIdx + 1}: ${group.name}`;
      updateWindowTitle(win, group.name);
      setWindowHeaderPreset(win, group.id);
      if (win.isObservation) {
        const obsPath = group.id?.includes("upper") ? "UPPER_AIR/PLOT/500" : "SURFACE/PLOT_GLOBAL_3H";
        const latestFile = await syncObservationTimeline(obsPath, win.obsTime, winTitle);
        win.obsTime = latestFile;
      } else {
        setTimelineMode("nwp", { period: win.period ?? 24, winTitle, initCycle: win.forecastCycle });
      }
      await loadPresetGroup(win.map, group, win.period, null, win);
    },
    onWindowLevelChange: async (win, level) => {
      if (!win.map) return;
      win.level = level;
      if (win.activeGroup) {
        await loadPresetGroup(win.map, win.activeGroup, win.period, level, win);
      } else {
        await loadWeatherField(win.map, win.model, win.element, level, win.period, null, win);
      }
    },
    onWindowInit: async (win) => {
      // Lazy-init maps in split mode when style loads
      if (!win.map) return;
      const onLoad = async () => {
        if (win.activeGroup) {
          await loadPresetGroup(win.map, win.activeGroup, win.period, null, win);
        }
      };
      if (win.map.isStyleLoaded() || win.map.loaded()) {
        await onLoad();
      } else {
        win.map.once("load", onLoad);
      }
    },
  });

  // ── Navbar ───────────────────────────────────────────────────────────────
  initNavBar("navbar", {
    onOpenConfig: () => openConfigTab(),
    onConfigReload: reloadConfiguration,
    onPresetSelect: (group) => {
      const win = getActiveWindow();
      if (!win) return;
      win.activeGroup = group;
      win.isObservation = Boolean(group?.isObservation);
      updateWindowTitle(win, group ? group.name : "");
      setWindowHeaderPreset(win, group?.id || "");
    },
    onLevelSelect: async (lvl) => {
      const win = getActiveWindow();
      const map = win?.map || getActiveMap();
      if (!win || !map) return;
      if (lvl !== null) win.level = lvl;
      if (win.activeGroup) {
        await loadPresetGroup(map, win.activeGroup, win.period, lvl, win);
      } else if (win.model && win.element && lvl !== null) {
        if (win.isObservation) {
          if (win.model === "UPPER_AIR") {
            await loadUpperAirComposite(map, lvl, win.obsTime, win);
          }
        } else {
          await loadWeatherField(map, win.model, win.element, lvl, win.period, null, win);
        }
      }
    },
    onLoadData: async (group, overrideLevel = null) => {
      const win = getActiveWindow();
      const map = win?.map || getActiveMap();
      if (!win || !map || !group) return;
      win.activeGroup = group;
      win.isObservation = Boolean(group.isObservation);
      win.forecastCycle = null;
      if (overrideLevel !== null) win.level = overrideLevel;
      const winTitle = `W${win.winIdx + 1}: ${group.name}`;
      updateWindowTitle(win, group.name);
      setWindowHeaderPreset(win, group.id);
      if (win.isObservation) {
        const obsPath = group.id?.includes("upper") ? "UPPER_AIR/PLOT/500" : "SURFACE/PLOT_GLOBAL_3H";
        const latestFile = await syncObservationTimeline(obsPath, win.obsTime, winTitle);
        win.obsTime = latestFile;
      } else {
        setTimelineMode("nwp", { period: win.period ?? 24, winTitle, initCycle: win.forecastCycle });
      }
      await loadPresetGroup(map, group, win.period, overrideLevel, win);
    },
  });

  initConfigEditor(reloadConfiguration);
  initTooltip("tooltip");
  initKeyboardShortcuts({
    onPeriodStep: (dir) => timeSliderStep(dir),
    onLevelStep: (dir) => changeVerticalLevel(getMap(), dir),
    onToggleSplit: () => toggleTabsAndSplit(),
  });

  initCatalogDrawer("catalog-drawer", async ({ model, element, level, period, obsTime, isObservation }) => {
    const map = getMap(), win = getActiveWindow();
    if (!win || !map) return;
    const upd = { activeGroup: null, model, element, level: level !== null ? level : win.level, period: period !== null ? period : win.period, obsTime, isObservation };
    Object.assign(win, upd);
    appState.update(upd);
    setNavBarPreset("");

    const isUpper = model === "UPPER_AIR" || (element && element.includes("UPPER"));
    const catalogTitle = isObservation ? (isUpper ? `${win.level || 500} hPa Sounding (${model})` : `${element} (${model})`) : `${win.level ? `${win.level} hPa ` : ""}${element} (${model})`;

    updateWindowTitle(win, catalogTitle);
    setWindowHeaderPreset(win, "");
    if (win.level) { setWindowHeaderLevel(win, win.level); setNavBarLevel(win.level); }

    const winBannerTitle = `W${win.winIdx + 1}: ${catalogTitle}`;
    clearAllWeatherLayersFromMap(map, win);

    if (isObservation) {
      const obsPath = model === "SURFACE" ? `SURFACE/${element}` : (model === "UPPER_AIR" ? `UPPER_AIR/${element}/${win.level || 500}` : `${model}/${element}`);
      const latestFile = await syncObservationTimeline(obsPath, obsTime || win.obsTime, winBannerTitle);
      win.obsTime = latestFile;
      if (model === "UPPER_AIR") await loadUpperAirComposite(map, win.level || 500, latestFile, win);
      else await loadObservationProduct(map, model, element, win.level, latestFile, win);
    } else {
      setTimelineMode("nwp", { period: win.period ?? 24, winTitle: winBannerTitle });
      await loadWeatherField(map, model, element, win.level, win.period, null, win);
    }
  });

  // ── Layer Control ────────────────────────────────────────────────────────
  initLayerControl("layer-control", (action, layerId, value, layer) => {
    handleLayerAction(getMap(), action, layerId, value, layer, getActiveWindow());
  });

  // ── Time Slider ──────────────────────────────────────────────────────────
  initTimeSlider("timeslider-container", async (data) => {
    const win = getActiveWindow();
    const map = getMap();
    if (!win || !map) return;
    if (typeof data === "object" && data.isObs) {
      win.obsTime = data.file;
      clearAllWeatherLayersFromMap(map, win);
      if (win.activeGroup) {
        await loadPresetGroup(map, win.activeGroup, win.period, win.level, win);
      } else {
        const model = win.model || "SURFACE";
        const element = win.element || "PLOT_GLOBAL_3H";
        const level = win.level;
        if (model === "UPPER_AIR") {
          await loadUpperAirComposite(map, level || 500, data.file, win);
        } else {
          await loadObservationProduct(map, model, element, level, data.file, win);
        }
      }
    } else {
      const period = typeof data === "number" ? data : win.period;
      win.period = period;
      const activeGroup = win.activeGroup;
      if (activeGroup) {
        await loadPresetGroup(map, activeGroup, period, win.level, win, true);
      } else {
        await loadWeatherField(map, win.model, win.element, win.level, period, null, win, true);
      }
    }
  });

  // ── Boot First Window Map ────────────────────────────────────────────────
  const firstWin = firstTab?.windows[0];
  const map = firstWin?.map;

  const onReady = () => {
    console.log("[Main] Map ready, workstation initialized with clean base canvas.");
    window.__WEATHER_FIELD_LOADED__ = false;
  };

  if (map) {
    if (map.isStyleLoaded() || map.loaded()) {
      onReady();
    } else {
      map.once("load", onReady);
    }
  }
}

const forecastCycleCache = {};
async function resolveLatestForecastCycle(model = "ECMWF_HR", element = "TMP", level = 500) {
  const path = `${model}/${element}/${level || 500}`;
  if (forecastCycleCache[path]) return forecastCycleCache[path];
  try {
    const res = await fetchLatest(path, "*.000");
    if (res && res.latest) {
      const cycle = res.latest.split(".")[0];
      if (cycle) {
        forecastCycleCache[path] = cycle;
        forecastCycleCache[model] = cycle;
        return cycle;
      }
    }
  } catch (err) {
    console.warn(`[Forecast] Fetch latest cycle failed for ${path}:`, err);
  }
  return forecastCycleCache[model] || "26082820";
}

async function loadWeatherField(map, model, element, level, period, customOptions = null, win = null, isTimeStep = false) {
  let cycle = win?.forecastCycle;
  if (!cycle) {
    cycle = await resolveLatestForecastCycle(model, element, level);
    if (win) win.forecastCycle = cycle;
  }
  const file = `${cycle}.${String(period).padStart(3, "0")}`;
  const path = `${model}/${element}/${level}`;
  const isWind = element === "WIND" || customOptions?.isWind;
  const layerId = isWind ? `wind-${element}-${level}` : `contour-${element}-${level}`;
  const name = isWind ? `${level} hPa Wind Field (${model})` : `${level} hPa ${element} (${model})`;

  const existingLayer = getLayerById(layerId, win);
  const exCfg = existingLayer?.config || {};

  const isHeight = element === "HGT";
  const isTemp = element === "TMP";
  const defaultLineColor = isHeight ? "#58a6ff" : (isTemp ? "#f85149" : "#ffffff");
  const lineColor = existingLayer?.color || exCfg.lineColor || customOptions?.lineColor || defaultLineColor;
  const opacity = exCfg.opacity !== undefined ? exCfg.opacity : (customOptions?.opacity !== undefined ? customOptions.opacity : 0.75);
  const showFill = exCfg.showFill !== undefined ? exCfg.showFill : (customOptions?.showFill !== undefined ? customOptions.showFill : (!isHeight && !isWind));
  const showLine = exCfg.showLine !== undefined ? exCfg.showLine : (customOptions?.showLine !== undefined ? customOptions.showLine : !isWind);
  const lineWidth = exCfg.lineWidth !== undefined ? exCfg.lineWidth : (customOptions?.lineWidth || 1.4);
  const showWind = exCfg.showWind !== undefined ? exCfg.showWind : (customOptions?.showWind !== undefined ? customOptions.showWind : isWind);
  const showBarbs = exCfg.showBarbs !== undefined ? exCfg.showBarbs : (customOptions?.showBarbs !== undefined ? customOptions.showBarbs : false);
  const showRaster = exCfg.showRaster !== undefined ? exCfg.showRaster : false;
  const isVisible = existingLayer ? existingLayer.visible !== false : true;

  try {
    const gridData = await fetchGridData(path, file);
    appState.set("gridData", gridData);
    if (win) {
      win.gridData = gridData;
      if (isWind) win.windGridData = gridData;
    }
    const colormap = customOptions?.colormap || element;
    if (win) win.colormap = colormap;

    if (!isWind) {
      renderContourLayers(map, gridData, element, {
        layerId,
        showFill: isVisible && showFill,
        showLine: isVisible && showLine,
        lineColor,
        lineWidth,
        boldValues: customOptions?.boldValues,
        boldLineWidth: customOptions?.boldLineWidth,
        opacity,
        colormap,
      });
    }

    addOrUpdateLayer({
      id: layerId,
      name,
      type: isWind ? "wind" : "contour",
      element,
      level,
      model,
      gridData,
      color: lineColor,
      visible: isVisible,
      config: isWind ? {
        showWind,
        showBarbs,
        showRaster,
      } : {
        showFill,
        showLine,
        lineColor,
        opacity,
        lineWidth,
        boldValues: customOptions?.boldValues,
        boldLineWidth: customOptions?.boldLineWidth,
        showRaster,
        showWind: false,
        showBarbs: false,
      },
    }, win);

    if ((showRaster || appState.state.layers.raster) && isVisible) {
      if (gridData && gridData.values) {
        renderGridRaster(map, gridData, element, colormap);
      } else {
        const binBuffer = await fetchGridBinaryStream(path, file);
        renderBinaryRaster(map, binBuffer, element, colormap);
      }
    }

    if (isWind && gridData.u && gridData.v) {
      if (isVisible && showWind) {
        renderWindStreamlines(map, gridData);
      } else {
        stopWindAnimation(map);
      }
      if (isVisible && showBarbs) {
        renderGridWindBarbs(map, gridData);
      } else {
        removeGridWindBarbs(map);
      }
    }

    updateLegend(element, colormap);
  } catch (err) {
    console.error(`[Bootstrap] Field load failed for ${path}/${file}:`, err);
  }
}

async function syncObservationTimeline(path, currentFile = null, winTitle = "", win = null) {
  try {
    const fileEntries = await fetchTree(path);
    if (Array.isArray(fileEntries) && fileEntries.length > 0) {
      let validFiles = fileEntries.filter((f) => f.name && (f.size > 100 || f.size === 0)).map((f) => f.name);
      const hasObsFormat = validFiles.some((f) => f.length >= 14 && f.endsWith(".000"));
      validFiles = hasObsFormat ? validFiles.filter((f) => f.length >= 14 && f.endsWith(".000")) : DEFAULT_MOCK_OBS_FILES;
      if (validFiles.length > 0) {
        const recentFiles = validFiles.length >= 2 && validFiles !== DEFAULT_MOCK_OBS_FILES ? validFiles.slice(0, 10).reverse() : DEFAULT_MOCK_OBS_FILES;
        const targetFile = currentFile && recentFiles.includes(currentFile) ? currentFile : recentFiles[recentFiles.length - 1];
        if (!win || getActiveWindow() === win) setTimelineMode("obs", { file: targetFile, files: recentFiles, winTitle });
        return targetFile;
      }
    }
  } catch (err) {
    console.warn("[Main] Failed to query observation file tree for timeline:", err);
  }
  const fallbackFile = currentFile || DEFAULT_MOCK_OBS_FILES[DEFAULT_MOCK_OBS_FILES.length - 1];
  if (!win || getActiveWindow() === win) setTimelineMode("obs", { file: fallbackFile, files: DEFAULT_MOCK_OBS_FILES, winTitle });
  return fallbackFile;
}

async function loadUpperAirComposite(map, level = 500, obsTime = "20260828170000.000", win = getActiveWindow()) {
  const path = `UPPER_AIR/PLOT/${level || 500}`;
  const stations = await fetchStationObservations(path, obsTime);
  appState.set("stationData", stations);
  renderStationWeatherPlots(map, stations, appState.state.layers.station);
  addOrUpdateLayer({ id: `station-upper-${level}`, name: `Upper Air ${level}hPa Soundings`, type: "station", color: "#e3b341", visible: true, removable: true }, win);
  if (stations?.features?.length >= 3) analyzeAndRenderSoundingContours(map, stations, level);
}

async function loadObservationProduct(map, model, element, level, file, win = getActiveWindow(), customPath = null) {
  const path = customPath || (model === "SURFACE" ? `SURFACE/${element}` : (model === "UPPER_AIR" ? `UPPER_AIR/${element}/${level || 500}` : `${model}/${element}`));
  try {
    const stations = await fetchStationObservations(path, file);
    appState.set("stationData", stations);
    renderStationWeatherPlots(map, stations, appState.state.layers.station);
    const layerId = model === "UPPER_AIR" ? `station-upper-${level || 500}` : `station-${model.toLowerCase()}`;
    const name = model === "UPPER_AIR" ? `${level || 500} hPa Sounding Station Plots` : `${model === "SURFACE" ? "Surface" : "Upper Air"} Station Observations`;
    addOrUpdateLayer({ id: layerId, name, type: "station", color: "#e3b341", visible: true, removable: true }, win);
    if (model === "SURFACE" && stations?.features?.length >= 3) analyzeAndRenderSurfaceSLPContours(map, stations, {}, win);
    if (model === "UPPER_AIR" && stations?.features?.length >= 3) analyzeAndRenderSoundingContours(map, stations, level || 500, {}, win);
  } catch (err) {
    console.error("[Main] Observation load error:", err);
  }
}

export function clearAllWeatherLayersFromMap(map, win = null) {
  if (!map) return;
  try {
    removeAllContourLayers(map);
    stopWindAnimation(map);
    removeGridWindBarbs(map);
    removeStationLayer(map);
    removeRasterLayer(map);
  } catch (err) {
    console.warn("[Main] Error cleaning up weather layers:", err);
  }
  if (win) {
    clearWindowWeatherLayers(win);
  }
}

async function loadPresetGroup(map, group, period = null, level = null, win = null, isTimeStep = false) {
  if (!group || !group.layers) return;
  if (!isTimeStep) {
    clearAllWeatherLayersFromMap(map, win);
  }

  const curPeriod = period !== null ? period : (win?.period ?? 24);
  const curLevel = level !== null ? level : (group.defaultLevel || win?.level || 500);

  if (win) {
    if (level !== null) win.level = level;
    win.period = curPeriod;
    updateWindowTitle(win, group.name);
    setWindowHeaderPreset(win, group.id);
  }
  if (win && getActiveWindow() === win) {
    appState.update({
      activeGroup: group,
      level: win.level,
      period: curPeriod,
      model: win.model,
      element: win.element,
      obsTime: win.obsTime,
      isObservation: win.isObservation,
    });
    setNavBarPreset(group.id);
  }

  if (win && !win.forecastCycle) {
    const pLayer = group.layers.find((l) => l.type === "contour" || l.type === "wind");
    if (pLayer) {
      win.forecastCycle = await resolveLatestForecastCycle(pLayer.model || "ECMWF_HR", pLayer.element || "TMP", curLevel);
    }
  }

  const winTitle = `W${(win?.winIdx ?? 0) + 1}: ${group.name}`;
  if (!group.isObservation && win) {
    setTimelineMode("nwp", { period: curPeriod, winTitle, initCycle: win.forecastCycle });
  }

  console.log(`[PresetGroup] Loading "${group.name}" with levelOverride=${level}, period=+${curPeriod}h, cycle=${win?.forecastCycle}...`);

  await Promise.allSettled(
    group.layers.map(async (layer) => {
      let targetLevel = null;
      if (level !== null) {
        targetLevel = (layer.model === "SURFACE" || layer.level === 0) ? null : level;
      } else {
        targetLevel = layer.level || (group.hasLevel ? group.defaultLevel : null);
      }

      if (layer.type === "contour" || layer.type === "wind") {
        const render = layer.render || {};
        await loadWeatherField(map, layer.model, layer.element, targetLevel, curPeriod, {
          ...render,
          keepWind: true,
          colormap: resolveColormap(group, render, targetLevel),
        }, win, isTimeStep);
      } else if (layer.type === "station") {
        const obsPath = layer.path || (layer.model === "UPPER_AIR"
          ? `UPPER_AIR/${layer.element}/${targetLevel || 500}`
          : `${layer.model}/${layer.element}`);
        let file = win?.obsTime;
        if (!file) {
          file = await syncObservationTimeline(obsPath, null, winTitle);
          if (win) win.obsTime = file;
        }
        await loadObservationProduct(map, layer.model, layer.element, targetLevel, file, win, layer.path);
      }
    })
  );
}

async function changeVerticalLevel(map, direction, explicitLevel = null, win = getActiveWindow()) {
  const levels = [1000, 925, 850, 700, 500, 400, 300, 200, 100];
  let targetLevel = explicitLevel;

  if (targetLevel === null) {
    const curLevel = win?.level || 500;
    let idx = levels.indexOf(curLevel);
    if (idx === -1) idx = 4;

    let newIdx = idx + direction;
    if (newIdx < 0) newIdx = 0;
    if (newIdx >= levels.length) newIdx = levels.length - 1;
    targetLevel = levels[newIdx];
    if (targetLevel === curLevel) return;
  }

  console.log(`[Level] Setting vertical level to ${targetLevel} hPa`);
  if (win) win.level = targetLevel;
  if (win && getActiveWindow() === win) appState.set("level", targetLevel);
  setNavBarLevel(targetLevel);

  const activeGroup = win?.activeGroup;
  if (activeGroup && activeGroup.hasLevel) {
    await loadPresetGroup(map, activeGroup, win.period, targetLevel, win);
  } else if (win?.isObservation || win?.model === "UPPER_AIR") {
    clearAllWeatherLayersFromMap(map, win);
    const obsPath = `UPPER_AIR/PLOT/${targetLevel}`;
    const winTitle = `W${(win?.winIdx ?? 0) + 1}: Upper-Air ${targetLevel}hPa Sounding`;
    const file = await syncObservationTimeline(obsPath, null, winTitle, win);
    if (win) {
      win.obsTime = file;
      updateWindowTitle(win, `${targetLevel}hPa Upper-Air Sounding`);
    }
    await loadObservationProduct(map, "UPPER_AIR", "PLOT", targetLevel, file, win, obsPath);
  } else {
    clearAllWeatherLayersFromMap(map, win);
    const model = win?.model || "ECMWF_HR";
    const element = win?.element || "TMP";
    const period = win?.period ?? 24;
    await loadWeatherField(map, model, element, targetLevel, period, null, win);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
