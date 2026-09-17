// tlogpCanvas.js - High-DPI Canvas 2D skewed thermodynamic diagram renderer
import {
  P_BOTTOM,
  P_TOP,
  T_MIN,
  T_MAX,
  SKEW_FACTOR,
  pressureToY,
  yToPressure,
  tempAndPressureToX,
  xAndYToTemp,
  tempFromPotentialTemperature,
  tempFromSaturationMixingRatio,
  traceMoistAdiabat,
  potentialTemperature,
} from "./tlogpMath.js";
import { drawWindBarbCanvas } from "../station/stationSymbols.js";

const STANDARD_ISOBARS = [1000, 925, 850, 700, 500, 400, 300, 250, 200, 150, 100];
const STANDARD_ISOTHERMS = [-80, -70, -60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40];
const DRY_ADIABATS_THETA = [-20, -10, 0, 10, 20, 30, 40, 50, 60, 80, 100, 120, 140]; // °C
const MOIST_ADIABATS_TW = [-16, -10, -4, 2, 8, 14, 20, 26, 32]; // °C at 1000 hPa
const MIXING_RATIO_W = [0.4, 1, 2, 4, 7, 10, 15, 20]; // g/kg

export class TLogPCanvasRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.options = {
      showTemp: true,
      showDewpoint: true,
      showWind: true,
      showParcel: true,
      showDryAdiabats: true,
      showMoistAdiabats: true,
      showMixingRatio: true,
      ...options,
    };

    this.sounding = null;
    this.parcelResult = null;
    this.hoverPoint = null;
    this.onParcelLevelChange = null;

    this.layout = {
      paddingLeft: 46,
      paddingRight: 60, // Space for wind barbs
      paddingTop: 24,
      paddingBottom: 28,
      plotRect: { x: 0, y: 0, width: 0, height: 0 },
    };

    this._setupEvents();
  }

  setOptions(options) {
    this.options = { ...this.options, ...options };
    this.render();
  }

  setData(sounding, parcelResult) {
    this.sounding = sounding;
    this.parcelResult = parcelResult;
    this.render();
  }

  _setupEvents() {
    if (!this.canvas) return;

    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const pRect = this.layout.plotRect;
      if (x >= pRect.x && x <= pRect.x + pRect.width && y >= pRect.y && y <= pRect.y + pRect.height) {
        this.hoverPoint = { x, y };
      } else {
        this.hoverPoint = null;
      }
      this.render();
    });

    this.canvas.addEventListener("mouseleave", () => {
      this.hoverPoint = null;
      this.render();
    });

    this.canvas.addEventListener("click", (e) => {
      if (!this.onParcelLevelChange) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const pRect = this.layout.plotRect;
      if (x >= pRect.x && x <= pRect.x + pRect.width && y >= pRect.y && y <= pRect.y + pRect.height) {
        const clickedP = Math.round(yToPressure(y, pRect));
        this.onParcelLevelChange("custom", clickedP);
      }
    });
  }

  resize() {
    if (!this.canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const width = this.canvas.clientWidth || 580;
    const height = this.canvas.clientHeight || 480;

    if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
    }

    if (this.ctx) {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    this.layout.plotRect = {
      x: this.layout.paddingLeft,
      y: this.layout.paddingTop,
      width: Math.max(10, width - this.layout.paddingLeft - this.layout.paddingRight),
      height: Math.max(10, height - this.layout.paddingTop - this.layout.paddingBottom),
    };

    this.render();
  }

  render() {
    if (!this.ctx || !this.canvas) return;
    const width = this.canvas.clientWidth || 580;
    const height = this.canvas.clientHeight || 480;
    const ctx = this.ctx;
    const pRect = this.layout.plotRect;

    ctx.clearRect(0, 0, width, height);

    // 1. Background fill
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, width, height);

    // Plot background
    ctx.fillStyle = "#161b22";
    ctx.fillRect(pRect.x, pRect.y, pRect.width, pRect.height);

    // 2. Reference Grid Curves
    this._drawIsobars(ctx, pRect);
    this._drawIsotherms(ctx, pRect);
    if (this.options.showDryAdiabats) this._drawDryAdiabats(ctx, pRect);
    if (this.options.showMoistAdiabats) this._drawMoistAdiabats(ctx, pRect);
    if (this.options.showMixingRatio) this._drawMixingRatioLines(ctx, pRect);

    // 3. Sounding Data & Parcel
    if (this.sounding && Array.isArray(this.sounding.levels) && this.sounding.levels.length > 0) {
      if (this.options.showParcel && this.parcelResult) {
        this._drawBuoyancyShading(ctx, pRect, this.parcelResult);
      }

      if (this.options.showDewpoint) {
        this._drawDewPointCurve(ctx, pRect, this.sounding.levels);
      }

      if (this.options.showTemp) {
        this._drawTempCurve(ctx, pRect, this.sounding.levels);
      }

      if (this.options.showParcel && this.parcelResult) {
        this._drawParcelCurve(ctx, pRect, this.parcelResult);
        this._drawParcelOrigin(ctx, pRect, this.parcelResult);
      }

      if (this.options.showWind) {
        this._drawWindBarbs(ctx, pRect, this.sounding.levels);
      }
    }

    // 4. Border outline
    ctx.strokeStyle = "#30363d";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(pRect.x, pRect.y, pRect.width, pRect.height);

    // 5. Crosshair & Tooltip
    if (this.hoverPoint) {
      this._drawCrosshair(ctx, pRect, this.hoverPoint);
    }
  }

  _drawIsobars(ctx, rect) {
    ctx.save();
    ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (const p of STANDARD_ISOBARS) {
      const y = pressureToY(p, rect);
      if (y < rect.y || y > rect.y + rect.height) continue;

      ctx.strokeStyle = p === 1000 || p === 500 || p === 200 ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = p === 500 ? 1.2 : 0.8;
      ctx.beginPath();
      ctx.moveTo(rect.x, y);
      ctx.lineTo(rect.x + rect.width, y);
      ctx.stroke();

      // Isobar text on left
      ctx.fillStyle = "#8b949e";
      ctx.fillText(`${p}`, rect.x - 6, y);
    }
    ctx.restore();
  }

  _drawIsotherms(ctx, rect) {
    ctx.save();
    ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    // Clip to plot area for isotherm lines
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();

    for (const t of STANDARD_ISOTHERMS) {
      const isZero = t === 0;
      ctx.strokeStyle = isZero ? "rgba(88, 166, 255, 0.45)" : "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = isZero ? 1.5 : 0.8;

      const xBottom = tempAndPressureToX(t, P_BOTTOM, rect);
      const yBottom = rect.y + rect.height;
      const xTop = tempAndPressureToX(t, P_TOP, rect);
      const yTop = rect.y;

      ctx.beginPath();
      ctx.moveTo(xBottom, yBottom);
      ctx.lineTo(xTop, yTop);
      ctx.stroke();
    }
    ctx.restore();

    // Isotherm labels along bottom axis
    ctx.fillStyle = "#8b949e";
    for (const t of STANDARD_ISOTHERMS) {
      const x = tempAndPressureToX(t, P_BOTTOM, rect);
      if (x >= rect.x && x <= rect.x + rect.width) {
        ctx.fillStyle = t === 0 ? "#58a6ff" : "#8b949e";
        ctx.fillText(`${t}°`, x, rect.y + rect.height + 6);
      }
    }
    ctx.restore();
  }

  _drawDryAdiabats(ctx, rect) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();

    ctx.strokeStyle = "rgba(210, 153, 34, 0.15)";
    ctx.lineWidth = 0.8;

    for (const theta of DRY_ADIABATS_THETA) {
      ctx.beginPath();
      let first = true;
      for (let p = P_BOTTOM; p >= P_TOP; p -= 25) {
        const t = tempFromPotentialTemperature(theta, p);
        const x = tempAndPressureToX(t, p, rect);
        const y = pressureToY(p, rect);
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawMoistAdiabats(ctx, rect) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();

    ctx.strokeStyle = "rgba(63, 185, 80, 0.15)";
    ctx.lineWidth = 0.8;

    for (const tw of MOIST_ADIABATS_TW) {
      const points = traceMoistAdiabat(tw, 1000, P_TOP, -15);
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const x = tempAndPressureToX(pt.t, pt.p, rect);
        const y = pressureToY(pt.p, rect);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawMixingRatioLines(ctx, rect) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();

    ctx.strokeStyle = "rgba(139, 148, 158, 0.15)";
    ctx.lineWidth = 0.8;
    if (typeof ctx.setLineDash === "function") {
      ctx.setLineDash([2, 4]);
    }

    for (const w of MIXING_RATIO_W) {
      ctx.beginPath();
      let first = true;
      for (let p = P_BOTTOM; p >= 400; p -= 25) {
        const t = tempFromSaturationMixingRatio(w, p);
        if (t < -60 || t > 40) continue;
        const x = tempAndPressureToX(t, p, rect);
        const y = pressureToY(p, rect);
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
    if (typeof ctx.setLineDash === "function") {
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  _drawBuoyancyShading(ctx, rect, parcelResult) {
    if (!parcelResult || !parcelResult.trajectory || parcelResult.trajectory.length < 2) return;
    const traj = parcelResult.trajectory;

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();

    // Shading between parcel temperature and environmental temperature
    for (let i = 0; i < traj.length - 1; i++) {
      const p1 = traj[i];
      const p2 = traj[i + 1];

      const xP1 = tempAndPressureToX(p1.tParcel, p1.p, rect);
      const y1 = pressureToY(p1.p, rect);
      const xE1 = tempAndPressureToX(p1.tEnv, p1.p, rect);

      const xP2 = tempAndPressureToX(p2.tParcel, p2.p, rect);
      const y2 = pressureToY(p2.p, rect);
      const xE2 = tempAndPressureToX(p2.tEnv, p2.p, rect);

      const avgBuoy = 0.5 * (p1.buoyancy + p2.buoyancy);

      ctx.beginPath();
      ctx.moveTo(xP1, y1);
      ctx.lineTo(xP2, y2);
      ctx.lineTo(xE2, y2);
      ctx.lineTo(xE1, y1);
      ctx.closePath();

      if (avgBuoy > 0) {
        // Positive buoyancy (CAPE): Translucent red-orange
        ctx.fillStyle = "rgba(248, 81, 73, 0.25)";
        ctx.fill();
      } else if (avgBuoy < 0) {
        // Negative buoyancy (CIN): Translucent cyan-blue
        ctx.fillStyle = "rgba(88, 166, 255, 0.25)";
        ctx.fill();
      }
    }

    ctx.restore();
  }

  _drawTempCurve(ctx, rect, levels) {
    const valid = levels.filter((l) => l.pressure >= P_TOP && l.temp > -9000);
    if (valid.length === 0) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();

    ctx.strokeStyle = "#f85149";
    ctx.lineWidth = 2.4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.beginPath();
    for (let i = 0; i < valid.length; i++) {
      const l = valid[i];
      const x = tempAndPressureToX(l.temp, l.pressure, rect);
      const y = pressureToY(l.pressure, rect);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawDewPointCurve(ctx, rect, levels) {
    const valid = levels.filter((l) => l.pressure >= P_TOP && l.dewPoint > -9000);
    if (valid.length === 0) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();

    ctx.strokeStyle = "#39c5bb";
    ctx.lineWidth = 2.4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.beginPath();
    for (let i = 0; i < valid.length; i++) {
      const l = valid[i];
      const x = tempAndPressureToX(l.dewPoint, l.pressure, rect);
      const y = pressureToY(l.pressure, rect);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawParcelCurve(ctx, rect, parcelResult) {
    if (!parcelResult || !parcelResult.trajectory || parcelResult.trajectory.length === 0) return;
    const traj = parcelResult.trajectory;

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();

    ctx.strokeStyle = "#e3b341";
    ctx.lineWidth = 2.0;
    if (typeof ctx.setLineDash === "function") {
      ctx.setLineDash([5, 3]);
    }

    ctx.beginPath();
    for (let i = 0; i < traj.length; i++) {
      const pt = traj[i];
      const x = tempAndPressureToX(pt.tParcel, pt.p, rect);
      const y = pressureToY(pt.p, rect);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (typeof ctx.setLineDash === "function") {
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  _drawParcelOrigin(ctx, rect, parcelResult) {
    const pInit = parcelResult.initialPressure;
    const tInit = parcelResult.initialTemp;
    if (!pInit || tInit === undefined) return;

    const x = tempAndPressureToX(tInit, pInit, rect);
    const y = pressureToY(pInit, rect);

    ctx.save();
    // Halo glow
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(227, 179, 65, 0.4)";
    ctx.fill();

    // Solid center
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#e3b341";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Level tag
    ctx.font = "bold 9px sans-serif";
    ctx.fillStyle = "#e3b341";
    ctx.textAlign = "left";
    ctx.fillText(`${pInit} hPa (${tInit.toFixed(1)}°C)`, x + 8, y + 3);

    ctx.restore();
  }

  _drawWindBarbs(ctx, rect, levels) {
    const valid = levels.filter((l) => l.pressure >= P_TOP && l.windSpeed >= 0 && l.windDir >= 0);
    if (valid.length === 0) return;

    const barbX = rect.x + rect.width + 24;
    let lastY = -999;
    const minSpacing = 16; // Prevent overlapping barbs

    for (let i = 0; i < valid.length; i++) {
      const l = valid[i];
      const y = pressureToY(l.pressure, rect);
      if (y < rect.y || y > rect.y + rect.height) continue;

      if (Math.abs(y - lastY) >= minSpacing) {
        drawWindBarbCanvas(ctx, barbX, y, l.windSpeed, l.windDir, 0.7);
        lastY = y;
      }
    }
  }

  _drawCrosshair(ctx, rect, pt) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1;
    if (typeof ctx.setLineDash === "function") {
      ctx.setLineDash([3, 3]);
    }

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(rect.x, pt.y);
    ctx.lineTo(rect.x + rect.width, pt.y);
    ctx.stroke();

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(pt.x, rect.y);
    ctx.lineTo(pt.x, rect.y + rect.height);
    ctx.stroke();

    if (typeof ctx.setLineDash === "function") {
      ctx.setLineDash([]);
    }

    // Readout calculation
    const p = Math.round(yToPressure(pt.y, rect));
    const t = Math.round(xAndYToTemp(pt.x, pt.y, rect) * 10) / 10;
    const theta = Math.round(potentialTemperature(t, p) * 10) / 10;

    const text = `${p} hPa | ${t}°C | θ=${theta}°C`;
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const textWidth = ctx.measureText(text).width;

    let tipX = pt.x + 12;
    let tipY = pt.y - 12;
    if (tipX + textWidth + 12 > rect.x + rect.width) {
      tipX = pt.x - textWidth - 16;
    }
    if (tipY - 18 < rect.y) {
      tipY = pt.y + 24;
    }

    ctx.fillStyle = "rgba(22, 27, 34, 0.88)";
    ctx.strokeStyle = "#30363d";
    ctx.lineWidth = 1;
    ctx.fillRect(tipX - 4, tipY - 14, textWidth + 10, 20);
    ctx.strokeRect(tipX - 4, tipY - 14, textWidth + 10, 20);

    ctx.fillStyle = "#e6edf3";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, tipX, tipY - 4);

    ctx.restore();
  }
}
