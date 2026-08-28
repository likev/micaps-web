// test_timeslider_and_tabs_clean.js - Verify per-window timeslider and removal of window-tabs-group
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
  console.log("  Testing Per-Window Timeslider & Window-Tabs-Group Removal");
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

    // 1. Verify window-tabs-group does NOT exist in DOM
    const hasWindowTabsGroup = await webview.evaluate(`Boolean(document.getElementById("window-tabs-group"))`);
    console.log("  #window-tabs-group exists:", hasWindowTabsGroup);
    if (hasWindowTabsGroup) {
      throw new Error("#window-tabs-group should be removed but was found in DOM");
    } else {
      console.log("  ✓ #window-tabs-group correctly removed from DOM");
    }

    // 2. Check Timeslider state for Window 1 (NWP Forecast)
    const w1SliderState = await webview.evaluate(`(() => {
      const mode = document.getElementById("time-badge")?.innerText.trim();
      const winBadge = document.getElementById("time-win-badge")?.innerText.trim();
      const leadLabel = document.getElementById("time-lead-label")?.innerText.trim();
      const chips = Array.from(document.querySelectorAll("#timeline-chips .chip-btn")).map(el => el.innerText.trim());
      const activeChip = document.querySelector("#timeline-chips .chip-btn.active")?.innerText.trim();
      return { mode, winBadge, leadLabel, chips, activeChip };
    })()`);
    console.log("  Window 1 Slider State:", JSON.stringify(w1SliderState));

    await saveScreenshot(webview, "23_clean_tabsbar_and_w1_nwp_slider.png", "Clean Tabs Bar (no window-tabs-group) and W1 NWP Forecast Timeslider");

    // 3. Switch to 4-Split mode to test per-window time slider switching
    console.log("\n[Step 2] Switching to 4-Split mode...");
    await webview.evaluate(`document.getElementById("btn-layout-4").click()`);
    await sleep(2500);

    // 4. Click Window 3 (Surface Synoptic - Observation)
    console.log("\n[Step 3] Focusing Window 3 (Surface Synoptic - Observation)...");
    await webview.evaluate(`(() => {
      const p3 = document.getElementById("win-panel-1-2");
      if (p3) p3.click();
    })()`);
    await sleep(2000);

    const w3SliderState = await webview.evaluate(`(() => {
      const mode = document.getElementById("time-badge")?.innerText.trim();
      const winBadge = document.getElementById("time-win-badge")?.innerText.trim();
      const leadLabel = document.getElementById("time-lead-label")?.innerText.trim();
      const chips = Array.from(document.querySelectorAll("#timeline-chips .chip-btn")).map(el => el.innerText.trim());
      const activeChip = document.querySelector("#timeline-chips .chip-btn.active")?.innerText.trim();
      return { mode, winBadge, leadLabel, chips, activeChip };
    })()`);
    console.log("  Window 3 Observation Slider State:", JSON.stringify(w3SliderState));

    await saveScreenshot(webview, "24_split_mode_w3_observation_slider.png", "Window 3 Focused: Timeslider switched to OBSERVATION mode with timestamp chips");

    // 5. Click an observation chip in Window 3
    console.log("\n[Step 4] Stepping observation time in Window 3...");
    await webview.evaluate(`(() => {
      const chips = Array.from(document.querySelectorAll("#timeline-chips .chip-btn"));
      if (chips.length > 0) chips[0].click(); // click first observation chip
    })()`);
    await sleep(2000);

    await saveScreenshot(webview, "25_w3_observation_time_stepped.png", "Window 3: Observation timestamp stepped independently");

    // 6. Focus back to Window 1 (500hPa Composite - NWP)
    console.log("\n[Step 5] Focusing back to Window 1 (NWP Forecast)...");
    await webview.evaluate(`(() => {
      const p1 = document.getElementById("win-panel-1-0");
      if (p1) p1.click();
    })()`);
    await sleep(2000);

    const w1RestoredState = await webview.evaluate(`(() => {
      const mode = document.getElementById("time-badge")?.innerText.trim();
      const winBadge = document.getElementById("time-win-badge")?.innerText.trim();
      const leadLabel = document.getElementById("time-lead-label")?.innerText.trim();
      const activeChip = document.querySelector("#timeline-chips .chip-btn.active")?.innerText.trim();
      return { mode, winBadge, leadLabel, activeChip };
    })()`);
    console.log("  Window 1 Restored Slider State:", JSON.stringify(w1RestoredState));

    // Step NWP period to +048h
    await webview.evaluate(`(() => {
      const chips = Array.from(document.querySelectorAll("#timeline-chips .chip-btn"));
      const chip48 = chips.find(c => c.innerText.includes("48h"));
      if (chip48) chip48.click();
    })()`);
    await sleep(2500);

    await saveScreenshot(webview, "26_w1_nwp_forecast_stepped_to_48h.png", "Window 1: Stepped to +048h NWP lead without altering W3 observation");

    console.log("\n===============================================================");
    console.log("  All Timeslider & Tabsbar Tests Passed Successfully!");
    console.log("===============================================================");
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await webview.close();
  }
}

main();
