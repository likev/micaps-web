// main.js - Application entry point, public facade, and bootstrap orchestrator
import { bootstrap } from "./app/bootstrap.js";
import { showErrorToast } from "./ui/toast.js";
import { clearAllWeatherLayersFromMap, loadPresetGroup, reloadConfiguration } from "./services/presetLoader.js";
import { loadWeatherField } from "./services/weatherLoader.js";
import { changeVerticalLevel } from "./services/levelController.js";
import { loadUpperAirComposite, loadObservationProduct } from "./services/derivedContours.js";

export {
  bootstrap,
  showErrorToast,
  clearAllWeatherLayersFromMap,
  loadPresetGroup,
  loadWeatherField,
  changeVerticalLevel,
  loadUpperAirComposite,
  loadObservationProduct,
  reloadConfiguration,
};

if (typeof window !== "undefined" && typeof document !== "undefined" && typeof Bun === "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
}
