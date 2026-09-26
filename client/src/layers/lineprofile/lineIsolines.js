// lineIsolines.js - Shared RH/T/VVEL/barb renderers for transect diagrams (generic u/v mapping)
import * as griddata from "griddata";
import { drawWindBarbCanvas } from "../station/stationSymbols.js";
import { pressureToFy } from "../timeheight/timeHeightCanvas.js";
import { getTempLevels, getVVelLevels } from "../timeheight/timeHeightIsolines.js";

export { pressureToFy };

// RH fill bands: values below 50 stay transparent (background shows through)
export const RH_FILL_LEVELS = [50, 60, 70, 80, 90, 100];

export function rhBandFill(rhColorResolver, level) {
  const mid = Array.isArray(level) ? (level[0] + level[1]) / 2 : Number(level) || 0;
  const rgba = [0, 0, 0, 255];
  rhColorResolver(mid, rgba);
  return `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, 0.82)`;
}

// Smooth filled contours for a rows×cols scalar grid in data coords.
// px(u,v)/py(u,v) map data coords to pixels (axis-aware for swapped views).
export function contourFillBands(ctx, layout, rows, flat, xs, ys, px, py, colorFor) {
  const pRect = layout.plotRect;
  let feats = [];
  try {
    feats = griddata.contourf({ data: flat, rows, cols: xs.length }, { x: xs, y: ys, levels: RH_FILL_LEVELS }) || [];
  } catch { feats = []; }
  if (!feats.length) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(pRect.x, pRect.y, pRect.width, pRect.height); ctx.clip();
  for (const f of feats) {
    ctx.fillStyle = colorFor(f.properties?.level);
    const polys = f.geometry?.type === "Polygon" ? [f.geometry.coordinates] : (f.geometry?.coordinates || []);
    for (const poly of polys) {
      if (!poly?.length) continue;
      ctx.beginPath();
      for (const ring of poly) {
        if (!ring || ring.length < 3) continue;
        for (let i = 0; i < ring.length; i++) {
          const [u, v] = ring[i];
          const X = px(u, v), Y = py(u, v);
          if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        ctx.closePath();
      }
      ctx.fill("evenodd");
    }
  }
  ctx.restore();
}

// Section RH contour-fill over [level][pt]: x=distKm linear, y=log-p
export function renderSectionRHFill(ctx, matrix, layout, distKm, xFn, yFn, rhColorResolver) {
  const pRect = layout.plotRect;
  const { levels, rh } = matrix;
  if (!rh?.length || !levels?.length || !distKm || distKm.length < 2) return;
  const nLevels = levels.length, nPts = distKm.length;
  const flat = new Float32Array(nLevels * nPts);
  for (let li = 0; li < nLevels; li++) {
    for (let pi = 0; pi < nPts; pi++) {
      const v = rh[li][pi];
      flat[li * nPts + pi] = v === null || v === undefined || Number.isNaN(v) ? NaN : v;
    }
  }
  const fyList = levels.map((p) => pressureToFy(p));
  contourFillBands(ctx, layout, nLevels, flat, distKm, fyList,
    (d) => xFn(d), (u, v) => pRect.y + v * pRect.height,
    (lvl) => rhBandFill(rhColorResolver, lvl));
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
      drawWindBarbCanvas(ctx, xFn(distKm[pi]), py, speed, dir, 0.55, "#e3b341");
    }
  }
  ctx.restore();
}

// Hovmoller RH contour-fill over [lead][pt]; u/v mapping is axis-aware
// (coords + uFn/vFn mirror renderHovLines; swapped=true transposes the grid).
export function renderHovRHFill(ctx, matrix, layout, distKm, rhColorResolver, uFn, vFn, coords, swapped = false) {
  const { leads, rh } = matrix;
  if (!rh?.length || !leads?.length || !distKm || distKm.length < 2) return;
  const xs = coords.u, ys = coords.v;
  const rows = ys.length, cols = xs.length;
  const flat = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = swapped ? rh[c]?.[r] : rh[r]?.[c];
      flat[r * cols + c] = v === null || v === undefined || Number.isNaN(v) ? NaN : v;
    }
  }
  contourFillBands(ctx, layout, rows, flat, xs, ys, uFn, vFn,
    (lvl) => rhBandFill(rhColorResolver, lvl));
}

export function renderHovLines(ctx, matrix, layout, field, distKm, uFn, vFn, uCoords, kind, swapped = false) {
  const pRect = layout.plotRect;
  const { leads } = matrix;
  if (!field?.length || !leads?.length || !distKm || distKm.length < 2) return;
  const xs = uCoords.u, ys = uCoords.v;
  const rows = ys.length, cols = xs.length;
  if (rows < 2 || cols < 2) return;
  const flat = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const val = swapped ? field[c]?.[r] : field[r]?.[c];
      flat[r * cols + c] = val === null || val === undefined || Number.isNaN(val) ? NaN : val;
    }
  }
  const cLevels = kind === "tmp" ? getTempLevels() : getVVelLevels();
  if (kind === "tmp") {
    contourLines(ctx, matrix, layout, rows, flat, xs, ys, cLevels, (lvl) => ({
      color: "#f85149", width: lvl === 0 ? 2.8 : 1.4, dash: [],
      px: (a, b) => uFn(a, b), py: (a, b) => vFn(a, b),
      label: (l) => `${l}°`, labelFont: (l) => (l === 0 ? "bold 11px sans-serif" : "10px sans-serif"),
    }));
  } else {
    contourLines(ctx, matrix, layout, rows, flat, xs, ys, cLevels, (lvl) => ({
      color: "#56d4dd", width: lvl === 0 ? 2.5 : 1.3, dash: lvl < 0 ? [5, 3] : [],
      px: (a, b) => uFn(a, b), py: (a, b) => vFn(a, b),
      label: lvl === 0 ? () => "ω=0" : null, labelFont: () => "bold 10px sans-serif",
    }));
  }
}

