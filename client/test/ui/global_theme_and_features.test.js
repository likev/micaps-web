// global_theme_and_features.test.js - Tests for Items B, C, D, F, G, H and Global Themes
import "../helpers/svelteRunesPolyfill.js";
import { test, expect, describe, beforeEach, beforeAll, afterAll } from "bun:test";
import { readSrcText } from "../helpers/cssText.js";
import {
  getGlobalTheme,
  setGlobalTheme,
  ALLOWED_THEMES,
  getGlobalProjection,
  setGlobalProjection,
  initGlobalTheme,
} from "../../src/lib/stores/theme.svelte.js";
import {
  isPresetPinned,
  togglePinPreset,
  addRecentPreset,
  getPinnedPresetIds,
  getRecentPresetIds,
} from "../../src/lib/stores/presetFavorites.svelte.js";
import {
  formatLatLon,
  sampleScalarGridAtLonLat,
  sampleWindGridAtLonLat,
  cursorProbe,
  updateCursorProbe,
} from "../../src/lib/stores/cursorProbe.svelte.js";
import {
  synchronizedCrosshair,
  setSynchronizedCursor,
  clearSynchronizedCursor,
} from "../../src/lib/stores/crosshairSync.svelte.js";
import {
  reorderLayers,
  getLayersForWindow,
  addOrUpdateLayer,
  syncMapLayerOrder,
} from "../../src/lib/stores/layersCore.js";
import { CURRENT_CONFIG } from "../../src/config/presets.js";

import { setupMockDOM } from "../helpers/domMock.js";

// Mock localStorage and document for headless environment
let prevDoc = null;
let prevStorage = null;

beforeAll(() => {
  prevDoc = globalThis.document;
  prevStorage = globalThis.localStorage;

  setupMockDOM();

  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
});

afterAll(() => {
  if (prevDoc !== undefined) {
    globalThis.document = prevDoc;
  } else {
    delete globalThis.document;
  }
  if (prevStorage !== undefined) {
    globalThis.localStorage = prevStorage;
  } else {
    delete globalThis.localStorage;
  }
});

describe("Item H & Global UI Theme Scheme", () => {
  const tokensCss = readSrcText("styles/tokens.css");
  const navBarSrc = readSrcText("components/NavBar.svelte");
  const settingsSrc = readSrcText("components/config/SettingsForm.svelte");

  test("tokens.css defines tokens for dark, light, and micaps Classic Green themes", () => {
    expect(tokensCss).toContain('[data-theme="dark"]');
    expect(tokensCss).toContain('[data-theme="light"]');
    expect(tokensCss).toContain('[data-theme="micaps"]');
    expect(tokensCss).toContain('--bg-primary');
    expect(tokensCss).toContain('--bg-secondary');
    expect(tokensCss).toContain('--border-color');
    expect(tokensCss).toContain('--text-primary');

    // MICAPS classic green palette
    expect(tokensCss).toContain("#05140d");
    expect(tokensCss).toContain("#0a2016");
  });

  test("setGlobalTheme updates activeTheme, DOM attributes, localStorage, and CURRENT_CONFIG", () => {
    expect(ALLOWED_THEMES).toEqual(["dark", "light", "micaps"]);

    setGlobalTheme("micaps");
    expect(getGlobalTheme()).toBe("micaps");
    expect(document.documentElement.getAttribute("data-theme")).toBe("micaps");
    expect(document.documentElement.getAttribute("data-scheme")).toBe("micaps");
    expect(localStorage.getItem("micaps-ui-theme")).toBe("micaps");
    expect(localStorage.getItem("micaps-basemap-scheme")).toBe("micaps");
    expect(CURRENT_CONFIG.theme).toBe("micaps");

    setGlobalTheme("light");
    expect(getGlobalTheme()).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    setGlobalTheme("dark");
    expect(getGlobalTheme()).toBe("dark");
  });

  test("NavBar and SettingsForm provide Theme Scheme and Projection switches", () => {
    expect(navBarSrc).toContain('id="menu-item-theme-light"');
    expect(navBarSrc).toContain('id="menu-item-theme-dark"');
    expect(navBarSrc).toContain('id="menu-item-theme-micaps"');
    expect(navBarSrc).toContain('setGlobalTheme("dark")');
    expect(navBarSrc).toContain('setGlobalTheme("light")');
    expect(navBarSrc).toContain('setGlobalTheme("micaps")');
    expect(navBarSrc).toContain('setGlobalProjection');
    expect(settingsSrc).toContain('MICAPS Classic Green');
  });

  test("Projection switching persists to localStorage and CURRENT_CONFIG", () => {
    setGlobalProjection("globe");
    expect(getGlobalProjection()).toBe("globe");
    expect(localStorage.getItem("micaps-map-projection")).toBe("globe");
    expect(CURRENT_CONFIG.basemap.projection).toBe("globe");

    setGlobalProjection("mercator");
    expect(getGlobalProjection()).toBe("mercator");
  });

  test("setGlobalTheme and setGlobalProjection synchronize active map instances in mapInstances Map", () => {
    const { mapInstances } = require("../../src/lib/stores/tabs.svelte.js");
    const mockMap = {
      isStyleLoaded: () => true,
      getLayer: () => false,
      setPaintProperty: () => {},
      setProjection: (p) => { mockMap.__mapProjection = typeof p === "object" ? p.type : p; },
    };
    mapInstances.set("win-test-theme", mockMap);

    setGlobalTheme("micaps");
    expect(mockMap.__basemapScheme).toBe("micaps");

    setGlobalTheme("light");
    expect(mockMap.__basemapScheme).toBe("light");

    setGlobalProjection("globe");
    expect(mockMap.__mapProjection).toBe("globe");

    mapInstances.delete("win-test-theme");
  });
});

