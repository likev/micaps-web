// layers.svelte.js - Svelte 5 reactive layer manager state
import {
  getLayersForWindow as coreGetLayersForWindow,
  addOrUpdateLayer as coreAddOrUpdateLayer,
  removeLayer as coreRemoveLayer,
  clearWindowWeatherLayers as coreClearWindowWeatherLayers,
  getCurrentActiveWinId,
  setCurrentActiveWinId,
  getCurrentActiveWinTitle,
  setCurrentActiveWinTitle,
  setOnLayersChangeCallback,
} from "./layersCore.js";

// Svelte 5 reactive layers map: { [winId]: Layer[] }
export const layersByWindow = $state({});

setOnLayersChangeCallback((winId) => {
  syncLayersState(winId);
});

export function syncLayersState(winId) {
  const list = coreGetLayersForWindow(winId);
  layersByWindow[winId] = [...list];
}

export function getLayers(winId = getCurrentActiveWinId()) {
  if (!layersByWindow[winId]) {
    syncLayersState(winId);
  }
  return layersByWindow[winId];
}

export function addLayer(layerDef, winId = getCurrentActiveWinId()) {
  const layer = coreAddOrUpdateLayer(layerDef, winId);
  syncLayersState(winId);
  return layer;
}

export function deleteLayer(layerId, winId = getCurrentActiveWinId()) {
  coreRemoveLayer(layerId, winId);
  syncLayersState(winId);
}

export function clearLayers(winId = getCurrentActiveWinId()) {
  coreClearWindowWeatherLayers(winId);
  syncLayersState(winId);
}

export {
  getCurrentActiveWinId,
  setCurrentActiveWinId,
  getCurrentActiveWinTitle,
  setCurrentActiveWinTitle,
};
