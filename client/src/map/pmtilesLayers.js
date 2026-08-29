// pmtilesLayers.js - MapLibre GL style layers for local China vector tiles (matching likev/local-map)

export function getPMTilesStyle(pmtilesUrl) {
  return {
    version: 8,
    name: "MICAPS-Dark-Basemap",
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
          "background-color": "#0a0d14",
        },
      },
      // --- Level 1: National (z0 - z1) ---
      {
        id: "china-fill",
        type: "fill",
        source: "china-vector",
        "source-layer": "china",
        paint: {
          "fill-color": "#121824",
          "fill-opacity": 0.6,
        },
      },
      // --- Level 2: Province boundaries overview (z2 - z4) ---
      {
        id: "provinces-bg-fill",
        type: "fill",
        source: "china-vector",
        "source-layer": "provinces_boundary",
        paint: {
          "fill-color": "#121824",
          "fill-opacity": 0.6,
        },
      },
      // --- Level 3: Provincial Polygons (z5 - z7) ---
      {
        id: "provinces-fill",
        type: "fill",
        source: "china-vector",
        "source-layer": "provinces",
        paint: {
          "fill-color": "#121824",
          "fill-opacity": 0.6,
        },
      },
      // --- Level 4: City / District Polygons (z8 - z12+) ---
      {
        id: "citys-fill",
        type: "fill",
        source: "china-vector",
        "source-layer": "citys",
        paint: {
          "fill-color": "#121824",
          "fill-opacity": 0.6,
        },
      },
      // --- Boundaries ---
      {
        id: "citys-boundary",
        type: "line",
        source: "china-vector",
        "source-layer": "citys",
        paint: {
          "line-color": "#30363d",
          "line-width": 0.8,
          "line-dasharray": [2, 2],
        },
      },
      {
        id: "provinces-detail-boundary",
        type: "line",
        source: "china-vector",
        "source-layer": "provinces",
        paint: {
          "line-color": "#58a6ff",
          "line-width": 1.0,
          "line-opacity": 0.85,
        },
      },
      {
        id: "provinces-boundary",
        type: "line",
        source: "china-vector",
        "source-layer": "provinces_boundary",
        paint: {
          "line-color": "#4a5568",
          "line-width": 0.8,
          "line-dasharray": [3, 2],
        },
      },
      {
        id: "china-boundary",
        type: "line",
        source: "china-vector",
        "source-layer": "china",
        paint: {
          "line-color": "#79c0ff",
          "line-width": 1.4,
          "line-opacity": 0.9,
        },
      },
    ],
  };
}
