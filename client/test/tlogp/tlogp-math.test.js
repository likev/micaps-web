// tlogp-math.test.js - Unit tests for Skew-T math and multi-level parcel ascent
import { describe, it, expect } from "bun:test";
import {
  pressureToY,
  yToPressure,
  tempAndPressureToX,
  xAndYToTemp,
  calculateLCL,
  potentialTemperature,
  tempFromPotentialTemperature,
  saturationVaporPressure,
  saturationMixingRatio,
  traceMoistAdiabat,
  computeParcelAscent,
  calculateThermodynamicIndices,
} from "../../src/layers/tlogp/tlogpMath.js";

describe("Skew-T Coordinate Transformations", () => {
  const rect = { x: 50, y: 30, width: 600, height: 500 };

  it("inverts pressure <-> Y coordinate accurately", () => {
    const testPressures = [1000, 925, 850, 700, 500, 300, 200, 100];
    for (const p of testPressures) {
      const y = pressureToY(p, rect);
      const recoveredP = yToPressure(y, rect);
      expect(Math.abs(recoveredP - p)).toBeLessThan(0.01);
    }
  });

  it("inverts temperature <-> X coordinate accurately across multiple pressure levels", () => {
    const testTemps = [-40, -20, 0, 15, 30];
    const testPressures = [1000, 850, 500, 250];

    for (const p of testPressures) {
      const y = pressureToY(p, rect);
      for (const t of testTemps) {
        const x = tempAndPressureToX(t, p, rect);
        const recoveredT = xAndYToTemp(x, y, rect);
        expect(Math.abs(recoveredT - t)).toBeLessThan(0.01);
      }
    }
  });

  it("verifies isotherm skew angle (isotherms tilt up and to the right)", () => {
    const t = 0; // 0°C isotherm
    const xSfc = tempAndPressureToX(t, 1000, rect);
    const x500 = tempAndPressureToX(t, 500, rect);
    const x200 = tempAndPressureToX(t, 200, rect);

    // Higher altitude = smaller pressure = greater X coordinate
    expect(x500).toBeGreaterThan(xSfc);
    expect(x200).toBeGreaterThan(x500);
  });
});

describe("Thermodynamic Formulas & Pseudoadiabats", () => {
  it("computes potential temperature theta and roundtrips", () => {
    const t = 20.0;
    const p = 850.0;
    const theta = potentialTemperature(t, p);
    expect(theta).toBeGreaterThan(t); // 850 hPa theta > T

    const recoveredT = tempFromPotentialTemperature(theta, p);
    expect(Math.abs(recoveredT - t)).toBeLessThan(0.01);
  });

  it("computes saturation vapor pressure and mixing ratio physically", () => {
    const es0 = saturationVaporPressure(0);
    expect(Math.abs(es0 - 6.112)).toBeLessThan(0.1); // ~6.11 hPa at 0°C

    const es20 = saturationVaporPressure(20);
    expect(es20).toBeGreaterThan(20.0); // ~23.4 hPa at 20°C

    const w = saturationMixingRatio(20, 1000);
    expect(w).toBeGreaterThan(14.0);
    expect(w).toBeLessThan(16.0); // ~14.9 g/kg at 20°C, 1000 hPa
  });

  it("computes LCL accurately using Bolton formula", () => {
    const t = 24.0;
    const td = 16.0;
    const p = 1000.0;

    const { pLCL, tLCL } = calculateLCL(t, td, p);
    expect(pLCL).toBeLessThan(p);
    expect(pLCL).toBeGreaterThan(800); // LCL around 880-920 hPa for 8°C depression
    expect(tLCL).toBeLessThan(t);
    expect(tLCL).toBeGreaterThan(td - 5);

    // Saturated parcel: LCL should be at current level
    const sat = calculateLCL(15.0, 15.0, 1000.0);
    expect(sat.pLCL).toBe(1000.0);
    expect(sat.tLCL).toBe(15.0);
  });

  it("traces moist pseudoadiabat with monotonic decrease", () => {
    const adiabat = traceMoistAdiabat(15.0, 900.0, 200.0, -10.0);
    expect(adiabat.length).toBeGreaterThan(5);
    for (let i = 0; i < adiabat.length - 1; i++) {
      expect(adiabat[i].p).toBeGreaterThan(adiabat[i + 1].p);
      expect(adiabat[i].t).toBeGreaterThan(adiabat[i + 1].t);
    }
  });
});

