// map_render.test.js - MapLibre GL and PMTiles base map render automation test
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { createTestWebView, waitForMapLoaded } from "./helpers/testEnv.js";

describe("Base Map and PMTiles Protocol Verification", () => {
  let webview;

  beforeAll(async () => {
    webview = await createTestWebView();
    const ok = await waitForMapLoaded(webview, 15000);
    expect(ok).toBe(true);
  }, 45000);

  afterAll(async () => {
    if (webview) await webview.close();
  });

  test("MapLibre GL map instance exists on window", async () => {
    const hasMap = await webview.evaluate("Boolean(window.__MAP__)");
    expect(hasMap).toBe(true);
  });

  test("China PMTiles vector source is registered", async () => {
    const hasSource = await webview.evaluate(`Boolean(window.__MAP__.getSource("china-vector"))`);
    expect(hasSource).toBe(true);
  });

  test("Graticule coordinate gridlines layer exists", async () => {
    const hasGraticule = await webview.evaluate(`Boolean(window.__MAP__.getLayer("graticule-lines"))`);
    expect(hasGraticule).toBe(true);
  });

  test("Map center is positioned over China", async () => {
    const center = await webview.evaluate(`(() => {
      const c = window.__MAP__.getCenter();
      return [Math.round(c.lng), Math.round(c.lat)];
    })()`);
    expect(center[0]).toBeGreaterThanOrEqual(100);
    expect(center[0]).toBeLessThanOrEqual(115);
    expect(center[1]).toBeGreaterThanOrEqual(30);
    expect(center[1]).toBeLessThanOrEqual(40);
  });
});
