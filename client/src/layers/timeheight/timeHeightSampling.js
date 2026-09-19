// timeHeightSampling.js - Scalar and wind sampling, bilinear interpolation, and grid snapping for EC Time-Height Profile
import { createBilinearSampler as createWindBilinearSampler } from "../wind/windSampling.js";

/**
 * Normalizes grid header for scalar fields (RH, TMP, VVEL)
 * Accommodates both N->S (e.g. ECMWF_HR) and S->N coordinate orientations,
 * unsigned step sizes, and x/y coordinate arrays if present.
 */
export function normalizeScalarHeader(gridData) {
  if (!gridData) return null;
  const header = gridData.header || {};
  const nLon = header.n_lon || header.LongitudeGridNumber || (gridData.x ? gridData.x.length : 100);
  const nLat = header.n_lat || header.LatitudeGridNumber || (gridData.y ? gridData.y.length : 80);

  const startLon = gridData.x ? gridData.x[0] : (header.start_lon ?? header.StartLongitude ?? 60.0);
  const endLon = gridData.x ? gridData.x[gridData.x.length - 1] : (header.end_lon ?? header.EndLongitude ?? (startLon + (nLon - 1) * 0.25));
  const dLon = Math.abs(header.d_lon ?? header.LongitudeGridSpace ?? (nLon > 1 ? Math.abs(endLon - startLon) / (nLon - 1) : 0.25));

  const startLat = gridData.y ? gridData.y[0] : (header.start_lat ?? header.StartLatitude ?? 60.0);
  const endLat = gridData.y ? gridData.y[gridData.y.length - 1] : (header.end_lat ?? header.EndLatitude ?? (startLat + (nLat - 1) * (header.d_lat || -0.25)));
  const dLat = Math.abs(header.d_lat ?? header.LatitudeGridSpace ?? (nLat > 1 ? Math.abs(endLat - startLat) / (nLat - 1) : 0.25));
  const isLatNorthToSouth = startLat > endLat;

  return {
    nLon,
    nLat,
    startLon,
    endLon,
    dLon,
    startLat,
    endLat,
    dLat,
    isLatNorthToSouth,
    gridWest: Math.min(startLon, endLon),
    gridEast: Math.max(startLon, endLon),
    gridSouth: Math.min(startLat, endLat),
    gridNorth: Math.max(startLat, endLat),
  };
}

/**
 * Checks whether a sampled scalar value is a valid meteorological value
 */
export function isValidScalar(val, element = "") {
  if (val === null || val === undefined || Number.isNaN(val)) return false;
  if (val >= 9000 || val <= -9000) return false;
  const el = (element || "").toUpperCase();
  if (el === "RH") {
    return val >= -5 && val <= 160; // allow upper-tropospheric supersaturation and numerical overshoot before display clamping
  }
  if (el === "TMP") {
    return val >= -100 && val <= 70;
  }
  if (el === "VVEL") {
    // VVEL in ECMWF_HR is 10^-2 Pa/s (cPa/s); typical physical range -1000 to 1000
    return val >= -2000 && val <= 2000;
  }
  return true;
}

/**
 * Creates a bilinear sampler for scalar grid data (e.g. values[] array).
 * Returns (lon, lat) => interpolated scalar value | null.
 */
