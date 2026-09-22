<script>
  import { ui } from "../lib/stores/ui.svelte.js";
  import { buildLegendItems } from "../lib/stores/legendCore.js";
  import { legends } from "../lib/stores/legend.svelte.js";

  let { winId = "default" } = $props();

  // Reactive trigger on legends store mutations
  let items = $derived.by(() => {
    const _ = legends[winId];
    return buildLegendItems(winId);
  });
</script>

{#if !ui.configOpen && items && items.length > 0}
  <div id="legend-panel" class="legend-panel" role="region" aria-label="Map Legends">
    {#each items as item}
      <div class="legend-item">
        <div class="legend-header">
          <span class="legend-title">{item.displayTitle}</span>
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
    font-weight: 600;
    font-size: 11px;
    color: var(--text-primary, #e6edf3);
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
