<script>
  import { ui } from "../lib/stores/ui.svelte.js";
  import { tabsState } from "../lib/stores/tabs.svelte.js";
  import { isProfilePanelWindow, isSurfaceWindow, isUpperAirWindow } from "../lib/services/appWorkflow.js";

  let {
    tabs = tabsState.tabs,
    windows = [],
    activeWinIdx = 0,
    activeTabId = tabsState.activeTabId,
    layout = "1x1",
    syncMap = true,
    autoAllocation = "none",
    onSelectTab = null,
    onSelectWin = null,
    onAddTab = null,
    onAddWin = null,
    onCloseTab = null,
    onCloseWin = null,
    onReorder = null,
    onChangeLayout = null,
    onToggleSync = null,
    onSelectAutoAlloc = null,
    onToggleAutoAlloc = null,
    isMaximizedPreview = false,
    onPinWin = null,
    onCollapseGroup = null,
    onRestorePreview = null,
  } = $props();

  let draggedIndex = $state(null);
  // Live insert position while dragging: dragOverIndex is the pill under the
  // cursor, dropAfter selects its left/right half. The vertical indicator
  // renders at insert slot p = dropAfter ? dragOverIndex + 1 : dragOverIndex.
  let dragOverIndex = $state(null);
  let dropAfter = $state(false);

  let tabItems = $derived(
    windows && windows.length > 0
      ? windows
      : (tabs && tabs[0]?.windows && tabs[0].windows.length > 0 ? tabs[0].windows : tabs)
  );

  let activeWindow = $derived(
    windows && windows.length > 0
      ? (windows[activeWinIdx] || windows[0] || null)
      : (tabs && tabs[0]?.windows ? (tabs[0].windows[activeWinIdx] || tabs[0].windows[0] || null) : null)
  );
  let isProfile = $derived(Boolean(activeWindow && isProfilePanelWindow(activeWindow)));
  let isSurface = $derived(Boolean(activeWindow && isSurfaceWindow(activeWindow)));
  let isUpperAir = $derived(Boolean(activeWindow && isUpperAirWindow(activeWindow)));
  let isObs = $derived(Boolean(isSurface || isUpperAir || activeWindow?.isObservation || activeWindow?.activeGroup?.isObservation));
  let allocDisabled = $derived(layout !== "1x1" || isProfile);
  let allocTitle = $derived(
    isProfile
      ? "Auto-Allocation is disabled for profile panel products"
      : (layout !== "1x1"
        ? "Auto-Allocation can only be selected in tab-mode before splitting"
        : (isSurface
          ? "Auto-Allocation (multi-time-contrast only for Surface)"
          : (isUpperAir
            ? "Auto-Allocation (multi-time-contrast and multi-level-contrast for Upper-Air)"
            : "Auto-Allocation mode across split windows")))
  );
  let effectiveAlloc = $derived.by(() => {
    if (isProfile) return "none";
    const cur = typeof autoAllocation === "string" ? autoAllocation : (autoAllocation ? "level" : "none");
    if (isSurface && (cur === "step" || cur === "level" || cur === "model")) return "none";
    if (isUpperAir && (cur === "step" || cur === "model")) return "none";
    return cur;
  });

  $effect(() => {
    if (layout === "1x1" && effectiveAlloc === "none" && autoAllocation && autoAllocation !== "none") {
      if (onSelectAutoAlloc) onSelectAutoAlloc("none");
      else if (onToggleAutoAlloc) onToggleAutoAlloc("none");
    }
  });

  let hasAutoAllocGroup = $derived(
    Boolean(tabItems && tabItems.some((w) => w && w.isAutoAllocated && !w.isPinned))
  );
  let contrastInitiatorId = $derived.by(() => {
    if (!hasAutoAllocGroup || !tabItems) return null;
    const child = tabItems.find((w) => w && w.isAutoAllocated && !w.isPinned && w.allocParentId);
    if (child?.allocParentId) return child.allocParentId;
    const firstNonAlloc = tabItems.find((w) => w && (!w.isAutoAllocated || w.isPinned));
    return firstNonAlloc?.id || null;
  });
  let firstGroupIdx = $derived.by(() => {
    if (!hasAutoAllocGroup || !tabItems) return -1;
    return tabItems.findIndex(
      (w) => w && ((w.id && w.id === contrastInitiatorId) || (w.isAutoAllocated && !w.isPinned))
    );
  });
  let lastGroupIdx = $derived.by(() => {
    if (!hasAutoAllocGroup || !tabItems) return -1;
    for (let i = tabItems.length - 1; i >= 0; i--) {
      const w = tabItems[i];
      if (w && ((w.id && w.id === contrastInitiatorId) || (w.isAutoAllocated && !w.isPinned))) {
        return i;
      }
    }
    return -1;
  });

  function pinItem(e, item) {
    e.stopPropagation();
    if (onPinWin) onPinWin(item);
  }

  function collapseGroup(e) {
    e.stopPropagation();
    if (onCollapseGroup) onCollapseGroup();
  }

  function selectItem(item, idx) {
    ui.configOpen = false;
    if (onSelectWin) {
      onSelectWin(item);
    } else if (onSelectTab) {
      onSelectTab(item.id ?? idx);
    }
  }

  function addItem() {
    if (onAddWin) {
      onAddWin();
    } else if (onAddTab) {
      onAddTab();
    }
  }

  function closeItem(e, item, idx) {
    e.stopPropagation();
    if (onCloseWin) {
      onCloseWin(item);
    } else if (onCloseTab) {
      onCloseTab(item.id ?? idx);
    }
  }

  function setLayout(l) {
    if (onChangeLayout) onChangeLayout(l);
  }

  // Insert slot p in current render coordinates (0..n, n = append at end).
  let insertP = $derived(
    dragOverIndex === null ? null : (dropAfter ? dragOverIndex + 1 : dragOverIndex)
  );

  // Post-removal splice index for App.handleReorderWindows: removing `from`
  // first shifts later slots down by one, so `to = from < p ? p - 1 : p`.
  let insertTo = $derived(
    insertP === null || draggedIndex === null
      ? null
      : (draggedIndex < insertP ? insertP - 1 : insertP)
  );

  // Hide the indicator when the slot is a no-op (would land back on itself).
  let showIndicator = $derived(insertTo !== null && insertTo !== draggedIndex);

  function clearDragState() {
    draggedIndex = null;
    dragOverIndex = null;
    dropAfter = false;
  }

  function handleDragStart(event, idx) {
    draggedIndex = idx;
    dragOverIndex = null;
    dropAfter = false;
    event.dataTransfer?.setData("text/plain", String(idx));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(event, idx) {
    if (draggedIndex === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    // Left/right half of the pill selects insert-before / insert-after.
    const target = event.currentTarget;
    let after = false;
    if (target && typeof target.getBoundingClientRect === "function" && typeof event.clientX === "number") {
      const rect = target.getBoundingClientRect();
      if (rect.width > 0) after = event.clientX - rect.left > rect.width / 2;
    }
    dragOverIndex = idx;
    dropAfter = after;
  }

  function handleDrop(event, idx) {
    event.preventDefault();
    event.stopPropagation();
    const encoded = event.dataTransfer?.getData("text/plain");
    const from = encoded === "" || encoded === undefined ? draggedIndex : parseInt(encoded, 10);
    if (Number.isInteger(from) && onReorder) {
      // Prefer the indicator slot when the pointer hovered one; otherwise
      // fall back to dropping onto the pill (insert before it).
      let to = idx;
      if (dragOverIndex !== null && insertTo !== null) {
        to = insertTo;
      } else if (from < idx) {
        to = idx - 1;
      }
      if (to !== from) onReorder(from, to);
    }
    clearDragState();
  }

  // Dropping on the list's empty padding appends at the end.
  function handleListDragOver(event) {
    if (draggedIndex === null) return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    dragOverIndex = tabItems.length - 1;
    dropAfter = true;
  }

  function handleListDrop(event) {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    const encoded = event.dataTransfer?.getData("text/plain");
    const from = encoded === "" || encoded === undefined ? draggedIndex : parseInt(encoded, 10);
    if (Number.isInteger(from) && onReorder && tabItems.length > 0) {
      const to = from < tabItems.length - 1 ? tabItems.length - 1 : from;
      if (to !== from) onReorder(from, to);
    }
    clearDragState();
  }

  function handleDragEnd() {
    clearDragState();
  }

  function handleDragLeave(event) {
    // Leaving the tabs strip entirely hides the indicator; entering
    // another pill re-arms it via handleDragOver.
    if (event.target && event.currentTarget && !event.currentTarget.contains(event.relatedTarget)) {
      dragOverIndex = null;
      dropAfter = false;
    }
  }
</script>

<div id="tabs-bar" class="tabs-bar" role="tablist" aria-label="Workstation Tabs and Layout">
  <div
    class="tabs-list"
    id="tabs-list"
    ondragover={handleListDragOver}
    ondrop={handleListDrop}
    ondragleave={handleDragLeave}
  >
    {#each tabItems as item, idx (item.id || idx)}
      {#if showIndicator && insertP === idx}
        <div class="drop-indicator" aria-hidden="true"></div>
      {/if}
      {#if hasAutoAllocGroup && idx === firstGroupIdx}
        <span
          class="contrast-group-badge"
          id="contrast-group-badge"
          title="Active Split Auto-Contrast Group"
        >
          ⊞ {layout !== "1x1" ? layout : "Split"} · {autoAllocation && autoAllocation !== "none" ? autoAllocation.toUpperCase() : String(item.allocMode || "CONTRAST").toUpperCase()}
        </span>
      {/if}
      <div
        id={item.pillId || `tab-item-win-${item.uid ?? item.winIdx ?? idx}`}
        class="tab-item"
        class:active={(item.winIdx ?? idx) === activeWinIdx && !ui.configOpen}
        class:dragging={draggedIndex === idx}
        class:contrast-initiator={hasAutoAllocGroup && item.id === contrastInitiatorId}
        class:contrast-child={Boolean(item.isAutoAllocated && !item.isPinned)}
        class:contrast-pinned={Boolean(item.isPinned)}
        role="tab"
        aria-selected={(item.winIdx ?? idx) === activeWinIdx && !ui.configOpen}
        tabindex="0"
        title={item.isAutoAllocated && !item.isPinned
          ? `Auto-allocated contrast slot (${item.allocBadgeText || item.allocMode || "contrast"}). Click 📌 to keep permanently.`
          : "Drag to rearrange"}
        draggable="true"
        ondragstart={(e) => handleDragStart(e, idx)}
        ondragover={(e) => handleDragOver(e, idx)}
        ondrop={(e) => handleDrop(e, idx)}
        ondragend={handleDragEnd}
        onclick={() => selectItem(item, item.winIdx ?? idx)}
        onkeydown={(e) => e.key === "Enter" && selectItem(item, item.winIdx ?? idx)}
      >
        {#if hasAutoAllocGroup && item.id === contrastInitiatorId}
          <span class="tab-initiator-star" title="Split Contrast Initiator Tab" aria-hidden="true">★</span>
        {/if}
        {#if item.allocBadgeText && (item.isAutoAllocated || (hasAutoAllocGroup && item.id === contrastInitiatorId))}
          <span class="tab-alloc-chip">{item.allocBadgeText}</span>
        {/if}
        <span class="tab-label" id={item.labelId || `tab-label-${item.uid ?? item.winIdx ?? idx}`}>
          {(() => {
            const raw = item.title ? String(item.title).replace(/^W\d+:\s*/, "") : "";
            return raw ? `W${(item.winIdx ?? idx) + 1}: ${raw}` : `Tab ${(item.winIdx ?? idx) + 1}`;
          })()}
        </span>
        {#if item.isAutoAllocated && !item.isPinned && onPinWin}
          <button
            type="button"
            id={`tab-pin-${item.uid ?? item.winIdx ?? idx}`}
            class="tab-pin-btn"
            title="Pin as permanent independent tab (Alt+P)"
            aria-label="Pin Tab"
            onclick={(e) => pinItem(e, item)}
          >📌</button>
        {/if}
        {#if tabItems.length > 1}
          <button
            type="button"
            id={item.closeBtnId || `tab-close-${item.uid ?? item.winIdx ?? idx}`}
            class="tab-close-btn"
            title="Close Tab"
            aria-label="Close Tab"
            onclick={(e) => closeItem(e, item, item.winIdx ?? idx)}
          >×</button>
        {/if}
      </div>
      {#if hasAutoAllocGroup && idx === lastGroupIdx && onCollapseGroup}
        <button
          type="button"
          id="btn-collapse-contrast-group"
          class="btn-collapse-group"
          title="Collapse split contrast group and remove auto-allocated tabs (Shift+F4)"
          aria-label="Collapse Contrast Group"
          onclick={collapseGroup}
        >✕ Collapse</button>
      {/if}
    {/each}
    {#if showIndicator && insertP === tabItems.length}
      <div class="drop-indicator" aria-hidden="true"></div>
    {/if}

    {#if ui.configOpen}
      <div
        id="tab-item-config"
        class="tab-item tab-item-config active"
        role="tab"
        aria-selected="true"
        tabindex="0"
        onclick={() => (ui.configOpen = true)}
        onkeydown={(e) => e.key === "Enter" && (ui.configOpen = true)}
      >
        <span class="tab-label">⚙ Config</span>
        <button
          type="button"
          class="tab-close-btn"
          id="btn-close-config-tab"
          title="Close Configuration Editor"
          aria-label="Close Config Tab"
          onclick={(e) => {
            e.stopPropagation();
            ui.configOpen = false;
          }}
        >✕</button>
      </div>
    {/if}

    <button
      id="btn-add-tab"
      type="button"
      class="btn-add-tab"
      title="Add new tab"
      aria-label="Add new tab"
      onclick={addItem}
    >+</button>

    {#if isMaximizedPreview && layout !== "1x1" && onRestorePreview}
      <button
        id="btn-restore-split-preview"
        type="button"
        class="btn-restore-preview"
        title="Return to {layout} split grid (F4)"
        onclick={() => onRestorePreview && onRestorePreview()}
      >⊞ Return to {layout} Split</button>
    {/if}
  </div>

  <div class="layout-controls" id="layout-controls">
    <div
      class="auto-alloc-container"
      title={allocTitle}
    >
      <label for="sel-auto-alloc" class="alloc-label">Alloc:</label>
      <select
        id="sel-auto-alloc"
        data-testid="sel-auto-alloc"
        class="layout-select"
        class:active={effectiveAlloc && effectiveAlloc !== "none"}
        disabled={allocDisabled}
        title={allocTitle}
        value={effectiveAlloc}
        onchange={(e) => {
          const val = e.currentTarget.value;
          if (isSurface && (val === "step" || val === "level" || val === "model")) return;
          if (isUpperAir && (val === "step" || val === "model")) return;
          if (onSelectAutoAlloc) onSelectAutoAlloc(val);
          else if (onToggleAutoAlloc) onToggleAutoAlloc(val);
        }}
      >
        <option value="none">none</option>
        <option value="time">{isObs ? "multi-time-contrast" : "multi-init-contrast"}</option>
        <option value="step" disabled={isSurface || isUpperAir}>multi-step-contrast</option>
        <option value="level" disabled={isSurface}>multi-level-contrast</option>
        <option value="model" disabled={isSurface || isUpperAir}>multi-model-contrast</option>
      </select>
    </div>

    <label for="btn-layout-select" class="layout-label">Layout:</label>
    <select
      id="btn-layout-select"
      data-testid="btn-layout-select"
      class="layout-select"
      class:active={layout !== "1x1"}
      value={layout === "3x2" ? "2x3" : layout}
      title="Map window layout"
      onchange={(e) => setLayout(e.currentTarget.value)}
    >
      <option id="btn-layout-1" value="1x1">⊟ Tabs</option>
      <option id="btn-layout-2" value="1x2">◫ 2-Split</option>
      <option id="btn-layout-4" value="2x2">⊞ 4-Split</option>
      <option id="btn-layout-6" value="2x3">▦ 6-Split</option>
    </select>

    <button
      id="btn-sync-toggle"
      type="button"
      class="layout-btn"
      class:active={syncMap}
      class:hidden={layout === "1x1"}
      aria-pressed={syncMap ? "true" : "false"}
      title={syncMap
        ? "Camera sync enabled across windows (Click to toggle off)"
        : "Camera sync disabled (Click to toggle on)"}
      onclick={() => onToggleSync && onToggleSync()}
    >
      {syncMap ? "Sync 🔗" : "Sync ✕"}
    </button>
  </div>
</div>

<style>
  .tabs-bar {
    height: 36px;
    background: var(--bg-secondary, #161b22);
    border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    z-index: 900;
    user-select: none;
  }

  .tabs-list {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    min-width: 0;
    flex: 1;
  }

  .tab-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 6px 6px 0 0;
    font-size: 12px;
    color: var(--text-secondary, #8b949e);
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
    max-width: 180px;
  }

  .tab-item .tab-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .tab-item:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary, #c9d1d9);
  }

  .tab-item.active {
    background: var(--bg-card, #21262d);
    color: var(--accent-blue, #58a6ff);
    border-color: var(--accent-blue, #58a6ff);
    border-bottom-color: var(--bg-card, #21262d);
    font-weight: 600;
  }

  .tab-close-btn {
    background: transparent;
    border: none;
    color: inherit;
    font-size: 14px;
    line-height: 1;
    padding: 0 2px;
    cursor: pointer;
    border-radius: 3px;
    opacity: 0.7;
  }

  .tab-close-btn:hover {
    opacity: 1;
    background: rgba(248, 81, 73, 0.2);
    color: #f85149;
  }

  .btn-add-tab {
    width: 26px;
    height: 26px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px dashed var(--border-color, rgba(255, 255, 255, 0.12));
    color: var(--text-secondary, #8b949e);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    transition: all 0.15s ease;
  }

  .btn-add-tab:hover {
    background: rgba(56, 139, 253, 0.15);
    border-color: #58a6ff;
    color: #58a6ff;
  }

  .layout-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    background-color: var(--bg-card, transparent);
    border-radius: 4px;
    padding: 2px 4px;
    transition: background-color 0.15s ease;
  }

  .tabs-bar #layout-controls {
    display: none !important;
  }

  .tabs-bar #layout-controls .auto-alloc-container,
  .tabs-bar #layout-controls .layout-label,
  .tabs-bar #layout-controls #btn-layout-select {
    display: none !important;
  }

  .layout-label {
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .layout-btn {
    padding: 3px 8px;
    background: var(--bg-card, #21262d);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 4px;
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
    cursor: pointer;
    font-family: var(--font-mono, monospace);
    transition: all 0.15s ease;
  }

  .layout-btn:hover {
    background: var(--bg-hover, #30363d);
    border-color: var(--accent-blue, #58a6ff);
    color: var(--text-primary, #c9d1d9);
  }

  .layout-btn.active {
    background: rgba(56, 139, 253, 0.2);
    border-color: var(--accent-blue, #58a6ff);
    color: var(--accent-blue, #58a6ff);
    font-weight: 600;
  }

  .layout-btn.hidden {
    display: none !important;
  }

  .auto-alloc-container {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .auto-alloc-container.hidden {
    display: none !important;
  }

  .alloc-label {
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .layout-select {
    padding: 3px 6px;
    background: var(--bg-card, #21262d);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 4px;
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
    cursor: pointer;
    font-family: var(--font-mono, monospace);
    outline: none;
    transition: all 0.15s ease;
  }

  .layout-select:hover,
  .layout-select:focus {
    background: var(--bg-hover, #30363d);
    border-color: var(--accent-blue, #58a6ff);
    color: var(--text-primary, #c9d1d9);
  }

  .layout-select.active {
    background: rgba(56, 139, 253, 0.2);
    border-color: var(--accent-blue, #58a6ff);
    color: var(--accent-blue, #58a6ff);
    font-weight: 600;
  }

  .layout-select:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    border-color: rgba(255, 255, 255, 0.08);
  }

  .tab-item[draggable="true"] {
    cursor: grab;
  }

  .tab-item.dragging {
    opacity: 0.45;
  }

  .contrast-group-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    font-family: var(--font-mono, monospace);
    background: rgba(56, 139, 253, 0.16);
    border: 1px solid rgba(88, 166, 255, 0.4);
    color: #79c0ff;
    white-space: nowrap;
    flex-shrink: 0;
    letter-spacing: 0.3px;
  }

  .tab-item.contrast-initiator {
    border-color: rgba(88, 166, 255, 0.45);
    background: rgba(56, 139, 253, 0.1);
  }

  .tab-item.contrast-child {
    border-style: dashed;
    border-color: rgba(88, 166, 255, 0.32);
    background: rgba(56, 139, 253, 0.06);
    padding: 3px 8px;
    gap: 5px;
    max-width: 145px;
  }

  .tab-item.contrast-child .tab-label {
    font-size: 11px;
    opacity: 0.85;
  }

  .tab-initiator-star {
    color: #f2cc60;
    font-size: 11px;
    line-height: 1;
    flex-shrink: 0;
  }

  .tab-alloc-chip {
    font-size: 10px;
    font-weight: 700;
    font-family: var(--font-mono, monospace);
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(88, 166, 255, 0.18);
    color: #79c0ff;
    flex-shrink: 0;
  }

  .tab-pin-btn {
    background: transparent;
    border: none;
    color: inherit;
    font-size: 11px;
    line-height: 1;
    padding: 1px 2px;
    cursor: pointer;
    border-radius: 3px;
    opacity: 0.65;
    flex-shrink: 0;
  }

  .tab-pin-btn:hover {
    opacity: 1;
    background: rgba(56, 139, 253, 0.25);
  }

  .btn-collapse-group {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: rgba(248, 81, 73, 0.14);
    border: 1px solid rgba(248, 81, 73, 0.4);
    color: #ff7b72;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .btn-collapse-group:hover {
    background: rgba(248, 81, 73, 0.28);
    border-color: #f85149;
    color: #ffa198;
  }

  .btn-restore-preview {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: rgba(46, 160, 67, 0.18);
    border: 1px solid rgba(63, 185, 80, 0.45);
    color: #56d364;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .btn-restore-preview:hover {
    background: rgba(46, 160, 67, 0.3);
    border-color: #3fb950;
  }

  .drop-indicator {
    width: 3px;
    align-self: stretch;
    margin: 5px -1px;
    border-radius: 2px;
    background: #58a6ff;
    box-shadow: 0 0 8px rgba(88, 166, 255, 0.9);
    pointer-events: none;
    flex-shrink: 0;
  }

  .visually-hidden {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0, 0, 0, 0) !important;
    white-space: nowrap !important;
    border: 0 !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
</style>
