// stationLayer.js - WMO & NOAA standard 9-point station weather plot model & LoD decluttering
import { getSkyCoverSVG, getWindBarbSVG, getWeatherSymbol, getPressureTendencyGlyph } from "../utils/weatherSymbols.js";
import maplibregl from "maplibre-gl";

let markers = [];
let stationGeoJSON = null;
let stationsVisible = true;
let currentMap = null;
let currentMoveListener = null;

export function renderStationWeatherPlots(map, geojson, visible = true) {
  if (!map || !geojson || !geojson.features) return;
  stationGeoJSON = geojson;
  currentMap = map;
  if (visible !== undefined) stationsVisible = Boolean(visible);

  clearStationMarkers();

  // Create lightweight GeoJSON circle layer for low zooms
  if (map.getSource("station-dot-source")) {
    map.getSource("station-dot-source").setData(geojson);
    if (map.getLayer("station-dots")) {
      map.setLayoutProperty("station-dots", "visibility", stationsVisible && map.getZoom() < 5.5 ? "visible" : "none");
    }
  } else {
    map.addSource("station-dot-source", {
      type: "geojson",
      data: geojson,
    });

    map.addLayer({
      id: "station-dots",
      type: "circle",
      source: "station-dot-source",
      maxzoom: 5.5,
      layout: {
        visibility: stationsVisible && map.getZoom() < 5.5 ? "visible" : "none",
      },
      paint: {
        "circle-radius": 3.5,
        "circle-color": "#388bfd",
        "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff",
      },
    });
  }

  function updateVisibleMarkers() {
    clearStationMarkers();
    if (!stationsVisible) {
      if (map.getLayer("station-dots")) map.setLayoutProperty("station-dots", "visibility", "none");
      return;
    }

    const zoom = map.getZoom();

    // Only render full 9-position station models at zoom >= 5.5
    if (zoom < 5.5) {
      if (map.getLayer("station-dots")) map.setLayoutProperty("station-dots", "visibility", "visible");
      return;
    }

    if (map.getLayer("station-dots")) map.setLayoutProperty("station-dots", "visibility", "none");


    const bounds = map.getBounds();
    const maxVisible = 120; // Viewport collision decluttering threshold
    let renderedCount = 0;

    for (const f of geojson.features) {
      const [lon, lat] = f.geometry.coordinates;
      if (!bounds.contains([lon, lat])) continue;

      const p = f.properties;
      const el = document.createElement("div");
      el.className = "station-plot-marker";
      el.style.position = "absolute";
      el.style.transform = "translate(-50%, -50%)";
      el.style.fontFamily = "'SF Mono', monospace";
      el.style.fontSize = "10px";
      el.style.color = "#ffffff";
      el.style.pointerEvents = "auto";
      el.style.cursor = "pointer";

      // 9-Position Synoptic Station Model Layout
      const tt = p.temperature > -90 ? Math.round(p.temperature) : "";
      const td = p.dewpoint > -90 ? Math.round(p.dewpoint) : "";
      const ppp = p.slp_encoded || "";
      const pDiff = p.press_diff_3h > 0 ? `+${(p.press_diff_3h * 10).toFixed(0)}` : "";
      const pTend = getPressureTendencyGlyph(p.press_tend);
      const ww = getWeatherSymbol(p.weather_code);
      const skySVG = getSkyCoverSVG(p.cloud_cover, 16);
      const barbSVG = getWindBarbSVG(p.wind_speed, p.wind_dir, 32);

      el.innerHTML = `
        <div style="position: relative; width: 44px; height: 44px;">
          <!-- Wind Barb -->
          <div style="position: absolute; top: -14px; left: 6px; pointer-events: none;">
            ${barbSVG}
          </div>
          <!-- Sky Cover Center Circle -->
          <div style="position: absolute; top: 14px; left: 14px;">
            ${skySVG}
          </div>
          <!-- TT: Temperature (Top Left) -->
          <div style="position: absolute; top: 0px; left: -14px; color: #f85149; font-weight: bold;">
            ${tt}
          </div>
          <!-- TdTd: Dewpoint (Bottom Left) -->
          <div style="position: absolute; bottom: 0px; left: -14px; color: #56d364;">
            ${td}
          </div>
          <!-- ww: Present Weather (Middle Left) -->
          <div style="position: absolute; top: 14px; left: -6px; color: #e3b341; font-size: 13px;">
            ${ww}
          </div>
          <!-- PPP: Sea-Level Pressure (Top Right) -->
          <div style="position: absolute; top: 0px; right: -12px; color: #79c0ff; font-weight: bold;">
            ${ppp}
          </div>
          <!-- ppa: 3h Pressure Tendency (Middle Right) -->
          <div style="position: absolute; top: 14px; right: -16px; font-size: 9px; color: #a5d6ff;">
            ${pDiff}${pTend}
          </div>
        </div>
      `;

      el.addEventListener("click", () => {
        window.__SHOW_TOOLTIP__ && window.__SHOW_TOOLTIP__([lon, lat], p);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lon, lat])
        .addTo(map);

      markers.push(marker);
      renderedCount++;
      if (renderedCount >= maxVisible) break;
    }
  }

  updateVisibleMarkers();
  if (currentMoveListener) {
    map.off("moveend", currentMoveListener);
  }
  currentMoveListener = updateVisibleMarkers;
  map.on("moveend", currentMoveListener);
}

export function setStationVisibility(map, visible) {
  stationsVisible = Boolean(visible);
  const targetMap = map || currentMap;
  if (!targetMap) return;

  if (targetMap.getLayer("station-dots")) {
    const shouldShowDots = stationsVisible && targetMap.getZoom() < 5.5;
    targetMap.setLayoutProperty("station-dots", "visibility", shouldShowDots ? "visible" : "none");
  }

  if (!stationsVisible) {
    clearStationMarkers();
  } else {
    updateVisibleMarkers();
  }
}

export function clearStationMarkers() {
  for (const m of markers) {
    m.remove();
  }
  markers = [];
}

// Expose station layer controller for automated testing
window.__STATION_LAYER__ = {
  getVisibleCount: () => markers.length,
  getTotalCount: () => (stationGeoJSON && stationGeoJSON.features ? stationGeoJSON.features.length : 0),
  setVisible: (map, visible) => setStationVisibility(map, visible),
};

