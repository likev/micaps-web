<script>
  import { onDestroy } from "svelte";
  import {
    DEFAULT_MAX_EFFECTIVE_CELLS,
    MIN_MAX_EFFECTIVE_CELLS,
    MAX_MAX_EFFECTIVE_CELLS,
  } from "../../config/presets.js";

  let { formState } = $props();

  let draft = $state({ ...formState.getDraft() });

  const unsub = formState.subscribe(() => {
    draft = {
      ...formState.getDraft(),
      basemap: { ...(formState.getDraft()?.basemap || {}) },
      performance: { ...(formState.getDraft()?.performance || {}) },
    };
  });

  onDestroy(() => {
    unsub();
  });

  let basemap = $derived(draft.basemap || {});
  let perf = $derived(draft.performance || {});
  let scheme = $derived(basemap.scheme || "dark");
  let projection = $derived(basemap.projection || "mercator");
  let cells = $derived(Number.isFinite(perf.maxEffectiveCells) ? perf.maxEffectiveCells : DEFAULT_MAX_EFFECTIVE_CELLS);

  function setScheme(newScheme) {
    formState.updateDraft((d) => {
      if (!d.basemap) d.basemap = {};
      d.basemap.scheme = newScheme;
    });
  }

  function setProjection(newProj) {
    formState.updateDraft((d) => {
      if (!d.basemap) d.basemap = {};
      d.basemap.projection = newProj;
    });
  }

  function setVectorOverlay(key, value) {
    formState.updateDraft((d) => {
      if (!d.basemap) d.basemap = {};
      d.basemap[key] = value;
    });
  }

  function setCells(val) {
    const parsed = parseInt(val, 10);
    if (Number.isFinite(parsed)) {
      formState.updateDraft((d) => {
        if (!d.performance) d.performance = {};
        d.performance.maxEffectiveCells = parsed;
      });
    }
  }
</script>

<div class="config-settings-container">
  <!-- Basemap Settings Card -->
  <div class="config-card">
    <div class="config-card-header">
      <h3>🗺️ Basemap & Projection</h3>
      <p class="config-card-desc">Default background tile theme, layer visibility, and coordinate projection.</p>
    </div>
    <div class="config-card-body">
      <div class="config-field-group">
        <span class="config-label">Theme Scheme</span>
        <div class="config-radio-cards" id="settings-basemap-schemes">
          <label class="radio-card" class:selected={scheme === "dark"}>
            <input
              type="radio"
              name="basemap-scheme"
              value="dark"
              checked={scheme === "dark"}
              onchange={() => setScheme("dark")}
            />
            <span class="radio-card-icon">🌙</span>
            <span class="radio-card-title">Midnight Slate</span>
            <span class="radio-card-sub">Dark</span>
          </label>
          <label class="radio-card" class:selected={scheme === "light"}>
            <input
              type="radio"
              name="basemap-scheme"
              value="light"
              checked={scheme === "light"}
              onchange={() => setScheme("light")}
            />
            <span class="radio-card-icon">☀️</span>
            <span class="radio-card-title">Daybreak Neutral</span>
            <span class="radio-card-sub">Light</span>
          </label>
          <label class="radio-card" class:selected={scheme === "micaps"}>
            <input
              type="radio"
              name="basemap-scheme"
              value="micaps"
              checked={scheme === "micaps"}
              onchange={() => setScheme("micaps")}
            />
            <span class="radio-card-icon">🌐</span>
            <span class="radio-card-title">MICAPS Classic</span>
            <span class="radio-card-sub">Navy</span>
          </label>
        </div>
      </div>

      <div class="config-field-group mt-16">
        <label for="settings-basemap-proj" class="config-label">Map Projection</label>
        <select
          id="settings-basemap-proj"
          class="config-select"
          value={projection}
          onchange={(e) => setProjection(e.target.value)}
        >
          <option value="mercator">🗺️ Mercator (Standard 2D)</option>
          <option value="globe">🌍 Globe (Spherical 3D)</option>
          <option value="vertical-perspective">🪐 Vertical Perspective (3D)</option>
        </select>
      </div>

      <div class="config-field-group mt-16">
        <span class="config-label">Vector Overlays</span>
        <div class="config-checkbox-grid">
          <label class="config-checkbox-label">
            <input
              type="checkbox"
              id="chk-cfg-graticule"
              checked={basemap.showGraticule !== false}
              onchange={(e) => setVectorOverlay("showGraticule", e.target.checked)}
            />
            <span>10° Lon/Lat Graticule Lines</span>
          </label>
          <label class="config-checkbox-label">
            <input
              type="checkbox"
              id="chk-cfg-world"
              checked={basemap.showWorld !== false}
              onchange={(e) => setVectorOverlay("showWorld", e.target.checked)}
            />
            <span>World Country Boundaries</span>
          </label>
          <label class="config-checkbox-label">
            <input
              type="checkbox"
              id="chk-cfg-provinces"
              checked={basemap.showProvinces !== false}
              onchange={(e) => setVectorOverlay("showProvinces", e.target.checked)}
            />
            <span>Province Boundaries</span>
          </label>
          <label class="config-checkbox-label">
            <input
              type="checkbox"
              id="chk-cfg-cities"
              checked={basemap.showCities !== false}
              onchange={(e) => setVectorOverlay("showCities", e.target.checked)}
            />
            <span>City / County Boundaries</span>
          </label>
        </div>
      </div>
    </div>
  </div>

  <!-- Performance Budget Card -->
  <div class="config-card mt-16">
    <div class="config-card-header">
      <h3>⚡ Performance & Contour Budget</h3>
      <p class="config-card-desc">Controls memory budget and Marching Squares grid cell sampling limits.</p>
    </div>
    <div class="config-card-body">
      <div class="config-field-group">
        <label for="input-perf-cells" class="config-label">
          Max Effective Cells (Marching Squares budget)
        </label>
        <div class="cell-budget-row">
          <input
            type="range"
            id="slider-perf-cells"
            min={MIN_MAX_EFFECTIVE_CELLS}
            max={MAX_MAX_EFFECTIVE_CELLS}
            step="1000"
            value={cells}
            class="flex-1"
            oninput={(e) => setCells(e.target.value)}
          />
          <input
            type="number"
            id="input-perf-cells"
            class="config-input budget-number-input"
            min={MIN_MAX_EFFECTIVE_CELLS}
            max={MAX_MAX_EFFECTIVE_CELLS}
            step="1000"
            value={cells}
            oninput={(e) => setCells(e.target.value)}
          />
          <span class="budget-unit-label">cells</span>
        </div>
        <p class="config-hint mt-6">
          Allowed bounds: {MIN_MAX_EFFECTIVE_CELLS.toLocaleString()} – {MAX_MAX_EFFECTIVE_CELLS.toLocaleString()} cells.
          Default: {DEFAULT_MAX_EFFECTIVE_CELLS.toLocaleString()}. Higher values increase contour resolution on fine grids at the cost of CPU/memory.
        </p>
      </div>
    </div>
  </div>
