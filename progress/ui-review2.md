# UI Review 2 — CSS Overflow, Operator/Interactive Status, Layer Consistency on Time-Step / Level / Hide-Show

**Date:** 2026-09-04
**Scope:** `client/index.html`, `client/src/style.css`, `client/src/tabs.css`, `client/src/ui/layerControl.js`, `layerActions.js`, `timeSlider.js`, `tabWindowManager.js`, `navBar.js`, `legend.js`, `tooltip.js`, `stationFilterControl.js`, `client/src/main.js` orchestration, `client/src/layers/*` visibility paths, `client/src/store/appState.js`.
**Method:** Static code reading at HEAD `e5a75b5`, CSS rule extraction via script, `bun test` (64 pass / 0 fail), targeted `grep`/AST checks for `visible`/`active`/`aria-*`/`overflow` propagation. No live browser; all claims cite verified `file:line`.

---

## 0. Executive Summary

Narrow scope re-review requested: (a) CSS overflow, (b) operator/interactive status feedback, (c) layer-model ↔ map consistency across time-step, level, hide/show.

- **Overflow:** Core scroll containers are correct (`drawer-body`, `layers-manage-container`, `timeline-chips`, `tabs-list`). Remaining risks are **panel-level clipping** (expanded configs push `.panel` past `max-height` with no scroll), **shared legend with no max-width/scroll**, **timeline-info single-row with no wrap/ellipsis**, and **zero responsive breakpoints** (no `@media` in either CSS file — verified by parse).
- **Interactive status:** Eye/chips/tabs/window-active/badge/disabled states are now consistent (prior review1 gaps for `Layers` button sync, `Load Data` gating, `aria-selected/pressed/expanded`, visibility `blur` pause are fixed). Remaining inconsistencies: eye open/closed glyphs near-indistinguishable, gear `↻45°` reads as “close”, play button has no `aria-pressed`, hidden-layer legend stays visible, window `active` 1px→2px border shifts layout.
- **Layer consistency:** Time-step (`isTimeStep=true`) preserves `visible`+`config` correctly for NWP contours. Level change (`isTimeStep=false` + clear) **resets hide/show to visible** for all NWP/station layers (only UPPER_AIR *derived contours* preserve via snapshots). Station base layers always reset to `visible:true` on any reload. Raster toggled ON while hidden never materialises on unhide (vs wind/barbs which re-trigger). Legend is not toggled on hide/show. All findings below are load-bearing for operator trust.

**Counts:** 9 overflow items (2 moderate, 7 minor), 10 status items (2 moderate, 8 minor), 9 consistency items (4 moderate, 5 minor). Total **8 moderate, 20 minor** in this scope. No critical crash.

---

## 1. CSS Overflow

No `@media` query exists in `style.css` or `tabs.css` (script-verified). All widths below are fixed-pixel + flex.

### 1.1 Panel (right) vs Drawer (left) — asymmetric overflow contract

| Element | Rule | Verdict |
|---|---|---|
| `.drawer` `style.css:132-148` | `width:320px; max-height:calc(100%-24px); overflow:hidden; .drawer-body{overflow-y:auto}` | **Works.** Outer clips, inner scrolls. **Minor:** no `max-width:calc(100vw-24px)` unlike `.panel`; on <344px viewport drawer overflows viewport horizontally. |
| `.drawer.hidden` `style.css:150-153` | `transform:translateX(-340px); pointer-events:none` | **Works.** Keeps layout, animates. Differs from `.panel.hidden` (`display:none`) — intentional but undocumented. |
| `.panel` `style.css:198-216` | `width:330px; max-width:calc(100vw-24px); max-height:calc(100vh-24px); display:flex; flex-direction:column` — **no `overflow` / `overflow-y`** | **Moderate — O1.** Only inner `.layers-manage-container` scrolls (`max-height:400px; overflow-y:auto` `style.css:258-264`). Panel title + badge + expanded `.layer-config` live *outside* that scroller. With 6+ layers and one expanded contour drawer (≈260px), panel exceeds `max-height` and clips with no scroll. Repro: add 4 NWP + 2 station layers, expand one contour + one station filter section → bottom rows unreachable. Fix: `overflow-y:auto` on `.panel` or move `max-height` budget to `#layers-list` as `min(400px, calc(100vh-200px))`. |
| `.layers-manage-container` | capped 400px + scroll | **Works** for collapsed rows, insufficient when drawers expand (see above). |
| `.panel.hidden,.hidden` `style.css:218-221` | `display:none !important` | **Works.** |

### 1.2 Layer row — correct

- `.layer-item{overflow:hidden}` `style.css:270`, `.layer-row{min-height:38px}` `style.css:277-286`, `.layer-name{flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}` `style.css:317-328` — **Works.** Verified: long preset names (e.g. `W1: 500 hPa Derived Geopotential Height`) ellipsis instead of pushing `⚙/✕` off-panel.
- `.btn-vis/.btn-config/.btn-remove{flex-shrink:0}` `style.css:290-356` — **Works.** Buttons never collapse.
- `.layer-config{min-width:0; overflow-x:hidden}` + `input,select{min-width:0; max-width:100%}` `style.css:571-580`, `.config-row{flex-wrap:wrap; min-width:0}` `style.css:374-384`, `.config-grid-2col{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}` `style.css:410-416`, `.config-checkbox-item{white-space:nowrap; overflow:hidden} span{ellipsis}` `style.css:418-585` — **Works.** This is the fix from `47c1f29`; contour bold-value row inline `flex-wrap:wrap; max-width:100%; min-width:0` `layerControl.js:603-624` correctly wraps `Width 40px + Bold 64px/36px` inside 302px usable. **Minor residual:** `.sel-basemap-scheme{min-width:140px}` `layerControl.js:691` can overflow if panel is at `max-width:calc(100vw-24px)` on a 300px phone — add `max-width:100%`.
- `.win-target-badge{white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px}` `style.css:234-248`, title wrapper `min-width:0; overflow:hidden` `layerControl.js:244` — **Works.**

### 1.3 Station filter rule row — tight but fits

