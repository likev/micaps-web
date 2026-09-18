// tlogpPanel.js - Dockable / floating thermodynamic sounding subwindow UI
import { TLogPCanvasRenderer } from "./tlogpCanvas.js";

export class TLogPPanel {
  constructor(options = {}) {
    this.options = {
      defaultStationId: "58362",
      onParcelLevelChange: null,
      onClose: null,
      ...options,
    };

    this.container = null;
    this.canvasRenderer = null;
    this.activeParcelLevel = "surface";
    this.isMinimized = false;
    this.sounding = null;
    this.parcelResult = null;

    this._initDOM();
  }

  _initDOM() {
    if (typeof document === "undefined" || typeof document.getElementById !== "function" || typeof document.createElement !== "function") return;

    let el = document.getElementById("tlogp-panel");
    if (!el) {
      el = document.createElement("div");
      el.id = "tlogp-panel";
      el.className = "tlogp-subwindow";
      el.style.cssText = `
        position: absolute;
        top: 60px;
        right: 20px;
        width: 620px;
        max-width: calc(100vw - 40px);
        background: #0d1117;
        border: 1px solid #30363d;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
        z-index: 1000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      `;
      document.body.appendChild(el);
    }
    this.container = el;
    this.container.innerHTML = `
      <!-- Header -->
      <div class="tlogp-header" style="padding: 8px 12px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; align-items: center; justify-content: space-between; cursor: move; user-select: none;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="tlogp-stn-badge" style="background: #238636; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">58362</span>
          <span class="tlogp-stn-name" style="color: #f0f6fc; font-size: 13px; font-weight: 600;">上海/宝山 (Shanghai)</span>
          <span class="tlogp-stn-meta" style="color: #8b949e; font-size: 11px;">(31.39°N, 121.44°E, 5.5m)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span class="tlogp-obs-time" style="color: #8b949e; font-size: 11px; margin-right: 6px;">--</span>
          <button class="tlogp-btn-export" title="Export PNG" style="background: transparent; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; padding: 2px 6px; font-size: 11px; cursor: pointer;">📷</button>
          <button class="tlogp-btn-min" title="Minimize / Restore" style="background: transparent; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; padding: 2px 6px; font-size: 11px; cursor: pointer;">—</button>
          <button class="tlogp-btn-close" title="Close" style="background: transparent; border: 1px solid #30363d; color: #f85149; border-radius: 4px; padding: 2px 6px; font-size: 11px; cursor: pointer;">✕</button>
        </div>
      </div>

      <!-- Content wrapper (collapsible) -->
      <div class="tlogp-body-wrap" style="display: flex; flex-direction: column; width: 100%;">
        <!-- Parcel Level Selector Toolbar -->
        <div class="tlogp-toolbar" style="padding: 6px 12px; background: #0d1117; border-bottom: 1px solid #21262d; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="color: #8b949e; font-size: 11px; font-weight: 600; margin-right: 4px;">🔺 Parcel Origin:</span>
            <div class="tlogp-parcel-btns" style="display: flex; gap: 2px;">
              <button class="tlogp-btn-level active" data-level="surface" style="height: 22px; padding: 0 8px; font-size: 11px; font-weight: 600; border-radius: 4px; border: 1px solid #388bfd; background: #1f6feb; color: #fff; cursor: pointer;">Surface</button>
              <button class="tlogp-btn-level" data-level="925" style="height: 22px; padding: 0 8px; font-size: 11px; font-weight: 600; border-radius: 4px; border: 1px solid #30363d; background: #21262d; color: #c9d1d9; cursor: pointer;">925</button>
              <button class="tlogp-btn-level" data-level="850" style="height: 22px; padding: 0 8px; font-size: 11px; font-weight: 600; border-radius: 4px; border: 1px solid #30363d; background: #21262d; color: #c9d1d9; cursor: pointer;">850</button>
              <button class="tlogp-btn-level" data-level="700" style="height: 22px; padding: 0 8px; font-size: 11px; font-weight: 600; border-radius: 4px; border: 1px solid #30363d; background: #21262d; color: #c9d1d9; cursor: pointer;">700</button>
              <button class="tlogp-btn-level" data-level="custom" style="height: 22px; padding: 0 8px; font-size: 11px; font-weight: 600; border-radius: 4px; border: 1px solid #30363d; background: #21262d; color: #c9d1d9; cursor: pointer;">Custom</button>
            </div>
          </div>
          <div class="tlogp-parcel-summary" style="font-size: 11px; color: #e3b341; font-weight: 600;">
            CAPE: -- J/kg | CIN: -- J/kg
          </div>
        </div>

        <!-- Canvas Container -->
        <div class="tlogp-canvas-container" style="position: relative; width: 100%; height: 440px; background: #0d1117;">
          <canvas class="tlogp-canvas" style="width: 100%; height: 100%; display: block;"></canvas>
        </div>

        <!-- Meteorological Indices Footer -->
        <div class="tlogp-indices-footer" style="padding: 8px 12px; background: #161b22; border-top: 1px solid #30363d; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; font-size: 11px;">
          <div class="tlogp-idx-card" style="background: #0d1117; border: 1px solid #21262d; border-radius: 4px; padding: 4px 6px;">
            <div style="color: #8b949e; font-size: 10px;">CAPE / CIN</div>
            <div class="val-cape-cin" style="color: #f85149; font-weight: 700;">-- / -- J/kg</div>
          </div>
          <div class="tlogp-idx-card" style="background: #0d1117; border: 1px solid #21262d; border-radius: 4px; padding: 4px 6px;">
            <div style="color: #8b949e; font-size: 10px;">LCL / LFC</div>
            <div class="val-lcl-lfc" style="color: #58a6ff; font-weight: 700;">-- / -- hPa</div>
          </div>
          <div class="tlogp-idx-card" style="background: #0d1117; border: 1px solid #21262d; border-radius: 4px; padding: 4px 6px;">
            <div style="color: #8b949e; font-size: 10px;">K / TT Index</div>
            <div class="val-k-tt" style="color: #e3b341; font-weight: 700;">-- / -- °C</div>
          </div>
          <div class="tlogp-idx-card" style="background: #0d1117; border: 1px solid #21262d; border-radius: 4px; padding: 4px 6px;">
            <div style="color: #8b949e; font-size: 10px;">SI / PW</div>
            <div class="val-si-pw" style="color: #39c5bb; font-weight: 700;">-- °C / -- mm</div>
          </div>
        </div>
      </div>
    `;

    // Initialize Canvas Renderer
    const canvas = this.container.querySelector(".tlogp-canvas");
    this.canvasRenderer = new TLogPCanvasRenderer(canvas);
    this.canvasRenderer.onParcelLevelChange = (level, customP) => {
      this.setParcelLevel(level, customP);
    };

    this._bindEvents();
  }

