# Map + Plot Unified Theme System — Review 1 (uncommitted changes vs `map-plot-theme-plan1.md`)

Review date: 2026-09-23. Scope: all uncommitted changes (`git status` + `git diff HEAD` + two untracked files).
Tests executed: `bun test client/test/map_plot_theme.test.js` (7 pass) and
`bun test client/test/station_canvas_overlay.test.js client/test/weather_symbols.test.js` (17 pass).

## 0. Verdict summary

| Phase (plan §6) | Status | Notes |
|---|---|---|
| Phase 1: Theme Token Infrastructure (§4.1–4.2, steps 1–3) | ✅ Pass with minor deviations | `themeTokens.js` created; `pmtilesLayers.js` delegates to it; map palettes match spec |
| Phase 2: Station Plot Theme-Awareness (steps 4–8) | ✅ Pass with minor deviations | `stationState` / `stationPlot` / `stationSymbols` / `stationCanvas` wired; integer VV/R6 done; wind-barb default + `skyTokens`-vs-`themeId` signature deviate from spec text but work |
| Phase 3: Theme Propagation on Switch (steps 9–11) | ✅ Pass with redundancy note | `applyBasemapScheme` + `createMapInstance` + `stationCanvas` self-heal all propagate `__themeId`; `mapInstance.setBasemapScheme` duplicates work but is harmless |
| Phase 4: Redesigned Color Values (steps 12–15) | ❌ **Fail — dark plot palette not applied** | Light + micaps plot palettes match §3 exactly; **dark plot keeps 6 old hardcoded colors** (details §4 below). Map palettes for all 3 themes match spec. `SettingsForm`/`LayerRow` renames done |
| Phase 5: Peripheral Layers (steps 16–18) | ⚠️ Partial (allowed by plan) | `contourStyle.js` + `contourMapSync.js` halos now light-aware (hardcoded, not token-sourced). `gridBarbs.js` / `streamlines.js` untouched — plan marks this "optional", so not a failure, but inventory items remain open |

**Blocking issue (1):** dark-theme plot tokens in `client/src/map/themeTokens.js:30-45` do not match §3.1.2.
All other findings are minor / non-blocking.

## 1. Change inventory (what was actually changed)

Tracked modifications (`git diff HEAD`):

- `client/src/map/pmtilesLayers.js` — deleted inline `BASEMAP_SCHEMES`, now `BASEMAP_SCHEMES = { dark: THEME_TOKENS.dark.map, … }`; `getBasemapScheme()` → `getMapTokens()`; `applyBasemapScheme()` gains isoline-label recolor + `__themeId` propagation + redraw
- `client/src/map/mapInstance.js` — `resolveInitialBasemapScheme()` accepts `"micaps"`; `createMapInstance()` seeds `state.config.__themeId`; imports `getState`
- `client/src/layers/station/stationState.js:46` — adds `__themeId: "dark"` to default config
- `client/src/layers/station/stationPlot.js` — imports `getPlotTokens`, token-driven `drawPlotText(text,x,y,tokenKey)`, integer VV/R6, themed wind/sky/dot calls
- `client/src/layers/station/stationSymbols.js:95-101` — `drawSkyCoverCanvas(..., skyTokens=null)` with `bg/border/fill` fallbacks; wind barb signature unchanged
- `client/src/layers/station/stationCanvas.js:76-78,151-153` — syncs `state.config.__themeId` from `map.__basemapScheme` on ingest and per-frame
- `client/src/layers/station/stationExtract.js:68,76` — SLP `Math.round(num*10)/10` → `Math.round(num)` (both encoded + numeric branches)
- `client/src/layers/contour/contourStyle.js:79-81` + `contourMapSync.js:91-94,124,140-141` — isoline labels switch `text-color`/`text-halo-color` on `map.__basemapScheme === "light"`
- `client/src/components/config/SettingsForm.svelte` + `LayerRow.svelte` — renames: Midnight Slate→Ink, Daybreak Neutral→Paper, MICAPS Classic→Slate Blue
- `client/test/station_canvas_overlay.test.js`, `weather_symbols.test.js` — expectations updated to integers

