import { describe, test, expect } from "bun:test";
import {
  buildLevelsFromInterval,
  validateInterval,
  resolveRenderLevels,
  clipLevelsToRange,
  MAX_INTERVAL_LEVELS,
} from "../src/layers/contour/contourLevels.js";
import { tagLinesAndFills } from "../src/layers/analysis/objectiveAnalysis.js";
import { buildBaseConfig } from "../src/ui/layers/layerDefaults.js";
import { handleConfigAction } from "../src/ui/layers/configActions.js";
import { renderContourLayers } from "../src/layers/contourLayer.js";
import { autoSaveLayerConfig } from "../src/config/presets.js";
import { readSrcText } from "./helpers/cssText.js";

function createMockMap() {
  const sources = new Map();
  const layers = new Map();
  return {
    sources,
    layers,
    getSource(id) {
      if (!sources.has(id)) return null;
      return {
        _data: sources.get(id),
        setData(d) {
          sources.set(id, d);
          this._data = d;
        },
      };
    },
    addSource(id, src) {
      sources.set(id, src.data);
    },
    removeSource(id) {
      sources.delete(id);
    },
    getLayer(id) {
      return layers.get(id) || null;
    },
    addLayer(layerDef) {
      layers.set(layerDef.id, layerDef);
    },
    removeLayer(id) {
      layers.delete(id);
    },
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
    getBounds() {
      return {
        toArray: () => [
          [70, 10],
          [130, 55],
        ],
      };
    },
  };
}

function createSampleGridData() {
  const nLon = 10;
  const nLat = 10;
  const values = [];
  for (let j = 0; j < nLat; j++) {
    for (let i = 0; i < nLon; i++) {
      values.push(-20 + j * 4 + Math.sin(i / 2) * 5);
    }
  }

  return {
    header: {
      start_lon: 70,
      end_lon: 130,
      start_lat: 10,
      end_lat: 55,
      n_lon: nLon,
      n_lat: nLat,
      d_lon: 6,
      d_lat: 4.5,
    },
    values,
    stats: { min: -25, max: 25 },
  };
}

describe("Contour Interval Level Generation (contourLevels.js)", () => {
  test("buildLevelsFromInterval(1000, 2.5, 1010) generates exactly 5 levels [1000, 1002.5, 1005, 1007.5, 1010]", () => {
    const res = buildLevelsFromInterval(1000, 2.5, 1010);
    expect(res.error).toBeNull();
    expect(res.levels).toEqual([1000, 1002.5, 1005, 1007.5, 1010]);
    expect(res.count).toBe(5);
  });

  test("Float sequence (0, 0.1, 0.3) produces exact [0, 0.1, 0.2, 0.3] without floating point drift", () => {
    const res = buildLevelsFromInterval(0, 0.1, 0.3);
    expect(res.error).toBeNull();
    expect(res.levels).toEqual([0, 0.1, 0.2, 0.3]);
    expect(res.count).toBe(4);
  });

  test("parses string inputs transparently", () => {
    const res = buildLevelsFromInterval("1000", "2.5", "1010");
    expect(res.error).toBeNull();
    expect(res.levels).toEqual([1000, 1002.5, 1005, 1007.5, 1010]);
  });

  test("rejects non-positive step (step <= 0)", () => {
    const res0 = buildLevelsFromInterval(1000, 0, 1010);
    expect(res0.error).toBe("step");
    expect(res0.levels).toBeNull();

    const resNeg = buildLevelsFromInterval(1000, -2, 1010);
    expect(resNeg.error).toBe("step");
    expect(resNeg.levels).toBeNull();
  });

  test("rejects invalid range (start >= end)", () => {
    const resEqual = buildLevelsFromInterval(1000, 2, 1000);
    expect(resEqual.error).toBe("range");
    expect(resEqual.levels).toBeNull();

    const resInverted = buildLevelsFromInterval(1010, 2, 1000);
    expect(resInverted.error).toBe("range");
    expect(resInverted.levels).toBeNull();
  });

  test("rejects NaN or non-finite inputs", () => {
    const resNaN = buildLevelsFromInterval("abc", 2, 1000);
    expect(resNaN.error).toBe("nan");
    expect(resNaN.levels).toBeNull();

    const resEmpty = buildLevelsFromInterval("", 2, 1000);
    expect(resEmpty.error).toBe("nan");
    expect(resEmpty.levels).toBeNull();

    const resNull = buildLevelsFromInterval(null, 2, 1000);
    expect(resNull.error).toBe("nan");
    expect(resNull.levels).toBeNull();
  });

  test("rejects when resulting count is < 2 or > MAX_INTERVAL_LEVELS (60)", () => {
    // Step larger than range produces only 1 level
    const resUnder = buildLevelsFromInterval(1000, 20, 1010);
    expect(resUnder.error).toBe("count");
    expect(resUnder.levels).toBeNull();

    // Step producing > 60 levels
    const resOver = buildLevelsFromInterval(0, 1, 100);
    expect(resOver.error).toBe("count");
    expect(resOver.levels).toBeNull();
    expect(MAX_INTERVAL_LEVELS).toBe(60);
  });

  test("validateInterval accurately validates triples without allocating array", () => {
    const valid = validateInterval(500, 4, 600);
    expect(valid.valid).toBe(true);
    expect(valid.count).toBe(26);

    const invalid = validateInterval(500, -4, 600);
    expect(invalid.valid).toBe(false);
    expect(invalid.error).toBe("step");
  });

  test("resolveRenderLevels distinguishes valid custom levels from null auto levels", () => {
    expect(resolveRenderLevels({ levels: [1, 2] })).toEqual([1, 2]);
    expect(resolveRenderLevels({ interval: { start: 1, step: 1, end: 2 }, levels: null })).toBeNull();
    expect(resolveRenderLevels({ levels: [] })).toBeNull();
    expect(resolveRenderLevels({ levels: [5] })).toBeNull();
    expect(resolveRenderLevels(null)).toBeNull();
    expect(resolveRenderLevels({})).toBeNull();
  });
});

