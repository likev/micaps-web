# Verification & Analysis: Split-Mode Layer Hide & Disappearance Bugs (`layer-hide-review2.md`)

## Executive Summary & Verification Verdict

| Reported Bug | Verdict | Key Reason |
|---|---|---|
| **Bug 1**: Toggle from focused tab-win to auto-alloc split time mode hides origin tab-win's 500 hPa Dew-Point Depression (Sounding Analysis) | ❌ **NOT FULLY FIXED** | While [`1ca047f`](file:///root/downloads/micaps-web) fixed cross-map raster URL collision, [`App.svelte:745-747`](file:///root/downloads/micaps-web/client/src/App.svelte#L745-L747) still unconditionally calls `removeRasterLayer(map)` before checking `shouldSkipMapReload`. Because reload is skipped for `baseWin`, its Dew-Point Depression raster layer is wiped and never re-rendered. |
| **Bug 2**: In split windows, using keyboard shortcuts Left/Right causes 500 hPa Height and 500 hPa Temperature contour lines to disappear | ❌ **NOT FULLY FIXED** | While [`15a1077`](file:///root/downloads/micaps-web) added snapshot exact-id matching and guarded degenerate isoline blanking, [`11a1d6c`](file:///root/downloads/micaps-web) stripped `HGT` and `TMP` from `config.json`. When DTD is added, `groupDerived` in [`derivedContours.js:19`](file:///root/downloads/micaps-web/client/src/services/derivedContours.js#L19) only contains DTD; because `groupDerived.length > 0`, the fallback branch rendering `HGT` and `TMP` is completely bypassed. |

---

## 1. Commits Analyzed

| SHA | Title | Relevance to Reported Bugs |
|---|---|---|
| [`1ca047f`](file:///root/downloads/micaps-web) | `fix(split): raster isolation, sweep coalescing, early release` | Scoped raster sequence counters and Blob URLs per map instance via `WeakMap`. Fixed cross-map raster revocation, but left the pre-teardown wipe in `applyAutoAllocationModeToTab`. |
| [`15a1077`](file:///root/downloads/micaps-web) | `fix(split-obs): stale snapshots, pre-teardown blanking, degenerate wipe, rain effect loop` | Resolved stale snapshot cross-level inheritance (`snapExact`), guarded degenerate isolines from blanking in `contourMapSync.js`, and removed pre-teardown from `handleTimeChange`. **Omitted** removing pre-teardown from `applyAutoAllocationModeToTab`. |
| [`11a1d6c`](file:///root/downloads/micaps-web) | `chore(config): restructure default presets, align tests` | Stripped pre-declared derived layers (`HGT`, `TMP`, `DTD`) from `composite-upperair-500` in `config.json`, triggering the branch-starvation bug in `derivedContours.js`. |
| [`9d27b8f`](file:///root/downloads/micaps-web) | `refactor(prefetch): share winKey resolution between schedule and cancel` | Unified prefetch timer keys. Unrelated to layer visibility. |

---

## 2. Bug 1: Origin Tab-Win 500 hPa Dew-Point Depression Unintended Hide

### Scenario & Steps to Reproduce
1. In single window mode (`1x1`), load **500 hPa Upper-Air Sounding** (`composite-upperair-500`).
2. Add **Dew-Point Depression (DTD)** (which renders as a raster overlay via [`rasterLayer.js`](file:///root/downloads/micaps-web/client/src/layers/rasterLayer.js)).
3. Toggle layout from `1x1` to split mode with auto-allocation mode set to `"time"` (e.g. `1x2` or `2x2`).
4. **Observed Failure:** The origin focused tab-win's (`win0`) 500 hPa Dew-Point Depression layer disappears from the map canvas, while the layer store still reports it as visible.

### What Recent Commits Fixed
In [`1ca047f`](file:///root/downloads/micaps-web), `rasterLayer.js` was patched to isolate `activeObjectUrls` and `rasterRenderSeq` per Map instance using `WeakMap<map, Map<srcId, ...>>` ([`rasterLayer.js:16-38`](file:///root/downloads/micaps-web/client/src/layers/rasterLayer.js#L16-L38)). Prior to that fix, when sibling split windows rendered `contour-sounding-dtd-500`, their sequence bumps discarded `win0`'s render or revoked `win0`'s object URL.

In [`15a1077`](file:///root/downloads/micaps-web), the author recognized that pre-load preamble calls:
```javascript
stopWindAnimation(map);
removeGridWindBarbs(map);
removeRasterLayer(map);
```
were blanking layers prematurely. They removed them from `handleTimeChange` ([`App.svelte:1216, 1272`](file:///root/downloads/micaps-web/client/src/App.svelte#L1216-L1272)) and moved teardown inside [`loadObservationProduct`](file:///root/downloads/micaps-web/client/src/services/derivedContours.js#L360-L362) after response arrival.

### Root Cause of the Lingering Bug
The developer **missed** removing the exact same preamble from [`applyAutoAllocationModeToTab`](file:///root/downloads/micaps-web/client/src/App.svelte#L550) in [`client/src/App.svelte`](file:///root/downloads/micaps-web/client/src/App.svelte):

```javascript
// client/src/App.svelte:642-650
const shouldSkipMapReload = Boolean(w === baseWin && !isInitial && prevBaseState && w.activeGroup?.id === prevBaseState.groupId && (
  (mode === "level" && w.level === prevBaseState.level) ||
  (mode === "model" && w.model === prevBaseState.model) ||
  (mode === "step" && w.period === prevBaseState.period) ||
  (mode === "time" && (
    (w.isObservation && w.obsTime === prevBaseState.obsTime) ||
    (!w.isObservation && w.forecastCycle === prevBaseState.forecastCycle && w.period === prevBaseState.period)
  ))
));
```
For `baseWin` (the origin tab-win), `shouldSkipMapReload` is evaluated as **`true`** because its preset group, level, and observation time have not changed.

However, immediately following in lines 744–768 (and lines 694–718 for `mode === "step"`):
```javascript
// client/src/App.svelte:742-768
} else if (mode === "time") {
  const tl = getOrCreateTimeline(w.id);
  if (w.isObservation) {
    stopWindAnimation(map);
    removeGridWindBarbs(map);
    removeRasterLayer(map); // <-- UNCONDITIONALLY WIPES RASTER ON baseWin's MAP!
    ...
    if (w.activeGroup && !shouldSkipMapReload) {
      await loadPresetGroup(map, w.activeGroup, w.period, w.level, w, false, loadSeq); // <-- SKIPPED FOR baseWin!
    }
  }
}
```

1. `removeRasterLayer(map)` is executed on `baseWin`'s map, removing `contour-sounding-dtd-500-raster-layer` and source.
2. `shouldSkipMapReload` is `true`, so `loadPresetGroup` is **skipped**.
3. `baseWin`'s map is never reloaded; the raster layer is wiped and permanently lost on the origin focused tab-win.

---

## 3. Bug 2: Left/Right Shortcuts Cause 500 hPa Height & Temperature Contours to Disappear

### Scenario & Steps to Reproduce
1. In split mode (e.g. `1x2` or `2x2` in auto-allocation `"time"` or `"step"` mode) with **500 hPa Upper-Air Sounding** and DTD active.
2. Press keyboard shortcuts `Left` (`ArrowLeft`) or `Right` (`ArrowRight`) to navigate timesteps across windows.
3. **Observed Failure:** In the auto-allocated split windows, **500 hPa Height (Sounding Analysis)** and **500 hPa Temperature (Sounding Analysis)** contour lines disappear or fail to render.

### What Recent Commits Fixed
1. **Commit [`15a1077`](file:///root/downloads/micaps-web)**:
   - Scoped snapshot matching in [`derivedContours.js:32-37`](file:///root/downloads/micaps-web/client/src/services/derivedContours.js#L32-L37) to require exact layer ID (`snapExact`). Previously, a hidden snapshot from another level (e.g. 700 hPa) matching `model === "UPPER_AIR" && element === elem` forced `isVisible = false` onto 500 hPa layers.
   - Guarded isoline blanking in [`contourMapSync.js:110-112`](file:///root/downloads/micaps-web/client/src/layers/contour/contourMapSync.js#L110-L112) with `if (hasIsolineFeatures || (!visibleIsoline && curFeatures.length > 0))`, preventing degenerate/empty recomputes on flat data fields from wiping existing isolines.
   - Removed the pre-teardown wipe from `handleTimeChange` ([`App.svelte:1216, 1272`](file:///root/downloads/micaps-web/client/src/App.svelte#L1216-L1272)).

### Root Cause of the Lingering Bug
The defect arises from the interplay between commit [`11a1d6c`](file:///root/downloads/micaps-web) and the rendering dispatch in [`client/src/services/derivedContours.js`](file:///root/downloads/micaps-web/client/src/services/derivedContours.js#L17-L157):

1. **Commit [`11a1d6c`](file:///root/downloads/micaps-web)** removed pre-declared derived layers (`HGT`, `TMP`, `DTD`) from [`config.json`](file:///root/downloads/micaps-web/client/config.json#L442-L478) under `composite-upperair-500`, leaving only `upperair-obs-500`.
2. On fresh load, [`renderSoundingDerivedContoursForStation`](file:///root/downloads/micaps-web/client/src/services/derivedContours.js#L17-L157) sees `groupDerived.length === 0`, takes the `else` branch, and generates default `HGT` and `TMP` via [`analyzeAndRenderSoundingContours`](file:///root/downloads/micaps-web/client/src/services/derivedContours.js#L153). These layers are added to the window's `layerStore`, **not** to `activeGroup.layers`.
3. When the user adds Dew-Point Depression (DTD) via [`handleAddContourAction`](file:///root/downloads/micaps-web/client/src/ui/layers/derivedContourActions.js#L185-L203), it calls:
   ```javascript
   upsertDerivedLayerToPreset(activeGroup.id, derivedEntry);
   syncDerivedLayerToWindowPreset(activeGroup, derivedEntry);
   ```
   This inserts `contour-sounding-dtd-500` into `activeGroup.layers`. Now `activeGroup.layers` contains `[upperair-obs-500, contour-sounding-dtd-500]`, but **not** `HGT` or `TMP`.
4. When the window is split into auto-allocated windows, `activeGroup` is cloned to each split window ([`tabsCore.js:435-441`](file:///root/downloads/micaps-web/client/src/lib/stores/tabsCore.js#L435-L441)).
5. During keyboard shortcuts `Left` / `Right`, [`App.svelte:1182-1226`](file:///root/downloads/micaps-web/client/src/App.svelte#L1182-L1226) calls `loadPresetGroup` on all visible split windows.
6. [`loadObservationProduct`](file:///root/downloads/micaps-web/client/src/services/derivedContours.js#L403) invokes `renderSoundingDerivedContoursForStation`:
   ```javascript
   // client/src/services/derivedContours.js:19-22
   const groupDerived = activeGroup?.layers?.filter(
     (l) => l.type === "contour" && l.model === "UPPER_AIR" && Boolean(l.derivedFrom)
   ) || [];

   if (groupDerived.length > 0) {
     for (const cLayer of groupDerived) {
       // Loops ONLY over DTD (the only derived layer in groupDerived)!
     }
   } else {
     // COMPLETELY BYPASSED because groupDerived has 1 element!
     // This else block was the ONLY place that invoked analyzeAndRenderSoundingContours(map, stations, curLevel, {}, win)!
   }
   ```
7. Because `groupDerived` contains only `DTD`, **`HGT` and `TMP` are completely omitted from rendering**.
8. In auto-allocated split windows, `500 hPa Height (Sounding Analysis)` and `500 hPa Temperature (Sounding Analysis)` contour lines disappear or are never rendered upon time-stepping.

---

## 4. Required Fixes

### Fix 1: Eliminate Pre-Teardown Blanking in `applyAutoAllocationModeToTab`
In [`client/src/App.svelte`](file:///root/downloads/micaps-web/client/src/App.svelte), delete lines 695–697 and lines 745–747. Teardown of wind, barbs, and raster is already handled safely inside [`loadObservationProduct`](file:///root/downloads/micaps-web/client/src/services/derivedContours.js#L360-L362) after the data arrives:

```diff
--- a/client/src/App.svelte
+++ b/client/src/App.svelte
@@ -693,9 +693,6 @@
       } else if (mode === "step") {
         const tl = getOrCreateTimeline(w.id);
         if (w.isObservation) {
-          stopWindAnimation(map);
-          removeGridWindBarbs(map);
-          removeRasterLayer(map);
           if (baseWin?._obsTimeline) {
             w._obsTimeline = { ...baseWin._obsTimeline, file: w.obsTime, stepLength: w.stepLength };
           }
@@ -743,9 +740,6 @@
       } else if (mode === "time") {
         const tl = getOrCreateTimeline(w.id);
         if (w.isObservation) {
-          stopWindAnimation(map);
-          removeGridWindBarbs(map);
-          removeRasterLayer(map);
           if (baseWin?._obsTimeline) {
             w._obsTimeline = { ...baseWin._obsTimeline, file: w.obsTime, stepLength: w.stepLength };
           }
```

### Fix 2: Ensure Core Sounding Contours (HGT & TMP) Are Not Starved by Dynamic Derived Layers
In [`client/src/services/derivedContours.js`](file:///root/downloads/micaps-web/client/src/services/derivedContours.js#L17-L157), ensure core sounding contours (`HGT` and `TMP`) are always rendered for sounding observations if they are not explicitly present in `groupDerived`:

```diff
--- a/client/src/services/derivedContours.js
+++ b/client/src/services/derivedContours.js
@@ -18,6 +18,17 @@ export async function renderSoundingDerivedContoursForStation(map, stations, cur
   if (!curLevel || activeGroup?.id === "composite-tlogp" || activeGroup?.hasLevel === false) return;
   const groupDerived = activeGroup?.layers?.filter((l) => l.type === "contour" && l.model === "UPPER_AIR" && Boolean(l.derivedFrom)) || [];
   if (groupDerived.length > 0) {
+    const hasHgt = groupDerived.some((l) => (l.element || "").toUpperCase() === "HGT");
+    const hasTmp = groupDerived.some((l) => (l.element || "").toUpperCase() === "TMP");
+    if (!hasHgt || !hasTmp) {
+      // Base HGT/TMP contours were removed from preset config in 11a1d6c;
+      // ensure core contours are not starved when dynamic layers (e.g. DTD) exist in activeGroup
+      analyzeAndRenderSoundingContours(map, stations, curLevel, {
+        skipHgt: hasHgt,
+        skipTmp: hasTmp,
+      }, win);
+    }
     for (const cLayer of groupDerived) {
       try {
```
and support `skipHgt` / `skipTmp` in [`analyzeAndRenderSoundingContours`](file:///root/downloads/micaps-web/client/src/layers/soundingAnalysis.js#L228-L240), or ensure default preset layers for `composite-upperair-500` declare `HGT`, `TMP`, and `DTD`.

---

## 5. Conclusion
Recent commits made meaningful progress on underlying memory isolation and contour source synchronization, but **the specific failure modes described in the user request still reproduce**. The two targeted fixes outlined above directly resolve both root causes without regressing the recent isolation and memory improvements.
