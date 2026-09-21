# Svelte 5 Refactoring Review 3 — Re-review of Uncommitted Implementation vs `svelte5-refactoring-plan1.md`

Scope: same changeset as review 2 plus new untracked `client/src/components/config/*` (5 forms), `client/src/actions/{keyboardShortcuts,focusRestore,mapViewport}.js`, `client/src/lib/services/appWorkflow.js`, `client/test/stores/app-workflow.test.js`, `client/test/ui/actions.test.js`. Re-verified file-by-file; deltas since review 2 noted explicitly.
Gates re-run: `bun test` **542 pass / 0 fail** (was 527; +6 app-workflow, +9 actions); `vite build` **pass** (~28s, same pre-existing >500kB chunk + mixed static/dynamic import warnings).

## Verdict

Review 2's top two items are **closed or closable**: Phase 4 forms are migrated for real, and keyboard parity is done. Phase 2 shell stays **~90%**. Phase 3 is now **~80% wired** (timeline duality narrowed to one dead registration; per-window isolation tested). Phase 4 is **~85%** (chrome + 5 sub-forms done; reactivity wiring has 2 real bugs below). Phase 5 correctly **not started**. One new **load-bearing runtime crash** (`loadTLogPLayer`) and one **load-bearing reactivity staleness** class in the config forms block an unconditional ship — both are small, isolated fixes.

## Delta since review 2 (fixed — verified)

| Review 2 issue | Status | Evidence |
|---|---|---|
| 1. `ConfigEditor` still imperative (`mount*Form`) | **FIXED** | `ConfigEditor.svelte:173-183` renders `PresetForm/ColormapForm/SettingsForm/JSONFallbackForm` with `{#if activeSubtab}`; `mount*Form/replaceChildren` grep hits now only in legacy `ui/configEditor.js:364-370` + `ui/config/*` (correct until P5). |
| 2. Timeline duality (dead `setTimeChangeCallback` import) | **MOSTLY FIXED** | `App.svelte:81,87-89` registers + cleans up the callback in `onMount`; `timelineCore.js:96-111` adds per-window `windowTimeCallbacks` registry with global fallback; per-window dispatch covered by `app-workflow.test.js:128-149`. One dead end remains (§6 below). |
| 3. Keyboard short of hint | **FIXED** | `App.svelte:419-472` handles Esc/Left/Right/Up/Down/Space/F4+Alt+S with repeat throttle + `isTextInput` guard; `actions/keyboardShortcuts.js` extracts the same as a tested action (`actions.test.js` 9 tests). NavBar hint parity restored. |
| Legend resolver wiring | **FIXED** | `tabs.svelte.js:38` calls `setDefaultWinResolver(getWindowById)` with the live rune-backed resolver. Review 1 §4 fully closed. |
| Prior fixes intact | **INTACT** | Legend `$derived.by` consumes `legends[winId]`; NavBar `onMount`; LayersPanel title derived from `winId` prop (`LayersPanel.svelte:16-17`); new-code grep `getElementById\|innerHTML\|classList.*hidden\|__SHOW_TOOLTIP__` = **0 hits**; no `win.map` in new code (remaining hits are legacy `bootstrap.js` only). |
| Test ceiling (review 2 asked for App-level time/config test) | **PARTIALLY ADDRESSED** | `app-workflow.test.js` adds visibility-policy + concurrent-stepping + per-window-dispatch tests — but against helpers, not App handlers (§5 below). |

## What remains (ranked)

### 1. Load-bearing: `loadTLogPLayer` is called but never imported — `App.svelte:277`
`handleLoadProduct` awaits `loadTLogPLayer(map, {...}, null, null, win)` for the TLOGP observation path, but `App.svelte:22-31` imports only `loadUpperAirComposite, loadObservationProduct` from `services/derivedContours.js`. The symbol lives in `layers/tlogp/tlogpLayer.js:11` (imported by legacy `bootstrap.js:31` and `services/presetLoader.js:7`, never by `App.svelte`). Any catalog load of a TLOGP product throws `ReferenceError` after the observation timeline already synced — half-applied state. One-line fix: import it (or route through `presetLoader`). Note the test gap: `handleLoadProduct` returns early on `!map` (`:260`), so only a test with a mocked map reaches line 277 — current suite has none.

