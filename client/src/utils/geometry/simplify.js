// simplify.js - Douglas-Peucker line and geometry simplification
import { isRingClosed } from "./chaikin.js";

/**
 * Perpendicular distance squared from point p to line segment (p1, p2).
 */
export function getSqSegDist(p, p1, p2) {
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

export function simplifyDP(coords, sqTolerance) {
  const n = coords.length;
  if (n <= 2) return coords;

  const markers = new Uint8Array(n);
  markers[0] = 1;
  markers[n - 1] = 1;

  // Flattened stack [first, last] to avoid array allocations
  const stack = [0, n - 1];

  while (stack.length > 0) {
    const last = stack.pop();
    const first = stack.pop();
    let maxSqDist = 0;
    let maxIdx = 0;

    // Hoist segment vector invariants outside the point iteration loop
    const p1 = coords[first];
    const p2 = coords[last];
    const x1 = p1[0], y1 = p1[1];
    const segDx = p2[0] - x1, segDy = p2[1] - y1;
    const segLenSq = segDx * segDx + segDy * segDy;

    for (let i = first + 1; i < last; i++) {
      const p = coords[i];
      const px = p[0], py = p[1];
      let cx = x1, cy = y1;
      if (segLenSq !== 0) {
        const t = ((px - x1) * segDx + (py - y1) * segDy) / segLenSq;
        if (t > 1) {
          cx = p2[0];
          cy = p2[1];
        } else if (t > 0) {
          cx = x1 + segDx * t;
          cy = y1 + segDy * t;
        }
      }
      const ddx = px - cx;
      const ddy = py - cy;
      const sqDist = ddx * ddx + ddy * ddy;
      if (sqDist > maxSqDist) {
        maxSqDist = sqDist;
        maxIdx = i;
      }
    }

    if (maxSqDist > sqTolerance) {
      markers[maxIdx] = 1;
      if (maxIdx - first > 1) {
        stack.push(first, maxIdx);
      }
      if (last - maxIdx > 1) {
        stack.push(maxIdx, last);
      }
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
