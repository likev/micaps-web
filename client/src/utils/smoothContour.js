// smoothContour.js - Chaikin's algorithm & 2D meteorological spatial filtering for smooth contour lines

/**
 * Check if a polyline coordinate array forms a closed ring.
 *
 * @param {Array<[number, number]>} coords - Array of [lon, lat] coordinates
 * @returns {boolean} True if first and last point are identical (within epsilon)
 */
export function isRingClosed(coords) {
  if (!Array.isArray(coords) || coords.length < 4) return false;
  const first = coords[0];
  const last = coords[coords.length - 1];
  return (
    Math.abs(first[0] - last[0]) < 1e-7 &&
    Math.abs(first[1] - last[1]) < 1e-7
  );
}

/**
 * Perform one iteration of Chaikin's corner-cutting algorithm on an open polyline.
 * Preserves the exact starting and ending endpoints.
 *
 * @param {Array<[number, number]>} coords - Open polyline coordinates
 * @param {number} factor - Corner cutting factor (default 0.25)
 * @returns {Array<[number, number]>} Smoothed coordinates
 */
function chaikinOpenIteration(coords, factor) {
  const n = coords.length;
  if (n < 3) return coords;

  const result = [[coords[0][0], coords[0][1]]];
  for (let i = 0; i < n - 1; i++) {
    const p0 = coords[i];
    const p1 = coords[i + 1];

    // Q point: (1 - factor) * P0 + factor * P1 (25% along segment)
    const qx = (1 - factor) * p0[0] + factor * p1[0];
    const qy = (1 - factor) * p0[1] + factor * p1[1];

    // R point: factor * P0 + (1 - factor) * P1 (75% along segment)
    const rx = factor * p0[0] + (1 - factor) * p1[0];
    const ry = factor * p0[1] + (1 - factor) * p1[1];

    result.push([qx, qy], [rx, ry]);
  }
  result.push([coords[n - 1][0], coords[n - 1][1]]);
  return result;
}

/**
 * Perform one iteration of Chaikin's corner-cutting algorithm on a closed ring.
 * Smooths across the wrap-around joint and ensures the ring is strictly closed.
 *
 * @param {Array<[number, number]>} coords - Closed ring coordinates
 * @param {number} factor - Corner cutting factor (default 0.25)
 * @returns {Array<[number, number]>} Smoothed ring coordinates
 */
function chaikinClosedIteration(coords, factor) {
  const n = coords.length;
  if (n < 4) return coords;

  // Exclude duplicate closing point for cyclic processing
  const pts = coords.slice(0, n - 1);
  const m = pts.length;
  const result = [];

  for (let i = 0; i < m; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % m];

    const qx = (1 - factor) * p0[0] + factor * p1[0];
    const qy = (1 - factor) * p0[1] + factor * p1[1];

    const rx = factor * p0[0] + (1 - factor) * p1[0];
    const ry = factor * p0[1] + (1 - factor) * p1[1];

    result.push([qx, qy], [rx, ry]);
  }

  // Strictly close the ring
  if (result.length > 0) {
    result.push([result[0][0], result[0][1]]);
  }

  return result;
}

/**
 * Smooth an array of [x, y] / [lon, lat] coordinates using Chaikin's algorithm.
 *
 * @param {Array<[number, number]>} coords - Coordinate array
 * @param {number} [iterations=2] - Number of smoothing iterations (default 2)
 * @param {number} [factor=0.25] - Corner-cutting factor (default 0.25)
 * @returns {Array<[number, number]>} Smoothed coordinates
 */
export function smoothCoordinates(coords, iterations = 2, factor = 0.25) {
  if (!Array.isArray(coords) || coords.length < 3 || iterations <= 0) {
    return coords ? coords.map((p) => [p[0], p[1]]) : [];
  }

  const isClosed = isRingClosed(coords);
  let current = coords;

  for (let it = 0; it < iterations; it++) {
    if (isClosed) {
      current = chaikinClosedIteration(current, factor);
    } else {
      current = chaikinOpenIteration(current, factor);
    }
  }

  return current;
}

/**
 * Smooth a GeoJSON Geometry object (LineString, MultiLineString, Polygon, MultiPolygon).
 *
 * @param {object} geometry - GeoJSON geometry object
 * @param {number} [iterations=2] - Smoothing iterations
 * @param {number} [factor=0.25] - Cutting factor
 * @returns {object} Smoothed GeoJSON geometry
 */
