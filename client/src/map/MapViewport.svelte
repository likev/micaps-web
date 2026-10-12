<script>
  import { mapViewport } from "../actions/mapViewport.js";
  import { crosshairState, setSynchronizedCursor, clearSynchronizedCursor } from "../lib/stores/crosshairSync.svelte.js";
  import { updateCursorProbe, clearCursorProbe } from "../lib/stores/cursorProbe.svelte.js";
  import { getWindowById } from "../lib/stores/tabs.svelte.js";

  let { winId = "default", isActive = false, isVisible = true, onMapCreated = null, onMapDestroyed = null } = $props();

  let mapRef = $state(null);
  let crosshairPx = $state(null);

  function handleInternalMapCreated(map) {
    mapRef = map;
    try {
      map.on("mousemove", onMapMouseMove);
      map.on("mouseout", onMapMouseLeave);
      map.on("move", updateCrosshairProjectedPos);
    } catch {}
    if (onMapCreated) onMapCreated(map);
  }

  function handleInternalMapDestroyed(map) {
    if (map) {
      try {
        map.off("mousemove", onMapMouseMove);
        map.off("mouseout", onMapMouseLeave);
        map.off("move", updateCrosshairProjectedPos);
      } catch {}
    }
    mapRef = null;
    clearSynchronizedCursor(winId);
    if (onMapDestroyed) onMapDestroyed(map);
  }

  function onMapMouseMove(e) {
    if (!e || !e.lngLat) return;
    const { lng, lat } = e.lngLat;
    setSynchronizedCursor(winId, lng, lat);
    const win = getWindowById(winId);
    updateCursorProbe(lng, lat, win);
  }

  function onMapMouseLeave() {
    clearSynchronizedCursor(winId);
    clearCursorProbe();
  }

  function updateCrosshairProjectedPos() {
    if (!mapRef || !crosshairState.active || crosshairState.sourceWinId === winId) {
      crosshairPx = null;
      return;
    }
    try {
      if (typeof mapRef.project === "function") {
        const p = mapRef.project([crosshairState.lng, crosshairState.lat]);
        const container = typeof mapRef.getContainer === "function" ? mapRef.getContainer() : null;
        const w = container ? container.clientWidth : 2000;
        const h = container ? container.clientHeight : 2000;
        if (p && p.x >= -30 && p.x <= w + 30 && p.y >= -30 && p.y <= h + 30) {
          crosshairPx = { x: p.x, y: p.y };
        } else {
          crosshairPx = null;
        }
      }
    } catch {
      crosshairPx = null;
    }
  }

  $effect(() => {
    if (crosshairState.active && crosshairState.sourceWinId !== winId && mapRef) {
      updateCrosshairProjectedPos();
    } else {
      crosshairPx = null;
    }
  });
</script>

<div
  class="map-viewport"
  use:mapViewport={{ winId, isActive, isVisible, onMapCreated: handleInternalMapCreated, onMapDestroyed: handleInternalMapDestroyed }}
  data-testid="map-viewport-{winId}"
  onmouseleave={onMapMouseLeave}
>
  {#if crosshairPx}
    <div
      class="sync-crosshair-reticle"
      style:left="{crosshairPx.x}px"
      style:top="{crosshairPx.y}px"
      aria-hidden="true"
    >
      <div class="reticle-h"></div>
      <div class="reticle-v"></div>
      <div class="reticle-ring"></div>
    </div>
  {/if}
</div>

<style>
  .map-viewport {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  .sync-crosshair-reticle {
    position: absolute;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 500;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .reticle-h {
    position: absolute;
    width: 24px;
    height: 1.5px;
    background: #ff4d4f;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.9);
  }

  .reticle-v {
    position: absolute;
    height: 24px;
    width: 1.5px;
    background: #ff4d4f;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.9);
  }

  .reticle-ring {
    position: absolute;
    width: 12px;
    height: 12px;
    border: 1.5px solid #ff4d4f;
    border-radius: 50%;
    box-shadow: 0 0 4px rgba(255, 77, 79, 0.7);
  }

  :global(.maplibregl-canvas) {
    outline: none;
  }

  :global(.maplibregl-ctrl-top-right) {
    top: 10px;
    right: 10px;
    z-index: 100;
  }

  :global(.maplibregl-ctrl-group) {
    background: var(--bg-panel, rgba(18, 24, 36, 0.88)) !important;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12)) !important;
    backdrop-filter: blur(8px);
  }

  :global(.maplibregl-ctrl-group button) {
    border-color: var(--border-color, rgba(255, 255, 255, 0.12)) !important;
  }
</style>
