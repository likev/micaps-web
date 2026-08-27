import { createTestWebView, waitForMapLoaded, waitForCondition } from "./client/test/e2e/helpers/testEnv.js";

async function run() {
  const webview = await createTestWebView("http://localhost:8088");
  const poll = async (expr, label) => {
    let ok = await waitForCondition(webview, expr, 8000);
    console.log(`${label}: ${ok}`);
    return ok;
  };
  // Wait for tabs bar and map
  await waitForMapLoaded(webview, 15000).then(v=>console.log("map loaded:",v));
  await new Promise(r=>setTimeout(r,1500));

  // Check tabs-bar exists
  let tabsBar = await webview.evaluate(`!!document.getElementById("tabs-bar")`);
  console.log("tabs-bar exists:", tabsBar);
  let tabCount = await webview.evaluate(`document.querySelectorAll(".tab-item").length`);
  console.log("initial tab count:", tabCount);
  let activeTab = await webview.evaluate(`document.querySelector(".tab-item.active")?.id`);
  console.log("active tab:", activeTab);
  let workspaceCount = await webview.evaluate(`document.querySelectorAll(".tab-workspace").length`);
  console.log("workspace count:", workspaceCount);
  let activeWs = await webview.evaluate(`document.querySelector(".tab-workspace.active")?.id`);
  console.log("active workspace:", activeWs);
  let grid = await webview.evaluate(`document.getElementById("windows-grid-1")?.className`);
  console.log("grid class tab1:", grid);
  let winPanels = await webview.evaluate(`document.querySelectorAll("#windows-grid-1 .window-panel").length`);
  console.log("win panels in tab1:", winPanels);
  let win0active = await webview.evaluate(`document.getElementById("win-panel-1-0")?.className`);
  console.log("win-panel-1-0 class:", win0active);
  let win1hidden = await webview.evaluate(`getComputedStyle(document.getElementById("win-panel-1-1")).display`);
  console.log("win-panel-1-1 display (should be none in 1x1):", win1hidden);
  let mapContainer = await webview.evaluate(`!!document.getElementById("map-container")`);
  console.log("map-container exists:", mapContainer);
  let viewport1 = await webview.evaluate(`!!document.getElementById("map-viewport-1-1")`);
  console.log("map-viewport-1-1 exists:", viewport1);
  let logDump = await webview.evaluate(`window.__LOGS__.slice(-30).join("\\n")`);
  console.log("LOGS:\n"+logDump);

  // Test 1: Click 2x2 layout
  console.log("\n--- CLICK 2x2 ---");
  await webview.evaluate(`document.getElementById("btn-layout-4").click()`);
  await new Promise(r=>setTimeout(r,1500));
  let gridAfter = await webview.evaluate(`document.getElementById("windows-grid-1").className`);
  console.log("grid class after 2x2:", gridAfter);
  let displays = await webview.evaluate(`Array.from(document.querySelectorAll("#windows-grid-1 .window-panel")).map(p=>getComputedStyle(p).display)`);
  console.log("displays after 2x2:", displays);
  let mapCount = await webview.evaluate(`(() => {
    let maps = 0;
    try { if (window.__MAP__) maps++; } catch(e){}
    // Count map instances via .mapboxgl-map
    maps = document.querySelectorAll(".mapboxgl-map").length;
    return maps;
  })()`);
  console.log("mapboxgl-map count after 2x2:", mapCount);
  let winMaps = await webview.evaluate(`(() => {
    const tab = document.querySelectorAll(".tab-workspace");
    return document.querySelectorAll(".map-viewport, #map-container").length;
  })()`);
  console.log("viewport count:", winMaps);
  // Check if 4 maps initialized (look at windows)
  let winInfos = await webview.evaluate(`(() => {
    // Access internal tabs via evaluate script that checks window.__TABS__ ? But we don't expose. Check DOM for max button exists
    return Array.from(document.querySelectorAll(".win-header")).map(h=>h.id);
  })()`);
  console.log("win headers:", winInfos);
  let has4Viewports = await webview.evaluate(`["map-container","map-viewport-1-1","map-viewport-1-2","map-viewport-1-3"].map(id=>!!document.getElementById(id))`);
  console.log("all 4 viewports exist:", has4Viewports);

  // Check focus switch
  console.log("\n--- CLICK WINDOW 2 ---");
  await webview.evaluate(`document.getElementById("win-panel-1-1").click()`);
  await new Promise(r=>setTimeout(r,500));
  let activeAfterClick = await webview.evaluate(`document.querySelector("#windows-grid-1 .window-panel.active")?.id`);
  console.log("active panel after click win1:", activeAfterClick);
  let activeWinId = await webview.evaluate(`document.querySelector("#windows-grid-1 .window-panel.active .win-title")?.innerText`);
  console.log("active win title:", activeWinId);

  // Test add tab
  console.log("\n--- ADD TAB ---");
  await webview.evaluate(`document.getElementById("btn-add-tab").click()`);
  await new Promise(r=>setTimeout(r,1500));
  let tabCount2 = await webview.evaluate(`document.querySelectorAll(".tab-item").length`);
  console.log("tab count after add:", tabCount2);
  let activeTab2 = await webview.evaluate(`document.querySelector(".tab-item.active")?.id`);
  console.log("active tab after add:", activeTab2);
  let activeWs2 = await webview.evaluate(`document.querySelector(".tab-workspace.active")?.id`);
  console.log("active workspace after add:", activeWs2);
  let map2exists = await webview.evaluate(`!!document.getElementById("map-viewport-2-0")`);
  console.log("map-viewport-2-0 exists:", map2exists);
  let grid2 = await webview.evaluate(`document.getElementById("windows-grid-2")?.className`);
  console.log("grid2 class:", grid2);

  // Test switch back to tab1
  console.log("\n--- SWITCH BACK TO TAB1 ---");
  await webview.evaluate(`document.getElementById("tab-item-1").click()`);
  await new Promise(r=>setTimeout(r,800));
  let activeTab3 = await webview.evaluate(`document.querySelector(".tab-item.active")?.id`);
  console.log("active tab after switch back:", activeTab3);
  let activeWs3 = await webview.evaluate(`document.querySelector(".tab-workspace.active")?.id`);
  console.log("active workspace after switch back:", activeWs3);

  // Test sync toggle
  console.log("\n--- SYNC TOGGLE ---");
  let syncBefore = await webview.evaluate(`document.getElementById("btn-sync-toggle").classList.contains("active")`);
  console.log("sync active before:", syncBefore);
  await webview.evaluate(`document.getElementById("btn-sync-toggle").click()`);
  await new Promise(r=>setTimeout(r,300));
  let syncAfter = await webview.evaluate(`document.getElementById("btn-sync-toggle").classList.contains("active")`);
  console.log("sync active after:", syncAfter);

  // Check for duplicate IDs
  console.log("\n--- DUPLICATE ID CHECK ---");
  let dupCheck = await webview.evaluate(`(() => {
    const all = Array.from(document.querySelectorAll("[id]"));
    const seen = {};
    const dups = [];
    for (const el of all) {
      if (seen[el.id]) dups.push(el.id);
      seen[el.id]=true;
    }
    return {total: all.length, dups, countBySuffix: Object.keys(seen).length};
  })()`);
  console.log("dup check:", JSON.stringify(dupCheck));

  // Check per-window preset change
  console.log("\n--- PER-WINDOW PRESET CHANGE ---");
  let presetBefore = await webview.evaluate(`document.getElementById("win-preset-1-1")?.value`);
  console.log("win-preset-1-1 before:", presetBefore);
  await webview.evaluate(`(() => {
    const sel = document.getElementById("win-preset-1-1");
    if (sel) { sel.value="composite-200hpa"; sel.dispatchEvent(new Event("change")); }
  })()`);
  await new Promise(r=>setTimeout(r,500));
  let presetAfter = await webview.evaluate(`document.getElementById("win-preset-1-1")?.value`);
  console.log("win-preset-1-1 after:", presetAfter);
  let titleAfter = await webview.evaluate(`document.getElementById("win-title-1-1")?.innerText`);
  console.log("win-title-1-1 after:", titleAfter);

  // Final logs
  let finalLogs = await webview.evaluate(`window.__LOGS__.slice(-50).join("\\n")`);
  console.log("\nFINAL LOGS:\n"+finalLogs);

  // Weather loaded?
  let weatherLoaded = await webview.evaluate(`Boolean(window.__WEATHER_FIELD_LOADED__)`);
  console.log("WEATHER_FIELD_LOADED:", weatherLoaded);
  let isoband = await webview.evaluate(`Boolean(window.__MAP__ && window.__MAP__.getSource("isoband-source"))`);
  console.log("isoband-source exists:", isoband);

  await webview.close();
  console.log("DONE");
}
run().catch(e=>{console.error(e); process.exit(1)});
