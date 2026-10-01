<script>
  import { isWindRelated, isUpperAirStationLayer } from "../ui/layers/layerDefaults.js";
  import { buildLevelsFromInterval } from "../layers/contour/contourLevels.js";
  import { getPaletteCategory, listPaletteFiles } from "../utils/paletteLoader.js";
  import { parseOffset, formatOffset, resolveLayerTime } from "../utils/timeResolver.js";
  import StationFilter from "./StationFilter.svelte";

  let {
    layer,
    expanded = false,
    cursorTime = null,
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

  function handleConfigPatch(patch) {
    if (!layer.config) layer.config = {};
    layer.config = { ...layer.config, ...patch };
    handleAction("config", { value: patch });
  }

  function handleConfigChange(field, val) {
    handleConfigPatch({ [field]: val });
  }

  function handleNumberChange(field, event) {
    const value = Number(event.target.value);
    if (Number.isFinite(value)) handleConfigChange(field, value);
  }

  function handleIntervalChange(event) {
    const row = event.currentTarget.closest(".interval-editor");
    if (!row) return;
    const start = row.querySelector(".input-interval-start")?.value;
    const step = row.querySelector(".input-interval-step")?.value;
    const end = row.querySelector(".input-interval-end")?.value;
    if (start === "" || step === "" || end === "") {
      handleConfigPatch({ interval: null, levels: null });
      return;
    }
    const result = buildLevelsFromInterval(start, step, end);
    if (result.levels) {
      handleConfigPatch({ interval: { start: Number(start), step: Number(step), end: Number(end) }, levels: result.levels });
    }
  }

  function clearIntervalConfig(event) {
    const row = event.currentTarget.closest(".interval-editor");
    row?.querySelectorAll("input").forEach((input) => { input.value = ""; });
    handleConfigPatch({ interval: null, levels: null });
  }

  let isWind = $derived(isWindRelated(layer));
  let isUpperStation = $derived(isUpperAirStationLayer(layer));
  let isContour = $derived(layer.type === "contour");
  let paletteOptions = $state([]);
  let currentPaletteValue = $derived(
    layer.config?.palettePath
      ? (layer.config.palettePath.startsWith("/") ? layer.config.palettePath : `/${layer.config.palettePath}`)
      : ""
  );

  let resolvedStatus = $derived.by(() => {
    const cursor = cursorTime ||
      (layer.forecastCycle ? parseTimestamp({ cycle: layer.forecastCycle, period: layer.period ?? 0 }) : null) ||
      (layer.cycle ? parseTimestamp({ cycle: layer.cycle, period: layer.period ?? 0 }) : null) ||
      (typeof window !== "undefined" && window.__MICAPS_CURSOR__) ||
      Date.now();
    return resolveLayerTime(layer, cursor);
  });

  $effect(() => {
    if (!expanded || (!isContour && layer.type !== "wind")) return;
    const rawElem = layer.element || (isWind || layer.type === "wind" ? "WIND" : "");
    const elem = (rawElem || "").toUpperCase();
    const category = getPaletteCategory(elem);
    if (!category) {
      paletteOptions = [];
      return;
    }
    let active = true;
    listPaletteFiles(category, elem)
      .then((files) => {
        if (active) paletteOptions = Array.isArray(files) ? files.filter((file) => file.name?.endsWith(".xml")) : [];
      })
      .catch(() => {
        if (active) paletteOptions = [];
      });
    return () => { active = false; };
  });

  let activeSubtab = $state("");

  let subtabs = $derived.by(() => {
    switch (layer.type) {
      case "contour":
        return [
          { id: "style", label: "Style", icon: "🎨" },
          { id: "interval", label: "Interval", icon: "📊" },
          { id: "time", label: "Time", icon: "⏱" },
        ];
      case "station":
        return [
          { id: "elements", label: "Elements", icon: "📋" },
          { id: "filter", label: "Filter", icon: "🔍" },
          { id: "time", label: "Time", icon: "⏱" },
        ];
      case "wind":
        return [
          { id: "display", label: "Display", icon: "💨" },
          { id: "palette", label: "Palette", icon: "🎨" },
          { id: "time", label: "Time", icon: "⏱" },
        ];
      case "tlogp":
        return [
          { id: "station", label: "Station", icon: "📍" },
          { id: "curves", label: "Curves", icon: "📈" },
          { id: "time", label: "Time", icon: "⏱" },
        ];
      case "timeheight":
        return [
          { id: "point", label: "Point & Time", icon: "📍" },
          { id: "fields", label: "Fields", icon: "📊" },
          { id: "time", label: "Time", icon: "⏱" },
        ];
      case "lineheight":
        return [
          { id: "transect", label: "Transect", icon: "📏" },
          { id: "fields", label: "Fields", icon: "📊" },
          { id: "time", label: "Time", icon: "⏱" },
        ];
      case "hovmoller":
        return [
          { id: "transect", label: "Transect", icon: "📏" },
          { id: "fields", label: "Fields", icon: "📊" },
          { id: "time", label: "Time", icon: "⏱" },
        ];
      case "pmtiles":
        return [
          { id: "features", label: "Features", icon: "🗺️" },
          { id: "basemap", label: "Style & Proj", icon: "🌐" },
        ];
      default:
        return [
          { id: "general", label: "General", icon: "⚙" },
          { id: "time", label: "Time", icon: "⏱" },
        ];
    }
  });

  let currentSubtab = $derived(
    subtabs.some((t) => t.id === activeSubtab) ? activeSubtab : (subtabs[0]?.id || "style")
  );

  $effect(() => {
    if (activeSubtab && !subtabs.some((t) => t.id === activeSubtab)) {
      activeSubtab = "";
    }
  });
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

    {#if resolvedStatus && resolvedStatus.actualTimeZ && resolvedStatus.actualTimeZ !== "--:--Z"}
      <span
        class="layer-row-time-chip"
        class:status-desync={resolvedStatus.isDesync}
        class:status-soft-stale={resolvedStatus.status === "soft-stale"}
        class:status-hard-stale={resolvedStatus.isHardStale}
        title="{resolvedStatus.statusText}: {resolvedStatus.actualTimeZ} ({resolvedStatus.ageStr})"
      >
        <span class="chip-status-dot" style:color={resolvedStatus.status === "desync" ? "#58a6ff" : (resolvedStatus.status === "soft-stale" ? "#d29922" : (resolvedStatus.isHardStale ? "#f85149" : "#3fb950"))}>
          {resolvedStatus.statusIcon}
        </span>
        <span class="chip-time">{resolvedStatus.actualTimeZ}</span>
        <span class="chip-age">{resolvedStatus.ageStr}</span>
      </span>
    {/if}

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
      <div class="config-subtabs-nav" role="tablist">
        {#each subtabs as tab}
          <button
            type="button"
            role="tab"
            class="config-subtab-btn"
            class:active={currentSubtab === tab.id}
            aria-selected={currentSubtab === tab.id}
            onclick={() => (activeSubtab = tab.id)}
          >
            {#if tab.icon}<span class="subtab-icon">{tab.icon}</span>{/if}
            <span class="subtab-title">{tab.label}</span>
            {#if tab.id === "time" && resolvedStatus?.isDesync}
              <span class="subtab-dot dot-blue" title="Desynced">●</span>
            {:else if tab.id === "time" && resolvedStatus?.isHardStale}
              <span class="subtab-dot dot-red" title="Stale">●</span>
            {:else if tab.id === "time" && resolvedStatus?.status === "soft-stale"}
              <span class="subtab-dot dot-amber" title="Soft-stale">●</span>
            {/if}
          </button>
        {/each}
      </div>

      {#if layer.type === "contour"}
        <div class="config-subtab-pane" class:active={currentSubtab === "style"} role="tabpanel">
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

          <div class="config-row config-row-wrap">
            <label class="inline-control">
              <span>Line color</span>
              <input
                type="color"
                class="color-picker-line"
                value={layer.config?.lineColor || layer.color || "#58a6ff"}
                onchange={(e) => handleConfigChange("lineColor", e.target.value)}
              />
            </label>
            <label class="inline-control">
              <span>Width</span>
              <input type="number" min="0.5" max="10" step="0.5" value={layer.config?.lineWidth ?? 2} onchange={(e) => handleNumberChange("lineWidth", e)} />
            </label>
            <label class="inline-control">
              <span>Label</span>
              <input type="number" min="9" max="24" step="1" value={layer.config?.labelSize ?? 13} onchange={(e) => handleNumberChange("labelSize", e)} />
            </label>
          </div>

          <div class="config-row config-row-wrap">
            <label class="inline-control wide-control">
              <span>Bold values</span>
              <input
                type="text"
                value={(layer.config?.boldValues || []).join(", ")}
                placeholder="e.g. 5880, 1010"
                onchange={(e) => handleConfigChange("boldValues", e.target.value.split(",").map((value) => Number(value.trim())).filter(Number.isFinite))}
              />
            </label>
            <label class="inline-control">
              <span>Bold px</span>
              <input type="number" min="1" max="12" step="0.5" value={layer.config?.boldLineWidth ?? 4} onchange={(e) => handleNumberChange("boldLineWidth", e)} />
            </label>
          </div>

          <div class="config-row">
            <label>
              <input type="checkbox" checked={layer.config?.smooth !== false} onchange={(e) => handleConfigChange("smooth", e.target.checked)} />
              <span>Smooth Contour Lines</span>
            </label>
          </div>

          {#if isWind}
            <div class="config-row">
              <label><input type="checkbox" checked={layer.config?.showWind !== false} onchange={(e) => handleConfigChange("showWind", e.target.checked)} /> Wind Streamlines</label>
              <label><input type="checkbox" checked={Boolean(layer.config?.showBarbs)} onchange={(e) => handleConfigChange("showBarbs", e.target.checked)} /> Wind Barbs</label>
            </div>
          {/if}
        </div>

        <div class="config-subtab-pane" class:active={currentSubtab === "interval"} role="tabpanel">
          <div class="config-row config-row-wrap interval-editor">
            <span>Interval</span>
            <input class="input-interval-start" type="number" step="any" placeholder="Start" value={layer.config?.interval?.start ?? ""} onchange={handleIntervalChange} />
            <input class="input-interval-step" type="number" step="any" placeholder="Step" value={layer.config?.interval?.step ?? ""} onchange={handleIntervalChange} />
            <input class="input-interval-end" type="number" step="any" placeholder="End" value={layer.config?.interval?.end ?? ""} onchange={handleIntervalChange} />
            <button type="button" class="btn-inline" onclick={clearIntervalConfig}>Auto</button>
          </div>

          <div class="config-row palette-row">
            <label for="sel-palette-{layer.id}">🎨 Palette</label>
            <select id="sel-palette-{layer.id}" class="sel-palette" value={currentPaletteValue} onchange={(e) => handleConfigChange("palettePath", e.target.value || null)}>
              <option value="">Built-in default</option>
              {#each paletteOptions as palette}
                <option value={palette.path}>{palette.name.replace(/\.xml$/i, "")}</option>
              {/each}
            </select>
          </div>
        </div>
      {:else if layer.type === "station"}
        <div class="config-subtab-pane" class:active={currentSubtab === "elements"} role="tabpanel">
          <div class="config-row">
            <label for="chk-show-temp-{layer.id}">
              <input
                type="checkbox"
                id="chk-show-temp-{layer.id}"
                class="chk-show-temp"
                class:lbl-temp={true}
                checked={layer.config?.showTemp !== false}
                onchange={(e) => handleConfigChange("showTemp", e.target.checked)}
              />
              <span class="lbl-temp">Temperature</span>
            </label>
            <label for="chk-show-dewpoint-{layer.id}">
              <input
                type="checkbox"
                id="chk-show-dewpoint-{layer.id}"
                class="chk-show-dewpoint"
                class:lbl-dew={true}
                checked={layer.config?.showDewpoint !== false}
                onchange={(e) => handleConfigChange("showDewpoint", e.target.checked)}
              />
              <span class="lbl-dew">Dew Point</span>
            </label>
          </div>

          <div class="config-row">
            <label for="chk-show-wind-{layer.id}">
              <input
                type="checkbox"
                id="chk-show-wind-{layer.id}"
                class="chk-show-wind"
                class:lbl-wind={true}
                checked={layer.config?.showWind !== false}
                onchange={(e) => handleConfigChange("showWind", e.target.checked)}
              />
              <span class="lbl-wind">Wind Barbs</span>
            </label>
            <label for="chk-show-pressure-{layer.id}">
              <input
                type="checkbox"
                id="chk-show-pressure-{layer.id}"
                class="chk-show-pressure"
                class:lbl-press={true}
                checked={isUpperStation ? layer.config?.showPressure !== false : Boolean(layer.config?.showPressure)}
                onchange={(e) => handleConfigChange("showPressure", e.target.checked)}
              />
              <span class="lbl-press">{isUpperStation ? "Height" : "Pressure"}</span>
            </label>
          </div>

          <div class="config-row config-row-wrap">
            <label for="chk-show-dtd-{layer.id}"><input type="checkbox" id="chk-show-dtd-{layer.id}" class="chk-show-dtd" class:lbl-dtd={true} checked={Boolean(layer.config?.showDTD)} onchange={(e) => handleConfigChange("showDTD", e.target.checked)} /> <span class="lbl-dtd">T−Td</span></label>
            {#if !isUpperStation}
              <label for="chk-show-cloud-{layer.id}"><input type="checkbox" id="chk-show-cloud-{layer.id}" class="chk-show-cloud" class:lbl-cloud={true} checked={Boolean(layer.config?.showCloud)} onchange={(e) => handleConfigChange("showCloud", e.target.checked)} /> <span class="lbl-cloud">Cloud</span></label>
              <label for="chk-show-weather-{layer.id}"><input type="checkbox" id="chk-show-weather-{layer.id}" class="chk-show-weather" class:lbl-weather={true} checked={Boolean(layer.config?.showWeather)} onchange={(e) => handleConfigChange("showWeather", e.target.checked)} /> <span class="lbl-weather">Weather</span></label>
              <label for="chk-show-vis-{layer.id}"><input type="checkbox" id="chk-show-vis-{layer.id}" class="chk-show-vis" class:lbl-vis={true} checked={Boolean(layer.config?.showVisibility)} onchange={(e) => handleConfigChange("showVisibility", e.target.checked)} /> <span class="lbl-vis">Visibility</span></label>
              <label for="chk-show-rain6-{layer.id}"><input type="checkbox" id="chk-show-rain6-{layer.id}" class="chk-show-rain6" class:lbl-rain6={true} checked={Boolean(layer.config?.showRain6)} onchange={(e) => handleConfigChange("showRain6", e.target.checked)} /> <span class="lbl-rain6">Rain 6h</span></label>
            {/if}
            <label for="chk-show-streamlines-{layer.id}"><input type="checkbox" id="chk-show-streamlines-{layer.id}" class="chk-show-streamlines" class:lbl-streamlines={true} checked={Boolean(layer.config?.showStreamlines)} onchange={(e) => handleConfigChange("showStreamlines", e.target.checked)} /> <span>Streamlines</span></label>
          </div>

          {#if layer.element !== "TLOGP" && !(layer.path && layer.path.includes("TLOGP")) && !(layer.id && layer.id.includes("tlogp"))}
            <div class="config-row wind-contour-row">
              <label for="sel-station-contour-{layer.id}">Add Contour Layer</label>
              <select id="sel-station-contour-{layer.id}" class="sel-contour-element" bind:value={layer._contourElement}>
                {#if isUpperStation}
                  <option value="HGT">Geopotential Height (HGT)</option>
                  <option value="TMP">Temperature (TMP)</option>
                  <option value="TD">Dew Point (TD)</option>
                  <option value="DTD">Dew-Pt Depression (DTD)</option>
                  <option value="WIND">Wind Speed (WIND)</option>
                  <option value="VOR">Relative Vorticity (VOR)</option>
                  <option value="DIV">Divergence (DIV)</option>
                {:else}
                  <option value="SLP">Sea Level Pressure (SLP)</option>
                  <option value="TMP">Temperature (TMP)</option>
                  <option value="TD">Dew Point (TD)</option>
                  <option value="DTD">Dew-Pt Depression (DTD)</option>
                  <option value="VIS">Visibility (VIS)</option>
                  <option value="RAIN6">6h Precipitation (RAIN6)</option>
                  <option value="WIND">Wind Speed (WIND)</option>
                  <option value="VOR">Relative Vorticity (VOR)</option>
                  <option value="DIV">Divergence (DIV)</option>
                {/if}
              </select>
              <button type="button" class="btn-inline" onclick={() => handleAction("addContour", { value: layer._contourElement || (isUpperStation ? "HGT" : "SLP") })}>＋ Add</button>
            </div>
          {/if}
        </div>

        <div class="config-subtab-pane" class:active={currentSubtab === "filter"} role="tabpanel">
          <StationFilter
            {layer}
            onFilterChange={(filterData) => handleConfigPatch(filterData)}
          />
        </div>
      {:else if layer.type === "wind"}
        <div class="config-subtab-pane" class:active={currentSubtab === "display"} role="tabpanel">
          <div class="config-row">
            <label>
              <input
                type="checkbox"
                class="chk-show-wind"
                checked={layer.config?.showWind !== false}
                onchange={(e) => handleConfigChange("showWind", e.target.checked)}
              />
              <span>Wind Streamlines</span>
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
          <div class="config-row">
            <label>
              <input type="checkbox" class="chk-show-raster" checked={Boolean(layer.config?.showRaster)} onchange={(e) => handleConfigChange("showRaster", e.target.checked)} />
              <span>Wind Magnitude Raster</span>
            </label>
          </div>
          <div class="config-row wind-contour-row">
            <label for="sel-wind-contour-{layer.id}">Add Contour Layer</label>
            <select id="sel-wind-contour-{layer.id}" class="sel-contour-element" bind:value={layer._contourElement}>
              <option value="VOR">Relative Vorticity (VOR)</option>
              <option value="DIV">Divergence (DIV)</option>
            </select>
            <button type="button" class="btn-inline" onclick={() => handleAction("addContour", { value: layer._contourElement || "VOR" })}>＋ Add</button>
          </div>
        </div>

        <div class="config-subtab-pane" class:active={currentSubtab === "palette"} role="tabpanel">
          <div class="config-row palette-row">
            <label for="sel-wind-palette-{layer.id}">🎨 Palette</label>
            <select id="sel-wind-palette-{layer.id}" class="sel-palette" value={currentPaletteValue} onchange={(e) => handleConfigChange("palettePath", e.target.value || null)}>
              <option value="">Built-in default</option>
              {#each paletteOptions as palette}
                <option value={palette.path}>{palette.name.replace(/\.xml$/i, "")}</option>
              {/each}
            </select>
          </div>
        </div>
      {:else if layer.type === "tlogp"}
        <div class="config-subtab-pane" class:active={currentSubtab === "station"} role="tabpanel">
          <div class="profile-section">
            <strong>📍 Station Selection</strong>
            <div class="profile-controls">
              <input class="input-tlogp-station" value={layer.config?.stationId || layer.stationId || "58362"} placeholder="5-digit station" onchange={(e) => handleConfigChange("stationId", e.target.value)} />
              <select class="sel-tlogp-quick-station" value={layer.config?.stationId || "58362"} onchange={(e) => handleConfigChange("stationId", e.target.value)}>
                <option value="58362">58362 Shanghai</option>
                <option value="54511">54511 Beijing</option>
                <option value="59287">59287 Guangzhou</option>
                <option value="57516">57516 Chongqing</option>
                <option value="57494">57494 Wuhan</option>
              </select>
            </div>
          </div>
          <div class="profile-controls">
            <span>Parcel origin</span>
            <select class="sel-tlogp-parcel-level" value={layer.config?.parcelLevel || "surface"} onchange={(e) => handleConfigChange("parcelLevel", e.target.value)}>
              <option value="surface">Surface</option>
              <option value="925">925 hPa</option>
              <option value="850">850 hPa</option>
              <option value="700">700 hPa</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>

        <div class="config-subtab-pane" class:active={currentSubtab === "curves"} role="tabpanel">
          <div class="config-grid-2col">
            {#each [["showTemp", "Temperature"], ["showDewpoint", "Dew Point"], ["showWind", "Wind Barbs"], ["showParcel", "Parcel"], ["showDryAdiabats", "Dry Adiabats"], ["showMoistAdiabats", "Moist Adiabats"], ["showMixingRatio", "Mixing Ratio"], ["showIndices", "Indices"]] as [field, label]}
              <label><input type="checkbox" checked={layer.config?.[field] !== false} onchange={(e) => handleConfigChange(field, e.target.checked)} /> {label}</label>
            {/each}
          </div>
        </div>
      {:else if layer.type === "timeheight"}
        <div class="config-subtab-pane" class:active={currentSubtab === "point"} role="tabpanel">
          <div class="profile-section"><strong>📍 Cross-section Point</strong></div>
          <div class="profile-controls">
            <label>Lon <input type="number" step="0.25" value={layer.config?.lon ?? 121.5} onchange={(e) => handleNumberChange("lon", e)} /></label>
            <label>Lat <input type="number" step="0.25" value={layer.config?.lat ?? 31.4} onchange={(e) => handleNumberChange("lat", e)} /></label>
          </div>
          <div class="profile-controls">
            <label>Start <input type="number" min="0" max="240" step="1" value={layer.config?.startHour ?? 0} onchange={(e) => handleNumberChange("startHour", e)} /></label>
            <label>End <input type="number" min="1" max="240" step="1" value={layer.config?.endHour ?? 144} onchange={(e) => handleNumberChange("endHour", e)} /></label>
            <label>Step <input type="number" min="1" max="24" step="1" value={layer.config?.stepHours ?? 12} onchange={(e) => handleNumberChange("stepHours", e)} /></label>
            <select value={layer.config?.timeDirection || "ltr"} onchange={(e) => handleConfigChange("timeDirection", e.target.value)}>
              <option value="ltr">{layer.config?.startHour ?? 0} → {layer.config?.endHour ?? 144}h</option>
              <option value="rtl">{layer.config?.endHour ?? 144} → {layer.config?.startHour ?? 0}h</option>
            </select>
          </div>
        </div>

        <div class="config-subtab-pane" class:active={currentSubtab === "fields"} role="tabpanel">
          <div class="config-grid-2col">
            {#each [["showRH", "RH Fill"], ["showTemp", "Temperature"], ["showVVel", "VVEL"], ["showWind", "Wind Barbs"], ["showGridPointMarker", "Map Marker"]] as [field, label]}
              <label><input type="checkbox" checked={layer.config?.[field] !== false} onchange={(e) => handleConfigChange(field, e.target.checked)} /> {label}</label>
            {/each}
          </div>
        </div>
      {:else if layer.type === "lineheight"}
        <div class="config-subtab-pane" class:active={currentSubtab === "transect"} role="tabpanel">
          <div class="profile-section"><strong>📏 Transect A → B</strong></div>
          <div class="profile-controls profile-coordinates">
            <label>A Lon <input type="number" step="0.25" value={layer.config?.lon0 ?? 115} onchange={(e) => handleNumberChange("lon0", e)} /></label>
            <label>A Lat <input type="number" step="0.25" value={layer.config?.lat0 ?? 28} onchange={(e) => handleNumberChange("lat0", e)} /></label>
            <label>B Lon <input type="number" step="0.25" value={layer.config?.lon1 ?? 125} onchange={(e) => handleNumberChange("lon1", e)} /></label>
            <label>B Lat <input type="number" step="0.25" value={layer.config?.lat1 ?? 38} onchange={(e) => handleNumberChange("lat1", e)} /></label>
          </div>
          <div class="profile-controls">
            <label>N <select value={layer.config?.npoints ?? 41} onchange={(e) => handleConfigChange("npoints", parseInt(e.target.value, 10))}>{#each [11, 21, 41, 61, 81] as n}<option value={n}>{n}</option>{/each}</select></label>
            <button type="button" class="btn-inline" onclick={() => handleAction("config", { value: { lon0: layer.config?.lon0 ?? 115, lat0: layer.config?.lat0 ?? 28, lon1: layer.config?.lon1 ?? 125, lat1: layer.config?.lat1 ?? 38, npoints: layer.config?.npoints ?? 41 } })}>Apply</button>
            <button type="button" class="btn-inline" onclick={() => handleAction("aux", { value: "drawLine" })}>✏ Draw</button>
            <button type="button" class="btn-inline" onclick={() => handleAction("aux", { value: "setA" })}>Set A</button>
            <button type="button" class="btn-inline" onclick={() => handleAction("aux", { value: "setB" })}>Set B</button>
            <button type="button" class="btn-inline" onclick={() => handleConfigChange("flipDirection", !layer.config?.flipDirection)}>⇄ Flip</button>
          </div>
        </div>

        <div class="config-subtab-pane" class:active={currentSubtab === "fields"} role="tabpanel">
          <div class="config-grid-2col">
            {#each [["showRH", "RH Fill"], ["showTemp", "Temperature"], ["showVVel", "VVEL"], ["showWind", "Wind Barbs"]] as [field, label]}
              <label><input type="checkbox" checked={layer.config?.[field] !== false} onchange={(e) => handleConfigChange(field, e.target.checked)} /> {label}</label>
            {/each}
          </div>
        </div>
      {:else if layer.type === "hovmoller"}
        <div class="config-subtab-pane" class:active={currentSubtab === "transect"} role="tabpanel">
          <div class="profile-section"><strong>📏 Hovmöller Transect A → B</strong></div>
          <div class="profile-controls profile-coordinates">
            <label>A Lon <input type="number" step="0.25" value={layer.config?.lon0 ?? 115} onchange={(e) => handleNumberChange("lon0", e)} /></label>
            <label>A Lat <input type="number" step="0.25" value={layer.config?.lat0 ?? 28} onchange={(e) => handleNumberChange("lat0", e)} /></label>
            <label>B Lon <input type="number" step="0.25" value={layer.config?.lon1 ?? 125} onchange={(e) => handleNumberChange("lon1", e)} /></label>
            <label>B Lat <input type="number" step="0.25" value={layer.config?.lat1 ?? 38} onchange={(e) => handleNumberChange("lat1", e)} /></label>
          </div>
          <div class="profile-controls">
            <label>Level <select value={layer.config?.level ?? 850} onchange={(e) => handleConfigChange("level", parseInt(e.target.value, 10))}>{#each [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200] as level}<option value={level}>{level} hPa</option>{/each}</select></label>
            <label>N <select value={layer.config?.npoints ?? 41} onchange={(e) => handleConfigChange("npoints", parseInt(e.target.value, 10))}>{#each [11, 21, 41, 61, 81] as n}<option value={n}>{n}</option>{/each}</select></label>
            <label>Start <input type="number" value={layer.config?.startHour ?? 0} onchange={(e) => handleNumberChange("startHour", e)} /></label>
            <label>End <input type="number" value={layer.config?.endHour ?? 144} onchange={(e) => handleNumberChange("endHour", e)} /></label>
            <label>Step <input type="number" value={layer.config?.stepHours ?? 12} onchange={(e) => handleNumberChange("stepHours", e)} /></label>
          </div>
          <div class="profile-controls">
            <button type="button" class="btn-inline" onclick={() => handleConfigChange("axisSwap", layer.config?.axisSwap === "time-x" ? "dist-x" : "time-x")}>⇄ Swap axes</button>
            <button type="button" class="btn-inline" onclick={() => handleConfigChange("timeDir", layer.config?.timeDir === "rev" ? "fwd" : "rev")}>⇄ Reverse time</button>
            <button type="button" class="btn-inline" onclick={() => handleAction("aux", { value: "drawLine" })}>✏ Draw</button>
            <button type="button" class="btn-inline" onclick={() => handleAction("aux", { value: "setA" })}>Set A</button>
            <button type="button" class="btn-inline" onclick={() => handleAction("aux", { value: "setB" })}>Set B</button>
          </div>
        </div>

        <div class="config-subtab-pane" class:active={currentSubtab === "fields"} role="tabpanel">
          <div class="config-grid-2col">
            {#each [["showRH", "RH Fill"], ["showTemp", "Temperature"], ["showVVel", "VVEL"], ["showWind", "Wind Barbs"]] as [field, label]}
              <label><input type="checkbox" checked={layer.config?.[field] !== false} onchange={(e) => handleConfigChange(field, e.target.checked)} /> {label}</label>
            {/each}
          </div>
        </div>
      {:else if layer.type === "pmtiles"}
        <div class="config-subtab-pane" class:active={currentSubtab === "features"} role="tabpanel">
          <div class="config-row" style="flex-wrap: wrap;">
            <label>
              <input
                type="checkbox"
                class="chk-pmtiles-graticule"
                checked={layer.config?.showGraticule !== false}
                onchange={(e) => handleConfigChange("showGraticule", e.target.checked)}
              />
              <span>经纬网 (Graticule)</span>
            </label>
            <label>
              <input
                type="checkbox"
                class="chk-pmtiles-world"
                checked={layer.config?.showWorld !== false}
                onchange={(e) => handleConfigChange("showWorld", e.target.checked)}
              />
              <span>国界 (World)</span>
            </label>
            <label>
              <input
                type="checkbox"
                class="chk-pmtiles-provinces"
                checked={layer.config?.showProvinces !== false}
                onchange={(e) => handleConfigChange("showProvinces", e.target.checked)}
              />
              <span>省界 (Provinces)</span>
            </label>
            <label>
              <input
                type="checkbox"
                class="chk-pmtiles-cities"
                checked={Boolean(layer.config?.showCities)}
                onchange={(e) => handleConfigChange("showCities", e.target.checked)}
              />
              <span>城市 (Cities)</span>
            </label>
          </div>
        </div>

        <div class="config-subtab-pane" class:active={currentSubtab === "basemap"} role="tabpanel">
          <div class="config-row" style="margin-top: 4px;">
            <label for="sel-basemap-scheme-{layer.id}" class="select-label">🎨 Scheme:</label>
            <select
              id="sel-basemap-scheme-{layer.id}"
              class="sel-basemap-scheme"
              value={layer.config?.scheme || "dark"}
              onchange={(e) => handleConfigChange("scheme", e.target.value)}
            >
              <option value="dark">🌙 Ink (Dark)</option>
              <option value="light">☀️ Paper (Light)</option>
              <option value="micaps">🌐 Slate Blue (Navy)</option>
            </select>
          </div>

          <div class="config-row" style="margin-top: 4px;">
            <label for="sel-basemap-proj-{layer.id}" class="select-label">🌐 Projection:</label>
            <select
              id="sel-basemap-proj-{layer.id}"
              class="sel-basemap-projection"
              value={layer.config?.projection || "mercator"}
              onchange={(e) => handleConfigChange("projection", e.target.value)}
            >
              <option value="mercator">🗺️ Mercator (2D)</option>
              <option value="globe">🌍 Globe (3D)</option>
              <option value="vertical-perspective">🪐 Perspective (3D)</option>
            </select>
          </div>
        </div>
      {:else}
        <div class="config-subtab-pane" class:active={currentSubtab === "general"} role="tabpanel">
          <div class="config-row">
            <span>Type: {layer.type || "generic"}</span>
            {#if layer.name}<span>({layer.name})</span>{/if}
          </div>
          {#if layer.config?.opacity !== undefined}
            <div class="config-row">
              <span>Opacity:</span>
              <input
                type="range"
                class="slider-fill-opacity"
                min="10"
                max="100"
                value={Math.round((layer.config?.opacity ?? 1) * 100)}
                oninput={(e) => handleConfigChange("opacity", parseInt(e.target.value, 10) / 100)}
              />
              <span class="opacity-label">{Math.round((layer.config?.opacity ?? 1) * 100)}%</span>
            </div>
          {/if}
        </div>
      {/if}

      {#if layer.type !== "pmtiles"}
        <div class="config-subtab-pane" class:active={currentSubtab === "time"} role="tabpanel">
          <div class="config-time-section">
            <div class="time-section-header">
              <span class="section-title">⏱ Observation Time & Matching</span>
              {#if resolvedStatus && resolvedStatus.actualTimeZ && resolvedStatus.actualTimeZ !== "--:--Z"}
                <span
                  class="resolved-pill"
                  class:pill-desync={resolvedStatus.isDesync}
                  class:pill-soft-stale={resolvedStatus.status === "soft-stale"}
                  class:pill-hard-stale={resolvedStatus.isHardStale}
                  title={resolvedStatus.statusText}
                >
                  <span class="status-indicator">{resolvedStatus.statusIcon}</span>
                  {resolvedStatus.actualTimeZ} ({resolvedStatus.ageStr})
                </span>
              {/if}
            </div>

            <div class="config-row config-row-wrap">
              <label class="inline-control">
                <span>Policy</span>
                <select
                  class="sel-time-policy"
                  value={layer.policy || layer.config?.policy || "nearest"}
                  onchange={(e) => {
                    handleConfigChange("policy", e.target.value);
                    layer.policy = e.target.value;
                  }}
                  title="Time matching policy per §2.2"
                >
                  <option value="nearest">Nearest (closest sample either side)</option>
                  <option value="latest-at">Latest-at (causal: sample ≤ T)</option>
                  <option value="hold">Hold (keep showing until superseded)</option>
                  <option value="interpolate">Interpolate (smooth fields)</option>
                </select>
              </label>

              <label class="inline-control">
                <span>Tolerance</span>
                <select
                  class="sel-time-tolerance"
                  value={String(layer.tolerance ?? layer.config?.tolerance ?? "default")}
                  onchange={(e) => {
                    const val = e.target.value === "default" ? null : e.target.value;
                    handleConfigChange("tolerance", val);
                    layer.tolerance = val;
                  }}
                  title="Tolerance window before layer goes stale (§2.2)"
                >
                  <option value="default">Element Default</option>
                  <option value="5m">5 min</option>
                  <option value="10m">10 min (Radar)</option>
                  <option value="20m">20 min (Satellite)</option>
                  <option value="30m">30 min</option>
                  <option value="1h">1 hour (METAR)</option>
                  <option value="3h">3 hours (Synoptic/MSLP)</option>
                  <option value="6h">6 hours (Sounding/Meso)</option>
                  <option value="12h">12 hours</option>
                  <option value="24h">24 hours</option>
                  <option value="unlimited">Unlimited</option>
                </select>
              </label>
            </div>

            <div class="config-row config-row-wrap offset-row">
              <label class="inline-control wide-control">
                <span>Time Offset (Desync)</span>
                <input
                  type="text"
                  class="input-time-offset"
                  value={formatOffset(layer.offset ?? layer.config?.offset ?? 0)}
                  placeholder="e.g. T - 30m, T + 1h"
                  onchange={(e) => {
                    const parsed = parseOffset(e.target.value);
                    handleConfigChange("offset", parsed);
                    layer.offset = parsed;
                  }}
                  title="Intentional time offset (§2.7). Badge turns blue so intentional desync is never confused with staleness."
                />
              </label>
              <div class="offset-quick-buttons">
                <button type="button" class="btn-offset-preset" onclick={() => { handleConfigChange("offset", -30); layer.offset = -30; }}>−30m</button>
                <button type="button" class="btn-offset-preset" onclick={() => { handleConfigChange("offset", -60); layer.offset = -60; }}>−1h</button>
                <button type="button" class="btn-offset-preset" onclick={() => { handleConfigChange("offset", 0); layer.offset = 0; }}>Sync (0)</button>
              </div>
            </div>
          </div>
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

  .config-subtabs-nav {
    display: flex;
    align-items: center;
    gap: 4px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 6px;
    margin-bottom: 2px;
    overflow-x: auto;
  }

  .config-subtab-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    line-height: 1.2;
    user-select: none;
  }

  .config-subtab-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary, #c9d1d9);
    border-color: rgba(255, 255, 255, 0.16);
  }

  .config-subtab-btn.active {
    background: rgba(56, 139, 253, 0.15);
    border-color: #58a6ff;
    color: #58a6ff;
    font-weight: 600;
  }

  .subtab-icon {
    font-size: 11px;
  }

  .subtab-title {
    font-size: 11px;
  }

  .subtab-dot {
    font-size: 8px;
    line-height: 1;
    margin-left: 2px;
  }

  .subtab-dot.dot-blue {
    color: #58a6ff;
  }

  .subtab-dot.dot-red {
    color: #f85149;
  }

  .subtab-dot.dot-amber {
    color: #d29922;
  }

  .config-subtab-pane {
    display: none;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .config-subtab-pane.active {
    display: flex;
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

  .config-row-wrap {
    justify-content: flex-start;
  }

  .inline-control {
    display: inline-flex !important;
    align-items: center;
    gap: 4px !important;
  }

  .inline-control input[type="number"] {
    width: 48px;
  }

  .wide-control {
    flex: 1 1 150px;
  }

  .wide-control input[type="text"] {
    min-width: 100px;
    flex: 1;
  }

  .interval-editor input {
    width: 58px;
    min-width: 0;
  }

  .btn-inline {
    padding: 3px 7px;
    background: #21262d;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 4px;
    color: var(--text-primary, #e6edf3);
    font-size: 10px;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-inline:hover {
    border-color: #58a6ff;
    color: #58a6ff;
  }

  .palette-row {
    justify-content: flex-start;
  }

  .palette-row label {
    min-width: 58px;
  }

  .sel-palette,
  .sel-contour-element,
  .profile-controls select {
    min-width: 0;
    max-width: 100%;
    flex: 1;
    background: var(--bg-secondary, #161b22);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    color: var(--text-primary, #e6edf3);
    border-radius: 4px;
    padding: 3px 5px;
    font-size: 10px;
  }

  .wind-contour-row {
    align-items: center;
  }

  .profile-section {
    color: var(--text-secondary, #8b949e);
    font-size: 11px;
    border-top: 1px solid rgba(48, 54, 61, 0.6);
    padding-top: 6px;
  }

  .profile-controls {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    font-size: 10px;
    color: var(--text-secondary, #8b949e);
  }

  .profile-controls label {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .profile-controls input[type="number"] {
    width: 58px;
    min-width: 0;
    padding: 3px 4px;
    background: var(--bg-secondary, #161b22);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 4px;
    color: var(--text-primary, #e6edf3);
    font-size: 10px;
  }

  .profile-coordinates input[type="number"] {
    width: 48px;
  }

  .config-grid-2col {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
    border-top: 1px solid rgba(48, 54, 61, 0.6);
    padding-top: 6px;
  }

  .config-grid-2col label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    color: var(--text-primary, #e6edf3);
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

  .sel-basemap-scheme,
  .sel-basemap-projection {
    background: var(--bg-secondary, #161b22);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    color: var(--text-primary, #e6edf3);
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 11px;
    min-width: 140px;
    max-width: 100%;
    outline: none;
  }

  .select-label {
    color: var(--text-secondary, #8b949e);
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .layer-row-time-chip {
    font-size: 9.5px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-secondary, #8b949e);
    font-weight: 500;
    margin-left: auto;
    margin-right: 4px;
    white-space: nowrap;
    border: 1px solid transparent;
  }

  .layer-row-time-chip.status-desync {
    background: rgba(56, 139, 253, 0.15);
    border-color: rgba(56, 139, 253, 0.4);
    color: #79c0ff;
  }

  .layer-row-time-chip.status-soft-stale {
    background: rgba(210, 153, 34, 0.15);
    border-color: rgba(210, 153, 34, 0.35);
    color: #e3b341;
  }

  .layer-row-time-chip.status-hard-stale {
    background: rgba(248, 81, 73, 0.18);
    border-color: rgba(248, 81, 73, 0.45);
    color: #ff7b72;
  }

  .chip-status-dot {
    font-size: 8px;
    line-height: 1;
  }

  .chip-age {
    opacity: 0.85;
  }

  .config-time-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    margin-top: 6px;
  }

  .time-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-primary, #e6edf3);
  }

  .resolved-pill {
    font-size: 10px;
    font-weight: 500;
    padding: 1px 7px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-secondary, #8b949e);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid transparent;
  }

  .resolved-pill.pill-desync {
    background: rgba(56, 139, 253, 0.2);
    border-color: rgba(56, 139, 253, 0.5);
    color: #79c0ff;
  }

  .resolved-pill.pill-soft-stale {
    background: rgba(210, 153, 34, 0.2);
    border-color: rgba(210, 153, 34, 0.45);
    color: #e3b341;
  }

  .resolved-pill.pill-hard-stale {
    background: rgba(248, 81, 73, 0.22);
    border-color: rgba(248, 81, 73, 0.5);
    color: #ff7b72;
  }

  .status-indicator {
    font-size: 9px;
  }

  .offset-row {
    align-items: flex-end;
  }

  .input-time-offset {
    background: var(--bg-secondary, #161b22);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    color: var(--text-primary, #e6edf3);
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 11px;
    outline: none;
    font-family: var(--font-mono, monospace);
  }

  .offset-quick-buttons {
    display: flex;
    gap: 4px;
    padding-bottom: 1px;
  }

  .btn-offset-preset {
    background: #21262d;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #c9d1d9;
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 10px;
    cursor: pointer;
    font-family: var(--font-mono, monospace);
    transition: background 0.15s ease;
  }

  .btn-offset-preset:hover {
    background: #30363d;
    color: #ffffff;
    border-color: #58a6ff;
  }

  .sel-time-policy,
  .sel-time-tolerance {
    background: var(--bg-secondary, #161b22);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    color: var(--text-primary, #e6edf3);
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 11px;
    outline: none;
  }
</style>

