# Root Cause Review: False Positive Stale Tip & High CPU (`ECMWF Rain12`)

---

## Executive Summary

### 1. False Positive Stale Tip
The false-positive `hard-stale` warnings (red diagonal viewport hatch, `⚠️ <layer>: <N> min old (stale)` corner badges, red `● STALE` badges in the Layers/Status/Legend panels, and 35%–40% layer opacity degradation) stem from **two distinct state-desynchronization mechanisms** in time resolution (`resolveLayerTime`), compounded by missing tolerance definitions:

1. **Scenario A — Selecting an Old Init (Forecast Cycle) of NWP:**
   - **Root Cause A1 (Bounded `LIMIT 100` file tree vs. 10-cycle init dropdown):** [`resolveForecastCycles`](file:///root/downloads/micaps-web/client/src/utils/timelineSync.js#L40-L94) populates the init dropdown with **10 cycles** (5 days of 08/20 runs). However, [`loadWeatherField`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L123-L124) fetches the catalog tree with [`getObsTreeLimit(dataPath)`](file:///root/downloads/micaps-web/client/src/ui/timeline/timelineMath.js#L67) = **`100`**, and the backend [`GetFileList`](file:///root/downloads/micaps-web/server/db/catalog_queries.go#L322) queries `ORDER BY column1 DESC LIMIT 100` with **no cycle filter**. Because each `ECMWF_HR` / `GRAPES_GFS` cycle contains 53–85+ lead-time files, `LIMIT 100` covers only the newest **1 to ~1.8 cycles**.
   - **Root Cause A2 (`candidateFiles` fallback to newest cycle & partial-cycle snapping in `weatherLoader.js`):**
     - For cycles `2..9` (or Mock Mode), `cycleFiles = availableFiles.filter(f => f.startsWith(`${cycle}.`))` is `[]` ([`weatherLoader.js:181`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L181)). Line 182 (`const candidateFiles = cycleFiles.length > 0 ? cycleFiles : availableFiles;`) falls back to `availableFiles` (the **newest** cycle's files) and stores `sampleTimes: candidateFiles` on the layer ([`weatherLoader.js:389,549`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L389)). Worse, lines 259–289 see that `${oldCycle}.024` is not in `candidateFiles`, match `.024` inside the newest cycle, and **overwrite `file` to `${newestCycle}.024`**.
     - For `cycles[1]` (the 2nd cycle, `-12h`), `LIMIT 100` returns only its highest lead times (e.g. `.078`..`.240`) because of `DESC` ordering. `cycleFiles` is non-empty (`[C1.078..C1.240]`), so at `period = 24`, lines 259–290 snap `file` and `effectivePeriod` to `C1.078` (+54h away from the cursor).
     - In both cases, [`resolveLayerTime`](file:///root/downloads/micaps-web/client/src/utils/timeResolver.js#L497-L611) compares the layer's `sampleTimes` against `cursorTime = parseTimestamp({ cycle: oldCycle, period })`, computing a 12h–216h age gap (`> 2 * tolerance`) and flagging **`hard-stale`**.
   - **Root Cause A3 (8-digit vs. 10-digit cycle prefix mismatch & missing NWP tolerances):** [`timelineSync.js:105`](file:///root/downloads/micaps-web/client/src/utils/timelineSync.js#L105) strips `YYYYMMDDHH` to 8-digit `YYMMDDHH`, breaking `f.startsWith(`${cycle}.`)` if a table uses 10-digit filenames. Additionally, [`DEFAULT_TOLERANCES`](file:///root/downloads/micaps-web/client/src/utils/timeResolver.js#L32-L57) omits `RAIN12`, `RAIN24`, `PRMSL`, `CAPE`, `GRAPES_3KM`, `SHANGHAI_MR`, etc., dropping their tolerance from `360m` to `DEFAULT: 60m` (`hard-stale` at `> 2h`).

2. **Scenario B — Clicking `btn-reload-preset` After 6h for Surface:**
   - **Root Cause B1 (`NavBar.svelte` reloads the mutated `activeWin.activeGroup`, and `presetLoader.js` skips `fetchTree` when `layer.sampleTimes` is non-empty):** On initial load at $T_0$, [`presetLoader.js`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L558-L561) mutates `layer.sampleTimes = availableFiles` onto `win.activeGroup.layers[i]`. When clicking `#btn-reload-preset` 6h later, [`NavBar.svelte:112,448`](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte#L448) passes `activeWin.activeGroup` (with its 6-hour-old `sampleTimes`) into `handleLoadData`. [`presetLoader.js` (lines 328, 415, 540, 624)](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L540) checks `if (Array.isArray(layer.sampleTimes) && layer.sampleTimes.length > 0)` and **completely skips `fetchTree(obsPath)`**, keeping `availableFiles` frozen at $T_0$ (and even when `fetchTree` is called, it omits `{ bypassCache: freshObsLoad }`).
   - **Root Cause B2 (`syncObservationTimeline` advances `win.obsTime` to $T_0 + 6\text{h}$ while `layer.sampleTimes` remains at $T_0$):** At [`presetLoader.js:572`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L572), `syncObservationTimeline(..., { forceLatest: true })` bypasses the cache, fetches the new catalog, and updates `win.obsTime` to $T_0 + 6\text{h}$. Immediately after ([`presetLoader.js:584-595`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L584-L595)), `resolveLayerTime` resolves the stale `availableFiles` (max $T_0$) against `effectiveCursorTime` ($T_0 + 6\text{h}$), producing `ageMinutes = -360m` (6h old), which exceeds `2 * tolerance` (`180m` for `SURFACE`, `360m` for `SLP`) -> **`hard-stale`**, and even snaps `targetFile` back to the $T_0$ file while [`App.svelte:1395`](file:///root/downloads/micaps-web/client/src/App.svelte#L1395) sets `win.obsTime` to $T_0 + 6\text{h}$.
   - **Root Cause B3 (`win.wallClockCursor`, `tl.wallClockCursor`, and `window.__MICAPS_CURSOR__` are not cleared on same-preset reload):** [`applyPresetToWindow`](file:///root/downloads/micaps-web/client/src/lib/services/appWorkflow.js#L201-L203) only clears `win.wallClockCursor` when `previousGroupId !== groupCopy.id`. On a reload of the *same* preset (`previousGroupId === groupCopy.id`), an existing `wallClockCursor` at $T_0$ survives and overrides `win.obsTime` across `presetLoader.js`, `derivedContours.js`, `WindowPanel.svelte`, and `LayersPanel.svelte`.
   - **Root Cause B4 (Tolerance precedence bug in `getDefaultToleranceForLayer`):** [`timeResolver.js:440-445`](file:///root/downloads/micaps-web/client/src/utils/timeResolver.js#L440-L445) checks `if (model.includes("SURFACE") || type === "station") return DEFAULT_TOLERANCES.SURFACE;` (`90m`) *before* `DEFAULT_TOLERANCES[elem]`, forcing 3-hourly `PLOT_GLOBAL_3H` (`180m`) and 6-hourly `RAIN6` (`360m`) surface station layers down to a 90m tolerance (180m hard-stale threshold).

---

### 2. High CPU (e.g., `ECMWF Rain12`)
Loading or interacting with `ECMWF Rain12` (`multi-model-rain12` in [`client/config.json:291-338`](file:///root/downloads/micaps-web/client/config.json#L291-L338), which has `showRaster: true`, `showLine: true`, `showLabels: true`, `showFill: false`, `palettePath: "/palettes/RAIN/dark-rain-24h.xml"`, `smooth: true`, `smoothIterations: 2`) triggers **six compounding CPU bottlenecks** on both the browser main thread and the Go server:

1. **Root Cause C1 (Unthrottled 4.19-million-pixel CPU raster bilinear interpolation + 22-stop linear palette scan on the main thread):**
   - [`renderScalarRaster`](file:///root/downloads/micaps-web/client/src/layers/rasterLayer.js#L168-L353) dynamically sizes an offscreen canvas up to **`2048 × 2048` (4,194,304 pixels)** based on `Math.ceil((lonSpan / dLon) * 4)` ([`rasterLayer.js:206-210`](file:///root/downloads/micaps-web/client/src/layers/rasterLayer.js#L206-L210)). For `ECMWF_HR/RAIN12` ($0.125^\circ$, $1441 \times 721 = 1,038,961$ grid cells), `targetWidth` and `targetHeight` clamp to `2048 × 2048`.
   - For every pixel, the main thread performs bilinear interpolation and calls `resolveColor(val)` ([`colormaps.js:574-615`](file:///root/downloads/micaps-web/client/src/utils/colormaps.js#L574-L615)), which executes a **linear loop over all 22 stops** of [`dark-rain-24h.xml`](file:///root/downloads/micaps-web/client/palettes/RAIN/dark-rain-24h.xml#L1) (`~92 million` loop iterations per render), followed by synchronous `ctx.putImageData` and `canvas.toDataURL("image/png")` (main-thread PNG compression of 16.7 MB RGBA data).
2. **Root Cause C2 (Redundant double-render of the 2048×2048 raster + double Marching Squares contour pass on every load):**
   - In [`weatherLoader.js:230-255`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L230-L255), when `palettePath` is not yet cached (or during initial load), `loadCustomPalette` runs asynchronously and triggers a **second full `renderScalarRaster` + `renderContourLayers` pass** inside `.then()` right after the main execution path already rendered both at lines 455 and 501.
   - Worse, [`presetLoader.js:240-264`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L240-L264) preloads custom palettes into key `palette:${layer.id}` (`palette:rain12-ec`), whereas [`weatherLoader.js:228`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L228) checks `palette:${layerId}` (`palette:contour-ECMWF_HR-RAIN12-0`). Because the keys **never match**, `weatherLoader.js` **always** treats the preloaded palette as a cache miss, re-fetches `/palettes/RAIN/dark-rain-24h.xml`, and fires the duplicate `.then()` raster + contour render!
3. **Root Cause C3 (Dual full-grid fetches + duplicate server-side gzip decompression & float32 parsing for every `showRaster: true` layer, multiplied by `prefetchService`):**
   - [`weatherLoader.js:322-358`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L322-L358) fires **both** `fetchGridData` (`/api/data/grid`, returning a ~10–15 MB JSON array of 1.04M floats + `x`/`y` arrays) **and** `fetchGridBinaryStream` (`/api/data/grid/binary`, returning a 4.15 MB binary stream) for the exact same `ECMWF_HR/RAIN12` grid.
   - Then [`prefetchService.js:317-321`](file:///root/downloads/micaps-web/client/src/services/prefetchService.js#L317-L321) immediately schedules **both** `grid` (JSON) and `binary` fetches for `left` and `right` adjacent time steps (4 more full-grid requests = ~40 MB of JSON parsing + binary decoding in the background 150ms after load).
   - On the Go server ([`grid_handler.go:51,85,194`](file:///root/downloads/micaps-web/server/handler/grid_handler.go#L51) and [`grid_data.go:162-194`](file:///root/downloads/micaps-web/server/parser/grid_data.go#L162-L194)), `filecache` caches only the **compressed raw blob**, so every `/api/data/grid` and `/api/data/grid/binary` call independently decompresses the 4.15 MB gzip payload, parses 1.04M float32 values, and in `EncodeBinaryStream` calls `binary.Write(&buf, binary.LittleEndian, val)` inside a **per-element loop (`1,038,961` reflection-heavy calls)**!
4. **Root Cause C4 (High-frequency noisy precipitation contours + `smoothGrid2D` + Douglas-Peucker + 2× Chaikin corner-cutting + `countGeoJSONPoints`):**
   - `ECMWF Rain12` enables `showLine: true`, `showLabels: true`, `smooth: true`, `smoothIterations: 2` across 9 contour levels (`0.1, 10, 15, 20, 25, 35, 50, 75, 100` mm, where `0.1` is injected by [`contourMapSync.js:309-313`](file:///root/downloads/micaps-web/client/src/layers/contour/contourMapSync.js#L309-L313) or `getElementLevels`).
   - Unlike smooth synoptic fields (`HGT`, `TMP`), `RAIN12` at `0.1mm`–`25mm` produces **thousands of fragmented cellular contour rings**.
   - On initial load and on every pan/zoom (`moveend` + 120ms debounce in [`contourReRender.js:121-225`](file:///root/downloads/micaps-web/client/src/services/contourReRender.js#L121-L225)), [`renderContourLayers`](file:///root/downloads/micaps-web/client/src/layers/contour/contourMapSync.js#L279-L389) runs:
     1. [`computeGridStats(gridData)`](file:///root/downloads/micaps-web/client/src/layers/contour/contourCompute.js#L55-L75) over the full 1.04M array if `stats` is absent;
     2. [`smoothGrid2D(Z, 1, 0.4)`](file:///root/downloads/micaps-web/client/src/utils/grid/smoothGrid2D.js#L20-L161) (9-point convolution over 50,000 cells);
     3. `griddata.contour(Z, { x, y, levels })` (Marching Squares over 9 levels);
     4. [`smoothLines`](file:///root/downloads/micaps-web/client/src/layers/contour/contourCompute.js#L46-L53): Douglas-Peucker simplification followed by **2 iterations of Chaikin's algorithm** ([`chaikin.js:27-115`](file:///root/downloads/micaps-web/client/src/utils/geometry/chaikin.js#L27-L115)), which **quadruples ($4\times$) the vertex count** of every polyline;
     5. **Unconditional** [`countGeoJSONPoints` + `estimateHeapMB`](file:///root/downloads/micaps-web/client/src/layers/contour/contourMapSync.js#L359-L362) (4 recursive full-tree traversals of all GeoJSON coordinates on every render, even when `isDebugMemEnabled()` is `false`!);
     6. **Duplicate `setData(isolines)` on two separate MapLibre GeoJSON sources** (`isolineSrcId` and `isolineLabelSrcId`, [`contourMapSync.js:116,157`](file:///root/downloads/micaps-web/client/src/layers/contour/contourMapSync.js#L116)), forcing MapLibre's web workers to serialize, clone, and tile-index the entire smoothed `isolines` FeatureCollection **twice**, plus run expensive `symbol-placement: "line"` glyph layout every 160px across thousands of rain contour segments.
5. **Root Cause C5 (`TimeSlider.svelte` reactive `$effect` + `enforceRainMinPeriodOnWindow` double-load cascade when switching to `ECMWF Rain12` from `period < 12`):**
   - If the user is at `period = 0`, `3`, or `6` and selects `ECMWF Rain12`, [`TimeSlider.svelte:111-141`](file:///root/downloads/micaps-web/client/src/components/TimeSlider.svelte#L111-L141) runs a reactive `$effect` that mutates `tl.currentPeriodIdx` and calls `fireTimeChange(...)` (`handleTimeChange` -> `loadWeatherField`) **concurrently** with `loadPresetGroup` / `enforceRainMinPeriodOnWindow` ([`App.svelte:1349`](file:///root/downloads/micaps-web/client/src/App.svelte#L1349)), triggering **back-to-back full loads and renders** of `ECMWF_HR/RAIN12`.
6. **Root Cause C6 (Unthrottled `mousemove` reactive store churn & `WindowPanel.svelte` / `LayersPanel.svelte` `$derived` status re-evaluations):**
   - Moving the mouse over the map fires [`onMapMouseMove`](file:///root/downloads/micaps-web/client/src/map/MapViewport.svelte#L35-L41) on every pointer event (60–240 Hz) with no `requestAnimationFrame` throttling, mutating two global `$state` stores (`crosshairState` and `cursorProbeState`) and running bilinear grid sampling across all layers.

---

## Part 1: Root Cause Analysis — False Positive Stale Tip

### 1.1 How Stale Status Is Computed (`timeResolver.js`)

In [`client/src/utils/timeResolver.js`](file:///root/downloads/micaps-web/client/src/utils/timeResolver.js#L497-L611), [`resolveLayerTime(layer, cursorTime)`](file:///root/downloads/micaps-web/client/src/utils/timeResolver.js#L497) determines whether a layer is `"exact"`, `"interpolated"`, `"soft-stale"`, `"hard-stale"`, or `"missing"`:

1. It reads `sampleTimes = layer.sampleTimes || layer.obsFiles || []` ([`timeResolver.js:507`](file:///root/downloads/micaps-web/client/src/utils/timeResolver.js#L507)) and parses each entry with [`parseTimestamp(item)`](file:///root/downloads/micaps-web/client/src/utils/timeResolver.js#L168-L253).
   - For NWP filenames like `"26101408.024"`, `parseTimestamp` computes **valid time** = $\text{InitTime} + \text{period hours}$ (`2026-10-14 08:00Z + 24h = 2026-10-15 08:00Z`).
2. It compares the best-matching entry in `sampleTimes` against `targetCursorMs` (`cursorTime + offsetMs`):
   ```js
   // client/src/utils/timeResolver.js:569-586
   const ageMs = bestEntry.timeMs - targetCursorMs;
   const absAgeMs = Math.abs(ageMs);
   const ageMinutes = Math.round(ageMs / 60000);
   ...
   if (absAgeMs === 0) {
     status = "exact";
   } else if (absAgeMs <= toleranceMs) {
     status = "interpolated";
   } else if (absAgeMs <= 2 * toleranceMs) {
     status = "soft-stale";
   } else {
     status = "hard-stale";
     isHardStale = true;
   }
   ```
3. When `isHardStale === true`, five UI surfaces react simultaneously:
   - [`WindowPanel.svelte:49-51, 177-187`](file:///root/downloads/micaps-web/client/src/components/WindowPanel.svelte#L49-L51): Renders `.stale-viewport-hatch` (red diagonal stripes over the entire map) and `.stale-corner-badges` (`⚠️ <layer.name>: <abs(ageMinutes)> min old (stale)`).
   - [`LayerRow.svelte:83-106`](file:///root/downloads/micaps-web/client/src/components/LayerRow.svelte#L83-L106): Renders a red badge `● <sample> (<ageStr>)` with tooltip `"Hard stale"`.
   - [`StatusPanel.svelte:17-37`](file:///root/downloads/micaps-web/client/src/components/StatusPanel.svelte#L17-L37): Displays `STALE: <layer.name> (<ageStr>)` in the bottom status bar.
   - [`Legend.svelte:37-48`](file:///root/downloads/micaps-web/client/src/components/Legend.svelte#L37-L48) (via [`legendCore.js:170-189`](file:///root/downloads/micaps-web/client/src/lib/stores/legendCore.js#L170-L189)): Renders a red `.status-hard-stale` badge on the color bar.
   - [`weatherLoader.js:312, 469, 513`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L312), [`contourMapSync.js:42-44`](file:///root/downloads/micaps-web/client/src/layers/contour/contourMapSync.js#L42-L44), [`rasterLayer.js:175`](file:///root/downloads/micaps-web/client/src/layers/rasterLayer.js#L175): Multiplies layer fill/line/raster opacity by **`0.35` or `0.40`**.

---

### 1.2 Scenario 1A: Selecting an Old Init (Forecast Cycle) of NWP

#### Step-by-Step Trace
1. **Init Dropdown Populates 10 Cycles:**
   - When an NWP product loads, [`syncForecastTimeline`](file:///root/downloads/micaps-web/client/src/utils/timelineSync.js#L130-L240) calls [`resolveForecastCycles(dataPath, level, fallbackCycle)`](file:///root/downloads/micaps-web/client/src/utils/timelineSync.js#L40-L94).
   - `resolveForecastCycles` fetches the latest file (e.g. `26101420.240`), extracts the latest cycle (`26101420`), and calls [`generateDynamicForecastCycles(latestStr, 10)`](file:///root/downloads/micaps-web/client/src/utils/timelineSync.js#L14-L38) to synthesize **10 cycles** stepped by 12 hours (`26101420`, `26101408`, `26101320`, `26101308`, ..., `26101008`).
   - These 10 cycles are rendered in `<select id="init-cycle-select">` ([`TimeSlider.svelte:268-281`](file:///root/downloads/micaps-web/client/src/components/TimeSlider.svelte#L268-L281)).

2. **User Selects an Older Init Cycle:**
   - Selecting an older cycle in `#init-cycle-select` fires [`onCycleSelect`](file:///root/downloads/micaps-web/client/src/components/TimeSlider.svelte#L211-L217) -> `fireTimeChange({ mode: "nwp", cycle, period })` -> [`handleTimeChange`](file:///root/downloads/micaps-web/client/src/App.svelte#L1764-L1856).
   - In [`App.svelte:1779-1786`](file:///root/downloads/micaps-web/client/src/App.svelte#L1779-L1786):
     ```js
     win.period = timeState.period;
     win.forecastCycle = timeState.cycle;
     win.isObservation = false;
     const nwpCursorMs = parseTimestamp({ cycle: timeState.cycle, period: timeState.period });
     if (nwpCursorMs !== null) {
       win.wallClockCursor = nwpCursorMs;
       setWallClockCursor(nwpCursorMs, win.id);
     }
     ```
   - `App.svelte` then calls [`loadPresetGroup(win.activeGroup, ...)`](file:///root/downloads/micaps-web/client/src/App.svelte#L1808) or [`loadWeatherField(...)`](file:///root/downloads/micaps-web/client/src/App.svelte#L1817) with `overrideCycle = timeState.cycle`.

3. **`loadWeatherField` Queries Only `LIMIT 100` Files (No Cycle Filter):**
   - In [`weatherLoader.js:121-125`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L121-L125):
     ```js
     let availableFiles = [];
     try {
       const treeLimit = getObsTreeLimit(dataPath); // returns 100 for all NWP paths!
       const treeRes = await fetchTree(dataPath, treeLimit, targetLevel);
     ```
   - On the server, [`GetFileList`](file:///root/downloads/micaps-web/server/db/catalog_queries.go#L305-L347) runs:
     ```sql
     SELECT column1, value FROM micapsdataserver.treeview
     WHERE "dataPath" = 'ECMWF_HR/TMP/850'
     ORDER BY column1 DESC LIMIT 100
     ```
   - Because each `ECMWF_HR` cycle has **53–73 files** (`.000` to `.240`) and `GRAPES_GFS` has **65–85 files**, `ORDER BY column1 DESC LIMIT 100` returns:
     - All files of `cycles[0]` (the newest cycle, e.g. `26101420.240` down to `26101420.000`, ~65 files),
     - Only the **highest lead times** of `cycles[1]` (e.g. `26101408.240` down to `26101408.078`, ~35 files),
     - **Zero files** for `cycles[2]` through `cycles[9]`!
   - (In Mock Mode, [`GenerateMockFiles`](file:///root/downloads/micaps-web/server/mock/mock_generator.go) only generates files for the single latest cycle, so `cycles[1..9]` all have zero files in `availableFiles`.)

4. **Two Failure Paths in `weatherLoader.js` (Lines 181–313):**

   - **Failure Path 1 — User selects `cycles[2..9]` (e.g. 24h–108h older init): `cycleFiles` is empty (`[]`)**
     ```js
     // client/src/services/weatherLoader.js:181-182
     const cycleFiles = availableFiles.filter((f) => f.startsWith(`${cycle}.`));
     const candidateFiles = cycleFiles.length > 0 ? cycleFiles : availableFiles;
     ```
     - `cycleFiles` is `[]`, so `candidateFiles` falls back to `availableFiles` (which only contains files from `cycles[0]` and the tail of `cycles[1]`).
     - Next, at [`weatherLoader.js:259-290`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L259-L290):
       ```js
       if (candidateFiles.length > 0 && !candidateFiles.includes(file)) {
         let bestFile = candidateFiles[0];
         let minDiff = Infinity;
         for (const f of candidateFiles) {
           const parts = f.split(".");
           const p = parseInt(parts[parts.length - 1], 10);
           if (!isNaN(p)) {
             const diff = Math.abs(p - period);
             if (diff < minDiff) {
               minDiff = diff;
               bestFile = f;
             }
           }
         }
         file = bestFile; // <-- BUG: Overwrites `26101220.024` with `26101420.024`!
       ```
       Because `candidateFiles` contains `26101420.024` (`p = 24`, `diff = 0`), **it silently replaces the user's requested old-cycle file `${oldCycle}.024` with `${newestCycle}.024`**, fetching the wrong cycle's data from `/api/data/grid`!
     - Then at [`weatherLoader.js:298-313`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L298-L313) and when saving the layer at [`lines 389, 549`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L389):
       - `sampleTimes: candidateFiles` (containing only timestamps $\ge \text{C}_1 + 78\text{h}$) is attached to the layer.
       - `resolveLayerTime` compares `cursorTime` ($\text{oldCycle} + \text{period}$, e.g. `26101220 + 24h = 26101320`) against `candidateFiles` (earliest timestamp `26101408 + 78h` or `26101420 + 00h`).
       - The age gap is **24h to 216h** (`1440m` to `12960m`), far exceeding `2 * tolerance` (`720m` for `ECMWF_HR`, or `120m` for elements hitting `DEFAULT: 60m`), triggering **`status: "hard-stale"` (`isHardStale: true`)**!

   - **Failure Path 2 — User selects `cycles[1]` (the previous init, `-12h`) at a low lead time (e.g. `period = 24`):**
     - Because `LIMIT 100` ordered `DESC` cut off `cycles[1]` below `.078`, `cycleFiles` is non-empty: `["26101408.078", ..., "26101408.240"]`.
     - `candidateFiles = cycleFiles`.
     - At [`weatherLoader.js:259-290`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L259-L290), `!candidateFiles.includes("26101408.024")` is `true` (even though `26101408.024` **does** exist in Cassandra!).
     - The loop snaps `file` to `"26101408.078"` and `effectivePeriod = 78`.
     - `resolveLayerTime` compares `cursorTime` (`26101408 + 24h`) against `sampleTimes` (nearest is `26101408.078`, i.e., `+54h` = `+3240m` away), triggering **`status: "hard-stale"`** and rendering the +78h forecast when the user asked for +24h!

   - **Failure Path 3 — Multi-layer presets (`presetLoader.js`) don't pass `sampleTimes` to secondary contour/wind layers unless fetched via `fetchTree`:**
     - In [`presetLoader.js:814-836`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L814-L836), secondary NWP layers in a preset (e.g. `HGT` or `WIND` overlaid on `TMP`) are added via `addOrUpdateLayer` **without** `sampleTimes` (`sampleTimes: []`), or in `weatherLoader.js` with the truncated `candidateFiles`.

   - **Failure Path 4 — Missing NWP models and elements in `DEFAULT_TOLERANCES` (`timeResolver.js:32-57, 419-450`):**
     - [`DEFAULT_TOLERANCES`](file:///root/downloads/micaps-web/client/src/utils/timeResolver.js#L32-L57) only lists `ECMWF_HR`, `ECMWF`, `GFS`, `GRAPES`, `GRAPES_GFS`, `NCEP`, and elements `TMP`, `HGT`, `WIND`, `RH`, `SLP`, `T_ADV`, `DIV`, `VOR`, `RAIN6`.
     - Models like `GRAPES_3KM`, `GRAPES_MESO`, `SHANGHAI_MR`, `BEIJING_MR`, `JAPAN_MR`, `NWFD_SCMOC` and elements like `RAIN12`, `RAIN24`, `RAIN03`, `PRMSL`, `CAPE`, `K_INDEX` fall through to `DEFAULT_TOLERANCES.DEFAULT = 60` (60 minutes -> hard-stale at `> 120m` = 2h). For any 3h or 6h cadence NWP model not matching those 4 model strings, even normal step differences become `hard-stale`.

---

### 1.3 Scenario 1B: Clicking `btn-reload-preset` After 6h for Surface

#### Step-by-Step Trace
1. **Initial Load at $T_0$ Mutates `win.activeGroup.layers[i].sampleTimes`:**
   - When the user first loads a Surface preset (e.g. `surface-synoptic` or `surface-obs`) at time $T_0$:
   - [`applyPresetToWindow`](file:///root/downloads/micaps-web/client/src/lib/services/appWorkflow.js#L165) clones the preset definition into `win.activeGroup`.
   - [`loadPresetGroup`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L540-L561) fetches the catalog tree at $T_0$ and **mutates the layer objects inside `win.activeGroup.layers`**:
     ```js
     // client/src/services/presetLoader.js:558-561 (and 338-341, 425-428, 639-640)
     if (availableFiles.length > 0) {
       layer.obsFiles = availableFiles;
       layer.sampleTimes = availableFiles;
     }
     ```
     At this point, `win.activeGroup.layers[i].sampleTimes` holds the file list as of $T_0$ (newest file = $T_0$).

2. **6 Hours Later ($T_0 + 6\text{h}$), User Clicks `#btn-reload-preset`:**
   - In [`NavBar.svelte:109-118, 444-450`](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte#L109-L118):
     ```js
     let currentGroup = $derived.by(() => {
       if (activeWin?.activeGroup) return activeWin.activeGroup;
       ...
     });
     function handleReloadClick() {
       const group = currentGroup;
       if (group && onLoadPreset) {
         onLoadPreset(group, currentLevel);
       }
     }
     ```
   - `handleReloadClick` passes `activeWin.activeGroup` — **the mutated object whose `.layers[i].sampleTimes` still holds the 6-hour-old file list from $T_0$** — into `handleLoadData(group, targetLevel)` ([`App.svelte:1303`](file:///root/downloads/micaps-web/client/src/App.svelte#L1303)).

3. **`applyPresetToWindow` Preserves Stale `layer.sampleTimes` AND Stale `win.wallClockCursor`:**
   - In [`appWorkflow.js:165`](file:///root/downloads/micaps-web/client/src/lib/services/appWorkflow.js#L165):
     ```js
     const groupCopy = JSON.parse(JSON.stringify(group));
     ```
     Because `group` is `activeWin.activeGroup`, `groupCopy.layers[i].sampleTimes` is cloned with the **6-hour-old $T_0$ array**!
   - Furthermore, look at [`appWorkflow.js:196-203`](file:///root/downloads/micaps-web/client/src/lib/services/appWorkflow.js#L196-L203):
     ```js
     if (!groupCopy.isObservation) {
       win.obsTime = null;
       if (typeof window !== "undefined") window.__MICAPS_CURSOR__ = null;
       win.wallClockCursor = null;
     } else if (previousGroupId !== groupCopy.id) {
       win.wallClockCursor = null;
     }
     ```
     Because this is a reload of the **same** Surface preset, `previousGroupId === groupCopy.id` (`"surface-synoptic" === "surface-synoptic"`), and `groupCopy.isObservation === true`:
     - **`win.wallClockCursor` is NOT cleared!**
     - **`window.__MICAPS_CURSOR__` is NOT cleared!** (And [`WindowPanel.svelte:43-47`](file:///root/downloads/micaps-web/client/src/components/WindowPanel.svelte#L43-L47) and [`LayersPanel.svelte:46-50`](file:///root/downloads/micaps-web/client/src/components/LayersPanel.svelte#L46-L50) continuously write `window.__MICAPS_CURSOR__ = effectiveCursor` = $T_0$).
     - **`tl.wallClockCursor` (in `timelineCore.js`) is NOT cleared!**

4. **`presetLoader.js` Skips `fetchTree` Because `layer.sampleTimes` Is Already Populated:**
   - Inside [`loadPresetGroup`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L540-L561) (and identical blocks at lines [328-341](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L328-L341), [415-428](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L415-L428), [624-640](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L624-L640)):
     ```js
     let availableFiles = [];
     if (Array.isArray(layer.sampleTimes) && layer.sampleTimes.length > 0) {
       availableFiles = layer.sampleTimes; // <-- HIT! Reuses 6-hour-old T0 list!
     } else if (Array.isArray(layer.obsFiles) && layer.obsFiles.length > 0) {
       availableFiles = layer.obsFiles;
     } else {
       try {
         const treeLimit = getObsTreeLimit(obsPath);
         const treeRes = await fetchTree(obsPath, treeLimit); // (also missing { bypassCache: freshObsLoad }!)
     ```
   - Because `layer.sampleTimes` is non-empty from $T_0$, **`fetchTree(obsPath)` is completely skipped** for every station and contour layer in the preset! `availableFiles` remains frozen at $T_0$.

5. **`syncObservationTimeline` Advances `win.obsTime` to $T_0 + 6\text{h}$, Causing an Immediate 6-Hour Desync:**
   - Seven lines later, at [`presetLoader.js:569-576`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L569-L576):
     ```js
     if (!obsTimelineSynced) {
       obsTimelineSynced = true;
       const forceLatest = freshObsLoad; // true!
       const resolvedFile = await syncObservationTimeline(obsPath, explicitObsTime ? targetFile : null, null, win, {
         forceLatest,
       });
       if (resolvedFile) targetFile = resolvedFile;
     }
     ```
   - [`syncObservationTimeline`](file:///root/downloads/micaps-web/client/src/utils/timelineSync.js#L252-L353) calls `fetchTree(dataPath, limit, null, { bypassCache: true })`, gets the **new** catalog from the server (where the latest file is now $T_0 + 6\text{h}$), and sets `win.obsTime = resolvedFile` ($T_0 + 6\text{h}$) and `win._obsTimeline.files` (up to $T_0 + 6\text{h}$).
   - Now look at [`presetLoader.js:584-598`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L584-L598):
     ```js
     const effectiveCursorTime =
       win?.wallClockCursor ||
       (win?.obsTime ? parseTimestamp(win.obsTime) : null) ||
       ...
     const layerResolved = resolveLayerTime(
       { ...layer, sampleTimes: availableFiles },
       effectiveCursorTime
     );
     if (layerResolved && layerResolved.sampleFile) {
       targetFile = layerResolved.sampleFile;
     }
     ```
   - Whether `effectiveCursorTime` comes from the new `win.obsTime` ($T_0 + 6\text{h}$) or from a surviving `win.wallClockCursor` ($T_0$):
     - **Subcase 1 (`win.wallClockCursor` was null, so `effectiveCursorTime` = $T_0 + 6\text{h}$):**
       - `availableFiles` (`layer.sampleTimes`) only goes up to $T_0$.
       - `resolveLayerTime` resolves `bestEntry = T_0` against `effectiveCursorTime = T_0 + 6h`, yielding **`ageMinutes = -360` (-6h)**.
       - Even worse, `if (layerResolved && layerResolved.sampleFile) targetFile = layerResolved.sampleFile;` **overwrites `targetFile` back from $T_0 + 6\text{h}$ to the 6-hour-old $T_0$ file**!
       - Then [`App.svelte:1395-1397`](file:///root/downloads/micaps-web/client/src/App.svelte#L1395-L1397) sets `win.obsTime = win._obsTimeline.file` ($T_0 + 6\text{h}$).
       - In the UI (`WindowPanel.svelte`, `LayersPanel.svelte`, `LayerRow.svelte`, `StatusPanel.svelte`, `Legend.svelte`), `effectiveCursor` is $T_0 + 6\text{h}$, while every layer's `sampleTimes` only contains files up to $T_0$.
       - For `SURFACE/PLOT_GLOBAL_3H` (`station` layer), `getDefaultToleranceForLayer` returns `DEFAULT_TOLERANCES.SURFACE = 90` min (`2 * tolerance = 180` min = 3h). Since `|-360m| > 180m`, **`isHardStale = true`**!
       - For Surface derived `SLP` (`tolerance = 180` min, `2 * tolerance = 360` min), if the new observation or cursor is even 1 minute past 6h (or if `layer.sampleTimes` had a missed synop), `absAgeMs > 360m` -> **`isHardStale = true`**!
     - **Subcase 2 (`win.wallClockCursor` was non-null at $T_0$ from earlier timeline interaction):**
       - Because `applyPresetToWindow` did not clear `win.wallClockCursor` on same-preset reload (`previousGroupId === groupCopy.id`), `effectiveCursor` in [`WindowPanel.svelte:26`](file:///root/downloads/micaps-web/client/src/components/WindowPanel.svelte#L26) and [`LayersPanel.svelte:29`](file:///root/downloads/micaps-web/client/src/components/LayersPanel.svelte#L29) stays pinned at $T_0$ while any newly fetched data or timeline state is at $T_0 + 6\text{h}$ (`+360m` difference -> **`isHardStale = true`**).

6. **Tolerance Precedence Bug in `getDefaultToleranceForLayer` (`timeResolver.js:440-445`):**
   ```js
   // client/src/utils/timeResolver.js:440-445
   if (model.includes("SURFACE") || type === "station") return DEFAULT_TOLERANCES.SURFACE; // 90m
   if (DEFAULT_TOLERANCES[elem] !== undefined) return DEFAULT_TOLERANCES[elem];
   ```
   - `DEFAULT_TOLERANCES` explicitly defines `PLOT_GLOBAL_3H: 180` (3h) and `RAIN6: 360` (6h) ([`timeResolver.js:35,44`](file:///root/downloads/micaps-web/client/src/utils/timeResolver.js#L35)).
   - However, because `if (model.includes("SURFACE") || type === "station")` runs **before** `if (DEFAULT_TOLERANCES[elem] !== undefined)`, `PLOT_GLOBAL_3H` and `RAIN6` on `SURFACE` / `station` layers **never reach `DEFAULT_TOLERANCES[elem]`**! They always receive `90` minutes (`hard-stale` at `> 3h` instead of `> 6h` or `> 12h`).

---

## Part 2: Root Cause Analysis — High CPU (e.g., `ECMWF Rain12`)

### 2.1 Configuration of `ECMWF Rain12` (`multi-model-rain12`)
In [`client/config.json:291-338`](file:///root/downloads/micaps-web/client/config.json#L291-L338) (and [`client/src/config/presets.js:155-184`](file:///root/downloads/micaps-web/client/src/config/presets.js#L155-L184)):
```json
{
  "id": "multi-model-rain12",
  "name": "ECMWF Rain12 / 欧洲中心12小时降水",
  "hasLevel": false,
  "layers": [
    {
      "id": "rain12-ec",
      "name": "ECMWF 12h Rain (mm)",
      "type": "contour",
      "model": "ECMWF_HR",
      "element": "RAIN12",
      "path": "ECMWF_HR/RAIN12",
      "palettePath": "/palettes/RAIN/dark-rain-24h.xml",
      "levels": [10, 15, 20, 25, 35, 50, 75, 100],
      "render": {
        "showFill": false,
        "showLine": true,
        "showLabels": true,
        "lineColor": "#388bfd",
        "lineWidth": 1.5,
        "smooth": true,
        "smoothIterations": 2,
        "showRaster": true,
        "opacity": 0.75
      }
    }
  ]
}
```
Unlike standard upper-air presets, `ECMWF Rain12` simultaneously activates:
1. **High-resolution scalar raster rendering** (`showRaster: true`) with a **22-entry custom XML palette** (`/palettes/RAIN/dark-rain-24h.xml`), AND
2. **Smoothed contour lines + line-following symbol labels** (`showLine: true`, `showLabels: true`, `smooth: true`, `smoothIterations: 2`) on a noisy precipitation field (`1441 × 721 = 1,038,961` cells at $0.125^\circ$).

---

### 2.2 Root Cause C1: Main-Thread `2048 × 2048` (4.19M Pixel) Bilinear Interpolation + 22-Stop Linear Palette Scan + PNG Encoding (`rasterLayer.js` & `colormaps.js`)

In [`client/src/layers/rasterLayer.js:168-353`](file:///root/downloads/micaps-web/client/src/layers/rasterLayer.js#L168-L353), [`renderScalarRaster`](file:///root/downloads/micaps-web/client/src/layers/rasterLayer.js#L168) renders the grid to an HTML5 2D canvas on the main UI thread:

1. **4× Upscaling to `2048 × 2048` (4,194,304 pixels):**
   ```js
   // client/src/layers/rasterLayer.js:206-210
   const maxDim = 2048;
   const minDim = 360;
   const dLon = Math.abs(header.d_lon || header.LongitudeGridSpace || (lonSpan / nLon));
   const dLat = Math.abs(header.d_lat || header.LatitudeGridSpace || (latSpan / nLat));
   const targetWidth = Math.min(maxDim, Math.max(minDim, Math.ceil((lonSpan / dLon) * 4)));
   const targetHeight = Math.min(maxDim, Math.max(minDim, Math.ceil((latSpan / dLat) * 4)));
   ```
   For `ECMWF_HR/RAIN12` (`nLon = 1441`, `nLat = 721`), `(lonSpan / dLon) * 4` is `5760` and `(latSpan / dLat) * 4` is `2880`. Both clamp to `maxDim = 2048`, producing **`2048 × 2048 = 4,194,304` pixels** (`16.77 MB` of RGBA bytes).

2. **Per-Pixel 22-Stop Linear Search in `createColorResolver` (`colormaps.js:574-615`):**
   - [`dark-rain-24h.xml`](file:///root/downloads/micaps-web/client/palettes/RAIN/dark-rain-24h.xml#L1) has **22 stops** (`0.10` to `200.00`).
   - In [`colormaps.js:598-609`](file:///root/downloads/micaps-web/client/src/utils/colormaps.js#L598-L609):
     ```js
     for (let i = 0; i < palLen - 1; i++) {
       const p0 = palette[i];
       const p1 = palette[i + 1];
       if (val >= p0.val && val <= p1.val) {
         if (stepped) return [p0.r, p0.g, p0.b, p0.a];
         const t = (val - p0.val) / (p1.val - p0.val);
         ...
       }
     }
     ```
   - For every non-dry pixel among the 4,194,304 pixels, `resolveColor` linearly scans the palette array instead of using a pre-computed 1D LUT (e.g. a `Uint32Array(2048)` or binary search) and allocates a fresh 4-element JS array `[r, g, b, a]` on every interpolated pixel!
   - Even worse, dry/trace pixels (`0 <= val < 0.10`) still undergo 4-corner bilinear interpolation (`v00, v10, v01, v11`) before `resolveColor` checks `if (isRain && val < firstStopVal)`.

3. **Synchronous `canvas.toDataURL("image/png")` + MapLibre Texture Upload on Main Thread:**
   - At [`rasterLayer.js:304`](file:///root/downloads/micaps-web/client/src/layers/rasterLayer.js#L304), `const dataUrl = canvas.toDataURL("image/png");` synchronously compresses a `2048 × 2048` RGBA buffer into a base64 PNG string on the main thread, and `existingSource.updateImage({ url: dataUrl, coordinates })` then decodes that base64 PNG back into a bitmap.
   - Note: MapLibre GL supports a `"canvas"` source or raw WebGL texture / `ImageBitmap` (or drawing at native grid resolution $1441 \times 721$ with WebGL `raster-resampling: "linear"`, where the **GPU** performs bilinear interpolation in hardware for free instead of doing $4\times$ CPU supersampling + PNG encode/decode!).

---

### 2.3 Root Cause C2: Palette Cache-Key Mismatch Causes `ECMWF Rain12` to Render Twice on Initial Load (`presetLoader.js` vs. `weatherLoader.js`)

Look closely at how custom palettes are keyed in [`presetLoader.js`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L240-L264) vs. [`weatherLoader.js`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L224-L255):

1. In [`presetLoader.js:244-248`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L244-L248):
   ```js
   const palettePromises = group.layers.map(async (layer) => {
     const pPath = layer.palettePath || layer.config?.palettePath || layer.render?.palettePath;
     if (pPath && layer.id) {
       const paletteKey = `palette:${layer.id}`; // <-- "palette:rain12-ec"
       await loadCustomPalette(paletteKey, pPath);
   ```
   `presetLoader.js` registers the palette under **`"palette:rain12-ec"`** (`layer.id` from `config.json`).

2. Next, for primary layer `i === 0`, [`presetLoader.js:765`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L765) calls `loadWeatherField(model, element, targetLevel, targetPeriod, win, null, targetCycle)`.
3. Inside [`loadWeatherField` (`weatherLoader.js:176, 224-255`)](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L176):
   ```js
   const layerId = `contour-${model}-${element}-${targetLevel ?? 0}`; // <-- "contour-ECMWF_HR-RAIN12-0"
   ...
   const palettePath = existingLayer?.config?.palettePath || matchedPresetLayer?.palettePath || ...;
   let effectiveColormap = existingLayer?.colormap || matchedPresetLayer?.colormap || ...;
   if (palettePath) {
     const paletteKey = `palette:${layerId}`; // <-- "palette:contour-ECMWF_HR-RAIN12-0" != "palette:rain12-ec"!
     effectiveColormap = paletteKey;
     if (!getCustomPalette(paletteKey)) {
       loadCustomPalette(paletteKey, palettePath).then((entries) => {
         if (entries && entries.length > 0 && win.gridData) {
           ...
           if (curShowRaster) {
             renderScalarRaster(activeMap, win.gridData, element, { ... }); // <-- 2nd 2048x2048 RASTER RENDER!
           }
           renderContourLayers(activeMap, win.gridData, element, { ... }); // <-- 2nd FULL CONTOUR RENDER!
         }
       });
     }
   }
   ```
   Because `palette:contour-ECMWF_HR-RAIN12-0` **does not match** `palette:rain12-ec`:
   - `getCustomPalette(paletteKey)` returns `null`!
   - `loadWeatherField` proceeds to render the `2048 × 2048` raster ([`line 455`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L455)) and contours ([`line 501`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L501)) using the fallback colormap while `loadCustomPalette` fetches `/palettes/RAIN/dark-rain-24h.xml` again.
   - A few milliseconds later, `.then()` resolves and executes **a second full `2048 × 2048` `renderScalarRaster` pass and a second full `renderContourLayers` pass**!

---

### 2.4 Root Cause C3: Dual Full-Grid Network/Parse Pipeline (`JSON` + `Binary`) & Server-Side Per-Float Reflection Loop

1. **Duplicate Client Fetches (`fetchGridData` + `fetchGridBinaryStream`) for Every `showRaster: true` Layer:**
   - In [`weatherLoader.js:322-358`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L322-L358):
     ```js
     let gridPromise = fetchGridData(dataPath, file, targetLevel);
     let binaryPromise = null;
     if (wantRaster && !isWind && !isVortDiv) {
       binaryPromise = fetchGridBinaryStream(dataPath, file, targetLevel).catch(() => null);
     }
     const [rawGridData, binaryGridData] = await Promise.all([gridPromise, binaryPromise]);
     ```
   - `fetchGridData` downloads and `JSON.parse`s the **entire 1,038,961-float JSON payload** (~10–15 MB of text) on the main thread, while `fetchGridBinaryStream` downloads the **exact same 1,038,961 floats as a 4.15 MB `Float32Array` binary stream**!
   - Then at [`weatherLoader.js:449`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L449), `const rasterSourceData = binaryGridData || gridData;` uses `binaryGridData` for the raster and `gridData` (JSON) for `renderContourLayers` — even though `binaryGridData` already contains `{ header, values: Float32Array, stats }` which is 100% sufficient to construct `gridData` on the client without ever calling `/api/data/grid` JSON!

2. **Prefetch Multiplier (`prefetchService.js:317-321`):**
   - 150ms after `loadWeatherField` finishes, [`schedulePrefetch`](file:///root/downloads/micaps-web/client/src/services/prefetchService.js#L540) runs [`collectNwpItems`](file:///root/downloads/micaps-web/client/src/services/prefetchService.js#L264-L342):
     ```js
     items.push({ type: "grid", path, file, direction, level: lvl, period: targetPeriod });
     if (layer.render?.showRaster || hasRasterActive(element, model)) {
       items.push({ type: "binary", path, file, direction, level: lvl, period: targetPeriod });
     }
     ```
   - Notice two bugs here:
     - First, `hasRasterActive` ([`prefetchService.js:115-120`](file:///root/downloads/micaps-web/client/src/services/prefetchService.js#L115-L120)) checks `winLayers` from `win.activeGroup.layers` where the property is `layer.render.showRaster`, not `layer.config.showRaster`, while `collectNwpItems` checks `layer.render?.showRaster || hasRasterActive(...)`.
     - Second, for `ECMWF Rain12` (`layer.render.showRaster === true`), `prefetchSurroundingData` fires **both `fetchGridData` (JSON) and `fetchGridBinaryStream` (binary)** for the `left` and `right` periods concurrently!
     - Each prefetched `fetchGridData` parses another ~10–15 MB JSON response on the browser main thread while the user is interacting with the map.

3. **Server-Side CPU Spike (`grid_handler.go` & `parser/grid_data.go`):**
   - On the Go server, when the client requests `/api/data/grid` and `/api/data/grid/binary` simultaneously (plus 4 prefetch requests 150ms later):
   - `BlobSource.GetOrFetch` caches only the **compressed gzip blob** (1.4 MB), NOT the parsed `*model.GridResponse`.
   - Consequently, [`decodeGridPayload`](file:///root/downloads/micaps-web/server/handler/grid_handler.go#L194-L270) runs **separately for every request**, decompressing 4.15 MB of gzip data and parsing 1,038,961 `float32` values each time.
   - Worse, in [`EncodeBinaryStream` (`server/parser/grid_data.go:188-191`)](file:///root/downloads/micaps-web/server/parser/grid_data.go#L188-L191):
     ```go
     // Append raw float32 grid values
     for _, val := range resp.Values {
         binary.Write(&buf, binary.LittleEndian, val)
     }
     ```
     Calling `binary.Write` inside a `for` loop over **1,038,961 floats** invokes Go type-switch reflection and small buffer writes **1.04 million times per request**! And in `JSONHandler` ([`grid_handler.go:69`](file:///root/downloads/micaps-web/server/handler/grid_handler.go#L69)), `json.NewEncoder(w).Encode(gridResp)` formats 1,038,961 floats to ASCII decimal strings on every JSON request.

---

### 2.5 Root Cause C4: Heavy Contour Generation, Chaikin $4\times$ Vertex Amplification, Unconditional `countGeoJSONPoints`, and Duplicate MapLibre Source Serialization (`contourMapSync.js`)

For `ECMWF Rain12`, `showLine: true` and `showLabels: true` are enabled alongside `showRaster: true`. Every render (and every viewport pan/zoom via [`contourReRender.js:121-225`](file:///root/downloads/micaps-web/client/src/services/contourReRender.js#L121-L225)) executes [`renderContourLayers`](file:///root/downloads/micaps-web/client/src/layers/contour/contourMapSync.js#L279-L389):

1. **9 Rain Contour Levels Including `0.1mm` Trace Boundary:**
   - Even though `config.json` specifies `levels: [10, 15, 20, 25, 35, 50, 75, 100]`, if `resolveRenderLevels` falls back or when `0.1` is included, precipitation grids contain hundreds of small convective cells and noisy low-rain boundaries.
2. **2D Grid Convolution + Marching Squares + Douglas-Peucker + 2× Chaikin Smoothing:**
   - [`smoothGrid2D(Z, 1, 0.4)`](file:///root/downloads/micaps-web/client/src/utils/grid/smoothGrid2D.js#L20-L161) allocates two full 2D JS arrays (`new Array(nRows)`) and runs a 9-neighbor convolution.
   - `griddata.contour(Z, { x, y, levels })` runs Marching Squares across all levels.
   - [`smoothLines(isolineFC, smoothIterations = 2, step)`](file:///root/downloads/micaps-web/client/src/layers/contour/contourCompute.js#L46-L53) runs Douglas-Peucker simplification and then **2 iterations of Chaikin corner-cutting** ([`chaikin.js:27-115`](file:///root/downloads/micaps-web/client/src/utils/geometry/chaikin.js#L27-L115)). Each Chaikin iteration replaces every segment with 2 vertices (`[qx, qy], [rx, ry]`), multiplying the vertex count by **$4\times$** and allocating a new `[x, y]` 2-element array for every single vertex!
3. **Unconditional Full-Tree GeoJSON Traversals (`contourMapSync.js:359-362`):**
   ```js
   // client/src/layers/contour/contourMapSync.js:359-362
   const isobandPts = countGeoJSONPoints(isobandFC);
   const isolinePts = countGeoJSONPoints(isolineFC);
   const totalPts = isobandPts + isolinePts;
   const estimatedHeap = estimateHeapMB(isolineFC) + estimateHeapMB(isobandFC);
   ```
   Look at [`memStats.js:31-75`](file:///root/downloads/micaps-web/client/src/utils/memStats.js#L31-L75): `estimateHeapMB(fc)` **calls `countGeoJSONPoints(fc)` a second time internally**!
   So on **every single contour render and pan/zoom**, even when `isDebugMemEnabled()` is `false` and `options.onStats` is `undefined`, the main thread recursively traverses every coordinate of `isolineFC` and `isobandFC` **twice**!
4. **Duplicate GeoJSON Source `setData(isolines)` and Line-Symbol Placement (`contourMapSync.js:116, 157`):**
   - [`updateMapLibreContour`](file:///root/downloads/micaps-web/client/src/layers/contour/contourMapSync.js#L102-L205) maintains **two separate MapLibre GeoJSON sources** (`isoline-source` for the `line` layer and `isoline-label-source` for the `symbol` layer) and passes the **exact same `isolines` FeatureCollection** to `setData()` on **both** sources:
     ```js
     isolineSrc.setData(lineData);      // line 116
     ...
     isolineLabelSrc.setData(labelData); // line 157 (identical `isolines` object!)
     ```
   - MapLibre GL serializes and transfers each GeoJSON source independently to its background web workers, running `geojson-vt` vector tile slicing **twice** for the same geometry!
   - Both layers can share the single `isolineSrcId` source (`source: isolineSrcId` on `isolineLabelLayerId`), cutting GeoJSON worker serialization, memory, and `geojson-vt` indexing in half.

---

### 2.6 Root Cause C5: `TimeSlider.svelte` `$effect` + `enforceRainMinPeriodOnWindow` Double-Load Cascade on `RAIN12`

When the active window is at `period = 0`, `3`, or `6` (e.g. after viewing an analysis or 3h/6h forecast) and the user selects `ECMWF Rain12`:
1. In [`App.svelte:1349`](file:///root/downloads/micaps-web/client/src/App.svelte#L1349), `handleLoadData` calls `enforceRainMinPeriodOnWindow(win)` (which clamps `win.period` to `12`) and starts `loadPresetGroup`.
2. Simultaneously, in [`TimeSlider.svelte:111-141`](file:///root/downloads/micaps-web/client/src/components/TimeSlider.svelte#L111-L141):
   ```js
   let minRainHours = $derived.by(() => {
     const w = activeWin;
     if (!w || w.isObservation) return null;
     return getRainAccumulationHoursForWindow(w);
   });

   $effect(() => {
     const minH = minRainHours;
     if (minH === null || tl.mode !== "nwp") return;
     const curP = tl.discretePeriods[tl.currentPeriodIdx];
     if (curP !== undefined && Number(curP) < minH) {
       const validIdx = tl.discretePeriods.findIndex((p) => Number(p) >= minH);
       if (validIdx !== -1 && validIdx !== tl.currentPeriodIdx) {
         tl.currentPeriodIdx = validIdx;
         const nextPeriod = tl.discretePeriods[validIdx];
         if (activeWin) {
           activeWin.period = nextPeriod;
         }
         fireTimeChange({ ... });
       }
     }
   });
   ```
   Because `tl.currentPeriodIdx` still points to the old period (`< 12`) before `syncForecastTimeline` finishes its async catalog fetch, `TimeSlider.svelte`'s `$effect` triggers **mid-load**, mutates `tl.currentPeriodIdx`, and calls `fireTimeChange(...)` -> [`handleTimeChange`](file:///root/downloads/micaps-web/client/src/App.svelte#L1764) -> a **second concurrent `loadPresetGroup` / `loadWeatherField` call**!

---

### 2.7 Root Cause C6: Unthrottled `mousemove` Reactive Store Churn (`MapViewport.svelte` & `cursorProbe.svelte.js`)

In [`client/src/map/MapViewport.svelte:35-41`](file:///root/downloads/micaps-web/client/src/map/MapViewport.svelte#L35-L41):
```js
function onMapMouseMove(e) {
  if (!e || !e.lngLat) return;
  const { lng, lat } = e.lngLat;
  setSynchronizedCursor(winId, lng, lat);
  const win = getWindowById(winId);
  updateCursorProbe(lng, lat, win);
}
```
- Every raw `mousemove` event on the MapLibre canvas (60–240 times per second) synchronously:
  1. Updates `crosshairState` (`$state` store in [`crosshairSync.svelte.js`](file:///root/downloads/micaps-web/client/src/lib/stores/crosshairSync.svelte.js)), triggering `$effect` in all `MapViewport.svelte` instances;
  2. Searches `tabsState.tabs` via `getWindowById(winId)`;
  3. Calls [`updateCursorProbe`](file:///root/downloads/micaps-web/client/src/lib/stores/cursorProbe.svelte.js#L126-L208), which samples all visible grids (`win.layers`, `win.gridData`, `win.windGridData`) and mutates 4 reactive `$state` properties on `cursorProbeState`, triggering synchronous DOM updates in `StatusBar.svelte` at pointer-input frequency without `requestAnimationFrame` coalescing.

---

## Part 3: Concrete Fix Recommendations

### 3.1 Fixes for Issue 1 (False Positive Stale Tip)

1. **Never Fall Back `candidateFiles` Across Different Forecast Cycles, and Filter Catalog Tree by Cycle (`weatherLoader.js`, `catalog_queries.go`, `catalog_handler.go`):**
   - **Backend (`server/db/catalog_queries.go` & `server/handler/catalog_handler.go`):**
     - Support an optional `prefix` / `cycle` query parameter on `/api/catalog/tree` (or increase the NWP tree limit / filter by `column1 >= '<cycle>.' AND column1 <= '<cycle>.999'`) so requesting an older NWP cycle returns **all lead times for that cycle** instead of only the newest 100 files across all cycles.
   - **Frontend (`client/src/services/weatherLoader.js:181-182, 259-296`):**
     - Normalize `cycle` matching so both 8-digit (`YYMMDDHH`) and 10-digit (`YYYYMMDDHH`) filenames match:
       ```js
       const cycle8 = String(cycle).length === 10 ? String(cycle).slice(2) : String(cycle);
       const cycle10 = String(cycle).length === 8 ? `20${cycle}` : String(cycle);
       const cycleFiles = availableFiles.filter(
         (f) => f.startsWith(`${cycle}.`) || f.startsWith(`${cycle8}.`) || f.startsWith(`${cycle10}.`)
       );
       ```
     - **Critical:** When `cycleFiles.length === 0` (because the selected cycle is older than the top-100 catalog window or in Mock Mode), **do NOT set `candidateFiles = availableFiles` (which belongs to a different cycle!) and do NOT overwrite `file` to `${newestCycle}.${period}`**. Instead, keep `file = "${cycle}.${paddedPeriod}"` and synthesize `sampleTimes` for the selected cycle from `win.discretePeriods` (e.g. `(win.discretePeriods || [period]).map(p => `${cycle}.${String(p).padStart(3, "0")}`)`).
     - When `cycleFiles.length > 0` but `cycleFiles` was truncated at the bottom by `LIMIT 100` (e.g., `cycleFiles` has `.078..240` and is missing `.000`), do not snap `file` away from `${cycle}.${paddedPeriod}` unless the requested period truly does not exist for that model's cadence; include `${file}` in `sampleTimes` after `fetchGridData` succeeds!

2. **Force Fresh Catalog Fetch & Clear Stale `sampleTimes` and `wallClockCursor` on Preset Reload (`NavBar.svelte`, `appWorkflow.js`, `presetLoader.js`, `App.svelte`):**
   - **In [`appWorkflow.js:165-204` (`applyPresetToWindow`)](file:///root/downloads/micaps-web/client/src/lib/services/appWorkflow.js#L165-L204):**
     - Strip any cached `sampleTimes` and `obsFiles` from `groupCopy.layers` when applying a preset so reloads never short-circuit `fetchTree`:
       ```js
       if (Array.isArray(groupCopy.layers)) {
         for (const l of groupCopy.layers) {
           delete l.sampleTimes;
           delete l.obsFiles;
         }
       }
       ```
     - Unconditionally clear `win.wallClockCursor = null` (and `setWallClockCursor(null, win.id)` + `window.__MICAPS_CURSOR__ = null`) whenever `applyPresetToWindow` is called (even when `previousGroupId === groupCopy.id`!), so clicking `btn-reload-preset` resets the cursor to the newly fetched observation time.
   - **In [`presetLoader.js` (lines 328-341, 415-428, 540-561, 624-640)](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L540-L561):**
     - When `freshObsLoad === true`, **ignore** `layer.sampleTimes` / `layer.obsFiles` and call `fetchTree(obsPath, treeLimit, null, { bypassCache: true })` so every layer's `availableFiles` is refreshed from the server alongside `syncObservationTimeline`.

3. **Fix Tolerance Precedence and Missing NWP/Surface Tolerances (`client/src/utils/timeResolver.js`):**
   - In [`getDefaultToleranceForLayer` (`timeResolver.js:419-450`)](file:///root/downloads/micaps-web/client/src/utils/timeResolver.js#L419-L450):
     - Check element-specific tolerances (`PLOT_GLOBAL_3H: 180`, `RAIN6: 360`, `RAIN12: 360`, `RAIN24: 720`, `SLP: 180`) **before** the generic `if (model.includes("SURFACE") || type === "station") return DEFAULT_TOLERANCES.SURFACE;` check!
     - Add missing NWP models (`GRAPES_3KM: 180`, `GRAPES_MESO: 180`, `SHANGHAI_MR: 180`, `BEIJING_MR: 180`, `JAPAN_MR: 360`, `CMA_GFS: 360`, `NWFD_SCMOC: 360`) and NWP elements (`RAIN01: 60`, `RAIN03: 180`, `RAIN12: 360`, `RAIN24: 720`, `PRMSL: 360`, `CAPE: 360`, `K_INDEX: 360`, `TCWV: 360`, `SST: 360`) to `DEFAULT_TOLERANCES` (or fallback any `type === "contour"` / `type === "wind"` NWP layer with `cycle` format to `360` minutes instead of `60` minutes).

---

### 3.2 Fixes for Issue 2 (High CPU on `ECMWF Rain12`)

1. **Replace Per-Pixel 22-Stop Linear Palette Scan with a Pre-Computed LUT & Native Grid Resolution in `rasterLayer.js` / `colormaps.js`:**
   - **Pre-computed Color Lookup Table (LUT) in [`colormaps.js`](file:///root/downloads/micaps-web/client/src/utils/colormaps.js#L574-L615):**
     - In `createColorResolver`, pre-build a 4096-entry `Uint32Array` (or `Uint8ClampedArray`) LUT over `[effectiveMin, effectiveMax]` once before the pixel loop. Inside the inner pixel loop, map `val` to an integer LUT index in $O(1)$ with zero array allocations and zero stop-loop iterations, and skip bilinear interpolation entirely when all 4 surrounding grid corners (`v00, v10, v01, v11`) are `< firstStopVal` (`0.1mm` for rain).
   - **Render at Native Grid Resolution (1× instead of 4× CPU Supersampling) in [`rasterLayer.js:206-210`](file:///root/downloads/micaps-web/client/src/layers/rasterLayer.js#L206-L210):**
     - Change `Math.ceil((lonSpan / dLon) * 4)` to native grid dimensions `Math.min(1441, nLon)` × `Math.min(721, nLat)` ($1441 \times 721 = 1.04\text{M}$ pixels instead of $2048 \times 2048 = 4.19\text{M}$ pixels — a **$4\times$ pixel reduction**) and let MapLibre's WebGL shader (`"raster-resampling": "linear"`) perform the bilinear smoothing on the GPU at 60 FPS!

2. **Fix the Palette Cache-Key Mismatch to Eliminate the Duplicate Raster + Contour Render (`presetLoader.js` & `weatherLoader.js`):**
   - In [`weatherLoader.js:228`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L228) and [`presetLoader.js:244`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L244), key custom palettes by **canonical `palette:${palettePath}`** (or check `getCustomPalette(`palette:${matchedPresetLayer?.id}`)` before calling `loadCustomPalette`).
   - When `getCustomPalette` is already populated by `presetLoader.js`, `weatherLoader.js` will render once with the right palette immediately and never fire the duplicate `.then()` raster + contour render.

3. **Eliminate Dual `JSON + Binary` Grid Fetching & Fix `EncodeBinaryStream` on the Server (`weatherLoader.js`, `prefetchService.js`, `grid_data.go`):**
   - **Client (`weatherLoader.js:322-358` & `prefetchService.js:317-321`):**
     - When ` fetchGridBinaryStream` succeeds, construct `gridData` directly from `binaryGridData` (generating the 1D `x` and `y` coordinate arrays from `binaryGridData.header` in < 0.05ms) instead of also fetching and `JSON.parse`-ing `/api/data/grid` (~10–15 MB JSON)!
     - In `prefetchService.js`, fetch **either** `binary` (preferred for scalar grids) **or** `grid`, never both for the same layer.
   - **Server (`server/parser/grid_data.go:162-194`):**
     - Replace the 1.04M-iteration `for _, val := range resp.Values { binary.Write(&buf, binary.LittleEndian, val) }` loop in `EncodeBinaryStream` with a single pre-sized byte slice (`buf := make([]byte, 32 + len(resp.Values)*4)`) and `binary.LittleEndian.PutUint32(buf[offset:], math.Float32bits(val))` (or `unsafe.Slice`), reducing server binary encoding time from ~80–150ms of CPU per request to **< 1ms**!

4. **Optimize Contour Rendering (`contourMapSync.js`):**
   - **Gate `countGeoJSONPoints` & `estimateHeapMB` (`contourMapSync.js:359-362`):** Only call `countGeoJSONPoints` and `estimateHeapMB` when `isDebugMemEnabled() || typeof options.onStats === "function"`, and pass the already-counted `isolinePts` into `estimateHeapMB` instead of recounting.
   - **Share a Single GeoJSON Source Between Line and Label Layers (`contourMapSync.js:150-204`):** Point `isolineLabelLayerId` at `source: isolineSrcId` instead of creating a duplicate `isolineLabelSrcId` and calling `setData(isolines)` twice.
   - **Cap Chaikin Iterations When `showRaster: true` or High Feature Count:** When `showRaster: true` or `isolineFC.features.length > 300`, cap `smoothIterations` to `1` (2× vertices instead of 4×) and increase `dpTolerance` slightly so micro-cellular rain rings do not generate hundreds of thousands of vertices.

5. **Prevent `TimeSlider.svelte` `$effect` Double-Load Cascade & Throttle `mousemove` Probe:**
   - In [`TimeSlider.svelte:118-141`](file:///root/downloads/micaps-web/client/src/components/TimeSlider.svelte#L118-L141), if `activeWin.period` has already been updated to `>= minH` by `enforceRainMinPeriodOnWindow(activeWin)`, sync `tl.currentPeriodIdx` **silently** without calling `fireTimeChange(...)` a second time.
   - In [`MapViewport.svelte:35-41`](file:///root/downloads/micaps-web/client/src/map/MapViewport.svelte#L35-L41), coalesce `onMapMouseMove` updates inside `requestAnimationFrame` so `crosshairState` and `cursorProbeState` update at most once per display frame.

---

## Summary Table of Root Causes & Locations

| Issue | Root Cause | Primary File & Line References |
| :--- | :--- | :--- |
| **1A. Stale Tip on Old NWP Init** | `fetchTree(dataPath, 100)` + `ORDER BY column1 DESC LIMIT 100` returns only ~1.5 newest cycles while init dropdown lists 10 cycles | [`weatherLoader.js:123-124`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L123-L124), [`timelineMath.js:67`](file:///root/downloads/micaps-web/client/src/ui/timeline/timelineMath.js#L67), [`catalog_queries.go:322`](file:///root/downloads/micaps-web/server/db/catalog_queries.go#L322), [`timelineSync.js:40-94`](file:///root/downloads/micaps-web/client/src/utils/timelineSync.js#L40-L94) |
| **1A. Stale Tip on Old NWP Init** | `candidateFiles` falls back to `availableFiles` (newest cycle) when `cycleFiles` is `[]`, or snaps to truncated high lead times for `cycles[1]`, and overwrites `file` / `sampleTimes` | [`weatherLoader.js:181-182, 259-313, 389, 549`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L181-L182) |
| **1A / 1B. Tolerance Gaps** | Missing NWP models/elements (`RAIN12`, `GRAPES_3KM`, etc.) fallback to `60m`; `SURFACE`/`station` check (`90m`) shadows `PLOT_GLOBAL_3H` (`180m`) and `RAIN6` (`360m`) | [`timeResolver.js:32-57, 419-450`](file:///root/downloads/micaps-web/client/src/utils/timeResolver.js#L32-L57) |
| **1B. Stale Tip on `btn-reload-preset` (Surface)** | `NavBar.svelte` passes mutated `activeWin.activeGroup` with 6h-old `layer.sampleTimes`; `presetLoader.js` skips `fetchTree` when `layer.sampleTimes.length > 0` while `syncObservationTimeline` advances `win.obsTime` by +6h | [`NavBar.svelte:112, 448`](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte#L448), [`presetLoader.js:328, 415, 540-597, 624`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L540-L597), [`App.svelte:1395`](file:///root/downloads/micaps-web/client/src/App.svelte#L1395) |
| **1B. Stale Tip on `btn-reload-preset` (Surface)** | `applyPresetToWindow` only clears `win.wallClockCursor` when `previousGroupId !== groupCopy.id`, leaving old cursor active on same-preset reload | [`appWorkflow.js:196-203`](file:///root/downloads/micaps-web/client/src/lib/services/appWorkflow.js#L196-L203), [`WindowPanel.svelte:26, 45`](file:///root/downloads/micaps-web/client/src/components/WindowPanel.svelte#L26) |
| **2. High CPU (`ECMWF Rain12`)** | `2048 × 2048` (4.19M pixels) main-thread bilinear interpolation + 22-stop linear loop per pixel + synchronous `canvas.toDataURL("image/png")` | [`rasterLayer.js:206-312`](file:///root/downloads/micaps-web/client/src/layers/rasterLayer.js#L206-L312), [`colormaps.js:574-615`](file:///root/downloads/micaps-web/client/src/utils/colormaps.js#L574-L615), [`dark-rain-24h.xml`](file:///root/downloads/micaps-web/client/palettes/RAIN/dark-rain-24h.xml#L1) |
| **2. High CPU (`ECMWF Rain12`)** | Palette cache-key mismatch (`palette:rain12-ec` vs `palette:contour-ECMWF_HR-RAIN12-0`) causes duplicate `renderScalarRaster` + `renderContourLayers` on load | [`presetLoader.js:244`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L244), [`weatherLoader.js:228-255`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L228-L255) |
| **2. High CPU (`ECMWF Rain12`)** | Dual `JSON` + `Binary` full-grid fetches (plus 4x in `prefetchService`) and 1.04M-iteration `binary.Write` loop in Go server | [`weatherLoader.js:322-358`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L322-L358), [`prefetchService.js:317-321`](file:///root/downloads/micaps-web/client/src/services/prefetchService.js#L317-L321), [`grid_data.go:188-191`](file:///root/downloads/micaps-web/server/parser/grid_data.go#L188-L191) |
| **2. High CPU (`ECMWF Rain12`)** | 9-level rain contours + `smoothGrid2D` + 2× Chaikin ($4\times$ vertices) + unconditional `countGeoJSONPoints` + duplicate `setData` on 2 GeoJSON sources | [`contourMapSync.js:116, 157, 303-362`](file:///root/downloads/micaps-web/client/src/layers/contour/contourMapSync.js#L303-L362), [`chaikin.js:27-115`](file:///root/downloads/micaps-web/client/src/utils/geometry/chaikin.js#L27-L115), [`memStats.js:31-75`](file:///root/downloads/micaps-web/client/src/utils/memStats.js#L31-L75) |
| **2. High CPU (`ECMWF Rain12`)** | `TimeSlider.svelte` `$effect` + `enforceRainMinPeriodOnWindow` race triggers duplicate load when switching to `RAIN12` from `period < 12`; unthrottled `mousemove` probe | [`TimeSlider.svelte:118-141`](file:///root/downloads/micaps-web/client/src/components/TimeSlider.svelte#L118-L141), [`MapViewport.svelte:35-41`](file:///root/downloads/micaps-web/client/src/map/MapViewport.svelte#L35-L41) |

---

## Part 4: Cross-Preset Audit — Which Other Presets Have These Same Issues?

An exhaustive audit of all **183 loadable presets** (213 total layers after `expandRenderProfiles`) in [`client/config.json`](file:///root/downloads/micaps-web/client/config.json) shows that **neither issue is isolated to a single preset** — both stem from shared architectural paths in `presetLoader.js`, `weatherLoader.js`, `appWorkflow.js`, `timeResolver.js`, `rasterLayer.js`, and `contourMapSync.js`.

---

### 4.1 Other Presets Affected by Issue 1A (False Positive Stale Tip When Selecting an Old NWP Init Cycle)

**Total Affected: All 103 NWP & Hybrid Forecast Presets** (out of 106 non-observation presets; only the 3 single-station profile diagram presets `preset-ecmwf_time_height`, `preset-ecmwf_line_height`, `preset-ecmwf_hovmoller` bypass `loadWeatherField`).

| Category | Count | Preset IDs | Specific Failure Mode & Severity |
| :--- | :---: | :--- | :--- |
| **1. Standard NWP Presets with Missing Model/Element Tolerance (`60m` fallback)** | **55 presets** | • **ECMWF_HR (`35`):** `multi-model-rain12`, `preset-ecmwf_hr_rain03/06/24`, `snow03/06/12/24`, `frzr03/06/12/24`, `precip_type`, `prmsl`, `cape`, `cin`, `k_index`, `tcwv`, `2m_tmp`, `2m_dpt`, `2m_rh`, `10m_u`, `10m_v`, `100m_u`, `100m_v`, `max_temp2m`, `min_temp2m`, `skin_temp`, `soil_temp`, `soil_water`, `tot_cloud`, `low_cloud`, `mid_cloud`, `high_cloud`, `vis`, `albedo`, `sd`, `fg10_3h`, `fg10_6h`, `sst`, `astronomy_tide`<br>• **NWFD_SCMOC (`13`):** `preset-nwfd_scmoc_rain03`, `max_temp24`, `min_temp24`, `tmp_3h`, `rh_3h`, `wind_3h`, `hail`, `fog`, `haze`, `heavy_rainfall`, `sand`, `thunderstorm`, `precip_type`<br>• **GRAPES_3KM (`3`):** `preset-grapes_3km_rain01`, `snow01`, `asnow`<br>• **ECMWF_ENSEMBLE (`3`):** `preset-ecmwf_ens_prob_rain24_10`, `25`, `100`<br>• **FORECAST_PRODUCT (`1`):** `preset-nmc_10m_wind` | **Highest NWP Stale Sensitivity (`hard-stale` at `> 2h`):**<br>1. `fetchTree(dataPath, 100)` only covers the newest ~1.5 cycles while the init dropdown lists 10 cycles (`cycles[0..9]`).<br>2. Selecting `cycles[2..9]` yields `cycleFiles = []` -> `candidateFiles = availableFiles` (newest cycle) -> `file` is overwritten to newest cycle -> `resolveLayerTime` computes a 24h–108h mismatch.<br>3. Because neither their element nor model (`NWFD_SCMOC`, `ECMWF_ENSEMBLE_PRODUCT`, `FORECAST_PRODUCT`) is in `DEFAULT_TOLERANCES`, `getDefaultToleranceForLayer` falls back to `DEFAULT: 60` min (`hard-stale` at **`> 2h`** instead of `> 12h`), so even a 3-hour lead-time gap on `cycles[1]` triggers `hard-stale`! |
| **2. `GRAPES_3KM` Simulated Radar Reflectivity (`10m` radar tolerance misattribution)** | **1 preset** | `preset-grapes_3km_radar_refl_max` (`GRAPES_3KM/RADAR_COMBINATION_REFLECTIVITY/MAXIMUM`) | **Extreme Sensitivity (`hard-stale` at `> 20m`):**<br>Because `elem.includes("RADAR")` is checked first in [`timeResolver.js:436`](file:///root/downloads/micaps-web/client/src/utils/timeResolver.js#L436), this hourly NWP forecast (`001..036`h) is misclassified as a **10-minute observation radar** (`tolerance = 10m`, `hard-stale` at **`> 20m`**)! Any sub-hour offset or old-cycle selection immediately triggers `hard-stale`. |
| **3. Standard Upper-Air & Surface NWP Presets (`360m` model tolerance)** | **29 presets** | • **Multi-Layer Composites (`3`):** `composite-500hpa`, `composite-synoptic`, `composite-wind-stream`<br>• **ECMWF_HR (`9`):** `preset-ecmwf_hr_hgt`, `tmp`, `rh`, `spfh`, `wind`, `vvel`, `vor`, `div`, `10m_wind`<br>• **GRAPES_GFS (`4`):** `preset-grapes_gfs_hgt`, `tmp`, `rh`, `wind`<br>• **GRAPES_3KM (`13`):** `preset-grapes_3km_rain03/06/12/24`, `snow03/06/12/24`, `uh`, `dcape`, `shear600m`, `shear_angle600m`, `max_wind10m`, `max_ugrd10m`, `max_vgrd10m` | **High Sensitivity (`hard-stale` at `> 12h`):**<br>Same `fetchTree(dataPath, 100)` truncation (`weatherLoader.js:123-124, 181-182`). Selecting `cycles[1]` at low lead times (`000`–`072`) snaps to `.078`, and selecting `cycles[2..9]` falls back to `cycles[0]`, triggering `hard-stale` whenever the gap exceeds `2 × 360m = 12h`. |
| **4. NWP Derived Diagnostics (`/api/derived/ECMWF_HR/...`)** | **17 presets** | `composite-derived-stability`, `derived-ecmwf-k-index`, `derived-ecmwf-showalter`, `derived-ecmwf-lifted`, `derived-ecmwf-sweat`, `derived-ecmwf-tt`, `derived-ecmwf-shear`, `derived-ecmwf-thickness`, `derived-ecmwf-t850-500`, `derived-ecmwf-sfc-t-var-24h`, `derived-ecmwf-sfc-t-var-48h`, `derived-ecmwf-850-t-var-24h`, `derived-ecmwf-850-t-var-48h`, `derived-ecmwf-slp-var-24h`, `derived-ecmwf-slp-var-48h`, `recipe-nwp-variation-24h`, `recipe-nwp-variation-48h` | **Broken Catalog Path + `60m` Fallback Tolerance (`hard-stale` at `> 2h`):**<br>Their `path` is `/api/derived/ECMWF_HR/...`. In [`weatherLoader.js:124`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L124), `fetchTree("/api/derived/ECMWF_HR/...", 100)` queries a virtual REST path that does not exist in Cassandra `treeview` (always returns `[]`), leaving `sampleTimes = undefined`. And in [`presetLoader.js:235`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L235), `resolveLatestForecastCycle("ECMWF_HR", "K_INDEX", ...)` also queries `ECMWF_HR/K_INDEX` (which does not exist in `treeview`) before falling back to `HGT/500`. If `win.wallClockCursor` differs from `file` by `> 2h`, `resolveLayerTime` flags `hard-stale`. |
| **5. Multi-Time Hybrid Presets (`mode: "live"`)** | **1 preset** | `composite-convective-nowcast` (combines `SURFACE/PLOT_GLOBAL_3H` station + `ECMWF_HR/TMP` 850hPa contour) | Mixes a `SURFACE` station layer with an `ECMWF_HR` contour layer under `mode: "live"`. Because `presetLoader.js:233` sees `!group.isObservation` (`isObservation` is omitted on the group), it syncs the **NWP forecast timeline** first (`win.forecastCycle`), leaving `win.obsTime` unset until the second layer (`surface-obs-meso`) runs `syncObservationTimeline`, creating a cursor conflict between NWP valid time and surface observation time. |

---

### 4.2 Other Presets Affected by Issue 1B (False Positive Stale Tip / Frozen Time When Clicking `btn-reload-preset` After 6h)

**Total Affected: All 78 Observation & Hybrid Presets** across 4 distinct code paths:

| Code Path | Count | Preset IDs | What Happens When Clicking `btn-reload-preset` After 6h |
| :--- | :---: | :--- | :--- |
| **Path B1: Station, TlogP & Station+Derived Contour Presets (`presetLoader.js:540-561, 624-640`)** | **21 presets** | • **Surface (`13`):** `composite-surface`, `obs-surface-t-var-24h`, `obs-surface-t-var-48h`, `obs-surface-slp-var-24h`, `obs-surface-slp-var-48h`, `recipe-surface-variation-24h`, `recipe-surface-variation-48h`, `preset-surface_plot_all`, `preset-surface_plot_traffic`, `preset-surface_plot_traffic_5min`, `preset-surface_pres_change_3h`, `preset-surface_pres_change_24h`, `preset-surface_vis_1min`, `preset-surface_snow_depth`<br>• **Upper-Air (`4`):** `composite-upperair-500`, `composite-tlogp`, `obs-upperair-850-t-var-24h`, `obs-upperair-850-t-var-48h`<br>• **Marine (`1`):** `preset-marine_rocea_1h`<br>• **Satellite AMV (`2`):** `preset-fy2g_amv_ir1`, `preset-fy2g_amv_ir3`<br>• **Hybrid (`2`):** `composite-convective-nowcast`, `composite-radar-motion-compare` | **Exact Same Bug as `composite-surface`:**<br>1. Initial load mutates `layer.sampleTimes = availableFiles` onto `win.activeGroup.layers[i]`.<br>2. Clicking `btn-reload-preset` passes `activeWin.activeGroup` (with 6h-old `layer.sampleTimes`), and `applyPresetToWindow` preserves both `layer.sampleTimes` and `win.wallClockCursor`.<br>3. `presetLoader.js:540, 624` sees `layer.sampleTimes.length > 0` and **skips `fetchTree`**, while `syncObservationTimeline` advances `win.obsTime` to $T_0 + 6\text{h}$.<br>4. `resolveLayerTime` snaps `targetFile` back to $T_0$ and reports `-360m` (`hard-stale` after **1h** for Satellite AMV & Radar Motion `30m` tolerance; after **3h** for all 14 Surface & Marine presets `90m` tolerance; `soft-stale` at 6h / `hard-stale` at 12h for Upper-Air `360m` tolerance). |
| **Path B2: Standalone Derived Observation Contour Presets (`presetLoader.js:324-497`)** | **24 presets** | • **Sounding Derived (`20`):** `composite-upperair-derived`, `derived-sounding-k`, `derived-sounding-si`, `derived-sounding-li`, `derived-sounding-sweat`, `derived-sounding-tt`, `derived-sounding-cape`, `derived-sounding-t850-500`, `derived-sounding-shear`, `derived-diag-sounding-k`, `derived-diag-sounding-si`, `derived-diag-sounding-li`, `derived-diag-sounding-sweat`, `derived-diag-sounding-tt`, `derived-diag-sounding-cape`, `derived-diag-sounding-cin`, `derived-diag-sounding-t850-500`, `derived-diag-sounding-shear`, `derived-diag-sounding-850-t-var-24h`, `derived-diag-sounding-850-t-var-48h`<br>• **Surface Derived (`4`):** `derived-diag-surface-t-var-24h`, `derived-diag-surface-t-var-48h`, `derived-diag-surface-slp-var-24h`, `derived-diag-surface-slp-var-48h` | **Double Bug (Stale `layer.sampleTimes` + Invalid `obsPath` in `fetchTree`):**<br>1. Has the exact same `if (Array.isArray(layer.sampleTimes) && layer.sampleTimes.length > 0)` skip at [`presetLoader.js:329, 416`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L329) and `layer.sampleTimes = availableFiles` mutation at lines `344, 431`.<br>2. Worse: `obsPath` at lines `326, 413` is set to `layer.path` = **`/api/derived/UPPER_AIR/PLOT/...`** or **`/api/derived/SURFACE/...`** (a virtual API endpoint, not a Cassandra `dataPath` like `UPPER_AIR/PLOT/850` or `SURFACE/PLOT_GLOBAL_3H`)! Thus `fetchTree(obsPath)` and `syncObservationTimeline(obsPath)` query a non-existent `dataPath` in `treeview`!<br>3. Furthermore, lines `381-406` and `468-495` call `analyzeAndRenderSoundingElementContour` / `analyzeAndRenderSurfaceContours` **without passing `sampleTimes`, `resolved`, `status`, or `isHardStale` in `cfg`** (unlike lines `297-302` and `315-320` for station-attached derived layers). |
| **Path B3: Radar (`SWAN_PRODUCT`), Satellite (`SATELLITE`), and `CLDAS` Grid Observation Presets (`weatherLoader.js:158-228`)** | **25 presets** | • **SWAN Radar (`14`):** `preset-swan_mcr`, `mtop`, `mvil`, `qpe6min`, `qpe60`, `tdmosaic`, `cotrec`, `ref_fst`, `hail_fst`, `windy_fst`, `qpf_fst`, `gd_ref_fst`, `swi_2500`, `swi_4500`<br>• **Satellite (`6`):** `preset-fy4b_china_grouped`, `fy4b_disk_grouped`, `fy2g_ctt`, `fy2g_qpe001`, `fy2g_qpe003`, `fy2g_qpe006`<br>• **CLDAS (`5`):** `preset-cldas_rain01`, `apcp_10min`, `tmp_2m`, `vis`, `wind_10m` | **Reload Completely Ignores New Server Files (Stuck at $T_0$) + Stale Cursor:**<br>1. These 25 presets have `type: "contour"` or `"wind"`, so `presetLoader.js:510` delegates them to `loadWeatherField` with `obsFile: win?.obsTime || win?.obsFile` ($T_0$).<br>2. For the **5 `CLDAS` presets**, `isObservationProduct` in [`weatherLoader.js:57-63`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L57-L63) only checks `customOptions?.isObservation || win?.isObservation || model === "SWAN_PRODUCT" || model === "SATELLITE"`. When loaded via `loadWeatherField` directly (e.g. level/time step), `model === "CLDAS"` is **missing from `isObservationProduct`**!<br>3. Worse, for **all 25 presets**, look at [`weatherLoader.js:164`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L164):<br>`const freshObsLoad = !isTimeStep && !win?._obsTimeline && !win?.obsTime;`<br>Because `applyPresetToWindow` does **not** clear `win.obsTime` or `win._obsTimeline` when reloading an observation preset, `freshObsLoad` is **`false`** when clicking `btn-reload-preset`! Consequently, `syncObservationTimeline` is called with `forceLatest: false` and `currentFile = T_0`, and [`weatherLoader.js:210-212`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L210-L212) selects `file = targetFile` ($T_0$)! Clicking `btn-reload-preset` after 6h **reloads the 6-hour-old $T_0$ file instead of the new latest observation**, and if $T_0$ aged out of `candidateFiles` while `win.wallClockCursor` stayed at $T_0$, `WindowPanel` / `LayersPanel` shows **`hard-stale`**! |
| **Path B4: Event, Profiler, and Image Observation Presets (`presetLoader.js:696-717`)** | **8 presets** | • **Event (`5`):** `preset-swan_tvs`, `preset-swan_hail`, `preset-swan_gale`, `preset-surface_lightning_10min`, `preset-surface_lightning_1h`<br>• **Profiler (`2`):** `preset-wind_profiler_rad`, `preset-wind_profiler_robs`<br>• **Image (`1`):** `preset-fy2g_dust` | **Stale `win.wallClockCursor` on Same-Preset Reload + Missing `sampleTimes` on Layer:**<br>1. In [`appWorkflow.js:201-203`](file:///root/downloads/micaps-web/client/src/lib/services/appWorkflow.js#L201-L203), `win.wallClockCursor` is only cleared if `previousGroupId !== groupCopy.id`. If the user stepped or scrubbed the timeline at $T_0$ and clicks `btn-reload-preset` 6h later, `syncObservationTimeline` (`presetLoader.js:698, 704, 710`) updates `win.obsTime` and `layer.file` to $T_0 + 6\text{h}$, while `win.wallClockCursor` stays at $T_0$.<br>2. Because `eventLayer.js`, `profilerLayer.js`, and `imageLayer.js` register the layer with `file: T_0 + 6h` (and no `sampleTimes`), `resolveLayerTime` in `WindowPanel.svelte` / `LayersPanel.svelte` compares `layer.file` ($T_0 + 6\text{h}$) against `effectiveCursor` ($T_0$), producing a **`+360m` `hard-stale` warning**! |

---

### 4.3 Other Presets Affected by Issue 2 (High CPU)

| High-CPU Mechanism | Count | Affected Preset IDs | Why CPU Spikes |
| :--- | :---: | :--- | :--- |
| **1. `showRaster: true` (`2048 × 2048` Main-Thread Bilinear Interpolation + Linear Palette Scan + PNG `toDataURL` + Dual JSON/Binary Fetch)** | **30 contour presets** (+ 3 event presets where `showRaster` is ignored) | • **NWP (`13`):** `multi-model-rain12`, `preset-ecmwf_hr_precip_type`, `preset-grapes_3km_radar_refl_max`, `preset-nwfd_scmoc_hail`, `preset-nwfd_scmoc_fog`, `preset-nwfd_scmoc_haze`, `preset-nwfd_scmoc_heavy_rainfall`, `preset-nwfd_scmoc_sand`, `preset-nwfd_scmoc_thunderstorm`, `preset-nwfd_scmoc_precip_type`, `preset-ecmwf_ens_prob_rain24_10`, `preset-ecmwf_ens_prob_rain24_25`, `preset-ecmwf_ens_prob_rain24_100`<br>• **SWAN Radar (`11`):** `preset-swan_mcr`, `preset-swan_mtop`, `preset-swan_mvil`, `preset-swan_qpe6min`, `preset-swan_qpe60`, `preset-swan_tdmosaic`, `preset-swan_ref_fst`, `preset-swan_hail_fst`, `preset-swan_windy_fst`, `preset-swan_qpf_fst`, `preset-swan_gd_ref_fst`<br>• **Satellite (`6`):** `preset-fy4b_china_grouped`, `preset-fy4b_disk_grouped`, `preset-fy2g_ctt`, `preset-fy2g_qpe001`, `preset-fy2g_qpe003`, `preset-fy2g_qpe006` | All 30 presets execute [`renderScalarRaster`](file:///root/downloads/micaps-web/client/src/layers/rasterLayer.js#L168-L353) at up to `2048 × 2048` (4.19M pixels) on the main thread, encode a multi-MB PNG via `canvas.toDataURL("image/png")`, and trigger dual `/api/data/grid` (JSON) + `/api/data/binary` (binary) downloads in both `weatherLoader.js` and `prefetchService.js`.<br>**Note:** Any preset where the user toggles **"Show Raster"** on or selects a custom XML palette in `LayerRow.svelte` also enters this exact path (including the C2 palette cache-key mismatch in `weatherLoader.js:228`). |
| **2. Ultra-Dense `GRAPES_3KM` Grids (`2501 × 1671 = 4,179,171` cells — $4\times$ larger than `ECMWF_HR`)** | **17 presets** | `preset-grapes_3km_rain01`, `rain03`, `rain06`, `rain12`, `rain24`, `snow01`, `snow03`, `snow06`, `snow12`, `snow24`, `asnow`, `radar_refl_max`, `uh`, `dcape`, `shear600m`, `shear_angle600m`, `max_wind10m`, `max_ugrd10m`, `max_vgrd10m` | `GRAPES_3KM` grids contain **4,179,171 float32 values** (`16.7 MB` raw binary, `~40–50 MB` JSON string).<br>1. On the Go server, `EncodeBinaryStream` executes **4.18 million `binary.Write` reflection calls** per binary request.<br>2. On the client, `fetchGridData` parses ~45 MB of JSON arrays.<br>3. On every load and every map pan/zoom (`moveend`), `smoothGrid2D` + Marching Squares `contourf`/`contour` + 2× Chaikin smoothing run on a 3km mesoscale grid with thousands of convective cells. |
| **3. Noisy Precipitation / Mesoscale Fields with `showLine: true` + `smooth: true` (`smoothIterations: 2`)** | **21 rain/snow/frzr presets** (and **108 contour presets** overall with `showLine: true`) | • **ECMWF_HR (`12`):** `multi-model-rain12`, `preset-ecmwf_hr_rain03/06/24`, `snow03/06/12/24`, `frzr03/06/12/24`<br>• **GRAPES_3KM (`11`):** `preset-grapes_3km_rain01/03/06/12/24`, `snow01/03/06/12/24`, `asnow`<br>• **NWFD_SCMOC (`1`):** `preset-nwfd_scmoc_rain03`<br>• **CLDAS (`2`):** `preset-cldas_rain01`, `preset-cldas_apcp_10min`<br>• **Multi-Layer Composites:** `composite-500hpa`, `composite-synoptic`, `composite-derived-stability`, `composite-surface` | Discontinuous precipitation/convective fields produce hundreds to thousands of closed micro-contours. `smoothGrid2D` + 2× Chaikin ($4\times$ vertices) + unconditional `countGeoJSONPoints` & `estimateHeapMB` double traversal + duplicate `setData()` on `isoline-source` and `isoline-label-source` (`contourMapSync.js:157, 359-362`) run on every load and every `moveend` viewport re-render. |
| **4. `TimeSlider.svelte` `$effect` Double-Load Cascade (`getRainAccumulationHoursForWindow`)** | **23 presets** | All presets matching `/RAIN_?(\d+)/i`, `/SNOW_?(\d+)/i`, `/FRZR_?(\d+)/i`, `/APCP_?(\d+)/i`, or `rain(3|6|12|24)` in [`rain12.js:17-53`](file:///root/downloads/micaps-web/client/src/utils/rain12.js#L17-L53):<br>• `multi-model-rain12`<br>• `preset-ecmwf_hr_rain03/06/24`, `snow03/06/12/24`, `frzr03/06/12/24`<br>• `preset-grapes_3km_rain01/03/06/12/24`, `snow01/03/06/12/24`<br>• `preset-nwfd_scmoc_rain03`<br>• `preset-ecmwf_ens_prob_rain24_10/25/100` | Whenever the window's current `period` is less than the preset's accumulation window (e.g., switching from `period = 0` or `3` to a 6h/12h/24h rain, snow, or freezing-rain preset), `enforceRainMinPeriodOnWindow` in `App.svelte:1349` and the reactive `$effect` in `TimeSlider.svelte:118-141` race and trigger **two concurrent `loadPresetGroup` / `loadWeatherField` executions**. |
| **5. High-Density Surface Station Plot (`> 60,000` AWS Stations)** | **3 presets** | `preset-surface_plot_all` (`SURFACE/PLOT_ALL`), `preset-surface_plot_traffic`, `preset-surface_plot_traffic_5min` | `SURFACE/PLOT_ALL` contains tens of thousands of automatic weather stations per file (14 MB Diamond 3 payload), causing heavy main-thread station parsing, spatial decluttering, and GeoJSON symbol feature generation on load and zoom. |

