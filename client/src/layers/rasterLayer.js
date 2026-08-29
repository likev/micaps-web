// rasterLayer.js - Zero-copy Float32Array streaming to Canvas & MapLibre raster image
import { getColor } from "../utils/colormaps.js";

let rasterCanvas = null;

export function getRasterDOMIds(layerId = "default") {
  const isDefault = !layerId || layerId === "default";
  return {
    rasterSrcId: isDefault ? "raster-source" : `${layerId}-raster-source`,
    rasterLayerId: isDefault ? "raster-layer" : `${layerId}-raster-layer`,
  };
}

export function renderBinaryRaster(map, arrayBuffer, element = "TMP", colormap = null, options = {}) {
  if (!map || !arrayBuffer || arrayBuffer.byteLength < 32) return;

  const view = new DataView(arrayBuffer);
  const slon = view.getFloat32(0, true);
  const elon = view.getFloat32(4, true);
  const slat = view.getFloat32(8, true);
  const elat = view.getFloat32(12, true);
  const nlon = view.getInt32(16, true);
  const nlat = view.getInt32(20, true);

  if (nlon <= 0 || nlat <= 0 || nlon > 5000 || nlat > 5000) return;

  // Float32 values start at byte offset 32
  const floatValues = new Float32Array(arrayBuffer, 32);
  const zMin = view.getFloat32(24, true);
  const zMax = view.getFloat32(28, true);
  renderRasterImage(map, floatValues, nlon, nlat, slon, elon, slat, elat, element, colormap, zMin, zMax, options);
}

export function renderGridRaster(map, gridData, element = "TMP", colormap = null, options = {}) {
  if (!map || !gridData || (!gridData.values && (!gridData.u || !gridData.v)) || !gridData.header) return;
  const h = gridData.header;
  const nlon = h.n_lon || h.LongitudeGridNumber || (gridData.values ? gridData.values[0]?.length : (gridData.u ? gridData.u[0]?.length : 0)) || 0;
  const nlat = h.n_lat || h.LatitudeGridNumber || (gridData.values ? gridData.values.length : (gridData.u ? gridData.u.length : 0)) || 0;

  let slon, elon, slat, elat;
  if (gridData.x && gridData.x.length > 0) {
    slon = gridData.x[0];
    elon = gridData.x[gridData.x.length - 1];
  } else {
    slon = h.start_lon ?? h.StartLongitude ?? 60.0;
    const dlon = h.d_lon ?? h.LongitudeGridSpace ?? 0.25;
    elon = nlon > 1 ? (slon + (nlon - 1) * dlon) : (h.end_lon ?? h.EndLongitude ?? slon);
  }

  if (gridData.y && gridData.y.length > 0) {
    slat = gridData.y[0];
    elat = gridData.y[gridData.y.length - 1];
  } else {
    slat = h.start_lat ?? h.StartLatitude ?? 60.0;
    let dlat = h.d_lat ?? h.LatitudeGridSpace;
    if (dlat === undefined || dlat === null || dlat === 0) {
      dlat = (h.end_lat !== undefined && h.end_lat !== null && nlat > 1) ? (h.end_lat - slat) / (nlat - 1) : -0.25;
    } else if (h.end_lat !== undefined && h.end_lat !== null && slat > h.end_lat && dlat > 0) {
      dlat = -dlat;
    }
    elat = nlat > 1 ? (slat + (nlat - 1) * dlat) : (h.end_lat ?? h.EndLatitude ?? slat);
  }

  let floatValues = gridData.values;
  if (!floatValues && gridData.u && gridData.v) {
    const is2D = Array.isArray(gridData.u) && Array.isArray(gridData.u[0]);
    if (is2D) {
      floatValues = gridData.u.map((row, r) => row.map((uVal, c) => Math.hypot(uVal, gridData.v[r][c])));
    } else {
      const len = gridData.u.length;
      floatValues = new Float32Array(len);
      for (let k = 0; k < len; k++) {
        floatValues[k] = Math.hypot(gridData.u[k], gridData.v[k]);
      }
    }
  }

  const zMin = gridData.stats?.min;
  const zMax = gridData.stats?.max;

  renderRasterImage(map, floatValues, nlon, nlat, slon, elon, slat, elat, element, colormap, zMin, zMax, options);
}

