// stationLayer.js - WMO & NOAA standard 9-point station weather plot model
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

  if (currentMoveListener) {
    currentMap.off("moveend", currentMoveListener);
  }
  currentMoveListener = updateVisibleMarkers;
  currentMap.on("moveend", currentMoveListener);

  updateVisibleMarkers();
}

export function updateVisibleMarkers() {
  clearStationMarkers();
  if (!stationsVisible || !currentMap || !stationGeoJSON || !stationGeoJSON.features) {
    return;
  }

  const bounds = currentMap.getBounds();
  const maxVisible = 3500; // Plot all stations in the active viewport
  let renderedCount = 0;

  for (const f of stationGeoJSON.features) {
    const [lon, lat] = f.geometry.coordinates;
    if (!bounds.contains([lon, lat])) continue;

    const p = f.properties || {};
    const el = document.createElement("div");
    el.className = "station-plot-marker";
    el.style.position = "absolute";
    el.style.transform = "translate(-50%, -50%)";
    el.style.fontFamily = "'SF Mono', -apple-system, monospace";
    el.style.fontSize = "10px";
    el.style.color = "#ffffff";
    el.style.pointerEvents = "none"; // Don't create info-window or block mouse interactions

    // 9-Position Synoptic Station Model Elements
    const tt = p.temperature !== undefined && p.temperature > -90 ? Math.round(p.temperature) : "";
    const td = p.dewpoint !== undefined && p.dewpoint > -90 ? Math.round(p.dewpoint) : "";
    const ppp = p.slp_encoded || "";
    const pDiff = p.press_diff_3h > 0 ? `+${(p.press_diff_3h * 10).toFixed(0)}` : "";
    const pTend = getPressureTendencyGlyph(p.press_tend);
    const ww = getWeatherSymbol(p.weather_code);
    const skySVG = getSkyCoverSVG(p.cloud_cover !== undefined ? p.cloud_cover : 0, 16);
    const barbSVG = getWindBarbSVG(p.wind_speed || 0, p.wind_dir || 0, 32);

    el.innerHTML = `
      <div style="position: relative; width: 44px; height: 44px; pointer-events: none;">
        <!-- Wind Barb / Direction & Speed Symbol -->
        <div style="position: absolute; top: -14px; left: 6px; pointer-events: none;">
          ${barbSVG}
        </div>
        <!-- Center Sky Cover Circle -->
        <div style="position: absolute; top: 14px; left: 14px; pointer-events: none;">
          ${skySVG}
        </div>
        <!-- TT: Temperature (°C) Top-Left in Bold Red -->
        <div style="position: absolute; top: 0px; left: -14px; color: #f85149; font-weight: bold; font-size: 10px; pointer-events: none;">
          ${tt}
        </div>
        <!-- TdTd: Dew Point (°C) Bottom-Left in Green -->
        <div style="position: absolute; bottom: 0px; left: -14px; color: #56d364; font-weight: 500; font-size: 10px; pointer-events: none;">
          ${td}
        </div>
        <!-- ww: Present Weather Symbol (Middle Left) -->
        <div style="position: absolute; top: 14px; left: -6px; color: #e3b341; font-size: 13px; pointer-events: none;">
          ${ww}
        </div>
        <!-- PPP: Sea-Level Pressure (Top Right) -->
        <div style="position: absolute; top: 0px; right: -12px; color: #79c0ff; font-weight: bold; font-size: 10px; pointer-events: none;">
          ${ppp}
        </div>
        <!-- ppa: 3h Pressure Tendency (Middle Right) -->
        <div style="position: absolute; top: 14px; right: -16px; font-size: 9px; color: #a5d6ff; pointer-events: none;">
          ${pDiff}${pTend}
        </div>
      </div>
    `;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([lon, lat])
      .addTo(currentMap);

    markers.push(marker);
    renderedCount++;
    if (renderedCount >= maxVisible) break;
  }
}

export function setStationVisibility(map, visible) {
  stationsVisible = Boolean(visible);
  if (map) currentMap = map;

  if (!stationsVisible) {
    clearStationMarkers();
  } else {
    updateVisibleMarkers();
  }
}

export function clearStationMarkers() {
  for (let i = 0; i < markers.length; i++) {
    markers[i].remove();
  }
  markers = [];
}

// Expose station layer controller for automated testing
window.__STATION_LAYER__ = {
  getVisibleCount: () => markers.length,
  getTotalCount: () => (stationGeoJSON && stationGeoJSON.features ? stationGeoJSON.features.length : 0),
  setVisible: (map, visible) => setStationVisibility(map, visible),
};


