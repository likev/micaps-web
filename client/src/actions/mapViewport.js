// mapViewport.js - Svelte action for mounting and tearing down a MapLibre instance
import { createMapInstance, setActiveMap } from "../map/mapInstance.js";
import { setMapInstance } from "../lib/stores/tabs.svelte.js";

export function mapViewport(node, options = {}) {
  let winId = options.winId || "default";
  let map = null;

  try {
    map = createMapInstance(node, options);
    setMapInstance(winId, map);
    if (options.isActive) {
      setActiveMap(map);
    }
    if (typeof options.onMapCreated === "function") {
      options.onMapCreated(map);
    }
  } catch (err) {
    console.error("[mapViewport] Error initializing map:", err);
  }

  const resizeObserver = new ResizeObserver(() => {
    if (map && typeof map.resize === "function") {
      try {
        map.resize();
      } catch {}
    }
  });
  resizeObserver.observe(node);

  return {
    destroy() {
      resizeObserver.disconnect();
      if (typeof options.onMapDestroyed === "function") {
        options.onMapDestroyed(map);
      }
      setMapInstance(winId, null);
      if (map && typeof map.remove === "function") {
        try {
          map.remove();
        } catch {}
      }
      map = null;
    },
    update(newOptions) {
      if (newOptions.winId && newOptions.winId !== winId) {
        setMapInstance(winId, null);
        winId = newOptions.winId;
        setMapInstance(winId, map);
      }
      if (newOptions.isActive && map) {
        setActiveMap(map);
      }
    },
  };
}
