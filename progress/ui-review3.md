# UI Review 3 — Residual Layout, Status/Accessibility, Window-Timeline, and Map-Consistency Gaps

**Date:** 2026-09-07
**Scope:** `client/index.html`, `client/src/style.css`, `client/src/tabs.css`, `client/src/ui/*` (layerControl, layerActions, legend, stationFilterControl, tabWindowManager, timeSlider, navBar, catalogDrawer, configEditor, tooltip, keyboardShortcuts), `client/src/main.js`, `client/src/layers/*`, `client/src/store/appState.js`, `client/src/utils/timelineSync.js`.
**Method:** Static code reading at HEAD `99eab16`, full reads of all files above, targeted `grep`/line checks for `overflow`/`aria-*`/`visible`/`labelSize`/`loadSeq`/`catch`, cross-check against `ui-review2.md` §9 (all §9.1/§9.5 fixes re-verified; fixed items are marked PASS and not re-reported unless the fix is incomplete). No live browser; every claim cites a verified `file:line`.
**Baseline:** `ui-review2.md` §§1–8 plus §9 verification (78–79 tests green) are taken as fixed. This review covers only NEW or INCOMPLETE items.

---

## 0. Executive Summary

- **CSS/layout (§1):** All §9 overflow fixes hold (`panel overflow-y:auto`, legend cap, timeline wrap, nav-middle scroll, eye `👁/🚫`, play `aria-pressed`, border-shift fix — all PASS). Residuals are second-order: panel `max-height` uses viewport instead of container (overlaps timeline), global `.hidden{display:none !important}` dead-codes the drawer slide and tooltip fade animations, `.tabs-list` has a scroller but no flex-shrink budget (layout buttons get pushed off-bar), timeslider is still fixed `60px` while its info row now wraps to two lines (vertical clip), zero `@media` rules persist.
- **Layer panel status/a11y (§2):** Eye/gear/palette/raster-while-hidden fixes hold (PASS). Residuals: accordion `aria-expanded` is rendered but never updated on toggle, layer rows are `role=button tabindex=0` with click-only (keyboard-inoperable) plus invalid nested `<button>`s, legend `[Wn]` prefix is defeated from the layer panel because a string win-id is passed where an object is expected, unchecking fill+line leaves a stale legend, palette select can visually revert while the model keeps the old path.
- **Windows/timeline/navbar/catalog/config (§3):** Timeline chips/play/init gating hold (PASS). Residuals cluster around the Config tab: opening it splits the dual pill/panel highlight and closing it can leave no pill and no workspace `active`; `tabs-list.hidden` (split-mode contract) is not restored on close; hiding `layer-control` for Config desyncs the navbar Layers button. Catalog drawer loads correctly but empty-tree and load-throw paths are silent (no badge/toast). Config reload overwrites dirty edits without the confirm that close/cancel has. Background NWP loads overwrite the foreground timeline (mirror of the already-fixed obs `_pendingTimeline`).
- **Map consistency (§4):** Visibility snapshots, `setStationConfig` on load, `showRain6` default, raster/wind re-trigger, basemap AND-logic all hold (PASS). Residuals: NWP `labelSize` is read from config but never forwarded to `renderContourLayers` (operator sets 18px, next chip resets map to 13px while panel still says 18px); OBS time-step has no `loadSeq` stale guard (NWP does); secondary fetch paths (raster/wind/barbs/streamlines re-trigger) fail with `console.warn` only, leaving eye ON / map empty with no toast; global-vs-per-layer raster asymmetry persists for wind/station.

**Counts:** 8 moderate, 16 minor in this scope. No critical crash. Details below.

---

## 1. CSS / Layout Residuals

All §9.1 layout fixes verified present — `.panel{overflow-y:auto}` `style.css:217`, `.legend-panel{max-width:min(90%,720px);max-height:120px;overflow:auto}` `style.css:609-611`, `.timeline-info{flex-wrap:wrap}` `style.css:701-710`, `.valid-label{ellipsis}` `style.css:741-749`, `.nav-middle{overflow-x:auto;min-width:0}` `style.css:56`, `.drawer{max-width:calc(100vw-24px)}` `style.css:137`. The following are gaps in or around those fixes.

### 1.1 [Moderate — L1] `.panel max-height` uses viewport, `.drawer` uses container — panel slides behind timeline

```css
.drawer { ... max-height: calc(100% - 24px); ... }   /* style.css:137 — container-relative, correct */
.panel  { ... max-height: calc(100vh - 24px); ... }  /* style.css:199-205 — viewport-relative */
```

`.panel` lives inside `#main-content{height:calc(100vh-144px)}` `style.css:110-115`. `100vh-24` is ~120px taller than its containing block, so a tall scrolled panel extends behind `#timeslider-container{z-index:1000}` `style.css:656` (panel is `z-index:500` `style.css:210`). Fix is one token: `max-height:calc(100% - 24px)` like the drawer.

### 1.2 [Moderate — L2] Global `.hidden` dead-codes drawer slide and tooltip fade

```css
.drawer.hidden { transform: translateX(-340px); pointer-events: none; }  /* style.css:151-154 */
.panel.hidden, .hidden { display: none !important; }                     /* style.css:220-223 */
.tooltip.hidden { opacity: 0; }                                          /* style.css:754 */
```

