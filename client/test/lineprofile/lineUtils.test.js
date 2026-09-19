// lineUtils.test.js - Pure transect math + validation (shared G1/G2 core)
import { describe, test, expect } from "bun:test";
import {
  haversineKm,
  angularSepDeg,
  buildTransectNodes,
  validateEndpoints,
  clampEndpointsToDomain,
  flipLine,
  decimateStride,
  buildLeads,
  validateNPoints,
  PROFILE_LEVELS,
} from "../../src/layers/lineprofile/lineUtils.js";

describe("lineUtils transect math", () => {
  test("haversine: 1deg latitude ~= 111 km", () => {
    const d = haversineKm(115, 30, 115, 31);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  test("slerp endpoints exact + distKm monotonic + total matches haversine", () => {
    const a = { lon: 115, lat: 28 }, b = { lon: 125, lat: 38 };
    const n = buildTransectNodes(a, b, 41);
    expect(n.lons.length).toBe(41);
    expect(n.lats.length).toBe(41);
    expect(n.lons[0]).toBeCloseTo(115, 3);
    expect(n.lats[0]).toBeCloseTo(28, 3);
    expect(n.lons[40]).toBeCloseTo(125, 3);
    expect(n.lats[40]).toBeCloseTo(38, 3);
    for (let i = 1; i < n.distKm.length; i++) {
      expect(n.distKm[i]).toBeGreaterThanOrEqual(n.distKm[i - 1]);
    }
    expect(n.distKm[0]).toBe(0);
    expect(n.totalKm).toBeCloseTo(haversineKm(115, 28, 125, 38), 4);
    expect(n.distKm[40]).toBeCloseTo(n.totalKm, 4);
  });

  test("validateEndpoints rejects degenerate + non-numeric", () => {
    expect(validateEndpoints({ lon: 115, lat: 28 }, { lon: 115.01, lat: 28.01 }).ok).toBe(false);
    expect(validateEndpoints({ lon: NaN, lat: 28 }, { lon: 125, lat: 38 }).ok).toBe(false);
    expect(validateEndpoints({ lon: 999, lat: 28 }, { lon: 125, lat: 38 }).ok).toBe(false);
    const good = validateEndpoints({ lon: 115, lat: 28 }, { lon: 125, lat: 38 });
    expect(good.ok).toBe(true);
    expect(good.totalKm).toBeGreaterThan(1000);
  });

  test("flipLine is involution", () => {
    const a = { lon: 115, lat: 28 }, b = { lon: 125, lat: 38 };
    const [a1, b1] = flipLine(a, b);
    expect(a1).toEqual(b);
    expect(b1).toEqual(a);
    const [a2, b2] = flipLine(a1, b1);
    expect(a2).toEqual(a);
    expect(b2).toEqual(b);
  });

  test("decimateStride caps cells + clampEndpoints flags", () => {
    expect(decimateStride(41, 10)).toBe(2); // 410 cells > 300
    expect(decimateStride(11, 10)).toBe(1); // 110 cells
    const cl = clampEndpointsToDomain({ lon: 0, lat: 0 }, { lon: 120, lat: 30 });
    expect(cl.clamped).toBe(true);
    expect(cl.outside).toBe(false);
    const out = clampEndpointsToDomain({ lon: -100, lat: -50 }, { lon: -90, lat: -40 });
    expect(out.outside).toBe(true);
  });

  test("buildLeads + validateNPoints guardrails", () => {
    expect(buildLeads(0, 144, 12).length).toBe(13);
    expect(buildLeads(0, 72, 6).length).toBe(13);
    expect(validateNPoints(41).ok).toBe(true);
    expect(validateNPoints(1).ok).toBe(false);
    expect(validateNPoints(200).ok).toBe(false);
    expect(PROFILE_LEVELS).toEqual([1000, 925, 850, 700, 600, 500, 400, 300, 250, 200]);
  });

  test("angularSepDeg threshold ~0.1deg", () => {
    expect(angularSepDeg(115, 28, 115.01, 28.01)).toBeLessThan(0.1);
    expect(angularSepDeg(115, 28, 125, 38)).toBeGreaterThan(0.1);
  });
});
