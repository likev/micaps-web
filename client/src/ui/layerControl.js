// layerControl.js - Interactive per-window multi-layer management panel (Facade)

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
