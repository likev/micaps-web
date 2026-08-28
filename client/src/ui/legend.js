// legend.js - Color scale bar and label renderer for weather element fields
import { getCSSGradient } from "../utils/colormaps.js";

export function updateLegend(element = "TMP", colormap = null, panelId = "legend-panel") {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const grad = getCSSGradient(element, colormap);
  panel.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 2px;">${element} Legend</div>
    <div class="legend-bar" style="background: ${grad};"></div>
    <div class="legend-ticks">
      <span>Low</span>
      <span>Mid</span>
      <span>High</span>
    </div>
  `;
}
