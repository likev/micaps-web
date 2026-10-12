// crosshairSync.svelte.js - Synchronized multi-window crosshair indicator state

export const crosshairState = $state({
  active: false,
  sourceWinId: null,
  lng: null,
  lat: null,
});

export const synchronizedCrosshair = crosshairState;

export function setSynchronizedCursor(sourceWinId, lng, lat) {
  crosshairState.active = true;
  crosshairState.sourceWinId = sourceWinId;
  crosshairState.lng = lng;
  crosshairState.lat = lat;
}

export function clearSynchronizedCursor(sourceWinId = null) {
  if (!sourceWinId || crosshairState.sourceWinId === sourceWinId) {
    crosshairState.active = false;
    crosshairState.sourceWinId = null;
  }
}
