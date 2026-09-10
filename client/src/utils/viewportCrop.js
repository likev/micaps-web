// viewportCrop.js - Cell-count-driven LOD helpers for §8.8.4 (config-driven, no hardcodes)
import { getMaxEffectiveCells, DEFAULT_MAX_EFFECTIVE_CELLS } from "../config/presets.js";

// Full-grid fallback guard (pre-BBox-crop): decimate massive grids.
// Threshold scales with the configured budget so default behavior is unchanged
// (50000 * 10 = 500000). Replaced by true BBox-crop step once viewport bounds flow in.
export const MASSIVE_GRID_FACTOR = 10;

export function resolveBudget(budgetOrOptions) {
  if (typeof budgetOrOptions === "number") return getMaxEffectiveCells(budgetOrOptions);
  if (budgetOrOptions && typeof budgetOrOptions === "object") {
    return getMaxEffectiveCells(budgetOrOptions.maxEffectiveCells ?? budgetOrOptions.budget);
  }
  return getMaxEffectiveCells();
}

/**
 * Budget-balancing decimation: step = max(1, ceil(sqrt(nCells / budget))).
 * Brackets with default budget (50,000):
 * <50k → 1, <200k → 2, <450k → 3, <800k → 4, else formula.
 */
export function resolveContourStep(nCells, budget) {
  const b = resolveBudget(budget);
  const n = typeof nCells === "number" && Number.isFinite(nCells) ? Math.floor(nCells) : 0;
  if (n <= 0 || n < b) return 1;
  return Math.max(1, Math.ceil(Math.sqrt(n / b)));
}

/** True when the grid is small enough to bypass BBox cropping entirely (§8.8.4 Stage 1). */
export function shouldBypassCrop(nCells, budget) {
  const b = resolveBudget(budget);
  const n = typeof nCells === "number" && Number.isFinite(nCells) ? Math.floor(nCells) : 0;
  return n < b;
}

/**
 * Pre-BBox full-grid step guard. Preserves the legacy `>500k → 2 else 1`
 * behavior at default config while sourcing the threshold from config.
 */
export function getFullGridStep(nLon, nLat, budgetOrOptions) {
  const b = resolveBudget(budgetOrOptions);
  const lon = typeof nLon === "number" && Number.isFinite(nLon) ? Math.floor(nLon) : 0;
  const lat = typeof nLat === "number" && Number.isFinite(nLat) ? Math.floor(nLat) : 0;
  if (lon <= 0 || lat <= 0) return 1;
  return lon * lat > b * MASSIVE_GRID_FACTOR ? 2 : 1;
}

/**
 * Normalizes bounds input into [west, south, east, north].
 * Supports MapLibre LngLatBounds.toArray() [[w, s], [e, n]], array [w, s, e, n],
 * or objects with getWest() or { west, south, east, north }.
 */
export function normalizeBounds(bounds) {
  if (!bounds) return null;
  if (Array.isArray(bounds)) {
    if (Array.isArray(bounds[0]) && Array.isArray(bounds[1])) {
      return [bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]];
    }
    if (bounds.length >= 4) {
      return [bounds[0], bounds[1], bounds[2], bounds[3]];
    }
  }
  if (typeof bounds === "object") {
    if (typeof bounds.getWest === "function") {
      return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
    }
    const west = bounds.west ?? bounds.minX ?? bounds.left;
    const south = bounds.south ?? bounds.minY ?? bounds.bottom;
    const east = bounds.east ?? bounds.maxX ?? bounds.right;
    const north = bounds.north ?? bounds.maxY ?? bounds.top;
    if (west !== undefined && south !== undefined && east !== undefined && north !== undefined) {
      return [west, south, east, north];
    }
  }
  return null;
}

/**
 * Computes bounding box crop indices for a gridded field (§8.8.4 Stage 2).
 *
 * @param {Object} header - Grid header (n_lon, n_lat, start_lon, end_lon, start_lat, end_lat, d_lon, d_lat)
 * @param {Array<number>} [x] - Optional pre-computed lon coordinates array
 * @param {Array<number>} [y] - Optional pre-computed lat coordinates array
 * @param {Array|Object} [bounds] - Viewport bounds
 * @param {number} [deltaDeg=1.75] - Safety buffer margin in degrees
 * @returns {{ iMin: number, iMax: number, jMin: number, jMax: number, nLonCrop: number, nLatCrop: number, nCrop: number }}
 */
