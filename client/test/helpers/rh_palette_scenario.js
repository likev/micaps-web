// rh_palette_scenario.js - Isolated scenario runner (own process, so its
// mock.module calls cannot leak into other test files). Prints one JSON doc:
// custom Raster Palette for ECMWF-HR RH persists across a time chip.
import { mock } from "bun:test";

const FAKE_STOPS = [
  { val: 0, color: [255, 0, 0, 255] },
  { val: 100, color: [0, 0, 255, 255] },
];

function makeGrid() {
  return {
    header: { n_lon: 2, n_lat: 2, start_lon: 70, end_lon: 140, start_lat: 10, end_lat: 60 },
    x: [70, 140],
    y: [10, 60],
    values: [
      [60, 70],
      [80, 90],
    ],
    stats: { min: 60, max: 90 },
  };
}

mock.module("../../src/api/catalogApi.js", () => ({
  fetchGridData: async () => makeGrid(),
  fetchGridBinaryStream: async () => {
    throw new Error("no binary in this scenario");
  },
  fetchStatus: async () => ({ status: "ok", mock_mode: true }),
  fetchStationObservations: async () => ({ type: "FeatureCollection", features: [] }),
  fetchModels: async () => [],
  fetchTree: async () => [],
  fetchLevels: async () => [],
  fetchLatest: async () => null,
}));

mock.module("../../src/utils/paletteLoader.js", () => ({
  loadXMLPalette: async () => FAKE_STOPS,
  listPaletteFiles: async () => [],
  getPaletteCategory: () => "RH",
}));

const contourCalls = [];
mock.module("../../src/layers/contourLayer.js", () => ({
  renderContourLayers: (...a) => {
    contourCalls.push(a);
  },
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

const rasterCalls = [];
mock.module("../../src/layers/rasterLayer.js", () => ({
  renderGridRaster: (...a) => {
    rasterCalls.push(a);
  },
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

const legendCalls = [];
mock.module("../../src/ui/legend.js", () => ({
  updateLegend: (...a) => {
    legendCalls.push(a);
  },
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

const ORIG_PALETTE = "/palettes/RH/dark-850hpa-850hPa比湿.xml";
const CUSTOM_PALETTE = "/palettes/RH/custom-rh-raster.xml";

const out = {};
try {
  const map = makeMap();
  activeWin = {
    id: "rh-palette-scenario-w1",
    winIdx: 0,
    level: 500,
    period: 24,
    forecastCycle: "2026010100",
    activeGroup: {
      id: "composite-500hpa",
      name: "500hPa (ECMWF_HR)",
      hasLevel: true,
      defaultLevel: 500,
      layers: [
        {
          id: "rh",
          name: "RH",
          type: "contour",
          model: "ECMWF_HR",
          element: "RH",
          render: {
            colormap: "RH",
            showFill: false,
            showLine: false,
            showRaster: true,
            lineColor: "#ffffff",
            palettePath: ORIG_PALETTE,
          },
        },
      ],
    },
  };

  await loadPresetGroup(map, activeWin.activeGroup, 24, 500, activeWin, false);
  const stored = getLayerById("rh", activeWin);
  if (!stored) throw new Error("fresh load missing rh");
  stored.config.palettePath = CUSTOM_PALETTE;
  stored.colormap = "palette:rh";

  // Chip to +30h: bootstrap snapshot + time-step reload.
  activeWin.period = 30;
  activeWin.loadSeq = (activeWin.loadSeq || 0) + 1;
  const seq = activeWin.loadSeq;
  if (!activeWin.layerSnapshots) {
    const prevLayers = getLayersForWindow(activeWin);
    if (prevLayers && prevLayers.length > 0) {
      activeWin.layerSnapshots = prevLayers.map((l) => ({
        id: l.id,
        type: l.type,
        model: l.model,
        element: l.element,
        visible: l.visible !== false,
        config: { ...(l.config || {}) },
        color: l.color,
        colormap: l.colormap,
      }));
    }
  }
  rasterCalls.length = 0;
  legendCalls.length = 0;
  await loadPresetGroup(map, activeWin.activeGroup, 30, 500, activeWin, true, seq);

  const after = getLayerById("rh", activeWin);
  out.chip = {
    palettePath: after?.config?.palettePath,
    colormap: after?.colormap,
    rasterCalls: rasterCalls.length,
    rasterColormap: rasterCalls.at(-1)?.[3],
    legendCalls: legendCalls.length,
    legendColormap: legendCalls.at(-1)?.[1],
  };

  // Reset to built-in default (as the palette picker + handleConfigAction do).
  after.config.palettePath = null;
  after.colormap = null;

  // Chip again to +36h: built-in must persist, not revert to preset default.
  activeWin.period = 36;
  activeWin.loadSeq = (activeWin.loadSeq || 0) + 1;
  const seq2 = activeWin.loadSeq;
  if (!activeWin.layerSnapshots) {
    const prevLayers = getLayersForWindow(activeWin);
    if (prevLayers && prevLayers.length > 0) {
      activeWin.layerSnapshots = prevLayers.map((l) => ({
        id: l.id,
        type: l.type,
        model: l.model,
        element: l.element,
        visible: l.visible !== false,
        config: { ...(l.config || {}) },
        color: l.color,
        colormap: l.colormap,
      }));
    }
  }
  rasterCalls.length = 0;
  legendCalls.length = 0;
  await loadPresetGroup(map, activeWin.activeGroup, 36, 500, activeWin, true, seq2);

  const afterReset = getLayerById("rh", activeWin);
  out.resetChip = {
    palettePath: afterReset?.config?.palettePath,
    colormap: afterReset?.colormap,
    rasterCalls: rasterCalls.length,
    rasterColormap: rasterCalls.at(-1)?.[3],
    legendCalls: legendCalls.length,
    legendColormap: legendCalls.at(-1)?.[1],
  };
  out.ok = true;
} catch (e) {
  out.ok = false;
  out.error = String(e?.message || e);
}
console.log(JSON.stringify(out));
