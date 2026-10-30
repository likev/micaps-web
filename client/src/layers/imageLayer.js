import { addOrUpdateLayer, removeLayer, syncLayerControlForWindow } from "../ui/layers/layerStore.js";
import { getActiveWindow } from "../ui/tabs/tabsStore.js";
import { getActiveHistoryDate, appState } from "../store/appState.js";
import {
  classifyLightingMode,
  resolveSatelliteUtcMs,
  compensateRgbImageData,
} from "../utils/solarLighting.js";

// Active Blob URL tracking per map instance to prevent memory leaks and multi-window collisions
const imageBlobUrlsByMap = new WeakMap();
const imageSeqByMap = new WeakMap();
const imageSeqFallback = new Map();

function seqStoreFor(map) {
  if (!map || typeof map !== "object") return imageSeqFallback;
  let store = imageSeqByMap.get(map);
  if (!store) {
    store = new Map();
    imageSeqByMap.set(map, store);
  }
  return store;
}

function getBlobStore(map) {
  if (!map || typeof map !== "object") return null;
  let store = imageBlobUrlsByMap.get(map);
  if (!store) {
    store = new Map();
    imageBlobUrlsByMap.set(map, store);
  }
  return store;
}

export function revokeImageBlobUrl(map, srcId) {
  const store = getBlobStore(map);
  if (!store) return;
  const prev = store.get(srcId);
  if (prev && typeof prev === "string" && prev.startsWith("blob:")) {
    if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
      try {
        URL.revokeObjectURL(prev);
      } catch {}
    }
  }
  store.delete(srcId);
}

// Capped cache for raw image elements/bitmaps (LRU max 12 entries)
const rawImageCache = new Map();
function cacheRawImage(key, data) {
  if (rawImageCache.size >= 12) {
    const oldestKey = rawImageCache.keys().next().value;
    rawImageCache.delete(oldestKey);
  }
  rawImageCache.set(key, data);
}

async function renderCompensatedImageBlob(rawUrl, bounds, utcMs) {
  try {
    let imgSource = rawImageCache.get(rawUrl);
    if (!imgSource) {
      if (typeof fetch === "function") {
        const resp = await fetch(rawUrl);
        if (!resp.ok) return rawUrl;
        const blob = await resp.blob();
        if (typeof createImageBitmap === "function") {
          imgSource = await createImageBitmap(blob);
        } else if (typeof Image !== "undefined") {
          imgSource = await new Promise((res, rej) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => res(img);
            img.onerror = rej;
            img.src = URL.createObjectURL(blob);
          });
        }
        if (imgSource) cacheRawImage(rawUrl, imgSource);
      }
    }
    if (!imgSource) return rawUrl;

    const width = imgSource.width || imgSource.naturalWidth;
    const height = imgSource.height || imgSource.naturalHeight;
    if (!width || !height) return rawUrl;

    const canvas =
      typeof document !== "undefined" && typeof document.createElement === "function"
        ? document.createElement("canvas")
        : typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height)
        : null;

    if (!canvas) return rawUrl;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return rawUrl;

    ctx.drawImage(imgSource, 0, 0);
    const imgData = ctx.getImageData(0, 0, width, height);
    compensateRgbImageData(imgData, bounds, utcMs);
    ctx.putImageData(imgData, 0, 0);

    if (typeof canvas.convertToBlob === "function") {
      const compBlob = await canvas.convertToBlob({ type: "image/png" });
      return URL.createObjectURL(compBlob);
    } else if (typeof canvas.toBlob === "function") {
      return new Promise((resolve) => {
        canvas.toBlob((b) => {
          resolve(b ? URL.createObjectURL(b) : rawUrl);
        }, "image/png");
      });
    } else if (typeof canvas.toDataURL === "function") {
      return canvas.toDataURL("image/png");
    }
  } catch (err) {
    console.warn("[ImageLayer] Failed to render SZA-compensated image:", err);
  }
  return rawUrl;
}

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

  const seqStore = seqStoreFor(map);
  const curSeq = (seqStore.get(srcId) || 0) + 1;
  seqStore.set(srcId, curSeq);

  const file = targetWin?.obsTime || layer.file || "latest";
  const bounds = layer.bounds || [45.0, 5.0, 155.0, 55.0];
  const coordinates = boundsToCoordinates(bounds);
  const opacity = typeof layer.opacity === "number" ? layer.opacity : 0.85;

  const histDate = getActiveHistoryDate();
  let url = `/api/data/image?path=${encodeURIComponent(layer.path || "SATELLITE/FY2G/L2/DUST")}&file=${encodeURIComponent(file)}&format=png`;
  if (histDate) {
    url += `&date=${encodeURIComponent(histDate)}`;
  }

  const isRgbImage = classifyLightingMode(layer) === "rgb_image";
  const shouldCompensate = Boolean(appState.get("lightingCompensation") && isRgbImage);

  let effectiveUrl = url;
  if (shouldCompensate) {
    const utcMs = resolveSatelliteUtcMs({ ...layer, file });
    const compUrl = await renderCompensatedImageBlob(url, bounds, utcMs);
    if (seqStore.get(srcId) !== curSeq) {
      if (compUrl && compUrl.startsWith("blob:")) {
        if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
          try { URL.revokeObjectURL(compUrl); } catch {}
        }
      }
      return;
    }
    revokeImageBlobUrl(map, srcId);
    if (compUrl && compUrl.startsWith("blob:")) {
      getBlobStore(map)?.set(srcId, compUrl);
    }
    effectiveUrl = compUrl || url;
  } else {
    revokeImageBlobUrl(map, srcId);
  }

  if (seqStore.get(srcId) !== curSeq) return;

  try {
    const effectiveOpacity = layer.visible === false ? 0 : opacity;
    if (map.getSource(srcId)) {
      map.getSource(srcId).updateImage({
        url: effectiveUrl,
        coordinates,
      });
      if (map.getLayer(domLayerId)) {
        map.setLayoutProperty(domLayerId, "visibility", layer.visible === false ? "none" : "visible");
        map.setPaintProperty(domLayerId, "raster-opacity", effectiveOpacity);
      }
    } else {
      map.addSource(srcId, {
        type: "image",
        url: effectiveUrl,
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
    revokeImageBlobUrl(map, srcId);
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
      revokeImageBlobUrl(map, srcId);
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
