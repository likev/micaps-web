// hovmollerCanvas.js - Time-Line diagram with swappable axes + revertible time (display-only)
import { createColorResolver } from "../../utils/colormaps.js";
import { decimateStride } from "./lineUtils.js";
import { renderHovRHFill, renderHovLines, renderHovBarbs } from "./lineIsolines.js";

export class HovmollerCanvasRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.options = { showRH: true, showTemp: true, showVVel: true, showWind: true, axisSwap: "dist-x", timeDir: "fwd", ...options };
    this.matrix = null; this.distKm = []; this.totalKm = 0;
    this.hoverInfo = null; this.width = 640; this.height = 480;
    this.layout = { paddingLeft: 56, paddingRight: 32, paddingTop: 28, paddingBottom: 40, plotRect: { x: 0, y: 0, width: 0, height: 0 } };
    this.rhColorResolver = createColorResolver("RH");
    this._setupEvents();
  }
  setOptions(o) { this.options = { ...this.options, ...o }; this.render(); }
  setView(axisSwap, timeDir) {
    if (axisSwap === "dist-x" || axisSwap === "time-x") this.options.axisSwap = axisSwap;
    if (timeDir === "fwd" || timeDir === "rev") this.options.timeDir = timeDir;
    this.render();
  }
  setData(matrix, distKm = null) {
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
    this.render();
  }
  get swapped() { return this.options.axisSwap === "time-x"; }
  get rev() { return this.options.timeDir === "rev"; }
  leads() { return this.matrix?.leads || []; }
  // Time fraction with revert: fwd 0->end left-to-right/top-to-bottom; rev mirrored
  leadFrac(lead) {
    const ls = this.leads();
    if (!ls.length) return 0;
    const s = ls[0], e = ls[ls.length - 1];
    if (s === e) return 0;
    const f = (lead - s) / (e - s);
    return this.rev ? 1 - f : f;
  }
  fracToLead(frac) {
    const ls = this.leads();
    if (!ls.length) return 0;
    const s = ls[0], e = ls[ls.length - 1];
    const f = this.rev ? 1 - frac : frac;
    return s + f * (e - s);
  }
  distFrac(d) { return this.totalKm ? Math.max(0, Math.min(1, d / this.totalKm)) : 0; }
  fracToDist(frac) { return frac * this.totalKm; }
  // Pixel mappers: u/v generic binding (swap = rebind axes)
  uFn(a, b) {
    const p = this.layout.plotRect;
    if (!this.swapped) return p.x + this.distFrac(a) * p.width;
    return p.x + this.leadFrac(a) * p.width;
  }
  vFn(a, b) {
    const p = this.layout.plotRect;
    if (!this.swapped) return p.y + this.leadFrac(b) * p.height;
    // time-x: Y=distance, 0 bottom always
    return p.y + p.height - this.distFrac(b) * p.height;
  }
  cellBounds(li, pi) {
    const p = this.layout.plotRect;
    const ls = this.leads();
    if (!this.swapped) {
      const x0 = p.x + this.distFrac(this.distKm[pi]) * p.width;
      const x1 = p.x + this.distFrac(this.distKm[pi + 1]) * p.width;
      const y0 = p.y + this.leadFrac(ls[li]) * p.height;
      const y1 = p.y + this.leadFrac(ls[li + 1]) * p.height;
      return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
    }
    const x0 = p.x + this.leadFrac(ls[li]) * p.width;
    const x1 = p.x + this.leadFrac(ls[li + 1]) * p.width;
    const y0 = p.y + p.height - this.distFrac(this.distKm[pi]) * p.height;
    const y1 = p.y + p.height - this.distFrac(this.distKm[pi + 1]) * p.height;
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  }
  pxFor(li, pi) {
    if (!this.swapped) return [this.uFn(this.distKm[pi], this.leads()[li]), this.vFn(this.distKm[pi], this.leads()[li])];
    return [this.uFn(this.leads()[li], this.distKm[pi]), this.vFn(this.leads()[li], this.distKm[pi])];
  }
  invertPixel(x, y) {
    const p = this.layout.plotRect;
    const fx = Math.max(0, Math.min(1, (x - p.x) / p.width));
    const fy = Math.max(0, Math.min(1, (y - p.y) / p.height));
    if (!this.swapped) return { lead: this.fracToLead(fy), dist: this.fracToDist(fx) };
    return { lead: this.fracToLead(fx), dist: this.fracToDist(1 - fy) };
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
      const pr = this.layout.plotRect;
      if (x >= pr.x && x <= pr.x + pr.width && y >= pr.y && y <= pr.y + pr.height) {
        const inv = this.invertPixel(x, y);
        this.hoverInfo = { x, y, ...inv };
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
      ctx.fillText("Set level + span, draw a line, or wait for Time-Line matrix...", pRect.x + pRect.width / 2, pRect.y + pRect.height / 2);
      return;
    }
    const ls = this.leads();
    if (this.options.showRH) {
      renderHovRHFill(ctx, this.matrix, this.layout, this.distKm, this.rhColorResolver, (li, pi) => this.cellBounds(li, pi));
    }
    this._renderAxes(ctx);
    if (this.options.showTemp) {
      const coords = !this.swapped ? { u: this.distKm, v: ls } : { u: ls, v: this.distKm };
      renderHovLines(ctx, this.matrix, this.layout, this.matrix.tmp, this.distKm, (a, b) => this.uFn(a, b), (a, b) => this.vFn(a, b), coords, "tmp");
    }
    if (this.options.showVVel) {
      const coords = !this.swapped ? { u: this.distKm, v: ls } : { u: ls, v: this.distKm };
      renderHovLines(ctx, this.matrix, this.layout, this.matrix.vvel, this.distKm, (a, b) => this.uFn(a, b), (a, b) => this.vFn(a, b), coords, "vvel");
    }
    if (this.options.showWind) {
      const stride = decimateStride(this.distKm.length, ls.length);
      const s2 = Math.max(stride, this.distKm.length * ls.length > 300 ? 2 : 1);
      renderHovBarbs(ctx, this.matrix, this.layout, this.distKm, (li, pi) => this.pxFor(li, pi), s2);
    }
    if (this.hoverInfo) this._renderCrosshair(ctx);
  }
  _renderAxes(ctx) {
    const pRect = this.layout.plotRect;
    const ls = this.leads();
    const L = this.totalKm;
    ctx.save();
    ctx.strokeStyle = "#30363d"; ctx.lineWidth = 1;
    ctx.strokeRect(pRect.x, pRect.y, pRect.width, pRect.height);
    ctx.font = "11px -apple-system, monospace";
    if (!this.swapped) {
      // X=dist ticks
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      for (const d of [0, L / 4, L / 2, (3 * L) / 4, L]) {
        const px = pRect.x + this.distFrac(d) * pRect.width;
        ctx.strokeStyle = "#21262d"; ctx.beginPath(); ctx.moveTo(px, pRect.y); ctx.lineTo(px, pRect.y + pRect.height); ctx.stroke();
        ctx.fillStyle = "#8b949e"; ctx.fillText(`${Math.round(d)}`, px, pRect.y + pRect.height + 6);
      }
      ctx.fillStyle = "#6e7681"; ctx.font = "10px sans-serif";
      ctx.fillText(`distance A→B (km) · 0 … ${Math.round(L)}`, pRect.x + pRect.width / 2, pRect.y + pRect.height + 20);
      // Y=lead ticks
      ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.font = "11px -apple-system, monospace";
      for (const ld of ls) {
        const py = pRect.y + this.leadFrac(ld) * pRect.height;
        ctx.strokeStyle = "#21262d"; ctx.beginPath(); ctx.moveTo(pRect.x, py); ctx.lineTo(pRect.x + pRect.width, py); ctx.stroke();
        ctx.fillStyle = "#8b949e"; ctx.fillText(`+${ld}h`, pRect.x - 6, py);
      }
    } else {
      // X=lead ticks
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      for (const ld of ls) {
        const px = pRect.x + this.leadFrac(ld) * pRect.width;
        ctx.strokeStyle = "#21262d"; ctx.beginPath(); ctx.moveTo(px, pRect.y); ctx.lineTo(px, pRect.y + pRect.height); ctx.stroke();
        ctx.fillStyle = "#8b949e"; ctx.fillText(`+${ld}h`, px, pRect.y + pRect.height + 6);
      }
      ctx.fillStyle = "#6e7681"; ctx.font = "10px sans-serif";
      const s = ls[0] ?? 0, e = ls[ls.length - 1] ?? 0;
      ctx.fillText(this.rev ? `lead ${e}→${s}h` : `lead ${s}→${e}h`, pRect.x + pRect.width / 2, pRect.y + pRect.height + 20);
      // Y=dist ticks
      ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.font = "11px -apple-system, monospace";
      for (const d of [0, L / 4, L / 2, (3 * L) / 4, L]) {
        const py = pRect.y + pRect.height - this.distFrac(d) * pRect.height;
        ctx.strokeStyle = "#21262d"; ctx.beginPath(); ctx.moveTo(pRect.x, py); ctx.lineTo(pRect.x + pRect.width, py); ctx.stroke();
        ctx.fillStyle = "#8b949e"; ctx.fillText(`${Math.round(d)}`, pRect.x - 6, py);
      }
    }
    // View badge
    ctx.fillStyle = "#e3b341"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    const s0 = ls[0] ?? 0, e0 = ls[ls.length - 1] ?? 0;
    const tLbl = this.rev ? `${e0}→${s0}h` : `${s0}→${e0}h`;
    ctx.fillText(`[X:${this.swapped ? "time" : "dist"} · ${tLbl}]`, pRect.x + 4, pRect.y - 6);
    ctx.restore();
  }
  _renderCrosshair(ctx) {
    const pRect = this.layout.plotRect;
    const { x, y, lead, dist } = this.hoverInfo;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1;
    if (typeof ctx.setLineDash === "function") ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(pRect.x, y); ctx.lineTo(pRect.x + pRect.width, y);
    ctx.moveTo(x, pRect.y); ctx.lineTo(x, pRect.y + pRect.height);
    ctx.stroke();
    if (typeof ctx.setLineDash === "function") ctx.setLineDash([]);
    let tooltip = !this.swapped ? `+${Math.round(lead)}h | ${Math.round(dist)} km` : `${Math.round(dist)} km | +${Math.round(lead)}h`;
    const r = this._sampleAtHover(lead, dist);
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
  _sampleAtHover(lead, dist) {
    const { leads, tmp, rh, vvel, u, v } = this.matrix;
    let li = 0, bd = Infinity;
    for (let i = 0; i < leads.length; i++) { const d = Math.abs(leads[i] - lead); if (d < bd) { bd = d; li = i; } }
    let pi = 0, bdd = Infinity;
    for (let i = 0; i < this.distKm.length; i++) { const d = Math.abs(this.distKm[i] - dist); if (d < bdd) { bdd = d; pi = i; } }
    const pick = (m) => (m && !Number.isNaN(m[li][pi]) ? m[li][pi] : null);
    let wind = null;
    const uu = u?.[li]?.[pi], vv = v?.[li]?.[pi];
    if (uu !== null && uu !== undefined && vv !== null && vv !== undefined && !Number.isNaN(uu) && !Number.isNaN(vv)) {
      wind = { speed: Math.hypot(uu, vv), dir: Math.round(((Math.atan2(-uu, -vv) * 180) / Math.PI + 360) % 360) };
    }
    return { t: pick(tmp), rh: pick(rh), vvel: pick(vvel), wind };
  }
  exportPNG(filename = "ec_hovmoller.png") {
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
