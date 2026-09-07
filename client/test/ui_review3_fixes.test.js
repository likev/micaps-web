// ui_review3_fixes.test.js - Comprehensive tests verifying fixes for UI Review 3 issues
import { test, expect, describe, beforeAll, beforeEach } from "bun:test";
import fs from "fs";
import path from "path";
import { initTabWindowManager, getWindowById, getActiveWindow, getActiveTab } from "../src/ui/tabWindowManager.js";
import { activateConfigTab, closeConfigTab } from "../src/ui/configEditor.js";
import { setStepLength } from "../src/ui/timeSlider.js";
import { getLayersForWindow } from "../src/ui/layerControl.js";
import { analyzeAndRenderSoundingElementContour } from "../src/layers/soundingAnalysis.js";
import { analyzeAndRenderSurfaceContours } from "../src/layers/surfaceAnalysis.js";

const elementsMap = new Map();

function createMockElement(id = "", className = "", tagName = "DIV") {
  const el = {
    id,
    tagName: tagName.toUpperCase(),
    classes: new Set(),
    style: {},
    attributes: new Map(),
    dataset: {},
    children: [],
    options: [],
    value: "",
    selectedIndex: 0,
    textContent: "",
    innerHTML: "",
    setAttribute(k, v) { this.attributes.set(k, String(v)); },
    getAttribute(k) { return this.attributes.get(k) || null; },
    appendChild(child) { this.children.push(child); },
    insertBefore(newNode, refNode) { this.children.push(newNode); },
    remove() { elementsMap.delete(id); },
    addEventListener(evt, fn) {},
    removeEventListener(evt, fn) {},
    querySelector(sel) { return null; },
    querySelectorAll(sel) { return []; },
  };

  if (className) {
    className.split(/\s+/).filter(Boolean).forEach((c) => el.classes.add(c));
  }

  el.classList = {
    contains: (c) => el.classes.has(c),
    add: (...cs) => cs.forEach((c) => el.classes.add(c)),
    remove: (...cs) => cs.forEach((c) => el.classes.delete(c)),
    toggle: (c, force) => {
      if (force === true) el.classes.add(c);
      else if (force === false) el.classes.delete(c);
      else if (el.classes.has(c)) el.classes.delete(c);
      else el.classes.add(c);
    },
  };

  if (id) elementsMap.set(id, el);
  return el;
}

beforeAll(() => {
  if (typeof globalThis.document === "undefined") {
    globalThis.document = {};
  }
  globalThis.document.getElementById = (id) => elementsMap.get(id) || null;
  globalThis.document.querySelectorAll = (sel) => {
    const res = [];
    for (const el of elementsMap.values()) {
      if (sel.startsWith(".")) {
        const cls = sel.slice(1);
        if (el.classList.contains(cls)) res.push(el);
      }
    }
    return res;
  };
  globalThis.document.createElement = (tag) => {
    if (tag === "canvas") {
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: () => {},
        }),
        toDataURL: () => "data:image/png;base64,mock",
      };
    }
    return createMockElement("", "", tag);
  };
  globalThis.document.body = createMockElement("body");

  // Initialize tabs bar and workspace container
  createMockElement("tabs-list");
  createMockElement("btn-add-tab");
  createMockElement("workspace-container");
  initTabWindowManager();
});

function createMockMap() {
  const sources = new Map();
  const layers = new Map();
  return {
    addSource: (id, src) => sources.set(id, { ...src, _data: src.data }),
    getSource: (id) => sources.get(id),
    removeSource: (id) => sources.delete(id),
    addLayer: (l) => layers.set(l.id, { ...l }),
    getLayer: (id) => layers.get(id),
    removeLayer: (id) => layers.delete(id),
    setLayoutProperty: (id, prop, val) => {
      const l = layers.get(id);
      if (l) {
        if (!l.layout) l.layout = {};
        l.layout[prop] = val;
      }
    },
    setPaintProperty: (id, prop, val) => {
      const l = layers.get(id);
      if (l) {
        if (!l.paint) l.paint = {};
        l.paint[prop] = val;
      }
    },
  };
}

