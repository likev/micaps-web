// lineHeightPanel.js - Group 1 floating section window (distance x pressure, one lead)
import { LineHeightCanvasRenderer } from "./lineHeightCanvas.js";

export const DEFAULT_LH_WIDTH = 680;
export const DEFAULT_LH_HEIGHT = 520;
export const LH_ASPECT_RATIO = DEFAULT_LH_WIDTH / DEFAULT_LH_HEIGHT;
export const MIN_LH_WIDTH = 480;
export const MIN_LH_HEIGHT = Math.round(MIN_LH_WIDTH / LH_ASPECT_RATIO);

export class LineHeightPanel {
  constructor(options = {}) {
    this.options = {
      windowId: "default", a: { lon: 115, lat: 28 }, b: { lon: 125, lat: 38 },
      npoints: 41, flipDirection: false,
      onLineChange: null, onDrawLine: null, onSetA: null, onSetB: null, onFlip: null,
      onNChange: null, onCycleChange: null, onToggleElement: null, onCancel: null, onClose: null,
      ...options,
    };
    this.container = null; this.canvasRenderer = null;
    this.isMinimized = false; this.matrix = null;
    this.width = DEFAULT_LH_WIDTH; this.height = DEFAULT_LH_HEIGHT; this.aspectRatio = LH_ASPECT_RATIO;
    this.line = { a: { ...this.options.a }, b: { ...this.options.b } };
    this.npoints = this.options.npoints;
    this.flipDirection = this.options.flipDirection;
    this.activeCycle = null; this.availableCycles = [];
    this.effectiveLead = null;
    this._initDOM();
  }
  _initDOM() {
    if (typeof document === "undefined" || typeof document.getElementById !== "function") return;
    const panelId = `lineheight-panel-${this.options.windowId || "default"}`;
    let el = document.getElementById(panelId);
    if (!el) {
      el = document.createElement("div");
      el.id = panelId;
      el.className = "lineheight-subwindow";
      el.style.cssText = `position:absolute;top:60px;right:20px;width:${this.width}px;height:${this.height}px;max-width:calc(100vw - 40px);max-height:calc(100vh - 40px);background:#0d1117;border:1px solid #30363d;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.65);z-index:1000;display:flex;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;`;
      document.body.appendChild(el);
    }
    this.container = el;
    el.innerHTML = `
      <div class="lh-panel-header" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#161b22;border-bottom:1px solid #30363d;cursor:move;user-select:none;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:12px;color:#e6edf3;">
          <span style="background:#9a6700;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.5px;">ECMWF_HR</span>
          <span class="lh-header-title">EC Line-Height Cross-Section</span>
          <span class="lh-header-lead" style="font-size:11px;color:#e3b341;font-weight:600;"></span>
          <span class="lh-header-line" style="font-size:11px;color:#8b949e;font-weight:400;"></span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <button class="lh-btn-export" title="Export PNG image" style="background:transparent;border:1px solid #30363d;color:#8b949e;border-radius:4px;width:26px;height:26px;cursor:pointer;">⤓</button>
          <button class="lh-btn-min" title="Minimize window" style="background:transparent;border:1px solid #30363d;color:#8b949e;border-radius:4px;width:26px;height:26px;cursor:pointer;">—</button>
          <button class="lh-btn-close" title="Close diagram" style="background:transparent;border:1px solid #30363d;color:#8b949e;border-radius:4px;width:26px;height:26px;cursor:pointer;">✕</button>
        </div>
      </div>
      <div class="lh-controls-row" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:6px 12px;background:#161b22;border-bottom:1px solid #21262d;font-size:11px;color:#c9d1d9;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span>Init:</span>
          <select class="lh-select-cycle" style="background:#0d1117;border:1px solid #30363d;color:#58a6ff;border-radius:4px;padding:2px 6px;font-size:11px;cursor:pointer;"></select>
          <span>A:</span>
          <input type="number" class="lh-input-alon" step="0.25" style="width:60px;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:4px;padding:2px 4px;text-align:center;font-size:11px;" />
          <input type="number" class="lh-input-alat" step="0.25" style="width:60px;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:4px;padding:2px 4px;text-align:center;font-size:11px;" />
          <span>B:</span>
          <input type="number" class="lh-input-blon" step="0.25" style="width:60px;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:4px;padding:2px 4px;text-align:center;font-size:11px;" />
          <input type="number" class="lh-input-blat" step="0.25" style="width:60px;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:4px;padding:2px 4px;text-align:center;font-size:11px;" />
          <select class="lh-select-n" style="background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:4px;padding:2px 4px;font-size:11px;cursor:pointer;"></select>
          <button class="lh-btn-apply" style="background:#21262d;border:1px solid #30363d;color:#58a6ff;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">Apply</button>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <button class="lh-btn-draw" title="Two-click draw: click map for A, again for B" style="background:#21262d;border:1px solid #30363d;color:#e3b341;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">✏ Draw line</button>
          <button class="lh-btn-seta" title="Next map click sets A" style="background:#21262d;border:1px solid #30363d;color:#c9d1d9;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">Set A from map</button>
          <button class="lh-btn-setb" title="Next map click sets B" style="background:#21262d;border:1px solid #30363d;color:#c9d1d9;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">Set B from map</button>
          <button class="lh-btn-flip" title="Mirror A<->B display only" style="background:#21262d;border:1px solid #30363d;color:#e3b341;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">⇄ A→B</button>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" class="lh-cb-rh" checked /> <span style="color:#56d4dd;">RH</span></label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" class="lh-cb-temp" checked /> <span style="color:#f85149;">T</span></label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" class="lh-cb-vvel" checked /> <span style="color:#39c5bb;">VVEL</span></label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" class="lh-cb-wind" checked /> <span style="color:#58a6ff;">Wind</span></label>
        </div>
      </div>
      <div class="lh-progress-wrap" style="display:none;padding:6px 12px;background:#161b22;border-bottom:1px solid #30363d;align-items:center;gap:8px;font-size:11px;flex-shrink:0;">
        <div style="flex:1;height:8px;background:#21262d;border-radius:4px;overflow:hidden;"><div class="lh-progress-bar" style="width:0%;height:100%;background:#9a6700;border-radius:4px;"></div></div>
        <span class="lh-progress-label" style="color:#8b949e;min-width:140px;text-align:right;">Loading...</span>
        <button class="lh-btn-cancel" style="background:#da3633;border:none;color:#fff;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer;">Cancel</button>
      </div>
      <div class="lh-body" style="position:relative;width:100%;flex:1;min-height:180px;display:flex;flex-direction:column;">
        <div class="lh-canvas-container" style="position:relative;width:100%;flex:1;background:#0d1117;"><canvas class="lh-canvas" style="width:100%;height:100%;display:block;"></canvas></div>
        <div class="lh-footer" style="padding:6px 12px;background:#161b22;border-top:1px solid #30363d;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#8b949e;flex-shrink:0;">
          <div class="lh-footer-meta">Draw a line on the map (two clicks)</div>
          <div style="color:#6e7681;font-size:10px;">VVEL: 10⁻² Pa/s (ω&lt;0 ascent) | Fixed 10 levels (1000–200 hPa)</div>
        </div>
      </div>`;
    const canvas = this.container.querySelector(".lh-canvas");
    this.canvasRenderer = new LineHeightCanvasRenderer(canvas, { flipDirection: this.flipDirection });
    this._fillNSelect();
    this._syncLineInputs();
    this._bindEvents();
  }
  _fillNSelect() {
    const sel = this.container?.querySelector(".lh-select-n");
    if (!sel) return;
    const opts = [11, 21, 41, 61, 81];
    sel.innerHTML = opts.map((n) => `<option value="${n}" ${n === this.npoints ? "selected" : ""}>N=${n}</option>`).join("");
  }
  _syncLineInputs() {
    if (!this.container) return;
    const q = (s) => this.container.querySelector(s);
    if (q(".lh-input-alon")) q(".lh-input-alon").value = this.line.a.lon.toFixed(2);
    if (q(".lh-input-alat")) q(".lh-input-alat").value = this.line.a.lat.toFixed(2);
    if (q(".lh-input-blon")) q(".lh-input-blon").value = this.line.b.lon.toFixed(2);
    if (q(".lh-input-blat")) q(".lh-input-blat").value = this.line.b.lat.toFixed(2);
  }
  _bindEvents() {
    if (!this.container) return;
    const q = (s) => this.container.querySelector(s);
    q(".lh-btn-close")?.addEventListener("click", () => { this.hide(); this.options.onClose?.(); });
    q(".lh-btn-min")?.addEventListener("click", () => this.toggleMinimize());
    q(".lh-btn-export")?.addEventListener("click", () => this.exportPNG());
    q(".lh-btn-cancel")?.addEventListener("click", () => this.options.onCancel?.());
    q(".lh-btn-apply")?.addEventListener("click", () => this._fireLineApply());
    q(".lh-select-n")?.addEventListener("change", (e) => {
      const n = parseInt(e.target.value, 10) || 41;
      this.options.onNChange?.(n);
    });
    q(".lh-btn-draw")?.addEventListener("click", () => this.options.onDrawLine?.());
    q(".lh-btn-seta")?.addEventListener("click", () => this.options.onSetA?.());
    q(".lh-btn-setb")?.addEventListener("click", () => this.options.onSetB?.());
    q(".lh-btn-flip")?.addEventListener("click", () => this.options.onFlip?.());
    q(".lh-select-cycle")?.addEventListener("change", (e) => this.options.onCycleChange?.(e.target.value));
    const pairs = [[".lh-cb-rh", "RH"], [".lh-cb-temp", "TMP"], [".lh-cb-vvel", "VVEL"], [".lh-cb-wind", "WIND"]];
    for (const [sel, el] of pairs) {
      q(sel)?.addEventListener("change", (e) => {
        const map = { RH: "showRH", TMP: "showTemp", VVEL: "showVVel", WIND: "showWind" };
        this.canvasRenderer.setOptions({ [map[el]]: e.target.checked });
        this.options.onToggleElement?.(el, e.target.checked);
      });
    }
    // Drag
    const header = q(".lh-panel-header");
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
  _fireLineApply() {
    const q = (s) => this.container.querySelector(s);
    const a = { lon: parseFloat(q(".lh-input-alon")?.value), lat: parseFloat(q(".lh-input-alat")?.value) };
    const b = { lon: parseFloat(q(".lh-input-blon")?.value), lat: parseFloat(q(".lh-input-blat")?.value) };
    const n = parseInt(q(".lh-select-n")?.value, 10) || this.npoints;
    this.options.onLineChange?.(a, b, n);
  }
  setLine(a, b, npoints = null, totalKm = null) {
    this.line = { a: { ...a }, b: { ...b } };
    if (npoints) this.npoints = npoints;
    this._syncLineInputs();
    const hdr = this.container?.querySelector(".lh-header-line");
    if (hdr) {
      const L = totalKm !== null && totalKm !== undefined ? Math.round(totalKm) : "?";
      const N = npoints ?? this.npoints;
      hdr.textContent = `A(${a.lon.toFixed(2)},${a.lat.toFixed(2)}) → B(${b.lon.toFixed(2)},${b.lat.toFixed(2)}) · ${L} km · ${N} pts`;
    }
  }
  setCycle(cycle, cycles = []) {
    this.activeCycle = cycle; this.availableCycles = cycles;
    if (!this.container) return;
    const sel = this.container.querySelector(".lh-select-cycle");
    if (sel && cycles?.length) sel.innerHTML = cycles.map((c) => `<option value="${c}" ${c === cycle ? "selected" : ""}>${c}</option>`).join("");
  }
  setLead(lead, validDate = null) {
    this.effectiveLead = lead;
    const el = this.container?.querySelector(".lh-header-lead");
    if (el) el.textContent = `Init ${this.activeCycle || ""} · +${lead}h${validDate ? ` valid ${validDate}` : ""}`;
    this.canvasRenderer?.setHeadlineLead(lead);
  }
  setFlip(flip) {
    this.flipDirection = Boolean(flip);
    this.canvasRenderer?.setFlip(this.flipDirection);
    const btn = this.container?.querySelector(".lh-btn-flip");
    if (btn) btn.textContent = this.flipDirection ? "⇄ B→A" : "⇄ A→B";
  }
  syncElementCheckbox(element, checked) {
    const map = { RH: ".lh-cb-rh", TMP: ".lh-cb-temp", VVEL: ".lh-cb-vvel", WIND: ".lh-cb-wind" };
    const cb = this.container?.querySelector(map[element]);
    if (cb) cb.checked = Boolean(checked);
  }
  setProgress({ loaded, total, pct, cacheHits = 0, cancelled = false } = {}) {
    if (!this.container) return;
    const wrap = this.container.querySelector(".lh-progress-wrap");
    const bar = this.container.querySelector(".lh-progress-bar");
    const label = this.container.querySelector(".lh-progress-label");
    if (!wrap || !bar || !label) return;
    if (cancelled || (loaded >= total && total > 0)) { setTimeout(() => { wrap.style.display = "none"; }, 300); return; }
    wrap.style.display = "flex";
    bar.style.width = `${pct}%`;
    label.textContent = `Loading ${loaded}/${total} grids… (${pct}%)${cacheHits > 0 ? ` · ${cacheHits} from cache` : ""}`;
  }
  hideProgress() { const w = this.container?.querySelector(".lh-progress-wrap"); if (w) w.style.display = "none"; }
  setData(matrix, distKm, lead) {
    this.matrix = matrix;
    this.canvasRenderer?.setData(matrix, distKm, lead ?? this.effectiveLead);
    const foot = this.container?.querySelector(".lh-footer-meta");
    if (foot && matrix) {
      const miss = (matrix.missing?.rh || 0) + (matrix.missing?.tmp || 0) + (matrix.missing?.vvel || 0);
      foot.textContent = `+${matrix.lead}h · A→B ${Math.round(matrix.distKm)} km · ${matrix.levels.length} levels × ${this.npoints} pts${miss > 0 ? ` · gaps: ${miss}` : ""}`;
    }
  }
  setPickHint(mode) {
    const foot = this.container?.querySelector(".lh-footer-meta");
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
    const body = this.container.querySelector(".lh-body");
    const controls = this.container.querySelector(".lh-controls-row");
    if (body) body.style.display = this.isMinimized ? "none" : "flex";
    if (controls) controls.style.display = this.isMinimized ? "none" : "flex";
    this.container.style.height = this.isMinimized ? "auto" : `${this.height || DEFAULT_LH_HEIGHT}px`;
    if (!this.isMinimized) setTimeout(() => this.canvasRenderer?.resize(), 50);
  }
  exportPNG() {
    return this.canvasRenderer?.exportPNG(`EC_LineHeight_${this.activeCycle || "latest"}_+${this.effectiveLead ?? 0}h.png`);
  }
  destroy() {
    if (this.container?.parentNode) this.container.parentNode.removeChild(this.container);
    this.container = null;
  }
}
