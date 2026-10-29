<script>
  import { MET_LINE_COLORS, getRecommendedLineColor } from "../../ui/config/colorPresets.js";
  import { getGlobalLocale, t } from "../../lib/stores/i18n.svelte.js";

  let { layer, availableColormaps = [], onUpdate = null, onDuplicate = null, onDelete = null } = $props();

  let currentLocale = $derived(getGlobalLocale());

  const LAYER_TYPES = [
    { value: "contour", en: "Contour / Isobands", zh: "等值线 / 色斑图" },
    { value: "wind", en: "Wind Vectors / Streamlines", zh: "风场矢量 / 流线" },
    { value: "station", en: "Station Plot", zh: "站点填图" },
    { value: "pmtiles", en: "Vector Basemap", zh: "矢量底图" },
    { value: "timeheight", en: "Time-Height Profile", zh: "时间-高度剖面" },
    { value: "hovmoller", en: "Hovmöller Diagram", zh: "纬度-时间剖面" },
    { value: "tlogp", en: "T-lnP Sounding Diagram", zh: "T-lnP 探空图" },
  ];

  const COMMON_MODELS = ["ECMWF_HR", "GRAPES_GFS", "SURFACE", "UPPER_AIR"];
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
        <button type="button" class="btn" title={t("config.presets.duplicateLayer")} onclick={onDuplicate}>{t("config.layer.copy")}</button>
      {/if}
      {#if onDelete}
        <button type="button" class="btn btn-danger" title={t("config.presets.removeLayer")} onclick={onDelete}>{t("config.layer.remove")}</button>
      {/if}
    </div>
  </div>

  <div class="layer-editor-grid">
    <!-- Row 1: Type & Name -->
    <label class="config-field">
      <span class="config-label">{t("config.layer.type")}</span>
      <select
        class="config-select"
        value={layer.type || "contour"}
        onchange={(e) => mutateField("type", e.target.value)}
      >
        {#each LAYER_TYPES as lt}
          <option value={lt.value}>{currentLocale === "zh" ? lt.zh : lt.en}</option>
        {/each}
      </select>
    </label>

    <label class="config-field">
      <span class="config-label">{t("config.layer.name")}</span>
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
      <span class="config-label">{t("config.layer.model")}</span>
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
      <span class="config-label">{t("config.layer.element")}</span>
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
      <span class="config-label">{t("config.layer.level")}</span>
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
        <span class="config-label">{t("config.layer.colormap")}</span>
        <select
          class="config-select"
          value={layer.render?.colormap || ""}
          onchange={(e) => mutateRender("colormap", e.target.value || null)}
        >
          <option value="">{t("config.layer.noneDefault")}</option>
          {#each availableColormaps as c}
            <option value={c}>{c}</option>
          {/each}
        </select>
      </label>
      <label class="config-field">
        <span class="config-label">{t("config.layer.palettePath")}</span>
        <input
          type="text"
          class="config-input"
          value={layer.render?.palettePath || ""}
          placeholder="e.g. /palettes/RH/dark-850hpa.xml"
          oninput={(e) => mutateRender("palettePath", e.target.value.trim() || null)}
        />
      </label>
    {/if}

    {#if layer.type === "wind"}
      <label class="config-field">
        <span class="config-label">{t("config.layer.palettePath")}</span>
        <input
          type="text"
          class="config-input"
          value={layer.render?.palettePath || ""}
          placeholder="e.g. /palettes/WIND/speed.xml"
          oninput={(e) => mutateRender("palettePath", e.target.value.trim() || null)}
        />
      </label>
    {/if}
  </div>

  <!-- Type Specific Options -->
  {#if layer.type === "contour"}
    <div class="layer-section-title">{t("config.layer.contourShading")}</div>
    <div class="layer-options-row">
      <label class="config-checkbox-label">
        <input
          type="checkbox"
          checked={layer.render?.showLine !== false}
          onchange={(e) => mutateRender("showLine", e.target.checked)}
        />
        <span>{t("config.layer.showIsolines")}</span>
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
          <span class="meta-sub-label">{t("config.layer.lineColor")}</span>
        </div>
      {/if}

      <label class="config-checkbox-label">
        <input
          type="checkbox"
          checked={layer.render?.showFill !== false}
          onchange={(e) => mutateRender("showFill", e.target.checked)}
        />
        <span>{t("config.layer.showIsobands")}</span>
      </label>

      <label class="config-checkbox-label">
        <input
          type="checkbox"
          checked={Boolean(layer.render?.showRaster)}
          onchange={(e) => mutateRender("showRaster", e.target.checked)}
        />
        <span>{t("config.layer.rasterMode")}</span>
      </label>
    </div>
  {:else if layer.type === "wind"}
    <div class="layer-section-title">{t("config.layer.windOptions")}</div>
    <div class="layer-options-row">
      <label class="config-checkbox-label">
        <input
          type="checkbox"
          checked={layer.config?.showWind !== false}
          onchange={(e) => mutateConfig("showWind", e.target.checked)}
        />
        <span>{t("config.layer.streamlines")}</span>
      </label>

      <label class="config-checkbox-label">
        <input
          type="checkbox"
          checked={Boolean(layer.config?.showBarbs)}
          onchange={(e) => mutateConfig("showBarbs", e.target.checked)}
        />
        <span>{t("config.layer.windBarbs")}</span>
      </label>
    </div>
  {:else if layer.type === "station"}
    <div class="layer-section-title">{t("config.layer.stationElements")}</div>
    <div class="layer-options-row">
      <label class="config-checkbox-label">
        <input
          type="checkbox"
          checked={layer.config?.showTemp !== false}
          onchange={(e) => mutateConfig("showTemp", e.target.checked)}
        />
        <span>{t("config.layer.temperature")}</span>
      </label>
      <label class="config-checkbox-label">
        <input
          type="checkbox"
          checked={layer.config?.showDewpoint !== false}
          onchange={(e) => mutateConfig("showDewpoint", e.target.checked)}
        />
        <span>{t("config.layer.dewPoint")}</span>
      </label>
      <label class="config-checkbox-label">
        <input
          type="checkbox"
          checked={layer.config?.showWind !== false}
          onchange={(e) => mutateConfig("showWind", e.target.checked)}
        />
        <span>{t("config.layer.windBarb")}</span>
      </label>
      <label class="config-checkbox-label">
        <input
          type="checkbox"
          checked={layer.config?.showPressure !== false}
          onchange={(e) => mutateConfig("showPressure", e.target.checked)}
        />
        <span>{t("config.layer.pressureHeight")}</span>
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
