# Auto-Allocation Uncommitted Changes Review (review1)

Scope: 15 modified + 3 untracked (`auto-allocation.md`, `client/test/nwp-haslevel-false.test.js`, `client/test/stores/auto-allocation-modes.test.js`). Verified via `git diff`, file reads, `bun test` (27 pass across auto-alloc + plain-core, 5 pass hasLevel:false), `go test -run TestGridHandlerMockMode_RAIN12` (pass).

## What this change does

1. **5-mode auto-allocation core** (`client/src/lib/stores/tabsCore.js:178-257`): `none|level|model|step|time` + `DEFAULT_LEVELS` (+925), `DEFAULT_MODELS` (8), `stepCycleHours()`, `revertAutoAllocation()`. Re-exported in `client/src/lib/stores/tabs.svelte.js:55-66`.
2. **6-split layout**: `getNumVisible` 6 for `2x3|3x2` (`tabsCore.js:144-149`), `TabsBar.svelte` 6-split button + `sel-auto-alloc` dropdown, `tabs.css` + `App.svelte` grid styles, `WindowPanel.svelte:37` `slot-visible` contract.
3. **Orchestration** (`client/src/App.svelte:344-430,553-680,787-900`): `applyAutoAllocationModeToTab`, `handleSelectAutoAlloc`, shared `handleTimeChange` (level/model fan-out, step fan-out), shared `handleLevelSelect`/`stepVerticalLevel`, `_lastSplitLayout` F4 memory.
4. **`hasLevel:false` NWP fix chain**: `weatherLoader.js:54-65,114,206,245`, `presetLoader.js:119,244-245`, `prefetchService.js:224-262`, `overlayTriggers.js:108-118`, `timelineSync.js:82-86`, `server/handler/grid_handler.go:82-85,144-147`. No more `.../RAIN12/null` or `.../500` for level-less fields; server also suffix-sanitizes `/null|/undefined`.
5. **Tests/docs**: `auto-allocation-modes.test.js` (10 cases), `plain-core.test.js` (+2x3, 5-mode), `grid_handler_test.go:78-106` RAIN12 null sanitize, `tlogp_handler_test.go:96-133` live-test hardening, `auto-allocation.md` (255 lines, design doc).

## Findings (ordered)

### 1. Bug: truthy check on `autoAllocation` string — `none` still allocates levels (Medium)
`client/src/App.svelte:129`:
`winObj.level = tab.autoAllocation ? (DEFAULT_LEVELS[posIdx]||500) : 500`
`client/src/App.svelte:256` same pattern in `handleAddWindow`.
`"none"` is truthy, so new windows always get `DEFAULT_LEVELS[posIdx]` even in `none` mode. Contradicts spec ("new windows inherit active window") and `handleChangeLayout` which correctly checks `!== "none"`. Fix: `tab.autoAllocation && tab.autoAllocation!=="none" ? ... : (activeWin?.level||500)`.

### 2. `stepCycleHours` only handles 8-char cycles; silently wrong on 14-digit obs files (Medium)
`client/src/lib/stores/tabsCore.js:15-32`: strips `.xxx`, handles 8-char `YYMMDDHH` and 10-char `20YYMMDDHH`. A 14-digit file like `20260918080000` (used in `tlogp_handler_test`) yields `yy=20, mm=26` → invalid Date, garbage output, no error. Currently only called with 8-char `forecastCycle/obsTime`, so latent. Fix: early-return or parse `YYYYMMDDHHmmss` (first 10 chars) explicitly.

### 3. Hardcoded 12h step in `time` mode ignores model/obs cadence (Medium)
`client/src/lib/stores/tabsCore.js:228-232`: obs `-i*12`, NWP `C-i*12 / P+i*12`. Correct for 12h synoptic runs and preserves `C+P=V`, but wrong for 6h/3h regional models and 3h surface obs (surface default is 3h in `timelineSync.js:165`). Result: skipped runs. Should take `win0.stepLength` / timeline `currentStepLength` or per-model interval.

### 4. Model-mode layer `id` rewrite diverges from `weatherLoader` id scheme (Medium)
`client/src/App.svelte:374-380`: `l.id = ${type}-${model}-${element}-${level}`.
`client/src/services/weatherLoader.js:59`: non-VOR contour id is `contour-${element}` (no model/level); wind is `wind-${element}`. After one model-alloc switch, snapshot lookup (`s.id===layerId`, `weatherLoader.js:68`) and `addOrUpdateLayer` reuse miss, creating duplicates on repeated switches. Either align id generation or keep stable `l.id` and only rewrite `l.model`.

