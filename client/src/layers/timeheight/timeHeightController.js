// timeHeightController.js - Cross-section state orchestration, MapLibre interaction, and data lifecycle
import {
  PROFILE_LEVELS,
  buildLeads,
  loadTimeHeightMatrix,
  loadTimeHeightLineMatrix,
} from "./timeHeightLoader.js";
import { snapToGridNode, clampToGridDomain } from "./timeHeightSampling.js";
import { highlightPointOnMap, removePointHighlight, setHighlightVisible } from "./timeHeightHighlight.js";
import {
  validateEndpoints,
  clampEndpointsToDomain,
  validateNPoints,
  buildTransectNodes,
} from "../lineprofile/lineUtils.js";
import {
  showLineHighlight,
  removeLineHighlight,
  setLineHighlightVisible,
  showPendingA,
  showPreviewLine,
  removePreview,
} from "../lineprofile/lineHighlight.js";
import { TimeHeightPanel } from "./timeHeightPanel.js";
import { resolveForecastCycles } from "../../utils/timelineSync.js";
import { autoSaveLayerConfig } from "../../config/presets.js";
import { showErrorToast } from "../../ui/toast.js";
import { addOrUpdateLayer, getLayersForWindow, syncLayerControlForWindow } from "../../ui/layers/layerStore.js";
import { getActiveWindow } from "../../ui/tabs/tabsStore.js";
import { setProfileState, getProfileState, clearProfileState, setAllProfilesHidden } from "../../lib/stores/profilesCore.js";

class WindowState {
  constructor(winId) {
    this.winId = winId;
    this.activePoint = { lon: 121.5, lat: 31.4, i: 0, j: 0 };
    this.mode = "point"; // "point" | "line" (line = transect-averaged profile)
    this.line = { a: { lon: 115.0, lat: 28.0 }, b: { lon: 125.0, lat: 38.0 } };
    this.npoints = 41;
    this.transect = null;
    this.cycle = null;
    this.availableCycles = [];
    this.startHour = 0;
    this.endHour = 144;
    this.stepHours = 12;
    this.leads = buildLeads(0, 144, 12);
    this.levels = [...PROFILE_LEVELS];
    this.timeDirection = "ltr";
    this.matrix = null;
    this.matrixCache = new Map();
    this.loadingSeq = 0;
    this.panel = null;
    this.activeMap = null;
    this.activeWin = null;
    this.isLayerActive = false;
    this.mapClickListener = null;
    this.mapMouseMoveListener = null;
    this.mapContextListener = null;
    this.escHandler = null;
    this.pickMode = "idle"; // "idle" | "draw" | "setA" | "setB" (line mode only)
    this.pendingA = null;
    this.firstGridSample = null;
    this.abortController = null;
  }
}

class TimeHeightController {
  constructor() {
    this.windows = new Map(); // winId -> WindowState
    this._activeWin = null;
    this._defaultState = new WindowState("default");
  }

  _getWinId(win = null) {
    return win?.id || this._activeWin?.id || "default";
  }

  _getState(win = null) {
    const winId = this._getWinId(win);
    if (winId === "default") {
      return this._defaultState;
    }
    let state = this.windows.get(winId);
    if (!state) {
      state = new WindowState(winId);
      if (this._defaultState.cycle) state.cycle = this._defaultState.cycle;
      if (this._defaultState.leads) state.leads = [...this._defaultState.leads];
      if (this._defaultState.levels) state.levels = [...this._defaultState.levels];
      if (this._defaultState.timeDirection) state.timeDirection = this._defaultState.timeDirection;
      this.windows.set(winId, state);
    }
    return state;
  }

