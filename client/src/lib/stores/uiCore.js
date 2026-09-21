// uiCore.js - Plain-core definitions and pure helpers for UI visibility, tooltips, and toasts

export function createInitialUIState() {
  return {
    layersOpen: true,
    timelineVisible: false,
    configOpen: false,
    activeConfigSubtab: "presets", // presets | colormaps | settings | json
    configDirty: false,
    tooltip: null, // { lngLat, props, x, y } | null
    toast: null, // { kind, message } | null
    expandedLayerId: null,
    windowContextMenu: null,
    isFullscreen: false,
  };
}

export const uiState = createInitialUIState();

export function clampTooltipPosition(rawX, rawY, vw = 800, vh = 600, estW = 280, estH = 180) {
  if (rawX === null || rawX === undefined || rawY === null || rawY === undefined) {
    return { x: 20, y: 60 };
  }
  let x = rawX + 16;
  let y = rawY + 16;
  if (x + estW > vw) x = Math.max(8, vw - estW - 8);
  if (y + estH > vh) y = Math.max(52, rawY - estH - 12);
  if (y < 52) y = 52;
  return { x, y };
}
