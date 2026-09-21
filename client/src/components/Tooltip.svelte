<script>
  import { fade } from "svelte/transition";
  import { ui } from "../lib/stores/ui.svelte.js";
  import { formatCoords } from "../utils/formatters.js";

  let tooltip = $derived(ui.tooltip);
  let props = $derived(tooltip?.props || null);
  let lngLat = $derived(tooltip?.lngLat || null);

  let hasTT = $derived(typeof props?.temperature === "number" && !isNaN(props.temperature) && props.temperature > -90);
  let hasTd = $derived(typeof props?.dewpoint === "number" && !isNaN(props.dewpoint) && props.dewpoint > -90);
  let tt = $derived(hasTT ? `${props.temperature} °C` : "--");
  let td = $derived(hasTd ? `${props.dewpoint} °C` : "--");
  let dtd = $derived((hasTT && hasTd) ? `${(props.temperature - props.dewpoint).toFixed(1)} °C` : "--");

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
  let isUpperAir = $derived(slpVal === null && heightNum !== null && !isNaN(heightNum) && heightNum > -500);

  let pressureLabel = $derived(isUpperAir ? "Height (H):" : "SLP (PPP):");
  let pressureDisplay = $derived(isUpperAir ? `${Math.round(heightNum)} gpm` : (slpVal !== null ? `${slpVal} hPa` : "--"));
  let wind = $derived(props?.wind_speed >= 0 ? `${props.wind_speed} m/s (${props.wind_dir}°)` : "--");
  let cloud = $derived(props?.cloud_cover !== undefined ? `${props.cloud_cover}/8 octas` : "--");
  let rain = $derived(props?.rain_1h >= 0 ? `${props.rain_1h} mm` : "--");
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
      <span>Cloud (N):</span> <strong>{cloud}</strong>
      <span>Rain 1h:</span> <strong>{rain}</strong>
    </div>
  </div>
{/if}

<style>
  .tooltip {
    position: absolute;
    pointer-events: none;
    background: rgba(10, 14, 22, 0.95);
    border: 1px solid var(--accent-blue, #388bfd);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 12px;
    font-family: var(--font-mono, monospace);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
    z-index: 2000;
    max-width: min(280px, 80vw);
    overflow-wrap: break-word;
  }

  .tooltip-title {
    font-weight: bold;
    margin-bottom: 4px;
    color: #58a6ff;
  }

  .tooltip-coords {
    color: var(--text-secondary, #8b949e);
    margin-bottom: 6px;
  }

  .tooltip-grid {
    display: grid;
    grid-template-columns: auto auto;
    gap: 4px 12px;
  }

  .val-tt {
    color: var(--accent-red, #f85149);
  }

  .val-td {
    color: #56d364;
  }

  .val-dtd {
    color: var(--accent-orange, #f0883e);
  }

  .val-p {
    color: #79c0ff;
  }
</style>
