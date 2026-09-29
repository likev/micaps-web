// lineProfileLayer.js - Facades for Group 1 (lineheight) + Group 2 (hovmoller)
import { lineHeightController } from "./lineHeightController.js";
import { hovmollerController } from "./hovmollerController.js";
import { addOrUpdateLayer, removeLayer, syncLayerControlForWindow } from "../../ui/layers/layerStore.js";
import { getActiveWindow } from "../../ui/tabs/tabsStore.js";

export { lineHeightController, hovmollerController };
export * from "./lineUtils.js";
export * from "./lineHeightLoader.js";
export * from "./hovmollerLoader.js";
export { LineHeightCanvasRenderer } from "./lineHeightCanvas.js";
export { HovmollerCanvasRenderer } from "./hovmollerCanvas.js";
export { LineHeightPanel } from "./lineHeightPanel.js";
export { HovmollerPanel } from "./hovmollerPanel.js";

export async function loadLineHeightLayer(map, layer = {}, win = null) {
  if (!map) return;
  const layerId = layer.id || "ec-lineheight-diagram";
  const isVisible = layer.visible !== false;
  const config = layer.config || {};
  const def = {
    id: layerId,
    name: layer.name || "EC Line-Height Cross-Section",
    type: "lineheight",
    model: layer.model || "ECMWF_HR",
    element: layer.element || "RH",
    visible: isVisible,
    removable: layer.removable !== false,
    config: {
      lon0: config.lon0 ?? 115.0, lat0: config.lat0 ?? 28.0,
      lon1: config.lon1 ?? 125.0, lat1: config.lat1 ?? 38.0,
      npoints: config.npoints ?? 41, lead: config.lead ?? null,
      initCycle: config.initCycle || null,
      levels: config.levels || [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200],
      flipDirection: config.flipDirection || false,
      showRH: config.showRH !== false, showTemp: config.showTemp !== false,
      showVVel: config.showVVel !== false, showWind: config.showWind !== false,
      showTransectMarker: config.showTransectMarker !== false,
      ...config,
    },
  };
  addOrUpdateLayer(def, win);
  if (win && typeof getActiveWindow === "function" && getActiveWindow() === win) syncLayerControlForWindow(win);
  return await lineHeightController.init(map, win, def);
}

export function removeLineHeightLayer(map, win = null, layerId = null) {
  lineHeightController.destroy(map, win);
  const idToRemove = layerId || "ec-lineheight-diagram";
  removeLayer(idToRemove, win);
  if (idToRemove !== "ec-lineheight-diagram") {
    removeLayer("ec-lineheight-diagram", win);
  }
  if (win) {
    if (Array.isArray(win.layers)) {
      win.layers = win.layers.filter((l) => l && l.id !== idToRemove && l.type !== "lineheight");
    }
    if (Array.isArray(win.activeGroup?.layers)) {
      win.activeGroup.layers = win.activeGroup.layers.filter((l) => l && l.id !== idToRemove && l.type !== "lineheight");
    }
    if (Array.isArray(win.layerSnapshots)) {
      win.layerSnapshots = win.layerSnapshots.filter((s) => s && s.id !== idToRemove && s.type !== "lineheight");
    }
  }
}

export function setLineHeightVisibility(map, visible, win = null) {
  if (visible) lineHeightController.show(map, win);
  else lineHeightController.hide(map, win);
  addOrUpdateLayer({ id: "ec-lineheight-diagram", visible: Boolean(visible) }, win);
  if (win && typeof getActiveWindow === "function" && getActiveWindow() === win) syncLayerControlForWindow(win);
}

export async function loadHovmollerLayer(map, layer = {}, win = null) {
  if (!map) return;
  const layerId = layer.id || "ec-hovmoller-diagram";
  const isVisible = layer.visible !== false;
  const config = layer.config || {};
  const def = {
    id: layerId,
    name: layer.name || "EC Time-Line Hovmoller",
    type: "hovmoller",
    model: layer.model || "ECMWF_HR",
    element: layer.element || "RH",
    visible: isVisible,
    removable: layer.removable !== false,
    config: {
      lon0: config.lon0 ?? 115.0, lat0: config.lat0 ?? 28.0,
      lon1: config.lon1 ?? 125.0, lat1: config.lat1 ?? 38.0,
      npoints: config.npoints ?? 41,
      initCycle: config.initCycle || null,
      startHour: config.startHour ?? 0, endHour: config.endHour ?? 144, stepHours: config.stepHours ?? 12,
      level: config.level ?? 850,
      axisSwap: config.axisSwap || "dist-x", timeDir: config.timeDir || "fwd",
      showRH: config.showRH !== false, showTemp: config.showTemp !== false,
      showVVel: config.showVVel !== false, showWind: config.showWind !== false,
      showTransectMarker: config.showTransectMarker !== false,
      ...config,
    },
  };
  addOrUpdateLayer(def, win);
  if (win && typeof getActiveWindow === "function" && getActiveWindow() === win) syncLayerControlForWindow(win);
  return await hovmollerController.init(map, win, def);
}

export function removeHovmollerLayer(map, win = null, layerId = null) {
  hovmollerController.destroy(map, win);
  const idToRemove = layerId || "ec-hovmoller-diagram";
  removeLayer(idToRemove, win);
  if (idToRemove !== "ec-hovmoller-diagram") {
    removeLayer("ec-hovmoller-diagram", win);
  }
  if (win) {
    if (Array.isArray(win.layers)) {
      win.layers = win.layers.filter((l) => l && l.id !== idToRemove && l.type !== "hovmoller");
    }
    if (Array.isArray(win.activeGroup?.layers)) {
      win.activeGroup.layers = win.activeGroup.layers.filter((l) => l && l.id !== idToRemove && l.type !== "hovmoller");
    }
    if (Array.isArray(win.layerSnapshots)) {
      win.layerSnapshots = win.layerSnapshots.filter((s) => s && s.id !== idToRemove && s.type !== "hovmoller");
    }
  }
}

export function setHovmollerVisibility(map, visible, win = null) {
  if (visible) hovmollerController.show(map, win);
  else hovmollerController.hide(map, win);
  addOrUpdateLayer({ id: "ec-hovmoller-diagram", visible: Boolean(visible) }, win);
  if (win && typeof getActiveWindow === "function" && getActiveWindow() === win) syncLayerControlForWindow(win);
}
