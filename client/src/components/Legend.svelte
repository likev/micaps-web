<script>
  import { onMount, onDestroy } from "svelte";
  import { ui } from "../lib/stores/ui.svelte.js";
  import { buildLegendItems, setSvelteLegendOwner } from "../lib/stores/legendCore.js";
  import { legends, syncLegendState } from "../lib/stores/legend.svelte.js";

  let { winId = "default" } = $props();

  onMount(() => {
    // Claim #legend-panel ownership so legacy direct-DOM writes stand down
    // (single renderer: this component, fed by the store bridge).
    setSvelteLegendOwner(true);
    try { syncLegendState(winId); } catch {}
  });
  onDestroy(() => {
    setSvelteLegendOwner(false);
  });

  // Reactive trigger on legends store mutations
  let items = $derived.by(() => {
    const _ = legends[winId];
    return buildLegendItems(winId);
  });
</script>

{#if !ui.configOpen && items && items.length > 0}
  <div id="legend-panel" class="legend-panel" role="region" aria-label="Map Legends">
    {#each items as item (item.key || item.layerId || item.element)}
      <div class="legend-item">
        <div class="legend-header">
          <div class="legend-title-group">
            <span class="legend-title">{item.displayTitle}</span>
            {#if item.timeBadge}
              <span
                class="legend-time-badge"
                class:status-desync={item.isDesync}
                class:status-soft-stale={item.status === "soft-stale"}
                class:status-hard-stale={item.isHardStale}
                title="{item.statusText}: {item.resolvedTimeZ} ({item.ageStr})"
              >
                <span class="legend-status-dot" style:color={item.statusColor}>{item.statusIcon}</span>
                <span class="legend-time-text">{item.timeBadge}</span>
              </span>
            {/if}
          </div>
          <span class="legend-unit">{item.unit ? `(${item.unit})` : ""}</span>
        </div>
        <div
          class="legend-bar"
          role="img"
          aria-label="{item.element} color scale {item.zMin ?? ''} to {item.zMax ?? ''} {item.unit}"
          style:background={item.gradient || "rgba(255,255,255,0.08)"}
        ></div>
        <div class="legend-ticks">
          {#each item.tickLabels as tick}
            <span>{tick}</span>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{:else}
  <div id="legend-panel" class="legend-panel hidden"></div>
{/if}

<style>
  .legend-panel {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-panel, rgba(18, 24, 36, 0.88));
    backdrop-filter: blur(12px);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 6px;
    padding: 8px 12px;
    z-index: 500;
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 11px;
    font-family: var(--font-mono, monospace);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    max-width: min(90%, 720px);
    max-height: 120px;
    overflow: auto;
  }

  .legend-panel.hidden,
  .legend-panel:empty {
    display: none;
  }

  .legend-item {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 170px;
  }

  .legend-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    font-size: 11px;
    color: var(--text-primary, #e6edf3);
    gap: 8px;
  }

  .legend-title-group {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .legend-time-badge {
    font-size: 9.5px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.07);
    color: var(--text-secondary, #8b949e);
    font-weight: 500;
    white-space: nowrap;
    line-height: 1.3;
    border: 1px solid transparent;
  }

  .legend-time-badge.status-desync {
    background: rgba(56, 139, 253, 0.15);
    border-color: rgba(56, 139, 253, 0.45);
    color: #79c0ff;
  }

  .legend-time-badge.status-soft-stale {
    background: rgba(210, 153, 34, 0.15);
    border-color: rgba(210, 153, 34, 0.35);
    color: #e3b341;
  }

  .legend-time-badge.status-hard-stale {
    background: rgba(248, 81, 73, 0.18);
    border-color: rgba(248, 81, 73, 0.45);
    color: #ff7b72;
  }

  .legend-status-dot {
    font-size: 8px;
    line-height: 1;
  }

  .legend-bar {
    height: 10px;
    width: 100%;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .legend-ticks {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--text-secondary, #8b949e);
  }
</style>
