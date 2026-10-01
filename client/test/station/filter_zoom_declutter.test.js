// filter_zoom_declutter.test.js - Tests for station data filtering and zoom-based declutter bypass
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import {
  renderStationWeatherPlots,
  setStationConfig,
  removeStationLayer,
  drawStationCanvas,
  hasActiveStationFilters,
  compileStationFilter,
  renderStationPlotToCanvas,
} from "../../src/layers/stationLayer.js";

function createMockContext2D() {
  const calls = {
    clearRect: [],
    beginPath: 0,
    fillText: [],
    strokeText: [],
    stroke: 0,
    save: 0,
    restore: 0,
    setTransform: [],
  };

  return {
    calls,
    canvas: null,
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    font: "10px sans-serif",
    textAlign: "left",
    textBaseline: "alphabetic",
    clearRect: (x, y, w, h) => calls.clearRect.push({ x, y, w, h }),
    beginPath: () => calls.beginPath++,
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    stroke: () => calls.stroke++,
    fill: () => {},
    closePath: () => {},
    fillText: (text, x, y) => calls.fillText.push({ text, x, y }),
    strokeText: (text, x, y) => calls.strokeText.push({ text, x, y }),
    save: () => calls.save++,
    restore: () => calls.restore++,
    setTransform: (a, b, c, d, e, f) => calls.setTransform.push({ a, b, c, d, e, f }),
    setLineDash: () => {},
  };
}

function createMockCanvas(ctx) {
  const canvas = {
    className: "",
    style: {
      position: "",
      top: "",
      left: "",
      width: "",
      height: "",
      pointerEvents: "",
      zIndex: "",
      display: "block",
    },
    width: 1000,
    height: 700,
    parentNode: null,
    getContext: (type) => (type === "2d" ? ctx : null),
  };
  ctx.canvas = canvas;
  return canvas;
}

function createMockMap(ctx, initialZoom = 5) {
  let currentZoom = initialZoom;
  const eventListeners = new Map();
  const children = [];
  createMockCanvas(ctx);

  const container = {
    children,
    querySelector: (sel) => {
      if (sel === ".station-plot-canvas") {
        return children.find((c) => c.className === "station-plot-canvas") || null;
      }
      return null;
    },
    appendChild: (el) => {
      children.push(el);
      el.parentNode = container;
      return el;
    },
    removeChild: (el) => {
      const idx = children.indexOf(el);
      if (idx !== -1) children.splice(idx, 1);
      el.parentNode = null;
      return el;
    },
    getBoundingClientRect: () => ({ width: 1000, height: 700, left: 0, top: 0 }),
  };

  const mapCanvas = { style: { cursor: "" } };

  return {
    container,
    getContainer: () => container,
    getCanvas: () => mapCanvas,
    getBounds: () => ({
      getWest: () => 70,
      getEast: () => 140,
      getSouth: () => 15,
      getNorth: () => 55,
    }),
    getZoom: () => currentZoom,
    setZoom: (z) => {
      currentZoom = z;
    },
    project: ([lon, lat]) => ({
      x: (lon - 70) * 10,
      y: (55 - lat) * 10,
    }),
    on: (evt, handler) => {
      if (!eventListeners.has(evt)) eventListeners.set(evt, []);
      eventListeners.get(evt).push(handler);
    },
    off: (evt, handler) => {
      const list = eventListeners.get(evt);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx !== -1) list.splice(idx, 1);
      }
    },
    fire: (evt) => {
      const list = eventListeners.get(evt);
      if (list) list.forEach((h) => h());
    },
  };
}

