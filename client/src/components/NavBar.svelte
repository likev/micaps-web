<script>
  import { tick } from "svelte";
  import { ui } from "../lib/stores/ui.svelte.js";
  import { app } from "../lib/stores/app.svelte.js";
  import { PRESET_GROUPS, isDivider } from "../config/presets.js";
  import { DEFAULT_MODELS } from "../lib/stores/tabsCore.js";
  import PresetMenu from "./PresetMenu.svelte";
  import HelpModal from "./HelpModal.svelte";
  import { captureScreenshot, handlePrint } from "../utils/screenshot.js";
  import { getPinnedPresetIds, getRecentPresetIds } from "../lib/stores/presetFavorites.svelte.js";
  import { getGlobalTheme, setGlobalTheme, getGlobalProjection, setGlobalProjection } from "../lib/stores/theme.svelte.js";

  let {
    presetGroups = [],
    presetId = "",
    level = 500,
    activeGroup = null,
    activeWin = null,
    onPresetSelect = null,
    onLevelSelect = null,
    onModelSelect = null,
    onLoadData = null,
    onOpenConfig = null,
    onOpenCommandPalette = null,
  } = $props();

  const levels = [1000, 925, 850, 700, 500, 400, 300, 200, 100];
  let effectivePresetGroups = $derived(presetGroups && presetGroups.length > 0 ? presetGroups : PRESET_GROUPS);
  let currentPresetId = $state(presetId);

  let currentTheme = $derived(getGlobalTheme());
  let currentProjection = $derived(getGlobalProjection());

  let pinnedPresetIds = $derived(getPinnedPresetIds());
  let recentPresetIds = $derived(getRecentPresetIds());

  let pinnedPresets = $derived.by(() => {
    return pinnedPresetIds
      .map((id) => effectivePresetGroups.find((g) => !isDivider(g) && g.id === id))
      .filter(Boolean);
  });

  let recentPresets = $derived.by(() => {
    return recentPresetIds
      .filter((id) => !pinnedPresetIds.includes(id))
      .map((id) => effectivePresetGroups.find((g) => !isDivider(g) && g.id === id))
      .filter(Boolean);
  });

  $effect(() => {
    currentPresetId = presetId;
  });

  // Focused window's group drives whether a vertical level applies.
  let currentGroup = $derived(
    activeGroup ||
    effectivePresetGroups.find((g) => !isDivider(g) && g.id === currentPresetId) ||
    null
  );

  let hasDataLoaded = $derived(
    activeWin
      ? Boolean(activeWin.activeGroup || activeWin.element || (activeWin.layers && activeWin.layers.length > 0))
      : Boolean(activeGroup || (currentPresetId && currentGroup))
  );

  let dataHasLevel = $derived.by(() => {
    if (currentGroup) {
      return currentGroup.hasLevel !== false;
    }
    if (activeWin) {
      return activeWin.hasLevel !== false && activeWin.model !== "SURFACE" && activeWin.level != null;
    }
    return false;
  });

  let showLevelSelector = $derived(Boolean(hasDataLoaded && dataHasLevel));

  let isNwpData = $derived.by(() => {
    if (!hasDataLoaded) return false;
    if (currentGroup) {
      return Boolean(
        !currentGroup.isObservation &&
        !activeWin?.isObservation &&
        activeWin?.model !== "SURFACE" &&
        activeWin?.model !== "UPPER_AIR"
      );
    }
    if (activeWin) {
      return Boolean(
        !activeWin.isObservation &&
        activeWin.model !== "SURFACE" &&
        activeWin.model !== "UPPER_AIR" &&
        (activeWin.model || activeWin.element || (activeWin.layers && activeWin.layers.length > 0))
      );
    }
    return false;
  });

  const BASE_NWP_MODELS = [
    "ECMWF_HR",
    "CMA_GFS",
    "GRAPES_GFS",
    "GFS",
    "GRAPES_3KM",
    "SHANGHAI_MR",
    "BEIJING_MR",
    "JAPAN_MR",
  ];

  let availableModels = $derived.by(() => {
    const list = [...BASE_NWP_MODELS];
    for (const m of DEFAULT_MODELS) {
      if (!list.includes(m)) list.push(m);
    }
    if (activeWin?.model && !["SURFACE", "UPPER_AIR"].includes(activeWin.model) && !list.includes(activeWin.model)) {
      list.push(activeWin.model);
    }
    const layers = currentGroup?.layers || activeWin?.layers || [];
    for (const l of layers) {
      if (l?.model && !["SURFACE", "UPPER_AIR"].includes(l.model) && !list.includes(l.model)) {
        list.push(l.model);
      }
    }
    return list;
  });

  let currentModel = $derived(
    activeWin?.model ||
    (currentGroup?.layers?.find((l) => l?.model && !["SURFACE", "UPPER_AIR"].includes(l.model))?.model) ||
    app.model ||
    "ECMWF_HR"
  );

  let isMenuOpen = $state(false);
  let showHelpModal = $state(false);
  let menuContainerRef = $state(null);

  function toggleMenu() {
    isMenuOpen = !isMenuOpen;
  }

  function handlePrintAction() {
    isMenuOpen = false;
    handlePrint();
  }

  function handleScreenshotAction() {
    isMenuOpen = false;
    captureScreenshot();
  }

  function handleHelpAction() {
    isMenuOpen = false;
    showHelpModal = true;
  }

  function handleCommandPaletteAction() {
    isMenuOpen = false;
    if (onOpenCommandPalette) {
      onOpenCommandPalette();
    } else {
      ui.commandPaletteOpen = true;
    }
  }

  function handleConfigItemClick() {
    isMenuOpen = false;
    handleConfigClick();
  }

  function handleWindowPointerDown(e) {
    if (isMenuOpen && menuContainerRef && !menuContainerRef.contains(e.target)) {
      isMenuOpen = false;
    }
  }

  async function handleMenuKeydown(e) {
    if (e.key === "Escape") {
      if (isMenuOpen) {
        e.stopPropagation();
        e.preventDefault();
        isMenuOpen = false;
        document.getElementById("btn-nav-menu")?.focus();
      }
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!isMenuOpen) {
        isMenuOpen = true;
        await tick();
      }
      const items = Array.from(menuContainerRef?.querySelectorAll?.(".nav-menu-item") || []);
      if (items.length === 0) return;
      const currentIdx = items.indexOf(document.activeElement);
      let nextIdx;
      if (e.key === "ArrowDown") {
        nextIdx = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
      } else {
        nextIdx = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
      }
      items[nextIdx]?.focus();
      return;
    }

    if (isMenuOpen && e.key === "Home") {
      e.preventDefault();
      const items = Array.from(menuContainerRef?.querySelectorAll?.(".nav-menu-item") || []);
      items[0]?.focus();
      return;
    }

    if (isMenuOpen && e.key === "End") {
      e.preventDefault();
      const items = Array.from(menuContainerRef?.querySelectorAll?.(".nav-menu-item") || []);
      items[items.length - 1]?.focus();
      return;
    }
  }

  function handlePresetMenuSelect(group) {
    if (!group) return;
    currentPresetId = group.id;
    if (group && (group.defaultLevel != null || group.hasLevel)) {
      const nextLvl = group.defaultLevel != null ? group.defaultLevel : app.level;
      if (nextLvl != null) {
        app.level = nextLvl;
      }
    } else if (group && group.hasLevel === false) {
      app.level = null;
    }
    if (onPresetSelect) onPresetSelect(group);
    if (onLoadData) {
      onLoadData(group, app.level);
    }
    const select = document.getElementById("select-preset");
    if (select) {
      select.value = group.id;
      select.blur?.();
    }
  }

  function handlePresetChange(e) {
    const val = e.target.value;
    currentPresetId = val;
    const group = effectivePresetGroups.find((g) => !isDivider(g) && g.id === val) || null;
    if (group && (group.defaultLevel != null || group.hasLevel)) {
      const nextLvl = group.defaultLevel != null ? group.defaultLevel : app.level;
      if (nextLvl != null) {
        app.level = nextLvl;
      }
    } else if (group && group.hasLevel === false) {
      app.level = null;
    }
    if (onPresetSelect) onPresetSelect(group);
    e.target?.blur?.();
  }

  function handleLevelChange(e) {
    const val = e.target.value;
    const lvl = val ? parseInt(val, 10) : null;
    const safeLvl = Number.isNaN(lvl) ? null : lvl;
    app.level = safeLvl;
    if (onLevelSelect) onLevelSelect(safeLvl);
    e.target?.blur?.();
  }

  function handleModelChange(e) {
    const val = e.target.value;
    if (val) {
      app.model = val;
      if (onModelSelect) onModelSelect(val);
    }
    e.target?.blur?.();
  }

  function handleReloadClick(e) {
    const group = currentGroup || effectivePresetGroups.find((g) => !isDivider(g) && g.id === currentPresetId) || null;
    if (!group) return;
    const targetLevel = activeWin?.level ?? app.level;
    if (onLoadData) {
      onLoadData(group, targetLevel);
    }
    e?.currentTarget?.blur?.();
    document.getElementById("select-preset")?.blur?.();
  }

  function handleLoadClick(e) {
    if (!currentPresetId) return;
    const group = effectivePresetGroups.find((g) => !isDivider(g) && g.id === currentPresetId) || null;
    if (!group) return;
    if (onLoadData) {
      onLoadData(group, app.level);
    }
    e?.currentTarget?.blur?.();
    document.getElementById("select-preset")?.blur?.();
  }

  function handleConfigClick() {
    if (onOpenConfig) {
      onOpenConfig();
    } else {
      ui.configOpen = !ui.configOpen;
    }
  }
