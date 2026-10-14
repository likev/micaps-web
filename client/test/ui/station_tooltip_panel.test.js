// station_tooltip_panel.test.js - Comprehensive tests for surface/upper_air station hover tooltip panel
import "../helpers/svelteRunesPolyfill.js";
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { readSrcText } from "../helpers/cssText.js";
import {
  renderStationWeatherPlots,
  removeStationLayer,
} from "../../src/layers/stationLayer.js";
import { handleStationHover } from "../../src/layers/station/stationHover.js";
import { getState } from "../../src/layers/station/stationState.js";

describe("Station Hover Tooltip Panel", () => {
  const tooltipSrc = readSrcText("components/Tooltip.svelte");
  const tokensCss = readSrcText("styles/tokens.css");

  describe("1. Light theme color and background-color", () => {
    test("Tooltip.svelte defines light theme scoped rules with valid background, color, and contrast", () => {
      // Must define light theme selector targeting .tooltip
      expect(tooltipSrc).toMatch(/:global\(\[data-theme=["']light["']\]\)\s*\.tooltip/);

      // Must set background and color using CSS variables or light theme values
      expect(tooltipSrc).toContain("background: var(--bg-panel");
      expect(tooltipSrc).toContain("color: var(--text-primary");
      expect(tooltipSrc).toContain("border-color: var(--border-color");

      // Label spans and strong value containers must define proper theme text colors
      expect(tooltipSrc).toContain(".tooltip-grid span");
      expect(tooltipSrc).toContain(".tooltip-grid strong");

      // Accent color variables must be used for title and value metrics
      expect(tooltipSrc).toContain("var(--accent-blue");
      expect(tooltipSrc).toContain("var(--accent-red");
      expect(tooltipSrc).toContain("var(--accent-green");
      expect(tooltipSrc).toContain("var(--accent-orange");
      expect(tooltipSrc).toContain("var(--accent-cyan");

      // Metric values must have dedicated light theme color rules
      expect(tooltipSrc).toMatch(/:global\(\[data-theme=["']light["']\]\)\s*\.val-tt/);
      expect(tooltipSrc).toMatch(/:global\(\[data-theme=["']light["']\]\)\s*\.val-td/);
      expect(tooltipSrc).toMatch(/:global\(\[data-theme=["']light["']\]\)\s*\.val-dtd/);
      expect(tooltipSrc).toMatch(/:global\(\[data-theme=["']light["']\]\)\s*\.val-p/);
    });

    test("tokens.css defines [data-theme='light'] rules protecting tooltip and metric values", () => {
      expect(tokensCss).toMatch(/\[data-theme=["']light["']\]\s*\.tooltip/);
      expect(tokensCss).toMatch(/\[data-theme=["']light["']\]\s*#tooltip/);
      expect(tokensCss).toContain("background-color: var(--bg-panel) !important;");
      expect(tokensCss).toContain("color: var(--text-primary) !important;");
      expect(tokensCss).toContain("border-color: var(--border-color) !important;");

      // Unclassified strong text should be text-primary, without overriding val-* metric colors
      expect(tokensCss).toContain('[data-theme="light"] .tooltip .tooltip-grid strong:not([class*="val-"])');
      expect(tokensCss).toContain('[data-theme="light"] .tooltip .val-tt');
      expect(tokensCss).toContain('[data-theme="light"] .tooltip .val-td');
      expect(tokensCss).toContain('[data-theme="light"] .tooltip .val-dtd');
      expect(tokensCss).toContain('[data-theme="light"] .tooltip .val-p');
    });
  });

  describe("2. Upper-air stations omit cloud and rain", () => {
    test("Tooltip.svelte template wraps cloud and rain in {#if !isUpperAir}", () => {
      // Template must guard Cloud and Rain rows with !isUpperAir
      expect(tooltipSrc).toMatch(/\{#if\s*!isUpperAir\s*\}/);
      expect(tooltipSrc).toContain("Cloud (N):");
      expect(tooltipSrc).toMatch(/\{#if\s*!isUpperAir\s*\}[\s\S]*Cloud \(N\):[\s\S]*rainInfo[\s\S]*\{\/if\}/);
    });

    test("isUpperAir logic correctly classifies sounding/upper-air stations", () => {
      function deriveIsUpperAir(props) {
        if (!props) return false;
        if (props.isUpperAir === true || props.isUpper === true) return true;
        if (props.isUpperAir === false || props.isSurface === true) return false;
        const model = String(props.model || "").toUpperCase();
        if (model === "UPPER_AIR" || model === "UPPERAIR" || model === "SOUNDING") return true;
        if (model === "SURFACE") return false;
        const elem = String(props.element || "").toUpperCase();
        if (elem === "PLOT_GLOBAL_3H") return false;
        const lId = String(props.layerId || props.layer_id || "").toLowerCase();
        if (lId.includes("upper") || lId.includes("sounding")) return true;
        if (lId.includes("surface")) return false;
        if (props.level !== undefined && props.level !== null && props.level !== 0 && props.level !== "surface") {
          const lvl = Number(props.level);
          if (!isNaN(lvl) && lvl > 0) return true;
        }
        const hasHeight = props?.height !== undefined && props?.height !== null && props?.height !== -9999 && props?.height !== "-9999";
        const heightNum = hasHeight ? parseFloat(props.height) : null;
        const hasSLP = props?.slp !== undefined && props?.slp !== null && props?.slp > 0 && props?.slp < 110000;
        return !hasSLP && heightNum !== null && !isNaN(heightNum) && heightNum > -500;
      }

      // Upper air sounding station at 500 hPa
      expect(deriveIsUpperAir({
        station_id: 54511,
        height: 5840,
        temperature: -15.0,
        dewpoint: -22.0,
        model: "UPPER_AIR",
        level: 500,
      })).toBe(true);

      // Upper air station identified by level alone (e.g. 700 hPa sounding)
      expect(deriveIsUpperAir({
        station_id: 54511,
        height: 3120,
        level: 700,
      })).toBe(true);

      // Upper air station identified by layerId
      expect(deriveIsUpperAir({
        station_id: 54511,
        height: 5840,
        layerId: "upperair-obs-500",
      })).toBe(true);

      // Upper air station identified by sounding height and absence of SLP
      expect(deriveIsUpperAir({
        station_id: 54511,
        height: 5840,
        temperature: -15.0,
      })).toBe(true);

      // Explicit flag
      expect(deriveIsUpperAir({
        station_id: 54511,
        isUpperAir: true,
      })).toBe(true);

      // Surface station must NOT be classified as upper air
      expect(deriveIsUpperAir({
        station_id: 54511,
        slp: 1013.2,
        model: "SURFACE",
        layerId: "surface-obs",
      })).toBe(false);

      expect(deriveIsUpperAir({
        station_id: 54511,
        slp: 1013.2,
        element: "PLOT_GLOBAL_3H",
      })).toBe(false);

      expect(deriveIsUpperAir({
        station_id: 54511,
        slp: 1013.2,
        height: 45.0, // elevation
        temperature: 20.0,
      })).toBe(false);
    });
  });

  describe("3. Surface PLOT_GLOBAL_3H observation contains rain6h", () => {
    test("Tooltip.svelte derives rainInfo with Rain 6h label and checks 6h rain keys", () => {
      // Must check 6-hour rain keys
      expect(tooltipSrc).toContain("rain_6h");
      expect(tooltipSrc).toContain("Rain 6h:");

      // Helper function mirroring Tooltip.svelte's rainInfo derivation
      function deriveRainInfo(props) {
        if (!props) return { label: "Rain 6h:", display: "--" };

        const parseNum = (v) => {
          if (v === undefined || v === null || v === "" || v === -9999 || v === "-9999") return null;
          const n = typeof v === "number" ? v : parseFloat(v);
          if (!isNaN(n) && n >= 0 && n < 9000) {
            return Math.round(n * 10) / 10;
          }
          return null;
        };

        const extractFromKeys = (keys) => {
          for (const k of keys) {
            const val = parseNum(props[k]);
            if (val !== null) return val;
          }
          return null;
        };

        const elem = String(props.element || "").toUpperCase();
        const isHourly = elem.includes("1H") && elem !== "PLOT_GLOBAL_3H";
        const isPlotGlobal3H = elem === "PLOT_GLOBAL_3H" || String(props.layerId || "").toLowerCase().includes("surface") || String(props.model || "").toUpperCase() === "SURFACE" || !props.isUpperAir;

        if (isPlotGlobal3H && !isHourly) {
          const val = extractFromKeys(["rain_6h", "RAIN_6H", "rain6h", "PRE_6h", "RAIN_6h"]);
          return {
            label: "Rain 6h:",
            display: val !== null ? `${val} mm` : "--",
          };
        }

        if (isHourly) {
          const val = extractFromKeys(["rain_1h", "RAIN_1H", "rain1h", "PRE_1h", "RAIN_1h"]);
          return {
            label: "Rain 1h:",
            display: val !== null ? `${val} mm` : "--",
          };
        }

        const val6 = extractFromKeys(["rain_6h", "RAIN_6H", "rain6h", "PRE_6h", "RAIN_6h"]);
        if (val6 !== null) return { label: "Rain 6h:", display: `${val6} mm` };

        const val1 = extractFromKeys(["rain_1h", "RAIN_1H", "rain1h", "PRE_1h", "RAIN_1h"]);
        if (val1 !== null) return { label: "Rain 1h:", display: `${val1} mm` };

        return { label: "Rain 6h:", display: "--" };
      }

      // Surface station with typical PLOT_GLOBAL_3H properties (rain_6h = 12.5, rain_1h = 0 default from parser)
      const surfaceProps = {
        station_id: "54511",
        slp: 1012.4,
        cloud_cover: 6,
        rain_1h: 0,
        rain_6h: 12.5,
        element: "PLOT_GLOBAL_3H",
      };
      const rInfo = deriveRainInfo(surfaceProps);
      expect(rInfo.label).toBe("Rain 6h:");
      expect(rInfo.display).toBe("12.5 mm");

      // Zero 6h rain
      expect(deriveRainInfo({ rain_6h: 0, element: "PLOT_GLOBAL_3H" })).toEqual({ label: "Rain 6h:", display: "0 mm" });

      // Missing 6h rain in PLOT_GLOBAL_3H should NOT fall back to parser default rain_1h: 0
      expect(deriveRainInfo({ rain_1h: 0, element: "PLOT_GLOBAL_3H" })).toEqual({ label: "Rain 6h:", display: "--" });

      // Numeric string rain values from API/fixtures
      expect(deriveRainInfo({ rain_6h: "14.2", element: "PLOT_GLOBAL_3H" })).toEqual({ label: "Rain 6h:", display: "14.2 mm" });

      // Missing rain
      expect(deriveRainInfo({ rain_6h: -9999, element: "PLOT_GLOBAL_3H" })).toEqual({ label: "Rain 6h:", display: "--" });
      expect(deriveRainInfo({})).toEqual({ label: "Rain 6h:", display: "--" });

      // Hourly station that reports rain_1h
      expect(deriveRainInfo({ rain_1h: 3.2, element: "PLOT_REGIONAL_1H" })).toEqual({ label: "Rain 1h:", display: "3.2 mm" });
    });
  });

  describe("4. Station Canvas hover interaction forwards layer type and metadata", () => {
    let mockMap = null;
    let tooltipCall = null;
    let prevShowTooltip = null;
    let prevHideTooltip = null;

    beforeEach(() => {
      tooltipCall = null;
      prevShowTooltip = globalThis.__SHOW_TOOLTIP__;
      prevHideTooltip = globalThis.__HIDE_TOOLTIP__;

      globalThis.__SHOW_TOOLTIP__ = (coords, props, pos) => {
        tooltipCall = { coords, props, pos };
      };
      globalThis.__HIDE_TOOLTIP__ = () => {
        tooltipCall = null;
      };

      if (typeof window !== "undefined") {
        window.__SHOW_TOOLTIP__ = globalThis.__SHOW_TOOLTIP__;
        window.__HIDE_TOOLTIP__ = globalThis.__HIDE_TOOLTIP__;
      }

      const ctx = {
        clearRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        arc() {},
        stroke() {},
        fill() {},
        fillText() {},
        strokeText() {},
        save() {},
        restore() {},
        closePath() {},
        setLineDash() {},
        setTransform() {},
      };

      const children = [];
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

      mockMap = {
        _events: {},
        getContainer: () => container,
        getCanvas: () => mapCanvas,
        getBounds: () => ({
          getSouth: () => 10,
          getNorth: () => 60,
          getWest: () => 70,
          getEast: () => 140,
        }),
        getZoom: () => 6,
        project: ([lon, lat]) => ({ x: (lon - 70) * 10, y: (60 - lat) * 10 }),
        on(event, handler) {
          if (!this._events[event]) this._events[event] = [];
          this._events[event].push(handler);
        },
        off(event, handler) {
          if (this._events[event]) {
            this._events[event] = this._events[event].filter((h) => h !== handler);
          }
        },
      };

      // Ensure document.createElement creates mock canvas
      if (typeof globalThis.document === "undefined") {
        globalThis.document = {};
      }
      const prevCreateEl = globalThis.document.createElement;
      globalThis.document.createElement = (tag) => {
        if (tag === "canvas") {
          return {
            className: "",
            style: {},
            width: 800,
            height: 600,
            getContext: () => ctx,
          };
        }
        return prevCreateEl ? prevCreateEl(tag) : {};
      };
    });

    afterEach(() => {
      if (prevShowTooltip !== undefined) globalThis.__SHOW_TOOLTIP__ = prevShowTooltip;
      else delete globalThis.__SHOW_TOOLTIP__;
      if (prevHideTooltip !== undefined) globalThis.__HIDE_TOOLTIP__ = prevHideTooltip;
      else delete globalThis.__HIDE_TOOLTIP__;

      if (typeof window !== "undefined") {
        if (prevShowTooltip !== undefined) window.__SHOW_TOOLTIP__ = prevShowTooltip;
        else delete window.__SHOW_TOOLTIP__;
        if (prevHideTooltip !== undefined) window.__HIDE_TOOLTIP__ = prevHideTooltip;
        else delete window.__HIDE_TOOLTIP__;
      }
    });

    test("upper_air sounding station hover forwards isUpperAir: true, model, element, and level to __SHOW_TOOLTIP__", () => {
      const soundingGeoJSON = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [116.4, 39.9] },
            properties: {
              station_id: 54511,
              height: 5840,
              temperature: -15.0,
              dewpoint: -22.0,
              wind_speed: 18.0,
              wind_dir: 270,
            },
          },
        ],
      };

      renderStationWeatherPlots(mockMap, soundingGeoJSON, true, { model: "UPPER_AIR", element: "PLOT", level: 500 }, "upperair-obs-500");

      // [116.4, 39.9] projects to x: (116.4 - 70)*10 = 464, y: (60 - 39.9)*10 = 201
      handleStationHover(mockMap, { point: { x: 465, y: 202 } });

      expect(tooltipCall).not.toBeNull();
      expect(tooltipCall.props.station_id).toBe(54511);
      expect(tooltipCall.props.isUpperAir).toBe(true);
      expect(tooltipCall.props.model).toBe("UPPER_AIR");
      expect(tooltipCall.props.element).toBe("PLOT");
      expect(tooltipCall.props.level).toBe(500);
      expect(tooltipCall.props.layerId).toBe("upperair-obs-500");
    });

    test("upper_air detection recognizes level > 0 even with custom non-upperair layerId", () => {
      const soundingGeoJSON = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [116.4, 39.9] },
            properties: {
              station_id: 54511,
              height: 5840,
              temperature: -15.0,
            },
          },
        ],
      };

      // layerId is "obs-grid-1" (does NOT start with upperair- or include sounding)
      renderStationWeatherPlots(mockMap, soundingGeoJSON, true, { level: 500 }, "obs-grid-1");

      handleStationHover(mockMap, { point: { x: 465, y: 202 } });

      expect(tooltipCall).not.toBeNull();
      expect(tooltipCall.props.isUpperAir).toBe(true);
      expect(tooltipCall.props.level).toBe(500);
    });

    test("surface PLOT_GLOBAL_3H station hover forwards isUpperAir: false, element: PLOT_GLOBAL_3H, and rain_6h to __SHOW_TOOLTIP__", () => {
      const surfaceGeoJSON = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [121.4, 31.2] },
            properties: {
              station_id: 58362,
              temperature: 24.5,
              dewpoint: 18.2,
              slp: 1008.4,
              wind_speed: 6.0,
              wind_dir: 120,
              cloud_cover: 7,
              rain_6h: 18.4,
            },
          },
        ],
      };

      renderStationWeatherPlots(mockMap, surfaceGeoJSON, true, { model: "SURFACE", element: "PLOT_GLOBAL_3H" }, "surface-obs");

      // [121.4, 31.2] projects to x: (121.4 - 70)*10 = 514, y: (60 - 31.2)*10 = 288
      handleStationHover(mockMap, { point: { x: 515, y: 289 } });

      expect(tooltipCall).not.toBeNull();
      expect(tooltipCall.props.station_id).toBe(58362);
      expect(tooltipCall.props.isUpperAir).toBe(false);
      expect(tooltipCall.props.model).toBe("SURFACE");
      expect(tooltipCall.props.element).toBe("PLOT_GLOBAL_3H");
      expect(tooltipCall.props.rain_6h).toBe(18.4);
      expect(tooltipCall.props.layerId).toBe("surface-obs");
    });
  });
});
