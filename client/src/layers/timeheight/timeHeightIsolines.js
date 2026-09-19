// timeHeightIsolines.js - Isolines, RH colormap fill, and wind barbs for Time-Height Canvas
import * as griddata from "griddata";
import { drawWindBarbCanvas } from "../station/stationSymbols.js";
import { pressureToFy } from "./timeHeightCanvas.js";

/**
 * Generates temperature contour levels (-92 to +48, step 4, containing 0C)
 */
export function getTempLevels() {
  const levels = [];
  for (let t = -92; t <= 48; t += 4) {
    levels.push(t);
  }
  return levels;
}

/**
 * Generates VVEL contour levels in 10^-2 Pa/s covering live extremes (-800 to +800 cPa/s)
 */
export function getVVelLevels() {
  return [
    -800, -600, -400, -300, -200, -160, -120, -80, -60, -40, -20, -10, -5,
    0,
    5, 10, 20, 40, 60, 80, 120, 160, 200, 300, 400, 600, 800,
  ];
}

/**
 * Renders RH color fill inside the diagram plotRect
 */
export function renderRHFill(ctx, matrix, layout, xFn, yFn, rhColorResolver) {
  const pRect = layout.plotRect;
  const { leads, levels, rh } = matrix;
  if (!rh || rh.length === 0 || !leads || leads.length < 2) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(pRect.x, pRect.y, pRect.width, pRect.height);
  ctx.clip();

  const nLevels = levels.length;
  const nLeads = leads.length;
  const rgba = [0, 0, 0, 255];

  for (let li = 0; li < nLevels - 1; li++) {
    const pBot = levels[li];
    const pTop = levels[li + 1];
    const yBot = yFn(pBot);
    const yTop = yFn(pTop);
    const cellH = yBot - yTop;

    for (let ti = 0; ti < nLeads - 1; ti++) {
      const lead0 = leads[ti];
      const lead1 = leads[ti + 1];
      const x0 = xFn(lead0);
      const x1 = xFn(lead1);
      const cellW = Math.abs(x1 - x0);
      const minX = Math.min(x0, x1);

      const v00 = rh[li][ti];
      const v10 = rh[li][ti + 1];
      const v01 = rh[li + 1][ti];
      const v11 = rh[li + 1][ti + 1];

      let sum = 0, count = 0;
      if (!Number.isNaN(v00)) { sum += v00; count++; }
      if (!Number.isNaN(v10)) { sum += v10; count++; }
      if (!Number.isNaN(v01)) { sum += v01; count++; }
      if (!Number.isNaN(v11)) { sum += v11; count++; }

      if (count > 0) {
        rhColorResolver(sum / count, rgba);
        ctx.fillStyle = `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, 0.82)`;
        ctx.fillRect(minX, yTop, cellW + 0.5, cellH + 0.5);
      }
    }
  }
  ctx.restore();
}

/**
 * Renders temperature isolines in red with 0C bolded
 */
