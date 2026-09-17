// memstats.test.js - memStats Utilities (Architecture §8.8 & memStats.js, 1 test)
import { test, expect, describe } from "bun:test";
import { countGeoJSONPoints, estimateHeapMB } from "../../src/utils/memStats.js";

describe("memStats Utilities (Architecture §8.8 & memStats.js)", () => {
  test("countGeoJSONPoints and estimateHeapMB correctly measure LineString and Polygon features", () => {
    const lines = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [[0, 0], [1, 1], [2, 2], [3, 3]],
          },
        },
      ],
    };

    expect(countGeoJSONPoints(lines)).toBe(4);
    expect(estimateHeapMB(lines)).toBeGreaterThan(0);

    const polygons = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
            ],
          },
        },
      ],
    };

    expect(countGeoJSONPoints(polygons)).toBe(5);
    expect(estimateHeapMB(polygons)).toBeGreaterThan(0);
  });
});