Untracked (new, not in `git diff --stat`):

- `client/src/map/themeTokens.js` (147 lines) — the token registry
- `client/test/map_plot_theme.test.js` (282 lines, 7 tests, all passing)
- `map-plot-theme-plan1.md` itself is untracked

Untouched (plan §5 listed them, still untouched):

- `client/src/layers/wind/gridBarbs.js`, `client/src/layers/wind/streamlines.js` — no token import, no color change
- `client/src/map/graticule.js` — untouched, but inherits new colors via `getBasemapScheme()` delegation (plan's MINOR expectation satisfied without an edit)

## 2. Phase 1 — Token infrastructure: pass

- `themeTokens.js:3-133` defines `dark/light/micaps` with `{ id, name, map:{background,fills,boundaries,graticule}, plot:{halo,haloWidth,font,tt,td,dtd,ppp,rain,tend,ww,vis,wind,sky,dot} }` plus `getThemeTokens/getMapTokens/getPlotTokens` (`:135-147`) — matches §4.1 shape.
- `pmtilesLayers.js:5-13` keeps `BASEMAP_SCHEMES` as a computed re-export (backward compat per §5) and `getPMTilesStyle`/`applyBasemapScheme` read exclusively from tokens. Fill/boundary/graticule update loops (`:196-231`) are unchanged in structure.
- Map palettes audit — all three match §3.1.1/3.2.1/3.3.1 exactly (background, fills, national/province/city/county color+opacity+width+dash, graticule). Extra `world` and `provincesDetail` boundary entries exist in tokens but have no spec counterpart; values are reasonable interpolations, not regressions.
- No circular-import hazard: `pmtilesLayers → stationState/stationCanvas → stationPlot → themeTokens` is acyclic (`stationCanvas` never imports `pmtilesLayers`).
- Minor deviation: `font` is `"'SF Mono', -apple-system, monospace"` in all three themes vs plan example `"'SF Mono', ui-monospace, monospace"`. Cosmetically identical; flag only for exactness.

## 3. Phase 2 — Plot theme-awareness: pass with notes

- `stationState.js:46` default `__themeId: "dark"` ✅ (step 4).
- `stationPlot.js:16,71` `getPlotTokens(cfg.__themeId || cfg.scheme || "dark")` ✅ (superset of plan's `cfg.__themeId || "dark"` — harmless fallback). `drawPlotText` (`:91-105`) reads `size/weight/color` + shared `halo/haloWidth/font` from tokens; all 9 call sites (`tt/dtd/td/ww/vis/ppp/rain/tend`) pass token keys; zero hardcoded plot color literals remain in this file ✅. Halo width scales (`haloWidth * scale`), `lineJoin="round"` preserved ✅.
- Integer formatting ✅: VV (`:64-66`) `Math.round(rawVis/1000)` / `Math.round(rawVis)`; R6 (`:69`) `Math.round(rawRain6)`; SLP in `stationExtract.js` both branches. Matches §3.4 code blocks verbatim. Edge note: `rain≈0.4mm` now renders `"0"` instead of `"0.4"`/hidden — this is what the spec literally prescribes (`Math.round(...).toString()` unconditionally for `>0`), but confirm product intent for sub-1mm rain.
- `stationSymbols.js` deviation (non-blocking): plan §4.4 prescribes `(…, color=null, themeId="dark")` + `(…, themeId="dark")` with callee-side `getPlotTokens()`. Implementation instead keeps `drawWindBarbCanvas(..., color="#58a6ff")` (`:3`) and adds `drawSkyCoverCanvas(..., skyTokens=null)` (`:95`) with per-field fallbacks to the old dark literals. Since `stationPlot.js:86,89` always passes `theme.wind.color` / `theme.sky`, the main path is fully themed and the new test passes explicit tokens through. Residual risk only for **direct** callers that omit the arg — they still get legacy `#58a6ff` / dark sky. Recommend either changing the wind default to `null` + lazy token lookup per plan, or documenting that callers must pass theme colors.
- `stationCanvas.js` (step 7): ingest guard (`:76-78`) + per-frame self-heal (`:151-153`) both sync from `map.__basemapScheme`. Slightly broader than plan §4.5 (which only required storing `__themeId` in config and letting the existing `state.config` pass-through carry it), but correct and it makes propagation robust even when `applyBasemapScheme` is bypassed (e.g. `App.svelte:148` calls `applyBasemapScheme` directly). One edge: `renderStationWeatherPlots` skips sync when the incoming `config` already carries a (possibly stale) `__themeId`; the per-frame healer in `drawStationCanvas` corrects it on the next frame, so no persistent desync.

## 4. Phase 3 — Propagation: pass

- `pmtilesLayers.js:247-254` `applyBasemapScheme` sets `map.__basemapScheme`, `state.config.__themeId`, calls `updateVisibleMarkersForMap(map)` (redraw), persists `localStorage` ✅ — this is the atomic map+plot switch from the §4.5 sequence diagram, just located in `pmtilesLayers.js` rather than the plan's nominal `mapInstance.js` location (the plan's file attribution was already inaccurate: the function lives in `pmtilesLayers.js` on main).
- `mapInstance.js:148-153` seeds `__themeId` at creation ✅ (step 10). `resolveInitialBasemapScheme (:77-91)` accepts `"micaps"` ✅.
- `mapInstance.setBasemapScheme (:158-180)` delegates to `applyBasemapScheme` (which already propagates + persists) and then repeats `__basemapScheme` assignment + `localStorage`/`__MICAPS_CONFIG__` writes. Redundant but idempotent; no bug.
- New test `map_plot_theme.test.js:137-167` proves `applyBasemapScheme(mockMap,"light"|"micaps")` flips both `__basemapScheme` and `__themeId` and repaints background. Manual runtime check (settings card → map + canvas) still recommended per §7, but the unit path is green.

## 5. Phase 4 — Redesigned values: FAIL (dark plot palette)

Map palettes: ✅ all three match spec (see §2).

Plot palettes:

| Token | §3.1.2 Dark expected | Actual (`themeTokens.js:34-44`) | Result |
|---|---|---|---|
| tt | `#ff6b6b` | `#f85149` (pre-redesign value) | ❌ |
| td | `#69db7c` | `#56d364` | ❌ |
| dtd | `#ffa94d` | `#f0883e` | ❌ |
| ppp | `#e0e0e0` | `#e0e0e0` | ✅ |
| rain | `#74c0fc` | `#74c0fc` | ✅ |
| tend | `#a5d8ff` | `#a5d8ff` | ✅ |
| ww | `#ffd43b` | `#e3b341` | ❌ |
| vis | `#ffe066` | `#ffd33d` | ❌ |
| wind | `#dee2e6` | `#dee2e6` | ✅ |
| sky bg/border | `rgba(8,9,13,0.90)` / `#dee2e6` | same | ✅ |
| dot fill/stroke | `#ffd43b` / `rgba(0,0,0,0.6)` | `#e3b341` / `#000000` | ❌ |

Light (§3.2.2) and micaps (§3.3.2) plot tokens match the plan cell-for-cell (halos `rgba(255,255,255,0.92)` / `rgba(7,11,20,0.92)`, sizes/weights, wind/sky/dot) ✅. So the miss is isolated to the dark theme — it looks like the old `stationPlot.js` literals were copied into `themeTokens.dark.plot` without applying the §3.1.2 replacements (`PPP is now near-white` was applied; the `TT/Td/DTD/ww/vis/dot` shifts were not).

Fix: update the six dark plot entries (+ dot stroke) to the §3.1.2 values. Existing test `map_plot_theme.test.js` does **not** catch this — it asserts presence/shape and wind/sky/halo contrast, never the exact TT/Td/DTD/ww/vis/dot shades. Recommend adding exact-value assertions per §§3.1.2–3.3.2.

SettingsForm/LayerRow renames to Ink/Paper/Slate Blue ✅ (step 14).

## 6. Phase 5 — Peripheral layers: partial (acceptable)

- `contourStyle.js:79-81`, `contourMapSync.js:91-94,124,140-141` correctly invert isoline label `text-color`/`text-halo-color` on light (`#1c1c1e` / white halo) vs dark/micaps (white / black halo) at creation **and** on update, and `applyBasemapScheme` retrofits pre-existing `*-isoline-label-layer`s. Functionally satisfies §5/§7 ("labels don't clash"). Deviation: colors are hardcoded, not sourced from `themeTokens` as the inventory line suggests. Acceptable, but a one-line `getPlotTokens`/`getMapTokens` read would future-proof it.
- `gridBarbs.js` / `streamlines.js`: untouched. Plan explicitly allows keeping speed-based coloring ("optional — these may keep speed-based coloring"), so leaving them is compliant; just note the two inventory rows remain open if token-driven barb/streamline colors are later desired.
- `graticule.js`: untouched, inherits new `graticule` strings via `getBasemapScheme` → `getMapTokens` ✅ as the plan anticipated.

## 7. Testing

- New `client/test/map_plot_theme.test.js`: 7/7 pass (token completeness, halo-contrast + wind/sky spot checks, SLP/VV/R6 integers, runtime switch, symbol theming, isoline-label recolor).
- Updated `station_canvas_overlay.test.js` (`1012.3`→`1012`) and `weather_symbols.test.js` (SLP integers incl. `998.5`→`"999"`, encoded `214`→`"1021"`) pass; full related run 17/17 pass, no regressions.
- Coverage gaps: (a) no exact-value test for the §3 plot palettes (which is why the dark miss slipped through); (b) no test for `resolveInitialBasemapScheme("micaps")` persistence round-trip or `createMapInstance` seeding (trivial to add); (c) plan §7 manual QA (visual contrast on each theme, runtime dark→light→micaps switch, wind/sky adaptation, localStorage reload, multi-window, console-error check) still needs a human/browser pass — the unit tests mock the map and cannot verify pixels.
- Note: `map_plot_theme.test.js:7` imports `setBasemapScheme` from `mapInstance.js` but never uses it (tests call `applyBasemapScheme`). Unused import is harmless but should be removed or exercised.

## 8. Required follow-ups

1. **[Blocking] Apply §3.1.2 dark plot colors** in `client/src/map/themeTokens.js:34-44`: `tt #ff6b6b`, `td #69db7c`, `dtd #ffa94d`, `ww #ffd43b`, `vis #ffe066`, `dot.fill #ffd43b`, `dot.stroke rgba(0,0,0,0.6)`. Then re-run the three test files.
2. **[Recommended] Pin palettes in tests**: extend `map_plot_theme.test.js` with exact `toBe()` assertions for every cell of §§3.1.2/3.2.2/3.3.2 so a palette regression fails CI.
3. **[Cleanup, optional]**: (a) align `drawWindBarbCanvas` default with plan (token lookup instead of `#58a6ff`) or document caller-must-pass contract; (b) source contour label colors from tokens instead of literals; (c) drop the unused `setBasemapScheme` import in the new test; (d) confirm sub-1mm rain `"0"` display is intended; (e) reconcile `font` string with §4.1 (`ui-monospace` vs `-apple-system`).
4. **[Manual] §7 checklist** on a live build: load each theme fresh, switch dark→light→micaps at runtime, verify TT red family stays red-family but shade-shifts, halo inverts (dark halo on dark, white halo on light), wind/sky/dot adapt, contour labels stay legible, no console errors, reload persists via `localStorage`.
