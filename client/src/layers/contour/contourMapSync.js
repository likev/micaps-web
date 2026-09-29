// contourMapSync.js - MapLibre GeoJSON layer synchronization, raster cleanup, and layer lifecycle management
import * as griddata from "griddata";
import { getElementLevels, getHexColor, isRainElement } from "../../utils/colormaps.js";
import { removeRasterLayer } from "../rasterLayer.js";
import { smoothGrid2D } from "../../utils/smoothContour.js";
import { formatContourLabel } from "../../utils/formatters.js";
import { isDebugMemEnabled, countGeoJSONPoints, estimateHeapMB } from "../../utils/memStats.js";
import * as contourReRender from "../../services/contourReRender.js";
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
import { getPlotTokens } from "../../map/themeTokens.js";

export function updateMapLibreContour(map, isobands, isolines, options = {}) {
  const layerId = options.layerId || "default";
  const opacity = options.opacity !== undefined ? options.opacity : 0.75;
  const visibleIsoband = options.visibleIsoband !== undefined ? options.visibleIsoband : (options.showFill !== false && options.visible !== false);
  const visibleIsoline = options.visibleIsoline !== undefined ? options.visibleIsoline : (options.showLine !== false && options.visible !== false);
  const showLabels = options.showLabels !== false;
  const visibleLabel = options.visibleLabel !== undefined ? options.visibleLabel : (visibleIsoline && showLabels);
  const lineColor = options.lineColor || "#ffffff";
  const lineWidth = typeof options.lineWidth === "number" ? options.lineWidth : 2.0;
  const boldLineWidth = typeof options.boldLineWidth === "number" ? options.boldLineWidth : 4.0;
  const boldLineColor = options.boldLineColor || lineColor;

  const lineWidthExp = buildLineWidthExp(boldLineWidth, lineWidth);
  const lineColorExp = buildLineColorExp(boldLineColor, lineColor);

  const { isobandSrcId, isobandLayerId, isolineSrcId, isolineLayerId, isolineLabelSrcId, isolineLabelLayerId } = getLayerDOMIds(layerId);
  const emptyFC = { type: "FeatureCollection", features: [] };

  // --- ISOBANDS (Contour Fills) ---
  if (isobands) {
    const hasIsobandFeatures = Array.isArray(isobands.features) && isobands.features.length > 0;
    const isobandData = (visibleIsoband && hasIsobandFeatures) ? isobands : emptyFC;
    const isobandSrc = map.getSource(isobandSrcId);

    if (isobandSrc) {
      const curFeatures = isobandSrc._data?.geojson?.features || isobandSrc._data?.features || isobandSrc.data?.features || [];
      if (hasIsobandFeatures || curFeatures.length > 0) {
        isobandSrc.setData(isobandData);
      }
      if (map.getLayer(isobandLayerId)) {
        map.setLayoutProperty(isobandLayerId, "visibility", visibleIsoband ? "visible" : "none");
        if (visibleIsoband) {
          map.setPaintProperty(isobandLayerId, "fill-opacity", opacity);
        }
      }
    } else {
      map.addSource(isobandSrcId, {
        type: "geojson",
        data: isobandData,
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
    const hasIsolineFeatures = Array.isArray(isolines.features) && isolines.features.length > 0;
    const labelSize = typeof options.labelSize === "number" && options.labelSize > 0 ? options.labelSize : 13;
    const labelTextSize = buildLabelSizeExp(labelSize);

    // 1. Line layer on dedicated isolineSrcId (no font glyph dependency, instant render)
    const lineData = visibleIsoline ? isolines : emptyFC;
    const isolineSrc = map.getSource(isolineSrcId);
    if (isolineSrc) {
      if (!options.preserveIsolines) {
        const curFeatures = isolineSrc._data?.geojson?.features || isolineSrc._data?.features || isolineSrc.data?.features || [];
        if (hasIsolineFeatures || curFeatures.length > 0) {
          isolineSrc.setData(lineData);
        }
      }
      if (map.getLayer(isolineLayerId)) {
        map.setLayoutProperty(isolineLayerId, "visibility", visibleIsoline ? "visible" : "none");
        if (visibleIsoline) {
          map.setPaintProperty(isolineLayerId, "line-color", lineColorExp);
          map.setPaintProperty(isolineLayerId, "line-width", lineWidthExp);
        }
      }
    } else {
      map.addSource(isolineSrcId, {
        type: "geojson",
        data: lineData,
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
    }

    // 2. Label layer on decoupled isolineLabelSrcId (symbol layer)
    const labelData = visibleLabel ? isolines : emptyFC;
    const isolineLabelSrc = map.getSource(isolineLabelSrcId);
    if (isolineLabelSrc) {
      const curLabelFeatures = isolineLabelSrc._data?.geojson?.features || isolineLabelSrc._data?.features || isolineLabelSrc.data?.features || [];
      if (visibleLabel || curLabelFeatures.length > 0) {
        isolineLabelSrc.setData(labelData);
      }
      if (map.getLayer(isolineLabelLayerId)) {
        map.setLayoutProperty(isolineLabelLayerId, "visibility", visibleLabel ? "visible" : "none");
        if (visibleLabel) {
          const scheme = map.__basemapScheme || "dark";
          const plotTokens = getPlotTokens(scheme);
          const textColor = scheme === "light" ? plotTokens.ppp.color : "#ffffff";
          map.setPaintProperty(isolineLabelLayerId, "text-color", textColor);
          map.setPaintProperty(isolineLabelLayerId, "text-halo-color", plotTokens.halo);
          try {
            map.setLayoutProperty(isolineLabelLayerId, "text-size", labelTextSize);
            map.setLayoutProperty(isolineLabelLayerId, "symbol-spacing", 160);
            map.setLayoutProperty(isolineLabelLayerId, "symbol-sort-key", ["case", ["to-boolean", ["get", "isBold"]], 0, 10]);
            map.setPaintProperty(isolineLabelLayerId, "text-halo-width", plotTokens.haloWidth || 2.5);
          } catch {}
        }
      }
    } else {
      map.addSource(isolineLabelSrcId, {
        type: "geojson",
        data: labelData,
      });

      const scheme = map.__basemapScheme || "dark";
      const plotTokens = getPlotTokens(scheme);
      const textColor = scheme === "light" ? plotTokens.ppp.color : "#ffffff";
      map.addLayer({
        id: isolineLabelLayerId,
        type: "symbol",
        source: isolineLabelSrcId,
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 160,
          "text-field": ["coalesce", ["get", "label"], ["to-string", ["get", "value"]]],
          "text-size": labelTextSize,
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-allow-overlap": false,
          "symbol-sort-key": ["case", ["to-boolean", ["get", "isBold"]], 0, 10],
          "visibility": visibleLabel ? "visible" : "none",
        },
        paint: {
          "text-color": textColor,
          "text-halo-color": plotTokens.halo,
          "text-halo-width": plotTokens.haloWidth || 2.5,
        },
      });
    }
  }
}

export function flushContourSource(map, layerId = "default") {
  if (!map) return;
  const { isobandSrcId, isolineSrcId, isolineLabelSrcId } = getLayerDOMIds(layerId);
  const emptyFC = { type: "FeatureCollection", features: [] };
  for (const srcId of [isobandSrcId, isolineSrcId, isolineLabelSrcId]) {
    try {
      const src = map.getSource(srcId);
      if (src && typeof src.setData === "function") {
        src.setData(emptyFC);
      }
    } catch {}
  }
}

export function removeContourLayer(map, layerId, win = null) {
  flushContourSource(map, layerId);
  contourReRender.disarmContourReRender?.(map, layerId, win);

  const { isobandSrcId, isobandLayerId, isolineSrcId, isolineLayerId, isolineLabelSrcId, isolineLabelLayerId } = getLayerDOMIds(layerId);

  if (map.getLayer(isolineLabelLayerId)) map.removeLayer(isolineLabelLayerId);
  if (map.getSource(isolineLabelSrcId)) map.removeSource(isolineLabelSrcId);
  if (map.getLayer(isolineLayerId)) map.removeLayer(isolineLayerId);
  if (map.getSource(isolineSrcId)) map.removeSource(isolineSrcId);
  if (map.getLayer(isobandLayerId)) map.removeLayer(isobandLayerId);
  if (map.getSource(isobandSrcId)) map.removeSource(isobandSrcId);
  removeRasterLayer(map, layerId);
}

export function removeAllContourLayers(map, win = null) {
  contourReRender.disarmAllContourReRenders?.(map, win);
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

  const isVisible = options.visible !== false;
  const showRaster = options.showRaster === true;
  const showFill = options.preserveIsobands
    ? false
    : (options.showFill !== undefined
        ? Boolean(options.showFill)
        : (!showRaster && element !== "HGT" && element !== "WIND" && element !== "DTD"));
  const showLine = options.showLine !== false;

  const shouldSmooth = options.smooth !== false;
  const smoothIterations = typeof options.smoothIterations === "number" ? options.smoothIterations : 2;

  const needContours = isVisible && (showFill || showLine);
  if (needContours && shouldSmooth && Z.length >= 3 && Z[0]?.length >= 3) {
    Z = smoothGrid2D(Z, 1, 0.4);
  }

  const { zMin, zMax } = computeGridStats(gridData);
  let levels = resolveRenderLevels(options) || getElementLevels(element, zMin, zMax, options.colormap);
  if (isRainElement(element) || isRainElement(options.colormap)) {
    levels = levels.map((l) => (l < 0.1 ? 0.1 : l));
    levels = Array.from(new Set(levels)).sort((a, b) => a - b);
    if (levels.length < 2) levels = [0.1, 1, 10, 25, 50, 100, 250];
  }

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
