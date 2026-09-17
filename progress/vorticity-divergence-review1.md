# Vorticity & Divergence Implementation Review — Review 1

**Date:** 2026-09-16  
**Scope:** uncommitted working-tree diff vs `abb0d3c` (`git status`: 11 modified + 3 untracked), plan file `./vorticity-divergence-plan.md`.  
**Tests:** `cd client && bun test` → **265 pass / 0 fail** across 24 files (was 243/23 before; new `vorticity_divergence.test.js` 22/22 pass).  
**Verdict: Approve with minor follow-ups (no blockers).** The three pipelines (surface / upper-air / NWP wind) all work, plan conformance is high, math core is sound. Findings below are P2/P3 quality + dead-code/consistency items, not correctness blockers.

---

## 1. What was implemented (plan conformance)

| Plan item | Implementation | Verdict |
|---|---|---|
| §5-B NEW `kinematics.js` core | `client/src/layers/kinematics.js` (~341 lines): `computeVortDiv` + `buildKinematicGridData`, `EARTH_RADIUS=6371000`, `KINEMATIC_QC_MAX=100`, `VOR/DIV_LEVELS`, `VOR_BOLD=[0,10]`, `DIV_BOLD=[0]`, `VOR_COLOR=#c678dd`, `DIV_COLOR=#56d4dd`, convention audit header (§5-A) | ✅ Pass |
| §5-C station adapters | `analyzeAndRenderSurfaceKinematicContours` (~160 lines) + `analyzeAndRenderSoundingKinematicContour` (~160 lines); `VOR`/`DIV` config entries with `isKinematic:true, extract:null`, line-first defaults; dispatch at top of `analyzeAndRenderSurfaceContours` / `analyzeAndRenderSoundingElementContour` | ✅ Pass |
| §5-D picker + dispatch | `layerControl.js` VOR/DIV `<option>` in both branches; `layerActions.js:376-377` alias folding, `isKinematic` defaults, per-branch `notifyError` on null result | ✅ Pass |
| §5-E preset lifecycle | `main.js:1231` rename arms; `loadPresetGroup:1103` station-only derived-skip (NWP VOR/DIV now flow to `loadWeatherField` — correct) | ✅ Pass, 1 nit (§3-F3) |
| §5-F NWP path | `loadWeatherField` VOR/DIV branch (cycle→WIND, `dataPath`→WIND, `_windGridCache`, `buildKinematicGridData`, `derivedFrom: wind-<model>-<level>`); new exported `triggerVortDivOverlay` | ✅ Pass, 1 dead-code note (§3-F1) |
| §5-G units/labels/colors | `formatters.js` `1e-5/s` + 1-decimal arms; `colormaps.js` diverging VOR/DIV; `paletteLoader.js` PRS_HGT mapping; `config.json` colormaps | ✅ Pass |
| §5-H presets/config | Hidden `contour-ECMWF_HR-vor-850` in `composite-850hpa` per recommendation (visible:false) | ✅ Pass, 2 nits (§3-F2/F4) |
| §5-I prefetch | `collectNwpItems` VOR/DIV→parent-WIND rule + single-field VOR/DIV branch | ✅ Pass, 1 logic note (§3-M2) |
| §5-K tests §5-L docs | 22-test spec (T1–T6); `Architecture.md` §7.5 + suite counts 224→265/22→24 | ✅ Pass, 1 test-hygiene note (§3-M3) |
| §5-J/§6 no-change list | Server, render primitives, plot/filter/tooltip untouched | ✅ Pass |

---

## 2. Verification performed

- Full suite green from `client/`: 265 pass / 0 fail (new file 22/22 incl. T1 solid-rotation/divergence/uniform/N-to-S/handedness, T2 1/cosφ + SH + QC-clip, T3 swirl/divergent/<3-null, T4 925-outlier + rename/eye, T5 griddata-shape + cache-once + prefetch-WIND, T6 drawer/units/labels/palettes/colormaps/config).
- Diff-walked every hunk: `surfaceAnalysis.js` (+213), `soundingAnalysis.js` (+226), `main.js` (+73/−few), `layerActions.js` (+149 incl. `triggerVortDivOverlay`), `prefetchService.js` (+27), `layerControl.js` (+4), `colormaps.js` (+28), `formatters.js` (+5), `paletteLoader.js` (+2), `config.json` (+101), `Architecture.md` (+77).
- Cross-checked sign/metric/orientation logic in `computeVortDiv:132-248` against plan §3.2; checked `smoothGrid2D(Z, iters, weight, rows, cols)` signature compatibility (flat-Float32Array + rows/cols supported, NaN-preserving).