`<aside id="catalog-drawer" class="drawer hidden">` and `<div id="tooltip" class="tooltip hidden">` (`index.html:25,27`) match both the specific and the global selector; the later `!important display:none` wins, so `transition:transform 0.25s` `style.css:148` never runs and `transition:opacity 0.1s` on `.tooltip` never fades — both snap. Behaviour is acceptable (hidden is hidden), but the slide/fade contracts are misleading dead code. Fix options: exempt drawers (`:not(.drawer)` on the global rule, or a separate `.collapsed` class for the slide path) and split tooltip into `.faded{opacity:0}` vs `.hidden{display:none}`.

### 1.3 [Moderate — L3] `.tabs-list` has a scroller it cannot reach — layout buttons pushed off-bar

```css
#tabs-bar { ... display:flex; justify-content:space-between; ... }  /* tabs.css:3-13 */
.tabs-list { display:flex; gap:6px; overflow-x:auto; }               /* tabs.css:15-20 — no min-width:0, no flex:1 */
.layout-controls { display:flex; gap:8px; }                         /* tabs.css:22-34 — no flex-shrink:0 */
.tab-item { display:flex; gap:8px; padding:4px 10px; ... }           /* tabs.css:22-34 — no flex-shrink:0, no max-width/ellipsis */
```

In a `space-between` flex parent a child without `min-width:0;flex:1` will not shrink — with many tabs `.tabs-list` shoves `.layout-controls` off-screen instead of scrolling, and `.tab-item`s compress to unreadable rather than triggering the scroller. Fix: `.tabs-list{min-width:0;flex:1}` + `.tab-item{flex-shrink:0;max-width:180px}` + title ellipsis + `.layout-controls{flex-shrink:0}`.

### 1.4 [Moderate — L4] Timeslider fixed `60px` vs wrapping info row — vertical clip

```css
#timeslider-container { height:60px; display:flex; align-items:center; ... }  /* style.css:648-657 */
.timeline-info { display:flex; align-items:center; flex-wrap:wrap; row-gap:4px; ... }  /* style.css:701-710 */
#time-lead-wrapper { min-width:0; white-space:nowrap; }  /* no overflow/ellipsis, unlike .valid-label style.css:741-749 */
```

The §9 wrap fix is present, but the container is still fixed `height:60px` with no wrap/overflow of its own. Two-row info (~18px×2+4) + chips (~24px) + `gap:6` ≈ 66px > 60px → bottom clipped on narrow viewports. `#time-lead-wrapper` also lacks the ellipsis that `.valid-label` got, so a long `Forecast Lead +240h` forces overflow at ~320px widths. Fix: `min-height:60px;height:auto` (or allow container wrap) plus the same `overflow:hidden;text-overflow:ellipsis` on the lead wrapper.

### 1.5 [Minor — L5] `#navbar` itself has no overflow contract (O3 half-fixed)

Only `.nav-middle` got `overflow-x:auto` `style.css:56`. `#navbar{...display:flex;justify-content:space-between;...}` `style.css:14-23` has no `overflow/flex-wrap`, `.nav-brand`/`.nav-controls` `style.css:25-32,63-67` have no `min-width:0/flex-shrink:0/nowrap`. Below ~900px the status-text width swing (`MOCK` vs `CASSANDRA :6527` `navBar.js:219`) still shifts/clips `Layers/Config`. Add `overflow-x:auto` or hide `.nav-status-text/.nav-keyboard-hint` under a breakpoint (none exist — see L9).

### 1.6 [Minor — L6] `#main-content` dual sizing + dead gap when timeline hidden

`#main-content{position:relative;flex:1;width:100%;height:calc(100vh-144px)}` `style.css:110-115` combines `flex:1` with an explicit height that subtracts the full 48+36+60 chrome. When `<footer id="timeslider-container" class="hidden">` (`index.html:30`, `display:none` via `style.css:220-223`) is hidden, the 60px stays reserved as blank `bg-primary` under the workspace. Fix: `flex:1;min-height:0` without fixed height, or toggle a class on `#app`.

### 1.7 [Minor — L7] z-index ties and toast placement

`.drawer/.panel/.legend` all `500` (`style.css:143,210,601`), `#timeslider` `1000` (`style.css:656`), `#tabs-bar` `900` (`tabs.css:11`), `.window-panel.maximized{z-index:100 !important}` (`tabs.css:235`), `.config-editor` `500` (`tabs.css:341`), `.tooltip` `2000` (`style.css:754`), toast `z-index:9999;position:fixed;bottom:24px` (`main.js:46`). Consequences: legend (last in `index.html:23-28` DOM order) paints over drawer/panel on overlap; "maximize" (100) stays under all 500 floaters so it is never full-bleed; toast sits over timeline chips for 4s and has `max-width:80vw` with no `overflow-wrap:break-word`, so long URLs/stacks overflow. Suggested scale: workspace 0/100, maximized 400, floaters 500/510/520, tooltip 2000, toast 3000 + `bottom:76px` when timeline visible.

### 1.8 [Minor — L8] Missing `min-height:0` / header shrink guards (flex blowout)

`.drawer-header` `style.css:156-173` has no `flex-shrink:0`; `.drawer-body{flex:1;overflow-y:auto}` has no `min-height:0`; `.config-editor-title-group` `tabs.css:345-355` has no `min-width:0`; `.config-editor-body{overflow:hidden}` + `.config-editor-textarea{flex:1}` `tabs.css:396-417` have no `min-height:0`. Standard column-flex bug: bodies refuse to shrink (notably Firefox), headers compress on short viewports.

