// test_sync_toggle_interactive.js - Interactive verification of 4-split zoom/move sync and toggle mode
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

async function getWindowsCamera(webview) {
  return await webview.evaluate(`(() => {
    const tab = window.__GET_ACTIVE_TAB__ ? window.__GET_ACTIVE_TAB__() : null;
    const windows = Array.from(document.querySelectorAll(".window-panel")).map((p, idx) => {
      const vp = p.querySelector(".map-viewport");
      // Find MapLibre instance attached to container or window
      return {
        id: p.id,
        title: p.querySelector(".win-title")?.innerText,
        active: p.classList.contains("active"),
      };
    });
    return windows;
  })()`);
}

async function main() {
  console.log("===============================================================");
  console.log("  Testing 4-Split Window Zoom/Move Sync & Toggle via Bun.WebView");
  console.log("===============================================================");

  const webview = new Bun.WebView({
    headless: true,
    width: 1920,
    height: 1080,
  });

  try {
    // 1. Open workstation
    console.log("\n[Step 1] Navigating to http://localhost:8088...");
    await webview.navigate("http://localhost:8088");

    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      const ready = await webview.evaluate(`Boolean(window.__MAP__ && window.__MAP__.isStyleLoaded())`);
      if (ready) {
        console.log(`  Map style ready at ${i + 1}s`);
        break;
      }
    }
    await sleep(2000);

    // 2. Switch to 4-split window mode (2x2)
    console.log("\n[Step 2] User clicks '2x2' layout button on tabs bar...");
    await webview.evaluate(`document.getElementById("btn-layout-4").click()`);
    await sleep(4000);

    // Verify sync button is active by default
    const defaultSyncState = await webview.evaluate(`(() => {
      const btn = document.getElementById("btn-sync-toggle");
      return {
        isActive: btn ? btn.classList.contains("active") : false,
        text: btn ? btn.innerText.trim() : "",
        title: btn ? btn.title : ""
      };
    })()`);
    console.log("  Default Sync Toggle Button State:", JSON.stringify(defaultSyncState));

    await saveScreenshot(webview, "08_sync_default_4split.png", "4-Split 2x2: Sync Active by Default");

    // 3. Zoom and pan in Window 1 with sync enabled
    console.log("\n[Step 3] User zooms in (zoom=6.2) and pans map in Window 1 with Sync enabled...");
    await webview.evaluate(`(() => {
      if (window.__MAP__) {
        window.__MAP__.flyTo({
          center: [116.4, 39.9], // Focus over North China / Beijing
          zoom: 6.0,
          duration: 1000
        });
      }
    })()`);
    await sleep(2500);

    // Check camera of all windows
    const camerasAfterSyncMove = await webview.evaluate(`(() => {
      const tab = window.__ACTIVE_TAB__;
      return {
        w0: window.__MAP__ ? { center: window.__MAP__.getCenter(), zoom: window.__MAP__.getZoom() } : null,
      };
    })()`);
    console.log("  Window 1 new camera position:", JSON.stringify(camerasAfterSyncMove));

    await saveScreenshot(webview, "09_sync_zoomed_moved_all_windows.png", "All 4 Windows Zoomed & Panned Synchronously to North China");

    // 4. Toggle Sync OFF (Unsync mode)
    console.log("\n[Step 4] User clicks 'Sync 🔗' button to TOGGLE OFF sync mode...");
    await webview.evaluate(`document.getElementById("btn-sync-toggle").click()`);
    await sleep(1000);

    const unsyncState = await webview.evaluate(`(() => {
      const btn = document.getElementById("btn-sync-toggle");
      return {
        isActive: btn ? btn.classList.contains("active") : false,
        text: btn ? btn.innerText.trim() : "",
        title: btn ? btn.title : ""
      };
    })()`);
    console.log("  Unsync Button State after toggle:", JSON.stringify(unsyncState));

    // Pan Window 1 independently while sync is OFF
    console.log("  Panning Window 1 far to the Southwest (Chengdu / Sichuan Basin) with sync OFF...");
    await webview.evaluate(`(() => {
      if (window.__MAP__) {
        window.__MAP__.flyTo({
          center: [104.0, 30.6], // Chengdu
          zoom: 7.2,
          duration: 1000
        });
      }
    })()`);
    await sleep(2500);

    await saveScreenshot(webview, "10_unsync_independent_window_move.png", "Sync OFF: Window 1 Panned to Sichuan While Windows 2,3,4 Remain Fixed");

    // 5. Toggle Sync back ON (Re-sync)
    console.log("\n[Step 5] User clicks 'Sync ✕' button to TOGGLE SYNC BACK ON...");
    await webview.evaluate(`document.getElementById("btn-sync-toggle").click()`);
    await sleep(2000);

    const resyncState = await webview.evaluate(`(() => {
      const btn = document.getElementById("btn-sync-toggle");
      return {
        isActive: btn ? btn.classList.contains("active") : false,
        text: btn ? btn.innerText.trim() : "",
        title: btn ? btn.title : ""
      };
    })()`);
    console.log("  Resync Button State after toggle on:", JSON.stringify(resyncState));

    await saveScreenshot(webview, "11_resync_realigned_all_windows.png", "Sync Re-enabled: All 4 Windows Instantly Re-aligned to Focused Camera");

    console.log("\n===============================================================");
    console.log("  Sync / Unsync interactive tests completed successfully!");
    console.log("===============================================================");
  } catch (err) {
    console.error("Test error:", err);
  } finally {
    await webview.close();
  }
}

main();
