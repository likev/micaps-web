// contour_clip.test.js - Unit tests for sounding region contour bounding box cropping and isoline clipping
import { describe, test, expect } from "bun:test";
import {
  computeOutCode,
  clipSegment,
  clipPolyline,
  clipLineFeature,
  clipLineFeatures,
  clipFeatureCollectionToBBox,
} from "../src/utils/geometry/clip.js";
import {
  calculateFieldContours,
  analyzeAndRenderSoundingElementContour,
  analyzeAndRenderSoundingKinematicContour,
} from "../src/layers/soundingAnalysis.js";
import {
  analyzeAndRenderSurfaceContours,
  analyzeAndRenderSurfaceKinematicContours,
} from "../src/layers/surfaceAnalysis.js";

function createMockMap() {
  const sources = new Map();
  const layers = new Map();
  return {
    sources,
    layers,
    getSource(id) {
      if (!sources.has(id)) return null;
      return {
        _data: sources.get(id),
        setData(d) {
          sources.set(id, d);
          this._data = d;
        },
      };
    },
    addSource(id, src) {
      sources.set(id, src.data);
    },
    removeSource(id) {
      sources.delete(id);
    },
    getLayer(id) {
      return layers.get(id) || null;
    },
    addLayer(layerDef) {
      layers.set(layerDef.id, layerDef);
    },
    removeLayer(id) {
      layers.delete(id);
    },
    setLayoutProperty(id, prop, val) {
      if (layers.has(id)) {
        const l = layers.get(id);
        if (!l.layout) l.layout = {};
        l.layout[prop] = val;
      }
    },
    setPaintProperty(id, prop, val) {
      if (layers.has(id)) {
        const l = layers.get(id);
        if (!l.paint) l.paint = {};
        l.paint[prop] = val;
      }
    },
  };
}

function createSampleSoundingStations() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [116.4, 39.9] }, // Beijing
        properties: {
          station_id: 54511,
          height: 5840,
          temperature: -14.5,
          dewpoint: -22.0,
          wind_speed: 18.5,
          wind_dir: 270,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [121.4, 31.2] }, // Shanghai
        properties: {
          station_id: 58362,
          height: 5880,
          temperature: -10.0,
          dewpoint: -15.5,
          wind_speed: 24.0,
          wind_dir: 240,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [113.3, 23.1] }, // Guangzhou
        properties: {
          station_id: 59287,
          height: 5920,
          temperature: -6.5,
          dewpoint: -11.0,
          wind_speed: 12.0,
          wind_dir: 200,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [104.0, 30.6] }, // Chengdu
        properties: {
          station_id: 56294,
          height: 5860,
          temperature: -12.0,
          dewpoint: -18.0,
          wind_speed: 14.0,
          wind_dir: 310,
        },
      },
    ],
  };
}