### 1.9 [Minor — L9] Zero `@media` — persistent, still unfixed

Full reads confirm no `@media` in either CSS file (same as review2 §1). All hardening so far is fluid-flex only; a 375px phone still breaks via L3/L4/L5. No redesign is requested, but at minimum add `<768px` (hide `.nav-keyboard-hint/.layout-label/.step-length-label`) and `<520px` (navbar/tabs scroll) queries.

### 1.10 [Minor — L10] Small clipping/contract nits (grouped)

- Checkbox ellipsis cannot trigger: `.config-checkbox-item span{overflow:hidden;text-overflow:ellipsis}` `style.css:422-431,586-589` — `span` is inline with no `white-space:nowrap;display:block;flex:1;min-width:0`. Add them.
- Filter row clips remove button: `.filter-rule-row{flex-wrap:nowrap !important}` `style.css:451-464` inside `.layer-config{overflow-x:hidden}` `style.css:575-578` — at ~300px viewports any font/zoom increase clips the 16px `✕` with no scroll affordance. Prefer `overflow-x:auto` on the parent.
- Tooltip unbounded + paints over navbar: `.tooltip{position:absolute;...}` `style.css:754` has no `max-width/overflow-wrap`; `#main-content` has no `overflow`, so a tooltip near the top paints over `#navbar` (2000 > 1000). Add `max-width:min(280px,80vw);overflow-wrap:break-word`.
- Empty panel renders as empty card: `<div id="layer-control" class="panel">` `index.html:26` has no `:empty` rule (legend does `style.css:614-617`, which itself fails on whitespace text nodes — prefer explicit `hidden`).
- Stale/duplicated rules: `#workspace-container` is defined in both `style.css:118-124` (no `overflow`) and `tabs.css:134-141` (`overflow:hidden`) — works only by load order (`index.html:7-8`); `.win-preset-select/.win-level-select{display:none !important}` `tabs.css:291-294` and `flex-direction` without base `display:flex` on `.window-panel` `tabs.css:215-222` are fragile leftovers; `.config-editor-msg` `tabs.css:427-433` has no `max-height/overflow:auto` and is clipped by `body{overflow:hidden}`.

---

## 2. Layer Panel — Status and Accessibility

Verified holds (PASS, not re-reported): eye `👁/🚫` + `aria-pressed` + `row.layer-hidden` strikethrough (`layerControl.js:291-292,550-551`, `style.css:306,330-333`); gear rotate removed (`style.css:347-349`, `layerControl.js:329`); raster-while-hidden re-trigger (`layerActions.js:29-39` mirrors wind/barbs `41-54`); config-while-hidden deferral (`layerActions.js:179-185`); legend scoping to contour/wind (`layerActions.js:81-82,359` — station eye no longer creates `PLOT_*` entries).

### 2.1 [Moderate — P1] Accordion `aria-expanded` rendered but never updated

Row and button templates carry `aria-expanded="${layer.isExpanded}"` (`layerControl.js:548,561`), but the toggle handler (`layerControl.js:312-333`) only flips `configDrawer.classList` (`:328`), `configBtn.classList` (`:329`), and other rows' classes (`:322-323`). No `setAttribute("aria-expanded",...)` runs for self or others. Visual single-open accordion is correct; assistive tech keeps reading the boot-time state. Fix: set `rowEl` + `configBtn` attributes alongside the class toggles (both branches).

### 2.2 [Moderate — P2] Layer rows keyboard-inoperable + invalid nesting

`<div class="layer-row" role="button" tabindex="0" aria-expanded... aria-label="Configure...">` (`layerControl.js:548`) binds only `rowEl.addEventListener("click",...)` (`layerControl.js:313`); there is no `keydown`/Enter/Space handler anywhere in `layerControl.js` (grep `keydown` = zero hits). The row is focusable but not activatable. It also nests three native `<button>`s (`.btn-vis/.btn-config/.btn-remove` `:550,561,568`) inside `role=button`, which is invalid ARIA. Fix: add `keydown` for Enter/Space on the row, or drop `role=button` and leave the row as a group with the gear as the sole toggle (keeping `stopPropagation` on inputs `layerControl.js:341`).

### 2.3 [Minor — P3] Single-open enforced on click only, not on render

`<div class="layer-config ${layer.isExpanded?"":"hidden"}">` (`layerControl.js:574`) renders purely from the model. The click path normalises (`layerControl.js:315-326`), but `addOrUpdateLayer{...old,...new}` (`layerControl.js:123-128`) preserves `isExpanded` and `syncLayerControlForWindow` (`layerControl.js:211-217`) re-renders verbatim — a corrupted multi-`true` state stays multi-open (with §2.1 making AT doubly stale). Normalise in render (keep first expanded) or in `addOrUpdateLayer`.

### 2.4 [Minor — P4] Legend `[Wn]` attribution defeated from the layer panel (string vs object)

Panel callbacks pass a string id — `onLayerActionCallback("visibility",...,currentActiveWinId)` (`layerControl.js:294,304,344,400,433`) — which `handleLayerAction(map,action,layerId,value,layer,win=getActiveWindow())` (`layerActions.js:23`) keeps (truthy string), then forwards to `updateLegend/removeLegend(...,win)` (`:83-86`). But `legend.js:8,13` reads `win?.id` and `typeof win.winIdx === "number"` — a string has neither, so the entry always falls into bucket `"default"` with no `Wn` prefix, defeating the §9 C5 `[Wn]` fix in split mode. `syncLegendForWindow` (`legend.js:35-37`) uses the real object, so focus-sync and eye-toggle write to different buckets. Fix: resolve the id to a window object at the `layerControl.js` call sites or inside `handleLayerAction` before touching the legend.

