// catalogApi.js - Weather dataset catalog and metadata helpers
import { fetchJson, fetchBinary } from "./apiClient.js";

export async function fetchStatus() {
  return await fetchJson("/api/status");
}

export async function fetchModels() {
  return await fetchJson("/api/catalog/models");
}

export async function fetchTree(path, limit = 50) {
  return await fetchJson("/api/catalog/tree", { path, limit });
}

export async function fetchLevels(path) {
  return await fetchJson("/api/catalog/levels", { path });
}

export async function fetchLatest(path, suffix = "*.024") {
  return await fetchJson("/api/catalog/latest", { path, suffix });
}

export async function fetchGridData(path, file) {
  return await fetchJson("/api/data/grid", { path, file });
}

export async function fetchGridBinaryStream(path, file) {
  return await fetchBinary("/api/data/grid/binary", { path, file });
}

export async function fetchStationObservations(path = "SURFACE/PLOT_10MIN", file = "") {
  return await fetchJson("/api/data/station", { path, file });
}
