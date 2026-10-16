# Root-Cause Analysis & Fix Suggestions for `menu-addition-plan1` (Radar, Satellite & Profiler Products)

> [!IMPORTANT]
> This document details the root causes why most Radar, Satellite, and Wind Profiler products introduced in `menu-addition-plan1` fail or degrade in production (`bore.pub:59043`), along with concrete code-level fix suggestions. No source files were modified to produce this report.

---

## 1. Executive Summary & Live Product Status Matrix

A live end-to-end audit against the Cassandra backend (`bore.pub:59043`) and client/server codebases revealed that **11 distinct bugs across 4 architectural layers** (filename/timeline resolution, observation preset loading & multi-channel routing, CQL transport & binary parsing, and colormap/canvas rendering) combine to break or severely degrade every radar, satellite, and profiler preset added in `menu-addition-plan1`.

### Product Status Matrix (Current Implementation)

| Category | Menu Product | Data Path(s) | Server HTTP Status (Live `bore.pub:59043`) | Client Rendering & UX Status | Root Causes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Radar (SWAN)** | **MCR (组合反射率)** | `SWAN_PRODUCT/LOCAL/GD/MCR` | `200 OK` (1.26M cells, ~1.2s) | **Degraded**: Renders **oldest** file in catalog (`candidateFiles[0]`), draws **red diagonal stale hatch lines** at 35% opacity, empty timeline (`tl.obsFiles = []`), freezes on pan/zoom, `-32.5 dBZ` clear-air sentinel skews stats/edges | RC-1, RC-2, RC-3, RC-9, RC-10 |
| **Radar (SWAN)** | **ECHO_TOP (回波顶高)** | `SWAN_PRODUCT/LOCAL/GD/ECHO_TOP` | `200 OK` (1.26M cells, ~1.1s) | **Degraded**: Renders oldest file, red stale hatch lines + 35% opacity, empty timeline, dynamic palette scaling instead of fixed physical scale, pan/zoom lag | RC-1, RC-2, RC-3, RC-9, RC-10 |
| **Radar (SWAN)** | **VIL (液态水含量)** | `SWAN_PRODUCT/LOCAL/GD/VIL` | `200 OK` (1.26M cells, ~1.1s) | **Degraded**: Renders oldest file, red stale hatch lines + 35% opacity, empty timeline, dynamic palette scaling instead of fixed physical scale, pan/zoom lag | RC-1, RC-2, RC-3, RC-9, RC-10 |
| **Radar (SWAN)** | **QPE (定量降水估计)** | `SWAN_PRODUCT/LOCAL/GD/QPE` | `200 OK` (1.26M cells, ~1.2s) | **Degraded**: Renders oldest file, red stale hatch lines + 35% opacity, empty timeline, dynamic palette scaling | RC-1, RC-2, RC-3, RC-9, RC-10 |
| **Radar (SWAN)** | **EXTRAPOLATION_IUM (反射率外推)** | `SWAN_PRODUCT/LOCAL/GD/EXTRAPOLATION_IUM` | `200 OK` (1.26M cells, ~1.1s) | **Broken**: Cannot parse `.F006`..`.F120` lead times; falls back to `.F006` of oldest run with red stale hatch lines; no way to step forecast frames | RC-1, RC-2, RC-3, RC-9, RC-10 |
| **Radar (SWAN)** | **QPF (定量降水预报)** | `SWAN_PRODUCT/LOCAL/GD/QPF` | `200 OK` (1.26M cells, ~0.8s) | **Broken**: Cannot parse `.F030`..`.F360` lead times; falls back to oldest file with red stale hatch lines; no way to step forecast frames | RC-1, RC-2, RC-3, RC-9, RC-10 |
| **Radar (SWAN)** | **COTRECWIND (TREC风场)** | `SWAN_PRODUCT/LOCAL/GD/COTRECWIND` | `200 OK` (1.26M `u`/`v` cells, ~3.4s) | **Completely Broken**: `isWind` evaluates to `false` (`element === "LOCAL/GD/COTRECWIND" !== "WIND"`), so wind barbs/streamlines are **never rendered**; shows blank/scalar fallback with red stale hatch lines | RC-1, RC-3, **RC-4**, RC-10 |
| **Radar (SWAN)** | **TDMOSAIC (三维反射率拼图)** | `SWAN_PRODUCT/LOCAL/GD/TDMOSAIC` | `200 OK` (3.99M cells, ~1.2s) | **Broken**: Level UI hardcodes `[1000..100]` hPa instead of `[500..19000]` m; renders oldest file with red stale hatch lines; 3.99M cell grid freezes main thread on load and pan/zoom | RC-1, RC-3, **RC-6**, RC-9, **RC-10** |
| **Radar (SWAN)** | **TITAN / TVS (风暴追踪 / 龙卷涡旋)** | `SWAN_PRODUCT/LOCAL/GD/TITAN`, `TVS` | `200 OK` | **Degraded**: Latest file loads via server `file=latest`, but timeline (`tl.obsFiles`) is never synced (`[]`), so user cannot view or scrub historical frames | RC-1, RC-2, RC-3 |
| **Satellite (FY-4B)** | **FY-4B CHINA (中国区全通道 C001–C015)** | `SATELLITE/FY4B/L1/CHINA` | **C012**: `200 OK` (~2.0s)<br>**C001–C011, C013–C015**: **`404 Not Found`** (client bug) / **`500 Timeout`** on C001–C003 (7.8–9.6 MB blobs) | **Broken**: Client fetches tree without `level` (getting `C012_*.AWX` names) and queries `C001`..`C015` with `C012_*.AWX` -> **404 on 14 of 15 channels**. Level bar only shows `[1000..100]` hPa. Even C012 renders oldest file with red stale hatch lines | RC-1, RC-3, **RC-5**, **RC-6**, **RC-7**, RC-8, RC-10 |
| **Satellite (FY-4B)** | **FY-4B DISK (全圆盘全通道 C001–C015)** | `SATELLITE/FY4B/L1/DISK` | **All channels fail or timeout**: C001–C011, C013–C015 **`404`** from client filename mismatch; server blobs are **2.1–50.2 MB** (`13001×14001` on C001–C003 -> 160 MB JSON) causing **30s+ CQL lockups** | **Completely Broken**: Every channel fails via 404 (wrong channel prefix in filename) or 30s–60s CQL timeout; CQL mutex blocks all other requests during timeout retry; outer space pixels (`dn=0`/`255`) unmasked | RC-1, RC-3, **RC-5**, **RC-6**, **RC-7**, **RC-8**, RC-10 |
| **Satellite (FY-2G)** | **FY-2G CTT (云顶温度)** | `SATELLITE/FY2G/L2/CTT` | `200 OK` (1.0M cells, ~0.8s) | **Visually Broken**: 46% of grid (clear-sky pixels with `rawVal = -10`) is not masked to `-9999` and paints as **opaque white (`180 K`)** covering all of China/East Asia, plus red stale hatch lines | RC-1, RC-3, **RC-8**, RC-10 |
| **Satellite (FY-2G)** | **FY-2G QPE001 / QPE003 / QPE006** | `SATELLITE/FY2G/L2/QPE001`, `QPE003`, `QPE006` | `200 OK` (1.0M cells, ~0.8s) | **Visually Broken**: `0.0 mm` non-raining pixels (91% of grid) are not transparent because `isRainElement` misses `QPE` and `DEFAULT_COLORMAPS.QPE[0]` has alpha `200`, painting the **entire domain opaque green** with red stale hatch lines | RC-1, RC-3, **RC-9**, RC-10 |
| **Satellite (FY-2G)** | **FY-2G AMV IR1 / WV (云导风)** | `SATELLITE/FY2G/L2/AMV/IR1`, `WV` | `200 OK` on `file=latest` (~1.9s); **`404`** when timeline steps | **Broken**: `syncObservationTimeline` rejects `.AWX` files and substitutes fake `20260828*.000` mock files -> stepping timeline triggers **404**. Also omits `&level=`, dumping all 13,602 wind barbs across all pressure layers at once | RC-1, **RC-2**, **RC-6** |
| **Satellite (FY-2G)** | **FY-2G DUST (沙尘图像)** | `SATELLITE/FY2G/L2/DUST` | `200 OK` on `file=latest` (`image/bmp`) | **Degraded**: Initial BMP renders, but timeline (`tl.obsFiles`) is never synced (`[]`), so historical frames (`FY2G_DST_DUSTID_*.BMP`) cannot be browsed | RC-1, RC-2, RC-3 |
| **Profiler** | **WIND_PROFILER RAD / ROBS (风廓线雷达)** | `WIND_PROFILER/RAD/54511`, `WIND_PROFILER/ROBS/54511` | **RAD/54511**: **`404 Not Found`** (Cassandra uses `AH001`, not WMO `54511`)<br>**ROBS/54511**: `200 OK` | **Completely Blank**: `ProfilerHandler` returns JSON keys `station_id`, `obs_time`, `wind_speed`, `wind_dir`, whereas `profilerLayer.js` reads `station`, `file`, `speed`, `dir` (`lvl.speed === undefined` skips 100% of levels) | **RC-11** |

