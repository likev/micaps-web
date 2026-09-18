// clip.js - Cohen-Sutherland polyline and GeoJSON feature clipping to axis-aligned bounding boxes
// Used to crop upper-air sounding contour lines strictly to the observation region bounding box

const INSIDE = 0; // 0000
const LEFT = 1;   // 0001
const RIGHT = 2;  // 0010
const BOTTOM = 4; // 0100
const TOP = 8;    // 1000

/**
 * Computes Cohen-Sutherland outcode for a 2D point against [minX, minY, maxX, maxY].
 *
 * @param {number} x
 * @param {number} y
 * @param {number} minX
 * @param {number} minY
 * @param {number} maxX
 * @param {number} maxY
 * @returns {number} 4-bit outcode
 */
export function computeOutCode(x, y, minX, minY, maxX, maxY) {
  let code = INSIDE;
  if (x < minX) {
    code |= LEFT;
  } else if (x > maxX) {
    code |= RIGHT;
  }
  if (y < minY) {
    code |= BOTTOM;
  } else if (y > maxY) {
    code |= TOP;
  }
  return code;
}

/**
 * Clips a single line segment (x0, y0) -> (x1, y1) against an axis-aligned bounding box.
 * Returns [cx0, cy0, cx1, cy1] if any portion of the segment lies within the box, or null if completely outside.
 *
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number} minX
 * @param {number} minY
 * @param {number} maxX
 * @param {number} maxY
 * @returns {[number, number, number, number]|null} Clipped segment coordinates or null
 */
export function clipSegment(x0, y0, x1, y1, minX, minY, maxX, maxY) {
  let c0 = computeOutCode(x0, y0, minX, minY, maxX, maxY);
  let c1 = computeOutCode(x1, y1, minX, minY, maxX, maxY);

  let pX0 = x0;
  let pY0 = y0;
  let pX1 = x1;
  let pY1 = y1;

  while (true) {
    if ((c0 | c1) === 0) {
      // Trivially accept: both points inside bounding box
      return [pX0, pY0, pX1, pY1];
    }
    if ((c0 & c1) !== 0) {
      // Trivially reject: both points share an outside region
      return null;
    }

    // At least one endpoint is outside; pick the outside one
    const codeOut = c0 !== 0 ? c0 : c1;
    let x = 0;
    let y = 0;

    const dx = pX1 - pX0;
    const dy = pY1 - pY0;

    if (codeOut & TOP) {
      x = pX0 + (dx * (maxY - pY0)) / dy;
      y = maxY;
    } else if (codeOut & BOTTOM) {
      x = pX0 + (dx * (minY - pY0)) / dy;
      y = minY;
    } else if (codeOut & RIGHT) {
      y = pY0 + (dy * (maxX - pX0)) / dx;
      x = maxX;
    } else if (codeOut & LEFT) {
      y = pY0 + (dy * (minX - pX0)) / dx;
      x = minX;
    }

    if (codeOut === c0) {
      pX0 = x;
      pY0 = y;
      c0 = computeOutCode(pX0, pY0, minX, minY, maxX, maxY);
    } else {
      pX1 = x;
      pY1 = y;
      c1 = computeOutCode(pX1, pY1, minX, minY, maxX, maxY);
    }
  }
}

/**
 * Clips a polyline (array of [x, y] coordinates) against an axis-aligned bounding box [minX, minY, maxX, maxY].
 * Returns an array of polylines (each with at least 2 points) that fall inside the box.
 *
 * @param {Array<[number, number]>} coords - Array of [lon, lat] coordinate pairs
 * @param {[number, number, number, number]} bbox - [minX, minY, maxX, maxY]
 * @returns {Array<Array<[number, number]>>} Array of clipped polylines
 */