describe("Item B: Pinned Favorites and Recent Presets Quick-Pills", () => {
  const navBarSrc = readSrcText("components/NavBar.svelte");
  const presetMenuSrc = readSrcText("components/PresetMenu.svelte");

  test("NavBar renders #nav-quick-pills with pinned and recent pills", () => {
    expect(navBarSrc).toContain('id="nav-quick-pills"');
    expect(navBarSrc).toContain('class="nav-quick-pills"');
    expect(navBarSrc).toContain('class="pill-star"');
    expect(navBarSrc).toContain('class="quick-pill pinned-pill"');
    expect(navBarSrc).toContain('class="quick-pill recent-pill"');
  });

  test("PresetMenu includes star button to toggle pinning presets", () => {
    expect(presetMenuSrc).toContain('class="btn-pin-preset"');
    expect(presetMenuSrc).toContain('togglePinPreset');
  });

  test("presetFavorites store persists pinned and recent presets to localStorage", () => {
    localStorage.clear();
    const pid = "test-ecmwf-500hpa";

    expect(isPresetPinned(pid)).toBe(false);
    togglePinPreset(pid);
    expect(isPresetPinned(pid)).toBe(true);
    expect(getPinnedPresetIds()).toContain(pid);
    expect(localStorage.getItem("micaps-pinned-presets")).toContain(pid);

    togglePinPreset(pid);
    expect(isPresetPinned(pid)).toBe(false);

    addRecentPreset("p-recent-1");
    addRecentPreset("p-recent-2");
    expect(getRecentPresetIds()[0]).toBe("p-recent-2");
  });
});

