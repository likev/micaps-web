// timeHeightLayer.js - EC Time-Height Profile layer facade
import { timeHeightController } from "./timeHeightController.js";
import { addOrUpdateLayer, removeLayer, syncLayerControlForWindow } from "../../ui/layers/layerStore.js";
import { getActiveWindow } from "../../ui/tabs/tabsStore.js";

export { timeHeightController };
export * from "./timeHeightSampling.js";
export * from "./timeHeightLoader.js";
export { TimeHeightCanvasRenderer } from "./timeHeightCanvas.js";
export { TimeHeightPanel } from "./timeHeightPanel.js";

export async function loadTimeHeightLayer(map, layer = {}, win = null) {
  if (!map) return;

  const layerId = layer.id || "ec-timeheight-diagram";
  const isVisible = layer.visible !== false;
  const config = layer.config || {};

  const timeHeightLayerDef = {
    id: layerId,
    name: layer.name || "EC Time-Height Profile (click map for point)",
    type: "timeheight",
    model: layer.model || "ECMWF_HR",
    element: layer.element || "RH",
    visible: isVisible,
    removable: layer.removable !== false,
    config: {
      lon: config.lon !== undefined ? config.lon : 121.5,
      lat: config.lat !== undefined ? config.lat : 31.4,
      initCycle: config.initCycle || null,
      startHour: config.startHour !== undefined ? config.startHour : 0,
      endHour: config.endHour !== undefined ? config.endHour : 144,
      stepHours: config.stepHours !== undefined ? config.stepHours : 12,
      timeDirection: config.timeDirection || "ltr",
      levels: config.levels || [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200],
      showRH: config.showRH !== false,
      showTemp: config.showTemp !== false,
      showVVel: config.showVVel !== false,
      showWind: config.showWind !== false,
      showGridPointMarker: config.showGridPointMarker !== false,
      ...config,
    },
  };

  addOrUpdateLayer(timeHeightLayerDef, win);
  if (win && typeof getActiveWindow === "function" && getActiveWindow() === win) {
    syncLayerControlForWindow(win);
  }

  return await timeHeightController.init(map, win, timeHeightLayerDef);
}

export function removeTimeHeightLayer(map, win = null) {
  timeHeightController.destroy(map, win);
  removeLayer("ec-timeheight-diagram", win);
}

export function setTimeHeightVisibility(map, visible, win = null) {
  if (visible) {
    timeHeightController.show(map, win);
  } else {
    timeHeightController.hide(map, win);
  }
  addOrUpdateLayer({ id: "ec-timeheight-diagram", visible: Boolean(visible) }, win);
  if (win && typeof getActiveWindow === "function" && getActiveWindow() === win) {
    syncLayerControlForWindow(win);
  }
}
