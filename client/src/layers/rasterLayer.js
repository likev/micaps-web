// rasterLayer.js - Zero-copy Float32Array streaming to Canvas & MapLibre raster image
import { getColor } from "../utils/colormaps.js";

let rasterCanvas = null;

export function renderBinaryRaster(map, arrayBuffer, element = "TMP") {
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

  if (!rasterCanvas) {
    rasterCanvas = document.createElement("canvas");
  }
  rasterCanvas.width = nlon;
  rasterCanvas.height = nlat;
  const ctx = rasterCanvas.getContext("2d");
  const imgData = ctx.createImageData(nlon, nlat);
  const data = imgData.data;

  // Render pixels via color palette mapping
  for (let j = 0; j < nlat; j++) {
    for (let i = 0; i < nlon; i++) {
      const srcIdx = j * nlon + i;
      const dstIdx = (j * nlon + i) * 4;
      const val = floatValues[srcIdx];

      if (isNaN(val) || val < -9900) {
        data[dstIdx + 3] = 0; // Transparent
      } else {
        const [r, g, b, a] = getColor(val, element);
        data[dstIdx] = r;
        data[dstIdx + 1] = g;
        data[dstIdx + 2] = b;
        data[dstIdx + 3] = a;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const dataUrl = rasterCanvas.toDataURL();

  const coordinates = [
    [slon, slat], // Top-left
    [elon, slat], // Top-right
    [elon, elat], // Bottom-right
    [slon, elat], // Bottom-left
  ];

  if (map.getSource("raster-source")) {
    map.getSource("raster-source").updateImage({
      url: dataUrl,
      coordinates,
    });
  } else {
    map.addSource("raster-source", {
      type: "image",
      url: dataUrl,
      coordinates,
    });

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
      "provinces-boundary"
    );
  }
}

export function setRasterVisibility(map, visible) {
  if (map.getLayer("raster-layer")) {
    map.setLayoutProperty("raster-layer", "visibility", visible ? "visible" : "none");
  }
}
