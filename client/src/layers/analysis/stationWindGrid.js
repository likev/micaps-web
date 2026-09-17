// stationWindGrid.js - Objective analysis to generate regular 2D (U, V) grid from sparse station winds
import { WIND_QC_BOUNDS } from "./qcBounds.js";

// Generate regular 2D (U, V) grid from sparse observation stations (Surface or Upper-Air)
export function generateStationWindGrid(stationsGeoJSON, level = null) {
  if (!stationsGeoJSON || !stationsGeoJSON.features || stationsGeoJSON.features.length < 3) {
    return null;
  }

  const numLvl = Number(level);
  const maxAllowedWs = (numLvl && WIND_QC_BOUNDS[numLvl]) ? WIND_QC_BOUNDS[numLvl][1] : 140;

  const points = [];
  const uVals = [];
  const vVals = [];

  for (const f of stationsGeoJSON.features) {
    if (!f.geometry || !f.geometry.coordinates) continue;
    const [lon, lat] = f.geometry.coordinates;
    const p = f.properties || {};

    let ws = null;
    const wsKeys = ["wind_speed", "windSpeed", "ws", "WIN_S_Avg", "WIN_S", "FF", "ff", "speed"];
    for (const k of wsKeys) {
      const v = p[k];
      if (v !== undefined && v !== null && v !== "" && v !== -9999 && v !== "-9999") {
        const num = typeof v === "number" ? v : parseFloat(v);
        if (!isNaN(num) && num >= 0 && num <= 900) {
          ws = num;
          break;
        }
      }
    }

    let wd = null;
    const wdKeys = ["wind_dir", "windDir", "wd", "WIN_D_Avg", "WIN_D", "DD", "dd", "dir"];
    for (const k of wdKeys) {
      const v = p[k];
      if (v !== undefined && v !== null && v !== "" && v !== -9999 && v !== "-9999") {
        const num = typeof v === "number" ? v : parseFloat(v);
        if (!isNaN(num) && num >= 0 && num <= 360) {
          wd = num;
          break;
        }
      }
    }

    // QC: reject speeds exceeding physical limits for level
    if (ws !== null && (ws < 0 || ws > maxAllowedWs)) {
      ws = null;
    }

    let u = null;
    let v = null;
    if (typeof p.u === "number" && typeof p.v === "number" && !isNaN(p.u) && !isNaN(p.v)) {
      u = p.u;
      v = p.v;
    } else if (ws !== null) {
      if (ws < 0.5) {
        // Calm wind: (u, v) = (0, 0)
        u = 0;
        v = 0;
      } else if (wd !== null && wd >= 0 && wd <= 360) {
        const rad = (wd * Math.PI) / 180;
        u = -ws * Math.sin(rad);
        v = -ws * Math.cos(rad);
      }
    }

    if (u !== null && v !== null && !isNaN(u) && !isNaN(v)) {
      points.push([lon, lat]);
      uVals.push(u);
      vVals.push(v);
    }
  }

  const numPts = points.length;
  if (numPts < 3) return null;

  // Single pass coordinate extraction and bounding box computation
  let rawMinLon = Infinity, rawMaxLon = -Infinity;
  let rawMinLat = Infinity, rawMaxLat = -Infinity;
  const ptX = new Float64Array(numPts);
  const ptY = new Float64Array(numPts);

  for (let i = 0; i < numPts; i++) {
    const px = points[i][0];
    const py = points[i][1];
    ptX[i] = px;
    ptY[i] = py;
    if (px < rawMinLon) rawMinLon = px;
    if (px > rawMaxLon) rawMaxLon = px;
    if (py < rawMinLat) rawMinLat = py;
    if (py > rawMaxLat) rawMaxLat = py;
  }

  const minLon = Math.max(60, rawMinLon - 2.0);
  const maxLon = Math.min(145, rawMaxLon + 2.0);
  const minLat = Math.max(10, rawMinLat - 2.0);
  const maxLat = Math.min(60, rawMaxLat + 2.0);

  const dDeg = 1.0;
  const x = [];
  for (let lon = minLon; lon <= maxLon; lon += dDeg) x.push(lon);
  const y = [];
  for (let lat = minLat; lat <= maxLat; lat += dDeg) y.push(lat);

  const nCols = x.length;
  const nRows = y.length;
  const uGrid = new Float32Array(nCols * nRows);
  const vGrid = new Float32Array(nCols * nRows);
  const dySq = new Float64Array(numPts);

  for (let r = 0; r < nRows; r++) {
    const lat = y[r];
    const rowOffset = r * nCols;

    // Hoist lat distance calculation outside column loop (eliminates ~10,000,000 multiplications)
    for (let i = 0; i < numPts; i++) {
      const dLat = lat - ptY[i];
      dySq[i] = dLat * dLat;
    }

    for (let c = 0; c < nCols; c++) {
      const lon = x[c];
      let weightSum = 0;
      let uSum = 0;
      let vSum = 0;

      for (let i = 0; i < numPts; i++) {
        const dLon = lon - ptX[i];
        const distSq = dLon * dLon + dySq[i];
        if (distSq < 0.0001) {
          weightSum = 1;
          uSum = uVals[i];
          vSum = vVals[i];
          break;
        }
        const w = 1.0 / (distSq + 0.5);
        weightSum += w;
        uSum += uVals[i] * w;
        vSum += vVals[i] * w;
      }

      const idx = rowOffset + c;
      uGrid[idx] = weightSum > 0 ? uSum / weightSum : 0;
      vGrid[idx] = weightSum > 0 ? vSum / weightSum : 0;
    }
  }

  return {
    header: {
      start_lon: minLon,
      end_lon: maxLon,
      start_lat: minLat,
      end_lat: maxLat,
      n_lon: nCols,
      n_lat: nRows,
      d_lon: dDeg,
      d_lat: dDeg,
    },
    u: uGrid,
    v: vGrid,
  };
}
