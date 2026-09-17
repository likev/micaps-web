// overlayWind.js - Triggers for wind streamlines, wind barbs, and station streamline analysis
import {
  renderWindStreamlines,
  renderGridWindBarbs,
  generateStationWindGrid,
} from "../layers/windLayer.js";
import { getStationGeoJSON } from "../layers/stationLayer.js";
import { fetchGridData, fetchStationObservations } from "../api/catalogApi.js";
import { appState } from "../store/appState.js";
import { getLayersForWindow } from "../ui/layerControl.js";
import { showErrorToast } from "../ui/toast.js";

function notifyError(msg) {
  try {
    showErrorToast(msg);
  } catch {}
}

export async function triggerWindStreamlines(map, layer = null, win = null) {
  if (!layer) {
    const layers = getLayersForWindow(win);
    const windLayers = layers.filter(
      (l) => (l.type === "wind" || l.element === "WIND") && l.visible !== false && l.config?.showWind !== false
    );
    if (windLayers.length > 0) {
      windLayers.forEach((l) => triggerWindStreamlines(map, l, win));
      return;
    }
  }

  let grid = layer?.gridData || win?.windGridData || win?.gridData || appState.get("gridData");
  if (grid && grid.u && grid.v) {
    renderWindStreamlines(map, grid);
    return;
  }

  const model = layer?.model || win?.model || "ECMWF_HR";
  const level =
    layer?.level !== undefined && layer?.level !== null && layer?.level > 0 ? layer.level : (win?.level || 850);
  const period = win?.period ?? 24;
  let cycle = win?.forecastCycle || appState.get("forecastCycle");
  if (!cycle) {
    try {
      const { resolveLatestForecastCycle } = await import("../utils/timelineSync.js");
      cycle = await resolveLatestForecastCycle(model, "WIND", level);
    } catch {}
  }
  if (!cycle) {
    const { generateDynamicForecastCycles } = await import("../utils/timelineSync.js");
    cycle = generateDynamicForecastCycles(null, 1)[0];
  }
  const file = layer?.file || win?.file || `${cycle}.${String(period).padStart(3, "0")}`;
  const path = `${model}/WIND/${level}`;

  fetchGridData(path, file)
    .then((windGrid) => {
      if (windGrid && windGrid.u && windGrid.v) {
        if (layer) layer.gridData = windGrid;
        if (win) win.windGridData = windGrid;
        renderWindStreamlines(map, windGrid);
      }
    })
    .catch((err) => {
      console.warn("[Wind] Fetch wind failed:", err);
      notifyError(`Failed to load wind streamlines for ${level}hPa: ${err?.message || err}`);
    });
}

export async function triggerWindBarbs(map, layer = null, win = null) {
  let grid = layer?.gridData || win?.windGridData || win?.gridData || appState.get("gridData");
  if (grid && grid.u && grid.v) {
    renderGridWindBarbs(map, grid);
    return;
  }

  const model = layer?.model || win?.model || "ECMWF_HR";
  const level =
    layer?.level !== undefined && layer?.level !== null && layer?.level > 0 ? layer.level : (win?.level || 850);
  const period = win?.period ?? 24;
  let cycle = win?.forecastCycle || appState.get("forecastCycle");
  if (!cycle) {
    try {
      const { resolveLatestForecastCycle } = await import("../utils/timelineSync.js");
      cycle = await resolveLatestForecastCycle(model, "WIND", level);
    } catch {}
  }
  if (!cycle) {
    const { generateDynamicForecastCycles } = await import("../utils/timelineSync.js");
    cycle = generateDynamicForecastCycles(null, 1)[0];
  }
  const file = layer?.file || win?.file || `${cycle}.${String(period).padStart(3, "0")}`;
  const path = `${model}/WIND/${level}`;

  fetchGridData(path, file)
    .then((windGrid) => {
      if (windGrid && windGrid.u && windGrid.v) {
        if (layer) layer.gridData = windGrid;
        if (win) win.windGridData = windGrid;
        renderGridWindBarbs(map, windGrid);
      }
    })
    .catch((err) => {
      console.warn("[Wind] Fetch wind barbs failed:", err);
      notifyError(`Failed to load wind barbs for ${level}hPa: ${err?.message || err}`);
    });
}

export async function triggerStationStreamlines(map, layer = null, win = null) {
  const curLevel = layer?.level || win?.level || (layer?.model === "UPPER_AIR" ? 500 : null);
  const geojson =
    layer?.stationsGeoJSON || getStationGeoJSON(map) || win?.stationsGeoJSON || appState.get("stationData");
  if (geojson && geojson.features && geojson.features.length >= 3) {
    const windGrid = generateStationWindGrid(geojson, curLevel);
    if (windGrid) {
      if (layer) layer.gridData = windGrid;
      if (win) win.windGridData = windGrid;
      renderWindStreamlines(map, windGrid);
      return;
    }
  }

  // Fallback: If station GeoJSON is not yet in memory, fetch it via API
  const model = layer?.model || "SURFACE";
  const element = layer?.element || (model === "SURFACE" ? "PLOT_GLOBAL_3H" : "PLOT");
  const level = layer?.level || win?.level || 500;
  const path = layer?.path || (model === "SURFACE" ? `SURFACE/${element}` : `UPPER_AIR/${element}/${level}`);
  let file = layer?.file || win?.file || win?.obsTime || appState.get("obsTime") || appState.get("file");
  if (!file) {
    try {
      const { syncObservationTimeline } = await import("../utils/timelineSync.js");
      const winTitle = win?.title || layer?.name || "";
      file = await syncObservationTimeline(path, null, winTitle, win);
    } catch {}
  }

  if (!file) {
    console.warn("[StationStreamlines] No obsTime/file available, aborting fetch");
    notifyError("No observation time available for station streamlines.");
    return;
  }

  fetchStationObservations(path, file)
    .then((data) => {
      if (data && data.features && data.features.length >= 3) {
        if (layer) layer.stationsGeoJSON = data;
        const windGrid = generateStationWindGrid(data, level);
        if (windGrid) {
          if (layer) layer.gridData = windGrid;
          if (win) win.windGridData = windGrid;
          renderWindStreamlines(map, windGrid);
        }
      } else {
        notifyError("Insufficient station observation data for streamlines.");
      }
    })
    .catch((err) => {
      console.warn("[StationStreamlines] Fetch failed:", err);
      notifyError(`Failed to load station streamlines: ${err?.message || err}`);
    });
}
