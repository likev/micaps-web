// hovmollerController.js - Group 2 state: line + span/level + view + pick machine (per-window)
import { PROFILE_LEVELS, buildLeads, buildTransectNodes, validateEndpoints, clampEndpointsToDomain, validateNPoints } from "./lineUtils.js";
import { loadHovmollerMatrix } from "./hovmollerLoader.js";
import { showLineHighlight, removeLineHighlight, setLineHighlightVisible, showPendingA, showPreviewLine, removePreview } from "./lineHighlight.js";
import { HovmollerPanel } from "./hovmollerPanel.js";
import { snapToGridNode, clampToGridDomain } from "../timeheight/timeHeightSampling.js";
import { resolveForecastCycles } from "../../utils/timelineSync.js";
import { autoSaveLayerConfig } from "../../config/presets.js";
import { showErrorToast } from "../../ui/toast.js";
import { addOrUpdateLayer, getLayersForWindow, syncLayerControlForWindow } from "../../ui/layers/layerStore.js";
import { getActiveWindow } from "../../ui/tabs/tabsStore.js";
import { setProfileState, getProfileState, clearProfileState, setAllProfilesHidden } from "../../lib/stores/profilesCore.js";

class WindowState {
  constructor(winId) {
    this.winId = winId;
    this.line = { a: { lon: 115.0, lat: 28.0 }, b: { lon: 125.0, lat: 38.0 } };
    this.npoints = 41;
    this.cycle = null; this.availableCycles = [];
    this.startHour = 0; this.endHour = 144; this.stepHours = 12;
    this.leads = buildLeads(0, 144, 12);
    this.level = 850;
    this.axisSwap = "dist-x"; this.timeDir = "fwd";
    this.matrix = null; this.matrixCache = new Map();
    this.loadingSeq = 0; this.abortController = null;
    this.panel = null; this.activeMap = null; this.activeWin = null;
    this.isLayerActive = false;
    this.pickMode = "idle"; this.pendingA = null;
    this.mapClick = null; this.mapMouseMove = null; this.mapContext = null; this.escHandler = null;
    this.transect = null;
  }
}

class HovmollerController {
  constructor() {
    this.windows = new Map();
    this._activeWin = null;
    this._defaultState = new WindowState("default");
  }
  _getWinId(win = null) { return win?.id || this._activeWin?.id || "default"; }
  _getState(win = null) {
    const winId = this._getWinId(win);
    if (winId === "default") return this._defaultState;
    let s = this.windows.get(winId);
    if (!s) { s = new WindowState(winId); this.windows.set(winId, s); }
    return s;
  }
  get activeWin() { return this._activeWin; }
  set activeWin(w) { this._activeWin = w || null; if (w) this._getState(w).activeWin = w; }
  isActive(win = null) {
    if (win) {
      const id = this._getWinId(win);
      const s = id === "default" ? this._defaultState : this.windows.get(id);
      return Boolean(s?.isLayerActive);
    }
    if (this._defaultState.isLayerActive) return true;
    for (const s of this.windows.values()) if (s.isLayerActive) return true;
    return false;
  }
  getTransect(win = null) {
    const s = this._getState(win);
    return buildTransectNodes(s.line.a, s.line.b, s.npoints);
  }

  // Record readiness + header meta into the shared profile registry.
  // Visibility itself is owned by show()/hide() below.
  _syncProfileStore(win = null) {
    const s = this._getState(win);
    try {
      const prev = getProfileState("hovmoller", s.winId);
      setProfileState("hovmoller", s.winId, {
        lineA: { ...s.line.a }, lineB: { ...s.line.b }, npoints: s.npoints,
        cycle: s.cycle, level: s.level,
        startHour: s.startHour, endHour: s.endHour, stepHours: s.stepHours,
        axisSwap: s.axisSwap, timeDir: s.timeDir,
        visible: prev ? prev.visible : false,
      });
    } catch {}
  }

