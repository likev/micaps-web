// raster_wind.test.js - Float32Array binary raster and wind streamline animation test
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { createTestWebView, waitForCondition, waitForMapLoaded } from "./helpers/testEnv.js";

describe("Raster Layer and Wind Streamline Verification", () => {
  let webview;

  beforeAll(async () => {
    webview = await createTestWebView();
    await waitForMapLoaded(webview, 15000);
  }, 45000);

  afterAll(async () => {
    if (webview) await webview.close();
  });

  test("Binary raster layer can be toggled on", async () => {
    // Trigger raster checkbox
    await webview.evaluate(`(() => {
      const chk = document.getElementById("chk-raster");
      if (chk) {
        chk.click();
      }
    })()`);

    await waitForCondition(webview, `Boolean(window.__MAP__.getLayer("raster-layer"))`, 25000);
    const hasRaster = await webview.evaluate(`Boolean(window.__MAP__.getLayer("raster-layer"))`);
    expect(hasRaster).toBe(true);
  });

  test("Wind streamline canvas is mounted to map container", async () => {
    // Trigger wind checkbox
    await webview.evaluate(`(() => {
      const chk = document.getElementById("chk-wind");
      if (chk) {
        chk.click();
      }
    })()`);

    const hasStreamCanvas = await webview.evaluate(`Boolean(document.querySelector(".streamline-canvas"))`);
    expect(hasStreamCanvas).toBe(true);
  });
});
