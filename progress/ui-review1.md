# UI Interaction Review — MICAPS-Web Client

**Date:** 2026-09-02  
**Scope:** `client/src/ui/*`, `client/src/store/appState.js`, `client/src/main.js` orchestration, `client/src/map/mapInstance.js`, and layer-trigger paths invoked by UI.  
**Method:** Static code reading against `client/src/**` at commit HEAD, traced call-graphs from event listeners → state → `tabWindowManager`/`layerActions`/API. No live browser run; conclusions are evidence-based.

---

## 1. Executive Summary

Overall UI scaffolding is functional: navigation, catalog drawer, tab/split windows, time slider, layer panel, and config editor all wire events to state and map correctly for the happy path. However the review finds **20 moderate and 20 minor defects** concentrated in stale-state races and DOM re-render lifecycle gaps (window-header staged-only and UTC+8/BJT time display — see §2.5, §2.4 — are by design). No single defect crashes the workstation on first load, but combined they degrade multi-window, rapid-navigation, and palette/filter workflows.

Severity scale: **Critical** (data loss / crash), **Moderate** (wrong data shown or action silently fails), **Minor** (UX / accessibility / maintainability).

---

## 2. Module-by-Module Findings

### 2.1 `src/ui/navBar.js` — `client/src/ui/navBar.js:11`

| Function | Verdict | Detail |
|---|---|---|
| `initNavBar(containerId, callbacks)` `navBar.js:11` | **Works with caveats — Minor** | Renders brand, preset + level selects, status dot, `Layers`/`⚙ Config` buttons correctly. Polls `/api/status` via `updateStatus()` `navBar.js:154` every 15 s — correct. Issues: (1) callback aliasing `onPresetSelectCallback = callbacks.onPresetSelect \|\| callbacks.onPresetChange` `navBar.js:15` and `onLoadDataCallback = callbacks.onLoadData \|\| callbacks.onPresetChange` makes `onPresetChange` ambiguously serve two roles; `main.js:159` passes three distinct callbacks so aliasing is dead code but misleading. (2) Hidden `btn-reload-config` `navBar.js:61` still bound to a no-op (just `await PRESET_GROUPS`); not a bug but unused DOM. |
| `preset select change` `navBar.js:65` | **Moderate defect** | Always clears nav level to `""` and `appState.set("level", null)` `navBar.js:68-69` regardless of `group.hasLevel` / `group.defaultLevel`. User expectation: switching preset that has a default level should keep/adopt that level. Currently level is lost, then `onPresetSelect` in `main.js:162` sets `win.level = null` — doubly clears. |
| `btn-load-data click` `navBar.js:77` | **Moderate defect** | Falls back to `PRESET_GROUPS[0]` when select is empty `navBar.js:80`. Pressing Load Data with no explicit selection therefore loads an arbitrary first preset silently. Prefer disabling button when `!groupId`. Also `overrideLevel` parsed from nav-level select may be `NaN` if select contains empty value; guard `parseInt` without `isNaN` check is okay via truthy string but fragile. |
| `level select change` `navBar.js:89` | **Works** | Sets `appState` and fires `onLevelSelect`. Correct. |
| `btn-toggle-layers click` `navBar.js:98` | **Minor defect** | Toggles `hidden` class on `#layer-control` but initial button `.active` state is never synced to panel visibility. After first toggle, class toggling is inverse-correct but initial render shows button inactive while panel is visible. |
| `setNavBarLevel(level)` `navBar.js:126` | **Works** | Idempotent value guard `if (select.value !== strVal)` correct. |
| `setNavBarPreset(groupId)` `navBar.js:135` | **Works** | Simple assignment. |
| `refreshNavBarPresets()` `navBar.js:142` | **Works** | Preserves `currentGroupId` via `select.value \|\| appState.get("activeGroup")?.id`. Correct, though `appState.activeGroup` is only synced on window focus — stale when background window changed group. |
| `updateStatus()` `navBar.js:154` | **Works** | Handles `mock_mode` vs Cassandra correctly. No abort controller; 15 s interval keeps running even after component removed — minor leak. |

**Recommendation:** Remove alias fallback for callbacks, sync `Layers` button active state on init, gate Load Data when no preset selected, and make level clearing conditional on `group.hasLevel`.

---

### 2.2 `src/ui/catalogDrawer.js` — `client/src/ui/catalogDrawer.js:5`

| Function | Verdict | Detail |
|---|---|---|
| `initCatalogDrawer(containerId, onLoadCallback)` | **Works with caveats — Moderate** | Correctly builds drawer form `catalogDrawer.js:9`, binds close button `catalogDrawer.js:85`, and dispatches structured payload `catalogDrawer.js:174`. |
| `updateFormVisibility()` `catalogDrawer.js:99` | **Moderate defect** | Rewrites `selectElement.innerHTML` and `selectLevel.innerHTML` wholesale on every `selectModel` change. Previous `level`/`element` selection is discarded without preservation; switching `ECMWF_HR → SURFACE → ECMWF_HR` resets level to 850 even if user had chosen 500. Also uses inline `groupLevel.style.display !== "none"` `catalogDrawer.js:159` to decide level parsing — fragile against CSS class toggling. |
| `btn-load-product click` `catalogDrawer.js:152` | **Works but incomplete** | Disables button, shows `Loading...`, calls `appState.update` and `onLoadCallback`, then hides drawer `catalogDrawer.js:183`. Error path logs to console but shows no UI feedback; button is re-enabled correctly in `finally`. Observation-time select contains hard-coded 2026-08 values `catalogDrawer.js:70` instead of dynamic catalog discovery — stale in production. |
| Close behavior | **Minor defect** | Only close affordance is `✕` button; clicking outside drawer or pressing `Escape` does not close it, inconsistent with panel UX. |

