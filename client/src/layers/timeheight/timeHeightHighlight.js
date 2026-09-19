// timeHeightHighlight.js - MapLibre GeoJSON active point highlighting for EC Time-Height Profile

const SOURCE_ID = "th-active-point-source";
const HALO_LAYER_ID = "th-active-point-halo";
const CENTER_LAYER_ID = "th-active-point-center";

export function highlightPointOnMap(map, lon, lat) {
  if (!map || typeof map.getSource !== "function") return;

  const featureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: { model: "ECMWF_HR" },
      },
    ],
  };

  const existing = map.getSource(SOURCE_ID);
  if (existing && typeof existing.setData === "function") {
    existing.setData(featureCollection);
  } else {
    map.addSource(SOURCE_ID, { type: "geojson", data: featureCollection });

    map.addLayer({
      id: HALO_LAYER_ID,
      type: "circle",
      source: SOURCE_ID,
      paint: {
        "circle-radius": 14,
        "circle-color": "rgba(31, 111, 235, 0.25)",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#58a6ff",
      },
    });

    map.addLayer({
      id: CENTER_LAYER_ID,
      type: "circle",
      source: SOURCE_ID,
      paint: {
        "circle-radius": 5,
        "circle-color": "#1f6feb",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
  }
}

export function removePointHighlight(map = null) {
  if (!map || typeof map.removeLayer !== "function") return;
  if (map.getLayer(HALO_LAYER_ID)) map.removeLayer(HALO_LAYER_ID);
  if (map.getLayer(CENTER_LAYER_ID)) map.removeLayer(CENTER_LAYER_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

export function setHighlightVisible(map = null, visible = true) {
  if (!map || typeof map.getLayer !== "function") return;
  const val = visible ? "visible" : "none";
  if (map.getLayer(HALO_LAYER_ID)) map.setLayoutProperty(HALO_LAYER_ID, "visibility", val);
  if (map.getLayer(CENTER_LAYER_ID)) map.setLayoutProperty(CENTER_LAYER_ID, "visibility", val);
}
