<script>
  import { fade } from "svelte/transition";
  import { ui } from "../lib/stores/ui.svelte.js";
  import { formatCoords } from "../utils/formatters.js";

  let tooltip = $derived(ui.tooltip);
  let props = $derived(tooltip?.props || null);
  let lngLat = $derived(tooltip?.lngLat || null);

  let hasTT = $derived.by(() => {
    if (!props) return false;
    for (const k of ["temperature", "temp", "TEM", "TT", "T", "TMP"]) {
      if (props[k] !== undefined && props[k] !== null && props[k] !== "" && props[k] !== -9999 && props[k] !== "-9999") {
        const v = Number(props[k]);
        if (!isNaN(v) && v > -90 && v < 90) return true;
      }
    }
    return false;
  });

  let hasTd = $derived.by(() => {
    if (!props) return false;
    for (const k of ["dewpoint", "dew_point", "DPT", "TD", "Td", "td"]) {
      if (props[k] !== undefined && props[k] !== null && props[k] !== "" && props[k] !== -9999 && props[k] !== "-9999") {
        const v = Number(props[k]);
        if (!isNaN(v) && v > -90 && v < 90) return true;
      }
    }
    return false;
  });

  let rawT = $derived.by(() => {
    if (!props) return null;
    for (const k of ["temperature", "temp", "TEM", "TT", "T", "TMP"]) {
      if (props[k] !== undefined && props[k] !== null && props[k] !== "" && props[k] !== -9999 && props[k] !== "-9999") {
        let v = Number(props[k]);
        if (!isNaN(v) && v > -9000 && v < 9000) {
          if (v > 150 && v < 373.15) v = v - 273.15;
          else if ((v > 60 && v <= 600) || (v < -60 && v >= -600)) v = v / 10.0;
          else if (v > 600 && v <= 6000) v = v / 100.0;
          if (v > -90 && v < 90) return Math.round(v * 10) / 10;
        }
      }
    }
    return null;
  });

  let rawTd = $derived.by(() => {
    if (!props) return null;
    for (const k of ["dewpoint", "dew_point", "DPT", "TD", "Td", "td"]) {
      if (props[k] !== undefined && props[k] !== null && props[k] !== "" && props[k] !== -9999 && props[k] !== "-9999") {
        let v = Number(props[k]);
        if (!isNaN(v) && v > -9000 && v < 9000) {
          if (v > 150 && v < 373.15) v = v - 273.15;
          else if ((v > 60 && v <= 600) || (v < -60 && v >= -600)) v = v / 10.0;
          else if (v > 600 && v <= 6000) v = v / 100.0;
          if (v > -90 && v < 90) return Math.round(v * 10) / 10;
        }
      }
    }
    return null;
  });

  let tt = $derived(rawT !== null ? `${rawT} °C` : "--");
  let td = $derived(rawTd !== null ? `${rawTd} °C` : "--");
  let dtd = $derived((rawT !== null && rawTd !== null) ? `${(rawT - rawTd).toFixed(1)} °C` : "--");

  let slpVal = $derived.by(() => {
    if (!props) return null;
    for (const k of ["slp", "SLP", "press_slp", "PRS_Sea", "press_stn", "stn_press", "PRS"]) {
      if (typeof props[k] === "number" && !isNaN(props[k]) && props[k] > 0 && props[k] < 110000) {
        let v = props[k];
        if (v > 8000 && v < 110000) v = v / 100.0;
        else if (v > 8000 && v < 11000) v = v / 10.0;
        if (v >= 800 && v <= 1100) {
          return Math.round(v * 10) / 10;
        }
      }
    }
    if (typeof props.slp_encoded === "string" && props.slp_encoded.length === 3 && !isNaN(parseInt(props.slp_encoded, 10))) {
      const enc = parseInt(props.slp_encoded, 10);
      return Math.round((enc <= 600 ? enc / 10.0 + 1000.0 : enc / 10.0 + 900.0) * 10) / 10;
    }
    return null;
  });

  let hasHeight = $derived(props?.height !== undefined && props?.height !== null && props?.height !== -9999 && props?.height !== "-9999");
  let heightNum = $derived(hasHeight ? parseFloat(props.height) : null);

  let isUpperAir = $derived.by(() => {
    if (!props) return false;
    if (props.isUpperAir === true || props.isUpper === true) return true;
    if (props.isUpperAir === false || props.isSurface === true) return false;
    const model = String(props.model || "").toUpperCase();
    if (model === "UPPER_AIR" || model === "UPPERAIR" || model === "SOUNDING") return true;
    if (model === "SURFACE") return false;
    const elem = String(props.element || "").toUpperCase();
    if (elem === "PLOT_GLOBAL_3H") return false;
    const lId = String(props.layerId || props.layer_id || "").toLowerCase();
    if (lId.includes("upper") || lId.includes("sounding")) return true;
    if (lId.includes("surface")) return false;
    if (props.level !== undefined && props.level !== null && props.level !== 0 && props.level !== "surface") {
      const lvl = Number(props.level);
      if (!isNaN(lvl) && lvl > 0) return true;
    }
    return slpVal === null && heightNum !== null && !isNaN(heightNum) && heightNum > -500;
  });

  let pressureLabel = $derived(isUpperAir ? "Height (H):" : "SLP (PPP):");
  let pressureDisplay = $derived(
    isUpperAir
      ? (heightNum !== null && !isNaN(heightNum) ? `${Math.round(heightNum)} gpm` : "--")
      : (slpVal !== null ? `${slpVal} hPa` : "--")
  );

  let wind = $derived.by(() => {
    if (!props) return "--";
    const rawSpd = props.wind_speed ?? props.windSpeed ?? props.speed ?? props.ff ?? props.FF;
    const rawDir = props.wind_dir ?? props.windDir ?? props.dir ?? props.direction ?? props.dd ?? props.DD;
    const spd = (rawSpd !== undefined && rawSpd !== null && rawSpd !== -9999 && rawSpd !== "-9999") ? Number(rawSpd) : null;
    const dir = (rawDir !== undefined && rawDir !== null && rawDir !== -9999 && rawDir !== "-9999") ? Number(rawDir) : null;
    if (spd !== null && !isNaN(spd) && spd >= 0) {
      if (dir !== null && !isNaN(dir) && dir >= 0) {
        return `${spd} m/s (${Math.round(dir)}°)`;
      }
      return `${spd} m/s`;
    }
    return "--";
  });

  let cloud = $derived.by(() => {
    if (!props) return "--";
    for (const k of ["cloud_cover", "cloudCover", "cloud", "CLO_Cov", "N", "n"]) {
      if (props[k] !== undefined && props[k] !== null && props[k] !== "" && props[k] !== -9999 && props[k] !== "-9999") {
        const num = Number(props[k]);
        if (!isNaN(num) && num >= 0 && num <= 9) {
          return `${Math.round(num)}/8 octas`;
        }
      }
    }
    return "--";
  });

  let rainInfo = $derived.by(() => {
    if (!props) return { label: "Rain 6h:", display: "--" };

    const parseNum = (v) => {
      if (v === undefined || v === null || v === "" || v === -9999 || v === "-9999") return null;
      const n = typeof v === "number" ? v : parseFloat(v);
      if (!isNaN(n) && n >= 0 && n < 9000) {
        return Math.round(n * 10) / 10;
      }
      return null;
    };

    const extractFromKeys = (keys) => {
      for (const k of keys) {
        const val = parseNum(props[k]);
        if (val !== null) return val;
      }
      return null;
    };

    const elem = String(props.element || "").toUpperCase();
    const isHourly = elem.includes("1H") && elem !== "PLOT_GLOBAL_3H";
    const isPlotGlobal3H = elem === "PLOT_GLOBAL_3H" || String(props.layerId || "").toLowerCase().includes("surface") || String(props.model || "").toUpperCase() === "SURFACE" || !isUpperAir;

    // Surface PLOT_GLOBAL_3H observations are taken every 3 hours, but only contain rain6h:
    // It must ALWAYS show "Rain 6h:" and NEVER fall back to "Rain 1h:"!
    if (isPlotGlobal3H && !isHourly) {
      const val = extractFromKeys(["rain_6h", "RAIN_6H", "rain6h", "PRE_6h", "RAIN_6h"]);
      return {
        label: "Rain 6h:",
        display: val !== null ? `${val} mm` : "--",
      };
    }

    // Hourly observation products (e.g. 1h regional AWS)
    if (isHourly) {
      const val = extractFromKeys(["rain_1h", "RAIN_1H", "rain1h", "PRE_1h", "RAIN_1h"]);
      return {
        label: "Rain 1h:",
        display: val !== null ? `${val} mm` : "--",
      };
    }

    // Generic fallback for any other precipitation intervals
    const val6 = extractFromKeys(["rain_6h", "RAIN_6H", "rain6h", "PRE_6h", "RAIN_6h"]);
    if (val6 !== null) return { label: "Rain 6h:", display: `${val6} mm` };

    const val1 = extractFromKeys(["rain_1h", "RAIN_1H", "rain1h", "PRE_1h", "RAIN_1h"]);
    if (val1 !== null) return { label: "Rain 1h:", display: `${val1} mm` };

    for (const [intLabel, keys] of [
      ["Rain 3h:", ["rain_3h", "RAIN_3H", "rain3h", "PRE_3h", "RAIN_3h"]],
      ["Rain 12h:", ["rain_12h", "RAIN_12H", "rain12h", "PRE_12h", "RAIN_12h"]],
      ["Rain 24h:", ["rain_24h", "RAIN_24H", "rain24h", "PRE_24h", "RAIN_24h"]],
      ["Rain:", ["rain", "RAIN"]],
    ]) {
      const v = extractFromKeys(keys);
      if (v !== null) return { label: intLabel, display: `${v} mm` };
    }

    return { label: "Rain 6h:", display: "--" };
  });