  async init(map, win, layerDef = {}) {
    const s = this._getState(win);
    s.activeMap = map; s.activeWin = win; s.isLayerActive = true;
    this.activeWin = win;
    const cfg = layerDef.config || {};
    if (cfg.lon0 !== undefined) s.line.a = { lon: cfg.lon0, lat: cfg.lat0 ?? s.line.a.lat };
    if (cfg.lon1 !== undefined) s.line.b = { lon: cfg.lon1, lat: cfg.lat1 ?? s.line.b.lat };
    if (cfg.npoints !== undefined) s.npoints = Math.max(2, Math.min(81, cfg.npoints));
    if (cfg.level !== undefined && PROFILE_LEVELS.includes(cfg.level)) s.level = cfg.level;
    s.startHour = cfg.startHour ?? 0; s.endHour = cfg.endHour ?? 144; s.stepHours = cfg.stepHours ?? 12;
    s.leads = buildLeads(s.startHour, s.endHour, s.stepHours);
    s.axisSwap = cfg.axisSwap === "time-x" ? "time-x" : "dist-x";
    s.timeDir = cfg.timeDir === "rev" ? "rev" : "fwd";
    try {
      const cycles = await resolveForecastCycles("ECMWF_HR", "TMP", 500);
      if (cycles?.length) { s.availableCycles = cycles; s.cycle = cfg.initCycle || win?.initCycle || cycles[0]; }
    } catch { s.cycle = cfg.initCycle || "latest"; }
    if (!s.cycle) s.cycle = "latest";
    if (!s.panel) {
      s.panel = new HovmollerPanel({
        windowId: s.winId, a: s.line.a, b: s.line.b, npoints: s.npoints,
        level: s.level, startHour: s.startHour, endHour: s.endHour, stepHours: s.stepHours,
        axisSwap: s.axisSwap, timeDir: s.timeDir,
        onLineChange: (a, b, n) => this.setLine(a, b, n, win),
        onDrawLine: () => this.startDraw(win),
        onSetA: () => this.setAFromMap(win),
        onSetB: () => this.setBFromMap(win),
        onNChange: (n) => this.setLine(s.line.a, s.line.b, n, win),
        onLevelChange: (lv) => this.setLevel(lv, win),
        onSpanChange: (a, b, st) => this.setSpan(a, b, st, win),
        onAxisSwap: () => this.setAxisSwap(s.axisSwap === "dist-x" ? "time-x" : "dist-x", win),
        onTimeDir: () => this.setTimeDir(s.timeDir === "fwd" ? "rev" : "fwd", win),
        onCycleChange: (c) => this.setCycle(c, win),
        onToggleElement: (el, checked) => this.syncDrawerCheckbox(el, checked, win),
        onCancel: () => this.cancelLoad(win),
        onClose: () => this.handlePanelClose(map, win),
      });
    }
    s.panel.setCycle(s.cycle, s.availableCycles);
    s.panel.setSpan(s.startHour, s.endHour, s.stepHours);
    s.panel.setLevel(s.level);
    s.panel.setView(s.axisSwap, s.timeDir);
    if (layerDef.visible === false) this.hide(map, win); else this.show(map, win);
    this._setupMapListeners(map, win);
    this._redrawOverlay(win);
    s.transect = this.getTransect(win);
    s.panel.setLine(s.line.a, s.line.b, s.npoints, s.transect.totalKm);
    this._syncProfileStore(win);
    return this.loadMatrix(win);
  }

