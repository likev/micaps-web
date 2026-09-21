<script>
  import { onDestroy } from "svelte";
  import { BUILTIN_COLORMAP_PRESETS, findPreset } from "../../ui/config/colorPresets.js";
  import { hexToRgb, rgbToHex } from "../../ui/config/swatchPicker.js";
  import { stopsToCSSGradient } from "../../ui/config/colormapStops.js";
  import { getColormapUsageCounts, rewriteColormapReferences } from "../../ui/config/colormapForm.js";

  let { formState } = $props();

  let stopIdCounter = 0;
  const stopIdMap = new WeakMap();
  function getStopId(stop) {
    if (!stop || typeof stop !== "object") return "";
    let id = stopIdMap.get(stop);
    if (!id) {
      id = `stop-${++stopIdCounter}`;
      stopIdMap.set(stop, id);
    }
    return id;
  }

  let draft = $state({
    ...formState.getDraft(),
    colormaps: { ...(formState.getDraft()?.colormaps || {}) },
  });
  let searchQuery = $state("");
  let activeColormap = $state(formState.getSelectedColormapName() || "");

  const unsub = formState.subscribe(() => {
    draft = {
      ...formState.getDraft(),
      colormaps: { ...(formState.getDraft()?.colormaps || {}) },
    };
    const names = Object.keys(draft.colormaps || {});
    if (!names.includes(activeColormap)) {
      activeColormap = names[0] || "";
      formState.setSelectedColormapName(activeColormap);
    }
  });

  onDestroy(() => {
    unsub();
  });

  let colormaps = $derived(draft.colormaps || {});
  let colormapNames = $derived(Object.keys(colormaps));
  let usages = $derived(getColormapUsageCounts(draft));
  let validation = $derived(formState.getValidation());

  $effect(() => {
    if (!activeColormap && colormapNames.length > 0) {
      activeColormap = colormapNames[0];
      formState.setSelectedColormapName(activeColormap);
    }
  });

  let filteredNames = $derived(
    colormapNames.filter((name) =>
      name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  let currentStops = $derived(colormaps[activeColormap] || []);
  let gradientCSS = $derived(stopsToCSSGradient(currentStops));
  let minVal = $derived(currentStops[0]?.val ?? "—");
  let maxVal = $derived(currentStops[currentStops.length - 1]?.val ?? "—");
  let currentErrors = $derived(validation.colormapErrors?.get(activeColormap) || []);

  function selectColormap(name) {
    activeColormap = name;
    formState.setSelectedColormapName(name);
  }

  function handleCreateColormap() {
    let base = "new_colormap";
    let name = base;
    let seq = 1;
    while (draft.colormaps?.[name]) {
      name = `${base}_${seq++}`;
    }
    const defaultStops = [
      { val: 0, color: [0, 0, 255, 255] },
      { val: 50, color: [255, 255, 255, 255] },
      { val: 100, color: [255, 0, 0, 255] },
    ];
    formState.updateDraft((d) => {
      if (!d.colormaps) d.colormaps = {};
      d.colormaps[name] = defaultStops;
    });
    selectColormap(name);
  }

  function handleDuplicate() {
    if (!activeColormap || !colormaps[activeColormap]) return;
    let base = `${activeColormap}_copy`;
    let name = base;
    let seq = 1;
    while (draft.colormaps?.[name]) {
      name = `${base}_${seq++}`;
    }
    const stopsCopy = JSON.parse(JSON.stringify(colormaps[activeColormap]));
    formState.updateDraft((d) => {
      d.colormaps[name] = stopsCopy;
    });
    selectColormap(name);
  }

  function handleDelete() {
    if (!activeColormap) return;
    const count = usages[activeColormap] || 0;
    if (count > 0) {
      if (!confirm(`"${activeColormap}" is currently used in ${count} preset layer(s). Deleting it will cause rendering errors. Delete anyway?`)) {
        return;
      }
    } else if (!confirm(`Delete colormap "${activeColormap}"?`)) {
      return;
    }
    formState.updateDraft((d) => {
      delete d.colormaps[activeColormap];
    });
  }

  function handleRename(e) {
    const newName = e.target.value.trim();
    if (!newName || newName === activeColormap) return;
    if (colormaps[newName]) {
      alert(`Colormap name "${newName}" already exists.`);
      e.target.value = activeColormap;
      return;
    }
    formState.updateDraft((d) => {
      const stops = d.colormaps[activeColormap];
      delete d.colormaps[activeColormap];
      d.colormaps[newName] = stops;
      rewriteColormapReferences(d, activeColormap, newName);
    });
    activeColormap = newName;
    formState.setSelectedColormapName(newName);
  }

  function handleApplyPreset(e) {
    const presetKey = e.target.value;
    if (!presetKey) return;
    const p = findPreset(presetKey);
    if (!p) return;
    formState.updateDraft((d) => {
      d.colormaps[activeColormap] = JSON.parse(JSON.stringify(p.stops));
    });
    e.target.value = "";
  }

  function handleAddStop() {
    formState.updateDraft((d) => {
      const stops = d.colormaps[activeColormap];
      if (!stops) return;
      const last = stops[stops.length - 1];
      const prev = stops[stops.length - 2];
      const step = last && prev ? (last.val - prev.val) : 5;
      const newVal = last ? last.val + step : 0;
      stops.push({ val: newVal, color: [255, 255, 255, 255] });
      stops.sort((a, b) => a.val - b.val);
    });
  }

  function handleReverseStops() {
    formState.updateDraft((d) => {
      const stops = d.colormaps[activeColormap];
      if (!stops || stops.length < 2) return;
      const colors = stops.map((s) => s.color).reverse();
      stops.forEach((s, i) => {
        s.color = colors[i];
      });
    });
  }

  function handleRemoveStop(idx) {
    formState.updateDraft((d) => {
      const stops = d.colormaps[activeColormap];
      if (!stops || stops.length <= 2) {
        alert("Colormaps require at least 2 stops.");
        return;
      }
      stops.splice(idx, 1);
    });
  }

  function handleStopValChange(idx, val) {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    formState.updateDraft((d) => {
      const stops = d.colormaps[activeColormap];
      if (stops && stops[idx]) {
        stops[idx].val = num;
        stops.sort((a, b) => a.val - b.val);
      }
    });
  }

  function handleStopColorChange(idx, hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    formState.updateDraft((d) => {
      const stops = d.colormaps[activeColormap];
      if (stops && stops[idx]) {
        const oldAlpha = stops[idx].color[3] !== undefined ? stops[idx].color[3] : 255;
        stops[idx].color = [rgb.r, rgb.g, rgb.b, oldAlpha];
      }
    });
  }
</script>

<div class="config-split-view">
  <!-- Sidebar -->
  <div class="config-sidebar">
    <div class="config-sidebar-header">
      <input
        type="search"
        class="config-input config-search"
        placeholder="Filter colormaps..."
        bind:value={searchQuery}
      />
      <button
        type="button"
        class="btn btn-primary btn-add-preset"
        onclick={handleCreateColormap}
      >+ New</button>
    </div>

    <div class="config-sidebar-list" id="colormap-sidebar-list">
      {#if filteredNames.length === 0}
        <div class="config-empty-state config-empty-state-sidebar">
          No colormaps found
        </div>
      {:else}
        {#each filteredNames as name (name)}
          {@const stops = colormaps[name] || []}
          {@const grad = stopsToCSSGradient(stops)}
          {@const isSelected = name === activeColormap}
          {@const count = usages[name] || 0}
          {@const hasError = validation.colormapErrors?.has(name)}
          <div
            class="config-sidebar-item"
            class:selected={isSelected}
            class:has-error={hasError}
            onclick={() => selectColormap(name)}
          >
            <div class="sidebar-item-top">
              <span class="sidebar-item-name">{name}</span>
              <div class="sidebar-item-badges">
                {#if hasError}<span class="badge-error" title="Validation errors">⚠</span>{/if}
                <span class="sidebar-item-chip">{stops.length} stops</span>
                {#if count > 0}<span class="sidebar-item-chip usage">{count} used</span>{/if}
              </div>
            </div>
            <div class="sidebar-colormap-preview" style:background={grad}></div>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <!-- Detail Pane -->
  <div class="config-detail-pane">
    {#if !activeColormap || !colormaps[activeColormap]}
      <div class="config-empty-state">
        <p>Select or create a colormap to view details.</p>
      </div>
    {:else}
      <div class="config-detail-content">
        <!-- Top Toolbar Card -->
        <div class="config-card">
          <div class="config-card-header card-header-flex">
            <div class="toolbar-group">
              <label for="input-cmap-name" class="cmap-name-label">Colormap Name:</label>
              <input
                type="text"
                id="input-cmap-name"
                class="config-input cmap-name-input"
                value={activeColormap}
                onchange={handleRename}
              />
              {#if usages[activeColormap]}
                <span class="sidebar-item-chip usage">{usages[activeColormap]} used</span>
              {/if}
            </div>

            <div class="toolbar-group">
              <select class="config-select" onchange={handleApplyPreset}>
                <option value="">Preset Template...</option>
                {#each BUILTIN_COLORMAP_PRESETS as p}
                  <option value={p.name}>{p.name} ({p.stops?.length || 0} stops)</option>
                {/each}
              </select>

              <button type="button" class="btn" title="Duplicate Colormap" onclick={handleDuplicate}>
                📋 Duplicate
              </button>
              <button type="button" class="btn btn-danger" title="Delete Colormap" onclick={handleDelete}>
                🗑️ Delete
              </button>
            </div>
          </div>

          {#if currentErrors.length > 0}
            <div class="config-banner error banner-margin">
              <strong>Validation errors:</strong>
              <ul>
                {#each currentErrors as err}
                  <li>{err.message}</li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>

        <!-- Gradient Preview Card -->
        <div class="colormap-gradient-card mt-16">
          <div class="colormap-gradient-header">
            <h4>Gradient Preview</h4>
            <span class="gradient-val-range">{minVal} → {maxVal}</span>
          </div>
          <div class="colormap-gradient-bar" style:background={gradientCSS}></div>
          <div class="gradient-axis-labels">
            <span class="gradient-val-label min">{minVal}</span>
            <span class="gradient-val-label max">{maxVal}</span>
          </div>
        </div>

        <!-- Stops Editor Card -->
        <div class="config-card mt-16">
          <div class="config-card-header card-header-flex">
            <div>
              <h3>Stop Points ({currentStops.length})</h3>
              <p class="config-card-desc">Define scalar values and corresponding RGBA color transitions.</p>
            </div>
            <div class="header-actions">
              <button type="button" class="btn" title="Reverse Stops" onclick={handleReverseStops}>
                ⇄ Reverse Colors
              </button>
              <button type="button" class="btn btn-primary" title="Add Stop" onclick={handleAddStop}>
                + Add Stop
              </button>
            </div>
          </div>

          <div class="config-card-body card-body-flush">
            <table class="config-table colormap-stops-table">
              <thead>
                <tr>
                  <th class="th-num">#</th>
                  <th class="th-val">Value</th>
                  <th class="th-color">Color</th>
                  <th class="th-hex">Hex</th>
                  <th class="th-action"></th>
                </tr>
              </thead>
              <tbody>
                {#each currentStops as stop, idx (getStopId(stop))}
                  {@const hex = rgbToHex(stop.color[0], stop.color[1], stop.color[2])}
                  <tr>
                    <td>{idx + 1}</td>
                    <td>
                      <input
                        type="number"
                        class="config-input stop-val-input"
                        value={stop.val}
                        onchange={(e) => handleStopValChange(idx, e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="color"
                        value={hex}
                        class="color-picker-input"
                        oninput={(e) => handleStopColorChange(idx, e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        class="config-input stop-hex-input"
                        value={hex}
                        onchange={(e) => handleStopColorChange(idx, e.target.value)}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        class="btn-remove-rule"
                        title="Remove Stop"
                        disabled={currentStops.length <= 2}
                        onclick={() => handleRemoveStop(idx)}
                      >✕</button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .config-split-view {
    display: flex;
    flex: 1;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .config-sidebar {
    width: 280px;
    border-right: 1px solid var(--border-color, #30363d);
    background: var(--bg-secondary, #161b22);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .config-sidebar-header {
    padding: 12px;
    display: flex;
    gap: 8px;
    border-bottom: 1px solid var(--border-color, #30363d);
  }

  .config-search {
    flex: 1;
    min-width: 0;
  }

  .config-sidebar-list {
    flex: 1;
    overflow-y: auto;
  }

  .config-sidebar-item {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(48, 54, 61, 0.4);
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .config-sidebar-item:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .config-sidebar-item.selected {
    background: rgba(88, 166, 255, 0.12);
    border-left: 3px solid var(--accent-blue, #58a6ff);
  }

  .sidebar-item-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .sidebar-item-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary, #e6edf3);
  }

  .sidebar-item-badges {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .badge-error {
    color: #f85149;
    font-size: 12px;
  }

  .sidebar-item-chip {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 10px;
    background: rgba(110, 118, 129, 0.2);
    color: var(--text-secondary, #8b949e);
  }

  .sidebar-item-chip.usage {
    background: rgba(56, 139, 253, 0.2);
    color: #58a6ff;
  }

  .sidebar-colormap-preview {
    height: 8px;
    border-radius: 4px;
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .config-detail-pane {
    flex: 1;
    overflow-y: auto;
    background: var(--bg-primary, #0d1117);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .config-detail-content {
    padding: 16px;
    display: flex;
    flex-direction: column;
  }

  .config-card {
    background: var(--bg-secondary, #161b22);
    border: 1px solid var(--border-color, #30363d);
    border-radius: 6px;
  }

  .config-card-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color, #30363d);
  }

  .config-card-header h3 {
    margin: 0;
    font-size: 13px;
    color: var(--text-primary, #e6edf3);
  }

  .config-card-desc {
    margin: 4px 0 0 0;
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
  }

  .colormap-gradient-card {
    background: var(--bg-secondary, #161b22);
    border: 1px solid var(--border-color, #30363d);
    border-radius: 6px;
    padding: 16px;
  }

  .colormap-gradient-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
    font-size: 12px;
  }

  .gradient-val-range {
    color: var(--text-secondary, #8b949e);
    font-family: var(--font-mono, monospace);
  }

  .colormap-gradient-bar {
    height: 24px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .gradient-axis-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    font-size: 10px;
    font-family: var(--font-mono, monospace);
    color: var(--text-secondary, #8b949e);
  }

  .config-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    text-align: left;
  }

  .config-table th {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-color, #30363d);
    color: var(--text-secondary, #8b949e);
    font-weight: 500;
  }

  .config-table td {
    padding: 8px 12px;
    border-bottom: 1px solid rgba(48, 54, 61, 0.4);
    color: var(--text-primary, #e6edf3);
  }

  .color-picker-input {
    width: 36px;
    height: 28px;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
    padding: 0;
  }

  .config-banner.error {
    background: rgba(248, 81, 73, 0.15);
    color: #f85149;
    border: 1px solid rgba(248, 81, 73, 0.4);
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 12px;
  }

  .btn-remove-rule {
    background: transparent;
    border: none;
    color: var(--text-secondary, #8b949e);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .btn-remove-rule:hover:not(:disabled) {
    color: #f85149;
    background: rgba(248, 81, 73, 0.15);
  }

  .btn-remove-rule:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .config-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-secondary, #8b949e);
    font-size: 13px;
    padding: 40px;
  }

  .config-empty-state-sidebar {
    padding: 16px;
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
  }

  .card-header-flex {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cmap-name-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary, #e6edf3);
  }

  .cmap-name-input {
    font-weight: bold;
    width: 180px;
  }

  .banner-margin {
    margin: 12px 16px;
  }

  .mt-16 {
    margin-top: 16px;
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .card-body-flush {
    padding: 0;
  }

  .th-num { width: 50px; }
  .th-val { width: 140px; }
  .th-color { width: 50px; }
  .th-hex { width: 120px; }
  .th-action { width: 60px; }
  .stop-val-input { width: 100px; }
  .stop-hex-input { width: 90px; font-family: var(--font-mono, monospace); }
</style>
