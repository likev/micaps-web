// main.js - Application bootstrap and orchestrator
import { initMap } from "./map/mapInstance.js";
import { initNavBar } from "./ui/navBar.js";
import { initCatalogDrawer } from "./ui/catalogDrawer.js";
import { initLayerControl, addOrUpdateLayer, removeLayer } from "./ui/layerControl.js";
import { initTimeSlider, setTimelineMode } from "./ui/timeSlider.js";
import { initTooltip } from "./ui/tooltip.js";
import {
  renderContourLayers,
  setLayerIsobandVisibility,
  setLayerIsolineVisibility,
  setLayerIsolineColor,
  setLayerIsobandOpacity,
  removeContourLayer,
  setIsobandVisibility,
  setIsolineVisibility,
  setContourOpacity,
} from "./layers/contourLayer.js";
import { renderBinaryRaster, setRasterVisibility } from "./layers/rasterLayer.js";
import { renderStationWeatherPlots, setStationVisibility } from "./layers/stationLayer.js";
import { renderWindStreamlines, stopWindAnimation } from "./layers/windLayer.js";
import { analyzeAndRenderSoundingContours } from "./layers/soundingAnalysis.js";
import { analyzeAndRenderSurfaceSLPContours } from "./layers/surfaceAnalysis.js";
import { fetchGridData, fetchGridBinaryStream, fetchStationObservations } from "./api/catalogApi.js";
import { getCSSGradient } from "./utils/colormaps.js";
import { appState } from "./store/appState.js";
import { PRESET_GROUPS } from "./config/presets.js";
import { setNavBarLevel, setNavBarPreset } from "./ui/navBar.js";
import { step as timeSliderStep } from "./ui/timeSlider.js";

async function bootstrap() {
  console.log("[MICAPS-Web] Initializing meteorological workstation...");

  const map = initMap("map-container");
  initNavBar("navbar", {
    onPresetChange: (group) => {
      loadPresetGroup(map, group);
    },
    onLevelChange: (lvl) => {
      changeVerticalLevel(map, 0, lvl);
    },
  });
  initTooltip("tooltip");
  initKeyboardShortcuts(map);

  initCatalogDrawer("catalog-drawer", async ({ model, element, level, period, obsTime, isObservation }) => {
    appState.set("activeGroup", null);
    setNavBarPreset("");
    if (isObservation) {
      setTimelineMode("obs", { file: obsTime });
      if (model === "UPPER_AIR") {
        await loadUpperAirComposite(map, level || 500, obsTime);
      } else {
        await loadObservationProduct(map, model, element, level, obsTime);
      }
    } else {
      setTimelineMode("nwp", { period });
      await loadWeatherField(map, model, element, level, period);
    }
  });

  initLayerControl("layer-control", (action, layerId, value, layer) => {
    handleLayerAction(map, action, layerId, value, layer);
  });

  initTimeSlider("timeslider-container", async (data) => {
    if (typeof data === "object" && data.isObs) {
      const model = appState.get("model") || "SURFACE";
      const element = appState.get("element") || "PLOT_GLOBAL_3H";
      const level = appState.get("level");
      if (model === "UPPER_AIR") {
        await loadUpperAirComposite(map, level || 500, data.file);
      } else {
        await loadObservationProduct(map, model, element, level, data.file);
      }
    } else {
      const period = typeof data === "number" ? data : appState.get("period");
      const activeGroup = appState.get("activeGroup");
      if (activeGroup) {
        await loadPresetGroup(map, activeGroup, period, appState.get("level"));
      } else {
        const model = appState.get("model");
        const element = appState.get("element");
        const level = appState.get("level");
        await loadWeatherField(map, model, element, level, period);
      }
    }
  });

  const onReady = async () => {
    console.log("[Main] Map ready, loading initial weather fields and station observations...");
    updateLegend("TMP");
    await Promise.all([
      loadWeatherField(map, "ECMWF_HR", "TMP", 850, 24),
      loadSurfaceStations(map),
    ]);
    window.__WEATHER_FIELD_LOADED__ = true;
  };

  if (map.isStyleLoaded() || map.loaded()) {
    onReady();
  } else {
    map.once("load", onReady);
  }
}

async function loadWeatherField(map, model, element, level, period, customOptions = null) {
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

    renderContourLayers(map, gridData, element, {
      layerId,
      showFill: defaultShowFill,
      showLine: defaultShowLine,
      lineColor,
      opacity,
    });

    // Register into Layers Manager
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
    });

    if (appState.state.layers.raster && !isHeight) {
      const binBuffer = await fetchGridBinaryStream(path, file);
      renderBinaryRaster(map, binBuffer, element);
    }

    if (element === "WIND" && gridData.u && gridData.v) {
      renderWindStreamlines(map, gridData);
    } else if (!customOptions?.keepWind) {
      stopWindAnimation();
    }

    updateLegend(element);
  } catch (err) {
    console.error(`[Bootstrap] Field load failed for ${path}/${file}:`, err);
  }
}

// When upper plot is loaded, display plot and calculate height & temp contour lines from sounding plot data
async function loadUpperAirComposite(map, level = 500, obsTime = "20260827200000.000") {
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
  });

  // 2. Calculate Height contour lines and Temperature contour lines from sounding plot data
  if (stations && stations.features && stations.features.length >= 3) {
    console.log(`[UpperAir] Calculating objective analysis contours from ${stations.features.length} sounding stations...`);
    analyzeAndRenderSoundingContours(map, stations, level);
  }
}

async function loadObservationProduct(map, model, element, level, file) {
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
    });

    if (model === "SURFACE" && stations && stations.features && stations.features.length >= 3) {
      console.log(`[Main] Calculating SLP isobars from ${stations.features.length} surface stations...`);
      analyzeAndRenderSurfaceSLPContours(map, stations);
    }
  } catch (err) {
    console.error("[Main] Observation load error:", err);
  }
}

