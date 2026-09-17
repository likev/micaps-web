// kinematics.js - Spherical finite-difference kinematics for relative vorticity and divergence
import { smoothGrid2D } from "../utils/smoothContour.js";

/**
 * Coordinate & Velocity Conventions Audit:
 *
 * 1. Station wind decomposition (windLayer.js:707-711):
 *    Uses meteorological wind direction angle wd (degrees from North, clockwise, wind coming FROM):
 *      u = -ws * Math.sin(rad)
 *      v = -ws * Math.cos(rad)
 *    Yields physical eastward (+u) and northward (+v) velocities.
 *
 * 2. NWP vector wind parsing (Diamond-11 in server/parser/grid_data.go:132-136 & Architecture §6.2):
 *    Uses mathematical polar angle theta (degrees counter-clockwise from East / +X):
 *      u = speed * Math.cos(rad)
 *      v = speed * Math.sin(rad)
 *    Yields physical eastward (+u) and northward (+v) velocities.
 *
 * 3. Assumed kinematics convention in this module:
 *    +u: Eastward velocity component (m/s, along direction of increasing longitude lambda)
 *    +v: Northward velocity component (m/s, along direction of increasing latitude phi)
 *
 * 4. Spherical metric:
 *    Earth radius R = 6,371,000 m. Longitude lambda and latitude phi in radians.
 *      d/dx = 1 / (R * cos(phi)) * d/dlam
 *      d/dy = 1 / R * d/dphi
 *      dx_j = R * cos(phi_j) * dlam_rad
 *      dy   = R * dphi_rad (sign-normalized positive)
 *
 * 5. Sign conventions:
 *    zeta (Relative Vorticity) = dv/dx - du/dy  (NH cyclonic > 0, anticyclonic < 0)
 *    D    (Divergence)         = du/dx + dv/dy  (divergence > 0, convergence < 0)
 *    Display unit: 1e-5 s-1 (output scaled by 1e5)
 *    QC Bounds: |zeta|, |D| <= 100 (1e-5 s-1); non-physical outliers emit NaN.
 */

export const EARTH_RADIUS = 6371000; // Earth mean radius in meters
export const KINEMATIC_QC_MAX = 100; // Physical display cutoff in 1e-5 s-1

export const VOR_LEVELS = [-20, -15, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 15, 20];
export const DIV_LEVELS = [-20, -15, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 15, 20];
export const VOR_BOLD = [0, 10];
export const DIV_BOLD = [0];
export const VOR_COLOR = "#c678dd";
export const DIV_COLOR = "#56d4dd";

function isValidNumber(val) {
  return typeof val === "number" && !Number.isNaN(val) && Number.isFinite(val) && val > -9990 && val < 9000;
}

/**
 * Compute Relative Vorticity (zeta) and Divergence (D) grids via spherical finite differences.
 *
 * @param {Float32Array|Array<number>} u - Eastward velocity component (m/s)
 * @param {Float32Array|Array<number>} v - Northward velocity component (m/s)
 * @param {Object} headerLike - Object containing grid header properties or { header, x, y }
 * @param {Object} [options={}] - Computation and smoothing options
 * @returns {Object|null} { vor, div, nLon, nLat, x, y, header } with vor/div as Float32Array (1e-5 s-1)
 */