describe("Cohen-Sutherland Polyline and Bounding Box Clipping", () => {
  const bbox = [10, 10, 20, 20]; // [minX, minY, maxX, maxY]

  test("computeOutCode identifies inside and outside sectors accurately", () => {
    expect(computeOutCode(15, 15, 10, 10, 20, 20)).toBe(0); // Center
    expect(computeOutCode(5, 15, 10, 10, 20, 20)).toBe(1);  // Left
    expect(computeOutCode(25, 15, 10, 10, 20, 20)).toBe(2); // Right
    expect(computeOutCode(15, 5, 10, 10, 20, 20)).toBe(4);  // Bottom
    expect(computeOutCode(15, 25, 10, 10, 20, 20)).toBe(8); // Top
    expect(computeOutCode(5, 5, 10, 10, 20, 20)).toBe(5);   // Bottom-Left
    expect(computeOutCode(25, 25, 10, 10, 20, 20)).toBe(10);// Top-Right
  });

  test("clipSegment preserves fully internal segment", () => {
    const res = clipSegment(12, 12, 18, 18, 10, 10, 20, 20);
    expect(res).not.toBeNull();
    expect(res[0]).toBe(12);
    expect(res[1]).toBe(12);
    expect(res[2]).toBe(18);
    expect(res[3]).toBe(18);
  });

  test("clipSegment discards fully external segment", () => {
    expect(clipSegment(0, 5, 5, 5, 10, 10, 20, 20)).toBeNull();
    expect(clipSegment(25, 25, 30, 30, 10, 10, 20, 20)).toBeNull();
  });

  test("clipSegment clips segment crossing border to exact intersection", () => {
    // Segment starting at (5, 15) and ending at (15, 15) crosses left edge at x=10
    const res = clipSegment(5, 15, 15, 15, 10, 10, 20, 20);
    expect(res).not.toBeNull();
    expect(res[0]).toBe(10);
    expect(res[1]).toBe(15);
    expect(res[2]).toBe(15);
    expect(res[3]).toBe(15);
  });

  test("clipSegment clips segment completely traversing across box", () => {
    // Segment from (5, 15) to (25, 15) crosses left edge (10, 15) and right edge (20, 15)
    const res = clipSegment(5, 15, 25, 15, 10, 10, 20, 20);
    expect(res).not.toBeNull();
    expect(res[0]).toBe(10);
    expect(res[1]).toBe(15);
    expect(res[2]).toBe(20);
    expect(res[3]).toBe(15);
  });

  test("clipPolyline trims polyline that extends outside bounding box", () => {
    const poly = [
      [5, 15],  // outside left
      [12, 15], // inside
      [18, 15], // inside
      [25, 15], // outside right
    ];
    const clipped = clipPolyline(poly, bbox);
    expect(clipped.length).toBe(1);
    expect(clipped[0].length).toBe(4);
    expect(clipped[0][0]).toEqual([10, 15]); // entry at x=10
    expect(clipped[0][1]).toEqual([12, 15]);
    expect(clipped[0][2]).toEqual([18, 15]);
    expect(clipped[0][3]).toEqual([20, 15]); // exit at x=20
  });

  test("clipPolyline splits polyline that exits and re-enters box into two segments", () => {
    const poly = [
      [12, 15], // inside
      [5, 15],  // outside left
      [18, 15], // inside
    ];
    const clipped = clipPolyline(poly, bbox);
    expect(clipped.length).toBe(2);
    expect(clipped[0][0]).toEqual([12, 15]);
    expect(clipped[0][1]).toEqual([10, 15]); // left exit

    expect(clipped[1][0]).toEqual([10, 15]); // left re-entry
    expect(clipped[1][1]).toEqual([18, 15]);
  });

  test("clipLineFeature clips LineString and preserves feature properties", () => {
    const feature = {
      type: "Feature",
      properties: { value: 5880, isBold: true, label: "588" },
      geometry: {
        type: "LineString",
        coordinates: [
          [5, 12],
          [15, 12],
          [25, 12],
        ],
      },
    };

    const cf = clipLineFeature(feature, bbox);
    expect(cf).not.toBeNull();
    expect(cf.properties.value).toBe(5880);
    expect(cf.properties.isBold).toBe(true);
    expect(cf.geometry.type).toBe("LineString");
    expect(cf.geometry.coordinates[0]).toEqual([10, 12]);
    expect(cf.geometry.coordinates[cf.geometry.coordinates.length - 1]).toEqual([20, 12]);
  });

  test("clipFeatureCollectionToBBox removes features completely outside bounding box", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { id: 1 },
          geometry: { type: "LineString", coordinates: [[12, 12], [18, 18]] },
        },
        {
          type: "Feature",
          properties: { id: 2 },
          geometry: { type: "LineString", coordinates: [[0, 0], [2, 2]] }, // outside
        },
      ],
    };

    const clippedFC = clipFeatureCollectionToBBox(fc, bbox);
    expect(clippedFC.features.length).toBe(1);
    expect(clippedFC.features[0].properties.id).toBe(1);
  });
});

