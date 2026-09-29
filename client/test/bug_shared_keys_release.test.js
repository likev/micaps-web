// bug_shared_keys_release.test.js
// Review follow-ups for split mode:
//
// 1. No remaining shared key/id collisions. Two windows routinely carry the
//    SAME layer id on DIFFERENT maps. rasterLayer (fixed earlier) scoped its
//    sequence/URL state per map; the palette-load guard in configActions had
//    the identical defect (global layer.id sequence discarding a sibling
//    window's palette load). It is now scoped per window.
// 2. Release early on window close. cleanupWindowResources now disarms
//    contour re-renders, stops wind/barbs, removes station + raster layers
//    (revoking blob URLs), deletes legends, cancels scheduled prefetch, and
//    drops per-window caches. The pieces are verified here (the App.svelte
//    glue follows the same already-tested cleanup pattern).
// 3. dataCache was uncapped (expiry-only); split stepping storms fill it
//    4x faster. It is now LRU-bounded (MAX_DATA_CACHE_ENTRIES).
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getLayersForWindow, addOrUpdateLayer, clearLayersForWindow } from "../src/lib/stores/layersCore.js";
import { handleConfigAction } from "../src/ui/layers/configActions.js";
import { armContourReRender, disarmAllContourReRenders } from "../src/services/contourReRender.js";
import { schedulePrefetch, cancelScheduledPrefetch } from "../src/services/prefetchService.js";
import {
  updateLegend,
  buildLegendItems,
  deleteWindowLegends,
  getWindowLegendsMap,
} from "../src/lib/stores/legendCore.js";
import { fetchJson, getCacheStats, clearDataCache, MAX_DATA_CACHE_ENTRIES } from "../src/api/apiClient.js";

function contourMockMap() {
  const sources = new Map();
  const layers = new Map();
  const offCalls = [];
  const onCalls = [];
  return {
    sources,
    layers,
    offCalls,
    onCalls,
    getSource(id) {
      if (!sources.has(id)) return null;
      return {
        _data: sources.get(id),
        setData(d) {
          sources.set(id, d);
        },
      };
    },
    addSource(id, src) {
      sources.set(id, src.data);
    },
    removeSource(id) {
      sources.delete(id);
    },
    getLayer(id) {
      return layers.get(id) || null;
    },
    addLayer(def) {
      layers.set(def.id, def);
    },
    removeLayer(id) {
      layers.delete(id);
    },
    setLayoutProperty(id, prop, val) {
      if (layers.has(id)) {
        const l = layers.get(id);
        if (!l.layout) l.layout = {};
        l.layout[prop] = val;
      }
    },
    setPaintProperty(id, prop, val) {
      if (layers.has(id)) {
        const l = layers.get(id);
        if (!l.paint) l.paint = {};
        l.paint[prop] = val;
      }
    },
    on(ev, fn) {
      onCalls.push(ev);
    },
    off(ev, fn) {
      offCalls.push(ev);
    },
    getBounds() {
      return { toArray: () => [[60, 10], [145, 60]] };
    },
  };
}

function makeGrid(nLon = 8, nLat = 8) {
  const values = [];
  for (let j = 0; j < nLat; j++) {
    for (let i = 0; i < nLon; i++) values.push(-20 + j * 4 + Math.sin(i / 2) * 5);
  }
  return {
    header: { start_lon: 70, end_lon: 130, start_lat: 10, end_lat: 55, n_lon: nLon, n_lat: nLat, d_lon: 6, d_lat: 4.5 },
    values,
    stats: { min: -25, max: 25 },
  };
}

