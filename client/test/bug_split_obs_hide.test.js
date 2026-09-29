// bug_split_obs_hide.test.js
// Split-mode obs regressions for station-derived contours (sounding analysis):
//
// 1. Stale cross-level snapshots must not hide layers. derivedContourSnapshots
//    can linger with visible:false from a discarded level step; the old
//    model+element fallback let such an entry decide visibility for an
//    unrelated level even when the store and preset entry say visible.
//    Visibility now resolves store -> exact-id snapshot -> preset entry.
// 2. Discarded/failed obs loads must not touch the map. The step callers used
//    to wipe wind/barbs/raster BEFORE the guarded load, so a discarded or
//    failed load blanked layers the store still reported visible. Teardown
//    now happens inside the loader only after replacement data is in hand.
// 3. Degenerate recomputes must not erase good pictures (see
//    contourMapSync guards): covered in contour tests via renderContourLayers.
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { loadPresetGroup } from "../src/services/presetLoader.js";
import { loadObservationProduct } from "../src/services/derivedContours.js";
import { renderContourLayers } from "../src/layers/contour/contourMapSync.js";
import { getLayersForWindow, getLayerById } from "../src/ui/layers/layerStore.js";

function mockMap() {
  const sources = new Map();
  const layers = new Map();
  return {
    getSource(id) {
      if (!sources.has(id)) return null;
      return { _data: sources.get(id), setData: (d) => sources.set(id, d) };
    },
    addSource: (id, src) => sources.set(id, src.data),
    removeSource: (id) => sources.delete(id),
    getLayer: (id) => layers.get(id) || null,
    addLayer: (def) => layers.set(def.id, def),
    removeLayer: (id) => layers.delete(id),
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
    on: () => {},
    off: () => {},
    getBounds: () => ({ toArray: () => [[60, 10], [145, 60]] }),
    getStyle: () => ({
      layers: [...layers.values()].map((l) => ({ id: l.id })),
      sources: Object.fromEntries([...sources.keys()].map((k) => [k, { type: "geojson" }])),
    }),
    resize: () => {},
    getContainer: () => null,
  };
}

const stnFC = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [116.4, 39.9] }, properties: { station_id: "54511", height: 5760, temperature: -18.2, dewpoint: -30.0, wind_speed: 25 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [121.4, 31.2] }, properties: { station_id: "58362", height: 5880, temperature: -11.5, dewpoint: -22.0, wind_speed: 22 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [113.3, 23.1] }, properties: { station_id: "59287", height: 5900, temperature: -10.0, dewpoint: -20.0, wind_speed: 18 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [104.0, 30.6] }, properties: { station_id: "56294", height: 5860, temperature: -12.0, dewpoint: -18.0, wind_speed: 14 } },
  ],
};

let origFetch;
beforeEach(() => {
  origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/api/data/station")) {
      return { ok: true, status: 200, json: async () => stnFC, text: async () => "" };
    }
    if (u.includes("/api/catalog/tree")) {
      return { ok: true, status: 200, json: async () => [{ name: "20260320080000.000", size: 500 }, { name: "20260320200000.000", size: 500 }], text: async () => "" };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
  };
});

afterEach(() => {
  globalThis.fetch = origFetch;
});

function upperGroup(level) {
  return {
    id: "composite-upperair-500",
    name: "500 hPa Upper-Air Sounding",
    isObservation: true,
    hasLevel: true,
    defaultLevel: 500,
    layers: [
      { id: `upperair-obs-${level}`, type: "station", model: "UPPER_AIR", element: "PLOT", level, path: `UPPER_AIR/PLOT/${level}`, render: { showTemp: true, showWind: true } },
      { id: `contour-sounding-hgt-${level}`, model: "UPPER_AIR", element: "HGT", level, type: "contour", derivedFrom: `upperair-obs-${level}`, render: { showFill: false, showLine: true, showRaster: false, lineColor: "#58a6ff" } },
      { id: `contour-sounding-dtd-${level}`, model: "UPPER_AIR", element: "DTD", level, type: "contour", derivedFrom: `upperair-obs-${level}`, render: { showFill: false, showLine: false, showRaster: true, lineColor: "#e3b341" } },
    ],
  };
}

