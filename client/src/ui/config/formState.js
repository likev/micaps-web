// formState.js - Config draft store, pub/sub, and pure clone/divider helpers
import { formatCompactJSON } from "../../config/presets.js";
import { validateConfig } from "./configSchema.js";

/**
 * HTML escaping helper for user-supplied strings to prevent markup injection.
 * @param {*} str
 * @returns {string}
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
      // Fallback if structuredClone fails on non-serializable properties
    }
  }
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Clones a preset group and inserts it directly below the source.
 * Pure function operating on draft.
 * @param {Object} draft - mutable config draft
 * @param {string} sourceId - id of preset to clone
 * @returns {{ ok: boolean, newId?: string, group?: Object, error?: string }}
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

  // Generate unique id: {sourceId}-copy, -copy-2, etc.
  const existingIds = new Set(draft.presets.map((p) => p?.id));
  let baseId = `${sourceId}-copy`;
  let newId = baseId;
  let counter = 2;
  while (existingIds.has(newId)) {
    newId = `${baseId}-${counter++}`;
  }

  copy.id = newId;
  copy.name = `${source.name || source.id} (Copy)`;

  // Keep layer ids verbatim, force removable: true
  if (Array.isArray(copy.layers)) {
    copy.layers.forEach((l) => {
      l.removable = true;
    });
  }

  // Insert directly below source
  draft.presets.splice(idx + 1, 0, copy);
  return { ok: true, newId, group: copy };
}

/**
 * Clones a layer within the same preset or to another preset.
 * Pure function operating on draft.
 * @param {Object} draft - mutable config draft
 * @param {string} presetId - source preset id
 * @param {string} layerId - source layer id
 * @param {string} [targetPresetId=presetId] - target preset id
 * @returns {{ ok: boolean, newId?: string, layer?: Object, warning?: string, error?: string }}
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

  // Generate unique layer id within target preset
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
    // Same preset: insert directly below source
    srcPreset.layers.splice(srcLayerIdx + 1, 0, layerCopy);
  } else {
    // Cross-preset: check if derivedFrom sibling exists in target
    const warnings = [];
    if (layerCopy.derivedFrom) {
      const siblingExists = targetPreset.layers.some((l) => l.id === layerCopy.derivedFrom);
      if (!siblingExists) {
        warnings.push(`derivedFrom "${layerCopy.derivedFrom}" not found in "${targetPreset.name || targetPreset.id}" — cleared`);
        delete layerCopy.derivedFrom;
      }
    }
    // Check hasLevel mismatch (plan §3.2.1)
    if (Boolean(srcPreset.hasLevel) !== Boolean(targetPreset.hasLevel)) {
      warnings.push(`hasLevel mismatch: source is ${srcPreset.hasLevel ? "multi-level" : "single-level"}, target is ${targetPreset.hasLevel ? "multi-level" : "single-level"}`);
    }
    if (warnings.length > 0) {
      warning = warnings.join("; ");
    }
    // Append to target preset
    targetPreset.layers.push(layerCopy);
  }

  return { ok: true, newId: newLayerId, layer: layerCopy, warning };
}

/**
 * Inserts a visual divider between presets.
 * Pure function operating on draft.
 * @param {Object} draft - mutable config draft
 * @param {number} [index=-1] - insertion index in draft.presets (-1 to append)
 * @param {string} [label=""] - optional section label
 * @returns {{ ok: boolean, newId?: string, divider?: Object, error?: string }}
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

  const divider = {
    id: newId,
    divider: true,
  };
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
 * Reorders entries (presets or dividers) in draft.presets.
 * Pure function operating on draft.
 * @param {Object} draft - mutable config draft
 * @param {number} fromIndex
 * @param {number} toIndex
 * @returns {{ ok: boolean, error?: string }}
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
 * Pure function operating on draft.
 * @param {Object} draft - mutable config draft
 * @param {string} id - divider id
 * @returns {{ ok: boolean, error?: string }}
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
 * Creates a reactive form state container managing config draft, dirty tracking, and pub/sub.
 * @param {Object} initialConfig - pristine config object from server
 * @returns {Object} FormState instance
 */
export function createFormState(initialConfig = {}) {
  let draft = deepClone(initialConfig);
  (draft.presets || []).forEach((p) => {
    if (p.divider || !Array.isArray(p.layers)) return;
    p.layers.forEach((l) => {
      if (l.render && l.render.levels === null) {
        delete l.render.levels;
      }
    });
  });
  let lastSavedText = formatCompactJSON(draft);
  let activeSubTab = "presets";
  let selectedPresetId = draft.presets?.find((p) => !p.divider)?.id || draft.presets?.[0]?.id || null;
  let selectedColormapName = Object.keys(draft.colormaps || {})[0] || null;
  let validation = validateConfig(draft);

  const listeners = new Set();

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        console.error("[FormState] Listener error:", err);
      }
    });
  }

  const state = {
    getDraft() {
      return draft;
    },

    setDraft(newDraft) {
      draft = newDraft;
      validation = validateConfig(draft);
      notify();
    },

    updateDraft(mutatorFn) {
      if (typeof mutatorFn === "function") {
        mutatorFn(draft);
      }
      validation = validateConfig(draft);
      notify();
    },

    getValidation() {
      return validation;
    },

    isDirty() {
      return formatCompactJSON(draft) !== lastSavedText;
    },

    getLastSavedText() {
      return lastSavedText;
    },

    markSaved(savedText = null) {
      lastSavedText = savedText || formatCompactJSON(draft);
      validation = validateConfig(draft);
      notify();
    },

    reset(newConfig = null) {
      const cfg = newConfig || initialConfig;
      draft = deepClone(cfg);
      lastSavedText = formatCompactJSON(cfg);
      validation = validateConfig(draft);
      if (!draft.presets?.some((p) => p.id === selectedPresetId)) {
        selectedPresetId = draft.presets?.find((p) => !p.divider)?.id || draft.presets?.[0]?.id || null;
      }
      if (!draft.colormaps?.[selectedColormapName]) {
        selectedColormapName = Object.keys(draft.colormaps || {})[0] || null;
      }
      notify();
    },

    getActiveSubTab() {
      return activeSubTab;
    },

    setActiveSubTab(tabName) {
      if (activeSubTab !== tabName) {
        activeSubTab = tabName;
        notify();
      }
    },

    getSelectedPresetId() {
      return selectedPresetId;
    },

    setSelectedPresetId(id) {
      selectedPresetId = id;
      notify();
    },

    getSelectedColormapName() {
      return selectedColormapName;
    },

    setSelectedColormapName(name) {
      selectedColormapName = name;
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return state;
}