</script>

<svelte:window onpointerdown={handleWindowPointerDown} />

<header id="navbar" class="navbar">
  <div class="nav-brand">
    <a href="https://github.com/likev/micaps-web" target="_blank" rel="noopener noreferrer" class="brand-link" title="MICAPS-Web on GitHub (client v1.8.0)">MICAPS-Web</a>
    <span class="brand-badge">PRO</span>
  </div>

  <div class="nav-left">
    <div class="nav-control-group nav-preset-section">
      <PresetMenu
        presetGroups={effectivePresetGroups}
        activePresetId={currentPresetId}
        onSelect={handlePresetMenuSelect}
      />

      <!-- Item B: Pinned Favorites & Recent Presets Quick-Pills -->
      <div id="nav-quick-pills" class="nav-quick-pills" role="toolbar" aria-label="Favorite and recent presets">
        {#each pinnedPresets as preset (preset.id)}
          <button
            type="button"
            class="quick-pill pinned-pill"
            class:active={preset.id === currentPresetId}
            title="Pinned: {preset.name}"
            onclick={() => handlePresetMenuSelect(preset)}
          >
            <span class="pill-star">★</span>
            <span class="pill-name">{preset.shortName || preset.name}</span>
          </button>
        {/each}

        {#each recentPresets as preset (preset.id)}
          <button
            type="button"
            class="quick-pill recent-pill"
            class:active={preset.id === currentPresetId}
            title="Recent: {preset.name}"
            onclick={() => handlePresetMenuSelect(preset)}
          >
            <span class="pill-recent-icon">🕒</span>
            <span class="pill-name">{preset.shortName || preset.name}</span>
          </button>
        {/each}
      </div>

      {#if hasDataLoaded && currentGroup}
        <div class="preset-active-indicator" title="Active Preset: {currentGroup.name}">
          <span class="active-tag">Active:</span>
          <span class="active-title">{currentGroup.name}</span>
          <button
            type="button"
            class="btn-reload-preset"
            onclick={handleReloadClick}
            title="Reload {currentGroup.name} data"
            aria-label="Reload Preset"
          >
            ↻
          </button>
        </div>
      {/if}

      <!-- Backward-compatible hidden controls for tests & external sync helpers -->
      <select
        id="select-preset"
        class="visually-hidden"
        value={currentPresetId}
        onchange={handlePresetChange}
        tabindex="-1"
        aria-hidden="true"
      >
        <option value="">-- Presets / 组合图 --</option>
        {#each effectivePresetGroups as group}
          {#if isDivider(group)}
            <option disabled value="">──────── {group.label || ""} ────────</option>
          {:else}
            <option value={group.id}>{group.name}</option>
          {/if}
        {/each}
      </select>
      <button
        type="button"
        id="btn-load-data"
        class="visually-hidden"
        disabled={!currentPresetId}
        onclick={handleLoadClick}
        tabindex="-1"
        aria-hidden="true"
      >
        <span>Load Data</span>
      </button>
    </div>

    {#if showLevelSelector}
      <div class="nav-control-group">
        <label for="select-nav-level">Level:</label>
        <select
          id="select-nav-level"
          class="nav-select"
          value={app.level ?? ""}
          onchange={handleLevelChange}
          title="Select level for focused window"
        >
          <option value="">None</option>
          {#each levels as lvl}
            <option value={lvl}>{lvl} hPa</option>
          {/each}
        </select>
      </div>
    {/if}

    {#if isNwpData}
      <div class="nav-control-group">
        <label for="select-nav-model">Model:</label>
        <select
          id="select-nav-model"
          class="nav-select"
          value={currentModel}
          onchange={handleModelChange}
          title="Select NWP forecast model"
        >
          {#each availableModels as mdl}
            <option value={mdl}>{mdl}</option>
          {/each}
        </select>
      </div>
    {/if}
  </div>

  <div class="nav-controls">
    <div class="nav-menu-wrapper" bind:this={menuContainerRef} onkeydown={handleMenuKeydown}>
      <button
        type="button"
        id="btn-nav-menu"
        class="btn btn-menu"
        class:active={isMenuOpen}
        aria-label="Application Menu"
        aria-haspopup="true"
        aria-expanded={isMenuOpen}
        title="Application Menu (Print, Screenshot, Help, Config)"
        onclick={toggleMenu}
      >
        <span class="hamburger-icon" aria-hidden="true">☰</span>
      </button>

      {#if isMenuOpen}
        <div
          class="nav-dropdown-menu"
          role="menu"
          tabindex="-1"
          onkeydown={handleMenuKeydown}
        >
          <button
            type="button"
            id="menu-item-print"
            class="nav-menu-item"
            role="menuitem"
            onclick={handlePrintAction}
          >
            <span class="menu-item-icon">🖨</span>
            <span class="menu-item-label">Print</span>
          </button>

          <button
            type="button"
            id="menu-item-screenshot"
            class="nav-menu-item"
            role="menuitem"
            onclick={handleScreenshotAction}
          >
            <span class="menu-item-icon">📷</span>
            <span class="menu-item-label">Screenshot</span>
          </button>

          <button
            type="button"
            id="menu-item-help"
            class="nav-menu-item"
            role="menuitem"
            onclick={handleHelpAction}
          >
            <span class="menu-item-icon">❓</span>
            <span class="menu-item-label">Help</span>
          </button>

          <button
            type="button"
            id="menu-item-command-palette"
            class="nav-menu-item"
            role="menuitem"
            title="Open Command Palette (Ctrl+K or /)"
            onclick={handleCommandPaletteAction}
          >
            <span class="menu-item-icon">🔍</span>
            <span class="menu-item-label">Command Palette</span>
            <span class="menu-shortcut">Ctrl+K</span>
          </button>

          <div class="menu-divider" role="separator"></div>

          <!-- Theme Scheme Switcher -->
          <div class="menu-section-header">Theme / Scheme</div>
          <button
            type="button"
            id="menu-item-theme-light"
            class="nav-menu-item"
            class:selected={currentTheme === "light"}
            role="menuitem"
            onclick={() => { setGlobalTheme("light"); isMenuOpen = false; }}
          >
            <span class="menu-item-icon">☀️</span>
            <span class="menu-item-label">Light (Paper)</span>
            {#if currentTheme === "light"}<span class="menu-check">✓</span>{/if}
          </button>

          <button
            type="button"
            id="menu-item-theme-dark"
            class="nav-menu-item"
            class:selected={currentTheme === "dark"}
            role="menuitem"
            onclick={() => { setGlobalTheme("dark"); isMenuOpen = false; }}
          >
            <span class="menu-item-icon">🌙</span>
            <span class="menu-item-label">Dark (Ink)</span>
            {#if currentTheme === "dark"}<span class="menu-check">✓</span>{/if}
          </button>

          <button
            type="button"
            id="menu-item-theme-micaps"
            class="nav-menu-item"
            class:selected={currentTheme === "micaps"}
            role="menuitem"
            onclick={() => { setGlobalTheme("micaps"); isMenuOpen = false; }}
          >
            <span class="menu-item-icon">🟩</span>
            <span class="menu-item-label">MICAPS Classic Green</span>
            {#if currentTheme === "micaps"}<span class="menu-check">✓</span>{/if}
          </button>

          <div class="menu-divider" role="separator"></div>

          <!-- Projection Switcher -->
          <div class="menu-section-header">Map Projection</div>
          <button
            type="button"
            id="menu-item-proj-mercator"
            class="nav-menu-item"
            class:selected={currentProjection === "mercator"}
            role="menuitem"
            onclick={() => { setGlobalProjection("mercator"); isMenuOpen = false; }}
          >
            <span class="menu-item-icon">🗺️</span>
            <span class="menu-item-label">Mercator</span>
            {#if currentProjection === "mercator"}<span class="menu-check">✓</span>{/if}
          </button>

          <button
            type="button"
            id="menu-item-proj-globe"
            class="nav-menu-item"
            class:selected={currentProjection === "globe"}
            role="menuitem"
            onclick={() => { setGlobalProjection("globe"); isMenuOpen = false; }}
          >
            <span class="menu-item-icon">🌐</span>
            <span class="menu-item-label">Globe</span>
            {#if currentProjection === "globe"}<span class="menu-check">✓</span>{/if}
          </button>

          <button
            type="button"
            id="menu-item-proj-vertical-perspective"
            class="nav-menu-item"
            class:selected={currentProjection === "vertical-perspective"}
            role="menuitem"
            onclick={() => { setGlobalProjection("vertical-perspective"); isMenuOpen = false; }}
          >
            <span class="menu-item-icon">🪐</span>
            <span class="menu-item-label">Vertical Perspective</span>
            {#if currentProjection === "vertical-perspective"}<span class="menu-check">✓</span>{/if}
          </button>

          <div class="menu-divider" role="separator"></div>

          <button
            type="button"
            id="btn-open-config"
            data-testid="menu-item-config"
            class="nav-menu-item"
            role="menuitem"
            title="Open Configuration Editor Tab"
            onclick={handleConfigItemClick}
          >
            <span class="menu-item-icon">⚙</span>
            <span class="menu-item-label">Config</span>
          </button>
        </div>
      {:else}
        <!-- Backwards compatibility fallback for scripts expecting #btn-open-config in DOM when menu is closed -->
        <button
          type="button"
          id="btn-open-config"
          class="visually-hidden"
          tabindex="-1"
          aria-hidden="true"
          title="Open Configuration Editor Tab"
          onclick={handleConfigClick}
        >
          Config
        </button>
      {/if}
    </div>
  </div>
</header>

<HelpModal open={showHelpModal} onClose={() => (showHelpModal = false)} />

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
    margin-right: auto;
  }

  .nav-left {
    display: flex;
    align-items: center;
    gap: 12px;
    overflow: visible;
    min-width: 0;
    margin-right: auto;
  }

  .nav-control-group {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary, #8b949e);
  }

  .nav-preset-section {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .preset-active-indicator {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(56, 139, 253, 0.12);
    border: 1px solid rgba(56, 139, 253, 0.35);
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 12px;
    max-width: 320px;
    box-sizing: border-box;
  }

  .active-tag {
    color: var(--text-secondary, #8b949e);
    font-size: 11px;
    font-weight: 500;
  }

  .active-title {
    color: #79c0ff;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 190px;
  }

  .btn-reload-preset {
    background: transparent;
    border: none;
    color: var(--text-secondary, #8b949e);
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 3px;
    transition: color 0.15s ease, background 0.15s ease;
  }

  .btn-reload-preset:hover {
    color: #58a6ff;
    background: rgba(56, 139, 253, 0.2);
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
    display: none !important;
  }

  .nav-controls {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .nav-menu-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .btn-menu {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 30px;
    padding: 0;
    background: #21262d;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 4px;
    color: var(--text-primary, #e6edf3);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    transition: all 0.15s ease;
  }

  .btn-menu:hover,
  .btn-menu.active {
    background: #30363d;
    border-color: rgba(255, 255, 255, 0.25);
    color: #58a6ff;
  }

  .hamburger-icon {
    display: inline-block;
    user-select: none;
    line-height: 1;
  }

  .nav-dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 160px;
    background: #161b22;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
    border-radius: 6px;
    padding: 4px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    z-index: 2500;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .nav-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--text-primary, #e6edf3);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease, color 0.15s ease;
    box-sizing: border-box;
  }

  .nav-menu-item:hover,
  .nav-menu-item:focus {
    background: #21262d;
    color: #58a6ff;
    outline: none;
  }

  .menu-item-icon {
    font-size: 14px;
    width: 18px;
    text-align: center;
    flex-shrink: 0;
  }

  .menu-item-label {
    flex: 1;
    font-weight: 500;
  }

  .menu-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.08);
    margin: 3px 0;
  }

  .menu-section-header {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary, #8b949e);
    padding: 6px 10px 2px;
  }

  .nav-menu-item.selected {
    background: rgba(56, 139, 253, 0.15);
    color: #58a6ff;
  }

  .menu-check {
    font-size: 12px;
    font-weight: bold;
    color: var(--accent-blue, #388bfd);
  }

  .menu-shortcut {
    font-size: 10px;
    font-family: var(--font-mono, monospace);
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 3px;
    padding: 1px 4px;
    color: var(--text-secondary, #8b949e);
  }

  /* Item B: Quick-pills toolbar */
  .nav-quick-pills {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 2px;
  }

  .quick-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 12px;
    color: var(--text-secondary, #8b949e);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    max-width: 140px;
  }

  .quick-pill:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.25);
    color: var(--text-primary, #e6edf3);
  }

  .quick-pill.active {
    background: rgba(56, 139, 253, 0.18);
    border-color: rgba(56, 139, 253, 0.5);
    color: #79c0ff;
  }

  .pill-star {
    color: #ffd43b;
    font-size: 11px;
  }

  .pill-recent-icon {
    font-size: 10px;
    opacity: 0.7;
  }

  .pill-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
