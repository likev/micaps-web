// catalogApi.js - Weather dataset catalog and metadata helpers
import { fetchJson, fetchBinary, isServerWarmed, markServerWarmed } from "./apiClient.js";
import { getActiveHistoryDate } from "../store/appState.js";

export async function fetchStatus(options = {}) {
  const opts = options instanceof AbortSignal ? { signal: options } : options;
  return await fetchJson("/api/status", {}, opts);
}

export async function fetchModels() {
  return await fetchJson("/api/catalog/models");
}

export async function fetchTree(path, limit = 100, optionsOrLevel = {}, levelArg = null) {
  let options = {};
  let level = levelArg;
  if (typeof optionsOrLevel === "number" || typeof optionsOrLevel === "string") {
    level = optionsOrLevel;
  } else if (optionsOrLevel && typeof optionsOrLevel === "object") {
    options = optionsOrLevel;
    if (options.level !== undefined) {
      level = options.level;
    }
  }
  const params = { path, limit };
  if (level !== null && level !== undefined && level !== "") {
    params.level = level;
  }
  const date = options.date !== undefined ? options.date : getActiveHistoryDate();
  if (date) {
    params.date = date;
  }
  return await fetchJson("/api/catalog/tree", params, options);
}

export async function fetchLevels(path) {
  return await fetchJson("/api/catalog/levels", { path });
}

export async function fetchLatest(path, suffix = "*.024", options = {}) {
  const params = { path, suffix };
  const date = options.date !== undefined ? options.date : getActiveHistoryDate();
  if (date) {
    params.date = date;
  }
  return await fetchJson("/api/catalog/latest", params, options);
}

export function gridParams(path, file, level = null, options = {}) {
  const params = { path, file };
  if (level !== null && level !== undefined && level !== "") {
    params.level = level;
  }
  const date = options?.date !== undefined ? options.date : getActiveHistoryDate();
  if (date) {
    params.date = date;
  }
  return params;
}

export async function fetchGridData(path, file, level = null, options = {}) {
  const params = gridParams(path, file, level, options);
  return await fetchJson("/api/data/grid", params, options);
}

export async function fetchGridBinaryStream(path, file, level = null, options = {}) {
  const params = gridParams(path, file, level, options);
  return await fetchBinary("/api/data/grid/binary", params, options);
}

export async function warmServerCache(items = [], options = {}) {
  if (options?.serverWarm === false) return null;
  if (!Array.isArray(items) || items.length === 0) return null;

  const scope = options.scope || "win";
  const gen = Number(options.gen) || 0;
  const maxItems = Math.min(16, typeof options.maxItems === "number" && options.maxItems > 0 ? options.maxItems : 12);

  // Filter out items that are already server-warmed
  const toWarm = [];
  for (const item of items) {
    const kind = item.kind || (item.type === "sat-image" ? "image" : "grid");
    const key = `${kind}:${item.path}:${item.file}:${item.level ?? ""}`;
    if (!isServerWarmed(key)) {
      toWarm.push({ item, key });
    }
  }

  if (toWarm.length === 0) return null;

  const itemsToWarm = toWarm.slice(0, maxItems);

  for (const { key } of itemsToWarm) {
    markServerWarmed(key);
  }

  const payload = {
    scope,
    gen,
    items: itemsToWarm.map(({ item }) => {
      const it = {
        kind: item.kind || (item.type === "sat-image" ? "image" : "grid"),
        path: item.path,
        file: item.file,
      };
      if (item.level !== undefined && item.level !== null && item.level !== "") {
        it.level = String(item.level);
      }
      if (item.direction) {
        it.dir = item.direction;
      }
      const date = item.date || getActiveHistoryDate();
      if (date) {
        it.date = date;
      }
      return it;
    }),
  };

  try {
    const res = await fetch("/api/prefetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    return res;
  } catch (err) {
    // Silent catch: prefetch is best-effort and must not throw or alert
    return null;
  }
}

export async function fetchStationObservations(path = "SURFACE/PLOT_10MIN", file = "", level = null, options = {}) {
  let normalizedFile = file;
  if (typeof file === "string") {
    normalizedFile = file.trim();
    if (normalizedFile === "null" || normalizedFile === "undefined") {
      normalizedFile = "";
    } else if (normalizedFile.length === 14 && !normalizedFile.includes(".")) {
      normalizedFile = `${normalizedFile}.000`;
    }
  }
  const params = { path, file: normalizedFile };
  if (level !== null && level !== undefined && level !== "") {
    params.level = level;
  }
  const date = options?.date !== undefined ? options.date : getActiveHistoryDate();
  if (date) {
    params.date = date;
  }
  return await fetchJson("/api/data/station", params, options);
}