- `.filter-rule-row{display:flex !important; flex-wrap:nowrap !important; gap:4px; width:100%}` `style.css:447-460` + field `flex:1 1 72px; min-width:64px; max-width:82px` + op `38px` + val `48px` (range `36+36px`) + remove `16px` `style.css:476-553` — **Works (minor note).** Min footprint ≈204px fits 302px usable; field shrinks first. `nowrap` is intentional to keep operator+values on one line. No horizontal scroll needed. Focus-restore on `rerender()` `stationFilterControl.js:188-220` preserves cursor — correct.
- `.config-quick-presets{flex-wrap:wrap}` `style.css:560-565`, `.btn-multi-filter-preset{white-space:nowrap}` `style.css:567-569` — **Works.** Chips wrap; longest preset (`Wind>5 & Rain>10 & TT 10..30`) wraps as unit, may create tall drawer but panel scroll (O1) is the only limiter.

### 1.4 Timeline — chips scroll, info row does not

- `.timeline-chips{overflow-x:auto}` + `.chip-btn{white-space:nowrap}` `style.css:723-724`, `role=tablist` + `aria-selected` + `scrollIntoView({inline:end})` `timeSlider.js:284-337` — **Works.** 6h mode (0..120+132..240) overflows horizontally by design and scrolls; active chip auto-scrolls.
- `.timeline-body{flex:1; min-width:0}` `style.css:690-696` — **Works.**
- `.timeline-info{display:flex; gap:12px}` `style.css:698-704` — **Minor — O2.** No `flex-wrap`, no `overflow`, no ellipsis on `#time-lead-wrapper` / `#time-valid-label`. With win-badge (up to 140px) + `Init:` select + `Forecast Lead +024h` + `Valid: … (Step: 6h)`, widths exceed ~700px and push `valid-label` (which relies on `margin-left:auto` `style.css:722`) off-screen with no scroll. `#timeslider-container{gap:16px; padding:0 20px}` `style.css:641-650` + `.timeline-stepper{flex-shrink:0}` `style.css:670-675` leave no shrink budget. Fix: `flex-wrap:wrap; row-gap:2px` on `.timeline-info` and `overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0` on `valid-label`.
- Step/Init selects styled mono blue `style.css:680-688` — **Works**, no overflow.

### 1.5 Navbar / tabs-bar — desktop-only

- `#navbar{height:48px; display:flex; justify-content:space-between}` `style.css:14-23`, `.nav-middle/.nav-controls{gap:10-12px}` `style.css:56-67` — **Minor — O3.** No `flex-wrap`, no `overflow-x`, no media query. Below ≈900px brand + group + level + status + Layers + Config clip. Status text (`MOCK` vs `CASSANDRA :6527` `navBar.js:219`) changes width and shifts buttons. Acceptable for workstation target, but add `overflow-x:auto; min-width:0` on `.nav-middle` or hide `.nav-status-text` <768px.
- `.tabs-list{overflow-x:auto}` `tabs.css:15-20` — **Works.** `.layout-controls` has no shrink; on narrow bar it squeezes pills first (correct priority). `.tabs-list.hidden` in split mode `tabs.css:125-127` + config-tab un-hide guard `configEditor.js:79-101` — **Works.**
- `.win-title-group{overflow:hidden; min-width:0; flex:1}` + `.win-title{white-space:nowrap; text-overflow:ellipsis; overflow:hidden; min-width:0}` `tabs.css:250-282` — **Works.** Long `[Obs:/Valid:]` suffixes (see `computeFullWindowTitle` `tabWindowManager.js:592-636`) ellipsis instead of pushing `⛶`.
- `.window-panel{overflow:hidden}` `tabs.css:215-222`, `.map-viewport{flex:1; height:calc(100%-28px)}` `tabs.css:310-315`, `#workspace-container{overflow:hidden}` `tabs.css:134-141` — **Works.** `.window-panel.active{border:2px}` vs base `1px` `tabs.css:224-226` causes 1px layout shift on focus — **minor**, use `box-shadow` or `outline` instead.
- `.config-editor-panel{position:absolute; 100%x100%; overflow:hidden}` + `.config-editor-body{overflow:hidden}` + textarea `resize:none` `tabs.css:331-417` — **Works.** Toolbar `space-between` with no wrap `tabs.css:344-352` may overflow <520px — **minor**.

### 1.6 Legend / tooltip / toast

- `.legend-panel{position:absolute; bottom:16px; left:50%; transform:translateX(-50%); display:flex; flex-direction:row; flex-wrap:wrap; gap:16px}` `style.css:587-605` — **Minor — O4.** `flex-wrap` helps, but **no `max-width` (e.g. `min(90%, 720px)`), no `max-height`, no `overflow`**. Each `.legend-item{min-width:170px}` `style.css:612-617`. With 3+ elements (TMP+HGT+SLP) panel exceeds viewport and covers map centre with no scroll. Also single shared `#legend-panel` for 4-split (see §3.4). Fix: `max-width:min(90%,720px); max-height:120px; overflow:auto`.
- `legend.js:80-94` renders `role=img aria-label` on bar — **Works** (fixed since review1).
- `tooltip.js:37-56` positions near cursor with viewport clamp (`estW 280/estH 180`) — **Works.** Fallback `20,60` only when no cursor pos; `.tooltip{position:absolute}` `style.css:727` inside `#main-content{position:relative}` `style.css:110-115` so absolute is scoped correctly.
- `#error-toast{max-width:80vw}` `main.js:44` — **Works**, no overflow.

---

## 2. Operator / Interactive Status

