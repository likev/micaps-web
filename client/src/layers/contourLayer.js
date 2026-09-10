// contourLayer.js - In-browser Marching Squares isoband and isoline generator
import * as griddata from "griddata";
import { getElementLevels, getHexColor } from "../utils/colormaps.js";
import { removeRasterLayer } from "./rasterLayer.js";
import { smoothFeatureCollection, smoothGrid2D, simplifyFeatureCollection } from "../utils/smoothContour.js";
import { formatContourLabel } from "../utils/formatters.js";
import { getMaxEffectiveCells } from "../config/presets.js";
import {
  getFullGridStep,
  computeCropIndices,
  cropGridValues,
  resolveContourStep,
  shouldBypassCrop,
} from "../utils/viewportCrop.js";
import { isDebugMemEnabled, countGeoJSONPoints, estimateHeapMB } from "../utils/memStats.js";
import { disarmContourReRender, disarmAllContourReRenders } from "../services/contourReRender.js";

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

  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

  const nLon = gridData.header.n_lon;
  const nLat = gridData.header.n_lat;
  const totalCells = nLon * nLat;

  // Budget resolved from config.json -> performance.maxEffectiveCells (default 50000)
  const budget = Number.isFinite(options.maxEffectiveCells) && options.maxEffectiveCells > 0
    ? getMaxEffectiveCells(options.maxEffectiveCells)
    : getMaxEffectiveCells();

  // §8.8.4 3-Stage Spatial Evaluation Pipeline:
  // 1. When total grid cells < 50,000: BBox crop is completely bypassed, step = 1
  // 2. When total grid cells >= 50,000: BBox Crop to viewport + buffer margin
  // 3. Deciding step strictly by cell count after bbox crop (N_crop)
  let step = 1;
  let cropIdx = null;
  let croppedData = null;

  const isSmallGrid = shouldBypassCrop(totalCells, budget);
  const enableBBoxCrop = options.enableBBoxCrop !== false;

  if (isSmallGrid) {
    // Stage 1: Complete BBox crop bypass & locked step = 1 (Zero pan/zoom re-computation)
    step = 1;
    cropIdx = { iMin: 0, iMax: nLon - 1, jMin: 0, jMax: nLat - 1, nLonCrop: nLon, nLatCrop: nLat, nCrop: totalCells };
    croppedData = cropGridValues(gridData, cropIdx, step);
  } else {
    // Stage 2 & 3: Large grid (>= 50,000 cells)
    if (enableBBoxCrop && options.viewportBounds) {
      // Stage 2: Viewport BBox Crop
      cropIdx = computeCropIndices(gridData.header, gridData.x, gridData.y, options.viewportBounds, options.bufferDelta ?? 1.75);
      // Stage 3: Deciding step strictly by cell count after bbox crop
      step = resolveContourStep(cropIdx.nCrop, budget);
      croppedData = cropGridValues(gridData, cropIdx, step);
    } else {
      // Headless / fallback without viewport bounds
      step = getFullGridStep(nLon, nLat, budget);
      cropIdx = { iMin: 0, iMax: nLon - 1, jMin: 0, jMax: nLat - 1, nLonCrop: nLon, nLatCrop: nLat, nCrop: totalCells };
      croppedData = cropGridValues(gridData, cropIdx, step);
    }
  }

  let { x, y, Z } = croppedData;

  const shouldSmooth = options.smooth !== false;
  const smoothIterations = typeof options.smoothIterations === "number" ? options.smoothIterations : 2;

  // 2D Spatial Filtering on scalar grid to eliminate single-grid noise before Marching Squares
  if (shouldSmooth && Z.length >= 3 && Z[0]?.length >= 3) {
    Z = smoothGrid2D(Z, 1, 0.4);
  }

  // Ensure stats min/max are computed if missing (e.g. from interpolated/synthetic grids)
  let zMin = gridData.stats?.min;
  let zMax = gridData.stats?.max;
  if ((zMin === undefined || zMax === undefined) && Array.isArray(gridData.values) && gridData.values.length > 0) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < gridData.values.length; i++) {
      const v = gridData.values[i];
      if (typeof v === "number" && !isNaN(v) && v > -9990) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (min !== Infinity && max !== -Infinity) {
      zMin = min;
      zMax = max;
      if (!gridData.stats) gridData.stats = { min, max };
    }
  }

  // Determine isoline levels
  const levels = options.levels || getElementLevels(element, zMin, zMax, options.colormap);

  const isVisible = options.visible !== false;
  const showRaster = options.showRaster === true;
  const showFill = options.preserveIsobands
    ? false
    : (options.showFill !== undefined
        ? Boolean(options.showFill)
        : (!showRaster && element !== "HGT" && element !== "WIND" && element !== "DTD"));

  // Phase 3 (§8.8.3 & §8.5.4): Skip contourf entirely if showFill is false or if showRaster is active.
  // When preserveIsobands is true (e.g. pan/zoom re-render), isobandFC is null to protect existing isobands.
  let isobandFC = options.preserveIsobands ? null : { type: "FeatureCollection", features: [] };
  if (!options.preserveIsobands && isVisible && showFill && !showRaster) {
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
  }

  // 2. Generate Isolines via griddata.contour with characteristic bold tagging
  const boldValues = parseBoldValues(options.boldValues, element);
  let isolineFC = { type: "FeatureCollection", features: [] };
  const showLine = options.showLine !== false;
  if (isVisible && showLine) {
    try {
      const lines = griddata.contour(Z, { x, y, levels });
      if (Array.isArray(lines)) {
        const isDam = (gridData.stats?.max !== undefined) ? gridData.stats.max < 2500 : false;
        for (const f of lines) {
          if (!f.properties) f.properties = {};
          const val = f.value ?? f.properties.value ?? f.properties.level ?? 0;
          f.properties.value = val;
          f.properties.label = formatContourLabel(val, element, isDam);
          f.properties.isBold = isFeatureBold(val, boldValues);
        }
        isolineFC.features = lines;
      }
    } catch (err) {
      console.error("[Contour] contour failed:", err);
    }
  }

  // 3. Douglas-Peucker pre-pass & Chaikin vector curve smoothing (§8.8.5)
  if (shouldSmooth && isolineFC.features.length > 0) {
    const dpTolerance = Math.max(0.01, 0.02 * (step || 1));
    isolineFC = simplifyFeatureCollection(isolineFC, dpTolerance);
    isolineFC = smoothFeatureCollection(isolineFC, smoothIterations);
  }

  const elapsedMs = typeof performance !== "undefined" ? Math.round((performance.now() - t0) * 10) / 10 : 0;
  const isobandPts = countGeoJSONPoints(isobandFC);
  const isolinePts = countGeoJSONPoints(isolineFC);
  const totalPts = isobandPts + isolinePts;
  const estimatedHeap = estimateHeapMB(isolineFC) + estimateHeapMB(isobandFC);

  const stats = {
    nLon,
    nLat,
    totalCells,
    nCrop: cropIdx?.nCrop ?? totalCells,
    effectiveCells: croppedData.nCells,
    step,
    elapsedMs,
    isobandPoints: isobandPts,
    isolinePoints: isolinePts,
    totalPoints: totalPts,
    estimatedHeapMB: estimatedHeap,
  };

  if (typeof options.onStats === "function") {
    try { options.onStats(stats); } catch {}
  }
  if (isDebugMemEnabled()) {
    console.debug(`[Contour] ${totalCells} cells -> cropped ${stats.nCrop}, step=${step}, ${elapsedMs}ms, ${totalPts} pts, ~${estimatedHeap}MB`);
  }

  // Update MapLibre sources
  updateMapLibreContour(map, isobandFC, isolineFC, { ...options, element, boldValues, smooth: shouldSmooth, smoothIterations });

  // Phase 2 (§8.8.5): Dereference GeoJSON FeatureCollections after upload
  isobandFC = null;
  isolineFC = null;
}

