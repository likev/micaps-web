// app.svelte.js - Svelte 5 reactive global app state rune
import { createInitialAppState } from "./appCore.js";
import { appState } from "../../store/appState.js";

const rawApp = $state(createInitialAppState());

// Sync legacy appState -> reactive rawApp
for (const key of Object.keys(rawApp)) {
  appState.subscribe(key, (val) => {
    if (rawApp[key] !== val) {
      rawApp[key] = val;
    }
  });
}
appState.subscribe("layers", (layers) => {
  if (rawApp.layers && layers) {
    Object.assign(rawApp.layers, layers);
  }
});

// Proxy app so direct mutations (app.level = ...) also notify appState
export const app = new Proxy(rawApp, {
  set(target, prop, value) {
    target[prop] = value;
    if (typeof prop === "string") {
      appState.set(prop, value);
    }
    return true;
  },
  get(target, prop) {
    return target[prop];
  },
});

export function setAppField(key, value) {
  app[key] = value;
}

export function updateApp(patch) {
  for (const [k, v] of Object.entries(patch)) {
    app[k] = v;
  }
}

export function setAppLayer(layerName, visible) {
  if (app.layers) app.layers[layerName] = visible;
  appState.setLayer(layerName, visible);
}
