// bug_split_raster_sweep.test.js
// Split-mode regressions for keyboard ←/→ stepping (step/time/level/model):
//  1. Raster fill must re-render per window. Contour isolates re-renders with
//     a `${winKey}::${layerId}` key, but rasterLayer tracked toBlob sequence
//     + blob URLs by rasterSrcId GLOBALLY, so sibling windows rendering the
//     same layerId discarded each other's in-flight renders as "stale" and
//     revoked blob URLs still displayed by sibling maps. State is now scoped
//     per map instance.
//  2. Rapid ←/→ must not stack full sweeps: beginSharedSweep/sharedSweepAlive
//     let a newer shared sweep cancel an older one between windows (every
//     shared sweep covers ALL visible windows, so canceling never orphans one).
//  3. win._windGridCache grew without bound (keyed by file, one entry per
//     step × window). It is now capped (see windGridCache.js).
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { renderGridRaster } from "../src/layers/rasterLayer.js";
import { beginSharedSweep, sharedSweepAlive } from "../src/lib/services/appWorkflow.js";
import {
  getCachedWindGrid,
  setCachedWindGrid,
  MAX_WIND_GRID_CACHE_ENTRIES,
} from "../src/utils/windGridCache.js";

// ---------- raster per-map isolation ----------

function makeGrid() {
  const n = 4;
  const values = [];
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < n; c++) row.push(r * n + c);
    values.push(row);
  }
  return {
    header: { n_lon: n, n_lat: n, start_lon: 100, d_lon: 1, start_lat: 40, d_lat: -1 },
    values,
    stats: { min: 0, max: 15 },
  };
}

function makeMap() {
  const sources = new Map();
  const layers = new Map();
  const updates = [];
  return {
    sources,
    layers,
    updates,
    revoked: [],
    getSource: (id) => sources.get(id) || null,
    addSource: (id, def) => {
      const src = {
        ...def,
        updateImage: (arg) => {
          src.url = arg.url;
          updates.push({ srcId: id, ...arg });
        },
      };
      sources.set(id, src);
    },
    removeSource: (id) => sources.delete(id),
    getLayer: (id) => layers.get(id) || null,
    addLayer: (def) => layers.set(def.id, { ...def }),
    removeLayer: (id) => layers.delete(id),
    setLayoutProperty: () => {},
    setPaintProperty: () => {},
    getStyle: () => ({ layers: [...layers.values()].map((l) => ({ id: l.id })), sources: {} }),
  };
}

describe("raster renders are isolated per map in split mode", () => {
  let canvases = [];
  let blobCount = 0;
  let revoked = [];
  let origDocument;
  let origCreateObjectURL;
  let origRevokeObjectURL;

  beforeEach(() => {
    canvases = [];
    blobCount = 0;
    revoked = [];
    origDocument = globalThis.document;
    origCreateObjectURL = URL.createObjectURL;
    origRevokeObjectURL = URL.revokeObjectURL;
    globalThis.document = {
      createElement: () => {
        const pending = [];
        const canvas = {
          width: 0,
          height: 0,
          _pending: pending,
          getContext: () => ({
            createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
            putImageData: () => {},
          }),
          toBlob: (cb) => pending.push(cb),
        };
        canvases.push(canvas);
        return canvas;
      },
    };
    URL.createObjectURL = () => `blob:mock-${++blobCount}`;
    URL.revokeObjectURL = (u) => revoked.push(u);
  });

  afterEach(() => {
    if (origDocument === undefined) delete globalThis.document;
    else globalThis.document = origDocument;
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
  });

  function fireLast(mapIndexHint = null) {
    // Fire the toBlob callback of a specific canvas render.
    return (canvasIdx) => {
      const canvas = canvases[canvasIdx];
      expect(canvas._pending.length).toBe(1);
      canvas._pending.shift()({ fakeBlob: canvasIdx });
    };
  }

  it("same layerId on two maps: neither render is dropped as stale", () => {
    const mapA = makeMap();
    const mapB = makeMap();
    const grid = makeGrid();
    const fire = fireLast();

    renderGridRaster(mapA, grid, "TMP", "TMP", { layerId: "contour-TMP", opacity: 0.85 });
    renderGridRaster(mapB, grid, "TMP", "TMP", { layerId: "contour-TMP", opacity: 0.85 });
    expect(canvases.length).toBe(2);

    // Fire A's callback AFTER B rendered: pre-fix this was discarded because
    // B bumped the shared sequence counter.
    fire(0);
    const srcA = mapA.getSource("contour-TMP-raster-source");
    expect(srcA).toBeTruthy();
    expect(srcA.url).toBe("blob:mock-1");

    fire(1);
    const srcB = mapB.getSource("contour-TMP-raster-source");
    expect(srcB).toBeTruthy();
    expect(srcB.url).toBe("blob:mock-2");

    // B's apply must not revoke A's in-use URL.
    expect(revoked).not.toContain("blob:mock-1");
  });

  it("same map, same source: older in-flight render is still dropped", () => {
    const mapA = makeMap();
    const grid = makeGrid();
    const fire = fireLast();

    renderGridRaster(mapA, grid, "TMP", "TMP", { layerId: "contour-TMP", opacity: 0.85 });
    fire(0);
    expect(mapA.getSource("contour-TMP-raster-source").url).toBe("blob:mock-1");

    renderGridRaster(mapA, grid, "TMP", "TMP", { layerId: "contour-TMP", opacity: 0.85 });
    renderGridRaster(mapA, grid, "TMP", "TMP", { layerId: "contour-TMP", opacity: 0.85 });
    // Middle render completes last: stale, must be dropped.
    fire(1);
    expect(mapA.getSource("contour-TMP-raster-source").url).toBe("blob:mock-1");
    fire(2);
    expect(mapA.getSource("contour-TMP-raster-source").url).toBe("blob:mock-3");
  });
});