### 2.5 [Minor — P5] Legend stale when hidden via config toggles, not the eye

`showFill/showLine` config path only calls `setLayerIsobandVisibility/setLayerIsolineVisibility(map,layerId,layer.visible&&value...)` (`layerActions.js:118-119`) with no `updateLegend/removeLegend`. Unchecking both `chk-show-fill` + `chk-show-line` (`layerControl.js:357-358,599-605`) empties the map but leaves the legend. Palette (`:224,261`) and eye (`:81-88`) paths sync; fill/line does not. Fix: on fill/line change, `removeLegend` when both end up off (and `updateLegend` when either returns while visible).

### 2.6 [Minor — P6] Palette select can visually revert while the model keeps the old path

`populatePaletteSelect` runs twice per expand (`layerControl.js:330-332` + `:376`, duplicate `listPaletteFiles`), and when `palettePath` is not in the current category's `xmlFiles` (category changed via `getPaletteCategory` `:731`), `paletteSel.value=palettePath` (`:761`) silently fails — the UI shows `— Built-in default —` while `layer.config.palettePath` retains the old path, and the gradient preview (`:760-767`, truthy-only) goes stale. The `paletteLoadSeq` guard (`:36-37`) is commented as a seq guard but never used (only `isConnected` `:736,763`). Fix: on miss, either clear `layer.config.palettePath` (+ `autoSaveLayerConfig`) or surface a `No palettes` disabled option as done for empty categories (`:729-734`); use or remove the seq.

### 2.7 [Minor — P7] Disabled / empty-state / focus gaps (grouped)

- No `disabled` on eye/config/slider/select in `layerControl.js` (only `:744` for `No palettes`); non-removable rows render `<span aria-hidden>` instead of a disabled remove button (`:569`) — no AT announcement.
- `btn-add-station-contour` (`layerControl.js:438-444`) is always enabled but `layerActions.js:285-287` silently `return console.warn` when `features<3` — operator click does nothing (vs the `main.js` toast pattern). Add `showErrorToast` or disable with reason.
- Empty palette category (`layerControl.js:730-732`) and empty/error legend (`legend.js:46-49` + `:empty{display:none}`) are silent — correct overlay behaviour, indistinguishable from broken. Add a muted message/badge.
- Station-filter outer rebuild loses field position: inner `rerender` focus restore (`stationFilterControl.js:188-220`) is correct, but full `panel.innerHTML` rebuilds (`layerControl.js:190-193,204-217`) fall back to `data-layer-id+first-class` (`:234-240`) while filter inputs carry only `data-rule-idx` (`stationFilterControl.js:144,165,173-174`) — typing in Rule #3 across a time-step reload jumps to Rule #1. Include `data-rule-idx` in the fallback key.
- Hidden compat inputs are stale: `chk-contourf/contour/station/pmtiles` checked + `chk-raster/wind` unchecked + opacity 75 (`layerControl.js:256-265`) never sync from the model (only `chk-raster/chk-wind` are bound `:483-484`) — test/AT queries read fixed values.

---

## 3. Windows / Timeline / Navbar / Catalog / Config / Tooltip / Keyboard

Verified holds (PASS): chips `active+aria-selected+title+scrollIntoView` (`timeSlider.js:284-339`); play `active+aria-pressed+▶/❚❚` incl. init/blur paths (`timeSlider.js:160,416-442,506,517-522`); init/step option rebuild (`timeSlider.js:370-385,109-143`); Load-Data `disabled` gating (`navBar.js:75-80,88-125,186-207`); status-dot + abort cleanup (`navBar.js:58-61,151-164,209-230`); catalog loading `disabled+Loading...` (`catalogDrawer.js:245-283`); config save `disabled+Saving...` + `Valid/Syntax/Saved&Applied/Save Failed` badges (`configEditor.js:227-233,297-314`).

### 3.1 [Moderate — W1] Config tab splits the dual pill/panel highlight; close can strand no-pill/no-workspace

`focusWindow` maintains the contract "pill `.active` + panel `.active/.active-single` together" (`tabWindowManager.js:447-458`), but `activateConfigTab` removes `active` from all `.tab-workspace` and `.tab-item` yet only removes `.active-single` from panels, leaving `.active` (`configEditor.js:136-148` — `:148` removes `active-single`, never `active`). The blue panel border stays while the pill moves to `⚙ Config`. Worse, `focusWindow`'s early-return checks only `panel.contains(active)` (`tabWindowManager.js:436-443`), not the pill — so `closeConfigTab → focusWindow(prev...)` (`configEditor.js:172-173`) returns early without re-adding `pill.active`, and the `!restored` fallback that would restore `.tab-workspace.active` + first pill (`configEditor.js:175-185`) is skipped because `restored=true`. End state after close: `panel.active` with no pill `active`, and `focusWindow` never touches `.tab-workspace`, so no workspace `active` either (blank main). Fix: clear both `active` + `active-single` on activate (or keep both), check pill state in the early-return, and always restore `.tab-workspace.active` on close.

