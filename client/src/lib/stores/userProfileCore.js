// userProfileCore.js - Pure multi-user configuration profile store and API client helpers
export const USER_STORAGE_KEY = "micaps-user-id";
export const USER_NAME_STORAGE_KEY = "micaps-user-name";
export const DEFAULT_USER_ID = "default";
export const DEFAULT_USER_NAME = "System Default";

const VALID_USER_ID_RE = /^[a-z0-9_-]{1,32}$/;

/**
 * Normalizes and validates a user profile ID.
 * Returns "default" for empty or invalid values unless strict=true.
 */
export function sanitizeUserId(raw, strict = false) {
  const id = String(raw || "").trim().toLowerCase();
  if (!id || id === DEFAULT_USER_ID) {
    return DEFAULT_USER_ID;
  }
  if (!VALID_USER_ID_RE.test(id)) {
    return strict ? null : DEFAULT_USER_ID;
  }
  return id;
}

function loadStoredUserId() {
  if (typeof localStorage === "undefined") return DEFAULT_USER_ID;
  try {
    return sanitizeUserId(localStorage.getItem(USER_STORAGE_KEY) || DEFAULT_USER_ID);
  } catch {
    return DEFAULT_USER_ID;
  }
}

function loadStoredUserName(userId) {
  if (userId === DEFAULT_USER_ID) return DEFAULT_USER_NAME;
  if (typeof localStorage === "undefined") return userId;
  try {
    return localStorage.getItem(USER_NAME_STORAGE_KEY) || userId;
  } catch {
    return userId;
  }
}

const initialUserId = loadStoredUserId();

export const userProfileState = {
  currentUserId: initialUserId,
  currentUserName: loadStoredUserName(initialUserId),
  configSource: "system", // "system" | "user"
  colormapsSource: "system", // "system" | "user"
  users: [
    {
      id: DEFAULT_USER_ID,
      name: DEFAULT_USER_NAME,
      isDefault: true,
      hasCustomConfig: false,
      hasCustomColormaps: false,
    },
  ],
};

const profileListeners = new Set();

export function subscribeUserProfile(fn) {
  if (typeof fn !== "function") return () => {};
  profileListeners.add(fn);
  return () => profileListeners.delete(fn);
}

export function notifyUserProfile() {
  profileListeners.forEach((fn) => {
    try {
      fn(userProfileState);
    } catch (e) {
      console.error("[UserProfile] Listener error:", e);
    }
  });
}

export function getActiveUserId() {
  return userProfileState.currentUserId || DEFAULT_USER_ID;
}

export function getActiveUserProfile() {
  const id = getActiveUserId();
  const found = userProfileState.users.find((u) => u.id === id);
  return {
    id,
    name: found?.name || userProfileState.currentUserName || (id === DEFAULT_USER_ID ? DEFAULT_USER_NAME : id),
    isDefault: id === DEFAULT_USER_ID,
    configSource: userProfileState.configSource,
    colormapsSource: userProfileState.colormapsSource,
    hasCustomConfig: Boolean(found?.hasCustomConfig || userProfileState.configSource === "user"),
    hasCustomColormaps: Boolean(found?.hasCustomColormaps || userProfileState.colormapsSource === "user"),
  };
}

export function setActiveUserId(id, name = null) {
  const nextId = sanitizeUserId(id);
  const found = userProfileState.users.find((u) => u.id === nextId);
  const nextName = nextId === DEFAULT_USER_ID
    ? DEFAULT_USER_NAME
    : (name && String(name).trim() ? String(name).trim() : (found?.name || nextId));

  userProfileState.currentUserId = nextId;
  userProfileState.currentUserName = nextName;
  if (nextId === DEFAULT_USER_ID) {
    userProfileState.configSource = "system";
    userProfileState.colormapsSource = "system";
  } else if (found) {
    userProfileState.configSource = found.hasCustomConfig ? "user" : "system";
    userProfileState.colormapsSource = found.hasCustomColormaps ? "user" : "system";
  }

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(USER_STORAGE_KEY, nextId);
      localStorage.setItem(USER_NAME_STORAGE_KEY, nextName);
    } catch {}
  }

  notifyUserProfile();
  return nextId;
}

