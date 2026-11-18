// presetFavorites.svelte.js - Svelte 5 reactive wrapper around presetFavoritesCore.js
import {
  favoritesState,
  subscribeFavorites,
  syncFavoritesForUser as coreSyncFavoritesForUser,
  togglePinPreset as coreTogglePinPreset,
  addRecentPreset as coreAddRecentPreset,
  clearRecentPresets as coreClearRecentPresets,
} from "./presetFavoritesCore.js";

let pinnedIds = $state([...favoritesState.pinned]);
let recentIds = $state([...favoritesState.recent]);

subscribeFavorites((state) => {
  pinnedIds = [...state.pinned];
  recentIds = [...state.recent];
});

export function syncFavoritesForUser(userId) {
  return coreSyncFavoritesForUser(userId);
}

export function getPinnedPresetIds() {
  return pinnedIds;
}

export function getRecentPresetIds() {
  return recentIds;
}

export function isPresetPinned(presetId) {
  if (!presetId) return false;
  return pinnedIds.includes(presetId);
}

export function togglePinPreset(presetId) {
  return coreTogglePinPreset(presetId);
}

export function addRecentPreset(presetId) {
  return coreAddRecentPreset(presetId);
}

export function clearRecentPresets() {
  return coreClearRecentPresets();
}