### 3.2 [Moderate — W2] `tabs-list.hidden` split contract not restored on Config close

`updateLayoutButtons` owns the invariant `tabsList.hidden <=> layout!==1x1` (`tabWindowManager.js:404-406`). `configEditor.js:80-81,99-101` correctly un-hides the list to show the config pill in split mode, but `closeConfigTab` (`configEditor.js:158-189`) never re-applies the invariant from `tab.layout`. After `2×2 → open Config → close`, the list stays visible while `btn-layout-4.active` still claims split. Fix: re-run the `hidden` toggle from the active tab's layout on close.

### 3.3 [Moderate — W3] Opening Config desyncs navbar Layers button; close never restores panel

`activateConfigTab` hides `layer-control` (`configEditor.js:152-153`) without touching `btn-toggle-layers.active` (`navBar.js:82-86,137-143`), and `closeConfigTab` restores only `legend-panel` (`configEditor.js:187-188`) — `layer-control` stays `hidden` while the button still claims `active`. Fix: sync the button in activate/close, or restore `layer-control.hidden=false` + button class on close.

### 3.4 [Moderate — W4] Catalog load-throw is console-only; empty/error tree is silent

`btnLoad` click `try{await onLoadCallback(...); drawer.hide} catch(err){console.error}` (`catalogDrawer.js:266-283`) leaves the drawer open, re-enables the button, and shows no toast or inline `msg` — inconsistent with config `Save Failed` badge (`configEditor.js:310-311`) and `main.js` toast `role=alert`. Separately, `fetchTree` empty/throw (`catalogDrawer.js:203-243`) silently keeps the hard-coded `select-obs-time` options (`:70-76`) with no `Loading.../Empty/No times/Error` option or badge (config has one at `configEditor.js:198,214`). Operator cannot tell fallback from live. (Intentional non-issue: catalog Load is always enabled vs navbar gating — catalog always has valid `model/element` defaults.) Fix: toast + inline message on throw; placeholder option + badge on empty/error.

### 3.5 [Moderate — W5] Config Reload discards dirty edits without confirm

`btn-config-reload → loadCurrentConfigIntoEditor` overwrites `textarea+lastSavedText` (`configEditor.js:276-280`,msg `reloaded`) with no `hasUnsavedChanges()` guard, while `closeConfigTab` (`:160-163`) and `btn-cancel → closeConfigTab` (`:283-285`) both `confirm("Close without saving?")`. One click loses edits. The dirty state itself is also invisible: after edit the badge stays `✓ Valid JSON` (`:227-228`, identical to clean) — no `● Unsaved` state; the operator only learns via `beforeunload` (`:19-33`). Fix: guard reload with the same confirm; add a dirty badge.

### 3.6 [Minor — W6] Window pills lack `aria-selected`; layout/sync lack `aria-pressed`

Window pills are `class tab-item + id + dataset` with click only (`tabWindowManager.js:193-201`) — no `role=tab`, no `aria-selected` — while the config pill (`configEditor.js:71-72,136-144`) and timeline chips (`timeSlider.js:295-296,315-316`) both carry `role=tab + aria-selected`. Layout buttons + sync (`tabWindowManager.js:392-419`, `Sync 🔗/✕` text + `title` + `active` + `hidden` all correct) have neither `aria-pressed` nor `aria-selected`, unlike the fixed play/eye controls. Add both to match.

### 3.7 [Minor — W7] Attribution formats differ across pill / header / timeline / legend

Header shows a separate `Wn` badge + plain title (`tabWindowManager.js:156-157`); `updateWindowTitle` sets header `title=fullTitle` (no `Wn`) but pill `Wn+1: fullTitle` (`:644-651`); `time-win-badge` shows caller-supplied `winTitle` with `display:none` when empty (`timeSlider.js:351-359,446`) but enforces no `Wn:` prefix, unlike pill `Wn:` and legend `[Wn]` (§9 C5). Three formats for the same window. Normalise (e.g. always `Wn: title`, header tooltip included).

### 3.8 [Minor — W8] Stepper wraps silently; timeline rescroll jolts; one programmatic select edge

`btn-prev/btn-next` never `disabled`/`aria-disabled`; `step()` wraps `(idx+delta+len)%len` (`timeSlider.js:159,161,395-414`) — correct for the play loop, but a manual step `000h→+240h` is silent (vs Load-Data bound gating). At minimum `title="Previous (wraps)"` or an announcement. Separately, every `step/play` forces `scrollIntoView({inline:"end"})` (`:337`, prefer `nearest`), never moves focus, and chip recreation (`:287`) drops button focus. Edge: `selStep.value=String(currentStepLength)` (`:237-238`) skips the validity fallback that `updateStepLengthOptions` (`:140-142`) applies — programmatic `setStepLength(24)` in upper-air mode (valid `12,6`) leaves the select blank. Only reachable programmatically, not via UI.

### 3.9 [Minor — W9] Tooltip second branch unclamped; keyboard shortcuts hijack buttons/canvas

`tooltip.js:39-49` clamps the `props.x/y` path with est `280×180`, but the `cursorPos.clientX` fallback (`:50-53`) sets `x/y+16` with no clamp — same edge overflow. `keyboardShortcuts.js:4-7` correctly ignores `INPUT/TEXTAREA/SELECT/contentEditable/repeat`, but `:9-23` `ArrowLeft/Right/Up/Down+preventDefault` also fires from `BUTTON`s (chips, Load, Save, layout), `role=button` rows, and map canvas — stealing arrows that could scroll the timeline or move between buttons. Shortcuts (`←/→/↑/↓/F4/Alt+S` `:21`, potential browser collision) appear in no `title`/help, unlike every other control.