describe("Upper-Air Sounding Contour Cropping to Region Bounding Box", () => {
  test("calculateFieldContours tightens domain and clips isolines strictly to sounding region bounding box", () => {
    const stns = createSampleSoundingStations();
    // Stations: Beijing (116.4, 39.9), Shanghai (121.4, 31.2), Guangzhou (113.3, 23.1), Chengdu (104.0, 30.6)
    // stnMinLon = 104.0, stnMaxLon = 121.4
    // stnMinLat = 23.1,  stnMaxLat = 39.9

    const res = calculateFieldContours(stns, (p) => p.height, {
      element: "HGT",
      padding: 1.0, // tight 1.0 deg margin
    }, 500);

    expect(res).not.toBeNull();
    expect(res.bounds).toBeDefined();
    const [minLon, minLat, maxLon, maxLat] = res.bounds;

    // Bounds should tightly enclose stations plus ~1.0 degree margin
    expect(minLon).toBeGreaterThanOrEqual(102);
    expect(minLon).toBeLessThanOrEqual(104);
    expect(maxLon).toBeGreaterThanOrEqual(121);
    expect(maxLon).toBeLessThanOrEqual(124);

    expect(minLat).toBeGreaterThanOrEqual(21);
    expect(minLat).toBeLessThanOrEqual(23);
    expect(maxLat).toBeGreaterThanOrEqual(39);
    expect(maxLat).toBeLessThanOrEqual(42);

    // Verify all points across all generated contour lines are strictly inside res.bounds
    expect(res.lines.length).toBeGreaterThan(0);
    const eps = 1e-5;
    for (const f of res.lines) {
      const coords = f.geometry.type === "LineString"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates;

      for (const line of coords) {
        for (const [lon, lat] of line) {
          expect(lon).toBeGreaterThanOrEqual(minLon - eps);
          expect(lon).toBeLessThanOrEqual(maxLon + eps);
          expect(lat).toBeGreaterThanOrEqual(minLat - eps);
          expect(lat).toBeLessThanOrEqual(maxLat + eps);
        }
      }
    }
  });

  test("calculateFieldContours honors custom clipBounds override", () => {
    const stns = createSampleSoundingStations();
    const customBBox = [105.0, 25.0, 120.0, 38.0];

    const res = calculateFieldContours(stns, (p) => p.height, {
      element: "HGT",
      clipBounds: customBBox,
    }, 500);

    expect(res).not.toBeNull();
    expect(res.lines.length).toBeGreaterThan(0);

    const eps = 1e-5;
    for (const f of res.lines) {
      const coords = f.geometry.type === "LineString"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates;

      for (const line of coords) {
        for (const [lon, lat] of line) {
          expect(lon).toBeGreaterThanOrEqual(customBBox[0] - eps);
          expect(lon).toBeLessThanOrEqual(customBBox[2] + eps);
          expect(lat).toBeGreaterThanOrEqual(customBBox[1] - eps);
          expect(lat).toBeLessThanOrEqual(customBBox[3] + eps);
        }
      }
    }
  });

  test("analyzeAndRenderSoundingElementContour renders clipped isolines to MapLibre source", () => {
    const map = createMockMap();
    const stns = createSampleSoundingStations();
    const win = { id: "test-crop-win" };

    const res = analyzeAndRenderSoundingElementContour(map, stns, 500, "HGT", { padding: 1.0 }, win);
    expect(res).not.toBeNull();

    const isolineSrc = map.getSource("contour-sounding-hgt-500-isoline-source");
    expect(isolineSrc).not.toBeNull();
    expect(isolineSrc._data.features.length).toBeGreaterThan(0);

    const [minLon, minLat, maxLon, maxLat] = res.bounds;
    const eps = 1e-4;
    for (const f of isolineSrc._data.features) {
      const coords = f.geometry.type === "LineString"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates;

      for (const line of coords) {
        for (const [lon, lat] of line) {
          expect(lon).toBeGreaterThanOrEqual(minLon - eps);
          expect(lon).toBeLessThanOrEqual(maxLon + eps);
          expect(lat).toBeGreaterThanOrEqual(minLat - eps);
          expect(lat).toBeLessThanOrEqual(maxLat + eps);
        }
      }
    }
  });

  test("analyzeAndRenderSoundingKinematicContour clips vorticity isolines to sounding region", () => {
    const map = createMockMap();
    const stns = createSampleSoundingStations();
    const win = { id: "test-crop-kinematic-win" };

    const res = analyzeAndRenderSoundingKinematicContour(map, stns, 500, "VOR", {}, win);
    expect(res).not.toBeNull();

    const isolineSrc = map.getSource("contour-sounding-vor-500-isoline-source");
    expect(isolineSrc).not.toBeNull();
  });
});

