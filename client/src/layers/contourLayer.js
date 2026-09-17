// contourLayer.js - Facade re-exporting contour modules for backwards compatibility
// Note: "symbol-sort-key" is used in ./contour/contourMapSync.js to prioritize bold labels
export {
  parseBoldValues,
  isFeatureBold,
  smoothLines,
  computeGridStats,
  evaluateCropAndLOD,
} from "./contour/contourCompute.js";

export {
  getLayerDOMIds,
  buildLineWidthExp,
  buildLineColorExp,
  buildLabelSizeExp,
  setLayerIsobandVisibility,
  setLayerIsolineVisibility,
  setLayerIsolineStyle,
  setLayerIsolineColor,
  setLayerIsolineWidth,
  setLayerIsobandOpacity,
  setIsobandVisibility,
  setIsolineVisibility,
  setContourVisibility,
  setContourOpacity,
} from "./contour/contourStyle.js";

export {
  updateMapLibreContour,
  flushContourSource,
  removeContourLayer,
  removeAllContourLayers,
  renderCustomContourGeoJSON,
  renderContourLayers,
} from "./contour/contourMapSync.js";
