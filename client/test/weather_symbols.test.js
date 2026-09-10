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

  test("getWindBarbSVG generates standard 110-degree angled barbs with 20/4/2 m/s increments", () => {
    // 0 m/s: Calm (< 1.5 m/s)
    const calmSvg = getWindBarbSVG(1.0, 0, 100);
    expect(calmSvg).toContain("<circle");
    expect(calmSvg).not.toContain("<line");

    // 2 m/s: 1 short barb (indented from staff tip)
    const wind2Svg = getWindBarbSVG(2.0, 0, 100);
    expect(wind2Svg).toContain("<line"); // Staff + 1 short barb
    expect(wind2Svg).not.toContain("<polygon");

    // 4 m/s: 1 full barb
    const wind4Svg = getWindBarbSVG(4.0, 90, 100);
    expect(wind4Svg).toContain("<line");

    // 6 m/s: 1 full barb + 1 half barb
    const wind6Svg = getWindBarbSVG(6.0, 180, 100);
    expect(wind6Svg).toContain("<line");

    // 20 m/s: 1 pennant triangle flag
    const wind20Svg = getWindBarbSVG(20.0, 270, 100);
    expect(wind20Svg).toContain("<polygon");

    // 24 m/s: 1 pennant flag + 1 full barb
    const wind24Svg = getWindBarbSVG(24.0, 315, 100);
    expect(wind24Svg).toContain("<polygon");
    expect(wind24Svg).toContain("<line");

    // 40 m/s: 2 pennant flags
    const wind40Svg = getWindBarbSVG(40.0, 0, 100);
    const polygonCount = (wind40Svg.match(/<polygon/g) || []).length;
    expect(polygonCount).toBe(2);
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

  test("generateStationWindGrid correctly constructs 2D U/V grid from station observations", async () => {
    const { generateStationWindGrid } = await import("../src/layers/windLayer.js");

    const mockStations = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { coordinates: [116.4, 39.9] }, properties: { wind_speed: 12.0, wind_dir: 180 } },
        { type: "Feature", geometry: { coordinates: [121.5, 31.2] }, properties: { ws: 8.0, wd: 90 } },
        { type: "Feature", geometry: { coordinates: [113.3, 23.1] }, properties: { u: -5.0, v: 4.0 } },
        { type: "Feature", geometry: { coordinates: [104.1, 30.7] }, properties: { windSpeed: 6.0, windDir: 270 } },
      ],
    };

    const grid = generateStationWindGrid(mockStations);
    expect(grid).not.toBeNull();
    expect(grid.header).toBeDefined();
    expect(grid.header.n_lon).toBeGreaterThan(10);
    expect(grid.header.n_lat).toBeGreaterThan(10);
    expect(grid.u).toBeInstanceOf(Float32Array);
    expect(grid.v).toBeInstanceOf(Float32Array);
    expect(grid.u.length).toBe(grid.header.n_lon * grid.header.n_lat);
  });

  test("extractPressureOrHeight correctly decodes and formats heights across all upper-air levels", async () => {
    const { extractPressureOrHeight } = await import("../src/layers/stationLayer.js");

    // 1000 hPa & 925 hPa
    expect(extractPressureOrHeight({ height: 152 })).toBe("152");
    expect(extractPressureOrHeight({ height: 811 })).toBe("811");

    // 850 hPa, 700 hPa, 500 hPa, 400 hPa, 300 hPa
    expect(extractPressureOrHeight({ height: 1514 })).toBe("151");
    expect(extractPressureOrHeight({ height: 3093 })).toBe("309");
    expect(extractPressureOrHeight({ height: 5710 })).toBe("571");
    expect(extractPressureOrHeight({ height: 7360 })).toBe("736");
    expect(extractPressureOrHeight({ height: 9390 })).toBe("939");

    // 200 hPa & 100 hPa
    expect(extractPressureOrHeight({ height: 12020 })).toBe("202");
    expect(extractPressureOrHeight({ height: 16330 })).toBe("633");
  });

  test("extractPressureOrHeight correctly decodes and formats surface SLP matching info window", async () => {
    const { extractPressureOrHeight } = await import("../src/layers/stationLayer.js");

    // Standard surface sea-level pressure values
    expect(extractPressureOrHeight({ slp: 1021.4 })).toBe("1021.4");
    expect(extractPressureOrHeight({ slp: 1021.0 })).toBe("1021");
    expect(extractPressureOrHeight({ slp: 1020.3 })).toBe("1020.3");
    expect(extractPressureOrHeight({ slp: 998.5 })).toBe("998.5");

    // Decoded from slp_encoded fallback
    expect(extractPressureOrHeight({ slp_encoded: "214" })).toBe("1021.4");
    expect(extractPressureOrHeight({ slp_encoded: "984" })).toBe("998.4");

    // Surface SLP takes precedence over station elevation if elevation is in height property
    expect(extractPressureOrHeight({ slp: 1021.4, height: 335.5 })).toBe("1021.4");

    // Upper-air station with missing slp sentinel correctly falls back to height
    expect(extractPressureOrHeight({ height: 5880, slp: -9999 })).toBe("588");
  });

  test("renderGridWindBarbs draws 20 m/s pennant flags at CMA metric thresholds", async () => {
    const { renderGridWindBarbs } = await import("../src/layers/windLayer.js");

    const fills = [];
    const strokes = [];
    const mockCtx = {
      clearRect: () => {},
      setTransform: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      closePath: () => {},
      fill: () => fills.push(true),
      stroke: () => strokes.push(true),
    };

    const mockCanvas = {
      width: 100,
      height: 100,
      style: {},
      getContext: () => mockCtx,
      remove: () => {},
    };

    const mockContainer = {
      clientWidth: 96,
      clientHeight: 96,
      getBoundingClientRect: () => ({ width: 96, height: 96 }),
      querySelector: () => mockCanvas,
      appendChild: () => {},
    };

    const mockMap = {
      getContainer: () => mockContainer,
      unproject: () => ({ lng: 100, lat: 30 }),
      on: () => {},
      off: () => {},
    };

    // 24 m/s wind: 1 pennant flag (20 m/s) + 1 full barb (4 m/s)
    const gridData = {
      header: {
        n_lon: 2,
        n_lat: 2,
        start_lon: 90,
        end_lon: 110,
        start_lat: 40,
        end_lat: 20,
        d_lon: 20,
        d_lat: -20,
      },
      u: new Float32Array([24, 24, 24, 24]),
      v: new Float32Array([0, 0, 0, 0]),
    };

    renderGridWindBarbs(mockMap, gridData);

    // In a 96x96 canvas with step=48, 4 sample positions (sx=24,72, sy=24,72).
    // With 20 m/s pennant standard: 1 circle fill + 1 triangle pennant fill = 2 fills * 4 = 8 fills.
    expect(fills.length).toBe(8);
    // 1 staff stroke + 1 full barb (4 m/s) stroke = 2 strokes * 4 = 8 strokes.
    expect(strokes.length).toBe(8);
  });
});
