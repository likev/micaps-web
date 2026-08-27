// deckOverlay.js - Deck.gl MapboxOverlay manager for MapLibre GL
import { MapboxOverlay } from "@deck.gl/mapbox";

let overlay = null;

export function initDeckOverlay(map) {
  if (overlay) return overlay;

  overlay = new MapboxOverlay({
    interleaved: true,
    layers: [],
  });

  map.addControl(overlay);
  console.log("[DeckOverlay] Deck.gl MapboxOverlay attached to MapLibre");
  return overlay;
}

export function updateDeckLayers(layers) {
  if (overlay) {
    overlay.setProps({ layers });
  }
}

export function getDeckOverlay() {
  return overlay;
}