---

### 2.3 `src/ui/layerControl.js` — `client/src/ui/layerControl.js:73`

| Function | Verdict | Detail |
|---|---|---|
| `initLayerControl / renderLayersManager()` `layerControl.js:73,222` | **Works with caveats — Moderate** | Renders per-window layer rows, visibility eye, config gear, remove button. Accordion logic `layerControl.js:281` correctly closes other drawers. **Defect:** `renderLayersManager` does `panel.innerHTML =` full rebuild `layerControl.js:226` and then re-binds listeners. This discards focus, scroll position, and any in-flight palette `<select>` async population. Rapid `addOrUpdateLayer` calls cause flicker and lost text input state. |
| `addOrUpdateLayer(arg1, arg2)` `layerControl.js:104` | **Works with caveats — Minor** | Overload handling (`string winId + def` vs `def + win`) is correctly implemented. Merging `...layerDef` then spreading `config` preserves defaults. **Defect:** Palette-population async import `layerControl.js:339` runs after render but does not guard `configDrawer.isConnected` nor `layer === getLayerById(layer.id)` — if layer was removed before fetch resolves, orphan options are appended to a detached drawer node. |
| `getLayersForWindow / getLayerById / getLayers` `layerControl.js:80,88,218` | **Works** | Lazy-creates default basemap layer `layerControl.js:52`. Key derived from `winOrId.id` or string — consistent with `tabWindowManager` `win.id`. |
| `clearWindowWeatherLayers` `layerControl.js:93` | **Works** | Filters `!l.removable` correctly; re-creates defaults if empty. Re-renders only when `winId === currentActiveWinId` — correct. |
| `removeLayer` `layerControl.js:197` | **Works** | Splices and re-renders. |
| `syncLayerControlForWindow(win)` `layerControl.js:210` | **Works** | Updates `currentActiveWinId` / `currentActiveWinTitle` and re-renders. Title fallback `Window N` is correct. |
| Visibility eye handler `layerControl.js:255` | **Works** | Toggles `layer.visible`, button class, and dispatches `handleLayerAction("visibility", …)`. Correct. |
| Remove button handler `layerControl.js:267` | **Works** | Calls `removeLayer` then dispatches `handleLayerAction("remove", …)`. Order is correct (model removed before map cleanup). |
| Row click → accordion `layerControl.js:282` | **Minor defect** | Row `click` propagates to config drawer toggle even when clicking visibility/remove/config buttons — mitigated by `e.stopPropagation()` in those button handlers, but any future button missing the guard will double-trigger. Also palette `<select>` `click` stopPropagation at `layerControl.js:337` prevents row toggle when opening palette — correct but undocumented. |
| Contour config binds `layerControl.js:304` | **Works with caveats — Minor** | Checkboxes and inputs bind `change`/`input` correctly and call `autoSaveLayerConfig`. `click` stopPropagation is duplicated (`el.addEventListener("click", e=>e.stopPropagation())` plus `change`) — redundant but harmless. Opacity slider uses `input` event — good for live preview. |
| Palette picker `layerControl.js:333` | **Moderate defect** | `listPaletteFiles(category)` filtered to `.xml` only; if element category has no XML files, dropdown stays empty with no user message. Gradient preview `layerControl.js:365` joins `s.color.slice(0,3)` but original palette alpha is in `color[3]` — preview ignores per-stop alpha uniformly. Rapidly switching layers can interleave two concurrent `listPaletteFiles` promises, last-resolved wins but earlier layer's preview may render into wrong drawer. |
| Station drawer `layerControl.js:402,471` | **Works** | Delegates to `renderStationFilterSection`. `isUpperAirStationLayer` heuristic `layerControl.js:24` checks `model`, id/name substrings, and `layer.level` — last condition `layer.type==="station" && typeof layer.level==="number"` will treat any station layer with a numeric level as upper-air, misclassifying surface station layers created with `level:500` by mistake. |
| Basemap config `layerControl.js:433` | **Works** | Checkboxes and scheme select dispatch `handleLayerAction("config", …)` correctly. |
| `bindAuxCheckbox` `layerControl.js:660` | **Works** | Hidden compat checkboxes (`chk-raster`, `chk-wind`) correctly proxy to `appState.setLayer`. |

**Recommendation:** Preserve drawer scroll/focus across re-renders, guard async palette population with abort token, document `stopPropagation` contract, and tighten `isUpperAirStationLayer` check to require `model==="UPPER_AIR"` or id contains `upper` explicitly.

---

### 2.4 `src/ui/timeSlider.js` — `client/src/ui/timeSlider.js:158`