---

## 4. Map-Model Consistency (Operator-Visible)

Verified holds (PASS): central `win.layerSnapshots` snapshot in `clearAllWeatherLayersFromMap` covers preset/init/catalog/level paths (`main.js:269,339,780,903-915,966,980` + consume `:406,571,637`, cleared `:285,345,870-872,990-992`); OBS derived-contour snapshots (`main.js:304-315`); `isTimeStep=true` no-clear + `existing.visible` preserve (`main.js:777-781,421,572,638` + `addOrUpdateLayer` merge `layerControl.js:123-128`); `setStationConfig` on both station load paths (`main.js:579-580,648-649` + merge `stationLayer.js:53-55`); `surface-obs render:{showRain6:true}` default (`config.json:359-361`); basemap AND-logic (`layerActions.js:64-76,100-116`); station font bump at default zoom 4.2→`scale 0.9`, TT `11.7px` vs old `8.25px` (`mapInstance.js:44`, `stationLayer.js:314,356,415,429-459`); contour `13/14px spacing:160 halo:2.0` (`contourLayer.js:241-242,257,290`).

### 4.1 [Moderate — C1] NWP `labelSize` read but never forwarded — next chip/level resets map, panel stays

`loadWeatherField` reads `labelSize = exCfg.labelSize ?? customOptions?.labelSize` (`main.js:424`) and stores it in the layer `config` (`:502`), but the render call omits it:

```js
renderContourLayers(map, gridData, element, { layerId, showFill, showLine, lineColor,
  lineWidth, boldValues, boldLineWidth, opacity, colormap, smooth, smoothIterations });  // main.js:462-474 — no labelSize
```

Live edit works (`layerActions.js:127-134` → `setLayerIsolineStyle` honours `labelSize` `contourLayer.js:361-368`), but the next time-step / level / init reload rebuilds at default 13px while the panel still shows 18px — a panel-ON/map-OFF desync of the exact §8-R3 shape. Derived paths never forward either (`soundingAnalysis.js:233-245,259-269`, `surfaceAnalysis.js:244-257,283-293` — no `labelSize` in `renderCustomContourGeoJSON` opts or stored config). Fix: pass `labelSize` through `main.js:462-474`, both analysis entry points, and explicitly in `layerActions.js:210-223,247-260` palette paths.

### 4.2 [Moderate — C2] OBS time-step has no `loadSeq` stale guard (NWP does)

NWP stepping is boxed: `win.loadSeq++` + `expectedSeq` (`main.js:358-360`), discard on mismatch (`:428-430`), `_seq` boxing in `timeSlider.js:259-267,326-329,409-412`, active-only panel sync (`:515-517`). The OBS branch (`main.js:301-333`) has none of this — no `loadSeq++`, and `expectedSeq=null` flows into `loadPresetGroup(...,true)` (`:323`) and `loadUpperAirComposite/loadObservationProduct` (`:328-331`). Rapid chips/steps on SURFACE/UPPER_AIR resolve last-write-wins: `stationsGeoJSON` + `derivedContourSnapshots` can show a discarded file while chips show the latest `currentObsIdx`. Fix: mirror the NWP `loadSeq/expectedSeq` on the OBS branch.

### 4.3 [Moderate — C3] Background NWP load clobbers the foreground timeline

`timelineSync.js:164-175` correctly defers obs via `win._pendingTimeline`, replayed on focus (`tabWindowManager.js:482-488`). But `loadPresetGroup` unconditionally calls `setTimelineMode("nwp",...)` for any non-timestep NWP group (`main.js:810-818`), vs `onWindowFocus` which guards `if(getActiveWindow()===win)` (`main.js:131-139`). A lazy split init (`onWindowInit` `main.js:180-183`) or a background `changeVerticalLevel` therefore overwrites the active window's chips/cycle/step. Fix: guard with the active check and stash `win._pendingNwp` like the obs path.

### 4.4 [Moderate — C4] Secondary fetch failures are console-only — eye ON, map empty, no toast

Primary field/obs failures toast correctly (`main.js:52-62 role=alert`, `:548,560,735`). The re-trigger paths do not:

- `triggerRasterOverlay` binary fail → `fetchGridData(...).then` with no `.catch`, no toast (`layerActions.js:463-475`);
- `triggerWindStreamlines catch → console.warn` (`:502-512`), `triggerWindBarbs catch → warn` (`:540-549`), `triggerStationStreamlines catch → warn` (`:584-596`, plus silent `No obsTime` abort `:580`).

Operator toggles raster/wind/barbs/streamlines ON, fetch 404s, canvas stays empty while the eye stays `👁`. Fix: surface `showErrorToast` (lazy-import to avoid cycles) on those catches, as the primary paths do.

### 4.5 [Minor — C5] Global-vs-per-layer raster asymmetry persists for wind/station

