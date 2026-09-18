// tlogpLayer.js - Upper-Air T-lnP Sounding Diagram layer facade
import { tlogpController } from "./tlogpController.js";
import { addOrUpdateLayer, removeLayer, syncLayerControlForWindow } from "../../ui/layers/layerStore.js";
import { getActiveWindow } from "../../ui/tabs/tabsStore.js";

export { tlogpController };
export * from "./tlogpMath.js";
export { TLogPCanvasRenderer } from "./tlogpCanvas.js";
export { TLogPPanel } from "./tlogpPanel.js";

export async function loadTLogPLayer(map, layer = {}, period = null, level = null, win = null) {
  if (!map) return;

  const layerId = layer.id || "upperair-tlogp-diagram";
  const stationId = layer.config?.stationId || layer.stationId || tlogpController.activeStationId || "58362";
  const parcelLevel = layer.config?.parcelLevel || layer.parcelLevel || "surface";
  const isVisible = layer.visible !== false;

  const tlogpLayerDef = {
    id: layerId,
    name: layer.name || `T-lnP Sounding Diagram (${stationId})`,
    type: "tlogp",
    model: "UPPER_AIR",
    element: "TLOGP",
    stationId,
    visible: isVisible,
    removable: layer.removable !== false,
    color: layer.color || "#f85149",
    config: {
      stationId,
      stationName: layer.config?.stationName || `${stationId} 上海/宝山`,
      parcelLevel,
      showTemp: layer.config?.showTemp !== false,
      showDewpoint: layer.config?.showDewpoint !== false,
      showWind: layer.config?.showWind !== false,
      showParcel: layer.config?.showParcel !== false,
      showDryAdiabats: layer.config?.showDryAdiabats !== false,
      showMoistAdiabats: layer.config?.showMoistAdiabats !== false,
      showMixingRatio: layer.config?.showMixingRatio !== false,
      showIndices: layer.config?.showIndices !== false,
      ...(layer.config || {}),
    },
  };

  addOrUpdateLayer(tlogpLayerDef, win);
  if (win && typeof getActiveWindow === "function" && getActiveWindow() === win) {
    syncLayerControlForWindow(win);
  }

  return await tlogpController.init(map, win, tlogpLayerDef);
}

export function removeTLogPLayer(map, win = null) {
  tlogpController.destroy(map, win);
  removeLayer("upperair-tlogp-diagram", win);
}

export function setTLogPVisibility(map, visible, win = null) {
  if (visible) {
    tlogpController.show();
    if (map) tlogpController.setHighlightVisible(map, true);
  } else {
    tlogpController.hide();
    if (map) tlogpController.setHighlightVisible(map, false);
  }
  addOrUpdateLayer({ id: "upperair-tlogp-diagram", visible: Boolean(visible) }, win);
  if (win && typeof getActiveWindow === "function" && getActiveWindow() === win) {
    syncLayerControlForWindow(win);
  }
}
