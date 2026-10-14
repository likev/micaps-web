import { describe, it, expect, beforeEach } from "bun:test";
import { getEventStyle, getEventDOMIds, loadEventLayer, removeEventLayer, setEventVisibility } from "../../src/layers/eventLayer.js";

describe("Event Layer", () => {
  it("getEventStyle returns correct styles for lightning, tvs, hail, gale", () => {
    const lightning = getEventStyle("lightning");
    expect(lightning.circleColor).toBe("#ffeb3b");

    const tvs = getEventStyle("tvs");
    expect(tvs.circleColor).toBe("#f85149");

    const hail = getEventStyle("hail");
    expect(hail.circleColor).toBe("#e3b341");

    const gale = getEventStyle("gale");
    expect(gale.circleColor).toBe("#58a6ff");

    const def = getEventStyle("unknown");
    expect(def.circleColor).toBe("#a371f7");
  });

  it("getEventDOMIds sanitizes layer id", () => {
    const ids = getEventDOMIds("swan/tvs.nowcast");
    expect(ids.srcId).toBe("event-src-swan_tvs_nowcast");
    expect(ids.pointLayerId).toBe("event-point-swan_tvs_nowcast");
    expect(ids.glowLayerId).toBe("event-glow-swan_tvs_nowcast");
  });

  it("loadEventLayer adds source and layers to mock map", async () => {
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
      setLayoutProperty: (id, prop, val) => {
        const l = layers.find((l) => l.id === id);
        if (l) {
          if (!l.layout) l.layout = {};
          l.layout[prop] = val;
        }
      },
    };

    const win = { id: "win-test", layers: [] };
    const layerDef = await loadEventLayer(mockMap, {
      id: "test-lightning",
      eventType: "lightning",
      path: "SURFACE/LIGHTNING_10MIN",
    }, win);

    expect(layerDef.type).toBe("event");
    expect(layerDef.eventType).toBe("lightning");
    expect(sources["event-src-test-lightning"]).toBeDefined();
    expect(layers.some((l) => l.id === "event-point-test-lightning")).toBe(true);

    // Toggle visibility
    setEventVisibility(mockMap, false, win, "test-lightning");
    const ptLayer = layers.find((l) => l.id === "event-point-test-lightning");
    expect(ptLayer.layout.visibility).toBe("none");

    // Remove layer
    removeEventLayer(mockMap, win, "test-lightning");
    expect(sources["event-src-test-lightning"]).toBeUndefined();
    expect(layers.some((l) => l.id === "event-point-test-lightning")).toBe(false);
  });
});
