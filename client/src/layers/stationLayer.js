// stationLayer.js - Facade re-exporting station modules for backwards compatibility
export {
  mapState,
  lastStationGeoJSON,
  getState,
  getStationGeoJSON,
  clearStationMarkersForMap,
} from "./station/stationState.js";

export {
  FIELD_KEYS,
  extractRawNumber,
  extractTemp,
  extractPressureOrHeight,
  hashStation,
  getFieldValue,
} from "./station/stationExtract.js";

export {
  evaluateSingleRule,
  matchesStationFilters,
  compileStationFilter,
  isViewOnly,
  normalizeFilterField,
  collectActiveRules,
  isFieldVisibleInView,
  filterFieldToConfigFlag,
  getViewAutoCheckPatch,
  VIEW_LOGIC,
} from "./station/stationFilter.js";

export {
  drawWindBarbCanvas,
  drawSkyCoverCanvas,
} from "./station/stationSymbols.js";

export {
  renderStationPlotToCanvas,
} from "./station/stationPlot.js";

export {
  isPointInBounds,
  onStationMouseMove,
  handleStationHover,
  handleStationMouseOut,
} from "./station/stationHover.js";

export {
  setStationConfig,
  ensureStationCanvas,
  getStationCanvas,
  renderStationWeatherPlots,
  drawStationCanvas,
  updateVisibleMarkersForMap,
  updateVisibleMarkers,
  setStationVisibility,
  removeStationLayer,
} from "./station/stationCanvas.js";