export function smoothGeometry(geometry, iterations = 2, factor = 0.25) {
  if (!geometry || !geometry.coordinates) return geometry;

  switch (geometry.type) {
    case "LineString":
      return {
        ...geometry,
        coordinates: smoothCoordinates(geometry.coordinates, iterations, factor),
      };
    case "MultiLineString":
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((line) =>
          smoothCoordinates(line, iterations, factor)
        ),
      };
    case "Polygon":
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((ring) =>
          smoothCoordinates(ring, iterations, factor)
        ),
      };
    case "MultiPolygon":
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((poly) =>
          poly.map((ring) => smoothCoordinates(ring, iterations, factor))
        ),
      };
    default:
      return geometry;
  }
}

/**
 * Smooth all features within a GeoJSON FeatureCollection.
 *
 * @param {object} featureCollection - GeoJSON FeatureCollection
 * @param {number} [iterations=2] - Smoothing iterations
 * @param {number} [factor=0.25] - Cutting factor
 * @returns {object} FeatureCollection with smoothed geometries
 */
export function smoothFeatureCollection(featureCollection, iterations = 2, factor = 0.25) {
  if (!featureCollection || !Array.isArray(featureCollection.features)) {
    return featureCollection;
  }

  return {
    ...featureCollection,
    features: featureCollection.features.map((feature) => {
      if (!feature || !feature.geometry) return feature;
      return {
        ...feature,
        geometry: smoothGeometry(feature.geometry, iterations, factor),
      };
    }),
  };
}

/**
 * Meteorological 9-point spatial smoothing filter for 2D scalar fields.
 * Applies a 2D spatial convolution kernel to reduce single-grid-point noise
 * while preserving synoptic wave amplitudes and gradients.
 *
 * Kernel weights:
 * [ wDiag, wSide,   wDiag ]
 * [ wSide, wCenter, wSide ] / (normalization sum)
 * [ wDiag, wSide,   wDiag ]
 *
 * @param {Array<Array<number>>|Float64Array|Array<number>} Z - 2D matrix or flat 1D array
 * @param {number} [iterations=1] - Number of smoothing passes
 * @param {number} [weight=0.4] - Smoothing weight parameter (0 to 1)
 * @param {number} [rows] - Row count if Z is a 1D array
 * @param {number} [cols] - Column count if Z is a 1D array
 * @returns {Array<Array<number>>|Float64Array|Array<number>} Smoothed 2D grid
 */
export function smoothGrid2D(Z, iterations = 1, weight = 0.4, rows = null, cols = null) {
  if (!Z || iterations <= 0) return Z;

  const is2D = Array.isArray(Z) && Array.isArray(Z[0]);
  let nRows = rows;
  let nCols = cols;

  if (is2D) {
    nRows = Z.length;
    nCols = Z[0].length;
  } else if (!nRows || !nCols) {
    return Z;
  }

  if (nRows < 3 || nCols < 3) return Z;

  // Convert to working 2D array
  let current;
  if (is2D) {
    current = Z.map((row) => [...row]);
  } else {
    current = [];
    for (let r = 0; r < nRows; r++) {
      const row = [];
      for (let c = 0; c < nCols; c++) {
        row.push(Z[r * nCols + c]);
      }
      current.push(row);
    }
  }

  const s = Math.max(0, Math.min(1, weight));
  const wCenter = 1.0 - s * 0.5;
  const wSide = s * 0.125;
  const wDiag = s * 0.0625;

  for (let it = 0; it < iterations; it++) {
    const next = [];
    for (let r = 0; r < nRows; r++) {
      const nextRow = new Array(nCols);
      for (let c = 0; c < nCols; c++) {
        const val = current[r][c];
        if (typeof val !== "number" || isNaN(val) || !isFinite(val)) {
          nextRow[c] = val;
          continue;
        }

        let sumWeights = wCenter;
        let weightedSum = val * wCenter;

        // 4 orthogonal neighbors
        const sideNeighbors = [
          [r - 1, c],
          [r + 1, c],
          [r, c - 1],
          [r, c + 1],
        ];

        for (const [nr, nc] of sideNeighbors) {
          if (nr >= 0 && nr < nRows && nc >= 0 && nc < nCols) {
            const nVal = current[nr][nc];
            if (typeof nVal === "number" && !isNaN(nVal) && isFinite(nVal)) {
              weightedSum += nVal * wSide;
              sumWeights += wSide;
            }
          }
        }

        // 4 diagonal neighbors
        const diagNeighbors = [
          [r - 1, c - 1],
          [r - 1, c + 1],
          [r + 1, c - 1],
          [r + 1, c + 1],
        ];

        for (const [nr, nc] of diagNeighbors) {
          if (nr >= 0 && nr < nRows && nc >= 0 && nc < nCols) {
            const nVal = current[nr][nc];
            if (typeof nVal === "number" && !isNaN(nVal) && isFinite(nVal)) {
              weightedSum += nVal * wDiag;
              sumWeights += wDiag;
            }
          }
        }

        nextRow[c] = sumWeights > 0 ? weightedSum / sumWeights : val;
      }
      next.push(nextRow);
    }
    current = next;
  }

  if (is2D) {
    return current;
  }

  // Flat output matching input type
  const flatResult =
    Z instanceof Float64Array
      ? new Float64Array(nRows * nCols)
      : new Array(nRows * nCols);
  for (let r = 0; r < nRows; r++) {
    for (let c = 0; c < nCols; c++) {
      flatResult[r * nCols + c] = current[r][c];
    }
  }
  return flatResult;
}

