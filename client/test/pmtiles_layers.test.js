import { describe, test, expect } from "bun:test";
import { BASEMAP_SCHEMES, getPMTilesStyle, getBasemapScheme, applyBasemapScheme } from "../src/map/pmtilesLayers.js";
import { resolvePMTilesUrl } from "../src/map/mapInstance.js";

describe("Multi-Tier Vector Basemap (World / China / Province / City / County)", () => {
  test("BASEMAP_SCHEMES defines complete 5-tier styles for dark, light, and micaps", () => {
    const requiredSchemes = ["dark", "light", "micaps"];
    for (const sName of requiredSchemes) {
      const scheme = BASEMAP_SCHEMES[sName];
      expect(scheme).toBeDefined();
      expect(scheme.background).toBeDefined();

      // Fills
      expect(scheme.fills.world).toBeDefined();
      expect(scheme.fills.china).toBeDefined();
      expect(scheme.fills.provinces).toBeDefined();
      expect(scheme.fills.citys).toBeDefined();

      // Boundaries
      expect(scheme.boundaries.world).toBeDefined();
      expect(scheme.boundaries.china).toBeDefined();
      expect(scheme.boundaries.provinces).toBeDefined();
      expect(scheme.boundaries.city).toBeDefined();
      expect(scheme.boundaries.county).toBeDefined();

      // Ensure boundary line widths conform to cartographic hierarchy (China >= Province > City >= County)
      expect(scheme.boundaries.china.width).toBeGreaterThanOrEqual(scheme.boundaries.provinces.width);
      expect(scheme.boundaries.provinces.width).toBeGreaterThan(scheme.boundaries.city.width);
      expect(scheme.boundaries.city.width).toBeGreaterThanOrEqual(scheme.boundaries.county.width);
    }
  });

  test("getPMTilesStyle produces correct MapLibre GL style with Painter's Algorithm layer order", () => {
    const style = getPMTilesStyle("http://localhost:8088/map-china.pmtiles", "dark");
    expect(style.version).toBe(8);
    expect(style.sources["china-vector"]).toBeDefined();
    expect(style.sources["china-vector"].url).toBe("pmtiles://http://localhost:8088/map-china.pmtiles");

    const layerIds = style.layers.map((l) => l.id);

    // Verify all tiers exist
    expect(layerIds).toContain("background");
    expect(layerIds).toContain("world-fill");
    expect(layerIds).toContain("china-fill");
    expect(layerIds).toContain("provinces-fill");
    expect(layerIds).toContain("citys-fill");
    expect(layerIds).toContain("county-fill");
    expect(layerIds).toContain("world-boundary");
    expect(layerIds).toContain("county-boundary");
    expect(layerIds).toContain("citys-boundary");
    expect(layerIds).toContain("provinces-boundary");
    expect(layerIds).toContain("china-boundary");

    // Painter's algorithm order checks:
    // Fills must be below all boundary lines
    const worldFillIdx = layerIds.indexOf("world-fill");
    const chinaFillIdx = layerIds.indexOf("china-fill");
    const provFillIdx = layerIds.indexOf("provinces-fill");
    const cityFillIdx = layerIds.indexOf("citys-fill");

    const worldBndIdx = layerIds.indexOf("world-boundary");
    const countyBndIdx = layerIds.indexOf("county-boundary");
    const cityBndIdx = layerIds.indexOf("citys-boundary");
    const provBndIdx = layerIds.indexOf("provinces-boundary");
    const chinaBndIdx = layerIds.indexOf("china-boundary");

    // All fills drawn before any boundaries
    expect(worldFillIdx).toBeLessThan(worldBndIdx);
    expect(chinaFillIdx).toBeLessThan(worldBndIdx);
    expect(provFillIdx).toBeLessThan(worldBndIdx);
    expect(cityFillIdx).toBeLessThan(worldBndIdx);

    // Boundaries stack from bottom to top: World < County < City < Province < China
    expect(worldBndIdx).toBeLessThan(countyBndIdx);
    expect(countyBndIdx).toBeLessThan(cityBndIdx);
    expect(cityBndIdx).toBeLessThan(provBndIdx);
    expect(provBndIdx).toBeLessThan(chinaBndIdx);
  });

  test("resolvePMTilesUrl resolves URLs and safely handles non-string / empty inputs", () => {
    // Normal cases
    expect(resolvePMTilesUrl("map-china")).toContain("map-china.pmtiles");
    expect(resolvePMTilesUrl("/map-china.pmtiles")).toContain("map-china.pmtiles");
    expect(resolvePMTilesUrl("http://custom-host/tiles.pmtiles")).toBe("http://custom-host/tiles.pmtiles");
    expect(resolvePMTilesUrl("https://tiles.example.com/china.pmtiles")).toBe("https://tiles.example.com/china.pmtiles");

    // Fallback cases for non-string / empty inputs
    expect(resolvePMTilesUrl("")).toContain("map-china.pmtiles");
    expect(resolvePMTilesUrl("   ")).toContain("map-china.pmtiles");
    expect(resolvePMTilesUrl(null)).toContain("map-china.pmtiles");
    expect(resolvePMTilesUrl(undefined)).toContain("map-china.pmtiles");
    expect(resolvePMTilesUrl(123)).toContain("map-china.pmtiles");
    expect(resolvePMTilesUrl({})).toContain("map-china.pmtiles");
  });

  test("applyBasemapScheme updates all boundary, dasharray, and fill layers without throwing", () => {
    const paintProps = {};
    const mockMap = {
      isStyleLoaded: () => true,
      getLayer: (id) => Boolean(id),
      setPaintProperty: (layerId, prop, val) => {
        if (!paintProps[layerId]) paintProps[layerId] = {};
        paintProps[layerId][prop] = val;
      },
    };

    applyBasemapScheme(mockMap, "light");

    expect(paintProps["world-fill"]["fill-color"]).toBe(BASEMAP_SCHEMES.light.fills.world);
    expect(paintProps["world-boundary"]["line-color"]).toBe(BASEMAP_SCHEMES.light.boundaries.world.color);
    expect(paintProps["china-boundary"]["line-color"]).toBe(BASEMAP_SCHEMES.light.boundaries.china.color);
    expect(paintProps["provinces-boundary"]["line-color"]).toBe(BASEMAP_SCHEMES.light.boundaries.provinces.color);
    expect(paintProps["citys-boundary"]["line-color"]).toBe(BASEMAP_SCHEMES.light.boundaries.city.color);
    expect(paintProps["citys-boundary"]["line-dasharray"]).toEqual(BASEMAP_SCHEMES.light.boundaries.city.dasharray);
    expect(paintProps["county-boundary"]["line-color"]).toBe(BASEMAP_SCHEMES.light.boundaries.county.color);
    expect(paintProps["county-boundary"]["line-dasharray"]).toEqual(BASEMAP_SCHEMES.light.boundaries.county.dasharray);
  });

  test("applyBasemapScheme gracefully handles missing layers without errors", () => {
    // Simulate a map where some layers (e.g. world-fill, county-boundary) are absent
    const mockMap = {
      isStyleLoaded: () => true,
      getLayer: (id) => id === "china-boundary" || id === "background",
      setPaintProperty: () => {},
    };

    expect(() => applyBasemapScheme(mockMap, "dark")).not.toThrow();
  });
});
