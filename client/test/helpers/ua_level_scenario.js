// ua_level_scenario.js - Isolated scenario runner (own process, so its
// mock.module calls cannot leak into other test files). Prints one JSON doc:
// upper-air eye-hide + config across keyboard level step and fresh reload.
import { mock } from "bun:test";

function makeStations() {
  // Heights in [6000,6400] pass QC at BOTH 500 ([4400,6400]) and 400 ([6000,8200]).
  const coords = [
    [110, 30], [115, 32], [120, 35], [112, 38], [118, 28],
    [108, 33], [122, 31], [116, 36],
  ];
  return {
    type: "FeatureCollection",
    features: coords.map(([lon, lat], i) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        station_id: 50000 + i,
        height: 6050 + (i % 4) * 90 + i * 7,
        temperature: -10 - i,
        dewpoint: -18 - i,
      },
    })),
  };
}

mock.module("../../src/api/catalogApi.js", () => ({
  fetchGridData: async () => {
    throw new Error("no NWP in this scenario");
  },
  fetchGridBinaryStream: async () => {
    throw new Error("no binary in this scenario");
  },
  fetchStatus: async () => ({ status: "ok", mock_mode: true }),
  fetchStationObservations: async () => makeStations(),
  fetchModels: async () => [],
  fetchTree: async () => [],
  fetchLevels: async () => [],
  fetchLatest: async () => null,
}));

mock.module("../../src/utils/paletteLoader.js", () => ({
  loadXMLPalette: async () => null,
  listPaletteFiles: async () => [],
  getPaletteCategory: () => "RH",
}));

mock.module("../../src/layers/contourLayer.js", () => ({
  renderContourLayers: () => {},
  renderCustomContourGeoJSON: () => {},
  isFeatureBold: () => false,
  removeAllContourLayers: () => {},
  removeContourLayer: () => {},
  setLayerIsobandVisibility: () => {},
  setLayerIsolineVisibility: () => {},
  setLayerIsobandOpacity: () => {},
  setLayerIsolineStyle: () => {},
  getLayerDOMIds: () => ({}),
  parseBoldValues: (v) => v,
}));

mock.module("../../src/layers/rasterLayer.js", () => ({
  renderGridRaster: () => {},
  renderBinaryRaster: () => {},
  removeRasterLayer: () => {},
  removeAllRasterLayers: () => {},
  setRasterVisibility: () => {},
  setLayerRasterVisibility: () => {},
  getRasterDOMIds: (id = "default") => ({
    rasterSrcId: `${id}-raster-source`,
    rasterLayerId: `${id}-raster-layer`,
  }),
}));

mock.module("../../src/layers/windLayer.js", () => ({
  renderWindStreamlines: () => {},
  stopWindAnimation: () => {},
  renderGridWindBarbs: () => {},
  removeGridWindBarbs: () => {},
  generateStationWindGrid: () => null,
  cleanupWindLayer: () => {},
  WIND_QC_BOUNDS: {},
  normalizeHeader: (h) => h,
  createBilinearSampler: () => () => null,
}));

mock.module("../../src/ui/legend.js", () => ({
  updateLegend: () => {},
  removeLegend: () => {},
  clearLegends: () => {},
  syncLegendForWindow: () => {},
  syncLegendForLayer: () => {},
  removeLegendForLayer: () => {},
}));

mock.module("../../src/layers/stationLayer.js", () => ({
  removeStationLayer: () => {},
  renderStationWeatherPlots: () => {},
  setStationVisibility: () => {},
  setStationConfig: () => {},
  getStationGeoJSON: () => null,
}));

mock.module("../../src/layers/tlogp/tlogpLayer.js", () => ({
  loadTLogPLayer: async () => {},
  removeTLogPLayer: () => {},
  tlogpController: { isActive: () => false },
}));

let activeWin = null;
mock.module("../../src/ui/tabWindowManager.js", () => ({
  getActiveWindow: () => activeWin,
  updateWindowTitle: () => {},
  setWindowHeaderPreset: () => {},
  setWindowHeaderLevel: () => {},
  refreshPresetControls: () => {},
  getWindowById: () => null,
}));

mock.module("../../src/ui/navBar.js", () => ({
  setNavBarPreset: () => {},
  refreshNavBarPresets: () => {},
  setNavBarLevel: () => {},
  initNavBar: () => {},
}));

mock.module("../../src/utils/timelineSync.js", () => ({
  resolveLatestForecastCycle: async () => "2026010100",
  resolveForecastCycles: async () => ["2026010100"],
  syncObservationTimeline: async () => "20260101000000.000",
  invalidateForecastCyclesCache: () => {},
  generateDynamicForecastCycles: () => ["2026010100"],
}));

