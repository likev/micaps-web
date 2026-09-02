// graticule.js - Dynamic coordinate graticules and degree labels

export function generateGraticuleGeoJSON(step = 10) {
  const features = [];

  // Parallels (Latitude lines)
  for (let lat = -80; lat <= 80; lat += step) {
    const coords = [];
    for (let lon = -180; lon <= 180; lon += 5) {
      coords.push([lon, lat]);
    }
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: { label: `${Math.abs(lat)}°${lat >= 0 ? "N" : "S"}` },
    });
  }

  // Meridians (Longitude lines)
  for (let lon = -180; lon <= 180; lon += step) {
    const coords = [];
    for (let lat = -80; lat <= 80; lat += 5) {
      coords.push([lon, lat]);
    }
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: { label: `${Math.abs(lon)}°${lon >= 0 ? "E" : "W"}` },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

import { getBasemapScheme } from "./pmtilesLayers.js";

export function addGraticuleLayers(map, schemeName = null) {
  if (map.getSource("graticule-source")) return;

  let graticuleColor = "rgba(255, 255, 255, 0.16)";
  if (schemeName) {
    try { graticuleColor = getBasemapScheme(schemeName).graticule; } catch {}
  } else if (typeof document !== "undefined") {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr) { try { graticuleColor = getBasemapScheme(attr).graticule; } catch {} }
  }

  map.addSource("graticule-source", {
    type: "geojson",
    data: generateGraticuleGeoJSON(10),
  });

  map.addLayer({
    id: "graticule-lines",
    type: "line",
    source: "graticule-source",
    paint: {
      "line-color": graticuleColor,
      "line-width": 0.75,
      "line-dasharray": [4, 4],
    },
  });
}

export function updateGraticuleScheme(map, schemeName) {
  if (!map || !map.getLayer("graticule-lines")) return;
  const scheme = getBasemapScheme(schemeName);
  map.setPaintProperty("graticule-lines", "line-color", scheme.graticule);
}
