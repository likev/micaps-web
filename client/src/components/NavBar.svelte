<script>
  import { onMount } from "svelte";
  import { ui } from "../lib/stores/ui.svelte.js";
  import { app } from "../lib/stores/app.svelte.js";
  import { fetchStatus } from "../api/catalogApi.js";
  import { PRESET_GROUPS, isDivider } from "../config/presets.js";

  let {
    presetId = "",
    level = 500,
    onPresetSelect = null,
    onLevelSelect = null,
    onLoadData = null,
    onOpenConfig = null,
  } = $props();

  const levels = [1000, 925, 850, 700, 500, 400, 300, 200, 100];
  let statusText = $state("Connecting...");
  let statusState = $state("connecting"); // connected | warning | disconnected
  let pollInterval = null;
  let abortController = null;

  async function checkStatus() {
    if (abortController) abortController.abort();
    abortController = new AbortController();
    try {
      const res = await fetchStatus(abortController.signal);
      if (res && res.status === "ok") {
        statusState = "connected";
        statusText = res.mock_mode ? "Mock Mode" : "Online";
        app.status = "connected";
        app.isMock = Boolean(res.mock_mode);
      } else {
        statusState = "warning";
        statusText = "Degraded";
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        statusState = "disconnected";
        statusText = "Offline";
        app.status = "disconnected";
      }
    }
  }

  onMount(() => {
    checkStatus();
    pollInterval = setInterval(checkStatus, 15000);
    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (abortController) abortController.abort();
    };
  });

  function handlePresetChange(e) {
    const val = e.target.value;
    const group = PRESET_GROUPS.find((g) => !isDivider(g) && g.id === val) || null;
    if (group && (group.defaultLevel != null || group.hasLevel)) {
      const nextLvl = group.defaultLevel != null ? group.defaultLevel : app.level;
      if (nextLvl != null) {
        app.level = nextLvl;
      }
    } else {
      app.level = null;
    }
    if (onPresetSelect) onPresetSelect(group);
  }

  function handleLevelChange(e) {
    const val = e.target.value;
    const lvl = val ? parseInt(val, 10) : null;
    const safeLvl = Number.isNaN(lvl) ? null : lvl;
    app.level = safeLvl;
    if (onLevelSelect) onLevelSelect(safeLvl);
  }

  function handleLoadClick() {
    if (!presetId) return;
    const group = PRESET_GROUPS.find((g) => !isDivider(g) && g.id === presetId) || null;
    if (!group) return;
    if (onLoadData) {
      onLoadData(group, app.level);
    }
  }

  function handleConfigClick() {
    if (onOpenConfig) {
      onOpenConfig();
    } else {
      ui.configOpen = !ui.configOpen;
    }
  }

  function handleCatalogToggle() {
    ui.catalogOpen = !ui.catalogOpen;
  }
</script>

<header id="navbar" class="navbar">
  <div class="nav-brand">
    <a href="https://github.com/likev/micaps-web" target="_blank" rel="noopener noreferrer" class="brand-link" title="MICAPS-Web on GitHub">MICAPS-Web</a>
    <span class="brand-badge">PRO</span>
  </div>

  <div class="nav-middle">
    <button
      id="btn-catalog-drawer"
      class="btn nav-catalog-btn"
      class:active={ui.catalogOpen}
      onclick={handleCatalogToggle}
      title="Open Dataset Catalog Drawer"
    >
      <span>📁 Catalog</span>
    </button>

    <div class="nav-control-group">
      <label for="select-preset">Group:</label>
      <select id="select-preset" class="nav-select" value={presetId} onchange={handlePresetChange}>
        <option value="">-- Presets / 组合图 --</option>
        {#each PRESET_GROUPS as group}
          {#if isDivider(group)}
            <option disabled value="">──────── {group.label || ""} ────────</option>
          {:else}
            <option value={group.id}>{group.name}</option>
          {/if}
        {/each}
      </select>
      <button
        id="btn-load-data"
        class="btn btn-primary nav-load-btn"
        disabled={!presetId}
        onclick={handleLoadClick}
        title="Load selected preset group data"
      >
        <span>Load Data</span>
      </button>
    </div>

    <div class="nav-control-group">
      <label for="select-nav-level">Level:</label>
      <select id="select-nav-level" class="nav-select" value={app.level ?? ""} onchange={handleLevelChange}>
        <option value="">None</option>
        {#each levels as lvl}
          <option value={lvl}>{lvl} hPa</option>
        {/each}
      </select>
    </div>

    <div class="nav-keyboard-hint" title="Keyboard Shortcuts: ◀/▶ Step Time, ▲/▼ Step Level, F4/Alt+S Split View">
      <span class="kbd-pill" title="Press Left/Right Arrow to step time">◀/▶ Time</span>
      <span class="kbd-pill" title="Press Up/Down Arrow to step vertical level">▲/▼ Level</span>
    </div>
  </div>

  <div class="nav-controls">
    <div id="nav-status-indicator" class="nav-status">
      <span
        class="status-dot"
        class:warning={statusState === "warning"}
        class:disconnected={statusState === "disconnected"}
      ></span>
      <span id="nav-status-text">{statusText}</span>
    </div>
    <button
      id="btn-toggle-layers"
      class="btn btn-primary"
      class:active={ui.layersOpen}
      onclick={() => (ui.layersOpen = !ui.layersOpen)}
    >
      <span>Layers</span>
    </button>
    <button id="btn-open-config" class="btn" title="Open Configuration Editor Tab" onclick={handleConfigClick}>
      <span>⚙ Config</span>
    </button>
  </div>
</header>

<style>
  .navbar {
    height: 48px;
    background: var(--bg-secondary, #121824);
    border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    z-index: 1000;
  }

  .nav-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    font-weight: 600;
    font-size: 15px;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }

  .brand-link {
    color: var(--text-primary, #e6edf3);
    text-decoration: none;
    font-weight: 700;
    letter-spacing: 0.5px;
    transition: color 0.15s ease;
  }

  .brand-link:hover {
    color: var(--accent-blue, #388bfd);
    text-decoration: underline;
  }

  .brand-badge {
    background: var(--accent-blue, #388bfd);
    color: white;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 700;
  }

  .nav-middle {
    display: flex;
    align-items: center;
    gap: 12px;
    overflow-x: auto;
    min-width: 0;
  }

  .nav-catalog-btn.active {
    background: rgba(56, 139, 253, 0.25);
    border-color: var(--accent-blue, #388bfd);
  }

  .nav-control-group {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary, #8b949e);
  }

  .nav-select {
    background: #21262d;
    color: var(--text-primary, #e6edf3);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 12px;
    outline: none;
    cursor: pointer;
  }

  .nav-select:focus {
    border-color: var(--accent-blue, #388bfd);
  }

  .nav-keyboard-hint {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .kbd-pill {
    background: rgba(56, 139, 253, 0.15);
    border: 1px solid rgba(56, 139, 253, 0.4);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    font-family: var(--font-mono, monospace);
    color: #79c0ff;
  }

  .nav-controls {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .nav-status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary, #8b949e);
    font-family: var(--font-mono, monospace);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent-green, #2ea043);
  }

  .status-dot.warning {
    background: var(--accent-orange, #d29922);
  }

  .status-dot.disconnected {
    background: var(--accent-red, #f85149);
  }

  #btn-toggle-layers.active {
    background: #2378eb;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
  }
</style>
