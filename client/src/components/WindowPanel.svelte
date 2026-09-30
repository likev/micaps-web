<script>
  import MapViewport from "../map/MapViewport.svelte";
  import { getLayersForWindow } from "../lib/stores/layersCore.js";
  import { resolveAllLayersForStatus, parseTimestamp } from "../utils/timeResolver.js";

  let {
    win,
    isActive = false,
    isVisible = true,
    onFocus = null,
    onToggleMax = null,
    onMapCreated = null,
    onMapDestroyed = null,
  } = $props();

  let effectiveCursor = $derived.by(() => {
    return win?.wallClockCursor ||
      (win?.obsTime ? parseTimestamp(win.obsTime) : null) ||
      (win?.forecastCycle ? parseTimestamp({ cycle: win.forecastCycle, period: win.period ?? 0 }) : null) ||
      (typeof window !== "undefined" && window.__MICAPS_CURSOR__) ||
      Date.now();
  });

  $effect(() => {
    if (isActive && typeof window !== "undefined" && effectiveCursor) {
      window.__MICAPS_CURSOR__ = effectiveCursor;
    }
  });

  let layers = $derived(getLayersForWindow(win?.id) || []);
  let resolvedLayers = $derived(resolveAllLayersForStatus(layers, effectiveCursor));
  let hardStaleLayers = $derived(resolvedLayers.filter((r) => r.isHardStale && r.layer?.visible !== false));

  let winTitle = $derived.by(() => {
    if (!win) return "";
    // Strip any stale "Wn: " prefix: the badge already shows Wn, and the
    // prefix is derived at render time so drag-reorder stays consistent.
    const stripPrefix = (t) => String(t || "").replace(/^W\d+:\s*/, "");
    if (win.title) return stripPrefix(win.title);
    if (win.activeGroup?.name) return stripPrefix(win.activeGroup.name);
    if (win.model && win.element) {
      const isUpper = win.model === "UPPER_AIR" || (typeof win.element === "string" && win.element.includes("UPPER"));
      if (win.isObservation) {
        return isUpper ? `${win.level || 500} hPa Sounding (${win.model})` : `${win.element} (${win.model})`;
      }
      return `${win.level ? `${win.level} hPa ` : ""}${win.element} (${win.model})`;
    }
    return `Window ${win.winIdx + 1}`;
  });

</script>

<div
  class="window-panel"
  class:active={isActive}
  class:hidden={!isVisible}
  class:slot-visible={isVisible}
  data-win-id={win.id}
  id={win.panelId || `win-panel-${win.tabId || 1}-${win.uid ?? win.winIdx}`}
  tabindex="-1"
  onpointerdown={() => onFocus && onFocus(win)}
  onclick={() => onFocus && onFocus(win)}
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

    {#if hardStaleLayers.length > 0}
      <div class="stale-viewport-hatch" aria-hidden="true"></div>
      <div class="stale-corner-badges" role="status" aria-label="Stale Layer Warnings">
        {#each hardStaleLayers as item (item.layer.id)}
          <div class="stale-badge" title="Hard stale: observation is {Math.abs(item.ageMinutes)}m old">
            <span class="stale-badge-icon">⚠️</span>
            <span class="stale-badge-text">{item.layer.name}: {Math.abs(item.ageMinutes)} min old (stale)</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .stale-viewport-hatch {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 405;
    background: repeating-linear-gradient(
      -45deg,
      rgba(248, 81, 73, 0.05),
      rgba(248, 81, 73, 0.05) 10px,
      rgba(0, 0, 0, 0) 10px,
      rgba(0, 0, 0, 0) 20px
    );
  }

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
    z-index: 450;
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

  .stale-corner-badges {
    position: absolute;
    top: 50px;
    right: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 400;
    pointer-events: none;
    max-width: 280px;
  }

  .stale-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 6px;
    background: rgba(30, 16, 20, 0.88);
    border: 1px solid rgba(248, 81, 73, 0.6);
    backdrop-filter: blur(8px);
    color: #ff7b72;
    font-size: 11px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  }

  .stale-badge-icon {
    font-size: 12px;
  }

  .stale-badge-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>