function renderRasterImage(map, floatValues, nlon, nlat, slon, elon, slat, elat, element, colormap, zMin = undefined, zMax = undefined, options = {}) {
  if (!map || !floatValues || nlon <= 0 || nlat <= 0) return;

  const opts = typeof options === "string" ? { layerId: options } : (options || {});
  const layerId = opts.layerId || "default";
  const opacity = opts.opacity !== undefined ? opts.opacity : 0.85;
  const visible = opts.visible !== false;

  if (!rasterCanvas) {
    rasterCanvas = document.createElement("canvas");
  }
  rasterCanvas.width = nlon;
  rasterCanvas.height = nlat;
  const ctx = rasterCanvas.getContext("2d");
  const imgData = ctx.createImageData(nlon, nlat);
  const data = imgData.data;

  const is2D = Array.isArray(floatValues) && Array.isArray(floatValues[0]);
  const isDescendingLat = slat > elat; // True if data row 0 is North (e.g. 60° down to -10°)

  // Render pixels via color palette mapping
  for (let j = 0; j < nlat; j++) {
    const srcRow = isDescendingLat ? j : (nlat - 1 - j);
    for (let i = 0; i < nlon; i++) {
      const dstIdx = (j * nlon + i) * 4;
      const val = is2D ? floatValues[srcRow][i] : floatValues[srcRow * nlon + i];

      if (val === undefined || val === null || isNaN(val) || val < -9900) {
        data[dstIdx + 3] = 0; // Transparent
      } else {
        const [r, g, b, a] = getColor(val, element, colormap, zMin, zMax);
        data[dstIdx] = r;
        data[dstIdx + 1] = g;
        data[dstIdx + 2] = b;
        data[dstIdx + 3] = a;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const dataUrl = rasterCanvas.toDataURL();

  // Half-cell margin so pixel centers align exactly with vector contour and station coordinates
  const dLon = nlon > 1 ? Math.abs(elon - slon) / (nlon - 1) : 0;
  const dLat = nlat > 1 ? Math.abs(elat - slat) / (nlat - 1) : 0;
  const halfDLon = dLon / 2;
  const halfDLat = dLat / 2;

  const topLat = Math.max(slat, elat) + halfDLat;
  const bottomLat = Math.min(slat, elat) - halfDLat;
  const leftLon = Math.min(slon, elon) - halfDLon;
  const rightLon = Math.max(slon, elon) + halfDLon;

  const coordinates = [
    [leftLon, topLat],     // Top-left
    [rightLon, topLat],    // Top-right
    [rightLon, bottomLat], // Bottom-right
    [leftLon, bottomLat],  // Bottom-left
  ];

  const { rasterSrcId, rasterLayerId } = getRasterDOMIds(layerId);

  if (map.getSource(rasterSrcId)) {
    map.getSource(rasterSrcId).updateImage({
      url: dataUrl,
      coordinates,
    });
    if (map.getLayer(rasterLayerId)) {
      map.setLayoutProperty(rasterLayerId, "visibility", visible ? "visible" : "none");
      map.setPaintProperty(rasterLayerId, "raster-opacity", opacity);
    }
  } else {
    map.addSource(rasterSrcId, {
      type: "image",
      url: dataUrl,
      coordinates,
    });

    const beforeId = map.getLayer("citys-boundary") ? "citys-boundary" : (map.getLayer("provinces-boundary") ? "provinces-boundary" : undefined);
    map.addLayer(
      {
        id: rasterLayerId,
        type: "raster",
        source: rasterSrcId,
        layout: {
          visibility: visible ? "visible" : "none",
        },
        paint: {
          "raster-opacity": opacity,
          "raster-fade-duration": 0,
        },
      },
      beforeId
    );
  }
}

export function setRasterVisibility(map, visible, layerId = null) {
  if (!map || !map.getStyle) return;
  if (layerId) {
    const { rasterLayerId } = getRasterDOMIds(layerId);
    if (map.getLayer(rasterLayerId)) {
      map.setLayoutProperty(rasterLayerId, "visibility", visible ? "visible" : "none");
    }
  } else {
    const style = map.getStyle();
    if (style && style.layers) {
      for (const l of style.layers) {
        if (l.id.includes("raster-layer") || l.id.endsWith("-raster-layer")) {
          if (map.getLayer(l.id)) {
            map.setLayoutProperty(l.id, "visibility", visible ? "visible" : "none");
          }
        }
      }
    }
  }
}

export function setLayerRasterVisibility(map, layerId, visible) {
  setRasterVisibility(map, visible, layerId);
}

export function removeRasterLayer(map, layerId = null) {
  if (!map || !map.getStyle) return;
  if (layerId) {
    const { rasterSrcId, rasterLayerId } = getRasterDOMIds(layerId);
    if (map.getLayer(rasterLayerId)) map.removeLayer(rasterLayerId);
    if (map.getSource(rasterSrcId)) map.removeSource(rasterSrcId);
  } else {
    removeAllRasterLayers(map);
  }
}

export function removeAllRasterLayers(map) {
  if (!map || !map.getStyle) return;
  const style = map.getStyle();
  if (!style) return;

  if (style.layers) {
    for (const l of style.layers) {
      if (l.id.includes("raster-layer") || l.id.endsWith("-raster-layer")) {
        if (map.getLayer(l.id)) {
          map.removeLayer(l.id);
        }
      }
    }
  }

  if (style.sources) {
    for (const srcId of Object.keys(style.sources)) {
      if (srcId.includes("raster-source") || srcId.endsWith("-raster-source")) {
        if (map.getSource(srcId)) {
          map.removeSource(srcId);
        }
      }
    }
  }
}
