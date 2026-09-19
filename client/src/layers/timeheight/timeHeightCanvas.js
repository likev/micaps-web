// timeHeightCanvas.js - Canvas 2D renderer for EC Time-Height Cross-Section (Forecast Lead x Pressure)
import { createColorResolver } from "../../utils/colormaps.js";
import { PROFILE_LEVELS } from "./timeHeightLoader.js";
import {
  getTempLevels,
  getVVelLevels,
  renderRHFill,
  renderTempLines,
  renderVVelLines,
  renderWindBarbs,
} from "./timeHeightIsolines.js";

export { getTempLevels, getVVelLevels };
export const P_TOP = 200;
export const P_BOTTOM = 1000;
const LN_P_TOP = Math.log(P_TOP);
const LN_P_BOT = Math.log(P_BOTTOM);
const LN_RANGE = LN_P_BOT - LN_P_TOP; // ln(1000) - ln(200) = ln(5)

/**
 * Maps pressure in hPa to normalized vertical fraction fy in [0, 1] (0 = 200hPa top, 1 = 1000hPa bottom)
 */
export function pressureToFy(p) {
  const clampedP = Math.max(P_TOP, Math.min(P_BOTTOM, p));
  return (Math.log(clampedP) - LN_P_TOP) / LN_RANGE;
}

/**
 * Maps normalized vertical fraction fy back to pressure in hPa
 */
export function fyToPressure(fy) {
  const clampedFy = Math.max(0, Math.min(1, fy));
  return Math.exp(LN_P_TOP + clampedFy * LN_RANGE);
}

