<script>
  import { isWindRelated, isUpperAirStationLayer } from "../ui/layers/layerDefaults.js";
  import StationFilter from "./StationFilter.svelte";

  let {
    layer,
    expanded = false,
    onToggleExpanded = null,
    onToggleVisible = null,
    onRemove = null,
    onLayerAction = null,
  } = $props();

  function handleAction(action, payload = {}) {
    if (onLayerAction) {
      onLayerAction({ action, layer, ...payload });
    }
  }

  function handleConfigChange(field, val) {
    if (!layer.config) layer.config = {};
    layer.config[field] = val;
    handleAction("config", { field, value: val });
  }

  let isWind = $derived(isWindRelated(layer));
  let isUpperStation = $derived(isUpperAirStationLayer(layer));
</script>

<div class="layer-item" data-layer-id={layer.id}>
  <div
    class="layer-row"
    class:layer-hidden={!layer.visible}
    role="button"
    tabindex="0"
    onclick={(e) => {
      // If click target wasn't an action button, toggle expanded
      if (!e.target.closest("button") && !e.target.closest("input") && !e.target.closest("select")) {
        if (onToggleExpanded) onToggleExpanded();
      }
    }}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        if (!e.target.closest("button") && !e.target.closest("input") && !e.target.closest("select")) {
          if (onToggleExpanded) onToggleExpanded();
        }
      }
    }}
  >
    <button
      type="button"
      class="btn-vis"
      class:active={layer.visible}
      title={layer.visible ? "Hide Layer" : "Show Layer"}
      aria-label={layer.visible ? "Hide Layer" : "Show Layer"}
      onclick={(e) => {
        e.stopPropagation();
        if (onToggleVisible) onToggleVisible();
      }}
    >
      {layer.visible ? "👁" : "🚫"}
    </button>

    {#if layer.color}
      <span class="layer-color-dot" style:background-color={layer.color}></span>
    {/if}

    <span class="layer-name" title={layer.name}>{layer.name}</span>

    <button
      type="button"
      class="btn-config"
      class:open={expanded}
      title="Configure Layer"
      aria-label="Configure Layer"
      onclick={(e) => {
        e.stopPropagation();
        if (onToggleExpanded) onToggleExpanded();
      }}
    >
      ⚙
    </button>

    {#if layer.removable}
      <button
        type="button"
        class="btn-remove"
        title="Remove Layer"
        aria-label="Remove Layer"
        onclick={(e) => {
          e.stopPropagation();
          if (onRemove) onRemove();
        }}
      >
        ✕
      </button>
    {/if}
  </div>

  {#if expanded}
    <div class="layer-config" data-layer-id={layer.id}>
      {#if layer.type === "contour"}
        <div class="config-row">
          <label>
            <input
              type="checkbox"
              class="chk-show-line"
              checked={layer.config?.showLine !== false}
              onchange={(e) => handleConfigChange("showLine", e.target.checked)}
            />
            <span>Contour Lines</span>
          </label>
          <label>
            <input
              type="checkbox"
              class="chk-show-fill"
              checked={Boolean(layer.config?.showFill)}
              onchange={(e) => handleConfigChange("showFill", e.target.checked)}
            />
            <span>Color Fill</span>
          </label>
        </div>

        <div class="config-row">
          <label>
            <input
              type="checkbox"
              class="chk-show-raster"
              checked={Boolean(layer.config?.showRaster)}
              onchange={(e) => handleConfigChange("showRaster", e.target.checked)}
            />
            <span>Raster Shading</span>
          </label>
          <label>
            <input
              type="checkbox"
              class="chk-show-labels"
              checked={layer.config?.showLabels !== false}
              onchange={(e) => handleConfigChange("showLabels", e.target.checked)}
            />
            <span>Labels</span>
          </label>
        </div>

        <div class="config-row">
          <span>Opacity:</span>
          <input
            type="range"
            class="slider-fill-opacity"
            min="10"
            max="100"
            value={Math.round((layer.config?.opacity ?? 0.75) * 100)}
            oninput={(e) => handleConfigChange("opacity", parseInt(e.target.value, 10) / 100)}
          />
          <span class="opacity-label">{Math.round((layer.config?.opacity ?? 0.75) * 100)}%</span>
        </div>
      {:else if layer.type === "station"}
        <div class="config-row">
          <label>
            <input
              type="checkbox"
              class="chk-show-temp"
              checked={layer.config?.showTemp !== false}
              onchange={(e) => handleConfigChange("showTemp", e.target.checked)}
            />
            <span class="lbl-temp">Temperature</span>
          </label>
          <label>
            <input
              type="checkbox"
              class="chk-show-dewpoint"
              checked={layer.config?.showDewpoint !== false}
              onchange={(e) => handleConfigChange("showDewpoint", e.target.checked)}
            />
            <span class="lbl-dew">Dew Point</span>
          </label>
        </div>

        <div class="config-row">
          <label>
            <input
              type="checkbox"
              class="chk-show-wind"
              checked={layer.config?.showWind !== false}
              onchange={(e) => handleConfigChange("showWind", e.target.checked)}
            />
            <span>Wind Barbs</span>
          </label>
          <label>
            <input
              type="checkbox"
              class="chk-show-pressure"
              checked={layer.config?.showPressure !== false}
              onchange={(e) => handleConfigChange("showPressure", e.target.checked)}
            />
            <span class="lbl-press">{isUpperStation ? "Height" : "Pressure"}</span>
          </label>
        </div>

        <StationFilter
          {layer}
          onFilterChange={(filterData) => handleAction("stationFilter", filterData)}
        />
      {:else if layer.type === "wind"}
        <div class="config-row">
          <label>
            <input
              type="checkbox"
              class="chk-show-wind"
              checked={layer.config?.showWind !== false}
              onchange={(e) => handleConfigChange("showWind", e.target.checked)}
            />
            <span>Streamlines</span>
          </label>
          <label>
            <input
              type="checkbox"
              class="chk-show-barbs"
              checked={Boolean(layer.config?.showBarbs)}
              onchange={(e) => handleConfigChange("showBarbs", e.target.checked)}
            />
            <span>Wind Barbs</span>
          </label>
        </div>
      {:else if layer.type === "pmtiles"}
        <div class="config-row">
          <label>
            <input
              type="checkbox"
              class="chk-pmtiles-graticule"
              checked={layer.config?.showGraticule !== false}
              onchange={(e) => handleConfigChange("showGraticule", e.target.checked)}
            />
            <span>Graticule (经纬网)</span>
          </label>
          <label>
            <input
              type="checkbox"
              class="chk-pmtiles-provinces"
              checked={layer.config?.showProvinces !== false}
              onchange={(e) => handleConfigChange("showProvinces", e.target.checked)}
            />
            <span>Provinces (省界)</span>
          </label>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .layer-item {
    background: rgba(22, 27, 34, 0.85);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 6px;
    overflow: hidden;
    transition: border-color 0.15s ease;
    box-sizing: border-box;
  }

  .layer-item:hover {
    border-color: #58a6ff;
  }

  .layer-row {
    display: flex;
    align-items: center;
    padding: 8px 10px;
    gap: 8px;
    min-height: 38px;
    cursor: pointer;
    user-select: none;
    box-sizing: border-box;
  }

  .layer-row:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .btn-vis {
    background: transparent;
    border: none;
    color: #8b949e;
    cursor: pointer;
    font-size: 13px;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .btn-vis.active {
    color: #58a6ff;
  }

  .btn-vis:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .layer-color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .layer-name {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    line-height: 1.3;
    font-weight: 500;
    color: var(--text-primary, #e6edf3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
  }

  .layer-row.layer-hidden .layer-name {
    opacity: 0.55;
    text-decoration: line-through;
  }

  .btn-config {
    background: transparent;
    border: none;
    color: #8b949e;
    cursor: pointer;
    font-size: 13px;
    padding: 2px;
    border-radius: 4px;
    flex-shrink: 0;
    transition: color 0.15s ease;
  }

  .btn-config.open {
    color: #58a6ff;
  }

  .btn-remove {
    background: transparent;
    border: none;
    color: #8b949e;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 4px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .btn-remove:hover {
    color: #f85149;
    background: rgba(248, 81, 73, 0.15);
  }

  .layer-config {
    padding: 8px 10px 10px 10px;
    border-top: 1px solid rgba(48, 54, 61, 0.6);
    background: rgba(13, 17, 23, 0.6);
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .config-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
    row-gap: 6px;
  }

  .config-row label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    color: var(--text-primary, #e6edf3);
  }

  .slider-fill-opacity {
    width: 70px;
    accent-color: var(--accent-blue, #388bfd);
  }

  .opacity-label {
    font-size: 10px;
    font-family: var(--font-mono, monospace);
    color: var(--text-secondary, #8b949e);
  }

  .lbl-temp {
    color: var(--accent-red, #f85149);
  }

  .lbl-dew {
    color: var(--accent-green, #3fb950);
  }

  .lbl-press {
    color: var(--accent-blue, #58a6ff);
  }
</style>
