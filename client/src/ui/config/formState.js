// formState.js - Config draft store, pub/sub, dual-document & intra-item fold state
import { formatCompactJSON } from "../../config/presets.js";
import { compactConfigForSave } from "../../config/renderProfiles.js";
import { validateConfig } from "./configSchema.js";
import {
  collectItemCollapsibleKeys,
  foldAllItemKeys,
  unfoldAllItemKeys,
  unfoldItemKey,
} from "./jsonFoldState.js";
import { rewriteColormapReferences } from "./colormapUtils.js";

/**
 * HTML escaping helper for user-supplied strings.
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Deep clones an object safely.
 */
export function deepClone(obj) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(obj);
    } catch {
      // Fallback
    }
  }
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Clones a preset group and inserts it directly below the source.
 */
export function clonePresetGroup(draft, sourceId) {
  if (!draft || !Array.isArray(draft.presets)) {
    return { ok: false, error: "Invalid draft presets" };
  }
  const idx = draft.presets.findIndex((p) => p.id === sourceId && !p.divider);
  if (idx === -1) {
    return { ok: false, error: `Source preset "${sourceId}" not found` };
  }
  const source = draft.presets[idx];
  const copy = deepClone(source);

  const existingIds = new Set(draft.presets.map((p) => p?.id));
  let baseId = `${sourceId}-copy`;
  let newId = baseId;
  let counter = 2;
  while (existingIds.has(newId)) {
    newId = `${baseId}-${counter++}`;
  }

  copy.id = newId;
  copy.name = `${source.name || source.id} (Copy)`;
  if (Array.isArray(copy.layers)) {
    copy.layers.forEach((l) => {
      l.removable = true;
    });
  }

  draft.presets.splice(idx + 1, 0, copy);
  return { ok: true, newId, group: copy };
}

/**
 * Clones a layer within the same preset or to another preset.
 */
export function cloneLayer(draft, presetId, layerId, targetPresetId = presetId) {
  if (!draft || !Array.isArray(draft.presets)) {
    return { ok: false, error: "Invalid draft presets" };
  }
  const srcPreset = draft.presets.find((p) => p.id === presetId && !p.divider);
  if (!srcPreset || !Array.isArray(srcPreset.layers)) {
    return { ok: false, error: `Source preset "${presetId}" not found` };
  }
  const srcLayerIdx = srcPreset.layers.findIndex((l) => l.id === layerId);
  if (srcLayerIdx === -1) {
    return { ok: false, error: `Layer "${layerId}" not found in preset "${presetId}"` };
  }

  const targetPreset = draft.presets.find((p) => p.id === targetPresetId && !p.divider);
  if (!targetPreset || !Array.isArray(targetPreset.layers)) {
    return { ok: false, error: `Target preset "${targetPresetId}" not found` };
  }

  const sourceLayer = srcPreset.layers[srcLayerIdx];
  const layerCopy = deepClone(sourceLayer);

  const targetLayerIds = new Set(targetPreset.layers.map((l) => l?.id));
  let baseId = `${layerId}-copy`;
  let newLayerId = baseId;
  let counter = 2;
  while (targetLayerIds.has(newLayerId)) {
    newLayerId = `${baseId}-${counter++}`;
  }

  layerCopy.id = newLayerId;
  layerCopy.name = `${sourceLayer.name || sourceLayer.id} (Copy)`;
  layerCopy.removable = true;

  let warning = null;
  if (presetId === targetPresetId) {
    srcPreset.layers.splice(srcLayerIdx + 1, 0, layerCopy);
  } else {
    const warnings = [];
    if (layerCopy.derivedFrom) {
      const siblingExists = targetPreset.layers.some((l) => l.id === layerCopy.derivedFrom);
      if (!siblingExists) {
        warnings.push(`derivedFrom "${layerCopy.derivedFrom}" not found in "${targetPreset.name || targetPreset.id}" — cleared`);
        delete layerCopy.derivedFrom;
      }
    }
    if (Boolean(srcPreset.hasLevel) !== Boolean(targetPreset.hasLevel)) {
      warnings.push(`hasLevel mismatch: source is ${srcPreset.hasLevel ? "multi-level" : "single-level"}, target is ${targetPreset.hasLevel ? "multi-level" : "single-level"}`);
    }
    if (warnings.length > 0) {
      warning = warnings.join("; ");
    }
    targetPreset.layers.push(layerCopy);
  }

  return { ok: true, newId: newLayerId, layer: layerCopy, warning };
}

/**
 * Inserts a visual divider between presets.
 */