| Control | Visual status today | Verdict |
|---|---|---|
| Eye (visibility) `layerControl.js:284-292,543-548` | `btn-vis.active` (blue `#58a6ff` vs grey) + `👁/👁‍🗨` swap + `aria-pressed` + `title=Toggle Visibility` | **Works with minor defect — S1.** Both glyphs are eye variants; at 13px the `‍🗨` difference is near-invisible. Operator cannot tell hidden at glance. Prefer `👁 / 🚫` or opacity + strikethrough on `.layer-name`. `active` class toggle itself is correct and `handleLayerAction("visibility")` honors `layer.visible && config.*` `layerActions.js:27-54`. |
| Gear (accordion) `layerControl.js:310-332,556-559` | `btn-config.open{transform:rotate(45deg); color:#58a6ff}` `style.css:342-345` + `aria-expanded` on row+button + `.layer-config.hidden` toggle + single-open accordion | **Works with minor defect — S2.** 45°-rotated `⚙` reads as broken/close affordance. Use `▾/▸` chevron or keep gear static and only colour it. Accordion + `stopPropagation` on inputs `layerControl.js:336-340` is correct. |
| Contour/raster/wind checkboxes, opacity slider, colour picker, palette select `layerControl.js:354-397,465-474` | Native `checked`/`value` + immediate `autoSaveLayerConfig` + `onLayerAction("config")` live map update | **Works.** Palette select populated eagerly on expand `layerControl.js:328-330,372` with `isConnected` guard `layerControl.js:725` + per-layer seq in `layerActions.js:183-193` (prior race fixed). Empty-category shows disabled `No palettes` `layerControl.js:729-734` (prior silent-empty fixed). |
| Station filter operator (`> ≥ < ≤ = ..`) + values `stationFilterControl.js:165-176` | Native selects/inputs; `..` swaps single→dual inputs via `rerender()` with focus restore `stationFilterControl.js:188-217` | **Works.** Changing operator from `>` to `..` preserves focus/cursor — correct. `Rule 1 Only` hides rows 2+ via `.hidden` + inline `display:none` `stationFilterControl.js:137-142` — redundant but consistent. |
| Timeline chips `timeSlider.js:291-332` | `.chip-btn.active` (blue fill + glow) + `aria-selected` + `title` full timestamp + auto-scroll | **Works.** Best-in-class status in this UI. `step()` wrap-around modulo `timeSlider.js:395-414` is undocumented but consistent for play loop. |
| Play `timeSlider.js:416-434,507-513` | Text `▶/❚❚` + `appState.isPlaying`; auto-pause on `visibilitychange/blur` | **Works with minor defect — S3.** No `.active` class and no `aria-pressed` on `#btn-play`; screen reader / test cannot query playing state except via `appState`. Add `aria-pressed` + class toggle alongside text swap. |
| Layout buttons `tabWindowManager.js:392-419` | `.layout-btn.active` per `tab.layout`; Sync `🔗/✕` text + `active` + `title` | **Works.** |
| Tabs/pills + window active `tabWindowManager.js:445-458` | `.tab-item.active` (blue border) + `.window-panel.active` (2px blue) + `Wn` badge (green→blue) `tabs.css:259-272` | **Works with minor note.** Dual highlight (pill + panel) is clear. 1px→2px border shift noted in §1.5. `focusWindow` early-return on already-focused `tabWindowManager.js:436-443` avoids redundant status churn — correct. |
| Navbar `navBar.js:75-86,137-143,186-207` | `Load Data:disabled` when no preset; `Layers.active` synced on init + toggle; `status-dot` green/orange + `MOCK/CASSANDRA/OFFLINE` text; `AbortController` + cleanup `cleanupNavBar` | **Works.** All three review1 defects here are fixed. `setNavBarPreset` also syncs `disabled` — consistent. |
| Window badge in layer/time headers `style.css:234-248`, `timeSlider.js:351-359` | `Wn: title` ellipsis + `title` tooltip; hidden when empty (`display:none`) | **Works.** Per-window attribution is clear when switching windows. |
| Config editor pill `configEditor.js:72-143` | `.tab-item-config.active` + `aria-selected` + stays visible when `tabs-list.hidden` in split | **Works.** Previous-active-window restore `configEditor.js:54-59,170-183` fixed. |
| Legend | No hidden/visible status per layer | **Moderate — S4.** See §3.3: hiding a layer leaves its legend. Operator sees scale for invisible data. |
| Error toast `main.js:38-60` | Fixed bottom, 4s auto-hide, `showErrorToast` on field/obs failures `main.js:536,548,703` | **Works.** Prior silent-failure gap closed. Toast itself has no `role=alert`; add for AT — **minor**. |

Keyboard/focus: layer rows are `role=button tabindex=0` with `aria-expanded/label` `layerControl.js:544`; chips are `role=tab` + `aria-selected`; legend bar `role=img`; `bindProp` stops `click` propagation so checking a box never toggles accordion `layerControl.js:339` — all **correct**. No focus trap needed for non-modal panels.

---

## 3. Layer Consistency on Time-Step / Level / Hide-Show

### 3.1 Truth table (verified against `main.js` + `layerControl.js` + `layerActions.js`)

