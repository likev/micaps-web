// pmtilesLayers.js - MapLibre GL style layers for local China vector tiles (matching likev/local-map)
// Supports two beautiful basemap schemes: dark (midnight) and light (daybreak)

export const BASEMAP_SCHEMES = {
  // Professional cartographic schemes optimized for meteorological workstations (MICAPS/ECMWF/NOAA)
  // Ensures zero clash with weather isolines (isobars/isotherms), radar reflectivity, and wind streamfields
  dark: {
    id: "dark",
    name: "Midnight Slate",
    background: "#0a0f19",
    fills: {
      china: "#121927",
      provincesBoundary: "#131b2a",
      provinces: "#151e2f",
      citys: "#182236",
      county: "#182236",
    },
    fillOpacity: 0.85,
    boundaries: {
      china: { color: "#cbd5e1", width: 1.5, opacity: 0.96 },
      provinces: { color: "#94a3b8", width: 1.15, opacity: 0.88 },
      provincesDetail: { color: "#8193aa", width: 1.0, opacity: 0.85 },
      city: { color: "#52657e", width: 0.75, dasharray: [4, 3], opacity: 0.75 },
      county: { color: "#38475c", width: 0.50, dasharray: [2, 3], opacity: 0.58 },
    },
    graticule: "rgba(148, 163, 184, 0.12)",
  },
  light: {
    id: "light",
    name: "Daybreak Neutral",
    background: "#e2e8f0",
    fills: {
      china: "#f8fafc",
      provincesBoundary: "#f4f7fa",
      provinces: "#f1f5f9",
      citys: "#edf2f7",
      county: "#edf2f7",
    },
    fillOpacity: 1.0,
    boundaries: {
      china: { color: "#1e293b", width: 1.5, opacity: 0.95 },
      provinces: { color: "#475569", width: 1.15, opacity: 0.88 },
      provincesDetail: { color: "#556880", width: 1.0, opacity: 0.85 },
      city: { color: "#8092a8", width: 0.75, dasharray: [4, 3], opacity: 0.75 },
      county: { color: "#b0c0d2", width: 0.50, dasharray: [2, 3], opacity: 0.60 },
    },
    graticule: "rgba(71, 85, 105, 0.11)",
  },
  micaps: {
    id: "micaps",
    name: "MICAPS Classic",
    background: "#09111e",
    fills: {
      china: "#0f1b2e",
      provincesBoundary: "#101e33",
      provinces: "#13233c",
      citys: "#162844",
      county: "#162844",
    },
    fillOpacity: 0.85,
    boundaries: {
      china: { color: "#f8fafc", width: 1.6, opacity: 0.98 },
      provinces: { color: "#38bdf8", width: 1.15, opacity: 0.92 },
      provincesDetail: { color: "#38bdf8", width: 1.0, opacity: 0.90 },
      city: { color: "#0284c7", width: 0.75, dasharray: [4, 3], opacity: 0.78 },
      county: { color: "#0369a1", width: 0.50, dasharray: [2, 3], opacity: 0.60 },
    },
    graticule: "rgba(56, 189, 248, 0.12)",
  },
};

export function getBasemapScheme(name) {
  if (!name) return BASEMAP_SCHEMES.dark;
  const key = String(name).toLowerCase();
  return BASEMAP_SCHEMES[key] || BASEMAP_SCHEMES.dark;
}