</script>

{#if tooltip && props}
  <div
    id="tooltip"
    class="tooltip"
    style:left="{tooltip.x}px"
    style:top="{tooltip.y}px"
    transition:fade={{ duration: 100 }}
  >
    <div class="tooltip-title">
      Station {props.station_id || props.name || "Observation"}
    </div>
    {#if lngLat}
      <div class="tooltip-coords">{formatCoords(lngLat[0], lngLat[1])}</div>
    {/if}
    <div class="tooltip-grid">
      <span>Temp (TT):</span> <strong class="val-tt">{tt}</strong>
      <span>Dewpt (Td):</span> <strong class="val-td">{td}</strong>
      <span>DTD (T−Td):</span> <strong class="val-dtd">{dtd}</strong>
      <span>{pressureLabel}</span> <strong class="val-p">{pressureDisplay}</strong>
      <span>Wind (ff/dd):</span> <strong>{wind}</strong>
      {#if !isUpperAir}
        <span>Cloud (N):</span> <strong>{cloud}</strong>
        <span>{rainInfo.label}</span> <strong>{rainInfo.display}</strong>
      {/if}
    </div>
  </div>
{/if}

<style>
  .tooltip {
    position: absolute;
    pointer-events: none;
    background: var(--bg-panel, rgba(18, 24, 36, 0.95));
    color: var(--text-primary, #e6edf3);
    border: 1px solid var(--border-color, rgba(56, 139, 253, 0.4));
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 12px;
    font-family: var(--font-mono, monospace);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    z-index: 2000;
    max-width: min(280px, 80vw);
    overflow-wrap: break-word;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  :global([data-theme="light"]) .tooltip,
  :global([data-scheme="light"]) .tooltip {
    background: var(--bg-panel, rgba(255, 255, 255, 0.96));
    color: var(--text-primary, #1f2328);
    border-color: var(--border-color, rgba(0, 0, 0, 0.15));
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  }

  .tooltip-title {
    font-weight: bold;
    margin-bottom: 4px;
    color: var(--accent-blue, #58a6ff);
  }

  :global([data-theme="light"]) .tooltip-title,
  :global([data-scheme="light"]) .tooltip-title {
    color: var(--accent-blue, #0969da);
  }

  :global([data-theme="dark"]) .tooltip-title {
    color: #58a6ff;
  }

  .tooltip-coords {
    color: var(--text-secondary, #8b949e);
    margin-bottom: 6px;
  }

  :global([data-theme="light"]) .tooltip-coords,
  :global([data-scheme="light"]) .tooltip-coords {
    color: var(--text-secondary, #656d76);
  }

  .tooltip-grid {
    display: grid;
    grid-template-columns: auto auto;
    gap: 4px 12px;
  }

  .tooltip-grid span {
    color: var(--text-secondary, #8b949e);
  }

  :global([data-theme="light"]) .tooltip-grid span,
  :global([data-scheme="light"]) .tooltip-grid span {
    color: var(--text-secondary, #656d76);
  }

  .tooltip-grid strong {
    color: var(--text-primary, #e6edf3);
  }

  :global([data-theme="light"]) .tooltip-grid strong,
  :global([data-scheme="light"]) .tooltip-grid strong {
    color: var(--text-primary, #1f2328);
  }

  .val-tt {
    color: var(--accent-red, #f85149);
  }

  :global([data-theme="light"]) .val-tt,
  :global([data-scheme="light"]) .val-tt {
    color: var(--accent-red, #cf222e);
  }

  :global([data-theme="dark"]) .val-tt {
    color: #f85149;
  }

  .val-td {
    color: var(--accent-green, #2ea043);
  }

  :global([data-theme="light"]) .val-td,
  :global([data-scheme="light"]) .val-td {
    color: var(--accent-green, #1a7f37);
  }

  :global([data-theme="dark"]) .val-td {
    color: #56d364;
  }

  .val-dtd {
    color: var(--accent-orange, #d29922);
  }

  :global([data-theme="light"]) .val-dtd,
  :global([data-scheme="light"]) .val-dtd {
    color: var(--accent-orange, #9a6700);
  }

  :global([data-theme="dark"]) .val-dtd {
    color: #f0883e;
  }

  .val-p {
    color: var(--accent-cyan, #39c5bb);
  }

  :global([data-theme="light"]) .val-p,
  :global([data-scheme="light"]) .val-p {
    color: var(--accent-cyan, #1b7c83);
  }

  :global([data-theme="dark"]) .val-p {
    color: #79c0ff;
  }
</style>