</div>

<style>
  .config-settings-container {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
    flex: 1;
    background: var(--bg-primary, #0d1117);
  }

  .config-card {
    background: var(--bg-secondary, #161b22);
    border: 1px solid var(--border-color, #30363d);
    border-radius: 6px;
    overflow: hidden;
  }

  .config-card-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color, #30363d);
  }

  .config-card-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary, #e6edf3);
  }

  .config-card-desc {
    margin: 4px 0 0 0;
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
  }

  .config-card-body {
    padding: 16px;
  }

  .config-field-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .config-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary, #e6edf3);
  }

  .config-hint {
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
    margin: 0;
    line-height: 1.4;
  }

  .config-radio-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-top: 4px;
  }

  .radio-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 12px 8px;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 6px;
    background: var(--bg-primary, #0d1117);
    cursor: pointer;
    text-align: center;
    transition: all 0.15s ease;
  }

  .radio-card input {
    display: none;
  }

  .radio-card.selected {
    border-color: var(--accent-blue, #58a6ff);
    background: rgba(88, 166, 255, 0.1);
  }

  .radio-card-icon {
    font-size: 20px;
    margin-bottom: 4px;
  }

  .radio-card-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary, #e6edf3);
  }

  .radio-card-sub {
    font-size: 10px;
    color: var(--text-secondary, #8b949e);
  }

  .config-select, .config-input {
    background: var(--bg-primary, #0d1117);
    color: var(--text-primary, #e6edf3);
    border: 1px solid var(--border-color, #30363d);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
    outline: none;
  }

  .config-select:focus, .config-input:focus {
    border-color: var(--accent-blue, #58a6ff);
  }

  .config-checkbox-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-top: 4px;
  }

  .config-checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-primary, #e6edf3);
    cursor: pointer;
  }

  .mt-16 {
    margin-top: 16px;
  }

  .mt-6 {
    margin-top: 6px;
  }

  .cell-budget-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 6px;
  }

  .flex-1 {
    flex: 1;
  }

  .budget-number-input {
    width: 110px;
    text-align: right;
  }

  .budget-unit-label {
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
  }
</style>