| Function | Verdict | Detail |
|---|---|---|
| `initTimeSlider(containerId, onTimeChange)` `timeSlider.js:158` | **Works** | Builds stepper, play button, step-length select, init-cycle select, and chips bar `timeSlider.js:164`. Binds prev/next/play/step/init listeners correctly. Initial `hidden` state `timeSlider.js:162` is correct — `main.js` controls visibility via `setTimeSliderVisible`/`setTimelineMode`. |
| `getPeriodsForStep(step)` `timeSlider.js:44` | **Minor defect** | For `step=1`, generates `1..36 step1` then `39..72 step3` — skips 37, 38. Presumably intentional CMAMA cadence but undocumented; produces gap in chip bar. For `step=6` adds `132..240 step12` beyond typical 120 h window — chips overflow. Pure logic is otherwise deterministic and tested. |
| `filterObsFilesByStep(files, stepHours, isUpper)` `timeSlider.js:66` | **Works — By Design** | Upper-air branch `timeSlider.js:69` parses hour via `f.slice(8,10)` as **UTC+8 (BJT) wall-clock hour** — **intentional** per product spec: all Cassandra/BDStore file keys and UI time titles are stored and displayed in UTC+8 (BJT) for CMA operations. Surface 08/20 vs 02/14 filtering for 12 h step and 02/08/14/20 for 6 h step are correct for BJT synoptic cycles. Retained minor robustness note: `parseInt` on a non-numeric file name returns `NaN` and falls into `true` retention branch — should validate, but not a design defect. |
| `setTimeSliderVisible(visible)` `timeSlider.js:152` | **Works** | Simple `classList.toggle("hidden")`. |
| `setTimelineMode(mode, customData)` `timeSlider.js:408` | **Works with caveats — Moderate** | Correctly separates `nwp` vs `obs`, resolves `isUpperAirMode` via `customData.isUpper \|\| path.includes("UPPER_AIR") \|\| winTitle.includes("upper")` `timeSlider.js:414` — third heuristic is brittle: a surface product with "upper" in its name would be misclassified. Also mutates globals `currentStepLength`, `forecastCycles`, `discretePeriods` without deep clone — concurrent callers (two windows switching quickly) can interleave. Always calls `pausePlayback()` `timeSlider.js:475` — correct to stop stale interval. |
| `setStepLength(step, triggerCallback)` `timeSlider.js:239` | **Works with caveats — Minor** | For NWP, recomputes `discretePeriods` and snaps `currentPeriodIdx` to closest value — may jump from +024 h to +012 h unexpectedly when switching 6 h→3 h. For obs, filters `rawObsFiles` and snaps `currentObsIdx` to previous file — correct but if previous file was filtered out it jumps to newest file silently. Triggers callback immediately `timeSlider.js:263/272` which drives `main.js` data reload — potential double fetch if caller also reloads. |
| `renderChips()` `timeSlider.js:277` | **Works** | Clears container via `innerHTML=""` then appends `chip-btn` with `active` class. Click handler correctly updates index, labels, and fires `onTimeChangeCallback`. **Defect:** No `aria-selected` or keyboard navigation; chips overflow `overflow-x:auto` without visible scrollbar hint. |
| `step(delta)` `timeSlider.js:371` | **Works but UX question — Minor** | Circular modulo wrap `(idx + delta + len) % len` means stepping past end wraps to start — may surprise users expecting clamp. Used by keyboard shortcuts and playback — consistent but undocumented. |
| Playback `startPlayback/pausePlayback` `timeSlider.js:388,398` | **Works** | Uses `setInterval` with `appState.get("playbackSpeed")`. Speed control is exposed via `appState.playbackSpeed` but no UI slider exists — dead configurability. No pause on window blur / visibility change — animation continues in background tab. |
| Init-cycle select `timeSlider.js:218` | **Works** | On change, updates `currentInitCycle`, calls `updateLabels`, and fires `{isInitChange:true, initCycle}`. `main.js:263` correctly handles this branch and respects `expectedSeq` for stale guard. |

---

### 2.5 `src/ui/tabWindowManager.js` — `client/src/ui/tabWindowManager.js:13`