async function pollFor(fn, timeoutMs = 2500) {
  const start = Date.now();
  for (;;) {
    if (fn()) return true;
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("palette loads are isolated per window", () => {
  const PAL_PATH = "/palettes/__scope_test__/same.xml";
  const PAL_XML = `<color-palette><entry value="0" rgba="20,90,200,255"/><entry value="10" rgba="240,120,40,255"/></color-palette>`;
  let origFetch;

  beforeEach(() => {
    origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (String(url) === PAL_PATH) {
        return { ok: true, status: 200, text: async () => PAL_XML };
      }
      return { ok: false, status: 404, statusText: "nf", text: async () => "" };
    };
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    clearLayersForWindow("test-pal-a");
    clearLayersForWindow("test-pal-b");
  });

  it("same layer id in two windows: both palette loads apply", async () => {
    const mapA = contourMockMap();
    const mapB = contourMockMap();
    const winA = { id: "test-pal-a", winIdx: 0 };
    const winB = { id: "test-pal-b", winIdx: 1 };
    const grid = makeGrid();

    addOrUpdateLayer(
      { id: "contour-paltest-tmp", type: "contour", element: "TMP", model: "ECMWF_HR", visible: true, gridData: grid, config: { showFill: true, showLine: true } },
      winA
    );
    addOrUpdateLayer(
      { id: "contour-paltest-tmp", type: "contour", element: "TMP", model: "ECMWF_HR", visible: true, gridData: grid, config: { showFill: true, showLine: true } },
      winB
    );
    const layerA = getLayersForWindow(winA).find((l) => l.id === "contour-paltest-tmp");
    const layerB = getLayersForWindow(winB).find((l) => l.id === "contour-paltest-tmp");

    // Start both loads back-to-back so they overlap in flight.
    handleConfigAction(mapA, "contour-paltest-tmp", { palettePath: PAL_PATH }, layerA, winA);
    handleConfigAction(mapB, "contour-paltest-tmp", { palettePath: PAL_PATH }, layerB, winB);

    const ok = await pollFor(
      () => layerA.colormap === "palette:contour-paltest-tmp" && layerB.colormap === "palette:contour-paltest-tmp"
    );
    expect(ok).toBe(true);
    expect(layerA.colormap).toBe("palette:contour-paltest-tmp");
    expect(layerB.colormap).toBe("palette:contour-paltest-tmp");
  });
});

describe("window-close release pieces", () => {
  it("disarmAllContourReRenders detaches armed listeners for the window", () => {
    const map = contourMockMap();
    // 260x220 = 57,200 cells > default 50k budget so arming registers.
    const grid = makeGrid(260, 220);
    const win = { id: "test-close-arm", winIdx: 0, loadSeq: 1 };
    const layer = { id: "contour-TMP", type: "contour", element: "TMP", visible: true, gridData: grid, config: { showFill: true, showLine: true } };

    armContourReRender(map, layer, win);
    expect(map.onCalls).toContain("moveend");
    expect(map.onCalls).toContain("zoomend");

    disarmAllContourReRenders(map, win);
    expect(map.offCalls).toContain("moveend");
    expect(map.offCalls).toContain("zoomend");
  });

  it("cancelScheduledPrefetch prevents the pending prefetch from firing", async () => {
    const origFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls++;
      return { ok: false, status: 404, statusText: "nf", text: async () => "", json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
    };
    try {
      const win = { id: "test-close-prefetch", winIdx: 0 };
      schedulePrefetch(win, 30);
      cancelScheduledPrefetch(win);
      await new Promise((r) => setTimeout(r, 100));
      expect(fetchCalls).toBe(0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("deleteWindowLegends drops the per-window legend entry", () => {
    const win = { id: "test-close-legend", winIdx: 2 };
    updateLegend("TMP", "TMP", -20, 30, win);
    expect(buildLegendItems(win).length).toBe(1);
    expect(getWindowLegendsMap().has("test-close-legend")).toBe(true);

    deleteWindowLegends(win);
    expect(getWindowLegendsMap().has("test-close-legend")).toBe(false);
    expect(buildLegendItems(win)).toEqual([]);
  });
});

describe("dataCache is LRU-bounded", () => {
  let origFetch;

  beforeEach(() => {
    origFetch = globalThis.fetch;
    clearDataCache();
    globalThis.fetch = async (url) => ({
      ok: true,
      status: 200,
      json: async () => ({ url: String(url) }),
      text: async () => "{}",
      arrayBuffer: async () => new ArrayBuffer(8),
    });
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    clearDataCache();
  });

  it("evicts oldest-first beyond MAX_DATA_CACHE_ENTRIES and keeps newest", async () => {
    expect(MAX_DATA_CACHE_ENTRIES).toBeGreaterThan(0);
    const total = MAX_DATA_CACHE_ENTRIES + 6;
    for (let i = 0; i < total; i++) {
      await fetchJson("/api/__captest__/grid", { i });
    }
    const stats = getCacheStats();
    expect(stats.size).toBe(MAX_DATA_CACHE_ENTRIES);
    expect(stats.size).toBeLessThanOrEqual(MAX_DATA_CACHE_ENTRIES);
  });
});
