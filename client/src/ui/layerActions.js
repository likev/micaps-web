// layerActions.js - Dispatcher for layer control toggle, visibility, and aux actions (Facade)
// Note: Handled via ./layers/visibilityActions.js and ./services/overlayTriggers.js:
// if (value) {
//   triggerRasterOverlay(map, layer, win);
// }

export {
  handleLayerAction,
  handleRemoveAction,
  handleAuxAction,
} from "./layers/actionsDispatcher.js";

export {
  handleVisibilityAction,
} from "./layers/visibilityActions.js";

export {
  handleConfigAction,
} from "./layers/configActions.js";

export {
  handleAddContourAction,
} from "./layers/derivedContourActions.js";

export {
  triggerIsobandOverlay,
  triggerRasterOverlay,
  triggerWindStreamlines,
  triggerWindBarbs,
  triggerStationStreamlines,
  triggerVortDivOverlay,
  getSourceFeatures,
  notifyError,
} from "../services/overlayTriggers.js";
