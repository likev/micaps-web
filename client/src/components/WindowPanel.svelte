<script>
  import MapViewport from "../map/MapViewport.svelte";
  import { PRESET_GROUPS, isDivider } from "../config/presets.js";

  let {
    win,
    isActive = false,
    isVisible = true,
    presetGroups = PRESET_GROUPS,
    onFocus = null,
    onToggleMax = null,
    onGroupSelect = null,
    onLevelSelect = null,
    onMapCreated = null,
    onMapDestroyed = null,
  } = $props();

  let winTitle = $derived.by(() => {
    if (!win) return "";
    if (win.title) return win.title;
    if (win.activeGroup?.name) return win.activeGroup.name;
    if (win.model && win.element) {
      const isUpper = win.model === "UPPER_AIR" || (typeof win.element === "string" && win.element.includes("UPPER"));
      if (win.isObservation) {
        return isUpper ? `${win.level || 500} hPa Sounding (${win.model})` : `${win.element} (${win.model})`;
      }
      return `${win.level ? `${win.level} hPa ` : ""}${win.element} (${win.model})`;
    }
    return `Window ${win.winIdx + 1}`;
  });

  const levels = [1000, 925, 850, 700, 500, 400, 300, 200, 100];

  function selectGroup(event) {
    const group = presetGroups.find((item) => !isDivider(item) && item.id === event.target.value);
    if (group && onGroupSelect) onGroupSelect(win, group);
  }

  function selectLevel(event) {
    const value = event.target.value;
    const level = value === "" ? null : parseInt(value, 10);
    if (level !== null && Number.isFinite(level) && onLevelSelect) onLevelSelect(win, level);
  }

</script>

<div
  class="window-panel"
  class:active={isActive}
  class:hidden={!isVisible}
  data-win-id={win.id}
  id={win.panelId || `win-panel-${win.tabId || 1}-${win.uid ?? win.winIdx}`}
  tabindex="-1"
>
  <div
    class="win-header"
    id={win.headerId || `win-header-${win.tabId || 1}-${win.uid ?? win.winIdx}`}
    role="button"
    tabindex="0"
    aria-label={`Focus window W${win.winIdx + 1}: ${winTitle}`}
    onclick={() => onFocus && onFocus(win)}
    ondblclick={() => onToggleMax && onToggleMax(win)}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        if (onFocus) onFocus(win);
      }
    }}
  >
    <div class="win-title-group">
      <span class="win-badge" id={win.badgeId || `win-badge-${win.tabId || 1}-${win.uid ?? win.winIdx}`}>W{win.winIdx + 1}</span>
      <span class="win-title" id={win.titleId || `win-title-${win.tabId || 1}-${win.uid ?? win.winIdx}`} title={winTitle}>{winTitle}</span>
    </div>

    <div class="win-actions">
      <select
        class="win-preset-select"
        aria-label={`Group for W${win.winIdx + 1}`}
        title="Select group for this window"
        value={win.activeGroup?.id || ""}
        onchange={selectGroup}
        onclick={(e) => e.stopPropagation()}
      >
        <option value="">-- Group --</option>
        {#each presetGroups as group}
          {#if isDivider(group)}
            <option disabled value="">──────── {group.label || ""} ────────</option>
          {:else}
            <option value={group.id}>{group.name}</option>
          {/if}
        {/each}
      </select>
      <select
        class="win-level-select"
        aria-label={`Level for W${win.winIdx + 1}`}
        title="Select level for this window"
        value={win.level ?? ""}
        onchange={selectLevel}
        onclick={(e) => e.stopPropagation()}
      >
        <option value="">None</option>
        {#each levels as level}
          <option value={level}>{level} hPa</option>
        {/each}
      </select>
      <button
        type="button"
        id={win.maxBtnId || `win-max-${win.tabId || 1}-${win.uid ?? win.winIdx}`}
        class="win-btn-max"
        title="Maximize Window"
        aria-label="Maximize Window"
        onclick={(e) => {
          e.stopPropagation();
          if (onFocus) onFocus(win);
          if (onToggleMax) onToggleMax(win);
        }}
      >⛶</button>
    </div>
  </div>

  <div class="win-body">
    <MapViewport
      winId={win.id}
      {isActive}
      {isVisible}
      {onMapCreated}
      onMapDestroyed={() => onMapDestroyed && onMapDestroyed(win)}
    />
  </div>
</div>

<style>
  .window-panel {
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
    background: #0d1117;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-sizing: border-box;
    width: 100%;
    height: 100%;
  }

  .window-panel.active {
    border-color: #58a6ff !important;
    box-shadow: inset 0 0 0 1px #58a6ff;
  }

  .window-panel.hidden {
    display: none !important;
  }

  .win-header {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 4px 14px;
    height: 32px;
    min-height: 32px;
    background: var(--bg-panel, rgba(18, 24, 36, 0.85));
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.14));
    border-radius: 20px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
    z-index: 25;
    user-select: none;
    pointer-events: auto;
    max-width: min(85%, 680px);
    box-sizing: border-box;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .win-header:hover {
    background: rgba(22, 27, 34, 0.95);
    border-color: rgba(255, 255, 255, 0.22);
  }

  .window-panel.active .win-header {
    border-color: rgba(88, 166, 255, 0.5);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(88, 166, 255, 0.3);
  }

  .win-title-group {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
    min-width: 0;
    flex: 1;
  }

  .win-badge {
    font-size: 11px;
    background: #238636;
    color: #fff;
    padding: 2px 7px;
    border-radius: 10px;
    font-weight: 700;
    font-family: var(--font-mono, monospace);
    flex-shrink: 0;
    letter-spacing: 0.5px;
  }

  .window-panel.active .win-badge {
    background: #1f6feb;
  }

  .win-title {
    font-size: 14px;
    color: var(--text-primary, #f0f6fc);
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }

  .win-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .win-preset-select,
  .win-level-select {
    max-width: 145px;
    min-width: 70px;
    height: 24px;
    padding: 2px 4px;
    background: #21262d;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 4px;
    color: var(--text-primary, #e6edf3);
    font-size: 10px;
    cursor: pointer;
  }

  .win-level-select {
    width: 78px;
  }

  .win-btn-max {
    background: transparent;
    border: none;
    color: #8b949e;
    cursor: pointer;
    font-size: 14px;
    padding: 2px 5px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s ease, background 0.15s ease;
  }

  .win-btn-max:hover {
    color: #58a6ff;
    background: rgba(56, 139, 253, 0.18);
  }

  .win-body {
    flex: 1;
    min-height: 0;
    width: 100%;
    height: 100%;
    position: relative;
  }
</style>
