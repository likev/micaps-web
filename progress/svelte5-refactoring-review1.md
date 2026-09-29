# Svelte 5 Refactoring Review 1 — Uncommitted Implementation vs `svelte5-refactoring-plan1.md`

Scope: `git diff HEAD` + untracked `client/src/{App.svelte,main.svelte.js,components/*,lib/stores/*,actions/*,map/MapViewport.svelte}`, `client/test/stores/plain-core.test.js`, shims in `client/src/{store/appState.js,ui/*/tabsStore.js,ui/layers/layerStore.js,ui/timeline/timelineStore.js,ui/legend.js}`, `client/{index.html,package.json,vite.config.js}`, `Architecture.md`, `README.md`.
Verified: `bun test` 525 pass / 0 fail; `vite build` ok (32.5s, 1.8MB chunk + pre-existing chunk warnings).

## Verdict

Phase 0 (scaffold) + Phase 1 (foundations, R1/R2 shims) are **done correctly**. Phase 2 (shell + show/hide) is **~70% done — boots and toggles, but with 3 load-bearing reactivity bugs + 1 playback bug**. Phase 3/4 (data wiring, config forms) are **started, not finished**. Do not proceed to Phase 5 cleanup (deleting legacy `ui/*`, `style.css`, `tabs.css`) yet — new code still depends on legacy behavior and has split-brain stores.

## What matches the plan (keep)

- Scaffold: `@sveltejs/vite-plugin-svelte@5.1.1` + `svelte@5.57.1` in `client/package.json:18-22`, `plugins:[svelte()]` in `client/vite.config.js:5`, `griddata` alias kept, `index.html` reduced to `<div id="app">` + `main.svelte.js` + tokens-only CSS. Correct per §7-Phase 0.
- R1 plain-core pattern followed: `appCore.js`, `tabsCore.js` (verbatim move of `getVisibleWindows`/`isWindowVisible`), `timelineMath.js` re-export, `formState.js` re-export, `legendCore.js` (`buildLegendItems` extracted, testable), `uiCore.js` (`createInitialUIState` + `clampTooltipPosition`). New `test/stores/plain-core.test.js:1-132` covers app defaults, ui inventory (§1.5), split visibility, per-window isolation, legend builder. Good.
- R2 shims frozen with zero test-file edits for most of suite: `ui/tabs/tabsStore.js:1-3`, `ui/layers/layerStore.js:1-3`, `ui/timeline/timelineStore.js:1-3` are `export *` shims; `store/appState.js` delegates `createInitialAppState()`; `ui/legend.js` delegates to `legendCore.js`. `bun test` green via shims satisfies P1 gate.
- Show/hide unified in `lib/stores/ui.svelte.js`/`uiCore.js` (`catalogOpen/layersOpen/timelineVisible/configOpen/tooltip/toast/expandedLayerId`), rendered with `{#if}` + `class:` + `fly/fade` in `CatalogDrawer/TimeSlider/LayersPanel/Legend/Tooltip/Toast/ConfigEditor`. `window.__SHOW_TOOLTIP__` gone from new code. Map handles kept out-of-band in `lib/stores/tabs.svelte.js:15,36-46` (`mapInstances Map`) — correct per §8.
- Scoped `<style>` per component; MapLibre overrides isolated to `:global()` in `map/MapViewport.svelte:21-39`. `data-testid="timeline-chip"` + `data-testid="map-viewport-*"` added; legacy `#chk-*/#slider-opacity` kept hidden in `LayersPanel.svelte:82-91` per §11-R4 (correct to keep until P5).

## Load-bearing issues (fix before Phase 5)

### 1. Playback stops after one tick — `TimeSlider.svelte:33-49,101-108`
`handleStep()` unconditionally calls `pause()`, and the play interval calls `handleStep(1)`. First tick clears `playTimer`, so autoplay never advances past one step. Fix: add `handleStep(delta, {fromPlay})` or separate `advance()` without `pause()`; keep `pause()` only on manual chip/step/cycle paths.

