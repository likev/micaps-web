// contourLayer.js - In-browser Marching Squares isoband and isoline generator
import * as griddata from "griddata";
import { getElementLevels, getHexColor } from "../utils/colormaps.js";

export function parseBoldValues(boldInput, element = null) {
  if (!boldInput) {
    if (element === "HGT") return [5880, 588];
    if (element === "SLP") return [1010, 1000, 1020];
    if (element === "TMP") return [0];
    return [];
  }
  if (Array.isArray(boldInput)) {
    return boldInput.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  }
  if (typeof boldInput === "string") {
    return boldInput.split(/[,;\s]+/).map((v) => Number(v)).filter((v) => Number.isFinite(v));
  }
  if (typeof boldInput === "number") {
    return [boldInput];
  }
  return [];
}

export function isFeatureBold(val, boldValues) {
  if (!boldValues || !Array.isArray(boldValues) || boldValues.length === 0) return false;
  const numVal = Math.round(Number(val));
  return boldValues.some((b) => {
    const numB = Number(b);
    if (!Number.isFinite(numB)) return false;
    if (numVal === numB) return true;
    if (Math.abs(numB) >= 100 && Math.abs(numVal) >= 100) {
      if (Math.round(numVal * 10) === numB) return true;
      if (Math.round(numVal / 10) === numB) return true;
    }
    return false;
  });
}

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
  const levels = getElementLevels(element, gridData.stats?.min, gridData.stats?.max, options.colormap);

  // 1. Generate Isobands via griddata.contourf
  let isobandFC = { type: "FeatureCollection", features: [] };
  try {
    const features = griddata.contourf(Z, { x, y, levels });
    if (Array.isArray(features)) {
      for (const feature of features) {
        if (feature.properties && feature.properties.level) {
          const midVal = (feature.properties.level[0] + feature.properties.level[1]) / 2;
          feature.properties.fillColor = getHexColor(midVal, element, options.colormap, gridData.stats?.min, gridData.stats?.max);
        }
      }
      isobandFC.features = features;
    }
  } catch (err) {
    console.error("[Contour] contourf failed:", err);
  }

  // 2. Generate Isolines via griddata.contour with characteristic bold tagging
  const boldValues = parseBoldValues(options.boldValues, element);
  let isolineFC = { type: "FeatureCollection", features: [] };
  try {
    const lines = griddata.contour(Z, { x, y, levels });
    if (Array.isArray(lines)) {
      for (const f of lines) {
        if (!f.properties) f.properties = {};
        const val = f.value ?? f.properties.value ?? f.properties.level ?? 0;
        f.properties.value = val;
        f.properties.label = String(Math.round(val));
        f.properties.isBold = isFeatureBold(val, boldValues);
      }
      isolineFC.features = lines;
    }
  } catch (err) {
    console.error("[Contour] contour failed:", err);
  }

  // Update MapLibre sources
  updateMapLibreContour(map, isobandFC, isolineFC, { ...options, element, boldValues });
}

function getLayerDOMIds(layerId = "default") {
  const isDefault = layerId === "default" || layerId === "contour-TMP-850" || layerId === "contour-ECMWF_HR-TMP-850";
  return {
    isobandSrcId: isDefault ? "isoband-source" : `${layerId}-isoband-source`,
    isobandLayerId: isDefault ? "isoband-layer" : `${layerId}-isoband-layer`,
    isolineSrcId: isDefault ? "isoline-source" : `${layerId}-isoline-source`,
    isolineLayerId: isDefault ? "isoline-layer" : `${layerId}-isoline-layer`,
    isolineLabelLayerId: isDefault ? "isoline-label-layer" : `${layerId}-isoline-label-layer`,
  };
}