### 5. Fire-and-forget loads on mode switch; no ordering vs `loadSeq` (Medium)
`client/src/App.svelte:365-418`: `handleLevelSelect(...).catch`, `loadPresetGroup(...).catch` without `await`. Rapid alloc switching interleaves; stale responses rely only on per-window `loadSeq` inside each loader, with no cross-window barrier. `handleTimeChange` shared path correctly `await`s in loop. Fix: `await Promise.allSettled(...)`.

### 6. `time` NWP alloc does not sync per-window timeline stores (Medium)
`client/src/App.svelte:400-413` time branch only sets `win.forecastCycle/period` + `loadPresetGroup`. No `tl.currentInitCycle/discretePeriods/currentPeriodIdx` update (contrast step branch `client/src/App.svelte:384-393` and `handleTimeChange`). `TimeSlider` bound to single `activeWin.id` will show wrong cycle for sibling windows. Also `tabsCore.js:217` shares one `discretePeriods` array reference across windows (aliasing) — clone per window.

### 7. `revertAutoAllocation(tab, number)` partially unifies (Low)
`client/src/lib/stores/tabsCore.js:242-243`: numeric `baseWin` unifies only `level`; `model/period/cycle` come from `activeWinIdx` window. Object form unifies all. Both tests pass but semantics are split. Split into two functions or document.

### 8. `weatherLoader` stores `dataPath` (WIND) as `layer.path` for VOR/DIV — Not an issue (corrected on re-review)
`client/src/services/weatherLoader.js:206,245`: `path: dataPath` stores `MODEL/WIND/level` on a `VOR`/`DIV` layer. This is correct, not a bug: VOR/DIV has no server table and is derived client-side from the parent WIND vector grid (`buildKinematicGridData`, `weatherLoader.js:130-134`; fetch uses `dataPath`, `weatherLoader.js:121`; same in `overlayKinematics.js:94`).
Storing WIND keeps downstream fetches correct: `prefetchService.js:232` is `layer.path || WIND path`, so a stored VOR path would actually break prefetch (it would request a non-existent `MODEL/VOR/level`). Overlay triggers are unaffected — `overlayTriggers.js:97-104,229-236` intercepts `isNwpKinematic` before `layer.path` is read and delegates to `triggerVortDivOverlay`, which recomputes WIND and ignores `layer.path`. `contourReRender.js:148-171` uses `path` only for stale-identity comparison. Display identity is preserved via `element` (`VOR`/`DIV`), `name` (`Derived Relative Vorticity...`, `weatherLoader.js:62-64`), and `derivedFrom`. No change needed.

### 9. `3x2` supported in core/CSS but unreachable in UI (Low)
`getNumVisible` + `tabs.css` + `App.svelte` styles handle `3x2`, but `TabsBar.svelte` button only sets `2x3`. Keep as future reserve, don't remove — add a clarifying comment at the definition site so it isn't mistaken for dead code, e.g. in `client/src/lib/stores/tabsCore.js:147` above `if (layout === "2x3" || layout === "3x2") return 6;`: `// 3x2 reserved for future (portrait/vertical-monitor layout); UI currently only creates 2x3.`

### 10. Server sanitize is suffix-only, single-pass (Low)
`server/handler/grid_handler.go:82-85,145-147`: only one `/null|/undefined` suffix stripped. `.../null/null` or embedded `.../null/...` passes through. Harmless now (client no longer emits them), but loop-strip or regex is cheaper than debugging later. Note `fetchGrid` sanitize is after `MockMode` early-return, but `getFallbackGrid` re-sanitizes so mock test passes.

### 11. `||` chains drop level `0` (Low, currently masked)
`prefetchService.js:227,244,262`, `tabsCore.js:187`: `win.level || 500` maps SURFACE `0` → `500` before the `===0/SURFACE/hasLevel` guards correct it back to `null`. Works today; `??` is the safe operator.

## Positives
- `hasLevel:false` chain is coherent end-to-end and covered (path, name, cacheKey, prefetch, timeline, server fallback). Tests assert no `null` in request URLs.
- `dProg/dt` invariant (`C_i+P_i=V`) and `step` discrete-period awareness (`getPeriodsForStep` via `timelineMath.js` re-export) are mathematically correct and tested for 3h/6h/12h.
- Shared-controls matrix in `auto-allocation.md` matches implementation (`level|model` shared, `step|time|none` independent), except §4 claim "Top Nav Level Dropdown: active only" vs code `App.svelte:828` which fans out in `model` mode — doc needs one-line fix.
- Live `tlogp` test hardening (iterate features for `>=5` levels) is appropriate for flaky live Cassandra.

## Suggested follow-ups
1. Fix #1 truthy check and #3 step-length plumbing first — user-visible misallocation.
2. Align model-mode layer ids (#4) and await mode-switch loads (#5).
3. Harden `stepCycleHours` for 14-digit inputs (#2) and clone `discretePeriods` (#6).