| Transition | Clears map? | Preserves eye (`visible`)? | Preserves config (`showFill/opacity/palette/filter`)? | Preserves legend correctly? |
|---|---|---|---|---|
| **Time-step NWP** (chip/step/play/init-select) `main.js:354-364` → `loadPresetGroup(...,isTimeStep=true)` / `loadWeatherField(...,true)` | No (`if(!isTimeStep)` guard `main.js:726-728`) — overlays same source IDs | **Yes.** `isVisible = existing.visible!==false` `main.js:416`; `addOrUpdateLayer` merges `{...old,...new, config:{...oldCfg,...newCfg}}` `layerControl.js:123-128`, `isExpanded` retained (no key in def) | **Yes.** `exCfg` carried into render (`showFill/showLine/opacity/lineColor/palettePath/smooth` `main.js:402-418`), palette restored via `palette:${layerId}` `main.js:428-440`, `colormap` passed through `main.js:471-502` |
| **Time-step OBS** (station chip) `main.js:298-330` | No map clear except wind/barb/raster teardown `main.js:315-317`; station source overwritten | **Partial — C1.** Base station layer recreated with `visible:true` hardcoded `main.js:618`; only *derived* contours preserve via `derivedContourSnapshots` snapshot `main.js:301-312,629-631` | **Partial.** Station `stnConfig` merged from `group.render/config` `main.js:617`, but live operator edits (filter rules, showTemp…) on the *window* layer are discarded because new def carries group defaults, not `existingLayer.config`. Derived contour `snap.visible` + `snap.config` honoured `main.js:629-659` |
| **Level change, NWP group (`hasLevel`)** `changeVerticalLevel` `main.js:845-880` → `loadPresetGroup(...,false)` | **Yes** (`clearAllWeatherLayersFromMap` inside `loadPresetGroup`) | **No — C2 (moderate).** After clear, `getLayerById` misses, `isVisible` defaults `true` `main.js:416`. Hidden contour reappears visible after `↑/↓` or explicit level pick. Only UPPER_AIR derived contours snapshot `visible` `main.js:849-862` | Rebuilt from `group.render` + `resolveColormap` `main.js:785-790`; live opacity/palette tweaks lost unless `autoSaveLayerConfig` persisted them to preset (it does persist, so group-backed tweaks survive, ad-hoc window-only tweaks do not) |
| **Level change, generic field / UPPER_AIR obs** `main.js:881-915` | **Yes** (`clearAllWeatherLayersFromMap` `main.js:893,907`) | **No — same C2.** `loadWeatherField` / `loadObservationProduct` create fresh `visible:true` | Same as above; `loadUpperAirComposite` hardcodes `visible:true` `main.js:560` |
| **Hide/show (eye)** `layerControl.js:284-292` → `handleLayerAction("visibility")` `layerActions.js:24-68` | No | **Yes** (model flips `layer.visible`, button class + glyph) | **Yes** — map update is `value && config.*` gated (fill/line/raster/wind/barbs/station/streamlines) so re-show restores prior config combination |
| **Config toggle while visible** | No | Yes | **Yes**, live (`setLayerIsobandVisibility/Opacity/IsolineStyle`, `setStationConfig`, palette re-render with `layer.visible && …` `layerActions.js:98-234`) | Legend updated on palette revert/change `layerActions.js:177,214`; opacity/line ops correctly leave legend alone |
| **Config toggle while hidden — raster** | No | Yes (stays hidden) | **No — C3 (moderate).** `showRaster=true && !visible` does nothing `layerActions.js:132-137`; on later unhide, handler calls only `setRasterVisibility(map,value,layerId)` `layerActions.js:29-31` which is a no-op if the raster source was never created. Raster missing after unhide until toggle cycled. Wind/barbs do **not** have this bug — they `triggerWindStreamlines/triggerWindBarbs` (fetch + render) on unhide `layerActions.js:32-45` |
| **Config toggle while hidden — wind/barbs/streamlines** | No | Yes | **Yes.** Unhide re-triggers fetch/render from `layer.gridData → win.windGridData → fetch` `layerActions.js:428-500` | n/a |
| **Remove** `layerControl.js:296-302` + `layerActions.js:311-331` | Per-layer (`removeContourLayer/removeRasterLayer/stopWind/hideStation`) + preset-derived cleanup `removeDerivedLayerFromPreset` + snapshot prune | n/a (row removed, panel re-rendered) | n/a | **Minor — C4.** Single-remove does not call `removeLegend/clearLegends`; legend for removed element persists until next full clear or overwrite. Same root cause as S4 |
| **Window switch / split focus** `tabWindowManager.js:428-491` + `syncLayerControlForWindow` `layerControl.js:211-217` + `syncLegendForWindow` `legend.js:34-37` | No (each `win.map` independent; `windowLayersMap` per `win.id`) | **Yes** per-window (panel re-renders from that window's bucket; map already holds that window's visibility) | **Yes** per-window | **Minor — C5.** Single shared `#legend-panel` overwritten by focused window; in 2×2 each quadrant's data differs but only active window's scale is shown — misleading. By-design single-panel limitation, but add `Wn:` prefix to legend header or per-viewport mini-legends |

### 3.2 Detail notes (all verified)

- **C1/C2 root cause** is the same two lines: `addOrUpdateLayer({…, visible:true, …}, win)` in `loadUpperAirComposite` `main.js:560` and `loadObservationProduct` `main.js:618`. NWP path reads `existingLayer.visible` `main.js:416`; station paths do not. Fix: `const isVisible = getLayerById(layerId, win)?.visible ?? true` before construct, same as contour path. Level path additionally needs the same read *after* `clearAllWeatherLayersFromMap` — so snapshot `visibleById` *before* clear (as already done for `derivedContourSnapshots`) and re-apply on recreate.
- **Stale guards are correct** and do not break consistency: `win.loadSeq/expectedSeq` on period steps `main.js:354-364,422-424,551-552,608-609` + `periodStepSeq/_seq` boxing in `timeSlider.js:259-267,279,307,326-329,401-412` + `getActiveWindow()===win` + `_pendingTimeline` deferral `timelineSync.js:164-175` + `focusWindow` replay `tabWindowManager.js:482-488` + `addOrUpdateLayer`-then-`syncLayerControlForWindow` if still active `main.js:507-509,561,619` + all-fail period rollback `main.js:810-814`. Rapid stepping/leveling therefore converges on last intent; panel never shows a layer whose fetch was discarded.
- **Contour re-render honours hidden** everywhere it matters: `renderContourLayers` `contourLayer.js:165-166` (`showFill!==false && visible!==false`), `updateMapLibreContour` sets `visibility:none` on create *and* update `contourLayer.js:192,207,224,229`, raster `renderRasterImage` `rasterLayer.js:100,204,221`, station `renderStationWeatherPlots(map,geojson,visible)` `stationLayer.js:47-52` + `setStationVisibility` WeakMap per-map `stationLayer.js:465-495`. Model↔map contract is sound; the bugs are all in *caller* paths (C1–C3) that drop `visible` before calling.
- **`appState.state.layers` (`raster/wind/station` globals) vs per-window `layer.visible`** are two parallel systems (`appState.js:20-27` + `bindAuxCheckbox` `layerControl.js:704-711` + hidden compat checkboxes `layerControl.js:255-265`). The hidden checkboxes are test-only; operator path uses per-window eye. `loadWeatherField` `main.js:511` ORs global `appState.state.layers.raster` with per-layer `showRaster` — a globally-enabled raster can force raster on for a layer whose own `showRaster=false`. **Minor — C6.** Prefer per-layer flag alone, or document the OR.
- **Basemap (`pmtiles`) visibility** `layerActions.js:55-68,70-96` correctly ANDs master `value` with `showGraticule/Provinces/Cities` on both `visibility` and `config` paths — **correct**, no C3 analogue.
- **Derived-contour add/remove** (`addContour` `layerActions.js:235-310` + `upsert/removeDerivedLayerFromPreset`) correctly persists to preset and prunes `derivedContourSnapshots` on remove `layerActions.js:323-327` — **correct**.