// ---------- shared sweep coalescing ----------

describe("shared sweep generation", () => {
  it("a newer sweep cancels the older one on the same tab only", () => {
    const tabA = { id: 1 };
    const tabB = { id: 2 };
    const g1 = beginSharedSweep(tabA);
    expect(sharedSweepAlive(tabA, g1)).toBe(true);
    const g2 = beginSharedSweep(tabA);
    expect(g2).toBeGreaterThan(g1);
    expect(sharedSweepAlive(tabA, g1)).toBe(false);
    expect(sharedSweepAlive(tabA, g2)).toBe(true);
    // A sweep started on another tab never reads as alive here: after a tab
    // switch the orphaned sweep must stop instead of loading a background tab.
    expect(sharedSweepAlive(tabB, g1)).toBe(false);
  });

  it("missing tab or generation is treated as alive (single-window safe)", () => {
    expect(sharedSweepAlive(null, 5)).toBe(true);
    expect(sharedSweepAlive({ id: 1 }, 0)).toBe(true);
    expect(beginSharedSweep(null)).toBe(0);
  });
});

// ---------- bounded wind grid cache ----------

describe("wind grid cache is bounded", () => {
  it("evicts oldest entries beyond the cap and refreshes recency", () => {
    const win = {};
    for (let i = 0; i < MAX_WIND_GRID_CACHE_ENTRIES + 3; i++) {
      setCachedWindGrid(win, `ECMWF_HR/WIND/500/cycle.${String(i).padStart(3, "0")}`, { u: [i], v: [i] });
    }
    expect(win._windGridCache.size).toBe(MAX_WIND_GRID_CACHE_ENTRIES);
    // Oldest evicted, newest retained.
    expect(getCachedWindGrid(win, "ECMWF_HR/WIND/500/cycle.000")).toBeNull();
    expect(getCachedWindGrid(win, `ECMWF_HR/WIND/500/cycle.${String(MAX_WIND_GRID_CACHE_ENTRIES + 2).padStart(3, "0")}`).u).toEqual([
      MAX_WIND_GRID_CACHE_ENTRIES + 2,
    ]);
  });

  it("re-setting a key refreshes it instead of duplicating", () => {
    const win = {};
    setCachedWindGrid(win, "k1", { u: [1] });
    for (let i = 0; i < MAX_WIND_GRID_CACHE_ENTRIES; i++) {
      setCachedWindGrid(win, `k${i + 2}`, { u: [i] });
    }
    setCachedWindGrid(win, "k1", { u: [100] });
    expect(win._windGridCache.size).toBe(MAX_WIND_GRID_CACHE_ENTRIES);
    expect(getCachedWindGrid(win, "k1").u).toEqual([100]);
  });

  it("handles null win/key gracefully", () => {
    expect(getCachedWindGrid(null, "k")).toBeNull();
    expect(getCachedWindGrid({}, null)).toBeNull();
    expect(setCachedWindGrid(null, "k", {})).toEqual({});
  });
});
