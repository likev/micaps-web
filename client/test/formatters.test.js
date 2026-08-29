// formatters.test.js - Unit tests for date, time, and meteorological parameter formatting
import { test, expect, describe } from "bun:test";
import {
  formatDateTime,
  formatLeadTime,
  formatCoords,
  formatElementUnit,
  formatObsTimestamp,
  formatForecastInitTime,
  formatForecastValidTime,
} from "../src/utils/formatters.js";

describe("Meteorological Parameter and Date/Time Formatters", () => {
  test("formatDateTime parses ISO date string and outputs formatted BJT string", () => {
    const formatted = formatDateTime("2026-08-28T09:00:00Z");
    expect(formatted).toContain("2026-08-28");
    expect(formatted).toContain("17:00");
  });

  test("formatObsTimestamp parses MICAPS timestamp string (YYYYMMDDHHmm00.000)", () => {
    const formatted = formatObsTimestamp("20260828170000.000");
    expect(formatted).toContain("2026-08-28");
    expect(formatted).toContain("17:00");
  });

  test("formatLeadTime formats forecast lead hours", () => {
    expect(formatLeadTime(24)).toBe("+024h");
    expect(formatLeadTime(0)).toBe("+000h");
  });

  test("formatCoords formats latitude and longitude with direction indicators", () => {
    expect(formatCoords(116.4, 39.9)).toBe("39.90°N, 116.40°E");
    expect(formatCoords(-74.0, -33.8)).toBe("33.80°S, 74.00°W");
  });

  test("formatElementUnit returns correct meteorological units", () => {
    expect(formatElementUnit("TMP")).toBe("°C");
    expect(formatElementUnit("RAIN")).toBe("mm");
    expect(formatElementUnit("HGT")).toBe("gpm");
    expect(formatElementUnit("RH")).toBe("%");
    expect(formatElementUnit("WIND")).toBe("m/s");
  });

  test("formatForecastInitTime and formatForecastValidTime format cycles", () => {
    const init = formatForecastInitTime("2026082812.000");
    expect(init).toContain("2026-08-28");
    expect(init).toContain("12:00");

    const valid = formatForecastValidTime("2026082812.000", 24);
    expect(valid).toContain("2026-08-29");
    expect(valid).toContain("12:00");
    expect(valid).toContain("(+024h)");
  });
});