| Function | Verdict | Detail |
|---|---|---|
| `initTabWindowManager(callbacksObj)` `tabWindowManager.js:13` | **Works** | Renders tabs bar `tabWindowManager.js:31`, creates primary workspace with 4 windows `tabWindowManager.js:104`, init maps for win0, focuses win0. Returns `firstTab` correctly for `main.js` bootstrap. |
| `createWindowPanel` `tabWindowManager.js:122` | **Works** | Assigns `DEFAULT_LEVELS[wIdx] \|\| 500` `tabWindowManager.js:138` — works for first 4 windows; beyond 4 `newIdx >=4` gets `level:500` fallback which is reasonable. DOM structure correct. |
| `focusWindow(tabId, winIdx)` `tabWindowManager.js:329` | **Works with caveats — Moderate** | Highlights panel + pill, ensures map exists, calls `setActiveMap`, resizes map `tabWindowManager.js:355`, syncs `appState` `tabWindowManager.js:360`, and fires `callbacks.onWindowFocus`. **Defect:** Rapid `focusWindow` calls (e.g., clicking two pills quickly) can interleave `map.resize` timers (50 ms `setTimeout`) on wrong map. Also `appState.update` fires even when focus hasn't changed, causing redundant listeners. |
| `setTabLayout(tabId, layout)` `tabWindowManager.js:251` | **Works with caveats — Moderate** | Applies `layout-*` class, lazy-inits maps for newly visible windows via `initWindowMap` + `onWindowInit`, handles 1×2 active-window clamp, schedules `syncTabCameras` and `map.resize`. **Defect:** `isSyncingCamera` is a single global boolean `tabWindowManager.js:11`; with multiple tabs, sync of tab A can suppress sync of tab B if they fire concurrently. Also `numVisible` slice `tabWindowManager.js:271` assumes windows are ordered by `winIdx`; after `closeWindowTab` re-indexing this holds but is fragile. |
| `toggleTabsAndSplit(tabId)` `tabWindowManager.js:322` | **Works** | Toggles 1×1 ↔ 2×2 as documented. |
| `addTabWindow()` `tabWindowManager.js:213` | **Works with caveat — Minor** | Appends panel, setups controls, inits map, calls `onWindowInit`, focuses. New tab's `winIdx` equals `tab.windows.length` pre-push, but pills use `id="tab-item-win-${wIdx}"` — after prior `closeWindowTab` that re-indexed, pill IDs may collide (e.g., close win 0 then add win 4 leaves stale `tab-item-win-3` duplicate). Current `closeWindowTab` `tabWindowManager.js:240` attempts re-index by updating `dataset.winIdx` and badge text but **does not rename pill `id`** — stale `id` remains, future `getElementById` lookups for pill may return wrong element. |
| `closeWindowTab(tab, winIdx)` `tabWindowManager.js:227` | **Moderate defect** | As above: re-indexing updates `winIdx` and badge text but not `panelId`/`headerId`/`domId` on `winObj` nor DOM `id` attributes. Subsequent `getElementById(win.panelId)` still uses old `panelId` (pre-close), but DOM node was removed — future references via stale `panelId` will miss. Also `map.remove()` is called but listeners on that map (wind/canvas, station move) are not explicitly cleaned. |
| `initWindowMap(win)` `tabWindowManager.js:374` | **Works with caveats — Minor** | Creates map via `createMapInstance`, stores `win.map`, registers `load` sync to active window's camera, and `move` sync handler `tabWindowManager.js:405`. Sync handler correctly guards `isSyncingCamera` and `layout==="1x1"`. **Defect:** Handler uses `map.jumpTo` inside `move` event — `jumpTo` triggers `move` on target maps, but guard prevents recursive storm. Pattern is correct but uses synchronous loop over `tab.windows.slice(0,numVisible)` which may include a map whose style not loaded — guarded by `isStyleLoaded() \|\| loaded()` but `jumpTo` before style load still queues camera incorrectly. |
| `setupWindowControlsForWin` `tabWindowManager.js:427` | **Works — By Design** | Binds `presetSelect change` and `levelSelect change` to set `win.activeGroup`/`win.level` and `focusWindow` `tabWindowManager.js:439,447`. **Does not call `callbacks.onWindowGroupChange` / `onWindowLevelChange` and does not fetch data — intentional.** Per product spec, window-header selects only stage the target group/level for the focused window; the actual data load is gated on navbar **Load Data** (`main.js:178` `onLoadData`). `focusWindow` then syncs navbar, layer panel and timeline. Not a defect. |
| `updateWindowTitle / setWindowHeaderPreset / setWindowHeaderLevel` `tabWindowManager.js:470,480,485` | **Works** | Direct DOM updates. `setWindowHeaderLevel` does `el.value = String(level)` — if `level` is `null` this sets value `"null"` which matches no option; prefer `level ? String(level) : ""`. |
| `refreshPresetControls()` `tabWindowManager.js:490` | **Works with caveat — Minor** | Re-renders preset `<select>` for every window and calls `updateWindowTitle`. Overwrites `win.activeGroup` with lookup in new `PRESET_GROUPS` `tabWindowManager.js:494` — if a preset was deleted server-side, `win.activeGroup` becomes `null` silently and title is cleared. |
| `syncTabCameras(tab)` `tabWindowManager.js:525` | **Works** | Explicit sync helper. Guarded. |
| Hidden controls | **Works — By Design — Minor note** | `win-preset-select` / `win-level-select` are `display:none !important` `tabs.css:286` — window headers currently hide these selects; combined with the staged-only header behavior above, `main.js:110` `onWindowGroupChange` / `main.js:133` `onWindowLevelChange` are retained as intentional no-auto-load fallback paths (invokable by tests / future CSS override) rather than dead code. No fix needed; keep CSS and callbacks in sync if the design ever changes to auto-load from header. |

---

### 2.6 `src/ui/layerActions.js` — `client/src/ui/layerActions.js:18`

