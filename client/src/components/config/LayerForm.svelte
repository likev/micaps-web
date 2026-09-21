<script>
  import { MET_LINE_COLORS, getRecommendedLineColor } from "../../ui/config/colorPresets.js";

  let { layer, availableColormaps = [], onUpdate = null, onDuplicate = null, onDelete = null } = $props();

  const LAYER_TYPES = [
    { value: "contour", label: "Contour / Isobands (等值线/色斑图)" },
    { value: "wind", label: "Wind Vectors / Streamlines (风场/流线)" },
    { value: "station", label: "Station Plot (站点填图)" },
    { value: "pmtiles", label: "Vector Basemap (矢量底图)" },
    { value: "timeheight", label: "Time-Height Profile (时间-高度剖面)" },
    { value: "hovmoller", label: "Hovmöller Diagram (纬度-时间剖面)" },
    { value: "tlogp", label: "T-lnP Sounding Diagram (探空图)" },
  ];

  const COMMON_MODELS = ["ECMWF_HR", "CMA_GFS", "SURFACE", "UPPER_AIR"];
  const COMMON_ELEMENTS = ["TMP", "HGT", "WIND", "RH", "MSLP", "APCP", "TLOGP", "STATION"];

  function mutateField(field, val) {
    layer[field] = val;
    if (field === "element" && !layer.color) {
      const rec = getRecommendedLineColor(val);
      if (rec) layer.color = rec;
    }
    if (onUpdate) onUpdate();
  }

  function mutateRender(key, val) {
    if (!layer.render) layer.render = {};
    layer.render[key] = val;
    if (onUpdate) onUpdate();
  }

  function mutateConfig(key, val) {
    if (!layer.config) layer.config = {};
    layer.config[key] = val;
    if (onUpdate) onUpdate();
  }
</script>

