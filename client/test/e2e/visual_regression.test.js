// visual_regression.test.js - Headless screenshot capture & visual verification
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { createTestWebView, waitForCondition, waitForMapLoaded } from "./helpers/testEnv.js";

describe("Visual Regression and Screenshot Capture", () => {
  let webview;

  beforeAll(async () => {
    webview = await createTestWebView();
    await waitForMapLoaded(webview, 15000);
    await waitForCondition(webview, `Boolean(window.__MAP__.getSource("isoband-source"))`, 20000);
  }, 45000);

  afterAll(async () => {
    if (webview) await webview.close();
  });

  test("Capture full-viewport workstation screenshot via Bun.WebView", async () => {
    const screenshotBlob = await webview.screenshot();
    expect(screenshotBlob).toBeDefined();
    expect(screenshotBlob.size).toBeGreaterThan(15000); // Verify rendered canvas contains visual data

    // Save screenshot to disk
    await Bun.write("./test/screenshots/workstation-screenshot.png", screenshotBlob);
    console.log(`[VisualTest] Screenshot captured successfully: ${screenshotBlob.size} bytes`);
  });
});