---

## 2. Why Automated Verification Missed These Failures

1. **`TestManifestAllPathsResolvable` ([server/handler/manifest_test.go](file:///root/downloads/micaps-web/server/handler/manifest_test.go#L54-L90)) runs in `MockMode: true` with `file=latest`**:
   - In `MockMode`, `GridHandler`, `StationHandler`, `EventHandler`, `ImageHandler`, and `ProfilerHandler` return synthetic mock structs before touching `CQLClient`, filename resolution, decompression, or binary parsers (`awx_parser.go`, `diamond131_parser.go`, `swan_text_parser.go`).
2. **`TestLiveSmoke` ([server/handler/manifest_live_test.go](file:///root/downloads/micaps-web/server/handler/manifest_live_test.go#L56-L73)) only checks metadata (`GetLatestCycle` / `GetFileList`)**:
   - It never calls `db.GetBlob`, never tests `/api/data/grid` or `/api/data/profiler`, never verifies that multi-level paths (`FY4B/L1/CHINA` across `C001..C015`) resolve matching filenames, and never exercises client-side `parseTimestamp` or `loadWeatherField`.

---

## 3. Detailed Root Causes & Fix Suggestions

### RC-1: `parseTimestamp()` Rejects All Radar & Satellite Filenames

- **Affected Files**:
  - [`parseTimestamp`](file:///root/downloads/micaps-web/client/src/utils/timeResolver.js#L166-L280)
- **Root Cause**:
  Real filenames in Cassandra for radar and satellite products have product/channel prefixes, underscores, lead-time suffixes, and multi-part extensions:
  - SWAN Radar: `Z_OTHE_RADAMCR_20261016030000.BIN.BZ2`, `Z_IUM_CRF_20261016030000.F120.BIN.BZ2`, `Z_TREC_20261016030000.BIN.BZ2`, `Z_RFST_20261016030000.F054.BIN.BZ2`, `Z_SWAN_TVS_NOWACASTING_20261016030000.TXT`
  - FY-4B L1: `C012_20261016104500_FY4B.AWX`, `C001_20261016104500_FY4B.AWX`
  - FY-2G L2: `CTT_MLT_OTG_20261016_1000_FY2G.AWX`, `PRE_001_OTG_20261016_1000_FY2G.AWX`, `AMV_IR1_OTG_20261016_0730_FY2G.AWX`, `FY2G_DST_DUSTID_20261016_0200.BMP`

  In [`timeResolver.js`](file:///root/downloads/micaps-web/client/src/utils/timeResolver.js#L172-L202):
  1. Line 172 checks `if (str.includes("T") || str.includes("-"))`. Because `"Z_OTHE_..."`, `"Z_TREC_..."`, `"CTT_MLT_OTG_..."`, `"FY2G_DST_DUSTID_..."` all contain the uppercase letter `"T"`, they enter the ISO-8601 branch, fail `Date.parse(str)`, and fail the strict regex `/^(\d{4})-(\d{2}).../`.
  2. Line 196 splits on `.` (`const clean = parts[0]`), and lines 202–264 require `clean` to consist **purely of digits** (`/^\d{14}$/`, `/^\d{12}$/`, `/^\d{10}$/`, `/^\d{8}$/`).
  3. Consequently, `parseTimestamp()` returns `null` for **100% of radar and satellite filenames**. Downstream, [`resolveLayerTime()`](file:///root/downloads/micaps-web/client/src/utils/timeResolver.js#L351-L361) drops all `sampleEntries`, returning `sampleFile: null`, `status: "hard-stale"`, and `isHardStale: true`.
  4. Note on timezones: SWAN (`Z_OTHE_RADAMCR_20261016030000.BIN.BZ2`) and FY-2G (`CTT_MLT_OTG_20261016_1000_FY2G.AWX`) filenames in this system use **UTC** timestamps, whereas FY-4B (`C012_20261016104500_FY4B.AWX`) uses **BJT (UTC+8)** (at 03:00 UTC, FY-4B is `104500` while SWAN is `030000`). Furthermore, SWAN extrapolation files (`Z_IUM_CRF_20261016030000.F120.BIN.BZ2`, `Z_RFST_20261016030000.F054.BIN.BZ2`) contain a **minute-based** lead time `.F120` (120 minutes) / `.F054` (54 minutes).

- **Fix Suggestion**:
  1. Tighten the ISO-8601 check in [`parseTimestamp`](file:///root/downloads/micaps-web/client/src/utils/timeResolver.js#L172) from `if (str.includes("T") || str.includes("-"))` to `/\d{4}-\d{2}-\d{2}[T\s]\d{2}/.test(str)`.
  2. When `clean` is not purely digits, extract embedded timestamps via regex patterns before giving up:
     - 14-digit embedded timestamp: `/(?:^|[_.-])((?:19|20)\d{12})(?:[_.-]|$)/` (matches `Z_OTHE_RADAMCR_20261016030000.BIN.BZ2`, `C012_20261016104500_FY4B.AWX`, etc.).
     - 8+4 digit underscore-separated timestamp: `/(?:^|[_.-])((?:19|20)\d{6})_(\d{4})(?:[_.-]|$)/` (matches `CTT_MLT_OTG_20261016_1000_FY2G.AWX`, `FY2G_DST_DUSTID_20261016_0200.BMP`, treating `YYYYMMDD_HHmm` as `YYYYMMDDHHmm00`).
     - For SWAN forecast files with `.F(\d{3})\.` (e.g. `.F006.BIN.BZ2`..`.F360.BIN.BZ2`), parse the `.Fxxx` token as **minutes** (`leadMinutes * 60_000` ms) rather than hours when computing valid time.

---

### RC-2: Observation Timeline Sync & Stepper Assume 14-Digit `.000` Filenames at Index `0`

- **Affected Files**:
  - [`syncObservationTimeline`](file:///root/downloads/micaps-web/client/src/utils/timelineSync.js#L186-L202)
  - [`filterObsFilesByStep` and `findClosestFile`](file:///root/downloads/micaps-web/client/src/ui/timeline/timelineMath.js#L29-L90)
  - [`stepCycleHours`](file:///root/downloads/micaps-web/client/src/lib/stores/tabsCore.js#L235-L275)
- **Root Cause**:
  1. In [`timelineSync.js` line 192](file:///root/downloads/micaps-web/client/src/utils/timelineSync.js#L192):
     ```javascript
     const hasObsFormat = validFiles.some((f) => f.length >= 14 && f.endsWith(".000"));
     const obsList = hasObsFormat ? validFiles : DEFAULT_MOCK_OBS_FILES;
     ```
     Because `.AWX`, `.BIN.BZ2`, `.TXT`, and `.BMP` do not end with `.000`, `hasObsFormat` is `false` and `syncObservationTimeline()` replaces real Cassandra filenames with `DEFAULT_MOCK_OBS_FILES` (`["20260828080000.000", ...]`)!
     For `FY-2G AMV` (`layer.type === "station"`), stepping the timeline sends `file=20260828200000.000` to `/api/data/station?path=SATELLITE/FY2G/L2/AMV/IR1`, which immediately returns **HTTP 404**.
  2. In [`timelineMath.js`](file:///root/downloads/micaps-web/client/src/ui/timeline/timelineMath.js#L35-L85) and [`tabsCore.js`](file:///root/downloads/micaps-web/client/src/lib/stores/tabsCore.js#L243-L265), `filterObsFilesByStep`, `findClosestFile`, and `stepCycleHours` parse timestamps by slicing character positions `file.slice(0, 4)`, `file.slice(4, 6)`, `file.slice(8, 10)`. For any prefixed filename (`Z_OTHE_...`, `C012_...`, `AMV_...`), `Number(file.slice(0, 4))` is `NaN`.
  3. Furthermore, [`filterObsFilesByStep`](file:///root/downloads/micaps-web/client/src/ui/timeline/timelineMath.js#L32-L42) filters files by `hour % stepLength === 0` (`stepLength` defaults to `1, 3, 6, 12, 24` hours) without checking minutes or sub-hourly cadences, which drops 6-minute SWAN radar files (`:06, :12, :18...`) and 15/30-minute satellite files (`:15, :30, :45`).

- **Fix Suggestion**:
  1. In [`timelineSync.js`](file:///root/downloads/micaps-web/client/src/utils/timelineSync.js#L191-L195), accept any file list where `validFiles.some((f) => parseTimestamp(f) !== null)` instead of requiring `f.endsWith(".000")`. Sort `obsList` chronologically by `parseTimestamp(f)` (ascending) rather than lexicographical `localeCompare`, and format `obsTimes` labels using the extracted timestamp (`YYYY-MM-DD HH:mm`).
  2. In [`timelineMath.js`](file:///root/downloads/micaps-web/client/src/ui/timeline/timelineMath.js#L29-L90) and [`tabsCore.js`](file:///root/downloads/micaps-web/client/src/lib/stores/tabsCore.js#L235-L275), use `parseTimestamp(f)` to extract epoch milliseconds instead of `f.slice(0, 4)`. In `filterObsFilesByStep`, when `stepLength <= 1`, return all `obsFiles` (so 6-minute radar and 15-minute satellite frames are all selectable), or filter by elapsed time delta (`>= stepLength * 3600_000`) rather than `hour % stepLength === 0`.

---

### RC-3: Gridded Observation Presets (`isObservation: true`) Use NWP Cycle Logic, Never Sync `tl.obsFiles`, and Render with Red Stale Hatch Lines

- **Affected Files**:
  - [`presetLoader.js`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L273-L492)
  - [`weatherLoader.js`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L55-L237)
  - [`rasterLayer.js`](file:///root/downloads/micaps-web/client/src/layers/rasterLayer.js#L289-L303)
  - [`contourMapSync.js`](file:///root/downloads/micaps-web/client/src/layers/contour/contourMapSync.js#L45-L60)
- **Root Cause**:
  All new radar and satellite presets in `menu-addition-plan1` are generated with `isObservation: true` in [`gen-presets.mjs`](file:///root/downloads/micaps-web/scripts/gen-presets.mjs#L279-L419). When selected, [`App.svelte`](file:///root/downloads/micaps-web/client/src/App.svelte#L1032-L1058) switches the bottom TimeSlider to `tl.currentMode = "obs"` and expects `win._obsTimeline` (`tl.obsFiles`) to be populated.
  However:
  1. [`presetLoader.js`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L273-L492) only calls `syncObservationTimeline()` inside `loadDerivedPresetLayer` (when `model === "UPPER_AIR" || model === "SURFACE"`) and `tlogp`. It **never** syncs `win._obsTimeline` for `contour`, `wind`, `event`, `image`, or `profiler` layers! As a result, the TimeSlider is completely empty (`tl.obsFiles = []`) for all radar, satellite, and profiler presets.
  2. When [`loadWeatherField()`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L55-L237) runs for a radar or satellite `contour`/`wind` preset:
     - If `!win.forecastCycle`, [`resolveLatestForecastCycle()`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L62-L81) strips non-digits from `C012_20261016104500_FY4B.AWX` -> `"012202610161045004"`, parses year `0122`, and writes garbage into `win.forecastCycle`.
     - Lines 125–155 compute `targetTimeMs` from `win.forecastCycle` + `win.forecastHour` (default `24`) and call `resolveLayerTime({ targetTimeMs, sampleEntries, policy: "hold" })`.
     - Because `parseTimestamp` failed (RC-1) or `targetTimeMs` is a synthetic NWP forecast time, `resolveLayerTime` returns `sampleFile: null`, `isHardStale: true`.
     - Lines 170–237 then execute the NWP fallback: it tries `${cycle}.024`, fails to match, tries `policy === "hold"` by parsing `parseInt(f.split(".").pop(), 10)` (which is `NaN` for `.BZ2` and `.AWX`), and finally hits line 233:
       ```javascript
       if (!fileToLoad) {
         fileToLoad = candidateFiles[0];
       }
       ```
       Because the server returns `candidateFiles` sorted ascending (oldest first), **`candidateFiles[0]` is the oldest file in the partition** (or `.F006` of the oldest run for `EXTRAPOLATION_IUM`), and `isHardStale` remains `true`!
     - Because `isHardStale === true`, [`renderRasterImage()`](file:///root/downloads/micaps-web/client/src/layers/rasterLayer.js#L289-L303) draws **red diagonal hatch lines (`rgba(220, 38, 38, 0.35)`)** across the entire radar/satellite image, and [`contourMapSync.js`](file:///root/downloads/micaps-web/client/src/layers/contour/contourMapSync.js#L48) reduces raster opacity from `0.85` to `0.35`!

- **Fix Suggestion**:
  1. Pass `isObservation: Boolean(group.isObservation)` and `obsFile: targetWindow?.obsFile` through [`presetLoader.js`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L478-L492) into `loadWeatherField`.
  2. In [`weatherLoader.js`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L113-L237), when `customOptions?.isObservation` is `true` (or when `model === "SWAN_PRODUCT" || model === "SATELLITE"`):
     - Do **not** call `resolveLatestForecastCycle()`.
     - Call `syncObservationTimeline(targetWindow, candidateFiles, ...)` so `win._obsTimeline` and `tl.obsFiles` are populated with the real radar/satellite catalog files.
     - Select `fileToLoad` as `targetWindow?.obsFile` (if present in `candidateFiles`) or `candidateFiles[candidateFiles.length - 1]` (the **latest** file, not `candidateFiles[0]`), and set `isHardStale = false`, `timeStatus = "exact"`.
  3. For `event` (`TITAN`, `TVS`) and `image` (`DUST`) layers in [`presetLoader.js`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L290-L380), also fetch `fetchTree(layer.path, 100)` (or use `onTimelineUpdate`), call `syncObservationTimeline(targetWindow, files, ...)`, and pass `targetWindow?.obsFile || "latest"` to `fetchEventData` / `getImageUrl` so the user can scrub through historical radar/satellite events and images.
  4. In [`App.svelte`](file:///root/downloads/micaps-web/client/src/App.svelte#L760-L815), ensure the observation timeline change handler reloads `contour`, `wind`, `event`, and `image` layers when `win.isObservation` is `true` (currently `reloadWindowObsLayers` only reloads station/derived/tlogp layers).

---

### RC-4: `COTRECWIND` and `FORECAST_PRODUCT/NMC/WIND` Never Render Wind Barbs or Streamlines

- **Affected Files**:
  - [`weatherLoader.js`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L91)
  - [`presetLoader.js`](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L478-L492)
- **Root Cause**:
  In [`gen-presets.mjs`](file:///root/downloads/micaps-web/scripts/gen-presets.mjs#L113-L119), `SWAN_PRODUCT/LOCAL/GD/COTRECWIND` is split into `model = "SWAN_PRODUCT"` and `element = "LOCAL/GD/COTRECWIND"` with `type: "wind"`, and `FORECAST_PRODUCT/NMC/WIND` has `model = "FORECAST_PRODUCT"`, `element = "NMC/WIND"`, `type: "wind"`.
  However, in [`presetLoader.js` lines 478–492](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L478-L492), `loadWeatherField` is called without `isWind` or `type` in `customOptions`.
  Then in [`weatherLoader.js` line 91](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L91):
  ```javascript
  const isWind = (element === "WIND" && !isDerivedWind) || customOptions?.isWind;
  ```
  Because `element` is `"LOCAL/GD/COTRECWIND"` (not `"WIND"`) and `customOptions?.isWind` is `undefined`, `isWind` evaluates to **`false`**!
  As a result, `loadWeatherField` treats `COTRECWIND` as a scalar contour layer (`type: "contour"`), never checks `gridData.u`/`gridData.v`, and **never calls `renderGridWindBarbs` or `renderWindStreamlines`**.

- **Fix Suggestion**:
  1. In [`presetLoader.js` lines 478–492](file:///root/downloads/micaps-web/client/src/services/presetLoader.js#L478-L492), pass `isWind: layer.type === "wind"` in `customOptions` to `loadWeatherField`.
  2. In [`weatherLoader.js` line 91](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L91), also check `element.endsWith("/WIND") || element.endsWith("COTRECWIND")`:
     ```javascript
     const isWind =
       ((element === "WIND" || element.endsWith("/WIND") || element.endsWith("COTRECWIND")) &&
         !isDerivedWind) ||
       Boolean(customOptions?.isWind);
     ```
  3. After receiving `gridData` from `fetchGridData`, if `Array.isArray(gridData.u) && Array.isArray(gridData.v)` is present and `layer.type === "wind"`, ensure the wind rendering path (`renderGridWindBarbs` / `renderWindStreamlines`) is taken.

---

### RC-5: Grouped `FY-4B CHINA` and `FY-4B DISK` Return HTTP 404 on All Channels Except `C012`

- **Affected Files**:
  - [`weatherLoader.js`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L113)
  - [`catalogApi.js`](file:///root/downloads/micaps-web/client/src/api/catalogApi.js#L22-L26)
  - [`catalog_handler.go`](file:///root/downloads/micaps-web/server/handler/catalog_handler.go#L47-L55)
  - [`grid_handler.go`](file:///root/downloads/micaps-web/server/handler/grid_handler.go#L96-L160)
- **Root Cause**:
  In Cassandra, each FY-4B channel has its own partition (`FY4B/L1/CHINA/C001`, `FY4B/L1/CHINA/C002`, ..., `FY4B/L1/CHINA/C015`), and the filenames inside each partition are prefixed with that channel's code:
  - `FY4B/L1/CHINA/C001` contains `C001_20261016104500_FY4B.AWX`
  - `FY4B/L1/CHINA/C012` contains `C012_20261016104500_FY4B.AWX`

  When loading a grouped FY-4B preset (`dataPath = "SATELLITE/FY4B/L1/CHINA"`, `targetLevel = 1` for `C001`):
  1. [`weatherLoader.js` line 113](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L113) calls `fetchTree(dataPath, 100)` **without passing `targetLevel`**.
  2. [`CatalogHandler.TreeHandler`](file:///root/downloads/micaps-web/server/handler/catalog_handler.go#L47-L55) receives `level = ""` and defaults `SATELLITE/FY4B/L1/CHINA` to `C012`, returning `["C012_20261015000000_FY4B.AWX", ...]`.
  3. [`weatherLoader.js` line 264](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L264) then calls `fetchGridData("SATELLITE/FY4B/L1/CHINA", "C012_20261015000000_FY4B.AWX", 1)`.
  4. [`GridHandler`](file:///root/downloads/micaps-web/server/handler/grid_handler.go#L96-L160) resolves `level=1` to Cassandra partition `FY4B/L1/CHINA/C001`, and queries `column1 = 'C012_20261015000000_FY4B.AWX'`, which **always returns HTTP 404** because files in `C001` start with `C001_`, not `C012_`!

- **Fix Suggestion**:
  1. **Client (`catalogApi.js` & `weatherLoader.js`)**: Add an optional `level = null` parameter to [`fetchTree(path, limit = 100, level = null)`](file:///root/downloads/micaps-web/client/src/api/catalogApi.js#L22-L26) (appending `&level=${encodeURIComponent(level)}` when non-null), and pass `targetLevel` from [`weatherLoader.js` line 113](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L113):
     ```javascript
     const treeData = await fetchTree(dataPath, 100, targetLevel);
     ```
  2. **Server (`grid_handler.go`)**: As a defensive safeguard in [`GridHandler.ServeHTTP`](file:///root/downloads/micaps-web/server/handler/grid_handler.go#L115-L135), when `path` is `SATELLITE/FY4B/L1/CHINA` or `SATELLITE/FY4B/L1/DISK` and `file` starts with `C\d{3}_` that does not match the resolved `cassPath` channel suffix (`C%03d`), rewrite the `C\d{3}_` prefix of `file` to match the target channel (or fall back to the latest file in that channel partition if the exact timestamp is missing).

---

### RC-6: Hardcoded Isobaric `LEVELS` in UI Prevents Channel/Height Selection, and `FY-2G AMV` Omits `&level=`

- **Affected Files**:
  - [`NavBar.svelte`](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte#L31)
  - [`levelController.js`](file:///root/downloads/micaps-web/client/src/services/levelController.js#L26)
  - [`appWorkflow.js`](file:///root/downloads/micaps-web/client/src/lib/services/appWorkflow.js#L174-L178)
  - [`derivedContours.js`](file:///root/downloads/micaps-web/client/src/services/derivedContours.js#L552)
  - [`catalogApi.js`](file:///root/downloads/micaps-web/client/src/api/catalogApi.js#L41-L52)
- **Root Cause**:
  1. [`gen-presets.mjs`](file:///root/downloads/micaps-web/scripts/gen-presets.mjs#L298-L355) populates `group.levels` and `group.defaultLevel` for multi-level radar and satellite presets:
     - `FY-4B CHINA` & `DISK`: `levels: [1, 2, 3, ..., 15]`, `defaultLevel: 12`
     - `TDMOSAIC`: `levels: [500, 1000, 1500, ..., 19000]`, `defaultLevel: 3000`
     - `FY-2G AMV`: `levels: [850, 700, 500, 400, 300, 250, 200, 150]`, `defaultLevel: 500`
  2. However, [`NavBar.svelte` line 31](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte#L31) and [`levelController.js` line 26](file:///root/downloads/micaps-web/client/src/services/levelController.js#L26) hardcode `const LEVELS = [1000, 925, 850, 700, 500, 400, 300, 200, 100]` and ignore `currentGroup.levels`. Users have no UI buttons to switch FY-4B channels (`C001`–`C015`) or TDMOSAIC heights (`500m`–`19000m`), and pressing Up/Down keys snaps `win.level` back to `[1000..100]`.
  3. In [`appWorkflow.js` lines 174–178](file:///root/downloads/micaps-web/client/src/lib/services/appWorkflow.js#L174-L178), `applyPresetToWindow` only updates `win.level` when `overrideLevel !== null`; when switching from a 500 hPa preset to `FY-4B CHINA`, `win.level` remains `500` until `loadPresetGroup` mutates it later.
  4. For `FY-2G AMV` (`layer.type === "station"`), [`loadStationPresetLayer`](file:///root/downloads/micaps-web/client/src/services/derivedContours.js#L552) calls `fetchStationObservations(path, targetFile)` without passing `level`, and [`fetchStationObservations`](file:///root/downloads/micaps-web/client/src/api/catalogApi.js#L41-L52) does not accept a `level` parameter. Consequently, `StationHandler` calls `ParseAWXDiscrete(decompressed, 0)` with `targetLevel = 0`, returning **all 13,602 wind vectors across all pressure levels simultaneously** instead of filtering to the selected hPa level.

- **Fix Suggestion**:
  1. In [`NavBar.svelte`](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte#L31), derive `const activeLevels = currentGroup?.levels?.length ? currentGroup.levels : DEFAULT_LEVELS`, and format labels contextually:
     - For `FY4B` (`levels` `1..15`): display `C001`..`C015` (instead of `1hPa`..`15hPa`).
     - For `TDMOSAIC` (`levels` `500..19000`): display `0.5km`..`19km` or `500m`..`19000m`.
     - Hide or disable the level selector when `currentGroup?.levels` is explicitly empty (`[]`).
  2. In [`levelController.js`](file:///root/downloads/micaps-web/client/src/services/levelController.js#L26-L70), read `const levels = activeGroup?.levels?.length ? activeGroup.levels : LEVELS` before computing `currentIndex` and stepping levels.
  3. In [`appWorkflow.js`](file:///root/downloads/micaps-web/client/src/lib/services/appWorkflow.js#L174-L178), set `win.level = overrideLevel ?? groupCopy.defaultLevel ?? win.level`.
  4. In [`catalogApi.js`](file:///root/downloads/micaps-web/client/src/api/catalogApi.js#L41-L52) and [`derivedContours.js`](file:///root/downloads/micaps-web/client/src/services/derivedContours.js#L552), add `level = null` to `fetchStationObservations(path, file = "latest", level = null)` and pass `targetWindow?.level || layer.level || group.defaultLevel` so `/api/data/station` filters `FY-2G AMV` wind barbs by pressure level.

---

### RC-7: Server `CQLClient` Single-Connection Mutex Lockup & 30s Timeout on Large FY-4B Blobs + 160 MB JSON Responses

- **Affected Files**:
  - [`cql_client.go`](file:///root/downloads/micaps-web/server/db/cql_client.go#L102-L157)
  - [`awx_parser.go`](file:///root/downloads/micaps-web/server/parser/awx_parser.go#L263-L275)
  - [`grid_handler.go`](file:///root/downloads/micaps-web/server/handler/grid_handler.go#L96-L182)
- **Root Cause**:
  1. **Large FY-4B blobs in Cassandra**:
     - `FY4B/L1/CHINA/C001..C003`: **7.8 MB – 9.6 MB** per file (`4000×3500` pixels).
     - `FY4B/L1/DISK/C001..C003`: **38.4 MB – 50.2 MB** per file (`13001×14001 = 182,027,001` pixels uncompressed!).
     - `FY4B/L1/DISK/C004..C015`: **2.1 MB – 16.3 MB** per file (`3251×3501` to `6501×7001` pixels).
  2. **Global CQL head-of-line blocking & 60s lockup**:
     - [`CQLClient.Query()`](file:///root/downloads/micaps-web/server/db/cql_client.go#L102-L125) serializes **every** CQL query across the entire HTTP server through a single TCP connection guarded by `c.mu.Lock()` with a fixed 30-second deadline (`time.Now().Add(30 * time.Second)`).
     - Over the remote tunnel (`bore.pub:59043`), transferring a 4–50 MB blob frequently exceeds 30s. When `queryOnce` fails with `i/o timeout`, `CQLClient.Query` (while still holding `c.mu.Lock()`) closes the socket, reconnects, and **immediately retries the exact same timed-out query for another 30 seconds**!
     - During those 60+ seconds, **every other HTTP request** (`/api/catalog/tree`, `/api/data/grid`, etc.) blocks waiting for `c.mu.Lock()`.
  3. **20.2M float (~160 MB) JSON serialization on `FY4B/L1/DISK`**:
     - In [`parseAWXCategory1`](file:///root/downloads/micaps-web/server/parser/awx_parser.go#L263-L275), downsampling `step` only checks `width > 2000` (`step = 2`) and `width > 4000` (`step = 3`).
     - For `DISK/C001` (`13001×14001`), `step = 3` yields `4334 × 4667 = 20,226,778` floats. `json.NewEncoder(w).Encode(gridData)` in `GridHandler` serializes 20.2M floats into ~160 MB of JSON text, exhausting memory/bandwidth and crashing the browser tab.
  4. **`GridHandler` does not support `file=latest` in production**:
     - Unlike [`StationHandler`](file:///root/downloads/micaps-web/server/handler/station_handler.go#L67-L87) and [`ImageHandler`](file:///root/downloads/micaps-web/server/handler/image_handler.go#L59-L80), [`GridHandler`](file:///root/downloads/micaps-web/server/handler/grid_handler.go#L96-L160) never resolves `file == ""` or `file == "latest"` via `GetLatestCycle` / `GetFileList`, querying Cassandra literally for `column1 = 'latest'` and returning HTTP 404.

- **Fix Suggestion**:
  1. **Cap AWX output dimensions (`awx_parser.go`)**: In [`parseAWXCategory1`](file:///root/downloads/micaps-web/server/parser/awx_parser.go#L263-L275), compute `step` dynamically so `outW` and `outH` never exceed `1800` (e.g. `maxDim := max(width, height); step := (maxDim + 1799) / 1800`). For `13001×14001`, `step = 8` produces `1626×1751` (~2.8M cells instead of 20.2M).
  2. **Avoid retrying timed-out large blob queries & use a connection pool (`cql_client.go`)**:
     - Do not retry inside `CQLClient.Query` when the error is a read deadline timeout (`net.Error` with `Timeout() == true`), or only retry metadata queries, not `GetBlob`.
     - Increase the read deadline for `GetBlob` (e.g. 90s) and use a small pool of 3–4 `CQLClient` connections (or separate metadata vs blob clients) so a slow satellite download never blocks `/api/catalog/tree` or fast radar queries.
     - Add an in-memory LRU cache (even 8–16 entries) for parsed `GridData` in `GridHandler` so repeated pan/zoom or channel toggles don't re-download multi-megabyte blobs over the CQL tunnel.
  3. **Support `file=latest` in `GridHandler` (`grid_handler.go`)**: Add the same `if file == "" || file == "latest"` resolution block used in [`StationHandler`](file:///root/downloads/micaps-web/server/handler/station_handler.go#L67-L87) before calling `h.DB.GetBlob`.

---

### RC-8: AWX Parser (`awx_parser.go`) Physical Value, Sentinel Masking & Channel Metadata Bugs

- **Affected Files**:
  - [`parseAWXCategory3` (FY-2G L2 CTT / QPE)](file:///root/downloads/micaps-web/server/parser/awx_parser.go#L417-L561)
  - [`parseAWXCategory1` (FY-4B L1 CHINA / DISK)](file:///root/downloads/micaps-web/server/parser/awx_parser.go#L219-L366)
- **Root Cause**:
  1. **FY-2G CTT (`SATELLITE/FY2G/L2/CTT`) paints 46% of the map (clear-sky) as opaque white**:
     - Inspection of real `CTT_MLT_OTG_*.AWX` blobs shows the Category 3 header specifies:
       `BaseVal = 0`, `Scale = 1`, `HasQuality = 1`, `QualityDown = 0`, `QualityUp = 400`, `HasLand = 1`, `LandVal = 510`, `HasCloud = 1`, `CloudVal = 400`.
     - In the pixel payload, **461,622 of 1,002,001 pixels (46.1%)** have `rawVal == -10` (clear-sky / no-cloud sentinel).
     - However, [`parseAWXCategory3` line 514](file:///root/downloads/micaps-web/server/parser/awx_parser.go#L514-L528) only checks:
       ```go
       if rawVal <= -900 || rawVal == h2.NullVal {
           values[idx] = -9999.0
           continue
       }
       ```
       It ignores `h2.HasQuality` (`rawVal < h2.QualityDown || rawVal > h2.QualityUp`), `h2.HasLand` (`rawVal == h2.LandVal`), `h2.HasCloud` (`rawVal == h2.CloudVal`), and negative sentinels (`rawVal < 0`).
     - Thus `-10` is emitted as a valid temperature (`-10 K`)! On the client, `DEFAULT_COLORMAPS.CTT` starts at `{ val: 180, color: [255, 255, 255, 255] }`, and [`interpolateColor`](file:///root/downloads/micaps-web/client/src/utils/colormaps.js#L502) clamps any value `<= 180` (`-10 <= 180`) to opaque white (`[255, 255, 255, 255]`), covering all clear-sky areas in solid white!
  2. **FY-4B L1 (`CHINA` & `DISK`) does not mask unscanned outer-space / border pixels**:
     - In `FY4B/L1/DISK` and `CHINA`, pixels outside the Earth disk or scan swath have raw byte `dn == 0` or `dn == 255` (`uint8(h2.OverlapVal)`).
     - [`parseAWXCategory1` lines 281–304](file:///root/downloads/micaps-web/server/parser/awx_parser.go#L281-L304) converts every `dn` (`0..255`) through `calTable[dn]` without masking `dn == 0` or `dn == uint8(h2.OverlapVal)` to `-9999.0`. Outer space around the globe is rendered as a solid black/white rectangle instead of transparent.
  3. **FY-4B L1 channel name in metadata is wrong**:
     - In [`parseAWXCategory1` line 330](file:///root/downloads/micaps-web/server/parser/awx_parser.go#L330), `channelName := fmt.Sprintf("C%03d", h2.Channel)` uses the legacy AWX header field (`h2.Channel = 1` for C012 IR1, `h2.Channel = 2` for C009 WV, `h2.Channel = 4` for C002 VIS), labeling `C012` data as `"C001"`.

- **Fix Suggestion**:
  1. In [`parseAWXCategory3`](file:///root/downloads/micaps-web/server/parser/awx_parser.go#L514-L528), enforce the AWX Category 3 header validity bounds and physical range:
     ```go
     if rawVal <= -900 || rawVal == h2.NullVal || rawVal < 0 {
         values[idx] = -9999.0
         continue
     }
     if h2.HasQuality != 0 && h2.QualityUp > h2.QualityDown && (rawVal < h2.QualityDown || rawVal > h2.QualityUp) {
         values[idx] = -9999.0
         continue
     }
     if (h2.HasLand != 0 && rawVal == h2.LandVal) || (h2.HasCloud != 0 && rawVal == h2.CloudVal) {
         values[idx] = -9999.0
         continue
     }
     ```
     For `CTT` specifically (`elemName == "CTT"`), also mask values `< 150.0 || > 340.0` K to `-9999.0`.
  2. In [`parseAWXCategory1`](file:///root/downloads/micaps-web/server/parser/awx_parser.go#L281-L304), mask `dn == 0` and (when `h2.OverlapVal > 0 && h2.OverlapVal <= 255`) `dn == uint8(h2.OverlapVal)` to `-9999.0`.

---

### RC-9: Radar & QPE Colormap Bugs (`0.0 mm` Rendered Opaque Green; Clear-Air `-32.5 dBZ` Unmasked)

- **Affected Files**:
  - [`colormaps.js`](file:///root/downloads/micaps-web/client/src/utils/colormaps.js#L428-L580)
  - [`diamond131_parser.go`](file:///root/downloads/micaps-web/server/parser/diamond131_parser.go#L300-L337)
- **Root Cause**:
  1. **`FY-2G QPE001/003/006` and `SWAN QPE/QPF` render `0.0 mm` (no rain) as opaque green across the entire domain**:
     - In `FY2G/L2/QPE001`, 912,489 of 1,002,001 pixels have `val == 0.0 mm` (no precipitation).
     - In [`colormaps.js` line 428](file:///root/downloads/micaps-web/client/src/utils/colormaps.js#L428-L441), `isRainElement(element)` checks `RAIN`, `PRECIP`, `TP`, `CP`, `LSP`, `PRE_` — it **does not match `"QPE"` or `"QPF"`**!
     - And in [`DEFAULT_COLORMAPS.QPE`](file:///root/downloads/micaps-web/client/src/utils/colormaps.js#L156-L165), the lowest stop is `{ val: 0.1, color: [166, 242, 143, 200] }` (alpha `200`, no `0.0` transparent stop).
     - When `interpolateColor(0.0, palette, zMin, zMax, element)` runs ([lines 496–503](file:///root/downloads/micaps-web/client/src/utils/colormaps.js#L496-L503)), `isRain` is `false`, so `val <= 0.05` is skipped, and `t <= palette[0].val` (`0.0 <= 0.1`) returns `[166, 242, 143, 200]` — painting **every dry pixel opaque green**!
  2. **`QPE`, `ECHO_TOP`, and `VIL` palettes dynamically stretch instead of using fixed physical stops**:
     - In [`colormaps.js` line 487](file:///root/downloads/micaps-web/client/src/utils/colormaps.js#L487-L493), `isFixedPhysical` only includes `isRain`, `CAPE`, `CIN`, `RADAR`, `MCR`, `REFLECTIVITY`, `TDMOSAIC`, `EXTRAPOLATION`, `AWX`, `SATELLITE`, `FY2`, `FY4`, `CTT`, `TBB`.
     - For `SWAN_PRODUCT/LOCAL/GD/QPE`, `ECHO_TOP`, and `VIL`, `isFixedPhysical` is `false`! Whenever `zMax` of a frame is less than the palette max (`100 mm` for QPE, `18 km` for ECHO_TOP, `65 kg/m²` for VIL), `interpolateColor` normalizes `t` into `[0, 1]` and stretches the entire color scale so light rain or low clouds appear dark purple/red!
  3. **SWAN `diamond131_parser.go` leaves `-32.5 dBZ` (`raw == 1`) in-coverage clear air unmasked**:
     - In SWAN `bytesPerVal == 1` radar files (`MCR`, `TDMOSAIC`, `EXTRAPOLATION_IUM` with `scale = 2.0, offset = -66.0`), `raw == 0` (`-33.0 dBZ`) is out-of-radar-coverage and `raw == 1` (`-32.5 dBZ`, >320,000 pixels per frame) is **in-coverage clear air / no echo**.
     - [`diamond131_parser.go` line 302](file:///root/downloads/micaps-web/server/parser/diamond131_parser.go#L302-L307) only masks `raw == 0 || raw == 255`. Leaving `raw == 1` (`-32.5 dBZ`) as a valid number corrupts `Stats.Min` (`-32.5`) and `Stats.Mean` (`-25.8`), and causes bilinear interpolation in `rasterLayer.js` to average edge echoes with `-32.5`.

- **Fix Suggestion**:
  1. In [`colormaps.js`](file:///root/downloads/micaps-web/client/src/utils/colormaps.js#L428-L495):
     - Add `u.includes("QPE") || u.includes("QPF")` to `isRainElement(element)`.
     - Add `{ val: 0, color: [0, 0, 0, 0] }` as the first stop of `DEFAULT_COLORMAPS.QPE`.
     - Add `u.includes("QPE") || u.includes("QPF") || u.includes("ECHO_TOP") || u.includes("ET") || u.includes("VIL")` to `isFixedPhysical` inboth `interpolateColor` and `buildLUT`.
  2. In [`diamond131_parser.go` lines 301–307](file:///root/downloads/micaps-web/server/parser/diamond131_parser.go#L301-L307), for reflectivity products (`offset == -66.0 && scale == 2.0`), mask `raw <= 1 || raw == 255` (or values `< -30.0` dBZ) to `-9999.0`.

---

### RC-10: Redundant Contour Computation & Pan/Zoom Full-Raster PNG Re-Encoding on 1.2M–4M Cell Grids

- **Affected Files**:
  - [`weatherLoader.js`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L440-L562)
  - [`contourMapSync.js`](file:///root/downloads/micaps-web/client/src/layers/contour/contourMapSync.js#L286-L308)
  - [`contourReRender.js`](file:///root/downloads/micaps-web/client/src/services/contourReRender.js#L270-L337)
- **Root Cause**:
  All radar and satellite presets specify `showRaster: true, showFill: false, showLine: false`.
  However:
  1. [`weatherLoader.js` line 440](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L440-L465) unconditionally calls `renderContourLayers(map, gridData, ...)` even when `showFill === false && showLine === false`. Inside `renderContourLayers`, `evaluateCropAndLOD` and `computeGridStats` iterate over 1.26M (`MCR`) to 3.99M (`TDMOSAIC`) floats on the main thread.
  2. [`weatherLoader.js` line 552](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L552-L562) arms `armContourReRender(map, ...)` unconditionally.
  3. On every pan or zoom (`moveend` / `zoomend`), [`contourReRender.js` lines 270–325](file:///root/downloads/micaps-web/client/src/services/contourReRender.js#L270-L325) re-runs `renderContourLayers` **and** calls `renderGridRaster(map, state.gridData, ...)`, which re-projects 4.2M pixels and re-encodes a 2048×2048 PNG via `canvas.toDataURL("image/png")` on the UI thread — even though a MapLibre `image` source is geographically anchored by its 4 corner coordinates and does **not** change when panning or zooming!

- **Fix Suggestion**:
  1. In [`weatherLoader.js`](file:///root/downloads/micaps-web/client/src/services/weatherLoader.js#L440-L562), when `showRaster && !showFill && !showLine`, skip `renderContourLayers` and skip `armContourReRender` (compute `zMin`/`zMax` from `gridData.stats` or a fast single pass, and call `renderGridRaster` directly once).
  2. In [`contourReRender.js`](file:///root/downloads/micaps-web/client/src/services/contourReRender.js#L305-L325), do **not** call `renderGridRaster` inside the `moveend`/`zoomend` viewport callback (only call `renderGridRaster` when data, colormap, opacity, or `showRaster` visibility changes).

---

### RC-11: Wind Profiler (`WIND_PROFILER/RAD` & `ROBS`) JSON Schema Mismatch & Station ID Mismatch

- **Affected Files**:
  - [`profilerLayer.js`](file:///root/downloads/micaps-web/client/src/layers/profilerLayer.js#L124-L199)
  - [`profiler_handler.go`](file:///root/downloads/micaps-web/server/handler/profiler_handler.go#L60-L200)
  - [`profiler.go`](file:///root/downloads/micaps-web/server/model/profiler.go#L1-L30)
  - [`gen-presets.mjs`](file:///root/downloads/micaps-web/scripts/gen-presets.mjs#L420-L424)
- **Root Cause**:
  1. **JSON field name mismatch renders a blank canvas**:
     - [`server/model/profiler.go`](file:///root/downloads/micaps-web/server/model/profiler.go#L6-L25) serializes `ProfilerProfile` and `ProfilerLevel` with JSON keys:
       ```json
       {
         "station_id": "54511",
         "obs_time": "20261016030000.000",
         "type": "ROBS",
         "levels": [
           { "height": 150, "wind_dir": 258, "wind_speed": 2.9, "vertical_speed": -0.05 }
         ]
       }
       ```
     - However, [`client/src/layers/profilerLayer.js`](file:///root/downloads/micaps-web/client/src/layers/profilerLayer.js#L128-L199) reads:
       - `this.profileData.station` (instead of `station_id`) -> displays `"Station: Unknown"`
       - `this.profileData.file` (instead of `obs_time`) -> displays `"Time: --"`
       - `lvl.speed` and `lvl.dir` (instead of `lvl.wind_speed` and `lvl.wind_dir`) -> in `_drawProfile` (line 175) and `_drawWindBarbs` (line 198), `lvl.speed === undefined` triggers `if (lvl.speed === undefined || lvl.speed === null || lvl.speed < 0) continue;`, **skipping 100% of levels and leaving the chart completely blank**!
  2. **`WIND_PROFILER/RAD/54511` returns HTTP 404**:
     - In Cassandra, `WIND_PROFILER/ROBS` partitions use WMO station IDs (`54511`, `54527`, etc.), whereas `WIND_PROFILER/RAD` partitions use radar site codes (`AH001`, `BJ001`, `GD001`, etc.) — `WIND_PROFILER/RAD/54511` does not exist in Cassandra!
     - Furthermore, [`gen-presets.mjs` lines 420–424](file:///root/downloads/micaps-web/scripts/gen-presets.mjs#L420-L424) hardcodes `/54511` for both `RAD` and `ROBS`.

- **Fix Suggestion**:
  1. In [`client/src/layers/profilerLayer.js`](file:///root/downloads/micaps-web/client/src/layers/profilerLayer.js#L128-L205), support both field conventions:
     - Station: `const station = this.profileData.station || this.profileData.station_id || "Unknown";`
     - Time: `const file = this.profileData.file || this.profileData.obs_time || "--";`
     - Speed & Direction: `const speed = lvl.speed ?? lvl.wind_speed;` and `const dir = lvl.dir ?? lvl.wind_dir;`
  2. In [`scripts/gen-presets.mjs`](file:///root/downloads/micaps-web/scripts/gen-presets.mjs#L420-L424) and [`server/handler/profiler_handler.go`](file:///root/downloads/micaps-web/server/handler/profiler_handler.go#L60-L120):
     - Use a valid default station for `WIND_PROFILER/RAD` (e.g. `AH001`) or allow `ProfilerHandler` to fall back to the first available station in `GetSubDirs("WIND_PROFILER", "RAD")` when the requested station ID has no cycles in Cassandra.

---

## 4. Recommended Fix Order & Verification Checklist

1. **Phase 1 — Client Timestamp & Observation Preset Pipeline (Unblocks all Radar & Satellite products)**:
   - Fix `parseTimestamp` ([`timeResolver.js`](file:///root/downloads/micaps-web/client/src/utils/timeResolver.js#L166-L280)) to extract embedded `YYYYMMDDHHmmss` and `YYYYMMDD_HHmm` timestamps and `.Fxxx` minute lead times (**RC-1**).
   - Fix `syncObservationTimeline` ([`timelineSync.js`](file:///root/downloads/micaps-web/client/src/utils/timelineSync.js#L191-L195)) and `timelineMath.js` / `tabsCore.js` to use `parseTimestamp` instead of `.endsWith(".000")` and `file.slice(0, 4)` (**RC-2**).
   - Update `presetLoader.js` and `weatherLoader.js` so `isObservation: true` presets bypass NWP `resolveLatestForecastCycle`, sync `win._obsTimeline`, load the **latest** catalog file (`candidateFiles[candidateFiles.length - 1]`), and clear false `isHardStale` red hatch lines (**RC-3**).
   - Pass `isWind: layer.type === "wind"` so `COTRECWIND` and `NMC/WIND` render wind barbs/streamlines (**RC-4**).
2. **Phase 2 — Multi-Channel / Multi-Level Routing & UI (`FY-4B`, `TDMOSAIC`, `AMV`)**:
   - Pass `targetLevel` to `fetchTree(dataPath, 100, targetLevel)` in `weatherLoader.js` and add channel-prefix normalization in `GridHandler` (**RC-5**).
   - Make `NavBar.svelte` and `levelController.js` read `currentGroup.levels` (`C001..C015`, `500m..19000m`), set `win.level = group.defaultLevel` in `appWorkflow.js`, and pass `&level=` in `fetchStationObservations` for `FY-2G AMV` (**RC-6**).
3. **Phase 3 — Server Parser, CQL Transport & Colormap Fixes**:
   - Mask clear-sky `-10` / quality flags in `parseAWXCategory3` (`FY-2G CTT`), mask `dn == 0` / `OverlapVal` in `parseAWXCategory1` (`FY-4B`), and cap `parseAWXCategory1` output grid dimensions to `<= 1800` (**RC-7, RC-8**).
   - Avoid retrying timed-out `GetBlob` queries inside `CQLClient.Query`'s global lock and support `file=latest` in `GridHandler` (**RC-7**).
   - Add `QPE`/`QPF` to `isRainElement`, add `QPE`/`ECHO_TOP`/`VIL` to `isFixedPhysical` in `colormaps.js`, and mask `raw <= 1` (`-32.5 dBZ`) in `diamond131_parser.go` (**RC-9**).
   - Skip redundant `renderContourLayers` and pan/zoom `renderGridRaster` re-encoding for raster-only layers (**RC-10**).
4. **Phase 4 — Wind Profiler Fix**:
   - Align `profilerLayer.js` field names (`station_id`, `obs_time`, `wind_speed`, `wind_dir`) with `ProfilerHandler` and fix the `WIND_PROFILER/RAD` default station ID (**RC-11**).