export class TimeHeightCanvasRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.options = {
      showRH: true,
      showTemp: true,
      showVVel: true,
      showWind: true,
      timeDirection: "ltr", // "ltr" or "rtl"
      ...options,
    };

    this.matrix = null;
    this.cursorLead = null;
    this.hoverInfo = null;
    this.width = 640;
    this.height = 480;

    this.layout = {
      paddingLeft: 52,
      paddingRight: 32,
      paddingTop: 28,
      paddingBottom: 36,
      plotRect: { x: 0, y: 0, width: 0, height: 0 },
    };

    this.rhColorResolver = createColorResolver("RH");
    this._setupEvents();
  }

  setOptions(options) {
    this.options = { ...this.options, ...options };
    this.render();
  }

  setTimeDirection(dir) {
    if (dir === "ltr" || dir === "rtl") {
      this.options.timeDirection = dir;
      this.render();
    }
  }

  setData(matrix) {
    this.matrix = matrix;
    this.render();
  }

  setCursorLead(lead) {
    this.cursorLead = lead;
    this.render();
  }

  resize() {
    if (!this.canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const rect = this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
    const w = this.canvas.clientWidth || (rect ? rect.width : 0) || (this.canvas.width ? this.canvas.width / dpr : this.width);
    const h = this.canvas.clientHeight || (rect ? rect.height : 0) || (this.canvas.height ? this.canvas.height / dpr : this.height);

    this.width = Math.round(w);
    this.height = Math.round(h);

    const targetWidth = Math.round(w * dpr);
    const targetHeight = Math.round(h * dpr);
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
    }

    if (this.ctx) {
      if (typeof this.ctx.setTransform === "function") {
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else if (typeof this.ctx.scale === "function") {
        this.ctx.resetTransform?.();
        this.ctx.scale(dpr, dpr);
      }
    }

    this.layout.plotRect = {
      x: this.layout.paddingLeft,
      y: this.layout.paddingTop,
      width: Math.max(10, this.width - this.layout.paddingLeft - this.layout.paddingRight),
      height: Math.max(10, this.height - this.layout.paddingTop - this.layout.paddingBottom),
    };

    this.render();
  }

  x(lead) {
    const pRect = this.layout.plotRect;
    if (!this.matrix || !this.matrix.leads || this.matrix.leads.length === 0) {
      return pRect.x + pRect.width / 2;
    }
    const leads = this.matrix.leads;
    const start = leads[0];
    const end = leads[leads.length - 1];
    if (start === end) {
      return pRect.x + pRect.width / 2;
    }

    const isRtl = this.options.timeDirection === "rtl";
    const frac = isRtl ? (end - lead) / (end - start) : (lead - start) / (end - start);
    return pRect.x + Math.max(0, Math.min(1, frac)) * pRect.width;
  }

  xToLead(x) {
    const pRect = this.layout.plotRect;
    if (!this.matrix || !this.matrix.leads || this.matrix.leads.length === 0) return 0;
    const leads = this.matrix.leads;
    const start = leads[0];
    const end = leads[leads.length - 1];
    if (start === end) return start;

    const frac = Math.max(0, Math.min(1, (x - pRect.x) / pRect.width));
    const isRtl = this.options.timeDirection === "rtl";
    return isRtl ? end - frac * (end - start) : start + frac * (end - start);
  }

  y(p) {
    const pRect = this.layout.plotRect;
    const fy = pressureToFy(p);
    return pRect.y + fy * pRect.height;
  }

  yToPressure(y) {
    const pRect = this.layout.plotRect;
    const fy = Math.max(0, Math.min(1, (y - pRect.y) / pRect.height));
    return fyToPressure(fy);
  }

  _setupEvents() {
    if (!this.canvas) return;
    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const pRect = this.layout.plotRect;

      if (x >= pRect.x && x <= pRect.x + pRect.width && y >= pRect.y && y <= pRect.y + pRect.height) {
        const lead = this.xToLead(x);
        const p = this.yToPressure(y);
        this.hoverInfo = { x, y, lead, p };
      } else {
        this.hoverInfo = null;
      }
      this.render();
    });

    this.canvas.addEventListener("mouseleave", () => {
      this.hoverInfo = null;
      this.render();
    });
  }

  render() {
    const ctx = this.ctx;
    if (!ctx) return;
    const width = this.canvas?.clientWidth || this.width || 640;
    const height = this.canvas?.clientHeight || this.height || 480;
    this.width = width;
    this.height = height;

    const pRect = this.layout.plotRect;
    if (pRect.width <= 0 || pRect.height <= 0) return;

    // 0. Completely clear canvas buffer to wipe previous axes, labels, and plots
    ctx.clearRect(0, 0, width, height);

    // Clear canvas background
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, width, height);

    if (!this.matrix) {
      ctx.fillStyle = "#8b949e";
      ctx.font = "14px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Select a grid point or wait for profile matrix...", pRect.x + pRect.width / 2, pRect.y + pRect.height / 2);
      return;
    }

    // 1. Render RH color fill inside plotRect
    if (this.options.showRH) {
      renderRHFill(ctx, this.matrix, this.layout, (l) => this.x(l), (p) => this.y(p), this.rhColorResolver);
    }

    // 2. Render axes & isobar grids
    this._renderAxesAndGrid(ctx);

    // 3. Render TMP isolines
    if (this.options.showTemp) {
      renderTempLines(ctx, this.matrix, this.layout, (l) => this.x(l));
    }

    // 4. Render VVEL isolines
    if (this.options.showVVel) {
      renderVVelLines(ctx, this.matrix, this.layout, (l) => this.x(l));
    }

    // 5. Render wind barbs
    if (this.options.showWind) {
      renderWindBarbs(ctx, this.matrix, this.layout, (l) => this.x(l), (p) => this.y(p));
    }

    // 6. Timeline cursor indicator
    if (this.cursorLead !== null && this.cursorLead !== undefined) {
      this._renderTimelineCursor(ctx);
    }

    // 7. Mouse crosshair & hover readout
    if (this.hoverInfo) {
      this._renderCrosshair(ctx);
    }
  }

  _renderAxesAndGrid(ctx) {
    const pRect = this.layout.plotRect;
    const { leads, levels } = this.matrix;

    ctx.save();
    // Border
    ctx.strokeStyle = "#30363d";
    ctx.lineWidth = 1;
    ctx.strokeRect(pRect.x, pRect.y, pRect.width, pRect.height);

    // Isobars & Y labels
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "11px -apple-system, monospace";

    for (const p of levels || PROFILE_LEVELS) {
      const py = this.y(p);
      ctx.strokeStyle = p === 500 || p === 850 ? "#484f58" : "#21262d";
      ctx.lineWidth = p === 500 || p === 850 ? 1 : 0.8;
      ctx.beginPath();
      ctx.moveTo(pRect.x, py);
      ctx.lineTo(pRect.x + pRect.width, py);
      ctx.stroke();

      ctx.fillStyle = "#8b949e";
      ctx.fillText(`${p}`, pRect.x - 6, py);
    }

    // Lead ticks & X labels
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const px = this.x(lead);

      ctx.strokeStyle = "#21262d";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(px, pRect.y);
      ctx.lineTo(px, pRect.y + pRect.height);
      ctx.stroke();

      // Tick mark
      ctx.strokeStyle = "#484f58";
      ctx.beginPath();
      ctx.moveTo(px, pRect.y + pRect.height);
      ctx.lineTo(px, pRect.y + pRect.height + 4);
      ctx.stroke();

      // Label every lead or alternate if crowded
      if (leads.length <= 15 || i % 2 === 0) {
        ctx.fillStyle = "#8b949e";
        ctx.fillText(`+${lead}h`, px, pRect.y + pRect.height + 6);
      }
    }
    ctx.restore();
  }

  _renderTimelineCursor(ctx) {
    const pRect = this.layout.plotRect;
    const cx = this.x(this.cursorLead);

    if (cx >= pRect.x && cx <= pRect.x + pRect.width) {
      ctx.save();
      ctx.strokeStyle = "#e3b341";
      ctx.lineWidth = 1.8;
      if (typeof ctx.setLineDash === "function") {
        ctx.setLineDash([4, 3]);
      }
      ctx.beginPath();
      ctx.moveTo(cx, pRect.y);
      ctx.lineTo(cx, pRect.y + pRect.height);
      ctx.stroke();

      ctx.fillStyle = "#e3b341";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`▶ +${this.cursorLead}h`, cx, pRect.y - 6);
      ctx.restore();
    }
  }

  _renderCrosshair(ctx) {
    const pRect = this.layout.plotRect;
    const { x, y, lead, p } = this.hoverInfo;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1;
    if (typeof ctx.setLineDash === "function") {
      ctx.setLineDash([3, 3]);
    }

    ctx.beginPath();
    ctx.moveTo(pRect.x, y);
    ctx.lineTo(pRect.x + pRect.width, y);
    ctx.moveTo(x, pRect.y);
    ctx.lineTo(x, pRect.y + pRect.height);
    ctx.stroke();
    if (typeof ctx.setLineDash === "function") ctx.setLineDash([]);

    let tooltip = `+${Math.round(lead)}h | ${Math.round(p)} hPa`;
    const readout = this._sampleAtHover(lead, p);
    if (readout.t !== null) tooltip += ` | T: ${readout.t.toFixed(1)}°C`;
    if (readout.rh !== null) tooltip += ` | RH: ${Math.round(readout.rh)}%`;
    if (readout.vvel !== null) tooltip += ` | ω: ${readout.vvel.toFixed(1)} cPa/s`;
    if (readout.wind !== null) tooltip += ` | Wind: ${readout.wind.dir}° ${readout.wind.speed.toFixed(1)} m/s`;

    ctx.font = "11px -apple-system, sans-serif";
    const textW = ctx.measureText(tooltip).width;
    const badgeX = Math.max(pRect.x + 4, Math.min(pRect.x + pRect.width - textW - 16, x - textW / 2));
    const badgeY = y > pRect.y + 36 ? y - 26 : y + 14;

    ctx.fillStyle = "rgba(22, 27, 34, 0.92)";
    ctx.strokeStyle = "#30363d";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(badgeX, badgeY, textW + 12, 20, 4) : ctx.rect(badgeX, badgeY, textW + 12, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#e6edf3";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(tooltip, badgeX + 6, badgeY + 10);
    ctx.restore();
  }

  _sampleAtHover(lead, p) {
    const { leads, levels, tmp, rh, vvel, u, v } = this.matrix;
    const closestLeadIdx = leads.reduce((prev, curr, idx) => Math.abs(curr - lead) < Math.abs(leads[prev] - lead) ? idx : prev, 0);
    const closestLevelIdx = levels.reduce((prev, curr, idx) => Math.abs(curr - p) < Math.abs(levels[prev] - p) ? idx : prev, 0);

    const t = tmp && !Number.isNaN(tmp[closestLevelIdx][closestLeadIdx]) ? tmp[closestLevelIdx][closestLeadIdx] : null;
    const r = rh && !Number.isNaN(rh[closestLevelIdx][closestLeadIdx]) ? rh[closestLevelIdx][closestLeadIdx] : null;
    const w = vvel && !Number.isNaN(vvel[closestLevelIdx][closestLeadIdx]) ? vvel[closestLevelIdx][closestLeadIdx] : null;

    let wind = null;
    if (u && v && !Number.isNaN(u[closestLevelIdx][closestLeadIdx]) && !Number.isNaN(v[closestLevelIdx][closestLeadIdx])) {
      const uVal = u[closestLevelIdx][closestLeadIdx];
      const vVal = v[closestLevelIdx][closestLeadIdx];
      wind = {
        speed: Math.hypot(uVal, vVal),
        dir: Math.round(((Math.atan2(-uVal, -vVal) * 180) / Math.PI + 360) % 360),
      };
    }
    return { t, rh: r, vvel: w, wind };
  }

  exportPNG(filename = "ec_time_height_profile.png") {
    if (!this.canvas) return;
    const dataUrl = this.canvas.toDataURL("image/png");
    if (typeof document !== "undefined" && typeof document.createElement === "function") {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    return dataUrl;
  }
}