export function getLayerDOMIds(layerId = "default") {
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
    ["to-boolean", ["get", "isBold"]],
    boldLineWidth,
    lineWidth,
  ];
  const lineColorExp = [
    "case",
    ["to-boolean", ["get", "isBold"]],
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
  } else if (options.preserveIsobands && map.getLayer(isobandLayerId)) {
    if (visibleIsoband !== undefined) {
      map.setLayoutProperty(isobandLayerId, "visibility", visibleIsoband ? "visible" : "none");
    }
    if (opacity !== undefined) {
      map.setPaintProperty(isobandLayerId, "fill-opacity", opacity);
    }
  }

  // --- ISOLINES (Contour Lines) & LABELS (Every 200px) ---
  if (isolines) {
    const labelSize = typeof options.labelSize === "number" && options.labelSize > 0 ? options.labelSize : 13;
    const labelTextSize = ["case", ["to-boolean", ["get", "isBold"]], labelSize + 1, labelSize];
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
        // Migrate pre-existing label layers (created with text-size 11) to current spec
        // and honour per-layer labelSize on data refresh without requiring remove/recreate.
        try {
          map.setLayoutProperty(isolineLabelLayerId, "text-size", labelTextSize);
          map.setLayoutProperty(isolineLabelLayerId, "symbol-spacing", 160);
          map.setLayoutProperty(isolineLabelLayerId, "symbol-sort-key", ["case", ["to-boolean", ["get", "isBold"]], 0, 10]);
          map.setPaintProperty(isolineLabelLayerId, "text-halo-width", 2.0);
        } catch { /* ignore style-spec errors on older layers */ }
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
          "line-join": "round",
          "line-cap": "round",
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
          "symbol-spacing": 160,
          "text-field": ["coalesce", ["get", "label"], ["to-string", ["get", "value"]]],
          "text-size": labelTextSize,
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-allow-overlap": false,
          "symbol-sort-key": ["case", ["to-boolean", ["get", "isBold"]], 0, 10],
          "visibility": visibleIsoline ? "visible" : "none",
        },
        paint: {
          "text-color": lineColor,
          "text-halo-color": "rgba(10, 15, 25, 0.95)",
          "text-halo-width": 2.0,
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
    const geojson = src?._data?.geojson || src?._data;
    if (geojson && Array.isArray(geojson.features)) {
      const parsed = parseBoldValues(config.boldValues);
      for (const f of geojson.features) {
        if (f.properties) {
          f.properties.isBold = isFeatureBold(f.properties.value, parsed);
        }
      }
      src.setData(geojson);
    }
  }

  const lineWidthExp = [
    "case",
    ["to-boolean", ["get", "isBold"]],
    boldLineWidth,
    lineWidth,
  ];
  const lineColorExp = [
    "case",
    ["to-boolean", ["get", "isBold"]],
    boldLineColor,
    lineColor,
  ];

  if (map.getLayer(isolineLayerId)) {
    map.setPaintProperty(isolineLayerId, "line-color", lineColorExp);
    map.setPaintProperty(isolineLayerId, "line-width", lineWidthExp);
  }
  if (map.getLayer(isolineLabelLayerId)) {
    map.setPaintProperty(isolineLabelLayerId, "text-color", lineColor);
    if (typeof config.labelSize === "number" && config.labelSize > 0) {
      map.setLayoutProperty(isolineLabelLayerId, "text-size", [
        "case",
        ["to-boolean", ["get", "isBold"]],
        config.labelSize + 1,
        config.labelSize,
      ]);
    }
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

/**
 * Flushes WebGL vector tile pyramids from MapLibre's Web Worker (§8.8.5).
 * Updates isoband and isoline sources with an empty FeatureCollection before removal or layer reuse.
 *
 * @param {Object} map - MapLibre map instance
 * @param {string} [layerId="default"] - Layer identifier
 */
export function flushContourSource(map, layerId = "default") {
  if (!map) return;
  const { isobandSrcId, isolineSrcId } = getLayerDOMIds(layerId);
  const emptyFC = { type: "FeatureCollection", features: [] };
  try {
    const isobandSrc = map.getSource(isobandSrcId);
    if (isobandSrc && typeof isobandSrc.setData === "function") {
      isobandSrc.setData(emptyFC);
    }
  } catch {}
  try {
    const isolineSrc = map.getSource(isolineSrcId);
    if (isolineSrc && typeof isolineSrc.setData === "function") {
      isolineSrc.setData(emptyFC);
    }
  } catch {}
}

export function removeContourLayer(map, layerId) {
  // Phase 2 (§8.8.5): Flush worker vector tiles before removal
  flushContourSource(map, layerId);
  disarmContourReRender(map, layerId);

  const { isobandSrcId, isobandLayerId, isolineSrcId, isolineLayerId, isolineLabelLayerId } = getLayerDOMIds(layerId);

  if (map.getLayer(isolineLabelLayerId)) map.removeLayer(isolineLabelLayerId);
  if (map.getLayer(isolineLayerId)) map.removeLayer(isolineLayerId);
  if (map.getSource(isolineSrcId)) map.removeSource(isolineSrcId);
  if (map.getLayer(isobandLayerId)) map.removeLayer(isobandLayerId);
  if (map.getSource(isobandSrcId)) map.removeSource(isobandSrcId);
  removeRasterLayer(map, layerId);
}


export function removeAllContourLayers(map) {
  disarmAllContourReRenders(map);
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
          try { map.getSource(srcId).setData({ type: "FeatureCollection", features: [] }); } catch {}
          map.removeSource(srcId);
        }
      }
    }
  }
}

export function renderCustomContourGeoJSON(map, isobands, isolines, options = {}) {
  let smoothLines = isolines;
  if (options.smooth !== false && isolines && Array.isArray(isolines.features) && isolines.features.length > 0) {
    const it = typeof options.smoothIterations === "number" ? options.smoothIterations : 2;
    // Douglas-Peucker pre-pass (§8.8.5)
    const dpTolerance = Math.max(0.01, 0.02 * (options.step || 1));
    const simplified = simplifyFeatureCollection(isolines, dpTolerance);
    smoothLines = smoothFeatureCollection(simplified, it);
  }
  updateMapLibreContour(map, isobands, smoothLines, options);
  smoothLines = null;
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

