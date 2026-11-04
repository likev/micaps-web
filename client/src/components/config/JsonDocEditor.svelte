<script>
  import FoldableJsonItem from "./FoldableJsonItem.svelte";
  import { getColormapUsageCounts } from "../../ui/config/colormapUtils.js";
  import { formatCompactJSON } from "../../config/presets.js";
  import { clonePresetGroup, insertDivider, moveEntry } from "../../ui/config/formState.js";
  import { t } from "../../lib/stores/i18n.svelte.js";

  let { formState, activeTab = "config" } = $props();

  let revision = $state(0);
  let unfoldedPath = $state(formState.getUnfoldedItemPath());

  $effect(() => {
    let initial = true;
    return formState.subscribe(() => {
      if (initial) {
        initial = false;
        return;
      }
      revision++;
      unfoldedPath = formState.getUnfoldedItemPath();
    });
  });

  let prevTab = activeTab;
  $effect(() => {
    if (activeTab !== prevTab) {
      prevTab = activeTab;
      unfoldedPath = null;
      formState.foldAll();
    }
  });

  let searchQuery = $state("");
  let viewMode = $state("folded"); // "folded" | "raw"
  let rawText = $state("");
  let rawSyntaxError = $state(null);

  let configDraft = $derived(revision >= 0 ? formState.getConfigDraft() : null);
  let colormapsDraft = $derived(revision >= 0 ? formState.getColormapsDraft() : null);
  let validation = $derived(revision >= 0 ? formState.getValidation() : null);
  let usageCounts = $derived(getColormapUsageCounts(configDraft));

  // Sync raw text when switching to raw view mode or when drafts change
  $effect(() => {
    if (viewMode === "raw") {
      const activeObj = activeTab === "colormaps" ? colormapsDraft : configDraft;
      rawText = formatCompactJSON(activeObj);
      rawSyntaxError = null;
    }
  });

  function syncRaw(text, format = false) {
    try {
      const parsed = JSON.parse(text);
      rawSyntaxError = null;
      if (format) rawText = formatCompactJSON(parsed);
      if (activeTab === "colormaps") formState.setColormapsDraft(parsed);
      else formState.setConfigDraft(parsed);
    } catch (err) {
      rawSyntaxError = err.message;
    }
  }
  function handleRawInput(e) { rawText = e.target.value; syncRaw(rawText); }
  function handleRawFormat() { syncRaw(rawText, true); }

  function toggleViewMode() {
    if (viewMode === "folded") {
      viewMode = "raw";
    } else {
      if (rawSyntaxError && !confirm("Raw JSON contains syntax errors. Discard invalid edits and switch to Folded Items?")) {
        return;
      }
      viewMode = "folded";
    }
  }

  // Filter logic
  let filteredPresets = $derived.by(() => {
    const list = (configDraft.presets || []).map((p, idx) => ({ preset: p, originalIndex: idx }));
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(({ preset: p }) => {
      if (p.divider) {
        return (p.label && p.label.toLowerCase().includes(q)) || (p.id && p.id.toLowerCase().includes(q));
      }
      const matchId = p.id && p.id.toLowerCase().includes(q);
      const matchName = p.name && p.name.toLowerCase().includes(q);
      const matchZh = p.name_zh && p.name_zh.toLowerCase().includes(q);
      const matchEn = p.name_en && p.name_en.toLowerCase().includes(q);
      const matchCat = p.category && p.category.toLowerCase().includes(q);
      const matchLayer = Array.isArray(p.layers) && p.layers.some((l) =>
        (l.id && l.id.toLowerCase().includes(q)) ||
        (l.model && l.model.toLowerCase().includes(q)) ||
        (l.element && l.element.toLowerCase().includes(q)) ||
        (l.renderRef && l.renderRef.toLowerCase().includes(q))
      );
      return matchId || matchName || matchZh || matchEn || matchCat || matchLayer;
    });
  });

  let filteredColormaps = $derived.by(() => {
    const keys = Object.keys(colormapsDraft || {});
    const q = searchQuery.trim().toLowerCase();
    if (!q) return keys;
    return keys.filter((k) => k.toLowerCase().includes(q));
  });

  let filteredProfiles = $derived.by(() => {
    const keys = Object.keys(configDraft.renderProfiles || {});
    const q = searchQuery.trim().toLowerCase();
    if (!q) return keys;
    return keys.filter((k) => k.toLowerCase().includes(q));
  });

  // Action handlers
  function handleToggleItem(path) {
    if (unfoldedPath === path) {
      unfoldedPath = null;
      formState.foldAll();
    } else {
      unfoldedPath = path;
      formState.unfoldItem(path);
    }
  }

  function handleFoldAll() {
    formState.foldAll();
    unfoldedPath = null;
  }

  function handleAddPreset() {
    formState.updateDraft((draft) => {
      if (!Array.isArray(draft.presets)) draft.presets = [];
      const newId = `preset-custom-${Date.now().toString().slice(-4)}`;
      draft.presets.push({
        id: newId,
        name: "New Custom Preset",
        name_zh: "新建自定义数据集",
        name_en: "New Custom Preset",
        category: "Custom",
        category_zh: "自定义",
        category_en: "Custom",
        hasLevel: false,
        layers: [],
      });
    });
    const newIdx = (formState.getConfigDraft().presets || []).length - 1;
    const newPath = `presets.${newIdx}`;
    formState.unfoldItem(newPath);
    unfoldedPath = newPath;
  }

  function handleAddDivider() {
    formState.updateDraft((draft) => { insertDivider(draft, -1, "Category Section"); });
    const newIdx = (formState.getConfigDraft().presets || []).length - 1;
    const newPath = `presets.${newIdx}`;
    formState.unfoldItem(newPath);
    unfoldedPath = newPath;
  }

  function handleAddColormap() {
    let baseName = "NEW_COLORMAP";
    let counter = 1;
    let name = baseName;
    while (colormapsDraft[name]) name = `${baseName}_${counter++}`;
    formState.updateDraft((draft) => {
      if (!draft.colormaps) draft.colormaps = {};
      draft.colormaps[name] = [
        { val: 0, color: [40, 100, 230, 255] },
        { val: 50, color: [240, 240, 240, 255] },
        { val: 100, color: [230, 50, 40, 255] },
      ];
    });
    const newPath = `colormaps.${name}`;
    formState.unfoldItem(newPath);
    unfoldedPath = newPath;
  }

  function handleAddProfile() {
    let baseName = "contour-custom";
    let counter = 1;
    let name = baseName;
    while (configDraft.renderProfiles && configDraft.renderProfiles[name]) name = `${baseName}-${counter++}`;
    formState.updateDraft((draft) => {
      if (!draft.renderProfiles) draft.renderProfiles = {};
      draft.renderProfiles[name] = { showLine: true, lineColor: "#58a6ff", lineWidth: 1.5, showFill: false };
    });
    const newPath = `renderProfiles.${name}`;
    formState.unfoldItem(newPath);
    unfoldedPath = newPath;
  }

  function handleDuplicatePreset(sourceId) {
    formState.updateDraft((draft) => {
      clonePresetGroup(draft, sourceId);
    });
    const idx = (formState.getConfigDraft().presets || []).findIndex((p) => p.id === `${sourceId}-copy`);
    if (idx !== -1) {
      const newPath = `presets.${idx}`;
      formState.unfoldItem(newPath);
      unfoldedPath = newPath;
    }
  }

  function handleMovePreset(fromIdx, toIdx) {
    formState.updateDraft((draft) => {
      moveEntry(draft, fromIdx, toIdx);
    });
    if (unfoldedPath === `presets.${fromIdx}`) {
      const newPath = `presets.${toIdx}`;
      formState.unfoldItem(newPath);
      unfoldedPath = newPath;
    }
  }

  function handleDeletePreset(idx) {
    formState.deleteItem(`presets.${idx}`);
    if (unfoldedPath === `presets.${idx}`) {
      unfoldedPath = null;
    }
  }

  function handleDuplicateColormap(srcName) {
    const stops = colormapsDraft[srcName];
    if (!stops) return;
    let newName = `${srcName}_COPY`;
    let counter = 2;
    while (colormapsDraft[newName]) {
      newName = `${srcName}_COPY_${counter++}`;
    }
    formState.updateDraft((draft) => {
      if (!draft.colormaps) draft.colormaps = {};
      draft.colormaps[newName] = JSON.parse(JSON.stringify(stops));
    });
    const newPath = `colormaps.${newName}`;
    formState.unfoldItem(newPath);
    unfoldedPath = newPath;
  }

  function handleDeleteColormap(name) {
    const count = usageCounts[name] || 0;
    if (count > 0) {
      if (!confirm(`Colormap "${name}" is referenced by ${count} layers. Are you sure you want to delete it?`)) {
        return;
      }
    }
    formState.deleteItem(`colormaps.${name}`);
    if (unfoldedPath === `colormaps.${name}`) {
      unfoldedPath = null;
    }
  }
