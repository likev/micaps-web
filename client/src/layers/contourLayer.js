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
  const levels = getElementLevels(element, gridData.stats.min, gridData.stats.max);

  // 1. Generate Isobands via griddata.contourf
  let isobandFC = { type: "FeatureCollection", features: [] };
  try {
    const features = griddata.contourf(Z, { x, y, levels });
    if (Array.isArray(features)) {
      for (const feature of features) {
        if (feature.properties && feature.properties.level) {
          const midVal = (feature.properties.level[0] + feature.properties.level[1]) / 2;
          feature.properties.fillColor = getHexColor(midVal, element);
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

function updateMapLibreContour(map, isobands, isolines, options = {}) {
  const opacity = options.opacity !== undefined ? options.opacity : 0.75;
  const visible = options.visible !== false;

  // --- ISOBANDS (Fills) ---
  if (isobands) {
    if (map.getSource("isoband-source")) {
      map.getSource("isoband-source").setData(isobands);
    } else {
      map.addSource("isoband-source", {
        type: "geojson",
        data: isobands,
      });

      map.addLayer(
        {
          id: "isoband-layer",
          type: "fill",
          source: "isoband-source",
          layout: {
            visibility: visible ? "visible" : "none",
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

  // --- ISOLINES (Lines) ---
  if (isolines) {
    if (map.getSource("isoline-source")) {
      map.getSource("isoline-source").setData(isolines);
    } else {
      map.addSource("isoline-source", {
        type: "geojson",
        data: isolines,
      });

      map.addLayer({
        id: "isoline-layer",
        type: "line",
        source: "isoline-source",
        layout: {
          visibility: visible ? "visible" : "none",
        },
        paint: {
          "line-color": "rgba(255, 255, 255, 0.5)",
          "line-width": 1.2,
        },
      });
    }
  }
}

export function setContourVisibility(map, visible) {
  const vis = visible ? "visible" : "none";
  if (map.getLayer("isoband-layer")) map.setLayoutProperty("isoband-layer", "visibility", vis);
  if (map.getLayer("isoline-layer")) map.setLayoutProperty("isoline-layer", "visibility", vis);
}

export function setContourOpacity(map, opacity) {
  if (map.getLayer("isoband-layer")) map.setPaintProperty("isoband-layer", "fill-opacity", opacity);
}
