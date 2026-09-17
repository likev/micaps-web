// layerListView.js - Layers manager panel rendering and reconciliation
import {
  getLayersForWindow,
  getCurrentActiveWinId,
  getCurrentActiveWinTitle,
  setOnLayerActionCallback,
  getOnLayerActionCallback,
  registerRenderLayersManager,
} from "./layerStore.js";
import { renderLayerRow } from "./layerRowView.js";
import { bindLayerRowEvents, bindAuxCheckboxes } from "./layerRowBindings.js";

export function renderLayersManager(panel) {
  const currentActiveWinId = getCurrentActiveWinId();
  const currentActiveWinTitle = getCurrentActiveWinTitle();
  const onLayerActionCallback = getOnLayerActionCallback();
  const layers = getLayersForWindow(currentActiveWinId);
  const count = layers.length;

  // Single-open invariant: ensure at most one layer is expanded on render
  let foundExpanded = false;
  layers.forEach((l) => {
    if (l.isExpanded) {
      if (foundExpanded) {
        l.isExpanded = false;
      } else {
        foundExpanded = true;
      }
    }
  });

  // Preserve scroll and focus across full rebuild
  const prevList = panel.querySelector("#layers-list");
  const prevScrollTop = prevList ? prevList.scrollTop : 0;
  const activeEl = document.activeElement;
  const activeElId = activeEl && activeEl.id ? activeEl.id : null;
  let activeFallbackSelector = null;
  if (activeEl && panel.contains(activeEl) && !activeElId) {
    const dlid = activeEl.getAttribute && activeEl.getAttribute("data-layer-id");
    const ridx = activeEl.getAttribute && activeEl.getAttribute("data-rule-idx");
    const cls = activeEl.className ? String(activeEl.className).trim().split(/\s+/)[0] : null;
    const ruleAttr = ridx !== null && ridx !== undefined ? `[data-rule-idx="${CSS.escape(ridx)}"]` : "";
    if (dlid && cls) activeFallbackSelector = `.${CSS.escape(cls)}[data-layer-id="${CSS.escape(dlid)}"]${ruleAttr}`;
    else if (dlid) activeFallbackSelector = `[data-layer-id="${CSS.escape(dlid)}"]${ruleAttr}`;
    else if (cls) activeFallbackSelector = `.${CSS.escape(cls)}${ruleAttr}`;
    else if (ruleAttr) activeFallbackSelector = ruleAttr;
  }

  // Synchronize compatibility input states from actual layer models
  const contourLayer = layers.find((l) => l.type === "contour");
  const stationLayer = layers.find((l) => l.type === "station");
  const pmtilesLayer = layers.find((l) => l.type === "pmtiles");
  const isobandVis = contourLayer ? contourLayer.visible && contourLayer.config?.showFill !== false : true;
  const isolineVis = contourLayer ? contourLayer.visible && contourLayer.config?.showLine !== false : true;
  const stationVis = stationLayer ? stationLayer.visible : true;
  const pmtilesVis = pmtilesLayer ? pmtilesLayer.visible : true;
  const hasRaster = layers.some((l) => l.visible && l.config?.showRaster);
  const hasWind = layers.some((l) => l.visible && l.config?.showWind);
  const opacityVal = Math.round((contourLayer?.config?.opacity ?? 0.75) * 100);

  panel.innerHTML = `
    <div class="panel-title">
      <div style="display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden;">
        <span style="white-space: nowrap;">Layers</span>
        ${currentActiveWinTitle ? `<span class="win-target-badge" title="${currentActiveWinTitle}">${currentActiveWinTitle}</span>` : ""}
      </div>
      <span class="badge" id="layer-count">${count}</span>
    </div>

    <div class="layers-manage-container" id="layers-list">
      ${layers.map((layer) => renderLayerRow(layer)).join("")}
    </div>

    <!-- Hidden compatibility elements for automated test suites -->
    <div style="display:none;">
      <input type="checkbox" id="chk-contourf" ${isobandVis ? "checked" : ""} />
      <input type="checkbox" id="chk-contour" ${isolineVis ? "checked" : ""} />
      <input type="checkbox" id="chk-station" ${stationVis ? "checked" : ""} />
      <input type="checkbox" id="chk-pmtiles" ${pmtilesVis ? "checked" : ""} />
      <input type="checkbox" id="chk-raster" ${hasRaster ? "checked" : ""} />
      <input type="checkbox" id="chk-wind" ${hasWind ? "checked" : ""} />
      <input type="range" id="slider-opacity" min="10" max="100" value="${opacityVal}" />
      <span id="opacity-val">${opacityVal}%</span>
    </div>
  `;

  // Restore scroll and focus
  try {
    const newList = panel.querySelector("#layers-list");
    if (newList) newList.scrollTop = prevScrollTop;
    if (activeElId) {
      const toFocus = panel.querySelector(`#${CSS.escape(activeElId)}`) || document.getElementById(activeElId);
      if (toFocus && typeof toFocus.focus === "function" && panel.contains(toFocus)) toFocus.focus();
    } else if (activeFallbackSelector) {
      const toFocus = panel.querySelector(activeFallbackSelector);
      if (toFocus && typeof toFocus.focus === "function") toFocus.focus();
    }
  } catch {}

  bindLayerRowEvents(panel, layers, currentActiveWinId, onLayerActionCallback);
  bindAuxCheckboxes(currentActiveWinId, onLayerActionCallback);
}

export function initLayerControl(containerId = "layer-control", onLayerAction) {
  setOnLayerActionCallback(onLayerAction);
  registerRenderLayersManager(renderLayersManager);
  const panel = document.getElementById(containerId);
  if (!panel) return;
  renderLayersManager(panel);
}

// Auto-register with store
registerRenderLayersManager(renderLayersManager);
