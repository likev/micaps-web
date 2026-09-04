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
      config: {
        showTemp: true,
        showDewpoint: true,
        showWind: true,
        showCloud: false,
        showWeather: false,
        showPressure: false,
        showTendency: false,
        showVisibility: false,
        showRain6: false,
        filterField1: "none",
        filterOp1: ">",
        filterVal1: "",
        filterLogic: "none",
        filterField2: "none",
        filterOp2: "<",
        filterVal2: "",
      },
      moveListener: null,
    });
  }
  return mapState.get(map);
}

export function setStationConfig(map, config) {
  if (!map) return;
  const state = getState(map);
  state.config = { ...state.config, ...config };
  updateVisibleMarkersForMap(map);
}

export function renderStationWeatherPlots(map, geojson, visible = true, config = null) {
  if (!map || !geojson || !geojson.features) return;
  lastStationGeoJSON = geojson;
  const state = getState(map);
  state.geojson = geojson;
  if (visible !== undefined) state.visible = Boolean(visible);
  if (config) {
    state.config = { ...state.config, ...config };
  }

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

function extractRawNumber(props, keys, minValid = -Infinity, maxValid = Infinity) {
  if (!props) return null;
  for (const k of keys) {
    const v = props[k];
    if (v !== undefined && v !== null && v !== "" && v !== -9999 && v !== "-9999") {
      const num = typeof v === "number" ? v : parseFloat(v);
      if (!isNaN(num) && num > -9000 && num < 9000) {
        if (num >= minValid && num <= maxValid) {
          return num;
        }
      }
    }
  }
  return null;
}

function extractTemp(props, keys, minValid = -90, maxValid = 90) {
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

export function extractPressureOrHeight(props) {
  if (!props) return "";
  // 1. If upper-air sounding with geopotential height
  if (props.height !== undefined && props.height !== null && props.height !== -9999 && props.height !== "-9999") {
    let num = typeof props.height === "number" ? props.height : parseFloat(props.height);
    if (!isNaN(num) && num > -500 && num < 45000) {
      if (num >= 1000) {
        // Upper-air standard decameters (dam): e.g. 5880 gpm -> 588, 7360 gpm -> 736, 12020 gpm -> 202, 16330 gpm -> 633, 1514 gpm -> 151
        const dam = Math.round(num / 10);
        return String(dam % 1000).padStart(3, "0");
      } else if (num >= 100) {
        // 925hPa / 1000hPa heights (e.g. 811 gpm -> 811, 152 gpm -> 152)
        return String(Math.round(num)).padStart(3, "0");
      } else if (num >= 0) {
        // Decameter fallback if < 100 (e.g. 15.2 dam -> 152 gpm)
        return String(Math.round(num * 10)).padStart(3, "0");
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

function getFieldValue(p, field) {
  switch (field) {
    case "TT":
      return extractTemp(p, ["temperature", "temp", "TEM", "TT", "T", "TMP", "t", "temp_max", "tem"]);
    case "Td":
      return extractTemp(p, ["dewpoint", "dew_point", "DPT", "TD", "Td", "td", "dew", "dpt"]);
    case "Wind": {
      const ws = extractRawNumber(p, ["wind_speed", "windSpeed", "ws", "WIN_S_Avg", "WIN_S", "FF", "ff", "speed"], 0, 150);
      return ws !== null ? (ws > 100 ? ws / 10.0 : ws) : null;
    }
    case "Rain": {
      const r1 = extractRawNumber(p, ["rain_1h", "RAIN_1H", "rain1h", "PRE_1h", "RAIN_1h", "RAIN"]);
      const r6 = extractRawNumber(p, ["rain_6h", "RAIN_6H", "rain6h", "PRE_6h", "RAIN_6h"]);
      const r24 = extractRawNumber(p, ["rain_24h", "RAIN_24H", "rain24h", "PRE_24h", "RAIN_24h"]);
      return Math.max(r1 || 0, r6 || 0, r24 || 0);
    }
    case "Rain6":
    case "Rain6h":
    case "rain_6h": {
      return extractRawNumber(p, ["rain_6h", "RAIN_6H", "rain6h", "PRE_6h", "RAIN_6h"], 0, 1000);
    }
    case "Visibility":
    case "Vis":
    case "VV":
    case "vis": {
      const v = extractRawNumber(p, ["visibility", "VIS", "vis", "VV", "vv", "VIS_Avg", "VIS_Min"], 0, 150000);
      return v !== null ? (v > 150 ? v / 1000.0 : v) : null;
    }
    case "SLP": {
      const slp = extractRawNumber(p, ["slp", "SLP", "press_slp", "PRS_Sea", "press_stn", "stn_press", "PRS"]);
      if (slp !== null && slp > 8000) return slp / 10.0;
      return slp;
    }
    case "Height":
    case "HGT": {
      return extractRawNumber(p, ["height", "HGT", "hgt", "Height", "GH"], -500, 45000);
    }
    default:
      return null;
  }
}

function evaluateSingleRule(p, rule) {
  if (!rule || !rule.field || rule.field === "none") return true;
  const actual = getFieldValue(p, rule.field);
  if (actual === null || isNaN(actual)) return false;

  const op = rule.op || ">";
  const val1 = rule.val !== undefined && rule.val !== null && rule.val !== "" ? Number(rule.val) : null;
  const val2 = rule.val2 !== undefined && rule.val2 !== null && rule.val2 !== "" ? Number(rule.val2) : null;

  if (val1 === null || isNaN(val1)) return true;

  if (op === "between" || op === "BETWEEN" || op === "..") {
    if (val2 === null || isNaN(val2)) return actual >= val1;
    const min = Math.min(val1, val2);
    const max = Math.max(val1, val2);
    return actual >= min && actual <= max;
  }

  switch (op) {
    case ">":
      return actual > val1;
    case ">=":
      return actual >= val1;
    case "<":
      return actual < val1;
    case "<=":
      return actual <= val1;
    case "==":
    case "=":
      return Math.abs(actual - val1) < 0.05;
    case "!=":
      return Math.abs(actual - val1) >= 0.05;
    default:
      return true;
  }
}

export function matchesStationFilters(p, cfg) {
  if (!cfg) return true;

  // 1. Dynamic multi-filter rules array
  if (Array.isArray(cfg.filterRules)) {
    const activeRules = cfg.filterRules.filter(
      (r) => r.field && r.field !== "none" && r.val !== undefined && r.val !== null && r.val !== "" && !isNaN(Number(r.val))
    );
    if (activeRules.length === 0) return true;

    const logic = (cfg.filterLogic || "AND").toUpperCase();
    if (logic === "NONE") {
      return evaluateSingleRule(p, activeRules[0]);
    }
    if (logic === "OR") {
      return activeRules.some((r) => evaluateSingleRule(p, r));
    }
    return activeRules.every((r) => evaluateSingleRule(p, r));
  }

  // 2. Legacy fallback
  const f1 = cfg.filterField1 || "none";
  const op1 = cfg.filterOp1 || ">";
  const val1 = cfg.filterVal1;

  const logic = cfg.filterLogic || "none";

  const f2 = cfg.filterField2 || "none";
  const op2 = cfg.filterOp2 || "<";
  const val2 = cfg.filterVal2;

  const has1 = f1 !== "none" && val1 !== undefined && val1 !== null && val1 !== "" && !isNaN(Number(val1));
  const has2 = f2 !== "none" && val2 !== undefined && val2 !== null && val2 !== "" && !isNaN(Number(val2));

  if (!has1 && !has2) return true;
  if (logic === "none" || !has2) return has1 ? evaluateSingleRule(p, { field: f1, op: op1, val: val1 }) : true;
  if (!has1 && has2) return evaluateSingleRule(p, { field: f2, op: op2, val: val2 });

  const res1 = evaluateSingleRule(p, { field: f1, op: op1, val: val1 });
  const res2 = evaluateSingleRule(p, { field: f2, op: op2, val: val2 });

  if (logic === "OR" || logic === "or") {
    return res1 || res2;
  }
  return res1 && res2;
}

export function updateVisibleMarkersForMap(map) {
  const state = getState(map);
  clearStationMarkersForMap(map);
  if (!state.visible || !state.geojson || !state.geojson.features) return;

  const bounds = map.getBounds();
  const curZoom = map.getZoom();
  const scale = curZoom < 4.5 ? 0.9 : (curZoom < 6.5 ? 1.0 : 1.15);

  // 1. Group in-bounds stations matching filters into 100x100px screen pixel grid bins
  const screenBins = new Map();
  for (const f of state.geojson.features) {
    const [lon, lat] = f.geometry.coordinates;
    if (!isPointInBounds(bounds, lon, lat)) continue;
    if (!matchesStationFilters(f.properties || {}, state.config)) continue;

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
    el.style.fontFamily = "'SF Mono', -apple-system, monospace";
    el.style.fontSize = "13px";
    el.style.color = "#ffffff";
    el.style.pointerEvents = "none";

    // 9-Position Synoptic Station Model Elements
    const rawT = extractTemp(p, ["temperature", "temp", "TEM", "TT", "T", "TMP", "t", "temp_max", "tem"]);
    const tt = rawT !== null ? Math.round(rawT).toString() : "";

    const rawTd = extractTemp(p, ["dewpoint", "dew_point", "DPT", "TD", "Td", "td", "dew", "dpt"]);
    const td = rawTd !== null ? Math.round(rawTd).toString() : "";

    const ppp = extractPressureOrHeight(p);

    const rawWs = extractRawNumber(p, ["wind_speed", "windSpeed", "ws", "WIN_S_Avg", "WIN_S", "FF", "ff", "speed"], 0, 150);
    const ws = rawWs !== null ? (rawWs > 100 ? rawWs / 10.0 : rawWs) : 0;
    const wd = extractRawNumber(p, ["wind_dir", "windDir", "wd", "WIN_D_Avg", "WIN_D", "DD", "dd", "dir"], 0, 360) ?? 0;

    const rawCloud = extractRawNumber(p, ["cloud_cover", "cloudCover", "cloud", "CLO_Cov", "N", "n"], 0, 9);
    const cloudCover = rawCloud !== null ? Math.round(rawCloud) : 0;

    const weatherCode = extractRawNumber(p, ["weather_code", "weatherCode", "weather", "Ww", "ww", "WEA"], 0, 99) || 0;

    const pDiffRaw = extractRawNumber(p, ["press_diff_3h", "pDiff3h", "press_diff", "PRS_Change_3h", "p3"], -500, 500);
    const pDiff = pDiffRaw !== null && Math.abs(pDiffRaw) > 0.05
      ? `${pDiffRaw > 0 ? "+" : ""}${Math.abs(pDiffRaw) > 30 ? Math.round(pDiffRaw) : Math.round(pDiffRaw * 10)}`
      : "";

    const pTendCode = extractRawNumber(p, ["press_tend", "pTend", "PRS_Tendency", "a"], 0, 8);
    const pTend = pTendCode !== null ? getPressureTendencyGlyph(pTendCode) : "";

    const cfg = state.config || {};
    const showTemp = cfg.showTemp !== undefined ? Boolean(cfg.showTemp) : true;
    const showDewpoint = cfg.showDewpoint !== undefined ? Boolean(cfg.showDewpoint) : true;
    const showWind = cfg.showWind !== undefined ? Boolean(cfg.showWind) : true;
    const showCloud = Boolean(cfg.showCloud);
    const showWeather = Boolean(cfg.showWeather);
    const showPressure = Boolean(cfg.showPressure);
    const showTendency = Boolean(cfg.showTendency);
    const showVisibility = Boolean(cfg.showVisibility);
    const showRain6 = Boolean(cfg.showRain6);

    const rawVis = extractRawNumber(p, ["visibility", "VIS", "vis", "VV", "vv", "VIS_Avg", "VIS_Min"], 0, 150000);
    const vis = rawVis !== null ? (rawVis >= 1000 ? (rawVis / 1000).toFixed(rawVis % 1000 === 0 ? 0 : 1) : (rawVis < 10 ? rawVis.toFixed(1) : Math.round(rawVis).toString())) : "";

    const rawRain6 = extractRawNumber(p, ["rain_6h", "RAIN_6H", "rain6h", "PRE_6h", "RAIN_6h"], 0, 1000);
    const rain6 = rawRain6 !== null && rawRain6 > 0 ? (rawRain6 < 10 ? rawRain6.toFixed(1) : Math.round(rawRain6).toString()) : "";

    const ww = getWeatherSymbol(weatherCode);
    const skySVG = getSkyCoverSVG(cloudCover, 16);
    const barbSVG = getWindBarbSVG(ws, wd, 100);

    el.innerHTML = `
      <div style="position: relative; width: 56px; height: 56px; pointer-events: none; transform: scale(${scale}); transform-origin: center center;">
        <!-- Wind Barb / Direction & Speed (Centered at 28, 28) -->
        ${showWind ? `
        <div style="position: absolute; top: -22px; left: -22px; width: 100px; height: 100px; pointer-events: none; z-index: 1;">
          ${barbSVG}
        </div>` : ""}
        <!-- Center Sky Cover Circle (or small station dot if cloud is hidden) -->
        ${showCloud ? `
        <div style="position: absolute; top: 20px; left: 20px; width: 16px; height: 16px; pointer-events: none; z-index: 2;">
          ${skySVG}
        </div>` : `
        <div style="position: absolute; top: 26px; left: 26px; width: 4px; height: 4px; border-radius: 50%; background: #e3b341; pointer-events: none; z-index: 2; box-shadow: 0 0 2px #000;"></div>`}
        <!-- TT: Temperature (°C) Top-Left in Bold Red/Orange -->
        ${showTemp && tt ? `
        <div style="position: absolute; top: 4px; left: 0px; width: 22px; text-align: right; color: #f85149; font-weight: 700; font-size: 13px; text-shadow: 0 0 2px #000; line-height: 1; pointer-events: none;">
          ${tt}
        </div>` : ""}
        <!-- TdTd: Dew Point (°C) Bottom-Left in Emerald Green -->
        ${showDewpoint && td ? `
        <div style="position: absolute; bottom: 4px; left: 0px; width: 22px; text-align: right; color: #56d364; font-weight: 700; font-size: 13px; text-shadow: 0 0 2px #000; line-height: 1; pointer-events: none;">
          ${td}
        </div>` : ""}
        <!-- ww: Present Weather Symbol (Middle Left) -->
        ${showWeather && ww ? `
        <div style="position: absolute; top: 20px; left: -2px; width: 20px; text-align: center; color: #e3b341; font-size: 15px; text-shadow: 0 0 2px #000; line-height: 1; pointer-events: none;">
          ${ww}
        </div>` : ""}
        <!-- VV: Visibility (Far-Left in Golden Yellow) -->
        ${showVisibility && vis ? `
        <div style="position: absolute; top: 20px; left: -26px; width: 24px; text-align: right; color: #ffd33d; font-weight: 700; font-size: 12px; text-shadow: 0 0 2px #000; line-height: 1; pointer-events: none;">
          ${vis}
        </div>` : ""}
        <!-- PPP: Sea-Level Pressure (Top Right in Cyan/Blue) -->
        ${showPressure && ppp ? `
        <div style="position: absolute; top: 4px; left: 34px; width: 26px; text-align: left; color: #79c0ff; font-weight: 700; font-size: 13px; text-shadow: 0 0 2px #000; line-height: 1; pointer-events: none;">
          ${ppp}
        </div>` : ""}
        <!-- R6: 6h Precipitation (Middle Right in Sky Blue) -->
        ${showRain6 && rain6 ? `
        <div style="position: absolute; top: 20px; left: 34px; width: 26px; text-align: left; color: #38bdf8; font-weight: 700; font-size: 12px; text-shadow: 0 0 2px #000; line-height: 1; pointer-events: none;">
          ${rain6}
        </div>` : ""}
        <!-- ppa: 3h Pressure Tendency & Diff (Bottom Right in Light Blue) -->
        ${showTendency && (pDiff || pTend) ? `
        <div style="position: absolute; bottom: 4px; left: 34px; width: 26px; text-align: left; font-size: 11px; font-weight: 600; color: #a5d6ff; text-shadow: 0 0 2px #000; line-height: 1; pointer-events: none;">
          ${pDiff}${pTend}
        </div>` : ""}
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

export function getStationGeoJSON(map = null) {
  if (map && mapState.has(map)) {
    const s = mapState.get(map);
    if (s && s.geojson && s.geojson.features) return s.geojson;
  }
  return lastStationGeoJSON || null;
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
if (typeof window !== "undefined") {
  window.__STATION_LAYER__ = {
    getVisibleCount: () => {
      let total = 0;
      document.querySelectorAll(".station-plot-marker").forEach(() => total++);
      return total;
    },
    getTotalCount: () => {
      if (window.__MAP__) {
        const s = mapState.get(window.__MAP__);
        if (s && s.geojson && s.geojson.features) return s.geojson.features.length;
      }
      return lastStationGeoJSON && lastStationGeoJSON.features ? lastStationGeoJSON.features.length : 0;
    },
    setVisible: (map, visible) => setStationVisibility(map, visible),
  };
}
