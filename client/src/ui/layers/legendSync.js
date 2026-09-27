// legendSync.js - Legend synchronization helpers for weather layers
import { updateLegend, removeLegend } from "../legend.js";

export function syncLegendForLayer(layer, winObj, isVisible = true) {
  if (!layer) return;
  const element = layer.element || (layer.type === "wind" ? "WIND" : null);
  if (!element) return;
  if (layer.type !== "contour" && layer.type !== "wind") return;
  const hasShading = isVisible && (Boolean(layer.config?.showFill) || Boolean(layer.config?.showRaster));
  if (hasShading) {
    const colormap = (layer.colormap && String(layer.colormap).startsWith("palette:"))
      ? layer.colormap
      : (layer.config?.palettePath ? `palette:${layer.id}` : (layer.colormap || element));
    const min = layer.gridData?.stats?.min;
    const max = layer.gridData?.stats?.max;
    updateLegend(element, colormap, min, max, winObj);
  } else {
    removeLegend(element, winObj);
  }
}

export function removeLegendForLayer(layer, winObj) {
  const element = layer?.element || (layer?.type === "wind" ? "WIND" : null);
  if (element) {
    removeLegend(element, winObj);
  }
}
