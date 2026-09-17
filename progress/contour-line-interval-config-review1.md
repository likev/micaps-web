# Contour Line Interval Config — Review 1

**Scope:** `contourLevels.js` (new, +`clipLevelsToRange`) + Interval row (`layerRowView.js:111-120,186-194`) + bindings (`layerRowBindings.js:159-284`) + recompute branch (`configActions.js:133-202`) + defaults/persistence (`layerDefaults.js:192-193`, `presets.js:153-154`, `weatherLoader.js:65-66,139,190-191`, `objectiveAnalysis.js:195-196`, `overlayKinematics.js:50,125`, `overlayTriggers.js:68`) + out-of-range clipping (`objectiveAnalysis.js:90-112`, `soundingAnalysis.js:73`, `kinematicContours.js:93`) + tests (`client/test/contour_interval.test.js`, 18 tests).
**Method:** static read of all files above + `surfaceAnalysis.js:56`, `soundingAnalysis.js:58,114`, `kinematicContours.js:65-72`, `contourMapSync.js:234`, `contourReRender.js:160-175`, `derivedContours.js:14-228`, `presetLoader.js:127-133`, `layerStore.js:108-138`; ran `contour_interval` + `contour_logic` + `station_contour_analysis` + `dtd/levels-render` (34 pass, 0 fail).
**Verdict:** Implements the plan faithfully; NWP + surface + sounding + NWP-kinematic custom levels work, Auto reset works, persistence round-trips, and out-of-range custom triples now clip to the data range instead of falling back to auto levels. One moderate follow-up left (`weatherLoader` fallback object dropping `interval/levels`); rest is minor.

## What works

- **Level math is correct and shared.** `validateInterval` / `buildLevelsFromInterval` (`contourLevels.js:15-101`) single-sources NaN / `step<=0` / `start>=end` (float-eps) / count `2..60` guards, 1e10 rounding kills `0.1+0.2` drift. Unit tests cover exact `[1000,1002.5,1005,1007.5,1010]`, `[0,0.1,0.2,0.3]`, string parsing, all four error classes (`contour_interval.test.js:96-182`).
- **Every render path honors the override.** NWP grid (`contourMapSync.js:234` `options.levels ||`), surface (`surfaceAnalysis.js:56`), sounding (`soundingAnalysis.js:114`), station kinematic (`kinematicContours.js:65-72`) all prefer `options.levels`. NWP-kinematic (`overlayKinematics.js:50,125`) and isoband re-render (`overlayTriggers.js:68`) now forward `levels: layer.config?.levels` explicitly. Integration tests prove isoline `value` set ⊆ custom levels and auto path unchanged (`contour_interval.test.js:184-226`).
- **Recompute takes the right branch.** Interval/levels go through the `smooth`-style full recompute (`configActions.js:133-202`: upper → sounding re-analysis, surface → surface re-analysis, NWP-kinematic → `triggerVortDivOverlay`, else `renderContourLayers` + `armContourReRender`), not the cheap `setLayerIsolineStyle` path. `layer.config.interval/levels` are stored before branching (`:147-151`), so downstream spreads see them.
- **UI matches plan and drawer constraints.** Interval sub-row sits between Bold and Label Size (`layerRowView.js:186-194`), same 11px/`#161b22`/wrap-safe idiom; widths 56/48/56 + Auto ≈ 230px fit the 302px drawer. Incomplete triple suppresses callback (no mid-typing wipe), invalid triple shows red border + message, no toast spam (`layerRowBindings.js:188-255`). All-empty resets to Auto; dedicated Auto button clears + emits `{interval:null, levels:null}` (`:268-284`). `handleConfigAction` Auto-reset test passes (`contour_interval.test.js:298-312`).
- **Persistence round-trips.** Defaults (`layerDefaults.js:192-193`), autosave (`presets.js:153-154` → `pLayer.render`), NWP reload (`presetLoader.js:128-133` spreads `render` → `weatherLoader.js:65-66` reads `customOptions.interval/levels`, re-applies at `:139` and stores at `:190-191`), station-derived reload (`derivedContours.js:23,131` merge `cLayer.render`), snapshots (`presetLoader.js:29-38` spread whole `config`), and `addOrUpdateLayer` merge (`layerStore.js:110-113` preserves `config`) all carry the triple. `contourReRender.js:161-175` spreads `...liveLayer.config`, so pan/zoom re-renders keep custom levels.
- **No regressions observed.** `contour_interval` (18), `contour_logic`, `station_contour_analysis`, `dtd/levels-render` — 34 pass, 0 fail.
- **Out-of-range custom triples clip to the data range.** `clipLevelsToRange` (`contourLevels.js:114`) + `isCustomLevels` flag on `tagLinesAndFills` (`objectiveAnalysis.js:90-112`): sounding + custom clips to the in-range subset before contouring (Start 5000/End 6000/Span 100 on a 5400–5600 field → `[5400, 5500, 5600]`); the `autoLevels` fallback now runs only for non-custom levels. Fully disjoint triples return empty lines with the original levels, no fallback, no toast. Flag is threaded from `soundingAnalysis.js:73` (`config.levels` present) and `kinematicContours.js:93` (`options.levels` present). Covered by 4 new tests (`contour_interval.test.js`: clip unit, wider-than-data clip, disjoint, auto-fallback-preserved).