export function insertDivider(draft, index = -1, label = "") {
  if (!draft) return { ok: false, error: "Invalid draft" };
  if (!Array.isArray(draft.presets)) draft.presets = [];

  const existingIds = new Set(draft.presets.map((p) => p?.id));
  let counter = 1;
  let newId = `div-${counter}`;
  while (existingIds.has(newId)) {
    counter++;
    newId = `div-${counter}`;
  }

  const divider = { id: newId, divider: true };
  if (label && typeof label === "string" && label.trim()) {
    divider.label = label.trim();
  }

  if (index >= 0 && index <= draft.presets.length) {
    draft.presets.splice(index, 0, divider);
  } else {
    draft.presets.push(divider);
  }

  return { ok: true, newId, divider };
}

/**
 * Reorders entries in draft.presets.
 */
export function moveEntry(draft, fromIndex, toIndex) {
  if (!draft || !Array.isArray(draft.presets)) {
    return { ok: false, error: "Invalid draft presets" };
  }
  const len = draft.presets.length;
  if (fromIndex < 0 || fromIndex >= len || toIndex < 0 || toIndex >= len) {
    return { ok: false, error: `Indices out of bounds: from ${fromIndex}, to ${toIndex}` };
  }
  if (fromIndex === toIndex) return { ok: true };

  const [item] = draft.presets.splice(fromIndex, 1);
  draft.presets.splice(toIndex, 0, item);
  return { ok: true };
}

/**
 * Deletes a divider by its id.
 */
export function deleteDivider(draft, id) {
  if (!draft || !Array.isArray(draft.presets)) {
    return { ok: false, error: "Invalid draft presets" };
  }
  const idx = draft.presets.findIndex((p) => p.id === id && p.divider === true);
  if (idx === -1) {
    return { ok: false, error: `Divider "${id}" not found` };
  }
  draft.presets.splice(idx, 1);
  return { ok: true };
}

/**
 * Creates reactive form state container managing config & colormap drafts and folding state.
 * @param {Object} initialConfig
 * @returns {Object} FormState instance
 */
