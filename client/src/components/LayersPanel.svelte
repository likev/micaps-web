<script>
  import { ui } from "../lib/stores/ui.svelte.js";
  import {
    layersByWindow,
    syncLayersState,
    getLayers,
    addLayer,
    deleteLayer,
    getCurrentActiveWinId,
    getCurrentActiveWinTitle,
  } from "../lib/stores/layers.svelte.js";
  import { getWindowById } from "../lib/stores/tabs.svelte.js";
  import LayerRow from "./LayerRow.svelte";

  let { winId = null, onLayerAction = null } = $props();

  let activeWinId = $derived(winId || getCurrentActiveWinId());
  let winObj = $derived(getWindowById(activeWinId));
  let winTitle = $derived(
    winObj
      ? (winObj.title
        ? (winObj.title.startsWith("W") ? winObj.title : `W${winObj.winIdx + 1}: ${winObj.title}`)
        : (winObj.activeGroup ? `W${winObj.winIdx + 1}: ${winObj.activeGroup.name}` : `Window ${winObj.winIdx + 1}`))
      : getCurrentActiveWinTitle()
  );

  $effect(() => {
    if (activeWinId && !layersByWindow[activeWinId]) {
      syncLayersState(activeWinId);
    }
  });

  let layers = $derived(getLayers(activeWinId) || []);
  let count = $derived(layers.length);

  // Hidden compatibility states for automated tests
  let contourLayer = $derived(layers.find((l) => l.type === "contour"));
  let stationLayer = $derived(layers.find((l) => l.type === "station"));
  let pmtilesLayer = $derived(layers.find((l) => l.type === "pmtiles"));
  let isobandVis = $derived(contourLayer ? contourLayer.visible && contourLayer.config?.showFill !== false : true);
  let isolineVis = $derived(contourLayer ? contourLayer.visible && contourLayer.config?.showLine !== false : true);
  let stationVis = $derived(stationLayer ? stationLayer.visible : true);
  let pmtilesVis = $derived(pmtilesLayer ? pmtilesLayer.visible : true);
  let hasRaster = $derived(layers.some((l) => l.visible && l.config?.showRaster));
  let hasWind = $derived(layers.some((l) => l.visible && l.config?.showWind));
  let opacityVal = $derived(Math.round((contourLayer?.config?.opacity ?? 0.75) * 100));

  function handleToggleVisible(layer) {
    layer.visible = !layer.visible;
    if (onLayerAction) {
      onLayerAction({ action: "toggleVisibility", layer, visible: layer.visible });
    }
  }

  function handleToggleExpanded(layerId) {
    ui.expandedLayerId = ui.expandedLayerId === layerId ? null : layerId;
  }

  function handleRemoveLayer(layer) {
    deleteLayer(layer.id, activeWinId);
    if (onLayerAction) {
      onLayerAction({ action: "remove", layer });
    }
  }

  function handleRowAction(event) {
    if (onLayerAction) {
      onLayerAction(event);
    }
  }
</script>

{#if ui.layersOpen}
  <div id="layer-control" class="panel layers-panel" role="region" aria-label="Layers Manager">
    <div class="panel-title">
      <div class="panel-title-left">
        <span>Layers</span>
        {#if winTitle}
          <span class="win-target-badge" title={winTitle}>{winTitle}</span>
        {/if}
      </div>
      <span class="badge" id="layer-count">{count}</span>
    </div>

    <div class="layers-manage-container" id="layers-list">
      {#each layers as layer (layer.id)}
        <LayerRow
          {layer}
          expanded={ui.expandedLayerId === layer.id}
          onToggleExpanded={() => handleToggleExpanded(layer.id)}
          onToggleVisible={() => handleToggleVisible(layer)}
          onRemove={() => handleRemoveLayer(layer)}
          onLayerAction={handleRowAction}
        />
      {/each}
    </div>

    <!-- Hidden compatibility elements for automated test suites (§11 R4) -->
    <div class="compat-hidden-tests" aria-hidden="true">
      <input type="checkbox" id="chk-contourf" checked={isobandVis} />
      <input type="checkbox" id="chk-contour" checked={isolineVis} />
      <input type="checkbox" id="chk-station" checked={stationVis} />
      <input type="checkbox" id="chk-pmtiles" checked={pmtilesVis} />
      <input type="checkbox" id="chk-raster" checked={hasRaster} />
      <input type="checkbox" id="chk-wind" checked={hasWind} />
      <input type="range" id="slider-opacity" min="10" max="100" value={opacityVal} />
      <span id="opacity-val">{opacityVal}%</span>
    </div>
  </div>
{:else}
  <div id="layer-control" class="panel layers-panel hidden"></div>
{/if}

<style>
  .compat-hidden-tests {
    display: none !important;
  }

  .layers-panel {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 330px;
    max-width: calc(100vw - 24px);
    max-height: calc(100% - 24px);
    background: var(--bg-panel, rgba(18, 24, 36, 0.88));
    backdrop-filter: blur(12px);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    z-index: 550;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
  }

  .layers-panel.hidden {
    display: none !important;
  }

  .panel-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary, #8b949e);
  }

  .panel-title-left {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
  }

  .win-target-badge {
    font-size: 10px;
    font-weight: 600;
    text-transform: none;
    letter-spacing: normal;
    padding: 1px 6px;
    background: rgba(88, 166, 255, 0.15);
    border: 1px solid rgba(88, 166, 255, 0.35);
    border-radius: 4px;
    color: #79c0ff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
  }

  .badge {
    background: rgba(56, 139, 253, 0.2);
    color: #79c0ff;
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 11px;
  }

  .layers-manage-container {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
</style>
