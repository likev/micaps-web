// ui.svelte.js - Unified reactive UI show/hide, modal, tooltip, and toast store
import { createInitialUIState, clampTooltipPosition } from "./uiCore.js";

export const ui = $state(createInitialUIState());

let toastTimer = null;

export function showToast(kind, message, durationMs = 4000) {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  ui.toast = { kind, message };
  if (durationMs > 0) {
    toastTimer = setTimeout(() => {
      ui.toast = null;
      toastTimer = null;
    }, durationMs);
  }
}

export function hideToast() {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  ui.toast = null;
}

export function showTooltip(lngLat, props, cursorPos = null) {
  if (!props) {
    ui.tooltip = null;
    return;
  }
  const pos = cursorPos || (props && typeof props.x === "number" && typeof props.y === "number" ? props : null) || (props && typeof props.clientX === "number" ? { x: props.clientX, y: props.clientY } : null);
  const rawX = typeof pos?.x === "number" ? pos.x : (cursorPos && typeof cursorPos.clientX === "number" ? cursorPos.clientX : null);
  const rawY = typeof pos?.y === "number" ? pos.y : (cursorPos && typeof cursorPos.clientY === "number" ? cursorPos.clientY : null);

  const vw = (typeof window !== "undefined" && window.innerWidth) || 800;
  const vh = (typeof window !== "undefined" && window.innerHeight) || 600;
  const { x, y } = clampTooltipPosition(rawX, rawY, vw, vh);

  ui.tooltip = { lngLat, props, x, y };
}

export function hideTooltip() {
  ui.tooltip = null;
}

export { clampTooltipPosition };
