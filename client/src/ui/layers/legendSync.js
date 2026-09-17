// legendSync.js - Legend synchronization helpers for weather layers
import { updateLegend, removeLegend } from "../legend.js";

export function syncLegendForLayer(layer, winObj, isVisible = true) {
  if (!layer || !layer.element) return;
  if (layer.type !== "contour" && layer.type !== "wind") return;
  const hasShading = isVisible && (Boolean(layer.config?.showFill) || Boolean(layer.config?.showRaster));
  if (hasShading) {
    const colormap = layer.colormap || layer.config?.palettePath || layer.element;
    const min = layer.gridData?.stats?.min;
    const max = layer.gridData?.stats?.max;
    updateLegend(layer.element, colormap, min, max, winObj);
  } else {
    removeLegend(layer.element, winObj);
  }
}

export function removeLegendForLayer(layer, winObj) {
  if (layer?.element) {
    removeLegend(layer.element, winObj);
  }
}
