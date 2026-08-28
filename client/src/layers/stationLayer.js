// stationLayer.js - WMO & NOAA standard 9-point station weather plot model
// Per-map-instance state via WeakMap — safe for multi-tab / 4-split windows
import { getSkyCoverSVG, getWindBarbSVG, getWeatherSymbol, getPressureTendencyGlyph } from "../utils/weatherSymbols.js";
import maplibregl from "maplibre-gl";

// Each map has its own state bucket so multiple maps don't share markers/data
const mapState = new WeakMap();
let lastStationGeoJSON = null;

function getState(map) {
  if (!mapState.has(map)) {
    mapState.set(map, {
      markers: [],
      geojson: null,
      visible: true,
      moveListener: null,
    });
  }
  return mapState.get(map);
}

export function renderStationWeatherPlots(map, geojson, visible = true) {
  if (!map || !geojson || !geojson.features) return;
  lastStationGeoJSON = geojson;
  const state = getState(map);
  state.geojson = geojson;
  if (visible !== undefined) state.visible = Boolean(visible);

  if (state.moveListener) {
    map.off("moveend", state.moveListener);
    map.off("zoomend", state.moveListener);
  }
  state.moveListener = () => updateVisibleMarkersForMap(map);
  map.on("moveend", state.moveListener);
  map.on("zoomend", state.moveListener);

  updateVisibleMarkersForMap(map);
}

function isPointInBounds(bounds, lon, lat) {
  if (!bounds) return true;
  const s = bounds.getSouth();
  const n = bounds.getNorth();
  if (lat < s - 1.5 || lat > n + 1.5) return false;

  const w = bounds.getWest();
  const e = bounds.getEast();
  if (e - w >= 360) return true;

  let normLon = lon;
  while (normLon < w) normLon += 360;
  while (normLon > e) normLon -= 360;

  return normLon >= w && normLon <= e;
}

function extractNumber(props, keys, minValid = -90, maxValid = 90) {
  if (!props) return null;
  for (const k of keys) {
    const v = props[k];
    if (v !== undefined && v !== null && v !== "" && v !== -9999 && v !== "-9999") {
      let num = typeof v === "number" ? v : parseFloat(v);
      if (!isNaN(num) && num > -9000 && num < 9000) {
        if (num > 150 && num < 373.15) {
          num = num - 273.15; // Kelvin to Celsius
        } else if ((num > 60 && num <= 600) || (num < -60 && num >= -600)) {
          num = num / 10.0; // Tenths of °C
        } else if (num > 600 && num <= 6000) {
          num = num / 100.0; // Hundredths of °C
        }
        if (num >= minValid && num <= maxValid) {
          return num;
        }
      }
    }
  }
  return null;
}

function extractPressureOrHeight(props) {
  if (!props) return "";
  // 1. If upper-air sounding with geopotential height
  if (props.height !== undefined && props.height !== null && props.height !== -9999 && props.height !== "-9999") {
    let num = typeof props.height === "number" ? props.height : parseFloat(props.height);
    if (!isNaN(num) && num > 0 && num < 40000) {
      if (num > 1000) {
        // Upper-air standard decameters (dam): e.g. 5880 gpm -> 588, 5674 gpm -> 567, 1480 gpm -> 148
        const dam = Math.round(num / 10);
        return String(dam % 1000).padStart(3, "0");
      } else if (num > 100 && num < 1000) {
        return String(Math.round(num)).padStart(3, "0");
      }
      return Math.round(num).toString();
    }
  }

  // 2. Surface observation with SLP / station pressure
  const keys = ["slp", "SLP", "press_slp", "PRS_Sea", "slp_encoded", "press_stn", "stn_press", "PRS"];
  for (const k of keys) {
    const v = props[k];
    if (v !== undefined && v !== null && v !== "" && v !== "---" && v !== -9999 && v !== "-9999") {
      if (typeof v === "string" && v.length === 3 && !isNaN(parseInt(v, 10))) {
        return v;
      }
      let num = typeof v === "number" ? v : parseFloat(v);
      if (!isNaN(num) && num > 0 && num < 110000) {
        if (num > 8000 && num < 110000) num = num / 100.0;
        else if (num > 8000 && num < 11000) num = num / 10.0;
        if (num >= 800 && num <= 1100) {
          const val = Math.round(num * 10);
          return String(val % 1000).padStart(3, "0");
        }
      }
    }
  }
  return "";
}