describe("Item C: Live Value and Coordinates Probe in Status Bar", () => {
  const statusBarSrc = readSrcText("components/StatusBar.svelte");
  const mapViewportSrc = readSrcText("map/MapViewport.svelte");

  test("StatusBar renders #status-cursor-probe and coordinate display", () => {
    expect(statusBarSrc).toContain('id="status-cursor-probe"');
    expect(statusBarSrc).toContain('class="status-cursor-probe"');
    expect(statusBarSrc).toContain('class="probe-coords"');
    expect(statusBarSrc).toContain('class="probe-values"');
  });

  test("formatLatLon formats coordinates accurately with hemisphere markers", () => {
    expect(formatLatLon(116.4074, 39.9042)).toBe("39.9°N, 116.4°E");
    expect(formatLatLon(-74.006, -40.7128)).toBe("40.7°S, 74.0°W");
    expect(formatLatLon(0, 0)).toBe("0.0°N, 0.0°E");
  });

  test("sampleScalarGridAtLonLat performs bilinear interpolation on 2D scalar fields", () => {
    // 2x2 grid from 100E to 110E, 30N to 40N (d_lon=10, d_lat=10)
    // Row 0 (lat 40N): [20, 30]
    // Row 1 (lat 30N): [10, 20]
    const header = {
      n_lon: 2,
      n_lat: 2,
      start_lon: 100,
      end_lon: 110,
      start_lat: 40,
      end_lat: 30,
      d_lon: 10,
      d_lat: 10,
    };
    const values = new Float32Array([20, 30, 10, 20]);

    // Center point (105E, 35N): bilinear average should be 20.0
    const centerVal = sampleScalarGridAtLonLat({ header, values }, 105, 35);
    expect(centerVal).toBeCloseTo(20.0, 1);

    // Top-left corner (100E, 40N): should be 20
    const cornerVal = sampleScalarGridAtLonLat({ header, values }, 100, 40);
    expect(cornerVal).toBeCloseTo(20.0, 1);
  });

  test("sampleWindGridAtLonLat samples vector u, v and computes wind speed and direction", () => {
    const header = {
      n_lon: 2,
      n_lat: 2,
      start_lon: 100,
      end_lon: 110,
      start_lat: 40,
      end_lat: 30,
      d_lon: 10,
      d_lat: 10,
    };
    // Southerly wind (u=0, v=10 m/s -> speed=10, dir=180 deg)
    const u = new Float32Array([0, 0, 0, 0]);
    const v = new Float32Array([10, 10, 10, 10]);

    const wind = sampleWindGridAtLonLat({ header, u, v }, 105, 35);
    expect(wind).not.toBeNull();
    expect(wind.speed).toBeCloseTo(10.0, 1);
    expect(wind.dir).toBeCloseTo(180, 0);
  });

  test("updateCursorProbe resolves layers from getLayersForWindow when win.layers is absent", () => {
    const winId = "probe-test-win";
    const header = {
      n_lon: 2, n_lat: 2,
      start_lon: 100, end_lon: 110,
      start_lat: 40, end_lat: 30,
      d_lon: 10, d_lat: 10,
    };
    const values = new Float32Array([18.5, 18.5, 18.5, 18.5]);
    addOrUpdateLayer(winId, {
      id: "probe-tmp-layer",
      type: "contour",
      element: "TMP",
      visible: true,
      gridData: { header, values },
    });

    updateCursorProbe(105, 35, winId);
    expect(cursorProbe.active).toBe(true);
    expect(cursorProbe.formattedCoords).toBe("35.0°N, 105.0°E");
    expect(cursorProbe.metValues).toContain("TMP: 18.5°C");

    // Missing value guard: values >= 9990 should be ignored
    const masked = new Float32Array([9999, 9999, 9999, 9999]);
    addOrUpdateLayer(winId, {
      id: "probe-tmp-layer",
      type: "contour",
      element: "TMP",
      visible: true,
      gridData: { header, values: masked },
    });
    updateCursorProbe(105, 35, winId);
    expect(cursorProbe.metValues).not.toContain("9999");
  });
});

