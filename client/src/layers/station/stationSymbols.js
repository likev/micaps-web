// stationSymbols.js - Wind barb and sky cover canvas symbol renderers (CMA & WMO compliant)
import { getPlotTokens } from "../../map/themeTokens.js";

export function drawWindBarbCanvas(ctx, cx, cy, speed, dir, scale = 1.0, color = null, themeId = "dark") {
  const windColor = color || (getPlotTokens(themeId)?.wind?.color ?? "#dee2e6");
  if (speed < 1.5) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 10 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = windColor;
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
  ctx.strokeStyle = windColor;
  ctx.fillStyle = windColor;
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

export function drawSkyCoverCanvas(ctx, cx, cy, octas = 0, scale = 1.0, themeOrTokens = "dark") {
  const r = 8 * scale;
  ctx.save();

  let sky = null;
  if (typeof themeOrTokens === "string") {
    sky = getPlotTokens(themeOrTokens)?.sky;
  } else if (themeOrTokens && typeof themeOrTokens === "object") {
    sky = themeOrTokens.sky || themeOrTokens;
  }
  if (!sky) {
    sky = getPlotTokens("dark").sky;
  }

  const bg = sky.bg || "rgba(8, 9, 13, 0.90)";
  const border = sky.border || "#dee2e6";
  const fill = sky.fill || "#dee2e6";

  // Background circle + border
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 2.0 * scale;
  ctx.stroke();

  const o = isNaN(octas) ? 9 : Math.min(9, Math.max(0, Math.round(octas)));
  ctx.fillStyle = fill;

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
      ctx.strokeStyle = border;
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
