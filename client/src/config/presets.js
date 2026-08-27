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
