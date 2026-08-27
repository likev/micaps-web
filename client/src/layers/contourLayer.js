// contourLayer.js - In-browser Marching Squares isoband and isoline generator
import * as griddata from "griddata";
import { getElementLevels, getHexColor } from "../utils/colormaps.js";

export function renderContourLayers(map, gridData, element = "TMP", options = {}) {
  if (!map || !gridData || !gridData.values || !gridData.header) {
    return;
  }

  const nLon = gridData.header.n_lon;
  const nLat = gridData.header.n_lat;
  const step = nLon * nLat > 40000 ? 2 : 1;

  let x = [];
  for (let i = 0; i < nLon; i += step) {
    x.push(gridData.header.start_lon + i * gridData.header.d_lon);
  }

  let y = [];
  for (let j = 0; j < nLat; j += step) {
    y.push(gridData.header.start_lat + j * gridData.header.d_lat);
  }

  // Convert 1D values to 2D array Z[latIndex][lonIndex]
  let Z = [];
  for (let j = 0; j < nLat; j += step) {
    const row = [];
    for (let i = 0; i < nLon; i += step) {
      row.push(gridData.values[j * nLon + i]);
    }
    Z.push(row);
  }

  // If latitude is descending (e.g. 60 down to -10), reverse to ensure ascending order for Marching Squares
  if (y.length > 1 && y[0] > y[y.length - 1]) {
    y.reverse();
    Z.reverse();
  }

  // Determine isoline levels
  const levels = getElementLevels(element, gridData.stats.min, gridData.stats.max, options.colormap);

  // 1. Generate Isobands via griddata.contourf
  let isobandFC = { type: "FeatureCollection", features: [] };
  try {
    const features = griddata.contourf(Z, { x, y, levels });
    if (Array.isArray(features)) {
      for (const feature of features) {
        if (feature.properties && feature.properties.level) {
          const midVal = (feature.properties.level[0] + feature.properties.level[1]) / 2;
          feature.properties.fillColor = getHexColor(midVal, element, options.colormap);
        }
      }
      isobandFC.features = features;
    }
  } catch (err) {
    console.error("[Contour] contourf failed:", err);
  }

  // 2. Generate Isolines via griddata.contour
  let isolineFC = { type: "FeatureCollection", features: [] };
  try {
    const lines = griddata.contour(Z, { x, y, levels });
    if (Array.isArray(lines)) {
      isolineFC.features = lines;
    }
  } catch (err) {
    console.error("[Contour] contour failed:", err);
  }

  // Update MapLibre sources
  updateMapLibreContour(map, isobandFC, isolineFC, options);
}

function getLayerDOMIds(layerId = "default") {
  const isDefault = layerId === "default" || layerId === "contour-TMP-850";
  return {
    isobandSrcId: isDefault ? "isoband-source" : `${layerId}-isoband-source`,
    isobandLayerId: isDefault ? "isoband-layer" : `${layerId}-isoband-layer`,
    isolineSrcId: isDefault ? "isoline-source" : `${layerId}-isoline-source`,
    isolineLayerId: isDefault ? "isoline-layer" : `${layerId}-isoline-layer`,
  };
}

