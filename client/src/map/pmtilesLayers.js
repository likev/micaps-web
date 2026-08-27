// pmtilesLayers.js - MapLibre GL style layers for local China vector tiles (matching likev/local-map)

export function getPMTilesStyle(pmtilesUrl) {
  return {
    version: 8,
    name: "MICAPS-Dark-Basemap",
    sources: {
      "china-vector": {
        type: "vector",
        url: `pmtiles://${pmtilesUrl}`,
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
