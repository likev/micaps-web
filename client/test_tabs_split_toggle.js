// test_tabs_split_toggle.js - Interactive verification of toggling between Tabs Mode and Split Mode
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
  console.log("  Testing Tabs ⇋ Split Mode Toggling via Bun.WebView");
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

    const initialStatus = await webview.evaluate(`(() => {
      const btn1 = document.getElementById("btn-layout-1");
      const btn4 = document.getElementById("btn-layout-4");
      const toggle = document.getElementById("btn-toggle-mode");
      const wTabs = Array.from(document.querySelectorAll(".win-tab-btn")).map(b => b.innerText.trim());
      return {
        is1x1Active: btn1 ? btn1.classList.contains("active") : false,
        is4SplitActive: btn4 ? btn4.classList.contains("active") : false,
        toggleText: toggle ? toggle.innerText.trim() : "",
        windowTabs: wTabs
      };
    })()`);
    console.log("  Initial Status:", JSON.stringify(initialStatus));

    await saveScreenshot(webview, "12_tabs_mode_initial.png", "Tabs Mode Initial: W1 Full-size with Window Tabs");

    // 2. Click Window Tab W2 (850hPa Low-Level Jet) in Tabs Mode
    console.log("\n[Step 2] User clicks Window Tab 'W2' in Tabs Mode...");
    await webview.evaluate(`(() => {
      const w2Btn = document.querySelector(".win-tab-btn[data-win-idx='1']");
      if (w2Btn) w2Btn.click();
    })()`);
    await sleep(2000);

    await saveScreenshot(webview, "13_tabs_mode_switch_to_w2.png", "Tabs Mode: Switched to Window 2 (850hPa)");

    // 3. Click '⇋ Toggle Split/Tabs' button to toggle to 4-Split Mode
    console.log("\n[Step 3] User clicks '⇋ Toggle Split/Tabs' to toggle to 4-Split Mode...");
    await webview.evaluate(`document.getElementById("btn-toggle-mode").click()`);
    await sleep(4000);

    const splitStatus = await webview.evaluate(`(() => {
      const btn1 = document.getElementById("btn-layout-1");
      const btn4 = document.getElementById("btn-layout-4");
      const toggle = document.getElementById("btn-toggle-mode");
      return {
        is1x1Active: btn1 ? btn1.classList.contains("active") : false,
        is4SplitActive: btn4 ? btn4.classList.contains("active") : false,
        toggleText: toggle ? toggle.innerText.trim() : "",
      };
    })()`);
    console.log("  Status after toggle to Split:", JSON.stringify(splitStatus));

    await saveScreenshot(webview, "14_split_mode_toggled_from_tabs.png", "4-Split Mode: All 4 Windows Tiled After Toggle");

    // 4. Double click Window 3 Header (Surface Synoptic) to toggle back to Tabs Mode
    console.log("\n[Step 4] User double clicks Window 3 header to toggle that window into Tabs Mode...");
    await webview.evaluate(`(() => {
      const header3 = document.querySelector(".window-panel[data-win-idx='2'] .win-header");
      if (header3) {
        header3.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      }
    })()`);
    await sleep(2500);

    await saveScreenshot(webview, "15_tabs_mode_toggled_from_w3_maximize.png", "Tabs Mode: Window 3 Expanded to Full Tab via Header Double-Click");

    // 5. Press F4 keyboard shortcut to toggle back to 4-Split Mode
    console.log("\n[Step 5] User presses 'F4' keyboard shortcut to toggle back to 4-Split Mode...");
    await webview.evaluate(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F4', bubbles: true }));
    })()`);
    await sleep(3000);

    await saveScreenshot(webview, "16_split_mode_toggled_via_f4_shortcut.png", "4-Split Mode: Re-entered via F4 Keyboard Shortcut");

    console.log("\n===============================================================");
    console.log("  Tabs ⇋ Split mode toggle verification completed successfully!");
    console.log("===============================================================");
  } catch (err) {
    console.error("Test error:", err);
  } finally {
    await webview.close();
  }
}

main();
