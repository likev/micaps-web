<script>
  import { ui } from "../lib/stores/ui.svelte.js";
  import {
    layersByWindow,
    syncLayersState,
    getLayers,
    addLayer,
    deleteLayer,
    reorderLayers,
    getCurrentActiveWinId,
    getCurrentActiveWinTitle,
  } from "../lib/stores/layers.svelte.js";
  import { getWindowById } from "../lib/stores/tabs.svelte.js";
  import LayerRow from "./LayerRow.svelte";
  import StatusPanel from "./StatusPanel.svelte";
  import { resolveLayerTime, parseTimestamp, getReferenceNowMs } from "../utils/timeResolver.js";
  import { t } from "../lib/stores/i18n.svelte.js";

  let { winId = null, onLayerAction = null } = $props();

  let activeWinId = $derived(winId || getCurrentActiveWinId());
  let winObj = $derived(getWindowById(activeWinId));
  let panelTab = $state("layers"); // "layers" or "status"
  let autoHideStale = $state(false);

  let cursorTime = $derived.by(() => {
    if (winObj?.isObservation) {
      return (
        winObj?.wallClockCursor ||
        (winObj?.obsTime ? parseTimestamp(winObj.obsTime) : null) ||
        (typeof window !== "undefined" && window.__MICAPS_CURSOR__) ||
        getReferenceNowMs()
      );
    }
    const nwpValidTime = winObj?.forecastCycle
      ? parseTimestamp({ cycle: winObj.forecastCycle, period: winObj.period ?? 0 })
      : null;
    return (
      nwpValidTime ||
      winObj?.wallClockCursor ||
      (typeof window !== "undefined" && window.__MICAPS_CURSOR__) ||
      getReferenceNowMs()
    );
  });

  $effect(() => {
    if (typeof window !== "undefined" && cursorTime) {
      window.__MICAPS_CURSOR__ = cursorTime;
    }
  });

  let winTitle = $derived(
    winObj
      ? (() => {
          const raw = winObj.title ? String(winObj.title).replace(/^W\d+:\s*/, "") : "";
          if (raw) return `W${winObj.winIdx + 1}: ${raw}`;
          const groupName = winObj.activeGroup?.name ? String(winObj.activeGroup.name).replace(/^W\d+:\s*/, "") : "";
          return groupName ? `W${winObj.winIdx + 1}: ${groupName}` : `Window ${winObj.winIdx + 1}`;
        })()
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
      onLayerAction({ action: "visibility", layer, value: layer.visible, winId: activeWinId });
    }
  }

  function handleToggleExpanded(layerId) {
    ui.expandedLayerId = ui.expandedLayerId === layerId ? null : layerId;
  }

  function handleRemoveLayer(layer) {
    deleteLayer(layer.id, activeWinId);
    if (onLayerAction) {
      onLayerAction({ action: "remove", layer, winId: activeWinId });
    }
  }

  let hiddenStaleLayers = $derived(
    autoHideStale
      ? layers.filter((l) => {
          const res = resolveLayerTime(l, cursorTime);
          return res.isHardStale || res.status === "hard-stale";
        })
      : []
  );

  function handleToggleAutoHide(val) {
    autoHideStale = val;
    if (val) {
      for (const layer of layers) {
        const res = resolveLayerTime(layer, cursorTime);
        if (res.isHardStale || res.status === "hard-stale") {
          if (layer.visible) {
            layer._autoHiddenByStale = true;
            layer.visible = false;
            if (onLayerAction) {
              onLayerAction({ action: "visibility", layer, value: false, winId: activeWinId });
            }
          }
        }
      }
    } else {
      for (const layer of layers) {
        if (layer._autoHiddenByStale) {
          layer._autoHiddenByStale = false;
          layer.visible = true;
          if (onLayerAction) {
            onLayerAction({ action: "visibility", layer, value: true, winId: activeWinId });
          }
        }
      }
    }
  }

  let draggedIdx = $state(null);

  function handleMoveLayer(fromIdx, toIdx) {
    if (toIdx < 0 || toIdx >= layers.length || fromIdx === toIdx) return;
    reorderLayers(fromIdx, toIdx, activeWinId);
    if (onLayerAction) {
      onLayerAction({ action: "reorder", fromIdx, toIdx, winId: activeWinId });
    }
  }

  function handleDragStart(e, idx) {
    draggedIdx = idx;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(idx));
    }
  }

  function handleDragOver(e, idx) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
  }

  function handleDrop(e, idx) {
    e.preventDefault();
    if (draggedIdx !== null && draggedIdx !== idx) {
      handleMoveLayer(draggedIdx, idx);
    }
    draggedIdx = null;
  }

  function handleRowAction(event) {
    if (onLayerAction) {
      onLayerAction({ ...event, winId: event?.winId || activeWinId });
    }
  }
