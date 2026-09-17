// actionsDispatcher.js - Main dispatcher for layer control events and mutations
import { removeContourLayer, setLayerIsobandVisibility } from "../../layers/contourLayer.js";
import { setStationVisibility } from "../../layers/stationLayer.js";
import { setRasterVisibility, removeRasterLayer } from "../../layers/rasterLayer.js";
import { stopWindAnimation, removeGridWindBarbs } from "../../layers/windLayer.js";
import { appState } from "../../store/appState.js";
import { getActiveWindow, getWindowById, updateWindowTitle } from "../tabWindowManager.js";
import { getLayersForWindow } from "./layerStore.js";
import { updateLegend, removeLegend } from "../legend.js";
import { removeDerivedLayerFromPreset } from "../../config/presets.js";
import { triggerRasterOverlay, triggerWindStreamlines } from "../../services/overlayTriggers.js";
import { handleVisibilityAction } from "./visibilityActions.js";
import { handleConfigAction } from "./configActions.js";
import { handleAddContourAction } from "./derivedContourActions.js";

export function handleRemoveAction(map, layerId, layer, win) {
  if ((layer.type === "contour" || layer.type === "wind") && layer.element) {
    removeLegend(layer.element, win);
  }
  if (layer.type === "contour" || layer.type === "wind") {
    removeContourLayer(map, layerId);
    removeRasterLayer(map, layerId);
    if (layer.type === "wind" || layer.config?.showWind) {
      stopWindAnimation(map);
    }
    if (layer.type === "wind" || layer.config?.showBarbs) {
      removeGridWindBarbs(map);
    }

    // Persist deletion of layer from preset configuration
    const activeGroup = win?.activeGroup || appState.get("activeGroup");
    if (activeGroup?.id) {
      if (layer.derivedFrom || layer.id?.startsWith("contour-surface-") || layer.id?.startsWith("contour-sounding-")) {
        removeDerivedLayerFromPreset(activeGroup.id, layer);
      }
      if (Array.isArray(activeGroup.layers)) {
        const aIdx = activeGroup.layers.findIndex(
          (l) => l.id === layerId || (l.model === layer.model && l.element === layer.element)
        );
        if (aIdx >= 0) {
          activeGroup.layers.splice(aIdx, 1);
        }
      }
    }
    if (Array.isArray(win?.derivedContourSnapshots)) {
      win.derivedContourSnapshots = win.derivedContourSnapshots.filter(
        (s) => s.id !== layerId && !(s.model === layer.model && s.element === layer.element)
      );
    }
    if (Array.isArray(win?.layerSnapshots)) {
      win.layerSnapshots = win.layerSnapshots.filter(
        (s) => s.id !== layerId && !(s.model === layer.model && s.element === layer.element)
      );
    }

    // If in non-preset single-product mode and the base element layer was removed,
    // update win.element to the next remaining weather layer
    if (!activeGroup) {
      const remaining = getLayersForWindow(win).filter(
        (l) => l.type !== "pmtiles" && l.id !== layerId && l.id !== layer?.id
      );
      if (remaining.length > 0) {
        if (
          win &&
          (win.element === layer.element || layerId === `wind-${win.element}` || layerId === `contour-${win.element}`)
        ) {
          const nextLayer = remaining[0];
          win.element = nextLayer.element;
          if (nextLayer.model) win.model = nextLayer.model;
          if (nextLayer.level !== undefined && nextLayer.level !== null) win.level = nextLayer.level;
          updateWindowTitle(win);
        }
      }
    }
  } else if (layer.type === "station") {
    setStationVisibility(map, false);
    if (layer.config?.showStreamlines) stopWindAnimation(map);
    if (Array.isArray(win?.layerSnapshots)) {
      win.layerSnapshots = win.layerSnapshots.filter((s) => s.id !== layerId);
    }
  } else if (layer.type === "tlogp") {
    import("../../layers/tlogp/tlogpLayer.js").then(({ removeTLogPLayer }) => {
      removeTLogPLayer(map, win);
    });
  }
}

export function handleAuxAction(map, layerId, value, winObj) {
  if (layerId === "raster") {
    if (value) {
      const layers = getLayersForWindow(winObj);
      layers.forEach((l) => {
        if (l.type === "contour") {
          l.config = { ...l.config, showFill: false, showRaster: true };
          setLayerIsobandVisibility(map, l.id, false);
        }
      });
      triggerRasterOverlay(map, null, winObj);
    } else {
      setRasterVisibility(map, false);
      const layers = getLayersForWindow(winObj);
      layers.forEach((l) => {
        if (l.config?.showRaster) l.config.showRaster = false;
        const hasShading = l.visible !== false && Boolean(l.config?.showFill);
        if (!hasShading && l.element) removeLegend(l.element, winObj);
      });
    }
  } else if (layerId === "contourf") {
    const layers = getLayersForWindow(winObj);
    const contourLayers = layers.filter((l) => l.type === "contour");
    contourLayers.forEach((l) => {
      l.config = { ...l.config, showFill: value };
      setLayerIsobandVisibility(map, l.id, l.visible !== false && value);
      if (value) {
        l.config.showRaster = false;
        setRasterVisibility(map, false, l.id);
      }
      const hasShading = l.visible !== false && (value || Boolean(l.config?.showRaster));
      if (hasShading) {
        const colormap = l.colormap || l.config?.palettePath || l.element;
        updateLegend(l.element, colormap, l.gridData?.stats?.min, l.gridData?.stats?.max, winObj);
      } else {
        removeLegend(l.element, winObj);
      }
    });
  } else if (layerId === "wind") {
    if (value) {
      triggerWindStreamlines(map, null, winObj);
    } else {
      stopWindAnimation(map);
    }
  }
}

export function handleLayerAction(map, action, layerId, value, layer, win = getActiveWindow()) {
  const winObj = typeof win === "string" ? getWindowById(win) || getActiveWindow() : win || getActiveWindow();

  if (action === "visibility") {
    handleVisibilityAction(map, layerId, value, layer, winObj);
  } else if (action === "config") {
    handleConfigAction(map, layerId, value, layer, winObj);
  } else if (action === "addContour") {
    handleAddContourAction(map, layer, value, winObj);
  } else if (action === "remove") {
    handleRemoveAction(map, layerId, layer, winObj);
  } else if (action === "aux") {
    handleAuxAction(map, layerId, value, winObj);
  }
}