export function createFormState(initialConfig = {}) {
  let initialCloned = deepClone(initialConfig);

  // Separate colormaps from config
  let colormapsDraft = deepClone(initialCloned.colormaps || {});
  let configDraft = deepClone(initialCloned);
  delete configDraft.colormaps;

  // Clean null levels in layers
  (configDraft.presets || []).forEach((p) => {
    if (p.divider || !Array.isArray(p.layers)) return;
    p.layers.forEach((l) => {
      if (l.render && l.render.levels === null) {
        delete l.render.levels;
      }
    });
  });

  let lastSavedConfigText = formatCompactJSON(configDraft);
  let lastSavedColormapsText = formatCompactJSON(colormapsDraft);

  let activeDocTab = "config"; // "config" | "colormaps"
  let unfoldedItemPath = null; // null => all items folded by default!
  let itemFoldedKeyPaths = new Set();
  let itemSyntaxErrors = new Map(); // path -> error message

  // Retain legacy subtab & selection tracking for test compatibility
  let activeSubTab = "presets";
  let selectedPresetId = configDraft.presets?.find((p) => !p.divider)?.id || configDraft.presets?.[0]?.id || null;
  let selectedColormapName = Object.keys(colormapsDraft)[0] || null;

  function buildMergedDraft() {
    return {
      ...deepClone(configDraft),
      colormaps: deepClone(colormapsDraft),
    };
  }

  let validation = validateConfig(buildMergedDraft());
  const listeners = new Set();

  function notify() {
    state.revision++;
    state.configDraft = configDraft;
    state.colormapsDraft = colormapsDraft;
    state.validation = validation;
    state.unfoldedItemPath = unfoldedItemPath;
    state.itemFoldedKeyPaths = itemFoldedKeyPaths;
    state.activeDocTab = activeDocTab;
    listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        console.error("[FormState] Listener error:", err);
      }
    });
  }

  function revalidate() {
    validation = validateConfig(buildMergedDraft());
    if (typeof state !== "undefined") state.validation = validation;
  }

  const state = {
    revision: 0,
    unfoldedItemPath: null,
    itemFoldedKeyPaths,
    activeDocTab: "config",
    configDraft,
    colormapsDraft,
    validation,
    activeSubTab: "presets",
    selectedPresetId,
    selectedColormapName,

    // --- Document Tab State ---
    getActiveDocTab() {
      return activeDocTab;
    },
    setActiveDocTab(tab) {
      if (activeDocTab !== tab) {
        activeDocTab = tab;
        unfoldedItemPath = null;
        itemFoldedKeyPaths.clear();
        notify();
      }
    },

    // --- Document-Level Folding State ---
    getUnfoldedItemPath() {
      return unfoldedItemPath;
    },
    unfoldItem(path) {
      if (unfoldedItemPath !== path) {
        unfoldedItemPath = path;
        const val = this.getItemValue(path);
        itemFoldedKeyPaths = foldAllItemKeys(val);
        notify();
      }
    },
    foldAll(force = false) {
      if (unfoldedItemPath !== null) {
        if (!force && itemSyntaxErrors.has(unfoldedItemPath)) {
          return false;
        }
        unfoldedItemPath = null;
        itemFoldedKeyPaths = new Set();
        notify();
        return true;
      }
      return true;
    },
    toggleItem(path) {
      if (unfoldedItemPath === path) {
        this.foldAll();
      } else {
        this.unfoldItem(path);
      }
    },

    renameColormap(oldName, newName) {
      if (!oldName || !newName) {
        return { ok: false, error: "Name cannot be empty" };
      }
      const trimmed = newName.trim();
      if (!trimmed) {
        return { ok: false, error: "Name cannot be empty" };
      }
      if (oldName === trimmed) {
        return { ok: true, name: oldName };
      }
      if (colormapsDraft[trimmed]) {
        return { ok: false, error: `Colormap "${trimmed}" already exists` };
      }
      const stops = colormapsDraft[oldName];
      if (!stops) {
        return { ok: false, error: `Colormap "${oldName}" not found` };
      }
      delete colormapsDraft[oldName];
      colormapsDraft[trimmed] = stops;
      rewriteColormapReferences(configDraft, oldName, trimmed);
      if (unfoldedItemPath === `colormaps.${oldName}`) {
        unfoldedItemPath = `colormaps.${trimmed}`;
      }
      if (selectedColormapName === oldName) {
        selectedColormapName = trimmed;
      }
      revalidate();
      notify();
      return { ok: true, name: trimmed };
    },

    // --- Intra-Item Key Folding State ---
    getItemFoldedKeyPaths() { return itemFoldedKeyPaths; },
    foldAllItemKeys() {
      if (!unfoldedItemPath) return;
      const val = this.getItemValue(unfoldedItemPath);
      itemFoldedKeyPaths = foldAllItemKeys(val);
      notify();
    },
    foldAllKeys() { this.foldAllItemKeys(); },
    unfoldAllItemKeys() {
      itemFoldedKeyPaths = unfoldAllItemKeys();
      notify();
    },
    unfoldAllKeys() { this.unfoldAllItemKeys(); },
    unfoldItemKey(targetKeyOrPath) {
      if (!unfoldedItemPath) return;
      const val = this.getItemValue(unfoldedItemPath);
      itemFoldedKeyPaths = unfoldItemKey(val, targetKeyOrPath);
      notify();
    },
    unfoldKey(targetKeyOrPath) { this.unfoldItemKey(targetKeyOrPath); },
    toggleItemKeyPath(path) {
      if (itemFoldedKeyPaths.has(path)) itemFoldedKeyPaths.delete(path);
      else itemFoldedKeyPaths.add(path);
      notify();
    },

    // --- Per-Item Value Access ---
    getItemValue(itemPath) {
      if (!itemPath) return null;
      if (itemPath === "basemap") return configDraft.basemap;
      if (itemPath === "performance") return configDraft.performance;
      if (itemPath === "theme") return configDraft.theme;
      if (itemPath === "locale") return configDraft.locale;
      if (itemPath.startsWith("presets.")) {
        const idx = parseInt(itemPath.split(".")[1], 10);
        return configDraft.presets?.[idx] ?? null;
      }
      if (itemPath.startsWith("renderProfiles.")) {
        const key = itemPath.slice("renderProfiles.".length);
        return configDraft.renderProfiles?.[key] ?? null;
      }
      if (itemPath.startsWith("colormaps.")) {
        const key = itemPath.slice("colormaps.".length);
        return colormapsDraft[key] ?? null;
      }
      return null;
    },

    setItemValue(itemPath, newValue) {
      if (!itemPath) return;
      if (itemPath === "basemap") {
        configDraft.basemap = newValue;
      } else if (itemPath === "performance") {
        configDraft.performance = newValue;
      } else if (itemPath === "theme") {
        configDraft.theme = newValue;
      } else if (itemPath === "locale") {
        configDraft.locale = newValue;
      } else if (itemPath.startsWith("presets.")) {
        const idx = parseInt(itemPath.split(".")[1], 10);
        if (configDraft.presets && idx >= 0 && idx < configDraft.presets.length) {
          configDraft.presets[idx] = newValue;
        }
      } else if (itemPath.startsWith("renderProfiles.")) {
        const key = itemPath.slice("renderProfiles.".length);
        if (!configDraft.renderProfiles) configDraft.renderProfiles = {};
        configDraft.renderProfiles[key] = newValue;
      } else if (itemPath.startsWith("colormaps.")) {
        const key = itemPath.slice("colormaps.".length);
        colormapsDraft[key] = newValue;
      }
      this.clearItemSyntaxError(itemPath);
      revalidate();
      notify();
    },

    deleteItem(itemPath) {
      if (!itemPath) return;
      if (itemPath.startsWith("presets.")) {
        const idx = parseInt(itemPath.split(".")[1], 10);
        if (configDraft.presets && idx >= 0 && idx < configDraft.presets.length) {
          configDraft.presets.splice(idx, 1);
        }
      } else if (itemPath.startsWith("renderProfiles.")) {
        const key = itemPath.slice("renderProfiles.".length);
        if (configDraft.renderProfiles) delete configDraft.renderProfiles[key];
      } else if (itemPath.startsWith("colormaps.")) {
        const key = itemPath.slice("colormaps.".length);
        delete colormapsDraft[key];
      }
      if (unfoldedItemPath === itemPath) {
        unfoldedItemPath = null;
      }
      revalidate();
      notify();
    },

    // --- Syntax & Validation Diagnostics ---
    setItemSyntaxError(path, errMsg) {
      itemSyntaxErrors.set(path, errMsg);
      notify();
    },
    clearItemSyntaxError(path) {
      if (itemSyntaxErrors.has(path)) {
        itemSyntaxErrors.delete(path);
        notify();
      }
    },
    getItemSyntaxError(path) {
      return itemSyntaxErrors.get(path) || null;
    },
    hasSyntaxErrors() {
      return itemSyntaxErrors.size > 0;
    },

    // --- Backward-Compatible Draft Access ---
    getDraft() {
      return buildMergedDraft();
    },
    setDraft(newDraft) {
      const cloned = deepClone(newDraft || {});
      colormapsDraft = cloned.colormaps || {};
      configDraft = cloned;
      delete configDraft.colormaps;
      revalidate();
      notify();
    },
    updateDraft(mutatorFn) {
      const merged = buildMergedDraft();
      if (typeof mutatorFn === "function") {
        mutatorFn(merged);
      }
      colormapsDraft = merged.colormaps || {};
      configDraft = merged;
      delete configDraft.colormaps;
      revalidate();
      notify();
    },
    getConfigDraft() {
      return configDraft;
    },
    getColormapsDraft() {
      return colormapsDraft;
    },
    touch() {
      revalidate();
      notify();
    },
    notifyDirty() {
      this.touch();
    },
    getValidation() {
      return validation;
    },
    isDirty() {
      const cfgDirty = formatCompactJSON(configDraft) !== lastSavedConfigText;
      const cmapDirty = formatCompactJSON(colormapsDraft) !== lastSavedColormapsText;
      return cfgDirty || cmapDirty;
    },
    isConfigDirty() {
      return formatCompactJSON(configDraft) !== lastSavedConfigText;
    },
    isColormapsDirty() {
      return formatCompactJSON(colormapsDraft) !== lastSavedColormapsText;
    },
    getLastSavedText() {
      return activeDocTab === "colormaps" ? lastSavedColormapsText : lastSavedConfigText;
    },
    markSaved() {
      lastSavedConfigText = formatCompactJSON(configDraft);
      lastSavedColormapsText = formatCompactJSON(colormapsDraft);
      itemSyntaxErrors.clear();
      revalidate();
      notify();
    },
    reset(newConfig = null) {
      const cfg = deepClone(newConfig || initialConfig);
      colormapsDraft = cfg.colormaps || {};
      configDraft = cfg;
      delete configDraft.colormaps;
      lastSavedConfigText = formatCompactJSON(configDraft);
      lastSavedColormapsText = formatCompactJSON(colormapsDraft);
      unfoldedItemPath = null;
      itemFoldedKeyPaths.clear();
      itemSyntaxErrors.clear();
      revalidate();
      notify();
    },

    // Legacy subtab/selection compatibility
    getActiveSubTab() { return activeSubTab; },
    setActiveSubTab(tabName) {
      if (activeSubTab !== tabName) {
        activeSubTab = tabName;
        activeDocTab = tabName === "colormaps" ? "colormaps" : "config";
        notify();
      }
    },
    getSelectedPresetId() { return selectedPresetId; },
    setSelectedPresetId(id) { selectedPresetId = id; notify(); },
    getSelectedColormapName() { return selectedColormapName; },
    setSelectedColormapName(name) { selectedColormapName = name; notify(); },
    subscribe(listener) {
      listeners.add(listener);
      try {
        listener(state);
      } catch (err) {
        console.error("[FormState] Listener init error:", err);
      }
      return () => listeners.delete(listener);
    },
  };

  return state;
}
