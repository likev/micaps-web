// main.js - Application bootstrap and orchestrator
import { getActiveMap } from "./map/mapInstance.js";
import { initNavBar, refreshNavBarPresets } from "./ui/navBar.js";
import { initCatalogDrawer } from "./ui/catalogDrawer.js";
import {
  initLayerControl,
  addOrUpdateLayer,
  removeLayer,
  syncLayerControlForWindow,
  clearWindowWeatherLayers,
} from "./ui/layerControl.js";
import { initTimeSlider, setTimelineMode } from "./ui/timeSlider.js";
import { initTooltip } from "./ui/tooltip.js";
import {
  renderContourLayers,
  setLayerIsobandVisibility,
  setLayerIsolineVisibility,
  setLayerIsolineColor,
  setLayerIsobandOpacity,
  removeContourLayer,
  removeAllContourLayers,
  setIsobandVisibility,
  setIsolineVisibility,
  setContourOpacity,
} from "./layers/contourLayer.js";
import { renderBinaryRaster, setRasterVisibility, removeRasterLayer } from "./layers/rasterLayer.js";
import { renderStationWeatherPlots, setStationVisibility, removeStationLayer } from "./layers/stationLayer.js";
import { renderWindStreamlines, stopWindAnimation } from "./layers/windLayer.js";
import { analyzeAndRenderSoundingContours } from "./layers/soundingAnalysis.js";
import { analyzeAndRenderSurfaceSLPContours } from "./layers/surfaceAnalysis.js";
import { fetchGridData, fetchGridBinaryStream, fetchStationObservations } from "./api/catalogApi.js";
import { updateLegend } from "./ui/legend.js";
import { initKeyboardShortcuts } from "./ui/keyboardShortcuts.js";
import { appState } from "./store/appState.js";
import { loadPresetGroups } from "./config/presets.js";
import { setNavBarLevel, setNavBarPreset } from "./ui/navBar.js";
import { step as timeSliderStep } from "./ui/timeSlider.js";
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
      setNavBarPreset(win.activeGroup?.id || "");
      if (win.level) setNavBarLevel(win.level);

      const winTitle = win.activeGroup ? `W${win.winIdx + 1}: ${win.activeGroup.name}` : "";
      const isObs = Boolean(win.isObservation || win.activeGroup?.isObservation || win.model === "SURFACE" || win.model === "UPPER_AIR");
      if (isObs) {
        setTimelineMode("obs", { file: win.obsTime || "20260827200000.000", winTitle });
      } else {
        setTimelineMode("nwp", { period: win.period ?? 24, winTitle });
      }
      syncLayerControlForWindow(win);
    },
    onWindowGroupChange: async (win, group) => {
      if (!win.map || !group) return;
      win.activeGroup = group;
      win.isObservation = Boolean(group.isObservation);
      if (group.defaultLevel) win.level = group.defaultLevel;
      const winTitle = `W${win.winIdx + 1}: ${group.name}`;
      updateWindowTitle(win, group.name);
      setWindowHeaderPreset(win, group.id);
      if (win.isObservation) {
        setTimelineMode("obs", { file: win.obsTime || "20260827200000.000", winTitle });
      } else {
        setTimelineMode("nwp", { period: win.period ?? 24, winTitle });
      }
      await loadPresetGroup(win.map, group, win.period, win.level, win);
    },
    onWindowLevelChange: async (win, level) => {
      if (!win.map) return;
      win.level = level;
      if (win.activeGroup && win.activeGroup.hasLevel) {
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
          await loadPresetGroup(win.map, win.activeGroup, win.period, win.level, win);
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
    onConfigReload: reloadConfiguration,
    onPresetSelect: (group) => {
      const win = getActiveWindow();
      if (!win) return;
      win.activeGroup = group;
      win.isObservation = Boolean(group?.isObservation);
      if (group?.defaultLevel) win.level = group.defaultLevel;
      updateWindowTitle(win, group ? group.name : "");
      setWindowHeaderPreset(win, group?.id || "");
      if (group?.defaultLevel) setWindowHeaderLevel(win, group.defaultLevel);
    },
    onLevelSelect: (lvl) => {
      const win = getActiveWindow();
      if (!win) return;
      win.level = lvl;
      setWindowHeaderLevel(win, lvl);
    },
    onLoadData: async (group) => {
      const win = getActiveWindow();
      const map = win?.map || getActiveMap();
      if (!win || !map || !group) return;
      win.activeGroup = group;
      win.isObservation = Boolean(group.isObservation);
      if (group.defaultLevel && !win.level) win.level = group.defaultLevel;
      const winTitle = `W${win.winIdx + 1}: ${group.name}`;
      updateWindowTitle(win, group.name);
      setWindowHeaderPreset(win, group.id);
      if (win.isObservation) {
        setTimelineMode("obs", { file: win.obsTime || "20260827200000.000", winTitle });
      } else {
        setTimelineMode("nwp", { period: win.period ?? 24, winTitle });
      }
      await loadPresetGroup(map, group, win.period, win.level, win);
    },
  });

  initTooltip("tooltip");
  initKeyboardShortcuts({
    onPeriodStep: (dir) => timeSliderStep(dir),
    onLevelStep: (dir) => changeVerticalLevel(getMap(), dir),
    onToggleSplit: () => toggleTabsAndSplit(),
  });

  // ── Catalog Drawer ───────────────────────────────────────────────────────
  initCatalogDrawer("catalog-drawer", async ({ model, element, level, period, obsTime, isObservation }) => {
    const map = getMap();
    const win = getActiveWindow();
    if (!win || !map) return;
    Object.assign(win, {
      activeGroup: null,
      model,
      element,
      level: level !== null ? level : win.level,
      period: period !== null ? period : win.period,
      obsTime,
      isObservation,
    });
    appState.update({
      activeGroup: null,
      model,
      element,
      level: win.level,
      period: win.period,
      obsTime,
      isObservation,
    });
    setNavBarPreset("");
    if (isObservation) {
      setTimelineMode("obs", { file: obsTime });
      if (model === "UPPER_AIR") {
        await loadUpperAirComposite(map, win.level || 500, obsTime);
      } else {
        await loadObservationProduct(map, model, element, win.level, obsTime);
      }
    } else {
      setTimelineMode("nwp", { period: win.period });
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
      const model = win.model || "SURFACE";
      const element = win.element || "PLOT_GLOBAL_3H";
      const level = win.level;
      if (model === "UPPER_AIR") {
        await loadUpperAirComposite(map, level || 500, data.file);
      } else {
        await loadObservationProduct(map, model, element, level, data.file);
      }
    } else {
      const period = typeof data === "number" ? data : win.period;
      win.period = period;
      const activeGroup = win.activeGroup;
      if (activeGroup) {
        await loadPresetGroup(map, activeGroup, period, win.level, win);
      } else {
        await loadWeatherField(map, win.model, win.element, win.level, period, null, win);
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

async function loadWeatherField(map, model, element, level, period, customOptions = null, win = null) {
  const file = `26082708.${String(period).padStart(3, "0")}`;
  const path = `${model}/${element}/${level}`;
  const layerId = `contour-${element}-${level}`;
  const name = `${level} hPa ${element} (${model})`;

  const isHeight = element === "HGT";
  const isTemp = element === "TMP";
  const defaultLineColor = isHeight ? "#58a6ff" : (isTemp ? "#f85149" : "#ffffff");
  const defaultShowFill = customOptions?.showFill !== undefined ? customOptions.showFill : !isHeight;
  const defaultShowLine = customOptions?.showLine !== undefined ? customOptions.showLine : true;
  const lineColor = customOptions?.lineColor || defaultLineColor;
  const opacity = customOptions?.opacity !== undefined ? customOptions.opacity : 0.75;

  try {
    const gridData = await fetchGridData(path, file);
    appState.set("gridData", gridData);
    if (win) win.gridData = gridData;
    const colormap = customOptions?.colormap || element;
    if (win) win.colormap = colormap;

    renderContourLayers(map, gridData, element, {
      layerId,
      showFill: defaultShowFill,
      showLine: defaultShowLine,
      lineColor,
      opacity,
      colormap,
    });

    // Register into Layers Manager for this window
    addOrUpdateLayer({
      id: layerId,
      name,
      type: "contour",
      element,
      level,
      model,
      color: lineColor,
      config: {
        showFill: defaultShowFill,
        showLine: defaultShowLine,
        lineColor,
        opacity,
        lineWidth: 1.4,
      },
    }, win);

    if (appState.state.layers.raster && !isHeight) {
      const binBuffer = await fetchGridBinaryStream(path, file);
      renderBinaryRaster(map, binBuffer, element, colormap);
    }

    if (element === "WIND" && gridData.u && gridData.v) {
      renderWindStreamlines(map, gridData);
    } else if (!customOptions?.keepWind) {
      stopWindAnimation(map);
    }

    updateLegend(element, colormap);
  } catch (err) {
    console.error(`[Bootstrap] Field load failed for ${path}/${file}:`, err);
  }
}

// When upper plot is loaded, display plot and calculate height & temp contour lines from sounding plot data
async function loadUpperAirComposite(map, level = 500, obsTime = "20260827200000.000", win = getActiveWindow()) {
  console.log(`[UpperAir] Loading upper soundings and calculating contour lines for ${level} hPa...`);

  // 1. Load Upper Air Sounding Plots
  const path = `UPPER_AIR/PLOT/${level || 500}`;
  const stations = await fetchStationObservations(path, obsTime);
  appState.set("stationData", stations);
  renderStationWeatherPlots(map, stations, appState.state.layers.station);

  addOrUpdateLayer({
    id: `station-upper-${level}`,
    name: `Upper Air ${level}hPa Soundings`,
    type: "station",
    color: "#e3b341",
    visible: true,
    removable: true,
  }, win);

  // 2. Calculate Height contour lines and Temperature contour lines from sounding plot data
  if (stations && stations.features && stations.features.length >= 3) {
    console.log(`[UpperAir] Calculating objective analysis contours from ${stations.features.length} sounding stations...`);
    analyzeAndRenderSoundingContours(map, stations, level);
  }
}

async function loadObservationProduct(map, model, element, level, file, win = getActiveWindow()) {
  let path = "";
  if (model === "SURFACE") {
    path = `SURFACE/${element}`;
  } else if (model === "UPPER_AIR") {
    path = `UPPER_AIR/${element}/${level || 500}`;
  } else {
    path = `${model}/${element}`;
  }

  try {
    console.log(`[Main] Fetching observation data: path=${path}, file=${file}...`);
    const stations = await fetchStationObservations(path, file);
    appState.set("stationData", stations);
    renderStationWeatherPlots(map, stations, appState.state.layers.station);
    console.log(`[Main] Observation stations rendered (${stations && stations.features ? stations.features.length : 0} stations)`);

    addOrUpdateLayer({
      id: `station-${model.toLowerCase()}`,
      name: `${model === "SURFACE" ? "Surface" : "Upper Air"} Station Observations`,
      type: "station",
      color: "#e3b341",
      visible: true,
      removable: true,
    }, win);

    if (model === "SURFACE" && stations && stations.features && stations.features.length >= 3) {
      console.log(`[Main] Calculating SLP isobars from ${stations.features.length} surface stations...`);
      analyzeAndRenderSurfaceSLPContours(map, stations);
    }
  } catch (err) {
    console.error("[Main] Observation load error:", err);
  }
}

async function loadSurfaceStations(map, win = getActiveWindow()) {
  try {
    console.log("[Main] Starting surface stations fetch...");
    const stations = await fetchStationObservations("SURFACE/PLOT_GLOBAL_3H", "20260827200000.000");
    console.log("[Main] Received stations: " + (stations && stations.features ? stations.features.length : 0));
    appState.set("stationData", stations);
    renderStationWeatherPlots(map, stations, appState.state.layers.station);

    addOrUpdateLayer({
      id: "station-surface",
      name: "Surface Station Observations",
      type: "station",
      color: "#e3b341",
      visible: true,
      removable: true,
    }, win);

    if (stations && stations.features && stations.features.length >= 3) {
      console.log(`[Bootstrap] Calculating SLP isobars from ${stations.features.length} surface stations...`);
      analyzeAndRenderSurfaceSLPContours(map, stations);
    }
    console.log("[Main] Finished rendering surface station plots and SLP contours");
  } catch (err) {
    console.error("[Bootstrap] Surface stations load failed:", err);
  }
}

function handleLayerAction(map, action, layerId, value, layer, win = getActiveWindow()) {
  if (action === "visibility") {
    if (layer.type === "contour") {
      setLayerIsobandVisibility(map, layerId, value && layer.config.showFill);
      setLayerIsolineVisibility(map, layerId, value && layer.config.showLine);
    } else if (layer.type === "station") {
      setStationVisibility(map, value);
    } else if (layer.type === "pmtiles") {
      const vis = value ? "visible" : "none";
      const pmtilesLayerIds = [
        "china-fill", "china-boundary",
        "provinces-bg-fill", "provinces-boundary",
        "provinces-fill", "provinces-detail-boundary",
        "citys-fill", "citys-boundary",
        "graticule-lines",
      ];
      pmtilesLayerIds.forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
      });
    }
  } else if (action === "config") {
    if (layer.type === "contour") {
      setLayerIsobandVisibility(map, layerId, layer.visible && value.showFill);
      setLayerIsolineVisibility(map, layerId, layer.visible && value.showLine);
      setLayerIsobandOpacity(map, layerId, value.opacity);
      setLayerIsolineColor(map, layerId, value.lineColor);
    }
  } else if (action === "remove") {
    if (layer.type === "contour") {
      removeContourLayer(map, layerId);
    } else if (layer.type === "station") {
      setStationVisibility(map, false);
    }
  } else if (action === "aux") {
    if (layerId === "raster") {
      if (value && !map.getLayer("raster-layer")) {
        const model = win?.model || "ECMWF_HR";
        const element = win?.element || "TMP";
        const level = win?.level || 850;
        const period = win?.period ?? 24;
        const file = `26082708.${String(period).padStart(3, "0")}`;
        const path = `${model}/${element}/${level}`;
        fetchGridBinaryStream(path, file).then((bin) => {
          renderBinaryRaster(map, bin, element, win?.colormap || element);
        });
      } else {
        setRasterVisibility(map, value);
      }
    } else if (layerId === "wind") {
      if (value) {
        let grid = win?.gridData || appState.get("gridData");
        if (!grid || !grid.u || !grid.v) {
          grid = {
            header: (grid && grid.header) ? grid.header : { start_lon: 60, d_lon: 0.5, n_lon: 100, start_lat: 10, d_lat: 0.5, n_lat: 80 },
            u: new Float32Array(8000).fill(6),
            v: new Float32Array(8000).fill(4),
          };
        }
        renderWindStreamlines(map, grid);
      } else {
        stopWindAnimation(map);
      }
    }
  }
}

export function clearAllWeatherLayersFromMap(map, win = null) {
  if (!map) return;
  try {
    removeAllContourLayers(map);
    stopWindAnimation(map);
    removeStationLayer(map);
    removeRasterLayer(map);
  } catch (err) {
    console.warn("[Main] Error cleaning up weather layers:", err);
  }
  if (win) {
    clearWindowWeatherLayers(win);
  }
}

async function loadPresetGroup(map, group, period = null, level = null, win = null) {
  if (!group || !group.layers) return;
  clearAllWeatherLayersFromMap(map, win);

  const curPeriod = period !== null ? period : (win?.period ?? 24);
  const curLevel = level !== null ? level : (group.hasLevel ? (group.defaultLevel || win?.level || 500) : null);

  if (curLevel !== null) {
    if (win) win.level = curLevel;
    if (win && getActiveWindow() === win) setNavBarLevel(curLevel);
    if (win) setWindowHeaderLevel(win, curLevel);
  }
  if (win) win.period = curPeriod;
  if (win) {
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

  console.log(`[PresetGroup] Loading "${group.name}" at level=${curLevel}hPa, period=+${curPeriod}h...`);

  await Promise.allSettled(
    group.layers.map(async (layer) => {
      const targetLevel = layer.level || (group.hasLevel ? curLevel : null);
      if (layer.type === "contour" || layer.type === "wind") {
        const render = layer.render || {};
        await loadWeatherField(map, layer.model, layer.element, targetLevel, curPeriod, {
          ...render,
          keepWind: true,
          colormap: resolveColormap(group, render, targetLevel),
        }, win);
      } else if (layer.type === "station") {
        await loadObservationProduct(map, layer.model, layer.element, targetLevel, win?.obsTime || "20260827200000.000", win);
      }
    })
  );
}

function resolveColormap(group, render, level) {
  const levelKey = level === null || level === undefined ? null : String(level);
  return render.colormapByLevel?.[levelKey]
    || render.colormap
    || group.colormapByLevel?.[levelKey]
    || group.levels?.[levelKey]?.colormap
    || group.colormap
    || null;
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
  } else {
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
