import { THEME_TOKENS, getMapTokens, getPlotTokens } from "./themeTokens.js";
import { getState } from "../layers/station/stationState.js";
import { updateVisibleMarkersForMap } from "../layers/station/stationCanvas.js";

export const BASEMAP_SCHEMES = {
  dark: THEME_TOKENS.dark.map,
  light: THEME_TOKENS.light.map,
  micaps: THEME_TOKENS.micaps.map,
};

export function getBasemapScheme(name) {
  return getMapTokens(name);
}

export function getPMTilesStyle(pmtilesUrl, schemeName = "dark", projectionType = "mercator") {
  const scheme = getBasemapScheme(schemeName);
  const proj = typeof projectionType === "object" ? (projectionType?.type || "mercator") : (projectionType || "mercator");
  return {
    version: 8,
    name: `MICAPS-${scheme.name}-Basemap`,
    projection: {
      type: proj,
    },
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
      // --- Level 0: World Land Fills (Base land underneath admin layers) ---
      {
        id: "world-fill",
        type: "fill",
        source: "china-vector",
        "source-layer": "world",
        paint: {
          "fill-color": scheme.fills.world,
          "fill-opacity": scheme.fillOpacity,
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
      // --- Level 5: County / District Polygons (z7 - z12+, level=district) ---
      {
        id: "county-fill",
        type: "fill",
        source: "china-vector",
        "source-layer": "citys",
        minzoom: 7,
        filter: ["==", ["get", "level"], "district"],
        paint: {
          "fill-color": scheme.fills.county,
          "fill-opacity": scheme.fillOpacity,
        },
      },
      // --- Boundaries: Painter's Algorithm stack (World < County < City < Province < National) ---
      {
        id: "world-boundary",
        type: "line",
        source: "china-vector",
        "source-layer": "world",
        paint: {
          "line-color": scheme.boundaries.world.color,
          "line-width": scheme.boundaries.world.width,
          "line-opacity": scheme.boundaries.world.opacity,
          ...(scheme.boundaries.world.dasharray ? { "line-dasharray": scheme.boundaries.world.dasharray } : {}),
        },
      },
      {
        id: "county-boundary",
        type: "line",
        source: "china-vector",
        "source-layer": "citys",
        minzoom: 7,
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
    ["world-fill", scheme.fills.world],
    ["china-fill", scheme.fills.china],
    ["provinces-bg-fill", scheme.fills.provincesBoundary || scheme.fills.provinces],
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
    ["world-boundary", scheme.boundaries.world],
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
    if (cfg.dasharray !== undefined) {
      map.setPaintProperty(layerId, "line-dasharray", cfg.dasharray);
    }
  }

  if (map.getLayer("graticule-lines")) {
    map.setPaintProperty("graticule-lines", "line-color", scheme.graticule);
  }

  // Update isoline label layers if present
  try {
    const isLight = scheme.id === "light";
    const plotTokens = getPlotTokens(scheme.id);
    const textColor = isLight ? plotTokens.ppp.color : "#ffffff";
    const style = map.getStyle ? map.getStyle() : null;
    if (style && Array.isArray(style.layers)) {
      for (const lyr of style.layers) {
        if (lyr.id && (lyr.id.endsWith("-isoline-label-layer") || lyr.id === "isoline-label-layer")) {
          map.setPaintProperty(lyr.id, "text-color", textColor);
          map.setPaintProperty(lyr.id, "text-halo-color", plotTokens.halo);
        }
      }
    }
  } catch {}

  map.__basemapScheme = scheme.id;
  try {
    const state = getState(map);
    if (state && state.config) {
      state.config.__themeId = scheme.id;
      updateVisibleMarkersForMap(map);
    }
  } catch {}

  // Persist choice for next load — does NOT touch UI chrome (web client unchanged)
  try { if (typeof localStorage !== "undefined") localStorage.setItem("micaps-basemap-scheme", scheme.id); } catch {}
}
