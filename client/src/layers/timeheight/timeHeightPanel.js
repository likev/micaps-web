// timeHeightPanel.js - Dockable / floating time-height profile diagram window with controls and progress bar
import { TimeHeightCanvasRenderer } from "./timeHeightCanvas.js";
import { SUPPORTED_STEPS } from "./timeHeightLoader.js";

export const DEFAULT_TH_WIDTH = 680;
export const DEFAULT_TH_HEIGHT = 520;
export const TH_ASPECT_RATIO = DEFAULT_TH_WIDTH / DEFAULT_TH_HEIGHT;
export const MIN_TH_WIDTH = 480;
export const MIN_TH_HEIGHT = Math.round(MIN_TH_WIDTH / TH_ASPECT_RATIO);

export class TimeHeightPanel {
  constructor(options = {}) {
    this.options = {
      windowId: "default",
      defaultPoint: { lon: 121.5, lat: 31.4 },
      startHour: 0,
      endHour: 144,
      stepHours: 12,
      timeDirection: "ltr",
      onRangeChange: null,
      onCycleChange: null,
      onDirectionChange: null,
      onToggleElement: null,
      onCancel: null,
      onClose: null,
      ...options,
    };

    this.container = null;
    this.canvasRenderer = null;
    this.isMinimized = false;
    this.matrix = null;
    this.width = DEFAULT_TH_WIDTH;
    this.height = DEFAULT_TH_HEIGHT;
    this.aspectRatio = TH_ASPECT_RATIO;
    this.activePoint = { ...this.options.defaultPoint };
    this.activeCycle = null;
    this.availableCycles = [];
    this.timeDirection = this.options.timeDirection || "ltr";
    this.resizeObserver = null;

    this._initDOM();
  }

