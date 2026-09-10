// memStats.js - Instrumentation and heap estimation for §8.8 memory optimization
export function isDebugMemEnabled() {
  if (typeof window === "undefined") return false;
  try {
    if (window.__DEBUG_MEM__) return true;
    if (typeof location !== "undefined" && location.search.includes("debugMem")) return true;
  } catch {}
  return false;
}

/**
 * Measure current heap usage if performance.memory is available (Chromium/V8).
 * @returns {{ usedJSHeapSizeMB: number, totalJSHeapSizeMB: number } | null}
 */
export function measureHeap() {
  if (typeof performance !== "undefined" && performance.memory) {
    const mem = performance.memory;
    return {
      usedJSHeapSizeMB: Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 100) / 100,
      totalJSHeapSizeMB: Math.round((mem.totalJSHeapSize / (1024 * 1024)) * 100) / 100,
    };
  }
  return null;
}

/**
 * Traverses a GeoJSON FeatureCollection, Feature, or Geometry and counts all coordinate vertices.
 * @param {Object} geojson
 * @returns {number}
 */
export function countGeoJSONPoints(geojson) {
  if (!geojson) return 0;
  let count = 0;

  function countInCoords(coords) {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      count++;
      return;
    }
    for (let i = 0; i < coords.length; i++) {
      countInCoords(coords[i]);
    }
  }

  if (geojson.type === "FeatureCollection" && Array.isArray(geojson.features)) {
    for (const f of geojson.features) {
      if (f && f.geometry && f.geometry.coordinates) {
        countInCoords(f.geometry.coordinates);
      }
    }
  } else if (geojson.type === "Feature" && geojson.geometry && geojson.geometry.coordinates) {
    countInCoords(geojson.geometry.coordinates);
  } else if (geojson.coordinates) {
    countInCoords(geojson.coordinates);
  }

  return count;
}

/**
 * Estimates heap memory (in MB) for a GeoJSON FeatureCollection.
 * In V8, a 2D coordinate array [x, y] + array elements + object header ~ 40-48 bytes,
 * plus feature metadata, properties, and parent arrays.
 * Rough empirical formula: points * 64 bytes + features * 256 bytes.
 * @param {Object} geojson
 * @returns {number}
 */
export function estimateHeapMB(geojson) {
  if (!geojson) return 0;
  const points = countGeoJSONPoints(geojson);
  const numFeatures = geojson.features?.length || (geojson.type === "Feature" ? 1 : 0);
  const bytes = points * 64 + numFeatures * 256;
  return Math.round((bytes / (1024 * 1024)) * 10000) / 10000;
}
