// apiClient.js - Unified REST and Binary fetch wrappers with 3-minute TTL prefetch cache

const BASE_URL = "";

// 3 minutes TTL in milliseconds (180,000 ms)
export const DEFAULT_CACHE_TTL_MS = 3 * 60 * 1000;

let currentCacheTTLMs = DEFAULT_CACHE_TTL_MS;

// In-memory data cache: url -> { data, type: "json" | "binary", cachedAt: number, expiresAt: number }
const dataCache = new Map();

// In-flight requests map: url -> Promise
const inflightRequests = new Map();

function cloneJson(data) {
  if (data === null || typeof data !== "object") return data;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(data);
    } catch {}
  }
  return JSON.parse(JSON.stringify(data));
}

export function setCacheTTL(ttlMs) {
  currentCacheTTLMs = typeof ttlMs === "number" && ttlMs >= 0 ? ttlMs : DEFAULT_CACHE_TTL_MS;
}

export function getCacheTTL() {
  return currentCacheTTLMs;
}

export function clearDataCache() {
  dataCache.clear();
  inflightRequests.clear();
}

export function pruneExpiredCache(now = Date.now()) {
  let prunedCount = 0;
  for (const [url, entry] of dataCache.entries()) {
    if (now > entry.expiresAt) {
      dataCache.delete(url);
      prunedCount++;
    }
  }
  return prunedCount;
}

export function getCachedEntry(url, now = Date.now()) {
  const entry = dataCache.get(url);
  if (!entry) return null;
  if (now > entry.expiresAt) {
    dataCache.delete(url);
    return null;
  }
  return entry;
}

export function isCached(endpoint, params = {}, now = Date.now()) {
  const url = buildUrl(endpoint, params);
  return getCachedEntry(url, now) !== null;
}

export function getCacheStats() {
  pruneExpiredCache();
  return {
    size: dataCache.size,
    inflightCount: inflightRequests.size,
    keys: Array.from(dataCache.keys()),
    ttlMs: currentCacheTTLMs,
  };
}

export async function fetchJson(endpoint, params = {}, options = {}) {
  const url = buildUrl(endpoint, params);
  const bypassCache = Boolean(options.bypassCache);
  const ttl = typeof options.ttl === "number" ? options.ttl : currentCacheTTLMs;

  if (!bypassCache) {
    const cached = getCachedEntry(url);
    if (cached) {
      return cloneJson(cached.data);
    }

    if (inflightRequests.has(url)) {
      const pendingData = await inflightRequests.get(url);
      return cloneJson(pendingData);
    }
  }

  const fetchPromise = (async () => {
    try {
      const resp = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} fetching ${url}: ${resp.statusText}`);
      }

      const data = await resp.json();
      if (!bypassCache && ttl > 0) {
        const now = Date.now();
        dataCache.set(url, {
          data,
          type: "json",
          cachedAt: now,
          expiresAt: now + ttl,
        });
      }
      return cloneJson(data);
    } finally {
      inflightRequests.delete(url);
    }
  })();

  if (!bypassCache) {
    inflightRequests.set(url, fetchPromise);
  }

  return await fetchPromise;
}

export async function fetchBinary(endpoint, params = {}, options = {}) {
  const url = buildUrl(endpoint, params);
  const bypassCache = Boolean(options.bypassCache);
  const ttl = typeof options.ttl === "number" ? options.ttl : currentCacheTTLMs;

  if (!bypassCache) {
    const cached = getCachedEntry(url);
    if (cached && cached.data instanceof ArrayBuffer) {
      return cached.data.slice(0);
    }

    if (inflightRequests.has(url)) {
      const buf = await inflightRequests.get(url);
      return buf instanceof ArrayBuffer ? buf.slice(0) : buf;
    }
  }

  const fetchPromise = (async () => {
    try {
      const resp = await fetch(url, {
        headers: {
          Accept: "application/octet-stream",
        },
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} fetching binary ${url}: ${resp.statusText}`);
      }

      const buf = await resp.arrayBuffer();
      if (!bypassCache && ttl > 0) {
        const now = Date.now();
        dataCache.set(url, {
          data: buf,
          type: "binary",
          cachedAt: now,
          expiresAt: now + ttl,
        });
      }
      return buf;
    } finally {
      inflightRequests.delete(url);
    }
  })();

  if (!bypassCache) {
    inflightRequests.set(url, fetchPromise);
  }

  const result = await fetchPromise;
  return result instanceof ArrayBuffer ? result.slice(0) : result;
}

export function buildUrl(endpoint, params = {}) {
  let [basePath, existingQuery] = endpoint.split("?");
  const cleanEndpoint = basePath.startsWith("/") ? basePath : `/${basePath}`;
  const query = new URLSearchParams(existingQuery || "");

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      query.set(k, String(v));
    }
  }

  // Sort keys alphabetically for stable cache keys
  const sortedParams = new URLSearchParams();
  const sortedKeys = Array.from(new Set(query.keys())).sort();
  for (const k of sortedKeys) {
    for (const v of query.getAll(k)) {
      sortedParams.append(k, v);
    }
  }

  const qs = sortedParams.toString();
  return qs ? `${BASE_URL}${cleanEndpoint}?${qs}` : `${BASE_URL}${cleanEndpoint}`;
}

// Background pruning every 60s (pauses while tab is hidden)
if (typeof setInterval !== "undefined") {
  const pruneInterval = setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    pruneExpiredCache();
  }, 60000);
  if (pruneInterval?.unref) {
    pruneInterval.unref();
  }
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        pruneExpiredCache();
      }
    });
  }
}
