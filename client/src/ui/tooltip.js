// tooltip.js - Hover and click meteorological value inspector
import { formatCoords } from "../utils/formatters.js";

export function initTooltip(containerId = "tooltip") {
  const el = document.getElementById(containerId);
  if (!el) return;

  const targetGlobal = typeof window !== "undefined" ? window : globalThis;

  targetGlobal.__SHOW_TOOLTIP__ = (lngLat, props, cursorPos = null) => {
    if (!props) {
      el.classList.add("hidden");
      return;
    }

    // Value threshold -90 filters missing/sentinel values (MICAPS uses -999); Antarctic -80 remains valid.
    const hasTT = typeof props.temperature === "number" && !isNaN(props.temperature) && props.temperature > -90;
    const hasTd = typeof props.dewpoint === "number" && !isNaN(props.dewpoint) && props.dewpoint > -90;
    const tt = hasTT ? `${props.temperature} °C` : "--";
    const td = hasTd ? `${props.dewpoint} °C` : "--";
    const dtd = (hasTT && hasTd) ? `${(props.temperature - props.dewpoint).toFixed(1)} °C` : "--";
    let slpVal = null;
    for (const k of ["slp", "SLP", "press_slp", "PRS_Sea", "press_stn", "stn_press", "PRS"]) {
      if (typeof props[k] === "number" && !isNaN(props[k]) && props[k] > 0 && props[k] < 110000) {
        let v = props[k];
        if (v > 8000 && v < 110000) v = v / 100.0;
        else if (v > 8000 && v < 11000) v = v / 10.0;
        if (v >= 800 && v <= 1100) {
          slpVal = Math.round(v * 10) / 10;
          break;
        }
      }
    }
    if (slpVal === null && typeof props.slp_encoded === "string" && props.slp_encoded.length === 3 && !isNaN(parseInt(props.slp_encoded, 10))) {
      const enc = parseInt(props.slp_encoded, 10);
      slpVal = Math.round((enc <= 600 ? enc / 10.0 + 1000.0 : enc / 10.0 + 900.0) * 10) / 10;
    }

    const hasHeight = props.height !== undefined && props.height !== null && props.height !== -9999 && props.height !== "-9999";
    const heightNum = hasHeight ? parseFloat(props.height) : null;
    const isUpperAir = slpVal === null && heightNum !== null && !isNaN(heightNum) && heightNum > -500;

    const pressureLabel = isUpperAir ? "Height (H):" : "SLP (PPP):";
    const pressureDisplay = isUpperAir ? `${Math.round(heightNum)} gpm` : (slpVal !== null ? `${slpVal} hPa` : "--");
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
        <span>DTD (T−Td):</span> <strong style="color: #f0883e;">${dtd}</strong>
        <span>${pressureLabel}</span> <strong style="color: #79c0ff;">${pressureDisplay}</strong>
        <span>Wind (ff/dd):</span> <strong>${wind}</strong>
        <span>Cloud (N):</span> <strong>${cloud}</strong>
        <span>Rain 1h:</span> <strong>${rain}</strong>
      </div>
    `;

    // Dynamic positioning: if cursor position provided, position near cursor; fallback to 20,60.
    let x = 20, y = 60;
    const pos = cursorPos || (props && typeof props.x === "number" && typeof props.y === "number" ? props : null) || (props && typeof props.clientX === "number" ? { x: props.clientX, y: props.clientY } : null);
    const rawX = typeof pos?.x === "number" ? pos.x : (cursorPos && typeof cursorPos.clientX === "number" ? cursorPos.clientX : null);
    const rawY = typeof pos?.y === "number" ? pos.y : (cursorPos && typeof cursorPos.clientY === "number" ? cursorPos.clientY : null);

    if (rawX !== null && rawY !== null) {
      x = rawX + 16;
      y = rawY + 16;
      // Clamp to viewport to avoid overflow
      const vw = (typeof window !== "undefined" && window.innerWidth) || 800;
      const vh = (typeof window !== "undefined" && window.innerHeight) || 600;
      const estW = 280, estH = 180;
      if (x + estW > vw) x = Math.max(8, vw - estW - 8);
      if (y + estH > vh) y = Math.max(52, rawY - estH - 12);
      if (y < 52) y = 52;
    }
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.classList.remove("hidden");
  };

  targetGlobal.__HIDE_TOOLTIP__ = () => {
    el.classList.add("hidden");
  };
}
