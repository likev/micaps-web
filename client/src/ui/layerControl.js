// layerControl.js - Interactive layer visibility and opacity controls
import { appState } from "../store/appState.js";

export function initLayerControl(containerId = "layer-control", onLayerChange) {
  const panel = document.getElementById(containerId);
  if (!panel) return;

  panel.innerHTML = `
    <div class="panel-title">Layer Control</div>

    <div class="layer-toggle">
      <span>Contour Fills (isoband)</span>
      <input type="checkbox" id="chk-contourf" checked />
    </div>

    <div class="layer-toggle">
      <span>Contour Lines (isoline)</span>
      <input type="checkbox" id="chk-contour" checked />
    </div>

    <div class="layer-toggle">
      <span>Station Weather Plots</span>
      <input type="checkbox" id="chk-station" checked />
    </div>

    <div class="layer-toggle">
      <span>Binary Raster Layer</span>
      <input type="checkbox" id="chk-raster" />
    </div>

    <div class="layer-toggle">
      <span>Wind Streamlines</span>
      <input type="checkbox" id="chk-wind" />
    </div>

    <div class="layer-toggle">
      <span>China Basemap</span>
      <input type="checkbox" id="chk-pmtiles" checked />
    </div>

    <div class="form-group" style="margin-top: 8px;">
      <label>Contour Fill Opacity: <span id="opacity-val">75%</span></label>
      <input type="range" id="slider-opacity" min="10" max="100" value="75" class="slider" />
    </div>
  `;

  bindCheckbox("chk-contourf", "contourf", onLayerChange);
  bindCheckbox("chk-contour", "contour", onLayerChange);
  bindCheckbox("chk-station", "station", onLayerChange);
  bindCheckbox("chk-raster", "raster", onLayerChange);
  bindCheckbox("chk-wind", "wind", onLayerChange);
  bindCheckbox("chk-pmtiles", "pmtiles", onLayerChange);

  const opacitySlider = document.getElementById("slider-opacity");
  const opacityVal = document.getElementById("opacity-val");

  opacitySlider.addEventListener("input", (e) => {
    const val = parseInt(e.target.value, 10);
    opacityVal.textContent = `${val}%`;
    const op = val / 100;
    appState.state.opacity.contourf = op;
    if (onLayerChange) onLayerChange("opacity", op);
  });
}

function bindCheckbox(elementId, layerKey, callback) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.addEventListener("change", (e) => {
    appState.setLayer(layerKey, e.target.checked);
    if (callback) callback(layerKey, e.target.checked);
  });
}
