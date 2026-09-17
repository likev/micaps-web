import { createDefaultLayers, buildBaseConfig } from "./layerDefaults.js";

const windowLayersMap = new Map();
let currentActiveWinId = "default";
let currentActiveWinTitle = "";
let onLayerActionCallback = null;
let renderLayersManagerFn = null;

export function registerRenderLayersManager(fn) {
  renderLayersManagerFn = fn;
}

export function getCurrentActiveWinId() {
  return currentActiveWinId;
}

export function setCurrentActiveWinId(id) {
  currentActiveWinId = id;
}

export function getCurrentActiveWinTitle() {
  return currentActiveWinTitle;
}

export function setCurrentActiveWinTitle(title) {
  currentActiveWinTitle = title;
}

export function getOnLayerActionCallback() {
  return onLayerActionCallback;
}

export function setOnLayerActionCallback(cb) {
  onLayerActionCallback = cb;
}

export function getLayersForWindow(winOrId) {
  const winId = typeof winOrId === "object" ? (winOrId?.id || "default") : (winOrId || currentActiveWinId || "default");
  if (!windowLayersMap.has(winId)) {
    windowLayersMap.set(winId, createDefaultLayers(winId));
  }
  return windowLayersMap.get(winId);
}

export function getLayerById(layerId, winOrId) {
  const layers = getLayersForWindow(winOrId);
  return layers.find((l) => l.id === layerId) || null;
}

export function getLayers() {
  return getLayersForWindow(currentActiveWinId);
}

export function clearWindowWeatherLayers(winOrId) {
  const winId = typeof winOrId === "object" ? (winOrId?.id || "default") : (winOrId || currentActiveWinId || "default");
  const current = getLayersForWindow(winId);
  const baseLayers = current.filter((l) => !l.removable);
  windowLayersMap.set(winId, baseLayers.length ? baseLayers : createDefaultLayers(winId));
  if (winId === currentActiveWinId && typeof document !== "undefined") {
    const panel = document.getElementById("layer-control");
    if (panel && renderLayersManagerFn) renderLayersManagerFn(panel);
  }
}

export function removeLayer(layerId, winOrId = null) {
  const winId = typeof winOrId === "object" ? (winOrId?.id || currentActiveWinId) : (winOrId || currentActiveWinId || "default");
  const layers = getLayersForWindow(winId);
  const idx = layers.findIndex((l) => l.id === layerId);
  if (idx >= 0) {
    layers.splice(idx, 1);
    if (winId === currentActiveWinId && typeof document !== "undefined") {
      const panel = document.getElementById("layer-control");
      if (panel && renderLayersManagerFn) renderLayersManagerFn(panel);
    }
  }
}

export function syncLayerControlForWindow(win) {
  if (!win) return;
  currentActiveWinId = win.id || "default";
  currentActiveWinTitle = win.title
    ? `W${win.winIdx + 1}: ${win.title}`
    : (win.activeGroup ? `W${win.winIdx + 1}: ${win.activeGroup.name}` : `Window ${win.winIdx + 1}`);
  if (typeof document !== "undefined") {
    const panel = document.getElementById("layer-control");
    if (panel && renderLayersManagerFn) renderLayersManagerFn(panel);
  }
}

export function addOrUpdateLayer(arg1, arg2 = null) {
  let layerDef, winOrId;
  if (typeof arg1 === "string" && typeof arg2 === "object" && arg2 !== null) {
    winOrId = arg1;
    layerDef = arg2;
  } else {
    layerDef = arg1;
    winOrId = arg2;
  }

  const winId = typeof winOrId === "object" ? (winOrId?.id || currentActiveWinId) : (winOrId || currentActiveWinId || "default");
  if (!windowLayersMap.has(winId)) {
    windowLayersMap.set(winId, createDefaultLayers(winId));
  }

  const layers = windowLayersMap.get(winId);
  const existingIdx = layers.findIndex((l) => l.id === layerDef.id);

  if (existingIdx >= 0) {
    const prevLayer = layers[existingIdx];
    const mergedConfig = {
      ...prevLayer.config,
      ...layerDef.config,
    };
    if (prevLayer.config?.palettePath && (layerDef.config?.palettePath === undefined || layerDef.config?.palettePath === null)) {
      mergedConfig.palettePath = prevLayer.config.palettePath;
    }
    const mergedColormap = layerDef.colormap || (mergedConfig.palettePath ? `palette:${prevLayer.id}` : prevLayer.colormap);
    layers[existingIdx] = {
      ...prevLayer,
      ...layerDef,
      isExpanded: prevLayer.isExpanded !== undefined ? prevLayer.isExpanded : Boolean(layerDef.isExpanded),
      colormap: mergedColormap,
      config: mergedConfig,
    };
  } else {
    const baseConfig = buildBaseConfig(layerDef);
    layers.push({
      id: layerDef.id || `layer-${Date.now()}`,
      name: layerDef.name || "Layer",
      type: layerDef.type || "contour",
      removable: layerDef.removable !== undefined ? layerDef.removable : true,
      visible: layerDef.visible !== undefined ? layerDef.visible : true,
      isExpanded: Boolean(layerDef.isExpanded),
      color: layerDef.color || (layerDef.element === "HGT" ? "#58a6ff" : layerDef.element === "TMP" ? "#f85149" : (layerDef.element === "VOR" ? "#c678dd" : (layerDef.element === "DIV" ? "#56d4dd" : "#388bfd"))),
      ...layerDef,
      config: baseConfig,
    });
  }

  const curLayer = existingIdx >= 0 ? layers[existingIdx] : layers[layers.length - 1];
  if (curLayer.config && curLayer.config.showFill && curLayer.config.showRaster) {
    curLayer.config.showRaster = false;
  }

  if (winId === currentActiveWinId && typeof document !== "undefined") {
    const panel = document.getElementById("layer-control");
    if (panel && renderLayersManagerFn) renderLayersManagerFn(panel);
  }

  return curLayer;
}