---

## 3. Findings (ordered by severity; all minor)

### F1 [P3 — dead export] `triggerVortDivOverlay` is exported but never called
- `layerActions.js:916` defines/imports `renderContourLayers`, `renderGridRaster`, `armContourReRender`, `updateLegend` for it, but repo-wide grep shows zero call sites (config-toggle smooth/palette paths re-render via `layer.gridData` generic branch; `main.js` raster blocks call only `triggerRasterOverlay`). Harmless duplication of the `loadWeatherField` VOR/DIV renderer (~115 lines duplicated render+legend epilogue).
- **Recommendation:** either wire it (e.g. smooth/palette re-render for NWP VOR/DIV layers whose `gridData` is kinematic, avoiding a WIND refetch) or delete it and note `loadWeatherField` as the single NWP renderer. Prefer wiring — it already implements the cache-first path correctly.

### F2 [P3 — preset entry missing `level`] hidden NWP VOR entry has no `level` field
- `config.json` `contour-ECMWF_HR-vor-850`: `{derivedFrom:"wind", element:VOR, model:ECMWF_HR, visible:false, render:{...}}` — sibling HGT/TMP/wind entries in `composite-850hpa` also omit `level` (group `hasLevel:true, defaultLevel:850` supplies it via `loadPresetGroup:1094-1100`), so this is **consistent**, not a bug. `loadWeatherField` resolves `level` from the group default at load time and stamps `contour-<model>-vor-<level>` + `path:dataPath`. No fix needed; calling out only because the hardcoded `850` in id/name is cosmetic until first load restamps it (same as siblings).
- Also note `derivedFrom:"wind"` matches the wind entry `id:"wind"` in the same group, while runtime code defaults to `` `wind-${model}-${level}` `` when no custom `derivedFrom` is passed — both resolve to the same parent at runtime (`loadPresetGroup` passes render-through `customOptions` without `derivedFrom`, so runtime uses the default string). Consider aligning the config value to the runtime convention for grep-ability; cosmetic.

### F3 [P3 — rename-block asymmetry, pre-existing pattern] `changeVerticalLevel` non-preset branch ignores VOR/DIV names (cosmetic)
- `main.js:1231` (preset/`hasLevel` branch) has VOR/DIV arms ✅. The non-preset obs branch (`main.js:~1240-1260`, `derivedFrom: l.derivedFrom` snapshot restamp) rebuilds ids generically — element-agnostic so VOR/DIV ids still restamp correctly; only the human-readable `Derived <name>` string falls back to raw element there (same pre-existing DTD-era behavior for any non-HGT/TMP/DTD element). No functional impact; fix opportunistically if touching that block.

### F4 [P3 — `CONV` alias sign inconsistency] normalizers map `CONV→DIV` (positive-divergence) but `buildKinematicGridData` treats `"CONV"` as sign-flipped (-D)
- `surfaceAnalysis.js:260`, `soundingAnalysis.js:303`, `layerActions.js:377` all fold `CONV` into `DIV` **before** `buildKinematicGridData` is ever called with the raw string, so the `norm==="CONV"` negate-branch (`kinematics.js:301-306`) is currently unreachable via those paths — no live bug. But the two definitions disagree (alias says CONV==DIV; builder says CONV==-DIV).
- **Recommendation:** pick one: (a) drop `CONV` from the normalizers and keep builder's convergence=-D documented, or (b) keep alias and remove the builder branch. Prefer (a) + a test pinning `buildKinematicGridData("CONV",…)==-DIV`.

### F5 [P3 — unused imports in `main.js`] `analyzeAndRenderSoundingKinematicContour` / `analyzeAndRenderSurfaceKinematicContours` imported but never referenced in `main.js:13-14`
- Station paths go through the generic `analyzeAndRenderSoundingElementContour` / `analyzeAndRenderSurfaceContours` entry points (which internally dispatch on VOR/DIV — verified `main.js:726,777,834,885` call sites), so the extra imports are dead. Remove or use them directly; harmless either way (no cycle risk: analysis→control one-way already).

### F6 [P2-ish, pre-existing — flag, don't fix here] `isSurface` model-string mismatch in `layerActions.js:220`
- Smooth-toggle branch checks `layer.model === "SURFACE_ANALYSIS"` but surface adapters stamp `model:"SURFACE"` (`surfaceAnalysis.js:448,608`). VOR/DIV surface smooth-toggles still work via the `contour-surface-` id-prefix fallback, so no live break — but the model comparison is dead for all surface layers (pre-existing, not introduced here). Note for the follow-up that owns that line.

