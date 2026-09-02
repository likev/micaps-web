// appState.js - Central reactive state manager for MICAPS-Web

class AppState {
  constructor() {
    this.state = {
      // Model and catalog selection
      model: "ECMWF_HR",
      element: "TMP",
      level: 850,
      activeGroup: null,
      activeWinId: null,
      cycle: "26082708.024",
      period: 24,
      obsTime: null,
      isObservation: false,
      availableLevels: [1000, 925, 850, 700, 500, 400, 300, 200, 100],
      availableFiles: [],

      // Layer visibility & opacity
      layers: {
        pmtiles: true,
        contour: true,
        contourf: true,
        raster: false,
        wind: false,
        station: true,
        graticule: true,
      },
      opacity: {
        contourf: 0.75,
        raster: 0.85,
      },

      // Loaded dataset caches
      gridData: null,
      stationData: null,

      // Time playback
      isPlaying: false,
      playbackSpeed: 1500, // ms per frame

      // System / connection state
      status: "connecting",
      isMock: false,
    };

    this.listeners = new Map();
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    const oldValue = this.state[key];
    if (oldValue === value) return;
    this.state[key] = value;
    this.emit(key, value, oldValue);
  }

  update(patch) {
    for (const [key, value] of Object.entries(patch)) {
      this.set(key, value);
    }
  }

  setLayer(layerName, visible) {
    this.state.layers[layerName] = visible;
    this.emit("layers", this.state.layers);
    this.emit(`layer:${layerName}`, visible);
  }

  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
    return () => this.listeners.get(key).delete(callback);
  }

  emit(key, value, oldValue) {
    if (this.listeners.has(key)) {
      for (const cb of this.listeners.get(key)) {
        try {
          cb(value, oldValue);
        } catch (e) {
          console.error(`[AppState] Error in listener for ${key}:`, e);
        }
      }
    }
  }
}

export const appState = new AppState();
