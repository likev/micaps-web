// tlogpLayer.js - Upper-Air T-lnP Sounding Diagram layer facade
import { tlogpController } from "./tlogpController.js";

export { tlogpController };
export * from "./tlogpMath.js";
export { TLogPCanvasRenderer } from "./tlogpCanvas.js";
export { TLogPPanel } from "./tlogpPanel.js";

export async function loadTLogPLayer(map, layer, period = null, level = null, win = null) {
  if (!map) return;
  return await tlogpController.init(map, win, layer);
}

export function removeTLogPLayer(map, win = null) {
  tlogpController.destroy(map, win);
}

export function setTLogPVisibility(map, visible, win = null) {
  if (visible) {
    tlogpController.show();
    if (map) tlogpController.setHighlightVisible(map, true);
  } else {
    tlogpController.hide();
    if (map) tlogpController.setHighlightVisible(map, false);
  }
}