function updateMapLibreContour(map, isobands, isolines, options = {}) {
  const layerId = options.layerId || "default";
  const opacity = options.opacity !== undefined ? options.opacity : 0.75;
  const visibleIsoband = options.visibleIsoband !== undefined ? options.visibleIsoband : (options.showFill !== false && options.visible !== false);
  const visibleIsoline = options.visibleIsoline !== undefined ? options.visibleIsoline : (options.showLine !== false && options.visible !== false);
  const lineColor = options.lineColor || "#ffffff";
  const lineWidth = typeof options.lineWidth === "number" ? options.lineWidth : 2.0;
  const boldLineWidth = typeof options.boldLineWidth === "number" ? options.boldLineWidth : 4.0;
  const boldLineColor = options.boldLineColor || lineColor;

  const lineWidthExp = [
    "case",
    ["boolean", ["get", "isBold"], false],
    boldLineWidth,
    lineWidth,
  ];
  const lineColorExp = [
    "case",
    ["boolean", ["get", "isBold"], false],
    boldLineColor,
    lineColor,
  ];

  const { isobandSrcId, isobandLayerId, isolineSrcId, isolineLayerId, isolineLabelLayerId } = getLayerDOMIds(layerId);

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
        map.getLayer("citys-boundary") ? "citys-boundary" : (map.getLayer("provinces-boundary") ? "provinces-boundary" : undefined)
      );
    }
  }

  // --- ISOLINES (Contour Lines) & LABELS (Every 200px) ---
  if (isolines) {
    if (map.getSource(isolineSrcId)) {
      map.getSource(isolineSrcId).setData(isolines);
      if (map.getLayer(isolineLayerId)) {
        map.setLayoutProperty(isolineLayerId, "visibility", visibleIsoline ? "visible" : "none");
        map.setPaintProperty(isolineLayerId, "line-color", lineColorExp);
        map.setPaintProperty(isolineLayerId, "line-width", lineWidthExp);
      }
      if (map.getLayer(isolineLabelLayerId)) {
        map.setLayoutProperty(isolineLabelLayerId, "visibility", visibleIsoline ? "visible" : "none");
        map.setPaintProperty(isolineLabelLayerId, "text-color", lineColor);
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
          "line-color": lineColorExp,
          "line-width": lineWidthExp,
          "line-opacity": 0.85,
        },
      });

      map.addLayer({
        id: isolineLabelLayerId,
        type: "symbol",
        source: isolineSrcId,
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 200, // Label contour value every 200px
          "text-field": ["coalesce", ["get", "label"], ["to-string", ["get", "value"]]],
          "text-size": 11,
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          "visibility": visibleIsoline ? "visible" : "none",
        },
        paint: {
          "text-color": lineColor,
          "text-halo-color": "rgba(10, 15, 25, 0.95)",
          "text-halo-width": 1.5,
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
  const { isolineLayerId, isolineLabelLayerId } = getLayerDOMIds(layerId);
  const vis = visible ? "visible" : "none";
  if (map.getLayer(isolineLayerId)) map.setLayoutProperty(isolineLayerId, "visibility", vis);
  if (map.getLayer(isolineLabelLayerId)) map.setLayoutProperty(isolineLabelLayerId, "visibility", vis);
}

export function setLayerIsolineStyle(map, layerId, config = {}) {
  const { isolineLayerId, isolineLabelLayerId, isolineSrcId } = getLayerDOMIds(layerId);
  const lineWidth = typeof config.lineWidth === "number" ? config.lineWidth : 2.0;
  const boldLineWidth = typeof config.boldLineWidth === "number" ? config.boldLineWidth : 4.0;
  const lineColor = config.lineColor || "#ffffff";
  const boldLineColor = config.boldLineColor || lineColor;

  if (config.boldValues !== undefined && map.getSource(isolineSrcId)) {
    const src = map.getSource(isolineSrcId);
    if (src._data && Array.isArray(src._data.features)) {
      const parsed = parseBoldValues(config.boldValues);
      for (const f of src._data.features) {
        if (f.properties) {
          f.properties.isBold = isFeatureBold(f.properties.value, parsed);
        }
      }
      src.setData(src._data);
    }
  }

  const lineWidthExp = [
    "case",
    ["boolean", ["get", "isBold"], false],
    boldLineWidth,
    lineWidth,
  ];
  const lineColorExp = [
    "case",
    ["boolean", ["get", "isBold"], false],
    boldLineColor,
    lineColor,
  ];

  if (map.getLayer(isolineLayerId)) {
    map.setPaintProperty(isolineLayerId, "line-color", lineColorExp);
    map.setPaintProperty(isolineLayerId, "line-width", lineWidthExp);
  }
  if (map.getLayer(isolineLabelLayerId)) {
    map.setPaintProperty(isolineLabelLayerId, "text-color", lineColor);
  }
}

export function setLayerIsolineColor(map, layerId, color) {
  setLayerIsolineStyle(map, layerId, { lineColor: color });
}

export function setLayerIsolineWidth(map, layerId, width) {
  setLayerIsolineStyle(map, layerId, { lineWidth: width });
}

export function setLayerIsobandOpacity(map, layerId, opacity) {
  const { isobandLayerId } = getLayerDOMIds(layerId);
  if (map.getLayer(isobandLayerId)) map.setPaintProperty(isobandLayerId, "fill-opacity", opacity);
}

export function removeContourLayer(map, layerId) {
  const { isobandSrcId, isobandLayerId, isolineSrcId, isolineLayerId, isolineLabelLayerId } = getLayerDOMIds(layerId);

  if (map.getLayer(isolineLabelLayerId)) map.removeLayer(isolineLabelLayerId);
  if (map.getLayer(isolineLayerId)) map.removeLayer(isolineLayerId);
  if (map.getSource(isolineSrcId)) map.removeSource(isolineSrcId);
  if (map.getLayer(isobandLayerId)) map.removeLayer(isobandLayerId);
  if (map.getSource(isobandSrcId)) map.removeSource(isobandSrcId);
}


export function removeAllContourLayers(map) {
  if (!map || !map.getStyle) return;
  const style = map.getStyle();
  if (!style) return;

  if (style.layers) {
    for (const l of style.layers) {
      const id = l.id;
      if (id.includes("isoband") || id.includes("isoline") || id.startsWith("contour-") || id.startsWith("sounding-") || id.startsWith("surface-")) {
        if (map.getLayer(id)) {
          map.removeLayer(id);
        }
      }
    }
  }

  if (style.sources) {
    for (const srcId of Object.keys(style.sources)) {
      if (srcId.includes("isoband") || srcId.includes("isoline") || srcId.startsWith("contour-") || srcId.startsWith("sounding-") || srcId.startsWith("surface-")) {
        if (map.getSource(srcId)) {
          map.removeSource(srcId);
        }
      }
    }
  }
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