  get activePoint() { return this._getState().activePoint; }
  set activePoint(pt) { this._getState().activePoint = pt; }
  get mode() { return this._getState().mode; }
  get line() { return this._getState().line; }
  get npoints() { return this._getState().npoints; }
  get cycle() { return this._getState().cycle; }
  set cycle(c) { this._getState().cycle = c; }
  get availableCycles() { return this._getState().availableCycles; }
  set availableCycles(ac) { this._getState().availableCycles = ac; }
  get startHour() { return this._getState().startHour; }
  set startHour(h) { this._getState().startHour = h; }
  get endHour() { return this._getState().endHour; }
  set endHour(h) { this._getState().endHour = h; }
  get stepHours() { return this._getState().stepHours; }
  set stepHours(s) { this._getState().stepHours = s; }
  get leads() { return this._getState().leads; }
  set leads(l) { this._getState().leads = l; }
  get levels() { return this._getState().levels; }
  set levels(l) { this._getState().levels = l; }
  get timeDirection() { return this._getState().timeDirection; }
  set timeDirection(d) { this._getState().timeDirection = d; }
  get matrix() { return this._getState().matrix; }
  set matrix(m) { this._getState().matrix = m; }
  get matrixCache() { return this._getState().matrixCache; }
  set matrixCache(mc) { this._getState().matrixCache = mc; }
  get loadingSeq() { return this._getState().loadingSeq; }
  set loadingSeq(s) { this._getState().loadingSeq = s; }
  get panel() { return this._getState().panel; }
  set panel(p) { this._getState().panel = p; }
  get activeMap() { return this._getState().activeMap; }
  set activeMap(m) { this._getState().activeMap = m; }
  get activeWin() { return this._activeWin; }
  set activeWin(w) {
    this._activeWin = w || null;
    if (w) {
      const state = this._getState(w);
      state.activeWin = w;
    }
  }
  get isLayerActive() { return this._getState().isLayerActive; }
  set isLayerActive(a) { this._getState().isLayerActive = a; }
  get mapClickListener() { return this._getState().mapClickListener; }
  set mapClickListener(l) { this._getState().mapClickListener = l; }
  get firstGridSample() { return this._getState().firstGridSample; }
  set firstGridSample(s) { this._getState().firstGridSample = s; }

  isActive(win = null) {
    if (win) {
      const winId = this._getWinId(win);
      const state = winId === "default" ? this._defaultState : this.windows.get(winId);
      return Boolean(state?.isLayerActive);
    }
    if (this._defaultState.isLayerActive) return true;
    for (const state of this.windows.values()) {
      if (state.isLayerActive) return true;
    }
    return false;
  }

