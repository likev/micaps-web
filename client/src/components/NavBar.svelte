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
    layout = "1x1",
    autoAllocation = "none",
    activeGroup = null,
    activeWin = null,
    onPresetSelect = null,
    onLevelSelect = null,
    onModelSelect = null,
    onLoadData = null,
    onOpenConfig = null,
    onOpenCommandPalette = null,
    onChangeLayout = null,
    onSelectAutoAlloc = null,
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
    activeWin?.activeGroup ||
    activeGroup ||
    (currentPresetId ? effectivePresetGroups.find((g) => !isDivider(g) && g.id === currentPresetId) : null) ||
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
    "GRAPES_GFS",
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

  let isSurface = $derived(Boolean(
    activeWin?.model === "SURFACE" ||
    activeWin?.model === "SURFACE_PLOT" ||
    currentGroup?.id?.toLowerCase().includes("surface") ||
    activeWin?.element?.toLowerCase?.().includes("surface")
  ));
  let isUpperAir = $derived(Boolean(
    activeWin?.model === "UPPER_AIR" ||
    currentGroup?.id?.toLowerCase().includes("upper") ||
    currentGroup?.id?.toLowerCase().includes("tlogp")
  ));
  let isObs = $derived(Boolean(
    !isNwpData && (isSurface || isUpperAir || activeWin?.isObservation || currentGroup?.isObservation)
  ));

  let isLayoutMenuOpen = $state(false);
  let hoveredLayoutSubmenu = $state(null);
  let layoutDropdownRef = $state(null);

  const SPLIT_LAYOUTS = [
    { key: "1x2", label: "1x2 Split", icon: "◫" },
    { key: "2x2", label: "2x2 Split", icon: "⊞" },
    { key: "2x3", label: "2x3 Split", icon: "▦" },
    { key: "3x2", label: "3x2 Split", icon: "▦" },
  ];

  function toggleLayoutMenu() {
    isLayoutMenuOpen = !isLayoutMenuOpen;
    hoveredLayoutSubmenu = null;
  }

  function handleLayoutSelect(layoutKey, allocMode = null) {
    isLayoutMenuOpen = false;
    hoveredLayoutSubmenu = null;
    if (allocMode !== null && onSelectAutoAlloc) {
      onSelectAutoAlloc(allocMode);
    }
    if (onChangeLayout) {
      onChangeLayout(layoutKey, allocMode);
    }
  }

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
    if (isLayoutMenuOpen && layoutDropdownRef && !layoutDropdownRef.contains(e.target)) {
      isLayoutMenuOpen = false;
      hoveredLayoutSubmenu = null;
    }
  }

  async function handleMenuKeydown(e) {
    if (e.key === "Escape") {
      if (isLayoutMenuOpen) {
        isLayoutMenuOpen = false;
        hoveredLayoutSubmenu = null;
      }
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
          <span class="active-dot" aria-hidden="true"></span>
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

      <span class="nav-divider" aria-hidden="true"></span>

      <!-- Unified [ ⊞ Layout ▾ ] dropdown in NavBar directly to the right of .preset-active-indicator -->
      <div class="nav-layout-dropdown-container" bind:this={layoutDropdownRef}>
        <button
          type="button"
          id="btn-nav-layout"
          class="btn-nav-layout"
          class:active={layout !== "1x1"}
          aria-haspopup="true"
          aria-expanded={isLayoutMenuOpen}
          onclick={toggleLayoutMenu}
          title="Window Layout and Multi-Window Auto-Allocation"
        >
          <span class="layout-icon">⊞</span>
          <span class="layout-label-text">Layout</span>
          <span class="dropdown-caret">▾</span>
        </button>

        {#if isLayoutMenuOpen}
          <div class="nav-layout-menu" role="menu">
            <div class="layout-menu-item">
              <button
                type="button"
                class="layout-item-btn"
                class:selected={layout === "1x1"}
                onclick={() => handleLayoutSelect("1x1", "none")}
              >
                <span class="layout-item-icon">⊟</span>
                <span class="layout-item-label">1x1 (Tabs)</span>
              </button>
            </div>

            {#each SPLIT_LAYOUTS as item}
              <div
                class="layout-menu-item"
                class:active={hoveredLayoutSubmenu === item.key}
                onmouseenter={() => (hoveredLayoutSubmenu = item.key)}
                onmouseleave={() => (hoveredLayoutSubmenu = null)}
              >
                <button
                  type="button"
                  class="layout-item-btn"
                  class:selected={layout === item.key}
                  onclick={() => {
                    if (hoveredLayoutSubmenu !== item.key) {
                      hoveredLayoutSubmenu = item.key;
                    } else {
                      handleLayoutSelect(item.key);
                    }
                  }}
                >
                  <span class="layout-item-icon">{item.icon}</span>
                  <span class="layout-item-label">{item.label}</span>
                  <span class="submenu-arrow">▸</span>
                </button>
                {#if hoveredLayoutSubmenu === item.key}
                  <div class="layout-submenu" role="menu">
                    <button
                      type="button"
                      class="layout-sub-item-btn"
                      class:selected={layout === item.key && autoAllocation === "none"}
                      onclick={() => handleLayoutSelect(item.key, "none")}
                    >
                      <span>Empty (none)</span>
                    </button>
                    <button
                      type="button"
                      class="layout-sub-item-btn"
                      class:selected={layout === item.key && autoAllocation === "time"}
                      onclick={() => handleLayoutSelect(item.key, "time")}
                    >
                      <span>{isObs ? "Multi-Time Contrast" : "Multi-Init Contrast"}</span>
                    </button>
                    <button
                      type="button"
                      class="layout-sub-item-btn"
                      class:selected={layout === item.key && autoAllocation === "step"}
                      disabled={isSurface || isUpperAir}
                      onclick={() => handleLayoutSelect(item.key, "step")}
                    >
                      <span>Multi-Step Contrast</span>
                    </button>
                    <button
                      type="button"
                      class="layout-sub-item-btn"
                      class:selected={layout === item.key && autoAllocation === "level"}
                      disabled={isSurface}
                      onclick={() => handleLayoutSelect(item.key, "level")}
                    >
                      <span>Multi-Level Contrast</span>
                    </button>
                    <button
                      type="button"
                      class="layout-sub-item-btn"
                      class:selected={layout === item.key && autoAllocation === "model"}
                      disabled={isSurface || isUpperAir}
                      onclick={() => handleLayoutSelect(item.key, "model")}
                    >
                      <span>Multi-Model Contrast</span>
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

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
      <div class="nav-control-group nav-tag-capsule">
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
      <div class="nav-control-group nav-tag-capsule">
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
    background: linear-gradient(180deg, var(--bg-secondary, #161b22) 0%, rgba(16, 21, 30, 0.96) 100%);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 14px;
    z-index: 1000;
    user-select: none;
    box-sizing: border-box;
  }

  .nav-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
    font-size: 14px;
    letter-spacing: 0.5px;
    flex-shrink: 0;
    margin-right: 20px;
    padding-right: 16px;
    border-right: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  }

  .brand-link {
    color: var(--text-primary, #e6edf3);
    text-decoration: none;
    font-weight: 700;
    letter-spacing: 0.5px;
    transition: color 0.15s ease;
    display: inline-flex;
    align-items: center;
  }

  .brand-link:hover {
    color: var(--accent-blue, #58a6ff);
    text-decoration: none;
  }

  .brand-badge {
    background: linear-gradient(135deg, var(--accent-blue, #388bfd) 0%, #1f6feb 100%);
    color: #ffffff;
    font-size: 9.5px;
    padding: 1.5px 6px;
    border-radius: 4px;
    font-weight: 800;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    border: 1px solid rgba(255, 255, 255, 0.25);
    box-shadow: 0 1px 4px rgba(56, 139, 253, 0.35);
    line-height: 1.2;
    display: inline-flex;
    align-items: center;
  }

  .nav-middle {
    display: flex;
    align-items: center;
    gap: 10px;
    overflow-x: auto;
    min-width: 0;
    margin-right: auto;
  }

  .nav-left {
    display: flex;
    align-items: center;
    gap: 8px;
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
    gap: 6px;
    background: transparent;
    border: none;
    box-shadow: none;
    padding: 0;
  }

  .nav-tag-capsule {
    display: inline-flex;
    align-items: center;
    height: 28px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%), var(--bg-card, #21262d);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
    border-radius: 6px;
    padding: 2px 3px 2px 8px;
    gap: 6px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .nav-tag-capsule:hover,
  .nav-tag-capsule:focus-within {
    border-color: rgba(56, 139, 253, 0.5);
    box-shadow: 0 1px 4px rgba(56, 139, 253, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .nav-tag-capsule label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--text-secondary, #8b949e);
    margin: 0;
    user-select: none;
    line-height: 1;
    cursor: default;
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.04);
  }

  .nav-divider {
    display: inline-block;
    width: 1px;
    height: 18px;
    background: var(--border-color, rgba(255, 255, 255, 0.12));
    margin: 0 3px;
    flex-shrink: 0;
  }

  .preset-active-indicator {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    background: linear-gradient(180deg, rgba(56, 139, 253, 0.15) 0%, rgba(56, 139, 253, 0.06) 100%);
    border: 1px solid rgba(56, 139, 253, 0.38);
    border-radius: 6px;
    padding: 0 7px;
    font-size: 12px;
    max-width: 320px;
    box-sizing: border-box;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }

  .active-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #388bfd;
    box-shadow: 0 0 6px rgba(56, 139, 253, 0.8), 0 0 0 1px rgba(56, 139, 253, 0.35);
    display: inline-block;
    flex-shrink: 0;
    animation: activePulse 2s infinite ease-in-out;
  }

  @keyframes activePulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.85); }
  }

  .active-tag {
    color: #79c0ff;
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    background: rgba(56, 139, 253, 0.22);
    border: 1px solid rgba(56, 139, 253, 0.35);
    border-radius: 4px;
    padding: 1.5px 5px;
    line-height: 1.2;
    flex-shrink: 0;
  }

  .active-title {
    color: var(--text-primary, #e6edf3);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 190px;
    letter-spacing: 0.2px;
  }

  .btn-reload-preset {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--text-secondary, #8b949e);
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 4px;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    flex-shrink: 0;
  }

  .btn-reload-preset:hover {
    color: #58a6ff;
    background: rgba(56, 139, 253, 0.25);
    border-color: rgba(56, 139, 253, 0.5);
    transform: rotate(180deg);
  }

  .btn-reload-preset:active {
    transform: rotate(180deg) scale(0.92);
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
    height: 22px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-primary, #e6edf3);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    padding: 0 20px 0 6px;
    font-size: 11px;
    font-weight: 600;
    outline: none;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%238b949e' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 5px center;
  }

  .nav-select option {
    background-color: var(--bg-card, #21262d);
    color: var(--text-primary, #e6edf3);
    padding: 4px;
  }

  .nav-select:hover {
    background-color: rgba(255, 255, 255, 0.12);
    border-color: rgba(56, 139, 253, 0.5);
    color: #ffffff;
  }

  .nav-select:focus {
    border-color: var(--accent-blue, #388bfd);
    background-color: rgba(255, 255, 255, 0.14);
  }

  .nav-keyboard-hint {
    display: none !important;
  }

  .nav-controls {
    display: flex;
    align-items: center;
    gap: 8px;
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
    width: 28px;
    height: 28px;
    padding: 0;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%), var(--bg-card, #21262d);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
    border-radius: 6px;
    color: var(--text-primary, #e6edf3);
    cursor: pointer;
    font-size: 15px;
    line-height: 1;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
    user-select: none;
    box-sizing: border-box;
  }

  .btn-menu:hover,
  .btn-menu.active {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%), var(--bg-hover, #30363d);
    border-color: rgba(56, 139, 253, 0.6);
    color: #58a6ff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    transform: translateY(-0.5px);
  }

  .btn-menu.active {
    background: linear-gradient(180deg, rgba(56, 139, 253, 0.24) 0%, rgba(56, 139, 253, 0.12) 100%), var(--bg-card, #21262d);
    border-color: var(--accent-blue, #388bfd);
    color: #79c0ff;
    box-shadow: 0 0 0 2px rgba(56, 139, 253, 0.25);
  }

  .btn-menu:active {
    transform: translateY(0.5px);
  }

  .hamburger-icon {
    display: inline-block;
    user-select: none;
    line-height: 1;
  }

  @keyframes proMenuFadeIn {
    from {
      opacity: 0;
      transform: translateY(-3px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .nav-dropdown-menu {
    position: absolute;
    top: calc(100% + 5px);
    right: 0;
    min-width: 185px;
    background: rgba(18, 24, 34, 0.96);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.16));
    border-radius: 8px;
    padding: 5px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.65), 0 2px 6px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08);
    z-index: 2500;
    display: flex;
    flex-direction: column;
    gap: 2px;
    animation: proMenuFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  }

  .nav-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    background: transparent;
    border: none;
    border-radius: 5px;
    color: var(--text-primary, #e6edf3);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    transition: all 0.12s ease;
    box-sizing: border-box;
  }

  .nav-menu-item:hover,
  .nav-menu-item:focus {
    background: linear-gradient(90deg, rgba(56, 139, 253, 0.2) 0%, rgba(56, 139, 253, 0.1) 100%);
    color: #79c0ff;
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
    margin: 4px 6px;
  }

  .menu-section-header {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-secondary, #8b949e);
    padding: 6px 10px 3px;
  }

  .nav-menu-item.selected {
    background: rgba(56, 139, 253, 0.2);
    color: #58a6ff;
    font-weight: 600;
  }

  .menu-check {
    font-size: 12px;
    font-weight: bold;
    color: var(--accent-blue, #388bfd);
    text-shadow: 0 0 6px rgba(56, 139, 253, 0.4);
  }

  .menu-shortcut {
    font-size: 10px;
    font-family: var(--font-mono, monospace);
    font-weight: 600;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    padding: 1px 5px;
    color: var(--text-secondary, #8b949e);
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.25);
  }

  /* Item B: Quick-pills toolbar */
  .nav-quick-pills {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 2px;
    max-width: 380px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
    flex-shrink: 1;
  }

  .nav-quick-pills::-webkit-scrollbar {
    display: none;
  }

  .quick-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 8px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%), var(--bg-card, #21262d);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.14));
    border-radius: 5px;
    color: var(--text-secondary, #8b949e);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
    white-space: nowrap;
    max-width: 140px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.04);
    box-sizing: border-box;
    user-select: none;
  }

  .quick-pill:hover {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.03) 100%), var(--bg-hover, #30363d);
    border-color: rgba(255, 255, 255, 0.28);
    color: var(--text-primary, #ffffff);
    transform: translateY(-0.5px);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.25);
  }

  .quick-pill.active {
    background: linear-gradient(180deg, rgba(56, 139, 253, 0.24) 0%, rgba(56, 139, 253, 0.1) 100%);
    border-color: rgba(56, 139, 253, 0.6);
    color: #79c0ff;
    font-weight: 600;
    box-shadow: 0 1px 4px rgba(56, 139, 253, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .quick-pill:active {
    transform: translateY(0.5px);
  }

  .pill-star {
    color: #f1c40f;
    font-size: 11px;
    filter: drop-shadow(0 0 2px rgba(241, 196, 15, 0.4));
    line-height: 1;
  }

  .pill-recent-icon {
    font-size: 10px;
    opacity: 0.8;
    line-height: 1;
  }

  .pill-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1;
  }

  /* Layout Dropdown Styles */
  .nav-layout-dropdown-container {
    position: relative;
    display: inline-flex;
    align-items: center;
    margin-left: 2px;
    flex-shrink: 0;
  }

  .btn-nav-layout {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%), var(--bg-card, #21262d);
    color: var(--text-primary, #e6edf3);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.2px;
    cursor: pointer;
    box-sizing: border-box;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
    white-space: nowrap;
    user-select: none;
  }

  .btn-nav-layout:hover,
  .btn-nav-layout[aria-expanded="true"] {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%), var(--bg-hover, #30363d);
    border-color: rgba(56, 139, 253, 0.6);
    color: #ffffff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    transform: translateY(-0.5px);
  }

  .btn-nav-layout.active {
    background: linear-gradient(180deg, rgba(56, 139, 253, 0.24) 0%, rgba(56, 139, 253, 0.12) 100%), var(--bg-card, #21262d);
    border-color: var(--accent-blue, #388bfd);
    color: #79c0ff;
    box-shadow: 0 0 0 2px rgba(56, 139, 253, 0.25), 0 2px 4px rgba(0, 0, 0, 0.25);
  }

  .btn-nav-layout:active {
    transform: translateY(0.5px);
  }

  .layout-icon {
    font-size: 13px;
    line-height: 1;
    opacity: 0.9;
  }

  .dropdown-caret {
    font-size: 9px;
    color: var(--text-secondary, #8b949e);
    margin-left: 1px;
    opacity: 0.75;
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .btn-nav-layout[aria-expanded="true"] .dropdown-caret {
    transform: rotate(180deg);
    color: #79c0ff;
  }

  .nav-layout-menu {
    position: absolute;
    top: calc(100% + 5px);
    left: 0;
    min-width: 175px;
    background: rgba(18, 24, 34, 0.96);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.16));
    border-radius: 8px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.65), 0 2px 6px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08);
    padding: 5px;
    z-index: 2500;
    animation: proMenuFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  }

  .layout-menu-item {
    position: relative;
  }

  .layout-item-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary, #e6edf3);
    background: transparent;
    border: none;
    border-radius: 5px;
    text-align: left;
    cursor: pointer;
    box-sizing: border-box;
    transition: all 0.12s ease;
  }

  .layout-item-btn:hover,
  .layout-menu-item.active > .layout-item-btn {
    background: linear-gradient(90deg, rgba(56, 139, 253, 0.2) 0%, rgba(56, 139, 253, 0.1) 100%);
    color: #79c0ff;
  }

  .layout-item-btn.selected {
    background: rgba(56, 139, 253, 0.2);
    color: #58a6ff;
    font-weight: 600;
  }

  .layout-item-label {
    flex: 1;
    white-space: nowrap;
  }

  .submenu-arrow {
    font-size: 10px;
    color: var(--text-secondary, #8b949e);
  }

  .layout-submenu {
    position: absolute;
    left: calc(100% + 4px);
    top: -5px;
    min-width: 195px;
    background: rgba(18, 24, 34, 0.96);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.16));
    border-radius: 8px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.7), 0 2px 6px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08);
    padding: 5px;
    z-index: 2510;
    animation: proMenuFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  }

  .layout-sub-item-btn {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary, #e6edf3);
    background: transparent;
    border: none;
    border-radius: 5px;
    text-align: left;
    cursor: pointer;
    box-sizing: border-box;
    transition: all 0.12s ease;
  }

  .layout-sub-item-btn:hover:not(:disabled) {
    background: linear-gradient(90deg, rgba(56, 139, 253, 0.22) 0%, rgba(56, 139, 253, 0.12) 100%);
    color: #79c0ff;
  }

  .layout-sub-item-btn.selected {
    background: rgba(56, 139, 253, 0.2);
    color: #58a6ff;
    font-weight: 600;
  }

  .layout-sub-item-btn:disabled {
    color: var(--text-disabled, rgba(255, 255, 255, 0.3));
    cursor: not-allowed;
    opacity: 0.45;
  }
</style>
