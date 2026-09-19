// hovmollerPanel.js - Group 2 floating Time-Line window (level + span + swap/reverse)
import { HovmollerCanvasRenderer } from "./hovmollerCanvas.js";
import { PROFILE_LEVELS, SUPPORTED_STEPS } from "./lineUtils.js";

export const DEFAULT_HOV_WIDTH = 680;
export const DEFAULT_HOV_HEIGHT = 520;
export const HOV_ASPECT_RATIO = DEFAULT_HOV_WIDTH / DEFAULT_HOV_HEIGHT;

export class HovmollerPanel {
  constructor(options = {}) {
    this.options = {
      windowId: "default", a: { lon: 115, lat: 28 }, b: { lon: 125, lat: 38 },
      npoints: 41, level: 850, startHour: 0, endHour: 144, stepHours: 12,
      axisSwap: "dist-x", timeDir: "fwd",
      onLineChange: null, onDrawLine: null, onSetA: null, onSetB: null,
      onNChange: null, onLevelChange: null, onSpanChange: null,
      onAxisSwap: null, onTimeDir: null, onCycleChange: null,
      onToggleElement: null, onCancel: null, onClose: null,
      ...options,
    };
    this.container = null; this.canvasRenderer = null;
    this.isMinimized = false; this.matrix = null;
    this.width = DEFAULT_HOV_WIDTH; this.height = DEFAULT_HOV_HEIGHT;
    this.line = { a: { ...this.options.a }, b: { ...this.options.b } };
    this.npoints = this.options.npoints;
    this.level = this.options.level;
    this.span = { start: this.options.startHour, end: this.options.endHour, step: this.options.stepHours };
    this.axisSwap = this.options.axisSwap; this.timeDir = this.options.timeDir;
    this.activeCycle = null; this.availableCycles = [];
    this._initDOM();
  }
  _initDOM() {
    if (typeof document === "undefined" || typeof document.getElementById !== "function") return;
    const panelId = `hovmoller-panel-${this.options.windowId || "default"}`;
    let el = document.getElementById(panelId);
    if (!el) {
      el = document.createElement("div");
      el.id = panelId;
      el.className = "hovmoller-subwindow";
      el.style.cssText = `position:absolute;top:60px;right:20px;width:${this.width}px;height:${this.height}px;max-width:calc(100vw - 40px);max-height:calc(100vh - 40px);background:#0d1117;border:1px solid #30363d;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.65);z-index:1000;display:flex;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;`;
      document.body.appendChild(el);
    }
    this.container = el;
    el.innerHTML = `
      <div class="hov-panel-header" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#161b22;border-bottom:1px solid #30363d;cursor:move;user-select:none;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:12px;color:#e6edf3;">
          <span style="background:#8250df;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.5px;">ECMWF_HR</span>
          <span class="hov-header-title">EC Time-Line Hovmoller</span>
          <span class="hov-header-meta" style="font-size:11px;color:#8b949e;font-weight:400;"></span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <button class="hov-btn-export" title="Export PNG image" style="background:transparent;border:1px solid #30363d;color:#8b949e;border-radius:4px;width:26px;height:26px;cursor:pointer;">⤓</button>
          <button class="hov-btn-min" title="Minimize window" style="background:transparent;border:1px solid #30363d;color:#8b949e;border-radius:4px;width:26px;height:26px;cursor:pointer;">—</button>
          <button class="hov-btn-close" title="Close diagram" style="background:transparent;border:1px solid #30363d;color:#8b949e;border-radius:4px;width:26px;height:26px;cursor:pointer;">✕</button>
        </div>
      </div>
      <div class="hov-hint" style="padding:4px 12px;background:#161b22;border-bottom:1px solid #21262d;font-size:10px;color:#e3b341;flex-shrink:0;">Time controlled here — timeline parked</div>
      <div class="hov-controls-row" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:6px 12px;background:#161b22;border-bottom:1px solid #21262d;font-size:11px;color:#c9d1d9;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span>Init:</span>
          <select class="hov-select-cycle" style="background:#0d1117;border:1px solid #30363d;color:#58a6ff;border-radius:4px;padding:2px 6px;font-size:11px;cursor:pointer;"></select>
          <span>Level:</span>
          <select class="hov-select-level" style="background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:4px;padding:2px 4px;font-size:11px;cursor:pointer;">
            ${PROFILE_LEVELS.map((l) => `<option value="${l}" ${l === this.level ? "selected" : ""}>${l}</option>`).join("")}
          </select>
          <span>Span:</span>
          <input type="number" class="hov-input-start" value="${this.span.start}" min="0" max="240" step="12" style="width:44px;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:4px;padding:2px 4px;text-align:center;font-size:11px;" />
          <span>–</span>
          <input type="number" class="hov-input-end" value="${this.span.end}" min="12" max="240" step="12" style="width:44px;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:4px;padding:2px 4px;text-align:center;font-size:11px;" />
          <span>h</span>
          <select class="hov-select-step" style="background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:4px;padding:2px 4px;font-size:11px;cursor:pointer;">
            ${SUPPORTED_STEPS.map((s) => `<option value="${s}" ${s === this.span.step ? "selected" : ""}>@${s}h</option>`).join("")}
          </select>
          <button class="hov-btn-span" style="background:#21262d;border:1px solid #30363d;color:#58a6ff;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">Apply</button>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <button class="hov-btn-swap" title="Swap axes (display-only, no refetch)" style="background:#21262d;border:1px solid #30363d;color:#e3b341;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">⇄ X:dist · Y:time</button>
          <button class="hov-btn-rev" title="Reverse time axis (display-only)" style="background:#21262d;border:1px solid #30363d;color:#e3b341;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">⇄ 0→144h</button>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" class="hov-cb-rh" checked /> <span style="color:#56d4dd;">RH</span></label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" class="hov-cb-temp" checked /> <span style="color:#f85149;">T</span></label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" class="hov-cb-vvel" checked /> <span style="color:#39c5bb;">VVEL</span></label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" class="hov-cb-wind" checked /> <span style="color:#58a6ff;">Wind</span></label>
        </div>
      </div>
      <div class="hov-line-row" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 12px;background:#161b22;border-bottom:1px solid #21262d;font-size:11px;color:#c9d1d9;flex-shrink:0;">
        <span>A:</span>
        <input type="number" class="hov-input-alon" step="0.25" style="width:60px;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:4px;padding:2px 4px;text-align:center;font-size:11px;" />
        <input type="number" class="hov-input-alat" step="0.25" style="width:60px;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:4px;padding:2px 4px;text-align:center;font-size:11px;" />
        <span>B:</span>
        <input type="number" class="hov-input-blon" step="0.25" style="width:60px;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:4px;padding:2px 4px;text-align:center;font-size:11px;" />
        <input type="number" class="hov-input-blat" step="0.25" style="width:60px;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:4px;padding:2px 4px;text-align:center;font-size:11px;" />
        <select class="hov-select-n" style="background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:4px;padding:2px 4px;font-size:11px;cursor:pointer;"></select>
        <button class="hov-btn-lineapply" style="background:#21262d;border:1px solid #30363d;color:#58a6ff;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">Apply</button>
        <button class="hov-btn-draw" style="background:#21262d;border:1px solid #30363d;color:#e3b341;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">✏ Draw line</button>
        <button class="hov-btn-seta" style="background:#21262d;border:1px solid #30363d;color:#c9d1d9;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">Set A from map</button>
        <button class="hov-btn-setb" style="background:#21262d;border:1px solid #30363d;color:#c9d1d9;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">Set B from map</button>
      </div>
      <div class="hov-progress-wrap" style="display:none;padding:6px 12px;background:#161b22;border-bottom:1px solid #30363d;align-items:center;gap:8px;font-size:11px;flex-shrink:0;">
        <div style="flex:1;height:8px;background:#21262d;border-radius:4px;overflow:hidden;"><div class="hov-progress-bar" style="width:0%;height:100%;background:#8250df;border-radius:4px;"></div></div>
        <span class="hov-progress-label" style="color:#8b949e;min-width:140px;text-align:right;">Loading...</span>
        <button class="hov-btn-cancel" style="background:#da3633;border:none;color:#fff;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer;">Cancel</button>
      </div>
      <div class="hov-body" style="position:relative;width:100%;flex:1;min-height:180px;display:flex;flex-direction:column;">
        <div class="hov-canvas-container" style="position:relative;width:100%;flex:1;background:#0d1117;"><canvas class="hov-canvas" style="width:100%;height:100%;display:block;"></canvas></div>
        <div class="hov-footer" style="padding:6px 12px;background:#161b22;border-top:1px solid #30363d;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#8b949e;flex-shrink:0;">
          <div class="hov-footer-meta">Draw a line on the map (two clicks)</div>
          <div class="hov-footer-view" style="color:#6e7681;font-size:10px;"></div>
        </div>
      </div>`;
    const canvas = this.container.querySelector(".hov-canvas");
    this.canvasRenderer = new HovmollerCanvasRenderer(canvas, { axisSwap: this.axisSwap, timeDir: this.timeDir });
    this._fillNSelect();
    this._syncLineInputs();
    this._syncViewButtons();
    this._bindEvents();
  }
  _fillNSelect() {
    const sel = this.container?.querySelector(".hov-select-n");
    if (!sel) return;
    sel.innerHTML = [11, 21, 41, 61, 81].map((n) => `<option value="${n}" ${n === this.npoints ? "selected" : ""}>N=${n}</option>`).join("");
  }
  _syncLineInputs() {
    if (!this.container) return;
    const q = (s) => this.container.querySelector(s);
    if (q(".hov-input-alon")) q(".hov-input-alon").value = this.line.a.lon.toFixed(2);
    if (q(".hov-input-alat")) q(".hov-input-alat").value = this.line.a.lat.toFixed(2);
    if (q(".hov-input-blon")) q(".hov-input-blon").value = this.line.b.lon.toFixed(2);
    if (q(".hov-input-blat")) q(".hov-input-blat").value = this.line.b.lat.toFixed(2);
  }
  _syncViewButtons() {
    const swap = this.container?.querySelector(".hov-btn-swap");
    if (swap) swap.textContent = this.axisSwap === "time-x" ? "⇄ X:time · Y:dist" : "⇄ X:dist · Y:time";
    const rev = this.container?.querySelector(".hov-btn-rev");
    if (rev) {
      const s = this.span.start ?? 0, e = this.span.end ?? 144;
      rev.textContent = this.timeDir === "rev" ? `⇄ ${e}→${s}h` : `⇄ ${s}→${e}h`;
    }
    const fv = this.container?.querySelector(".hov-footer-view");
    if (fv) {
      const s = this.span.start ?? 0, e = this.span.end ?? 144;
      fv.textContent = `[X:${this.axisSwap === "time-x" ? "time" : "dist"} · ${this.timeDir === "rev" ? `${e}→${s}` : `${s}→${e}`}]`;
    }
  }
  _bindEvents() {
    if (!this.container) return;
    const q = (s) => this.container.querySelector(s);
    q(".hov-btn-close")?.addEventListener("click", () => { this.hide(); this.options.onClose?.(); });
    q(".hov-btn-min")?.addEventListener("click", () => this.toggleMinimize());
    q(".hov-btn-export")?.addEventListener("click", () => this.exportPNG());
    q(".hov-btn-cancel")?.addEventListener("click", () => this.options.onCancel?.());
    q(".hov-btn-span")?.addEventListener("click", () => {
      const s = parseInt(q(".hov-input-start")?.value, 10) || 0;
      const e = parseInt(q(".hov-input-end")?.value, 10) || 144;
      const st = parseInt(q(".hov-select-step")?.value, 10) || 12;
      this.options.onSpanChange?.(s, e, st);
    });
    q(".hov-select-level")?.addEventListener("change", (e) => this.options.onLevelChange?.(parseInt(e.target.value, 10)));
    q(".hov-btn-lineapply")?.addEventListener("click", () => {
      const a = { lon: parseFloat(q(".hov-input-alon")?.value), lat: parseFloat(q(".hov-input-alat")?.value) };
      const b = { lon: parseFloat(q(".hov-input-blon")?.value), lat: parseFloat(q(".hov-input-blat")?.value) };
      const n = parseInt(q(".hov-select-n")?.value, 10) || this.npoints;
      this.options.onLineChange?.(a, b, n);
    });
    q(".hov-btn-draw")?.addEventListener("click", () => this.options.onDrawLine?.());
    q(".hov-btn-seta")?.addEventListener("click", () => this.options.onSetA?.());
    q(".hov-btn-setb")?.addEventListener("click", () => this.options.onSetB?.());
    q(".hov-btn-swap")?.addEventListener("click", () => this.options.onAxisSwap?.());
    q(".hov-btn-rev")?.addEventListener("click", () => this.options.onTimeDir?.());
    q(".hov-select-cycle")?.addEventListener("change", (e) => this.options.onCycleChange?.(e.target.value));
    for (const [sel, el] of [[".hov-cb-rh", "RH"], [".hov-cb-temp", "TMP"], [".hov-cb-vvel", "VVEL"], [".hov-cb-wind", "WIND"]]) {
      q(sel)?.addEventListener("change", (e) => {
        const map = { RH: "showRH", TMP: "showTemp", VVEL: "showVVel", WIND: "showWind" };
        this.canvasRenderer.setOptions({ [map[el]]: e.target.checked });
        this.options.onToggleElement?.(el, e.target.checked);
      });
    }
    const header = q(".hov-panel-header");
    if (header) {
      let drag = false, sx = 0, sy = 0, il = 0, it = 0;
      header.addEventListener("mousedown", (e) => {
        if (e.target.closest("button") || e.target.closest("select") || e.target.closest("input")) return;
        drag = true; sx = e.clientX; sy = e.clientY;
        const r = this.container.getBoundingClientRect();
        il = r.left; it = r.top;
        this.container.style.right = "auto"; this.container.style.left = `${il}px`; this.container.style.top = `${it}px`;
        e.preventDefault();
      });
      window.addEventListener("mousemove", (e) => {
        if (!drag) return;
        this.container.style.left = `${Math.max(10, il + e.clientX - sx)}px`;
        this.container.style.top = `${Math.max(10, it + e.clientY - sy)}px`;
      });
      window.addEventListener("mouseup", () => { drag = false; });
    }
  }
  setLine(a, b, npoints = null, totalKm = null) {
    this.line = { a: { ...a }, b: { ...b } };
    if (npoints) this.npoints = npoints;
    this._syncLineInputs();
    this._refreshHeader();
    void totalKm;
  }
  setCycle(cycle, cycles = []) {
    this.activeCycle = cycle; this.availableCycles = cycles;
    const sel = this.container?.querySelector(".hov-select-cycle");
    if (sel && cycles?.length) sel.innerHTML = cycles.map((c) => `<option value="${c}" ${c === cycle ? "selected" : ""}>${c}</option>`).join("");
    this._refreshHeader();
  }
  setSpan(start, end, step) {
    this.span = { start, end, step };
    if (!this.container) return;
    const q = (s) => this.container.querySelector(s);
    if (q(".hov-input-start")) q(".hov-input-start").value = start;
    if (q(".hov-input-end")) q(".hov-input-end").value = end;
    if (q(".hov-select-step")) q(".hov-select-step").value = step;
    this._syncViewButtons();
  }
  setLevel(level) {
    this.level = level;
    const sel = this.container?.querySelector(".hov-select-level");
    if (sel) sel.value = String(level);
    this._refreshHeader();
  }
  setView(axisSwap, timeDir) {
    this.axisSwap = axisSwap; this.timeDir = timeDir;
    this.canvasRenderer?.setView(axisSwap, timeDir);
    this._syncViewButtons();
  }
  syncElementCheckbox(element, checked) {
    const map = { RH: ".hov-cb-rh", TMP: ".hov-cb-temp", VVEL: ".hov-cb-vvel", WIND: ".hov-cb-wind" };
    const cb = this.container?.querySelector(map[element]);
    if (cb) cb.checked = Boolean(checked);
  }
  setProgress({ loaded, total, pct, cacheHits = 0, cancelled = false } = {}) {
    if (!this.container) return;
    const wrap = this.container.querySelector(".hov-progress-wrap");
    const bar = this.container.querySelector(".hov-progress-bar");
    const label = this.container.querySelector(".hov-progress-label");
    if (!wrap || !bar || !label) return;
    if (cancelled || (loaded >= total && total > 0)) { setTimeout(() => { wrap.style.display = "none"; }, 300); return; }
    wrap.style.display = "flex";
    bar.style.width = `${pct}%`;
    label.textContent = `Loading ${loaded}/${total} grids… (${pct}%)${cacheHits > 0 ? ` · ${cacheHits} from cache` : ""}`;
  }
  hideProgress() { const w = this.container?.querySelector(".hov-progress-wrap"); if (w) w.style.display = "none"; }
  setData(matrix, distKm) {
    this.matrix = matrix;
    this.canvasRenderer?.setData(matrix, distKm);
    this._refreshHeader();
  }
  _refreshHeader() {
    const hdr = this.container?.querySelector(".hov-header-meta");
    const foot = this.container?.querySelector(".hov-footer-meta");
    if (this.matrix) {
      const nL = this.matrix.leads.length;
      const L = Math.round(this.matrix.distKm);
      if (hdr) hdr.textContent = `Init ${this.activeCycle || ""} · ${this.level} hPa · ${nL} leads × ${this.npoints} pts · A→B ${L} km`;
      if (foot) {
        const gaps = (this.matrix.missing?.rh || 0) + (this.matrix.missing?.tmp || 0) + (this.matrix.missing?.vvel || 0);
        foot.textContent = `A→B ${L} km · ${nL} × ${this.npoints} pts @ ${this.level} hPa${gaps > 0 ? ` · gaps ${gaps}` : ""}`;
      }
    } else if (hdr) {
      hdr.textContent = `${this.level} hPa · ${this.span.start}–${this.span.end} @ ${this.span.step}h`;
    }
  }
  setPickHint(mode) {
    const foot = this.container?.querySelector(".hov-footer-meta");
    if (!foot) return;
    if (mode === "draw") foot.textContent = "Draw line: click map for A, click again for B (Esc/right-click cancels)";
    else if (mode === "setA") foot.textContent = "Set A: click map to place endpoint A";
    else if (mode === "setB") foot.textContent = "Set B: click map to place endpoint B";
  }
  show() { if (this.container) { this.container.style.display = "flex"; this.canvasRenderer?.resize(); } }
  hide() { if (this.container) this.container.style.display = "none"; }
  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    if (!this.container) return;
    const body = this.container.querySelector(".hov-body");
    const rows = this.container.querySelectorAll(".hov-controls-row, .hov-line-row");
    if (body) body.style.display = this.isMinimized ? "none" : "flex";
    rows.forEach((r) => (r.style.display = this.isMinimized ? "none" : "flex"));
    this.container.style.height = this.isMinimized ? "auto" : `${this.height || DEFAULT_HOV_HEIGHT}px`;
    if (!this.isMinimized) setTimeout(() => this.canvasRenderer?.resize(), 50);
  }
  exportPNG() { return this.canvasRenderer?.exportPNG(`EC_Hovmoller_${this.activeCycle || "latest"}_${this.level}hPa.png`); }
  destroy() {
    if (this.container?.parentNode) this.container.parentNode.removeChild(this.container);
    this.container = null;
  }
}
