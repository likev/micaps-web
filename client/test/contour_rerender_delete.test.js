// contour_rerender_delete.test.js - Zoom after ✕-delete must NOT resurrect layers.
// Regression for the expand-on-demand fill commit: runCompute fell back to
// the stale closure `layer` (still holding gridData) when getLayerById
// returned null after delete, recreating fills+isolines on next zoom.
import { describe, it, expect } from "bun:test";
import { armContourReRender, disarmContourReRender } from "../src/services/contourReRender.js";
import { addOrUpdateLayer, removeLayer, getLayerById } from "../src/ui/layerControl.js";

function makeMap(bounds = [[100, 20], [120, 40]]) {
  let b = bounds;
  const handlers = { moveend: [], zoomend: [] };
  const sources = {};
  const layers = {};
  return {
    _added: [],
    on(e, cb) { if (handlers[e]) handlers[e].push(cb); },
    off(e, cb) { if (handlers[e]) handlers[e] = handlers[e].filter((f) => f !== cb); },
    fireZoom(nb) { b = nb; [...handlers.zoomend].forEach((fn) => fn()); },
    getBounds() { return { toArray: () => b }; },
    getSource(id) { return sources[id] || null; },
    getLayer(id) { return layers[id] || null; },
    addSource(id, def) { sources[id] = { ...def, setData() {} }; this._added.push(["source", id]); },
    addLayer(def) { layers[def.id] = def; this._added.push(["layer", def.id]); },
    setLayoutProperty() {},
    setPaintProperty() {},
    getStyle() { return { layers: [], sources: {} }; },
  };
}

function bigGrid() {
  return {
    header: { n_lon: 200, n_lat: 200 },
    values: Array.from({ length: 200 }, (_, j) => Array.from({ length: 200 }, (_, i) => Math.sin(i / 10) + Math.cos(j / 10))),
    stats: { min: -2, max: 2 },
  };
}

describe("zoom after delete must not resurrect contour layers", () => {
  it("delete + disarm, then zoom: no sources/layers recreated", async () => {
    const win = { id: "tab-1-win-del1", loadSeq: 1 };
    const layer = { id: "contour-del-500", type: "contour", element: "TMP", visible: true, config: { showFill: true, showLine: true }, colormap: "TMP", gridData: bigGrid(), path: "p", file: "f", level: 500 };
    addOrUpdateLayer({ ...layer }, win);
    const map = makeMap();
    armContourReRender(map, { ...layer }, win, { maxEffectiveCells: 10 });
    // user ✕-deletes all
    removeLayer(layer.id, win);
    disarmContourReRender(map, layer.id);
    expect(getLayerById(layer.id, win)).toBe(null);
    map.fireZoom([[90, 10], [130, 50]]);
    await new Promise((r) => setTimeout(r, 700));
    expect(map._added.length).toBe(0);
    removeLayer(layer.id, win);
  });

  it("leaked listener (store gone, disarm missed) still must not resurrect", async () => {
    const win = { id: "tab-1-win-del2", loadSeq: 1 };
    const layer = { id: "contour-del-501", type: "contour", element: "TMP", visible: true, config: { showFill: true, showLine: true }, colormap: "TMP", gridData: bigGrid(), path: "p", file: "f", level: 500 };
    addOrUpdateLayer({ ...layer }, win);
    const map = makeMap();
    armContourReRender(map, { ...layer }, win, { maxEffectiveCells: 10 });
    removeLayer(layer.id, win); // disarm forgotten -> listener leaks
    map.fireZoom([[90, 10], [130, 50]]);
    await new Promise((r) => setTimeout(r, 700));
    expect(map._added.length).toBe(0);
    removeLayer(layer.id, win);
  });

  it("layer still present: zoom outside fill bounds still re-renders", async () => {
    const win = { id: "tab-1-win-keep", loadSeq: 1 };
    const layer = { id: "contour-keep-500", type: "contour", element: "TMP", visible: true, config: { showFill: true, showLine: true }, colormap: "TMP", gridData: bigGrid(), path: "p", file: "f", level: 500 };
    addOrUpdateLayer({ ...layer }, win);
    const map = makeMap();
    // prime sources so update path exercises setData/add paths
    armContourReRender(map, { ...layer }, win, { maxEffectiveCells: 10 });
    map.fireZoom([[90, 10], [130, 50]]);
    await new Promise((r) => setTimeout(r, 900));
    expect(map._added.length).toBeGreaterThan(0);
    disarmContourReRender(map, layer.id);
    removeLayer(layer.id, win);
  });
});
