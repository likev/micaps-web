// tlogpController.js - Thermodynamic state management, station toggling, and UI coordination
import { fetchJson } from "../../api/apiClient.js";
import { computeParcelAscent } from "./tlogpMath.js";
import { TLogPPanel } from "./tlogpPanel.js";
import { autoSaveLayerConfig } from "../../config/presets.js";
import { showErrorToast } from "../../ui/toast.js";
import { addOrUpdateLayer, getLayerById, getLayersForWindow, syncLayerControlForWindow } from "../../ui/layers/layerStore.js";
import { getActiveWindow } from "../../ui/tabs/tabsStore.js";

class TLogPController {
  constructor() {
    this.activeStationId = "58362";
    this.activeParcelLevel = "surface";
    this.customPressure = null;
    this.obsFile = null;
    this.sounding = null;
    this.parcelResult = null;
    this.parcelCache = new Map();
    this.panel = null;
    this.activeMap = null;
    this.activeWin = null;
    this.isLayerActive = false;
  }

  isActive() {
    return this.isLayerActive;
  }

  init(map, win, layerDef = {}) {
    this.activeMap = map;
    this.activeWin = win;
    this.isLayerActive = true;

    if (layerDef.config?.stationId) {
      this.activeStationId = layerDef.config.stationId;
    } else if (layerDef.stationId) {
      this.activeStationId = layerDef.stationId;
    }

    if (win) {
      win.tlogpStation = this.activeStationId;
    }

    this.activeParcelLevel = layerDef.config?.parcelLevel || layerDef.parcelLevel || "surface";

    if (!this.panel) {
      this.panel = new TLogPPanel({
        defaultStationId: this.activeStationId,
        onParcelLevelChange: (lvl, customP) => {
          this.setParcelLevel(lvl, customP, this.activeWin);
        },
        onClose: () => {
          this.hide();
          if (this.activeWin) {
            const layer = this._findTLogPLayer(this.activeWin);
            if (layer) {
              layer.visible = false;
            }
          }
        },
      });
    }

    if (layerDef.visible === false) {
      this.hide();
    } else {
      this.show();
    }

    this.obsFile = win?.obsTime || null;
    return this.loadSounding(map, win);
  }

  async loadSounding(map = this.activeMap, win = this.activeWin) {
    const file = this.obsFile || win?.obsTime || "latest";
    const stn = this.activeStationId || "58362";

    try {
      const data = await fetchJson("/api/data/tlogp", { file, station: stn });
      if (!data || !data.levels || data.levels.length === 0) {
        throw new Error(`Empty sounding profile for station ${stn}`);
      }

      this.sounding = data;
      // Pre-sort levels descending by pressure once per sounding to optimize interpolations
      data.levels._sorted = [...data.levels]
        .filter((l) => l.pressure > 0 && l.temp > -9000)
        .sort((a, b) => b.pressure - a.pressure);

      // Pre-calculate and memoize parcel ascent results for standard levels (plan §8.5)
      this.parcelCache.clear();
      for (const lvl of ["surface", "925", "850", "700"]) {
        this.parcelCache.set(lvl, computeParcelAscent(data.levels, lvl));
      }

      if (this.activeParcelLevel === "custom") {
        this.parcelResult = computeParcelAscent(data.levels, "custom", this.customPressure || 700);
      } else {
        this.parcelResult = this.parcelCache.get(this.activeParcelLevel) || computeParcelAscent(data.levels, this.activeParcelLevel);
      }

      if (this.panel) {
        if (typeof this.panel.setParcelLevel === "function") {
          this.panel.setParcelLevel(this.activeParcelLevel, this.customPressure, true);
        }
        if (typeof this.panel.update === "function") {
          this.panel.update(this.sounding, this.parcelResult);
        }
      }

      if (map && data.lon !== undefined && data.lat !== undefined) {
        this.highlightStationOnMap(map, data.lon, data.lat, stn);
        if (typeof map.flyTo === "function") {
          map.flyTo({ center: [data.lon, data.lat], duration: 600 });
        } else if (typeof map.easeTo === "function") {
          map.easeTo({ center: [data.lon, data.lat], duration: 600 });
        }
      }

      this._syncLayerControlUI(win, data);
      if (win) {
        const layer = this._findTLogPLayer(win);
        if (layer) {
          const stnName = data.stationName || stn;
          if (!layer.config) layer.config = {};
          layer.config.stationId = stn;
          layer.config.stationName = `${stn} ${stnName}`;
          layer.stationId = stn;
          layer.name = `T-lnP Sounding Diagram (${stn} ${stnName})`;
          addOrUpdateLayer(layer, win);
        }
      }
      return data;
    } catch (err) {
      console.warn(`[TLogPController] Failed to load sounding for station ${stn}:`, err);
      showErrorToast(`Sounding station ${stn} data unavailable (${err.message || err})`);
      return null;
    }
  }

