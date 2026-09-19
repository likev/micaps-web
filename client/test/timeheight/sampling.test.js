// sampling.test.js - Unit tests for timeHeightSampling.js
import { describe, test, expect } from "bun:test";
import {
  normalizeScalarHeader,
  isValidScalar,
  createScalarSampler,
  createWindSampler,
  snapToGridNode,
  clampToGridDomain,
} from "../../src/layers/timeheight/timeHeightSampling.js";

describe("Time-Height Sampling & Grid Geometry", () => {
  const mockGrid = {
    header: {
      discriminator: "mdfs",
      data_type: 4,
      model_name: "ECMWF_HR",
      element: "TMP",
      start_lon: 60.0,
      end_lon: 70.0,
      d_lon: 2.0,
      n_lon: 6, // 60, 62, 64, 66, 68, 70
      start_lat: 40.0,
      end_lat: 30.0,
      d_lat: -2.0,
      n_lat: 6, // 40, 38, 36, 34, 32, 30 (North to South)
    },
    x: [60, 62, 64, 66, 68, 70],
    y: [40, 38, 36, 34, 32, 30],
    // 6 x 6 grid: values[j * 6 + i]
    // row 0 (lat 40): 10, 12, 14, 16, 18, 20
    // row 1 (lat 38): 12, 14, 16, 18, 20, 22
    // row 2 (lat 36): 14, 16, 18, 20, 22, 24
    // row 3 (lat 34): 16, 18, 20, 22, 24, 26
    // row 4 (lat 32): 18, 20, 22, 24, 26, 28
    // row 5 (lat 30): 20, 22, 24, 26, 28, 30
    values: [
      10, 12, 14, 16, 18, 20,
      12, 14, 16, 18, 20, 22,
      14, 16, 18, 20, 22, 24,
      16, 18, 20, 22, 24, 26,
      18, 20, 22, 24, 26, 28,
      20, 22, 24, 26, 28, 30,
    ],
  };

  test("normalizeScalarHeader handles N->S grids and bounds correctly", () => {
    const h = normalizeScalarHeader(mockGrid);
    expect(h).not.toBeNull();
    expect(h.nLon).toBe(6);
    expect(h.nLat).toBe(6);
    expect(h.isLatNorthToSouth).toBe(true);
    expect(h.gridWest).toBe(60.0);
    expect(h.gridEast).toBe(70.0);
    expect(h.gridSouth).toBe(30.0);
    expect(h.gridNorth).toBe(40.0);
  });

  test("isValidScalar validates meteorological bounds and sentinels", () => {
    expect(isValidScalar(25, "TMP")).toBe(true);
    expect(isValidScalar(-15, "TMP")).toBe(true);
    expect(isValidScalar(9999, "TMP")).toBe(false);
    expect(isValidScalar(-9999, "TMP")).toBe(false);
    expect(isValidScalar(NaN, "TMP")).toBe(false);
    expect(isValidScalar(null, "TMP")).toBe(false);

    expect(isValidScalar(75, "RH")).toBe(true);
    expect(isValidScalar(0, "RH")).toBe(true);
    expect(isValidScalar(100, "RH")).toBe(true);
    expect(isValidScalar(135, "RH")).toBe(true); // upper-level supersaturation (live reaches 130.9)
    expect(isValidScalar(-10, "RH")).toBe(false);
    expect(isValidScalar(200, "RH")).toBe(false);

    expect(isValidScalar(-50, "VVEL")).toBe(true);
    expect(isValidScalar(20, "VVEL")).toBe(true);
    expect(isValidScalar(99999, "VVEL")).toBe(false);
  });

  test("createScalarSampler computes exact bilinear interpolation on grid node and mid-point", () => {
    const sample = createScalarSampler(mockGrid);

    // Exact node at (60, 40) -> row 0, col 0 -> 10
    expect(sample(60.0, 40.0)).toBeCloseTo(10.0, 4);

    // Exact node at (62, 38) -> row 1, col 1 -> 14
    expect(sample(62.0, 38.0)).toBeCloseTo(14.0, 4);

    // Mid-point between (60, 40) [10] and (62, 40) [12] -> (61, 40) -> 11.0
    expect(sample(61.0, 40.0)).toBeCloseTo(11.0, 4);

    // Cell center of (60,40)[10], (62,40)[12], (60,38)[12], (62,38)[14] -> (61, 39) -> 12.0
    expect(sample(61.0, 39.0)).toBeCloseTo(12.0, 4);

    // Out-of-bounds queries return null
    expect(sample(50.0, 40.0)).toBeNull();
    expect(sample(65.0, 55.0)).toBeNull();
  });

  test("createScalarSampler skips sentinel corners and clamps RH", () => {
    const corruptedGrid = {
      ...mockGrid,
      header: { ...mockGrid.header, element: "RH" },
      values: [...mockGrid.values],
    };
    // Corrupt corner (60, 40) to 9999
    corruptedGrid.values[0] = 9999;

    const sample = createScalarSampler(corruptedGrid);
    // Point close to (62, 38) should still get valid weighted interpolation from remaining corners
    const res = sample(61.8, 38.2);
    expect(res).not.toBeNull();
    expect(res).toBeGreaterThanOrEqual(0);
    expect(res).toBeLessThanOrEqual(100);
  });

  test("snapToGridNode snaps arbitrary coordinates to closest grid node", () => {
    // (60.8, 39.2) should snap to (60, 40) because 60.8 is closer to 60 (dist 0.8 vs 1.2 to 62) and 39.2 closer to 40 (dist 0.8 vs 1.2 to 38)
    const snap1 = snapToGridNode(mockGrid, 60.8, 39.2);
    expect(snap1.i).toBe(0);
    expect(snap1.j).toBe(0);
    expect(snap1.lon).toBe(60.0);
    expect(snap1.lat).toBe(40.0);

    // (65.2, 35.8) should snap to (66, 36) -> i=3, j=2
    const snap2 = snapToGridNode(mockGrid, 65.2, 35.8);
    expect(snap2.i).toBe(3);
    expect(snap2.j).toBe(2);
    expect(snap2.lon).toBe(66.0);
    expect(snap2.lat).toBe(36.0);
  });

  test("clampToGridDomain clamps out-of-domain coordinates to edge", () => {
    const inside = clampToGridDomain(mockGrid, 65.0, 35.0);
    expect(inside.clamped).toBe(false);
    expect(inside.lon).toBe(65.0);
    expect(inside.lat).toBe(35.0);

    const outside = clampToGridDomain(mockGrid, 130.0, 60.0);
    expect(outside.clamped).toBe(true);
    expect(outside.lon).toBe(70.0); // clamped to gridEast
    expect(outside.lat).toBe(40.0); // clamped to gridNorth
  });

  test("createWindSampler interpolates wind vectors and rejects missing components", () => {
    const windGrid = {
      header: { ...mockGrid.header, element: "WIND", data_type: 11 },
      x: mockGrid.x,
      y: mockGrid.y,
      u: mockGrid.values.map((v) => v * 0.5),
      v: mockGrid.values.map((v) => v * 0.8),
    };
    const sampleWind = createWindSampler(windGrid);
    const vec = sampleWind(61.0, 39.0);
    expect(vec).not.toBeNull();
    expect(vec[0]).toBeCloseTo(6.0, 4); // 12 * 0.5
    expect(vec[1]).toBeCloseTo(9.6, 4); // 12 * 0.8
  });
});