  _setupMapListeners(map, win = null) {
    if (!map || typeof map.on !== "function") return;
    const s = this._getState(win);
    this._detachMapListeners(map, win);
    s.mapClick = (e) => {
      if (!this.isActive(win)) return;
      if (s.pickMode === "idle") return;
      if (e.originalEvent) {
        const t = e.originalEvent.target;
        if (t && (t.closest?.(".hovmoller-subwindow") || t.closest?.(".lineheight-subwindow") || t.closest?.(".layer-drawer") || t.closest?.(".navbar"))) return;
      }
      const lng = e.lngLat ? e.lngLat.lng : map.unproject(e.point).lng;
      const lat = e.lngLat ? e.lngLat.lat : map.unproject(e.point).lat;
      this._handlePickClick(lng, lat, win, map);
    };
    s.mapMouseMove = (e) => {
      if (!this.isActive(win) || s.pickMode !== "draw" || !s.pendingA) return;
      const lng = e.lngLat ? e.lngLat.lng : null;
      const lat = e.lngLat ? e.lngLat.lat : null;
      if (lng === null) return;
      showPreviewLine(map, s.pendingA, { lon: lng, lat });
    };
    s.mapContext = (e) => {
      if (!this.isActive(win) || s.pickMode === "idle") return;
      if (e.originalEvent?.preventDefault) e.originalEvent.preventDefault();
      else if (typeof e.preventDefault === "function") e.preventDefault();
      this.cancelPick(win, map);
    };
    s.escHandler = (e) => {
      if (e.key !== "Escape" && e.key !== "Esc") return;
      const st = this._getState(win);
      if (st.pickMode !== "idle") { e.stopPropagation?.(); this.cancelPick(win, map); }
    };
    map.on("click", s.mapClick);
    map.on("mousemove", s.mapMouseMove);
    try { map.on("contextmenu", s.mapContext); } catch {}
    if (typeof window !== "undefined") window.addEventListener("keydown", s.escHandler);
  }
  _detachMapListeners(map, win = null) {
    const s = this._getState(win);
    const m = map || s.activeMap;
    if (m && typeof m.off === "function") {
      if (s.mapClick) m.off("click", s.mapClick);
      if (s.mapMouseMove) m.off("mousemove", s.mapMouseMove);
      if (s.mapContext) { try { m.off("contextmenu", s.mapContext); } catch {} }
    }
    if (s.escHandler && typeof window !== "undefined") window.removeEventListener("keydown", s.escHandler);
    s.mapClick = s.mapMouseMove = s.mapContext = s.escHandler = null;
  }

  startDraw(win = null) { const s = this._getState(win); s.pickMode = "draw"; s.pendingA = null; removePreview(s.activeMap); s.panel?.setPickHint("draw"); }
  setAFromMap(win = null) { const s = this._getState(win); s.pickMode = "setA"; s.pendingA = null; removePreview(s.activeMap); s.panel?.setPickHint("setA"); }
  setBFromMap(win = null) { const s = this._getState(win); s.pickMode = "setB"; s.pendingA = null; removePreview(s.activeMap); s.panel?.setPickHint("setB"); }
  cancelPick(win = null, map = null) { const s = this._getState(win); s.pickMode = "idle"; s.pendingA = null; removePreview(map || s.activeMap); }

  _handlePickClick(lon, lat, win, map) {
    const s = this._getState(win);
    const sn = this._snapClamp(lon, lat);
    if (!sn) return;
    if (s.pickMode === "draw") {
      if (!s.pendingA) { s.pendingA = sn; showPendingA(map, sn); }
      else {
        const chk = validateEndpoints(s.pendingA, sn);
        if (!chk.ok) { showErrorToast?.(chk.error); return; }
        const a = s.pendingA;
        s.pendingA = null; removePreview(map); s.pickMode = "idle";
        this.setLine(a, sn, s.npoints, win);
      }
    } else if (s.pickMode === "setA") {
      const chk = validateEndpoints(sn, s.line.b);
      if (!chk.ok) { showErrorToast?.(chk.error); s.pickMode = "idle"; return; }
      s.pickMode = "idle";
      this.setLine(sn, s.line.b, s.npoints, win);
    } else if (s.pickMode === "setB") {
      const chk = validateEndpoints(s.line.a, sn);
      if (!chk.ok) { showErrorToast?.(chk.error); s.pickMode = "idle"; return; }
      s.pickMode = "idle";
      this.setLine(s.line.a, sn, s.npoints, win);
    }
  }
  _snapClamp(lon, lat) {
    const cl = clampToGridDomain(null, lon, lat);
    let toast = false;
    if (cl.clamped) { toast = true; lon = cl.lon; lat = cl.lat; }
    const sn = snapToGridNode(null, lon, lat);
    const dom = clampEndpointsToDomain(sn, sn);
    if (dom.outside) { showErrorToast?.("Point outside ECMWF_HR domain."); return null; }
    if (toast) showErrorToast?.("Endpoint clamped to model domain.");
    return { lon: sn.lon, lat: sn.lat };
  }