The reported C6 OR is fixed for raster — `exCfg.showRaster ?? custom ?? global` (`main.js:419`) lets per-layer `false` win, `appState.js:20-27` defaults `raster:false,wind:false,station:true`. Residual asymmetry: wind never reads the global (`showWind=exCfg??custom??isWind`, `showBarbs=...??false` `main.js:417-418` — first WIND load defaults ON even if global `wind:false`); station falls back to global (`:572,638` `...??appState.layers.station!==false`); contour fill/line never consult globals; `aux:raster/wind` (`layerActions.js:382-395,399-409`) triggers all visible weather layers, bypassing per-layer `false`. Decide uniformly (per-layer wins) or document; at minimum stop the aux path from overriding per-layer `false`.

---

## 5. Summary Table (this review only)

| Area | Items | Moderate | Minor |
|---|---|---|---|
| CSS / layout (§1) | 10 | L1 panel↔timeline, L2 hidden-vs-slide, L3 tabs-list budget, L4 timeslider height | L5 navbar, L6 main-content gap, L7 z-index/toast, L8 min-height:0, L9 no @media, L10 nits group |
| Layer panel (§2) | 7 | P1 aria-expanded, P2 row keyboard | P3 multi-open, P4 string-win legend, P5 fill/line legend, P6 palette revert, P7 disabled/focus group |
| Windows/timeline (§3) | 9 | W1 dual highlight, W2 tabs hidden, W3 layers btn, W4 catalog error, W5 reload-dirty | W6 pill/layout aria, W7 Wn formats, W8 stepper/scroll, W9 tooltip-kbd |
| Map consistency (§4) | 5 | C1 labelSize fwd, C2 obs seq, C3 bg clobber, C4 silent fetch | C5 global/per-layer |
| **Total** | **31** | **8 distinct (L1–L4, P1–P2, W1–W5, C1–C4 ⇒ 8 line-items after grouping)** | **~16** |

Counting convention: grouped nits (L10, P7) count once each. No critical (crash/data-loss) items.

---

## 6. Priority Fixes

**P0 (operator trust — panel/map and window-focus truth):**
1. **C1 — forward `labelSize`** (`main.js:462-474`, `soundingAnalysis.js`, `surfaceAnalysis.js`). One-line-per-callsite pass-through; extend the existing `labelSize` e2e (drawer `layerControl.js:364,632` + persist `presets.js:109` + style `contourLayer.js:361-368`) to reload paths.
2. **W1/W2/W3 — Config open/close state machine** (`configEditor.js:134-189`, `tabWindowManager.js:392-419,428-458`, `navBar.js:137-143`). Clear/restore both `active` classes + `.tab-workspace.active`, re-apply `tabs-list.hidden` from layout, sync `btn-toggle-layers`.
3. **C2/C3 — timeline guards** (`main.js:301-333` add `loadSeq/expectedSeq`; `main.js:810-818` guard with active check + `_pendingNwp`).

**P1:**
4. **L1–L4 — container-relative panel, hidden-contract split, tabs-list budget, timeslider min-height** (`style.css:199-223`, `tabs.css:3-34`).
5. **C4/W4 — surface errors** (`layerActions.js:463-596` + `catalogDrawer.js:203-283` toasts/badges; `layerActions.js:285-287` contour-guard toast).
6. **P4/P5 — legend truth** (resolve win object before `updateLegend/removeLegend`; sync fill/line toggles).

**P2 (polish/a11y):**
7. **P1/P2/W6 — ARIA/keyboard**: `aria-expanded` updates, row `keydown`, pill `aria-selected`, layout/sync `aria-pressed`, dirty badge + reload confirm (W5), stepper affordance + `nearest` scroll (W8), tooltip clamp + shortcut scoping (W9), `min-height:0`/z-scale/`@media` minimums (L5–L10), C5 global/per-layer decision.

Keep untouched (verified, no change): chips/play/init status, eye/gear glyphs, snapshot centralisation, `setStationConfig` on load, `showRain6` default, raster/wind re-trigger, basemap AND, stale NWP guards, `_pendingTimeline` replay, per-map station `WeakMap`, config-input `stopPropagation`, filter inner focus restore, contour update-branch label migration, labelSize live style.

---

## 7. Verification Appendix

- `grep` (executed): `aria-expanded` rendered at `layerControl.js:548,561`, zero `setAttribute("aria-expanded"` updates on toggle `:312-333`; `role=button` + `click`-only row `:548,313`, zero `keydown` in `layerControl.js`; `updateLegend/removeLegend(...,win)` receives string id via `layerControl.js:294,304,344,400,433` → `layerActions.js:23,83-86` vs object-expecting `legend.js:8,13`; fill/line path `:118-119` with no legend call vs eye `:81-88` / palette `:224,261` with calls; `labelSize` read `:424` + stored `:502` but absent from `renderContourLayers` opts `:462-474`; OBS branch `:301-333` with no `loadSeq++` vs NWP `:358-360` + discard `:428-430`; unconditional `setTimelineMode("nwp")` `:810-818` vs guarded `:131-139`/`timelineSync.js:164-175` + replay `tabWindowManager.js:482-488`; re-trigger `catch → console.warn` only (`layerActions.js:467-468,510-511,547-548,596`, raster JSON fallback `:469-474` with no `.catch`); tooltip fallback `:50-53` with no clamp vs clamped `:44-49`; catalog `catch → console.error` only (`catalogDrawer.js:278-279`) + silent tree fallback (`:203-243`); reload-without-confirm (`configEditor.js:276-280`) vs confirm on close (`:160-163`); `focusWindow` early-return on panel-only (`tabWindowManager.js:436-443`) + `activateConfigTab` clearing `active-single` only (`configEditor.js:146-148`) + close restoring legend-only (`:187-188`); `.panel max-height:100vh` (`style.css:205`) vs `.drawer 100%` (`:137`); `.hidden{display:none !important}` (`:220-223`) overriding `.drawer.hidden transform` (`:151-154`) and `.tooltip.hidden opacity` (`:754`); `.tabs-list` no `flex:1/min-width:0` (`tabs.css:15-20`); `#timeslider height:60px` (`style.css:649`) vs wrapping `.timeline-info` (`:701-710`); zero `@media` hits in both CSS files.
- `bun test` not re-run in this review (no code changed); prior suites green per §9 (64 → 78 → 79). Manual recheck advised for: tall-panel-vs-timeline overlap, many-tab bar squeeze, Config open/close pill + Layers-button round-trip, labelSize-18 → chip-step cycle, rapid OBS chip stepping, background-window level change while another window focused, raster/wind toggle-ON with failing fetch, catalog load with stopped server.
- Git HEAD `99eab16`; `git status` clean at review time.