export function setUserConfigSource(configSource = null, colormapsSource = null) {
  let changed = false;
  if (configSource === "system" || configSource === "user") {
    if (userProfileState.configSource !== configSource) {
      userProfileState.configSource = configSource;
      changed = true;
    }
  }
  if (colormapsSource === "system" || colormapsSource === "user") {
    if (userProfileState.colormapsSource !== colormapsSource) {
      userProfileState.colormapsSource = colormapsSource;
      changed = true;
    }
  }
  if (changed) notifyUserProfile();
}

export function getUserRequestHeaders(extra = {}) {
  const uid = getActiveUserId();
  if (uid && uid !== DEFAULT_USER_ID) {
    return { ...extra, "X-Micaps-User": uid };
  }
  return { ...extra };
}

export function appendUserQueryParam(urlStr) {
  const uid = getActiveUserId();
  if (!uid || uid === DEFAULT_USER_ID) return urlStr;
  const sep = urlStr.includes("?") ? "&" : "?";
  return `${urlStr}${sep}user=${encodeURIComponent(uid)}`;
}

export async function fetchUserProfiles() {
  try {
    const res = await fetch("/api/users?_t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return userProfileState.users;
    const data = await res.json();
    if (Array.isArray(data?.users)) {
      userProfileState.users = data.users;
      const active = data.users.find((u) => u.id === userProfileState.currentUserId);
      if (active) {
        userProfileState.currentUserName = active.name || active.id;
        userProfileState.configSource = active.hasCustomConfig ? "user" : "system";
        userProfileState.colormapsSource = active.hasCustomColormaps ? "user" : "system";
      }
      notifyUserProfile();
    }
  } catch (err) {
    console.warn("[UserProfile] Failed to fetch user profiles:", err);
  }
  return userProfileState.users;
}

export async function createNewUserProfile({ id, name = "", cloneFrom = DEFAULT_USER_ID, copySystem = false } = {}) {
  const cleanId = sanitizeUserId(id, true);
  if (!cleanId || cleanId === DEFAULT_USER_ID) {
    throw new Error("Invalid profile ID. Use 1-32 lowercase letters, numbers, '-' or '_' (not 'default').");
  }
  const cleanClone = sanitizeUserId(cloneFrom);
  const res = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: cleanId,
      name: String(name || cleanId).trim() || cleanId,
      cloneFrom: cleanClone,
      copySystem: Boolean(copySystem),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Failed to create user profile (${res.status})`);
  }
  await fetchUserProfiles();
  return data.user || { id: cleanId, name: name || cleanId };
}

export async function deleteExistingUserProfile(id) {
  const cleanId = sanitizeUserId(id, true);
  if (!cleanId || cleanId === DEFAULT_USER_ID) {
    throw new Error("Cannot delete System Default profile.");
  }
  const res = await fetch(`/api/users?user=${encodeURIComponent(cleanId)}`, {
    method: "DELETE",
    headers: { "X-Micaps-User": cleanId },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Failed to delete user profile (${res.status})`);
  }
  if (getActiveUserId() === cleanId) {
    setActiveUserId(DEFAULT_USER_ID, DEFAULT_USER_NAME);
  }
  await fetchUserProfiles();
  return data;
}

export async function resetActiveUserConfig(target = "all") {
  const uid = getActiveUserId();
  if (!uid || uid === DEFAULT_USER_ID) {
    throw new Error("System Default cannot be reset.");
  }
  const res = await fetch("/api/config/reset", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Micaps-User": uid,
    },
    body: JSON.stringify({ user: uid, target }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Failed to reset configuration (${res.status})`);
  }
  if (target === "all" || target === "config") {
    userProfileState.configSource = "system";
  }
  if (target === "all" || target === "colormaps") {
    userProfileState.colormapsSource = "system";
  }
  await fetchUserProfiles();
  notifyUserProfile();
  return data;
}