  async setLine(a, b, npoints = null, win = null) {
    if (typeof npoints === "object" && npoints !== null && (npoints.id || npoints.winIdx !== undefined)) { win = npoints; npoints = null; }
    const s = this._getState(win);
    const v = validateEndpoints(a, b);
    if (!v.ok) { showErrorToast?.(v.error); return null; }
    let n = s.npoints;
    if (npoints !== null && npoints !== undefined) {
      const nv = validateNPoints(npoints);
      if (!nv.ok) { showErrorToast?.(nv.error); return null; }
      n = nv.value;
    }
    const cl = clampEndpointsToDomain({ lon: v.lon0, lat: v.lat0 }, { lon: v.lon1, lat: v.lat1 });
    if (cl.outside) { showErrorToast?.("Line fully outside ECMWF_HR domain."); return null; }
    if (cl.clamped) showErrorToast?.("Endpoint(s) clamped to model domain.");
    s.line = { a: { lon: Math.round(cl.a.lon * 10000) / 10000, lat: Math.round(cl.a.lat * 10000) / 10000 }, b: { lon: Math.round(cl.b.lon * 10000) / 10000, lat: Math.round(cl.b.lat * 10000) / 10000 } };
    s.npoints = n;
    s.transect = this.getTransect(win);
    s.panel?.setLine(s.line.a, s.line.b, s.npoints, s.transect.totalKm);
    this._redrawOverlay(win);
    this._persistConfig({ lon0: s.line.a.lon, lat0: s.line.a.lat, lon1: s.line.b.lon, lat1: s.line.b.lat, npoints: s.npoints }, win);
    this._syncProfileStore(win);
    return this.loadMatrix(win);
  }

  setSpan(start, end, step, win = null) {
    const s = this._getState(win);
    const leads = buildLeads(start, end, step);
    if (!leads?.length) { showErrorToast?.("Invalid forecast range or step interval."); return; }
    s.startHour = leads[0]; s.endHour = leads[leads.length - 1]; s.stepHours = step; s.leads = leads;
    this._persistConfig({ startHour: s.startHour, endHour: s.endHour, stepHours: s.stepHours }, win);
    s.panel?.setSpan(s.startHour, s.endHour, s.stepHours);
    this._syncProfileStore(win);
    return this.loadMatrix(win);
  }
  setLevel(level, win = null) {
    const s = this._getState(win);
    if (!PROFILE_LEVELS.includes(level)) { showErrorToast?.(`Level must be one of ${PROFILE_LEVELS.join(", ")}.`); return; }
    s.level = level;
    s.panel?.setLevel(level);
    this._persistConfig({ level }, win);
    this._syncProfileStore(win);
    return this.loadMatrix(win);
  }
  setCycle(cycle, win = null) {
    const s = this._getState(win);
    if (!cycle || cycle === s.cycle) return;
    s.cycle = cycle;
    s.panel?.setCycle(s.cycle, s.availableCycles);
    this._persistConfig({ initCycle: cycle }, win);
    this._syncProfileStore(win);
    return this.loadMatrix(win);
  }
  // Display-only view controls: remap + re-render + persist, zero fetch
  setAxisSwap(mode, win = null) {
    const s = this._getState(win);
    if (mode !== "dist-x" && mode !== "time-x") return;
    s.axisSwap = mode;
    s.panel?.setView(s.axisSwap, s.timeDir);
    this._persistConfig({ axisSwap: mode }, win);
    this._syncProfileStore(win);
  }
  setTimeDir(dir, win = null) {
    const s = this._getState(win);
    if (dir !== "fwd" && dir !== "rev") return;
    s.timeDir = dir;
    s.panel?.setView(s.axisSwap, s.timeDir);
    this._persistConfig({ timeDir: dir }, win);
    this._syncProfileStore(win);
  }
  syncDrawerCheckbox(element, checked, win = null) {
    const propMap = { RH: "showRH", TMP: "showTemp", VVEL: "showVVel", WIND: "showWind" };
    if (propMap[element]) this._persistConfig({ [propMap[element]]: Boolean(checked) }, win || this.activeWin);
  }

