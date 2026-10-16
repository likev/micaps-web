// catalogApi.js - Weather dataset catalog and metadata helpers
import { fetchJson, fetchBinary } from "./apiClient.js";

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
  return await fetchJson("/api/catalog/tree", params, options);
}

export async function fetchLevels(path) {
  return await fetchJson("/api/catalog/levels", { path });
}

export async function fetchLatest(path, suffix = "*.024", options = {}) {
  return await fetchJson("/api/catalog/latest", { path, suffix }, options);
}

export async function fetchGridData(path, file, level = null) {
  const params = { path, file };
  if (level !== null && level !== undefined && level !== "") {
    params.level = level;
  }
  return await fetchJson("/api/data/grid", params);
}

export async function fetchGridBinaryStream(path, file, level = null) {
  const params = { path, file };
  if (level !== null && level !== undefined && level !== "") {
    params.level = level;
  }
  return await fetchBinary("/api/data/grid/binary", params);
}

export async function fetchStationObservations(path = "SURFACE/PLOT_10MIN", file = "", level = null) {
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
  return await fetchJson("/api/data/station", params);
}
