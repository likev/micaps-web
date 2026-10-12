// cursorProbe.svelte.js - Reactive live cursor coordinates and meteorological value probe
import { normalizeHeader } from "../../layers/wind/windSampling.js";
import { getWindowById } from "./tabs.svelte.js";
import { getLayersForWindow } from "./layersCore.js";

function isMissingValue(v) {
  return v == null || Number.isNaN(v) || Math.abs(v) >= 9990;
}

function sampleScalarGrid(gridData, lng, lat) {
  if (!gridData || !gridData.values || !gridData.header) return null;
  const h = normalizeHeader(gridData);
  const { nLon, nLat, startLon, dLon, startLat, dLat, isLatNorthToSouth } = h;

  const gx = (lng - startLon) / dLon;
  const gy = isLatNorthToSouth ? (startLat - lat) / dLat : (lat - startLat) / dLat;

  if (gx < 0 || gx >= nLon - 1 || gy < 0 || gy >= nLat - 1) return null;

  const x0 = Math.floor(gx);
  const x1 = Math.min(x0 + 1, nLon - 1);
  const y0 = Math.floor(gy);
  const y1 = Math.min(y0 + 1, nLat - 1);

  const fx = gx - x0;
  const fy = gy - y0;

  const v00 = gridData.values[y0 * nLon + x0];
  const v10 = gridData.values[y0 * nLon + x1];
  const v01 = gridData.values[y1 * nLon + x0];
  const v11 = gridData.values[y1 * nLon + x1];

  if (isMissingValue(v00) || isMissingValue(v10) || isMissingValue(v01) || isMissingValue(v11)) {
    return null;
  }

  const top = v00 * (1 - fx) + v10 * fx;
  const bot = v01 * (1 - fx) + v11 * fx;
  const result = top * (1 - fy) + bot * fy;
  return Number.isFinite(result) ? result : null;
}

function sampleWindGrid(gridData, lng, lat) {
  if (!gridData || !gridData.u || !gridData.v || !gridData.header) return null;
  const h = normalizeHeader(gridData);
  const { nLon, nLat, startLon, dLon, startLat, dLat, isLatNorthToSouth } = h;

  const gx = (lng - startLon) / dLon;
  const gy = isLatNorthToSouth ? (startLat - lat) / dLat : (lat - startLat) / dLat;

  if (gx < 0 || gx >= nLon - 1 || gy < 0 || gy >= nLat - 1) return null;

  const x0 = Math.floor(gx);
  const x1 = Math.min(x0 + 1, nLon - 1);
  const y0 = Math.floor(gy);
  const y1 = Math.min(y0 + 1, nLat - 1);

  const fx = gx - x0;
  const fy = gy - y0;

  const u00 = gridData.u[y0 * nLon + x0];
  const u10 = gridData.u[y0 * nLon + x1];
  const u01 = gridData.u[y1 * nLon + x0];
  const u11 = gridData.u[y1 * nLon + x1];

  const v00 = gridData.v[y0 * nLon + x0];
  const v10 = gridData.v[y0 * nLon + x1];
  const v01 = gridData.v[y1 * nLon + x0];
  const v11 = gridData.v[y1 * nLon + x1];

  if (
    isMissingValue(u00) || isMissingValue(u10) || isMissingValue(u01) || isMissingValue(u11) ||
    isMissingValue(v00) || isMissingValue(v10) || isMissingValue(v01) || isMissingValue(v11)
  ) {
    return null;
  }

  const uTop = u00 * (1 - fx) + u10 * fx;
  const uBot = u01 * (1 - fx) + u11 * fx;
  const uVal = uTop * (1 - fy) + uBot * fy;

  const vTop = v00 * (1 - fx) + v10 * fx;
  const vBot = v01 * (1 - fx) + v11 * fx;
  const vVal = vTop * (1 - fy) + vBot * fy;

  if (!Number.isFinite(uVal) || !Number.isFinite(vVal)) return null;

  const speed = Math.hypot(uVal, vVal);
  let dirDeg = (270 - (Math.atan2(vVal, uVal) * 180) / Math.PI) % 360;
  if (dirDeg < 0) dirDeg += 360;

  return { speed, dir: dirDeg };
}