describe("Multi-Level Parcel Ascent (Surface, 925, 850, 700 hPa)", () => {
  // Typical warm season conditionally unstable sounding
  const soundingLevels = [
    { pressure: 1010, height: 10, temp: 28.0, dewPoint: 22.0, windDir: 120, windSpeed: 4 },
    { pressure: 1000, height: 95, temp: 27.2, dewPoint: 21.5, windDir: 130, windSpeed: 5 },
    { pressure: 925, height: 780, temp: 22.5, dewPoint: 19.0, windDir: 150, windSpeed: 8 },
    { pressure: 850, height: 1510, temp: 19.0, dewPoint: 15.5, windDir: 190, windSpeed: 12 },
    { pressure: 700, height: 3120, temp: 10.2, dewPoint: 5.0, windDir: 230, windSpeed: 16 },
    { pressure: 500, height: 5850, temp: -8.5, dewPoint: -18.0, windDir: 260, windSpeed: 24 },
    { pressure: 400, height: 7520, temp: -20.0, dewPoint: -32.0, windDir: 265, windSpeed: 30 },
    { pressure: 300, height: 9580, temp: -35.0, dewPoint: -48.0, windDir: 270, windSpeed: 40 },
    { pressure: 250, height: 10820, temp: -45.0, dewPoint: -58.0, windDir: 270, windSpeed: 48 },
    { pressure: 200, height: 12300, temp: -56.0, dewPoint: -68.0, windDir: 275, windSpeed: 50 },
    { pressure: 150, height: 14100, temp: -62.0, dewPoint: -72.0, windDir: 280, windSpeed: 42 },
    { pressure: 100, height: 16500, temp: -68.0, dewPoint: -75.0, windDir: 280, windSpeed: 25 },
  ];

  it("computes surface-based parcel ascent (SBCAPE & CIN)", () => {
    const res = computeParcelAscent(soundingLevels, "surface");
    expect(res).not.toBeNull();
    expect(res.initialPressure).toBe(1010);
    expect(res.initialTemp).toBe(28.0);
    expect(res.pLCL).toBeLessThan(1010);
    expect(res.pLCL).toBeGreaterThan(850);
    expect(res.cape).toBeGreaterThan(500); // Substantial SBCAPE
    expect(res.indices.kIndex).toBeGreaterThan(25); // Favorable for thunderstorms
    expect(res.indices.totalTotals).toBeGreaterThan(40);
    expect(res.indices.precipitableWater).toBeGreaterThan(20);
  });

  it("computes elevated parcel ascent starting from 925 hPa", () => {
    const res = computeParcelAscent(soundingLevels, "925");
    expect(res).not.toBeNull();
    expect(res.initialPressure).toBe(925);
    expect(res.initialTemp).toBe(22.5);
    expect(res.pLCL).toBeLessThanOrEqual(925);
    // Trajectory starts at 925 hPa
    expect(res.trajectory[0].p).toBe(925);
  });

  it("computes elevated parcel ascent starting from 850 hPa (Low-Level Jet)", () => {
    const res = computeParcelAscent(soundingLevels, "850");
    expect(res).not.toBeNull();
    expect(res.initialPressure).toBe(850);
    expect(res.initialTemp).toBe(19.0);
    expect(res.pLCL).toBeLessThanOrEqual(850);
    expect(res.trajectory[0].p).toBe(850);
  });

  it("computes elevated parcel ascent starting from 700 hPa", () => {
    const res = computeParcelAscent(soundingLevels, "700");
    expect(res).not.toBeNull();
    expect(res.initialPressure).toBe(700);
    expect(res.initialTemp).toBe(10.2);
    expect(res.pLCL).toBeLessThanOrEqual(700);
    expect(res.trajectory[0].p).toBe(700);
  });

  it("computes custom level parcel ascent (e.g. 800 hPa)", () => {
    const res = computeParcelAscent(soundingLevels, "custom", 800);
    expect(res).not.toBeNull();
    expect(res.initialPressure).toBe(800);
    expect(res.trajectory[0].p).toBe(800);
  });
});
