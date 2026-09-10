// station_canvas_overlay.test.js - Automated tests for Direct Canvas 2D Station Plotting (§8.9 & §8.8)
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import {
  ensureStationCanvas,
  getStationCanvas,
  drawWindBarbCanvas,
  drawSkyCoverCanvas,
  renderStationPlotToCanvas,
  drawStationCanvas,
  renderStationWeatherPlots,
  setStationVisibility,
  setStationConfig,
  removeStationLayer,
} from "../src/layers/stationLayer.js";

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

function createMockMapWithContainer(ctx) {
  const eventListeners = new Map();
  const children = [];
  const canvasElement = createMockCanvas(ctx);

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

describe("Direct HTML5 Canvas 2D Station Plotting (§8.9 & §8.8)", () => {
  let ctx;
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
  });

  afterEach(() => {
    if (origCreateElement) {
      globalThis.document.createElement = origCreateElement;
    }
  });

  test("ensureStationCanvas creates and attaches .station-plot-canvas at zIndex: 410", () => {
    const map = createMockMapWithContainer(ctx);
    const canvas = ensureStationCanvas(map);

    expect(canvas).toBeDefined();
    expect(canvas.className).toBe("station-plot-canvas");
    expect(canvas.style.zIndex).toBe("410");
    expect(canvas.style.pointerEvents).toBe("none");
    expect(canvas.style.position).toBe("absolute");
    expect(map.container.children.length).toBe(1);

    // Reusing existing canvas
    const canvas2 = ensureStationCanvas(map);
    expect(canvas2).toBe(canvas);
    expect(map.container.children.length).toBe(1);
  });

  test("drawWindBarbCanvas renders calm circle (<1.5 m/s), full barbs (4 m/s), and pennants (20 m/s)", () => {
    // 1. Calm wind (1.0 m/s) -> concentric dashed circle
    ctx.calls.arc = [];
    ctx.calls.setLineDash = [];
    drawWindBarbCanvas(ctx, 100, 100, 1.0, 0, 1.0);
    expect(ctx.calls.arc.length).toBe(1);
    expect(ctx.calls.arc[0].r).toBe(10);
    expect(ctx.calls.setLineDash.length).toBeGreaterThanOrEqual(1);

    // 2. Gale wind (26 m/s, 270 deg westerly) -> 1 pennant (20) + 1 full barb (4) + 1 half barb (2)
    ctx.calls.moveTo = [];
    ctx.calls.lineTo = [];
    ctx.calls.fill = 0;
    ctx.calls.stroke = 0;
    drawWindBarbCanvas(ctx, 200, 200, 26.0, 270, 1.0);

    // Staff line drawn via stroke
    expect(ctx.calls.moveTo.length).toBeGreaterThanOrEqual(2);
    // Pennant polygon closed and filled
    expect(ctx.calls.fill).toBeGreaterThanOrEqual(1);
    // Barbs stroked
    expect(ctx.calls.stroke).toBeGreaterThanOrEqual(2);
  });

  test("drawSkyCoverCanvas correctly renders 0..8 octas pie slices and overcast", () => {
    // Octas 0: Clear (only outer circle, no slice fill)
    ctx.calls.arc = [];
    ctx.calls.fill = 0;
    drawSkyCoverCanvas(ctx, 50, 50, 0, 1.0);
    expect(ctx.calls.arc.length).toBe(1);
    expect(ctx.calls.fill).toBe(1); // 1 base background fill

    // Octas 2: 1/4 pie slice
    ctx.calls.arc = [];
    ctx.calls.fill = 0;
    drawSkyCoverCanvas(ctx, 50, 50, 2, 1.0);
    expect(ctx.calls.arc.length).toBe(2); // base + pie slice
    expect(ctx.calls.fill).toBe(2);

    // Octas 8: Solid overcast
    ctx.calls.arc = [];
    ctx.calls.fill = 0;
    drawSkyCoverCanvas(ctx, 50, 50, 8, 1.0);
    expect(ctx.calls.arc.length).toBe(2);
    expect(ctx.calls.fill).toBe(2);
  });

  test("renderStationPlotToCanvas draws all 9 synoptic elements and respects DTD collision rules", () => {
    const p = {
      temperature: 24.6,
      dewpoint: 19.2, // DTD = 5.4 -> 5
      slp: 1012.3, // PPP = 123
      wind_speed: 12.0,
      wind_dir: 180,
      cloud_cover: 6,
      weather_code: 61, // Rain dot
      rain_6h: 15.2,
      press_diff_3h: 1.4,
      press_tend: 1,
    };

    // Case 1: showDTD: true, showVisibility: false -> DTD drawn, ww displaced to -22px
    ctx.calls.fillText = [];
    renderStationPlotToCanvas(ctx, p, 100, 100, {
      showTemp: true,
      showDewpoint: true,
      showDTD: true,
      showWind: true,
      showCloud: true,
      showWeather: true,
      showPressure: true,
      showRain6: true,
      showTendency: true,
      showVisibility: false,
    }, 1.0);

    const texts = ctx.calls.fillText.map((t) => t.text);
    expect(texts).toContain("25"); // TT rounded
    expect(texts).toContain("19"); // Td rounded
    expect(texts).toContain("5"); // DTD
    expect(texts).toContain("123"); // PPP
    expect(texts).toContain("15"); // R6
    expect(texts).toContain("•"); // ww rain symbol

    // Verify DTD position at cx - 8px, cy
    const dtdCall = ctx.calls.fillText.find((t) => t.text === "5");
    expect(dtdCall.x).toBe(92);
    expect(dtdCall.y).toBe(100);

    // Verify ww displaced to cx - 22px
    const wwCall = ctx.calls.fillText.find((t) => t.text === "•");
    expect(wwCall.x).toBe(78);
    expect(wwCall.y).toBe(100);
  });

  test("renderStationWeatherPlots binds continuous move/zoom listeners and updates canvas at 60 FPS", async () => {
    const map = createMockMapWithContainer(ctx);
    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [116.4, 39.9] },
          properties: { station_id: "54511", temperature: 22.0, dewpoint: 14.0 },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [121.4, 31.2] },
          properties: { station_id: "58362", temperature: 26.0, dewpoint: 20.0 },
        },
      ],
    };

    renderStationWeatherPlots(map, geojson, true, { showTemp: true });

    const canvas = getStationCanvas(map);
    expect(canvas).toBeDefined();
    expect(ctx.calls.clearRect.length).toBeGreaterThanOrEqual(1);

    // Simulate map panning gesture
    ctx.calls.clearRect = [];
    map._emit("move");
    await new Promise((r) => setTimeout(r, 25));
    expect(ctx.calls.clearRect.length).toBeGreaterThanOrEqual(1);

    // Simulate map zoom
    ctx.calls.clearRect = [];
    map._emit("zoom");
    await new Promise((r) => setTimeout(r, 25));
    expect(ctx.calls.clearRect.length).toBeGreaterThanOrEqual(1);
  });

  test("interactive mouse hover triggers __SHOW_TOOLTIP__ and __HIDE_TOOLTIP__", () => {
    const map = createMockMapWithContainer(ctx);
    let tooltipShown = null;
    let tooltipHidden = false;

    const prevShow = globalThis.__SHOW_TOOLTIP__;
    const prevHide = globalThis.__HIDE_TOOLTIP__;

    globalThis.__SHOW_TOOLTIP__ = (coords, props, pos) => { tooltipShown = { coords, props, pos }; };
    globalThis.__HIDE_TOOLTIP__ = () => { tooltipHidden = true; };
    if (typeof window !== "undefined") {
      window.__SHOW_TOOLTIP__ = globalThis.__SHOW_TOOLTIP__;
      window.__HIDE_TOOLTIP__ = globalThis.__HIDE_TOOLTIP__;
    }

    try {
      const geojson = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            // [116.4, 39.9] projects to x: (116.4-70)*10 = 464, y: (55-39.9)*10 = 151
            geometry: { type: "Point", coordinates: [116.4, 39.9] },
            properties: { station_id: "54511", name: "Beijing", temperature: 22.0 },
          },
        ],
      };

      renderStationWeatherPlots(map, geojson, true);

      // 1. Move mouse close to Beijing (464, 151) -> Hover hit
      map._emit("mousemove", { point: { x: 466, y: 152 } });
      expect(tooltipShown).toBeDefined();
      expect(tooltipShown.props.station_id).toBe("54511");
      expect(map.getCanvas().style.cursor).toBe("pointer");

      // 2. Move mouse away -> Hover out
      tooltipHidden = false;
      map._emit("mousemove", { point: { x: 100, y: 100 } });
      expect(tooltipHidden).toBe(true);
      expect(map.getCanvas().style.cursor).toBe("");

      // 3. Mouseout of map -> Hide tooltip
      tooltipHidden = false;
      map._emit("mouseout");
      expect(tooltipHidden).toBe(true);
    } finally {
      if (prevShow !== undefined) globalThis.__SHOW_TOOLTIP__ = prevShow;
      else delete globalThis.__SHOW_TOOLTIP__;

      if (prevHide !== undefined) globalThis.__HIDE_TOOLTIP__ = prevHide;
      else delete globalThis.__HIDE_TOOLTIP__;

      if (typeof window !== "undefined") {
        if (prevShow !== undefined) window.__SHOW_TOOLTIP__ = prevShow;
        else delete window.__SHOW_TOOLTIP__;

        if (prevHide !== undefined) window.__HIDE_TOOLTIP__ = prevHide;
        else delete window.__HIDE_TOOLTIP__;
      }
    }
  });

  test("removeStationLayer cleans up canvas element, listeners, and resets state", () => {
    const map = createMockMapWithContainer(ctx);
    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [116.4, 39.9] },
          properties: { station_id: "54511", temperature: 22.0 },
        },
      ],
    };

    renderStationWeatherPlots(map, geojson, true);
    expect(map.container.children.length).toBe(1);

    removeStationLayer(map);
    expect(map.container.children.length).toBe(0);
    expect(getStationCanvas(map)).toBeNull();
  });
});
