# Regression Attention: Recurring Bugs Fixed >= 2 Times in MICAPS-Web

This document catalogs recurring bugs and regressions identified across the full commit history of the **MICAPS-Web** repository (184 commits from initial commit `3dbe621` to HEAD `8672a81`). These defects were repeatedly reintroduced, partially patched, or broken by subsequent refactorings (notably the Svelte 5 runes migration, timeline rewrites, and canvas/Web Mercator re-renders).

Each section details the symptom, recurring commit lineage, technical root cause, concrete code evidence, and architectural invariants required to prevent future regressions.

---

## Table of Contents

1. [Legend Reversion, Desynchronization, and Loss Across Viewport Events](#1-legend-reversion-desynchronization-and-loss-across-viewport-events)
2. [Timeline Stepping: Step-Length Resets, Synoptic Locking, and Playback Loop Self-Pause](#2-timeline-stepping-step-length-resets-synoptic-locking-and-playback-loop-self-pause)
3. [UI State Inconsistencies: Window Titles, Tab Drag-Reorder, Navbar Sync, and Preset Isolation](#3-ui-state-inconsistencies-window-titles-tab-drag-reorder-navbar-sync-and-preset-isolation)
4. [Split-Screen Multi-Window Map Camera Synchronization](#4-split-screen-multi-window-map-camera-synchronization)
5. [Contour & Isoband Fill Disappearance, Extent Clipping, and Zombie Resurrection on Pan/Zoom](#5-contour--isoband-fill-disappearance-extent-clipping-and-zombie-resurrection-on-panzoom)
6. [Palette Reset and Selection Loss Across Timeline Chips and Viewport Movement](#6-palette-reset-and-selection-loss-across-timeline-chips-and-viewport-movement)
7. [Floating Profile Panels (T-LogP, Time-Height, Hovmoller) Lifecycle and Cross-Window Leakage](#7-floating-profile-panels-t-logp-time-height-hovmoller-lifecycle-and-cross-window-leakage)
8. [Wind Barb Standards, 110-Degree Angles, Pennant Flag Thresholds, and Polar Coordinate Decoding](#8-wind-barb-standards-110-degree-angles-pennant-flag-thresholds-and-polar-coordinate-decoding)
9. [Station Data Parsing: Sea Level Pressure (SLP) vs. Station Elevation Conflict and Tooltip Desync](#9-station-data-parsing-sea-level-pressure-slp-vs-station-elevation-conflict-and-tooltip-desync)
10. [Svelte 5 Runes Reactive Proxy Incompatibilities (State Mutation, Clone Errors, Reference Identity)](#10-svelte-5-runes-reactive-proxy-incompatibilities-state-mutation-clone-errors-reference-identity)
11. [Vertical Level Stepping Layer State Loss, Race Conditions, and Desync](#11-vertical-level-stepping-layer-state-loss-race-conditions-and-desync)
12. [Station Plot Spatial Binning, Canvas Over-Clearing, Antimeridian Wrapping, and Symbol QC](#12-station-plot-spatial-binning-canvas-over-clearing-antimeridian-wrapping-and-symbol-qc)

---

## 1. Legend Reversion, Desynchronization, and Loss Across Viewport Events

- **Fix Frequency:** Fixed **8 times** (`0751d1f`, `91ffe78`, `efe0126`, `a2360b6`, `2776ce0`, `b46d4bc`, `46550e0`, `c93ff12`, `8672a81`)
- **Key Files Touched:**
  - `client/src/ui/legend.js`
  - `client/src/lib/stores/legendCore.js#L78-L97` (fixed scale) and `L115-L143` (`updateLegend`, `removeLegend`)
  - `client/src/components/Legend.svelte#L9-L18`
  - `client/src/ui/layers/legendSync.js#L4-L26`
  - `client/src/services/contourReRender.js#L322-L331`

### Commit History

| Commit | Date | Summary |
|---|---|---|
| `91ffe78` | 2026-09-02 | Adapt legend ticks dynamically to loaded data range (`zMin`/`zMax`). |
| `efe0126` | 2026-09-04 | Fix legend CSS overflow, [Wn] window prefixing, and missing raster overlay re-triggering. |
| `a2360b6` | 2026-09-07 | Fix legend cleanup on fill/line toggles (unchecking left stale legends); fix string vs. object window ID in `updateLegend`/`removeLegend`. |
| `2776ce0` | 2026-09-07 | Gate colorbar legend visibility: lines-only layers hide legends, shading shows legends. |
| `b46d4bc` | 2026-09-10 | Preserve isoband features on pan/zoom and maintain mutual exclusivity legend sync. |
| `46550e0` | 2026-09-22 | Add `notifyLegendChanged` cross-module event bridge and fallback gradient to prevent blank bars. |
| `c93ff12` | 2026-09-22 | Fix legend single-renderer ownership race (`setSvelteLegendOwner`); lock fixed-scale ticks (RH, TMP, WIND) to palette scale rather than transient data stats. |
| `8672a81` | 2026-09-27 | Fix legend reversion on map pan/zoom and timeline stepping; enforce uppercase normalization for element keys; support WIND fallback in `syncLegendForLayer`. |

### Technical Root Cause

1. **Dual Renderer Collision:** When migrating to Svelte 5 (`39cd91a`), both `client/src/ui/legend.js` (legacy direct DOM writer) and `client/src/components/Legend.svelte` (reactive store subscriber) wrote to `#legend-panel`. Direct DOM writes wiped out Svelte reconciliation ~100ms after load. Resolved in `c93ff12` with `setSvelteLegendOwner(true)` to silence legacy DOM writes.
2. **Fixed-Physical-Scale vs. Data Stats Ticks:** In `91ffe78`, legend ticks were adapted dynamically to `zMin` / `zMax` of the loaded data grid. For fields with absolute physical bounds (RH 0–100%, TMP, WIND), supersaturated grids (e.g., RH = -1% to 115%) printed out-of-scale tick labels outside the gradient bar. Fixed in `c93ff12` by locking `fixedScale` sets (`RH`, `TMP`, `TD`, `DTD`, `WIND`, `RAIN`, `RAIN6`) to palette scales (`legendCore.js:78-97`).
3. **Map Move/Zoom Reversion:** In `contourReRender.js`, `armContourReRender` debounced grid recalculations on `moveend`. During re-render, `liveLayer.colormap` was used. If a loader had initialized `liveLayer.colormap = "DTD"` instead of `palette:contour-sounding-dtd-500`, or if the custom `palettePath` was not re-asserted, the legend reverted to default colormap stops. In addition, viewport moves did not re-assert `updateLegend`, causing legends to vanish after panning. Fixed in `8672a81`.
4. **Key Case & Element Name Mismatches:** Legend lookups were case-sensitive (`"slp"` vs `"SLP"`), and `syncLegendForLayer` expected `layer.element`. For wind layers, `layer.element` was often undefined (only `layer.type === "wind"` existed), causing `syncLegendForLayer` to abort early without showing a legend. Fixed in `8672a81`.

### Concrete Evidence

In `client/src/ui/layers/legendSync.js` (`8672a81`):
```js
export function syncLegendForLayer(layer, winObj, isVisible = true) {
  if (!layer) return;
  const element = layer.element || (layer.type === "wind" ? "WIND" : null);
  if (!element) return;
  if (layer.type !== "contour" && layer.type !== "wind") return;
  const hasShading = isVisible && (Boolean(layer.config?.showFill) || Boolean(layer.config?.showRaster));
  if (hasShading) {
    const colormap = (layer.colormap && String(layer.colormap).startsWith("palette:"))
      ? layer.colormap
      : (layer.config?.palettePath ? `palette:${layer.id}` : (layer.colormap || element));
    const min = layer.gridData?.stats?.min;
    const max = layer.gridData?.stats?.max;
    updateLegend(element, colormap, min, max, winObj);
  } else {
    removeLegend(element, winObj);
  }
}
```

In `client/src/lib/stores/legendCore.js#L78-L97` (`c93ff12`):
```js
const fixedScale = new Set(["RH", "TMP", "TD", "DTD", "WIND", "RAIN", "RAIN6"]);
if (!fixedScale.has(element) && zMin !== undefined && zMax !== undefined && zMax > zMin) {
  // calculate dynamic ticks
} else {
  // calculate static palette stops
}
```

---

## 2. Timeline Stepping: Step-Length Resets, Synoptic Locking, and Playback Loop Self-Pause

- **Fix Frequency:** Fixed **8 times** (`7fadf9e`, `8ab0bc4`, `a8273f2`, `00eb1d0`, `1845b14`, `abb0d3c`, `c0d22fc`, `8743cba`)
- **Key Files Touched:**
  - `client/src/ui/timeSlider.js`
  - `client/src/components/TimeSlider.svelte`
  - `client/src/main.js`
  - `client/src/services/levelController.js#L128-L135`
  - `client/src/services/presetLoader.js#L264-L275`
  - `client/src/services/prefetchService.js#L18-L41`
  - `client/src/utils/timelineSync.js`

### Commit History

| Commit | Date | Summary |
|---|---|---|
| `7fadf9e` | 2026-09-02 | Fix dynamic forecast init cycles and prevent chip-btn / step-length desync. |
| `8ab0bc4` | 2026-09-02 | Fix step-length reset on preset reload (`win.stepLength || 6` hardcoded override). |
| `a8273f2` | 2026-09-10 | Enforce 08:00 and 20:00 synoptic sounding locking across initial load, catalog, and timeline sync. |
| `00eb1d0` | 2026-09-10 | Expand observation timeline file history and align 12h synoptic step. |
| `1845b14` | 2026-09-10 | Cap observation chips to 10 and add 24h step for upper-air. |
| `abb0d3c` | 2026-09-15 | Fix Play-loop P0 self-pause (obs presets self-pausing after 1 tick due to re-entrant `setTimelineMode`), interval leaks, and tick overlap pile-ups. |
| `c0d22fc` | 2026-09-22 | Fix left/right prefetch using frozen legacy global timeline instead of live per-window active timeline. |
| `8743cba` | 2026-09-26 | Preserve selected observation time on upper-air vertical level stepping (`forceLatest: false`). |

### Technical Root Cause

1. **P0 Playback Self-Pause on Observation Presets:** In `main.js`, on each playback tick for observation groups, `loadPresetGroup` called `syncObservationTimeline`. In `timelineSync.js`, syncing the observation timeline unconditionally invoked `setTimelineMode("obs", ...)`, which in turn invoked `pausePlayback()`. As a result, clicking `▶` on any surface or upper-air preset stepped exactly one frame and stopped. Fixed in `abb0d3c` by guarding with `!isTimeStep`.
2. **Step Length Hardcoding:** `loadPresetGroup` and bootstrap routines repeatedly passed `{ stepLength: 6 }` or ignored `win.stepLength`, causing the step-length dropdown to reset to 6h on every preset load or reload. Fixed in `8ab0bc4`.
3. **Upper-Air Level Step Resetting Time:** When stepping levels in upper-air sounding (e.g. 500 hPa to 700 hPa via ArrowUp/Down), `changeVerticalLevel` and `loadPresetGroup` called `syncObservationTimeline(obsPath, null, ..., { forceLatest: true })`. This forced `file = latestFile`, discarding the user's selected historical sounding time. Fixed in `8743cba` by passing `win?.obsTime || null` and `{ forceLatest: false }`.
4. **Prefetch Direction Desynchronization:** `prefetchService.js` read from a legacy global `timelineState` singleton. Following the Svelte 5 refactor, that singleton was never updated on window focus or timeline steps. Left/Right prefetching fetched stale periods until `setLiveTimelineResolver` was connected to live per-window state in `c0d22fc`.

### Concrete Evidence

In `client/src/services/levelController.js#L128-L135` (`8743cba`):
```js
// Before (bug: forced latest file on every level step):
const file = await syncObservationTimeline(obsPath, null, winTitle, win, { forceLatest: true });

// After (fix: preserves selected observation time):
const file = await syncObservationTimeline(obsPath, win?.obsTime || null, winTitle, win, { forceLatest: false });
if (win) {
  win.obsTime = file;
  if (getActiveWindow() === win) appState.set("obsTime", file);
  updateWindowTitle(win, `${targetLevel} hPa Upper-Air Sounding`);
}
```

In `client/src/services/presetLoader.js#L267-L270`:
```js
const levelChanged = !isTimeStep && Boolean(group.isObservation) && level !== null && (!win?._obsTimeline || win?._obsTimelinePath !== obsPath);
if (!file || freshObsLoad || !win?._obsTimeline || levelChanged) {
  file = await syncObservationTimeline(obsPath, freshObsLoad ? null : (win?.obsTime || file), winTitle, win, { forceLatest: freshObsLoad });
```

---

## 3. UI State Inconsistencies: Window Titles, Tab Drag-Reorder, Navbar Sync, and Preset Isolation

- **Fix Frequency:** Fixed **8 times** (`d6330b6`, `d2ec40c`, `e5a75b5`, `a2360b6`, `3e6b1e8`, `f34550a`, `b5f0588`, `49dc1a2`)
- **Key Files Touched:**
  - `client/src/ui/tabs/windowTitles.js#L48-L85`
  - `client/src/components/TabsBar.svelte#L58-L135`
  - `client/src/components/WindowPanel.svelte#L13-L25`
  - `client/src/components/NavBar.svelte`
  - `client/src/lib/services/appWorkflow.js#L130-L155`
  - `client/src/services/presetLoader.js`

### Commit History

| Commit | Date | Summary |
|---|---|---|
| `d6330b6` | 2026-08-29 | Decouple level select from auto-load; reset level on preset change. |
| `d2ec40c` | 2026-09-10 | Do not modify window title or active group on `select-preset` before data is actually loaded via "Load Data". |
| `e5a75b5` | 2026-09-04 | Display observation/valid time in window title; fix station filter rule layout. |
| `a2360b6` | 2026-09-07 | Fix level-stepping title rewrite: `700hPa Upper-Air Sounding (UPPER_AIR/PLOT/500)` had mismatched path suffix. |
| `3e6b1e8` | 2026-09-18 | Isolate `win.activeGroup` deep clone to prevent removing a layer in one window from mutating shared preset definitions. |
| `f34550a` | 2026-09-21 | Refactor global navbar preset/level to drive the focused window; drop per-window header selects that caused dual-state divergence. |
| `b5f0588` | 2026-09-22 | Fix tab-title / win-title desync on drag-reorder; strip baked `Wn:` prefixes from stored titles. |
| `49dc1a2` | 2026-09-22 | Drop legacy direct DOM writes to `tab-label-${win.winIdx}` that corrupted adjacent tabs after drag-reorder; add insert slot indicator. |

### Technical Root Cause

1. **Title Prefix Accumulation on Drag Reorder:** When tabs were dragged to reorder, positional prefixes (`W1: `, `W2: `) were baked directly into `win.title` and `win.baseTitle`. Moving window 1 to position 2 resulted in titles such as `W2: W1: Surface Observations`. Fixed in `b5f0588` by stripping `^W\d+:\s*` at render time and storing only raw titles.
2. **Direct DOM Writes Corrupting Positional IDs:** Legacy `updateWindowTitle` targeted `document.getElementById("tab-label-" + win.winIdx)`. Svelte 5 gave tabs stable UID keys. When windows were reordered or closed, `win.winIdx` pointed to a *different* tab's element, causing time-step updates on one window to overwrite the title text of an adjacent tab. Fixed in `49dc1a2` by completely dropping imperative DOM writes in favor of reactive bindings.
3. **Shared Preset Group Mutation:** Presets loaded from `config.json` were originally shared by object reference. Calling `removeLayer` or toggling layer visibility mutated `win.activeGroup.layers`. Opening another window with the same preset inherited the deleted layers. Fixed in `3e6b1e8` and `d263895` by creating isolated clones on load via `JSON.parse(JSON.stringify(group))` (`appWorkflow.js:134`).
4. **Premature UI Selection Commits:** Selecting an item in the navbar dropdown originally mutated `win.title` and `win.activeGroup` immediately, even if the user never clicked "Load Data" or if data loading failed. Fixed in `d2ec40c` by deferring state commitment until the network request begins.

### Concrete Evidence

In `client/src/ui/tabs/windowTitles.js#L73-L85` (`49dc1a2`):
```js
export function updateWindowTitle(win, text = null, isModelAlloc = null) {
  if (!win || typeof document === "undefined") return;
  // State-only: pill labels (TabsBar), window headers (WindowPanel), the
  // layers badge, and the legend all derive reactively from win.title /
  // win.winIdx, including on first mount. Direct DOM writes are banned here:
  // Svelte renders pill labels with stable per-window ids
  // (`tab-label-${uid}`), while win.winIdx is positional — after any
  // drag-reorder or close, `tab-label-${win.winIdx}` addresses a DIFFERENT
  // pill, so the old imperative write corrupted other tabs' titles.
  computeFullWindowTitle(win, text, isModelAlloc);
}
```

In `client/src/lib/services/appWorkflow.js#L130-L135` (`d263895`):
```js
// Use JSON round-trip to safely copy plain data from the group,
// since `group` may be a Svelte 5 reactive $state proxy (or contain
// non-serializable references like MapLibre map instances or DOM nodes)
// that would cause structuredClone to throw a DataCloneError.
const groupCopy = JSON.parse(JSON.stringify(group));
win.activeGroup = groupCopy;
```

---

## 4. Split-Screen Multi-Window Map Camera Synchronization

- **Fix Frequency:** Fixed **6 times** (`e1db0ce`, `91ffe78`, `2adb814`, `b9326fc`, `a5339ad`, `3ab0969`)
- **Key Files Touched:**
  - `client/src/ui/tabs/windowMaps.js#L17-L75`
  - `client/src/lib/stores/tabsCore.js`
  - `client/src/App.svelte`

### Commit History

| Commit | Date | Summary |
|---|---|---|
| `e1db0ce` | 2026-08-27 | Initial implementation of split-window camera synchronization with toggle sync/unsync. |
| `91ffe78` | 2026-09-02 | Replace global camera sync boolean with per-tab set `syncingTabs` to isolate multi-tab split modes. |
| `2adb814` | 2026-09-19 | Truthy `syncMap` guard, jump active window on map load, and fix split slot visibility. |
| `b9326fc` | 2026-09-21 | Restore split map camera sync following Svelte 5 runes migration. |
| `a5339ad` | 2026-09-22 | Fix map camera sync using stable `win.id` instead of proxy-fragile object identity (`===`). |
| `3ab0969` | 2026-09-22 | Fix split map sync via shared map registry and live tab resolvers under the forked reactive store topology. |

### Technical Root Cause

1. **Proxy Reference Inequality:** Svelte 5 wraps objects in `$state()` reactive proxies. `App.svelte` passed proxy objects to `registerWindowMapSync`, while `windowMaps.js` queried raw state in `tabsCore.js`. Code checking `if (otherWin !== win)` or `tab.windows.includes(win)` failed because `proxy !== rawObject`, causing `isWindowVisible` to return false and silently disabling camera synchronization (`a5339ad`).
2. **Store Fork Without Write-Through:** `App.svelte` modified `layout` and `syncMap` on local Svelte 5 reactive proxy objects. These modifications did not write through to the plain JS core store in `tabsCore.js`. `windowMaps.js` checked `coreState.tabs[0].layout`, which remained `"1x1"` forever. Fixed in `3ab0969` by adding live resolvers (`getTab`, `getMap`, `getVisible`) and a shared `mapInstances` registry.
3. **Split Slot Visibility & Map Load Jumps:** In `2adb814`, new maps created during layout switches failed to synchronize their initial viewport to the active window's camera until explicit jump calls were added to `map.on("load")`.

### Concrete Evidence

In `client/src/ui/tabs/windowMaps.js#L30-L43` (`a5339ad` and `3ab0969`):
```js
/**
 * ID-based visibility: never use reference equality (`includes`/`===`).
 * The tab object may be a Svelte 5 $state proxy while windows come from
 * another store copy — proxy !== raw under === even for the same win.id.
 */
function isVisibleById(tab, winId, getVisible) {
  if (!tab || winId === undefined || winId === null) return false;
  try {
    const visible = (getVisible || coreGetVisibleWindows)(tab);
    return Array.isArray(visible) && visible.some((w) => w && w.id === winId);
  } catch {
    return false;
  }
}
```

---

## 5. Contour & Isoband Fill Disappearance, Extent Clipping, and Zombie Resurrection on Pan/Zoom

- **Fix Frequency:** Fixed **6 times** (`b46d4bc`, `3e6b1e8`, `46550e0`, `175b8b1`, `3ab0969`, `8672a81`)
- **Key Files Touched:**
  - `client/src/services/contourReRender.js#L215-L275`
  - `client/src/layers/contour/contourMapSync.js#L95-L160`
  - `client/src/layers/contourLayer.js`
  - `client/src/utils/geometry/clip.js`

### Commit History

| Commit | Date | Summary |
|---|---|---|
| `b46d4bc` | 2026-09-10 | Preserve isoband features on pan/zoom re-rendering (`preserveIsobands: true`). |
| `3e6b1e8` | 2026-09-18 | Implement Cohen-Sutherland contour polygon clipping to prevent out-of-bounds bleed. |
| `46550e0` | 2026-09-22 | Fix RH contour-fill default enablement and resolve contour label readability. |
| `175b8b1` | 2026-09-22 | Expand-on-demand isoband fills on pan/zoom outside load-time bounding box. |
| `3ab0969` | 2026-09-22 | Prevent zombie contour resurrection on zoom after layer deletion (`disarmContourReRender`). |
| `8672a81` | 2026-09-27 | Re-assert custom XML palette and legend on pan/zoom re-render; fix wind raster gridData source. |

### Technical Root Cause

1. **Wiping Features on Viewport Movement:** When panning or zooming, `contourReRender.js` recalculated isolines within the new viewport. However, MapLibre GeoJSON sources were updated with isolines only, wiping out the filled polygon features (`isoband-source`) unless `preserveIsobands: true` was passed (`b46d4bc`).
2. **Zombie Resurrection After Deletion:** When a user deleted a contour layer via the `✕` button, the layer was removed from `layersCore.js`. However, `map.on("moveend")` and `map.on("zoomend")` event listeners in `contourReRender.js` remained registered. On the next map pan or zoom, the leaked callback re-fetched the cached grid data and re-added the source and layers back to MapLibre, "resurrecting" the deleted layer. Fixed in `3ab0969` with explicit `disarmContourReRender` and existence checks before adding layers.
3. **Extent Clipping:** Isoband generation was originally computed only for the initial visible bounding box. Panning into adjacent regions left unshaded white areas until expand-on-demand bounding box extensions were implemented in `175b8b1`.

### Concrete Evidence

In `client/src/services/contourReRender.js#L240-L248` (`3ab0969`):
```js
// Re-check after the await: the layer may have been ✕-deleted or
// the key disarmed while the palette was loading.
if (!reRenderHandlers.has(key)) return;
if (win && typeof getLayerById === "function") {
  let stillThere = null;
  try {
    stillThere = getLayerById(layer.id, win);
  } catch {
    stillThere = null;
  }
  if (!stillThere) return;
  liveLayer = stillThere;
```

---

## 6. Palette Reset and Selection Loss Across Timeline Chips and Viewport Movement

- **Fix Frequency:** Fixed **6 times** (`8ab0bc4`, `e7d3ee1`, `a9bd390`, `fa0207e`, `06c7232`, `8672a81`)
- **Key Files Touched:**
  - `client/src/utils/paletteLoader.js`
  - `client/src/utils/colormaps.js`
  - `client/src/ui/layers/configActions.js#L305-L316`
  - `client/src/services/contourReRender.js`
  - `client/src/services/weatherLoader.js`

### Commit History

| Commit | Date | Summary |
|---|---|---|
| `8ab0bc4` | 2026-09-02 | Fix palette dropdown loading and contour isoband updates. |
| `e7d3ee1` | 2026-09-02 | Eliminate dynamic import race condition in palette population; load palettes eagerly on drawer open. |
| `a9bd390` | 2026-09-07 | Preserve custom raster palette configuration across timeline chip clicks. |
| `fa0207e` | 2026-09-10 | Preserve custom raster palette on map pan/zoom. |
| `06c7232` | 2026-09-18 | Built-in default reset persists across chips (presence-based resolution). |
| `8672a81` | 2026-09-27 | Element-level palette filtering and custom palette key preservation in `addOrUpdateLayer` and re-render. |

### Technical Root Cause

1. **Re-render Loader Overwriting Custom Palettes:** When stepping timeline chips or panning the map, loader functions reconstructed layer descriptors using the default element name (e.g. `colormap: "TMP"` or `"DTD"`). `addOrUpdateLayer` merged properties, but because `colormap` was provided in the incoming payload, it overwrote the custom `palette:${layer.id}` key unless guarded.
2. **Built-in Default vs Custom Reset Loop:** In `06c7232`, resetting a layer to "Built-in default" set `palettePath = null`. On the next timeline chip change, fallback logic saw `!layer.config.palettePath` and re-applied preset defaults. Solved by explicitly setting `palettePath: ""` (empty string) to indicate intentional user reset.
3. **Dynamic Import Race:** In `e7d3ee1`, clicking the layer gear icon opened the drawer and dynamically imported XML palettes. If the user changed dropdowns before the import resolved, the select box reverted to the first item.

### Concrete Evidence

In `client/src/ui/layers/configActions.js#L310-L315` (`8672a81`):
```js
// Preserve custom palette key across timeline steps and viewport re-renders
if (layer.config?.palettePath && (!layer.colormap || !String(layer.colormap).startsWith("palette:"))) {
  layer.colormap = `palette:${layer.id}`;
}
```

---

## 7. Floating Profile Panels (T-LogP, Time-Height, Hovmoller) Lifecycle and Cross-Window Leakage

- **Fix Frequency:** Fixed **6 times** (`1256b13`, `3525b18`, `b612195`, `46550e0`, `c93ff12`, `b5f0588`)
- **Key Files Touched:**
  - `client/src/lib/services/profileVisibility.js#L95-L165`
  - `client/src/lib/stores/profilesCore.js`
  - `client/src/layers/tlogp/tlogpController.js`
  - `client/src/layers/timeheight/timeHeightController.js`
  - `client/src/components/WindowPanel.svelte`

### Commit History

| Commit | Date | Summary |
|---|---|---|
| `1256b13` | 2026-09-19 | Auto-toggle subwindows on window switch; hide timeslider for profile tabs. |
| `3525b18` | 2026-09-21 | Cross-window auto-toggle for resizable profile panels. |
| `b612195` | 2026-09-18 | Add layer config for T-LogP; eliminate 500hPa contour bleed into sounding diagram. |
| `46550e0` | 2026-09-22 | Fix profile panel auto-toggle broken during Svelte 5 refactor (`profileVisibility.js`). |
| `c93ff12` | 2026-09-22 | Move profile panel ownership to central `profilesRegistry`; fix close button race. |
| `b5f0588` | 2026-09-22 | Auto-hide floating profile panels when opening the Config Editor. |

### Technical Root Cause

1. **Lost Focus Hooks During Svelte 5 Refactor:** Legacy workstation code used imperative `onWindowFocus` callbacks in `tabWindowManager.js` to hide and show subwindow panels. When migrating to Svelte 5 components, this lifecycle hook was omitted, leaving open T-LogP and Time-Height diagrams floating over unrelated windows (`46550e0`).
2. **Controller DOM Ownership vs. Window Registry:** Controllers tracked panel open state via `controller.panel !== null`. If a user closed a panel in Window 1, switching to Window 2 and back checked `controller.isActive()`, which re-evaluated true because the layer definition still existed, causing closed panels to pop back open. Resolved in `c93ff12` by creating a declarative `profilesCore.js` store tracking explicit user open/close actions per window.
3. **500hPa Contour Bleed into T-LogP:** When switching from an upper-air preset to T-LogP, `win.level` remained `500`. The layer loader executed `loadUpperAirComposite` alongside T-LogP, causing 500 hPa contours to render over the sounding station map (`b612195`).

### Concrete Evidence

In `client/src/lib/services/profileVisibility.js#L95-L120` (`c93ff12`):
```js
export function syncProfilePanelsForWindow(win, map = null) {
  if (!win) {
    timeHeightController.hide();
    lineHeightController.hide();
    hovmollerController.hide();
    tlogpController.hide();
    return;
  }
  // Check declarative profile registry instead of DOM presence
  if (thLayer && hasPanel("timeheight", win)) {
    timeHeightController.show(targetMap, win);
  } else {
    timeHeightController.hide();
  }
}
```

---

## 8. Wind Barb Standards, 110-Degree Angles, Pennant Flag Thresholds, and Polar Coordinate Decoding

- **Fix Frequency:** Fixed **8 times** (`28ca503`, `1db146f`, `ac8f531`, `373fa4c`, `1f52ca3`, `665d533`, `7168b87`, `fa0207e`, `820ae09`)
- **Key Files Touched:**
  - `client/src/layers/wind/streamlines.js`
  - `client/src/layers/station/stationSymbols.js`
  - `client/src/utils/weatherSymbols.js`
  - `server/parser/grid_data.go`

### Commit History

| Commit | Date | Summary |
|---|---|---|
| `28ca503` | 2026-08-29 | Introduce 110-degree wind barb angle and configurable graticule. |
| `1db146f` | 2026-08-29 | Align wind barb rendering strictly to 110-degree angle, 20/4/2 m/s increments, and WMO indented 2 m/s half barb. |
| `ac8f531` | 2026-08-29 | Correct wind barb angle to 110-degree obtuse angle relative to inward staff. |
| `373fa4c` | 2026-08-29 | Fix windLayer north-to-south coordinate sampling and embed default WIND palette. |
| `1f52ca3` | 2026-08-29 | Decode vector grid as standard U/V and derive wind magnitude directly from vector components. |
| `665d533` | 2026-08-29 | Strictly decode Diamond 11 vector grids as U and V without heuristics. |
| `7168b87` | 2026-08-29 | Compute signed dLat and restore ECMWF_HR polar wind vector decoding. |
| `fa0207e` | 2026-09-10 | Restore 20 m/s wind barb pennant flags (fixing regression to 50 m/s WMO threshold). |
| `820ae09` | 2026-09-26 | Update calm wind circle radius and symbology across DPI scales. |

### Technical Root Cause

1. **CMA vs. WMO Wind Barb Metric Units:** Standard international WMO barbs represent knots (50 knot pennant, 10 knot full barb, 5 knot half barb). Chinese CMA / MICAPS standards operate in metric meters per second (m/s): **20 m/s pennant (triangle), 4 m/s full barb, 2 m/s half barb**. The pennant threshold repeatedly regressed to 50 m/s (`fa0207e`) or 25 m/s before being locked down.
2. **Barb Angle Geometry:** Wind barbs must point inward toward low pressure (clockwise in the Northern Hemisphere). Rendering code repeatedly flipped between acute angles, 90-degree right angles, and the meteorological convention of **110 degrees obtuse relative to the shaft** (`28ca503`, `1db146f`, `ac8f531`).
3. **Diamond 11 Polar Vector Decoding:** In `grid_data.go`, commit `665d533` removed vector decoding heuristics to enforce raw U/V reading. However, ECMWF polar grids store speed and direction or have inverted south-to-north grids with negative `dLat`. This broke polar wind vector visualization until `7168b87` recomputed signed `dLat` and restored polar decoding.

### Concrete Evidence

In `client/src/layers/station/stationSymbols.js` (`fa0207e` / `820ae09`):
```js
// CMA metric standard: 1 pennant flag = 20 m/s, 1 full barb = 4 m/s, 1 half barb = 2 m/s
while (speed >= 18) {
  drawPennant(ctx, staffLen, 110 * Math.PI / 180);
  speed -= 20;
}
while (speed >= 3.5) {
  drawFullBarb(ctx, staffLen, 110 * Math.PI / 180);
  speed -= 4;
}
if (speed >= 1.5) {
  drawHalfBarb(ctx, staffLen, 110 * Math.PI / 180);
  speed -= 2;
}
```

---

## 9. Station Data Parsing: Sea Level Pressure (SLP) vs. Station Elevation Conflict and Tooltip Desync

- **Fix Frequency:** Fixed **4 times** (`d6f2438`, `ba8aa03`, `41e2a88`, `2ecd0b1`)
- **Key Files Touched:**
  - `client/src/layers/stationLayer.js`
  - `client/src/layers/station/stationPlot.js`
  - `client/src/ui/tooltip.js`
  - `server/parser/diamond1.go`

### Commit History

| Commit | Date | Summary |
|---|---|---|
| `d6f2438` | 2026-08-27 | Support Diamond 1 element IDs (601, 801, 401, 209, 211) and parse SLP / press_stn in surface observations. |
| `ba8aa03` | 2026-08-28 | Resolve element ID mapping, SLP isobar decoding, and temperature / dewpoint rendering. |
| `41e2a88` | 2026-09-07 | Isolate station elevation from isobaric geopotential height in sounding observations. |
| `2ecd0b1` | 2026-09-10 | Align surface station plot SLP with tooltip info window and prioritize surface pressure over station elevation. |

### Technical Root Cause

1. **Elevation Overwriting Sea Level Pressure:** In surface station observations (Diamond 1 format), stations report both ground elevation and sea level pressure. `stationLayer.js` checked `if (props.height !== undefined)` *before* checking `props.slp`. As a result, ground elevation (e.g. 335.5 m) was formatted as geopotential height, suppressing sea level pressure (1021.4 hPa) on the station model.
2. **Canvas vs. Tooltip Display Discrepancy:** The direct 2D canvas overlay formatted 3-digit compressed SLP (e.g. `"214"` -> `1021.4` -> `"1021.4"`), while `tooltip.js` read `props.slp` directly as a raw number. If `props.slp` was absent and only `props.slp_encoded` existed, the tooltip displayed `"--"`. Fixed in `2ecd0b1` by unifying decoding in `extractPressureOrHeight`.

---

## 10. Svelte 5 Runes Reactive Proxy Incompatibilities (State Mutation, Clone Errors, Reference Identity)

- **Fix Frequency:** Fixed **5 times** (`a1359b9`, `d263895`, `75e933a`, `a5339ad`, `3ab0969`)
- **Key Files Touched:**
  - `client/src/lib/services/appWorkflow.js#L130-L135`
  - `client/src/lib/stores/layers.svelte.js`
  - `client/src/ui/tabs/windowMaps.js#L30-L45`
  - `client/src/lib/stores/tabsCore.js`

### Commit History

| Commit | Date | Summary |
|---|---|---|
| `a1359b9` | 2026-09-21 | Resolve Svelte 5 `state_unsafe_mutation` in layer store and lifecycle effects. |
| `d263895` | 2026-09-21 | Replace `structuredClone` with JSON round-trip to prevent `DataCloneError` on reactive proxies. |
| `75e933a` | 2026-09-21 | Restore data loading timeline and layer state across proxy unwrapping. |
| `a5339ad` | 2026-09-22 | Use stable `win.id` instead of object reference checks across proxy boundaries. |
| `3ab0969` | 2026-09-22 | Provide live tab resolvers to bridge Svelte 5 proxy state with plain JavaScript core modules. |

### Technical Root Cause

1. **`DataCloneError` with `structuredClone`:** Svelte 5 `$state` proxies cannot be cloned via browser `structuredClone` if they wrap non-serializable objects (such as MapLibre map instances or Svelte runtime reactivity signals). Attempting to clone preset groups threw uncaught `DataCloneError` exceptions. Fixed in `d263895` using `JSON.parse(JSON.stringify(group))` (`appWorkflow.js:134`).
2. **`state_unsafe_mutation` in `$derived`:** In Svelte 5, reading a `$derived` property that triggers a write to another `$state` throws `state_unsafe_mutation`. `getLayers` originally performed lazy initialization that mutated state on read. Fixed in `a1359b9` by making getters strictly read-only and moving synchronization to `$effect`.
3. **Proxy Identity Disconnect:** Passing a `$state(window)` into vanilla modules that compare `windowA === windowB` fails because the proxy wrapper is not reference-identical to the underlying target. All window comparisons must use `win.id`.

---

## 11. Vertical Level Stepping Layer State Loss, Race Conditions, and Desync

- **Fix Frequency:** Fixed **5 times** (`1bd83c0`, `2bfc22a`, `efe0126`, `559e1bd`, `8743cba`)
- **Key Files Touched:**
  - `client/src/services/levelController.js#L115-L140`
  - `client/src/services/derivedContours.js#L20-L45`
  - `client/src/services/presetLoader.js#L264-L275`
  - `client/src/main.js`
  - `client/test/playback/derived_persist.test.js`

### Commit History

| Commit | Date | Summary |
|---|---|---|
| `1bd83c0` | 2026-08-29 | Fix rapid level switching race conditions using load sequence tokens (`loadSeq`). |
| `2bfc22a` | 2026-09-04 | Fix vertical level stepping for upper-air stations and contours. |
| `efe0126` | 2026-09-04 | Preserve layer visibility and config across vertical level transitions. |
| `559e1bd` | 2026-09-18 | Upper-air eye-hide and config persists across level steps; fix snapshot merge resurrecting stale level IDs. |
| `8743cba` | 2026-09-26 | Preserve selected observation time on upper-air level stepping (`forceLatest: false`). |

### Technical Root Cause

1. **Rapid Up/Down Race Conditions:** Pressing ArrowUp / ArrowDown in rapid succession triggered concurrent network fetches. Out-of-order network responses caused earlier level data to overwrite the newly requested level. Fixed in `1bd83c0` with `loadSeq` monotonic tokens.
2. **Layer Visibility & Config Wiped Out:** Stepping levels re-executed preset initialization, rebuilding layers from default configurations and resetting user overrides (such as turning off contour fills or hiding specific contours). In `559e1bd`, snapshot merging in `derivedContours.js` attempted to preserve state, but resurrected stale level IDs (e.g. keeping 500 hPa contours visible when stepping to 400 hPa) until explicit target ID rewriting was enforced (`cfg.layerId = targetId; cfg.visible = isVisible;`).
3. **Selected Time Discarded:** Stepping levels called `syncObservationTimeline(..., { forceLatest: true })`, blowing away the user's historical time selection and jumping to the latest file. Fixed in `8743cba` with `{ forceLatest: false }`.

### Concrete Evidence

In `client/src/services/derivedContours.js#L25-L35` (`559e1bd`):
```js
// Re-assert target layer ID and visibility after snapshot merge
cfg.layerId = targetId;
cfg.visible = isVisible;
```

In `client/test/playback/derived_persist.test.js`:
```js
test("upper-air hide/config survive keyboard level step 500->400", () => {
  const doc = runScenario("ua_level_scenario.js");
  expect(doc.levelStep.level).toBe(400);
  expect(doc.levelStep.stale500Gone).toBe(true);
  expect(doc.levelStep.hgt400Present).toBe(true);
  expect(doc.levelStep.hgt400Visible).toBe(false);
});
```

---

## 12. Station Plot Spatial Binning, Canvas Over-Clearing, Antimeridian Wrapping, and Symbol QC

- **Fix Frequency:** Fixed **6 times** (`4a64e1c`, `ba8aa03`, `ce2411d`, `41e2a88`, `ec72177`, `820ae09`)
- **Key Files Touched:**
  - `client/src/layers/stationLayer.js`
  - `client/src/layers/station/stationPlot.js`
  - `client/src/layers/station/stationSymbols.js`
  - `client/src/utils/weatherSymbols.js`
  - `client/test/station_canvas_overlay.test.js`

### Commit History

| Commit | Date | Summary |
|---|---|---|
| `4a64e1c` | 2026-08-28 | Remove station maxVisible cap, support antimeridian/wrapped bounds, and refresh on zoom. |
| `ba8aa03` | 2026-08-28 | Resolve element ID mapping, SLP isobar decoding, temperature and dewpoint rendering. |
| `ce2411d` | 2026-09-07 | Resolve 6h rain R6 decoding and station marker rendering. |
| `41e2a88` | 2026-09-07 | Add meteorological QC filters and isolate elevation for upper-air stations. |
| `ec72177` | 2026-09-10 | Resolve canvas review issues: sky cover 9 symbol parsing, throttled spatial hover, double draw, stale GeoJSON references. |
| `820ae09` | 2026-09-26 | Update calm wind circle radius and symbology across DPI scales. |

### Technical Root Cause

1. **Antimeridian Coordinate Wrapping:** Panning the map across the antimeridian (180° longitude) inverted the longitude bounding box (`minLon > maxLon`), causing spatial station queries to filter out all stations in the viewport. Fixed in `4a64e1c`.
2. **Canvas Double Draw & Flickering:** When moving the map, both `render` and `move` listeners triggered redraws of the direct HTML5 Canvas overlay, causing double draws and dropped frames. Fixed in `ec72177`.
3. **Symbol Decoding Errors:**
   - Sky cover code 9 ("sky obscured by fog/precipitation") was unhandled, rendering as blank. Fixed in `ec72177`.
   - 6-hour rain element R6 decoding omitted valid precipitation data until fixed in `ce2411d`.

---

## Summary Matrix of Regressions & Invariant Rules

| Bug Category | Fix Commits | Invariant Rule to Prevent Regression |
|---|---|---|
| **1. Legend Reverts** | `efe0126`, `a2360b6`, `2776ce0`, `b46d4bc`, `46550e0`, `c93ff12`, `8672a81` | Never write directly to `#legend-panel` DOM. Always dispatch via `updateLegend` with normalized uppercase element keys. `contourReRender.js` must re-assert custom palette legend stops after moveend. |
| **2. Timeline Stepping** | `7fadf9e`, `8ab0bc4`, `a8273f2`, `00eb1d0`, `1845b14`, `abb0d3c`, `c0d22fc`, `8743cba` | Never call `setTimelineMode` during playback ticks (`isTimeStep`). Never pass `{ forceLatest: true }` when stepping vertical levels. Read prefetch targets from live active window store. |
| **3. UI State & Titles** | `d6330b6`, `d2ec40c`, `e5a75b5`, `a2360b6`, `3e6b1e8`, `f34550a`, `b5f0588`, `49dc1a2` | Window titles must be computed reactively from state. Never write to `tab-label-${winIdx}` via DOM. Never mutate preset group objects in place; clone them on load. |
| **4. Split Map Sync** | `e1db0ce`, `91ffe78`, `2adb814`, `b9326fc`, `a5339ad`, `3ab0969` | Compare `win.id`, never window object references. Read layout and sync flags from live tab resolvers rather than disconnected core stores. |
| **5. Contour / Isoband Pan/Zoom** | `b46d4bc`, `3e6b1e8`, `46550e0`, `175b8b1`, `3ab0969`, `8672a81` | Maintain `preserveIsobands: true` during viewport re-renders. Always disarm move/zoom listeners on layer delete to prevent zombie re-renders. |
| **6. Palette Persistence** | `8ab0bc4`, `e7d3ee1`, `a9bd390`, `fa0207e`, `06c7232`, `8672a81` | Store custom palettes under `palette:${layer.id}`. `addOrUpdateLayer` must prioritize existing custom palette keys over incoming generic element defaults. |
| **7. Profile Panels** | `1256b13`, `3525b18`, `b612195`, `46550e0`, `c93ff12`, `b5f0588` | Profile visibility must be owned by `profilesRegistry` per window. Hide all floating profile panels when activating the Config Editor tab. |
| **8. Wind Barb Physics** | `28ca503`, `1db146f`, `ac8f531`, `373fa4c`, `1f52ca3`, `665d533`, `7168b87`, `fa0207e`, `820ae09` | Strict CMA standard: 20 m/s triangle pennant, 4 m/s full barb, 2 m/s half barb. Inward barb angle fixed at 110 degrees obtuse. Signed `dLat` for polar grids. |
| **9. Station Pressure / SLP** | `d6f2438`, `ba8aa03`, `41e2a88`, `2ecd0b1` | Prioritize valid `slp` over `height` on surface station layers. Use unified decoding so tooltip and canvas numbers always match. |
| **10. Svelte 5 Runes** | `a1359b9`, `d263895`, `75e933a`, `a5339ad`, `3ab0969` | Use `JSON.parse(JSON.stringify())` instead of `structuredClone()` on reactive proxies. Avoid side effects in `$derived`. Compare entities by string UID. |
| **11. Level Stepping Regressions** | `1bd83c0`, `2bfc22a`, `efe0126`, `559e1bd`, `8743cba` | Discard stale network arrivals using monotonic `loadSeq`. Maintain user layer visibility/config across vertical level steps. Preserve selected observation time unless explicitly reloading. |
| **12. Station Plot & Canvas QC** | `4a64e1c`, `ba8aa03`, `ce2411d`, `41e2a88`, `ec72177`, `820ae09` | Support antimeridian wrapped longitude ranges. Throttle canvas mousemove hit-tests via spatial binning. Support sky cover 9 and 6h rain R6 parsing. |