  async setStation(stationId, win = this.activeWin, map = this.activeMap, syncConfig = true) {
    stationId = String(stationId).trim();
    if (!stationId) return;

    if (!/^\d{5}$/.test(stationId)) {
      showErrorToast(`Invalid station ID "${stationId}": must be 5 digits`);
      this._syncLayerControlUI(win, { stationId: this.activeStationId, stationName: this.sounding?.stationName });
      return;
    }

    if (stationId === this.activeStationId && this.sounding) {
      return;
    }

    const prevStation = this.activeStationId;
    this.activeStationId = stationId;

    const data = await this.loadSounding(map, win);
    if (!data) {
      // Revert if station not found
      this.activeStationId = prevStation;
      return;
    }

    if (win) {
      win.tlogpStation = stationId;
    }

    if (syncConfig && win) {
      const layer = this._findTLogPLayer(win);
      const stnName = data.stationName || stationId;
      if (layer) {
        if (!layer.config) layer.config = {};
        layer.config.stationId = stationId;
        layer.config.stationName = `${stationId} ${stnName}`;
        layer.stationId = stationId;
        layer.name = `T-lnP Sounding Diagram (${stationId} ${stnName})`;
        addOrUpdateLayer(layer, win);
      }
      autoSaveLayerConfig();
      if (typeof getActiveWindow === "function" && getActiveWindow() === win) {
        syncLayerControlForWindow(win);
      }
    }
  }

  setParcelLevel(level, customPressure = null, win = this.activeWin) {
    this.activeParcelLevel = level;
    if (customPressure !== null) {
      this.customPressure = customPressure;
    } else if (level === "custom" && !this.customPressure) {
      this.customPressure = 700;
    }

    if (this.sounding && this.sounding.levels) {
      if (level === "custom") {
        this.parcelResult = computeParcelAscent(this.sounding.levels, "custom", this.customPressure);
      } else {
        this.parcelResult = this.parcelCache.get(level) || computeParcelAscent(this.sounding.levels, level);
      }
      if (this.panel) {
        if (typeof this.panel.setParcelLevel === "function") {
          this.panel.setParcelLevel(level, this.customPressure, true);
        }
        if (typeof this.panel.update === "function") {
          this.panel.update(this.sounding, this.parcelResult);
        }
      }
    }

    if (win) {
      const layer = this._findTLogPLayer(win);
      if (layer) {
        if (!layer.config) layer.config = {};
        layer.config.parcelLevel = level;
        addOrUpdateLayer(layer, win);
      }
      autoSaveLayerConfig();
    }

    this._syncParcelSelectUI(level);
  }

  updateCycle(file, win = this.activeWin, map = this.activeMap) {
    this.obsFile = file;
    if (win) {
      win.tlogpStation = this.activeStationId;
    }
    return this.loadSounding(map, win);
  }