describe("Station Data Filtering & Zoom Declutter Bypass", () => {
  let ctx, map;
  let origCreateElement;

  beforeEach(() => {
    ctx = createMockContext2D();
    origCreateElement = globalThis.document?.createElement;
    if (!globalThis.document) globalThis.document = {};
    globalThis.document.createElement = (tag) => {
      if (tag === "canvas") {
        return createMockCanvas(ctx);
      }
      return {
        className: "",
        style: {},
        appendChild: () => {},
        setAttribute: () => {},
        getAttribute: () => null,
      };
    };
    map = createMockMap(ctx, 3); // low zoom level (zoomed out)
  });

  afterEach(() => {
    removeStationLayer(map);
    if (origCreateElement) {
      globalThis.document.createElement = origCreateElement;
    } else {
      delete globalThis.document;
    }
  });

  test("hasActiveStationFilters accurately detects active filter rules vs none / viewOnly", () => {
    expect(hasActiveStationFilters(null)).toBe(false);
    expect(hasActiveStationFilters({})).toBe(false);
    expect(hasActiveStationFilters({ filterRules: [] })).toBe(false);
    expect(hasActiveStationFilters({ filterRules: [{ field: "none", op: ">", val: "" }] })).toBe(false);

    // Active rule in AND/OR logic
    expect(hasActiveStationFilters({ filterRules: [{ field: "Wind", op: ">", val: "5" }] })).toBe(true);
    expect(hasActiveStationFilters({ filterRules: [{ field: "Wind", op: ">", val: 5 }], filterLogic: "OR" })).toBe(true);

    // Supports filterData wrapper
    expect(hasActiveStationFilters({ filterData: { filterRules: [{ field: "Wind", op: ">", val: "5" }] } })).toBe(true);

    // ViewOnly mode does NOT hide stations (per-element gating)
    expect(hasActiveStationFilters({ filterRules: [{ field: "Wind", op: ">", val: "5" }], filterLogic: "VIEW" })).toBe(false);
    expect(hasActiveStationFilters({ filterData: { filterRules: [{ field: "Wind", op: ">", val: "5" }], filterLogic: "VIEW" } })).toBe(false);

    // Legacy filter fields
    expect(hasActiveStationFilters({ filterField1: "Wind", filterOp1: ">", filterVal1: "5" })).toBe(true);
  });

  test("without filter rules, full-density LoD caps at max 5 stations per 100x100px bin", () => {
    // 12 stations all in the same screen cell (e.g. lon=80..80.05, lat=45..45.05 -> x=100, y=100)
    const features = [];
    for (let i = 1; i <= 12; i++) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [80.0 + i * 0.004, 45.0 + i * 0.004] },
        properties: { station_id: `STN_${i}`, wind_speed: 3 },
      });
    }
    const geojson = { type: "FeatureCollection", features };
    renderStationWeatherPlots(map, geojson, true);

    expect(globalThis.__STATION_LAYER__.getVisibleCount(map)).toBe(5);
  });

  test("when user applies wind > 5 filter rule, sparse matching stations are NOT culled by 5-per-bin LoD", () => {
    // 10 stations in the same 100x100px area:
    // 7 stations have wind > 5 (matching filter)
    // 3 stations have wind <= 5 (should be filtered out)
    const features = [];
    for (let i = 1; i <= 7; i++) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [80.0 + i * 0.004, 45.0 + i * 0.004] },
        properties: { station_id: `STN_HIGH_${i}`, wind_speed: 8.5 }, // matches wind > 5
      });
    }
    for (let i = 1; i <= 3; i++) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [80.0 + i * 0.004, 45.0 + i * 0.004] },
        properties: { station_id: `STN_LOW_${i}`, wind_speed: 2.0 }, // filtered out
      });
    }

    const geojson = { type: "FeatureCollection", features };

    // With active filter wind > 5:
    renderStationWeatherPlots(map, geojson, true, {
      filterRules: [{ field: "Wind", op: ">", val: 5 }],
      filterLogic: "AND",
    });

    // All 7 matching stations MUST remain visible, even though they fall into the same 100x100px bin!
    // They must NOT be culled down to 5.
    expect(globalThis.__STATION_LAYER__.getVisibleCount(map)).toBe(7);
  });

  test("sparse matching stations remain visible across zoom-in and zoom-out", () => {
    const features = [];
    // 8 stations with wind > 5
    for (let i = 1; i <= 8; i++) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [80.0 + i * 0.005, 45.0 + i * 0.005] },
        properties: { station_id: `STN_${i}`, wind_speed: 12.0 },
      });
    }
    const geojson = { type: "FeatureCollection", features };

    // Render at zoomed out level (zoom = 2.5)
    map.setZoom(2.5);
    renderStationWeatherPlots(map, geojson, true, {
      filterRules: [{ field: "Wind", op: ">", val: 5 }],
    });

    expect(globalThis.__STATION_LAYER__.getVisibleCount(map)).toBe(8);

    // Zoom in (zoom = 7)
    map.setZoom(7.0);
    drawStationCanvas(map);
    expect(globalThis.__STATION_LAYER__.getVisibleCount(map)).toBe(8);

    // Zoom back out (zoom = 2.0)
    map.setZoom(2.0);
    drawStationCanvas(map);
    expect(globalThis.__STATION_LAYER__.getVisibleCount(map)).toBe(8);
  });

  test("bypasses layer minZoom gating when data filter is active so sparse stations remain visible", () => {
    const features = [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [85.0, 40.0] },
        properties: { station_id: "STN_GALE", wind_speed: 15.0 },
      },
    ];
    const geojson = { type: "FeatureCollection", features };

    // Set map zoom = 3, but layer has minZoom = 6
    map.setZoom(3);

    // 1. Without active filter, minZoom gates out the layer
    renderStationWeatherPlots(map, geojson, true, {
      minZoom: 6,
      filterRules: [],
    });
    expect(globalThis.__STATION_LAYER__.getVisibleCount(map)).toBe(0);

    // 2. With active filter (wind > 10), minZoom is bypassed so sparse station stays visible
    setStationConfig(map, {
      filterRules: [{ field: "Wind", op: ">", val: 10 }],
    });
    expect(globalThis.__STATION_LAYER__.getVisibleCount(map)).toBe(1);
  });

  test("supports filterData config format from LayerRow / preset controls", () => {
    const features = [];
    for (let i = 1; i <= 6; i++) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [80.0 + i * 0.005, 45.0 + i * 0.005] },
        properties: { station_id: `STN_${i}`, wind_speed: 7.0 },
      });
    }
    const geojson = { type: "FeatureCollection", features };

    renderStationWeatherPlots(map, geojson, true, {
      filterData: {
        filterRules: [{ field: "Wind", op: ">", val: 5 }],
        filterLogic: "AND",
      },
    });

    expect(globalThis.__STATION_LAYER__.getVisibleCount(map)).toBe(6);
  });

  test("unfiltered dataset with malformed features does not falsely trigger sparse declutter bypass", () => {
    // 12 valid stations in same bin + 2 corrupted features (null geometry)
    const features = [];
    for (let i = 1; i <= 12; i++) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [80.0 + i * 0.004, 45.0 + i * 0.004] },
        properties: { station_id: `STN_${i}`, wind_speed: 3 },
      });
    }
    features.push({ type: "Feature", geometry: null, properties: { station_id: "BAD_1" } });
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: [] }, properties: { station_id: "BAD_2" } });

    const geojson = { type: "FeatureCollection", features };
    renderStationWeatherPlots(map, geojson, true, {
      filterRules: [], // No active filter
    });

    // Must still declutter to 5 stations, NOT bypass to 12
    expect(globalThis.__STATION_LAYER__.getVisibleCount(map)).toBe(5);
  });

  test("handles uppercase NONE and empty filterRules with filterData fallback", () => {
    // Uppercase 'NONE' should not be treated as an active filter
    expect(hasActiveStationFilters({ filterRules: [{ field: "NONE", op: ">", val: "5" }] })).toBe(false);
    expect(hasActiveStationFilters({ filterRules: [{ field: " none ", op: ">", val: "5" }] })).toBe(false);

    // Empty filterRules array falls back to filterData if present
    expect(hasActiveStationFilters({
      filterRules: [],
      filterData: { filterRules: [{ field: "Wind", op: ">", val: "5" }] },
    })).toBe(true);
  });

  test("dense active filter respects layer minZoom gating when curZoom < minZoom, and renders when zoomed in", () => {
    // 600 stations with wind > 10 (dense filtered set)
    const features = [];
    for (let i = 1; i <= 600; i++) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [75.0 + (i % 20) * 0.5, 20.0 + Math.floor(i / 20) * 0.5] },
        properties: { station_id: `STN_${i}`, wind_speed: 15.0 },
      });
    }
    const geojson = { type: "FeatureCollection", features };

    map.setZoom(3);
    renderStationWeatherPlots(map, geojson, true, {
      minZoom: 6,
      filterRules: [{ field: "Wind", op: ">", val: 10 }],
    });

    // Dense active filter does NOT bypass minZoom gating; it is culled below minZoom
    expect(globalThis.__STATION_LAYER__.getVisibleCount(map)).toBe(0);

    // When zoomed in (curZoom >= minZoom), dense active filter renders
    map.setZoom(7);
    drawStationCanvas(map);
    expect(globalThis.__STATION_LAYER__.getVisibleCount(map)).toBeGreaterThan(0);
  });

  test("dense grid cell with active filter declutters to bin cap to prevent overlapping", () => {
    // 25 stations all in the exact same 100x100px bin with wind > 5
    const features = [];
    for (let i = 1; i <= 25; i++) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [80.0 + i * 0.003, 45.0 + i * 0.003] },
        properties: { station_id: `STN_DENSE_${i}`, wind_speed: 12.0 },
      });
    }
    const geojson = { type: "FeatureCollection", features };

    renderStationWeatherPlots(map, geojson, true, {
      filterRules: [{ field: "Wind", op: ">", val: 5 }],
      filterLogic: "AND",
    });

    // Decluttering must NOT be completely bypassed: dense cell caps at 10 to keep view clean
    expect(globalThis.__STATION_LAYER__.getVisibleCount(map)).toBe(10);
  });

  test("ViewOnly mode: curZoom < minZoom culls unfiltered visibility while keeping sparse filtered wind", () => {
    // 7 stations with wind > 5, 10 stations with wind <= 5
    // All stations have visibility
    const features = [];
    for (let i = 1; i <= 7; i++) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [80.0 + i * 0.005, 45.0 + i * 0.005] },
        properties: { station_id: `STN_GALE_${i}`, wind_speed: 14.0, visibility: 8000 },
      });
    }
    for (let i = 1; i <= 10; i++) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [81.0 + i * 0.005, 46.0 + i * 0.005] },
        properties: { station_id: `STN_CALM_${i}`, wind_speed: 2.0, visibility: 5000 },
      });
    }
    const geojson = { type: "FeatureCollection", features };

    // At low zoom (zoom = 3), below layer minZoom = 6
    map.setZoom(3);
    renderStationWeatherPlots(map, geojson, true, {
      minZoom: 6,
      filterRules: [{ field: "Wind", op: ">", val: 5 }],
      filterLogic: "VIEW",
      showWind: true,
      showVisibility: true,
      showTemp: false,
      showDewpoint: false,
    });

    // Unfiltered visibility is culled by minZoom.
    // Sparse matching wind (> 5) stations remain visible!
    expect(globalThis.__STATION_LAYER__.getVisibleCount(map)).toBe(7);

    // Canvas drew wind barbs (stroke > 0), but no visibility text was drawn
    expect(ctx.calls.stroke).toBeGreaterThan(0);
    expect(ctx.calls.fillText.some((f) => f.text === "8" || f.text === "5")).toBe(false);
  });

  test("ViewOnly mode: curZoom >= minZoom declutters unfiltered visibility to 5 per bin while preserving filtered wind", () => {
    // 3 stations with wind > 5 and visibility
    // 12 stations with wind <= 5 and visibility (all in same bin)
    const features = [];
    for (let i = 1; i <= 3; i++) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [80.0 + i * 0.004, 45.0 + i * 0.004] },
        properties: { station_id: `STN_WIND_${i}`, wind_speed: 15.0, visibility: 9000 },
      });
    }
    for (let i = 1; i <= 12; i++) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [80.0 + (i + 3) * 0.004, 45.0 + (i + 3) * 0.004] },
        properties: { station_id: `STN_OTHER_${i}`, wind_speed: 1.0, visibility: 6000 },
      });
    }
    const geojson = { type: "FeatureCollection", features };

    map.setZoom(7); // curZoom >= minZoom
    renderStationWeatherPlots(map, geojson, true, {
      minZoom: 6,
      filterRules: [{ field: "Wind", op: ">", val: 5 }],
      filterLogic: "VIEW",
      showWind: true,
      showVisibility: true,
      showTemp: false,
      showDewpoint: false,
    });

    // All 3 filtered wind stations are preserved.
    // Unfiltered visibility is decluttered so exactly 5 stations in the bin display visibility.
    // Filtered stations are prioritized and no overlapping occurs.
    const count = globalThis.__STATION_LAYER__.getVisibleCount(map);
    expect(count).toBe(5);

    // Text for visibility ("6" or "9") is rendered
    expect(ctx.calls.fillText.some((f) => f.text === "6" || f.text === "9")).toBe(true);
  });

  test("ViewOnly mode: dense filtered stations in a cell declutter to FILTERED_BIN_CAP to prevent overlapping", () => {
    // 25 stations all in the same 100x100px bin with wind > 5 in VIEW mode
    const features = [];
    for (let i = 1; i <= 25; i++) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [80.0 + i * 0.003, 45.0 + i * 0.003] },
        properties: { station_id: `STN_VIEW_DENSE_${i}`, wind_speed: 14.0 },
      });
    }
    const geojson = { type: "FeatureCollection", features };

    map.setZoom(3);
    renderStationWeatherPlots(map, geojson, true, {
      minZoom: 6,
      filterRules: [{ field: "Wind", op: ">", val: 5 }],
      filterLogic: "VIEW",
      showWind: true,
      showVisibility: true,
    });

    // Capped at 10 stations even at low zoom to avoid barb clutter
    expect(globalThis.__STATION_LAYER__.getVisibleCount(map)).toBe(10);
  });

  test("ViewOnly mode: multiple simultaneous active rules operate cleanly per element", () => {
    // Stn 1: Gale + Heavy Rain
    // Stn 2: Gale only
    // Stn 3: Heavy Rain only
    // Stn 4: Calm + Light Rain
    const features = [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [80.0, 45.0] },
        properties: { station_id: "STN_BOTH", wind_speed: 15.0, rain_6h: 25.0, visibility: 5000 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [80.5, 45.0] },
        properties: { station_id: "STN_WIND_ONLY", wind_speed: 15.0, rain_6h: 1.0, visibility: 5000 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [81.0, 45.0] },
        properties: { station_id: "STN_RAIN_ONLY", wind_speed: 2.0, rain_6h: 25.0, visibility: 5000 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [81.5, 45.0] },
        properties: { station_id: "STN_NEITHER", wind_speed: 2.0, rain_6h: 1.0, visibility: 5000 },
      },
    ];
    const geojson = { type: "FeatureCollection", features };

    map.setZoom(3); // curZoom < minZoom
    renderStationWeatherPlots(map, geojson, true, {
      minZoom: 6,
      filterRules: [
        { field: "Wind", op: ">", val: 5 },
        { field: "Rain", op: ">", val: 10 },
      ],
      filterLogic: "VIEW",
      showWind: true,
      showRain6: true,
      showVisibility: true,
    });

    // Stations 1, 2, 3 have matching filtered elements; Station 4 has none and is culled below minZoom
    expect(globalThis.__STATION_LAYER__.getVisibleCount(map)).toBe(3);

    // Rain text "25" is drawn
    expect(ctx.calls.fillText.some((f) => f.text === "25")).toBe(true);
    // Unfiltered visibility "5" is NOT drawn below minZoom
    expect(ctx.calls.fillText.some((f) => f.text === "5")).toBe(false);
  });

  test("ViewOnly mode: large filtered dataset (>= 500 stations) does NOT get blanket-culled at zoom < minZoom", () => {
    // 600 stations with wind > 10 in VIEW mode
    const features = [];
    for (let i = 1; i <= 600; i++) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [75.0 + (i % 20) * 0.5, 20.0 + Math.floor(i / 20) * 0.5] },
        properties: { station_id: `STN_${i}`, wind_speed: 15.0 },
      });
    }
    const geojson = { type: "FeatureCollection", features };

    map.setZoom(3);
    renderStationWeatherPlots(map, geojson, true, {
      minZoom: 6,
      filterRules: [{ field: "Wind", op: ">", val: 10 }],
      filterLogic: "VIEW",
      showWind: true,
    });

    // In ViewOnly mode, filtered wind is NOT blanket-culled across the whole map
    expect(globalThis.__STATION_LAYER__.getVisibleCount(map)).toBeGreaterThan(0);
  });

  test("Weather (ww) and Visibility (vis) do not collide at the same x-coordinate without DTD", () => {
    const p = {
      weather_code: 61, // rain symbol "•"
      visibility: 5000, // 5 km
    };
    renderStationPlotToCanvas(ctx, p, 100, 100, {
      showWeather: true,
      showVisibility: true,
      showDTD: false,
    }, 1.0);

    const wwCall = ctx.calls.fillText.find((c) => c.text === "•");
    const visCall = ctx.calls.fillText.find((c) => c.text === "5");

    expect(wwCall).toBeDefined();
    expect(visCall).toBeDefined();
    // ww is at cx - 8 (92), vis is at cx - 22 (78); they must have distinct x coordinates
    expect(wwCall.x).toBe(92);
    expect(visCall.x).toBe(78);
    expect(wwCall.x).not.toBe(visCall.x);
  });
});


