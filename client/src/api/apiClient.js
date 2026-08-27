// apiClient.js - Unified REST and Binary fetch wrappers

const BASE_URL = "";

export async function fetchJson(endpoint, params = {}) {
  const url = buildUrl(endpoint, params);
  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} fetching ${url}: ${resp.statusText}`);
  }

  return await resp.json();
}

export async function fetchBinary(endpoint, params = {}) {
  const url = buildUrl(endpoint, params);
  const resp = await fetch(url, {
    headers: {
      Accept: "application/octet-stream",
    },
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} fetching binary ${url}: ${resp.statusText}`);
  }

  return await resp.arrayBuffer();
}

function buildUrl(endpoint, params) {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const query = new URLSearchParams();

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      query.set(k, String(v));
    }
  }

  const qs = query.toString();
  return qs ? `${BASE_URL}${cleanEndpoint}?${qs}` : `${BASE_URL}${cleanEndpoint}`;
}
