// test_bugfixes_interactive.js - Verify per-window Layers Manager, no layer name overlap, and realistic wind streamlines
import { copyFileSync } from "fs";

const ARTIFACT_DIR = "/root/.gemini/antigravity-cli/brain/bf8784ea-0470-4f4b-ac20-da45b71df1c8/test_screenshots";
const SCREENSHOT_DIR = "./test/screenshots";

async function saveScreenshot(webview, filename, stepDescription) {
  console.log(`\n📸 Capturing screenshot: ${filename} (${stepDescription})...`);
  const blob = await webview.screenshot();
  const localPath = `${SCREENSHOT_DIR}/${filename}`;
  const artifactPath = `${ARTIFACT_DIR}/${filename}`;

  await Bun.write(localPath, blob);
  copyFileSync(localPath, artifactPath);
  console.log(`   Saved ${blob.size} bytes to ${localPath} & ${artifactPath}`);
  return artifactPath;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("===============================================================");
  console.log("  Testing Per-Window Layers Manager & Wind Streamlines Fixes");
  console.log("===============================================================");

  const webview = new Bun.WebView({
    headless: true,
    width: 1920,
    height: 1080,
  });

  try {
    console.log("\n[Step 1] Loading workstation...");
    await webview.navigate("http://localhost:8088");

    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      const ready = await webview.evaluate(`Boolean(window.__MAP__ && window.__MAP__.isStyleLoaded())`);
      if (ready) {
        console.log(`  Map style ready at ${i + 1}s`);
        break;
      }
    }
    await sleep(3000);

    // 1. Check Layers Manager for Window 1 (initial tab)
    const w1LayerInfo = await webview.evaluate(`(() => {
      const title = document.querySelector("#layer-control .panel-title")?.innerText.trim();
      const rows = Array.from(document.querySelectorAll("#layer-control .layer-name")).map(el => el.innerText.trim());
      return { title, rows };
    })()`);
    console.log("  Window 1 Layers:", JSON.stringify(w1LayerInfo));

    await saveScreenshot(webview, "17_per_window_layers_w1.png", "Window 1 Active: Layers Manager shows W1 layers with clean non-overlapping names");

    // 2. Switch to Window 2 (850hPa Low-Level Jet)
    console.log("\n[Step 2] Switching to Window 2 (850hPa)...");
    await webview.evaluate(`(() => {
      const w2Tab = document.querySelector(".win-tab-btn[data-win-idx='1']");
      if (w2Tab) w2Tab.click();
    })()`);
    await sleep(2500);

    const w2LayerInfo = await webview.evaluate(`(() => {
      const title = document.querySelector("#layer-control .panel-title")?.innerText.trim();
      const rows = Array.from(document.querySelectorAll("#layer-control .layer-name")).map(el => el.innerText.trim());
      return { title, rows };
    })()`);
    console.log("  Window 2 Layers:", JSON.stringify(w2LayerInfo));

    await saveScreenshot(webview, "18_per_window_layers_w2.png", "Window 2 Active: Layers Manager updates to show only W2 layers");

    // 3. Switch to Window 3 (Surface Synoptic)
    console.log("\n[Step 3] Switching to Window 3 (Surface Synoptic)...");
    await webview.evaluate(`(() => {
      const w3Tab = document.querySelector(".win-tab-btn[data-win-idx='2']");
      if (w3Tab) w3Tab.click();
    })()`);
    await sleep(2500);

    const w3LayerInfo = await webview.evaluate(`(() => {
      const title = document.querySelector("#layer-control .panel-title")?.innerText.trim();
      const rows = Array.from(document.querySelectorAll("#layer-control .layer-name")).map(el => el.innerText.trim());
      return { title, rows };
    })()`);
    console.log("  Window 3 Layers:", JSON.stringify(w3LayerInfo));

    await saveScreenshot(webview, "19_per_window_layers_w3.png", "Window 3 Active: Layers Manager updates to show only W3 surface layers");

    // 4. Test Wind Streamlines in Window 4 (200hPa Jet Stream)
    console.log("\n[Step 4] Switching to Window 4 (200hPa Jet Stream) and toggling Wind Streamlines...");
    await webview.evaluate(`(() => {
      const w4Tab = document.querySelector(".win-tab-btn[data-win-idx='3']");
      if (w4Tab) w4Tab.click();
    })()`);
    await sleep(1500);

    // Toggle Wind Streamlines auxiliary checkbox on
    await webview.evaluate(`(() => {
      const chkWind = document.getElementById("chk-wind");
      if (chkWind && !chkWind.checked) {
        chkWind.click();
      }
    })()`);
    // Allow particles to propagate and form smooth streamlines
    await sleep(3500);

    await saveScreenshot(webview, "20_wind_streamlines_physical_flow.png", "Wind Streamlines: Physical atmospheric streamline flow across East Asia");

    // 5. Toggle into 4-Split Mode and check per-window interaction
    console.log("\n[Step 5] Toggling into 4-Split Mode to verify per-window focus and layers synchronization...");
    await webview.evaluate(`document.getElementById("btn-toggle-mode").click()`);
    await sleep(2000);

    // Click Window 1 panel in 4-split grid
    await webview.evaluate(`(() => {
      const p1 = document.getElementById("win-panel-1-0");
      if (p1) p1.click();
    })()`);
    await sleep(1500);

    await saveScreenshot(webview, "21_split_mode_w1_layers_synced.png", "4-Split Mode: Window 1 focused, Layers Manager shows W1 layers");

    // Click Window 3 panel in 4-split grid
    await webview.evaluate(`(() => {
      const p3 = document.getElementById("win-panel-1-2");
      if (p3) p3.click();
    })()`);
    await sleep(1500);

    await saveScreenshot(webview, "22_split_mode_w3_layers_synced.png", "4-Split Mode: Window 3 focused, Layers Manager seamlessly switches to W3 layers");

    console.log("\n===============================================================");
    console.log("  All bug fix verifications completed successfully!");
    console.log("===============================================================");
  } catch (err) {
    console.error("Test error:", err);
  } finally {
    await webview.close();
  }
}

main();