export function getPMTilesStyle(pmtilesUrl, schemeName = "dark") {
  const scheme = getBasemapScheme(schemeName);
  return {
    version: 8,
    name: `MICAPS-${scheme.name}-Basemap`,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      "china-vector": {
        type: "vector",
        url: `pmtiles://${pmtilesUrl}`,
        minzoom: 0,
        maxzoom: 12,
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: {
          "background-color": scheme.background,
        },
      },
      // --- Level 1: National (z0 - z1) ---
      {
        id: "china-fill",
        type: "fill",
        source: "china-vector",
        "source-layer": "china",
        paint: {
          "fill-color": scheme.fills.china,
          "fill-opacity": scheme.fillOpacity,
        },
      },
      // --- Level 2: Province boundaries overview (z2 - z4) ---
      {
        id: "provinces-bg-fill",
        type: "fill",
        source: "china-vector",
        "source-layer": "provinces_boundary",
        paint: {
          "fill-color": scheme.fills.provincesBoundary,
          "fill-opacity": scheme.fillOpacity,
        },
      },
      // --- Level 3: Provincial Polygons (z5 - z7) ---
      {
        id: "provinces-fill",
        type: "fill",
        source: "china-vector",
        "source-layer": "provinces",
        paint: {
          "fill-color": scheme.fills.provinces,
          "fill-opacity": scheme.fillOpacity,
        },
      },
      // --- Level 4: City Polygons (z8 - z12+, level=city) ---
      {
        id: "citys-fill",
        type: "fill",
        source: "china-vector",
        "source-layer": "citys",
        filter: ["==", ["get", "level"], "city"],
        paint: {
          "fill-color": scheme.fills.citys,
          "fill-opacity": scheme.fillOpacity,
        },
      },
      // --- Level 5: County / District Polygons (z8 - z12+, level=district) ---
      {
        id: "county-fill",
        type: "fill",
        source: "china-vector",
        "source-layer": "citys",
        filter: ["==", ["get", "level"], "district"],
        paint: {
          "fill-color": scheme.fills.county,
          "fill-opacity": scheme.fillOpacity,
        },
      },
      // --- Boundaries: weight/color strictly decreasing country > province > city > county ---
      {
        id: "county-boundary",
        type: "line",
        source: "china-vector",
        "source-layer": "citys",
        filter: ["==", ["get", "level"], "district"],
        paint: {
          "line-color": scheme.boundaries.county.color,
          "line-width": scheme.boundaries.county.width,
          "line-opacity": scheme.boundaries.county.opacity,
          ...(scheme.boundaries.county.dasharray ? { "line-dasharray": scheme.boundaries.county.dasharray } : {}),
        },
      },
      {
        id: "citys-boundary",
        type: "line",
        source: "china-vector",
        "source-layer": "citys",
        filter: ["==", ["get", "level"], "city"],
        paint: {
          "line-color": scheme.boundaries.city.color,
          "line-width": scheme.boundaries.city.width,
          "line-opacity": scheme.boundaries.city.opacity,
          ...(scheme.boundaries.city.dasharray ? { "line-dasharray": scheme.boundaries.city.dasharray } : {}),
        },
      },
      {
        id: "provinces-detail-boundary",
        type: "line",
        source: "china-vector",
        "source-layer": "provinces",
        paint: {
          "line-color": scheme.boundaries.provincesDetail.color,
          "line-width": scheme.boundaries.provincesDetail.width,
          "line-opacity": scheme.boundaries.provincesDetail.opacity,
        },
      },
      {
        id: "provinces-boundary",
        type: "line",
        source: "china-vector",
        "source-layer": "provinces_boundary",
        paint: {
          "line-color": scheme.boundaries.provinces.color,
          "line-width": scheme.boundaries.provinces.width,
          "line-opacity": scheme.boundaries.provinces.opacity,
          ...(scheme.boundaries.provinces.dasharray ? { "line-dasharray": scheme.boundaries.provinces.dasharray } : {}),
        },
      },
      {
        id: "china-boundary",
        type: "line",
        source: "china-vector",
        "source-layer": "china",
        paint: {
          "line-color": scheme.boundaries.china.color,
          "line-width": scheme.boundaries.china.width,
          "line-opacity": scheme.boundaries.china.opacity,
        },
      },
    ],
  };
}

export function applyBasemapScheme(map, schemeName) {
  if (!map || !map.isStyleLoaded()) return;
  const scheme = getBasemapScheme(schemeName);

  if (map.getLayer("background")) {
    map.setPaintProperty("background", "background-color", scheme.background);
  }

  const fillUpdates = [
    ["china-fill", scheme.fills.china],
    ["provinces-bg-fill", scheme.fills.provincesBoundary],
    ["provinces-fill", scheme.fills.provinces],
    ["citys-fill", scheme.fills.citys],
    ["county-fill", scheme.fills.county],
  ];
  for (const [layerId, color] of fillUpdates) {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, "fill-color", color);
      map.setPaintProperty(layerId, "fill-opacity", scheme.fillOpacity);
    }
  }

  const lineUpdates = [
    ["county-boundary", scheme.boundaries.county],
    ["citys-boundary", scheme.boundaries.city],
    ["provinces-detail-boundary", scheme.boundaries.provincesDetail],
    ["provinces-boundary", scheme.boundaries.provinces],
    ["china-boundary", scheme.boundaries.china],
  ];
  for (const [layerId, cfg] of lineUpdates) {
    if (!map.getLayer(layerId)) continue;
    map.setPaintProperty(layerId, "line-color", cfg.color);
    map.setPaintProperty(layerId, "line-width", cfg.width);
    if (cfg.opacity !== undefined) map.setPaintProperty(layerId, "line-opacity", cfg.opacity);
  }

  if (map.getLayer("graticule-lines")) {
    map.setPaintProperty("graticule-lines", "line-color", scheme.graticule);
  }

  // Persist choice for next load — does NOT touch UI chrome (web client unchanged)
  try { if (typeof localStorage !== "undefined") localStorage.setItem("micaps-basemap-scheme", scheme.id); } catch {}
}