describe("Contour Interval Integration with renderContourLayers", () => {
  test("renderContourLayers with custom levels produces isolines matching custom level set", () => {
    const map = createMockMap();
    const gridData = createSampleGridData();
    const customLevels = [-10, 0, 10];

    renderContourLayers(map, gridData, "TMP", {
      layerId: "test-custom-interval",
      levels: customLevels,
      smooth: false,
    });

    const isolineSrc = map.getSource("test-custom-interval-isoline-source");
    expect(isolineSrc).not.toBeNull();
    expect(isolineSrc._data.features.length).toBeGreaterThan(0);

    // Every rendered isoline value must be one of our custom levels
    for (const f of isolineSrc._data.features) {
      const val = f.properties?.value;
      expect(customLevels).toContain(val);
    }
  });

  test("renderContourLayers without custom levels uses default automatic levels", () => {
    const map = createMockMap();
    const gridData = createSampleGridData();

    renderContourLayers(map, gridData, "TMP", {
      layerId: "test-auto-interval",
      smooth: false,
    });

    const isolineSrc = map.getSource("test-auto-interval-isoline-source");
    expect(isolineSrc).not.toBeNull();
    expect(isolineSrc._data.features.length).toBeGreaterThan(0);

    const values = isolineSrc._data.features.map((f) => f.properties?.value);
    // Automatic TMP levels span beyond [-10, 0, 10]
    expect(values.length).toBeGreaterThan(0);
    const hasValuesOutsideLimitedSet = values.some((v) => v !== -10 && v !== 0 && v !== 10);
    expect(hasValuesOutsideLimitedSet).toBe(true);
  });
});

describe("Contour Interval UI and Defaults Integration", () => {
  test("buildBaseConfig declares interval: null and levels: null defaults", () => {
    const cfg = buildBaseConfig({
      type: "contour",
      element: "HGT",
    });
    expect(cfg.interval).toBeNull();
    expect(cfg.levels).toBeNull();
  });

  test("Svelte LayerRow renders Interval row with Start, Step, End inputs wired to handleIntervalChange", () => {
    // Live drawer is components/LayerRow.svelte (legacy renderLayerRow removed);
    // assert the current implementation carries the interval editor.
    const src = readSrcText("components/LayerRow.svelte");
    expect(src).toContain("input-interval-start");
    expect(src).toContain("input-interval-step");
    expect(src).toContain("input-interval-end");
    expect(src).toContain("handleIntervalChange");
    expect(src).toContain("clearIntervalConfig");
    expect(src).toContain("buildLevelsFromInterval");
  });

  test("handleConfigAction with interval/levels re-renders gridData layer with custom levels", () => {
    const map = createMockMap();
    const gridData = createSampleGridData();
    const layer = {
      id: "test-nwp-hgt",
      type: "contour",
      element: "HGT",
      visible: true,
      gridData,
      config: {
        showLine: true,
        showFill: false,
      },
    };

    handleConfigAction(
      map,
      layer.id,
      {
        interval: { start: -10, step: 10, end: 10 },
        levels: [-10, 0, 10],
      },
      layer,
      null
    );

    expect(layer.config.interval).toEqual({ start: -10, step: 10, end: 10 });
    expect(layer.config.levels).toEqual([-10, 0, 10]);

    const src = map.getSource("test-nwp-hgt-isoline-source");
    expect(src).not.toBeNull();
    for (const f of src._data.features) {
      expect([-10, 0, 10]).toContain(f.properties?.value);
    }

    // Reset to Auto via levels: null
    handleConfigAction(
      map,
      layer.id,
      {
        interval: null,
        levels: null,
      },
      layer,
      null
    );

    expect(layer.config.interval).toBeNull();
    expect(layer.config.levels).toBeNull();
  });
});

