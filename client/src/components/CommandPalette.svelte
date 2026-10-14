<script>
  import { onMount, tick } from "svelte";
  import { ui } from "../lib/stores/ui.svelte.js";
  import { searchStations, jumpToStation } from "../utils/stationJump.js";
  import { setGlobalTheme, setGlobalProjection } from "../lib/stores/theme.svelte.js";
  import { captureScreenshot, handlePrint } from "../utils/screenshot.js";
  import { isDivider, PRESET_GROUPS } from "../config/presets.js";
  import { mapInstances } from "../lib/stores/tabs.svelte.js";

  let {
    presetGroups = [],
    activeMap = null,
    onSelectPreset = null,
    onSelectLayout = null,
    onOpenConfig = null,
  } = $props();

  let query = $state("");
  let selectedIdx = $state(0);
  let inputRef = $state(null);
  let resultsContainerRef = $state(null);

  let effectivePresets = $derived(presetGroups && presetGroups.length > 0 ? presetGroups : PRESET_GROUPS);

  const ACTIONS = [
    { id: "act-split-1x1", title: "Layout: Split 1x1 (Single View)", category: "Actions", icon: "⬛", execute: () => onSelectLayout && onSelectLayout("1x1") },
    { id: "act-split-1x2", title: "Layout: Split 1x2 (Dual Horizontal)", category: "Actions", icon: "⬒", execute: () => onSelectLayout && onSelectLayout("1x2") },
    { id: "act-split-2x2", title: "Layout: Split 2x2 (Quad Grid)", category: "Actions", icon: "⊞", execute: () => onSelectLayout && onSelectLayout("2x2") },
    { id: "act-split-2x3", title: "Layout: Split 2x3 (6-Window Grid)", category: "Actions", icon: "⊞", execute: () => onSelectLayout && onSelectLayout("2x3") },
    { id: "act-split-3x2", title: "Layout: Split 3x2 (6-Window Grid)", category: "Actions", icon: "⊞", execute: () => onSelectLayout && onSelectLayout("3x2") },
    { id: "act-screenshot", title: "Capture Map Screenshot", category: "Actions", icon: "📷", execute: () => captureScreenshot() },
    { id: "act-print", title: "Print Forecast Chart", category: "Actions", icon: "🖨", execute: () => handlePrint() },
    { id: "act-toggle-layers", title: "Toggle Layers Panel", category: "Actions", icon: "📑", execute: () => { ui.layersOpen = !ui.layersOpen; } },
    { id: "act-open-config", title: "Open Configuration Editor", category: "Actions", icon: "⚙", execute: () => { if (onOpenConfig) onOpenConfig(); else ui.configOpen = true; } },
    { id: "act-help", title: "Open Keyboard Shortcuts Help", category: "Actions", icon: "⌨️", execute: () => { ui.helpModalOpen = true; } },
    { id: "act-theme-light", title: "Theme: Light (Paper)", category: "Theme", icon: "☀️", execute: () => setGlobalTheme("light") },
    { id: "act-theme-dark", title: "Theme: Dark (Ink)", category: "Theme", icon: "🌙", execute: () => setGlobalTheme("dark") },
    { id: "act-theme-brutalism", title: "Theme: Brutalism", category: "Theme", icon: "🟨", execute: () => setGlobalTheme("brutalism") },
    { id: "act-proj-mercator", title: "Projection: Mercator (2D)", category: "Projection", icon: "🗺️", execute: () => setGlobalProjection("mercator") },
    { id: "act-proj-globe", title: "Projection: Globe (3D)", category: "Projection", icon: "🌐", execute: () => setGlobalProjection("globe") },
    { id: "act-proj-perspective", title: "Projection: Vertical Perspective", category: "Projection", icon: "🪐", execute: () => setGlobalProjection("vertical-perspective") },
  ];

  let filteredResults = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = [];

    // 1. Actions match
    for (const act of ACTIONS) {
      if (!q || act.title.toLowerCase().includes(q) || act.category.toLowerCase().includes(q)) {
        list.push({ type: "action", ...act });
      }
    }

    // 2. Presets match
    const validPresets = (effectivePresets || []).filter((g) => g && !isDivider(g));
    for (const p of validPresets) {
      const nameMatch = p.name && p.name.toLowerCase().includes(q);
      const catMatch = p.category && p.category.toLowerCase().includes(q);
      const idMatch = p.id && p.id.toLowerCase().includes(q);
      if (!q || nameMatch || catMatch || idMatch) {
        list.push({
          type: "preset",
          id: p.id,
          title: p.name,
          subtitle: p.category || "Preset",
          icon: "📊",
          preset: p,
          execute: () => {
            if (onSelectPreset) onSelectPreset(p);
          },
        });
      }
    }

    // 3. Station search match
    if (q) {
      const stations = searchStations(q, 6);
      for (const st of stations) {
        list.push({
          type: "station",
          id: `st-${st.id}`,
          title: `${st.id} - ${st.name}`,
          subtitle: `Lat: ${st.lat.toFixed(1)}°, Lon: ${st.lon.toFixed(1)}° (${st.source})`,
          icon: "📍",
          station: st,
          execute: () => {
            const targetMap = activeMap || (typeof window !== "undefined" && window.__ACTIVE_MAP__) || (mapInstances && typeof mapInstances.values === "function" ? mapInstances.values().next().value : null);
            if (targetMap) {
              jumpToStation(targetMap, st);
            }
          },
        });
      }
    }

    return list.slice(0, 30);
  });

  $effect(() => {
    if (ui.commandPaletteOpen) {
      query = "";
      selectedIdx = 0;
      tick().then(() => {
        inputRef?.focus?.();
      });
    }
  });

  function close() {
    ui.commandPaletteOpen = false;
  }

  function executeItem(item) {
    if (!item) return;
    close();
    try {
      item.execute();
    } catch (err) {
      console.warn("[CommandPalette] execution error:", err);
    }
  }

  function handleKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredResults.length > 0) {
        selectedIdx = (selectedIdx + 1) % filteredResults.length;
        scrollSelectedIntoView();
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredResults.length > 0) {
        selectedIdx = (selectedIdx - 1 + filteredResults.length) % filteredResults.length;
        scrollSelectedIntoView();
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredResults[selectedIdx]) {
        executeItem(filteredResults[selectedIdx]);
      }
    }
  }

  function scrollSelectedIntoView() {
    tick().then(() => {
      const el = resultsContainerRef?.querySelector?.(`.cmd-result-item[data-idx="${selectedIdx}"]`);
      if (el) {
        el.scrollIntoView({ block: "nearest" });
      }
    });
  }

  function handleOverlayClick(e) {
    if (e.target.classList.contains("cmd-palette-backdrop")) {
      close();
    }
  }