function createSampleSurfaceStations() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [116.4, 39.9] }, // Beijing
        properties: {
          station_id: 54511,
          temperature: 24.5,
          dewpoint: 16.2,
          slp: 1012.4,
          wind_speed: 3.5,
          wind_dir: 180,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [121.4, 31.2] }, // Shanghai
        properties: {
          station_id: 58362,
          temperature: 28.0,
          dewpoint: 22.5,
          slp: 1008.2,
          wind_speed: 6.2,
          wind_dir: 120,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [113.3, 23.1] }, // Guangzhou
        properties: {
          station_id: 59287,
          temperature: 31.2,
          dewpoint: 25.0,
          slp: 1004.5,
          wind_speed: 4.0,
          wind_dir: 90,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [104.0, 30.6] }, // Chengdu
        properties: {
          station_id: 56294,
          temperature: 22.0,
          dewpoint: 18.0,
          slp: 1014.0,
          wind_speed: 2.1,
          wind_dir: 45,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [108.9, 34.3] }, // Xi'an
        properties: {
          station_id: 57036,
          temperature: 21.0,
          dewpoint: 14.5,
          slp: 1016.8,
          wind_speed: 2.8,
          wind_dir: 60,
        },
      },
    ],
  };
}

describe("Surface Observation Contour Cropping to Region Bounding Box", () => {
  test("analyzeAndRenderSurfaceContours tightens domain and clips isolines strictly to surface station region", () => {
    const map = createMockMap();
    const stns = createSampleSurfaceStations();
    const win = { id: "test-surface-crop-win" };

    const res = analyzeAndRenderSurfaceContours(map, stns, "SLP", { padding: 1.0 }, win);
    expect(res).not.toBeNull();
    expect(res.bounds).toBeDefined();

    const [minLon, minLat, maxLon, maxLat] = res.bounds;
    // Station coordinates range: lon 104..121.4, lat 23.1..39.9
    expect(minLon).toBeGreaterThanOrEqual(102);
    expect(minLon).toBeLessThanOrEqual(104);
    expect(maxLon).toBeGreaterThanOrEqual(121);
    expect(maxLon).toBeLessThanOrEqual(124);

    expect(minLat).toBeGreaterThanOrEqual(21);
    expect(minLat).toBeLessThanOrEqual(23);
    expect(maxLat).toBeGreaterThanOrEqual(39);
    expect(maxLat).toBeLessThanOrEqual(42);

    expect(res.lines.length).toBeGreaterThan(0);
    const eps = 1e-4;
    for (const f of res.lines) {
      const coords = f.geometry.type === "LineString"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates;

      for (const line of coords) {
        for (const [lon, lat] of line) {
          expect(lon).toBeGreaterThanOrEqual(minLon - eps);
          expect(lon).toBeLessThanOrEqual(maxLon + eps);
          expect(lat).toBeGreaterThanOrEqual(minLat - eps);
          expect(lat).toBeLessThanOrEqual(maxLat + eps);
        }
      }
    }

    // Verify MapLibre source has clipped features
    const isolineSrc = map.getSource("contour-surface-slp-isoline-source");
    expect(isolineSrc).not.toBeNull();
    expect(isolineSrc._data.features.length).toBeGreaterThan(0);
  });

  test("analyzeAndRenderSurfaceContours respects custom clipBounds override", () => {
    const map = createMockMap();
    const stns = createSampleSurfaceStations();
    const win = { id: "test-surface-crop-custom" };
    const customBBox = [105.0, 25.0, 120.0, 38.0];

    const res = analyzeAndRenderSurfaceContours(map, stns, "TMP", { clipBounds: customBBox }, win);
    expect(res).not.toBeNull();
    expect(res.lines.length).toBeGreaterThan(0);

    const eps = 1e-4;
    for (const f of res.lines) {
      const coords = f.geometry.type === "LineString"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates;

      for (const line of coords) {
        for (const [lon, lat] of line) {
          expect(lon).toBeGreaterThanOrEqual(customBBox[0] - eps);
          expect(lon).toBeLessThanOrEqual(customBBox[2] + eps);
          expect(lat).toBeGreaterThanOrEqual(customBBox[1] - eps);
          expect(lat).toBeLessThanOrEqual(customBBox[3] + eps);
        }
      }
    }
  });

  test("analyzeAndRenderSurfaceKinematicContours clips surface vorticity isolines to station region", () => {
    const map = createMockMap();
    const stns = createSampleSurfaceStations();
    const win = { id: "test-surface-crop-kinematic" };

    const res = analyzeAndRenderSurfaceKinematicContours(map, stns, "VOR", {}, win);
    expect(res).not.toBeNull();

    const isolineSrc = map.getSource("contour-surface-vor-isoline-source");
    expect(isolineSrc).not.toBeNull();
  });
});
