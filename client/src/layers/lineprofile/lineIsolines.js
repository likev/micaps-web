// lineIsolines.js - Shared RH/T/VVEL/barb renderers for transect diagrams (generic u/v mapping)
import * as griddata from "griddata";
import { drawWindBarbCanvas } from "../station/stationSymbols.js";
import { pressureToFy } from "../timeheight/timeHeightCanvas.js";
import { getTempLevels, getVVelLevels } from "../timeheight/timeHeightIsolines.js";

export { pressureToFy };

// Section RH fill over [level][pt]: x=distKm linear, y=log-p
export function renderSectionRHFill(ctx, matrix, layout, distKm, xFn, yFn, rhColorResolver) {
  const pRect = layout.plotRect;
  const { levels, rh } = matrix;
  if (!rh?.length || !levels?.length || !distKm || distKm.length < 2) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(pRect.x, pRect.y, pRect.width, pRect.height); ctx.clip();
  const nLevels = levels.length, nPts = distKm.length;
  const rgba = [0, 0, 0, 255];
  for (let li = 0; li < nLevels - 1; li++) {
    const yTop = yFn(levels[li + 1]), yBot = yFn(levels[li]);
    const cellH = yBot - yTop;
    for (let pi = 0; pi < nPts - 1; pi++) {
      const x0 = xFn(distKm[pi]), x1 = xFn(distKm[pi + 1]);
      const cellW = Math.abs(x1 - x0), minX = Math.min(x0, x1);
      let sum = 0, count = 0;
      for (const v of [rh[li][pi], rh[li][pi + 1], rh[li + 1][pi], rh[li + 1][pi + 1]]) {
        if (!Number.isNaN(v)) { sum += v; count++; }
      }
      if (count > 0) {
        rhColorResolver(sum / count, rgba);
        ctx.fillStyle = `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, 0.82)`;
        ctx.fillRect(minX, yTop, cellW + 0.5, cellH + 0.5);
      }
    }
  }
  ctx.restore();
}

