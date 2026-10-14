import { describe, it, expect } from "bun:test";
import { getProfilerDOMIds, loadProfilerLayer, removeProfilerLayer, setProfilerVisibility, profilerController } from "../../src/layers/profilerLayer.js";

describe("Profiler Layer", () => {
  it("getProfilerDOMIds sanitizes layer id", () => {
    const ids = getProfilerDOMIds("wind_profiler/robs.58362");
    expect(ids.srcId).toBe("profiler-src-wind_profiler_robs_58362");
    expect(ids.pointLayerId).toBe("profiler-point-wind_profiler_robs_58362");
    expect(ids.labelLayerId).toBe("profiler-label-wind_profiler_robs_58362");
  });

  it("loadProfilerLayer adds point layer and controller shows panel", async () => {
    const layers = [];
    const sources = {};
    const mockMap = {
      getLayer: (id) => layers.find((l) => l.id === id),
      removeLayer: (id) => {
        const idx = layers.findIndex((l) => l.id === id);
        if (idx >= 0) layers.splice(idx, 1);
      },
      getSource: (id) => sources[id],
      removeSource: (id) => { delete sources[id]; },
      addSource: (id, def) => { sources[id] = def; },
      addLayer: (def) => { layers.push(def); },
      on: () => {},
      off: () => {},
      setLayoutProperty: (id, prop, val) => {
        const l = layers.find((l) => l.id === id);
        if (l) {
          if (!l.layout) l.layout = {};
          l.layout[prop] = val;
        }
      },
    };

    const win = { id: "win-test", layers: [] };
    const layerDef = await loadProfilerLayer(mockMap, {
      id: "test-profiler",
      product: "ROBS",
      stationId: "58362",
    }, win);

    expect(layerDef.type).toBe("profiler");
    expect(layerDef.product).toBe("ROBS");
    expect(sources["profiler-src-test-profiler"]).toBeDefined();
    expect(layers.some((l) => l.id === "profiler-point-test-profiler")).toBe(true);

    // Toggle visibility
    setProfilerVisibility(mockMap, false, win, "test-profiler");
    const ptLayer = layers.find((l) => l.id === "profiler-point-test-profiler");
    expect(ptLayer.layout.visibility).toBe("none");

    // Remove layer
    removeProfilerLayer(mockMap, win, "test-profiler");
    expect(sources["profiler-src-test-profiler"]).toBeUndefined();
    expect(layers.some((l) => l.id === "profiler-point-test-profiler")).toBe(false);
  });
});