<div class="layer-editor-card">
  <div class="layer-editor-header">
    <div class="layer-title-badge">
      <span class="preset-layer-dot" style:background={layer.color || layer.render?.lineColor || '#58a6ff'}></span>
      <span class="layer-id-label">{layer.id}</span>
    </div>
    <div class="header-actions">
      {#if onDuplicate}
        <button type="button" class="btn" title="Duplicate Layer" onclick={onDuplicate}>📋 Copy</button>
      {/if}
      {#if onDelete}
        <button type="button" class="btn btn-danger" title="Delete Layer" onclick={onDelete}>🗑️ Remove</button>
      {/if}
    </div>
  </div>

  <div class="layer-editor-grid">
    <!-- Row 1: Type & Name -->
    <label class="config-field">
      <span class="config-label">Layer Type</span>
      <select
        class="config-select"
        value={layer.type || "contour"}
        onchange={(e) => mutateField("type", e.target.value)}
      >
        {#each LAYER_TYPES as t}
          <option value={t.value}>{t.label}</option>
        {/each}
      </select>
    </label>

    <label class="config-field">
      <span class="config-label">Display Name</span>
      <input
        type="text"
        class="config-input"
        value={layer.name || ""}
        placeholder="e.g. 500hPa Geopotential Height"
        oninput={(e) => mutateField("name", e.target.value)}
      />
    </label>

    <!-- Row 2: Model & Element -->
    <label class="config-field">
      <span class="config-label">Model / Data Source</span>
      <input
        type="text"
        class="config-input"
        value={layer.model || ""}
        placeholder="e.g. ECMWF_HR"
        list="model-datalist"
        oninput={(e) => mutateField("model", e.target.value)}
      />
      <datalist id="model-datalist">
        {#each COMMON_MODELS as m}
          <option value={m}></option>
        {/each}
      </datalist>
    </label>

    <label class="config-field">
      <span class="config-label">Element</span>
      <input
        type="text"
        class="config-input"
        value={layer.element || ""}
        placeholder="e.g. HGT or TMP"
        list="element-datalist"
        oninput={(e) => mutateField("element", e.target.value)}
      />
      <datalist id="element-datalist">
        {#each COMMON_ELEMENTS as el}
          <option value={el}></option>
        {/each}
      </datalist>
    </label>

    <!-- Row 3: Level & Colormap -->
    <label class="config-field">
      <span class="config-label">Pressure Level (hPa)</span>
      <input
        type="number"
        class="config-input"
        value={layer.level ?? ""}
        placeholder="e.g. 500 (blank for surface/profile)"
        oninput={(e) => mutateField("level", e.target.value ? parseInt(e.target.value, 10) : null)}
      />
    </label>

    {#if layer.type === "contour"}
      <label class="config-field">
        <span class="config-label">Colormap</span>
        <select
          class="config-select"
          value={layer.render?.colormap || ""}
          onchange={(e) => mutateRender("colormap", e.target.value || null)}
        >
          <option value="">(None / Default)</option>
          {#each availableColormaps as c}
            <option value={c}>{c}</option>
          {/each}
        </select>
      </label>
    {/if}
  </div>

  <!-- Type Specific Options -->
  {#if layer.type === "contour"}
    <div class="layer-section-title">Contour & Shading Options</div>
    <div class="layer-options-row">
      <label class="config-checkbox-label">
        <input
          type="checkbox"
          checked={layer.render?.showLine !== false}
          onchange={(e) => mutateRender("showLine", e.target.checked)}
        />
        <span>Show Isolines (等值线)</span>
      </label>

      {#if layer.render?.showLine !== false}
        <div class="line-color-picker-wrap">
          <input
            type="color"
            class="color-picker-input"
            value={layer.color || layer.render?.lineColor || "#58a6ff"}
            oninput={(e) => {
              mutateField("color", e.target.value);
              mutateRender("lineColor", e.target.value);
            }}
          />
          <span class="meta-sub-label">Line Color</span>
        </div>
      {/if}

      <label class="config-checkbox-label">
        <input
          type="checkbox"
          checked={layer.render?.showFill !== false}
          onchange={(e) => mutateRender("showFill", e.target.checked)}
        />
        <span>Show Isobands (填充色斑)</span>
      </label>

      <label class="config-checkbox-label">
        <input
          type="checkbox"
          checked={Boolean(layer.render?.showRaster)}
          onchange={(e) => mutateRender("showRaster", e.target.checked)}
        />
        <span>Raster Mode</span>
      </label>
    </div>
  {:else if layer.type === "wind"}
    <div class="layer-section-title">Wind Vector Options</div>
    <div class="layer-options-row">
      <label class="config-checkbox-label">
        <input
          type="checkbox"
          checked={layer.config?.showWind !== false}
          onchange={(e) => mutateConfig("showWind", e.target.checked)}
        />
        <span>Streamlines (流线动画)</span>
      </label>

      <label class="config-checkbox-label">
        <input
          type="checkbox"
          checked={Boolean(layer.config?.showBarbs)}
          onchange={(e) => mutateConfig("showBarbs", e.target.checked)}
        />
        <span>Wind Barbs (风羽)</span>
      </label>
    </div>
  {:else if layer.type === "station"}
    <div class="layer-section-title">Station Plotting Elements</div>
    <div class="layer-options-row">
      <label class="config-checkbox-label">
        <input
          type="checkbox"
          checked={layer.config?.showTemp !== false}
          onchange={(e) => mutateConfig("showTemp", e.target.checked)}
        />
        <span>Temperature</span>
      </label>
      <label class="config-checkbox-label">
        <input
          type="checkbox"
          checked={layer.config?.showDewpoint !== false}
          onchange={(e) => mutateConfig("showDewpoint", e.target.checked)}
        />
        <span>Dew Point</span>
      </label>
      <label class="config-checkbox-label">
        <input
          type="checkbox"
          checked={layer.config?.showWind !== false}
          onchange={(e) => mutateConfig("showWind", e.target.checked)}
        />
        <span>Wind Barb</span>
      </label>
      <label class="config-checkbox-label">
        <input
          type="checkbox"
          checked={layer.config?.showPressure !== false}
          onchange={(e) => mutateConfig("showPressure", e.target.checked)}
        />
        <span>Pressure / Height</span>
      </label>
    </div>
  {/if}
</div>

<style>
  .layer-editor-card {
    background: rgba(22, 27, 34, 0.8);
    border: 1px solid var(--border-color, #30363d);
    border-radius: 6px;
    padding: 16px;
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .layer-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(48, 54, 61, 0.4);
    padding-bottom: 8px;
  }

  .layer-title-badge {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .preset-layer-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
  }

  .layer-id-label {
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary, #e6edf3);
  }

  .layer-editor-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .config-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .config-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary, #8b949e);
  }

  .config-input, .config-select {
    background: var(--bg-primary, #0d1117);
    color: var(--text-primary, #e6edf3);
    border: 1px solid var(--border-color, #30363d);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
    outline: none;
  }

  .config-input:focus, .config-select:focus {
    border-color: var(--accent-blue, #58a6ff);
  }

  .layer-section-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary, #8b949e);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 4px;
  }

  .layer-options-row {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    background: var(--bg-primary, #0d1117);
    padding: 10px 14px;
    border-radius: 6px;
    border: 1px solid rgba(48, 54, 61, 0.4);
  }

  .config-checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-primary, #e6edf3);
    cursor: pointer;
  }

  .color-picker-input {
    width: 28px;
    height: 22px;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
    padding: 0;
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .line-color-picker-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .meta-sub-label {
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
  }
</style>