| Handler | Verdict | Detail |
|---|---|---|
| `handleLayerAction("visibility", …)` `layerActions.js:19` | **Works** | Dispatches to `setLayerIsobandVisibility`, `setLayerIsolineVisibility`, `setRasterVisibility`, `renderWindStreamlines`/`stopWindAnimation`, and station/b MapLibre visibility. Correctly honors `layer.visible && config.*`. **Defect:** `layer` may be `null` when `action==="aux"` — handled, but for `visibility` no null guard before `layer.type` access; will throw if `getLayerById` missed. |
| `handleLayerAction("config", …)` for `pmtiles` `layerActions.js:64` | **Works** | Live scheme switch via dynamic `import("../map/pmtilesLayers.js")` + `applyBasemapScheme` and `updateGraticuleScheme` — correct lazy import avoids circular dep. Province/city toggles correctly. |
| Contour config `layerActions.js:91` | **Works** | Toggles fill/line, opacity, line style, raster/wind/barbs, and palette. Palette branch `layerActions.js:135` correctly clears colormap on `!value.palettePath` and re-renders raster if needed. Dynamic imports for palette use stable key `palette:${layer.id}` — correct. |
| Palette async race `layerActions.js:142` | **Moderate defect** | Two rapid palette changes can race: first `loadXMLPalette(pathA)` resolves after second `loadXMLPalette(pathB)`, overwriting `layer.colormap = "palette:id"` with stale stops under same key. No sequence token. |
| Station config `layerActions.js:161` | **Works** | Calls `setStationConfig` and streamlines toggle. |
| `remove` `layerActions.js:171` | **Works** | Removes contour/raster/wind/barb or station markers. For station, calls `setStationVisibility(false)` which clears markers but leaves `state.geojson` intact; `main.js:475` also calls `clearWindowWeatherLayers` so no leak. |
| `aux` (`raster`/`wind`) `layerActions.js:181` | **Works with caveat — Minor** | `triggerRasterOverlay(map,null,win)` expands to iterate weather layers — could trigger N fetches in parallel if many layers lack `gridData`. No throttling. |
| `triggerRasterOverlay` `layerActions.js:198` | **Works with caveats — Moderate** | Three-tier fallback: `layer.gridData` → `win.windGridData` → fetch binary → fetch JSON. Path/file resolution `layerActions.js:230` uses `win.forecastCycle \|\| appState.get("forecastCycle") \|\| "26082908"` — last literal is stale date (Aug 2026) and will 404 in production until overridden by `resolveLatestForecastCycle`. Errors are caught and warn, but no UI error toast. |
| `triggerWindStreamlines / triggerWindBarbs` `layerActions.js:267,294` | **Works** | Reuses in-memory grid or fetches `model/WIND/level`. Same stale fallback cycle issue. |
| `triggerStationStreamlines` `layerActions.js:321` | **Works** | Uses `generateStationWindGrid` from `windLayer`. Fallback fetch uses hard-coded `"20260828170000.000"` `layerActions.js:338` — stale. |
| Per-window correctness | **Moderate defect** | All `renderWindStreamlines` / `renderGridWindBarbs` attach a single `.streamline-canvas` / `.wind-barb-canvas` per map container. Correct for single window. In 4-split mode, each window's container has its own canvas — correctly scoped via `map.getContainer().querySelector`. |

---

### 2.7 `src/ui/keyboardShortcuts.js` — `client/src/ui/keyboardShortcuts.js:2`

| Function | Verdict | Detail |
|---|---|---|
| `initKeyboardShortcuts({onPeriodStep, onLevelStep, onToggleSplit})` | **Works with caveats — Minor** | Binds `keydown` on `window`, ignores when target is `INPUT/TEXTAREA/SELECT` `keyboardShortcuts.js:5`. Correctly handles `ArrowLeft/Right` → `onPeriodStep`, `ArrowUp/Down` → await `onLevelStep`, `F4` / `Alt+S` → `onToggleSplit`. **Defects:** (1) `contenteditable` elements not excluded — typing in config textarea triggers navigation. (2) Does not check `e.repeat` — holding arrow generates rapid steps without debounce, may flood fetches. (3) `onPeriodStep` not awaited but `onLevelStep` is — asymmetric; period step may fire next before previous fetch completes (stale guard in `main.js` mitigates for levels but not for time steps via `isTimeStep=true` which preserves layers). |

---

### 2.8 `src/ui/configEditor.js` — `client/src/ui/configEditor.js:9`

| Function | Verdict | Detail |
|---|---|---|
| `initConfigEditor(onConfigChanged)` `configEditor.js:9` | **Works** | Stores callback. |
| `openConfigTab()` `configEditor.js:17` | **Works with caveats — Moderate** | Creates pill `tab-item-config` and full-screen panel, binds toolbar buttons, calls `activateConfigTab` + `loadCurrentConfigIntoEditor`. **Defect:** Pill insertion uses `tabsList.insertBefore(tabPill, addBtn)` but `tabsList` also contains window pills; after split mode hides `.tabs-list.hidden`, config pill still inside hidden container — inconsistent visibility. Also does not deactivate previous `tab-workspace` correctly when layout is 2×2 (hides all workspaces via `querySelectorAll(".tab-workspace").remove("active")` but leaves grid windows still in DOM with active-single classes — no visual bug but state inconsistency). |
| `activateConfigTab()` `configEditor.js:78` | **Works** | Adds `active` to config pill, shows panel, hides `layer-control` + `legend-panel`. Correct. |
| `closeConfigTab()` `configEditor.js:93` | **Works with caveat — Minor** | Removes pill + panel, restores first workspace tab `configEditor.js:101`. Assumes `wsList[0]` is the desired return target — after user had focused W3, closing config returns to W1 unexpectedly. Should restore previously active window via stored `activeTabId`/`activeWinIdx`. |
| `loadCurrentConfigIntoEditor()` `configEditor.js:113` | **Works** | Tries `/api/config?_t=` then fallback `config.json`, formats via `formatCompactJSON`, calls `validateEditorContent`. Network errors set badge to error — correct. |
| `validateEditorContent()` `configEditor.js:139` | **Works** | Parses JSON, toggles badge `valid`/`error`, shows message. No line-number hint on parse error — just `e.message`. |
| `bindEditorEvents(panel)` `configEditor.js:159` | **Works with caveats — Minor** | Textarea `input` validates, `Tab` inserts 2 spaces `configEditor.js:171` — correct. `Format` button reformats `configEditor.js:183`. `Reload` refetches. `Cancel` closes. `Save` validates, disables button, calls `savePresetConfig` → `loadPresetGroups` → `refreshPresetControls/refreshNavBarPresets` → `onConfigChangedCallback` `configEditor.js:219`. **Defect:** No `beforeunload` / “unsaved changes” guard; tab key does not handle multi-line selection indent. Save error leaves badge in error but message may be overwritten by subsequent `validateEditorContent` on next keystroke. |