/**
 * Perpendicular distance squared from point p to line segment (p1, p2).
 */
function getSqSegDist(p, p1, p2) {
  let x = p1[0], y = p1[1];
  let dx = p2[0] - x, dy = p2[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = p2[0];
      y = p2[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

function simplifyDP(coords, sqTolerance) {
  const n = coords.length;
  if (n <= 2) return coords;

  const markers = new Uint8Array(n);
  markers[0] = 1;
  markers[n - 1] = 1;

  const stack = [[0, n - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let maxSqDist = 0;
    let maxIdx = 0;

    for (let i = first + 1; i < last; i++) {
      const sqDist = getSqSegDist(coords[i], coords[first], coords[last]);
      if (sqDist > maxSqDist) {
        maxSqDist = sqDist;
        maxIdx = i;
      }
    }

    if (maxSqDist > sqTolerance) {
      markers[maxIdx] = 1;
      if (maxIdx - first > 1) stack.push([first, maxIdx]);
      if (last - maxIdx > 1) stack.push([maxIdx, last]);
    }
  }

  const result = [];
  for (let i = 0; i < n; i++) {
    if (markers[i]) result.push(coords[i]);
  }
  return result;
}

/**
 * Douglas-Peucker line simplification on polyline coordinate arrays.
 * Preserves exact starting and ending endpoints for open lines,
 * and maintains topological closure for closed rings.
 *
 * @param {Array<[number, number]>} coords - Polyline coordinates
 * @param {number} [tolerance=0.02] - Distance tolerance in degrees
 * @returns {Array<[number, number]>}
 */
export function simplifyPolyline(coords, tolerance = 0.02) {
  if (!Array.isArray(coords) || coords.length <= 2 || tolerance <= 0) return coords;

  const sqTolerance = tolerance * tolerance;
  const isClosed = isRingClosed(coords);

  if (isClosed && coords.length >= 4) {
    const midIdx = Math.floor(coords.length / 2);
    const half1 = simplifyDP(coords.slice(0, midIdx + 1), sqTolerance);
    const half2 = simplifyDP(coords.slice(midIdx), sqTolerance);
    const combined = half1.slice(0, -1).concat(half2);
    if (combined.length < 4) return coords;
    combined[combined.length - 1] = [combined[0][0], combined[0][1]];
    return combined;
  }

  return simplifyDP(coords, sqTolerance);
}

/**
 * Simplifies all LineString, MultiLineString, and Polygon geometries in a GeoJSON FeatureCollection.
 *
 * @param {Object} fc - FeatureCollection
 * @param {number} [tolerance=0.02] - Simplification tolerance in degrees
 * @returns {Object}
 */
export function simplifyFeatureCollection(fc, tolerance = 0.02) {
  if (!fc || !Array.isArray(fc.features) || fc.features.length === 0 || tolerance <= 0) return fc;

  const newFeatures = [];
  for (const f of fc.features) {
    if (!f || !f.geometry) {
      newFeatures.push(f);
      continue;
    }
    const geom = f.geometry;
    let newGeom = geom;

    if (geom.type === "LineString" && Array.isArray(geom.coordinates)) {
      newGeom = {
        ...geom,
        coordinates: simplifyPolyline(geom.coordinates, tolerance),
      };
    } else if (geom.type === "MultiLineString" && Array.isArray(geom.coordinates)) {
      newGeom = {
        ...geom,
        coordinates: geom.coordinates.map((line) => simplifyPolyline(line, tolerance)),
      };
    } else if (geom.type === "Polygon" && Array.isArray(geom.coordinates)) {
      newGeom = {
        ...geom,
        coordinates: geom.coordinates.map((ring) => simplifyPolyline(ring, tolerance)),
      };
    } else if (geom.type === "MultiPolygon" && Array.isArray(geom.coordinates)) {
      newGeom = {
        ...geom,
        coordinates: geom.coordinates.map((poly) =>
          poly.map((ring) => simplifyPolyline(ring, tolerance))
        ),
      };
    }

    newFeatures.push({
      ...f,
      geometry: newGeom,
    });
  }

  return {
    ...fc,
    features: newFeatures,
  };
}