export function computeVortDiv(u, v, headerLike, options = {}) {
  if (!u || !v || !headerLike) return null;

  const header = headerLike.header || headerLike;
  const nLon = header.n_lon ?? header.LongitudeGridNumber ?? (headerLike.x ? headerLike.x.length : 0);
  const nLat = header.n_lat ?? header.LatitudeGridNumber ?? (headerLike.y ? headerLike.y.length : 0);

  if (!nLon || !nLat || nLon < 2 || nLat < 2) return null;
  const totalPoints = nLon * nLat;
  if (u.length < totalPoints || v.length < totalPoints) return null;

  const qcMax = typeof options.qcMax === "number" ? options.qcMax : KINEMATIC_QC_MAX;

  // Resolve grid coordinates & orientation
  const rawX = headerLike.x || header.x || null;
  const rawY = headerLike.y || header.y || null;

  const startLon = rawX ? rawX[0] : (header.start_lon ?? header.StartLongitude ?? 60.0);
  const endLon = rawX ? rawX[rawX.length - 1] : (header.end_lon ?? header.EndLongitude ?? (startLon + (nLon - 1) * 1.0));
  const dLon = Math.abs(header.d_lon ?? header.LongitudeGridSpace ?? (nLon > 1 ? Math.abs(endLon - startLon) / (nLon - 1) : 1.0));

  const startLat = rawY ? rawY[0] : (header.start_lat ?? header.StartLatitude ?? 10.0);
  const endLat = rawY ? rawY[rawY.length - 1] : (header.end_lat ?? header.EndLatitude ?? (startLat + (nLat - 1) * 1.0));
  const dLat = Math.abs(header.d_lat ?? header.LatitudeGridSpace ?? (nLat > 1 ? Math.abs(endLat - startLat) / (nLat - 1) : 1.0));

  // Determine latitude orientation: true if row 0 is south and row nLat-1 is north
  const latAscending = rawY ? (rawY[rawY.length - 1] > rawY[0]) : (endLat > startLat || (header.d_lat !== undefined && header.d_lat > 0));

  // Construct coordinates if not provided
  let x = rawX;
  if (!x || x.length !== nLon) {
    x = [];
    for (let c = 0; c < nLon; c++) {
      x.push(startLon + c * (endLon >= startLon ? dLon : -dLon));
    }
  }

  let y = rawY;
  if (!y || y.length !== nLat) {
    y = [];
    for (let r = 0; r < nLat; r++) {
      y.push(latAscending ? (startLat + r * dLat) : (startLat - r * dLat));
    }
  }

  // Pre-smoothing on u and v if requested (e.g. for IDW station wind grids)
  let workingU = u;
  let workingV = v;
  if (options.smoothInput) {
    const iters = options.inputSmoothIterations ?? 1;
    const weight = options.inputSmoothWeight ?? 0.45;
    workingU = smoothGrid2D(workingU, iters, weight, nLat, nLon);
    workingV = smoothGrid2D(workingV, iters, weight, nLat, nLon);
  }

  // Precompute metric distances
  const dLamRad = (dLon * Math.PI) / 180.0;
  const dPhiRad = (dLat * Math.PI) / 180.0;
  const dy = EARTH_RADIUS * dPhiRad;

  // Precompute dx for each latitude row j
  const dxRows = new Float64Array(nLat);
  for (let r = 0; r < nLat; r++) {
    const latDeg = y[r];
    const phi = (latDeg * Math.PI) / 180.0;
    const cosPhi = Math.max(1e-4, Math.abs(Math.cos(phi)));
    dxRows[r] = EARTH_RADIUS * cosPhi * dLamRad;
  }

  const vor = new Float32Array(totalPoints);
  const div = new Float32Array(totalPoints);

  for (let r = 0; r < nLat; r++) {
    const dx = dxRows[r];
    const rowOffset = r * nLon;

    // Determine neighbor row indices for Northward direction (+y)
    // If latAscending: North is r + 1, South is r - 1.
    // If !latAscending: North is r - 1, South is r + 1.
    const rNorth = latAscending ? r + 1 : r - 1;
    const rSouth = latAscending ? r - 1 : r + 1;
    const hasNorth = rNorth >= 0 && rNorth < nLat;
    const hasSouth = rSouth >= 0 && rSouth < nLat;

    for (let c = 0; c < nLon; c++) {
      const idx = rowOffset + c;
      const u0 = workingU[idx];
      const v0 = workingV[idx];

      if (!isValidNumber(u0) || !isValidNumber(v0)) {
        vor[idx] = NaN;
        div[idx] = NaN;
        continue;
      }

      // 1. Zonal derivatives (d/dx): East is c + 1, West is c - 1
      let dudX = NaN;
      let dvdX = NaN;

      if (c > 0 && c < nLon - 1) {
        const uEast = workingU[idx + 1];
        const uWest = workingU[idx - 1];
        const vEast = workingV[idx + 1];
        const vWest = workingV[idx - 1];

        if (isValidNumber(uEast) && isValidNumber(uWest)) {
          dudX = (uEast - uWest) / (2.0 * dx);
        } else if (isValidNumber(uEast)) {
          dudX = (uEast - u0) / dx;
        } else if (isValidNumber(uWest)) {
          dudX = (u0 - uWest) / dx;
        }

        if (isValidNumber(vEast) && isValidNumber(vWest)) {
          dvdX = (vEast - vWest) / (2.0 * dx);
        } else if (isValidNumber(vEast)) {
          dvdX = (vEast - v0) / dx;
        } else if (isValidNumber(vWest)) {
          dvdX = (v0 - vWest) / dx;
        }
      } else if (c === 0) {
        const uEast = workingU[idx + 1];
        const vEast = workingV[idx + 1];
        if (isValidNumber(uEast)) dudX = (uEast - u0) / dx;
        if (isValidNumber(vEast)) dvdX = (vEast - v0) / dx;
      } else {
        // c === nLon - 1
        const uWest = workingU[idx - 1];
        const vWest = workingV[idx - 1];
        if (isValidNumber(uWest)) dudX = (u0 - uWest) / dx;
        if (isValidNumber(vWest)) dvdX = (v0 - vWest) / dx;
      }

      // 2. Meridional derivatives (d/dy): North is rNorth, South is rSouth
      let dudY = NaN;
      let dvdY = NaN;

      if (hasNorth && hasSouth) {
        const idxN = rNorth * nLon + c;
        const idxS = rSouth * nLon + c;
        const uNorth = workingU[idxN];
        const uSouth = workingU[idxS];
        const vNorth = workingV[idxN];
        const vSouth = workingV[idxS];

        if (isValidNumber(uNorth) && isValidNumber(uSouth)) {
          dudY = (uNorth - uSouth) / (2.0 * dy);
        } else if (isValidNumber(uNorth)) {
          dudY = (uNorth - u0) / dy;
        } else if (isValidNumber(uSouth)) {
          dudY = (u0 - uSouth) / dy;
        }

        if (isValidNumber(vNorth) && isValidNumber(vSouth)) {
          dvdY = (vNorth - vSouth) / (2.0 * dy);
        } else if (isValidNumber(vNorth)) {
          dvdY = (vNorth - v0) / dy;
        } else if (isValidNumber(vSouth)) {
          dvdY = (v0 - vSouth) / dy;
        }
      } else if (hasNorth) {
        const idxN = rNorth * nLon + c;
        const uNorth = workingU[idxN];
        const vNorth = workingV[idxN];
        if (isValidNumber(uNorth)) dudY = (uNorth - u0) / dy;
        if (isValidNumber(vNorth)) dvdY = (vNorth - v0) / dy;
      } else if (hasSouth) {
        const idxS = rSouth * nLon + c;
        const uSouth = workingU[idxS];
        const vSouth = workingV[idxS];
        if (isValidNumber(uSouth)) dudY = (u0 - uSouth) / dy;
        if (isValidNumber(vSouth)) dvdY = (v0 - vSouth) / dy;
      }

      // 3. Vorticity and Divergence computation scaled by 1e5
      if (!Number.isNaN(dvdX) && !Number.isNaN(dudY)) {
        const z = (dvdX - dudY) * 1e5;
        vor[idx] = Math.abs(z) <= qcMax ? z : NaN;
      } else {
        vor[idx] = NaN;
      }

      if (!Number.isNaN(dudX) && !Number.isNaN(dvdY)) {
        const d = (dudX + dvdY) * 1e5;
        div[idx] = Math.abs(d) <= qcMax ? d : NaN;
      } else {
        div[idx] = NaN;
      }
    }
  }

  // Optional post-smoothing on vorticity and divergence fields
  let outVor = vor;
  let outDiv = div;
  if (options.smoothOutput) {
    const iters = options.outputSmoothIterations ?? 1;
    const weight = options.outputSmoothWeight ?? 0.4;
    const sVor = smoothGrid2D(outVor, iters, weight, nLat, nLon);
    const sDiv = smoothGrid2D(outDiv, iters, weight, nLat, nLon);
    outVor = sVor instanceof Float32Array ? sVor : new Float32Array(sVor);
    outDiv = sDiv instanceof Float32Array ? sDiv : new Float32Array(sDiv);
  }

  return {
    vor: outVor,
    div: outDiv,
    nLon,
    nLat,
    x,
    y,
    header: {
      start_lon: x[0],
      end_lon: x[x.length - 1],
      start_lat: y[0],
      end_lat: y[y.length - 1],
      n_lon: nLon,
      n_lat: nLat,
      d_lon: dLon,
      d_lat: dLat,
    },
  };
}

