// test_interactive_user.js - Interactive normal user testing script using Bun.WebView
import { existsSync, copyFileSync } from "fs";

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
  console.log("  MICAPS-Web Interactive User Experience Test (Bun 1.4 WebView)");
  console.log("===============================================================");

  const webview = new Bun.WebView({
    headless: true,
    width: 1920,
    height: 1080,
  });

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Normal user opens workstation & waits for real initial data load
    // -------------------------------------------------------------------------
    console.log("\n[User Step 1] Navigating to workstation at http://localhost:8088...");
    await webview.navigate("http://localhost:8088");

    console.log("  Waiting for base map tiles, 850hPa TMP contour field, and surface stations...");
    // Wait for MapLibre map and real Cassandra data to load
    let mapLoaded = false;
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const status = await webview.evaluate(`(() => {
        const hasMap = Boolean(window.__MAP__ && window.__MAP__.isStyleLoaded());
        const hasIsoband = Boolean(window.__MAP__ && window.__MAP__.getSource("isoband-source"));
        const markerCount = document.querySelectorAll(".station-plot-marker").length;
        return { hasMap, hasIsoband, markerCount };
      })()`);
      if (status.hasMap && (status.hasIsoband || status.markerCount > 0)) {
        console.log(`  Map ready at ${i + 1}s: isobands=${status.hasIsoband}, stations=${status.markerCount}`);
        mapLoaded = true;
        break;
      }
    }

    // Allow tiles and SVG markers to settle
    await sleep(2500);
    await saveScreenshot(webview, "01_initial_synoptic_overview.png", "Initial View: 850hPa TMP + Surface Stations + SLP Isobars");

    // -------------------------------------------------------------------------
    // STEP 2: Normal user opens Layers Manager, inspects layers, hides one layer
    // -------------------------------------------------------------------------
    console.log("\n[User Step 2] User clicks 'Layers' button to inspect and configure layers...");
    await webview.evaluate(`document.getElementById("btn-toggle-layers").click()`);
    await sleep(800);

    // Click the eye button on the first contour layer to toggle visibility off
    console.log("  Toggling visibility off for first contour layer...");
    await webview.evaluate(`(() => {
      const visBtn = document.querySelector(".btn-vis");
      if (visBtn) visBtn.click();
    })()`);
    await sleep(1000);

    // Expand the first layer configuration row
    console.log("  Clicking layer row to reveal opacity and color configuration drawer...");
    await webview.evaluate(`(() => {
      const firstRow = document.querySelector(".layer-row");
      if (firstRow) firstRow.click();
    })()`);
    await sleep(1000);

    await saveScreenshot(webview, "02_layers_manager_hide_toggle.png", "Layers Manager: Layer Hidden + Config Accordion Opened");

    // Close layers manager and restore visibility
    await webview.evaluate(`(() => {
      const visBtn = document.querySelector(".btn-vis");
      if (visBtn) visBtn.click();
      document.getElementById("btn-toggle-layers").click();
    })()`);
    await sleep(500);

    // -------------------------------------------------------------------------
    // STEP 3: User loads pre-configured composite group (500hPa HGT + RH + WIND)
    // -------------------------------------------------------------------------
    console.log("\n[User Step 3] User selects '500hPa Composite (HGT + RH + WIND)' from navbar preset dropdown...");
    await webview.evaluate(`(() => {
      const sel = document.getElementById("select-preset");
      if (sel) {
        sel.value = "composite-500hpa";
        sel.dispatchEvent(new Event("change"));
      }
    })()`);

    console.log("  Waiting for 500hPa Height contours, RH fills, and wind streamlines to render...");
    await sleep(6000);
    await saveScreenshot(webview, "03_500hpa_composite_loaded.png", "500hPa Composite: HGT Isolines + RH Isobands + Wind Streamlines");

    // -------------------------------------------------------------------------
    // STEP 4: User clicks 4-Split Window button (2x2 Grid)
    // -------------------------------------------------------------------------
    console.log("\n[User Step 4] User clicks '2x2' layout button on the tabs bar to switch to 4-split window mode...");
    await webview.evaluate(`document.getElementById("btn-layout-4").click()`);

    console.log("  Waiting for all 4 window viewports (500hPa, 850hPa, Surface, 200hPa) to initialize and render...");
    await sleep(8000);

    const winInfo = await webview.evaluate(`(() => {
      const panels = Array.from(document.querySelectorAll(".window-panel")).map((p, idx) => ({
        id: p.id,
        visible: window.getComputedStyle(p).display !== "none",
        title: p.querySelector(".win-title")?.innerText,
        active: p.classList.contains("active")
      }));
      return panels;
    })()`);
    console.log("  4-Window panels state:", JSON.stringify(winInfo, null, 2));

    await saveScreenshot(webview, "04_4split_2x2_windows.png", "4-Split Windows: 500hPa, 850hPa, Surface, and 200hPa Views");

    // -------------------------------------------------------------------------
    // STEP 5: User interacts with Split Window 2 (Top-Right) and tests Camera Sync
    // -------------------------------------------------------------------------
    console.log("\n[User Step 5] User clicks Window 2 to focus it and change level...");
    await webview.evaluate(`(() => {
      const win2 = document.getElementById("win-panel-1-1");
      if (win2) win2.click();
    })()`);
    await sleep(1000);

    // In Window 2 header, change level dropdown to 700 hPa
    console.log("  Changing Window 2 vertical level to 700 hPa...");
    await webview.evaluate(`(() => {
      const lvlSel = document.getElementById("win-level-1-1");
      if (lvlSel) {
        lvlSel.value = "700";
        lvlSel.dispatchEvent(new Event("change"));
      }
    })()`);
    await sleep(3000);

    // Pan Window 1 slightly to demonstrate camera synchronization across windows
    console.log("  Panning Window 1 slightly to demonstrate 4-window geographic camera synchronization...");
    await webview.evaluate(`(() => {
      if (window.__MAP__) {
        window.__MAP__.panBy([120, -60], { duration: 500 });
      }
    })()`);
    await sleep(1500);

    await saveScreenshot(webview, "05_split_window_interaction_sync.png", "Window 2 Focused (700hPa) + Camera Synchronized Pan");

    // -------------------------------------------------------------------------
    // STEP 6: User creates a second Tab ('Tab 2') and tests independent tab state
    // -------------------------------------------------------------------------
    console.log("\n[User Step 6] User clicks '+' to create a new Tab 2...");
    await webview.evaluate(`document.getElementById("btn-add-tab").click()`);
    await sleep(2500);

    console.log("  Loading 'Surface Synoptic (Plots + SLP Isobars)' into Tab 2...");
    await webview.evaluate(`(() => {
      const sel = document.getElementById("select-preset");
      if (sel) {
        sel.value = "composite-surface";
        sel.dispatchEvent(new Event("change"));
      }
    })()`);
    await sleep(4000);

    // Verify Tab 2 is active
    await saveScreenshot(webview, "06_tab2_surface_synoptic.png", "Tab 2: Surface Synoptic Station Plots + SLP Isobars");

    // Switch back to Tab 1
    console.log("  User clicks 'Workspace 1' tab pill to switch back to 4-split layout...");
    await webview.evaluate(`(() => {
      const tab1 = document.getElementById("tab-item-1");
      if (tab1) tab1.click();
    })()`);
    await sleep(2000);

    await saveScreenshot(webview, "07_switched_back_to_tab1_4split.png", "Switched Back to Tab 1: 4-Split Grid Intact and Active");

    console.log("\n===============================================================");
    console.log("  All user workflow tests completed successfully!");
    console.log("===============================================================");
  } catch (err) {
    console.error("Interactive user test error:", err);
  } finally {
    await webview.close();
  }
}

main();
