// contourLevels.js - Shared contour interval validation and level generation

export const MAX_INTERVAL_LEVELS = 60;

/**
 * Validate start, step, end inputs for contour interval arithmetic sequence.
 *
 * @param {number|string} start - First contour value
 * @param {number|string} step  - Interval spacing (> 0)
 * @param {number|string} end   - Last contour value (> start)
 * @param {Object} [opts={}]
 * @param {number} [opts.maxLevels=60] - Maximum allowed level count
 * @returns {{ valid: boolean, error?: 'nan'|'step'|'range'|'count', message?: string, start?: number, step?: number, end?: number, count?: number }}
 */
export function validateInterval(start, step, end, opts = {}) {
  const maxLevels = opts.maxLevels || MAX_INTERVAL_LEVELS;

  if (
    start === null ||
    start === undefined ||
    start === "" ||
    step === null ||
    step === undefined ||
    step === "" ||
    end === null ||
    end === undefined ||
    end === ""
  ) {
    return { valid: false, error: "nan", message: "Values must be specified" };
  }

  const s = typeof start === "number" ? start : parseFloat(start);
  const sp = typeof step === "number" ? step : parseFloat(step);
  const e = typeof end === "number" ? end : parseFloat(end);

  if (!Number.isFinite(s) || !Number.isFinite(sp) || !Number.isFinite(e)) {
    return { valid: false, error: "nan", message: "Values must be valid numbers" };
  }

  if (sp <= 0) {
    return { valid: false, error: "step", message: "Span must be greater than 0" };
  }

  // Float-tolerant comparison for start < end
  const eps = sp * 1e-6;
  if (s >= e - eps) {
    return { valid: false, error: "range", message: "Start must be less than End" };
  }

  const rawCount = Math.floor((e - s + eps) / sp) + 1;
  if (rawCount < 2) {
    return { valid: false, error: "count", message: "Interval produces fewer than 2 levels" };
  }
  if (rawCount > maxLevels) {
    return { valid: false, error: "count", message: `Interval produces too many levels (max ${maxLevels})` };
  }

  return { valid: true, start: s, step: sp, end: e, count: rawCount };
}

/**
 * Generate arithmetic sequence of contour levels: [start, start+step, ..., <= end]
 *
 * @param {number|string} start
 * @param {number|string} step
 * @param {number|string} end
 * @param {Object} [opts={}]
 * @returns {{ levels: number[]|null, count?: number, error?: 'nan'|'step'|'range'|'count'|null, message?: string }}
 */
export function buildLevelsFromInterval(start, step, end, opts = {}) {
  const validation = validateInterval(start, step, end, opts);
  if (!validation.valid) {
    return { levels: null, error: validation.error, message: validation.message };
  }

  const { start: s, step: sp, end: e } = validation;
  const maxLevels = opts.maxLevels || MAX_INTERVAL_LEVELS;
  const eps = sp * 1e-6;
  const levels = [];
  let i = 0;

  while (true) {
    const raw = s + i * sp;
    // Round to 10 decimal places to eliminate floating point drift (e.g. 0.1 + 0.2 = 0.30000000000000004)
    const rounded = Math.round(raw * 1e10) / 1e10;
    if (rounded > e + eps) {
      break;
    }
    levels.push(rounded);
    if (levels.length > maxLevels) {
      return { levels: null, error: "count", message: `Interval produces too many levels (max ${maxLevels})` };
    }
    i++;
  }

  if (levels.length < 2) {
    return { levels: null, error: "count", message: "Interval produces fewer than 2 levels" };
  }

  return { levels, count: levels.length, error: null };
}

/**
 * Clip an explicit level list to the observed data range [minV, maxV].
 * Used for custom interval levels that extend beyond the data: only the
 * in-range subset can produce isolines, so contouring runs on the subset
 * instead of falling back to auto levels.
 *
 * @param {number[]} levels - Explicit levels (e.g. from buildLevelsFromInterval)
 * @param {number} minV - Data minimum
 * @param {number} maxV - Data maximum
 * @returns {number[]} In-range subset (may be empty when fully disjoint)
 */
export function clipLevelsToRange(levels, minV, maxV) {
  if (!Array.isArray(levels) || levels.length === 0) return [];
  if (!Number.isFinite(minV) || !Number.isFinite(maxV) || maxV < minV) return [...levels];
  return levels.filter((v) => typeof v === "number" && Number.isFinite(v) && v >= minV && v <= maxV);
}

/**
 * Resolves levels array for rendering from config object.
 * Returns valid level array (length >= 2) or null (fallback to auto).
 *
 * @param {Object} config
 * @returns {number[]|null}
 */
export function resolveRenderLevels(config) {
  if (!config) return null;
  if (Array.isArray(config.levels) && config.levels.length >= 2) {
    return config.levels;
  }
  return null;
}