---

## 4. Correctness notes (checked, no action)

- **M1 orientation:** `latAscending` detection (`kinematics.js:86`, `rawY`-first, `d_lat`-sign fallback) + `rNorth/rSouth` mapping (`:139-140`) is correct for both N→S NWP headers and S→N station grids; zonal stencil needs no orientation handling (correct). T1-N-to-S test pins it.
- **M2 prefetch fallthrough:** after the VOR/DIV parent-WIND push, control hits the shared `continue` (`prefetchService.js:~210`) — correct (no double-emit of a bogus `MODEL/VOR/level` item). The dead-looking `if (SURFACE||level===0) lvl=null` inside that branch is unreachable (obs models `continue` earlier) — harmless.
- **M3 test portability:** `vorticity_divergence.test.js:695` reads `/root/downloads/micaps-web/client/config.json` (absolute) while all sibling specs use `./config.json` relative (cwd=`client/`). Suite passes here but breaks on any other checkout path/CI. One-line fix to `./config.json`.
- **M4 `path: dataPath` on stored NWP VOR/DIV layers:** intentional and correct — `triggerRasterOverlay`'s binary fallback (`layerActions.js:~700-730`, `path=layer.path ?? MODEL/element/level`) would otherwise request a nonexistent `MODEL/VOR/level` binary stream. With `dataPath` it would request `MODEL/WIND/level` bytes and render them under a VOR legend — wrong-data-right-shape edge case, only reachable if an operator enables raster on a VOR/DIV layer *without* in-memory `gridData` (load path always sets `gridData`, and the `layer?.gridData` fast path returns first). Acceptable; consider guarding the raster-toggle for kinematic layers to contourf-only if it ever bites.
- **M5 `boldValues` behavior change in `loadWeatherField`:** `boldValues: customOptions?.boldValues` → merged `boldValues` with VOR/DIV defaults — for non-VOR/DIV elements `defaultBoldValues` falls back to `customOptions?.boldValues`, so output is identical; strictly an improvement (group `render.boldValues` now respected for all elements).
- **M6 `showFill`/`showRaster` defaults:** VOR/DIV force line-first (`showFill:false unless set`, raster off unless set) across all three pipelines — matches plan §3.3; operator opt-in preserved.
- **M7 `CONV` aside from F4:** no other sign/convention drift; `CONV` never surfaced in UI options (picker only offers VOR/DIV) — F4 is code-hygiene only.

---

## 5. Test-quality spot check

- T1–T2 analytic fixtures are real assertions (interior-point sampling avoids edge-stencil noise; 1/cosφ ratio asserted with tolerance) — not tautological. T3–T5 use swirl/divergent station fixtures + mocked `fetchGridData` cache-once counting — meaningful. T6 pins drawer strings, units, labels, palette category, colormap zero-crossing, and the hidden preset entry.
- Gaps (acceptable, note for R2): no test for `CONV` sign (see F4), no test for palette-toggle re-render on a kinematic layer, no multi-window `[Wn]` legend attribution check for VOR/DIV (manual matrix item). Full manual matrix (§7-manual: cyclone/front/trough/jet/split-window/calm-domain) still unexecuted — expected for a plan-only→implemented handoff; keep as operator acceptance.

---

## 6. Suggested follow-ups (non-blocking, smallest-first)

1. `test:695` absolute path → `./config.json` (5-second fix, restores checkout-portability).
2. Remove or use the two dead `main.js:13-14` kinematic imports.
3. Resolve `CONV` definition (F4) + pin with a 3-line test.
4. Wire-or-delete `triggerVortDivOverlay` (F1); if wiring, route NWP VOR/DIV smooth/palette re-renders through it.
5. Opportunistic: `SURFACE_ANALYSIS` model-string (F6) and non-preset rename fallback (F3) when those lines are next touched.
6. Manual acceptance matrix from plan §7 (surface cyclone, 500 hPa trough, 200 hPa jet DIV couplet, split-window legends, calm-domain auto-levels).

---

## 7. File inventory (for the record)

- NEW: `client/src/layers/kinematics.js`, `client/test/vorticity_divergence.test.js`, `vorticity-divergence-plan.md` (untracked, plan-only artifact — commit or gitignore per repo convention).
- MOD: `surfaceAnalysis.js`, `soundingAnalysis.js`, `main.js`, `layerActions.js`, `layerControl.js`, `prefetchService.js`, `colormaps.js`, `formatters.js`, `paletteLoader.js`, `config.json`, `Architecture.md`.
- Server: untouched ✅. Render primitives/plot/filter/tooltip: untouched ✅.