async function loadStep(map, win) {
  const seq = (win.loadSeq || 0) + 1;
  win.loadSeq = seq;
  await loadPresetGroup(map, win.activeGroup, win.period, win.level, win, true, seq);
}

describe("stale cross-level snapshots cannot hide visible layers", () => {
  it("timestep with a lingering eye-hidden 700-era snapshot keeps 500 hPa layers visible", async () => {
    const map = mockMap();
    const win = {
      id: "test-stale-snap",
      winIdx: 0,
      level: 500,
      period: 24,
      isObservation: true,
      obsTime: "20260320200000.000",
      stepLength: 12,
      activeGroup: upperGroup(500),
      // Lingering entry from a discarded level step: wrong level, eye-hidden.
      // The eye panel (store + preset) says visible.
      derivedContourSnapshots: [
        { id: "contour-sounding-hgt-700", model: "UPPER_AIR", element: "HGT", level: 700, visible: false, derivedFrom: "upperair-obs-700", config: { showFill: false, showLine: true } },
        { id: "contour-sounding-dtd-700", model: "UPPER_AIR", element: "DTD", level: 700, visible: false, derivedFrom: "upperair-obs-700", config: { showFill: false, showLine: false, showRaster: true } },
      ],
    };

    await loadStep(map, win);

    const hgt = getLayerById("contour-sounding-hgt-500", win);
    expect(hgt).toBeDefined();
    expect(hgt.visible).not.toBe(false);
    const dtd = getLayerById("contour-sounding-dtd-500", win);
    expect(dtd).toBeDefined();
    expect(dtd.visible).not.toBe(false);
    const hgtLine = map.getLayer("contour-sounding-hgt-500-isoline-layer");
    expect(hgtLine).not.toBeNull();
    expect(hgtLine.layout?.visibility).toBe("visible");
  });
});

describe("discarded obs loads leave current visuals intact", () => {  it("a superseded loadObservationProduct performs no map or store mutations", async () => {
    const map = mockMap();
    const win = {
      id: "test-discard-clean",
      winIdx: 0,
      level: 500,
      period: 24,
      isObservation: true,
      obsTime: "20260320200000.000",
      stepLength: 12,
      activeGroup: upperGroup(500),
    };
    const seq0 = ((win.loadSeq || 0) + 1);
    win.loadSeq = seq0;
    await loadPresetGroup(map, win.activeGroup, win.period, win.level, win, true, seq0);
    const beforeLayers = map.getStyle().layers.map((l) => l.id).sort();
    expect(beforeLayers.length).toBeGreaterThan(0);
    const beforeStore = getLayersForWindow(win).map((l) => `${l.id}:${l.visible !== false}`).sort();

    // Start a load, then supersede it before the fetch resolves.
    let releaseFetch;
    const gate = new Promise((r) => { releaseFetch = r; });
    const fetchSpy = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (String(url).includes("/api/data/station")) await gate;
      return fetchSpy(url);
    };
    const pending = loadObservationProduct(map, "UPPER_AIR", "PLOT", 500, win.obsTime, win, "UPPER_AIR/PLOT/500", seq0);
    win.loadSeq = seq0 + 1; // a newer sweep takes over
    releaseFetch();
    await pending;
    globalThis.fetch = fetchSpy;

    const afterLayers = map.getStyle().layers.map((l) => l.id).sort();
    expect(afterLayers).toEqual(beforeLayers);
    const afterStore = getLayersForWindow(win).map((l) => `${l.id}:${l.visible !== false}`).sort();
    expect(afterStore).toEqual(beforeStore);
  });
});

