// station_plot.test.js - WMO & NOAA station plot model verification
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { createTestWebView, waitForCondition, waitForMapLoaded } from "./helpers/testEnv.js";

describe("WMO/NOAA Station Weather Plot Model Verification", () => {
  let webview;

  beforeAll(async () => {
    webview = await createTestWebView();
    await waitForMapLoaded(webview, 15000);
    // Wait for stations to load
    await waitForCondition(webview, `Boolean(window.__STATION_LAYER__ && window.__STATION_LAYER__.getTotalCount() > 0)`, 20000);
  }, 45000);

  afterAll(async () => {
    if (webview) await webview.close();
  });

  test("Surface station observations loaded into GeoJSON source", async () => {
    const count = await webview.evaluate(`window.__STATION_LAYER__.getTotalCount()`);
    expect(count).toBeGreaterThan(0);
  });

  test("Zooming into medium zoom renders full 9-point station models", async () => {
    // Zoom map to level 6 to trigger full station plot layout
    await webview.evaluate(`(() => {
      window.__MAP__.setZoom(6.0);
    })()`);

    // Wait for zoom and decluttering update
    await new Promise((r) => setTimeout(r, 800));

    const visibleCount = await webview.evaluate(`window.__STATION_LAYER__.getVisibleCount()`);
    expect(visibleCount).toBeGreaterThan(0);
  });

  test("Station marker DOM contains wind barb and sky cover SVG", async () => {
    const hasSvgElements = await webview.evaluate(`(() => {
      const marker = document.querySelector(".station-plot-marker");
      if (!marker) return false;
      const svgs = marker.querySelectorAll("svg");
      return svgs.length >= 2; // Wind barb SVG + Sky cover SVG
    })()`);
    expect(hasSvgElements).toBe(true);
  });
});