### 2. Legend never re-renders — `Legend.svelte:8-9`
`trigger = $derived(legends[winId])` is dead code; `items = $derived(buildLegendItems(winId))` reads the plain `Map` in `legendCore.js`, which Svelte does not track. Mutating the core map + syncing `legends[winId]` will not invalidate `items`. Fix: derive from the rune store (e.g. `let items = $derived(...legends[winId]...)` or consume `trigger`), or make `buildLegendItems` take the synced array as input.

### 3. Split-brain stores: legacy singleton vs rune store
- Tabs: `tabsCore.js:4-9` (`tabsState` + `callbacks` + `syncingTabs`) vs `tabs.svelte.js:9-12` (fresh `$state({tabs,activeTabId})`, **drops `callbacks/syncingTabs`**). `App.svelte` writes the rune copy; legacy `tabWindowManager.js` reads the core copy. They diverge at runtime.
- Timeline: `timelineCore.js:33-37` keeps the global `timelineState` singleton (+ `onTimeChangeCallback/playTimer/activeWindowProvider`); `timeline.svelte.js:26` adds per-window `timelinesByWindow`, but `fireTimeChange/setTimeChangeCallback` still operate on the global. `App.svelte:20` imports `setTimeChangeCallback` but never calls it — new time path bypasses it via `onTimeChange` prop, legacy path still uses the global. Per-window isolation (`createTimelineState`) exists but callback/seq guards (`periodStepSeq`) are per-window objects in new code vs global in legacy.
- Layers: `windowLayersMap` (plain, in `layersCore.js`) vs `layersByWindow` (rune, in `layers.svelte.js:14`) synced manually by `syncLayersState`. `layersCore.js:60-63,72-74,85-88,146-149` still does `document.getElementById("layer-control")` + `renderLayersManagerFn` rerender — violates §3 ("never `getElementById`") and the §9 grep gate. Fix: remove DOM rerender from core (make core pure CRUD, let rune sync drive render), unify on one source of truth, and re-add `callbacks/syncingTabs` or explicitly deprecate them with caller migration.
- App state: `app.svelte.js:4` is a bare `$state` with no `setLayer/update` actions; legacy `AppState` class keeps `subscribe/emit`. `App.svelte:97,253,334` mutates `app.level/app.period` directly — fine for new code, but legacy subscribers will not fire. Decide: keep class as shim emitting on mutation, or migrate callers.

### 4. `legendCore.js:4,12-23` resolver points at the wrong store
Imports `getWindowById` from `./tabsCore.js` (empty until new App populates the rune copy) instead of `ui/tabWindowManager.js` (live windows). `livePrefix` is therefore always `null` in the new path; tests pass only because `updateLegend` stashes `winPrefix` at write time. Fix: inject resolver (default to tabWindowManager, fall back to tabsCore) or pass `winIdx` explicitly.

### 5. `win.map` stored inside `$state` — `App.svelte:233,263,355`
`handleMapCreated` assigns `win.map = map` where `win` lives in rune `tabsState`. Plan §8 forbids this (proxy/render storms). The module `Map` (`setMapInstance`) is already correct — remove the `win.map` assignment and thread handles via `getMapInstance(win.id)` / callback args. Same pattern makes `visibleWindows/activeWin` `$derived` re-track map mutations.

### 6. `ConfigEditor.svelte:42-64` is not migrated (§6 violation)
Still `replaceChildren()` + `mountPresetForm/mountColormapForm/mountSettingsForm/mountJSONFallback`. Plan required sub-forms to bind draft with no `mount*Form(el)`. Current wrapper adds `beforeunload`/dirty/status chrome (good) but inherits all focus-loss/ crash risks it was supposed to remove. Also `activeSubtab` local copy diverges from `ui.activeConfigSubtab` after external writes; `isDirty` local `$state` not synced anywhere. Mark Phase 4 incomplete.

## Secondary issues