  highlightStationOnMap(map, lon, lat, stationId) {
    if (!map || typeof map.getSource !== "function") return;

    const sourceId = "tlogp-active-station-source";
    const haloLayerId = "tlogp-active-station-halo";
    const centerLayerId = "tlogp-active-station-center";

    const featureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [lon, lat],
          },
          properties: {
            station_id: stationId,
          },
        },
      ],
    };

    const existingSource = map.getSource(sourceId);
    if (existingSource) {
      if (typeof existingSource.setData === "function") {
        existingSource.setData(featureCollection);
      }
    } else {
      map.addSource(sourceId, {
        type: "geojson",
        data: featureCollection,
      });

      map.addLayer({
        id: haloLayerId,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-radius": 14,
          "circle-color": "rgba(227, 179, 65, 0.2)",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#e3b341",
        },
      });

      map.addLayer({
        id: centerLayerId,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-radius": 4.5,
          "circle-color": "#e3b341",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });
    }
  }

  removeStationHighlight(map = this.activeMap) {
    if (!map || typeof map.removeLayer !== "function") return;
    const haloLayerId = "tlogp-active-station-halo";
    const centerLayerId = "tlogp-active-station-center";
    const sourceId = "tlogp-active-station-source";

    if (map.getLayer(haloLayerId)) map.removeLayer(haloLayerId);
    if (map.getLayer(centerLayerId)) map.removeLayer(centerLayerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  }

  setHighlightVisible(map = this.activeMap, visible = true) {
    if (!map || typeof map.getLayer !== "function") return;
    const haloLayerId = "tlogp-active-station-halo";
    const centerLayerId = "tlogp-active-station-center";
    const val = visible ? "visible" : "none";
    if (map.getLayer(haloLayerId) && typeof map.setLayoutProperty === "function") {
      map.setLayoutProperty(haloLayerId, "visibility", val);
    }
    if (map.getLayer(centerLayerId) && typeof map.setLayoutProperty === "function") {
      map.setLayoutProperty(centerLayerId, "visibility", val);
    }
  }

  show() {
    if (this.panel) this.panel.show();
    this.setHighlightVisible(this.activeMap, true);
  }

  hide() {
    if (this.panel) this.panel.hide();
    this.setHighlightVisible(this.activeMap, false);
  }

  toggle() {
    if (!this.panel) return;
    if (this.panel.container && this.panel.container.style.display === "none") {
      this.show();
    } else {
      this.hide();
    }
  }

  destroy(map = this.activeMap, win = this.activeWin) {
    this.isLayerActive = false;
    this.removeStationHighlight(map);
    if (this.panel) {
      this.panel.destroy();
      this.panel = null;
    }
    this.sounding = null;
    this.parcelResult = null;
    this.activeParcelLevel = "surface";
    this.activeStationId = "58362";
    this.customPressure = null;
    this.activeMap = null;
    this.activeWin = null;
  }

  _findTLogPLayer(win) {
    if (!win) return null;
    try {
      const fromStore = getLayerById("upperair-tlogp-diagram", win) || getLayersForWindow(win)?.find((lyr) => lyr.type === "tlogp");
      if (fromStore) return fromStore;
    } catch {}
    if (win.layers) {
      const l = win.layers.find((lyr) => lyr.type === "tlogp");
      if (l) return l;
    }
    if (win.activeGroup?.layers) {
      return win.activeGroup.layers.find((lyr) => lyr.type === "tlogp");
    }
    return null;
  }

  _syncLayerControlUI(win, data) {
    if (typeof document === "undefined" || typeof document.querySelector !== "function") return;
    const input = document.querySelector(".input-tlogp-station");
    if (input) {
      input.value = data.stationId;
    }
    const badge = document.querySelector(".tlogp-station-meta-badge span");
    if (badge) {
      badge.textContent = `${data.stationId} ${data.stationName || ""}`;
    }
    const quickSel = document.querySelector(".sel-tlogp-quick-station");
    if (quickSel) {
      quickSel.value = data.stationId;
    }
  }

  _syncParcelSelectUI(level) {
    if (typeof document === "undefined" || typeof document.querySelector !== "function") return;
    const sel = document.querySelector(".sel-tlogp-parcel-level");
    if (sel) {
      sel.value = String(level);
    }
  }
}

export const tlogpController = new TLogPController();