describe("degenerate recomputes preserve the current picture", () => {  it("an all-equal grid does not erase existing isolines/isobands", () => {
    const map = mockMap();
    const good = {
      header: { start_lon: 70, end_lon: 130, start_lat: 10, end_lat: 55, n_lon: 10, n_lat: 10, d_lon: 6, d_lat: 4.5 },
      values: Array.from({ length: 100 }, (_, k) => -20 + Math.floor(k / 10) * 4 + Math.sin((k % 10) / 2) * 5),
      stats: { min: -25, max: 25 },
    };
    renderContourLayers(map, good, "TMP", { layerId: "contour-TMP", showFill: false, showLine: true });
    const nLines = map.getSource("contour-TMP-isoline-source")?._data?.features?.length ?? 0;
    expect(nLines).toBeGreaterThan(0);
    expect(map.getLayer("contour-TMP-isoline-layer")?.layout?.visibility).toBe("visible");

    const flat = { header: { ...good.header }, values: new Array(100).fill(5.0), stats: { min: 5, max: 5 } };
    renderContourLayers(map, flat, "TMP", { layerId: "contour-TMP", showFill: false, showLine: true });
    expect(map.getSource("contour-TMP-isoline-source")?._data?.features?.length).toBe(nLines);
    expect(map.getLayer("contour-TMP-isoline-layer")?.layout?.visibility).toBe("visible");
  });
});

describe("core HGT/TMP are not starved by dynamic derived layers", () => {
  // Post-11a1d6c presets declare no HGT/TMP; once DTD is runtime-added,
  // groupDerived is non-empty-but-partial and the default fallback is
  // bypassed. Fresh split windows and timesteps must still render HGT/TMP.
  function dtdOnlyGroup(level) {
    return {
      id: "composite-upperair-500",
      name: "500 hPa Upper-Air Sounding",
      isObservation: true,
      hasLevel: true,
      defaultLevel: 500,
      layers: [
        { id: `upperair-obs-${level}`, type: "station", model: "UPPER_AIR", element: "PLOT", level, path: `UPPER_AIR/PLOT/${level}`, render: { showTemp: true, showWind: true } },
        { id: `contour-sounding-dtd-${level}`, model: "UPPER_AIR", element: "DTD", level, type: "contour", derivedFrom: `upperair-obs-${level}`, render: { showFill: false, showLine: false, showRaster: true, lineColor: "#e3b341" } },
      ],
    };
  }

  async function stepFresh(map, win) {
    const seq = (win.loadSeq || 0) + 1;
    win.loadSeq = seq;
    await loadPresetGroup(map, win.activeGroup, win.period, win.level, win, false, seq);
  }

  it("fresh load with only DTD declared renders HGT+TMP too", async () => {
    const map = mockMap();
    const win = {
      id: "test-starve-fresh", winIdx: 1, level: 500, period: 24,
      isObservation: true, obsTime: "20260320200000.000", stepLength: 12,
      activeGroup: dtdOnlyGroup(500),
    };
    await stepFresh(map, win);
    for (const elem of ["hgt", "tmp"]) {
      const layer = getLayerById(`contour-sounding-${elem}-500`, win);
      expect(layer).toBeDefined();
      expect(layer.visible).not.toBe(false);
      const line = map.getLayer(`contour-sounding-${elem}-500-isoline-layer`);
      expect(line).not.toBeNull();
      expect(line.layout?.visibility).toBe("visible");
    }
    expect(getLayerById("contour-sounding-dtd-500", win)?.visible).not.toBe(false);
  });

  it("eye-hidden HGT stays hidden (backfill does not resurrect it)", async () => {
    const map = mockMap();
    const group = dtdOnlyGroup(500);
    group.layers.push({
      id: "contour-sounding-hgt-500", model: "UPPER_AIR", element: "HGT", level: 500,
      type: "contour", derivedFrom: "upperair-obs-500", visible: false,
      render: { showFill: false, showLine: true, showRaster: false, lineColor: "#58a6ff" },
    });
    const win = {
      id: "test-starve-hidden", winIdx: 1, level: 500, period: 24,
      isObservation: true, obsTime: "20260320200000.000", stepLength: 12,
      activeGroup: group,
    };
    await stepFresh(map, win);
    expect(getLayerById("contour-sounding-hgt-500", win)?.visible).toBe(false);
    // TMP (absent) is still backfilled and visible.
    expect(getLayerById("contour-sounding-tmp-500", win)?.visible).not.toBe(false);
  });
});