### 2. Load-bearing reactivity: config sub-forms mutate past the proxy — `PresetForm.svelte:18-25`, `ColormapForm.svelte:14-21`, `LayerForm.svelte:19-38`
`formState.updateDraft` mutates the raw `draft` object in place (`ui/config/formState.js:274-280`) and notifies. Subscribers do `draft = formState.getDraft()` — the **same reference** — into `$state`, which Svelte treats as a no-op assignment, and the raw mutation bypassed the `$state` proxy traps. Consequences:
- Sidebar/detail `$derived`s (`presets`, `selectedEntry`, layer counts, colormap gradient preview, usage badges) go stale until the next reference-changing event (`reset`/`setDraft`/tab switch). Inputs use uncontrolled `value=` + `oninput`, so keystrokes look fine locally while the rest of the panel doesn't reflect them (e.g. added layers, renames, new stops).
- The `LayerForm` path is worse: it mutates the proxied `layer` object directly (reactive for its own inputs) but reports via `onUpdate={() => formState.notifyDirty?.()}` (`PresetForm.svelte:413`) — and `notifyDirty` **does not exist** (repo-wide grep: exactly one hit, the call site). So `ConfigEditor`'s `formState.subscribe(updateStatus)` never fires after layer edits → `isDirty`/validation pill, Save gating, and `beforeunload` are stale.
Fix: subscribe handlers must install a fresh snapshot (or make `updateDraft` clone-on-write); replace the `notifyDirty?.()` no-op with a real notification path (e.g. a lightweight `touch()` that revalidates + notifies, or route layer edits through `updateDraft`).

### 3. Bug: `SettingsForm.svelte:12-18` subscribes inside `$effect`
Every `draft` change re-runs the effect, adding another `formState.subscribe` listener (the cleanup only runs before re-run, but the effect re-tracks `getDraft()` each cycle — subscribe churn + duplicate `draft =` assignments per notification). Siblings use module-level subscribe + `onDestroy`; do the same here.

### 4. Bug: playback interval closes over a stale window — `TimeSlider.svelte:113-120`, `App.svelte:386-404`
`start()` captures the current `timeline`/`winId` in the `setInterval` closure. Switching windows mid-play keeps stepping the **old** timeline object while `App.handleTimeChange` loads into the **new** `activeWin`'s map → period/obs index desync across windows. (Shared `playback` state itself is per plan §4.1 — fine.) Fix: resolve `getOrCreateTimeline(winId)` per tick, or pause on `winId` change. Same reason `App.stepTimelineDelta` should delegate to the tested `stepWindowTimeline` helper instead of duplicating it.

