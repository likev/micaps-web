// eventLayer.js - Severe convective weather & lightning point events renderer
import { fetchStationObservations } from "../api/catalogApi.js";
import { addOrUpdateLayer, removeLayer, syncLayerControlForWindow } from "../ui/layers/layerStore.js";
import { getActiveWindow } from "../ui/tabs/tabsStore.js";

const EVENT_STYLES = {
  lightning: {
    circleColor: "#ffeb3b",
    circleRadius: 4,
    strokeColor: "#ffffff",
    strokeWidth: 1.5,
    glowColor: "#ff9800",
  },
  tvs: {
    circleColor: "#f85149",
    circleRadius: 7,
    strokeColor: "#ffffff",
    strokeWidth: 2,
    glowColor: "#ff0000",
  },
  hail: {
    circleColor: "#e3b341",
    circleRadius: 6,
    strokeColor: "#ffffff",
    strokeWidth: 2,
    glowColor: "#f0883e",
  },
  gale: {
    circleColor: "#58a6ff",
    circleRadius: 6,
    strokeColor: "#ffffff",
    strokeWidth: 2,
    glowColor: "#1f6feb",
  },
  default: {
    circleColor: "#a371f7",
    circleRadius: 5,
    strokeColor: "#ffffff",
    strokeWidth: 1.5,
    glowColor: "#8957e5",
  },
};

export function getEventStyle(eventType = "default") {
  const key = String(eventType).toLowerCase();
  for (const [k, v] of Object.entries(EVENT_STYLES)) {
    if (key.includes(k)) return v;
  }
  return EVENT_STYLES.default;
}

export function getEventDOMIds(layerId) {
  const safeId = (layerId || "event-layer").replace(/[^a-zA-Z0-9_-]/g, "_");
  return {
    srcId: `event-src-${safeId}`,
    pointLayerId: `event-point-${safeId}`,
    glowLayerId: `event-glow-${safeId}`,
  };
}

export async function loadEventLayer(map, layer = {}, win = null) {
  if (!map) return;

  const layerId = layer.id || "event-layer";
  const path = layer.path || "SURFACE/LIGHTNING_10MIN";
  const file = layer.file || win?.obsTime || "latest";
  const eventType = layer.eventType || (path.includes("LIGHTNING") ? "lightning" : (path.includes("TVS") ? "tvs" : (path.includes("HAIL") ? "hail" : (path.includes("GALE") ? "gale" : "default"))));
  const isVisible = layer.visible !== false;
  const style = getEventStyle(eventType);
  const { srcId, pointLayerId, glowLayerId } = getEventDOMIds(layerId);

  let geojson = { type: "FeatureCollection", features: [] };
  try {
    const data = await fetchStationObservations(path, file);
    if (data && Array.isArray(data.features)) {
      geojson = data;
    }
  } catch (err) {
    console.warn(`[eventLayer] Failed to fetch event data from ${path}:`, err);
  }

  // Remove existing MapLibre layers/source if present
  if (map.getLayer(pointLayerId)) map.removeLayer(pointLayerId);
  if (map.getLayer(glowLayerId)) map.removeLayer(glowLayerId);
  if (map.getSource(srcId)) map.removeSource(srcId);

  // Add GeoJSON source
  map.addSource(srcId, {
    type: "geojson",
    data: geojson,
  });

  const visibilityStr = isVisible ? "visible" : "none";

  // Optional glow layer underneath
  map.addLayer({
    id: glowLayerId,
    type: "circle",
    source: srcId,
    layout: { visibility: visibilityStr },
    paint: {
      "circle-radius": style.circleRadius + 3,
      "circle-color": style.glowColor,
      "circle-opacity": 0.4,
      "circle-blur": 0.8,
    },
  });

  // Sharp core marker layer
  map.addLayer({
    id: pointLayerId,
    type: "circle",
    source: srcId,
    layout: { visibility: visibilityStr },
    paint: {
      "circle-radius": style.circleRadius,
      "circle-color": style.circleColor,
      "circle-stroke-color": style.strokeColor,
      "circle-stroke-width": style.strokeWidth,
      "circle-opacity": 0.95,
    },
  });

  // Track layer in window store
  const layerDef = {
    id: layerId,
    name: layer.name || `Severe Event: ${eventType.toUpperCase()}`,
    type: "event",
    model: layer.model || "SWAN",
    element: layer.element || eventType.toUpperCase(),
    path,
    file,
    eventType,
    visible: isVisible,
    removable: layer.removable !== false,
    color: style.circleColor,
    config: {
      eventType,
      count: geojson.features.length,
      ...(layer.config || {}),
    },
    geojsonData: geojson,
  };

  addOrUpdateLayer(layerDef, win);
  if (win && typeof getActiveWindow === "function" && getActiveWindow() === win) {
    syncLayerControlForWindow(win);
  }

  return layerDef;
}

export function removeEventLayer(map, win = null, layerId = null) {
  const targetId = layerId || "event-layer";
  const { srcId, pointLayerId, glowLayerId } = getEventDOMIds(targetId);

  if (map) {
    try {
      if (map.getLayer(pointLayerId)) map.removeLayer(pointLayerId);
      if (map.getLayer(glowLayerId)) map.removeLayer(glowLayerId);
      if (map.getSource(srcId)) map.removeSource(srcId);
    } catch (e) {
      console.warn("[eventLayer] Error removing map layers:", e);
    }
  }

  removeLayer(targetId, win);
  if (win && Array.isArray(win.layers)) {
    win.layers = win.layers.filter((l) => l && l.id !== targetId && l.type !== "event");
  }
}

export function setEventVisibility(map, visible, win = null, layerId = null) {
  const targetId = layerId || "event-layer";
  const { pointLayerId, glowLayerId } = getEventDOMIds(targetId);
  const visStr = visible ? "visible" : "none";

  if (map) {
    try {
      if (map.getLayer(pointLayerId)) map.setLayoutProperty(pointLayerId, "visibility", visStr);
      if (map.getLayer(glowLayerId)) map.setLayoutProperty(glowLayerId, "visibility", visStr);
    } catch (e) {}
  }

  addOrUpdateLayer({ id: targetId, visible: Boolean(visible) }, win);
  if (win && typeof getActiveWindow === "function" && getActiveWindow() === win) {
    syncLayerControlForWindow(win);
  }
}