---

## 4. Summary Table (this scope only)

| Area | Items | Pass | Moderate | Minor |
|---|---|---|---|---|
| CSS overflow (§1) | 12 | 5 | 1 (O1 panel scroll) | 6 (drawer max-w, info wrap, navbar, legend box, border shift, scheme min-w, toolbar) |
| Operator status (§2) | 12 | 8 | 1 (S4 legend-on-hide) | 3 (eye glyph, gear rotate, play aria) + toast `role` |
| Time/level/hide consistency (§3) | 11 | 4 | 4 (C1 obs-visible reset, C2 level reset, C3 raster-while-hidden, S4/C4 legend) | 3 (C5 shared legend, C6 global raster OR, remove-legend) |
| **Total** | **35** | **17** | **6 distinct* (O1,S4,C1,C2,C3,C4)** | **~14** |

\* S4/C4 share one legend fix. Counted as 8 moderate line-items in §3 detail due to split paths; 6 distinct fixes.

---

## 5. Priority Fixes

**P0 (operator trust — fix before claiming hide/show + level + time consistency):**
1. **C2/C1 — preserve eye across level & station reloads** (`main.js:560,618,845-915`). Snapshot `visibleById + configById` before `clearAllWeatherLayersFromMap`, re-apply on recreate (extend existing `derivedContourSnapshots` pattern to base layers). Same fix covers NWP level reset and OBS time-step base-layer reset.
2. **C3 — raster toggled while hidden never appears** (`layerActions.js:29-31` vs `132-137`). On `visibility==true`, if `config.showRaster && !map.getLayer(rasterLayerId)` call `triggerRasterOverlay(map,layer,win)` instead of bare `setRasterVisibility`. Mirrors wind/barbs path.
3. **O1/S4/C4 — panel scroll + legend lifecycle** (`style.css:198-216`; `legend.js:7-37`; `layerActions.js:24-68`). Add `overflow-y:auto` (or `min-height:0`) to `.panel`; call `updateLegend/removeLegend` on `visibility`/`remove` (hide → `removeLegend(element,win)`; unhide → `updateLegend(...)` from `layer.gridData.stats`); cap `.legend-panel` with `max-width:min(90%,720px); max-height:120px; overflow:auto`.

**P1:**
4. **O2/O4/O3 — narrow-viewport hardening.** `flex-wrap:wrap` + ellipsis on `.timeline-info`/`valid-label`; `max-width`+scroll on `.legend-panel`; `overflow-x:auto` on `.nav-middle`; `max-width:100%` on `.sel-basemap-scheme`. No breakpoint redesign needed, just prevent clipping.
5. **C6 — global vs per-layer raster OR** (`main.js:511`). Decide: per-layer wins, or document. Current OR surprises operators who disabled raster per-layer but left global on.
6. **C5 — split-mode legend attribution.** Prefix legend titles with `Wn` or render per-viewport legends. At minimum note the single-panel limitation in operator docs.

**P2 (polish):**
7. **S1/S2/S3 — status legibility.** Eye `👁/🚫`, gear static + chevron, `#btn-play[aria-pressed]` + `.active`, toast `role=alert`, window `active` via `outline` not `2px border`.
8. Keep fixed behaviours: chips `active+aria-selected+scrollIntoView`, palette seq guard, `win.loadSeq/periodStepSeq` stale discard, `_pendingTimeline` replay, per-map `WeakMap` station state + per-`layerId` raster/contour source IDs, `stopPropagation` on config inputs, focus restore in filter `rerender` — all verified correct, no change.

---

## 6. Verification Appendix

- `bun test` in `client/`: **64 pass, 0 fail** (colormaps, config, contour_logic, derived_layers, formatters, raster_layer, smooth_contour, station_contour_analysis, timeslider, weather_symbols, window_title).
- CSS parse: 0 `@media` rules; `.panel` has no `overflow`; `.layers-manage-container` sole scroller; `.legend-panel` has no `max-width/overflow`; `.timeline-info` has no `wrap/ellipsis` — all confirmed by extraction script.
- JS checks: `existingLayer.visible` read exists only in `loadWeatherField` (`main.js:416`), absent in `loadUpperAirComposite`/`loadObservationProduct` (both `visible:true`); `if(!isTimeStep)` clear guard present; `setRasterVisibility(map,value,layerId)` on unhide vs `triggerWindStreamlines` on unhide asymmetry confirmed; `paletteSeq` guard present; `aria-pressed/selected/expanded` present on eye/chips/rows.
- Git HEAD `e5a75b5`; `git status` clean.

---

## 7. Addendum (2026-09-04) — Surface/Upper-Air Plot + Contour Label Text Size: Agree, Too Small

**Question:** Is the font/text of surface/upper-air station plots and contour line value labels too small?
**Verdict: Yes — agree for the default national view. Primary station values render at ~8.3px effective, secondary at ~6.8–7.5px, contour labels at fixed 11px sparse. All below the 12px UI-chrome baseline and below comfortable ops-reading threshold.**

### 7.1 Evidence — station plots (`client/src/layers/stationLayer.js`)

- Marker base `fontSize="10px"` `stationLayer.js:350`, box `48×48px` with `transform:scale(${scale})` `stationLayer.js:402`, where `scale = zoom<4.5 ? 0.75 : (zoom<6.5 ? 0.88 : 1.0)` `stationLayer.js:308`.
- Inner fields: TT `11px/700` `stationLayer.js:416`, Td `11px/600` `stationLayer.js:421`, PPP `11px/700` `stationLayer.js:436`, ww `13px` `stationLayer.js:426`, VIS `10px/700` `stationLayer.js:431`, R6 `10px/700` `stationLayer.js:441`, ppa `9px/500` `stationLayer.js:446`. All `line-height:1` + thin `text-shadow:0 0 2px #000` halo (no stroke halo).
- Default map `zoom:4.2` `mapInstance.js:44` → `scale=0.75`. Effective sizes (script-verified):
  - TT/Td/PPP: `11×0.75 = 8.25px`; ww: `9.75px`; VIS/R6: `7.50px`; ppa: `6.75px`.
  - At mid zoom 5.5 (`0.88`): TT `9.68px`, ppa `7.92px` — still <10px.
  - Only at `zoom≥6.5` (regional close-up) do values reach nominal 9–11px, still below chrome (`nav 12–13px` `style.css:57-93`, panel `11–12px` `style.css:320,378`).
