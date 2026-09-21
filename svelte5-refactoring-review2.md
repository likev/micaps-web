# Svelte 5 Refactoring Review 2 — Re-review of Uncommitted Implementation vs `svelte5-refactoring-plan1.md`

Scope: same uncommitted changeset as review 1 (`git diff HEAD` tracked shims + untracked `client/src/{App.svelte,main.svelte.js,components/*,lib/stores/*,actions/*,map/MapViewport.svelte}`, `client/test/stores/plain-core.test.js`), re-verified file-by-file. Deltas since review 1 noted explicitly below.
Gates re-run: `bun test` **527 pass / 0 fail** (was 525; +toggle-matrix test + visibility test 5); `vite build` **pass** (~31s, same pre-existing >500kB chunk warning).

## Verdict

Review 1's load-bearing bugs are **mostly fixed**. Phase 0 + Phase 1 stand. Phase 2 (shell + show/hide) moves from ~70% to **~90% — ship-able shell, no remaining render/playback breakage**. Phase 3 is **partially wired** (preset/product/time/layer/level paths work; keyboard/prefetch/profile-panels/DnD still missing). Phase 4 is **half done** (`StationFilter` migrated; `ConfigEditor` forms still hosted-imperative). Phase 5 cleanup correctly **not started**. One honest remaining structural debt: `ConfigEditor` `mount*Form` + timeline global/per-window duality. Everything else is minor or by-design-until-P5.

## Delta since review 1 (fixed — verified)

| Review 1 issue | Status | Evidence |
|---|---|---|
| 1. Playback stops after one tick | **FIXED** | `TimeSlider.svelte:39-42` `handleStep(delta, {fromPlay})` only pauses on manual steps; interval calls `handleStep(1,{fromPlay:true})` (`:113-115`). Added `visibilitychange` pause + `timelineVisible` auto-pause (`:136-156`). Creation moved to `$effect.pre` (`:24-26`). |
| 2. Legend never re-renders | **FIXED** | `Legend.svelte:8-11` now `$derived.by(()=>{ const _ = legends[winId]; return buildLegendItems(winId); })` — consumes the rune store. |
| 3a. Layers DOM coupling (`getElementById` x4) | **FIXED** | `layersCore.js:16-22,74,83,93,151` replaced DOM rerender with `notifyLayersChanged` callback; `layers.svelte.js:17-19` auto-syncs `layersByWindow`. New-code grep `getElementById\|innerHTML\|classList.*hidden\|__SHOW_TOOLTIP__` = **0 hits**. `registerRenderLayersManager` kept only as dead compat for legacy `layerListView.js:106-113`. |
| 3b. Tabs split-brain (dropped `callbacks/syncingTabs`) | **FIXED** | `tabs.svelte.js:1-12` now wraps the core object (`$state(coreTabsState)`) and re-exports `getCallbacks/setCallbacks/getSyncingTabs` (`:48-56`). `tabsCore.js:4-38` adds `createDefaultWindow/Tab` + pre-seeded default tab. |
| 4. Legend resolver always null | **MITIGATED** | `legendCore.js:12-16,24-34,80-93` adds `setDefaultWinResolver()` + `win-(\d+)` regex fallback for prefix. Default still `tabsCore.getWindowById`, but prefix no longer silently null for `tab-*-win-*` ids. No caller sets the resolver yet — injection point exists, wiring outstanding. |
| 5. `win.map` inside `$state` | **FIXED** | `App.svelte:350-352` `handleMapCreated` only calls `setMapInstance`; all service calls use `getMapInstance(win.id)` (`:229,259,308,344,358`). `ensureInitialTab()` moved into `onMount` (`:77-84`); dead tlogp/line-profile imports removed; `handleLevelSelect` has try/catch (`:354-368`); Esc + ArrowUp/Down added (`:381-397`). |
| StationFilter focus/key/bind | **FIXED** | `StationFilter.svelte:10-27` resyncs on `layer.id` change; `{#each ... (rule._id\|\|idx)}` (`:85`); `bind:value` throughout (`:74,89,112,128,138`). |
| NavBar `$effect`-as-mount | **FIXED** | `NavBar.svelte:46-53` now `onMount`. |
| CatalogDrawer fetch race + inline styles | **FIXED** | `CatalogDrawer.svelte:70-90` `active`-flag cleanup; `style="..."` → classes (`btn-close-drawer`, `catalog-obs-status`, `btn-load-product`, `:280-293`). |
| LayersPanel stale title + compat block | **FIXED** | `LayersPanel.svelte:16-23` derives title from `getWindowById(activeWinId)` with core fallback; compat inputs under `.compat-hidden-tests` class (`:90,106-108`); `{#each ... (layer.id)}` (`:77`). |
| Tooltip `style="left/top"` string | **FIXED** | `Tooltip.svelte:50-51` now `style:left` / `style:top`. Only remaining `style="..."` in components is dynamic gradient `Legend.svelte:26` — acceptable. |
| Tests weakened | **IMPROVED** | `plain-core.test.js` 132→205 lines, adds §11.3 toggle-matrix test (8-step). `tab-subwindow-visibility.test.js` adds test 5 (focus switch clears config pill, asserts `activeWinIdx` + `getActiveWindow`). `fullscreenControl.test.js` now asserts `FullscreenButton` composition order inside `<main>` in `App.svelte`, not just id/class. Suite 527/527. |
| `package-lock.json` noise | **FIXED** | `.gitignore` now ignores `package-lock.json`. |

