// contour_layer.test.js - griddata-js in-browser contour & contourf render test
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { createTestWebView, waitForCondition, waitForMapLoaded } from "./helpers/testEnv.js";

describe("griddata-js Contour and Isoband Verification", () => {
  let webview;

  beforeAll(async () => {
    webview = await createTestWebView();
    await waitForMapLoaded(webview, 15000);
    // Wait for initial weather field load
    await waitForCondition(webview, `Boolean(window.__MAP__.getSource("isoband-source"))`, 20000);
  }, 45000);

  afterAll(async () => {
    if (webview) await webview.close();
  });

  test("Isoband layer exists on MapLibre map", async () => {
    const hasIsoband = await webview.evaluate(`Boolean(window.__MAP__.getLayer("isoband-layer"))`);
    expect(hasIsoband).toBe(true);
  });

  test("griddata.contourf generated valid GeoJSON polygons", async () => {
    const polygonCount = await webview.evaluate(`(() => {
      const src = window.__MAP__.getSource("isoband-source");
      if (!src) return 0;
      if (src._options && src._options.data && src._options.data.features) return src._options.data.features.length;
      if (src._data && src._data.features) return src._data.features.length;
      return 0;
    })()`);
    expect(polygonCount).toBeGreaterThan(0);
  });

  test("Isoline line layer exists on MapLibre map", async () => {
    const hasIsoline = await webview.evaluate(`Boolean(window.__MAP__.getLayer("isoline-layer"))`);
    expect(hasIsoline).toBe(true);
  });

  test("Isoline source contains multilinestring features", async () => {
    const lineCount = await webview.evaluate(`(() => {
      const src = window.__MAP__.getSource("isoline-source");
      if (!src) return 0;
      if (src._options && src._options.data && src._options.data.features) return src._options.data.features.length;
      if (src._data && src._data.features) return src._data.features.length;
      return 0;
    })()`);
    expect(lineCount).toBeGreaterThan(0);
  });
});
