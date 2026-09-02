// legend.js - Color scale bar and label renderer for weather element fields
import { getColormap, getCSSGradient } from "../utils/colormaps.js";
import { formatElementUnit } from "../utils/formatters.js";

const windowLegends = new Map();

export function updateLegend(element = "TMP", colormap = null, zMin = undefined, zMax = undefined, win = null, panelId = "legend-panel") {
  const winId = win?.id || "default";
  if (!windowLegends.has(winId)) {
    windowLegends.set(winId, new Map());
  }
  const elMap = windowLegends.get(winId);
  elMap.set(element, { element, colormap, zMin, zMax });

  renderLegendPanel(winId, panelId);
}

export function removeLegend(element, win = null, panelId = "legend-panel") {
  const winId = win?.id || "default";
  if (windowLegends.has(winId)) {
    windowLegends.get(winId).delete(element);
    renderLegendPanel(winId, panelId);
  }
}

export function clearLegends(win = null, panelId = "legend-panel") {
  const winId = win?.id || "default";
  if (windowLegends.has(winId)) {
    windowLegends.get(winId).clear();
    renderLegendPanel(winId, panelId);
  }
}

export function syncLegendForWindow(win = null, panelId = "legend-panel") {
  const winId = win?.id || "default";
  renderLegendPanel(winId, panelId);
}

function renderLegendPanel(winId, panelId = "legend-panel") {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const elMap = windowLegends.get(winId);
  if (!elMap || elMap.size === 0) {
    panel.innerHTML = "";
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  const itemsHTML = Array.from(elMap.values()).map((item) => {
    const { element, colormap, zMin, zMax } = item;
    const palette = getColormap(colormap, element);
    const unit = formatElementUnit(element);
    const grad = getCSSGradient(element, colormap);

    let tickLabels = [];
    if (palette && palette.length > 0) {
      if (zMin !== undefined && zMax !== undefined && zMax > zMin) {
        if (element === "HGT") {
          const isDam = zMax < 2500;
          const low = Math.round(zMin);
          const mid = Math.round((zMin + zMax) / 2);
          const high = Math.round(zMax);
          tickLabels = [`${low}`, `${mid}`, `${high} ${isDam ? "dam" : "gpm"}`];
        } else {
          const low = Math.round(zMin);
          const mid = Math.round((zMin + zMax) / 2);
          const high = Math.round(zMax);
          tickLabels = [`${low}`, `${mid}`, `${high} ${unit}`.trim()];
        }
      } else {
        const first = palette[0].val;
        const mid = palette[Math.floor(palette.length / 2)].val;
        const last = palette[palette.length - 1].val;
        tickLabels = [`${first}`, `${mid}`, `${last} ${unit}`.trim()];
      }
    }

    return `
      <div class="legend-item">
        <div class="legend-header">
          <span class="legend-title">${element}</span>
          <span class="legend-unit">${unit ? `(${unit})` : ""}</span>
        </div>
        <div class="legend-bar" role="img" aria-label="${element} color scale ${zMin ?? ''} to ${zMax ?? ''} ${unit}" style="background: ${grad};"></div>
        <div class="legend-ticks">
          ${tickLabels.map((t) => `<span>${t}</span>`).join("")}
        </div>
      </div>
    `;
  }).join("");

  panel.innerHTML = itemsHTML;
}
