// layerControl.js - Interactive per-window multi-layer management panel (Facade)
// Note: "👁" : "🚫" and layer-hidden are used in ./layers/layerRowView.js and ./layers/layerRowBindings.js

export {
  isWindRelated,
  isUpperAirStationLayer,
  resolveDefaultScheme,
  resolveDefaultProjection,
  createDefaultLayers,
  buildBaseConfig,
} from "./layers/layerDefaults.js";

export {
  getLayersForWindow,
  getLayerById,
  getLayers,
  clearWindowWeatherLayers,
  addOrUpdateLayer,
  removeLayer,
  syncLayerControlForWindow,
  getCurrentActiveWinId,
  getCurrentActiveWinTitle,
  getOnLayerActionCallback,
} from "./layers/layerStore.js";

export {
  populatePaletteSelect,
} from "./layers/palettePicker.js";

export {
  renderLayerRow,
  renderWindDrawerHTML,
  renderStationDrawerHTML,
} from "./layers/layerRowView.js";

export {
  bindLayerRowEvents,
  bindAuxCheckbox,
  bindAuxCheckboxes,
} from "./layers/layerRowBindings.js";

export {
  renderLayersManager,
  initLayerControl,
} from "./layers/layerListView.js";