export function createScalarSampler(gridData, normHeader = null) {
  if (!gridData || !gridData.values || gridData.values.length === 0) {
    return () => null;
  }
  const h = normHeader || normalizeScalarHeader(gridData);
  if (!h) return () => null;

  const vals = gridData.values;
  const element = gridData.header?.element || "";
  const { nLon, nLat, startLon, dLon, startLat, dLat, isLatNorthToSouth } = h;

  return function sampleScalar(lng, lat) {
    const gx = (lng - startLon) / dLon;
    const gy = isLatNorthToSouth ? (startLat - lat) / dLat : (lat - startLat) / dLat;

    if (gx < 0 || gx > nLon - 1 || gy < 0 || gy > nLat - 1) return null;

    const x0 = Math.floor(gx);
    const x1 = Math.min(x0 + 1, nLon - 1);
    const y0 = Math.floor(gy);
    const y1 = Math.min(y0 + 1, nLat - 1);

    const fx = gx - x0;
    const fy = gy - y0;

    const row0 = y0 * nLon;
    const row1 = y1 * nLon;
    const v00 = vals[row0 + x0];
    const v10 = vals[row0 + x1];
    const v01 = vals[row1 + x0];
    const v11 = vals[row1 + x1];

    const val00Valid = isValidScalar(v00, element);
    const val10Valid = isValidScalar(v10, element);
    const val01Valid = isValidScalar(v01, element);
    const val11Valid = isValidScalar(v11, element);

    // If all 4 corners are valid, standard bilinear interpolation
    if (val00Valid && val10Valid && val01Valid && val11Valid) {
      let result = (1 - fx) * (1 - fy) * v00 +
                   fx * (1 - fy) * v10 +
                   (1 - fx) * fy * v01 +
                   fx * fy * v11;

      if (element === "RH") {
        result = Math.max(0, Math.min(100, result));
      }
      return result;
    }

    // If some corners are missing, do weighted average of valid corners
    let sumWeight = 0;
    let sumVal = 0;

    const w00 = (1 - fx) * (1 - fy);
    const w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy;
    const w11 = fx * fy;

    if (val00Valid) { sumVal += w00 * v00; sumWeight += w00; }
    if (val10Valid) { sumVal += w10 * v10; sumWeight += w10; }
    if (val01Valid) { sumVal += w01 * v01; sumWeight += w01; }
    if (val11Valid) { sumVal += w11 * v11; sumWeight += w11; }

    if (sumWeight > 0.001) {
      let result = sumVal / sumWeight;
      if (element === "RH") {
        result = Math.max(0, Math.min(100, result));
      }
      return result;
    }

    return null;
  };
}

/**
 * Creates a wind vector sampler returning [u, v] | null.
 */
export function createWindSampler(gridData) {
  if (!gridData || !gridData.u || !gridData.v) {
    return () => null;
  }
  const sample = createWindBilinearSampler(gridData);
  return function sampleWind(lng, lat) {
    const res = sample(lng, lat);
    if (!res) return null;
    const [u, v] = res;
    if (u === null || v === null || Number.isNaN(u) || Number.isNaN(v)) return null;
    if (Math.abs(u) >= 9000 || Math.abs(v) >= 9000) return null;
    return [u, v];
  };
}

/**
 * Snaps a target (lon, lat) to the nearest integer grid node (i, j) of gridData.
 * Returns { lon, lat, i, j }
 */
export function snapToGridNode(gridData, lon, lat) {
  if (typeof gridData === "number" && typeof lon === "number" && lat === undefined) {
    lat = lon;
    lon = gridData;
    gridData = null;
  }
  const h = normalizeScalarHeader(gridData) || {
    nLon: 361, nLat: 281,
    startLon: 60, endLon: 150, dLon: 0.25,
    startLat: 60, endLat: -10, dLat: 0.25,
    isLatNorthToSouth: true,
    gridWest: 60, gridEast: 150, gridSouth: -10, gridNorth: 60,
  };

  const clampedLon = Math.max(h.gridWest, Math.min(h.gridEast, lon));
  const clampedLat = Math.max(h.gridSouth, Math.min(h.gridNorth, lat));

  const gx = (clampedLon - h.startLon) / h.dLon;
  const gy = h.isLatNorthToSouth ? (h.startLat - clampedLat) / h.dLat : (clampedLat - h.startLat) / h.dLat;

  const i = Math.max(0, Math.min(h.nLon - 1, Math.round(gx)));
  const j = Math.max(0, Math.min(h.nLat - 1, Math.round(gy)));

  const snappedLon = gridData?.x ? gridData.x[i] : Number((h.startLon + i * h.dLon).toFixed(4));
  const snappedLat = gridData?.y ? gridData.y[j] : Number((h.isLatNorthToSouth ? h.startLat - j * h.dLat : h.startLat + j * h.dLat).toFixed(4));

  return {
    lon: snappedLon,
    lat: snappedLat,
    i,
    j,
  };
}

/**
 * Clamps coordinates to the grid domain bounds.
 */
export function clampToGridDomain(gridData, lon, lat) {
  const h = normalizeScalarHeader(gridData);
  if (!h) return { lon, lat, clamped: false };
  const clampedLon = Math.max(h.gridWest, Math.min(h.gridEast, lon));
  const clampedLat = Math.max(h.gridSouth, Math.min(h.gridNorth, lat));
  const clamped = clampedLon !== lon || clampedLat !== lat;
  return { lon: clampedLon, lat: clampedLat, clamped };
}