mock.module("../../src/services/prefetchService.js", () => ({
  schedulePrefetch: () => {},
}));

mock.module("../../src/services/contourReRender.js", () => ({
  armContourReRender: () => {},
}));

mock.module("../../src/ui/toast.js", () => ({
  showErrorToast: () => {},
  ensureErrorToast: () => null,
}));

const { loadPresetGroup } = await import("../../src/services/presetLoader.js");
const { changeVerticalLevel } = await import("../../src/services/levelController.js");
const { getLayerById, getLayersForWindow } = await import("../../src/ui/layerControl.js");

function makeMap() {
  const sources = new Map();
  const layers = new Map();
  return {
    getBounds: () => ({ toArray: () => [[70, 10], [140, 60]] }),
    getSource: (id) => sources.get(id) || null,
    addSource: (id, s) => {
      sources.set(id, s);
    },
    removeSource: (id) => {
      sources.delete(id);
    },
    getLayer: (id) => layers.get(id) || null,
    addLayer: (d) => {
      layers.set(d.id, d);
    },
    removeLayer: (id) => {
      layers.delete(id);
    },
    setLayoutProperty: () => {},
    setPaintProperty: () => {},
    getStyle: () => null,
    isStyleLoaded: () => true,
    loaded: () => true,
    once: () => {},
    on: () => {},
    off: () => {},
  };
}

function makeUpperAirWin() {
  return {
    id: "ua-scenario-w1",
    winIdx: 0,
    level: 500,
    period: 24,
    forecastCycle: null,
    obsTime: null,
    isObservation: true,
    activeGroup: {
      id: "composite-upperair-500",
      name: "500 hPa Upper-Air Sounding",
      hasLevel: true,
      defaultLevel: 500,
      isObservation: true,
      layers: [
        {
          id: "upperair-obs-500",
          name: "500 hPa Sounding Station Plots",
          type: "station",
          model: "UPPER_AIR",
          element: "PLOT",
          render: {},
        },
        {
          id: "contour-sounding-hgt-500",
          name: "500 hPa Height",
          type: "contour",
          model: "UPPER_AIR",
          element: "HGT",
          derivedFrom: "upperair-obs-500",
          render: { showFill: false, showLine: true, lineColor: "#58a6ff" },
        },
      ],
    },
  };
}

const out = {};
try {
  // Scenario 1: eye-hide + showLine:false survive keyboard level step 500->400.
  {
    const map = makeMap();
    activeWin = makeUpperAirWin();
    await loadPresetGroup(map, activeWin.activeGroup, 24, 500, activeWin, false);
    if (!getLayerById("contour-sounding-hgt-500", activeWin)) throw new Error("fresh load missing hgt-500");
    const hgt = getLayerById("contour-sounding-hgt-500", activeWin);
    hgt.visible = false;
    hgt.config.showLine = false;
    await changeVerticalLevel(map, 1, null, activeWin);
    const hgt400 = getLayerById("contour-sounding-hgt-400", activeWin);
    out.levelStep = {
      level: activeWin.level,
      stale500Gone: getLayerById("contour-sounding-hgt-500", activeWin) === null,
      hgt400Present: hgt400 !== null,
      hgt400Visible: hgt400?.visible,
      hgt400ShowLine: hgt400?.config?.showLine,
      station400Present: getLayerById("upperair-obs-400", activeWin) !== null,
    };
  }

  // Scenario 2: fresh reload resets hide by design, with correct ids.
  {
    const map = makeMap();
    activeWin = makeUpperAirWin();
    activeWin.id = "ua-scenario-w2";
    await loadPresetGroup(map, activeWin.activeGroup, 24, 500, activeWin, false);
    const hgt = getLayerById("contour-sounding-hgt-500", activeWin);
    hgt.visible = false;
    activeWin.loadSeq = (activeWin.loadSeq || 0) + 1;
    await loadPresetGroup(map, activeWin.activeGroup, 24, 500, activeWin, false);
    const after = getLayerById("contour-sounding-hgt-500", activeWin);
    const ids = getLayersForWindow(activeWin).map((l) => l.id);
    out.freshReload = {
      present: after !== null,
      visible: after?.visible,
      singleRow: ids.filter((i) => i === "contour-sounding-hgt-500").length === 1,
    };
  }
  out.ok = true;
} catch (e) {
  out.ok = false;
  out.error = String(e?.message || e);
}
console.log(JSON.stringify(out));
