<script>
  import { fly } from "svelte/transition";
  import { ui } from "../lib/stores/ui.svelte.js";
  import { clickOutside } from "../actions/clickOutside.js";
  import { fetchTree } from "../api/catalogApi.js";
  import { DEFAULT_MOCK_OBS_FILES } from "../config/presets.js";
  import { filterObsFilesByStep } from "../lib/stores/timelineMath.js";
  import { formatObsTimestamp } from "../utils/formatters.js";

  let { onLoadProduct = null } = $props();

  let model = $state("ECMWF_HR");
  let element = $state("TMP");
  let level = $state("850");
  let period = $state("24");
  let obsTime = $state("20260827200000.000");
  let obsFiles = $state([
    "20260827200000.000",
    "20260827174000.000",
    "20260827170000.000",
    "20260827120000.000",
    "20260827080000.000",
  ]);
  let isFetchingObs = $state(false);

  let isObs = $derived(model === "SURFACE" || model === "UPPER_AIR");
  let isUpper = $derived(model === "UPPER_AIR");
  let hasLevel = $derived(!isObs || isUpper);

  function handleKeydown(e) {
    if (e.key === "Escape" && ui.catalogOpen) {
      ui.catalogOpen = false;
    }
  }

  async function loadObsFiles(targetModel) {
    const isUpperTarget = targetModel === "UPPER_AIR";
    const candidatePaths = isUpperTarget
      ? ["UPPER_AIR/PLOT/500", "UPPER_AIR/PLOT"]
      : ["SURFACE/PLOT_GLOBAL_3H", "SURFACE/PLOT_10MIN", "SURFACE/PLOT"];
    let files = null;
    for (const p of candidatePaths) {
      try {
        const res = await fetchTree(p, 100);
        const arr = Array.isArray(res) ? res : res?.files || res?.data || null;
        if (Array.isArray(arr) && arr.length) {
          files = arr;
          break;
        }
      } catch (_) {}
    }
    let toUse = [];
    if (files && files.length) {
      let filtered = files.filter((f) => typeof f === "string" && f.endsWith(".000")).sort().reverse();
      if (isUpperTarget) {
        filtered = filterObsFilesByStep(filtered, 12, true);
      }
      toUse = filtered.slice(0, 100);
    }
    if (!toUse.length) {
      let fallback = [...DEFAULT_MOCK_OBS_FILES].sort().reverse();
      if (isUpperTarget) {
        fallback = filterObsFilesByStep(fallback, 12, true);
      }
      toUse = fallback.slice(0, 100);
    }
    return toUse;
  }

  $effect(() => {
    if (isObs) {
      isFetchingObs = true;
      let active = true;
      loadObsFiles(model)
        .then((files) => {
          if (active && Array.isArray(files) && files.length > 0) {
            obsFiles = files;
            obsTime = files[0];
          }
        })
        .finally(() => {
          if (active) {
            isFetchingObs = false;
          }
        });
      return () => {
        active = false;
      };
    }
  });

  function handleSubmit() {
    ui.catalogOpen = false;
    if (onLoadProduct) {
      onLoadProduct({
        model,
        element,
        level: hasLevel && level ? parseInt(level, 10) : null,
        period: !isObs ? parseInt(period, 10) : 0,
        obsTime: isObs ? obsTime : null,
        isObservation: isObs,
      });
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if ui.catalogOpen}
  <aside
    id="catalog-drawer"
    class="drawer"
    transition:fly={{ x: -340, duration: 250 }}
    use:clickOutside={{ onOutside: () => (ui.catalogOpen = false), exclude: ["#btn-catalog-drawer"] }}
  >
    <div class="drawer-header">
      <span>Meteorological Products</span>
      <button
        id="btn-close-drawer"
        class="btn btn-close-drawer"
        onclick={() => (ui.catalogOpen = false)}
      >✕</button>
    </div>

    <div class="drawer-body">
      <div class="form-group">
        <label for="select-model">Product Category / Source</label>
        <select id="select-model" class="form-select" bind:value={model}>
          <optgroup label="Global NWP Forecast Models">
            <option value="ECMWF_HR">ECMWF High Resolution (ECMWF_HR)</option>
            <option value="GRAPES_GFS">CMA GRAPES Global (GRAPES_GFS)</option>
            <option value="NWFD_SCMOC">National Guidance (NWFD_SCMOC)</option>
          </optgroup>
          <optgroup label="Synoptic & Upper Air Observations">
            <option value="SURFACE">Surface Observations (SURFACE)</option>
            <option value="UPPER_AIR">Upper Air Observations (UPPER_AIR)</option>
          </optgroup>
        </select>
      </div>

      <div class="form-group" id="group-element">
        <label for="select-element">Variable / Product</label>
        <select id="select-element" class="form-select" bind:value={element}>
          <option value="TMP">TMP - Temperature (°C)</option>
          <option value="HGT">HGT - Geopotential Height (gpm)</option>
          <option value="RAIN">RAIN - Precipitation (mm)</option>
          <option value="WIND">WIND - Wind Vectors (m/s)</option>
          <option value="VOR">VOR - Relative Vorticity (10⁻⁵/s)</option>
          <option value="DIV">DIV - Divergence (10⁻⁵/s)</option>
        </select>
      </div>

      {#if hasLevel}
        <div class="form-group" id="group-level" data-visible="true">
          <label for="select-catalog-level">Isobaric Level (hPa)</label>
          <select id="select-catalog-level" class="form-select" bind:value={level}>
            <option value="1000">1000 hPa</option>
            <option value="925">925 hPa</option>
            <option value="850">850 hPa</option>
            <option value="700">700 hPa</option>
            <option value="500">500 hPa</option>
            <option value="200">200 hPa</option>
          </select>
        </div>
      {/if}

      {#if !isObs}
        <div class="form-group" id="group-period" data-visible="true">
          <label for="select-period">Forecast Lead Offset (Discrete Hours)</label>
          <select id="select-period" class="form-select" bind:value={period}>
            <option value="0">000h (Analysis)</option>
            <option value="12">+012h</option>
            <option value="24">+024h</option>
            <option value="36">+036h</option>
            <option value="48">+048h</option>
            <option value="72">+072h</option>
            <option value="96">+096h</option>
            <option value="120">+120h</option>
          </select>
        </div>
      {:else}
        <div class="form-group" id="group-obs-time" data-visible="true">
          <label for="select-obs-time">
            Observation Time (UTC)
            <span id="catalog-obs-status" class="catalog-obs-status">
              {isFetchingObs ? "(fetching...)" : ""}
            </span>
          </label>
          <select id="select-obs-time" class="form-select" bind:value={obsTime}>
            {#each obsFiles as f}
              <option value={f}>{formatObsTimestamp(f)}</option>
            {/each}
          </select>
        </div>
      {/if}

      <button
        id="btn-load-product"
        class="btn btn-primary btn-load-product"
        onclick={handleSubmit}
      >
        Load Meteorological Data
      </button>
    </div>
  </aside>
{:else}
  <aside id="catalog-drawer" class="drawer hidden"></aside>
{/if}

<style>
  .drawer {
    position: absolute;
    top: 12px;
    left: 12px;
    width: 320px;
    max-width: calc(100vw - 24px);
    max-height: calc(100% - 24px);
    background: var(--bg-panel, rgba(18, 24, 36, 0.88));
    backdrop-filter: blur(12px);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    z-index: 600;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .drawer.hidden {
    display: none !important;
  }

  .drawer-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    font-size: 14px;
    flex-shrink: 0;
  }

  .drawer-body {
    padding: 12px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-group label {
    font-size: 12px;
    color: var(--text-secondary, #8b949e);
    font-weight: 500;
  }

  .form-select {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    color: var(--text-primary, #e6edf3);
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 13px;
    outline: none;
  }

  .form-select:focus {
    border-color: var(--accent-blue, #388bfd);
  }

  .btn-close-drawer {
    padding: 2px 8px;
  }

  .catalog-obs-status {
    font-size: 10px;
    color: #8b949e;
    margin-left: 6px;
  }

  .btn-load-product {
    margin-top: 8px;
    justify-content: center;
  }
</style>
