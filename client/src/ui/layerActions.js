// layerActions.js - Dispatcher for layer control toggle, visibility, and aux actions
import {
  setLayerIsobandVisibility,
  setLayerIsolineVisibility,
  setLayerIsobandOpacity,
  setLayerIsolineColor,
  setLayerIsolineStyle,
  removeContourLayer,
} from "../layers/contourLayer.js";
import { setStationVisibility, setStationConfig } from "../layers/stationLayer.js";
import { renderBinaryRaster, renderGridRaster, setRasterVisibility } from "../layers/rasterLayer.js";
import { renderWindStreamlines, stopWindAnimation, renderGridWindBarbs, removeGridWindBarbs } from "../layers/windLayer.js";
import { fetchGridBinaryStream, fetchGridData } from "../api/catalogApi.js";
import { appState } from "../store/appState.js";
import { getActiveWindow } from "./tabWindowManager.js";

export function handleLayerAction(map, action, layerId, value, layer, win = getActiveWindow()) {
  if (action === "visibility") {
    if (layer.type === "contour" || layer.type === "wind") {
      setLayerIsobandVisibility(map, layerId, value && layer.config?.showFill);
      setLayerIsolineVisibility(map, layerId, value && layer.config?.showLine);
      if (layer.config?.showRaster) {
        setRasterVisibility(map, value);
      }
      if (layer.config?.showWind) {
        if (value) {
          triggerWindStreamlines(map, layer, win);
        } else {
          stopWindAnimation(map);
        }
      }
      if (layer.config?.showBarbs) {
        if (value) {
          triggerWindBarbs(map, layer, win);
        } else {
          removeGridWindBarbs(map);
        }
      }
    } else if (layer.type === "station") {
      setStationVisibility(map, value);
    } else if (layer.type === "pmtiles") {
      const showGraticule = value && (layer.config?.showGraticule !== false);
      const showProvinces = value && (layer.config?.showProvinces !== false);
      const showCities = value && (layer.config?.showCities !== false);

      const chinaLayers = ["china-fill", "china-boundary"];
      const provLayers = ["provinces-bg-fill", "provinces-boundary", "provinces-fill", "provinces-detail-boundary"];
      const cityLayers = ["citys-fill", "citys-boundary"];

      chinaLayers.forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", value ? "visible" : "none"); });
      provLayers.forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", showProvinces ? "visible" : "none"); });
      cityLayers.forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", showCities ? "visible" : "none"); });
      if (map.getLayer("graticule-lines")) map.setLayoutProperty("graticule-lines", "visibility", showGraticule ? "visible" : "none");
    }
  } else if (action === "config") {
    if (layer.type === "pmtiles") {
      if (value.showGraticule !== undefined) {
        if (map.getLayer("graticule-lines")) {
          map.setLayoutProperty("graticule-lines", "visibility", (layer.visible && value.showGraticule !== false) ? "visible" : "none");
        }
      }
      if (value.showProvinces !== undefined) {
        const provLayers = ["provinces-bg-fill", "provinces-boundary", "provinces-fill", "provinces-detail-boundary"];
        provLayers.forEach((id) => {
          if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", (layer.visible && value.showProvinces !== false) ? "visible" : "none");
        });
      }
      if (value.showCities !== undefined) {
        const cityLayers = ["citys-fill", "citys-boundary"];
        cityLayers.forEach((id) => {
          if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", (layer.visible && value.showCities !== false) ? "visible" : "none");
        });
      }
    } else if (layer.type === "contour" || layer.type === "wind") {
      if (value.showFill !== undefined) setLayerIsobandVisibility(map, layerId, layer.visible && value.showFill);
      if (value.showLine !== undefined) setLayerIsolineVisibility(map, layerId, layer.visible && value.showLine);
      if (value.opacity !== undefined) setLayerIsobandOpacity(map, layerId, value.opacity);
      if (value.lineWidth !== undefined || value.lineColor !== undefined || value.boldValues !== undefined || value.boldLineWidth !== undefined) {
        setLayerIsolineStyle(map, layerId, {
          lineWidth: layer.config?.lineWidth,
          lineColor: layer.config?.lineColor,
          boldValues: layer.config?.boldValues,
          boldLineWidth: layer.config?.boldLineWidth,
        });
      }

      if (value.showRaster !== undefined) {
        if (value.showRaster && layer.visible) {
          triggerRasterOverlay(map, layer, win);
        } else {
          setRasterVisibility(map, false);
        }
      }

      if (value.showWind !== undefined) {
        if (value.showWind && layer.visible) {
          triggerWindStreamlines(map, layer, win);
        } else {
          stopWindAnimation(map);
        }
      }

      if (value.showBarbs !== undefined) {
        if (value.showBarbs && layer.visible) {
          triggerWindBarbs(map, layer, win);
        } else {
          removeGridWindBarbs(map);
        }
      }
    } else if (layer.type === "station") {
      setStationConfig(map, value);
    }
  } else if (action === "remove") {
    if (layer.type === "contour" || layer.type === "wind") {
      removeContourLayer(map, layerId);
      if (layer.config?.showRaster) setRasterVisibility(map, false);
      if (layer.config?.showWind) stopWindAnimation(map);
      if (layer.config?.showBarbs) removeGridWindBarbs(map);
    } else if (layer.type === "station") {
      setStationVisibility(map, false);
    }
  } else if (action === "aux") {
    if (layerId === "raster") {
      if (value) {
        triggerRasterOverlay(map, null, win);
      } else {
        setRasterVisibility(map, false);
      }
    } else if (layerId === "wind") {
      if (value) {
        triggerWindStreamlines(map, null, win);
      } else {
        stopWindAnimation(map);
      }
    }
  }
}

