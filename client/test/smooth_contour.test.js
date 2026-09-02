// smooth_contour.test.js - Unit tests for Chaikin curve smoothing & 2D meteorological spatial filtering
import { test, expect, describe } from "bun:test";
import {
  smoothCoordinates,
  isRingClosed,
  smoothGeometry,
  smoothFeatureCollection,
  smoothGrid2D,
} from "../src/utils/smoothContour.js";

describe("Contour Line Smoothing with Chaikin's Algorithm", () => {
  test("isRingClosed detects closed loops", () => {
    expect(isRingClosed([[0, 0], [1, 0], [1, 1], [0, 0]])).toBe(true);
    expect(isRingClosed([[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(false);
    expect(isRingClosed([[0, 0], [1, 1]])).toBe(false);
    expect(isRingClosed(null)).toBe(false);
  });

  test("smoothCoordinates preserves endpoints of open polylines", () => {
    const raw = [
      [0, 0],
      [10, 20],
      [20, 0],
    ];
    const smoothed = smoothCoordinates(raw, 1, 0.25);
    
    // First and last point must exactly match original endpoints
    expect(smoothed[0]).toEqual([0, 0]);
    expect(smoothed[smoothed.length - 1]).toEqual([20, 0]);

    // Segment 0-1 (from [0,0] to [10,20]):
    // Q = 0.75*[0,0] + 0.25*[10,20] = [2.5, 5]
    // R = 0.25*[0,0] + 0.75*[10,20] = [7.5, 15]
    expect(smoothed[1]).toEqual([2.5, 5]);
    expect(smoothed[2]).toEqual([7.5, 15]);

    // 2 iterations produces more points and smoother transition
    const smoothed2 = smoothCoordinates(raw, 2, 0.25);
    expect(smoothed2[0]).toEqual([0, 0]);
    expect(smoothed2[smoothed2.length - 1]).toEqual([20, 0]);
    expect(smoothed2.length).toBeGreaterThan(smoothed.length);
  });

  test("smoothCoordinates maintains closure for closed contour loops", () => {
    const closed = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    const smoothed = smoothCoordinates(closed, 2, 0.25);

    expect(isRingClosed(smoothed)).toBe(true);
    expect(smoothed[0][0]).toBeCloseTo(smoothed[smoothed.length - 1][0], 6);
    expect(smoothed[0][1]).toBeCloseTo(smoothed[smoothed.length - 1][1], 6);
  });

  test("smoothGeometry handles LineString and MultiLineString", () => {
    const lineGeom = {
      type: "LineString",
      coordinates: [[0, 0], [5, 10], [10, 0]],
    };
    const smoothedLine = smoothGeometry(lineGeom, 2);
    expect(smoothedLine.type).toBe("LineString");
    expect(smoothedLine.coordinates.length).toBeGreaterThan(3);

    const multiLineGeom = {
      type: "MultiLineString",
      coordinates: [
        [[0, 0], [5, 10], [10, 0]],
        [[20, 20], [25, 30], [30, 20]],
      ],
    };
    const smoothedMulti = smoothGeometry(multiLineGeom, 2);
    expect(smoothedMulti.type).toBe("MultiLineString");
    expect(smoothedMulti.coordinates.length).toBe(2);
    expect(smoothedMulti.coordinates[0].length).toBeGreaterThan(3);
    expect(smoothedMulti.coordinates[1].length).toBeGreaterThan(3);
  });

  test("smoothFeatureCollection smooths all features in collection", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { value: 5880, isBold: true },
          geometry: {
            type: "LineString",
            coordinates: [[100, 30], [105, 35], [110, 30]],
          },
        },
      ],
    };
    const smoothedFC = smoothFeatureCollection(fc, 2);
    expect(smoothedFC.features.length).toBe(1);
    expect(smoothedFC.features[0].properties.isBold).toBe(true);
    expect(smoothedFC.features[0].geometry.coordinates.length).toBeGreaterThan(3);
  });
});

describe("Meteorological 2D Grid Spatial Filtering (smoothGrid2D)", () => {
  test("smoothGrid2D smooths a 2D matrix reducing high-frequency noise", () => {
    const noisyGrid = [
      [10, 10, 10, 10],
      [10, 50, 10, 10], // Isolated peak at (1,1)
      [10, 10, 10, 10],
      [10, 10, 10, 10],
    ];
    const smoothed = smoothGrid2D(noisyGrid, 1, 0.5);

    // Peak at (1,1) should be reduced, surrounding points elevated
    expect(smoothed[1][1]).toBeLessThan(50);
    expect(smoothed[1][1]).toBeGreaterThan(10);
    expect(smoothed[3][3]).toBe(10); // Far corner unaffected
    expect(smoothed[0][0]).toBeGreaterThan(10); // Diagonal corner received diffusion
  });

  test("smoothGrid2D handles flat 1D array representations", () => {
    const flat = new Float64Array([
      10, 10, 10,
      10, 40, 10,
      10, 10, 10,
    ]);
    const smoothed = smoothGrid2D(flat, 1, 0.5, 3, 3);
    expect(smoothed instanceof Float64Array).toBe(true);
    expect(smoothed[4]).toBeLessThan(40);
    expect(smoothed[4]).toBeGreaterThan(10);
  });

  test("smoothGrid2D preserves NaN / missing value locations", () => {
    const gridWithNaN = [
      [10, 10, 10],
      [10, NaN, 10],
      [10, 10, 10],
    ];
    const smoothed = smoothGrid2D(gridWithNaN, 1, 0.4);
    expect(isNaN(smoothed[1][1])).toBe(true);
    expect(smoothed[0][0]).toBeCloseTo(10, 1);
  });
});
