// configSchema.js - Config validation engine & semantic rules
import { MIN_MAX_EFFECTIVE_CELLS, MAX_MAX_EFFECTIVE_CELLS } from "../../config/presets.js";
import { validateInterval } from "../../layers/contour/contourLevels.js";

const SLUG_REGEX = /^[a-z0-9][a-z0-9-_]*$/i;
const ALLOWED_LAYER_TYPES = new Set(["contour", "wind", "station", "tlogp", "timeheight"]);
const ALLOWED_BASEMAP_SCHEMES = new Set(["light", "dark", "micaps"]);
const ALLOWED_BASEMAP_PROJECTIONS = new Set(["mercator", "globe", "vertical-perspective"]);

export function isValidSlug(str) {
  return typeof str === "string" && SLUG_REGEX.test(str);
}

/**
 * Validates in-memory config draft against meteorological and runtime constraints.
 * @param {Object} draft - config.json shape: { presets, colormaps, basemap, performance }
 * @returns {Object} { isValid, errors, warnings, presetErrors, colormapErrors, globalErrors }
 */
export function validateConfig(draft) {
  const errors = [];
  const warnings = [];
  const presetErrors = new Map();
  const colormapErrors = new Map();
  const globalErrors = [];

  function addError(path, message, category = "global", key = null) {
    const err = { path, message };
    errors.push(err);
    if (category === "preset" && key) {
      if (!presetErrors.has(key)) presetErrors.set(key, []);
      presetErrors.get(key).push(message);
    } else if (category === "colormap" && key) {
      if (!colormapErrors.has(key)) colormapErrors.set(key, []);
      colormapErrors.get(key).push(message);
    } else {
      globalErrors.push(message);
    }
  }

  function addWarning(path, message) {
    warnings.push({ path, message });
  }

  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    addError("root", "Config draft must be a valid object");
    return {
      isValid: false,
      errors,
      warnings,
      presetErrors,
      colormapErrors,
      globalErrors,
    };
  }

  // 1. Performance validation
  if (draft.performance !== undefined && draft.performance !== null) {
    if (typeof draft.performance !== "object" || Array.isArray(draft.performance)) {
      addError("performance", "performance must be an object");
    } else if (draft.performance.maxEffectiveCells !== undefined) {
      const v = draft.performance.maxEffectiveCells;
      if (!Number.isInteger(v)) {
        addError("performance.maxEffectiveCells", "performance.maxEffectiveCells must be an integer");
      } else if (v < MIN_MAX_EFFECTIVE_CELLS || v > MAX_MAX_EFFECTIVE_CELLS) {
        addError(
          "performance.maxEffectiveCells",
          `performance.maxEffectiveCells must be between ${MIN_MAX_EFFECTIVE_CELLS} and ${MAX_MAX_EFFECTIVE_CELLS}`
        );
      }
    }
  }

  // 2. Basemap validation
  if (draft.basemap !== undefined && draft.basemap !== null) {
    if (typeof draft.basemap !== "object" || Array.isArray(draft.basemap)) {
      addError("basemap", "basemap must be an object");
    } else {
      if (draft.basemap.scheme !== undefined && !ALLOWED_BASEMAP_SCHEMES.has(draft.basemap.scheme)) {
        addError("basemap.scheme", `basemap.scheme must be one of: light, dark, micaps`);
      }
      if (draft.basemap.projection !== undefined && !ALLOWED_BASEMAP_PROJECTIONS.has(draft.basemap.projection)) {
        addError("basemap.projection", `basemap.projection must be one of: mercator, globe, vertical-perspective`);
      }
    }
  }

  // 3. Presets & Dividers validation
  const presets = draft.presets;
  if (presets !== undefined) {
    if (!Array.isArray(presets)) {
      addError("presets", "presets must be an array");
    } else {
      const seenIds = new Set();
      const dividerIndices = [];

    presets.forEach((entry, idx) => {
      if (!entry || typeof entry !== "object") {
        addError(`presets[${idx}]`, `presets[${idx}] must be an object`);
        return;
      }

      // Check ID
      const id = entry.id;
      if (!id || typeof id !== "string" || !SLUG_REGEX.test(id)) {
        addError(`presets[${idx}].id`, `Preset/Divider ID "${id || ""}" must be a non-empty alphanumeric slug`);
      } else if (seenIds.has(id)) {
        addError(`presets[${idx}].id`, `Duplicate ID "${id}" across presets and dividers`);
      } else {
        seenIds.add(id);
      }

      const isDivider = entry.divider === true;
      if (isDivider) {
        dividerIndices.push(idx);

        if (entry.label !== undefined && entry.label !== null) {
          if (typeof entry.label !== "string" || entry.label.length > 40) {
            addError(`presets[${idx}].label`, `Divider "${id}" label must be a string up to 40 characters`, "preset", id);
          }
        }
        if (entry.name !== undefined) {
          addWarning(`presets[${idx}].name`, `Divider "${id}" uses label, not name (name will be ignored)`);
        }
        if (entry.layers !== undefined) {
          addError(`presets[${idx}].layers`, `Divider "${id}" must not have layers — remove the key`, "preset", id);
        }
        if (entry.hasLevel !== undefined || entry.defaultLevel !== undefined) {
          addError(`presets[${idx}].hasLevel`, `Divider "${id}" must not have level configuration`, "preset", id);
        }
        if (entry.render !== undefined) {
          addError(`presets[${idx}].render`, `Divider "${id}" must not have render settings`, "preset", id);
        }
        if (entry.derivedFrom !== undefined) {
          addError(`presets[${idx}].derivedFrom`, `Divider "${id}" must not have derivedFrom`, "preset", id);
        }
      } else {
        // Regular Preset Group
        if (!entry.name || typeof entry.name !== "string" || !entry.name.trim()) {
          addError(`presets[${idx}].name`, `Preset "${id}" must have a non-empty name`, "preset", id);
        }

        if (entry.hasLevel !== undefined && typeof entry.hasLevel !== "boolean") {
          addError(`presets[${idx}].hasLevel`, `Preset "${id}" hasLevel must be a boolean`, "preset", id);
        }

        if (entry.hasLevel) {
          if (entry.defaultLevel !== null && entry.defaultLevel !== undefined && !Number.isFinite(entry.defaultLevel)) {
            addError(`presets[${idx}].defaultLevel`, `Preset "${id}" defaultLevel must be a number or null`, "preset", id);
          }
        } else {
          if (entry.defaultLevel !== null && entry.defaultLevel !== undefined) {
            addError(`presets[${idx}].defaultLevel`, `Preset "${id}" defaultLevel must be null when hasLevel is false`, "preset", id);
          }
        }

        if (!Array.isArray(entry.layers)) {
          addError(`presets[${idx}].layers`, `Preset "${id}" layers must be an array`, "preset", id);
        } else {
          if (entry.layers.length === 0) {
            addWarning(`presets[${idx}].layers`, `Preset "${entry.name || id}" contains 0 layers`);
          }

          const layerIds = new Set();
          entry.layers.forEach((layer, lIdx) => {
            if (!layer || typeof layer !== "object") {
              addError(`presets[${idx}].layers[${lIdx}]`, `Layer must be an object`, "preset", id);
              return;
            }

            const lId = layer.id;
            if (!lId || typeof lId !== "string" || !lId.trim()) {
              addError(`presets[${idx}].layers[${lIdx}].id`, `Layer at index ${lIdx} must have a non-empty id`, "preset", id);
            } else if (layerIds.has(lId)) {
              addError(`presets[${idx}].layers[${lIdx}].id`, `Duplicate layer id "${lId}" in preset "${id}"`, "preset", id);
            } else {
              layerIds.add(lId);
            }

            if (layer.type === "pmtiles") {
              addError(`presets[${idx}].layers[${lIdx}].type`, `PMTiles layers are not supported in presets`, "preset", id);
            } else if (!ALLOWED_LAYER_TYPES.has(layer.type)) {
              addError(`presets[${idx}].layers[${lIdx}].type`, `Invalid layer type "${layer.type}" in preset "${id}"`, "preset", id);
            }

            if (!layer.model || typeof layer.model !== "string") {
              addError(`presets[${idx}].layers[${lIdx}].model`, `Layer "${lId || lIdx}" model must be a non-empty string`, "preset", id);
            }
            if (!layer.element || typeof layer.element !== "string") {
              addError(`presets[${idx}].layers[${lIdx}].element`, `Layer "${lId || lIdx}" element must be a non-empty string`, "preset", id);
            }

            if (layer.render !== undefined && (typeof layer.render !== "object" || layer.render === null || Array.isArray(layer.render))) {
              addError(`presets[${idx}].layers[${lIdx}].render`, `Layer "${lId || lIdx}" render must be an object`, "preset", id);
            }

            const boldVals = layer.render?.boldValues !== undefined ? layer.render.boldValues : layer.boldValues;
            if (boldVals !== undefined && (!Array.isArray(boldVals) || boldVals.some((v) => !Number.isFinite(v)))) {
              addError(`presets[${idx}].layers[${lIdx}].render.boldValues`, `Layer "${lId || lIdx}" boldValues must be an array of numbers`, "preset", id);
            }

            if (layer.render?.interval) {
              const iv = layer.render.interval;
              if (iv.start !== undefined && iv.step !== undefined && iv.end !== undefined && iv.start !== "" && iv.step !== "" && iv.end !== "") {
                const res = validateInterval(iv.start, iv.step, iv.end);
                if (!res.valid) {
                  addError(`presets[${idx}].layers[${lIdx}].render.interval`, `Layer "${lId || lIdx}" interval: ${res.message}`, "preset", id);
                }
              }
            }

            const customLevels = layer.render?.levels !== undefined ? layer.render.levels : layer.levels;
            if (customLevels !== undefined && customLevels !== null) {
              if (!Array.isArray(customLevels) || (customLevels.length > 0 && customLevels.length < 2) || customLevels.some((v) => !Number.isFinite(v))) {
                addError(`presets[${idx}].layers[${lIdx}].render.levels`, `Layer "${lId || lIdx}" levels must be an array of >= 2 numbers`, "preset", id);
              }
            }
          });

          // Check derivedFrom references match sibling layer ids
          entry.layers.forEach((layer, lIdx) => {
            if (layer && layer.derivedFrom) {
              if (!layerIds.has(layer.derivedFrom)) {
                addError(
                  `presets[${idx}].layers[${lIdx}].derivedFrom`,
                  `Layer "${layer.id}" has derivedFrom "${layer.derivedFrom}" which does not match any sibling layer in preset "${id}"`,
                  "preset",
                  id
                );
              }
            }
          });
        }
      }
    });

    // Divider placement warnings
    if (dividerIndices.length > 0) {
      if (dividerIndices[0] === 0) {
        addWarning("presets[0]", "Leading divider at beginning of preset list");
      }
      if (dividerIndices[dividerIndices.length - 1] === presets.length - 1) {
        addWarning(`presets[${presets.length - 1}]`, "Trailing divider at end of preset list");
      }
      for (let i = 0; i < dividerIndices.length - 1; i++) {
        if (dividerIndices[i + 1] === dividerIndices[i] + 1) {
          addWarning(`presets[${dividerIndices[i]}]`, "Consecutive dividers detected");
          break;
        }
      }
    }
  }
}

  // 4. Colormaps validation
  if (draft.colormaps !== undefined && draft.colormaps !== null) {
    if (typeof draft.colormaps !== "object" || Array.isArray(draft.colormaps)) {
      addError("colormaps", "colormaps must be an object");
    } else {
      for (const [name, stops] of Object.entries(draft.colormaps)) {
        if (!name || typeof name !== "string") {
          addError("colormaps", "Colormap key must be a non-empty string", "colormap", name);
          continue;
        }
        if (!Array.isArray(stops) || stops.length < 2) {
          addError(`colormaps.${name}`, `Colormap "${name}" must contain at least two stops`, "colormap", name);
          continue;
        }

        const seenVals = new Set();
        let hasDuplicateVal = false;

        for (let sIdx = 0; sIdx < stops.length; sIdx++) {
          const stop = stops[sIdx];
          if (!stop || typeof stop !== "object" || !Number.isFinite(stop.val)) {
            addError(`colormaps.${name}[${sIdx}]`, `Colormap "${name}" stop at index ${sIdx} has invalid val`, "colormap", name);
            continue;
          }

          if (seenVals.has(stop.val) && !hasDuplicateVal) {
            hasDuplicateVal = true;
            addError(`colormaps.${name}`, `Colormap "${name}" contains duplicate stop value ${stop.val}`, "colormap", name);
          }
          seenVals.add(stop.val);

          if (!Array.isArray(stop.color) || (stop.color.length !== 3 && stop.color.length !== 4)) {
            addError(`colormaps.${name}[${sIdx}].color`, `Colormap "${name}" stop ${sIdx} color must have 3 or 4 channels`, "colormap", name);
            continue;
          }

          const badChannel = stop.color.some((c) => !Number.isFinite(c) || c < 0 || c > 255);
          if (badChannel) {
            addError(`colormaps.${name}[${sIdx}].color`, `Colormap "${name}" stop ${sIdx} contains color channel outside 0-255`, "colormap", name);
          }
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    presetErrors,
    colormapErrors,
    globalErrors,
  };
}
