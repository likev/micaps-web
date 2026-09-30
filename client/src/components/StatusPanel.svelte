<script>
  import { resolveAllLayersForStatus } from "../utils/timeResolver.js";
  import { formatOffset } from "../utils/timeResolver.js";

  let {
    layers = [],
    cursorTime = null,
    onToggleVisible = null,
    onToggleAutoHide = null,
    autoHideStale = false,
  } = $props();

  let resolvedLayers = $derived.by(() => {
    const cur = cursorTime || (typeof window !== "undefined" && window.__MICAPS_CURSOR__) || Date.now();
    return resolveAllLayersForStatus(layers, cur);
  });

  let currentCount = $derived(resolvedLayers.filter((r) => r.status === "current").length);
  let softStaleCount = $derived(resolvedLayers.filter((r) => r.status === "soft-stale").length);
  let hardStaleCount = $derived(resolvedLayers.filter((r) => r.status === "hard-stale").length);
  let desyncCount = $derived(resolvedLayers.filter((r) => r.status === "desync").length);
</script>

<div class="status-panel" aria-label="Layer Observation Age and Staleness Status">
  <div class="status-summary-bar">
    <div class="status-counters">
      {#if currentCount > 0}
        <span class="count-pill pill-current" title="{currentCount} layer(s) current within tolerance">
          <span class="dot">●</span> {currentCount} Current
        </span>
      {/if}
      {#if desyncCount > 0}
        <span class="count-pill pill-desync" title="{desyncCount} layer(s) intentionally desynced">
          <span class="dot">◆</span> {desyncCount} Desync
        </span>
      {/if}
      {#if softStaleCount > 0}
        <span class="count-pill pill-soft-stale" title="{softStaleCount} layer(s) past tolerance">
          <span class="dot">◐</span> {softStaleCount} Soft Stale
        </span>
      {/if}
      {#if hardStaleCount > 0}
        <span class="count-pill pill-hard-stale" title="{hardStaleCount} layer(s) far past tolerance or gap">
          <span class="dot">○</span> {hardStaleCount} Stale
        </span>
      {/if}
    </div>

    <label class="auto-hide-toggle" title="Automatically hide hard stale layers on the map (§2.4)">
      <input
        type="checkbox"
        checked={autoHideStale}
        onchange={(e) => onToggleAutoHide && onToggleAutoHide(e.target.checked)}
      />
      <span>Auto-hide Stale</span>
    </label>
  </div>

  {#if autoHideStale && hardStaleCount > 0}
    <div class="stale-hidden-chip-bar" role="status">
      <span class="stale-hidden-chip">
        ⚠️ {hardStaleCount} layer{hardStaleCount > 1 ? "s" : ""} hidden (stale)
        <button
          type="button"
          class="btn-unhide-stale"
          onclick={() => onToggleAutoHide && onToggleAutoHide(false)}
        >Show</button>
      </span>
    </div>
  {/if}

  <div class="status-table">
    <div class="table-header">
      <span class="col-layer">Layer</span>
      <span class="col-time">Obs Time</span>
      <span class="col-age">Age</span>
      <span class="col-status">Status</span>
    </div>

    <div class="table-body">
      {#each resolvedLayers as item (item.layer.id)}
        <div
          class="status-row"
          class:row-desync={item.isDesync}
          class:row-soft-stale={item.status === 'soft-stale'}
          class:row-hard-stale={item.isHardStale}
          class:row-hidden={!item.layer.visible}
        >
          <div class="col-layer">
            <button
              type="button"
              class="btn-row-vis"
              title={item.layer.visible ? "Hide Layer" : "Show Layer"}
              onclick={() => onToggleVisible && onToggleVisible(item.layer)}
            >
              {item.layer.visible ? "👁" : "🚫"}
            </button>
            {#if item.layer.color}
              <span class="color-dot" style:background-color={item.layer.color}></span>
            {/if}
            <span class="layer-title" title={item.layer.name}>{item.layer.name}</span>
          </div>

          <div class="col-time" title="{item.actualTimeStr} (Policy: {item.policy})">
            {item.actualTimeZ}
          </div>

          <div class="col-age" title="Offset from cursor moment: {item.ageMinutes} minutes">
            {item.ageStr}
          </div>

          <div class="col-status">
            <span
              class="status-pill"
              class:pill-desync={item.isDesync}
              class:pill-soft-stale={item.status === 'soft-stale'}
              class:pill-hard-stale={item.isHardStale}
              title="{item.statusText} (Tolerance: {item.toleranceMinutes}m)"
            >
              <span class="status-dot">{item.statusIcon}</span>
              <span class="status-name">
                {#if item.isDesync}
                  {formatOffset(item.offsetMinutes)}
                {:else if item.isHardStale}
                  Stale
                {:else if item.status === 'soft-stale'}
                  Soft
                {:else}
                  Current
                {/if}
              </span>
            </span>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .status-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 11px;
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  }

  .status-summary-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .status-counters {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .count-pill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 9.5px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.08);
  }

  .pill-current {
    color: #3fb950;
    background: rgba(63, 185, 80, 0.15);
  }

  .pill-desync {
    color: #79c0ff;
    background: rgba(56, 139, 253, 0.15);
  }

  .pill-soft-stale {
    color: #e3b341;
    background: rgba(210, 153, 34, 0.15);
  }

  .pill-hard-stale {
    color: #ff7b72;
    background: rgba(248, 81, 73, 0.15);
  }

  .auto-hide-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: var(--text-secondary, #8b949e);
    cursor: pointer;
    user-select: none;
  }

  .status-table {
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    overflow: hidden;
    background: rgba(13, 17, 23, 0.6);
  }

  .table-header {
    display: flex;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.04);
    font-size: 10px;
    font-weight: 600;
    color: var(--text-secondary, #8b949e);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .table-body {
    display: flex;
    flex-direction: column;
    max-height: 320px;
    overflow-y: auto;
  }

  .status-row {
    display: flex;
    align-items: center;
    padding: 5px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    transition: background 0.15s ease;
  }

  .status-row:last-child {
    border-bottom: none;
  }

  .status-row:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .status-row.row-hidden {
    opacity: 0.5;
  }

  .col-layer {
    flex: 1.4;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .col-time {
    flex: 0.8;
    font-family: var(--font-mono, monospace);
    font-size: 10.5px;
    color: var(--text-primary, #e6edf3);
    white-space: nowrap;
  }

  .col-age {
    flex: 0.7;
    font-family: var(--font-mono, monospace);
    font-size: 10.5px;
    color: var(--text-secondary, #8b949e);
    white-space: nowrap;
  }

  .col-status {
    flex: 0.9;
    display: flex;
    justify-content: flex-end;
  }

  .layer-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-primary, #e6edf3);
  }

  .color-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .btn-row-vis {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 11px;
    padding: 0;
    line-height: 1;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 9.5px;
    padding: 1px 6px;
    border-radius: 10px;
    background: rgba(63, 185, 80, 0.15);
    color: #3fb950;
    border: 1px solid transparent;
  }

  .status-pill.pill-desync {
    background: rgba(56, 139, 253, 0.15);
    border-color: rgba(56, 139, 253, 0.4);
    color: #79c0ff;
  }

  .status-pill.pill-soft-stale {
    background: rgba(210, 153, 34, 0.15);
    border-color: rgba(210, 153, 34, 0.4);
    color: #e3b341;
  }

  .status-pill.pill-hard-stale {
    background: rgba(248, 81, 73, 0.15);
    border-color: rgba(248, 81, 73, 0.4);
    color: #ff7b72;
  }

  .status-dot {
    font-size: 8px;
    line-height: 1;
  }

  .stale-hidden-chip-bar {
    padding: 2px 0;
  }

  .stale-hidden-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 600;
    color: #ff7b72;
    background: rgba(248, 81, 73, 0.12);
    border: 1px solid rgba(248, 81, 73, 0.3);
    padding: 2px 8px;
    border-radius: 6px;
  }

  .btn-unhide-stale {
    background: rgba(248, 81, 73, 0.25);
    border: 1px solid rgba(248, 81, 73, 0.45);
    color: #ff7b72;
    border-radius: 3px;
    font-size: 9px;
    cursor: pointer;
    padding: 1px 4px;
    margin-left: 4px;
  }

  .btn-unhide-stale:hover {
    background: rgba(248, 81, 73, 0.4);
  }
</style>