/**
 * Build contour-ready gridData object for VOR or DIV.
 *
 * @param {string} field - "VOR" or "DIV" (or aliases)
 * @param {Float32Array|Array<number>} u - Eastward wind component (m/s)
 * @param {Float32Array|Array<number>} v - Northward wind component (m/s)
 * @param {Object} headerLike - Header or gridData object
 * @param {Object} [options={}] - Smoothing / QC options
 * @returns {Object|null} { header, values, stats, x, y }
 */
export function buildKinematicGridData(field, u, v, headerLike, options = {}) {
  const norm = (field || "VOR").toUpperCase();
  const res = computeVortDiv(u, v, headerLike, options);
  if (!res) return null;

  let values;
  if (norm === "DIV" || norm === "DIVERGENCE") {
    values = res.div;
  } else if (norm === "CONV") {
    // Convergence is negative divergence
    values = new Float32Array(res.div.length);
    for (let i = 0; i < res.div.length; i++) {
      values[i] = Number.isNaN(res.div[i]) ? NaN : -res.div[i];
    }
  } else if (norm === "WIND" || norm === "WS" || norm === "SPEED") {
    values = new Float32Array(res.vor.length);
    for (let i = 0; i < values.length; i++) {
      const ui = u[i];
      const vi = v[i];
      if (typeof ui === "number" && !Number.isNaN(ui) && typeof vi === "number" && !Number.isNaN(vi)) {
        values[i] = Math.hypot(ui, vi);
      } else {
        values[i] = NaN;
      }
    }
    if (options.smoothOutput) {
      const iters = options.outputSmoothIterations ?? 1;
      const weight = options.outputSmoothWeight ?? 0.4;
      const sVal = smoothGrid2D(values, iters, weight, res.nLat, res.nLon);
      values = sVal instanceof Float32Array ? sVal : new Float32Array(sVal);
    }
  } else {
    // Default to relative vorticity VOR
    values = res.vor;
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;

  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (typeof val === "number" && !Number.isNaN(val) && Number.isFinite(val)) {
      if (val < min) min = val;
      if (val > max) max = val;
      sum += val;
      count++;
    }
  }

  const stats = count > 0 ? {
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    mean: Math.round((sum / count) * 100) / 100,
    count,
  } : { min: 0, max: 0, mean: 0, count: 0 };

  return {
    header: res.header,
    values,
    stats,
    x: res.x,
    y: res.y,
  };
}