export function computeCropIndices(header, x = null, y = null, bounds = null, deltaDeg = 1.75) {
  const nLon = header?.n_lon || header?.LongitudeGridNumber || (x ? x.length : 0);
  const nLat = header?.n_lat || header?.LatitudeGridNumber || (y ? y.length : 0);

  if (nLon <= 0 || nLat <= 0) {
    return { iMin: 0, iMax: 0, jMin: 0, jMax: 0, nLonCrop: 0, nLatCrop: 0, nCrop: 0 };
  }

  const normBounds = normalizeBounds(bounds);
  if (!normBounds) {
    return { iMin: 0, iMax: nLon - 1, jMin: 0, jMax: nLat - 1, nLonCrop: nLon, nLatCrop: nLat, nCrop: nLon * nLat };
  }

  let [west, south, east, north] = normBounds;

  // Mercator latitude clamp
  south = Math.max(-85.05112878, Math.min(85.05112878, south));
  north = Math.max(-85.05112878, Math.min(85.05112878, north));

  const wExp = west - deltaDeg;
  const eExp = east + deltaDeg;
  const sExp = Math.max(-85.05112878, south - deltaDeg);
  const nExp = Math.min(85.05112878, north + deltaDeg);

  const startLon = x && x.length > 0 ? x[0] : (header?.start_lon ?? header?.StartLongitude ?? 0.0);
  const endLon = x && x.length > 0 ? x[x.length - 1] : (header?.end_lon ?? header?.EndLongitude ?? (nLon > 1 ? startLon + (nLon - 1) * 0.25 : startLon));
  let dLon = Math.abs(header?.d_lon ?? header?.LongitudeGridSpace ?? (nLon > 1 ? Math.abs(endLon - startLon) / (nLon - 1) : 1));
  if (dLon === 0) dLon = 1;

  const startLat = y && y.length > 0 ? y[0] : (header?.start_lat ?? header?.StartLatitude ?? 0.0);
  const endLat = y && y.length > 0 ? y[y.length - 1] : (header?.end_lat ?? header?.EndLatitude ?? (nLat > 1 ? startLat + (nLat - 1) * 0.25 : startLat));
  let dLat = Math.abs(header?.d_lat ?? header?.LatitudeGridSpace ?? (nLat > 1 ? Math.abs(endLat - startLat) / (nLat - 1) : 1));
  if (dLat === 0) dLat = 1;

  const isDescendingLat = startLat > endLat;

  let iMin = 0;
  let iMax = nLon - 1;

  // Longitude range calculation
  if (startLon <= endLon) {
    let adjW = wExp;
    let adjE = eExp;
    if (startLon >= 0 && endLon > 180) {
      if (adjW < 0) adjW += 360;
      if (adjE < 0) adjE += 360;
    }
    if (adjW > adjE) {
      // Crossing antimeridian or full globe span
      iMin = 0;
      iMax = nLon - 1;
    } else {
      iMin = Math.max(0, Math.floor((adjW - startLon) / dLon));
      iMax = Math.min(nLon - 1, Math.ceil((adjE - startLon) / dLon));
    }
  }

  // Latitude range calculation
  let jMin = 0;
  let jMax = nLat - 1;
  if (isDescendingLat) {
    // Row 0 is North (startLat), row nLat-1 is South (endLat)
    jMin = Math.max(0, Math.floor((startLat - nExp) / dLat));
    jMax = Math.min(nLat - 1, Math.ceil((startLat - sExp) / dLat));
  } else {
    // Row 0 is South (startLat), row nLat-1 is North (endLat)
    jMin = Math.max(0, Math.floor((sExp - startLat) / dLat));
    jMax = Math.min(nLat - 1, Math.ceil((nExp - startLat) / dLat));
  }

  // Bounds clamping
  iMin = Math.max(0, Math.min(nLon - 1, iMin));
  iMax = Math.max(iMin, Math.min(nLon - 1, iMax));
  jMin = Math.max(0, Math.min(nLat - 1, jMin));
  jMax = Math.max(jMin, Math.min(nLat - 1, jMax));

  const nLonCrop = iMax - iMin + 1;
  const nLatCrop = jMax - jMin + 1;
  const nCrop = nLonCrop * nLatCrop;

  return { iMin, iMax, jMin, jMax, nLonCrop, nLatCrop, nCrop };
}