describe("Item D: Synchronized Multi-Window Cursor Crosshair", () => {
  const mapViewportSrc = readSrcText("map/MapViewport.svelte");

  test("MapViewport renders synchronized crosshair marker overlay", () => {
    expect(mapViewportSrc).toContain('class="sync-crosshair-reticle"');
    expect(mapViewportSrc).toContain('class="reticle-h"');
    expect(mapViewportSrc).toContain('class="reticle-v"');
    expect(mapViewportSrc).toContain('class="reticle-ring"');
    expect(mapViewportSrc).toContain('setSynchronizedCursor');
  });

  test("crosshairSync store broadcasts cursor lat/lon across windows", () => {
    setSynchronizedCursor("win-1", 116.4, 39.9);
    expect(synchronizedCrosshair.active).toBe(true);
    expect(synchronizedCrosshair.sourceWinId).toBe("win-1");
    expect(synchronizedCrosshair.lng).toBeCloseTo(116.4, 2);
    expect(synchronizedCrosshair.lat).toBeCloseTo(39.9, 2);

    clearSynchronizedCursor("win-1");
    expect(synchronizedCrosshair.active).toBe(false);
  });
});

describe("Item F: Timeline A-B Loop Range & Draggable Lines", () => {
  const timeSliderSrc = readSrcText("components/TimeSlider.svelte");

  test("TimeSlider removed loop-range-controls and places draggable vertical lines A and B", () => {
    expect(timeSliderSrc).not.toContain('class="loop-range-controls"');
    expect(timeSliderSrc).not.toContain('id="sl-btn-loop-a"');
    expect(timeSliderSrc).not.toContain('id="sl-btn-loop-b"');
    expect(timeSliderSrc).toContain('timeline-loop-line-a');
    expect(timeSliderSrc).toContain('timeline-loop-line-b');
    expect(timeSliderSrc).toContain('id="timeline-loop-line-a"');
    expect(timeSliderSrc).toContain('id="timeline-loop-line-b"');
    expect(timeSliderSrc).toContain('data-testid="timeline-loop-line-a"');
    expect(timeSliderSrc).toContain('data-testid="timeline-loop-line-b"');
    expect(timeSliderSrc).toContain('class:begin-timeline-chip');
    expect(timeSliderSrc).toContain('class:end-timeline-chip');
    expect(timeSliderSrc).toContain('isLooping');
    expect(timeSliderSrc).toContain('draggable="true"');
    expect(timeSliderSrc).toContain('class="chip-sparkline-bar"');
    expect(timeSliderSrc).toContain("chip-loop-tag");
  });
});

describe("Item G: Layer Header Cleanup & Drag-and-Drop Z-Index Reordering", () => {
  const layersPanelSrc = readSrcText("components/LayersPanel.svelte");
  const layerRowSrc = readSrcText("components/LayerRow.svelte");

  test("LayerRow removes quick opacity and move buttons to preserve space for layer-name", () => {
    expect(layerRowSrc).not.toContain('class="layer-quick-opacity-wrap"');
    expect(layerRowSrc).not.toContain('class="layer-reorder-buttons"');
    expect(layerRowSrc).toContain('class="layer-name"');
  });

  test("LayersPanel supports drag-and-drop attributes for reordering", () => {
    expect(layersPanelSrc).toContain('class="layer-row-drag-wrapper"');
    expect(layersPanelSrc).toContain('draggable="true"');
    expect(layersPanelSrc).toContain('ondragstart');
    expect(layersPanelSrc).toContain('ondragover');
    expect(layersPanelSrc).toContain('ondrop');
  });

  test("reorderLayers in layersCore correctly swaps layer indices and notifies subscribers", () => {
    const winId = "test-reorder-win";
    addOrUpdateLayer(winId, { id: "layer-0", name: "Layer 0", type: "contour" });
    addOrUpdateLayer(winId, { id: "layer-1", name: "Layer 1", type: "contour" });
    addOrUpdateLayer(winId, { id: "layer-2", name: "Layer 2", type: "contour" });

    // Layers start with pmtiles at index 0, followed by layer-0 (1), layer-1 (2), layer-2 (3)
    let contours = getLayersForWindow(winId).filter((l) => l.type === "contour");
    expect(contours[0].id).toBe("layer-0");
    expect(contours[1].id).toBe("layer-1");
    expect(contours[2].id).toBe("layer-2");

    // Move index 3 (layer-2) to index 1 (layer-0)
    reorderLayers(3, 1, winId);
    contours = getLayersForWindow(winId).filter((l) => l.type === "contour");
    expect(contours[0].id).toBe("layer-2");
    expect(contours[1].id).toBe("layer-0");
    expect(contours[2].id).toBe("layer-1");
  });

  test("syncMapLayerOrder invokes map.moveLayer for each sublayer", () => {
    const moved = [];
    const mockMap = {
      getLayer: (id) => true,
      moveLayer: (id) => moved.push(id),
    };

    const layers = [{ id: "l1" }, { id: "l2" }];
    syncMapLayerOrder(mockMap, layers);

    expect(moved).toContain("l2-line");
    expect(moved).toContain("l1-line");
  });
});