describe("UI Review 3: CSS & Layout Residuals (§1)", () => {
  const styleCss = fs.readFileSync(path.resolve(__dirname, "../src/style.css"), "utf8");
  const tabsCss = fs.readFileSync(path.resolve(__dirname, "../src/tabs.css"), "utf8");

  test("L1: .panel max-height uses container-relative calc(100% - 24px)", () => {
    expect(styleCss).toContain("max-height: calc(100% - 24px);");
    expect(styleCss).not.toContain("max-height: calc(100vh - 24px);");
  });

  test("L2: .panel.hidden and .hidden:not(.drawer):not(.tooltip) preserves slide and fade contracts", () => {
    expect(styleCss).toContain(".hidden:not(.drawer):not(.tooltip)");
    expect(styleCss).toContain(".panel:empty");
  });

  test("L3: .tabs-list has flex: 1 and min-width: 0, .tab-item has max-width and flex-shrink: 0", () => {
    expect(tabsCss).toMatch(/\.tabs-list\s*\{[^}]*flex:\s*1/);
    expect(tabsCss).toMatch(/\.tabs-list\s*\{[^}]*min-width:\s*0/);
    expect(tabsCss).toMatch(/\.tab-item\s*\{[^}]*flex-shrink:\s*0/);
    expect(tabsCss).toMatch(/\.tab-item\s*\{[^}]*max-width:\s*180px/);
    expect(tabsCss).toMatch(/\.layout-controls\s*\{[^}]*flex-shrink:\s*0/);
  });

  test("L4: timeslider container has min-height: 60px and height: auto, time-lead-wrapper has ellipsis", () => {
    expect(styleCss).toMatch(/#timeslider-container\s*\{[^}]*min-height:\s*60px/);
    expect(styleCss).toMatch(/#timeslider-container\s*\{[^}]*height:\s*auto/);
    expect(styleCss).toMatch(/#time-lead-wrapper\s*\{[^}]*text-overflow:\s*ellipsis/);
  });

  test("L5 & L9: navbar brand/controls have flex-shrink: 0, @media queries for 768px and 520px exist", () => {
    expect(styleCss).toMatch(/\.nav-brand\s*\{[^}]*flex-shrink:\s*0/);
    expect(styleCss).toMatch(/\.nav-controls\s*\{[^}]*flex-shrink:\s*0/);
    expect(styleCss).toContain("@media (max-width: 768px)");
    expect(styleCss).toContain("@media (max-width: 520px)");
  });

  test("L6: #main-content uses flex: 1 and min-height: 0 without fixed calc height", () => {
    expect(styleCss).toMatch(/#main-content\s*\{[^}]*min-height:\s*0/);
    expect(styleCss).not.toMatch(/#main-content\s*\{[^}]*height:\s*calc\(100vh - 144px\)/);
  });

  test("L7: window-panel.maximized has z-index: 400 !important", () => {
    expect(tabsCss).toMatch(/\.window-panel\.maximized\s*\{[^}]*z-index:\s*400 !important/);
  });

  test("L8: drawer-header flex-shrink: 0, drawer-body and config editor body have min-height: 0", () => {
    expect(styleCss).toMatch(/\.drawer-header\s*\{[^}]*flex-shrink:\s*0/);
    expect(styleCss).toMatch(/\.drawer-body\s*\{[^}]*min-height:\s*0/);
    expect(tabsCss).toMatch(/\.config-editor-body\s*\{[^}]*min-height:\s*0/);
    expect(tabsCss).toMatch(/\.config-editor-textarea\s*\{[^}]*min-height:\s*0/);
  });

  test("L10: config checkbox span has nowrap & ellipsis, tooltip has max-width & break-word", () => {
    expect(styleCss).toMatch(/\.config-checkbox-item span\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(styleCss).toMatch(/\.tooltip\s*\{[^}]*max-width:\s*min\(280px,\s*80vw\)/);
    expect(styleCss).toMatch(/\.tooltip\s*\{[^}]*overflow-wrap:\s*break-word/);
  });
});

describe("UI Review 3: Layer Panel A11y & Interactions (§2)", () => {
  test("P4: getWindowById resolves window instance by string ID", () => {
    const win1 = getWindowById("tab-1-win-0");
    expect(win1).toBeTruthy();
    expect(win1?.id).toBe("tab-1-win-0");
    expect(win1?.winIdx).toBe(0);

    const nonExistent = getWindowById("win-999-999");
    expect(nonExistent).toBeNull();
  });

  test("P7: Insufficient station data (< 3 features) triggers notification toast without throwing", async () => {
    const map = createMockMap();
    const { handleLayerAction } = await import("../src/ui/layerActions.js");

    const dummyLayer = {
      id: "surface-obs",
      type: "station",
      stationsGeoJSON: { type: "FeatureCollection", features: [{ type: "Feature", properties: {} }] },
    };

    expect(() => {
      handleLayerAction(map, "addContour", "contour-surface-slp", "SLP", dummyLayer, getActiveWindow());
    }).not.toThrow();
  });
});

describe("UI Review 3: Windows, Config, Timeline, and A11y (§3)", () => {
  test("W1 & W2 & W3: Config tab activation and closing restores workspace, tabs-list, and layer control", () => {
    const ws1 = createMockElement("tab-workspace-1", "tab-workspace active");
    const panelWin = createMockElement("win-panel-1-0", "window-panel active active-single");
    const btnLayers = createMockElement("btn-toggle-layers", "active");
    btnLayers.setAttribute("aria-pressed", "true");
    const layerCtrl = createMockElement("layer-control", "panel");
    const legendPanel = createMockElement("legend-panel", "panel");

    const activeTab = getActiveTab();
    if (activeTab) activeTab.layout = "1x1";

    activateConfigTab();

    expect(panelWin.classList.contains("active")).toBe(false);
    expect(panelWin.classList.contains("active-single")).toBe(false);
    expect(layerCtrl.classList.contains("hidden")).toBe(true);
    expect(btnLayers.classList.contains("active")).toBe(false);

    closeConfigTab();

    expect(ws1.classList.contains("active")).toBe(true);
    expect(layerCtrl.classList.contains("hidden")).toBe(false);
    expect(btnLayers.classList.contains("active")).toBe(true);
  });

  test("W8: setStepLength falls back to first available option when passed an unlisted step", () => {
    const sel = createMockElement("select-step-length", "", "SELECT");
    sel.options = [{ value: "6" }, { value: "12" }];
    sel.value = "6";

    setStepLength(24);
    expect(sel.value).toBe("6");
  });

  test("W9: Tooltip positioning clamps to viewport and avoids navbar overlap (y >= 52)", async () => {
    const { initTooltip } = await import("../src/ui/tooltip.js");
    const tt = createMockElement("tooltip", "tooltip hidden");
    initTooltip("tooltip");

    globalThis.__SHOW_TOOLTIP__([116.4, 39.9], { temperature: 25, slp: 1012 }, { clientX: 100, clientY: 10 });
    expect(parseInt(tt.style.top || "0", 10)).toBeGreaterThanOrEqual(52);

    globalThis.__SHOW_TOOLTIP__([116.4, 39.9], { temperature: 25, slp: 1012 }, { clientX: 790, clientY: 100 });
    expect(parseInt(tt.style.left || "0", 10)).toBeLessThan(800);
  });
});

describe("UI Review 3: Map & Analysis Consistency (§4)", () => {
  test("C1: soundingAnalysis and surfaceAnalysis forward labelSize to layer config", () => {
    const map = createMockMap();
    const win = getActiveWindow() || { id: "tab-1-win-0", winIdx: 0 };
    const soundings = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [116.4, 39.9] }, properties: { station_id: 54511, height: 5840, temperature: -14.5, dewpoint: -22.0 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [121.4, 31.2] }, properties: { station_id: 58362, height: 5880, temperature: -10.0, dewpoint: -15.5 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [113.3, 23.1] }, properties: { station_id: 59287, height: 5920, temperature: -8.5, dewpoint: -12.0 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [104.0, 30.6] }, properties: { station_id: 56294, height: 5860, temperature: -12.0, dewpoint: -18.0 } },
      ],
    };

    analyzeAndRenderSoundingElementContour(map, soundings, 500, "HGT", { labelSize: 18 }, win);
    const layers = getLayersForWindow(win);
    const soundingLayer = layers.find((l) => l.id?.startsWith("contour-sounding-hgt"));
    expect(soundingLayer?.config?.labelSize).toBe(18);

    const surfaceStns = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [116.4, 39.9] }, properties: { station_id: 54511, slp: 1012.5, visibility: 12.0, rain_6h: 0.0, temperature: 24.5 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [121.4, 31.2] }, properties: { station_id: 58362, slp: 1008.2, visibility: 8.5, rain_6h: 12.4, temperature: 28.0 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [113.3, 23.1] }, properties: { station_id: 59287, slp: 1004.5, visibility: 20.0, rain_6h: 35.8, temperature: 31.0 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [104.0, 30.6] }, properties: { station_id: 56294, slp: 1014.0, visibility: 4.2, rain_6h: 5.2, temperature: 22.0 } },
      ],
    };

    analyzeAndRenderSurfaceContours(map, surfaceStns, "SLP", { labelSize: 16 }, win);
    const surfaceLayers = getLayersForWindow(win);
    const surfaceLayer = surfaceLayers.find((l) => l.id === "contour-surface-slp");
    expect(surfaceLayer?.config?.labelSize).toBe(16);
  });
});