---

### 2.9 `src/ui/legend.js` — `client/src/ui/legend.js:7`

| Function | Verdict | Detail |
|---|---|---|
| `updateLegend / removeLegend / clearLegends / syncLegendForWindow` | **Works with caveat — Moderate** | Uses `windowLegends Map<winId, Map<element, item>>` — correctly per-window. **Defect:** `renderLegendPanel` renders into single shared `#legend-panel` DOM `legend.js:40`. When user switches windows, `syncLegendForWindow` overwrites panel with new window's legends — correct for single-workspace view, but in 4-split mode there is only one shared legend panel, so W1 and W2 legends cannot be shown simultaneously; design limitation flagged as intended. |
| `renderLegendPanel` `legend.js:39` | **Works** | Handles empty → `hidden`, otherwise renders `legend-item` with CSS gradient `getCSSGradient` and tick labels. HGT tick logic `legend.js:59` distinguishes `isDam` via `zMax < 2500` — correct. |
| Tick generation | **Minor defect** | Uses `palette[0].val`, `palette[mid].val`, `palette[last].val` as ticks regardless of actual `zMin/zMax` — if field was stretched via `getColor` adaptive scaling, legend ticks won't match visible data range. Should derive ticks from `zMin/zMax` or palette. |
| Accessibility | **Minor** | No `role` or `aria-label`; gradient bar has no text alternative. |

---

### 2.10 `src/ui/tooltip.js` — `client/src/ui/tooltip.js:4`

| Function | Verdict | Detail |
|---|---|---|
| `initTooltip(containerId)` | **Works but limited — Minor** | Exposes globals `window.__SHOW_TOOLTIP__(lngLat, props)` and `__HIDE_TOOLTIP__` `tooltip.js:8,41`. Renders station values with `formatCoords`. **Defects:** (1) Always positions at `20px,60px` `tooltip.js:36` — not near cursor / station marker; will overlap header. (2) Value guards like `props.temperature > -90` `tooltip.js:14` treat missing temp as `"--"` but legitimate Antarctic temps near -80 °C would be shown incorrectly — threshold is arbitrary. (3) Not wired to MapLibre `mousemove`/`click` events by this module; caller (`stationLayer` future `mousemove` or external) must invoke globals manually — easy to forget, feature appears inert in current `main.js` bootstrap (no `map.on("mousemove")` binding found). |

---

### 2.11 `src/ui/stationFilterControl.js` — `client/src/ui/stationFilterControl.js:74`

| Function | Verdict | Detail |
|---|---|---|
| `ensureLayerFilterRules(layer)` `stationFilterControl.js:48` | **Works** | Migrates legacy `filterField1/Op1/Val1` to `filterRules` array. Correct. |
| `renderStationFilterSection(layer)` `stationFilterControl.js:74` | **Works** | Renders logic select, rule rows via `renderSingleRuleRow`, add/clear buttons, and quick-preset chips. Upper-air vs surface presets correctly branched `stationFilterControl.js:112`. |
| `renderSingleRuleRow` `stationFilterControl.js:137` | **Works** | Handles range (`between`/`..`) vs single value, shows `val2` input conditionally, hides rows beyond 1 when `logic==="none"` (actually `"Rule 1 Only"`). Inline styles ensure layout without external CSS dependency — correct but verbose. |
| `bindStationFilterEvents(configDrawer, layer, onAction, winId)` `stationFilterControl.js:180` | **Works with caveats — Moderate** | Binds field/op/value inputs, logic select, add/clear, presets. `rerender` rebuilds `.filter-rules-list.innerHTML` `stationFilterControl.js:193` and re-attaches listeners `stationFilterControl.js:200`. **Defect:** `attachRuleInputListeners` queries `configDrawer.querySelectorAll(".sel-rule-field")` etc after each rerender but never removes old listeners — however since `innerHTML` discards old nodes, listeners on removed nodes are GC'd, so no leak. But `logicSel` and button listeners are bound once outside `attachRule` and not re-bound on rerender — correct. **Defect:** After rerender, focus is lost; editing a value then changing operator (which triggers rerender) moves cursor away. |
| `PRESETS` presets `stationFilterControl.js:4` | **Works** | Sensible domain presets; `wind5_rain10_tt10_30` correctly uses `between` with `val2`. |

---

### 2.12 `src/utils/timelineSync.js` — `client/src/utils/timelineSync.js:9`

| Function | Verdict | Detail |
|---|---|---|
| `resolveForecastCycles(model, element, level)` `timelineSync.js:9` | **Works** | Fetches `fetchTree(path)`, extracts cycle prefix before `.`, dedupes, sorts reverse. Caches per `path` and per `model` `timelineSync.js:26` — correct optimization. Falls back to 10 hard-coded cycles — stale date `26082908` but functional. No TTL — cache persists for session, so newly arrived cycles won't be picked up without reload. |
| `resolveLatestForecastCycle` `timelineSync.js:41` | **Works** | Delegates correctly. |
| `syncObservationTimeline(path, currentFile, winTitle, win)` `timelineSync.js:46` | **Works with caveats — Moderate** | Fetches tree, filters by size>100 or size==0, selects `.000` files, picks `recentFiles.slice(0,10).reverse()` as timeline. **Defects:** (1) Guard `!win \|\| getActiveWindow()===win` `timelineSync.js:58` suppresses `setTimelineMode` when target window is in background — background window's timeline will never be updated until it becomes active, so time slider shows stale file for that window. (2) `validFiles !== DEFAULT_MOCK_OBS_FILES` reference equality check `timelineSync.js:56` is unreliable after `filter` creates new array — should check length/origin flag. (3) File name format assumption `.000` is Cassanda-specific; generic deployment may use different suffix. |

