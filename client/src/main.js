// main.js - Application bootstrap and orchestrator
import { initMap } from "./map/mapInstance.js";
import { initNavBar } from "./ui/navBar.js";
import { initCatalogDrawer } from "./ui/catalogDrawer.js";
import { initLayerControl } from "./ui/layerControl.js";
import { initTimeSlider } from "./ui/timeSlider.js";
import { initTooltip } from "./ui/tooltip.js";
import { renderContourLayers, setContourVisibility, setContourOpacity } from "./layers/contourLayer.js";
import { renderBinaryRaster, setRasterVisibility } from "./layers/rasterLayer.js";
import { renderStationWeatherPlots } from "./layers/stationLayer.js";
import { renderWindStreamlines, stopWindAnimation } from "./layers/windLayer.js";
import { fetchGridData, fetchGridBinaryStream, fetchStationObservations } from "./api/catalogApi.js";
import { getCSSGradient } from "./utils/colormaps.js";
import { appState } from "./store/appState.js";

async function bootstrap() {
  console.log("[MICAPS-Web] Initializing meteorological workstation...");

  const map = initMap("map-container");
  initNavBar("navbar");
  initTooltip("tooltip");

  initCatalogDrawer("catalog-drawer", async ({ model, element, level, period }) => {
    await loadWeatherField(map, model, element, level, period);
  });

  initLayerControl("layer-control", (layerKey, value) => {
    handleLayerToggle(map, layerKey, value);
  });

  initTimeSlider("timeslider-container", async (period) => {
    const model = appState.get("model");
    const element = appState.get("element");
    const level = appState.get("level");
    await loadWeatherField(map, model, element, level, period);
  });

  const onReady = async () => {
    console.log("[Main] Map ready, loading weather fields and station observations in parallel...");
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

async function loadWeatherField(map, model, element, level, period) {
  const file = `26082708.${String(period).padStart(3, "0")}`;
  const path = `${model}/${element}/${level}`;

  try {
    const gridData = await fetchGridData(path, file);
    appState.set("gridData", gridData);
    renderContourLayers(map, gridData, element, {
      visible: appState.state.layers.contourf,
      opacity: appState.state.opacity.contourf,
    });

    if (appState.state.layers.raster) {
      const binBuffer = await fetchGridBinaryStream(path, file);
      renderBinaryRaster(map, binBuffer, element);
    }

    if (element === "WIND" && gridData.u && gridData.v) {
      renderWindStreamlines(map, gridData);
    } else {
      stopWindAnimation();
    }

    updateLegend(element);
  } catch (err) {
    console.error("[Bootstrap] Field load failed:", err);
  }
}

async function loadSurfaceStations(map) {
  try {
    console.log("[Main] Starting surface stations fetch...");
    const stations = await fetchStationObservations("SURFACE/PLOT_10MIN", "20260827174000.000");
    console.log("[Main] Received stations: " + (stations && stations.features ? stations.features.length : 0));
    appState.set("stationData", stations);
    renderStationWeatherPlots(map, stations);
    console.log("[Main] Finished rendering station plots");
  } catch (err) {
    console.error("[Bootstrap] Stations load failed:", err);
  }
}

function handleLayerToggle(map, key, value) {
  switch (key) {
    case "contourf":
    case "contour":
      setContourVisibility(map, value);
      break;
    case "raster":
      if (value && !map.getLayer("raster-layer")) {
        const model = appState.get("model");
        const element = appState.get("element");
        const level = appState.get("level");
        const period = appState.get("period");
        const file = `26082708.${String(period).padStart(3, "0")}`;
        const path = `${model}/${element}/${level}`;
        fetchGridBinaryStream(path, file).then((bin) => {
          renderBinaryRaster(map, bin, element);
        });
      } else {
        setRasterVisibility(map, value);
      }
      break;
    case "wind":
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
      break;
    case "opacity":
      setContourOpacity(map, value);
      break;
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
