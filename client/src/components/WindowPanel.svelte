<script>
  import MapViewport from "../map/MapViewport.svelte";
  import Legend from "./Legend.svelte";
  import { getLayersForWindow } from "../lib/stores/layersCore.js";
  import { resolveAllLayersForStatus, parseTimestamp, getReferenceNowMs } from "../utils/timeResolver.js";
  import { getGlobalLocale, localizeEntityName, splitBilingualString } from "../lib/stores/i18nCore.js";
  import { t } from "../lib/stores/i18n.svelte.js";

  let {
    win,
    isActive = false,
    isVisible = true,
    perWindowLegend = false,
    isMaximizedPreview = false,
    onFocus = null,
    onToggleMax = null,
    onPin = null,
    onAdoptAndCollapse = null,
    onMapCreated = null,
    onMapDestroyed = null,
  } = $props();

  let effectiveCursor = $derived.by(() => {
    if (win?.isObservation) {
      return (
        win?.wallClockCursor ||
        (win?.obsTime ? parseTimestamp(win.obsTime) : null) ||
        (typeof window !== "undefined" && window.__MICAPS_CURSOR__) ||
        getReferenceNowMs()
      );
    }
    const nwpValidTime = win?.forecastCycle
      ? parseTimestamp({ cycle: win.forecastCycle, period: win.period ?? 0 })
      : null;
    return (
      nwpValidTime ||
      win?.wallClockCursor ||
      (typeof window !== "undefined" && window.__MICAPS_CURSOR__) ||
      getReferenceNowMs()
    );
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
    const locale = getGlobalLocale();
    const stripPrefix = (t) => String(t || "").replace(/^W\d+:\s*/, "");
    let rawTitle = win.title ? stripPrefix(win.title) : (win.activeGroup ? localizeEntityName(win.activeGroup, locale) : "");
    if (!rawTitle && win.model && win.element) {
      rawTitle = `${win.element} (${win.model})`;
    }
    if (!rawTitle) return `Window ${win.winIdx + 1}`;
    rawTitle = splitBilingualString(rawTitle, locale);

    const isFy4b =
      win.model === "SATELLITE" ||
      /FY4B/i.test(String(win.activeGroup?.id || "")) ||
      (Array.isArray(win.layers) && win.layers.some((l) => /FY4B/i.test(String(l?.path || l?.element || ""))));
    const isMeterHeight =
      /TDMOSAIC/i.test(String(win.activeGroup?.id || "")) ||
      (Array.isArray(win.levels) && win.levels.some((l) => l > 1050)) ||
      (Array.isArray(win.layers) && win.layers.some((l) => /TDMOSAIC/i.test(String(l?.path || l?.element || ""))));
    const isSurface = win.model === "SURFACE" || win.level === 0 || win.activeGroup?.hasLevel === false;

    const levelStr = (!isSurface && win.level != null)
      ? (isFy4b
          ? `C${String(win.level).padStart(3, "0")}`
          : (isMeterHeight ? `${win.level} m` : `${win.level} hPa`))
      : "";

    if (levelStr && !rawTitle.includes(levelStr) && !rawTitle.includes(String(win.level)) && !rawTitle.toLowerCase().includes("surface")) {
      rawTitle = `${rawTitle} - ${levelStr}`;
    }
    return rawTitle;
  });

</script>

<div
  class="window-panel tabpanel"
  role="tabpanel"
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
      {#if win?.isAutoAllocated && !win?.isPinned}
        {#if onPin}
          <button
            type="button"
            id={`win-pin-${win.tabId || 1}-${win.uid ?? win.winIdx}`}
            class="win-btn-action win-btn-pin"
            title={t("tabs.pin")}
            aria-label="Pin as permanent tab"
            onclick={(e) => {
              e.stopPropagation();
              if (onPin) onPin(win);
            }}
          >📌</button>
        {/if}
        {#if onAdoptAndCollapse}
          <button
            type="button"
            id={`win-adopt-${win.tabId || 1}-${win.uid ?? win.winIdx}`}
            class="win-btn-action win-btn-adopt"
            title="Adopt into Initiator tab & exit split (Alt+Enter)"
            aria-label="Adopt into Initiator tab and exit split"
            onclick={(e) => {
              e.stopPropagation();
              if (onAdoptAndCollapse) onAdoptAndCollapse(win);
            }}
          >✓</button>
        {/if}
      {/if}
      <button
        type="button"
        id={win.maxBtnId || `win-max-${win.tabId || 1}-${win.uid ?? win.winIdx}`}
        class="win-btn-max"
        class:active={isMaximizedPreview}
        title={isMaximizedPreview ? (getGlobalLocale() === "zh" ? "返回多窗分割 (F4)" : "Return to Split Grid (F4)") : t("window.expand")}
        aria-label="Maximize Window"
        onclick={(e) => {
          e.stopPropagation();
          if (onFocus) onFocus(win);
          if (onToggleMax) onToggleMax(win);
        }}
      >{isMaximizedPreview ? "⊞" : "⛶"}</button>
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

    {#if perWindowLegend}
      <Legend winId={win.id} perWindow={true} />
    {/if}

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
    background: var(--bg-card, #0d1117);
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
    background: var(--bg-hover, rgba(22, 27, 34, 0.95));
    border-color: var(--border-color, rgba(255, 255, 255, 0.22));
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

  .win-btn-max:hover,
  .win-btn-max.active {
    color: #58a6ff;
    background: rgba(56, 139, 253, 0.18);
  }

  .win-btn-action {
    background: transparent;
    border: none;
    color: #8b949e;
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    padding: 2px 5px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s ease, background 0.15s ease;
  }

  .win-btn-pin:hover {
    color: #79c0ff;
    background: rgba(56, 139, 253, 0.2);
  }

  .win-btn-adopt {
    color: #56d364;
  }

  .win-btn-adopt:hover {
    color: #7ee787;
    background: rgba(46, 160, 67, 0.22);
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