- `TimeSlider.svelte:22` — `$derived(getOrCreateTimeline(winId))` mutates store during render. Move creation to `$effect`/event handlers or `getOrCreate` in App and pass timeline as prop.
- `TimeSlider` missing plan §4.1 `visibilitychange` pause + `$effect` cleanup; only `onDestroy` clears timer. `CatalogDrawer.svelte:70-84` `$effect` obs fetch has no `AbortController`/cleanup — rapid model switch races; add abort + guard.
- `NavBar.svelte:46-53` uses `$effect` as `onMount` (works only because no tracked deps read) + unused `onMount/onDestroy` imports. Use `onMount` explicitly.
- `StationFilter.svelte:8,70` — `rules` snapshotted once at creation, never resyncs on `layer` change; `{#each rules as rule, idx}` without `key`, `value+onchange` instead of `bind:value`. Loses the focus-stability guarantee (§4.1). Add `key`, `bind:value`, and `$effect` resync on `layer.id`.
- `LayersPanel.svelte:14-16` — `winTitle` reads core `getCurrentActiveWinTitle()` (global), not the `winId` prop; stale on window switch unless `syncLayerControlForWindow` ran. Derive from `winId` prop or tabs rune store.
- `App.svelte:48-80` mutates `$state` during component init (`ensureInitialTab()` at module render); move to `onMount` or lazy initializer. Imports `timeHeightController/lineHeightController/hovmollerController/tlogpController` but never wires show/hide — dead imports; profile panels still unhosted (acknowledged Phase-2b, but imports should go until used). `handleLevelSelect` ignores async errors; no keyboard/dnd/prefetch/overlay wiring yet (plan `actions/keyboardShortcuts.js`, `actions/focusRestore.js`, Wind/Station drawers, Preset/Layer forms unported — expected, but `Architecture.md` claim of "zero imperative DOM lookups" is false while `layersCore` still has 4).
- Inline `style="..."` retained in `CatalogDrawer.svelte:115,180,195`, `LayerRow.svelte:166,175,196`, compat `display:none` block in `LayersPanel.svelte:82`. Tooltip positioning via `style="left:{x}px;top:{y}px"` (`Tooltip.svelte:50`) should be `style:left/style:top` per §5. Minor but grep-gate relevant.
- Tests weakened while green: `test/ui/tab-subwindow-visibility.test.js` no longer exercises `activateConfigTab/focusWindow/timeSlider` integration — asserts local `uiState` flips + mocked panel flags. `test/ui/fullscreenControl.test.js:215` asserts Svelte source contains id/class, not placement in `#main-content`. Add back an integration test that drives `App` handlers (or documents the gap); add the missing §11.3 toggle-matrix test (all §1.5 rows).
- `client/package-lock.json` untracked — either gitignore it or commit it; don't leave half-staged. Legacy `src/main.js`, `src/style.css`, `src/tabs.css`, `src/app/bootstrap.js`, 49 legacy `ui/*` files correctly remain (P5), but `App.svelte` at 465 LOC is re-creating the bootstrap god-component — keep extracting (data wiring → services, tab ops → `tabs.svelte.js` actions) before adding more.

## Recommended next steps

1. Fix playback single-tick, Legend reactivity, and `win.map`-in-state (small, isolated).
2. Unify stores: pure core (no DOM), single rune source, restore or retire `callbacks/syncingTabs`, wire `setTimeChangeCallback` per-window or delete it; fix legend resolver.
3. Finish Phase 3 wiring (keyboard, prefetch, overlay/contourReRender, profile-panel hosting) before touching ConfigEditor forms; then do Phase 4 forms-for-real (bind draft, no `mount*Form`).
4. Add toggle-matrix + App-level time/config integration tests; restore fullscreen placement assertion against `App.svelte` composition.
5. Only then Phase 5: delete legacy `ui/*View/Bindings`, `style.css`/`tabs.css`, compat inputs, focus-restore hacks; correct `Architecture.md` ("zero DOM lookups") claim.

*Gates re-checked: `bun test` 525/525; `vite build` pass; `getElementById|innerHTML` still present in `lib/stores/layersCore.js` (4 hits) — P5 grep gate not met by design at this stage.*