export function clipPolyline(coords, bbox) {
  if (!Array.isArray(coords) || coords.length < 2 || !bbox || bbox.length < 4) {
    return [];
  }

  const [minX, minY, maxX, maxY] = bbox;
  const resultLines = [];
  let currentLine = [];

  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i];
    const p1 = coords[i + 1];
    const p0Out = computeOutCode(p0[0], p0[1], minX, minY, maxX, maxY) !== INSIDE;
    const clipped = clipSegment(p0[0], p0[1], p1[0], p1[1], minX, minY, maxX, maxY);

    if (clipped) {
      const cx0 = clipped[0];
      const cy0 = clipped[1];
      const cx1 = clipped[2];
      const cy1 = clipped[3];

      if (currentLine.length === 0) {
        currentLine.push([cx0, cy0], [cx1, cy1]);
      } else if (!p0Out) {
        const lastPt = currentLine[currentLine.length - 1];
        const distSq = (lastPt[0] - cx0) ** 2 + (lastPt[1] - cy0) ** 2;
        if (distSq < 1e-10) {
          // Connected segment continuation inside the box
          currentLine.push([cx1, cy1]);
        } else {
          // Discontinuity: push completed segment, start new one
          if (currentLine.length >= 2) {
            resultLines.push(currentLine);
          }
          currentLine = [[cx0, cy0], [cx1, cy1]];
        }
      } else {
        // p0 was outside the box; line exited and is now re-entering
        if (currentLine.length >= 2) {
          resultLines.push(currentLine);
        }
        currentLine = [[cx0, cy0], [cx1, cy1]];
      }
    } else {
      // Segment entirely outside: close current polyline segment if any
      if (currentLine.length >= 2) {
        resultLines.push(currentLine);
      }
      currentLine = [];
    }
  }

  if (currentLine.length >= 2) {
    resultLines.push(currentLine);
  }

  return resultLines;
}

/**
 * Clips a GeoJSON LineString or MultiLineString feature to a bounding box.
 * Returns a new feature with updated geometry, or null if the feature is completely outside.
 *
 * @param {Object} feature - GeoJSON feature
 * @param {[number, number, number, number]} bbox - [minX, minY, maxX, maxY]
 * @returns {Object|null} Clipped feature or null
 */
export function clipLineFeature(feature, bbox) {
  if (!feature || !feature.geometry || !bbox) return feature || null;

  const { type, coordinates } = feature.geometry;
  if (!Array.isArray(coordinates)) return feature;

  let clippedLines = [];
  if (type === "LineString") {
    clippedLines = clipPolyline(coordinates, bbox);
  } else if (type === "MultiLineString") {
    for (const line of coordinates) {
      const parts = clipPolyline(line, bbox);
      if (parts.length > 0) {
        clippedLines.push(...parts);
      }
    }
  } else {
    // Non-line geometry returned as-is
    return feature;
  }

  if (clippedLines.length === 0) {
    return null;
  }

  if (clippedLines.length === 1 && type === "LineString") {
    return {
      ...feature,
      geometry: {
        type: "LineString",
        coordinates: clippedLines[0],
      },
    };
  }

  return {
    ...feature,
    geometry: {
      type: "MultiLineString",
      coordinates: clippedLines,
    },
  };
}

/**
 * Clips an array of GeoJSON features against an axis-aligned bounding box [minX, minY, maxX, maxY].
 *
 * @param {Array<Object>} features
 * @param {[number, number, number, number]} bbox
 * @returns {Array<Object>} Clipped features (excluding features outside the bounding box)
 */
export function clipLineFeatures(features, bbox) {
  if (!Array.isArray(features) || !bbox) return features || [];
  const result = [];
  for (let i = 0; i < features.length; i++) {
    const cf = clipLineFeature(features[i], bbox);
    if (cf) {
      result.push(cf);
    }
  }
  return result;
}

/**
 * Clips a GeoJSON FeatureCollection to an axis-aligned bounding box.
 *
 * @param {Object} fc - FeatureCollection
 * @param {[number, number, number, number]} bbox - [minX, minY, maxX, maxY]
 * @returns {Object} FeatureCollection with clipped features
 */
export function clipFeatureCollectionToBBox(fc, bbox) {
  if (!fc || !Array.isArray(fc.features) || !bbox) return fc;
  return {
    ...fc,
    features: clipLineFeatures(fc.features, bbox),
  };
}