## What remains (ranked)

### 1. `ConfigEditor` forms still imperative — Phase 4's core item (unchanged)
`ConfigEditor.svelte:50-72` still `replaceChildren()` + `mountPresetForm/mountColormapForm/mountSettingsForm/mountJSONFallback`. Chrome improved (subtab sync `$effect` `:24-29`, `ui.configDirty` `:33`, dirty `beforeunload`), but plan §6 "no `mount*Form(el)`" is unmet. Inherits the focus-loss/crash surface the migration was supposed to remove. Next: bind draft per sub-form (Presets/Layer/Colormap/Settings/JSON still unported — component list confirms: only 13 components, no `PresetForm/LayerForm/...`; `actions/` still only `clickOutside/mapViewport`, no `keyboardShortcuts/focusRestore`).

### 2. Timeline global vs per-window duality (unchanged, now the top store risk)
`timelineCore.js:33-37,96-115` keeps global `timelineState` + `setTimeChangeCallback/fireTimeChange`; `timeline.svelte.js:26-33` adds per-window `timelinesByWindow` + `getOrCreateTimeline`, but the two never meet: `App.svelte:20` imports `setTimeChangeCallback` and never calls it; new time path uses `onTimeChange` prop (`App.svelte:306-339`, `TimeSlider.svelte:48,55,64,70`), legacy path uses the global. `periodStepSeq` is per-window in new code vs global in legacy. Per-window isolation test passes on `createTimelineState`, but no test covers concurrent two-window stepping through the App path. Fix: per-window callback/seq registry, or delete the global path and migrate callers; at minimum wire or remove the dead import.

### 3. App keyboard short of its own hint
`NavBar.svelte:149-152` advertises ◀/▶ Time; `App.svelte:381-397` handles only Esc/ArrowUp/Down (level). No Left/Right time step, no Space playback, no F4/Alt+S split (legacy `keyboardShortcuts.js` unported). Small but user-visible vs legacy parity gate (§9 manual QA).

### 4. Minor / by-design-until-P5 (do not fix yet, just track)
- Hidden fallbacks retained: `CatalogDrawer.svelte:207`, `LayersPanel.svelte:102`, `TimeSlider.svelte:309`, `Legend.svelte:37` (`hidden` + `:empty`). Correct per R4; delete at P5 with compat inputs (`LayersPanel.svelte:91-98`).
- `TimeSlider.svelte:28` fallback `timelinesByWindow[winId] || createTimelineState(winId)` builds an untracked transient on first render; harmless because `$effect.pre(:24-26)` pre-creates, but prefer deriving strictly from the store.
- `TimeSlider` imports `goToPeriod/goToObsFile` (`:6-8`) but mutates indices directly — dead helpers; either use them (plan §4.3 data-flow) or drop imports.
- `tabsCore` pre-seeds a default tab *and* `App.ensureInitialTab` guards empty tabs — redundant but harmless.
- `App.svelte` 494 LOC (was 465): data wiring + tab ops still inline; keep extracting toward services/`tabs.svelte.js` actions before adding more (god-component risk from plan §1.2 recurring).
- Missing scope unchanged and correctly deferred: Wind/Station drawers, DnD reorder, prefetch/overlay direct wiring, profile panels hosted-imperative (no dead imports now — good), `vitest` component smokes (optional per §11.3).

## Test assessment

Green and stronger than review 1, but note the ceiling: new tests 1 (toggle matrix) and 5 (focus/pill) assert store transitions and legacy `focusWindow`, not the new `App.handleLoadData/handleTimeChange/handleWindowFocus` wiring (test 3 re-implements the timeheight check inline instead of calling the App handler). Recommend one App-level integration test (drive `handleLoadData` timeheight/hovmoller → `ui.timelineVisible=false`; NWP → per-window `timelinesByWindow` isolation) before declaring Phase 3 gate met. `bun test` stays the only gate — no runner migration, per §11.3. Correct.

## Phase gates

- P0 scaffold: done. P1 foundations: done (R1/R2 intact, shims frozen, 527 green).
- P2 shell: ~90% — all §1.5 surfaces state-driven with transitions; grep gate clean for new code.
- P3 wiring: partial — preset/product/time/layer/level/legend-sync paths present with error handling; keyboard partial; prefetch/profile/DnD outstanding.
- P4: partial — `StationFilter` done; `ConfigEditor` chrome done, forms outstanding.
- P5: not started (correct) — legacy `main.js/style.css/tabs.css/bootstrap.js`, 13 legacy `ui/*.js` + subdirs remain; `Architecture.md` Svelte section now lists components accurately without a false "zero DOM" claim (only generic zero-GeoJSON/zero-copy hits remain).

## Next steps

1. `ConfigEditor` forms-for-real (bind draft, drop `mount*Form`) — the single biggest remaining plan item.
2. Resolve timeline duality (per-window callbacks/seq; remove or wire `setTimeChangeCallback`).
3. Fill keyboard parity (Left/Right/Space/split) + wire `setDefaultWinResolver` from the live tab store.
4. Add one App-level time/config integration test; then P5 deletion + `data-testid` pass.
