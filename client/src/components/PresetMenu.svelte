<script>
  import { onMount, tick } from "svelte";
  import { PRESET_GROUPS, isDivider } from "../config/presets.js";
  import { isPresetPinned, togglePinPreset, addRecentPreset } from "../lib/stores/presetFavorites.svelte.js";
  import { getGlobalLocale, localizeCategory, localizeEntityName, t, BADGE_TRANSLATIONS } from "../lib/stores/i18n.svelte.js";

  let {
    presetGroups = [],
    activePresetId = "",
    onSelect = null,
  } = $props();

  let currentLocale = $derived(getGlobalLocale());

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
  let dropdownRef = $state(null);
  let submenuRef = $state(null);
  let submenuTop = $state(0);
  let submenuLeft = $state(0);
  let submenuMaxHeight = $state("calc(100vh - var(--navbar-height, 48px) - 24px)");

  function updateSubmenuPosition(targetIdx = activeCategoryIdx) {
    if (!menuContainerRef || !dropdownRef || targetIdx < 0) return;
    const catItems = dropdownRef.querySelectorAll(".preset-category-item");
    const activeCatEl = catItems[targetIdx];
    if (!activeCatEl) return;

    const containerRect = menuContainerRef.getBoundingClientRect();
    const dropdownRect = dropdownRef.getBoundingClientRect();
    const catRect = activeCatEl.getBoundingClientRect();

    const viewportHeight = window.innerHeight || 800;
    const viewportWidth = window.innerWidth || 1200;
    const padding = 12;

    const maxAllowedSubmenuHeight = Math.max(160, viewportHeight - dropdownRect.top - padding);
    submenuMaxHeight = `${maxAllowedSubmenuHeight}px`;

    const submenuElHeight = submenuRef?.offsetHeight || 300;
    const currentSubmenuHeight = Math.min(submenuElHeight, maxAllowedSubmenuHeight);

    let desiredScreenTop = catRect.top;
    if (desiredScreenTop + currentSubmenuHeight > viewportHeight - padding) {
      desiredScreenTop = viewportHeight - padding - currentSubmenuHeight;
    }

    const minScreenTop = dropdownRect.top;
    if (desiredScreenTop < minScreenTop) {
      desiredScreenTop = minScreenTop;
    }

    submenuTop = Math.round(desiredScreenTop - containerRect.top);

    const submenuWidth = submenuRef?.offsetWidth || 260;
    if (dropdownRect.right + submenuWidth > viewportWidth - 8 && dropdownRect.left - submenuWidth > 8) {
      submenuLeft = Math.round(dropdownRect.left - containerRect.left - submenuWidth - 4);
    } else {
      submenuLeft = Math.round(dropdownRect.right - containerRect.left + 4);
    }
  }

  function handleDropdownScroll() {
    if (activeCategoryIdx >= 0 && dropdownRef) {
      const catItems = dropdownRef.querySelectorAll(".preset-category-item");
      const activeCatEl = catItems[activeCategoryIdx];
      if (activeCatEl) {
        const dropdownRect = dropdownRef.getBoundingClientRect();
        const catRect = activeCatEl.getBoundingClientRect();
        // If the active category has scrolled completely out of the dropdown view, close submenu
        if (catRect.bottom < dropdownRect.top || catRect.top > dropdownRect.bottom) {
          activeCategoryIdx = -1;
          focusedSubmenuIdx = -1;
          return;
        }
      }
    }
    updateSubmenuPosition();
  }

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
    "强对流与短临 (Severe Convective & Nowcasting)": "⚡",
    "智能网格预报 (National Gridded Guidance)": "🌐",
    "高密地面与海洋观测 (High-Density Observations)": "📡",
    "数值预报高影响要素 (High-Impact NWP Fields)": "🌪️",
    "实况融合 (Land Surface Reanalysis)": "🗺️",
    "集合预报与概率 (Ensemble & Probability)": "🎲",
    "预报员指导 (Forecaster Guidance)": "🧭",
    "气象卫星遥感 (Satellite Remote Sensing)": "🛰️",
  };

  function getCategoryIcon(name) {
    if (!name) return "📁";
    if (CATEGORY_ICONS[name]) return CATEGORY_ICONS[name];
    const enCat = localizeCategory(name, "en");
    if (CATEGORY_ICONS[enCat]) return CATEGORY_ICONS[enCat];
    const zhCat = localizeCategory(name, "zh");
    if (CATEGORY_ICONS[zhCat]) return CATEGORY_ICONS[zhCat];
    return "📁";
  }

  function formatPresetBadge(preset) {
    if (!preset) return "";
    if (preset.badge) return preset.badge;

    const id = String(preset.id || "").toUpperCase();
    const cat = String(preset.category || "").toUpperCase();
    const layers = Array.isArray(preset.layers) ? preset.layers : [];
    const firstPath = String(layers[0]?.path || layers[0]?.element || "").toUpperCase();

    // 1. Multi-level presets (hasLevel !== false)
    if (preset.hasLevel !== false && (preset.defaultLevel != null || preset.hasLevel)) {
      const lvl = preset.defaultLevel ?? 500;
      const isFy4b =
        id.includes("FY4B") ||
        firstPath.includes("FY4B") ||
        layers.some((l) => String(l?.path || l?.element || "").toUpperCase().includes("FY4B"));
      if (isFy4b) {
        return `C${String(lvl).padStart(3, "0")}`;
      }
      const isMeterHeight =
        id.includes("TDMOSAIC") ||
        firstPath.includes("TDMOSAIC") ||
        (Array.isArray(preset.levels) && preset.levels.some((l) => l > 1050)) ||
        layers.some((l) => String(l?.path || l?.element || "").toUpperCase().includes("TDMOSAIC"));
      if (isMeterHeight) {
        return `${lvl} m`;
      }
      return `${lvl} hPa`;
    }

    let rawBadge = "Sfc";
    if (preset.category?.includes("Derived") ? "Diag" : null) rawBadge = "Diag";
    else if (cat.includes("DERIVED")) rawBadge = "Diag";
    else if (cat.includes("TLOGP")) rawBadge = "Sounding";
    else if (cat.includes("TIME-HEIGHT") || cat.includes("LINE-HEIGHT") || cat.includes("TIME-DISTANCE")) rawBadge = "Profile";
    else if (firstPath.match(/\b(C\d{3})\b/)) rawBadge = firstPath.match(/\b(C\d{3})\b/)[1];
    else if (id.includes("SAT-") || cat.includes("SATELLITE") || firstPath.startsWith("SATELLITE/")) {
      if (firstPath.includes("DUST")) rawBadge = "RGB";
      else if (firstPath.includes("CTT")) rawBadge = "CTT";
      else if (firstPath.includes("QPE")) rawBadge = "Sat QPE";
      else rawBadge = "Sat";
    } else if (firstPath.includes("LIGHTNING") || id.includes("LIGHTNING")) rawBadge = "Ltng";
    else if (firstPath.includes("WIND_PROFILER") || id.includes("WIND-PROFILER") || id.includes("WIND_PROFILER")) rawBadge = "Prof";
    else if (firstPath.startsWith("SWAN_PRODUCT/") || id.includes("SWAN") || firstPath.includes("RADAR")) rawBadge = "Radar";
    else if (firstPath.includes("TROPOPAUSE") || id.includes("TROPOPAUSE")) rawBadge = "Trop";
    else if (firstPath.includes("ZERO_DEGREE") || id.includes("0C-HEIGHT")) rawBadge = "0°C";
    else if (firstPath.includes("100M") || id.includes("100M")) rawBadge = "100m";
    else if (firstPath.includes("CAPE") || firstPath.includes("CIN") || firstPath.includes("TCWV") || firstPath.includes("PWAT") || firstPath.includes("K_INDEX") || firstPath.includes("SWEAT") || firstPath.includes("HELICITY")) {
      rawBadge = "Col";
    } else if (preset.isObservation && cat.includes("UPPER")) rawBadge = "Obs";

    if (currentLocale === "zh" && BADGE_TRANSLATIONS[rawBadge]) {
      return BADGE_TRANSLATIONS[rawBadge].zh;
    }
    return rawBadge;
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
    updateSubmenuPosition(idx);
    activeCategoryIdx = idx;
    focusedCategoryIdx = idx;
    focusedSubmenuIdx = -1;
    tick().then(() => {
      updateSubmenuPosition(idx);
      requestAnimationFrame(() => updateSubmenuPosition(idx));
    });
  }

  function handleCategoryClick(idx) {
    if (activeCategoryIdx === idx) {
      activeCategoryIdx = -1;
      focusedSubmenuIdx = -1;
    } else {
      updateSubmenuPosition(idx);
      activeCategoryIdx = idx;
      focusedCategoryIdx = idx;
      focusedSubmenuIdx = 0;
      tick().then(() => {
        updateSubmenuPosition(idx);
        requestAnimationFrame(() => updateSubmenuPosition(idx));
      });
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
    if (isOpen && activeCategoryIdx >= 0) {
      tick().then(() => {
        updateSubmenuPosition();
        requestAnimationFrame(updateSubmenuPosition);
      });
    }
  });

  $effect(() => {
    if (isOpen && focusedSubmenuIdx >= 0) {
      tick().then(() => {
        const el = submenuRef?.querySelector(".preset-item-btn.focused");
        el?.scrollIntoView?.({ block: "nearest" });
      });
    } else if (isOpen && focusedCategoryIdx >= 0) {
      tick().then(() => {
        const catItems = dropdownRef?.querySelectorAll(".preset-category-item");
        const el = catItems?.[focusedCategoryIdx];
        el?.scrollIntoView?.({ block: "nearest" });
        updateSubmenuPosition();
        requestAnimationFrame(updateSubmenuPosition);
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

    function handleWindowResize() {
      if (isOpen && activeCategoryIdx >= 0) {
        updateSubmenuPosition();
      }
    }

    document.addEventListener("pointerdown", handleClickOutside);
    window.addEventListener("resize", handleWindowResize, { passive: true });
    window.addEventListener("scroll", handleWindowResize, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("scroll", handleWindowResize);
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
    title={t("nav.presets.title")}
  >
    <span class="preset-trigger-icon">📊</span>
    <span class="preset-trigger-label">{t("nav.presets")}</span>
    <span class="preset-trigger-arrow" class:rotated={isOpen}>▾</span>
  </button>

  {#if isOpen}
    <div
      class="preset-dropdown"
      bind:this={dropdownRef}
      onscroll={handleDropdownScroll}
      role="menu"
      aria-label="Preset Categories"
    >
      {#if categories.length === 0}
        <div class="preset-menu-empty">{t("nav.presets.empty")}</div>
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
              <span class="category-name">{localizeCategory(cat.name, currentLocale)}</span>
              <span class="category-count">{cat.presets.length}</span>
              <span class="category-arrow">▸</span>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    {#if activeCategoryIdx >= 0 && categories[activeCategoryIdx]}
      {@const cat = categories[activeCategoryIdx]}
      <div
        class="preset-submenu"
        bind:this={submenuRef}
        role="menu"
        aria-label={localizeCategory(cat.name, currentLocale)}
        style="top: {submenuTop}px; left: {submenuLeft}px; max-height: {submenuMaxHeight};"
      >
        {#each cat.presets as preset, pIdx}
          {@const badgeText = formatPresetBadge(preset)}
          <div
            class="preset-item-btn"
            class:active={preset.id === activePresetId}
            class:focused={focusedSubmenuIdx === pIdx && activeCategoryIdx >= 0}
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
            title={localizeEntityName(preset, currentLocale)}
          >
            <span class="preset-check">{preset.id === activePresetId ? "✓" : ""}</span>
            <span class="preset-name">{localizeEntityName(preset, currentLocale)}</span>
            {#if badgeText}
              <span class="preset-badge">{badgeText}</span>
            {/if}
            <button
              type="button"
              class="btn-pin-preset"
              class:pinned={isPresetPinned(preset.id)}
              title={isPresetPinned(preset.id) ? t("nav.presets.unpin") : t("nav.presets.pin")}
              aria-label={isPresetPinned(preset.id) ? t("nav.presets.unpin") : t("nav.presets.pin")}
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
    border-radius: 6px;
    transition: background-color 0.15s ease;
    flex-shrink: 0;
    overflow: visible;
  }

  .preset-menu-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    height: 28px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.2px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%), var(--bg-card, #21262d);
    color: var(--text-primary, #e6edf3);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
    border-radius: 6px;
    cursor: pointer;
    user-select: none;
    box-sizing: border-box;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .preset-menu-trigger:hover,
  .preset-menu-trigger[aria-expanded="true"] {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%), var(--bg-hover, #30363d);
    border-color: rgba(56, 139, 253, 0.6);
    color: #ffffff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    transform: translateY(-0.5px);
  }

  .preset-menu-trigger[aria-expanded="true"] {
    background: linear-gradient(180deg, rgba(56, 139, 253, 0.24) 0%, rgba(56, 139, 253, 0.12) 100%), var(--bg-card, #21262d);
    border-color: var(--accent-blue, #388bfd);
    color: #79c0ff;
    box-shadow: 0 0 0 2px rgba(56, 139, 253, 0.25), 0 2px 4px rgba(0, 0, 0, 0.25);
  }

  .preset-menu-trigger:active {
    transform: translateY(0.5px);
  }

  .preset-trigger-icon {
    font-size: 13px;
    line-height: 1;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.3));
  }

  .preset-trigger-label {
    letter-spacing: 0.2px;
  }

  .preset-trigger-arrow {
    font-size: 9px;
    opacity: 0.75;
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), color 0.15s ease;
    color: var(--text-secondary, #8b949e);
  }

  .preset-trigger-arrow.rotated {
    transform: rotate(180deg);
    color: #79c0ff;
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

  .preset-dropdown {
    position: absolute;
    top: calc(100% + 5px);
    left: 0;
    min-width: 220px;
    max-height: calc(100vh - var(--navbar-height, 48px) - 16px);
    background: rgba(18, 24, 34, 0.96);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.16));
    border-radius: 8px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.65), 0 2px 6px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08);
    padding: 5px;
    z-index: 1100;
    overflow-y: auto !important;
    overflow-x: hidden;
    animation: proMenuFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  }

  .preset-dropdown::-webkit-scrollbar {
    width: 6px;
  }
  .preset-dropdown::-webkit-scrollbar-track {
    background: transparent;
  }
  .preset-dropdown::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 3px;
  }
  .preset-dropdown::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.28);
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
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary, #e6edf3);
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .preset-category-item:hover > .category-header,
  .preset-category-item.active > .category-header,
  .preset-category-item.focused > .category-header {
    background: linear-gradient(90deg, rgba(56, 139, 253, 0.2) 0%, rgba(56, 139, 253, 0.1) 100%);
    color: #79c0ff;
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
    font-weight: 700;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--text-secondary, #8b949e);
    border-radius: 10px;
    padding: 1px 6px;
    font-family: var(--font-mono, monospace);
    transition: all 0.12s ease;
  }

  .preset-category-item:hover .category-count,
  .preset-category-item.active .category-count,
  .preset-category-item.has-active .category-count {
    background: rgba(56, 139, 253, 0.18);
    border-color: rgba(56, 139, 253, 0.35);
    color: #79c0ff;
  }

  .category-arrow {
    font-size: 10px;
    color: var(--text-secondary, #8b949e);
    flex-shrink: 0;
  }

  .preset-submenu {
    position: absolute;
    min-width: 260px;
    max-height: calc(100vh - var(--navbar-height, 48px) - 24px);
    overflow-y: auto !important;
    overflow-x: hidden;
    background: rgba(18, 24, 34, 0.96);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.16));
    border-radius: 8px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.7), 0 2px 6px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08);
    padding: 5px;
    z-index: 1110;
    animation: proMenuFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  }

  .preset-submenu::before,
  .preset-submenu::after {
    content: "";
    position: absolute;
    top: 0;
    width: 10px;
    height: 100%;
    background: transparent;
    pointer-events: auto;
  }

  .preset-submenu::before {
    left: -10px;
  }

  .preset-submenu::after {
    right: -10px;
  }

  .preset-submenu::-webkit-scrollbar {
    width: 6px;
  }
  .preset-submenu::-webkit-scrollbar-track {
    background: transparent;
  }
  .preset-submenu::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 3px;
  }
  .preset-submenu::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.28);
  }

  .preset-item-btn {
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
    gap: 8px;
    outline: none;
    box-sizing: border-box;
    transition: all 0.12s ease;
  }

  .preset-item-btn:hover,
  .preset-item-btn.focused {
    background: linear-gradient(90deg, rgba(56, 139, 253, 0.22) 0%, rgba(56, 139, 253, 0.12) 100%);
    color: #79c0ff;
  }

  .preset-item-btn.active {
    font-weight: 600;
    color: #58a6ff;
    background: rgba(56, 139, 253, 0.18);
    border: 1px solid rgba(56, 139, 253, 0.3);
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
    font-weight: 600;
    font-family: var(--font-mono, monospace);
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(56, 139, 253, 0.15);
    border: 1px solid rgba(56, 139, 253, 0.3);
    color: #79c0ff;
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