### 5. Structural: App duplicates helpers the tests cover — drift risk, no App-level coverage
`App.svelte` inlines logic that now exists and is tested as helpers: `stepTimelineDelta` ∥ `stepWindowTimeline` (`appWorkflow.js:68-88`), `handleLoadData` grouping ∥ `applyPresetToWindow` (`:22-63`, incl. `structuredClone` vs shared-ref divergence), `handleKeydown` ∥ `keyboardShortcuts` action (action tested in `actions.test.js`, but App imports only `isTextInput` — the action itself is never used as an action), `ensureInitialTab/handleAddTab/handleChangeLayout` ∥ `createDefaultTab/createDefaultWindow` (`tabsCore.js:4-31`). `app-workflow.test.js` therefore guards the helpers while the shipped App paths can drift (it already diverged: App clones the group, helper doesn't). `App.svelte` is now 569 LOC (was 494) — plan §1.2 god-component risk recurring. Fix: delegate App paths to the helpers + add one test driving the real `handleLoadData` (timeheight → `ui.timelineVisible=false`) and `stepTimelineDelta` per-window isolation.

### 6. Dead wiring: global time callback registered but never fired on the new path
`App.svelte:81` registers the global `setTimeChangeCallback`, but `fireTimeChange` is only called by legacy `ui/timeline/*` — `TimeSlider.svelte` invokes the `onTimeChange` prop directly (`:48,55,65,72,81`). The registration is write-only on the Svelte path. Either route `TimeSlider` through `fireTimeChange(payload, winId)` (the per-window registry + test exist) or drop the registration. Small; keep the per-window registry either way.

### 7. Minor / by-design-until-P5 (track, don't fix yet)
- `ColormapForm.svelte:341` `{#each currentStops as stop, idx (idx)}` is index-keyed **with** in-place `sort()` on val change (`:172-178`) → row/DOM shuffle, the same focus-stability class the migration was to remove. Key by stable stop identity.
- `TimeSlider.svelte:28` `$derived(getOrCreateTimeline(winId))` still mutates the store during render; `$effect.pre(:24-26)` masks it. Prefer deriving strictly from `timelinesByWindow[winId]`.
- Hidden fallbacks retained (`TimeSlider.svelte:321`, `Legend`, `CatalogDrawer:207`, `LayersPanel:102`) + compat inputs — correct per R4, delete at P5.
- New config forms add ~25 static `style="..."` layout strings (`PresetForm:189,289,294,339,354-355`, `SettingsForm:108,122,167,177,185,196`, `ColormapForm:254-255`) — dynamic ones (dots, gradients) are fine as `style:property`; move static layout to classes before the P5 grep pass.
- `handleCloseWindow` leaks `timelinesByWindow`/`layersByWindow` entries (map handles are cleaned by the `mapViewport` action destroy; stores aren't). `handleChangeLayout` only grows windows — matches `getVisibleWindows` semantics, fine.
- Outstanding scope unchanged and correctly deferred: Wind/Station drawers, DnD reorder, prefetch/overlay direct wiring, hosted-imperative profile panels, optional vitest smokes. `Architecture.md` makes no false "zero DOM" claim (remaining hits are generic zero-GeoJSON/zero-copy terms).

## Test assessment

542/542 green, build clean. New tests are well-constructed (visibility matrix, concurrent two-window stepping with `_seq` monotonicity, per-window dispatch isolation, action unit tests with mocked nodes). Ceiling, as in review 2: they assert **helpers**, not the App wiring that ships — issues §1, §4, §5 all sit in the untested gap between helper and handler. One test with a mocked map driving `handleLoadProduct` (TLOGP branch) and one driving `handleLoadData`/`stepTimelineDelta` through two windows would close it. `bun test` stays the only gate — correct, no runner migration.

## Phase gates

- P0 scaffold / P1 foundations: done (R1/R2 intact, shims frozen, 542 green).
- P2 shell: ~90% — all §1.5 surfaces state-driven; new-code grep gate clean.
- P3 wiring: ~80% — preset/product/time/layer/level/legend/keyboard paths present; TLOGP import crash (§1) + playback stale-window (§4) + dead callback registration (§6) outstanding; prefetch/profile/DnD deferred.
- P4: ~85% — all five sub-forms ported with bound draft editing; reactivity notification bugs (§2, §3) outstanding.
- P5: not started (correct) — legacy `ui/*`, `style.css`/`tabs.css`, compat inputs remain.

## Next steps

1. Import `loadTLogPLayer` in `App.svelte` (or route via `presetLoader`) — §1 crash.
2. Fix config-form reactivity: fresh snapshot in subscribe handlers + real dirty/validation notify replacing `notifyDirty?.()`; move `SettingsForm` subscribe to `onMount`/`onDestroy`.
3. Per-tick timeline resolution in `TimeSlider.start()` (or pause on `winId` change); make `App` delegate to `stepWindowTimeline`/`applyPresetToWindow`/`keyboardShortcuts`.
4. Add the two App-level tests (mocked-map TLOGP product load; two-window load/step isolation); then P5 deletion + `data-testid` + static-`style` pass.