// Deterministic pseudorandom hash for stable sampling per station
function hashStation(id, lon, lat) {
  let h = 2166136261;
  const str = `${id || ""}_${lon.toFixed(4)}_${lat.toFixed(4)}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

export function updateVisibleMarkersForMap(map) {
  const state = getState(map);
  clearStationMarkersForMap(map);
  if (!state.visible || !state.geojson || !state.geojson.features) return;

  const bounds = map.getBounds();
  const curZoom = map.getZoom();
  const scale = curZoom < 4.5 ? 0.75 : (curZoom < 6.5 ? 0.88 : 1.0);

  // 1. Group in-bounds stations into 100x100px screen pixel grid bins
  const screenBins = new Map();
  for (const f of state.geojson.features) {
    const [lon, lat] = f.geometry.coordinates;
    if (!isPointInBounds(bounds, lon, lat)) continue;

    const pt = map.project([lon, lat]);
    const binKey = `${Math.floor(pt.x / 100)},${Math.floor(pt.y / 100)}`;
    let list = screenBins.get(binKey);
    if (!list) {
      list = [];
      screenBins.set(binKey, list);
    }
    list.push(f);
  }

  // 2. In each 100x100px screen cell, show at most 5 stations (randomly sampled)
  const selectedFeatures = [];
  for (const list of screenBins.values()) {
    if (list.length <= 5) {
      for (let i = 0; i < list.length; i++) selectedFeatures.push(list[i]);
    } else {
      // Sort by stable pseudorandom hash to pick top 5 without visual jitter
      list.sort((a, b) => {
        const ha = hashStation(a.properties?.station_id, a.geometry.coordinates[0], a.geometry.coordinates[1]);
        const hb = hashStation(b.properties?.station_id, b.geometry.coordinates[0], b.geometry.coordinates[1]);
        return ha - hb;
      });
      for (let i = 0; i < 5; i++) selectedFeatures.push(list[i]);
    }
  }

  // 3. Render markers for the selected features
  for (const f of selectedFeatures) {
    const [lon, lat] = f.geometry.coordinates;
    const p = f.properties || {};
    const el = document.createElement("div");
    el.className = "station-plot-marker";
    el.style.position = "absolute";
    el.style.transform = `translate(-50%, -50%) scale(${scale})`;
    el.style.transformOrigin = "center center";
    el.style.fontFamily = "'SF Mono', -apple-system, monospace";
    el.style.fontSize = "10px";
    el.style.color = "#ffffff";
    el.style.pointerEvents = "none";

    // 9-Position Synoptic Station Model Elements
    const rawT = extractNumber(p, ["temperature", "temp", "TEM", "TT", "T", "TMP", "t", "temp_max", "tem"]);
    const tt = rawT !== null ? Math.round(rawT).toString() : "";

    const rawTd = extractNumber(p, ["dewpoint", "dew_point", "DPT", "TD", "Td", "td", "dew", "dpt"]);
    const td = rawTd !== null ? Math.round(rawTd).toString() : "";

    const ppp = extractPressureOrHeight(p);

    const rawWs = extractNumber(p, ["wind_speed", "windSpeed", "ws", "WIN_S_Avg", "WIN_S", "FF", "ff", "speed"], 0, 150);
    const ws = rawWs !== null ? (rawWs > 100 ? rawWs / 10.0 : rawWs) : 0;
    const wd = extractNumber(p, ["wind_dir", "windDir", "wd", "WIN_D_Avg", "WIN_D", "DD", "dd", "dir"], 0, 360) || 0;

    const rawCloud = extractNumber(p, ["cloud_cover", "cloudCover", "cloud", "CLO_Cov", "N", "n"], 0, 9);
    const cloudCover = rawCloud !== null ? Math.round(rawCloud) : 0;

    const weatherCode = extractNumber(p, ["weather_code", "weatherCode", "weather", "Ww", "ww", "WEA"], 0, 99) || 0;

    const pDiffRaw = extractNumber(p, ["press_diff_3h", "pDiff3h", "press_diff", "PRS_Change_3h", "p3"], -500, 500);
    const pDiff = pDiffRaw !== null && Math.abs(pDiffRaw) > 0.05
      ? `${pDiffRaw > 0 ? "+" : ""}${Math.abs(pDiffRaw) > 30 ? Math.round(pDiffRaw) : Math.round(pDiffRaw * 10)}`
      : "";

    const pTendCode = extractNumber(p, ["press_tend", "pTend", "PRS_Tendency", "a"], 0, 8);
    const pTend = pTendCode !== null ? getPressureTendencyGlyph(pTendCode) : "";

    const ww = getWeatherSymbol(weatherCode);
    const skySVG = getSkyCoverSVG(cloudCover, 16);
    const barbSVG = getWindBarbSVG(ws, wd, 144);

    el.innerHTML = `
      <div style="position: relative; width: 48px; height: 48px; pointer-events: none;">
        <!-- Wind Barb / Direction & Speed (3X Size centered at 24, 24) -->
        <div style="position: absolute; top: -48px; left: -48px; width: 144px; height: 144px; pointer-events: none; z-index: 1;">
          ${barbSVG}
        </div>
        <!-- Center Sky Cover Circle (16x16 at 16, 16) -->
        <div style="position: absolute; top: 16px; left: 16px; width: 16px; height: 16px; pointer-events: none; z-index: 2;">
          ${skySVG}
        </div>
        <!-- TT: Temperature (°C) Top-Left in Bold Red/Orange -->
        <div style="position: absolute; top: 4px; left: 0px; width: 18px; text-align: right; color: #f85149; font-weight: 700; font-size: 11px; text-shadow: 0 0 2px #000; line-height: 1; pointer-events: none;">
          ${tt}
        </div>
        <!-- TdTd: Dew Point (°C) Bottom-Left in Emerald Green -->
        <div style="position: absolute; bottom: 4px; left: 0px; width: 18px; text-align: right; color: #56d364; font-weight: 600; font-size: 11px; text-shadow: 0 0 2px #000; line-height: 1; pointer-events: none;">
          ${td}
        </div>
        <!-- ww: Present Weather Symbol (Middle Left) -->
        <div style="position: absolute; top: 16px; left: -2px; width: 16px; text-align: center; color: #e3b341; font-size: 13px; text-shadow: 0 0 2px #000; line-height: 1; pointer-events: none;">
          ${ww}
        </div>
        <!-- PPP: Sea-Level Pressure (Top Right in Cyan/Blue) -->
        <div style="position: absolute; top: 4px; left: 30px; width: 22px; text-align: left; color: #79c0ff; font-weight: 700; font-size: 11px; text-shadow: 0 0 2px #000; line-height: 1; pointer-events: none;">
          ${ppp}
        </div>
        <!-- ppa: 3h Pressure Tendency & Diff (Bottom Right in Light Blue) -->
        <div style="position: absolute; bottom: 4px; left: 30px; width: 24px; text-align: left; font-size: 9px; font-weight: 500; color: #a5d6ff; text-shadow: 0 0 2px #000; line-height: 1; pointer-events: none;">
          ${pDiff}${pTend}
        </div>
      </div>
    `;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([lon, lat])
      .addTo(map);

    state.markers.push(marker);
  }
}

// Legacy export alias for backward compatibility
export function updateVisibleMarkers() {
  // noop when called without context — per-map listeners call updateVisibleMarkersForMap
}

export function setStationVisibility(map, visible) {
  if (!map) return;
  const state = getState(map);
  state.visible = Boolean(visible);
  if (!state.visible) {
    clearStationMarkersForMap(map);
  } else {
    updateVisibleMarkersForMap(map);
  }
}

export function clearStationMarkersForMap(map) {
  const state = getState(map);
  for (const m of state.markers) m.remove();
  state.markers = [];
}

export function removeStationLayer(map) {
  if (!map) return;
  const state = getState(map);
  clearStationMarkersForMap(map);
  state.geojson = null;
  state.visible = false;
  if (state.moveListener) {
    map.off("moveend", state.moveListener);
    state.moveListener = null;
  }
}

// Expose station layer controller for automated testing (uses active map fallback)
window.__STATION_LAYER__ = {
  getVisibleCount: () => {
    // Count markers from all maps
    let total = 0;
    document.querySelectorAll(".station-plot-marker").forEach(() => total++);
    return total;
  },
  getTotalCount: () => {
    // Try to get from window.__MAP__ state
    if (window.__MAP__) {
      const s = mapState.get(window.__MAP__);
      if (s && s.geojson && s.geojson.features) return s.geojson.features.length;
    }
    return lastStationGeoJSON && lastStationGeoJSON.features ? lastStationGeoJSON.features.length : 0;
  },
  setVisible: (map, visible) => setStationVisibility(map, visible),
};
