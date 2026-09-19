// timeHeightDrawerBindings.js - Layer drawer controls bindings for time-height profile
import { timeHeightController } from "../../layers/timeheight/timeHeightController.js";
import { autoSaveLayerConfig } from "../../config/presets.js";

export function bindTimeHeightDrawerEvents(layer, configDrawer) {
  if (!configDrawer || layer.type !== "timeheight") return;

  const lonInput = configDrawer.querySelector(".input-th-lon");
  const latInput = configDrawer.querySelector(".input-th-lat");
  const btnPointApply = configDrawer.querySelector(".btn-th-point-apply");

  const applyPoint = () => {
    const lon = parseFloat(lonInput?.value);
    const lat = parseFloat(latInput?.value);
    if (!Number.isNaN(lon) && !Number.isNaN(lat)) {
      timeHeightController.setPoint(lon, lat);
    }
  };

  btnPointApply?.addEventListener("click", (e) => {
    e.stopPropagation();
    applyPoint();
  });
  lonInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") applyPoint(); });
  latInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") applyPoint(); });

  const inputStart = configDrawer.querySelector(".input-th-start");
  const inputEnd = configDrawer.querySelector(".input-th-end");
  const selStep = configDrawer.querySelector(".sel-th-step");

  const applyRange = () => {
    const s = parseInt(inputStart?.value, 10) || 0;
    const e = parseInt(inputEnd?.value, 10) || 144;
    const st = parseInt(selStep?.value, 10) || 12;
    timeHeightController.setRange(s, e, st);
  };

  inputStart?.addEventListener("change", applyRange);
  inputEnd?.addEventListener("change", applyRange);
  selStep?.addEventListener("change", applyRange);

  const btnDir = configDrawer.querySelector(".btn-th-direction");
  btnDir?.addEventListener("click", (e) => {
    e.stopPropagation();
    const nextDir = timeHeightController.timeDirection === "ltr" ? "rtl" : "ltr";
    timeHeightController.setTimeDirection(nextDir);
    btnDir.textContent = nextDir === "rtl" ? "⇄ 144→0h" : "⇄ 0→144h";
  });

  const cbRH = configDrawer.querySelector(".chk-th-rh");
  const cbTemp = configDrawer.querySelector(".chk-th-temp");
  const cbVVel = configDrawer.querySelector(".chk-th-vvel");
  const cbWind = configDrawer.querySelector(".chk-th-wind");
  const cbMarker = configDrawer.querySelector(".chk-th-marker");

  cbRH?.addEventListener("change", (e) => {
    timeHeightController.panel?.canvasRenderer?.setOptions({ showRH: e.target.checked });
    timeHeightController.panel?.syncElementCheckbox("RH", e.target.checked);
    if (layer.config) layer.config.showRH = e.target.checked;
    autoSaveLayerConfig();
  });
  cbTemp?.addEventListener("change", (e) => {
    timeHeightController.panel?.canvasRenderer?.setOptions({ showTemp: e.target.checked });
    timeHeightController.panel?.syncElementCheckbox("TMP", e.target.checked);
    if (layer.config) layer.config.showTemp = e.target.checked;
    autoSaveLayerConfig();
  });
  cbVVel?.addEventListener("change", (e) => {
    timeHeightController.panel?.canvasRenderer?.setOptions({ showVVel: e.target.checked });
    timeHeightController.panel?.syncElementCheckbox("VVEL", e.target.checked);
    if (layer.config) layer.config.showVVel = e.target.checked;
    autoSaveLayerConfig();
  });
  cbWind?.addEventListener("change", (e) => {
    timeHeightController.panel?.canvasRenderer?.setOptions({ showWind: e.target.checked });
    timeHeightController.panel?.syncElementCheckbox("WIND", e.target.checked);
    if (layer.config) layer.config.showWind = e.target.checked;
    autoSaveLayerConfig();
  });
  cbMarker?.addEventListener("change", (e) => {
    timeHeightController.setHighlightVisible(timeHeightController.activeMap, e.target.checked);
    if (layer.config) layer.config.showGridPointMarker = e.target.checked;
    autoSaveLayerConfig();
  });
}
