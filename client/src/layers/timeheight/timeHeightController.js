// timeHeightController.js - Cross-section state orchestration, MapLibre interaction, and data lifecycle
import {
  PROFILE_LEVELS,
  buildLeads,
  loadTimeHeightMatrix,
} from "./timeHeightLoader.js";
import { snapToGridNode, clampToGridDomain } from "./timeHeightSampling.js";
import { highlightPointOnMap, removePointHighlight, setHighlightVisible } from "./timeHeightHighlight.js";
import { TimeHeightPanel } from "./timeHeightPanel.js";
import { resolveForecastCycles } from "../../utils/timelineSync.js";
import { autoSaveLayerConfig } from "../../config/presets.js";
import { showErrorToast } from "../../ui/toast.js";
import { addOrUpdateLayer, getLayersForWindow, syncLayerControlForWindow } from "../../ui/layers/layerStore.js";
import { getActiveWindow } from "../../ui/tabs/tabsStore.js";

class WindowState {
  constructor(winId) {
    this.winId = winId;
    this.activePoint = { lon: 121.5, lat: 31.4, i: 0, j: 0 };
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
        onRangeChange: (start, end, step) => this.setRange(start, end, step, win),
        onCycleChange: (cycle) => this.setCycle(cycle, win),
        onDirectionChange: (dir) => this.setTimeDirection(dir, win),
        onToggleElement: (element, checked) => this.syncDrawerCheckbox(element, checked, win),
        onCancel: () => this.cancelLoad(win),
        onClose: () => {
          this.hide(map, win);
          if (win) {
            const l = this._findLayer(win);
            if (l) l.visible = false;
          }
        },
      });
    }

    state.panel.setCycle(state.cycle, state.availableCycles);
    state.panel.setPoint(state.activePoint.lon, state.activePoint.lat);
    state.panel.setTimeDirection(state.timeDirection);

    if (layerDef.visible === false) {
      this.hide(map, win);
    } else {
      this.show(map, win);
    }

    // Register Map click listener
    this._setupMapClick(map, win);

    // Initial highlight marker
    this.highlightPointOnMap(map, state.activePoint.lon, state.activePoint.lat);

    // Initial bulk or cached matrix load
    return this.loadMatrix(win);
  }

  _setupMapClick(map, win = null) {
    if (!map || typeof map.on !== "function") return;
    const state = this._getState(win);
    if (state.mapClickListener) {
      map.off("click", state.mapClickListener);
    }
    state.mapClickListener = (e) => {
      if (!this.isActive(win)) return;
      if (e.originalEvent) {
        const target = e.originalEvent.target;
        if (target && (target.closest?.(".timeheight-subwindow") || target.closest?.(".layer-drawer") || target.closest?.(".navbar"))) {
          return;
        }
      }
      const lng = e.lngLat ? e.lngLat.lng : map.unproject(e.point).lng;
      const lat = e.lngLat ? e.lngLat.lat : map.unproject(e.point).lat;
      this.setPoint(lng, lat, win, map);
    };
    map.on("click", state.mapClickListener);
  }

  async setPoint(lon, lat, win = this.activeWin, map = null) {
    const state = this._getState(win);
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

    return this.loadMatrix(win);
  }

  setCycle(cycle, win = this.activeWin) {
    const state = this._getState(win);
    if (!cycle || cycle === state.cycle) return;
    state.cycle = cycle;
    state.panel?.setCycle(state.cycle, state.availableCycles);
    this._persistConfig({ initCycle: cycle }, win);
    return this.loadMatrix(win);
  }

  setTimeDirection(dir, win = this.activeWin) {
    if (dir !== "ltr" && dir !== "rtl") return;
    const state = this._getState(win);
    state.timeDirection = dir;
    state.panel?.setTimeDirection(dir);
    this._persistConfig({ timeDirection: dir }, win);
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
      }
    }
    const state = this._getState(targetWin);
    if (map) state.activeMap = map;
    if (win) this._activeWin = win;
    state.panel?.show();
    this.setHighlightVisible(map || state.activeMap, true);
  }

  hide(map = null, win = null) {
    if (win) {
      const state = this._getState(win);
      state.panel?.hide();
      this.setHighlightVisible(map || state.activeMap, false);
      return;
    }
    this._defaultState.panel?.hide();
    this.setHighlightVisible(map || this._defaultState.activeMap, false);
    for (const [_, s] of this.windows) {
      s.panel?.hide();
      this.setHighlightVisible(s.activeMap, false);
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
      const actualMap = targetMap || state.activeMap;
      if (actualMap && state.mapClickListener) {
        actualMap.off("click", state.mapClickListener);
        state.mapClickListener = null;
      }
      this.removePointHighlight(actualMap);
      if (state.panel) {
        state.panel.destroy();
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
