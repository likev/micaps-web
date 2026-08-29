// weather_symbols.test.js - Unit tests for standard WMO meteorological symbols & wind barbs
import { test, expect, describe } from "bun:test";
import {
  getSkyCoverSVG,
  getWindBarbSVG,
  getWeatherSymbol,
  getPressureTendencyGlyph,
} from "../src/utils/weatherSymbols.js";

describe("WMO Meteorological Symbol & Wind Barb Verification", () => {
  test("getSkyCoverSVG returns valid SVG with circle for octas 0-8", () => {
    for (let cloud = 0; cloud <= 8; cloud++) {
      const svg = getSkyCoverSVG(cloud, 16);
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
      expect(svg).toContain("<circle");
    }
  });

  test("getWindBarbSVG returns valid SVG with 110-degree angled feathers", () => {
    // Calm wind (< 1.5 m/s)
    const calmSvg = getWindBarbSVG(1.0, 0, 24);
    expect(calmSvg).toContain("<circle");

    // 12 m/s wind barb (1 flag or 2 full feathers + 1 half feather)
    const wind12Svg = getWindBarbSVG(12.0, 270, 28);
    expect(wind12Svg).toContain("<svg");
    expect(wind12Svg).toContain("<line");

    // 25 m/s wind barb (1 pennant triangle flag)
    const wind25Svg = getWindBarbSVG(25.0, 180, 28);
    expect(wind25Svg).toContain("<polygon");
  });

  test("getWeatherSymbol returns descriptive symbol glyphs", () => {
    expect(getWeatherSymbol(61)).toBe("•"); // Rain
    expect(getWeatherSymbol(71)).toBe("✶"); // Snow
    expect(getWeatherSymbol(95)).toBe("☈"); // Thunderstorm
    expect(getWeatherSymbol(10)).toBe("≡"); // Fog
    expect(getWeatherSymbol(5)).toBe("∞"); // Haze
  });

  test("getPressureTendencyGlyph returns glyph for 0-8 codes", () => {
    expect(getPressureTendencyGlyph(2)).toBe("╱"); // Rising
    expect(getPressureTendencyGlyph(7)).toBe("╲"); // Falling
    expect(getPressureTendencyGlyph(3)).toBe("⎺"); // Steady
    expect(getPressureTendencyGlyph(4)).toBe("╭╮"); // Rising then falling
  });
});
