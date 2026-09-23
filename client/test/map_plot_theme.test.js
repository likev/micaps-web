import { describe, test, expect } from "bun:test";
import { THEME_TOKENS, getThemeTokens, getMapTokens, getPlotTokens } from "../src/map/themeTokens.js";
import { BASEMAP_SCHEMES, getBasemapScheme, applyBasemapScheme } from "../src/map/pmtilesLayers.js";
import { extractPressureOrHeight } from "../src/layers/station/stationExtract.js";
import { renderStationPlotToCanvas } from "../src/layers/station/stationPlot.js";
import { getState } from "../src/layers/station/stationState.js";
import { setBasemapScheme, resolveInitialBasemapScheme } from "../src/map/mapInstance.js";

describe("Unified Map and Plot Theme System", () => {
  test("THEME_TOKENS defines complete map and plot tokens for dark, light, and micaps", () => {
    const themeIds = ["dark", "light", "micaps"];

    for (const id of themeIds) {
      const theme = THEME_TOKENS[id];
      expect(theme).toBeDefined();
      expect(theme.id).toBe(id);
      expect(theme.name).toBeDefined();

      // Map tokens
      const map = theme.map;
      expect(map.background).toBeDefined();
      expect(map.fills.world).toBeDefined();
      expect(map.fills.china).toBeDefined();
      expect(map.fills.provinces).toBeDefined();
      expect(map.fills.citys).toBeDefined();
      expect(map.boundaries.china.color).toBeDefined();
      expect(map.boundaries.provinces.color).toBeDefined();
      expect(map.boundaries.city.color).toBeDefined();
      expect(map.boundaries.county.color).toBeDefined();
      expect(map.graticule).toBeDefined();

      // Plot tokens
      const plot = theme.plot;
      expect(plot.halo).toBeDefined();
      expect(plot.haloWidth).toBeGreaterThan(0);
      expect(plot.font).toBeDefined();
      expect(plot.tt.color).toBeDefined();
      expect(plot.td.color).toBeDefined();
      expect(plot.dtd.color).toBeDefined();
      expect(plot.ppp.color).toBeDefined();
      expect(plot.rain.color).toBeDefined();
      expect(plot.tend.color).toBeDefined();
      expect(plot.ww.color).toBeDefined();
      expect(plot.vis.color).toBeDefined();
      expect(plot.wind.color).toBeDefined();
      expect(plot.sky.bg).toBeDefined();
      expect(plot.sky.border).toBeDefined();
      expect(plot.sky.fill).toBeDefined();
      expect(plot.dot.fill).toBeDefined();
      expect(plot.dot.stroke).toBeDefined();
    }
  });

  test("Contrast design: dark themes use dark halos, light theme uses light halo", () => {
    const darkPlot = getPlotTokens("dark");
    const lightPlot = getPlotTokens("light");
    const micapsPlot = getPlotTokens("micaps");

    expect(darkPlot.halo).toContain("0, 0, 0");
    expect(lightPlot.halo).toContain("255, 255, 255");
    expect(micapsPlot.halo).toContain("7, 11, 20");

    // Wind barb colors adapt to theme
    expect(darkPlot.wind.color).toBe("#dee2e6");
    expect(lightPlot.wind.color).toBe("#1c1c1e");
    expect(micapsPlot.wind.color).toBe("#dee2e6");

    // Sky cover glyph colors adapt to theme
    expect(darkPlot.sky.bg).toContain("rgba(8, 9, 13");
    expect(lightPlot.sky.bg).toContain("rgba(255, 252, 248");
  });

  test("Integer formatting for SLP: 1013.2 -> 1013", () => {
    expect(extractPressureOrHeight({ slp: 1013.2 })).toBe("1013");
    expect(extractPressureOrHeight({ slp: 1013.8 })).toBe("1014");
    expect(extractPressureOrHeight({ slp: 998.4 })).toBe("998");
    expect(extractPressureOrHeight({ slp_encoded: "132" })).toBe("1013");
  });

  test("Integer formatting in renderStationPlotToCanvas for Visibility (1.5 -> 2) and Rain6 (3.2 -> 3)", () => {
    const textsDrawn = [];
    const mockCtx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      strokeText: (text) => {},
      fillText: (text, x, y) => {
        textsDrawn.push({ text, x, y, font: mockCtx.font, fillStyle: mockCtx.fillStyle });
      },
    };

    // Properties with decimal visibility (1500m -> 1.5km -> 2km) and decimal rain6 (3.2mm -> 3mm)
    const props = {
      temperature: 22.4,
      dewpoint: 15.6,
      slp: 1013.2,
      visibility: 1500,
      rain_6h: 3.2,
    };

    const cfg = {
      showTemp: true,
      showDewpoint: true,
      showPressure: true,
      showVisibility: true,
      showRain6: true,
      __themeId: "light",
    };

    renderStationPlotToCanvas(mockCtx, props, 100, 100, cfg, 1.0);

    const values = textsDrawn.map((t) => t.text);

    // Temperature rounded to int: 22
    expect(values).toContain("22");
    // Dewpoint rounded to int: 16
    expect(values).toContain("16");
    // SLP rounded to int: 1013
    expect(values).toContain("1013");
    // Visibility rounded from 1.5km to int: 2
    expect(values).toContain("2");
    // Rain 6h rounded from 3.2mm to int: 3
    expect(values).toContain("3");

    // All values must be integer strings (no decimal dots)
    for (const val of values) {
      expect(val).not.toContain(".");
    }
  });

  test("Runtime theme switch updates map and synchronizes station plot theme", () => {
    let styleLoaded = true;
    const paintProperties = {};

    const mockMap = {
      isStyleLoaded: () => styleLoaded,
      getLayer: (id) => true,
      setPaintProperty: (layerId, prop, val) => {
        if (!paintProperties[layerId]) paintProperties[layerId] = {};
        paintProperties[layerId][prop] = val;
      },
      once: (event, cb) => cb(),
    };

    // Initialize state
    const state = getState(mockMap);
    expect(state.config.__themeId).toBe("dark");

    // Switch to light theme
    applyBasemapScheme(mockMap, "light");

    expect(mockMap.__basemapScheme).toBe("light");
    expect(state.config.__themeId).toBe("light");
    expect(paintProperties["background"]["background-color"]).toBe(THEME_TOKENS.light.map.background);

    // Switch to micaps theme
    applyBasemapScheme(mockMap, "micaps");
    expect(mockMap.__basemapScheme).toBe("micaps");
    expect(state.config.__themeId).toBe("micaps");
    expect(paintProperties["background"]["background-color"]).toBe(THEME_TOKENS.micaps.map.background);
  });

  test("Wind barb and sky cover symbols adapt colors according to theme tokens", async () => {
    const { drawWindBarbCanvas, drawSkyCoverCanvas } = await import("../src/layers/station/stationSymbols.js");

    // 1. Wind barb color
    let strokeColor = null;
    const barbCtx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      set strokeStyle(val) { strokeColor = val; },
      get strokeStyle() { return strokeColor; },
      set fillStyle(val) {},
      set lineWidth(val) {},
      set lineCap(val) {},
      set lineJoin(val) {},
    };

    const darkPlot = getPlotTokens("dark");
    const lightPlot = getPlotTokens("light");

    drawWindBarbCanvas(barbCtx, 50, 50, 10, 180, 1.0, darkPlot.wind.color);
    expect(strokeColor).toBe(darkPlot.wind.color);

    drawWindBarbCanvas(barbCtx, 50, 50, 10, 180, 1.0, lightPlot.wind.color);
    expect(strokeColor).toBe(lightPlot.wind.color);

    // 2. Sky cover circle BG and border
    const darkFills = [];
    let circleStroke = null;
    const darkSkyCtx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => { darkFills.push(darkSkyCtx.fillStyle); },
      stroke: () => { circleStroke = darkSkyCtx.strokeStyle; },
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      set fillStyle(val) { this._fill = val; },
      get fillStyle() { return this._fill; },
      set strokeStyle(val) { this._stroke = val; },
      get strokeStyle() { return this._stroke; },
      set lineWidth(val) {},
    };

    drawSkyCoverCanvas(darkSkyCtx, 50, 50, 4, 1.0, darkPlot.sky);
    expect(darkFills).toContain(darkPlot.sky.bg);
    expect(darkFills).toContain(darkPlot.sky.fill);
    expect(circleStroke).toBe(darkPlot.sky.border);

    const lightFills = [];
    let lightStroke = null;
    const lightSkyCtx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => { lightFills.push(lightSkyCtx.fillStyle); },
      stroke: () => { lightStroke = lightSkyCtx.strokeStyle; },
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      set fillStyle(val) { this._fill = val; },
      get fillStyle() { return this._fill; },
      set strokeStyle(val) { this._stroke = val; },
      get strokeStyle() { return this._stroke; },
      set lineWidth(val) {},
    };

    drawSkyCoverCanvas(lightSkyCtx, 50, 50, 4, 1.0, lightPlot.sky);
    expect(lightFills).toContain(lightPlot.sky.bg);
    expect(lightFills).toContain(lightPlot.sky.fill);
    expect(lightStroke).toBe(lightPlot.sky.border);
  });

  test("applyBasemapScheme updates existing isoline label layers for contrast on light theme", () => {
    const paintProperties = {};
    const mockMap = {
      isStyleLoaded: () => true,
      getLayer: () => true,
      getStyle: () => ({
        layers: [
          { id: "background" },
          { id: "isoline-layer" },
          { id: "isoline-label-layer" },
          { id: "TMP-500-isoline-label-layer" },
        ],
      }),
      setPaintProperty: (layerId, prop, val) => {
        if (!paintProperties[layerId]) paintProperties[layerId] = {};
        paintProperties[layerId][prop] = val;
      },
      once: (ev, cb) => cb(),
    };

    // Apply light theme
    applyBasemapScheme(mockMap, "light");
    expect(paintProperties["isoline-label-layer"]["text-color"]).toBe("#1c1c1e");
    expect(paintProperties["isoline-label-layer"]["text-halo-color"]).toBe(THEME_TOKENS.light.plot.halo);
    expect(paintProperties["TMP-500-isoline-label-layer"]["text-color"]).toBe("#1c1c1e");
    expect(paintProperties["TMP-500-isoline-label-layer"]["text-halo-color"]).toBe(THEME_TOKENS.light.plot.halo);

    // Apply dark theme
    applyBasemapScheme(mockMap, "dark");
    expect(paintProperties["isoline-label-layer"]["text-color"]).toBe("#ffffff");
    expect(paintProperties["isoline-label-layer"]["text-halo-color"]).toBe(THEME_TOKENS.dark.plot.halo);
    expect(paintProperties["TMP-500-isoline-label-layer"]["text-color"]).toBe("#ffffff");
    expect(paintProperties["TMP-500-isoline-label-layer"]["text-halo-color"]).toBe(THEME_TOKENS.dark.plot.halo);
  });

  test("Exact plot palette tokens match §3 specifications for all three themes", () => {
    // 1. Dark theme (§3.1.2)
    const dark = THEME_TOKENS.dark.plot;
    expect(dark.halo).toBe("rgba(0, 0, 0, 0.92)");
    expect(dark.haloWidth).toBe(2.5);
    expect(dark.font).toBe("'SF Mono', ui-monospace, monospace");
    expect(dark.tt).toEqual({ color: "#ff6b6b", size: 13, weight: "700" });
    expect(dark.td).toEqual({ color: "#69db7c", size: 13, weight: "700" });
    expect(dark.dtd).toEqual({ color: "#ffa94d", size: 12, weight: "700" });
    expect(dark.ppp).toEqual({ color: "#e0e0e0", size: 13, weight: "700" });
    expect(dark.rain).toEqual({ color: "#74c0fc", size: 12, weight: "700" });
    expect(dark.tend).toEqual({ color: "#a5d8ff", size: 11, weight: "600" });
    expect(dark.ww).toEqual({ color: "#ffd43b", size: 15, weight: "normal" });
    expect(dark.vis).toEqual({ color: "#ffe066", size: 12, weight: "700" });
    expect(dark.wind).toEqual({ color: "#dee2e6" });
    expect(dark.sky).toEqual({ bg: "rgba(8, 9, 13, 0.90)", border: "#dee2e6", fill: "#dee2e6" });
    expect(dark.dot).toEqual({ fill: "#ffd43b", stroke: "rgba(0, 0, 0, 0.6)" });

    // 2. Light theme (§3.2.2)
    const light = THEME_TOKENS.light.plot;
    expect(light.halo).toBe("rgba(255, 255, 255, 0.92)");
    expect(light.haloWidth).toBe(2.5);
    expect(light.font).toBe("'SF Mono', ui-monospace, monospace");
    expect(light.tt).toEqual({ color: "#c92a2a", size: 13, weight: "700" });
    expect(light.td).toEqual({ color: "#2b8a3e", size: 13, weight: "700" });
    expect(light.dtd).toEqual({ color: "#d9480f", size: 12, weight: "700" });
    expect(light.ppp).toEqual({ color: "#1c1c1e", size: 13, weight: "700" });
    expect(light.rain).toEqual({ color: "#1864ab", size: 12, weight: "700" });
    expect(light.tend).toEqual({ color: "#1971c2", size: 11, weight: "600" });
    expect(light.ww).toEqual({ color: "#e67700", size: 15, weight: "normal" });
    expect(light.vis).toEqual({ color: "#e67700", size: 12, weight: "700" });
    expect(light.wind).toEqual({ color: "#1c1c1e" });
    expect(light.sky).toEqual({ bg: "rgba(255, 252, 248, 0.92)", border: "#1c1c1e", fill: "#1c1c1e" });
    expect(light.dot).toEqual({ fill: "#e67700", stroke: "rgba(255, 255, 255, 0.5)" });

    // 3. MICAPS theme (§3.3.2)
    const micaps = THEME_TOKENS.micaps.plot;
    expect(micaps.halo).toBe("rgba(7, 11, 20, 0.92)");
    expect(micaps.haloWidth).toBe(2.5);
    expect(micaps.font).toBe("'SF Mono', ui-monospace, monospace");
    expect(micaps.tt).toEqual({ color: "#ff8787", size: 13, weight: "700" });
    expect(micaps.td).toEqual({ color: "#8ce99a", size: 13, weight: "700" });
    expect(micaps.dtd).toEqual({ color: "#ffc078", size: 12, weight: "700" });
    expect(micaps.ppp).toEqual({ color: "#e0e0e0", size: 13, weight: "700" });
    expect(micaps.rain).toEqual({ color: "#a5d8ff", size: 12, weight: "700" });
    expect(micaps.tend).toEqual({ color: "#d0ebff", size: 11, weight: "600" });
    expect(micaps.ww).toEqual({ color: "#ffd43b", size: 15, weight: "normal" });
    expect(micaps.vis).toEqual({ color: "#ffe066", size: 12, weight: "700" });
    expect(micaps.wind).toEqual({ color: "#dee2e6" });
    expect(micaps.sky).toEqual({ bg: "rgba(7, 11, 20, 0.90)", border: "#dee2e6", fill: "#dee2e6" });
    expect(micaps.dot).toEqual({ fill: "#ffd43b", stroke: "rgba(7, 11, 20, 0.5)" });
  });

  test("resolveInitialBasemapScheme and setBasemapScheme round-trip persistence with micaps", () => {
    const storage = {};
    const origLocalStorage = globalThis.localStorage;
    globalThis.localStorage = {
      getItem: (k) => storage[k] ?? null,
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; },
    };

    try {
      // Default with no storage
      delete storage["micaps-basemap-scheme"];
      expect(resolveInitialBasemapScheme()).toBe("dark");

      // Setting micaps in storage
      storage["micaps-basemap-scheme"] = "micaps";
      expect(resolveInitialBasemapScheme()).toBe("micaps");

      // Setting light in storage
      storage["micaps-basemap-scheme"] = "light";
      expect(resolveInitialBasemapScheme()).toBe("light");

      // setBasemapScheme exercises applyBasemapScheme + storage write
      const mockMap = {
        isStyleLoaded: () => true,
        getLayer: () => false,
        setPaintProperty: () => {},
        once: (ev, cb) => cb(),
      };
      const state = getState(mockMap);

      setBasemapScheme(mockMap, "micaps");
      expect(mockMap.__basemapScheme).toBe("micaps");
      expect(state.config.__themeId).toBe("micaps");
      expect(storage["micaps-basemap-scheme"]).toBe("micaps");
      expect(resolveInitialBasemapScheme()).toBe("micaps");

      setBasemapScheme(mockMap, "dark");
      expect(mockMap.__basemapScheme).toBe("dark");
      expect(state.config.__themeId).toBe("dark");
      expect(storage["micaps-basemap-scheme"]).toBe("dark");
      expect(resolveInitialBasemapScheme()).toBe("dark");
    } finally {
      if (origLocalStorage) {
        globalThis.localStorage = origLocalStorage;
      } else {
        delete globalThis.localStorage;
      }
    }
  });
});