- Glyphs scale down with text: sky circle `16px`→`12px` effective `stationLayer.js:410` (`getSkyCoverSVG(cover,16)` `stationLayer.js:398`), calm ring `r=10` in `100px` SVG `weatherSymbols.js:50`, barb staff `41px` + `stroke-width:1.8`→`~1.35px` effective `weatherSymbols.js:57-109` inside `100×100px` box `stationLayer.js:405-406`. On HiDPI/projector the 1.35px blue staff + 12px sky dot wash out against dark basemap.
- Same renderer serves both SURFACE and UPPER_AIR (`renderStationWeatherPlots` shared; `loadUpperAirComposite`/`loadObservationProduct` both call it), so both products are equally affected. Upper-air is slightly worse operationally: Height/TT/Td triple must be read together for sounding comparison, but all three sit at 8.25px at national view.
- Density does not justify the size: declutter is already `100×100px` bins, max 5/bin `stationLayer.js:311-341`. A 48px box at 0.75 (=36px) leaves ample bin headroom — bumping to 13–14px base would still fit without new overlaps. Current choice optimises for no-overlap at the cost of illegibility.

### 7.2 Evidence — contour value labels (`client/src/layers/contourLayer.js`)

- Single label layer for all NWP + derived surface/sounding contours (both route via `renderCustomContourGeoJSON→updateMapLibreContour`): `text-field:[coalesce label,value]` `contourLayer.js:261`, **`text-size:11`** `contourLayer.js:262`, `symbol-spacing:200` `contourLayer.js:260`, `text-allow-overlap:false, text-ignore-placement:false` `contourLayer.js:264-265`, `text-halo-width:1.5` `contourLayer.js:271`, `text-size` has no zoom function (fixed screen-space).
- Consequences: (a) 11px is 1–2px smaller than every UI label and ~3–5px smaller than MICAPS-classic ops labels (typically 14–16px bold at national view); (b) `spacing:200px + allow-overlap:false` on a ~1000px-wide national viewport yields ~4–5 labels per long isoline, often zero on short closed highs/lows — operator sees lines without values; (c) `line-width:2.0 / bold:4.0` `contourLayer.js:169` dominates the 11px glyph, so bold 588/1010 lines read as thick coloured lines with unreadably small numbers.
- `setLayerIsolineStyle` `contourLayer.js:291-331` exposes no label-size control; layer-config panel has line width/bold width but no label-size slider, so operator cannot compensate.

### 7.3 Recommendation (no behaviour change, visual only)

- **P1:** Station base `10px→13px`, TT/Td/PPP `11px→13–14px/700`, VIS/R6 `10px→12px`, ppa `9px→11px`, ww `13px→15px`; box `48px→56px`; scale floors `0.75/0.88/1.0 → 0.9/1.0/1.15` (or clamp minimum effective TT to ≥11px). Keep `100px` bins; if overlap rises, raise to `110–120px` rather than shrinking text again. Thicken barb `stroke-width:1.8→2.2` and sky `stroke-width:1.5→2.0` to survive projector washout.
- **P1:** Contour `text-size:11→13` (bold-feature `14` via `text-size` expression on `isBold`), `symbol-spacing:200→160`, keep `allow-overlap:false` but set `text-ignore-placement:true` for bold labels only so characteristic values (5880/1010/0) always draw. Add `text-halo-width:1.5→2.0`. Expose label size in layer-config alongside line width (persist via `autoSaveLayerConfig` like other contour ops).
- **P2:** Zoom-adaptive labels: `text-size: interpolate[zoom, 4→12, 12→14]` and station `scale` already zoom-aware — extend to labels so national view stays legible without oversizing regional view. Verify in 2×2 split (each viewport ~½ width → fewer labels per line; `spacing:160` compensates).

*End of addendum — appended per request; §§1–6 unchanged.*

---

## 8. Addendum (2026-09-04) — 6h Rain Not Shown: Root Cause

**Symptom:** R6 (6h precipitation, middle-right sky-blue value) never appears on surface station plots, even when the operator expects rain.
**Verdict: Primary defect is config-propagation loss — `main.js` never applies the layer's `showRain6` to the map. Secondary amplifiers are opt-in default `false` + empty preset + `>0` blanking + §7 tiny font. Data path (server → client keys) is intact and is ruled out.**

### 8.1 Fault chain (all links verified by execution)

```
config.json composite-surface/surface-obs has NO render block
  → layerControl default showRain6:false (L160) + stationLayer default false (L25) + drawer unchecked (Boolean(...))
  → gate `showRain6 && rain6` (stationLayer.js:440) is false even when rain_6h=12.4 exists
  → even if operator checks the box (or config.json later carries showRain6:true via autoSave),
    main.js load paths call renderStationWeatherPlots() but NEVER setStationConfig()
  → mapState.config.showRain6 stays false → re-render blanks R6
  → zero-rain stations blank by design (`rawRain6>0`, L394-395) + 7.5px effective font (§7)
    → operator perceives "never shows"
```

### 8.2 Evidence