async function loadSurfaceStations(map) {
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
    });

    if (stations && stations.features && stations.features.length >= 3) {
      console.log(`[Bootstrap] Calculating SLP isobars from ${stations.features.length} surface stations...`);
      analyzeAndRenderSurfaceSLPContours(map, stations);
    }
    console.log("[Main] Finished rendering surface station plots and SLP contours");
  } catch (err) {
    console.error("[Bootstrap] Surface stations load failed:", err);
  }
}

function handleLayerAction(map, action, layerId, value, layer) {
  if (action === "visibility") {
    if (layer.type === "contour") {
      setLayerIsobandVisibility(map, layerId, value && layer.config.showFill);
      setLayerIsolineVisibility(map, layerId, value && layer.config.showLine);
    } else if (layer.type === "station") {
      setStationVisibility(map, value);
    } else if (layer.type === "pmtiles") {
      const vis = value ? "visible" : "none";
      if (map.getLayer("provinces-boundary")) map.setLayoutProperty("provinces-boundary", "visibility", vis);
      if (map.getLayer("graticule-layer")) map.setLayoutProperty("graticule-layer", "visibility", vis);
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
        const model = appState.get("model") || "ECMWF_HR";
        const element = appState.get("element") || "TMP";
        const level = appState.get("level") || 850;
        const period = appState.get("period") || 24;
        const file = `26082708.${String(period).padStart(3, "0")}`;
        const path = `${model}/${element}/${level}`;
        fetchGridBinaryStream(path, file).then((bin) => {
          renderBinaryRaster(map, bin, element);
        });
      } else {
        setRasterVisibility(map, value);
      }
    } else if (layerId === "wind") {
      if (value) {
        let grid = appState.get("gridData");
        if (!grid || !grid.u || !grid.v) {
          grid = {
            header: (grid && grid.header) ? grid.header : { start_lon: 60, d_lon: 0.5, n_lon: 100, start_lat: 10, d_lat: 0.5, n_lat: 80 },
            u: new Float32Array(8000).fill(6),
            v: new Float32Array(8000).fill(4),
          };
        }
        renderWindStreamlines(map, grid);
      } else {
        stopWindAnimation();
      }
    }
  }
}

function updateLegend(element = "TMP") {
  const panel = document.getElementById("legend-panel");
  if (!panel) return;

  const grad = getCSSGradient(element);
  panel.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 2px;">${element} Legend</div>
    <div class="legend-bar" style="background: ${grad};"></div>
    <div class="legend-ticks">
      <span>Low</span>
      <span>Mid</span>
      <span>High</span>
    </div>
  `;
}

async function loadPresetGroup(map, group, period = null, level = null) {
  if (!group || !group.layers) return;
  appState.set("activeGroup", group);
  setNavBarPreset(group.id);

  const curPeriod = period !== null ? period : (appState.get("period") !== undefined ? appState.get("period") : 24);
  const curLevel = level !== null ? level : (group.hasLevel ? (group.defaultLevel || appState.get("level") || 500) : null);

  if (curLevel !== null) {
    appState.set("level", curLevel);
    setNavBarLevel(curLevel);
  }
  appState.set("period", curPeriod);

  console.log(`[PresetGroup] Loading "${group.name}" at level=${curLevel}hPa, period=+${curPeriod}h...`);

  await Promise.allSettled(
    group.layers.map(async (layer) => {
      const targetLevel = layer.level || (group.hasLevel ? curLevel : null);
      if (layer.type === "contour" || layer.type === "wind") {
        await loadWeatherField(map, layer.model, layer.element, targetLevel, curPeriod, {
          ...layer.render,
          keepWind: true,
        });
      } else if (layer.type === "station") {
        await loadObservationProduct(map, layer.model, layer.element, targetLevel, "20260827200000.000");
      }
    })
  );
}

async function changeVerticalLevel(map, direction, explicitLevel = null) {
  const levels = [1000, 925, 850, 700, 500, 400, 300, 200, 100];
  let targetLevel = explicitLevel;

  if (targetLevel === null) {
    const curLevel = appState.get("level") || 500;
    let idx = levels.indexOf(curLevel);
    if (idx === -1) idx = 4;

    let newIdx = idx + direction;
    if (newIdx < 0) newIdx = 0;
    if (newIdx >= levels.length) newIdx = levels.length - 1;
    targetLevel = levels[newIdx];
    if (targetLevel === curLevel) return;
  }

  console.log(`[Level] Setting vertical level to ${targetLevel} hPa`);
  appState.set("level", targetLevel);
  setNavBarLevel(targetLevel);

  const activeGroup = appState.get("activeGroup");
  if (activeGroup && activeGroup.hasLevel) {
    await loadPresetGroup(map, activeGroup, appState.get("period"), targetLevel);
  } else {
    const model = appState.get("model") || "ECMWF_HR";
    const element = appState.get("element") || "TMP";
    const period = appState.get("period") || 24;
    await loadWeatherField(map, model, element, targetLevel, period);
  }
}

function initKeyboardShortcuts(map) {
  window.addEventListener("keydown", async (e) => {
    const tag = e.target && e.target.tagName;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      console.log("[Keyboard] ArrowLeft: Step to previous forecast period");
      timeSliderStep(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      console.log("[Keyboard] ArrowRight: Step to next forecast period");
      timeSliderStep(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      console.log("[Keyboard] ArrowUp: Step to higher vertical level");
      await changeVerticalLevel(map, 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      console.log("[Keyboard] ArrowDown: Step to lower vertical level");
      await changeVerticalLevel(map, -1);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
