<script>
  import { onDestroy } from "svelte";
  import { isDivider } from "../../config/presets.js";
  import { clonePresetGroup, cloneLayer, insertDivider, deleteDivider, moveEntry } from "../../ui/config/formState.js";
  import LayerForm from "./LayerForm.svelte";

  let { formState } = $props();

  const DEFAULT_LEVEL_OPTIONS = [
    1000, 925, 850, 700, 500, 400, 300, 250, 200, 150, 100, 70, 50, 30, 20, 10,
  ];

  let draft = $state({
    ...formState.getDraft(),
    presets: [...(formState.getDraft()?.presets || [])],
    colormaps: { ...(formState.getDraft()?.colormaps || {}) },
  });
  let searchQuery = $state("");
  let selectedId = $state(formState.getSelectedPresetId() || "");
  let expandedLayerId = $state(null);

  const unsub = formState.subscribe(() => {
    draft = {
      ...formState.getDraft(),
      presets: [...(formState.getDraft()?.presets || [])],
      colormaps: { ...(formState.getDraft()?.colormaps || {}) },
    };
    const presets = draft.presets || [];
    if (!presets.some((p) => p.id === selectedId)) {
      selectedId = presets.find((p) => !p.divider)?.id || presets[0]?.id || "";
      formState.setSelectedPresetId(selectedId);
    }
  });

  onDestroy(() => {
    unsub();
  });

  let presets = $derived(draft.presets || []);
  let colormaps = $derived(draft.colormaps || {});
  let availableColormaps = $derived(Object.keys(colormaps));

  $effect(() => {
    if (!selectedId && presets.length > 0) {
      selectedId = presets.find((p) => !p.divider)?.id || presets[0]?.id || "";
      formState.setSelectedPresetId(selectedId);
    }
  });

  let filteredPresets = $derived(
    presets.filter((p) => {
      if (isDivider(p)) return true;
      const q = searchQuery.toLowerCase();
      return (p.name || "").toLowerCase().includes(q) || (p.id || "").toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q);
    })
  );

  let selectedEntry = $derived(presets.find((p) => p.id === selectedId) || null);
  let isCurrentDivider = $derived(selectedEntry ? isDivider(selectedEntry) : false);

  function selectPreset(id) {
    selectedId = id;
    formState.setSelectedPresetId(id);
    expandedLayerId = null;
  }

  function handleAddPreset() {
    let base = "new-preset";
    let id = base;
    let seq = 1;
    while (presets.some((p) => p.id === id)) {
      id = `${base}-${seq++}`;
    }
    const newGroup = {
      id,
      name: "New Preset Group",
      category: "NWP Synoptic",
      hasLevel: true,
      defaultLevel: 500,
      layers: [],
    };
    formState.updateDraft((d) => {
      if (!d.presets) d.presets = [];
      d.presets.push(newGroup);
    });
    selectPreset(id);
  }

  function handleAddDivider() {
    formState.updateDraft((d) => {
      insertDivider(d, "Divider");
    });
  }

  function handleDuplicatePreset() {
    if (!selectedId || isCurrentDivider) return;
    formState.updateDraft((d) => {
      const res = clonePresetGroup(d, selectedId);
      if (res.ok && res.newGroup) {
        selectPreset(res.newGroup.id);
      }
    });
  }

  function handleDeletePreset() {
    if (!selectedId) return;
    if (!confirm(`Delete preset "${selectedEntry?.name || selectedId}"?`)) return;
    formState.updateDraft((d) => {
      const idx = d.presets.findIndex((p) => p.id === selectedId);
      if (idx !== -1) {
        d.presets.splice(idx, 1);
      }
    });
  }

  function handleDeleteDivider(divId) {
    formState.updateDraft((d) => {
      deleteDivider(d, divId);
    });
  }

  function handleMove(idx, delta) {
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= presets.length) return;
    formState.updateDraft((d) => {
      moveEntry(d, idx, targetIdx);
    });
  }

  function handleAddLayer() {
    if (!selectedEntry || isCurrentDivider) return;
    formState.updateDraft((d) => {
      const g = d.presets.find((p) => p.id === selectedId);
      if (!g) return;
      if (!g.layers) g.layers = [];
      let base = "layer";
      let layerId = `${g.id}-${base}-${g.layers.length + 1}`;
      const newLayer = {
        id: layerId,
        name: "New Layer",
        type: "contour",
        model: "ECMWF_HR",
        element: "TMP",
        level: g.defaultLevel || 500,
        render: {
          showLine: true,
          showFill: true,
          lineColor: "#58a6ff",
        },
      };
      g.layers.push(newLayer);
      expandedLayerId = layerId;
    });
  }

  function handleDuplicateLayer(layer) {
    if (!selectedEntry || isCurrentDivider) return;
    formState.updateDraft((d) => {
      cloneLayer(d, selectedId, layer.id, selectedId);
    });
  }

  function handleDeleteLayer(layerId) {
    formState.updateDraft((d) => {
      const g = d.presets.find((p) => p.id === selectedId);
      if (!g || !g.layers) return;
      const idx = g.layers.findIndex((l) => l.id === layerId);
      if (idx !== -1) {
        g.layers.splice(idx, 1);
        if (expandedLayerId === layerId) {
          expandedLayerId = null;
        }
      }
    });
  }

  function mutateSelectedField(field, val) {
    formState.updateDraft((d) => {
      const g = d.presets.find((p) => p.id === selectedId);
      if (g) {
        g[field] = val;
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
        placeholder="Filter presets..."
        bind:value={searchQuery}
      />
      <div class="sidebar-header-btns">
        <button
          type="button"
          class="btn btn-primary"
          title="Add new preset group"
          onclick={handleAddPreset}
        >+ Preset</button>
        <button
          type="button"
          class="btn"
          title="Add category divider"
          onclick={handleAddDivider}
        >+ Div</button>
      </div>
    </div>

    <div class="config-sidebar-list" id="presets-sidebar-mount">
      {#if filteredPresets.length === 0}
        <div class="config-empty-state config-empty-state-sidebar">
          No presets match search
        </div>
      {:else}
        {#each filteredPresets as item, idx (item.id || idx)}
          {#if isDivider(item)}
            <div
              class="sidebar-divider-item"
              class:selected={item.id === selectedId}
              onclick={() => selectPreset(item.id)}
            >
              <span class="divider-line"></span>
              <span class="divider-title">{item.label || item.id}</span>
              <span class="divider-line"></span>
            </div>
          {:else}
            <div
              class="config-sidebar-item"
              class:selected={item.id === selectedId}
              onclick={() => selectPreset(item.id)}
            >
              <div class="sidebar-item-top">
                <span class="sidebar-item-name">{item.name || item.id}</span>
                <span class="sidebar-item-chip">{item.layers?.length || 0} layers</span>
              </div>
              <div class="sidebar-item-sub">
                <span>{item.category || "General"}</span>
                {#if item.hasLevel !== false && item.defaultLevel}
                  <span>• {item.defaultLevel} hPa</span>
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  </div>

  <!-- Detail Pane -->
  <div class="config-detail-pane">
    {#if !selectedEntry}
      <div class="config-empty-state">
        <p>No presets found in configuration.</p>
        <button type="button" class="btn btn-primary mt-12" onclick={handleAddPreset}>
          + Create your first preset
        </button>
      </div>
    {:else if isCurrentDivider}
      <!-- Divider Configuration Card -->
      <div class="config-detail-content">
        <div class="config-card">
          <div class="config-card-header">
            <h3>Category Divider: {selectedEntry.id}</h3>
          </div>
          <div class="config-card-body">
            <div class="config-field">
              <label class="config-label">Divider Label</label>
              <input
                type="text"
                class="config-input"
                value={selectedEntry.label || ""}
                placeholder="Section Title (e.g. Synoptic Analysis)"
                oninput={(e) => mutateSelectedField("label", e.target.value)}
              />
            </div>
            <div class="mt-16">
              <button
                type="button"
                class="btn btn-danger"
                onclick={() => handleDeleteDivider(selectedEntry.id)}
              >
                🗑️ Delete Divider
              </button>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <!-- Preset Group Configuration -->
      <div class="config-detail-content">
        <!-- Group Header Card -->
        <div class="config-card">
          <div class="config-card-header card-header-flex">
            <div>
              <h3>{selectedEntry.name || selectedEntry.id}</h3>
              <p class="config-card-desc">Group ID: <code>{selectedEntry.id}</code></p>
            </div>
            <div class="header-actions">
              <button type="button" class="btn" onclick={handleDuplicatePreset}>
                📋 Duplicate
              </button>
              <button type="button" class="btn btn-danger" onclick={handleDeletePreset}>
                🗑️ Delete
              </button>
            </div>
          </div>

          <div class="config-card-body">
            <div class="config-form-grid">
              <div class="config-field">
                <label class="config-label">Display Name</label>
                <input
                  type="text"
                  class="config-input"
                  value={selectedEntry.name || ""}
                  placeholder="e.g. 500 hPa Height & Wind"
                  oninput={(e) => mutateSelectedField("name", e.target.value)}
                />
              </div>

              <div class="config-field">
                <label class="config-label">Category</label>
                <input
                  type="text"
                  class="config-input"
                  value={selectedEntry.category || ""}
                  placeholder="e.g. NWP Synoptic"
                  list="category-suggestions"
                  oninput={(e) => mutateSelectedField("category", e.target.value)}
                />
                <datalist id="category-suggestions">
                  <option value="NWP Synoptic"></option>
                  <option value="Surface Observation"></option>
                  <option value="Upper-Air Sounding"></option>
                  <option value="Satellite & Radar"></option>
                </datalist>
              </div>

              <div class="config-field">
                <label class="config-label">Default Isobaric Level</label>
                <select
                  class="config-select"
                  value={selectedEntry.defaultLevel || 500}
                  disabled={selectedEntry.hasLevel === false}
                  onchange={(e) => mutateSelectedField("defaultLevel", parseInt(e.target.value, 10))}
                >
                  {#each DEFAULT_LEVEL_OPTIONS as lvl}
                    <option value={lvl}>{lvl} hPa</option>
                  {/each}
                </select>
              </div>

              <div class="config-field field-center">
                <label class="config-checkbox-label label-mt-14">
                  <input
                    type="checkbox"
                    checked={selectedEntry.hasLevel !== false}
                    onchange={(e) => mutateSelectedField("hasLevel", e.target.checked)}
                  />
                  <span>Has Pressure Levels (multi-level)</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Layers List Card -->
        <div class="config-card mt-16">
          <div class="config-card-header card-header-flex">
            <div>
              <h3>Layers ({selectedEntry.layers?.length || 0})</h3>
              <p class="config-card-desc">Stacked layers rendered when this preset is loaded.</p>
            </div>
            <button type="button" class="btn btn-primary" onclick={handleAddLayer}>
              + Add Layer
            </button>
          </div>

          <div class="config-card-body card-body-p12">
            {#if !selectedEntry.layers || selectedEntry.layers.length === 0}
              <div class="config-empty-state empty-p24">
                <p>No layers in this preset group.</p>
                <button type="button" class="btn btn-primary mt-8" onclick={handleAddLayer}>
                  + Add first layer
                </button>
              </div>
            {:else}
              <div class="preset-layers-list">
                {#each selectedEntry.layers as layer (layer.id)}
                  {@const isExpanded = expandedLayerId === layer.id}
                  {@const dotColor = layer.color || layer.render?.lineColor || "#58a6ff"}
                  <div class="preset-layer-row-wrap" class:expanded={isExpanded} data-layer-id={layer.id}>
                    <div
                      class="preset-layer-row"
                      onclick={() => { expandedLayerId = isExpanded ? null : layer.id; }}
                    >
                      <div class="preset-layer-info">
                        <span class="preset-layer-dot" style:background={dotColor}></span>
                        <span class="layer-meta-name">{layer.name || layer.id}</span>
                        <span class="sidebar-item-chip type-{layer.type || 'contour'}">{layer.type || "contour"}</span>
                        <span class="layer-meta-sub">
                          {layer.model || ""}/{layer.element || ""}{layer.level ? ` (${layer.level}hPa)` : ""}{layer.derivedFrom ? ` [derived: ${layer.derivedFrom}]` : ""}
                        </span>
                      </div>

                      <div class="preset-layer-actions">
                        <button
                          type="button"
                          class="btn-row-action"
                          title="Duplicate Layer"
                          onclick={(e) => { e.stopPropagation(); handleDuplicateLayer(layer); }}
                        >📋</button>
                        <button
                          type="button"
                          class="btn-row-action btn-del"
                          title="Remove Layer"
                          onclick={(e) => { e.stopPropagation(); handleDeleteLayer(layer.id); }}
                        >✕</button>
                        <span class="layer-expand-chevron">{isExpanded ? "▼" : "▶"}</span>
                      </div>
                    </div>

                    {#if isExpanded}
                      <LayerForm
                        {layer}
                        {availableColormaps}
                        onUpdate={() => formState.touch()}
                        onDuplicate={() => handleDuplicateLayer(layer)}
                        onDelete={() => handleDeleteLayer(layer.id)}
                      />
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
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
    flex-direction: column;
    gap: 8px;
    border-bottom: 1px solid var(--border-color, #30363d);
  }

  .config-search {
    width: 100%;
    box-sizing: border-box;
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

  .sidebar-divider-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.2);
    cursor: pointer;
  }

  .sidebar-divider-item.selected {
    background: rgba(88, 166, 255, 0.1);
  }

  .divider-line {
    flex: 1;
    height: 1px;
    background: var(--border-color, #30363d);
  }

  .divider-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary, #8b949e);
    text-transform: uppercase;
  }

  .sidebar-item-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .sidebar-item-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary, #e6edf3);
  }

  .sidebar-item-sub {
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
    display: flex;
    gap: 6px;
  }

  .sidebar-item-chip {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 10px;
    background: rgba(110, 118, 129, 0.2);
    color: var(--text-secondary, #8b949e);
  }

  .sidebar-item-chip.type-contour {
    color: #58a6ff;
  }

  .sidebar-item-chip.type-wind {
    color: #3fb950;
  }

  .sidebar-item-chip.type-station {
    color: #d29922;
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
    font-size: 14px;
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

  .preset-meta-grid {
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

  .config-checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-primary, #e6edf3);
    cursor: pointer;
  }

  .preset-layers-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .preset-layer-row-wrap {
    border: 1px solid var(--border-color, #30363d);
    border-radius: 6px;
    overflow: hidden;
    background: var(--bg-primary, #0d1117);
  }

  .preset-layer-row {
    padding: 10px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .preset-layer-row:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .preset-layer-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .preset-layer-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }

  .layer-meta-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary, #e6edf3);
  }

  .layer-meta-sub {
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
  }

  .preset-layer-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-row-action {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 4px;
    border-radius: 4px;
    color: var(--text-secondary, #8b949e);
  }

  .btn-row-action:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-primary, #e6edf3);
  }

  .btn-row-action.btn-del:hover {
    color: #f85149;
    background: rgba(248, 81, 73, 0.15);
  }

  .layer-expand-chevron {
    font-size: 10px;
    color: var(--text-secondary, #8b949e);
    margin-left: 4px;
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

  .sidebar-header-btns {
    display: flex;
    gap: 4px;
  }

  .config-empty-state-sidebar {
    padding: 16px;
    font-size: 11px;
  }

  .card-header-flex {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .mt-12 {
    margin-top: 12px;
  }

  .mt-16 {
    margin-top: 16px;
  }

  .mt-8 {
    margin-top: 8px;
  }

  .field-center {
    justify-content: center;
  }

  .label-mt-14 {
    margin-top: 14px;
  }

  .card-body-p12 {
    padding: 12px;
  }

  .empty-p24 {
    padding: 24px;
  }
</style>
