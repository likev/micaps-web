// station_config_pipeline.test.js - Tests for station config row show/hide toggles and canvas re-render pipeline
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  renderStationWeatherPlots,
  setStationConfig,
  setStationVisibility,
  getStationCanvas,
  removeStationLayer,
} from "../../src/layers/stationLayer.js";
import { handleLayerAction } from "../../src/ui/layers/actionsDispatcher.js";
import { addOrUpdateLayer, getLayerById } from "../../src/lib/stores/layersCore.js";
import { autoSaveLayerConfig, CURRENT_CONFIG } from "../../src/config/presets.js";

function createMockContext2D() {
  const calls = {
    clearRect: [],
    beginPath: 0,
    moveTo: [],
    lineTo: [],
    arc: [],
    stroke: 0,
    fill: 0,
    closePath: 0,
    fillText: [],
    strokeText: [],
    save: 0,
    restore: 0,
    setTransform: [],
    setLineDash: [],
  };

  return {
    calls,
    canvas: null,
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "10px sans-serif",
    textAlign: "left",
    textBaseline: "alphabetic",
    clearRect: (x, y, w, h) => calls.clearRect.push({ x, y, w, h }),
    beginPath: () => calls.beginPath++,
    moveTo: (x, y) => calls.moveTo.push({ x, y }),
    lineTo: (x, y) => calls.lineTo.push({ x, y }),
    arc: (x, y, r, sa, ea) => calls.arc.push({ x, y, r, sa, ea }),
    stroke: () => calls.stroke++,
    fill: () => calls.fill++,
    closePath: () => calls.closePath++,
    fillText: (text, x, y) => calls.fillText.push({ text, x, y }),
    strokeText: (text, x, y) => calls.strokeText.push({ text, x, y }),
    save: () => calls.save++,
    restore: () => calls.restore++,
    setTransform: (a, b, c, d, e, f) => calls.setTransform.push({ a, b, c, d, e, f }),
    setLineDash: (d) => calls.setLineDash.push(d),
  };
}

function createMockCanvas(ctx) {
  const style = {
    position: "",
    top: "",
    left: "",
    width: "",
    height: "",
    pointerEvents: "",
    zIndex: "",
    display: "block",
  };
  const canvas = {
    className: "",
    style,
    width: 800,
    height: 600,
    parentNode: null,
    getContext: (type) => (type === "2d" ? ctx : null),
  };
  ctx.canvas = canvas;
  return canvas;
}

