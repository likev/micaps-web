<script>
  import { ui } from "../lib/stores/ui.svelte.js";
  import { tabsState } from "../lib/stores/tabs.svelte.js";

  let {
    tabs = tabsState.tabs,
    windows = [],
    activeWinIdx = 0,
    activeTabId = tabsState.activeTabId,
    layout = "1x1",
    syncMap = true,
    onSelectTab = null,
    onSelectWin = null,
    onAddTab = null,
    onAddWin = null,
    onCloseTab = null,
    onCloseWin = null,
    onReorder = null,
    onChangeLayout = null,
    onToggleSync = null,
  } = $props();

  let draggedIndex = $state(null);

  let tabItems = $derived(
    windows && windows.length > 0
      ? windows
      : (tabs && tabs[0]?.windows && tabs[0].windows.length > 0 ? tabs[0].windows : tabs)
  );

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

  function handleDragStart(event, idx) {
    draggedIndex = idx;
    event.dataTransfer?.setData("text/plain", String(idx));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(event) {
    if (draggedIndex === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  }

  function handleDrop(event, idx) {
    event.preventDefault();
    const encoded = event.dataTransfer?.getData("text/plain");
    const from = encoded === "" ? draggedIndex : parseInt(encoded, 10);
    if (Number.isInteger(from) && onReorder) onReorder(from, idx);
    draggedIndex = null;
  }

  function handleDragEnd() {
    draggedIndex = null;
  }
</script>

<div id="tabs-bar" class="tabs-bar" role="tablist" aria-label="Workstation Tabs and Layout">
  <div class="tabs-list" id="tabs-list">
    {#each tabItems as item, idx (item.id || idx)}
      <div
        id={item.pillId || `tab-item-win-${item.uid ?? item.winIdx ?? idx}`}
        class="tab-item"
        class:active={(item.winIdx ?? idx) === activeWinIdx && !ui.configOpen}
        role="tab"
        aria-selected={(item.winIdx ?? idx) === activeWinIdx && !ui.configOpen}
        tabindex="0"
        title="Drag to rearrange"
        draggable="true"
        ondragstart={(e) => handleDragStart(e, idx)}
        ondragover={handleDragOver}
        ondrop={(e) => handleDrop(e, idx)}
        ondragend={handleDragEnd}
        onclick={() => selectItem(item, item.winIdx ?? idx)}
        onkeydown={(e) => e.key === "Enter" && selectItem(item, item.winIdx ?? idx)}
      >
        <span class="tab-label" id={item.labelId || `tab-label-${item.uid ?? item.winIdx ?? idx}`}>
          {(() => {
            const raw = item.title ? String(item.title).replace(/^W\d+:\s*/, "") : "";
            return raw ? `W${(item.winIdx ?? idx) + 1}: ${raw}` : `Tab ${(item.winIdx ?? idx) + 1}`;
          })()}
        </span>
        {#if (item.winIdx ?? idx) >= 4}
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
    {/each}

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
  </div>

  <div class="layout-controls" id="layout-controls">
    <span class="layout-label">Layout:</span>
    <button
      id="btn-layout-1"
      type="button"
      class="layout-btn"
      class:active={layout === "1x1"}
      title="Tabs Mode (Full window tab)"
      onclick={() => setLayout("1x1")}
    >⊟ Tabs</button>
    <button
      id="btn-layout-2"
      type="button"
      class="layout-btn"
      class:active={layout === "1x2"}
      title="2-Split Mode (Side-by-side 1x2)"
      onclick={() => setLayout("1x2")}
    >◫ 2-Split</button>
    <button
      id="btn-layout-4"
      type="button"
      class="layout-btn"
      class:active={layout === "2x2"}
      title="4-Split Mode (2x2 grid)"
      onclick={() => setLayout("2x2")}
    >⊞ 4-Split</button>
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
    background: #21262d;
    color: #58a6ff;
    border-color: #58a6ff;
    border-bottom-color: #21262d;
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
  }

  .layout-label {
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .layout-btn {
    padding: 3px 8px;
    background: #21262d;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 4px;
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
    cursor: pointer;
    font-family: var(--font-mono, monospace);
    transition: all 0.15s ease;
  }

  .layout-btn:hover {
    border-color: #58a6ff;
    color: var(--text-primary, #c9d1d9);
  }

  .layout-btn.active {
    background: rgba(56, 139, 253, 0.2);
    border-color: #58a6ff;
    color: #58a6ff;
    font-weight: 600;
  }

  .layout-btn.hidden {
    display: none !important;
  }

  .tab-item[draggable="true"] {
    cursor: grab;
  }
</style>
