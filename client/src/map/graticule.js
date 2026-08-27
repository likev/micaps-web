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

export function addGraticuleLayers(map) {
  if (map.getSource("graticule-source")) return;

  map.addSource("graticule-source", {
    type: "geojson",
    data: generateGraticuleGeoJSON(10),
  });

  map.addLayer({
    id: "graticule-lines",
    type: "line",
    source: "graticule-source",
    paint: {
      "line-color": "rgba(255, 255, 255, 0.08)",
      "line-width": 0.5,
      "line-dasharray": [4, 4],
    },
  });
}
