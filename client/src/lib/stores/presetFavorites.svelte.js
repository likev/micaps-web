// presetFavorites.svelte.js - Pinned favorites and recent presets store
const PINNED_STORAGE_KEY = "micaps-pinned-presets";
const RECENT_STORAGE_KEY = "micaps-recent-presets";
const MAX_RECENTS = 4;

function loadStoredList(key, defaultList = []) {
  if (typeof localStorage === "undefined") return defaultList;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return defaultList;
}

function saveList(key, list) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {}
}

let pinnedIds = $state(loadStoredList(PINNED_STORAGE_KEY, ["surface-obs", "ecmwf-500-hgt-wind"]));
let recentIds = $state(loadStoredList(RECENT_STORAGE_KEY, []));

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
  if (!presetId) return;
  if (pinnedIds.includes(presetId)) {
    pinnedIds = pinnedIds.filter((id) => id !== presetId);
  } else {
    pinnedIds = [...pinnedIds, presetId];
  }
  saveList(PINNED_STORAGE_KEY, pinnedIds);
}

export function addRecentPreset(presetId) {
  if (!presetId) return;
  const filtered = recentIds.filter((id) => id !== presetId);
  recentIds = [presetId, ...filtered].slice(0, MAX_RECENTS);
  saveList(RECENT_STORAGE_KEY, recentIds);
}

export function clearRecentPresets() {
  recentIds = [];
  saveList(RECENT_STORAGE_KEY, recentIds);
}