</script>

<div class="json-doc-editor">
  <!-- Document Controls Header -->
  <div class="doc-controls-bar">
    <div class="filter-group">
      <span class="search-icon">🔍</span>
      <input
        type="search"
        class="search-input"
        placeholder="Filter items (id, name, category, model, element, key)..."
        bind:value={searchQuery}
      />
      {#if searchQuery}
        <button class="btn-clear-search" onclick={() => searchQuery = ""}>✕</button>
      {/if}
    </div>

    <div class="doc-actions-group">
      {#if viewMode === "folded"}
        <button
          id="btn-config-fold-all"
          class="btn-control"
          title="Fold all items to compact 1-line view"
          onclick={handleFoldAll}
        >
          Fold All
        </button>

        {#if activeTab === "config"}
          <button class="btn-control btn-accent" onclick={handleAddPreset}>+ Add Preset</button>
          <button class="btn-control" onclick={handleAddDivider}>+ Divider</button>
          <button class="btn-control" onclick={handleAddProfile}>+ Profile</button>
        {:else if activeTab === "colormaps"}
          <button class="btn-control btn-accent" onclick={handleAddColormap}>+ New Colormap</button>
        {/if}
      {/if}

      <button
        class="btn-control btn-mode-toggle"
        class:active={viewMode === "raw"}
        title="Toggle between Folded Items accordion and Raw JSON file editor"
        onclick={toggleViewMode}
      >
        {viewMode === "raw" ? "⟨⟩ Folded Items" : "⟨⟩ Raw JSON"}
      </button>
    </div>
  </div>

  <!-- Main Document Body -->
  <div class="doc-body-scroll">
    {#if viewMode === "raw"}
      <div class="raw-json-editor-pane">
        <div class="raw-json-toolbar">
          <span class="raw-title">{activeTab === "colormaps" ? "colormaps.json" : "config.json"} (Full File)</span>
          <button id="btn-config-json-format" class="btn-control btn-sm" onclick={handleRawFormat}>
            Format JSON
          </button>
        </div>
        <textarea
          id="config-json-textarea"
          class="raw-json-textarea"
          spellcheck="false"
          value={rawText}
          oninput={handleRawInput}
        ></textarea>
        {#if rawSyntaxError}
          <div class="raw-error-banner">
            <strong>JSON Syntax Error:</strong> {rawSyntaxError}
          </div>
        {/if}
      </div>
    {:else if activeTab === "config"}
      <!-- Config.json Sections -->
      <div class="doc-json-items-container">
        <!-- Top-level blocks: Basemap & Performance -->
        {#if configDraft?.basemap && !searchQuery}
          <FoldableJsonItem
            itemPath="basemap"
            itemVal={configDraft.basemap}
            {formState}
            isUnfolded={unfoldedPath === "basemap"}
            onToggle={() => handleToggleItem("basemap")}
            category="basemap"
          />
        {/if}

        {#if configDraft?.performance && !searchQuery}
          <FoldableJsonItem
            itemPath="performance"
            itemVal={configDraft.performance}
            {formState}
            isUnfolded={unfoldedPath === "performance"}
            onToggle={() => handleToggleItem("performance")}
            category="performance"
          />
        {/if}

        <!-- Presets Section Header -->
        <div class="section-divider-header">
          <span class="section-title">"presets" [ {configDraft?.presets?.length || 0} items ]</span>
          {#if filteredPresets.length !== (configDraft?.presets?.length || 0)}
            <span class="filter-count">Showing {filteredPresets.length} matching</span>
          {/if}
        </div>

        <!-- Presets List -->
        {#each filteredPresets as { preset, originalIndex } (preset.id || `preset-${originalIndex}`)}
          {@const pPath = `presets.${originalIndex}`}
          {@const pErrors = validation?.presetErrors?.get(preset.id) || []}
          <FoldableJsonItem
            itemPath={pPath}
            itemVal={preset}
            {formState}
            isUnfolded={unfoldedPath === pPath}
            onToggle={() => handleToggleItem(pPath)}
            index={originalIndex}
            category="preset"
            errors={pErrors}
            onDuplicate={() => handleDuplicatePreset(preset.id)}
            onMoveUp={originalIndex > 0 ? () => handleMovePreset(originalIndex, originalIndex - 1) : null}
            onMoveDown={originalIndex < (configDraft?.presets?.length || 0) - 1 ? () => handleMovePreset(originalIndex, originalIndex + 1) : null}
            onDelete={() => handleDeletePreset(originalIndex)}
          />
        {/each}

        <!-- Shared RenderProfiles Section Header -->
        {#if configDraft?.renderProfiles && Object.keys(configDraft.renderProfiles).length > 0}
          <div class="section-divider-header">
            <span class="section-title">"renderProfiles" [ {Object.keys(configDraft.renderProfiles).length} profiles ]</span>
          </div>
          {#each filteredProfiles as profKey (profKey)}
            {@const profVal = configDraft.renderProfiles[profKey]}
            {@const profPath = `renderProfiles.${profKey}`}
            <FoldableJsonItem
              itemPath={profPath}
              itemVal={profVal}
              {formState}
              isUnfolded={unfoldedPath === profPath}
              onToggle={() => handleToggleItem(profPath)}
              category="renderProfile"
              onDelete={() => formState.deleteItem(profPath)}
            />
          {/each}
        {/if}
      </div>
    {:else if activeTab === "colormaps"}
      <!-- Colormaps.json Entries -->
      <div class="doc-json-items-container">
        <div class="section-divider-header">
          <span class="section-title">"colormaps.json" [ {Object.keys(colormapsDraft || {}).length} color ramps ]</span>
          {#if filteredColormaps.length !== Object.keys(colormapsDraft || {}).length}
            <span class="filter-count">Showing {filteredColormaps.length} matching</span>
          {/if}
        </div>

        {#each filteredColormaps as cmapName (cmapName)}
          {@const stops = colormapsDraft[cmapName]}
          {@const cmapErrors = validation?.colormapErrors?.get(cmapName) || []}
          {@const usedCount = usageCounts[cmapName] || 0}
          {@const cmapPath = `colormaps.${cmapName}`}
          <FoldableJsonItem
            itemPath={cmapPath}
            itemVal={stops}
            {formState}
            isUnfolded={unfoldedPath === cmapPath}
            onToggle={() => handleToggleItem(cmapPath)}
            category="colormap"
            usageCount={usedCount}
            errors={cmapErrors}
            onDuplicate={() => handleDuplicateColormap(cmapName)}
            onDelete={() => handleDeleteColormap(cmapName)}
          />
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .json-doc-editor {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    background: var(--bg-primary, #0d1117);
  }

  .doc-controls-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: var(--bg-secondary, #161b22);
    border-bottom: 1px solid var(--border-color, #21262d);
    flex-wrap: wrap;
    gap: 8px 12px;
    flex-shrink: 0;
  }

  .filter-group {
    display: flex;
    align-items: center;
    background: var(--bg-primary, #0d1117);
    border: 1px solid var(--border-color, #30363d);
    border-radius: 6px;
    padding: 3px 8px;
    flex: 1;
    max-width: 480px;
    min-width: 220px;
    gap: 6px;
  }
  .search-icon { font-size: 11px; color: var(--text-secondary, #8b949e); }
  .search-input { border: none; outline: none; background: transparent; color: var(--text-primary, #e6edf3); font-size: 11px; width: 100%; }
  .btn-clear-search { background: none; border: none; color: var(--text-secondary, #8b949e); cursor: pointer; font-size: 10px; padding: 0 2px; }
  .doc-actions-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .btn-control {
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 6px;
    background: var(--bg-card, #21262d);
    border: 1px solid var(--border-color, #30363d);
    color: var(--text-primary, #e6edf3);
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, border-color 0.15s;
  }
  .btn-control:hover { background: var(--bg-hover, rgba(255, 255, 255, 0.08)); border-color: #58a6ff; }
  .btn-control.btn-accent { background: rgba(35, 134, 54, 0.2); border-color: rgba(46, 160, 67, 0.4); color: #3fb950; }
  .btn-control.btn-accent:hover { background: rgba(35, 134, 54, 0.35); border-color: #3fb950; }
  .btn-control.btn-mode-toggle.active { background: rgba(88, 166, 255, 0.2); border-color: #58a6ff; color: #58a6ff; }

  .doc-body-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
    scrollbar-width: thin;
  }

  .doc-json-items-container {
    max-width: 1400px;
    margin: 0 auto;
  }

  .section-divider-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 4px 4px 4px;
    margin-top: 10px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--border-color, #21262d);
    font-family: var(--font-mono, monospace);
    font-size: 11px;
  }
  .section-title {
    color: #58a6ff;
    font-weight: 600;
  }
  .filter-count {
    color: var(--text-secondary, #8b949e);
    font-size: 10px;
  }

  /* Raw JSON Editor Pane */
  .raw-json-editor-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 480px;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 6px;
    background: var(--bg-primary, #0d1117);
    overflow: hidden;
  }
  .raw-json-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    background: var(--bg-secondary, #161b22);
    border-bottom: 1px solid var(--border-color, #21262d);
  }
  .raw-title {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
  }
  .raw-json-textarea {
    flex: 1;
    padding: 12px;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-primary, #e6edf3);
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    line-height: 19px;
    resize: none;
    tab-size: 2;
    white-space: pre;
  }
  .raw-error-banner {
    padding: 8px 12px;
    background: rgba(248, 81, 73, 0.15);
    border-top: 1px solid rgba(248, 81, 73, 0.3);
    color: #f85149;
    font-size: 11px;
    font-family: var(--font-mono, monospace);
  }
</style>