describe("Contour Interval Out-of-Range Clipping (sounding, custom levels)", () => {
  function createHgtGradient() {
    const n = 10;
    const x = [];
    const y = [];
    for (let i = 0; i < n; i++) {
      x.push(i);
      y.push(i);
    }
    // North-south gradient 5400 -> 5600
    const interpolated = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        interpolated.push(5400 + (j / (n - 1)) * 200);
      }
    }
    return { x, y, interpolated, values: [5400, 5500, 5600] };
  }

  test("clipLevelsToRange keeps only the in-range subset", () => {
    expect(clipLevelsToRange([5000, 5100, 5400, 5500, 5600, 5700, 6000], 5400, 5600)).toEqual([5400, 5500, 5600]);
    expect(clipLevelsToRange([7000, 7100, 7200], 5400, 5600)).toEqual([]);
    expect(clipLevelsToRange([], 5400, 5600)).toEqual([]);
    expect(clipLevelsToRange([1, 2], NaN, 5600)).toEqual([1, 2]);
  });

  test("custom interval wider than data clips to data range, no auto fallback", () => {
    const { x, y, interpolated, values } = createHgtGradient();
    const custom = [5000, 5100, 5200, 5300, 5400, 5500, 5600, 5700, 5800, 5900, 6000];
    const res = tagLinesAndFills(interpolated, x, y, custom, "HGT", "HGT", [], true, values, true);
    expect(res.levels).toEqual([5400, 5500, 5600]);
    expect(res.lines.length).toBeGreaterThan(0);
    for (const f of res.lines) {
      expect([5400, 5500, 5600]).toContain(f.properties?.value);
    }
  });

  test("fully disjoint custom interval returns empty lines without auto fallback", () => {
    const { x, y, interpolated, values } = createHgtGradient();
    const custom = [7000, 7100, 7200];
    const res = tagLinesAndFills(interpolated, x, y, custom, "HGT", "HGT", [], true, values, true);
    expect(res.lines).toEqual([]);
    expect(res.levels).toEqual(custom);
  });

  test("auto levels still fall back to autoLevels when contour is empty", () => {
    const { x, y, interpolated, values } = createHgtGradient();
    const res = tagLinesAndFills(interpolated, x, y, [7000, 7100], "HGT", "HGT", [], true, values, false);
    expect(res.lines.length).toBeGreaterThan(0);
    expect(res.levels).not.toEqual([7000, 7100]);
  });
});

describe("Review 1 Follow-up Verifications", () => {
  test("resolveRenderLevels returns null on invalid empty or single-element arrays", () => {
    expect(resolveRenderLevels({ levels: [] })).toBeNull();
    expect(resolveRenderLevels({ levels: [100] })).toBeNull();
    expect(resolveRenderLevels({ levels: null })).toBeNull();
    expect(resolveRenderLevels({ levels: undefined })).toBeNull();
    expect(resolveRenderLevels({ levels: [100, 200] })).toEqual([100, 200]);
  });

  test("renderContourLayers safely ignores invalid levels array and falls back to auto", () => {
    const map = createMockMap();
    const gridData = createSampleGridData();

    // Pass invalid levels: [] which should safely resolve to null and use auto levels
    renderContourLayers(map, gridData, "TMP", {
      layerId: "test-invalid-levels-array",
      levels: [],
      smooth: false,
    });

    const isolineSrc = map.getSource("test-invalid-levels-array-isoline-source");
    expect(isolineSrc).not.toBeNull();
    expect(isolineSrc._data.features.length).toBeGreaterThan(0);
  });
});

