<script>
  import { onMount, tick } from "svelte";
  import { PRESET_GROUPS, isDivider } from "../config/presets.js";
  import { isPresetPinned, togglePinPreset, addRecentPreset } from "../lib/stores/presetFavorites.svelte.js";

  let {
    presetGroups = [],
    activePresetId = "",
    onSelect = null,
  } = $props();

  let effectiveGroups = $derived(
    presetGroups && presetGroups.length > 0 ? presetGroups : PRESET_GROUPS
  );

  // Group presets by category, preserving initial occurrence order of categories
  let categories = $derived.by(() => {
    const map = new Map();
    const validPresets = effectiveGroups.filter((g) => g && !isDivider(g));
    for (const preset of validPresets) {
      const catName = (preset.category && String(preset.category).trim()) || "Other Presets";
      if (!map.has(catName)) {
        map.set(catName, []);
      }
      map.get(catName).push(preset);
    }
    return Array.from(map.entries()).map(([name, presets]) => ({
      name,
      presets,
      hasActive: presets.some((p) => p.id === activePresetId),
    }));
  });

  let isOpen = $state(false);
  let activeCategoryIdx = $state(-1);
  let focusedCategoryIdx = $state(-1);
  let focusedSubmenuIdx = $state(-1);

  let menuContainerRef = $state(null);
  let triggerBtnRef = $state(null);

  const CATEGORY_ICONS = {
    "Surface Observations": "🌦️",
    "Upper-Air Observations": "🎈",
    "TlogP Observation": "📈",
    "NWP Synoptic": "🌀",
    "NWP Synoptic Rain": "🌧️",
    "NWP Time-Height Profile": "📊",
    "NWP Line-Height Profile": "📉",
    "NWP Time-Distance Profile": "🗺️",
    "Multi-Time Recipes": "⏱️",
    "Derived Diagnostics": "⚡",
  };

  function getCategoryIcon(name) {
    return CATEGORY_ICONS[name] || "📁";
  }

  export function open() {
    isOpen = true;
    activeCategoryIdx = -1;
    focusedCategoryIdx = 0;
    focusedSubmenuIdx = -1;
  }

  export function close() {
    isOpen = false;
    activeCategoryIdx = -1;
    focusedCategoryIdx = -1;
    focusedSubmenuIdx = -1;
  }

  function toggleMenu() {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }

  function handleSelectPreset(preset) {
    if (!preset) return;
    addRecentPreset(preset.id);
    close();
    if (onSelect) {
      onSelect(preset);
    }
    triggerBtnRef?.blur?.();
  }

  function handleCategoryMouseEnter(idx) {
    activeCategoryIdx = idx;
    focusedCategoryIdx = idx;
    focusedSubmenuIdx = -1;
  }

  function handleCategoryClick(idx) {
    if (activeCategoryIdx === idx) {
      activeCategoryIdx = -1;
      focusedSubmenuIdx = -1;
    } else {
      activeCategoryIdx = idx;
      focusedCategoryIdx = idx;
      focusedSubmenuIdx = 0;
    }
  }

  function handleSubmenuMouseEnter(itemIdx) {
    focusedSubmenuIdx = itemIdx;
  }

  function handleKeyDown(e) {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        open();
      }
      return;
    }

    if (e.key === "Tab") {
      close();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      if (focusedSubmenuIdx >= 0 || activeCategoryIdx >= 0) {
        focusedSubmenuIdx = -1;
        activeCategoryIdx = -1;
      } else {
        close();
        triggerBtnRef?.focus?.();
      }
      return;
    }

    if (categories.length === 0) return;

    const inSubmenu = focusedSubmenuIdx >= 0 && activeCategoryIdx >= 0;
    const currentSubmenuPresets = inSubmenu
      ? categories[activeCategoryIdx]?.presets || []
      : [];

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (inSubmenu) {
        if (currentSubmenuPresets.length > 0) {
          focusedSubmenuIdx = (focusedSubmenuIdx + 1) % currentSubmenuPresets.length;
        }
      } else {
        focusedCategoryIdx = (focusedCategoryIdx + 1) % categories.length;
        activeCategoryIdx = focusedCategoryIdx;
        focusedSubmenuIdx = -1;
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (inSubmenu) {
        if (currentSubmenuPresets.length > 0) {
          focusedSubmenuIdx =
            (focusedSubmenuIdx - 1 + currentSubmenuPresets.length) % currentSubmenuPresets.length;
        }
      } else {
        focusedCategoryIdx =
          (focusedCategoryIdx - 1 + categories.length) % categories.length;
        activeCategoryIdx = focusedCategoryIdx;
        focusedSubmenuIdx = -1;
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (!inSubmenu && focusedCategoryIdx >= 0) {
        activeCategoryIdx = focusedCategoryIdx;
        focusedSubmenuIdx = 0;
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (inSubmenu) {
        focusedSubmenuIdx = -1;
        activeCategoryIdx = -1;
      }
    } else if (e.key === "Home") {
      e.preventDefault();
      if (inSubmenu) {
        focusedSubmenuIdx = 0;
      } else {
        focusedCategoryIdx = 0;
        activeCategoryIdx = 0;
        focusedSubmenuIdx = -1;
      }
    } else if (e.key === "End") {
      e.preventDefault();
      if (inSubmenu) {
        focusedSubmenuIdx = Math.max(0, currentSubmenuPresets.length - 1);
      } else {
        focusedCategoryIdx = Math.max(0, categories.length - 1);
        activeCategoryIdx = focusedCategoryIdx;
        focusedSubmenuIdx = -1;
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (inSubmenu && currentSubmenuPresets[focusedSubmenuIdx]) {
        handleSelectPreset(currentSubmenuPresets[focusedSubmenuIdx]);
      } else if (!inSubmenu && focusedCategoryIdx >= 0) {
        activeCategoryIdx = focusedCategoryIdx;
        focusedSubmenuIdx = 0;
      }
    }
  }

  $effect(() => {
    if (isOpen && focusedSubmenuIdx >= 0) {
      tick().then(() => {
        const el = menuContainerRef?.querySelector(".preset-item-btn.focused");
        el?.scrollIntoView?.({ block: "nearest" });
      });
    } else if (isOpen && focusedCategoryIdx >= 0) {
      tick().then(() => {
        const el = menuContainerRef?.querySelector(".preset-category-item.focused");
        el?.scrollIntoView?.({ block: "nearest" });
      });
    }
  });

  onMount(() => {
    function handleClickOutside(event) {
      if (!menuContainerRef) return;
      if (!menuContainerRef.contains(event.target)) {
        close();
      }
    }

    document.addEventListener("pointerdown", handleClickOutside);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
    };
  });
</script>

<div
  class="preset-menu-container"
  bind:this={menuContainerRef}
  onkeydown={handleKeyDown}
  role="region"
  aria-label="Preset Selection Menu"
>
  <button
    type="button"
    id="btn-preset-menu"
    class="preset-menu-trigger"
    bind:this={triggerBtnRef}
    onclick={toggleMenu}
    aria-haspopup="menu"
    aria-expanded={isOpen}
    title="Open categorized presets menu"
  >
    <span class="preset-trigger-icon">📊</span>
    <span class="preset-trigger-label">Presets</span>
    <span class="preset-trigger-arrow" class:rotated={isOpen}>▾</span>
  </button>

  {#if isOpen}
    <div
      class="preset-dropdown"
      role="menu"
      aria-label="Preset Categories"
    >
      {#if categories.length === 0}
        <div class="preset-menu-empty">No presets available</div>
      {:else}
        {#each categories as cat, idx}
          <div
            class="preset-category-item"
            class:active={activeCategoryIdx === idx}
            class:has-active={cat.hasActive}
            class:focused={focusedCategoryIdx === idx && focusedSubmenuIdx < 0}
            role="menuitem"
            tabindex={focusedCategoryIdx === idx ? 0 : -1}
            aria-haspopup="menu"
            aria-expanded={activeCategoryIdx === idx}
            onmouseenter={() => handleCategoryMouseEnter(idx)}
            onclick={() => handleCategoryClick(idx)}
          >
          <div class="category-header">
            <span class="category-icon">{getCategoryIcon(cat.name)}</span>
            <span class="category-name">{cat.name}</span>
            <span class="category-count">{cat.presets.length}</span>
            <span class="category-arrow">▸</span>
          </div>

          {#if activeCategoryIdx === idx}
            <div
              class="preset-submenu"
              role="menu"
              aria-label={cat.name}
            >
              {#each cat.presets as preset, pIdx}
                <div
                  class="preset-item-btn"
                  class:active={preset.id === activePresetId}
                  class:focused={focusedSubmenuIdx === pIdx && activeCategoryIdx === idx}
                  role="menuitem"
                  tabindex={focusedSubmenuIdx === pIdx ? 0 : -1}
                  onmouseenter={() => handleSubmenuMouseEnter(pIdx)}
                  onclick={(e) => {
                    e.stopPropagation();
                    handleSelectPreset(preset);
                  }}
                  onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      handleSelectPreset(preset);
                    }
                  }}
                  title={preset.name}
                >
                  <span class="preset-check">{preset.id === activePresetId ? "✓" : ""}</span>
                  <span class="preset-name">{preset.name}</span>
                  {#if preset.hasLevel !== false && (preset.defaultLevel || preset.hasLevel)}
                    <span class="preset-badge">{preset.defaultLevel || 500} hPa</span>
                  {:else if preset.hasLevel === false}
                    <span class="preset-badge">Sfc</span>
                  {/if}
                  <button
                    type="button"
                    class="btn-pin-preset"
                    class:pinned={isPresetPinned(preset.id)}
                    title={isPresetPinned(preset.id) ? "Unpin preset" : "Pin to quick bar"}
                    aria-label={isPresetPinned(preset.id) ? "Unpin preset" : "Pin preset"}
                    onclick={(e) => {
                      e.stopPropagation();
                      togglePinPreset(preset.id);
                    }}
                  >
                    {isPresetPinned(preset.id) ? "★" : "☆"}
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .preset-menu-empty {
    padding: 10px 14px;
    font-size: 12px;
    color: var(--text-secondary, #8b949e);
    text-align: center;
  }

  .preset-menu-container {
    position: relative;
    display: inline-block;
    background-color: var(--bg-card, transparent);
    border-radius: 4px;
    transition: background-color 0.15s ease;
  }

  .preset-menu-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    height: 28px;
    font-size: 12px;
    font-weight: 600;
    background: #21262d;
    color: var(--text-primary, #e6edf3);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
    border-radius: 4px;
    cursor: pointer;
    user-select: none;
    box-sizing: border-box;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .preset-menu-trigger:hover,
  .preset-menu-trigger[aria-expanded="true"] {
    background: #30363d;
    border-color: var(--accent-blue, #388bfd);
    color: #ffffff;
  }

  .preset-trigger-icon {
    font-size: 13px;
    line-height: 1;
  }

  .preset-trigger-label {
    letter-spacing: 0.3px;
  }

  .preset-trigger-arrow {
    font-size: 10px;
    transition: transform 0.15s ease;
    color: var(--text-secondary, #8b949e);
  }

  .preset-trigger-arrow.rotated {
    transform: rotate(180deg);
  }

  .preset-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 220px;
    background: var(--bg-secondary, #161b22);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
    padding: 4px 0;
    z-index: 1100;
    overflow: visible;
  }

  .preset-category-item {
    position: relative;
    user-select: none;
    outline: none;
  }

  .category-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    font-size: 12px;
    color: var(--text-primary, #e6edf3);
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
  }

  .preset-category-item:hover > .category-header,
  .preset-category-item.active > .category-header,
  .preset-category-item.focused > .category-header {
    background: rgba(56, 139, 253, 0.18);
    color: #58a6ff;
  }

  .preset-category-item.has-active > .category-header .category-name {
    color: #79c0ff;
    font-weight: 600;
  }

  .category-icon {
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
  }

  .category-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .category-count {
    font-size: 10px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-secondary, #8b949e);
    border-radius: 10px;
    padding: 1px 6px;
    font-family: var(--font-mono, monospace);
  }

  .category-arrow {
    font-size: 10px;
    color: var(--text-secondary, #8b949e);
    flex-shrink: 0;
  }

  .preset-submenu {
    position: absolute;
    left: 100%;
    top: -4px;
    min-width: 260px;
    max-height: 400px;
    overflow-y: auto;
    background: var(--bg-secondary, #161b22);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    padding: 4px 0;
    z-index: 1110;
    margin-left: 2px;
  }

  .preset-item-btn {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 6px 12px;
    font-size: 12px;
    color: var(--text-primary, #e6edf3);
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    gap: 8px;
    outline: none;
    box-sizing: border-box;
    transition: background 0.12s ease, color 0.12s ease;
  }

  .preset-item-btn:hover,
  .preset-item-btn.focused {
    background: rgba(56, 139, 253, 0.22);
    color: #79c0ff;
  }

  .preset-item-btn.active {
    font-weight: 600;
    color: #58a6ff;
    background: rgba(56, 139, 253, 0.12);
  }

  .preset-check {
    width: 12px;
    font-size: 11px;
    font-weight: 700;
    color: var(--accent-blue, #388bfd);
    flex-shrink: 0;
    text-align: center;
  }

  .preset-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preset-badge {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-secondary, #8b949e);
    flex-shrink: 0;
  }

  .btn-pin-preset {
    background: transparent;
    border: none;
    font-size: 13px;
    color: var(--text-secondary, #8b949e);
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    transition: color 0.15s ease, transform 0.1s ease;
    flex-shrink: 0;
  }

  .btn-pin-preset:hover {
    color: #ffd43b;
    transform: scale(1.15);
  }

  .btn-pin-preset.pinned {
    color: #ffd43b;
  }
</style>
