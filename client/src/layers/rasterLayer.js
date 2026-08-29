// rasterLayer.js - Zero-copy Float32Array streaming to Canvas & MapLibre raster image
import { getColor } from "../utils/colormaps.js";

let rasterCanvas = null;

export function renderBinaryRaster(map, arrayBuffer, element = "TMP", colormap = null) {
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
  renderRasterImage(map, floatValues, nlon, nlat, slon, elon, slat, elat, element, colormap, zMin, zMax);
}

export function renderGridRaster(map, gridData, element = "TMP", colormap = null) {
  if (!map || !gridData || !gridData.values || !gridData.header) return;
  const h = gridData.header;
  const nlon = h.n_lon || h.LongitudeGridNumber || (gridData.values[0]?.length) || 0;
  const nlat = h.n_lat || h.LatitudeGridNumber || gridData.values.length || 0;
  const slon = h.start_lon ?? h.StartLongitude ?? 60.0;
  const elon = h.end_lon ?? h.EndLongitude ?? (slon + (nlon - 1) * (h.d_lon || h.LongitudeGridSpace || 0.25));
  const slat = h.start_lat ?? h.StartLatitude ?? 60.0;
  const elat = h.end_lat ?? h.EndLatitude ?? (slat + (nlat - 1) * (h.d_lat || h.LatitudeGridSpace || -0.25));
  const floatValues = gridData.values;
  const zMin = gridData.stats?.min;
  const zMax = gridData.stats?.max;

  renderRasterImage(map, floatValues, nlon, nlat, slon, elon, slat, elat, element, colormap, zMin, zMax);
}

function renderRasterImage(map, floatValues, nlon, nlat, slon, elon, slat, elat, element, colormap, zMin = undefined, zMax = undefined) {
  if (!map || !floatValues || nlon <= 0 || nlat <= 0) return;

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

  if (map.getSource("raster-source")) {
    map.getSource("raster-source").updateImage({
      url: dataUrl,
      coordinates,
    });
    if (map.getLayer("raster-layer")) {
      map.setLayoutProperty("raster-layer", "visibility", "visible");
    }
  } else {
    map.addSource("raster-source", {
      type: "image",
      url: dataUrl,
      coordinates,
    });

    const beforeId = map.getLayer("citys-boundary") ? "citys-boundary" : (map.getLayer("provinces-boundary") ? "provinces-boundary" : undefined);
    map.addLayer(
      {
        id: "raster-layer",
        type: "raster",
        source: "raster-source",
        paint: {
          "raster-opacity": 0.85,
          "raster-fade-duration": 0,
        },
      },
      beforeId
    );
  }
}

export function setRasterVisibility(map, visible) {
  if (map.getLayer("raster-layer")) {
    map.setLayoutProperty("raster-layer", "visibility", visible ? "visible" : "none");
  }
}

export function removeRasterLayer(map) {
  if (!map) return;
  if (map.getLayer("raster-layer")) map.removeLayer("raster-layer");
  if (map.getSource("raster-source")) map.removeSource("raster-source");
}
