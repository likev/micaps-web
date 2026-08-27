// tooltip.js - Hover and click meteorological value inspector
import { formatCoords } from "../utils/formatters.js";

export function initTooltip(containerId = "tooltip") {
  const el = document.getElementById(containerId);
  if (!el) return;

  window.__SHOW_TOOLTIP__ = (lngLat, props) => {
    if (!props) {
      el.classList.add("hidden");
      return;
    }

    const tt = props.temperature > -90 ? `${props.temperature} °C` : "--";
    const td = props.dewpoint > -90 ? `${props.dewpoint} °C` : "--";
    const slp = props.slp > 0 ? `${props.slp} hPa` : "--";
    const wind = props.wind_speed >= 0 ? `${props.wind_speed} m/s (${props.wind_dir}°)` : "--";
    const cloud = props.cloud_cover !== undefined ? `${props.cloud_cover}/8 octas` : "--";
    const rain = props.rain_1h >= 0 ? `${props.rain_1h} mm` : "--";

    el.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px; color: #58a6ff;">
        Station ${props.station_id || props.name || "Observation"}
      </div>
      <div style="color: #8b949e; margin-bottom: 6px;">${formatCoords(lngLat[0], lngLat[1])}</div>
      <div style="display: grid; grid-template-columns: auto auto; gap: 4px 12px;">
        <span>Temp (TT):</span> <strong style="color: #f85149;">${tt}</strong>
        <span>Dewpt (Td):</span> <strong style="color: #56d364;">${td}</strong>
        <span>SLP (PPP):</span> <strong style="color: #79c0ff;">${slp}</strong>
        <span>Wind (ff/dd):</span> <strong>${wind}</strong>
        <span>Cloud (N):</span> <strong>${cloud}</strong>
        <span>Rain 1h:</span> <strong>${rain}</strong>
      </div>
    `;

    el.style.left = "20px";
    el.style.top = "60px";
    el.classList.remove("hidden");
  };

  window.__HIDE_TOOLTIP__ = () => {
    el.classList.add("hidden");
  };
}