- **R1 — Data path OK (ruled out).** Server emits `rain_6h`: parser defaults `rain6h=0` and maps elements `1302,8 → rain6h`, output props `rain_1h/rain_6h/rain_24h` with `round1` (`server/parser/station_parser.go:86,170-173,203-205`); mock emits `rain_6h:0.5` (`server/mock/mock_generator.go:329`); `StationRecord.Rain6h json:"rain_6h"` (`server/model/types.go:70`). Client extraction keys `["rain_6h","RAIN_6H","rain6h","PRE_6h","RAIN_6h"]` (`stationLayer.js:194,394`) include the server key — script-confirmed. Fixture data also carries `rain_6h:12.4/35.8/5.2` (`client/test/derived_layers.test.js:64-74`). No key mismatch.
- **R2 — Default-off everywhere (first-hit cause).** `getState()` default `showRain6:false` (`stationLayer.js:25`); surface-layer factory default `showRain6:false` (`layerControl.js:160`); drawer checkbox `Boolean(layer.config?.showRain6)` → unchecked (`layerControl.js:499`); `composite-surface/surface-obs` has no `render` block at all (`client/config.json:354-360`, script-confirmed `render:null`). Fresh load therefore cannot show R6 until the operator opens the accordion and checks `6h Rain (R6)` (`layerControl.js:425`). Discoverability defect, not data defect.
- **R3 — PRIMARY: layer config never reaches the map on (re)load (bun-verified: 0 hits).** `main.js` contains **0 occurrences** of `setStationConfig` and does not import it; it calls `renderStationWeatherPlots()` twice (`main.js:555,612` — `loadUpperAirComposite` + `loadObservationProduct`) with only `(map, stations, appState.state.layers.station)` (global visibility), then builds `stnConfig={...group.render,...group.config}` and calls `addOrUpdateLayer(...,{config:stnConfig})` (`main.js:560,618`) without ever calling `setStationConfig(map, stnConfig)`. The **only** `setStationConfig()` call in the app is the live-toggle path `handleLayerAction("config")` for `type:"station"` (`layerActions.js:226`, script-confirmed count=1). Consequences:
  - Any persisted `showRain6:true` (via `autoSaveLayerConfig` → `pLayer.render.showRain6`, `presets.js:125`) correctly re-checks the panel on next load (layer merge preserves it) but leaves `mapState.config.showRain6=false` → **panel ON, map OFF** desync. Same fate for all opt-in station flags (`showCloud/showWeather/showVisibility/showTendency/showPressure(SLP)`); it is invisible for `showTemp/showDewpoint/showWind` only because both defaults are already `true`.
  - Time-step reload (`isTimeStep=true`, no clear) preserves the *current* `mapState` by accident (no re-init), so a manually checked R6 survives stepping; any preset/level/init-cycle reload (clear path) or fresh boot loses it. Matches the reported "sometimes shows after toggle, gone after reload".
- **R4 — Zero-suppression + size amplify "not show".** `rawRain6>0` gate (`stationLayer.js:394-395`, script-confirmed) blanks `0`/`-9999`/missing as `""` — correct meteorologically (no rain → no marker, avoids `0.0` clutter), but in dry regimes *all* stations blank, indistinguishable from a bug. Script demo: `fmt(0)=""`, `fmt(0.5)="0.5"`, `fmt(12.4)="12"`; `showRain6=false && 12.4 → "(blank)"`, `showRain6=true && 0 → "(blank)"`. Combined with §7 effective `10px×0.75=7.5px` R6 glyph, even genuine `0.5–5mm` values are easy to miss at national view.
- **R5 — Upper-air cannot show R6 by design (note, not the reported path).** Upper-air drawer omits the R6/Vis/Cloud/Weather/Tendency checkboxes entirely (`layerControl.js:485-489` upper branch); R6 is surface-only. If the report came from a sounding window, no UI path exists — but surface preset is the expected context, so R5 is informational.

### 8.3 Fix (P0 + P1, no data/API change needed)

- **P0:** After each `renderStationWeatherPlots()` in `main.js:555,612`, apply the layer config: `setStationConfig(map, stnLayer?.config ?? stnConfig)` (import `setStationConfig` from `stationLayer.js`). Same one-liner covers fresh load, preset reload, level change, init-cycle change, and catalog-drawer load. Alternatively move the call inside `renderStationWeatherPlots(map, geojson, visible, config)` — either way the map must receive `showRain6/showCloud/showVisibility/...` on load, not only on toggle.
- **P1:** Ship `composite-surface/surface-obs` with an explicit opt-in default decision: either `"render":{"showRain6":true,...}` if ops wants R6 always (plus `showVisibility/showTendency` review), or keep `false` but document that R6 is opt-in and survives time-step but currently resets on preset/level reload until P0 lands (extends existing C1/C2 in §3).
- **P1:** Keep `>0` blanking (correct) but add a legend/empty-state hint: when `showRain6=true` and all rendered `rain6==""`, the layer row could show a muted `R6: no rain >0 in view` sublabel instead of silent blank, so operators distinguish "no rain" from "broken".
- **P2:** Apply §7 size bump (R6 `10px→12px`) — at 7.5px effective the value is functionally hidden even when rendered.

### 8.4 Verification performed

- `bun -e` source assertions (executed, all pass): `setStationConfig` in `main.js` = 0, `renderStationWeatherPlots(` = 2, `setStationConfig(` in `layerActions.js` = 1, `surface-obs render` = `null`, gates `showRain6 && rain6` + `rawRain6>0` present, client keys include `rain_6h`.
- Format-gate demo executed: `0→""`, `0.5→"0.5"`, `12.4→"12"`.
- `bun test` suite unaffected (station R6 fixtures already carry `rain_6h`; contour `RAIN6.extract` fallback to `rain_1h/rain_24h` in `surfaceAnalysis.js:118` is independent of the plot-marker path and passes).

---

## 9. Verification (uncommitted changes vs §§1–8) — 2026-09-04

**Scope:** `git diff` (12 modified files) + new `client/test/ui_review2_fixes.test.js`. `bun test`: **78 pass / 0 fail** (was 64; +14 new).
**Verdict: ~90% fixed. All overflow, status-legibility, font-size, and R6-propagation items are correctly addressed. Two residual gaps: (a) visibility snapshot covers level-change only, not preset/init/catalog reloads; (b) station eye-toggle now writes spurious station-element legend entries. Neither blocks commit, both noted below.**

### 9.1 Fixed — confirmed in diff

