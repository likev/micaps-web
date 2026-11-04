<script>
  import {
    formatPresetLevel,
    formatLayerLevel,
    collectItemCollapsibleKeys,
    formatItemWithFoldedKeys,
    formatJsonError,
  } from "../../ui/config/jsonFoldState.js";
  import { stopsToCSSGradient } from "../../ui/config/colormapUtils.js";
  import { t } from "../../lib/stores/i18n.svelte.js";

  let {
    itemPath,
    itemVal,
    formState,
    isUnfolded = false,
    onToggle = null,
    index = null,
    category = "preset",
    usageCount = 0,
    errors = [],
    onDuplicate = null,
    onMoveUp = null,
    onMoveDown = null,
    onDelete = null,
  } = $props();

  let foldedKeyPaths = $derived(isUnfolded ? formState.getItemFoldedKeyPaths() : new Set());
  let syntaxError = $state(null);

  // Formatted JSON text and line-to-key metadata
  let formattedResult = $state({ text: "", lineKeys: new Map() });
  let editText = $state("");
  let initializedPath = null;

  // Colormap rename state
  let cmapKey = $derived(category === "colormap" ? itemPath.replace(/^colormaps\./, "") : "");
  let renameInputVal = $state("");
  let renameError = $state(null);
  $effect(() => {
    renameInputVal = cmapKey;
    renameError = null;
  });

  function handleRenameColormap() {
    if (!renameInputVal || renameInputVal.trim() === cmapKey) return;
    const res = formState.renameColormap(cmapKey, renameInputVal.trim());
    if (!res.ok) {
      renameError = res.error;
    } else {
      renameError = null;
    }
  }

  // Initialize editor text ONLY when this item is unfolded
  $effect(() => {
    if (isUnfolded && initializedPath !== itemPath) {
      initializedPath = itemPath;
      const res = formatItemWithFoldedKeys(itemVal, formState.getItemFoldedKeyPaths());
      formattedResult = res;
      editText = res.text;
      syntaxError = null;
    } else if (!isUnfolded) {
      initializedPath = null;
    }
  });

  // Collapsible keys for Unfold Key dropdown and chips (only computed when unfolded)
  let collapsibleKeys = $derived(isUnfolded && itemVal ? collectItemCollapsibleKeys(itemVal) : []);
  let quickChipKeys = $derived.by(() => {
    if (!isUnfolded) return [];
    const seen = new Set();
    const list = [];
    for (const k of collapsibleKeys) {
      const name = k.keyName;
      if (!name || name.startsWith("[") || seen.has(name)) continue;
      seen.add(name);
      list.push(name);
    }
    return list.slice(0, 5);
  });

  function toggleUnfold(e) {
    if (e) e.stopPropagation();
    if (isUnfolded && syntaxError) {
      if (!confirm("This item contains JSON syntax errors. Folding will discard invalid edits. Fold anyway?")) {
        return;
      }
      formState.clearItemSyntaxError(itemPath);
      syntaxError = null;
    }
    if (onToggle) {
      onToggle();
    } else {
      formState.toggleItem(itemPath);
    }
  }

  function getCurrentObj() {
    try {
      if (editText) return JSON.parse(editText);
    } catch {}
    return itemVal;
  }

  function handleFoldAllKeys(e) {
    e.stopPropagation();
    const obj = getCurrentObj();
    formState.foldAllKeys();
    formattedResult = formatItemWithFoldedKeys(obj, formState.getItemFoldedKeyPaths());
    editText = formattedResult.text;
  }

  function handleUnfoldAllKeys(e) {
    e.stopPropagation();
    const obj = getCurrentObj();
    formState.unfoldAllKeys();
    formattedResult = formatItemWithFoldedKeys(obj, formState.getItemFoldedKeyPaths());
    editText = formattedResult.text;
  }

  function handleUnfoldKey(keyNameOrPath, e) {
    if (e) e.stopPropagation();
    if (!keyNameOrPath) return;
    const obj = getCurrentObj();
    formState.unfoldKey(keyNameOrPath);
    formattedResult = formatItemWithFoldedKeys(obj, formState.getItemFoldedKeyPaths());
    editText = formattedResult.text;
  }

  function handleGutterChevronClick(lineInfo, e) {
    e.stopPropagation();
    if (!lineInfo?.path) return;
    try {
      const currentObj = JSON.parse(editText);
      formState.toggleItemKeyPath(lineInfo.path);
      formattedResult = formatItemWithFoldedKeys(currentObj, formState.getItemFoldedKeyPaths());
      editText = formattedResult.text;
      formState.setItemValue(itemPath, currentObj);
    } catch {
      // If current text has syntax error, ignore chevron click
    }
  }

  function handleFormat(e) {
    if (e) e.stopPropagation();
    try {
      const parsed = JSON.parse(editText);
      syntaxError = null;
      formState.clearItemSyntaxError(itemPath);
      formattedResult = formatItemWithFoldedKeys(parsed, formState.getItemFoldedKeyPaths());
      editText = formattedResult.text;
      formState.setItemValue(itemPath, parsed);
    } catch (err) {
      const diag = formatJsonError(err.message, editText);
      syntaxError = diag;
      formState.setItemSyntaxError(itemPath, diag);
    }
  }

  function handleEditorInput(e) {
    editText = e.target.value;
    try {
      const parsed = JSON.parse(editText);
      syntaxError = null;
      formState.clearItemSyntaxError(itemPath);
      formState.setItemValue(itemPath, parsed);
    } catch (err) {
      const diag = formatJsonError(err.message, editText);
      syntaxError = diag;
      formState.setItemSyntaxError(itemPath, diag);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.target;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      editText = editText.substring(0, start) + "  " + editText.substring(end);
      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      }, 0);
    } else if (e.key === "Escape") {
      toggleUnfold();
    }
  }

  // Summary metadata computation
  let isDivider = $derived(Boolean(itemVal && itemVal.divider === true));
  let levelBadge = $derived(itemVal && !isDivider ? formatPresetLevel(itemVal) : null);
  let layerCount = $derived(Array.isArray(itemVal?.layers) ? itemVal.layers.length : null);
  let stopCount = $derived(Array.isArray(itemVal) ? itemVal.length : null);
  let stopValRange = $derived.by(() => {
    if (!Array.isArray(itemVal) || itemVal.length === 0) return null;
    const min = itemVal[0]?.val ?? "?";
    const max = itemVal[itemVal.length - 1]?.val ?? "?";
    return `${min} .. ${max}`;
  });
  let colormapGradient = $derived.by(() => {
    if (category === "colormap" && Array.isArray(itemVal)) {
      return stopsToCSSGradient(itemVal);
    }
    return null;
  });

  let lineCount = $derived(editText ? editText.split("\n").length : 1);
