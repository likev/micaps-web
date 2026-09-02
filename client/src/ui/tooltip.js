// tooltip.js - Hover and click meteorological value inspector
import { formatCoords } from "../utils/formatters.js";

export function initTooltip(containerId = "tooltip") {
  const el = document.getElementById(containerId);
  if (!el) return;

  window.__SHOW_TOOLTIP__ = (lngLat, props, cursorPos = null) => {
    if (!props) {
      el.classList.add("hidden");
      return;
    }

    // Value threshold -90 filters missing/sentinel values (MICAPS uses -999); Antarctic -80 remains valid.
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

    // Dynamic positioning: if cursor position provided (via 3rd arg or props/cursorPos containing x/y), position near cursor; fallback to 20,60.
    let x = 20, y = 60;
    const pos = cursorPos || (props && typeof props.x === "number" && typeof props.y === "number" ? props : null) || (props && typeof props.clientX === "number" ? { x: props.clientX, y: props.clientY } : null);
    if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
      x = pos.x + 16;
      y = pos.y + 16;
      // Clamp to viewport to avoid overflow
      const vw = window.innerWidth || 800;
      const vh = window.innerHeight || 600;
      // Approximate tooltip size 260x180; adjust after render if needed
      const estW = 280, estH = 180;
      if (x + estW > vw) x = Math.max(8, vw - estW - 8);
      if (y + estH > vh) y = Math.max(8, pos.y - estH - 12);
    } else if (cursorPos && typeof cursorPos.clientX === "number") {
      x = cursorPos.clientX + 16;
      y = cursorPos.clientY + 16;
    }
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.classList.remove("hidden");
  };

  window.__HIDE_TOOLTIP__ = () => {
    el.classList.add("hidden");
  };
}
