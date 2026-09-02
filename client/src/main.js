// main.js - Application bootstrap and orchestrator
import { getActiveMap } from "./map/mapInstance.js";
import { initNavBar, refreshNavBarPresets, setNavBarLevel, setNavBarPreset } from "./ui/navBar.js";
import { initCatalogDrawer } from "./ui/catalogDrawer.js";
import { initLayerControl, addOrUpdateLayer, syncLayerControlForWindow, clearWindowWeatherLayers, getLayerById, getLayersForWindow } from "./ui/layerControl.js";
import { initTimeSlider, setTimelineMode, setTimeSliderVisible, step as timeSliderStep } from "./ui/timeSlider.js";
import { handleLayerAction, triggerStationStreamlines } from "./ui/layerActions.js";
import { initTooltip } from "./ui/tooltip.js";
import { renderContourLayers, removeAllContourLayers } from "./layers/contourLayer.js";
import { renderBinaryRaster, renderGridRaster, removeRasterLayer } from "./layers/rasterLayer.js";
import { renderStationWeatherPlots, setStationVisibility, removeStationLayer } from "./layers/stationLayer.js";
import { renderWindStreamlines, stopWindAnimation, renderGridWindBarbs, removeGridWindBarbs } from "./layers/windLayer.js";
import { analyzeAndRenderSoundingContours, analyzeAndRenderSoundingElementContour } from "./layers/soundingAnalysis.js";
import { analyzeAndRenderSurfaceContours, analyzeAndRenderSurfaceSLPContours } from "./layers/surfaceAnalysis.js";
import { fetchGridData, fetchGridBinaryStream, fetchStationObservations } from "./api/catalogApi.js";
import { updateLegend, clearLegends, syncLegendForWindow } from "./ui/legend.js";
import { initKeyboardShortcuts } from "./ui/keyboardShortcuts.js";
import { initConfigEditor, openConfigTab } from "./ui/configEditor.js";
import { appState } from "./store/appState.js";
import { loadPresetGroups } from "./config/presets.js";
import { resolveColormap } from "./utils/colormaps.js";
import { resolveForecastCycles, resolveLatestForecastCycle, syncObservationTimeline, invalidateForecastCyclesCache } from "./utils/timelineSync.js";
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

function ensureErrorToast() {
  let el = document.getElementById("error-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "error-toast";
    el.className = "hidden";
    el.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#21262d;color:#f85149;border:1px solid #da3633;border-radius:6px;padding:8px 14px;font-size:12px;z-index:9999;max-width:80vw;box-shadow:0 4px 12px rgba(0,0,0,0.4);";
    document.body.appendChild(el);
  }
  return el;
}

function showErrorToast(msg) {
  const el = ensureErrorToast();
  el.textContent = msg;
  el.classList.remove("hidden");
  el.style.display = "block";
  clearTimeout(showErrorToast._tid);
  showErrorToast._tid = setTimeout(() => {
    el.classList.add("hidden");
    el.style.display = "none";
  }, 4000);
}

