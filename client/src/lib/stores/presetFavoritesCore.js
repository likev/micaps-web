// presetFavoritesCore.js - Pure per-user scoped favorites and recent presets store
import { getActiveUserId, subscribeUserProfile, DEFAULT_USER_ID } from "./userProfileCore.js";

export const PINNED_STORAGE_KEY = "micaps-pinned-presets";
export const RECENT_STORAGE_KEY = "micaps-recent-presets";
export const DEFAULT_PINNED_PRESETS = ["surface-obs", "ecmwf-500-hgt-wind"];
export const MAX_RECENTS = 4;

export function scopedStorageKey(baseKey, userId = getActiveUserId()) {
  if (!userId || userId === DEFAULT_USER_ID) return baseKey;
  return `${baseKey}:${userId}`;
}

export function loadStoredList(key, defaultList = []) {
  if (typeof localStorage === "undefined") return [...defaultList];
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [...defaultList];
}

export function saveList(key, list) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {}
}

export const favoritesState = {
  userId: getActiveUserId(),
  pinned: [],
  recent: [],
};

const listeners = new Set();

export function subscribeFavorites(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyFavorites() {
  listeners.forEach((fn) => {
    try {
      fn(favoritesState);
    } catch (err) {
      console.error("[Favorites] Listener error:", err);
    }
  });
}

export function syncFavoritesForUser(userId = getActiveUserId()) {
  const uid = userId || DEFAULT_USER_ID;
  favoritesState.userId = uid;
  favoritesState.pinned = loadStoredList(scopedStorageKey(PINNED_STORAGE_KEY, uid), DEFAULT_PINNED_PRESETS);
  favoritesState.recent = loadStoredList(scopedStorageKey(RECENT_STORAGE_KEY, uid), []);
  notifyFavorites();
  return favoritesState;
}

syncFavoritesForUser(getActiveUserId());

subscribeUserProfile((state) => {
  const nextUid = state?.currentUserId || DEFAULT_USER_ID;
  if (nextUid !== favoritesState.userId) {
    syncFavoritesForUser(nextUid);
  }
});

export function getPinnedPresetIds() {
  return favoritesState.pinned;
}

export function getRecentPresetIds() {
  return favoritesState.recent;
}

export function isPresetPinned(presetId) {
  if (!presetId) return false;
  return favoritesState.pinned.includes(presetId);
}

export function togglePinPreset(presetId) {
  if (!presetId) return favoritesState.pinned;
  if (favoritesState.pinned.includes(presetId)) {
    favoritesState.pinned = favoritesState.pinned.filter((id) => id !== presetId);
  } else {
    favoritesState.pinned = [...favoritesState.pinned, presetId];
  }
  saveList(scopedStorageKey(PINNED_STORAGE_KEY), favoritesState.pinned);
  notifyFavorites();
  return favoritesState.pinned;
}

export function addRecentPreset(presetId) {
  if (!presetId) return favoritesState.recent;
  const filtered = favoritesState.recent.filter((id) => id !== presetId);
  favoritesState.recent = [presetId, ...filtered].slice(0, MAX_RECENTS);
  saveList(scopedStorageKey(RECENT_STORAGE_KEY), favoritesState.recent);
  notifyFavorites();
  return favoritesState.recent;
}

export function clearRecentPresets() {
  favoritesState.recent = [];
  saveList(scopedStorageKey(RECENT_STORAGE_KEY), favoritesState.recent);
  notifyFavorites();
  return favoritesState.recent;
}