  _cacheKey(s) {
    return `${s.cycle}|lv${s.level}|${s.leads.join(",")}|${s.line.a.lon},${s.line.a.lat}|${s.line.b.lon},${s.line.b.lat}|n${s.npoints}`;
  }
  _setMatrixCache(s, key, m) {
    if (s.matrixCache.has(key)) s.matrixCache.delete(key);
    s.matrixCache.set(key, m);
    while (s.matrixCache.size > 20) {
      const k = s.matrixCache.keys().next().value;
      if (k !== undefined) s.matrixCache.delete(k); else break;
    }
  }
  cancelLoad(win = null) {
    const s = this._getState(win);
    s.loadingSeq++;
    if (s.abortController) { try { s.abortController.abort(); } catch {} s.abortController = null; }
    s.panel?.hideProgress();
  }

  async loadMatrix(win = null) {
    const s = this._getState(win);
    const key = this._cacheKey(s);
    // Overlap cache: exact key fast path (span/level/line aware)
    if (s.matrixCache.has(key)) {
      s.matrix = s.matrixCache.get(key);
      s.transect = this.getTransect(win);
      s.panel?.setData(s.matrix, s.transect.distKm);
      s.panel?.setLine(s.line.a, s.line.b, s.npoints, s.transect.totalKm);
      return s.matrix;
    }
    const seq = ++s.loadingSeq;
    if (s.abortController) { try { s.abortController.abort(); } catch {} }
    s.abortController = new AbortController();
    s.panel?.setProgress({ loaded: 0, total: s.leads.length * 4, pct: 0 });
    try {
      const res = await loadHovmollerMatrix({
        win, model: "ECMWF_HR", cycle: s.cycle, leads: s.leads, level: s.level,
        line: s.line, npoints: s.npoints,
        abortController: s.abortController,
        isCancelled: () => s.loadingSeq !== seq,
        onProgress: (p) => { if (s.loadingSeq === seq) s.panel?.setProgress(p); },
      });
      if (s.loadingSeq !== seq || !res || res.cancelled) return null;
      s.panel?.hideProgress();
      if (res.matrix) {
        s.matrix = res.matrix;
        s.transect = this.getTransect(win);
        this._setMatrixCache(s, this._cacheKey(s), s.matrix);
        s.panel?.setData(s.matrix, s.transect.distKm);
        s.panel?.setLine(s.line.a, s.line.b, s.npoints, s.transect.totalKm);
      }
      if (res.stats.failed > 0 && res.stats.failed === res.stats.total) showErrorToast?.(`Failed to load Time-Line for cycle ${s.cycle}.`);
      return s.matrix;
    } catch (err) {
      if (s.loadingSeq === seq) { s.panel?.hideProgress(); showErrorToast?.(`Hovmoller load error: ${err?.message || err}`); }
      return null;
    } finally {
      if (s.loadingSeq === seq) s.abortController = null;
    }
  }

