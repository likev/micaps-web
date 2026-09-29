// bug_split_contour_rerender_race.test.js - Unit tests verifying contour re-render listener isolation in split mode
import { describe, it, expect } from "bun:test";
import {
  armContourReRender,
  disarmContourReRender,
  disarmAllContourReRenders,
} from "../src/services/contourReRender.js";
import { addOrUpdateLayer, removeLayer } from "../src/ui/layerControl.js";

function makeMockMap(bounds = [[100, 20], [120, 40]]) {
  let b = bounds;
  const handlers = { moveend: [], zoomend: [] };
  const sources = {};
  const layers = {};
  return {
    _added: [],
    handlers,
    on(e, cb) {
      if (!handlers[e]) handlers[e] = [];
      handlers[e].push(cb);
    },
    off(e, cb) {
      if (handlers[e]) {
        handlers[e] = handlers[e].filter((f) => f !== cb);
      }
    },
    fireZoom(nb) {
      if (nb) b = nb;
      [...handlers.zoomend].forEach((fn) => fn());
    },
    fireMove(nb) {
      if (nb) b = nb;
      [...handlers.moveend].forEach((fn) => fn());
    },
    getBounds() { return { toArray: () => b }; },
    getSource(id) { return sources[id] || null; },
    getLayer(id) { return layers[id] || null; },
    addSource(id, def) {
      sources[id] = { ...def, setData() {} };
      this._added.push(["source", id]);
    },
    addLayer(def) {
      layers[def.id] = def;
      this._added.push(["layer", def.id]);
    },
    setLayoutProperty() {},
    setPaintProperty() {},
    getStyle() { return { layers: [], sources: {} }; },
  };
}

function makeGridData() {
  return {
    header: { n_lon: 100, n_lat: 100 },
    values: Array.from({ length: 100 }, (_, j) =>
      Array.from({ length: 100 }, (_, i) => Math.sin(i / 10) + Math.cos(j / 10))
    ),
    stats: { min: -2, max: 2 },
  };
}

describe("Bug 2 Fix: Contour Re-Render Map & Window Isolation in Split Mode", () => {
  it("does not remove Map 1 listeners when Map 2 disarms the same layerId without win", () => {
    const map1 = makeMockMap();
    const map2 = makeMockMap();

    const win1 = { id: "tab-1-win-split1", loadSeq: 1 };
    const win2 = { id: "tab-1-win-split2", loadSeq: 1 };

    const layer1 = {
      id: "contour-TMP",
      type: "contour",
      element: "TMP",
      visible: true,
      config: { showFill: true, showLine: true },
      colormap: "TMP",
      gridData: makeGridData(),
      path: "p1",
      file: "f1",
      level: 500,
    };
    const layer2 = {
      id: "contour-TMP",
      type: "contour",
      element: "TMP",
      visible: true,
      config: { showFill: true, showLine: true },
      colormap: "TMP",
      gridData: makeGridData(),
      path: "p2",
      file: "f2",
      level: 500,
    };

    addOrUpdateLayer({ ...layer1 }, win1);
    addOrUpdateLayer({ ...layer2 }, win2);

    armContourReRender(map1, { ...layer1 }, win1, { maxEffectiveCells: 10 });
    armContourReRender(map2, { ...layer2 }, win2, { maxEffectiveCells: 10 });

    expect(map1.handlers.zoomend.length).toBeGreaterThan(0);
    expect(map2.handlers.zoomend.length).toBeGreaterThan(0);

    // Now map2 disarms contour-TMP without passing win (the legacy bug trigger)
    disarmContourReRender(map2, "contour-TMP");

    // map2 listeners should be removed, but map1 listeners MUST remain intact!
    expect(map2.handlers.zoomend.length).toBe(0);
    expect(map1.handlers.zoomend.length).toBeGreaterThan(0);

    // Zooming map1 should still trigger re-rendering
    map1.fireZoom([[80, 10], [140, 50]]);

    // Clean up
    disarmContourReRender(map1, "contour-TMP", win1);
    removeLayer(layer1.id, win1);
    removeLayer(layer2.id, win2);
  });

  it("does not remove Map 1 listeners when Map 2 calls disarmAllContourReRenders", () => {
    const map1 = makeMockMap();
    const map2 = makeMockMap();

    const win1 = { id: "tab-1-win-iso1", loadSeq: 1 };
    const win2 = { id: "tab-1-win-iso2", loadSeq: 1 };

    const layer1 = {
      id: "contour-HGT",
      type: "contour",
      element: "HGT",
      visible: true,
      config: { showLine: true },
      colormap: "HGT",
      gridData: makeGridData(),
    };
    const layer2 = {
      id: "contour-HGT",
      type: "contour",
      element: "HGT",
      visible: true,
      config: { showLine: true },
      colormap: "HGT",
      gridData: makeGridData(),
    };

    addOrUpdateLayer({ ...layer1 }, win1);
    addOrUpdateLayer({ ...layer2 }, win2);

    armContourReRender(map1, { ...layer1 }, win1, { maxEffectiveCells: 10 });
    armContourReRender(map2, { ...layer2 }, win2, { maxEffectiveCells: 10 });

    expect(map1.handlers.moveend.length).toBeGreaterThan(0);
    expect(map2.handlers.moveend.length).toBeGreaterThan(0);

    // Disarm all on map2
    disarmAllContourReRenders(map2);

    // Map 2 should be empty, Map 1 must still have handlers
    expect(map2.handlers.moveend.length).toBe(0);
    expect(map1.handlers.moveend.length).toBeGreaterThan(0);

    // Clean up
    disarmAllContourReRenders(map1);
    expect(map1.handlers.moveend.length).toBe(0);
    removeLayer(layer1.id, win1);
    removeLayer(layer2.id, win2);
  });

  it("resolves window key from map._micapsWindow or map._winId when win is omitted", () => {
    const mapA = makeMockMap();
    const mapB = makeMockMap();

    mapA._winId = "tab-1-win-alpha";
    mapB._winId = "tab-1-win-beta";

    const layerA = {
      id: "contour-TMP",
      type: "contour",
      element: "TMP",
      visible: true,
      config: { showLine: true },
      gridData: makeGridData(),
    };
    const layerB = {
      id: "contour-TMP",
      type: "contour",
      element: "TMP",
      visible: true,
      config: { showLine: true },
      gridData: makeGridData(),
    };

    // Arming without explicit win should resolve winKey from map._winId
    armContourReRender(mapA, layerA, null, { maxEffectiveCells: 10 });
    armContourReRender(mapB, layerB, null, { maxEffectiveCells: 10 });

    expect(mapA.handlers.zoomend.length).toBeGreaterThan(0);
    expect(mapB.handlers.zoomend.length).toBeGreaterThan(0);

    // Disarming mapB should not touch mapA
    disarmContourReRender(mapB, "contour-TMP");
    expect(mapB.handlers.zoomend.length).toBe(0);
    expect(mapA.handlers.zoomend.length).toBeGreaterThan(0);

    disarmContourReRender(mapA, "contour-TMP");
  });
});