function updateMapLibreContour(map, isobands, isolines, options = {}) {
  const layerId = options.layerId || "default";
  const opacity = options.opacity !== undefined ? options.opacity : 0.75;
  const visibleIsoband = options.visibleIsoband !== undefined ? options.visibleIsoband : (options.showFill !== false && options.visible !== false);
  const visibleIsoline = options.visibleIsoline !== undefined ? options.visibleIsoline : (options.showLine !== false && options.visible !== false);
  const lineColor = options.lineColor || "#ffffff";
  const lineWidth = options.lineWidth || 1.4;

  const { isobandSrcId, isobandLayerId, isolineSrcId, isolineLayerId } = getLayerDOMIds(layerId);

  // --- ISOBANDS (Contour Fills) ---
  if (isobands) {
    if (map.getSource(isobandSrcId)) {
      map.getSource(isobandSrcId).setData(isobands);
      if (map.getLayer(isobandLayerId)) {
        map.setLayoutProperty(isobandLayerId, "visibility", visibleIsoband ? "visible" : "none");
        map.setPaintProperty(isobandLayerId, "fill-opacity", opacity);
      }
    } else {
      map.addSource(isobandSrcId, {
        type: "geojson",
        data: isobands,
      });

      map.addLayer(
        {
          id: isobandLayerId,
          type: "fill",
          source: isobandSrcId,
          layout: {
            visibility: visibleIsoband ? "visible" : "none",
          },
          paint: {
            "fill-color": ["coalesce", ["get", "fillColor"], "#388bfd"],
            "fill-opacity": opacity,
          },
        },
        "provinces-boundary"
      );
    }
  }

  // --- ISOLINES (Contour Lines) ---
  if (isolines) {
    if (map.getSource(isolineSrcId)) {
      map.getSource(isolineSrcId).setData(isolines);
      if (map.getLayer(isolineLayerId)) {
        map.setLayoutProperty(isolineLayerId, "visibility", visibleIsoline ? "visible" : "none");
        map.setPaintProperty(isolineLayerId, "line-color", lineColor);
        map.setPaintProperty(isolineLayerId, "line-width", lineWidth);
      }
    } else {
      map.addSource(isolineSrcId, {
        type: "geojson",
        data: isolines,
      });

      map.addLayer({
        id: isolineLayerId,
        type: "line",
        source: isolineSrcId,
        layout: {
          visibility: visibleIsoline ? "visible" : "none",
        },
        paint: {
          "line-color": lineColor,
          "line-width": lineWidth,
          "line-opacity": 0.85,
        },
      });
    }
  }
}

export function setLayerIsobandVisibility(map, layerId, visible) {
  const { isobandLayerId } = getLayerDOMIds(layerId);
  const vis = visible ? "visible" : "none";
  if (map.getLayer(isobandLayerId)) map.setLayoutProperty(isobandLayerId, "visibility", vis);
}

export function setLayerIsolineVisibility(map, layerId, visible) {
  const { isolineLayerId } = getLayerDOMIds(layerId);
  const vis = visible ? "visible" : "none";
  if (map.getLayer(isolineLayerId)) map.setLayoutProperty(isolineLayerId, "visibility", vis);
}

export function setLayerIsolineColor(map, layerId, color) {
  const { isolineLayerId } = getLayerDOMIds(layerId);
  if (map.getLayer(isolineLayerId)) map.setPaintProperty(isolineLayerId, "line-color", color);
}

export function setLayerIsobandOpacity(map, layerId, opacity) {
  const { isobandLayerId } = getLayerDOMIds(layerId);
  if (map.getLayer(isobandLayerId)) map.setPaintProperty(isobandLayerId, "fill-opacity", opacity);
}

export function removeContourLayer(map, layerId) {
  const { isobandSrcId, isobandLayerId, isolineSrcId, isolineLayerId } = getLayerDOMIds(layerId);

  if (map.getLayer(isolineLayerId)) map.removeLayer(isolineLayerId);
  if (map.getSource(isolineSrcId)) map.removeSource(isolineSrcId);
  if (map.getLayer(isobandLayerId)) map.removeLayer(isobandLayerId);
  if (map.getSource(isobandSrcId)) map.removeSource(isobandSrcId);
}


export function renderCustomContourGeoJSON(map, isobands, isolines, options = {}) {
  updateMapLibreContour(map, isobands, isolines, options);
}

export function setIsobandVisibility(map, visible) {
  setLayerIsobandVisibility(map, "default", visible);
}

export function setIsolineVisibility(map, visible) {
  setLayerIsolineVisibility(map, "default", visible);
}

export function setContourVisibility(map, visible) {
  setIsobandVisibility(map, visible);
  setIsolineVisibility(map, visible);
}

export function setContourOpacity(map, opacity) {
  setLayerIsobandOpacity(map, "default", opacity);
}

