// profilesCore.js - Plain-core profile-panel registry: readiness + header meta.
//
// Single source of truth for "does window W have a live panel of type T?"
// (readiness) plus last-known header metadata for Svelte chrome. Controllers
// maintain entries (create on init/show, remove on destroy); the focus-sync
// path reads entries instead of probing four different controller internals,
// so show/hide decisions can't drift from panel reality.
//
// Plain JS (no runes) so imperative controllers and bun tests can import it.
// The reactive mirror for Svelte components lives in profiles.svelte.js.
const profileState = {
  tlogp: null, // singleton: entry object or null
  timeheight: new Map(), // winId -> entry
  lineheight: new Map(),
  hovmoller: new Map(),
};

const listeners = new Set();

export function onProfilesChange(cb) {
  if (typeof cb !== "function") return () => {};
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function notify(type = null, winId = null) {
  for (const cb of listeners) {
    try { cb(type, winId); } catch {}
  }
}

function keyOf(winOrId) {
  if (typeof winOrId === "string") return winOrId || "default";
  return winOrId?.id || "default";
}

// Readiness probe for the focus-sync path: entry exists (init ran, not destroyed).
export function hasProfilePanel(type, winOrId) {
  if (type === "tlogp") return profileState.tlogp !== null;
  const map = profileState[type];
  if (!(map instanceof Map)) return false;
  return map.has(keyOf(winOrId));
}

export function getProfileState(type, winOrId) {
  if (type === "tlogp") return profileState.tlogp ? { ...profileState.tlogp } : null;
  const map = profileState[type];
  if (!(map instanceof Map)) return null;
  const entry = map.get(keyOf(winOrId));
  return entry ? { ...entry } : null;
}

// Upsert (creates readiness). Controllers call on init/show/setters.
export function setProfileState(type, winOrId, patch = {}) {
  if (type === "tlogp") {
    profileState.tlogp = { visible: false, winId: null, ...(profileState.tlogp || {}), ...patch };
    notify(type, profileState.tlogp.winId);
    return profileState.tlogp;
  }
  const map = profileState[type];
  if (!(map instanceof Map)) return null;
  const key = keyOf(winOrId);
  const prev = map.get(key) || { visible: false };
  const next = { ...prev, ...patch };
  map.set(key, next);
  notify(type, key);
  return next;
}

export function clearProfileState(type, winOrId) {
  if (type === "tlogp") {
    profileState.tlogp = null;
    notify(type, null);
    return;
  }
  const map = profileState[type];
  if (!(map instanceof Map)) return;
  const key = keyOf(winOrId);
  if (map.delete(key)) notify(type, key);
}

// Hide-all for a type WITHOUT creating entries (focus-out path must not
// conjure readiness for never-loaded windows).
export function setAllProfilesHidden(type) {
  if (type === "tlogp") {
    if (profileState.tlogp) {
      profileState.tlogp = { ...profileState.tlogp, visible: false };
      notify(type, profileState.tlogp.winId);
    }
    return;
  }
  const map = profileState[type];
  if (!(map instanceof Map)) return;
  for (const [key, entry] of map) {
    map.set(key, { ...entry, visible: false });
    notify(type, key);
  }
}

// Snapshot for the Svelte mirror / debugging (plain data, no live refs).
export function snapshotProfiles() {
  const out = { tlogp: null, timeheight: {}, lineheight: {}, hovmoller: {} };
  if (profileState.tlogp) out.tlogp = { ...profileState.tlogp };
  for (const type of ["timeheight", "lineheight", "hovmoller"]) {
    for (const [key, entry] of profileState[type]) {
      out[type][key] = { ...entry };
    }
  }
  return out;
}