function createMockMap(ctx) {
  const eventListeners = new Map();
  const canvasElement = createMockCanvas(ctx);
  canvasElement.className = "station-plot-canvas";
  const children = [canvasElement];

  const container = {
    children,
    querySelector: (sel) => {
      if (sel === ".station-plot-canvas") {
        return children.find((c) => c.className === "station-plot-canvas") || null;
      }
      return null;
    },
    appendChild: (el) => {
      if (!children.includes(el)) children.push(el);
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
  canvasElement.parentNode = container;

  const mapCanvas = { style: { cursor: "" } };

  return {
    container,
    canvasElement,
    getContainer: () => container,
    getCanvas: () => mapCanvas,
    getBounds: () => ({
      getWest: () => 70,
      getEast: () => 140,
      getSouth: () => 15,
      getNorth: () => 55,
    }),
    getZoom: () => 5.5,
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
    _emit: (evt, data) => {
      const list = eventListeners.get(evt) || [];
      for (const h of list) h(data);
    },
  };
}

describe("Station Layer Config Row Show/Hide Pipeline", () => {
  let ctx, map, surfaceGeoJSON, soundingGeoJSON, hadDocument, origCreateElement;

  beforeEach(() => {
    ctx = createMockContext2D();
    hadDocument = typeof globalThis.document !== "undefined";
    origCreateElement = globalThis.document?.createElement;
    if (!hadDocument) {
      globalThis.document = {};
    }
    globalThis.document.createElement = (tag) => {
      if (tag === "canvas") {
        const c = createMockCanvas(ctx);
        c.className = "station-plot-canvas";
        return c;
      }
      return {
        className: "",
        style: {},
        appendChild: () => {},
        setAttribute: () => {},
        getAttribute: () => null,
      };
    };

    map = createMockMap(ctx);

    surfaceGeoJSON = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [116.4, 39.9] },
          properties: {
            station_id: "54511",
            temperature: 24.6,
            dewpoint: 18.2,
            wind_speed: 12.0,
            wind_dir: 180,
            pressure: 1012.3,
            slp: 1012.3,
            cloud_cover: 6,
            weather_code: 61,
            visibility: 8500,
            rain_6h: 15.2,
          },
        },
      ],
    };

    soundingGeoJSON = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [121.4, 31.2] },
          properties: {
            station_id: "58362",
            temperature: -12.4,
            dewpoint: -20.1,
            wind_speed: 25.0,
            wind_dir: 270,
            height: 5880,
          },
        },
      ],
    };
  });

  afterEach(() => {
    if (hadDocument) {
      if (origCreateElement) {
        globalThis.document.createElement = origCreateElement;
      } else {
        delete globalThis.document.createElement;
      }
    } else {
      delete globalThis.document;
    }
  });

  it("toggling showTemp in setStationConfig updates canvas display immediately", () => {
    renderStationWeatherPlots(map, surfaceGeoJSON, true, {
      showTemp: true,
      showDewpoint: true,
      showWind: true,
    }, "surface-obs");

    // Initially temperature 25 is rendered
    let texts = ctx.calls.fillText.map((c) => c.text);
    expect(texts).toContain("25");

    // Toggle temperature off
    ctx.calls.fillText = [];
    setStationConfig(map, { showTemp: false }, "surface-obs");

    texts = ctx.calls.fillText.map((c) => c.text);
    expect(texts).not.toContain("25");

    // Toggle temperature back on
    ctx.calls.fillText = [];
    setStationConfig(map, { showTemp: true }, "surface-obs");

    texts = ctx.calls.fillText.map((c) => c.text);
    expect(texts).toContain("25");
  });

  it("toggling showDewpoint, showPressure, showWind in setStationConfig gates canvas plots", () => {
    renderStationWeatherPlots(map, surfaceGeoJSON, true, {
      showTemp: true,
      showDewpoint: true,
      showWind: true,
      showPressure: false,
    }, "surface-obs");

    let texts = ctx.calls.fillText.map((c) => c.text);
    expect(texts).toContain("18"); // Dewpoint rounded
    expect(texts).not.toContain("1012"); // Pressure initially off

    // Toggle dewpoint off and pressure on
    ctx.calls.fillText = [];
    setStationConfig(map, { showDewpoint: false, showPressure: true }, "surface-obs");

    texts = ctx.calls.fillText.map((c) => c.text);
    expect(texts).not.toContain("18"); // Dewpoint gone
    expect(texts).toContain("1012"); // Pressure visible

    // Toggle wind barbs off
    const initialStrokeCount = ctx.calls.stroke;
    ctx.calls.fillText = [];
    setStationConfig(map, { showWind: false }, "surface-obs");
    expect(ctx.calls.stroke).toBeLessThan(initialStrokeCount + 10);
  });

  it("toggling showDTD, showVisibility, showRain6, showCloud on surface station plots", () => {
    renderStationWeatherPlots(map, surfaceGeoJSON, true, {
      showTemp: true,
      showDTD: false,
      showVisibility: false,
      showRain6: false,
      showCloud: false,
    }, "surface-obs");

    let texts = ctx.calls.fillText.map((c) => c.text);
    expect(texts).not.toContain("6"); // T - Td = 24.6 - 18.2 = 6.4 -> 6
    expect(texts).not.toContain("9"); // Vis 8500 -> 9
    expect(texts).not.toContain("15"); // Rain 15.2 -> 15

    // Toggle all auxiliary observation plots on
    ctx.calls.fillText = [];
    setStationConfig(map, {
      showDTD: true,
      showVisibility: true,
      showRain6: true,
      showCloud: true,
    }, "surface-obs");

    texts = ctx.calls.fillText.map((c) => c.text);
    expect(texts).toContain("6"); // DTD visible
    expect(texts).toContain("9"); // Visibility visible
    expect(texts).toContain("15"); // Rain 6h visible
  });

  it("multi-station layer isolation: surface and upper-air configurations remain independent", () => {
    renderStationWeatherPlots(map, surfaceGeoJSON, true, {
      showTemp: true,
      showDewpoint: true,
      showPressure: false,
    }, "surface-obs");

    renderStationWeatherPlots(map, soundingGeoJSON, true, {
      showTemp: true,
      showDewpoint: false,
      showPressure: true,
    }, "upperair-obs-500");

    let texts = ctx.calls.fillText.map((c) => c.text);
    expect(texts).toContain("25"); // Surface temp
    expect(texts).toContain("-12"); // Sounding temp
    expect(texts).toContain("588"); // Sounding height

    // Hide temperature on surface only
    ctx.calls.fillText = [];
    setStationConfig(map, { showTemp: false }, "surface-obs");

    texts = ctx.calls.fillText.map((c) => c.text);
    expect(texts).not.toContain("25"); // Surface temp hidden
    expect(texts).toContain("-12"); // Sounding temp still visible
    expect(texts).toContain("588"); // Sounding height still visible

    // Hide height on sounding only
    ctx.calls.fillText = [];
    setStationConfig(map, { showPressure: false }, "upperair-obs-500");

    texts = ctx.calls.fillText.map((c) => c.text);
    expect(texts).not.toContain("25"); // Surface temp still hidden
    expect(texts).toContain("-12"); // Sounding temp still visible
    expect(texts).not.toContain("588"); // Sounding height hidden
  });

  it("handles full dispatch pipeline via handleLayerAction for station config", () => {
    const win = {
      id: "win-test",
      activeGroup: {
        id: "surface-preset",
        layers: [
          {
            id: "surface-obs",
            type: "station",
            model: "SURFACE",
            render: { showTemp: true, showDewpoint: true },
          },
        ],
      },
      layerSnapshots: [
        {
          id: "surface-obs",
          type: "station",
          model: "SURFACE",
          config: { showTemp: true, showDewpoint: true },
        },
      ],
    };

    renderStationWeatherPlots(map, surfaceGeoJSON, true, {
      showTemp: true,
      showDewpoint: true,
    }, "surface-obs");

    const layer = addOrUpdateLayer({
      id: "surface-obs",
      type: "station",
      model: "SURFACE",
      config: { showTemp: true, showDewpoint: true },
    }, win);

    // Initial render has temperature
    let texts = ctx.calls.fillText.map((c) => c.text);
    expect(texts).toContain("25");

    // Action dispatched: toggle showTemp off
    ctx.calls.fillText = [];
    handleLayerAction(map, "config", "surface-obs", { showTemp: false }, layer, win);

    // Store layer is updated
    expect(layer.config.showTemp).toBe(false);

    // Canonical store layer is updated
    const canonical = getLayerById("surface-obs", win);
    expect(canonical.config.showTemp).toBe(false);

    // Preset layer in activeGroup is updated
    expect(win.activeGroup.layers[0].config.showTemp).toBe(false);
    expect(win.activeGroup.layers[0].render.showTemp).toBe(false);

    // Snapshot is updated
    expect(win.layerSnapshots[0].config.showTemp).toBe(false);

    // Canvas redrawn with temperature hidden
    texts = ctx.calls.fillText.map((c) => c.text);
    expect(texts).not.toContain("25");
  });

  it("handles full dispatch pipeline when layer ID is station-surface but preset is surface-obs", () => {
    const win = {
      id: "win-test-2",
      activeGroup: {
        id: "surface-preset-2",
        layers: [
          {
            id: "surface-obs",
            type: "station",
            model: "SURFACE",
            render: { showTemp: true, showDewpoint: true },
          },
        ],
      },
      layerSnapshots: [
        {
          id: "surface-obs",
          type: "station",
          model: "SURFACE",
          config: { showTemp: true, showDewpoint: true },
        },
      ],
    };

    renderStationWeatherPlots(map, surfaceGeoJSON, true, {
      showTemp: true,
      showDewpoint: true,
    }, "surface-obs");

    const layer = addOrUpdateLayer({
      id: "station-surface",
      type: "station",
      model: "SURFACE",
      config: { showTemp: true, showDewpoint: true },
    }, win);

    let texts = ctx.calls.fillText.map((c) => c.text);
    expect(texts).toContain("25");

    // Action dispatched with layer ID station-surface
    ctx.calls.fillText = [];
    handleLayerAction(map, "config", "station-surface", { showTemp: false }, layer, win);

    expect(layer.config.showTemp).toBe(false);
    expect(win.activeGroup.layers[0].config.showTemp).toBe(false);
    expect(win.activeGroup.layers[0].render.showTemp).toBe(false);
    expect(win.layerSnapshots[0].config.showTemp).toBe(false);

    texts = ctx.calls.fillText.map((c) => c.text);
    expect(texts).not.toContain("25");
  });

  it("setStationVisibility toggles station visibility and canvas display", () => {
    renderStationWeatherPlots(map, surfaceGeoJSON, true, {}, "surface-obs");

    const canvas = getStationCanvas(map);
    expect(canvas.style.display).toBe("block");

    // Hide surface-obs
    setStationVisibility(map, false, "surface-obs");
    expect(canvas.style.display).toBe("none");

    // Show surface-obs
    setStationVisibility(map, true, "surface-obs");
    expect(canvas.style.display).toBe("block");
  });

  it("station-surface ID correctly matches surface-obs layer in setStationConfig", () => {
    renderStationWeatherPlots(map, surfaceGeoJSON, true, {
      showTemp: true,
      showDewpoint: true,
    }, "surface-obs");

    let texts = ctx.calls.fillText.map((c) => c.text);
    expect(texts).toContain("25");

    // setStationConfig using station-surface
    ctx.calls.fillText = [];
    setStationConfig(map, { showTemp: false }, "station-surface");

    texts = ctx.calls.fillText.map((c) => c.text);
    expect(texts).not.toContain("25");
  });

  it("station-upper ID correctly matches upperair-obs-500 layer in setStationConfig", () => {
    renderStationWeatherPlots(map, soundingGeoJSON, true, {
      showTemp: true,
      showDewpoint: true,
      showPressure: true,
    }, "upperair-obs-500");

    let texts = ctx.calls.fillText.map((c) => c.text);
    expect(texts).toContain("-12");

    // setStationConfig using station-upper
    ctx.calls.fillText = [];
    setStationConfig(map, { showTemp: false }, "station-upper");

    texts = ctx.calls.fillText.map((c) => c.text);
    expect(texts).not.toContain("-12");
  });

  it("vertical level changes clean up previous level sounding station layer", () => {
    renderStationWeatherPlots(map, soundingGeoJSON, true, {
      showTemp: true,
    }, "upperair-obs-500");

    ctx.calls.fillText = [];
    renderStationWeatherPlots(map, soundingGeoJSON, true, {
      showTemp: true,
    }, "upperair-obs-700");

    // The canvas should only render the 700 hPa sounding once, not stacked twice
    // Temperature count should be exactly 1
    const tempOccurrences = ctx.calls.fillText.filter((c) => c.text === "-12").length;
    expect(tempOccurrences).toBe(1);
  });

  it("autoSaveLayerConfig matches station layers across vertical levels and persists configs", () => {
    const originalPresets = CURRENT_CONFIG.presets;
    try {
      CURRENT_CONFIG.presets = [
        {
          id: "sounding-preset",
          layers: [
            {
              id: "upperair-obs-500",
              type: "station",
              model: "UPPER_AIR",
              element: "PLOT",
              level: 500,
              render: { showTemp: true, showDewpoint: false },
            },
          ],
        },
      ];

      // A 700 hPa layer in the window
      const layer700 = {
        id: "upperair-obs-700",
        type: "station",
        model: "UPPER_AIR",
        level: 700,
        config: {
          showTemp: false,
          showDewpoint: true,
          showWind: true,
          showPressure: true,
          showDTD: true,
        },
      };

      autoSaveLayerConfig(layer700);

      const target = CURRENT_CONFIG.presets[0].layers[0];
      expect(target.render.showTemp).toBe(false);
      expect(target.render.showDewpoint).toBe(true);
      expect(target.render.showWind).toBe(true);
      expect(target.render.showPressure).toBe(true);
      expect(target.render.showDTD).toBe(true);
    } finally {
      CURRENT_CONFIG.presets = originalPresets;
    }
  });
  it("LayerRow.svelte binds station checkboxes with correct onchange handlers and class tags", async () => {
    const fs = await import("node:fs");
    const sveltePath = fs.existsSync("./src/components/LayerRow.svelte")
      ? "./src/components/LayerRow.svelte"
      : "./client/src/components/LayerRow.svelte";
    const svelteSrc = fs.readFileSync(sveltePath, "utf8");
    expect(svelteSrc).toContain('class="chk-show-temp"');
    expect(svelteSrc).toContain('class="lbl-temp"');
    expect(svelteSrc).toContain('handleConfigChange("showTemp", e.target.checked)');

    expect(svelteSrc).toContain('class="chk-show-dewpoint"');
    expect(svelteSrc).toContain('class="lbl-dew"');
    expect(svelteSrc).toContain('handleConfigChange("showDewpoint", e.target.checked)');

    expect(svelteSrc).toContain('class="chk-show-wind"');
    expect(svelteSrc).toContain('handleConfigChange("showWind", e.target.checked)');

    expect(svelteSrc).toContain('class="chk-show-pressure"');
    expect(svelteSrc).toContain('class="lbl-press"');
    expect(svelteSrc).toContain('handleConfigChange("showPressure", e.target.checked)');

    expect(svelteSrc).toContain('class="chk-show-dtd"');
    expect(svelteSrc).toContain('class="lbl-dtd"');
    expect(svelteSrc).toContain('handleConfigChange("showDTD", e.target.checked)');

    expect(svelteSrc).toContain('onFilterChange={(filterData) => handleConfigPatch(filterData)}');
  });
});