function triggerRasterOverlay(map, layer = null, win = null) {
  // 1. Direct in-memory gridData from layer (e.g. Surface SLP or Sounding Analysis)
  if (layer?.gridData) {
    const colormap = layer.colormap || win?.colormap || layer.element || "TMP";
    renderGridRaster(map, layer.gridData, layer.element || "TMP", colormap);
    return;
  }

  // 2. In-memory gridData from window
  if (win?.gridData && (!layer || layer.element === win.element)) {
    const colormap = win.colormap || layer?.colormap || win.element || "TMP";
    renderGridRaster(map, win.gridData, win.element || "TMP", colormap);
    return;
  }

  // 3. Dynamic model, element, level and file from layer or window
  const model = layer?.model || win?.model || "ECMWF_HR";
  const element = layer?.element || win?.element || "TMP";
  const level = layer?.level !== undefined && layer?.level !== null ? layer.level : (win?.level !== undefined ? win.level : null);
  const colormap = layer?.colormap || win?.colormap || element;

  let path = layer?.path;
  if (!path) {
    if (model === "SURFACE") {
      path = `SURFACE/${element}`;
    } else if (level && level > 0) {
      path = `${model}/${element}/${level}`;
    } else {
      path = `${model}/${element}`;
    }
  }

  let file = layer?.file || win?.obsTime || win?.file;
  if (!file) {
    const period = win?.period ?? 24;
    const cycle = win?.forecastCycle || appState.get("forecastCycle") || "26082908";
    file = `${cycle}.${String(period).padStart(3, "0")}`;
  }

  fetchGridBinaryStream(path, file)
    .then((bin) => {
      renderBinaryRaster(map, bin, element, colormap);
    })
    .catch((err) => {
      console.warn("[Raster] Binary stream fetch failed, trying JSON gridData:", err);
      fetchGridData(path, file).then((grid) => {
        if (grid && grid.values) {
          renderGridRaster(map, grid, element, colormap);
        }
      });
    });
}

function triggerWindStreamlines(map, layer = null, win = null) {
  let grid = layer?.gridData || win?.windGridData || win?.gridData || appState.get("gridData");
  if (grid && grid.u && grid.v) {
    renderWindStreamlines(map, grid);
    return;
  }

  const model = layer?.model || win?.model || "ECMWF_HR";
  const level = layer?.level !== undefined && layer?.level !== null && layer?.level > 0 ? layer.level : (win?.level || 850);
  const period = win?.period ?? 24;
  const cycle = win?.forecastCycle || appState.get("forecastCycle") || "26082908";
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
    });
}

function triggerWindBarbs(map, layer = null, win = null) {
  let grid = layer?.gridData || win?.windGridData || win?.gridData || appState.get("gridData");
  if (grid && grid.u && grid.v) {
    renderGridWindBarbs(map, grid);
    return;
  }

  const model = layer?.model || win?.model || "ECMWF_HR";
  const level = layer?.level !== undefined && layer?.level !== null && layer?.level > 0 ? layer.level : (win?.level || 850);
  const period = win?.period ?? 24;
  const cycle = win?.forecastCycle || appState.get("forecastCycle") || "26082908";
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
    });
}
