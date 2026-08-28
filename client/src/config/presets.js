// presets.js - Runtime-loaded composite preset configuration
import { setColormaps } from "../utils/colormaps.js";

const PRESETS_URL = new URL("./presets.json", document.baseURI);

// Keep this as a live export so existing consumers see a successfully reloaded
// configuration without needing to be re-imported.
export let PRESET_GROUPS = [];

export async function loadPresetGroups() {
  const url = new URL(PRESETS_URL.href);
  url.searchParams.set("_reload", Date.now().toString());

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Preset config request failed (${response.status})`);
  }

  const config = await response.json();
  const groups = Array.isArray(config) ? config : config?.presets;
  if (!Array.isArray(groups) || groups.some((group) => !group || !group.id || !Array.isArray(group.layers))) {
    throw new Error("Preset config must be an array of groups with id and layers");
  }

  if (!Array.isArray(config) && config.colormaps !== undefined) {
    setColormaps(config.colormaps);
  }
  PRESET_GROUPS = groups;
  return PRESET_GROUPS;
}

export const DEFAULT_MOCK_OBS_FILES = [
  "20260827170000.000",
  "20260827200000.000",
  "20260828020000.000",
  "20260828050000.000",
  "20260828080000.000",
  "20260828110000.000",
  "20260828140000.000",
  "20260828170000.000",
];
