// ui_controls.test.js - Workstation UI interactivity tests
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { createTestWebView, waitForMapLoaded } from "./helpers/testEnv.js";

describe("Workstation UI Controls Verification", () => {
  let webview;

  beforeAll(async () => {
    webview = await createTestWebView();
    await waitForMapLoaded(webview, 15000);
  }, 45000);

  afterAll(async () => {
    if (webview) await webview.close();
  });

  test("Catalog button opens and closes catalog drawer", async () => {
    // Click catalog button to open
    await webview.evaluate(`document.getElementById("btn-toggle-catalog").click()`);
    let isHidden = await webview.evaluate(`document.getElementById("catalog-drawer").classList.contains("hidden")`);
    expect(isHidden).toBe(false);

    // Click catalog button to close
    await webview.evaluate(`document.getElementById("btn-toggle-catalog").click()`);
    isHidden = await webview.evaluate(`document.getElementById("catalog-drawer").classList.contains("hidden")`);
    expect(isHidden).toBe(true);
  });

  test("Time slider play button toggles playback state", async () => {
    const playBtn = await webview.evaluate(`document.getElementById("btn-play").innerText`);
    expect(playBtn).toBe("▶");

    // Click play
    await webview.evaluate(`document.getElementById("btn-play").click()`);
    const pauseBtn = await webview.evaluate(`document.getElementById("btn-play").innerText`);
    expect(pauseBtn).toBe("❚❚");

    // Click pause again
    await webview.evaluate(`document.getElementById("btn-play").click()`);
    const stoppedBtn = await webview.evaluate(`document.getElementById("btn-play").innerText`);
    expect(stoppedBtn).toBe("▶");
  });

  test("Tooltip displays meteorological properties when invoked", async () => {
    await webview.evaluate(`(() => {
      window.__SHOW_TOOLTIP__([116.4, 39.9], {
        station_id: 54511,
        name: "Beijing",
        temperature: 26.5,
        dewpoint: 17.0,
        slp: 1012.4,
        wind_speed: 4.5,
        wind_dir: 180,
        cloud_cover: 4
      });
    })()`);

    const tooltipText = await webview.evaluate(`document.getElementById("tooltip").innerText`);
    expect(tooltipText).toContain("54511");
    expect(tooltipText).toContain("26.5 °C");
    expect(tooltipText).toContain("1012.4 hPa");
  });
});