/**
 * Extracts cropped grid values, coordinates, and 2D matrix honoring decimation step.
 * Automatically normalizes latitude coordinates to ascending order for Marching Squares.
 *
 * @param {Object} gridData - Must contain header and values (1D or 2D)
 * @param {Object} cropIdx - { iMin, iMax, jMin, jMax }
 * @param {number} [step=1] - Decimation step
 * @returns {{ x: Array<number>, y: Array<number>, Z: Array<Array<number>>, nLon: number, nLat: number, nCells: number }}
 */
export function cropGridValues(gridData, cropIdx, step = 1) {
  const { header, values } = gridData;
  const nLon = header?.n_lon || header?.LongitudeGridNumber || (gridData.x ? gridData.x.length : 0);
  const nLat = header?.n_lat || header?.LatitudeGridNumber || (gridData.y ? gridData.y.length : 0);

  const iMin = cropIdx?.iMin ?? 0;
  const iMax = cropIdx?.iMax ?? (nLon - 1);
  const jMin = cropIdx?.jMin ?? 0;
  const jMax = cropIdx?.jMax ?? (nLat - 1);
  const s = Math.max(1, Math.floor(step || 1));

  // 1. Build xCrop
  const xCrop = [];
  if (gridData.x && gridData.x.length === nLon) {
    for (let i = iMin; i <= iMax; i += s) {
      xCrop.push(gridData.x[i]);
    }
  } else {
    const startLon = header?.start_lon ?? header?.StartLongitude ?? 0;
    const dLon = header?.d_lon ?? header?.LongitudeGridSpace ?? 0.25;
    for (let i = iMin; i <= iMax; i += s) {
      xCrop.push(startLon + i * dLon);
    }
  }

  // 2. Build yCrop
  const yCrop = [];
  const isDescendingLat = (header?.start_lat ?? 0) > (header?.end_lat ?? 0);
  if (gridData.y && gridData.y.length === nLat) {
    for (let j = jMin; j <= jMax; j += s) {
      yCrop.push(gridData.y[j]);
    }
  } else {
    const startLat = header?.start_lat ?? header?.StartLatitude ?? 0;
    let dLat = header?.d_lat ?? header?.LatitudeGridSpace;
    if (dLat === undefined || dLat === null || dLat === 0) {
      dLat = (header?.end_lat !== undefined && nLat > 1) ? (header.end_lat - startLat) / (nLat - 1) : -0.25;
    } else if (isDescendingLat && dLat > 0) {
      dLat = -dLat;
    }
    for (let j = jMin; j <= jMax; j += s) {
      yCrop.push(startLat + j * dLat);
    }
  }

  // 3. Build 2D matrix Z[latIndex][lonIndex]
  const is2D = Array.isArray(values) && Array.isArray(values[0]);
  const Z = [];
  for (let j = jMin; j <= jMax; j += s) {
    const row = [];
    for (let i = iMin; i <= iMax; i += s) {
      const v = is2D ? values[j][i] : values[j * nLon + i];
      row.push(v);
    }
    Z.push(row);
  }

  // 4. Normalize latitude to ascending order for Marching Squares
  if (yCrop.length > 1 && yCrop[0] > yCrop[yCrop.length - 1]) {
    yCrop.reverse();
    Z.reverse();
  }

  return {
    x: xCrop,
    y: yCrop,
    Z,
    step: s,
    nLon: xCrop.length,
    nLat: yCrop.length,
    nCells: xCrop.length * yCrop.length,
  };
}

export { DEFAULT_MAX_EFFECTIVE_CELLS };