  _redrawOverlay(win) {
    const s = this._getState(win);
    if (!s.activeMap) return;
    showLineHighlight(s.activeMap, s.line.a, s.line.b);
  }
  show(map = null, win = null) {
    const tWin = win || this._activeWin;
    const tId = this._getWinId(tWin);
    for (const [id, st] of this.windows) {
      if (id !== tId) { st.panel?.hide(); setLineHighlightVisible(st.activeMap, false); try { setProfileState("hovmoller", id, { visible: false }); } catch {} }
    }
    const s = this._getState(tWin);
    if (map) s.activeMap = map;
    if (win) this._activeWin = win;
    s.panel?.show();
    try { setProfileState("hovmoller", s.winId, { visible: true }); } catch {}
    setLineHighlightVisible(map || s.activeMap, true);
  }
  hide(map = null, win = null) {
    if (win) {
      const s = this._getState(win);
      s.panel?.hide();
      setLineHighlightVisible(map || s.activeMap, false);
      try {
        if (getProfileState("hovmoller", s.winId)) {
          setProfileState("hovmoller", s.winId, { visible: false });
        }
      } catch {}
      return;
    }
    this._defaultState.panel?.hide();
    setLineHighlightVisible(map || this._defaultState.activeMap, false);
    for (const [, st] of this.windows) { st.panel?.hide(); setLineHighlightVisible(st.activeMap, false); }
    try { setAllProfilesHidden("hovmoller"); } catch {}
  }
  // Panel ✕ behaves like an eye-toggle: hide visuals AND persist visible=false
  // to the layer store (with control sync) so the eye UI and window-focus
  // auto-show stay consistent.
  handlePanelClose(map = null, win = null) {
    const targetWin = win || this.activeWin;
    if (targetWin) this.hide(map, targetWin);
    else this.hide(map || undefined);
    if (targetWin) {
      const l = this._findLayer(targetWin);
      if (l) {
        l.visible = false;
        addOrUpdateLayer(l, targetWin);
        if (typeof getActiveWindow === "function" && getActiveWindow() === targetWin) {
          try { syncLayerControlForWindow(targetWin); } catch {}
        }
      }
    }
  }
  _findLayer(win = this.activeWin) {
    if (!win) return null;
    try {
      const layers = getLayersForWindow(win);
      const l = layers?.find((x) => x.type === "hovmoller" || x.id === "ec-hovmoller-diagram");
      if (l) return l;
    } catch {}
    if (win.layers) { const l = win.layers.find((x) => x.type === "hovmoller" || x.id === "ec-hovmoller-diagram"); if (l) return l; }
    if (win.activeGroup?.layers) return win.activeGroup.layers.find((x) => x.type === "hovmoller" || x.id === "ec-hovmoller-diagram");
    return null;
  }
  _persistConfig(patch = {}, win = this.activeWin) {
    const tWin = win || this.activeWin;
    if (!tWin) return;
    const layer = this._findLayer(tWin);
    if (layer) {
      layer.config = { ...(layer.config || {}), ...patch };
      addOrUpdateLayer(layer, tWin);
      autoSaveLayerConfig();
      if (typeof getActiveWindow === "function" && getActiveWindow() === tWin) syncLayerControlForWindow(tWin);
    }
  }
  destroy(map = null, win = null) {
    let tMap = map, tWin = win;
    if (map && !win && (map.id || map.layers || !map.getLayer)) { tWin = map; tMap = null; }
    else if (map && win && (map.id || map.layers) && typeof win.getLayer === "function") { tWin = map; tMap = win; }
    tWin = tWin || this._activeWin;
    const id = this._getWinId(tWin);
    const s = id === "default" ? this._defaultState : this.windows.get(id);
    if (s) {
      s.loadingSeq++;
      if (s.abortController) { try { s.abortController.abort(); } catch {} s.abortController = null; }
      s.isLayerActive = false;
      s.pickMode = "idle"; s.pendingA = null;
      this._detachMapListeners(tMap || s.activeMap, tWin);
      removeLineHighlight(tMap || s.activeMap);
      try { clearProfileState("hovmoller", id); } catch {}
      if (s.panel) { if (typeof s.panel.destroy === "function") { try { s.panel.destroy(); } catch {} } s.panel = null; }
      s.matrix = null; s.matrixCache.clear();
      s.activeMap = null; s.activeWin = null;
      if (id !== "default") this.windows.delete(id);
    }
    if (this._activeWin && this._getWinId(this._activeWin) === id) this._activeWin = null;
  }
}

export const hovmollerController = new HovmollerController();
