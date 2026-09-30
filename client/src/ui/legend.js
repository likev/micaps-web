// legend.js - Color scale bar and label renderer for weather element fields
import {
  getWindowLegendsMap,
  buildLegendItems,
  updateLegend as coreUpdateLegend,
  removeLegend as coreRemoveLegend,
  clearLegends as coreClearLegends,
  hasSvelteLegendOwner,
} from "../lib/stores/legendCore.js";
import { getCurrentActiveWinId } from "../lib/stores/layersCore.js";
import { getWindowById } from "./tabWindowManager.js";

const windowLegends = getWindowLegendsMap();

export { buildLegendItems };

export function updateLegend(element = "TMP", colormap = null, zMin = undefined, zMax = undefined, win = null, panelIdOrExtra = "legend-panel", maybeExtra = {}) {
  const isExtraObject = typeof panelIdOrExtra === "object" && panelIdOrExtra !== null;
  const panelId = isExtraObject ? "legend-panel" : (panelIdOrExtra || "legend-panel");
  const extra = isExtraObject ? panelIdOrExtra : maybeExtra;
  const winObj = typeof win === "string" ? getWindowById(win) : win;
  const winId = typeof win === "string" ? win : (win?.id || (typeof getCurrentActiveWinId === "function" ? getCurrentActiveWinId() : "default") || "default");
  coreUpdateLegend(element, colormap, zMin, zMax, winObj || winId, extra);
  renderLegendPanel(winObj || winId, panelId);
}

export function removeLegend(element, win = null, panelId = "legend-panel") {
  const winObj = typeof win === "string" ? getWindowById(win) : win;
  const winId = typeof win === "string" ? win : (win?.id || (typeof getCurrentActiveWinId === "function" ? getCurrentActiveWinId() : "default") || "default");
  coreRemoveLegend(element, winObj || winId);
  renderLegendPanel(winObj || winId, panelId);
}

export function clearLegends(win = null, panelId = "legend-panel") {
  const winObj = typeof win === "string" ? getWindowById(win) : win;
  const winId = typeof win === "string" ? win : (win?.id || (typeof getCurrentActiveWinId === "function" ? getCurrentActiveWinId() : "default") || "default");
  coreClearLegends(winObj || winId);
  renderLegendPanel(winObj || winId, panelId);
}

export function syncLegendForWindow(win = null, panelId = "legend-panel") {
  const winId = typeof win === "string" ? win : (win?.id || (typeof getCurrentActiveWinId === "function" ? getCurrentActiveWinId() : "default") || "default");
  renderLegendPanel(win || winId, panelId);
}

function renderLegendPanel(winOrId, panelId = "legend-panel") {
  // Single-renderer rule: the mounted Svelte component owns #legend-panel
  // (kept fresh via the store bridge); direct writes here would clobber
  // Svelte-managed nodes and cause partial renders. Only write when no
  // Svelte owner exists (tests, non-Svelte contexts).
  if (hasSvelteLegendOwner()) return;
  if (typeof document === "undefined") return;
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const winId = typeof winOrId === "string" ? winOrId : (winOrId?.id || "default");
  const items = buildLegendItems(winOrId);
  if (!items || items.length === 0) {
    panel.innerHTML = "";
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  const itemsHTML = items.map((item) => {
    const { element, zMin, zMax, unit, gradient, tickLabels, displayTitle } = item;

    return `
      <div class="legend-item">
        <div class="legend-header">
          <span class="legend-title">${displayTitle}</span>
          <span class="legend-unit">${unit ? `(${unit})` : ""}</span>
        </div>
        <div class="legend-bar" role="img" aria-label="${element} color scale ${zMin ?? ''} to ${zMax ?? ''} ${unit}" style="background: ${gradient};"></div>
        <div class="legend-ticks">
          ${tickLabels.map((t) => `<span>${t}</span>`).join("")}
        </div>
      </div>
    `;
  }).join("");

  panel.innerHTML = itemsHTML;
}
