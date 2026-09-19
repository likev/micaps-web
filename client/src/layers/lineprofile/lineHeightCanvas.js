// lineHeightCanvas.js - Section X=distance(km) x Y=log-p renderer (Group 1)
import { createColorResolver } from "../../utils/colormaps.js";
import { PROFILE_LEVELS } from "./lineUtils.js";
import { pressureToFy } from "../timeheight/timeHeightCanvas.js";
import {
  renderSectionRHFill, renderSectionTempLines, renderSectionVVelLines, renderSectionBarbs,
} from "./lineIsolines.js";

export { pressureToFy };
export const P_TOP = 200;
export const P_BOTTOM = 1000;

export class LineHeightCanvasRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.options = { showRH: true, showTemp: true, showVVel: true, showWind: true, flipDirection: false, ...options };
    this.matrix = null;
    this.distKm = [];
    this.totalKm = 0;
    this.headlineLead = null;
    this.hoverInfo = null;
    this.width = 640; this.height = 480;
    this.layout = { paddingLeft: 52, paddingRight: 32, paddingTop: 28, paddingBottom: 36, plotRect: { x: 0, y: 0, width: 0, height: 0 } };
    this.rhColorResolver = createColorResolver("RH");
    this._setupEvents();
  }
  setOptions(o) { this.options = { ...this.options, ...o }; this.render(); }
  setFlip(flip) { this.options.flipDirection = Boolean(flip); this.render(); }
  setData(matrix, distKm = null, headlineLead = null) {
    this.matrix = matrix;
    if (Array.isArray(distKm) && distKm.length > 0) {
      this.distKm = [...distKm];
      this.totalKm = matrix?.distKm ?? distKm[distKm.length - 1] ?? 0;
    } else if (matrix) {
      const n = matrix.rh?.[0]?.length ?? 41;
      const L = matrix.distKm ?? 0;
      this.totalKm = L;
      this.distKm = Array.from({ length: n }, (_, i) => (n === 1 ? 0 : (L * i) / (n - 1)));
    }
    if (headlineLead !== null && headlineLead !== undefined) this.headlineLead = headlineLead;
    this.render();
  }
  setHeadlineLead(lead) { this.headlineLead = lead; this.render(); }
  effDist(d) { return this.options.flipDirection ? this.totalKm - d : d; }
  x(dist) {
    const pRect = this.layout.plotRect;
    if (!this.totalKm) return pRect.x + pRect.width / 2;
    const frac = Math.max(0, Math.min(1, this.effDist(dist) / this.totalKm));
    return pRect.x + frac * pRect.width;
  }
  xToDist(x) {
    const pRect = this.layout.plotRect;
    const frac = Math.max(0, Math.min(1, (x - pRect.x) / pRect.width));
    const eff = frac * this.totalKm;
    return this.options.flipDirection ? this.totalKm - eff : eff;
  }
  y(p) { const pRect = this.layout.plotRect; return pRect.y + pressureToFy(p) * pRect.height; }
  yToPressure(y) {
    const pRect = this.layout.plotRect;
    const fy = Math.max(0, Math.min(1, (y - pRect.y) / pRect.height));
    const LN_TOP = Math.log(P_TOP), LN_BOT = Math.log(P_BOTTOM);
    return Math.exp(LN_TOP + fy * (LN_BOT - LN_TOP));
  }
  resize() {
    if (!this.canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const rect = this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
    const w = this.canvas.clientWidth || (rect ? rect.width : 0) || this.width;
    const h = this.canvas.clientHeight || (rect ? rect.height : 0) || this.height;
    this.width = Math.round(w); this.height = Math.round(h);
    const tw = Math.round(w * dpr), th = Math.round(h * dpr);
    if (this.canvas.width !== tw || this.canvas.height !== th) { this.canvas.width = tw; this.canvas.height = th; }
    if (this.ctx) {
      if (typeof this.ctx.setTransform === "function") this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      else if (typeof this.ctx.scale === "function") { this.ctx.resetTransform?.(); this.ctx.scale(dpr, dpr); }
    }
    this.layout.plotRect = { x: this.layout.paddingLeft, y: this.layout.paddingTop, width: Math.max(10, this.width - this.layout.paddingLeft - this.layout.paddingRight), height: Math.max(10, this.height - this.layout.paddingTop - this.layout.paddingBottom) };
    this.render();
  }
  _setupEvents() {
    if (!this.canvas) return;
    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const pRect = this.layout.plotRect;
      if (x >= pRect.x && x <= pRect.x + pRect.width && y >= pRect.y && y <= pRect.y + pRect.height) {
        this.hoverInfo = { x, y, dist: this.xToDist(x), p: this.yToPressure(y) };
      } else this.hoverInfo = null;
      this.render();
    });
    this.canvas.addEventListener("mouseleave", () => { this.hoverInfo = null; this.render(); });
  }
  render() {
    const ctx = this.ctx;
    if (!ctx) return;
    const width = this.canvas?.clientWidth || this.width || 640;
    const height = this.canvas?.clientHeight || this.height || 480;
    this.width = width; this.height = height;
    const pRect = this.layout.plotRect;
    if (pRect.width <= 0 || pRect.height <= 0) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0d1117"; ctx.fillRect(0, 0, width, height);
    if (!this.matrix) {
      ctx.fillStyle = "#8b949e"; ctx.font = "14px -apple-system, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Draw a line on the map or wait for section matrix...", pRect.x + pRect.width / 2, pRect.y + pRect.height / 2);
      return;
    }
    if (this.options.showRH) renderSectionRHFill(ctx, this.matrix, this.layout, this.distKm, (d) => this.x(d), (p) => this.y(p), this.rhColorResolver);
    this._renderAxes(ctx);
    if (this.options.showTemp) renderSectionTempLines(ctx, this.matrix, this.layout, this.distKm, (d) => this.x(d), (p) => this.y(p));
    if (this.options.showVVel) renderSectionVVelLines(ctx, this.matrix, this.layout, this.distKm, (d) => this.x(d), (p) => this.y(p));
    if (this.options.showWind) renderSectionBarbs(ctx, this.matrix, this.layout, this.distKm, (d) => this.x(d), (p) => this.y(p), 1);
    if (this.headlineLead !== null && this.headlineLead !== undefined) this._renderHeadline(ctx);
    if (this.hoverInfo) this._renderCrosshair(ctx);
  }
  _renderAxes(ctx) {
    const pRect = this.layout.plotRect;
    const { levels } = this.matrix;
    ctx.save();
    ctx.strokeStyle = "#30363d"; ctx.lineWidth = 1;
    ctx.strokeRect(pRect.x, pRect.y, pRect.width, pRect.height);
    ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.font = "11px -apple-system, monospace";
    for (const p of levels || PROFILE_LEVELS) {
      const py = this.y(p);
      ctx.strokeStyle = p === 500 || p === 850 ? "#484f58" : "#21262d";
      ctx.lineWidth = p === 500 || p === 850 ? 1 : 0.8;
      ctx.beginPath(); ctx.moveTo(pRect.x, py); ctx.lineTo(pRect.x + pRect.width, py); ctx.stroke();
      ctx.fillStyle = "#8b949e"; ctx.fillText(`${p}`, pRect.x - 6, py);
    }
    const L = this.totalKm;
    const ticks = [0, L / 4, L / 2, (3 * L) / 4, L];
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (const d of ticks) {
      const px = this.x(d);
      ctx.strokeStyle = "#21262d"; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(px, pRect.y); ctx.lineTo(px, pRect.y + pRect.height); ctx.stroke();
      ctx.strokeStyle = "#484f58";
      ctx.beginPath(); ctx.moveTo(px, pRect.y + pRect.height); ctx.lineTo(px, pRect.y + pRect.height + 4); ctx.stroke();
      ctx.fillStyle = "#8b949e"; ctx.fillText(`${Math.round(d)}`, px, pRect.y + pRect.height + 6);
    }
    ctx.fillStyle = "#6e7681"; ctx.font = "10px sans-serif";
    ctx.fillText(`distance A→B: 0 … ${Math.round(L)} km`, pRect.x + pRect.width / 2, pRect.y + pRect.height + 20);
    ctx.restore();
  }
  _renderHeadline(ctx) {
    const pRect = this.layout.plotRect;
    ctx.save();
    ctx.fillStyle = "#e3b341"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(`+${this.headlineLead}h`, pRect.x + 4, pRect.y - 8);
    ctx.restore();
  }
  _renderCrosshair(ctx) {
    const pRect = this.layout.plotRect;
    const { x, y, dist, p } = this.hoverInfo;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1;
    if (typeof ctx.setLineDash === "function") ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(pRect.x, y); ctx.lineTo(pRect.x + pRect.width, y);
    ctx.moveTo(x, pRect.y); ctx.lineTo(x, pRect.y + pRect.height);
    ctx.stroke();
    if (typeof ctx.setLineDash === "function") ctx.setLineDash([]);
    let tooltip = `${Math.round(dist)} km | ${Math.round(p)} hPa`;
    const r = this._sampleAtHover(dist, p);
    if (r.t !== null) tooltip += ` | T: ${r.t.toFixed(1)}°C`;
    if (r.rh !== null) tooltip += ` | RH: ${Math.round(r.rh)}%`;
    if (r.vvel !== null) tooltip += ` | ω: ${r.vvel.toFixed(1)} cPa/s`;
    if (r.wind !== null) tooltip += ` | Wind: ${r.wind.dir}° ${r.wind.speed.toFixed(1)} m/s`;
    ctx.font = "11px -apple-system, sans-serif";
    const textW = ctx.measureText(tooltip).width;
    const badgeX = Math.max(pRect.x + 4, Math.min(pRect.x + pRect.width - textW - 16, x - textW / 2));
    const badgeY = y > pRect.y + 36 ? y - 26 : y + 14;
    ctx.fillStyle = "rgba(22,27,34,0.92)"; ctx.strokeStyle = "#30363d"; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(badgeX, badgeY, textW + 12, 20, 4) : ctx.rect(badgeX, badgeY, textW + 12, 20);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#e6edf3"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(tooltip, badgeX + 6, badgeY + 10);
    ctx.restore();
  }
  _sampleAtHover(dist, p) {
    const { levels, tmp, rh, vvel, u, v } = this.matrix;
    let bestPi = 0, bestD = Infinity;
    for (let i = 0; i < this.distKm.length; i++) {
      const d = Math.abs(this.distKm[i] - dist);
      if (d < bestD) { bestD = d; bestPi = i; }
    }
    let bestLi = 0, bestP = Infinity;
    for (let i = 0; i < levels.length; i++) {
      const d = Math.abs(levels[i] - p);
      if (d < bestP) { bestP = d; bestLi = i; }
    }
    const pick = (m) => (m && !Number.isNaN(m[bestLi][bestPi]) ? m[bestLi][bestPi] : null);
    let wind = null;
    const uu = u?.[bestLi]?.[bestPi], vv = v?.[bestLi]?.[bestPi];
    if (uu !== null && uu !== undefined && vv !== null && vv !== undefined && !Number.isNaN(uu) && !Number.isNaN(vv)) {
      wind = { speed: Math.hypot(uu, vv), dir: Math.round(((Math.atan2(-uu, -vv) * 180) / Math.PI + 360) % 360) };
    }
    return { t: pick(tmp), rh: pick(rh), vvel: pick(vvel), wind };
  }
  exportPNG(filename = "ec_line_height_section.png") {
    if (!this.canvas) return;
    const dataUrl = this.canvas.toDataURL("image/png");
    if (typeof document !== "undefined" && typeof document.createElement === "function") {
      const a = document.createElement("a");
      a.href = dataUrl; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
    return dataUrl;
  }
}
