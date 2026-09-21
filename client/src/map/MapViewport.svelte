<script>
  import { mapViewport } from "../actions/mapViewport.js";

  let { winId = "default", isActive = false, onMapCreated = null, onMapDestroyed = null } = $props();
</script>

<div
  class="map-viewport"
  use:mapViewport={{ winId, isActive, onMapCreated, onMapDestroyed }}
  data-testid="map-viewport-{winId}"
></div>

<style>
  .map-viewport {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
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