## Findings

### M1 [Moderate] ~~Sounding out-of-range custom interval silently renders auto levels~~ — FIXED
- Was `objectiveAnalysis.js:94-108`: when `isSounding && lines.length===0`, `tagLinesAndFills` discarded the caller's `levels` and substituted `griddata.autoLevels(minV,maxV,8)`.
- Fix applied: `tagLinesAndFills` takes `isCustomLevels` (`objectiveAnalysis.js:90`); sounding + custom pre-clips via `clipLevelsToRange` (`:97-111`, e.g. 5000–6000/100 on 5400–5600 → `[5400, 5500, 5600]`), and the auto fallback is gated on `!isCustomLevels` (`:112`). Fully disjoint triples keep original levels with empty lines — no fallback, no toast. Verified by the 4 out-of-range clipping tests.

### M2 [Moderate] `weatherLoader.js:196-220` fallback object drops `interval`/`levels`
- The `addOrUpdateLayer` call (`:156-193`) stores `interval`/`levels` correctly, but the fallback `layerObj` built for `armContourReRender` when `getLayerById` misses (`:196-220`, race when tab switched mid-load) omits both keys.
- `armContourReRender` then captures a layer without `levels`; its `runCompute` re-reads via `getLayerById(...) || layer`, so the stale fallback wins until next full load → pan/zoom reverts to auto levels on that race path only.
- Fix: add `interval, levels` to the fallback `config` (2 lines, mirror `:190-191`).

### m3 [Minor] `resolveRenderLevels` is dead code in prod
- `contourLevels.js:110-116` is exported, unit-tested, but no production call site references it (all render paths read `options.levels` directly). Either wire it in (e.g. `contourMapSync.js:234`, `surfaceAnalysis.js:56`) or demote to test-only helper to avoid API confusion.

### m4 [Minor] Interval bindings attached to `wind`-type drawers that have no Interval UI
- `layerRowBindings.js:90` binds interval handlers for `contour || wind`, but `layerRowView.js:152-154` renders the Interval row only for `isContour`; `renderWindDrawerHTML` has no `.input-interval-*` elements so `getIntervalInputs()` returns nulls and handlers no-op. Harmless but asymmetric with the `configActions.js:133-136` guard (`layer.type === "contour"`). Consider scoping bindings to contour or adding wind-magnitude interval support explicitly.

### m5 [Minor] Custom interval can orphan `boldValues` without notice (plan-accepted, still worth a hint)
- Bold matching is value-exact (`contourCompute.js:31-44`); a triple that excludes e.g. 1010 just renders everything non-bold. Plan §7 accepted this; a one-line tooltip addition (`title` on the Interval row mentioning bold independence) would close the UX loop.

## Acceptance vs. plan §10
- [x] Interval row renders Start/Span/End/Auto, wraps cleanly.
- [x] Valid triple re-renders NWP grid / surface / sounding / VOR-DIV at exactly those levels (code-verified + NWP integration test; sounding/surface paths verified by `options.levels` precedence + green existing suites).
- [x] Clear/Auto restores auto levels.
- [x] Invalid triple blocked inline, no crash.
- [x] Triple persists via autosave (write path verified end-to-end to preset `render`; reload paths verified by read).
- [x] Out-of-range custom triple clips to data range (no auto fallback, no toast).
- [x] New unit tests pass (18 interval tests); existing contour suites green (34 pass total).
- Follow-up M2 does not block acceptance but should be fixed before calling the feature done.