describe("Tasks 1-6 Alignment & Theme Hardening", () => {
  const navBarSrc = readSrcText("components/NavBar.svelte");
  const presetMenuSrc = readSrcText("components/PresetMenu.svelte");
  const statusBarSrc = readSrcText("components/StatusBar.svelte");
  const tokensCss = readSrcText("styles/tokens.css");

  test("Item 2: nav-left is placed after nav-brand and has overflow: visible", () => {
    expect(navBarSrc).toContain('class="nav-left"');
    const brandIdx = navBarSrc.indexOf('class="nav-brand"');
    const leftIdx = navBarSrc.indexOf('class="nav-left"');
    expect(leftIdx).toBeGreaterThan(brandIdx);

    const navbarCss = readSrcText("styles/navbar.css");
    expect(navbarCss).toMatch(/\.nav-left\s*\{[^}]*overflow:\s*visible/);
  });

  test("Item 3: preset-dropdown has overflow: visible", () => {
    expect(presetMenuSrc).toContain("overflow: visible;");
    expect(tokensCss).toMatch(/\[data-theme="light"\]\s+\.preset-dropdown\s*\{[^}]*overflow:\s*visible/);
  });

  test("Item 5: StatusBar places nav-status-indicator on left and btn-toggle-layers on right", () => {
    const leftContainerIdx = statusBarSrc.indexOf('class="status-bar-left"');
    const rightContainerIdx = statusBarSrc.indexOf('class="status-bar-right"');
    const statusIndicatorIdx = statusBarSrc.indexOf('id="nav-status-indicator"');
    const toggleLayersIdx = statusBarSrc.indexOf('id="btn-toggle-layers"');

    expect(statusIndicatorIdx).toBeGreaterThan(leftContainerIdx);
    expect(statusIndicatorIdx).toBeLessThan(rightContainerIdx);
    expect(toggleLayersIdx).toBeGreaterThan(rightContainerIdx);
  });

  test("Item 6: tabpanel, preset-menu-container, timeline-stepper, layout-controls background-color changes per theme", () => {
    expect(tokensCss).toMatch(/\[data-theme="light"\][^{]*tabpanel/);
    expect(tokensCss).toMatch(/\[data-theme="light"\][^{]*\.preset-menu-container/);
    expect(tokensCss).toMatch(/\[data-theme="light"\][^{]*\.timeline-stepper/);
    expect(tokensCss).toMatch(/\[data-theme="light"\][^{]*\.layout-controls/);

    expect(tokensCss).toMatch(/\[data-theme="micaps"\][^{]*tabpanel/);
    expect(tokensCss).toMatch(/\[data-theme="micaps"\][^{]*\.preset-menu-container/);
    expect(tokensCss).toMatch(/\[data-theme="micaps"\][^{]*\.timeline-stepper/);
    expect(tokensCss).toMatch(/\[data-theme="micaps"\][^{]*\.layout-controls/);

    expect(tokensCss).toMatch(/\[data-theme="dark"\][^{]*tabpanel/);
    expect(tokensCss).toMatch(/\[data-theme="dark"\][^{]*\.preset-menu-container/);
    expect(tokensCss).toMatch(/\[data-theme="dark"\][^{]*\.timeline-stepper/);
    expect(tokensCss).toMatch(/\[data-theme="dark"\][^{]*\.layout-controls/);
  });
});
