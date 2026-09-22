// contourMapSync.js - MapLibre GeoJSON layer synchronization, raster cleanup, and layer lifecycle management
import * as griddata from "griddata";
import { getElementLevels, getHexColor } from "../../utils/colormaps.js";
import { removeRasterLayer } from "../rasterLayer.js";
import { smoothGrid2D } from "../../utils/smoothContour.js";
import { formatContourLabel } from "../../utils/formatters.js";
import { isDebugMemEnabled, countGeoJSONPoints, estimateHeapMB } from "../../utils/memStats.js";
import { disarmContourReRender, disarmAllContourReRenders } from "../../services/contourReRender.js";
import {
  getLayerDOMIds,
  buildLineWidthExp,
  buildLineColorExp,
  buildLabelSizeExp,
} from "./contourStyle.js";
import {
  parseBoldValues,
  isFeatureBold,
  smoothLines,
  computeGridStats,
  evaluateCropAndLOD,
} from "./contourCompute.js";
import { resolveRenderLevels } from "./contourLevels.js";
import { clipFeatureCollectionToBBox } from "../../utils/geometry/clip.js";

export function updateMapLibreContour(map, isobands, isolines, options = {}) {
  const layerId = options.layerId || "default";
  const opacity = options.opacity !== undefined ? options.opacity : 0.75;
  const visibleIsoband = options.visibleIsoband !== undefined ? options.visibleIsoband : (options.showFill !== false && options.visible !== false);
  const visibleIsoline = options.visibleIsoline !== undefined ? options.visibleIsoline : (options.showLine !== false && options.visible !== false);
  const lineColor = options.lineColor || "#ffffff";
  const lineWidth = typeof options.lineWidth === "number" ? options.lineWidth : 2.0;
  const boldLineWidth = typeof options.boldLineWidth === "number" ? options.boldLineWidth : 4.0;
  const boldLineColor = options.boldLineColor || lineColor;

  const lineWidthExp = buildLineWidthExp(boldLineWidth, lineWidth);
  const lineColorExp = buildLineColorExp(boldLineColor, lineColor);

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
    const labelTextSize = buildLabelSizeExp(labelSize);
    if (map.getSource(isolineSrcId)) {
      map.getSource(isolineSrcId).setData(isolines);
      if (map.getLayer(isolineLayerId)) {
        map.setLayoutProperty(isolineLayerId, "visibility", visibleIsoline ? "visible" : "none");
        map.setPaintProperty(isolineLayerId, "line-color", lineColorExp);
        map.setPaintProperty(isolineLayerId, "line-width", lineWidthExp);
      }
      if (map.getLayer(isolineLabelLayerId)) {
        map.setLayoutProperty(isolineLabelLayerId, "visibility", visibleIsoline ? "visible" : "none");
        map.setPaintProperty(isolineLabelLayerId, "text-color", "#ffffff");
        try {
          map.setLayoutProperty(isolineLabelLayerId, "text-size", labelTextSize);
          map.setLayoutProperty(isolineLabelLayerId, "symbol-spacing", 160);
          map.setLayoutProperty(isolineLabelLayerId, "symbol-sort-key", ["case", ["to-boolean", ["get", "isBold"]], 0, 10]);
          map.setPaintProperty(isolineLabelLayerId, "text-halo-width", 2.5);
        } catch {}
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
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0, 0, 0, 0.95)",
          "text-halo-width": 2.5,
        },
      });
    }
  }
}

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
  let smoothLinesResult = isolines;
  if (options.smooth !== false && isolines && Array.isArray(isolines.features) && isolines.features.length > 0) {
    const it = typeof options.smoothIterations === "number" ? options.smoothIterations : 2;
    smoothLinesResult = smoothLines(isolines, it, options.step || 1);
  }
  if (options.clipBounds && smoothLinesResult && Array.isArray(smoothLinesResult.features)) {
    smoothLinesResult = clipFeatureCollectionToBBox(smoothLinesResult, options.clipBounds);
  }
  updateMapLibreContour(map, isobands, smoothLinesResult, options);
  smoothLinesResult = null;
}

export function renderContourLayers(map, gridData, element = "TMP", options = {}) {
  if (!map || !gridData || !gridData.values || !gridData.header) {
    return;
  }

  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

  const { totalCells, nLon, nLat, step, cropIdx, croppedData } = evaluateCropAndLOD(gridData, options);

  let { x, y, Z } = croppedData;

  const shouldSmooth = options.smooth !== false;
  const smoothIterations = typeof options.smoothIterations === "number" ? options.smoothIterations : 2;

  if (shouldSmooth && Z.length >= 3 && Z[0]?.length >= 3) {
    Z = smoothGrid2D(Z, 1, 0.4);
  }

  const { zMin, zMax } = computeGridStats(gridData);
  const levels = resolveRenderLevels(options) || getElementLevels(element, zMin, zMax, options.colormap);

  const isVisible = options.visible !== false;
  const showRaster = options.showRaster === true;
  const showFill = options.preserveIsobands
    ? false
    : (options.showFill !== undefined
        ? Boolean(options.showFill)
        : (!showRaster && element !== "HGT" && element !== "WIND" && element !== "DTD"));

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

  if (shouldSmooth && isolineFC.features.length > 0) {
    isolineFC = smoothLines(isolineFC, smoothIterations, step);
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

  updateMapLibreContour(map, isobandFC, isolineFC, { ...options, element, boldValues, smooth: shouldSmooth, smoothIterations });

  isobandFC = null;
  isolineFC = null;
}