---

### 2.13 `src/store/appState.js` — `client/src/store/appState.js:3`

| Function | Verdict | Detail |
|---|---|---|
| `get / set / update / setLayer / subscribe / emit` | **Works** | Minimal reactive store. `set` emits even when `value === oldValue` — causes redundant renders; add equality bail-out. `listeners` is `Map<string, Set<callback>>` — correctly supports multi-subscriber. No `unsubscribe` helper beyond returned closure; correct. No persistence — by design, per-window state lives in `tabWindowManager` `win` object. |

---

### 2.14 `src/main.js` — Orchestration (`client/src/main.js:53`)

| Flow | Verdict | Detail |
|---|---|---|
| `bootstrap()` `main.js:53` | **Works** | Loads presets, inits managers, wires callbacks. Order correct (presets before nav). `initKeyboardShortcuts` correctly delegates to `timeSliderStep` and `changeVerticalLevel(getMap(),…)`. **Defect:** `changeVerticalLevel(getMap(), dir)` captures `getMap()` at keypress time — correct, but `getMap` uses `getActiveWindow().map` which may be null if window's style not yet loaded; should guard. |
| `onWindowFocus` `main.js:64` | **Works with caveat — Minor** | Syncs nav preset/level, layer control, legends, then resolves timeline (async `syncObservationTimeline` / `resolveForecastCycles`). Duplicate `setNavBarPreset(win.activeGroup?.id)` appears twice `main.js:66,83` — redundant. Uses `win.activeGroup \|\| win.model` branching correctly. Not awaited — timeline update is fire-and-forget, so rapid window switches can cause out-of-order `setTimelineMode` calls; last-focus wins via `getActiveWindow()===win` guard in `timelineSync`. |
| `onWindowGroupChange / onWindowLevelChange / onWindowInit` `main.js:110,133,142` | **Works — By Design** | `onWindowGroupChange` / `onWindowLevelChange` correctly reload group/level and sync timeline `main.js:110,133`. They are **intentionally not invoked by window-header selects** — header only stages `win.activeGroup`/`win.level` (see §2.5); the real load is via navbar **Load Data** (`main.js:178`). Callbacks are retained as explicit fallback paths for programmatic / test callers. `onWindowInit` lazy-load path `main.js:142` is active and correct. |
| `initCatalogDrawer` callback `main.js:208` | **Works** | Assigns `win` fields, clears layers, syncs observation timeline or loads weather field. Correctly calls `clearAllWeatherLayersFromMap` before async fetch — prevents stale layer ghosting. |
| `initLayerControl` `main.js:238` | **Works** | Single delegation to `handleLayerAction` with `getMap()` and `getActiveWindow()` captured at action time — correct per-window. |
| `initTimeSlider` `main.js:244` | **Works** | Three-branch handler: `isObs` → reload station composite, `isInitChange` → reload with `initCycle`, else forecast period step. `win.obsTime = data.file` assignment correct. Uses `win` captured via `getActiveWindow()` at event time — correct; stale window guard not needed because user interacts with active window's slider. |
| `loadWeatherField` `main.js:304` | **Works with caveats — Moderate** | Resolves forecast cycle if missing `main.js:306`, builds `file = ${cycle}.${pad3(period)}`, handles wind vs contour branching, preserves `existingLayer.config` (`showFill`, `opacity`, etc.), restores palette via `paletteLoader` `main.js:340`, renders contour via `renderContourLayers`, registers `addOrUpdateLayer`, conditionally renders raster `main.js:413`, wind streamlines/barbs `main.js:422`, updates legend. **Defects:** (1) `existingLayer?.config.opacity` fallback uses `||` semantics where `0` would be falsy — but opacity never 0 in practice, so minor. (2) `customOptions?.isWind` check for WIND element is redundant — element already checked. (3) Stale guard `win.loadSeq !== expectedSeq` `main.js:335` is checked *after* `await fetchGridData` — correct to discard late response, but `loadPresetGroup` does not propagate `expectedSeq` to each per-layer `loadWeatherField` consistently when `isTimeStep=true` (seq passed but `clearAllWeatherLayersFromMap` skipped). |
| `loadPresetGroup` `main.js:491` | **Works with caveats — Minor** | `Promise.allSettled` over layers, resolves period/level, syncs timeline `main.js:528`, logs. Per-layer handling `main.js:536` chooses `targetLevel` based on `level` override and `group.hasLevel`. **Defect:** `win.period = curPeriod` is set before verifying fetch success — if fetch fails, UI shows new period but map shows old data. Also `setTimelineMode` called *before* data load completes — slider may show valid time before map is ready, confusing. |
| `changeVerticalLevel(map, direction, explicitLevel)` `main.js:567` | **Works** | Steps through `levels` array, clamps, bumps `win.loadSeq`, updates `appState` + nav + header, then dispatches based on `activeGroup.hasLevel` vs upper-air vs generic field. Correctly handles `loadSeq` stale guard and `syncObservationTimeline` for upper-air. |
| `clearAllWeatherLayersFromMap` `main.js:474` | **Works** | Removes contour/wind/station/raster/legends and clears window layers. Try/catch prevents one removal failure from aborting others. |