export function renderTempLines(ctx, matrix, layout, xFn) {
  const pRect = layout.plotRect;
  const { leads, levels, tmp } = matrix;
  if (!tmp || tmp.length === 0 || !leads || leads.length < 2) return;

  const nLevels = levels.length;
  const nLeads = leads.length;
  const flatData = new Float32Array(nLevels * nLeads);
  for (let li = 0; li < nLevels; li++) {
    for (let ti = 0; ti < nLeads; ti++) {
      const v = tmp[li][ti];
      flatData[li * nLeads + ti] = (v === null || v === undefined || Number.isNaN(v)) ? NaN : v;
    }
  }

  const fyList = levels.map((p) => pressureToFy(p));
  const tempLevels = getTempLevels();

  let lines = [];
  try {
    lines = griddata.contour({ data: flatData, rows: nLevels, cols: nLeads }, { x: leads, y: fyList, levels: tempLevels }) || [];
  } catch {
    lines = [];
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(pRect.x, pRect.y, pRect.width, pRect.height);
  ctx.clip();

  ctx.strokeStyle = "#f85149";
  ctx.lineJoin = "round";

  for (const feat of lines) {
    const lvl = feat.properties?.level ?? 0;
    const isZero = lvl === 0;
    ctx.lineWidth = isZero ? 2.8 : 1.4;

    const coords = feat.geometry?.type === "MultiLineString" ? feat.geometry.coordinates : [feat.geometry?.coordinates];
    for (const line of coords) {
      if (!line || line.length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < line.length; i++) {
        const [ld, fy] = line[i];
        const px = xFn(ld);
        const py = pRect.y + fy * pRect.height;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      if (line.length >= 3) {
        const midIdx = Math.floor(line.length / 2);
        const [mld, mfy] = line[midIdx];
        ctx.fillStyle = "#f85149";
        ctx.font = isZero ? "bold 11px sans-serif" : "10px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(`${lvl}°`, xFn(mld), pRect.y + mfy * pRect.height - 2);
      }
    }
  }
  ctx.restore();
}

/**
 * Renders vertical velocity (VVEL) isolines in cyan with dashed ascent and bold 0
 */
export function renderVVelLines(ctx, matrix, layout, xFn) {
  const pRect = layout.plotRect;
  const { leads, levels, vvel } = matrix;
  if (!vvel || vvel.length === 0 || !leads || leads.length < 2) return;

  const nLevels = levels.length;
  const nLeads = leads.length;
  const flatData = new Float32Array(nLevels * nLeads);
  for (let li = 0; li < nLevels; li++) {
    for (let ti = 0; ti < nLeads; ti++) {
      const v = vvel[li][ti];
      flatData[li * nLeads + ti] = (v === null || v === undefined || Number.isNaN(v)) ? NaN : v;
    }
  }

  const fyList = levels.map((p) => pressureToFy(p));
  const vvelLevels = getVVelLevels();

  let lines = [];
  try {
    lines = griddata.contour({ data: flatData, rows: nLevels, cols: nLeads }, { x: leads, y: fyList, levels: vvelLevels }) || [];
  } catch {
    lines = [];
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(pRect.x, pRect.y, pRect.width, pRect.height);
  ctx.clip();

  ctx.strokeStyle = "#56d4dd";

  for (const feat of lines) {
    const lvl = feat.properties?.level ?? 0;
    const isZero = lvl === 0;
    const isAscent = lvl < 0;

    ctx.lineWidth = isZero ? 2.5 : 1.3;
    if (typeof ctx.setLineDash === "function") {
      ctx.setLineDash(isAscent ? [5, 3] : []);
    }

    const coords = feat.geometry?.type === "MultiLineString" ? feat.geometry.coordinates : [feat.geometry?.coordinates];
    for (const line of coords) {
      if (!line || line.length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < line.length; i++) {
        const [ld, fy] = line[i];
        const px = xFn(ld);
        const py = pRect.y + fy * pRect.height;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      if (isZero && line.length >= 2) {
        const [mld, mfy] = line[Math.floor(line.length / 2)];
        ctx.fillStyle = "#56d4dd";
        ctx.font = "bold 10px sans-serif";
        ctx.fillText("ω=0", xFn(mld), pRect.y + mfy * pRect.height - 2);
      }
    }
  }
  if (typeof ctx.setLineDash === "function") ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Renders wind barbs at each (lead, level) cross-section node
 */
export function renderWindBarbs(ctx, matrix, layout, xFn, yFn) {
  const pRect = layout.plotRect;
  const { leads, levels, u, v } = matrix;
  if (!u || !v) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(pRect.x, pRect.y, pRect.width, pRect.height);
  ctx.clip();

  for (let li = 0; li < levels.length; li++) {
    const py = yFn(levels[li]);
    for (let ti = 0; ti < leads.length; ti++) {
      const uVal = u[li][ti];
      const vVal = v[li][ti];
      if (Number.isNaN(uVal) || Number.isNaN(vVal)) continue;

      const px = xFn(leads[ti]);
      const speed = Math.hypot(uVal, vVal);
      const dir = ((Math.atan2(-uVal, -vVal) * 180) / Math.PI + 360) % 360;

      drawWindBarbCanvas(ctx, px, py, speed, dir, 0.55);
    }
  }
  ctx.restore();
}
