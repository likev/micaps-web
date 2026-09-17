// contourStyle.js - MapLibre style expressions, DOM ID helpers, and visibility/style setters for contours
import { parseBoldValues, isFeatureBold } from "./contourCompute.js";

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

export function buildLineWidthExp(boldLineWidth = 4.0, lineWidth = 2.0) {
  return [
    "case",
    ["to-boolean", ["get", "isBold"]],
    boldLineWidth,
    lineWidth,
  ];
}

export function buildLineColorExp(boldLineColor = "#ffffff", lineColor = "#ffffff") {
  return [
    "case",
    ["to-boolean", ["get", "isBold"]],
    boldLineColor,
    lineColor,
  ];
}

export function buildLabelSizeExp(labelSize = 13) {
  return ["case", ["to-boolean", ["get", "isBold"]], labelSize + 1, labelSize];
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

export function setLayerIsolineStyle(map, layerId, config = {}, parseBoldValuesFn = parseBoldValues, isFeatureBoldFn = isFeatureBold) {
  const { isolineLayerId, isolineLabelLayerId, isolineSrcId } = getLayerDOMIds(layerId);
  const lineWidth = typeof config.lineWidth === "number" ? config.lineWidth : 2.0;
  const boldLineWidth = typeof config.boldLineWidth === "number" ? config.boldLineWidth : 4.0;
  const lineColor = config.lineColor || "#ffffff";
  const boldLineColor = config.boldLineColor || lineColor;

  if (config.boldValues !== undefined && map.getSource(isolineSrcId) && parseBoldValuesFn && isFeatureBoldFn) {
    const src = map.getSource(isolineSrcId);
    const geojson = src?._data?.geojson || src?._data;
    if (geojson && Array.isArray(geojson.features)) {
      const parsed = parseBoldValuesFn(config.boldValues);
      for (const f of geojson.features) {
        if (f.properties) {
          f.properties.isBold = isFeatureBoldFn(f.properties.value, parsed);
        }
      }
      src.setData(geojson);
    }
  }

  const lineWidthExp = buildLineWidthExp(boldLineWidth, lineWidth);
  const lineColorExp = buildLineColorExp(boldLineColor, lineColor);

  if (map.getLayer(isolineLayerId)) {
    map.setPaintProperty(isolineLayerId, "line-color", lineColorExp);
    map.setPaintProperty(isolineLayerId, "line-width", lineWidthExp);
  }
  if (map.getLayer(isolineLabelLayerId)) {
    map.setPaintProperty(isolineLabelLayerId, "text-color", lineColor);
    if (typeof config.labelSize === "number" && config.labelSize > 0) {
      map.setLayoutProperty(isolineLabelLayerId, "text-size", buildLabelSizeExp(config.labelSize));
    }
  }
}

export function setLayerIsolineColor(map, layerId, color, parseBoldValuesFn = parseBoldValues, isFeatureBoldFn = isFeatureBold) {
  setLayerIsolineStyle(map, layerId, { lineColor: color }, parseBoldValuesFn, isFeatureBoldFn);
}

export function setLayerIsolineWidth(map, layerId, width, parseBoldValuesFn = parseBoldValues, isFeatureBoldFn = isFeatureBold) {
  setLayerIsolineStyle(map, layerId, { lineWidth: width }, parseBoldValuesFn, isFeatureBoldFn);
}

export function setLayerIsobandOpacity(map, layerId, opacity) {
  const { isobandLayerId } = getLayerDOMIds(layerId);
  if (map.getLayer(isobandLayerId)) map.setPaintProperty(isobandLayerId, "fill-opacity", opacity);
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