</script>

{#if ui.commandPaletteOpen}
  <div
    class="cmd-palette-backdrop command-palette-backdrop"
    role="dialog"
    aria-modal="true"
    aria-label="Command Palette"
    onclick={handleOverlayClick}
    onkeydown={handleKeydown}
    tabindex="-1"
  >
    <div id="command-palette-modal" class="cmd-palette-modal">
      <div class="cmd-palette-search">
        <span class="cmd-search-icon">🔍</span>
        <input
          id="cmd-palette-input"
          class="cmd-input"
          type="text"
          placeholder="Type a command, preset, or station ID (e.g. 54511)..."
          bind:this={inputRef}
          bind:value={query}
          oninput={() => { selectedIdx = 0; }}
        />
        <kbd class="cmd-kbd-esc" onclick={close}>ESC</kbd>
      </div>

      <div class="cmd-palette-results" bind:this={resultsContainerRef} role="listbox">
        {#if filteredResults.length === 0}
          <div class="cmd-empty">No matching presets, stations, or actions found.</div>
        {:else}
          {#each filteredResults as item, idx}
            <div
              class="cmd-result-item"
              class:selected={selectedIdx === idx}
              data-idx={idx}
              role="option"
              aria-selected={selectedIdx === idx}
              tabindex="-1"
              onmouseenter={() => { selectedIdx = idx; }}
              onclick={() => executeItem(item)}
            >
              <span class="item-icon">{item.icon}</span>
              <div class="item-details">
                <span class="item-title">{item.title}</span>
                {#if item.subtitle}
                  <span class="item-subtitle">{item.subtitle}</span>
                {/if}
              </div>
              <span class="item-type-badge">{item.type}</span>
            </div>
          {/each}
        {/if}
      </div>

      <div class="cmd-palette-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
        <span><kbd>↵</kbd> Select</span>
        <span><kbd>ESC</kbd> Close</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .cmd-palette-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    z-index: 9999;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 100px;
    outline: none;
  }

  .cmd-palette-modal {
    width: 600px;
    max-width: calc(100vw - 32px);
    background: var(--bg-secondary, #161b22);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
    border-radius: 8px;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.65);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .cmd-palette-search {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    gap: 10px;
    background: var(--bg-header, #0d1117);
  }

  .cmd-search-icon {
    font-size: 16px;
    opacity: 0.8;
  }

  .cmd-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-size: 15px;
    color: var(--text-primary, #e6edf3);
    font-family: inherit;
  }

  .cmd-kbd-esc {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    font-family: var(--font-mono, monospace);
    color: var(--text-secondary, #8b949e);
    cursor: pointer;
  }

  .cmd-palette-results {
    max-height: 380px;
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .cmd-empty {
    padding: 24px 16px;
    text-align: center;
    color: var(--text-secondary, #8b949e);
    font-size: 13px;
  }

  .cmd-result-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.12s ease;
    user-select: none;
  }

  .cmd-result-item:hover,
  .cmd-result-item.selected {
    background: rgba(56, 139, 253, 0.2);
  }

  .item-icon {
    font-size: 16px;
    width: 22px;
    text-align: center;
    flex-shrink: 0;
  }

  .item-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
  }

  .item-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary, #e6edf3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-subtitle {
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-type-badge {
    font-size: 10px;
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.5px;
    padding: 2px 6px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    color: var(--text-secondary, #8b949e);
    flex-shrink: 0;
  }

  .cmd-palette-footer {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 16px;
    background: var(--bg-footer, #0d1117);
    border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
  }

  .cmd-palette-footer kbd {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 3px;
    padding: 1px 4px;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--text-primary, #e6edf3);
    margin-right: 4px;
  }
</style>