  _initDOM() {
    if (typeof document === "undefined" || typeof document.getElementById !== "function") return;

    const panelId = `timeheight-panel-${this.options.windowId || "default"}`;
    let el = document.getElementById(panelId);
    if (!el) {
      el = document.createElement("div");
      el.id = panelId;
      el.className = "timeheight-subwindow";
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
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65);
        z-index: 1000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      `;
      document.body.appendChild(el);
    }
    this.container = el;

    el.innerHTML = `
      <!-- Header -->
      <div class="th-panel-header" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #161b22; border-bottom: 1px solid #30363d; cursor: move; user-select: none; flex-shrink: 0;">
        <div style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 12px; color: #e6edf3;">
          <span style="background: #1f6feb; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px;">ECMWF_HR</span>
          <span class="th-header-title">EC Time-Height Cross-Section</span>
          <span class="th-header-coords" style="font-size: 11px; color: #8b949e; font-weight: 400;">(${this.activePoint.lon.toFixed(2)}°E, ${this.activePoint.lat.toFixed(2)}°N)</span>
          <span class="th-header-cycle" style="font-size: 11px; color: #3fb950; font-weight: 500;"></span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <button class="th-btn-export" title="Export PNG image" style="background: transparent; border: 1px solid #30363d; color: #8b949e; border-radius: 4px; width: 26px; height: 26px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M7.47 10.78a.75.75 0 001.06 0l3.75-3.75a.75.75 0 00-1.06-1.06L8.75 8.44V1.75a.75.75 0 00-1.5 0v6.69L4.78 5.97a.75.75 0 00-1.06 1.06l3.75 3.75zM3.75 13a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5z"/></svg>
          </button>
          <button class="th-btn-min" title="Minimize window" style="background: transparent; border: 1px solid #30363d; color: #8b949e; border-radius: 4px; width: 26px; height: 26px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2 8a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H2.75A.75.75 0 012 8z"/></svg>
          </button>
          <button class="th-btn-close" title="Close diagram" style="background: transparent; border: 1px solid #30363d; color: #8b949e; border-radius: 4px; width: 26px; height: 26px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>
          </button>
        </div>
      </div>

      <!-- Controls row -->
      <div class="th-controls-row" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 6px 12px; background: #161b22; border-bottom: 1px solid #21262d; font-size: 11px; color: #c9d1d9; flex-shrink: 0;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span>Init:</span>
          <select class="th-select-cycle" style="background: #0d1117; border: 1px solid #30363d; color: #58a6ff; border-radius: 4px; padding: 2px 6px; font-size: 11px; cursor: pointer;"></select>
          <span style="margin-left: 6px;">Span:</span>
          <input type="number" class="th-input-start" value="${this.options.startHour}" min="0" max="240" step="12" style="width: 44px; background: #0d1117; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; padding: 2px 4px; text-align: center; font-size: 11px;" />
          <span>–</span>
          <input type="number" class="th-input-end" value="${this.options.endHour}" min="12" max="240" step="12" style="width: 44px; background: #0d1117; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; padding: 2px 4px; text-align: center; font-size: 11px;" />
          <span>h</span>
          <select class="th-select-step" style="background: #0d1117; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; padding: 2px 4px; font-size: 11px; cursor: pointer;">
            ${SUPPORTED_STEPS.map((s) => `<option value="${s}" ${s === this.options.stepHours ? "selected" : ""}>@${s}h</option>`).join("")}
          </select>
          <button class="th-btn-apply" style="background: #21262d; border: 1px solid #30363d; color: #58a6ff; border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer;">Apply</button>
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <!-- Time Direction Toggle -->
          <button class="th-btn-direction" title="Toggle time axis direction (left-to-right vs right-to-left)" style="background: #21262d; border: 1px solid #30363d; color: #e3b341; border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer;">
            ${this.timeDirection === "rtl" ? "⇄ 144→0h" : "⇄ 0→144h"}
          </button>
          <!-- Display Layer Toggles -->
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;"><input type="checkbox" class="th-cb-rh" checked /> <span style="color: #56d4dd;">RH</span></label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;"><input type="checkbox" class="th-cb-temp" checked /> <span style="color: #f85149;">T</span></label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;"><input type="checkbox" class="th-cb-vvel" checked /> <span style="color: #39c5bb;">VVEL</span></label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;"><input type="checkbox" class="th-cb-wind" checked /> <span style="color: #58a6ff;">Wind</span></label>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="th-progress-wrap" style="display: none; padding: 6px 12px; background: #161b22; border-bottom: 1px solid #30363d; align-items: center; gap: 8px; font-size: 11px; flex-shrink: 0;">
        <div style="flex: 1; height: 8px; background: #21262d; border-radius: 4px; overflow: hidden;">
          <div class="th-progress-bar" style="width: 0%; height: 100%; background: #1f6feb; border-radius: 4px; transition: width 0.1s ease;"></div>
        </div>
        <span class="th-progress-label" style="color: #8b949e; min-width: 140px; text-align: right;">Loading...</span>
        <button class="th-btn-cancel" style="background: #da3633; border: none; color: #fff; border-radius: 4px; padding: 2px 8px; font-size: 10px; cursor: pointer;">Cancel</button>
      </div>

      <!-- Canvas body -->
      <div class="th-body" style="position: relative; width: 100%; flex: 1; min-height: 180px; display: flex; flex-direction: column;">
        <div class="th-canvas-container" style="position: relative; width: 100%; flex: 1; background: #0d1117;">
          <canvas class="th-canvas" style="width: 100%; height: 100%; display: block;"></canvas>
        </div>

        <!-- Footer Meta -->
        <div class="th-footer" style="padding: 6px 12px; background: #161b22; border-top: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #8b949e; flex-shrink: 0;">
          <div class="th-footer-meta">Click on map to select cross-section point</div>
          <div style="color: #6e7681; font-size: 10px;">VVEL: 10⁻² Pa/s (ω&lt;0 ascent) | Fixed 10 levels (1000–200 hPa)</div>
        </div>
      </div>

      <!-- Resize Handles (locked aspect ratio) -->
      <div class="th-resize-handle th-resize-se" title="Resize window (keeps aspect ratio)" style="position: absolute; right: 0; bottom: 0; width: 18px; height: 18px; cursor: nwse-resize; z-index: 1010; display: flex; align-items: flex-end; justify-content: flex-end; padding: 3px; user-select: none;">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#6e7681" stroke-width="1.5" stroke-linecap="round">
          <line x1="8" y1="2" x2="2" y2="8" />
          <line x1="8" y1="5" x2="5" y2="8" />
          <line x1="8" y1="8" x2="8" y2="8" />
        </svg>
      </div>
      <div class="th-resize-handle th-resize-e" style="position: absolute; right: 0; top: 40px; bottom: 18px; width: 6px; cursor: ew-resize; z-index: 1009; user-select: none;"></div>
      <div class="th-resize-handle th-resize-s" style="position: absolute; bottom: 0; left: 18px; right: 18px; height: 6px; cursor: ns-resize; z-index: 1009; user-select: none;"></div>
      <div class="th-resize-handle th-resize-sw" title="Resize window (keeps aspect ratio)" style="position: absolute; left: 0; bottom: 0; width: 18px; height: 18px; cursor: nesw-resize; z-index: 1010; display: flex; align-items: flex-end; justify-content: flex-start; padding: 3px; user-select: none;">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#6e7681" stroke-width="1.5" stroke-linecap="round">
          <line x1="2" y1="2" x2="8" y2="8" />
          <line x1="2" y1="5" x2="5" y2="8" />
          <line x1="2" y1="8" x2="2" y2="8" />
        </svg>
      </div>
    `;

    // Initialize Canvas Renderer
    const canvas = this.container.querySelector(".th-canvas");
    this.canvasRenderer = new TimeHeightCanvasRenderer(canvas, {
      timeDirection: this.timeDirection,
    });

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

    // Window Dragging
    const header = this.container.querySelector(".th-panel-header");
    if (header) {
      let isDragging = false;
      let dragStartX = 0, dragStartY = 0;
      let initialLeft = 0, initialTop = 0;

      header.addEventListener("mousedown", (e) => {
        if (e.target.closest("button") || e.target.closest("select") || e.target.closest("input")) return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const rect = this.container.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        this.container.style.right = "auto";
        this.container.style.left = `${initialLeft}px`;
        this.container.style.top = `${initialTop}px`;
        e.preventDefault();
      });

      if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("mousemove", (e) => {
          if (!isDragging) return;
          const dx = e.clientX - dragStartX;
          const dy = e.clientY - dragStartY;
          this.container.style.left = `${Math.max(10, initialLeft + dx)}px`;
          this.container.style.top = `${Math.max(10, initialTop + dy)}px`;
        });

        window.addEventListener("mouseup", () => {
          isDragging = false;
        });
      }
    }

    // Window controls
    this.container.querySelector(".th-btn-min")?.addEventListener("click", () => this.toggleMinimize());
    this.container.querySelector(".th-btn-close")?.addEventListener("click", () => {
      this.hide();
      this.options.onClose?.();
    });
    this.container.querySelector(".th-btn-export")?.addEventListener("click", () => this.exportPNG());

    // Apply range
    const btnApply = this.container.querySelector(".th-btn-apply");
    const inputStart = this.container.querySelector(".th-input-start");
    const inputEnd = this.container.querySelector(".th-input-end");
    const selectStep = this.container.querySelector(".th-select-step");

    const fireRange = () => {
      const s = parseInt(inputStart.value, 10) || 0;
      const e = parseInt(inputEnd.value, 10) || 144;
      const st = parseInt(selectStep.value, 10) || 12;
      this.options.onRangeChange?.(s, e, st);
    };
    btnApply?.addEventListener("click", fireRange);
    inputStart?.addEventListener("keydown", (e) => { if (e.key === "Enter") fireRange(); });
    inputEnd?.addEventListener("keydown", (e) => { if (e.key === "Enter") fireRange(); });
    selectStep?.addEventListener("change", fireRange);

    // Cycle select
    this.container.querySelector(".th-select-cycle")?.addEventListener("change", (e) => {
      this.options.onCycleChange?.(e.target.value);
    });

    // Direction toggle
    const btnDir = this.container.querySelector(".th-btn-direction");
    btnDir?.addEventListener("click", () => {
      const nextDir = this.timeDirection === "ltr" ? "rtl" : "ltr";
      this.setTimeDirection(nextDir);
      this.options.onDirectionChange?.(nextDir);
    });

    // Layer checkboxes
    const cbRH = this.container.querySelector(".th-cb-rh");
    const cbTemp = this.container.querySelector(".th-cb-temp");
    const cbVVel = this.container.querySelector(".th-cb-vvel");
    const cbWind = this.container.querySelector(".th-cb-wind");

    cbRH?.addEventListener("change", (e) => {
      this.canvasRenderer.setOptions({ showRH: e.target.checked });
      this.options.onToggleElement?.("RH", e.target.checked);
    });
    cbTemp?.addEventListener("change", (e) => {
      this.canvasRenderer.setOptions({ showTemp: e.target.checked });
      this.options.onToggleElement?.("TMP", e.target.checked);
    });
    cbVVel?.addEventListener("change", (e) => {
      this.canvasRenderer.setOptions({ showVVel: e.target.checked });
      this.options.onToggleElement?.("VVEL", e.target.checked);
    });
    cbWind?.addEventListener("change", (e) => {
      this.canvasRenderer.setOptions({ showWind: e.target.checked });
      this.options.onToggleElement?.("WIND", e.target.checked);
    });

    // Progress Cancel
    this.container.querySelector(".th-btn-cancel")?.addEventListener("click", () => {
      this.options.onCancel?.();
    });

    // Resize Handles
    this._initResizeHandles();
  }

  _initResizeHandles() {
    if (!this.container) return;
    const handles = this.container.querySelectorAll(".th-resize-handle");
    handles.forEach((handle) => {
      const isSE = handle.classList.contains("th-resize-se");
      const isSW = handle.classList.contains("th-resize-sw");
      const isE = handle.classList.contains("th-resize-e");
      const isS = handle.classList.contains("th-resize-s");

      handle.addEventListener("mousedown", (e) => {
        if (this.isMinimized) return;
        e.preventDefault();
        e.stopPropagation();

        let isResizing = true;
        const startX = e.clientX, startY = e.clientY;
        const rect = this.container.getBoundingClientRect ? this.container.getBoundingClientRect() : { left: 100, top: 60, right: 100 + DEFAULT_TH_WIDTH };
        const { left: initialLeft, top: initialTop, right: initialRight } = rect;
        const initialWidth = this.container.offsetWidth || this.width || DEFAULT_TH_WIDTH;
        const initialHeight = this.container.offsetHeight || this.height || DEFAULT_TH_HEIGHT;

        this.container.style.right = "auto";
        this.container.style.left = `${initialLeft}px`;
        this.container.style.top = `${initialTop}px`;

        const ratio = this.aspectRatio;
        const winW = (typeof window !== "undefined" && window.innerWidth) || 1920;
        const winH = (typeof window !== "undefined" && window.innerHeight) || 1080;

        const onMouseMove = (moveEvt) => {
          if (!isResizing) return;
          const dx = moveEvt.clientX - startX;
          const dy = moveEvt.clientY - startY;

          let newWidth, newHeight;
          if (isE) {
            newWidth = initialWidth + dx;
            newHeight = Math.round(newWidth / ratio);
          } else if (isS) {
            newHeight = initialHeight + dy;
            newWidth = Math.round(newHeight * ratio);
          } else {
            const effDx = isSW ? -dx : dx;
            if (Math.abs(effDx) >= Math.abs(dy * ratio)) {
              newWidth = initialWidth + effDx;
              newHeight = Math.round(newWidth / ratio);
            } else {
              newHeight = initialHeight + dy;
              newWidth = Math.round(newHeight * ratio);
            }
          }

          const maxW = Math.min(isSW ? initialRight - 10 : winW - initialLeft - 10, 1600);
          const maxH = winH - initialTop - 10;

          newWidth = Math.max(MIN_TH_WIDTH, Math.min(maxW, newWidth));
          newHeight = Math.round(newWidth / ratio);
          if (newHeight > maxH) {
            newHeight = maxH;
            newWidth = Math.round(newHeight * ratio);
          }
          if (newHeight < MIN_TH_HEIGHT) {
            newHeight = MIN_TH_HEIGHT;
            newWidth = Math.round(newHeight * ratio);
          }

          if (isSW) {
            const newLeft = initialRight - newWidth;
            if (newLeft >= 10) {
              this.container.style.left = `${newLeft}px`;
              this.setDimensions(newWidth, newHeight);
            }
          } else {
            this.setDimensions(newWidth, newHeight);
          }
        };

        const onMouseUp = () => {
          isResizing = false;
          if (typeof window !== "undefined") {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
          }
          this.canvasRenderer?.resize();
        };

        if (typeof window !== "undefined") {
          window.addEventListener("mousemove", onMouseMove);
          window.addEventListener("mouseup", onMouseUp);
        }
      });

      if (isSE) {
        handle.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          this.setDimensions(DEFAULT_TH_WIDTH, DEFAULT_TH_HEIGHT);
        });
      }
    });
  }

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

  setRange(start, end, step) {
    this.options.startHour = start;
    this.options.endHour = end;
    this.options.stepHours = step;
    if (!this.container) return;
    const inputStart = this.container.querySelector(".th-input-start");
    const inputEnd = this.container.querySelector(".th-input-end");
    const selectStep = this.container.querySelector(".th-select-step");
    if (inputStart) inputStart.value = start;
    if (inputEnd) inputEnd.value = end;
    if (selectStep) selectStep.value = step;
    const btnDir = this.container.querySelector(".th-btn-direction");
    if (btnDir) {
      btnDir.textContent = this.timeDirection === "rtl" ? `⇄ ${end}→${start}h` : `⇄ ${start}→${end}h`;
    }
  }

  syncElementCheckbox(element, checked) {
    if (!this.container) return;
    const map = {
      RH: ".th-cb-rh",
      TMP: ".th-cb-temp",
      VVEL: ".th-cb-vvel",
      WIND: ".th-cb-wind",
    };
    const selector = map[element];
    if (selector) {
      const cb = this.container.querySelector(selector);
      if (cb) cb.checked = Boolean(checked);
    }
  }

  setPoint(lon, lat, i = null, j = null) {
    this.activePoint = { lon, lat };
    if (!this.container) return;
    const coordsEl = this.container.querySelector(".th-header-coords");
    if (coordsEl) {
      coordsEl.textContent = `(${lon.toFixed(2)}°E, ${lat.toFixed(2)}°N${i !== null ? ` node: ${i},${j}` : ""})`;
    }
  }

  setCycle(cycle, availableCycles = []) {
    this.activeCycle = cycle;
    this.availableCycles = availableCycles;
    if (!this.container) return;

    const cycleBadge = this.container.querySelector(".th-header-cycle");
    if (cycleBadge) {
      cycleBadge.textContent = cycle ? `Init: ${cycle}` : "";
    }

    const select = this.container.querySelector(".th-select-cycle");
    if (select && availableCycles && availableCycles.length > 0) {
      select.innerHTML = availableCycles.map((c) => `<option value="${c}" ${c === cycle ? "selected" : ""}>${c}</option>`).join("");
    }
  }

  setTimeDirection(dir) {
    this.timeDirection = dir;
    if (this.canvasRenderer) {
      this.canvasRenderer.setTimeDirection(dir);
    }
    if (this.container) {
      const btnDir = this.container.querySelector(".th-btn-direction");
      if (btnDir) {
        btnDir.textContent = dir === "rtl" ? "⇄ 144→0h" : "⇄ 0→144h";
      }
    }
  }

  setProgress({ loaded, total, pct, cancelled = false } = {}) {
    if (!this.container) return;
    const wrap = this.container.querySelector(".th-progress-wrap");
    const bar = this.container.querySelector(".th-progress-bar");
    const label = this.container.querySelector(".th-progress-label");
    if (!wrap || !bar || !label) return;

    if (cancelled || (loaded >= total && total > 0)) {
      setTimeout(() => { wrap.style.display = "none"; }, 300);
      return;
    }

    wrap.style.display = "flex";
    bar.style.width = `${pct}%`;
    label.textContent = `Loading ${loaded}/${total} grids… (${pct}%)`;
  }

  hideProgress() {
    if (!this.container) return;
    const wrap = this.container.querySelector(".th-progress-wrap");
    if (wrap) wrap.style.display = "none";
  }

  setData(matrix) {
    this.matrix = matrix;
    if (this.canvasRenderer) {
      this.canvasRenderer.setData(matrix);
    }
    if (!this.container || !matrix) return;

    const footerMeta = this.container.querySelector(".th-footer-meta");
    if (footerMeta) {
      const pt = matrix.point;
      const nLeads = matrix.leads.length;
      const nLevels = matrix.levels.length;
      const missCount = (matrix.missing?.rh || 0) + (matrix.missing?.tmp || 0) + (matrix.missing?.vvel || 0);
      footerMeta.textContent = `Point: ${pt.lon.toFixed(2)}°E, ${pt.lat.toFixed(2)}°N | ${nLeads} leads (${matrix.leads[0]}–${matrix.leads[nLeads - 1]}h) × ${nLevels} levels${missCount > 0 ? ` | gaps: ${missCount}` : ""}`;
    }
  }

  setCursorLead(lead) {
    if (this.canvasRenderer) {
      this.canvasRenderer.setCursorLead(lead);
    }
  }

  show() {
    if (this.container) {
      this.container.style.display = "flex";
      this.canvasRenderer?.resize();
    }
  }

  hide() {
    if (this.container) {
      this.container.style.display = "none";
    }
  }

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    if (!this.container) return;
    const body = this.container.querySelector(".th-body");
    const controls = this.container.querySelector(".th-controls-row");
    const handles = this.container.querySelectorAll(".th-resize-handle");
    const btn = this.container.querySelector(".th-btn-min");
    if (body) body.style.display = this.isMinimized ? "none" : "flex";
    if (controls) controls.style.display = this.isMinimized ? "none" : "flex";
    if (btn) btn.textContent = this.isMinimized ? "□" : "—";
    this.container.style.height = this.isMinimized ? "auto" : `${this.height || DEFAULT_TH_HEIGHT}px`;
    handles.forEach((h) => (h.style.display = this.isMinimized ? "none" : "flex"));
    if (!this.isMinimized && this.canvasRenderer) {
      setTimeout(() => this.canvasRenderer?.resize(), 50);
    }
  }

  exportPNG() {
    const filename = `EC_Profile_${this.activeCycle || "latest"}_${this.activePoint.lon.toFixed(1)}E_${this.activePoint.lat.toFixed(1)}N.png`;
    return this.canvasRenderer?.exportPNG(filename);
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
  }
}