export function getRainTileColor(val) {
  if (val === null || val === undefined || Number.isNaN(val) || val < 0.1) return null;
  if (val < 1) return "rgba(166, 242, 143, 0.80)";
  if (val < 10) return "rgba(61, 186, 61, 0.80)";
  if (val < 25) return "rgba(97, 184, 255, 0.85)";
  if (val < 50) return "rgba(0, 0, 255, 0.85)";
  if (val < 100) return "rgba(250, 0, 250, 0.90)";
  if (val < 250) return "rgba(128, 0, 64, 0.90)";
  return "rgba(80, 0, 0, 0.92)";
}

export function renderHovRainTiles(
  ctx,
  matrix,
  layout,
  distKm,
  totalKm,
  distFrac,
  leadFrac,
  rainColorResolver = null,
  swapped = false,
  rainStep = null
) {
  const { leads, rain } = matrix;
  if (!rain?.length || !leads?.length || !distKm || distKm.length === 0) return;
  const pRect = layout.plotRect;
  if (!pRect || pRect.width <= 0 || pRect.height <= 0) return;

  const nLeads = leads.length;
  const nPts = distKm.length;

  const stepStr = String(matrix.rainStep || rainStep || "");
  const match = stepStr.match(/\d+/);
  let deltaT = match ? parseInt(match[0], 10) : 0;
  if (!deltaT || Number.isNaN(deltaT) || deltaT <= 0) {
    if (leads.length >= 2 && leads[1] > leads[0]) {
      deltaT = leads[1] - leads[0];
    } else {
      deltaT = 12;
    }
  }

  const sLead = leads[0];
  const eLead = leads[leads.length - 1];

  ctx.save();
  ctx.beginPath();
  ctx.rect(pRect.x, pRect.y, pRect.width, pRect.height);
  ctx.clip();

  const rgba = [0, 0, 0, 255];

  for (let li = 0; li < nLeads; li++) {
    const row = rain[li];
    if (!row) continue;
    const tEnd = leads[li];
    const tStart = tEnd - deltaT;

    // "rain12 means past 12 hour rain": lead 0 has no past accumulation
    if (tEnd <= sLead) continue;

    const clampedStart = Math.max(sLead, tStart);
    const clampedEnd = Math.min(eLead, tEnd);
    if (clampedStart >= clampedEnd) continue;

    for (let pi = 0; pi < nPts; pi++) {
      const val = row[pi];
      if (val === null || val === undefined || Number.isNaN(val) || val < 0.1) {
        continue;
      }

      let d0, d1;
      if (nPts <= 1) {
        d0 = 0;
        d1 = totalKm;
      } else if (pi === 0) {
        d0 = 0;
        d1 = (distKm[0] + distKm[1]) / 2;
      } else if (pi === nPts - 1) {
        d0 = (distKm[nPts - 2] + distKm[nPts - 1]) / 2;
        d1 = totalKm;
      } else {
        d0 = (distKm[pi - 1] + distKm[pi]) / 2;
        d1 = (distKm[pi] + distKm[pi + 1]) / 2;
      }

      let rectX, rectY, rectW, rectH;

      if (!swapped) {
        const x0 = pRect.x + distFrac(d0) * pRect.width;
        const x1 = pRect.x + distFrac(d1) * pRect.width;
        const y0 = pRect.y + leadFrac(clampedStart) * pRect.height;
        const y1 = pRect.y + leadFrac(clampedEnd) * pRect.height;

        rectX = Math.min(x0, x1);
        rectY = Math.min(y0, y1);
        rectW = Math.abs(x1 - x0);
        rectH = Math.abs(y1 - y0);
      } else {
        const x0 = pRect.x + leadFrac(clampedStart) * pRect.width;
        const x1 = pRect.x + leadFrac(clampedEnd) * pRect.width;
        const y0 = pRect.y + pRect.height - distFrac(d0) * pRect.height;
        const y1 = pRect.y + pRect.height - distFrac(d1) * pRect.height;

        rectX = Math.min(x0, x1);
        rectY = Math.min(y0, y1);
        rectW = Math.abs(x1 - x0);
        rectH = Math.abs(y1 - y0);
      }

      if (typeof rainColorResolver === "function") {
        rainColorResolver(val, rgba);
        const alpha = ((rgba[3] ?? 255) / 255) * 0.85;
        ctx.fillStyle = `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${alpha.toFixed(2)})`;
      } else {
        ctx.fillStyle = getRainTileColor(val);
      }

      ctx.fillRect(rectX, rectY, rectW + 0.5, rectH + 0.5);
    }
  }

  ctx.restore();
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
      drawWindBarbCanvas(ctx, px, py, speed, dir, 0.55, "#e3b341");
    }
  }
  ctx.restore();
}
