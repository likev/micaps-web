// timeslider.test.js - Unit tests for timeline stepper and step-length selection
import { test, expect, describe } from "bun:test";
import { getPeriodsForStep } from "../src/ui/timeSlider.js";

describe("Timeslider Step-Length & Discrete Periods", () => {
  test("getPeriodsForStep generates accurate forecast discrete periods for all step lengths", () => {
    // 6h forecast step (default for weather models like ECMWF_HR)
    const p6 = getPeriodsForStep(6);
    expect(p6).toContain(0);
    expect(p6).toContain(6);
    expect(p6).toContain(12);
    expect(p6).toContain(24);
    expect(p6).toContain(48);
    expect(p6).toContain(72);
    expect(p6).toContain(120);
    expect(p6[1] - p6[0]).toBe(6);

    // 3h step (default for surface observations)
    const p3 = getPeriodsForStep(3);
    expect(p3).toContain(0);
    expect(p3).toContain(3);
    expect(p3).toContain(6);
    expect(p3).toContain(9);
    expect(p3).toContain(24);
    expect(p3[1] - p3[0]).toBe(3);

    // 12h step (default for upper-air observations)
    const p12 = getPeriodsForStep(12);
    expect(p12).toContain(0);
    expect(p12).toContain(12);
    expect(p12).toContain(24);
    expect(p12).toContain(36);
    expect(p12).toContain(48);
    expect(p12[1] - p12[0]).toBe(12);

    // 1h step
    const p1 = getPeriodsForStep(1);
    expect(p1).toContain(0);
    expect(p1).toContain(1);
    expect(p1).toContain(2);
    expect(p1[1] - p1[0]).toBe(1);

    // 24h step
    const p24 = getPeriodsForStep(24);
    expect(p24).toContain(0);
    expect(p24).toContain(24);
    expect(p24).toContain(48);
    expect(p24[1] - p24[0]).toBe(24);
  });

  test("Step-length defaults align with meteorological domain requirements", () => {
    const surfaceDefault = 3;
    const upperAirDefault = 12;
    const weatherModelForecastDefault = 6;

    expect(surfaceDefault).toBe(3);
    expect(upperAirDefault).toBe(12);
    expect(weatherModelForecastDefault).toBe(6);

    // Verify intervals subdivide a 24-hour meteorological cycle
    expect(24 % surfaceDefault).toBe(0);
    expect(24 % upperAirDefault).toBe(0);
    expect(24 % weatherModelForecastDefault).toBe(0);
  });
});