async function reloadConfiguration() {
  invalidateForecastCyclesCache();
  await loadPresetGroups();
  refreshPresetControls();
  refreshNavBarPresets();
  console.log("[Config] Preset configuration reloaded");
  const win = getActiveWindow();
  if (win?.map) {
    win.forecastCycle = null;
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

      // Synchronously update layer panel and legends for focused window
      syncLayerControlForWindow(win);
      syncLegendForWindow(win);

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
        const pLayer = win.activeGroup?.layers?.find((l) => l.type === "contour" || l.type === "wind");
        resolveForecastCycles(pLayer?.model || win.model || "ECMWF_HR", pLayer?.element || win.element || "TMP", win.level || 500).then((cycles) => {
          if (getActiveWindow() === win) {
            if (!win.forecastCycle || !cycles.includes(win.forecastCycle)) {
              win.forecastCycle = cycles[0];
            }
            setTimelineMode("nwp", { period: win.period ?? 24, winTitle, initCycle: win.forecastCycle, cycles, stepLength: 6 });
          }
        });
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
        const pLayer = group.layers?.find((l) => l.type === "contour" || l.type === "wind");
        const cycles = await resolveForecastCycles(pLayer?.model || win.model || "ECMWF_HR", pLayer?.element || win.element || "TMP", win.level || 500);
        win.forecastCycle = cycles[0];
        if (getActiveWindow() === win) {
          setTimelineMode("nwp", { period: win.period ?? 24, winTitle, initCycle: win.forecastCycle, cycles, stepLength: 6 });
        }
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
      win.level = null;
      win.isObservation = Boolean(group?.isObservation);
      updateWindowTitle(win, group ? group.name : "");
      setWindowHeaderPreset(win, group?.id || "");
      setWindowHeaderLevel(win, null);
    },
    onLevelSelect: (lvl) => {
      const win = getActiveWindow();
      if (!win) return;
      win.level = lvl;
      setWindowHeaderLevel(win, lvl);
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
        const pLayer = group.layers?.find((l) => l.type === "contour" || l.type === "wind");
        const cycles = await resolveForecastCycles(pLayer?.model || win.model || "ECMWF_HR", pLayer?.element || win.element || "TMP", win.level || 500);
        win.forecastCycle = cycles[0];
        setTimelineMode("nwp", { period: win.period ?? 24, winTitle, initCycle: win.forecastCycle, cycles, stepLength: 6 });
      }
      await loadPresetGroup(map, group, win.period, overrideLevel, win);
    },
  });

  initConfigEditor(reloadConfiguration);
  initTooltip("tooltip");
  initKeyboardShortcuts({
    onPeriodStep: (dir) => timeSliderStep(dir),
    onLevelStep: async (dir) => {
      const m = getMap();
      if (!m) return;
      await changeVerticalLevel(m, dir);
    },
    onToggleSplit: () => toggleTabsAndSplit(),
  });

  initCatalogDrawer("catalog-drawer", async ({ model, element, level, period, obsTime, isObservation }) => {
    const map = getMap(), win = getActiveWindow();
    if (!win || !map) return;
    const upd = { activeGroup: null, model, element, level: level !== null ? level : win.level, period: period !== null ? period : win.period, obsTime, isObservation, forecastCycle: null };
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
      const cycles = await resolveForecastCycles(model, element, win.level || 500);
      win.forecastCycle = cycles[0];
      setTimelineMode("nwp", { period: win.period ?? 24, winTitle: winBannerTitle, initCycle: win.forecastCycle, cycles, stepLength: 6 });
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
    if (typeof data === "object" && data !== null && data.isObs) {
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
    } else if (typeof data === "object" && data !== null && data.isInitChange) {
      win.forecastCycle = data.initCycle;
      const period = typeof data.period === "number" ? data.period : (win.period ?? 24);
      win.period = period;
      clearAllWeatherLayersFromMap(map, win);
      const activeGroup = win.activeGroup;
      if (activeGroup) {
        await loadPresetGroup(map, activeGroup, period, win.level, win, false);
      } else {
        await loadWeatherField(map, win.model, win.element, win.level, period, null, win, false);
      }
    } else {
      let period = win.period ?? 24;
      if (typeof data === "number") {
        period = data;
      } else if (typeof data === "object" && data !== null) {
        if (typeof data.period === "number") {
          period = data.period;
        } else if (typeof data.valueOf === "function" && typeof data.valueOf() === "number") {
          period = data.valueOf();
        }
      }
      win.loadSeq = (win.loadSeq || 0) + 1;
      const expectedSeq = win.loadSeq;
      win.period = period;
      appState.set("period", period);
      const activeGroup = win.activeGroup;
      if (activeGroup) {
        await loadPresetGroup(map, activeGroup, period, win.level, win, true, expectedSeq);
      } else {
        await loadWeatherField(map, win.model, win.element, win.level, period, null, win, true, expectedSeq);
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

async function loadWeatherField(map, model, element, level, period, customOptions = null, win = null, isTimeStep = false, expectedSeq = null) {
  let cycle = win?.forecastCycle;
  if (!cycle) {
    cycle = await resolveLatestForecastCycle(model, element, level);
    if (win) win.forecastCycle = cycle;
  }
  const file = `${cycle}.${String(period).padStart(3, "0")}`;
  const path = `${model}/${element}/${level}`;
  const isWind = element === "WIND" || customOptions?.isWind;
  const layerId = customOptions?.id || (isWind ? `wind-${element}` : `contour-${element}`);
  const name = isWind ? `${level} hPa Wind Field (${model})` : `${level} hPa ${element} (${model})`;

  const existingLayer = getLayerById(layerId, win);
  const exCfg = existingLayer?.config || {};

  const isHeight = element === "HGT";
  const isTemp = element === "TMP";
  const defaultLineColor = isHeight ? "#58a6ff" : (isTemp ? "#f85149" : "#ffffff");
  const lineColor = existingLayer?.color || exCfg.lineColor || customOptions?.lineColor || defaultLineColor;
  const opacity = exCfg.opacity ?? customOptions?.opacity ?? 0.75;
  const showFill = exCfg.showFill ?? customOptions?.showFill ?? (!isHeight && !isWind);
  const showLine = exCfg.showLine ?? customOptions?.showLine ?? !isWind;
  const lineWidth = exCfg.lineWidth ?? customOptions?.lineWidth ?? 1.4;
  const showWind = exCfg.showWind ?? customOptions?.showWind ?? isWind;
  const showBarbs = exCfg.showBarbs ?? customOptions?.showBarbs ?? false;
  const showRaster = exCfg.showRaster ?? false;
  const savedPalettePath = exCfg.palettePath || null;
  const isVisible = existingLayer ? existingLayer.visible !== false : true;
  const smooth = exCfg.smooth ?? customOptions?.smooth ?? true;
  const smoothIterations = exCfg.smoothIterations ?? customOptions?.smoothIterations ?? 2;

  try {
    const gridData = await fetchGridData(path, file);
    if (win && expectedSeq !== null && expectedSeq !== undefined && win.loadSeq !== expectedSeq) {
      return; // Discard stale in-flight response from fast navigation
    }
    let colormap = customOptions?.colormap || element;

    // Restore a previously-chosen XML palette for this layer
    if (savedPalettePath) {
      const paletteKey = `palette:${layerId}`;
      try {
        const { loadXMLPalette } = await import("./utils/paletteLoader.js");
        const { setColormaps, COLORMAPS } = await import("./utils/colormaps.js");
        const stops = await loadXMLPalette(savedPalettePath);
        if (stops) {
          setColormaps({ ...COLORMAPS, [paletteKey]: stops });
          if (existingLayer) existingLayer.colormap = paletteKey;
          colormap = paletteKey;
        }
      } catch { /* ignore — fall back to built-in */ }
    }

    if (!win?.activeGroup) {
      appState.set("gridData", gridData);
      if (win) {
        win.gridData = gridData;
        win.element = element;
        win.model = model;
        win.colormap = colormap;
      }
    }
    if (win && isWind) {
      win.windGridData = gridData;
    }

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
        smooth,
        smoothIterations,
      });
    }

    addOrUpdateLayer({
      id: layerId,
      name,
      type: isWind ? "wind" : "contour",
      element,
      level,
      model,
      path,
      file,
      gridData,
      colormap,
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
        smooth,
        smoothIterations,
      },
    }, win);

    // Bug fix: addOrUpdateLayer only re-renders the panel when winId === currentActiveWinId.
    // If the user switched tabs while data was loading, currentActiveWinId may differ even though
    // win is still the correct active window. Force a panel sync here to make layers visible immediately.
    if (win && getActiveWindow() === win) {
      syncLayerControlForWindow(win);
    }

    if ((showRaster || appState.state.layers.raster) && isVisible) {
      if (gridData && (gridData.values || (gridData.u && gridData.v))) {
        renderGridRaster(map, gridData, element, colormap, { layerId, opacity });
      } else {
        const binBuffer = await fetchGridBinaryStream(path, file);
        renderBinaryRaster(map, binBuffer, element, colormap, { layerId, opacity });
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

    updateLegend(element, colormap, gridData.stats?.min, gridData.stats?.max, win);
  } catch (err) {
    console.error(`[Bootstrap] Field load failed for ${path}/${file}:`, err);
    showErrorToast(`Failed to load ${element} ${level}hPa: ${err.message || err}`);
  }
}

async function loadUpperAirComposite(map, level = 500, obsTime = "20260828170000.000", win = getActiveWindow(), expectedSeq = null) {
  const path = `UPPER_AIR/PLOT/${level || 500}`;
  let stations;
  try {
    stations = await fetchStationObservations(path, obsTime);
  } catch (err) {
    console.error("[Main] Upper-air composite load error:", err);
    showErrorToast(`Upper-air load failed (${level}hPa): ${err.message || err}`);
    return;
  }
  if (win && expectedSeq !== null && expectedSeq !== undefined && win.loadSeq !== expectedSeq) {
    return; // Discard stale in-flight response from fast navigation
  }
  appState.set("stationData", stations);
  renderStationWeatherPlots(map, stations, appState.state.layers.station);
  const stnLayer = addOrUpdateLayer({ id: "station-upper", name: `${level || 500} hPa Sounding Station Plots`, type: "station", color: "#e3b341", visible: true, removable: true, stationsGeoJSON: stations }, win);
  if (win && getActiveWindow() === win) syncLayerControlForWindow(win);
  if (stations?.features?.length >= 3) {
    const winLayers = getLayersForWindow(win);
    const activeUpperContours = winLayers.filter((l) => l.type === "contour" && l.model === "UPPER_AIR");
    if (activeUpperContours.length > 0) {
      for (const cLayer of activeUpperContours) {
        analyzeAndRenderSoundingElementContour(map, stations, level || 500, cLayer.element || "HGT", cLayer.config || {}, win);
      }
    } else {
      analyzeAndRenderSoundingContours(map, stations, level || 500, {}, win);
    }
  }
}

async function loadObservationProduct(map, model, element, level, file, win = getActiveWindow(), customPath = null, expectedSeq = null) {
  const path = customPath || (model === "SURFACE" ? `SURFACE/${element}` : (model === "UPPER_AIR" ? `UPPER_AIR/${element}/${level || 500}` : `${model}/${element}`));
  try {
    const stations = await fetchStationObservations(path, file);
    if (win && expectedSeq !== null && expectedSeq !== undefined && win.loadSeq !== expectedSeq) {
      return; // Discard stale in-flight response from fast navigation
    }
    appState.set("stationData", stations);
    renderStationWeatherPlots(map, stations, appState.state.layers.station);
    const layerId = model === "UPPER_AIR" ? "station-upper" : `station-${model.toLowerCase()}`;
    const name = model === "UPPER_AIR" ? `${level || 500} hPa Sounding Station Plots` : `${model === "SURFACE" ? "Surface" : "Upper Air"} Station Observations`;
    const stnLayer = addOrUpdateLayer({ id: layerId, name, type: "station", color: "#e3b341", visible: true, removable: true, stationsGeoJSON: stations }, win);
    if (win && getActiveWindow() === win) syncLayerControlForWindow(win);
    if (stnLayer?.config?.showStreamlines) triggerStationStreamlines(map, stnLayer, win);
    if (model === "SURFACE" && stations?.features?.length >= 3) {
      const winLayers = getLayersForWindow(win);
      const activeSurfaceContours = winLayers.filter((l) => l.type === "contour" && l.model === "SURFACE");
      if (activeSurfaceContours.length > 0) {
        for (const cLayer of activeSurfaceContours) {
          analyzeAndRenderSurfaceContours(map, stations, cLayer.element || "SLP", cLayer.config || {}, win);
        }
      } else {
        analyzeAndRenderSurfaceContours(map, stations, "SLP", {}, win);
      }
    }
    if (model === "UPPER_AIR" && stations?.features?.length >= 3) {
      const winLayers = getLayersForWindow(win);
      const activeUpperContours = winLayers.filter((l) => l.type === "contour" && l.model === "UPPER_AIR");
      if (activeUpperContours.length > 0) {
        for (const cLayer of activeUpperContours) {
          analyzeAndRenderSoundingElementContour(map, stations, level || 500, cLayer.element || "HGT", cLayer.config || {}, win);
        }
      } else {
        analyzeAndRenderSoundingContours(map, stations, level || 500, {}, win);
      }
    }
  } catch (err) {
    console.error("[Main] Observation load error:", err);
    showErrorToast(`Observation load failed: ${err.message || err}`);
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
    clearLegends(win);
  } catch (err) {
    console.warn("[Main] Error cleaning up weather layers:", err);
  }
  if (win) {
    clearWindowWeatherLayers(win);
  }
}

async function loadPresetGroup(map, group, period = null, level = null, win = null, isTimeStep = false, expectedSeq = null) {
  if (!group || !group.layers) return;
  if (!isTimeStep) {
    clearAllWeatherLayersFromMap(map, win);
  }

  const curPeriod = period !== null ? period : (win?.period ?? 24);
  const curLevel = level !== null ? level : (group.defaultLevel || win?.level || 500);
  const prevPeriod = win?.period;

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

  const winTitle = `W${(win?.winIdx ?? 0) + 1}: ${group.name}`;
  if (!group.isObservation && win) {
    const pLayer = group.layers.find((l) => l.type === "contour" || l.type === "wind");
    const cycles = await resolveForecastCycles(pLayer?.model || win.model || "ECMWF_HR", pLayer?.element || win.element || "TMP", curLevel);
    if (!win.forecastCycle || !cycles.includes(win.forecastCycle)) {
      win.forecastCycle = cycles[0];
    }
    setTimelineMode("nwp", { period: curPeriod, winTitle, initCycle: win.forecastCycle, cycles, stepLength: 6 });
  }

  console.log(`[PresetGroup] Loading "${group.name}" with levelOverride=${level}, period=+${curPeriod}h, cycle=${win?.forecastCycle}...`);

  const results = await Promise.allSettled(
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
          id: layer.id,
          keepWind: true,
          colormap: resolveColormap(group, render, targetLevel),
        }, win, isTimeStep, expectedSeq);
      } else if (layer.type === "station") {
        const obsPath = layer.path || (layer.model === "UPPER_AIR"
          ? `UPPER_AIR/${layer.element}/${targetLevel || 500}`
          : `${layer.model}/${layer.element}`);
        let file = win?.obsTime;
        if (!file) {
          file = await syncObservationTimeline(obsPath, null, winTitle);
          if (win) win.obsTime = file;
        }
        await loadObservationProduct(map, layer.model, layer.element, targetLevel, file, win, layer.path, expectedSeq);
      }
    })
  );
  const anySuccess = results.some((r) => r.status === "fulfilled");
  if (!anySuccess && win && prevPeriod !== undefined) {
    // Rollback period assignment if all layer loads failed
    win.period = prevPeriod;
  }
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

  if (win) {
    win.loadSeq = (win.loadSeq || 0) + 1;
  }
  const currentSeq = win?.loadSeq;

  console.log(`[Level] Setting vertical level to ${targetLevel} hPa (seq=${currentSeq})`);
  if (win) win.level = targetLevel;
  if (win && getActiveWindow() === win) appState.set("level", targetLevel);
  setNavBarLevel(targetLevel);
  setWindowHeaderLevel(win, targetLevel);

  const activeGroup = win?.activeGroup;
  if (activeGroup && activeGroup.hasLevel) {
    await loadPresetGroup(map, activeGroup, win.period, targetLevel, win, false, currentSeq);
  } else if (win?.isObservation || win?.model === "UPPER_AIR") {
    clearAllWeatherLayersFromMap(map, win);
    const obsPath = `UPPER_AIR/PLOT/${targetLevel}`;
    const winTitle = `W${(win?.winIdx ?? 0) + 1}: Upper-Air ${targetLevel}hPa Sounding`;
    const file = await syncObservationTimeline(obsPath, null, winTitle, win);
    if (win && win.loadSeq !== currentSeq) return;
    if (win) {
      win.obsTime = file;
      updateWindowTitle(win, `${targetLevel}hPa Upper-Air Sounding`);
    }
    await loadObservationProduct(map, "UPPER_AIR", "PLOT", targetLevel, file, win, obsPath, currentSeq);
  } else {
    clearAllWeatherLayersFromMap(map, win);
    const model = win?.model || "ECMWF_HR";
    const element = win?.element || "TMP";
    const period = win?.period ?? 24;
    await loadWeatherField(map, model, element, targetLevel, period, null, win, false, currentSeq);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
