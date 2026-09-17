// api-cache.test.js - 3-Minute TTL Cache & Network Deduplication (apiClient.js)
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  fetchJson,
  fetchBinary,
  clearDataCache,
  getCachedEntry,
  isCached,
  pruneExpiredCache,
  getCacheStats,
  setCacheTTL,
  DEFAULT_CACHE_TTL_MS,
  buildUrl,
} from "../../src/api/apiClient.js";

describe("1. 3-Minute TTL Cache & Network Deduplication (apiClient.js)", () => {
  let originalFetch;

  beforeEach(() => {
    clearDataCache();
    setCacheTTL(DEFAULT_CACHE_TTL_MS);
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearDataCache();
  });

  it("DEFAULT_CACHE_TTL_MS is strictly 3 minutes (180,000 ms)", () => {
    expect(DEFAULT_CACHE_TTL_MS).toBe(180000);
  });

  it("fetchJson caches responses and serves subsequent calls from cache without network fetch", async () => {
    let networkCallCount = 0;
    global.fetch = async (url) => {
      networkCallCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ simulated: "gridData", url }),
      };
    };

    const res1 = await fetchJson("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.024" });
    expect(networkCallCount).toBe(1);
    expect(res1.simulated).toBe("gridData");

    // Second call with same parameters should hit cache directly
    const res2 = await fetchJson("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.024" });
    expect(networkCallCount).toBe(1);
    expect(res2).toEqual(res1);

    // Call with different file should trigger another fetch
    await fetchJson("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.030" });
    expect(networkCallCount).toBe(2);
  });

  it("stable query string sorting produces identical cache key regardless of param property order", async () => {
    let networkCallCount = 0;
    global.fetch = async () => {
      networkCallCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ value: 42 }),
      };
    };

    await fetchJson("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.024" });
    // Same params but reversed object key order
    await fetchJson("/api/data/grid", { file: "26082820.024", path: "ECMWF_HR/TMP/500" });

    expect(networkCallCount).toBe(1);
  });

  it("in-flight requests are deduplicated and share the same Promise", async () => {
    let networkCallCount = 0;
    let resolveNetwork;

    global.fetch = () => {
      networkCallCount++;
      return new Promise((resolve) => {
        resolveNetwork = () =>
          resolve({
            ok: true,
            status: 200,
            json: async () => ({ deduplicated: true }),
          });
      });
    };

    // Fire two requests concurrently before network resolves
    const req1 = fetchJson("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.024" });
    const req2 = fetchJson("/api/data/grid", { path: "ECMWF_HR/TMP/500", file: "26082820.024" });

    expect(networkCallCount).toBe(1);

    resolveNetwork();
    const [data1, data2] = await Promise.all([req1, req2]);

    expect(data1.deduplicated).toBe(true);
    expect(data2.deduplicated).toBe(true);
    expect(networkCallCount).toBe(1);
  });

  it("cache drops / invalidates entries after 3 minutes (180,000 ms)", async () => {
    let networkCallCount = 0;
    global.fetch = async () => {
      networkCallCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ call: networkCallCount }),
      };
    };

    const startTime = 1700000000000;
    const originalNow = Date.now;
    let currentTime = startTime;
    Date.now = () => currentTime;

    try {
      const data1 = await fetchJson("/api/data/grid", { path: "ECMWF/HGT/500", file: "run.024" });
      expect(data1.call).toBe(1);
      expect(networkCallCount).toBe(1);

      // Fast forward time by 2 minutes (120,000 ms) -> still within 3 min TTL
      currentTime = startTime + 120000;
      const data2 = await fetchJson("/api/data/grid", { path: "ECMWF/HGT/500", file: "run.024" });
      expect(data2.call).toBe(1);
      expect(networkCallCount).toBe(1);

      // Fast forward past 3 minutes (180,001 ms) -> TTL expired!
      currentTime = startTime + 180001;
      expect(isCached("/api/data/grid", { path: "ECMWF/HGT/500", file: "run.024" })).toBe(false);

      const data3 = await fetchJson("/api/data/grid", { path: "ECMWF/HGT/500", file: "run.024" });
      expect(data3.call).toBe(2);
      expect(networkCallCount).toBe(2);
    } finally {
      Date.now = originalNow;
    }
  });

  it("pruneExpiredCache removes expired entries and retains valid entries", async () => {
    const startTime = 1700000000000;
    const originalNow = Date.now;
    let currentTime = startTime;
    Date.now = () => currentTime;

    try {
      // Manually simulate cache with 3 min TTL
      setCacheTTL(180000);
      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

      // Populate item 1 at t=0
      await fetchJson("/item1");

      // Advance by 2 minutes, populate item 2
      currentTime = startTime + 120000;
      await fetchJson("/item2");

      // Advance to 3.5 minutes (t=210,000 ms)
      currentTime = startTime + 210000;
      // Item 1 expired (age 3.5m > 3m), item 2 still valid (age 1.5m < 3m)
      const pruned = pruneExpiredCache(currentTime);
      expect(pruned).toBe(1);
      expect(isCached("/item1")).toBe(false);
      expect(isCached("/item2")).toBe(true);
    } finally {
      Date.now = originalNow;
    }
  });

  it("fetchBinary caches ArrayBuffer and returns independent clones", async () => {
    let networkCallCount = 0;
    const sampleBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    global.fetch = async () => {
      networkCallCount++;
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => sampleBytes.buffer.slice(0),
      };
    };

    const buf1 = await fetchBinary("/api/data/grid/binary", { path: "ECMWF_HR/TMP/500", file: "26082820.024" });
    expect(networkCallCount).toBe(1);
    expect(new Uint8Array(buf1)).toEqual(sampleBytes);

    // Second call should return cached clone
    const buf2 = await fetchBinary("/api/data/grid/binary", { path: "ECMWF_HR/TMP/500", file: "26082820.024" });
    expect(networkCallCount).toBe(1);
    expect(buf1).not.toBe(buf2); // Independent ArrayBuffer reference
    expect(new Uint8Array(buf2)).toEqual(sampleBytes);

    // Modifying buf1 must not corrupt cache or buf2
    new Uint8Array(buf1)[0] = 99;
    expect(new Uint8Array(buf2)[0]).toBe(1);
  });

  it("failed network requests are not cached", async () => {
    let attempts = 0;
    global.fetch = async () => {
      attempts++;
      if (attempts === 1) {
        return { ok: false, status: 500, statusText: "Internal Server Error" };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ recovered: true }),
      };
    };

    await expect(fetchJson("/api/data/grid", { path: "ERR", file: "000" })).rejects.toThrow();
    expect(isCached("/api/data/grid", { path: "ERR", file: "000" })).toBe(false);

    // Subsequent request retries over network and succeeds
    const recovered = await fetchJson("/api/data/grid", { path: "ERR", file: "000" });
    expect(recovered.recovered).toBe(true);
    expect(attempts).toBe(2);
  });

  it("fetchJson clones JSON responses so caller mutation does not corrupt cached data", async () => {
    let networkCallCount = 0;
    global.fetch = async () => {
      networkCallCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          metadata: { level: 500 },
          features: [{ id: 1, name: "StationA" }],
        }),
      };
    };

    const res1 = await fetchJson("/api/data/station", { path: "UPPER_AIR/PLOT/500", file: "run1" });
    expect(networkCallCount).toBe(1);
    expect(res1.features.length).toBe(1);

    // Caller mutates returned object
    res1.features.push({ id: 2, name: "MutatedStation" });
    res1.metadata.level = 999;
    expect(res1.features.length).toBe(2);

    // Second call should return pristine cached data
    const res2 = await fetchJson("/api/data/station", { path: "UPPER_AIR/PLOT/500", file: "run1" });
    expect(networkCallCount).toBe(1);
    expect(res2.features.length).toBe(1);
    expect(res2.features[0].name).toBe("StationA");
    expect(res2.metadata.level).toBe(500);
  });

  it("isCached and buildUrl correctly handle existing query strings merged with parameters", () => {
    const url1 = buildUrl("/api/data/grid?existing=1", { path: "ECMWF", file: "024" });
    const url2 = buildUrl("/api/data/grid", { file: "024", existing: "1", path: "ECMWF" });
    expect(url1).toBe(url2);
    expect(url1).toBe("/api/data/grid?existing=1&file=024&path=ECMWF");

    // Test isCached with full url and endpoint+params
    clearDataCache();
    expect(isCached(url1)).toBe(false);
  });
});