---

## 8. Addendum (2026-09-07) — Window Title `700hPa Upper-Air Sounding (UPPER_AIR/PLOT/500)`: Confirmed, Fixed

**Symptom:** after stepping the upper-air window to 700 hPa, the window header / tab pill / timeline badge reads `700hPa Upper-Air Sounding (UPPER_AIR/PLOT/500)` — level says 700, parenthetical path still says 500, and `700hPa` lacks a space.
**Verdict: three defects in one string — (a) raw internal catalog path baked into a user-facing preset name, (b) level-step title rewrite that only rewrites the leading digits and never the path suffix, (c) missing space in the rewritten level. All fixed, `bun test` 84/84 green.**

### 8.1 Root cause (all links verified)

- **T1 — path in display name:** the preset group name is literally `"500hPa Upper-Air Sounding (UPPER_AIR/PLOT/500)"` (`client/config.json:425`). It is the only preset name containing a raw `MODEL/ELEMENT/LEVEL` path (all other `name` fields verified clean). The name propagates verbatim to header/pill via `updateWindowTitle(win, group.name)` (`main.js:149,223`), to `winTitle = Wn: group.name` for the timeline badge (`main.js:809,148,222`), and to `titleName` on level change (`main.js:790-793`).
- **T2 — rewrite misses the suffix:** `loadPresetGroup` recomputes `titleName = group.name.replace(/\d+\s*hPa/i, `${level}hPa`)` (`main.js:790-792`). On a 500→700 step this rewrites the prefix (`500hPa`→`700hPa`) but leaves `(UPPER_AIR/PLOT/500)` untouched — hence level/path mismatch. `computeFullWindowTitle` (`tabWindowManager.js:592-636`) only strips `[Obs:...]/[Valid:...]` suffixes (`:601`), so the path survives into `win.title`, header `title` attribute, and pill `Wn: ...` (`:638-653`).
- **T3 — missing space:** the replacement template is `` `${level}hPa` `` (no space), and the no-preset fallback paths have the same typo: timeline `winTitle = ...Upper-Air ${targetLevel}hPa Sounding` (`main.js:971`) and `updateWindowTitle(win, `${targetLevel}hPa Upper-Air Sounding`)` (`main.js:976`). Every other sounding title in the codebase already uses `" hPa "` (`main.js:103,262,581,639,943`).

### 8.2 Fix (display-only, no id/path/behaviour change)

- `client/config.json:425`: renamed to `"500 hPa Upper-Air Sounding"` — path removed, space added. Safe: group lookup is by `id` (`composite-upperair-500`), obs-path routing keys off `group.id?.includes("upper")` (`main.js:153,226`), layer `path` fields untouched.
- `main.js:790-795`: replacement is now `` `${level} hPa` `` (spaced) plus a defensive strip of any `(SURFACE|UPPER_AIR/...)` suffix, so even a stale cached name self-heals: `"500hPa Upper-Air Sounding (UPPER_AIR/PLOT/500)"` → `"700 hPa Upper-Air Sounding"`. Element lists like `(HGT + TMP + WIND)` are preserved (verified below).
- `main.js:971,976`: `Upper-Air ${targetLevel} hPa Sounding` / `` `${targetLevel} hPa Upper-Air Sounding` `` — spaced to match the rest of the codebase.
- `client/test/derived_layers.test.js:514`: mirror fixture renamed to the canonical name (asserts only layer ids/paths, unaffected).

### 8.3 Verification (executed)

- `bun -e` rewrite demo: `"500 hPa Upper-Air Sounding"`→`"700 hPa Upper-Air Sounding"`; legacy `"500hPa Upper-Air Sounding (UPPER_AIR/PLOT/500)"`→`"700 hPa Upper-Air Sounding"`; `"850hPa Low-Level Jet (HGT + TMP + WIND)"`→`"700 hPa Low-Level Jet (HGT + TMP + WIND)"` (list kept); `"Surface Synoptic (Plots + SLP Isobars)"` unchanged.
- `bun test` in `client/`: **84 pass, 0 fail** (was 79; +5 tests added upstream since review2 §9 — no regressions).
- Note (out of scope, left as-is): other static preset names use spaceless `500hPa/850hPa/200hPa` (`config.json:245,257,277,297,317,337,345`). They are not rewritten on level step (only the `hasLevel` upper-air group and the `titleName` path are), so they never produce a mismatch — standardise only if a naming pass is wanted.
