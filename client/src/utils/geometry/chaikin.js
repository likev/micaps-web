// chaikin.js - Chaikin's corner-cutting algorithm for open polylines and closed rings

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
export function chaikinOpenIteration(coords, factor) {
  const n = coords.length;
  if (n < 3) return coords;

  const invFactor = 1 - factor;
  const result = [[coords[0][0], coords[0][1]]];
  for (let i = 0; i < n - 1; i++) {
    const p0 = coords[i];
    const p1 = coords[i + 1];

    // Q point: (1 - factor) * P0 + factor * P1 (25% along segment)
    const qx = invFactor * p0[0] + factor * p1[0];
    const qy = invFactor * p0[1] + factor * p1[1];

    // R point: factor * P0 + (1 - factor) * P1 (75% along segment)
    const rx = factor * p0[0] + invFactor * p1[0];
    const ry = factor * p0[1] + invFactor * p1[1];

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
export function chaikinClosedIteration(coords, factor) {
  const n = coords.length;
  if (n < 4) return coords;

  // Exclude duplicate closing point for cyclic processing
  const pts = coords.slice(0, n - 1);
  const m = pts.length;
  const invFactor = 1 - factor;
  const result = [];

  for (let i = 0; i < m; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % m];

    const qx = invFactor * p0[0] + factor * p1[0];
    const qy = invFactor * p0[1] + factor * p1[1];

    const rx = factor * p0[0] + invFactor * p1[0];
    const ry = factor * p0[1] + invFactor * p1[1];

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
