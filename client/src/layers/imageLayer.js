// imageLayer.js - Geo-registered raster imagery layer renderer (e.g. FY-2G DUST RGB BMP)
import { addOrUpdateLayer, removeLayer, syncLayerControlForWindow } from "../ui/layers/layerStore.js";
import { getActiveWindow } from "../ui/tabs/tabsStore.js";
import { getActiveHistoryDate } from "../store/appState.js";

export function getImageDOMIds(layerId) {
  const safeId = (layerId || "image-layer").replace(/[^a-zA-Z0-9_-]/g, "_");
  return {
    srcId: `image-src-${safeId}`,
    layerId: `image-raster-${safeId}`,
  };
}

export function boundsToCoordinates(bounds) {
  if (!Array.isArray(bounds) || bounds.length < 4) {
    // Default East Asia regional bounds: [minLon, minLat, maxLon, maxLat]
    bounds = [45.0, 5.0, 155.0, 55.0];
  }
  const [minLon, minLat, maxLon, maxLat] = bounds;
  return [
    [minLon, maxLat], // top-left
    [maxLon, maxLat], // top-right
    [maxLon, minLat], // bottom-right
    [minLon, minLat], // bottom-left
  ];
}

export async function loadImageLayer(map, layer, win = null) {
  if (!map || !layer) return;
  const targetWin = win || getActiveWindow();
  const layerId = layer.id || "image-dust";
  const { srcId, layerId: domLayerId } = getImageDOMIds(layerId);

  const file = layer.file || targetWin?.obsTime || "latest";
  const bounds = layer.bounds || [45.0, 5.0, 155.0, 55.0];
  const coordinates = boundsToCoordinates(bounds);
  const opacity = typeof layer.opacity === "number" ? layer.opacity : 0.85;

  const histDate = getActiveHistoryDate();
  let url = `/api/data/image?path=${encodeURIComponent(layer.path || "SATELLITE/FY2G/L2/DUST")}&file=${encodeURIComponent(file)}&format=png`;
  if (histDate) {
    url += `&date=${encodeURIComponent(histDate)}`;
  }

  try {
    const effectiveOpacity = layer.visible === false ? 0 : opacity;
    if (map.getSource(srcId)) {
      map.getSource(srcId).updateImage({
        url,
        coordinates,
      });
      if (map.getLayer(domLayerId)) {
        map.setLayoutProperty(domLayerId, "visibility", layer.visible === false ? "none" : "visible");
        map.setPaintProperty(domLayerId, "raster-opacity", effectiveOpacity);
      }
    } else {
      map.addSource(srcId, {
        type: "image",
        url,
        coordinates,
      });

      const beforeId = map.getLayer("citys-boundary") ? "citys-boundary" : (map.getLayer("provinces-boundary") ? "provinces-boundary" : undefined);
      map.addLayer(
        {
          id: domLayerId,
          type: "raster",
          source: srcId,
          layout: {
            visibility: layer.visible === false ? "none" : "visible",
          },
          paint: {
            "raster-opacity": effectiveOpacity,
            "raster-resampling": "linear",
            "raster-fade-duration": 0,
          },
        },
        beforeId
      );
    }

    addOrUpdateLayer(
      {
        id: layerId,
        name: layer.name || "Dust RGB Image",
        type: "image",
        model: layer.model || "SATELLITE",
        element: layer.element || "DUST",
        path: layer.path,
        file,
        visible: layer.visible !== false,
        opacity,
        bounds,
      },
      targetWin
    );

    if (targetWin && getActiveWindow() === targetWin) {
      syncLayerControlForWindow(targetWin);
    }
  } catch (err) {
    console.warn(`[ImageLayer] Failed to render image layer "${layerId}":`, err);
  }
}

export function removeImageLayer(map, win = null, layerId = null) {
  if (!map) return;
  const targetWin = win || getActiveWindow();

  if (layerId) {
    const { srcId, layerId: domLayerId } = getImageDOMIds(layerId);
    try {
      if (map.getLayer(domLayerId)) map.removeLayer(domLayerId);
      if (map.getSource(srcId)) map.removeSource(srcId);
    } catch {}
    if (targetWin) removeLayer(layerId, targetWin);
    return;
  }

  // Remove all image layers for this window
  if (targetWin?.layers) {
    const imgLayers = targetWin.layers.filter((l) => l.type === "image");
    for (const l of imgLayers) {
      const { srcId, layerId: domLayerId } = getImageDOMIds(l.id);
      try {
        if (map.getLayer(domLayerId)) map.removeLayer(domLayerId);
        if (map.getSource(srcId)) map.removeSource(srcId);
      } catch {}
      removeLayer(l.id, targetWin);
    }
  }
}

export function setImageLayerVisibility(map, layerId, visible) {
  if (!map) return;
  const { layerId: domLayerId } = getImageDOMIds(layerId);
  try {
    if (map.getLayer(domLayerId)) {
      map.setLayoutProperty(domLayerId, "visibility", visible ? "visible" : "none");
    }
  } catch {}
}

export function setImageLayerOpacity(map, layerId, opacity) {
  if (!map) return;
  const { layerId: domLayerId } = getImageDOMIds(layerId);
  try {
    if (map.getLayer(domLayerId)) {
      map.setPaintProperty(domLayerId, "raster-opacity", Math.max(0, Math.min(1, opacity)));
    }
  } catch {}
}