// Section T/VVEL lines via contour in (dist, fy) coords
function contourLines(ctx, matrix, layout, rows, flat, xs, ys, levels, style) {
  const pRect = layout.plotRect;
  let lines = [];
  try {
    lines = griddata.contour({ data: flat, rows, cols: xs.length }, { x: xs, y: ys, levels }) || [];
  } catch { lines = []; }
  ctx.save();
  ctx.beginPath(); ctx.rect(pRect.x, pRect.y, pRect.width, pRect.height); ctx.clip();
  ctx.lineJoin = "round";
  for (const feat of lines) {
    const lvl = feat.properties?.level ?? 0;
    const st = style(lvl);
    ctx.strokeStyle = st.color; ctx.lineWidth = st.width;
    if (typeof ctx.setLineDash === "function") ctx.setLineDash(st.dash || []);
    const coords = feat.geometry?.type === "MultiLineString" ? feat.geometry.coordinates : [feat.geometry?.coordinates];
    for (const line of coords) {
      if (!line || line.length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < line.length; i++) {
        const [u, v] = line[i];
        const px = st.px(u, v), py = st.py(u, v);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      if (st.label && line.length >= 3) {
        const [mu, mv] = line[Math.floor(line.length / 2)];
        ctx.fillStyle = st.color;
        ctx.font = st.labelFont(lvl);
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText(st.label(lvl), st.px(mu, mv), st.py(mu, mv) - 2);
      }
    }
  }
  if (typeof ctx.setLineDash === "function") ctx.setLineDash([]);
  ctx.restore();
}

export function renderSectionTempLines(ctx, matrix, layout, distKm, xFn, yFn) {
  const { levels, tmp } = matrix;
  if (!tmp?.length || distKm.length < 2) return;
  const pRect = layout.plotRect;
  const nLevels = levels.length, nPts = distKm.length;
  const flat = new Float32Array(nLevels * nPts);
  for (let li = 0; li < nLevels; li++)
    for (let pi = 0; pi < nPts; pi++) {
      const v = tmp[li][pi];
      flat[li * nPts + pi] = v === null || v === undefined || Number.isNaN(v) ? NaN : v;
    }
  const fyList = levels.map((p) => pressureToFy(p));
  contourLines(ctx, matrix, layout, nLevels, flat, distKm, fyList, getTempLevels(), (lvl) => ({
    color: "#f85149", width: lvl === 0 ? 2.8 : 1.4, dash: [],
    px: (u) => xFn(u), py: (u, v) => pRect.y + v * pRect.height,
    label: (l) => `${l}°`, labelFont: (l) => (l === 0 ? "bold 11px sans-serif" : "10px sans-serif"),
  }));
}

export function renderSectionVVelLines(ctx, matrix, layout, distKm, xFn, yFn) {
  const { levels, vvel } = matrix;
  if (!vvel?.length || distKm.length < 2) return;
  const pRect = layout.plotRect;
  const nLevels = levels.length, nPts = distKm.length;
  const flat = new Float32Array(nLevels * nPts);
  for (let li = 0; li < nLevels; li++)
    for (let pi = 0; pi < nPts; pi++) {
      const v = vvel[li][pi];
      flat[li * nPts + pi] = v === null || v === undefined || Number.isNaN(v) ? NaN : v;
    }
  const fyList = levels.map((p) => pressureToFy(p));
  contourLines(ctx, matrix, layout, nLevels, flat, distKm, fyList, getVVelLevels(), (lvl) => ({
    color: "#56d4dd", width: lvl === 0 ? 2.5 : 1.3, dash: lvl < 0 ? [5, 3] : [],
    px: (u) => xFn(u), py: (u, v) => pRect.y + v * pRect.height,
    label: lvl === 0 ? () => "ω=0" : null, labelFont: () => "bold 10px sans-serif",
  }));
}

export function renderSectionBarbs(ctx, matrix, layout, distKm, xFn, yFn, stride = 1) {
  const pRect = layout.plotRect;
  const { levels, u, v } = matrix;
  if (!u || !v) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(pRect.x, pRect.y, pRect.width, pRect.height); ctx.clip();
  for (let li = 0; li < levels.length; li += stride) {
    const py = yFn(levels[li]);
    for (let pi = 0; pi < distKm.length; pi += stride) {
      const uV = u[li][pi], vV = v[li][pi];
      if (Number.isNaN(uV) || Number.isNaN(vV)) continue;
      const speed = Math.hypot(uV, vV);
      const dir = ((Math.atan2(-uV, -vV) * 180) / Math.PI + 360) % 360;
      drawWindBarbCanvas(ctx, xFn(distKm[pi]), py, speed, dir, 0.55);
    }
  }
  ctx.restore();
}

// Hovmoller RH fill over [lead][pt]; cell geometry comes from cellBounds (axis-aware)
export function renderHovRHFill(ctx, matrix, layout, distKm, rhColorResolver, cellBounds) {
  const pRect = layout.plotRect;
  const { leads, rh } = matrix;
  if (!rh?.length || !leads?.length || distKm.length < 2) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(pRect.x, pRect.y, pRect.width, pRect.height); ctx.clip();
  const rgba = [0, 0, 0, 255];
  for (let li = 0; li < leads.length - 1; li++) {
    for (let pi = 0; pi < distKm.length - 1; pi++) {
      let sum = 0, count = 0;
      for (const v of [rh[li][pi], rh[li][pi + 1], rh[li + 1][pi], rh[li + 1][pi + 1]]) {
        if (!Number.isNaN(v)) { sum += v; count++; }
      }
      if (count === 0) continue;
      rhColorResolver(sum / count, rgba);
      ctx.fillStyle = `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, 0.82)`;
      const b = cellBounds(li, pi);
      ctx.fillRect(b.x, b.y, b.w + 0.5, b.h + 0.5);
    }
  }
  ctx.restore();
}

export function renderHovLines(ctx, matrix, layout, field, distKm, uFn, vFn, uCoords, kind) {
  const pRect = layout.plotRect;
  const { leads } = matrix;
  const nLeads = leads.length, nPts = distKm.length;
  if (nLeads < 2 || nPts < 2) return;
  const flat = new Float32Array(nLeads * nPts);
  for (let li = 0; li < nLeads; li++)
    for (let pi = 0; pi < nPts; pi++) {
      const val = field[li][pi];
      flat[li * nPts + pi] = val === null || val === undefined || Number.isNaN(val) ? NaN : val;
    }
  const cLevels = kind === "tmp" ? getTempLevels() : getVVelLevels();
  if (kind === "tmp") {
    contourLines(ctx, matrix, layout, nLeads, flat, uCoords.u, uCoords.v, cLevels, (lvl) => ({
      color: "#f85149", width: lvl === 0 ? 2.8 : 1.4, dash: [],
      px: (a, b) => uFn(a, b), py: (a, b) => vFn(a, b),
      label: (l) => `${l}°`, labelFont: (l) => (l === 0 ? "bold 11px sans-serif" : "10px sans-serif"),
    }));
  } else {
    contourLines(ctx, matrix, layout, nLeads, flat, uCoords.u, uCoords.v, cLevels, (lvl) => ({
      color: "#56d4dd", width: lvl === 0 ? 2.5 : 1.3, dash: lvl < 0 ? [5, 3] : [],
      px: (a, b) => uFn(a, b), py: (a, b) => vFn(a, b),
      label: lvl === 0 ? () => "ω=0" : null, labelFont: () => "bold 10px sans-serif",
    }));
  }
}

export function renderHovBarbs(ctx, matrix, layout, distKm, pxFn, stride = 2) {
  const pRect = layout.plotRect;
  const { leads, u, v } = matrix;
  if (!u || !v) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(pRect.x, pRect.y, pRect.width, pRect.height); ctx.clip();
  for (let li = 0; li < leads.length; li += stride) {
    for (let pi = 0; pi < distKm.length; pi += stride) {
      const uV = u[li][pi], vV = v[li][pi];
      if (Number.isNaN(uV) || Number.isNaN(vV)) continue;
      const [px, py] = pxFn(li, pi);
      const speed = Math.hypot(uV, vV);
      const dir = ((Math.atan2(-uV, -vV) * 180) / Math.PI + 360) % 360;
      drawWindBarbCanvas(ctx, px, py, speed, dir, 0.55);
    }
  }
  ctx.restore();
}