- **O1/O3/O4/O2:** `.panel{overflow-y:auto}` + `#layers-list{max-height:min(400px,calc(100vh-200px))}`, `.drawer{max-width:calc(100vw-24px)}`, `.nav-middle{overflow-x:auto;min-width:0}`, `.legend-panel{max-width:min(90%,720px);max-height:120px;overflow:auto}`, `.timeline-info{flex-wrap:wrap}` + `.valid-label{ellipsis}`, toolbar `flex-wrap`, scheme `max-width:100%`, active-window `border-color+inset box-shadow` (no 1px shift) — all match §5-P0/P1 asks.
- **S1/S2/S3:** eye `👁/🚫` + `aria-pressed` + `row.layer-hidden` strikethrough (`layerControl.js`, `style.css`), gear rotate removed, play `.active` + `aria-pressed` on init/start/pause, toast `role=alert aria-live=polite` — all correct.
- **S4/C4/C5:** visibility/remove now `updateLegend/removeLegend`; `loadWeatherField` legend gated on `isVisible`; legend titles carry `[Wn]` prefix; `renderLegendPanel` SSR-guarded. Correct direction.
- **C3:** unhide with missing raster source now `triggerRasterOverlay` instead of no-op `setRasterVisibility` (`layerActions.js`). Correct, mirrors wind/barbs.
- **C6:** `showRaster` fallback chain `exCfg ?? custom ?? global` + `if(showRaster && isVisible)` (`main.js`) — per-layer `false` now wins over global. Correct.
- **§7:** station base `10→13px`, TT/Td/PPP `11→13px`, VIS/R6 `10→12px`, ppa `9→11px`, ww `13→15px`, box `48→56px`, scale `0.75/0.88/1.0→0.9/1.0/1.15`, barb `1.8→2.2`, sky `1.5→2.0`; contour `text-size 11→[13,14-bold]`, `spacing 200→160`, bold `ignore-placement:true`, halo `1.5→2.0`, plus `labelSize` end-to-end (contour `setLayerIsolineStyle` + layer-config input + `presets.js` persist). Matches ask (labelSize default 13 confirmed in drawer template).
- **§8-P0:** both station load paths now `renderStationWeatherPlots(map,stations,isVisible,stnConfig)` + `setStationConfig(map,stnConfig)` with `renderStationWeatherPlots(...,config)` merging into map state (`stationLayer.js`, `main.js:555-580,612-640`); `surface-obs` ships `render:{showRain6:true}` (`config.json`). Panel-ON/map-OFF desync closed for the covered paths.

### 9.2 Partial — `layerSnapshots` covers level-change only (C1/C2)

- `win.layerSnapshots` is snapshotted **only** at the top of `changeVerticalLevel` (`main.js:~875`) and consumed in `loadWeatherField`/`loadObservationProduct`/`loadUpperAirComposite`, then cleared at the end of `changeVerticalLevel`. Level stepping (the reported C2 path) is therefore fixed.
- The same clear-then-reload pattern also runs in `loadPresetGroup` entry (`main.js:~755`), init-cycle change (`~338`), catalog-drawer load (`~269`), and `onWindowGroupChange`/`onLoadData`/`reloadConfiguration` — none of which sets `layerSnapshots`. On those paths `getLayerById` after `clearAllWeatherLayersFromMap` still misses and `isVisible` falls back to `true` (contour) / global default (station). Net: **hide-then-Load-Data / hide-then-switch-preset / hide-then-init-change still resets to visible.** Recommend moving the 10-line snapshot block into `loadPresetGroup` (before its `clearAllWeatherLayersFromMap`) or into `clearAllWeatherLayersFromMap` itself, so every clear path preserves.
- Existing `derivedContourSnapshots` (per-element) and new `layerSnapshots` (whole-window) now coexist on the UPPER_AIR path; merge order `group → snap → existing` is correct (operator live edits win), no conflict observed.

### 9.3 New nit — station visibility writes station-element legend entries

- `handleLayerAction("visibility"/"remove")` now guards only on `if (layer.element)` (`layerActions.js`). Station layers carry `element:PLOT_GLOBAL_3H/PLOT`, so toggling a station eye creates/removes a `PLOT_GLOBAL_3H` legend item (with `undefined` stats → palette-fallback ticks) that never existed before — station plots previously had no legend by design. Recommend narrowing both guards to `(layer.type==="contour"||layer.type==="wind")`, keeping S4/C4 scoped to contour/wind as reviewed.
- Minor: new contour `text-size 13/14` applies on the `addLayer` (create) branch only (`contourLayer.js`); data refresh on an existing source (`setData` branch) keeps the old layout size until the layer is recreated. Acceptable post-deploy (fresh boot recreates), but a `labelSize` change via an already-rendered layer relies on `setLayerIsolineStyle`, which is correctly wired — no action beyond awareness.
- `ui_review2_fixes.test.js` C3 case asserts only `showRaster` flag survival, not the re-trigger branch; coverage of the fixed branch is therefore static (diff) rather than behavioural. Suggest a mock-`getLayer→null` + spy on `triggerRasterOverlay` assertion if the test is kept.

### 9.4 Retest note

- `bun test` 78/78 green including the 14 new `ui_review2_fixes` assertions (CSS regex, legend prefix/removal, label-size expression, stroke widths, station-config smoke). No regressions in the prior 64.
- Manual recheck still advised for: 6-layer panel overflow, 3-element legend cap, R6 checked → time-step → preset-reload cycle, and 2×2 legend `[Wn]` attribution — the exact repros from §§1/3/8.

### 9.5 Fix applied (residuals from §9.2–9.3)

- **Snapshot centralised:** `clearAllWeatherLayersFromMap` now snapshots `win.layerSnapshots` (guarded, one-shot) before wiping, so preset reload / init-cycle / catalog paths preserve exactly like level-change; `loadPresetGroup` + catalog + init-change-direct paths clear the snapshot after consuming. `changeVerticalLevel` pre-snapshot retained (guard prevents overwrite).
- **Legend scoped:** visibility/remove legend sync narrowed to `contour/wind` only — station eye no longer creates `PLOT_*` entries.
- **Label migration:** `updateMapLibreContour` update-branch now applies `text-size`/`spacing`/`ignore-placement`/`halo` on data refresh, so pre-existing layers pick up 13/14px without remove/recreate; create-branch honours `options.labelSize`.
- **Tests:** C3 case strengthened (asserts re-trigger branch + no-throw) plus new station-legend-scope case. `bun test` **79/78+1 pass, 0 fail** after the fix.