</script>

{#if ui.layersOpen && !ui.configOpen}
  <div id="layer-control" class="panel layers-panel" role="region" aria-label="Layers Manager">
    <div class="panel-title">
      <div class="panel-title-left">
        <div class="panel-subtabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={panelTab === "layers"}
            class="subtab-btn"
            class:active={panelTab === "layers"}
            onclick={() => (panelTab = "layers")}
          >
            {t("layers.subtab.layers")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={panelTab === "status"}
            class="subtab-btn"
            class:active={panelTab === "status"}
            onclick={() => (panelTab = "status")}
            title="Observation Age and Staleness Status (§2.5)"
          >
            {t("layers.subtab.status")}
          </button>
        </div>

        {#if winTitle}
          <span class="win-target-badge" title={winTitle}>{winTitle}</span>
        {/if}
      </div>
      <span class="badge" id="layer-count">{count}</span>
    </div>

    {#if autoHideStale && hiddenStaleLayers.length > 0}
      <div class="stale-hidden-chip" title="Click to show stale layers">
        <span class="stale-hidden-icon">⚠️</span>
        <span class="stale-hidden-text">{t("layers.staleHidden", { count: hiddenStaleLayers.length, s: hiddenStaleLayers.length > 1 ? "s" : "" })}</span>
        <button
          type="button"
          class="btn-unhide-stale"
          onclick={() => handleToggleAutoHide(false)}
        >{t("layers.show")}</button>
      </div>
    {/if}

    {#if panelTab === "layers"}
      <div class="layers-manage-container" id="layers-list">
        {#each layers as layer, index (layer.id)}
          <div
            class="layer-row-drag-wrapper"
            draggable="true"
            role="listitem"
            ondragstart={(e) => handleDragStart(e, index)}
            ondragover={(e) => handleDragOver(e, index)}
            ondrop={(e) => handleDrop(e, index)}
          >
            <LayerRow
              {layer}
              {cursorTime}
              expanded={ui.expandedLayerId === layer.id}
              isFirst={index === 0}
              isLast={index === layers.length - 1}
              onMoveUp={() => handleMoveLayer(index, index - 1)}
              onMoveDown={() => handleMoveLayer(index, index + 1)}
              onToggleExpanded={() => handleToggleExpanded(layer.id)}
              onToggleVisible={() => handleToggleVisible(layer)}
              onRemove={() => handleRemoveLayer(layer)}
              onLayerAction={handleRowAction}
            />
          </div>
        {/each}
      </div>
    {:else}
      <div class="layers-manage-container" id="layers-list">
        <StatusPanel
          {layers}
          {cursorTime}
          onToggleVisible={handleToggleVisible}
          {autoHideStale}
          onToggleAutoHide={handleToggleAutoHide}
        />
      </div>
    {/if}

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
  .layer-row-drag-wrapper {
    cursor: default;
    transition: transform 0.1s ease;
  }

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

  .panel-subtabs {
    display: inline-flex;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 2px;
    gap: 2px;
  }

  .subtab-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary, #8b949e);
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-transform: none;
    letter-spacing: normal;
  }

  .subtab-btn:hover {
    color: var(--text-primary, #e6edf3);
    background: rgba(255, 255, 255, 0.06);
  }

  .subtab-btn.active {
    color: #ffffff;
    background: var(--accent-blue, #1f6feb);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
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

  .stale-hidden-chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 10px;
    background: rgba(248, 81, 73, 0.12);
    border: 1px solid rgba(248, 81, 73, 0.3);
    border-radius: 6px;
    font-size: 11px;
    color: #f85149;
  }

  .btn-unhide-stale {
    background: rgba(248, 81, 73, 0.2);
    border: 1px solid rgba(248, 81, 73, 0.4);
    color: #ff7b72;
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 10px;
    cursor: pointer;
  }
</style>