export {
  sampleScalarGrid,
  sampleScalarGrid as sampleScalarGridAtLonLat,
  sampleWindGrid,
  sampleWindGrid as sampleWindGridAtLonLat,
};

export function formatCoordinates(lng, lat) {
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    return "--°N, --°E";
  }
  const latStr = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}`;
  const lngStr = `${Math.abs(lng).toFixed(1)}°${lng >= 0 ? "E" : "W"}`;
  return `${latStr}, ${lngStr}`;
}

export const formatLatLon = formatCoordinates;

export const cursorProbeState = $state({
  active: false,
  lng: null,
  lat: null,
  formattedCoords: "--°N, --°E",
  metValues: "",
});

export const cursorProbe = cursorProbeState;

export function updateCursorProbe(lng, lat, winOrId = null) {
  cursorProbeState.active = true;
  cursorProbeState.lng = lng;
  cursorProbeState.lat = lat;
  cursorProbeState.formattedCoords = formatCoordinates(lng, lat);

  const samples = [];
  const win = typeof winOrId === "object" ? winOrId : (winOrId ? getWindowById(winOrId) : null);
  const winId = typeof winOrId === "string" ? winOrId : win?.id;
  const layers = (win?.layers && win.layers.length > 0) ? win.layers : (winId ? getLayersForWindow(winId) : []);

  if (win || layers.length > 0) {
    for (const l of layers) {
      if (l.visible === false) continue;
      const elem = (l.element || "").toUpperCase();

      if (l.gridData && l.gridData.values) {
        const val = sampleScalarGrid(l.gridData, lng, lat);
        if (val !== null) {
          if (elem.includes("TMP") || elem === "T") {
            samples.push(`TMP: ${val.toFixed(1)}°C`);
          } else if (elem.includes("HGT") || elem === "GH" || elem === "H") {
            samples.push(`HGT: ${Math.round(val)} gpm`);
          } else if (elem.includes("RH")) {
            samples.push(`RH: ${Math.round(val)}%`);
          } else if (elem.includes("RAIN") || elem.includes("PRECIP") || elem.includes("TP")) {
            samples.push(`RAIN: ${val.toFixed(1)}mm`);
          } else if (elem.includes("SLP") || elem.includes("PRS")) {
            samples.push(`SLP: ${val.toFixed(1)}hPa`);
          } else {
            samples.push(`${elem || "VAL"}: ${val.toFixed(1)}`);
          }
        }
      }

      if (l.gridData && l.gridData.u && l.gridData.v) {
        const wind = sampleWindGrid(l.gridData, lng, lat);
        if (wind) {
          samples.push(`WIND: ${wind.speed.toFixed(1)}m/s ${Math.round(wind.dir)}°`);
        }
      }
    }

    if (samples.length === 0 && win?.windGridData) {
      const wind = sampleWindGrid(win.windGridData, lng, lat);
      if (wind) {
        samples.push(`WIND: ${wind.speed.toFixed(1)}m/s ${Math.round(wind.dir)}°`);
      }
    }

    if (samples.length === 0 && win?.gridData && win.gridData.values) {
      const elem = (win.element || "VAL").toUpperCase();
      const val = sampleScalarGrid(win.gridData, lng, lat);
      if (val !== null) {
        samples.push(`${elem}: ${val.toFixed(1)}`);
      }
    }
  }

  cursorProbeState.metValues = samples.join("  |  ");
}

export function clearCursorProbe() {
  cursorProbeState.active = false;
  cursorProbeState.formattedCoords = "--°N, --°E";
  cursorProbeState.metValues = "";
}
