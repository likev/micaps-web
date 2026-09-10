// stationLayer.js - WMO & NOAA standard 9-point station weather plot model
// Direct HTML5 Canvas 2D Overlay with 60 FPS performance, Zero DOM markers, and Per-map WeakMap isolation
import { getWeatherSymbol, getPressureTendencyGlyph } from "../utils/weatherSymbols.js";

// Safe requestAnimationFrame / cancelAnimationFrame
const reqAnim = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
const cancelAnim = typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : (id) => clearTimeout(id);

// Each map has its own state bucket so multiple maps don't share canvas/data
const mapState = new WeakMap();
let lastStationGeoJSON = null;

function getState(map) {
  if (!mapState.has(map)) {
    mapState.set(map, {
      canvas: null,
      ctx: null,
      animId: null,
      hoverAnimId: null,
      lastHoverEvent: null,
      activeBins: new Map(),
      currentScale: 1.0,
      geojson: null,
      visible: true,
      activeVisibleStations: [],
      renderedCount: 0,
      config: {
        showTemp: true,
        showDewpoint: true,
        showWind: true,
        showDTD: false,
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
      mouseMoveListener: null,
      mouseOutListener: null,
    });
  }
  return mapState.get(map);
}

export function setStationConfig(map, config) {
  if (!map || !config) return;
  const state = getState(map);
  let changed = false;
  for (const k of Object.keys(config)) {
    if (state.config[k] !== config[k]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  state.config = { ...state.config, ...config };
  updateVisibleMarkersForMap(map);
}

export function ensureStationCanvas(map) {
  if (!map || typeof map.getContainer !== "function") return null;
  const container = map.getContainer();
  if (!container) return null;
  const state = getState(map);
  let canvas = container.querySelector ? container.querySelector(".station-plot-canvas") : null;
  if (!canvas && typeof document !== "undefined" && typeof document.createElement === "function") {
    canvas = document.createElement("canvas");
    canvas.className = "station-plot-canvas";
    if (canvas.style) {
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = "410";
    }
    if (container.appendChild) {
      container.appendChild(canvas);
    }
  }
  if (canvas) {
    state.canvas = canvas;
    if (typeof canvas.getContext === "function") {
      state.ctx = canvas.getContext("2d");
    }
  }
  return canvas;
}

export function getStationCanvas(map) {
  if (!map) return null;
  return getState(map).canvas || null;
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

  ensureStationCanvas(map);

  if (state.moveListener && typeof map.off === "function") {
    map.off("move", state.moveListener);
    map.off("zoom", state.moveListener);
    map.off("resize", state.moveListener);
    map.off("moveend", state.moveListener);
    map.off("zoomend", state.moveListener);
  }

  const scheduleDraw = () => {
    if (state.animId) cancelAnim(state.animId);
    state.animId = reqAnim(() => {
      state.animId = null;
      updateVisibleMarkersForMap(map);
    });
  };

  state.moveListener = scheduleDraw;
  if (typeof map.on === "function") {
    map.on("move", scheduleDraw);
    map.on("zoom", scheduleDraw);
    map.on("resize", scheduleDraw);
    map.on("moveend", scheduleDraw);
    map.on("zoomend", scheduleDraw);

    // Mouse hover listener for instant tooltip inspection
    if (!state.mouseMoveListener) {
      state.mouseMoveListener = (e) => onStationMouseMove(map, e);
      state.mouseOutListener = () => handleStationMouseOut(map);
      map.on("mousemove", state.mouseMoveListener);
      map.on("mouseout", state.mouseOutListener);
    }
  }

  updateVisibleMarkersForMap(map);
}

function onStationMouseMove(map, e) {
  const state = getState(map);
  if (!state.visible || !state.activeVisibleStations || state.activeVisibleStations.length === 0) return;
  state.lastHoverEvent = e;

  if (typeof requestAnimationFrame === "function") {
    if (state.hoverAnimId) return;
    state.hoverAnimId = requestAnimationFrame(() => {
      state.hoverAnimId = null;
      if (state.lastHoverEvent) {
        handleStationHover(map, state.lastHoverEvent);
      }
    });
  } else {
    // Immediate execution in headless / test environments without native window.rAF
    handleStationHover(map, e);
  }
}

function handleStationHover(map, e) {
  const state = getState(map);
  if (!state.visible || !state.activeVisibleStations || state.activeVisibleStations.length === 0) return;
  if (!e || !e.point) return;

  const px = e.point.x;
  const py = e.point.y;
  const scale = state.currentScale || 1.0;
  const minDist = 22 * scale; // Hit radius scales with zoom
  let closestDistSq = minDist * minDist;
  let hovered = null;

  // 1. Fast O(1) coarse bin lookup using 100x100px screen cells
  if (state.activeBins && state.activeBins.size > 0) {
    const minBx = Math.floor((px - minDist) / 100);
    const maxBx = Math.floor((px + minDist) / 100);
    const minBy = Math.floor((py - minDist) / 100);
    const maxBy = Math.floor((py + minDist) / 100);

    for (let bx = minBx; bx <= maxBx; bx++) {
      for (let by = minBy; by <= maxBy; by++) {
        const bin = state.activeBins.get(`${bx},${by}`);
        if (!bin) continue;
        for (let i = 0; i < bin.length; i++) {
          const s = bin[i];
          const dx = s.pt.x - px;
          const dy = s.pt.y - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < closestDistSq) {
            closestDistSq = d2;
            hovered = s;
          }
        }
      }
    }
  } else {
    for (const s of state.activeVisibleStations) {
      const dx = s.pt.x - px;
      const dy = s.pt.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < closestDistSq) {
        closestDistSq = d2;
        hovered = s;
      }
    }
  }

  const targetGlobal = typeof window !== "undefined" ? window : globalThis;
  if (hovered) {
    if (map.getCanvas && map.getCanvas()) {
      map.getCanvas().style.cursor = "pointer";
    }
    if (typeof targetGlobal.__SHOW_TOOLTIP__ === "function") {
      targetGlobal.__SHOW_TOOLTIP__([hovered.lon, hovered.lat], hovered.feature.properties, { x: px, y: py });
    }
  } else {
    if (map.getCanvas && map.getCanvas()) {
      map.getCanvas().style.cursor = "";
    }
    if (typeof targetGlobal.__HIDE_TOOLTIP__ === "function") {
      targetGlobal.__HIDE_TOOLTIP__();
    }
  }
}

function handleStationMouseOut(map) {
  const state = getState(map);
  if (state.hoverAnimId && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(state.hoverAnimId);
    state.hoverAnimId = null;
  }
  state.lastHoverEvent = null;

  if (map.getCanvas && map.getCanvas()) {
    map.getCanvas().style.cursor = "";
  }
  const targetGlobal = typeof window !== "undefined" ? window : globalThis;
  if (typeof targetGlobal.__HIDE_TOOLTIP__ === "function") {
    targetGlobal.__HIDE_TOOLTIP__();
  }
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

  // 1. Surface observation with SLP / station pressure (prioritized when valid sea-level pressure exists)
  const keys = ["slp", "SLP", "press_slp", "PRS_Sea", "press_stn", "stn_press", "PRS", "slp_encoded"];
  for (const k of keys) {
    const v = props[k];
    if (v !== undefined && v !== null && v !== "" && v !== "---" && v !== -9999 && v !== "-9999") {
      if (typeof v === "string" && v.length === 3 && !isNaN(parseInt(v, 10))) {
        const enc = parseInt(v, 10);
        const dec = enc <= 600 ? enc / 10.0 + 1000.0 : enc / 10.0 + 900.0;
        const rounded = Math.round(dec * 10) / 10;
        return rounded.toString();
      }
      let num = typeof v === "number" ? v : parseFloat(v);
      if (!isNaN(num) && num > 0 && num < 110000) {
        if (num > 8000 && num < 110000) num = num / 100.0;
        else if (num > 8000 && num < 11000) num = num / 10.0;
        if (num >= 800 && num <= 1100) {
          const rounded = Math.round(num * 10) / 10;
          return rounded.toString();
        }
      }
    }
  }

  // 2. Upper-air sounding with geopotential height (when no valid SLP is reported)
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

export function getFieldValue(p, field) {
  switch (field) {
    case "TT":
      return extractTemp(p, ["temperature", "temp", "TEM", "TT", "T", "TMP", "t", "temp_max", "tem"]);
    case "Td":
      return extractTemp(p, ["dewpoint", "dew_point", "DPT", "TD", "Td", "td", "dew", "dpt"]);
    case "DTD": {
      const t = extractTemp(p, ["temperature", "temp", "TEM", "TT", "T", "TMP", "t", "temp_max", "tem"]);
      const td = extractTemp(p, ["dewpoint", "dew_point", "DPT", "TD", "Td", "td", "dew", "dpt"]);
      if (t === null || td === null) return null;
      if (td > 50) return null;
      if (td > t + 0.5) return null;
      let dtd = t - td;
      if (dtd < 0) dtd = 0;
      if (dtd > 45) return null;
      return dtd;
    }
    case "Wind": {
      const ws = extractRawNumber(p, ["wind_speed", "windSpeed", "ws", "WIN_S_Avg", "WIN_S", "FF", "ff", "speed"], 0, 150);
      return ws !== null ? (ws > 100 ? ws / 10.0 : ws) : null;
    }
    case "Rain": {
      const r1 = extractRawNumber(p, ["rain_1h", "RAIN_1H", "rain1h", "PRE_1h", "RAIN_1h", "RAIN"]);
      const r3 = extractRawNumber(p, ["rain_3h", "RAIN_3H", "rain3h", "PRE_3h", "RAIN_3h"]);
      const r6 = extractRawNumber(p, ["rain_6h", "RAIN_6H", "rain6h", "PRE_6h", "RAIN_6h"]);
      const r12 = extractRawNumber(p, ["rain_12h", "RAIN_12H", "rain12h", "PRE_12h", "RAIN_12h"]);
      const r24 = extractRawNumber(p, ["rain_24h", "RAIN_24H", "rain24h", "PRE_24h", "RAIN_24h"]);
      const rGen = extractRawNumber(p, ["rain", "RAIN"]);
      return Math.max(r1 || 0, r3 || 0, r6 || 0, r12 || 0, r24 || 0, rGen || 0);
    }
    case "Rain6":
    case "Rain6h":
    case "rain_6h": {
      return extractRawNumber(p, ["rain_6h", "RAIN_6H", "rain6h", "PRE_6h", "RAIN_6h", "rain_3h", "rain_1h", "rain_12h", "rain_24h", "rain"], 0, 1000);
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
  if (logic === "none" || !has2) return has1 ? evaluateSingleRule(p, { field: f1, op: op1, val: val1, val2: cfg.filterVal1_2 ?? cfg.filterVal2 }) : true;
  if (!has1 && has2) return evaluateSingleRule(p, { field: f2, op: op2, val: val2, val2: cfg.filterVal2_2 });

  const res1 = evaluateSingleRule(p, { field: f1, op: op1, val: val1, val2: cfg.filterVal1_2 ?? cfg.filterVal2 });
  const res2 = evaluateSingleRule(p, { field: f2, op: op2, val: val2, val2: cfg.filterVal2_2 });

  if (logic === "OR" || logic === "or") {
    return res1 || res2;
  }
  return res1 && res2;
}

// ----------------------------------------------------------------------------
// Direct Canvas 2D Overlay Rendering Methods
// ----------------------------------------------------------------------------

export function drawWindBarbCanvas(ctx, cx, cy, speed, dir, scale = 1.0) {
  if (speed < 1.5) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 10 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = "#58a6ff";
    ctx.lineWidth = 1.3 * scale;
    if (typeof ctx.setLineDash === "function") {
      ctx.setLineDash([2.5 * scale, 2.5 * scale]);
    }
    ctx.stroke();
    if (typeof ctx.setLineDash === "function") {
      ctx.setLineDash([]);
    }
    ctx.restore();
    return;
  }

  const skyRadius = 8 * scale;
  const staffLength = 41 * scale;
  const angleRad = ((dir - 90) * Math.PI) / 180;
  const xStart = cx + skyRadius * Math.cos(angleRad);
  const yStart = cy + skyRadius * Math.sin(angleRad);
  const xEnd = cx + staffLength * Math.cos(angleRad);
  const yEnd = cy + staffLength * Math.sin(angleRad);
  const barbAngle = angleRad + ((70 * Math.PI) / 180);

  ctx.save();
  ctx.strokeStyle = "#58a6ff";
  ctx.fillStyle = "#58a6ff";
  ctx.lineWidth = 2.2 * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "miter";

  // Staff line
  ctx.beginPath();
  ctx.moveTo(xStart, yStart);
  ctx.lineTo(xEnd, yEnd);
  ctx.stroke();

  let remSpeed = Math.round(speed);
  let pos = staffLength;

  // 1. Pennant flag (20 m/s pennants - CMA / GB/T 35663 standard)
  while (remSpeed >= 18) {
    const pX = cx + pos * Math.cos(angleRad);
    const pY = cy + pos * Math.sin(angleRad);
    const fX = pX + 17 * scale * Math.cos(barbAngle);
    const fY = pY + 17 * scale * Math.sin(barbAngle);
    const posNext = pos - 10 * scale;
    const pX2 = cx + posNext * Math.cos(angleRad);
    const pY2 = cy + posNext * Math.sin(angleRad);
    ctx.beginPath();
    ctx.moveTo(pX, pY);
    ctx.lineTo(fX, fY);
    ctx.lineTo(pX2, pY2);
    ctx.closePath();
    ctx.fill();
    pos -= 11 * scale;
    remSpeed -= 20;
  }

  // 2. Full barb / long feather (4 m/s full barb)
  while (remSpeed >= 3.5) {
    const pX = cx + pos * Math.cos(angleRad);
    const pY = cy + pos * Math.sin(angleRad);
    const bX = pX + 15 * scale * Math.cos(barbAngle);
    const bY = pY + 15 * scale * Math.sin(barbAngle);
    ctx.beginPath();
    ctx.moveTo(pX, pY);
    ctx.lineTo(bX, bY);
    ctx.stroke();
    pos -= 6.5 * scale;
    remSpeed -= 4;
  }

  // 3. Half barb / short feather (2 m/s)
  if (remSpeed >= 1.5) {
    const barbPos = pos === staffLength ? staffLength - 6 * scale : pos;
    const pX = cx + barbPos * Math.cos(angleRad);
    const pY = cy + barbPos * Math.sin(angleRad);
    const bX = pX + 8 * scale * Math.cos(barbAngle);
    const bY = pY + 8 * scale * Math.sin(barbAngle);
    ctx.beginPath();
    ctx.moveTo(pX, pY);
    ctx.lineTo(bX, bY);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawSkyCoverCanvas(ctx, cx, cy, octas = 0, scale = 1.0) {
  const r = 8 * scale;
  ctx.save();

  // Background dark circle + white border
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(13, 17, 23, 0.85)";
  ctx.fill();
  ctx.strokeStyle = "#e6edf3";
  ctx.lineWidth = 2.0 * scale;
  ctx.stroke();

  const o = isNaN(octas) ? 9 : Math.min(9, Math.max(0, Math.round(octas)));
  ctx.fillStyle = "#e6edf3";

  switch (o) {
    case 0:
      // Clear: open circle
      break;
    case 1:
    case 2:
      // 1/4 pie slice (top to right)
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, -Math.PI / 2, 0);
      ctx.closePath();
      ctx.fill();
      break;
    case 3:
    case 4:
      // 1/2 vertical split
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
      ctx.fill();
      break;
    case 5:
    case 6:
      // 3/4 filled (all except top-left)
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI);
      ctx.closePath();
      ctx.fill();
      break;
    case 7:
    case 8:
      // Solid overcast
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 9:
    default: {
      // Obscured / missing: X cross
      const d = r * 0.707;
      ctx.strokeStyle = "#e6edf3";
      ctx.lineWidth = 2.0 * scale;
      ctx.beginPath();
      ctx.moveTo(cx - d, cy - d);
      ctx.lineTo(cx + d, cy + d);
      ctx.moveTo(cx + d, cy - d);
      ctx.lineTo(cx - d, cy + d);
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

export function renderStationPlotToCanvas(ctx, p, cx, cy, cfg = {}, scale = 1.0) {
  const rawT = extractTemp(p, ["temperature", "temp", "TEM", "TT", "T", "TMP", "t", "temp_max", "tem"]);
  const tt = rawT !== null ? Math.round(rawT).toString() : "";

  const rawTd = extractTemp(p, ["dewpoint", "dew_point", "DPT", "TD", "Td", "td", "dew", "dpt"]);
  const td = rawTd !== null ? Math.round(rawTd).toString() : "";

  const ppp = extractPressureOrHeight(p);

  const rawWs = extractRawNumber(p, ["wind_speed", "windSpeed", "ws", "WIN_S_Avg", "WIN_S", "FF", "ff", "speed"], 0, 150);
  const ws = rawWs !== null ? (rawWs > 100 ? rawWs / 10.0 : rawWs) : null;
  const wd = extractRawNumber(p, ["wind_dir", "windDir", "wd", "WIN_D_Avg", "WIN_D", "DD", "dd", "dir"], 0, 360);

  const rawCloud = extractRawNumber(p, ["cloud_cover", "cloudCover", "cloud", "CLO_Cov", "N", "n"], 0, 9);
  const cloudCover = rawCloud !== null ? Math.round(rawCloud) : 0;

  const weatherCode = extractRawNumber(p, ["weather_code", "weatherCode", "weather", "Ww", "ww", "WEA"], 0, 99) || 0;

  const pDiffRaw = extractRawNumber(p, ["press_diff_3h", "pDiff3h", "press_diff", "PRS_Change_3h", "p3"], -500, 500);
  const pDiff = pDiffRaw !== null && Math.abs(pDiffRaw) > 0.05
    ? `${pDiffRaw > 0 ? "+" : ""}${Math.abs(pDiffRaw) > 30 ? Math.round(pDiffRaw) : Math.round(pDiffRaw * 10)}`
    : "";

  const pTendCode = extractRawNumber(p, ["press_tend", "pTend", "PRS_Tendency", "a"], 0, 8);
  const pTend = pTendCode !== null ? getPressureTendencyGlyph(pTendCode) : "";

  const showTemp = cfg.showTemp !== undefined ? Boolean(cfg.showTemp) : true;
  const showDewpoint = cfg.showDewpoint !== undefined ? Boolean(cfg.showDewpoint) : true;
  const showWind = cfg.showWind !== undefined ? Boolean(cfg.showWind) : true;
  const showDTD = Boolean(cfg.showDTD);
  const showCloud = Boolean(cfg.showCloud);
  const showWeather = Boolean(cfg.showWeather);
  const showPressure = Boolean(cfg.showPressure);
  const showTendency = Boolean(cfg.showTendency);
  const showVisibility = Boolean(cfg.showVisibility);
  const showRain6 = Boolean(cfg.showRain6);

  let dtd = "";
  if (rawT !== null && rawTd !== null && rawTd <= 50 && rawTd <= rawT + 0.5) {
    const dVal = rawT - rawTd;
    if (dVal >= 0 && dVal <= 45) {
      dtd = Math.round(dVal).toString();
    }
  }

  const rawVis = extractRawNumber(p, ["visibility", "VIS", "vis", "VV", "vv", "VIS_Avg", "VIS_Min"], 0, 150000);
  const vis = rawVis !== null ? (rawVis >= 1000 ? (rawVis / 1000).toFixed(rawVis % 1000 === 0 ? 0 : 1) : (rawVis < 10 ? rawVis.toFixed(1) : Math.round(rawVis).toString())) : "";

  const rawRain6 = extractRawNumber(p, ["rain_6h", "RAIN_6H", "rain6h", "PRE_6h", "RAIN_6h", "rain_3h", "rain_1h", "rain_12h", "rain_24h", "rain"], 0, 1000);
  const rain6 = rawRain6 !== null && rawRain6 > 0 ? (rawRain6 < 10 ? rawRain6.toFixed(1) : Math.round(rawRain6).toString()) : "";

  const ww = getWeatherSymbol(weatherCode);
  const hasDTDPlot = Boolean(showDTD && dtd);
  const hasVisPlot = Boolean(showVisibility && vis);

  // 1. Wind Barb
  if (showWind && ws !== null && ws >= 0) {
    if (ws < 1.5) {
      drawWindBarbCanvas(ctx, cx, cy, 0, 0, scale);
    } else if (wd !== null && wd >= 0 && wd <= 360) {
      drawWindBarbCanvas(ctx, cx, cy, ws, wd, scale);
    }
  }

  // 2. Center Sky Cover or Station Dot
  if (showCloud) {
    drawSkyCoverCanvas(ctx, cx, cy, cloudCover, scale);
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5 * scale, 0, Math.PI * 2);
    ctx.fillStyle = "#e3b341";
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 0.8 * scale;
    ctx.stroke();
    ctx.restore();
  }

  // Text rendering with high-contrast dark halo
  function drawPlotText(text, x, y, color, fontSize, align = "left", weight = "700") {
    if (!text) return;
    ctx.save();
    ctx.font = `${weight} ${Math.round(fontSize * scale)}px 'SF Mono', -apple-system, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
    ctx.lineWidth = 2.5 * scale;
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // 3. TT (Temperature) - Top-Left in Bold Red
  if (showTemp && tt) {
    drawPlotText(tt, cx - 8 * scale, cy - 12 * scale, "#f85149", 13, "right", "700");
  }

  // 4. DTD (Dew-Point Depression) - Middle-Left in Bold Orange
  if (hasDTDPlot) {
    drawPlotText(dtd, cx - 8 * scale, cy, "#f0883e", 12, "right", "700");
  }

  // 5. TdTd (Dew Point) - Bottom-Left in Emerald Green
  if (showDewpoint && td) {
    drawPlotText(td, cx - 8 * scale, cy + 12 * scale, "#56d364", 13, "right", "700");
  }

  // 6. Weather (ww) and Visibility (VV) with DTD displacement collision rules
  if (hasDTDPlot) {
    if (!hasVisPlot && showWeather && ww) {
      drawPlotText(ww, cx - 22 * scale, cy, "#e3b341", 15, "center", "normal");
    } else if (hasVisPlot) {
      drawPlotText(vis, cx - 22 * scale, cy, "#ffd33d", 12, "right", "700");
    }
  } else {
    if (showWeather && ww) {
      drawPlotText(ww, cx - 8 * scale, cy, "#e3b341", 15, "center", "normal");
    }
    if (hasVisPlot) {
      drawPlotText(vis, cx - 22 * scale, cy, "#ffd33d", 12, "right", "700");
    }
  }

  // 7. PPP (Pressure or Height) - Top-Right in Cyan/Blue
  if (showPressure && ppp) {
    drawPlotText(ppp, cx + 8 * scale, cy - 12 * scale, "#79c0ff", 13, "left", "700");
  }

  // 8. R6 (6h Rain) - Middle-Right in Sky Blue
  if (showRain6 && rain6) {
    drawPlotText(rain6, cx + 8 * scale, cy, "#38bdf8", 12, "left", "700");
  }

  // 9. ppa (3h Pressure Tendency & Diff) - Bottom-Right in Light Blue
  if (showTendency && (pDiff || pTend)) {
    drawPlotText(`${pDiff}${pTend}`, cx + 8 * scale, cy + 12 * scale, "#a5d6ff", 11, "left", "600");
  }
}

export function drawStationCanvas(map) {
  const state = getState(map);
  const canvas = ensureStationCanvas(map);
  if (!canvas) return false;

  const container = map.getContainer ? map.getContainer() : null;
  if (!container) return false;

  const rect = container.getBoundingClientRect ? container.getBoundingClientRect() : { width: 800, height: 600 };
  const w = Math.round(rect.width) || 800;
  const h = Math.round(rect.height) || 600;
  const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const targetW = Math.round(w * dpr);
  const targetH = Math.round(h * dpr);

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext ? canvas.getContext("2d") : state.ctx;
  if (!ctx) return false;
  state.ctx = ctx;

  if (typeof ctx.setTransform === "function") {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  ctx.clearRect(0, 0, w, h);

  if (!state.visible || !state.geojson || !state.geojson.features || state.geojson.features.length === 0) {
    state.activeVisibleStations = [];
    state.activeBins = new Map();
    state.renderedCount = 0;
    return true;
  }

  const bounds = typeof map.getBounds === "function" ? map.getBounds() : null;
  const curZoom = typeof map.getZoom === "function" ? map.getZoom() : 5;
  const scale = curZoom < 4.5 ? 0.85 : (curZoom < 6.5 ? 1.0 : 1.15);
  state.currentScale = scale;

  // 1. Group in-bounds stations matching filters into 100x100px screen pixel grid bins
  const screenBins = new Map();
  for (const f of state.geojson.features) {
    if (!f.geometry || !Array.isArray(f.geometry.coordinates) || f.geometry.coordinates.length < 2) continue;
    const [lon, lat] = f.geometry.coordinates;
    if (!isPointInBounds(bounds, lon, lat)) continue;
    if (!matchesStationFilters(f.properties || {}, state.config)) continue;
    if (typeof map.project !== "function") continue;

    const pt = map.project([lon, lat]);
    if (pt.x < -60 || pt.x > w + 60 || pt.y < -60 || pt.y > h + 60) continue;

    const binKey = `${Math.floor(pt.x / 100)},${Math.floor(pt.y / 100)}`;
    let list = screenBins.get(binKey);
    if (!list) {
      list = [];
      screenBins.set(binKey, list);
    }
    list.push({ feature: f, pt, lon, lat });
  }

  // 2. In each 100x100px screen cell, show at most 5 stations (randomly sampled via stable hash)
  const selectedStations = [];
  for (const list of screenBins.values()) {
    if (list.length <= 5) {
      for (let i = 0; i < list.length; i++) selectedStations.push(list[i]);
    } else {
      list.sort((a, b) => {
        const ha = hashStation(a.feature.properties?.station_id, a.lon, a.lat);
        const hb = hashStation(b.feature.properties?.station_id, b.lon, b.lat);
        return ha - hb;
      });
      for (let i = 0; i < 5; i++) selectedStations.push(list[i]);
    }
  }

  // 3. Render each station onto the 2D canvas context and index into activeBins
  const activeBins = new Map();
  for (const s of selectedStations) {
    const bKey = `${Math.floor(s.pt.x / 100)},${Math.floor(s.pt.y / 100)}`;
    let bList = activeBins.get(bKey);
    if (!bList) {
      bList = [];
      activeBins.set(bKey, bList);
    }
    bList.push(s);
    renderStationPlotToCanvas(ctx, s.feature.properties || {}, s.pt.x, s.pt.y, state.config, scale);
  }

  state.activeBins = activeBins;
  state.activeVisibleStations = selectedStations;
  state.renderedCount = selectedStations.length;
  return true;
}

export function updateVisibleMarkersForMap(map) {
  drawStationCanvas(map);
}

// Legacy export alias for backward compatibility
export function updateVisibleMarkers() {
  // noop when called without context — per-map listeners call updateVisibleMarkersForMap
}

export function setStationVisibility(map, visible) {
  if (!map) return;
  const state = getState(map);
  state.visible = Boolean(visible);
  if (state.canvas && state.canvas.style) {
    state.canvas.style.display = state.visible ? "block" : "none";
  }
  if (!state.visible) {
    if (state.hoverAnimId && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(state.hoverAnimId);
      state.hoverAnimId = null;
    }
    state.lastHoverEvent = null;
    if (state.ctx && state.canvas) {
      state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
    }
    state.activeVisibleStations = [];
    state.activeBins = new Map();
    state.renderedCount = 0;
    handleStationMouseOut(map);
  } else {
    updateVisibleMarkersForMap(map);
  }
}

// Kept for backward compatibility; canvas path holds no DOM markers.
export function clearStationMarkersForMap(_map) {
  return;
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
  if (state.animId) {
    cancelAnim(state.animId);
    state.animId = null;
  }
  if (state.hoverAnimId && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(state.hoverAnimId);
    state.hoverAnimId = null;
  }
  state.lastHoverEvent = null;

  if (state.moveListener && typeof map.off === "function") {
    map.off("move", state.moveListener);
    map.off("zoom", state.moveListener);
    map.off("resize", state.moveListener);
    map.off("moveend", state.moveListener);
    map.off("zoomend", state.moveListener);
    state.moveListener = null;
  }
  if (state.mouseMoveListener && typeof map.off === "function") {
    map.off("mousemove", state.mouseMoveListener);
    state.mouseMoveListener = null;
  }
  if (state.mouseOutListener && typeof map.off === "function") {
    map.off("mouseout", state.mouseOutListener);
    state.mouseOutListener = null;
  }
  if (state.canvas) {
    if (state.ctx) {
      state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
    }
    if (state.canvas.parentNode) {
      state.canvas.parentNode.removeChild(state.canvas);
    }
    state.canvas = null;
    state.ctx = null;
  }
  state.activeVisibleStations = [];
  state.activeBins = new Map();
  state.renderedCount = 0;
  if (lastStationGeoJSON === state.geojson || !map) {
    lastStationGeoJSON = null;
  }
  state.geojson = null;
  state.visible = false;
  handleStationMouseOut(map);
}

// Expose station layer controller for automated testing (uses active map fallback)
const targetGlobal = typeof window !== "undefined" ? window : globalThis;
targetGlobal.__STATION_LAYER__ = {
  getVisibleCount: (map = null) => {
    if (map && mapState.has(map)) {
      return mapState.get(map).renderedCount || 0;
    }
    if (targetGlobal.__MAP__ && mapState.has(targetGlobal.__MAP__)) {
      return mapState.get(targetGlobal.__MAP__).renderedCount || 0;
    }
    return 0;
  },
  getTotalCount: () => {
    if (targetGlobal.__MAP__) {
      const s = mapState.get(targetGlobal.__MAP__);
      if (s && s.geojson && s.geojson.features) return s.geojson.features.length;
    }
    return lastStationGeoJSON && lastStationGeoJSON.features ? lastStationGeoJSON.features.length : 0;
  },
  setVisible: (map, visible) => setStationVisibility(map, visible),
};