  async init(map, win, layerDef = {}) {
    const state = this._getState(win);
    state.activeMap = map;
    state.activeWin = win;
    state.isLayerActive = true;
    this.activeWin = win;

    const config = layerDef.config || {};
    if (config.lon !== undefined && config.lat !== undefined) {
      state.activePoint = { lon: config.lon, lat: config.lat, i: 0, j: 0 };
    }
    state.mode = config.mode === "line" ? "line" : "point";
    if (config.lon0 !== undefined && config.lat0 !== undefined) {
      state.line.a = { lon: config.lon0, lat: config.lat0 };
    }
    if (config.lon1 !== undefined && config.lat1 !== undefined) {
      state.line.b = { lon: config.lon1, lat: config.lat1 };
    }
    if (config.npoints !== undefined) {
      const nv = validateNPoints(config.npoints);
      if (nv.ok) state.npoints = nv.value;
    }
    state.startHour = config.startHour !== undefined ? config.startHour : 0;
    state.endHour = config.endHour !== undefined ? config.endHour : 144;
    state.stepHours = config.stepHours !== undefined ? config.stepHours : 12;
    state.leads = buildLeads(state.startHour, state.endHour, state.stepHours);
    state.timeDirection = config.timeDirection || "ltr";
    state.levels = config.levels || [...PROFILE_LEVELS];

    // Resolve available forecast cycles
    try {
      const cycles = await resolveForecastCycles("ECMWF_HR", "TMP", 500);
      if (cycles && cycles.length > 0) {
        state.availableCycles = cycles;
        state.cycle = config.initCycle || win?.initCycle || cycles[0];
      }
    } catch {
      state.cycle = config.initCycle || "latest";
    }

    if (!state.cycle) {
      state.cycle = "latest";
    }

    // Initialize floating panel for this window
    if (!state.panel) {
      state.panel = new TimeHeightPanel({
        windowId: state.winId,
        defaultPoint: state.activePoint,
        startHour: state.startHour,
        endHour: state.endHour,
        stepHours: state.stepHours,
        timeDirection: state.timeDirection,
        mode: state.mode,
        lineA: state.line.a,
        lineB: state.line.b,
        npoints: state.npoints,
        onRangeChange: (start, end, step) => this.setRange(start, end, step, win),
        onCycleChange: (cycle) => this.setCycle(cycle, win),
        onDirectionChange: (dir) => this.setTimeDirection(dir, win),
        onToggleElement: (element, checked) => this.syncDrawerCheckbox(element, checked, win),
        onModeChange: (mode) => this.setMode(mode, win),
        onLineChange: (a, b, n) => this.setLine(a, b, n, win),
        onDrawLine: () => this.startDraw(win),
        onSetA: () => this.setAFromMap(win),
        onSetB: () => this.setBFromMap(win),
        onNChange: (n) => {
          const st = this._getState(win);
          this.setLine(st.line.a, st.line.b, n, win);
        },
        onCancel: () => this.cancelLoad(win),
        onClose: () => this.handlePanelClose(map, win),
      });
    }

    state.panel.setCycle(state.cycle, state.availableCycles);
    state.panel.setPoint(state.activePoint.lon, state.activePoint.lat);
    state.panel.setTimeDirection(state.timeDirection);
    state.panel.setMode(state.mode);
    state.transect = this.getTransect(win);
    state.panel.setLine(state.line.a, state.line.b, state.npoints, state.transect.totalKm);
    this._syncProfileStore(win);

    if (layerDef.visible === false) {
      this.hide(map, win);
    } else {
      this.show(map, win);
    }

    // Register Map click listener
    this._setupMapClick(map, win);

    // Initial overlay marker for the active mode
    this._redrawOverlay(win);

    // Initial bulk or cached matrix load
    return this.loadMatrix(win);
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
      const prev = getProfileState("timeheight", s.winId);
      setProfileState("timeheight", s.winId, {
        mode: s.mode,
        lon: s.activePoint.lon, lat: s.activePoint.lat,
        lineA: { ...s.line.a }, lineB: { ...s.line.b }, npoints: s.npoints,
        cycle: s.cycle, startHour: s.startHour, endHour: s.endHour,
        stepHours: s.stepHours, timeDirection: s.timeDirection,
        visible: prev ? prev.visible : false,
      });
    } catch {}
  }

  _setupMapClick(map, win = null) {
    if (!map || typeof map.on !== "function") return;
    const state = this._getState(win);
    this._detachMapListeners(map, win);
    state.mapClickListener = (e) => {
      if (!this.isActive(win)) return;
      const st = this._getState(win);
      if (e.originalEvent) {
        const target = e.originalEvent.target;
        if (target && (target.closest?.(".timeheight-subwindow") || target.closest?.(".layer-drawer") || target.closest?.(".navbar"))) {
          return;
        }
      }
      const lng = e.lngLat ? e.lngLat.lng : map.unproject(e.point).lng;
      const lat = e.lngLat ? e.lngLat.lat : map.unproject(e.point).lat;
      if (st.mode === "line") {
        if (st.pickMode === "idle") return; // disarmed-click no-op
        this._handlePickClick(lng, lat, win, map);
        return;
      }
      this.setPoint(lng, lat, win, map);
    };
    state.mapMouseMoveListener = (e) => {
      const st = this._getState(win);
      if (!this.isActive(win) || st.mode !== "line" || st.pickMode !== "draw" || !st.pendingA) return;
      const lng = e.lngLat ? e.lngLat.lng : null;
      const lat = e.lngLat ? e.lngLat.lat : null;
      if (lng === null) return;
      showPreviewLine(map, st.pendingA, { lon: lng, lat });
    };
    state.mapContextListener = (e) => {
      const st = this._getState(win);
      if (!this.isActive(win) || st.mode !== "line" || st.pickMode === "idle") return;
      if (e.originalEvent?.preventDefault) e.originalEvent.preventDefault();
      else if (typeof e.preventDefault === "function") e.preventDefault();
      this.cancelPick(win, map);
    };
    state.escHandler = (e) => {
      if (e.key !== "Escape" && e.key !== "Esc") return;
      const st = this._getState(win);
      if (st.mode === "line" && st.pickMode !== "idle") { e.stopPropagation?.(); this.cancelPick(win, map); }
    };
    map.on("click", state.mapClickListener);
    map.on("mousemove", state.mapMouseMoveListener);
    try { map.on("contextmenu", state.mapContextListener); } catch {}
    if (typeof window !== "undefined") window.addEventListener("keydown", state.escHandler);
  }

  _detachMapListeners(map, win = null) {
    const state = this._getState(win);
    const m = map || state.activeMap;
    if (m && typeof m.off === "function") {
      if (state.mapClickListener) m.off("click", state.mapClickListener);
      if (state.mapMouseMoveListener) m.off("mousemove", state.mapMouseMoveListener);
      if (state.mapContextListener) { try { m.off("contextmenu", state.mapContextListener); } catch {} }
    }
    if (state.escHandler && typeof window !== "undefined") window.removeEventListener("keydown", state.escHandler);
    state.mapClickListener = state.mapMouseMoveListener = state.mapContextListener = state.escHandler = null;
  }

  startDraw(win = null) {
    const s = this._getState(win);
    if (s.mode !== "line") this._applyMode("line", win);
    s.pickMode = "draw"; s.pendingA = null;
    removePreview(s.activeMap);
    s.panel?.setPickHint?.("draw");
  }

  setAFromMap(win = null) {
    const s = this._getState(win);
    if (s.mode !== "line") this._applyMode("line", win);
    s.pickMode = "setA"; s.pendingA = null;
    removePreview(s.activeMap);
    s.panel?.setPickHint?.("setA");
  }

  setBFromMap(win = null) {
    const s = this._getState(win);
    if (s.mode !== "line") this._applyMode("line", win);
    s.pickMode = "setB"; s.pendingA = null;
    removePreview(s.activeMap);
    s.panel?.setPickHint?.("setB");
  }

  cancelPick(win = null, map = null) {
    const s = this._getState(win);
    s.pickMode = "idle"; s.pendingA = null;
    removePreview(map || s.activeMap);
    s.panel?.setPickHint?.(null);
  }

  _handlePickClick(lon, lat, win, map) {
    const s = this._getState(win);
    const pt = { lon: Math.round(lon * 10000) / 10000, lat: Math.round(lat * 10000) / 10000 };
    if (s.pickMode === "draw") {
      if (!s.pendingA) {
        s.pendingA = pt;
        showPendingA(map, pt);
        s.panel?.setPickHint?.("draw");
      } else {
        const a = s.pendingA;
        const chk = validateEndpoints(a, pt);
        if (!chk.ok) { showErrorToast?.(chk.error); return; }
        s.pendingA = null;
        removePreview(map);
        s.pickMode = "idle";
        s.panel?.setPickHint?.(null);
        this.setLine(a, pt, s.npoints, win);
      }
    } else if (s.pickMode === "setA") {
      const chk = validateEndpoints(pt, s.line.b);
      if (!chk.ok) { showErrorToast?.(chk.error); s.pickMode = "idle"; return; }
      s.pickMode = "idle";
      s.panel?.setPickHint?.(null);
      this.setLine(pt, s.line.b, s.npoints, win);
    } else if (s.pickMode === "setB") {
      const chk = validateEndpoints(s.line.a, pt);
      if (!chk.ok) { showErrorToast?.(chk.error); s.pickMode = "idle"; return; }
      s.pickMode = "idle";
      s.panel?.setPickHint?.(null);
      this.setLine(s.line.a, pt, s.npoints, win);
    }
  }

  _redrawOverlay(win) {
    const s = this._getState(win);
    const map = s.activeMap;
    if (!map) return;
    if (s.mode === "line") {
      removePointHighlight(map);
      showLineHighlight(map, s.line.a, s.line.b);
    } else {
      removeLineHighlight(map);
      removePreview(map);
      highlightPointOnMap(map, s.activePoint.lon, s.activePoint.lat);
    }
  }

  setMode(mode, win = this.activeWin) {
    if (mode !== "point" && mode !== "line") return null;
    const s = this._getState(win);
    if (s.mode === mode && s.matrix) {
      s.panel?.setMode?.(mode);
      return s.matrix;
    }
    this._applyMode(mode, win);
    return this.loadMatrix(win);
  }

  _applyMode(mode, win) {
    const s = this._getState(win);
    s.mode = mode;
    s.pickMode = "idle"; s.pendingA = null;
    removePreview(s.activeMap);
    s.panel?.setMode?.(mode);
    s.panel?.setPickHint?.(null);
    this._redrawOverlay(win);
    this._persistConfig({ mode }, win);
    this._syncProfileStore(win);
  }

  async setPoint(lon, lat, win = this.activeWin, map = null) {
    const state = this._getState(win);
    // Explicit point edits (drawer/panel inputs) return to point mode
    if (state.mode !== "point") this._applyMode("point", win);
    const targetMap = map || state.activeMap;

    const clamped = clampToGridDomain(state.firstGridSample, lon, lat);
    if (clamped.clamped) {
      showErrorToast?.(`Selected point (${lon.toFixed(2)}°, ${lat.toFixed(2)}°) clamped to model domain.`);
    }

    const snapped = snapToGridNode(state.firstGridSample, clamped.lon, clamped.lat);
    state.activePoint = snapped;

    // Move map marker
    this.highlightPointOnMap(targetMap, snapped.lon, snapped.lat);

    // Update panel header and drawer
    state.panel?.setPoint(snapped.lon, snapped.lat, snapped.i, snapped.j);
    this._persistConfig({ lon: snapped.lon, lat: snapped.lat }, win);
    this._syncProfileStore(win);

    // Check fast-path resample from per-point matrixCache
    const leadsKey = state.leads.join(",");
    const levelsKey = state.levels.join(",");
    const matrixKey = `${state.cycle}|${leadsKey}|${levelsKey}|${snapped.i},${snapped.j}`;

    if (state.matrixCache.has(matrixKey)) {
      state.matrix = state.matrixCache.get(matrixKey);
      state.panel?.setData(state.matrix);
      return state.matrix;
    }

    // Cold/repeat path: profile endpoint with server-side file cache acceleration
    return this.loadMatrix(win);
  }

  async setLine(a, b, npoints = null, win = null) {
    // win may ride as 4th arg or in place of npoints (panel callbacks)
    if (win !== null && typeof win === "object" && (typeof win.id === "string" || win.winIdx !== undefined)) {
      // ok
    } else if (typeof npoints === "object" && npoints !== null && (npoints.id || npoints.winIdx !== undefined)) {
      win = npoints; npoints = null;
    }
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
    if (s.mode !== "line") this._applyMode("line", win);
    s.line = {
      a: { lon: Math.round(cl.a.lon * 10000) / 10000, lat: Math.round(cl.a.lat * 10000) / 10000 },
      b: { lon: Math.round(cl.b.lon * 10000) / 10000, lat: Math.round(cl.b.lat * 10000) / 10000 },
    };
    s.npoints = n;
    s.transect = this.getTransect(win);
    s.panel?.setLine?.(s.line.a, s.line.b, s.npoints, s.transect.totalKm);
    this._redrawOverlay(win);
    this._persistConfig({ lon0: s.line.a.lon, lat0: s.line.a.lat, lon1: s.line.b.lon, lat1: s.line.b.lat, npoints: s.npoints }, win);
    this._syncProfileStore(win);
    return this.loadMatrix(win);
  }

  _lineCacheKey(s) {
    return `${s.cycle}|${s.leads.join(",")}|${s.levels.join(",")}|line:${s.line.a.lon},${s.line.a.lat}|${s.line.b.lon},${s.line.b.lat}|n${s.npoints}`;
  }

  setRange(start, end, step, win = this.activeWin) {
    const state = this._getState(win);
    const validLeads = buildLeads(start, end, step);
    if (!validLeads || validLeads.length === 0) {
      showErrorToast?.("Invalid forecast range or step interval.");
      return;
    }

    state.startHour = validLeads[0];
    state.endHour = validLeads[validLeads.length - 1];
    state.stepHours = step;
    state.leads = validLeads;

    this._persistConfig({
      startHour: state.startHour,
      endHour: state.endHour,
      stepHours: state.stepHours,
    }, win);

    state.panel?.setRange(state.startHour, state.endHour, state.stepHours);
    this._syncProfileStore(win);

    return this.loadMatrix(win);
  }

  setCycle(cycle, win = this.activeWin) {
    const state = this._getState(win);
    if (!cycle || cycle === state.cycle) return;
    state.cycle = cycle;
    state.panel?.setCycle(state.cycle, state.availableCycles);
    this._persistConfig({ initCycle: cycle }, win);
    this._syncProfileStore(win);
    return this.loadMatrix(win);
  }

  setTimeDirection(dir, win = this.activeWin) {
    if (dir !== "ltr" && dir !== "rtl") return;
    const state = this._getState(win);
    state.timeDirection = dir;
    state.panel?.setTimeDirection(dir);
    this._persistConfig({ timeDirection: dir }, win);
    this._syncProfileStore(win);
  }

  updateCursorLead(lead, win = null) {
    const state = this._getState(win);
    state.panel?.setCursorLead(lead);
  }

  _setMatrixCache(state, matrixKey, matrix) {
    if (state.matrixCache.has(matrixKey)) {
      state.matrixCache.delete(matrixKey);
    }
    state.matrixCache.set(matrixKey, matrix);
    while (state.matrixCache.size > 20) {
      const oldestKey = state.matrixCache.keys().next().value;
      if (oldestKey !== undefined) {
        state.matrixCache.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  cancelLoad(win = null) {
    const state = this._getState(win);
    state.loadingSeq++;
    if (state.abortController) {
      try {
        state.abortController.abort();
      } catch {}
      state.abortController = null;
    }
    state.panel?.hideProgress();
  }

  syncDrawerCheckbox(element, checked, win = null) {
    const targetWin = win || this.activeWin;
    if (typeof document !== "undefined") {
      const drawer = document.querySelector?.(`.layer-config[data-layer-id="ec-timeheight-diagram"]`);
      if (drawer) {
        const map = {
          RH: ".chk-th-rh",
          TMP: ".chk-th-temp",
          VVEL: ".chk-th-vvel",
          WIND: ".chk-th-wind",
        };
        const cb = drawer.querySelector?.(map[element]);
        if (cb) cb.checked = Boolean(checked);
      }
    }
    const propMap = { RH: "showRH", TMP: "showTemp", VVEL: "showVVel", WIND: "showWind" };
    if (propMap[element]) {
      this._persistConfig({ [propMap[element]]: Boolean(checked) }, targetWin);
    }
  }

  async loadMatrix(win = this.activeWin) {
    const state = this._getState(win);
    if (state.mode === "line") return this.loadLineMatrix(win);
    const seq = ++state.loadingSeq;
    if (state.abortController) {
      try {
        state.abortController.abort();
      } catch {}
    }
    state.abortController = new AbortController();

    state.panel?.setProgress({ loaded: 0, total: state.leads.length * state.levels.length * 4, pct: 0 });

    try {
      const res = await loadTimeHeightMatrix({
        win,
        model: "ECMWF_HR",
        cycle: state.cycle,
        leads: state.leads,
        levels: state.levels,
        point: state.activePoint,
        signalSeq: seq,
        abortController: state.abortController,
        isCancelled: () => state.loadingSeq !== seq,
        onProgress: (prog) => {
          if (state.loadingSeq === seq) {
            state.panel?.setProgress(prog);
          }
        },
      });

      if (state.loadingSeq !== seq || !res || res.cancelled) {
        return null;
      }

      state.panel?.hideProgress();
      if (res.matrix) {
        state.matrix = res.matrix;
        state.activePoint = res.matrix.point;

        const leadsKey = state.leads.join(",");
        const levelsKey = state.levels.join(",");
        const matrixKey = `${state.cycle}|${leadsKey}|${levelsKey}|${state.activePoint.i},${state.activePoint.j}`;
        this._setMatrixCache(state, matrixKey, state.matrix);

        state.panel?.setData(state.matrix);
        state.panel?.setPoint(state.activePoint.lon, state.activePoint.lat, state.activePoint.i, state.activePoint.j);
      }

      if (res.stats.failed > 0 && res.stats.failed === res.stats.total) {
        showErrorToast?.(`Failed to load profile grids for cycle ${state.cycle}.`);
      }

      return state.matrix;
    } catch (err) {
      if (state.loadingSeq === seq) {
        state.panel?.hideProgress();
        showErrorToast?.(`Time-height matrix load error: ${err?.message || err}`);
      }
      return null;
    } finally {
      if (state.loadingSeq === seq) {
        state.abortController = null;
      }
    }
  }

  async loadLineMatrix(win = this.activeWin) {
    const state = this._getState(win);
    // Fast path: exact-key memory serve on line revisit (no fetch, no progress flash)
    const key = this._lineCacheKey(state);
    if (state.matrixCache.has(key)) {
      state.matrix = state.matrixCache.get(key);
      state.transect = this.getTransect(win);
      state.panel?.setLine?.(state.line.a, state.line.b, state.npoints, state.transect.totalKm);
      state.panel?.setData(state.matrix);
      return state.matrix;
    }
    const seq = ++state.loadingSeq;
    if (state.abortController) {
      try {
        state.abortController.abort();
      } catch {}
    }
    state.abortController = new AbortController();

    state.panel?.setProgress({ loaded: 0, total: state.leads.length * state.levels.length * 4, pct: 0 });

    try {
      const res = await loadTimeHeightLineMatrix({
        win,
        model: "ECMWF_HR",
        cycle: state.cycle,
        leads: state.leads,
        levels: state.levels,
        line: state.line,
        npoints: state.npoints,
        abortController: state.abortController,
        isCancelled: () => state.loadingSeq !== seq,
        onProgress: (prog) => {
          if (state.loadingSeq === seq) {
            state.panel?.setProgress(prog);
          }
        },
      });

      if (state.loadingSeq !== seq || !res || res.cancelled) {
        return null;
      }

      state.panel?.hideProgress();
      if (res.matrix) {
        state.matrix = res.matrix;
        state.activePoint = res.matrix.point;
        state.transect = this.getTransect(win);
        this._setMatrixCache(state, this._lineCacheKey(state), state.matrix);
        state.panel?.setLine?.(state.line.a, state.line.b, state.npoints, state.transect.totalKm);
        state.panel?.setData(state.matrix);
      }

      if (res.stats.failed > 0 && !res.matrix) {
        showErrorToast?.(`Failed to load line-averaged profile for cycle ${state.cycle}.`);
      }

      return state.matrix;
    } catch (err) {
      if (state.loadingSeq === seq) {
        state.panel?.hideProgress();
        showErrorToast?.(`Time-height line-average load error: ${err?.message || err}`);
      }
      return null;
    } finally {
      if (state.loadingSeq === seq) {
        state.abortController = null;
      }
    }
  }

  highlightPointOnMap(map, lon, lat) {
    highlightPointOnMap(map, lon, lat);
  }

  removePointHighlight(map = null) {
    removePointHighlight(map || this.activeMap);
  }

  setHighlightVisible(map = null, visible = true) {
    setHighlightVisible(map || this.activeMap, visible);
  }

  show(map = null, win = null) {
    const targetWin = win || this._activeWin;
    const targetWinId = this._getWinId(targetWin);
    for (const [winId, s] of this.windows) {
      if (winId !== targetWinId) {
        s.panel?.hide();
        this.setHighlightVisible(s.activeMap, false);
        setLineHighlightVisible(s.activeMap, false);
        try { setProfileState("timeheight", winId, { visible: false }); } catch {}
      }
    }
    const state = this._getState(targetWin);
    if (map) state.activeMap = map;
    if (win) this._activeWin = win;
    state.panel?.show();
    try { setProfileState("timeheight", state.winId, { visible: true }); } catch {}
    const targetMap = map || state.activeMap;
    if (state.mode === "line") {
      this.setHighlightVisible(targetMap, false);
      setLineHighlightVisible(targetMap, true);
    } else {
      setLineHighlightVisible(targetMap, false);
      this.setHighlightVisible(targetMap, true);
    }
  }

  hide(map = null, win = null) {
    if (win) {
      const state = this._getState(win);
      state.panel?.hide();
      this.setHighlightVisible(map || state.activeMap, false);
      setLineHighlightVisible(map || state.activeMap, false);
      try {
        if (getProfileState("timeheight", state.winId)) {
          setProfileState("timeheight", state.winId, { visible: false });
        }
      } catch {}
      return;
    }
    this._defaultState.panel?.hide();
    this.setHighlightVisible(map || this._defaultState.activeMap, false);
    setLineHighlightVisible(map || this._defaultState.activeMap, false);
    for (const [_, s] of this.windows) {
      s.panel?.hide();
      this.setHighlightVisible(s.activeMap, false);
      setLineHighlightVisible(s.activeMap, false);
    }
    try { setAllProfilesHidden("timeheight"); } catch {}
  }

  // Panel ✕ behaves like an eye-toggle: hide visuals AND persist visible=false
  // to the layer store (with control sync) so the eye UI and window-focus
  // auto-show stay consistent.
  handlePanelClose(map = null, win = null) {
    const targetWin = win || this._activeWin;
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

  toggle(map = null, win = null) {
    const state = this._getState(win);
    if (!state.panel) return;
    if (state.panel.container && state.panel.container.style.display === "none") {
      this.show(map, win);
    } else {
      this.hide(map, win);
    }
  }

  _findLayer(win = this.activeWin) {
    if (!win) return null;
    try {
      const layers = getLayersForWindow(win);
      const l = layers?.find((lyr) => lyr.type === "timeheight" || lyr.id === "ec-timeheight-diagram");
      if (l) return l;
    } catch {}
    if (win.layers) {
      const l = win.layers.find((lyr) => lyr.type === "timeheight" || lyr.id === "ec-timeheight-diagram");
      if (l) return l;
    }
    if (win.activeGroup?.layers) {
      return win.activeGroup.layers.find((lyr) => lyr.type === "timeheight" || lyr.id === "ec-timeheight-diagram");
    }
    return null;
  }

  _persistConfig(patch = {}, win = this.activeWin) {
    const targetWin = win || this.activeWin;
    if (!targetWin) return;
    const layer = this._findLayer(targetWin);
    if (layer) {
      layer.config = { ...(layer.config || {}), ...patch };
      addOrUpdateLayer(layer, targetWin);
      autoSaveLayerConfig();
      if (typeof getActiveWindow === "function" && getActiveWindow() === targetWin) {
        syncLayerControlForWindow(targetWin);
      }
    }
  }

  destroy(map = null, win = null) {
    let targetMap = map;
    let targetWin = win;
    if (map && !win && (map.id || map.layers || map._thGridCache || !map.getLayer)) {
      targetWin = map;
      targetMap = null;
    } else if (map && win && (map.id || map.layers) && typeof win.getLayer === "function") {
      targetWin = map;
      targetMap = win;
    }
    targetWin = targetWin || this._activeWin;
    const winId = this._getWinId(targetWin);
    const state = winId === "default" ? this._defaultState : this.windows.get(winId);

    if (state) {
      state.loadingSeq++;
      if (state.abortController) {
        try {
          state.abortController.abort();
        } catch {}
        state.abortController = null;
      }
      state.isLayerActive = false;
      state.pickMode = "idle"; state.pendingA = null;
      const actualMap = targetMap || state.activeMap;
      this._detachMapListeners(actualMap, targetWin);
      this.removePointHighlight(actualMap);
      removeLineHighlight(actualMap);
      removePreview(actualMap);
      try { clearProfileState("timeheight", winId); } catch {}
      if (state.panel) {
        if (typeof state.panel.destroy === "function") {
          try { state.panel.destroy(); } catch {}
        }
        state.panel = null;
      }
      state.matrix = null;
      state.matrixCache.clear();
      state.activeMap = null;
      state.activeWin = null;
      if (winId !== "default") {
        this.windows.delete(winId);
      }
    }

    if (this._activeWin && this._getWinId(this._activeWin) === winId) {
      this._activeWin = null;
    }
  }
}

export const timeHeightController = new TimeHeightController();