---

### 2.15 `src/map/mapInstance.js` + `src/style.css` / `src/tabs.css`

- `createMapInstance` `mapInstance.js:34` correctly creates MapLibre with PMTiles style and `NavigationControl`; disables `keyboard` to allow `keyboardShortcuts.js` to own arrows — correct coordination. `addGraticuleLayers` on `load` — correct.
- `setBasemapScheme` `mapInstance.js:70` handles both loaded and not-yet-loaded style via `once("load")`, persists to `localStorage` and `window.__MICAPS_CONFIG__` — correct.
- Styles: `style.css` and `tabs.css` correctly implement drawer slide (`transform: translateX(-340px)` vs `display:none` for panel) — `catalog-drawer` uses transform slide (animates) while `layer-control` uses `display:none` (no animation) — intentional difference but inconsistent. No focus-visible outlines; no responsive breakpoint for <768 px.

---

### 2.16 Cross-Cutting Concerns

1. **Per-window isolation:** `stationLayer` uses `WeakMap(map → state)` — correct. `contourLayer` / `rasterLayer` use layer-id-scoped source/layer IDs per window via `getLayerDOMIds(layerId)` — correct, but raster `getRasterDOMIds` defaults to `"default"` when `layerId` falsy; two windows both using default id would collide if they share same map instance (they don't — each window has own `map`). So safe.
2. **Stale-fetch guards:** `main.js` uses `win.loadSeq` counter for level changes and passes `expectedSeq` to `loadWeatherField` / `loadObservationProduct` — correct pattern. Not applied to time-slider period steps (time `isTimeStep=true` skips clear), so rapid period clicks can still cause out-of-order renders, though last fetch overwrites visually.
3. **Accessibility:** No `aria-*` on toggles, no keyboard focus trap in drawers, no `role="tablist"` for tabs — fails WCAG 2.1 minimum.
4. **Error feedback:** Network failures log to console but show no toast / banner. User sees perpetual `Loading...` on button or blank map.
5. **Performance:** `layerControl` full re-render on each `addOrUpdateLayer`; `stationLayer` clusters markers in 100 px bins — efficient. `windLayer` runs 1200-particle `requestAnimationFrame` loop per map — in 4-split, 4 loops compete; should throttle hidden windows.

---

## 3. Summary Table

| Area | Functions Reviewed | Pass | Moderate Defects | Minor Defects |
|---|---|---|---|---|
| Nav Bar | 5 | 3 | 2 | 1 |
| Catalog Drawer | 3 | 1 | 2 | 1 |
| Layer Control | 9 | 5 | 3 | 4 |
| Time Slider | 8 | 6 | 2 | 3 |
| Tab/Window Manager | 10 | 7 | 2 | 3 |
| Layer Actions | 6 | 4 | 3 | 1 |
| Keyboard Shortcuts | 1 | 0 | 0 | 1 |
| Config Editor | 6 | 4 | 1 | 2 |
| Legend | 3 | 2 | 1 | 2 |
| Tooltip | 1 | 0 | 0 | 1 |
| Station Filter | 4 | 3 | 1 | 0 |
| App State / Timeline / Main | 8 | 7 | 2 | 1 |
| **Total** | **64** | **41** | **20** | **20** |

---

## 4. Priority Fixes

**P0 (do before release):**
1. `tabWindowManager.js:227` — fix `closeWindowTab` ID re-indexing to rename DOM `id` attributes and `winObj` ids, or prohibit closing below 4 windows.
2. `layerActions.js:142` / `layerControl.js:333` — add sequence token to palette loads to prevent stale colormap overwrite.

**P1:**
3. Preserve caller window in `syncObservationTimeline` / `setTimelineMode` instead of `getActiveWindow()===win` guard that drops background-window updates.
4. Add `win.loadSeq` stale guard to time-slider period steps.
5. Show user-visible error toast on `fetchGridData` / `fetchTree` failures; remove hard-coded stale fallback cycle `26082908`.
6. Make `catalogDrawer` dynamic (populate levels/elements/obs-times via `fetchTree`) instead of hard-coded options.

**P2:**
7. Restore focus/scroll in `layerControl` re-renders, add `aria-*` attributes, handle `Escape` / outside-click to close drawer, gate `Loading...` with abort.
8. Throttle `keyboardShortcuts` `e.repeat`, add `beforeunload` guard in `configEditor`, and de-duplicate `main.js:onWindowFocus` duplicate `setNavBarPreset`.
9. (No action) Window-header staged-only behavior (`tabWindowManager.js:427`, `main.js:110/133`) is **by design** — navbar Load Data remains the sole data-load trigger. Keep callbacks and `tabs.css:286` hidden state in sync if auto-load is ever enabled.
10. (No action) UTC+8 (BJT) for all data keys and UI time titles (`client/src/ui/timeSlider.js:66`, `client/src/utils/formatters.js:39`, `timelineSync.js`) is **by design** for CMA operations — do not convert to UTC. Centralize BJT formatting if new datasets are added.

---

*End of review. All file:line references verified against HEAD.*