  _bindEvents() {
    if (!this.container) return;

    // Window controls
    const btnMin = this.container.querySelector(".tlogp-btn-min");
    if (btnMin) {
      btnMin.addEventListener("click", () => this.toggleMinimize());
    }

    const btnClose = this.container.querySelector(".tlogp-btn-close");
    if (btnClose) {
      btnClose.addEventListener("click", () => {
        this.hide();
        if (typeof this.options.onClose === "function") {
          this.options.onClose();
        }
      });
    }

    const btnExport = this.container.querySelector(".tlogp-btn-export");
    if (btnExport) {
      btnExport.addEventListener("click", () => this.exportPNG());
    }

    // Parcel level buttons
    const btns = this.container.querySelectorAll(".tlogp-btn-level");
    btns.forEach((b) => {
      b.addEventListener("click", (e) => {
        const lvl = e.target.getAttribute("data-level");
        const p = lvl === "custom" ? (this.customPressure || 700) : null;
        this.setParcelLevel(lvl, p);
      });
    });

    // Make header draggable
    const header = this.container.querySelector(".tlogp-header");
    if (header) {
      let isDragging = false;
      let startX, startY, initialLeft, initialTop;

      header.addEventListener("mousedown", (e) => {
        if (e.target.tagName === "BUTTON") return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = this.container.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        this.container.style.right = "auto"; // Switch from right to left positioning
        this.container.style.left = `${initialLeft}px`;
        this.container.style.top = `${initialTop}px`;

        const onMouseMove = (moveEvt) => {
          if (!isDragging) return;
          const dx = moveEvt.clientX - startX;
          const dy = moveEvt.clientY - startY;
          this.container.style.left = `${Math.max(10, initialLeft + dx)}px`;
          this.container.style.top = `${Math.max(10, initialTop + dy)}px`;
        };

        const onMouseUp = () => {
          isDragging = false;
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
      });
    }
  }

  setParcelLevel(level, customPressure = null, silent = false) {
    this.parcelLevel = level;
    this.activeParcelLevel = level;
    this.customPressure = customPressure;

    if (this.container && typeof this.container.querySelectorAll === "function") {
      const btns = this.container.querySelectorAll(".tlogp-btn-parcel, .tlogp-btn-level");
      btns.forEach((b) => {
        if (b.getAttribute("data-level") === String(level)) {
          b.style.background = "#1f6feb";
          b.style.borderColor = "#388bfd";
          b.style.color = "#fff";
        } else {
          b.style.background = "#21262d";
          b.style.borderColor = "#30363d";
          b.style.color = "#c9d1d9";
        }
      });
    }

    if (!silent && typeof this.options.onParcelLevelChange === "function") {
      this.options.onParcelLevelChange(level, customPressure);
    }
  }

  update(sounding, parcelResult) {
    this.sounding = sounding;
    this.parcelResult = parcelResult;

    if (!this.container) return;

    // Update Header
    if (sounding) {
      const badge = this.container.querySelector(".tlogp-stn-badge");
      if (badge) badge.textContent = sounding.stationId || "--";

      const nameEl = this.container.querySelector(".tlogp-stn-name");
      if (nameEl) nameEl.textContent = sounding.stationName || `Station ${sounding.stationId}`;

      const metaEl = this.container.querySelector(".tlogp-stn-meta");
      if (metaEl && sounding.lat !== undefined) {
        metaEl.textContent = `(${sounding.lat.toFixed(2)}°N, ${sounding.lon.toFixed(2)}°E, ${sounding.elevation || 0}m)`;
      }

      const timeEl = this.container.querySelector(".tlogp-obs-time");
      if (timeEl && sounding.obsTime) {
        timeEl.textContent = sounding.obsTime;
      }
    }

    // Update Parcel Summary
    const sumEl = this.container.querySelector(".tlogp-parcel-summary");
    if (sumEl && parcelResult) {
      sumEl.textContent = `CAPE: ${parcelResult.cape} J/kg | CIN: ${parcelResult.cin} J/kg`;
    }

    // Update Indices Footer
    if (parcelResult && parcelResult.indices) {
      const idx = parcelResult.indices;
      const capeCin = this.container.querySelector(".val-cape-cin");
      if (capeCin) capeCin.textContent = `${parcelResult.cape} / ${parcelResult.cin} J/kg`;

      const lclLfc = this.container.querySelector(".val-lcl-lfc");
      if (lclLfc) {
        const lfcStr = idx.pLFC ? `${idx.pLFC} hPa` : "None";
        lclLfc.textContent = `${idx.pLCL} / ${lfcStr}`;
      }

      const kTt = this.container.querySelector(".val-k-tt");
      if (kTt) {
        const kStr = idx.kIndex !== null ? `${idx.kIndex}°C` : "--";
        const ttStr = idx.totalTotals !== null ? `${idx.totalTotals}°C` : "--";
        kTt.textContent = `${kStr} / ${ttStr}`;
      }

      const siPw = this.container.querySelector(".val-si-pw");
      if (siPw) {
        const siStr = idx.showalterIndex !== null ? `${idx.showalterIndex}°C` : "--";
        const pwStr = idx.precipitableWater !== null ? `${idx.precipitableWater}mm` : "--";
        siPw.textContent = `${siStr} / ${pwStr}`;
      }
    }

    // Update Canvas
    if (this.canvasRenderer) {
      this.canvasRenderer.resize();
      this.canvasRenderer.setData(sounding, parcelResult);
    }
  }

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    const body = this.container.querySelector(".tlogp-body-wrap");
    const btn = this.container.querySelector(".tlogp-btn-min");
    if (body) {
      body.style.display = this.isMinimized ? "none" : "flex";
    }
    if (btn) {
      btn.textContent = this.isMinimized ? "□" : "—";
    }
    if (!this.isMinimized && this.canvasRenderer) {
      setTimeout(() => {
        if (this.canvasRenderer) this.canvasRenderer.resize();
      }, 50);
    }
  }

  show() {
    if (!this.container) return;
    this.container.style.display = "flex";
    if (this.canvasRenderer) {
      setTimeout(() => {
        if (this.canvasRenderer) this.canvasRenderer.resize();
      }, 50);
    }
  }

  hide() {
    if (!this.container) return;
    this.container.style.display = "none";
  }

  exportPNG() {
    if (!this.canvasRenderer || !this.canvasRenderer.canvas) return;
    const canvas = this.canvasRenderer.canvas;
    const stn = this.sounding ? this.sounding.stationId : "sounding";
    const time = this.sounding ? this.sounding.obsTime.replace(/[: -]/g, "") : "now";

    const a = document.createElement("a");
    a.download = `TLOGP_${stn}_${time}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  }

  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.canvasRenderer = null;
  }
}