</script>

<div
  class="foldable-json-item"
  class:unfolded={isUnfolded}
  class:has-error={errors.length > 0 || syntaxError}
  class:is-divider={isDivider}
  data-path={itemPath}
>
  <!-- Summary Header Row -->
  <div
    class="item-header"
    role="button"
    tabindex="0"
    onclick={toggleUnfold}
    onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleUnfold(); } }}
    title={isUnfolded ? "Click to fold" : "Click to unfold & edit JSON"}
  >
    <div class="header-left">
      <span class="fold-chevron">{isUnfolded ? "▼" : "▶"}</span>

      {#if isDivider}
        <span class="divider-prefix">──</span>
        <span class="divider-label">{itemVal?.label || `Divider ${itemVal?.id || ""}`}</span>
        <span class="divider-line">──────────────────────</span>
      {:else if category === "preset"}
        <span class="item-index">{index !== null ? String(index + 1).padStart(3, "0") : ""}</span>
        <span class="json-preview">
          {`{ "id": "${itemVal?.id || ""}", "name": "${itemVal?.name || ""}" }`}
        </span>
      {:else if category === "colormap"}
        <span class="colormap-key">"{itemPath.split(".")[1] || ""}":</span>
        <span class="json-preview">[ /* {stopCount} stops */ ]</span>
        {#if colormapGradient}
          <div class="mini-gradient-bar" style:background={colormapGradient} title="Color ramp preview"></div>
        {/if}
      {:else}
        <span class="json-preview">"{itemPath}": {`{ ... }`}</span>
      {/if}
    </div>

    <div class="header-right">
      {#if itemVal?.category}
        <span class="badge category-badge">{itemVal.category}</span>
      {/if}
      {#if levelBadge}
        <span class="badge level-badge">{levelBadge}</span>
      {/if}
      {#if layerCount !== null}
        <span class="badge layer-count-badge">{layerCount} {layerCount === 1 ? "layer" : "layers"}</span>
      {/if}
      {#if stopValRange}
        <span class="badge stop-range-badge">{stopCount} stops • {stopValRange}</span>
      {/if}
      {#if usageCount > 0}
        <span class="badge usage-badge">used by {usageCount}</span>
      {/if}
      {#if errors.length > 0 || syntaxError}
        <span class="badge error-badge" title={syntaxError || errors[0]}>⚠ Error</span>
      {/if}

      <div class="header-actions" role="toolbar" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
        {#if onDuplicate}
          <button class="btn-icon" title="Duplicate item" onclick={onDuplicate}>⧉</button>
        {/if}
        {#if onMoveUp}
          <button class="btn-icon" title="Move up" onclick={onMoveUp}>↑</button>
        {/if}
        {#if onMoveDown}
          <button class="btn-icon" title="Move down" onclick={onMoveDown}>↓</button>
        {/if}
        {#if onDelete}
          <button class="btn-icon btn-danger" title="Delete item" onclick={onDelete}>✕</button>
        {/if}
      </div>
    </div>
  </div>

  <!-- Unfolded JSON Editor -->
  {#if isUnfolded}
    <div class="item-editor-container">
      <!-- Item Editor Toolbar -->
      <div class="item-toolbar">
        <div class="toolbar-left">
          <span class="toolbar-item-name">{itemPath}</span>
          <div class="key-fold-controls">
            <button
              id="btn-item-fold-all"
              class="btn-sm"
              title="Fold all nested keys to compact single lines"
              onclick={handleFoldAllKeys}
            >
              Fold All
            </button>
            <button
              id="btn-item-unfold-all"
              class="btn-sm"
              title="Unfold all nested objects (simple arrays stay on 1 line)"
              onclick={handleUnfoldAllKeys}
            >
              Unfold All
            </button>

            {#if collapsibleKeys.length > 0}
              <select
                id="sel-item-unfold-key"
                class="sel-unfold-key"
                onchange={(e) => handleUnfoldKey(e.target.value, e)}
                value=""
                title="Unfold a specific key inside this item"
              >
                <option value="" disabled>Unfold Key ▾</option>
                {#each collapsibleKeys as k}
                  <option value={k.path}>{k.label || k.path}</option>
                {/each}
              </select>

              {#if quickChipKeys.length > 0}
                <div class="quick-key-chips">
                  {#each quickChipKeys as kn}
                    <button class="chip-key" onclick={(e) => handleUnfoldKey(kn, e)}>{kn}</button>
                  {/each}
                </div>
              {/if}
            {/if}
          </div>
        </div>

        <div class="toolbar-right">
          <button
            id="btn-item-format"
            class="btn-sm btn-action"
            title="Format compact JSON (primitive arrays on single line)"
            onclick={handleFormat}
          >
            Format
          </button>
          {#if onDuplicate}
            <button class="btn-sm btn-action" title="Duplicate item" onclick={onDuplicate}>⧉ Duplicate</button>
          {/if}
          {#if onDelete}
            <button class="btn-sm btn-action btn-danger" title="Delete item" onclick={onDelete}>✕ Delete</button>
          {/if}
        </div>
      </div>

      <!-- Colormap Key Rename Bar -->
      {#if category === "colormap"}
        <div class="colormap-rename-bar">
          <span class="rename-label">Key:</span>
          <input
            class="rename-input"
            type="text"
            bind:value={renameInputVal}
            onkeydown={(e) => { if (e.key === "Enter") handleRenameColormap(); }}
            placeholder="Colormap name..."
          />
          {#if renameInputVal && renameInputVal.trim() !== cmapKey}
            <button class="btn-sm btn-rename" onclick={handleRenameColormap}>Rename Key</button>
          {/if}
          {#if renameError}
            <span class="rename-err">{renameError}</span>
          {/if}
        </div>
      {/if}

      <!-- Live Colormap Gradient Preview Bar -->
      {#if colormapGradient}
        <div class="colormap-live-bar-container">
          <span class="gradient-val-label min">{itemVal?.[0]?.val ?? "—"}</span>
          <div class="colormap-gradient-bar" style:background={colormapGradient}></div>
          <span class="gradient-val-label max">{itemVal?.[itemVal.length - 1]?.val ?? "—"}</span>
        </div>
      {/if}

      <!-- Code Editor with Line Numbers & Inline Gutter Chevrons -->
      <div class="editor-workspace">
        <div class="editor-gutter" aria-hidden="true">
          {#each Array(lineCount) as _, idx}
            {@const lineNum = idx + 1}
            {@const lineInfo = formattedResult.lineKeys.get(lineNum)}
            <div class="gutter-row">
              <span class="line-number">{lineNum}</span>
              {#if lineInfo}
                <button
                  class="gutter-chevron"
                  class:folded={lineInfo.isFolded}
                  title={`${lineInfo.isFolded ? "Unfold" : "Fold"} ${lineInfo.path}`}
                  onclick={(e) => handleGutterChevronClick(lineInfo, e)}
                >
                  {lineInfo.isFolded ? "▶" : "▼"}
                </button>
              {:else}
                <span class="gutter-spacer"></span>
              {/if}
            </div>
          {/each}
        </div>

        <textarea
          class="editor-textarea"
          rows={Math.min(30, Math.max(6, lineCount + 1))}
          spellcheck="false"
          value={editText}
          oninput={handleEditorInput}
          onkeydown={handleKeyDown}
        ></textarea>
      </div>

      <!-- Scoped Diagnostics / Error Banner -->
      {#if syntaxError || errors.length > 0}
        <div class="item-error-banner">
          {#if syntaxError}
            <div class="err-row"><strong>Syntax Error:</strong> {syntaxError}</div>
          {/if}
          {#each errors as err}
            <div class="err-row"><strong>Schema Error:</strong> {err}</div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  @import "./foldableJsonItem.css";
</style>
