// tlogpPanel.js - Dockable / floating thermodynamic sounding subwindow UI
import { TLogPCanvasRenderer } from "./tlogpCanvas.js";

export const DEFAULT_TLOGP_WIDTH = 620;
export const DEFAULT_TLOGP_HEIGHT = 568;
export const TLOGP_ASPECT_RATIO = DEFAULT_TLOGP_WIDTH / DEFAULT_TLOGP_HEIGHT; // ~1.09155
export const MIN_TLOGP_WIDTH = 420;
export const MIN_TLOGP_HEIGHT = Math.round(MIN_TLOGP_WIDTH / TLOGP_ASPECT_RATIO); // ~385

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
    this.width = DEFAULT_TLOGP_WIDTH;
    this.height = DEFAULT_TLOGP_HEIGHT;
    this.aspectRatio = TLOGP_ASPECT_RATIO;
    this.resizeObserver = null;

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
        width: ${this.width}px;
        height: ${this.height}px;
        max-width: calc(100vw - 40px);
        max-height: calc(100vh - 40px);
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
      el.style.width = `${this.width}px`;
      el.style.height = `${this.height}px`;
      document.body.appendChild(el);
    }
    this.container = el;
    this.container.innerHTML = `
      <!-- Header -->
      <div class="tlogp-header" style="padding: 8px 12px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; align-items: center; justify-content: space-between; cursor: move; user-select: none; flex-shrink: 0;">
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
      <div class="tlogp-body-wrap" style="display: flex; flex-direction: column; width: 100%; flex: 1; min-height: 0;">
        <!-- Parcel Level Selector Toolbar -->
        <div class="tlogp-toolbar" style="padding: 6px 12px; background: #0d1117; border-bottom: 1px solid #21262d; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; flex-shrink: 0;">
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
        <div class="tlogp-canvas-container" style="position: relative; width: 100%; flex: 1; min-height: 180px; background: #0d1117;">
          <canvas class="tlogp-canvas" style="width: 100%; height: 100%; display: block;"></canvas>
        </div>

        <!-- Meteorological Indices Footer -->
        <div class="tlogp-indices-footer" style="padding: 8px 12px; background: #161b22; border-top: 1px solid #30363d; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; font-size: 11px; flex-shrink: 0;">
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

      <!-- Resize Handles (locked aspect ratio) -->
      <div class="tlogp-resize-handle tlogp-resize-se" title="Resize window (keeps aspect ratio)" style="position: absolute; right: 0; bottom: 0; width: 18px; height: 18px; cursor: nwse-resize; z-index: 1010; display: flex; align-items: flex-end; justify-content: flex-end; padding: 3px; user-select: none;">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#6e7681" stroke-width="1.5" stroke-linecap="round">
          <line x1="8" y1="2" x2="2" y2="8" />
          <line x1="8" y1="5" x2="5" y2="8" />
          <line x1="8" y1="8" x2="8" y2="8" />
        </svg>
      </div>
      <div class="tlogp-resize-handle tlogp-resize-e" style="position: absolute; right: 0; top: 40px; bottom: 18px; width: 6px; cursor: ew-resize; z-index: 1009; user-select: none;"></div>
      <div class="tlogp-resize-handle tlogp-resize-s" style="position: absolute; bottom: 0; left: 18px; right: 18px; height: 6px; cursor: ns-resize; z-index: 1009; user-select: none;"></div>
      <div class="tlogp-resize-handle tlogp-resize-sw" title="Resize window (keeps aspect ratio)" style="position: absolute; left: 0; bottom: 0; width: 18px; height: 18px; cursor: nesw-resize; z-index: 1010; display: flex; align-items: flex-end; justify-content: flex-start; padding: 3px; user-select: none;">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#6e7681" stroke-width="1.5" stroke-linecap="round">
          <line x1="2" y1="2" x2="8" y2="8" />
          <line x1="2" y1="5" x2="5" y2="8" />
          <line x1="2" y1="8" x2="2" y2="8" />
        </svg>
      </div>
    `;

    // Initialize Canvas Renderer
    const canvas = this.container.querySelector(".tlogp-canvas");
    this.canvasRenderer = new TLogPCanvasRenderer(canvas);
    this.canvasRenderer.onParcelLevelChange = (level, customP) => {
      this.setParcelLevel(level, customP);
    };

    // Attach ResizeObserver to keep canvas buffer crisp on dimension changes
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.isMinimized && this.canvasRenderer) {
          this.canvasRenderer.resize();
        }
      });
      this.resizeObserver.observe(this.container);
    }

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

    // Initialize Resize Handles
    this._initResizeHandles();
  }

  _initResizeHandles() {
    if (!this.container) return;

    const handles = this.container.querySelectorAll(".tlogp-resize-handle");
    handles.forEach((handle) => {
      const isSE = handle.classList.contains("tlogp-resize-se");
      const isSW = handle.classList.contains("tlogp-resize-sw");
      const isE = handle.classList.contains("tlogp-resize-e");
      const isS = handle.classList.contains("tlogp-resize-s");

      handle.addEventListener("mousedown", (e) => {
        if (this.isMinimized) return;
        e.preventDefault();
        e.stopPropagation();

        let isResizing = true;
        const startX = e.clientX;
        const startY = e.clientY;

        const rect = this.container.getBoundingClientRect();
        const initialLeft = rect.left;
        const initialTop = rect.top;
        const initialRight = rect.right;
        const initialWidth = this.container.offsetWidth || this.width || DEFAULT_TLOGP_WIDTH;
        const initialHeight = this.container.offsetHeight || this.height || DEFAULT_TLOGP_HEIGHT;

        // Switch to left-pinned positioning
        this.container.style.right = "auto";
        this.container.style.left = `${initialLeft}px`;
        this.container.style.top = `${initialTop}px`;

        const ratio = this.aspectRatio;

        const onMouseMove = (moveEvt) => {
          if (!isResizing) return;
          const dx = moveEvt.clientX - startX;
          const dy = moveEvt.clientY - startY;

          const winW = (typeof window !== "undefined" && window.innerWidth) || 1920;
          const winH = (typeof window !== "undefined" && window.innerHeight) || 1080;

          if (isSE) {
            let newWidth, newHeight;
            if (Math.abs(dx) >= Math.abs(dy * ratio)) {
              newWidth = initialWidth + dx;
              newHeight = Math.round(newWidth / ratio);
            } else {
              newHeight = initialHeight + dy;
              newWidth = Math.round(newHeight * ratio);
            }

            const maxW = Math.min(winW - initialLeft - 10, 1600);
            const maxH = winH - initialTop - 10;

            if (newWidth < MIN_TLOGP_WIDTH) {
              newWidth = MIN_TLOGP_WIDTH;
              newHeight = Math.round(newWidth / ratio);
            }
            if (newWidth > maxW) {
              newWidth = maxW;
              newHeight = Math.round(newWidth / ratio);
            }
            if (newHeight > maxH) {
              newHeight = maxH;
              newWidth = Math.round(newHeight * ratio);
            }
            if (newHeight < MIN_TLOGP_HEIGHT) {
              newHeight = MIN_TLOGP_HEIGHT;
              newWidth = Math.round(newHeight * ratio);
            }

            this.setDimensions(newWidth, newHeight);
          } else if (isE) {
            let newWidth = initialWidth + dx;
            let newHeight = Math.round(newWidth / ratio);

            const maxW = Math.min(winW - initialLeft - 10, 1600);
            const maxH = winH - initialTop - 10;

            if (newWidth < MIN_TLOGP_WIDTH) {
              newWidth = MIN_TLOGP_WIDTH;
              newHeight = Math.round(newWidth / ratio);
            }
            if (newWidth > maxW) {
              newWidth = maxW;
              newHeight = Math.round(newWidth / ratio);
            }
            if (newHeight > maxH) {
              newHeight = maxH;
              newWidth = Math.round(newHeight * ratio);
            }

            this.setDimensions(newWidth, newHeight);
          } else if (isS) {
            let newHeight = initialHeight + dy;
            let newWidth = Math.round(newHeight * ratio);

            const maxW = Math.min(winW - initialLeft - 10, 1600);
            const maxH = winH - initialTop - 10;

            if (newHeight < MIN_TLOGP_HEIGHT) {
              newHeight = MIN_TLOGP_HEIGHT;
              newWidth = Math.round(newHeight * ratio);
            }
            if (newHeight > maxH) {
              newHeight = maxH;
              newWidth = Math.round(newHeight * ratio);
            }
            if (newWidth > maxW) {
              newWidth = maxW;
              newHeight = Math.round(newWidth / ratio);
            }

            this.setDimensions(newWidth, newHeight);
          } else if (isSW) {
            let newWidth, newHeight;
            if (Math.abs(dx) >= Math.abs(dy * ratio)) {
              newWidth = initialWidth - dx;
              newHeight = Math.round(newWidth / ratio);
            } else {
              newHeight = initialHeight + dy;
              newWidth = Math.round(newHeight * ratio);
            }

            const maxW = Math.min(initialRight - 10, 1600);
            const maxH = winH - initialTop - 10;

            if (newWidth < MIN_TLOGP_WIDTH) {
              newWidth = MIN_TLOGP_WIDTH;
              newHeight = Math.round(newWidth / ratio);
            }
            if (newWidth > maxW) {
              newWidth = maxW;
              newHeight = Math.round(newWidth / ratio);
            }
            if (newHeight > maxH) {
              newHeight = maxH;
              newWidth = Math.round(newHeight * ratio);
            }

            const newLeft = initialRight - newWidth;
            if (newLeft >= 10) {
              this.container.style.left = `${newLeft}px`;
              this.setDimensions(newWidth, newHeight);
            }
          }
        };

        const onMouseUp = () => {
          isResizing = false;
          if (typeof window !== "undefined") {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
          }
          if (this.canvasRenderer) {
            this.canvasRenderer.resize();
          }
        };

        if (typeof window !== "undefined") {
          window.addEventListener("mousemove", onMouseMove);
          window.addEventListener("mouseup", onMouseUp);
        }
      });

      // Double click on bottom-right handle resets to default size
      if (isSE) {
        handle.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          this.setDimensions(DEFAULT_TLOGP_WIDTH, DEFAULT_TLOGP_HEIGHT);
        });
      }
    });
  }

  /**
   * Sets subwindow width and height maintaining the required aspect ratio.
   *
   * @param {number} width
   * @param {number|null} [height=null]
   */
  setDimensions(width, height = null) {
    if (!this.container) return;
    const w = Math.round(width);
    const h = height !== null ? Math.round(height) : Math.round(w / this.aspectRatio);

    this.width = w;
    this.height = h;

    this.container.style.width = `${w}px`;
    if (!this.isMinimized) {
      this.container.style.height = `${h}px`;
    }

    if (this.canvasRenderer) {
      this.canvasRenderer.resize();
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
    const handles = this.container.querySelectorAll(".tlogp-resize-handle");

    if (body) {
      body.style.display = this.isMinimized ? "none" : "flex";
    }
    if (btn) {
      btn.textContent = this.isMinimized ? "□" : "—";
    }

    if (this.isMinimized) {
      this.container.style.height = "auto";
      handles.forEach((h) => (h.style.display = "none"));
    } else {
      this.container.style.height = `${this.height || DEFAULT_TLOGP_HEIGHT}px`;
      handles.forEach((h) => (h.style.display = "flex"));
      if (this.canvasRenderer) {
        setTimeout(() => {
          if (this.canvasRenderer) this.canvasRenderer.resize();
        }, 50);
      }
    }
  }

  show() {
    if (!this.container) return;
    this.container.style.display = "flex";
    if (!this.isMinimized) {
      this.container.style.height = `${this.height || DEFAULT_TLOGP_HEIGHT}px`;
    }
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
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.canvasRenderer = null;
  }
}
