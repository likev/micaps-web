// appState.js - Central reactive state manager for MICAPS-Web (delegating initial state to lib/stores/appCore.js)
import { createInitialAppState } from "../lib/stores/appCore.js";

class AppState {
  constructor() {
    this.state = createInitialAppState();
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
