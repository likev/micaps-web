# Vorticity & Divergence Derived Contours — Surface + Upper-Air + NWP Wind Grid Plan

**Date:** 2026-09-16
**Goal:** Add relative vorticity (VOR, zeta) and divergence (DIV, D) as first-class derived contour elements in three pipelines: (A) surface station observations, (B) upper-air soundings per pressure level, (C) NWP vector wind grids (e.g. `ECMWF_HR/WIND/<level>`, Diamond-11). Reuse the existing TMP/TD/DTD/WIND derived-layer lifecycle (picker Add, presets, level-step rename, snapshots, legends, prefetch-skip rules) with **no server change**.
**Status:** Plan only; no code changed.

---

## 1. Why Vorticity / Divergence (Meteorological Background)

Vorticity and divergence turn a wind field into an areal dynamical diagnostic — the daily-use complement to the scalar T/Td/HGT contours already shipped:

- **Relative vorticity zeta = dv/dx - du/dy:** cyclonic (NH: zeta > 0) vs anticyclonic rotation; short-wave troughs/ridges, shear lines, tropical-cyclone core, upper jet streak shear zones. Per-level zeta at 850/500/200 hPa is read together with HGT contours.
- **Divergence D = du/dx + dv/dy** (convergence = -D): low-level convergence -> ascent/precipitation; upper-level divergence -> surface cyclogenesis (coupled 850 hPa convergence + 200 hPa divergence is the classic intensification signature). Dryline/frontal diagnosis pairs DTD gradients (already shipped) with convergence lines.
- **Complement, not replacement:** station plots already show wind barbs (stationLayer.js, windLayer.js:649-809); streamline overlays show flow; VOR/DIV contours quantify rotation and mass adjustment, exactly as SLP contours quantify mass.

Conventional display unit is **1e-5 s-1** (values O(+-1..+-20); synoptic zeta ~= +10 = 10x1e-5 s-1). All contour levels, colormaps, palettes, and labels in this plan use that scaled unit unless noted.

---

## 2. Data Availability — No Server Change Needed (Verified)

| Product | U/V source | Server path | Verdict |
|---|---|---|---|
| Surface stations | `wind_speed` + `wind_dir` (or `u`/`v`) per station; calm -> (0,0) | Parser decodes wind (station_parser.go:87), mock emits wind_dir/speed (mock_generator.go:325-327); stationLayer.js:344-365 getFieldValue(Wind); windLayer.js:654-719 extracts ws/wd to u/v with WIND_QC_BOUNDS gate | **Ready.** Both components recoverable per station. |
| Upper-air soundings | Same record shape at requested level; soundingAnalysis.js:167-193 WIND extract + WIND_QC_BOUNDS:72-89 | Same as above; per-level QC already level-aware | **Ready.** |
| NWP wind grid (ECMWF_HR etc.) | Diamond-11 vector grid: Block1/Block2 -> resp.U/V/Values(speed) (server/parser/grid_data.go:95-157); client fetchGridData(path,file) returns {header,u,v,values,stats,x,y} (catalogApi.js:24-26) | Existing loadWeatherField WIND path (main.js:443-645), triggerWindStreamlines/Barbs (layerActions.js:498-846), renderWindStreamlines bilinear sampler (windLayer.js:16-640) | **Ready.** zeta/D are pure client-side finite differences on the already-fetched u/v grid. |

Key consequence: **VOR/DIV are second-order derived fields, not per-station scalars.** They cannot use the extract(p)->scalar + Barnes/griddata.griddata path that TMP/TD/DTD/WIND use (surfaceAnalysis.js:200-260, soundingAnalysis.js:194-310). The plan adds a **kinematic pipeline**: interpolate U/V to a regular grid first, then differentiate, then contour. That is the only architectural delta.
---

## 3. Design Decisions

### 3.1 Element identity, names, units

- **Keys:** `VOR` (relative vorticity zeta; aliases `VORT`, `VORTICITY`, `RVOR`, `REL_VOR` mapped in both normalizers) and `DIV` (divergence D; aliases `DIVERGENCE`, `CONV` noted sign-flipped, mapped likewise). Uppercase canonical everywhere (matches `DTD` precedent, dew-point-depression-plan.md section 3.1).
- **Units:** `1e-5 s-1`. `formatElementUnit` (formatters.js:22-44) gains `VOR/DIV -> "1e-5/s"` (ASCII-safe; use superscript `10-5 s-1` in docs, ASCII in code/legend to avoid font issues). `formatContourLabel` (formatters.js:46-61) gains a VOR/DIV arm: 1-decimal (Math.round(v*10)/10), same class as TMP/TD/DTD.
- **Names:** surface config `name: "Relative Vorticity"` / `"Divergence"` (renders `"Relative Vorticity (Surface Analysis)"` via surfaceAnalysis.js:389-392); sounding same (renders `"500 hPa Relative Vorticity (Sounding Analysis)"` via soundingAnalysis.js:272-300). NWP derived: `"850 hPa Derived Relative Vorticity (ECMWF_HR)"`. layerActions.js:324-334 name construction and main.js:1186 + level-step rename each need one mapping arm per element (see section 5-D).
- **Sign convention (lock in code comments + tests):** zeta = dv/dx - du/dy (NH cyclonic positive); D = du/dx + dv/dy (divergence positive, convergence negative). Document once in the new module header.

### 3.2 Math — spherical finite differences (single source of truth)

New module `client/src/layers/kinematics.js` owns:

```
R = 6371000 m; lon/lat in radians
 d/dx = 1/(R*cos(phi)) * d/dlam, d/dy = (1/R) * d/dphi
 zeta(i,j) = (v(i+1,j)-v(i-1,j))/(2*dx_j) - (u(i,j+1)-u(i,j-1))/(2*dy)
 D(i,j)    = (u(i+1,j)-u(i-1,j))/(2*dx_j) + (v(i,j+1)-v(i,j-1))/(2*dy)
 dx_j = R*cos(phi_j)*dlam_rad, dy = R*dphi_rad (dy sign-normalized; see below)
 output x1e5 -> display unit 1e-5 s-1
```

- Centered differences interior; one-sided at domain edges; skip stencil points with missing/sentinel (>9000, NaN) — emit NaN there and let the contour stage use the field-average fill (same fillValue: avgVal convention as surfaceAnalysis.js:299-303).
- **Latitude orientation trap:** NWP headers may be north-to-south (start_lat > end_lat, d_lat<0; grid_data.go:40-47, windLayer.js:30-33 isLatNorthToSouth). Normalize dy = |dphi|*R and index j accordingly — never let a negative d_lat flip the sign of zeta/D. Station IDW grids built by generateStationWindGrid are south-to-north (windLayer.js:746-752); handle both via explicit latAscending flag derived from header/y.
- **u/v convention audit (required pre-work, section 5-A):** station path uses meteorological u=-ws*sin(rad), v=-ws*cos(rad) (windLayer.js:707-711); server Diamond-11 speed/dir path currently does u=speed*cos(rad), v=speed*sin(rad) (grid_data.go:132-136). These disagree by convention (math-angle vs met-direction). The plan **does not change** either conversion in this task; instead the new module documents the assumed convention (eastward +u, northward +v) and the test suite pins the sign with a synthetic solid-rotation fixture (section 7). If the audit shows the server convention is math-angle, file a follow-up to reconcile — do not silently flip signs here.
- **Smoothing (two-stage, mirroring existing practice):** light smoothGrid2D(u/v, 1, 0.4-0.45) **before** differentiation (kills IDW bullseyes; same helper as surfaceAnalysis.js:305, soundingAnalysis.js:439), then light smooth on zeta/D after scaling. Expose smoothIterations through layer config like scalar contours.

### 3.3 Contour levels, bold values, defaults (operational rationale)

| Element | Range (1e-5 s-1) | Proposed levels | Bold | Default render |
|---|---|---|---|---|
| VOR (all pipelines) | ~-15..+25 (TC/jet higher, clipped by QC) | [-20,-15,-10,-8,-6,-4,-2,0,2,4,6,8,10,15,20] (station grids may auto-fallback via griddata.autoLevels when span is narrow, same pattern as soundingAnalysis.js:449-452) | [0, 10] (0 = shear line, +10 = strong cyclonic) — alt [5,10] if 0-line is too noisy in review | showLine: true, showFill: false, showRaster: false, lineColor: "#c678dd" (purple; distinct from HGT blue / TMP red / DTD gold) |
| DIV (all pipelines) | ~-15..+15 | symmetric [-20,-15,-10,-8,-6,-4,-2,0,2,4,6,8,10,15,20] | [0] (convergence/divergence boundary) + optional +-10 | showLine: true, showFill: false, showRaster: false, lineColor: "#56d4dd" (cyan; distinct from wind blue #388bfd) |

- Fill/raster remain available via the standard config toggles (isoband + renderGridRaster paths are element-generic) but default **off**: kinematic fields are noisy and line-first is the forecaster convention; operator can enable fill (uses new VOR/DIV colormaps, section 3.4).
- NWP grids at HR resolution will show mesoscale detail — the viewport-crop + maxEffectiveCells pipeline (contourLayer.js:52-98, presets.js:11-41) applies unchanged, so cost class matches existing HR contours.

### 3.4 Colormaps, palettes, legend

- colormaps.js:3-66 DEFAULT_COLORMAPS gains diverging VOR and DIV ramps centered at 0 (convergence/blue-purple -> neutral light -> divergence/warm; vorticity anticyclonic blue -> neutral -> cyclonic warm/red). getElementLevels (colormaps.js:249-324) gains VOR/DIV arms returning the section 3.3 level arrays; getCSSGradient inherits.
- config.json:13+ colormaps gains matching VOR/DIV stop arrays (same values as defaults so cold-start without /api/config still renders).
- paletteLoader.js:4-15 ELEMENT_PALETTE_CATEGORY gains VOR: "PRS_HGT", DIV: "PRS_HGT" — this unlocks the four shipped MICAPS palettes with zero new files: dark/light-relatively-xml (0.5-10), light-absolute-vorticity.xml (5-100), dark/light-Div.xml, light-divergence.xml (-40..40, already in display units!), dark/light-850hPaRDIV.xml. Note dark-Div.xml stops (60-300) look like a different physical quantity — wire it as a selectable palette but **not** the default; default stays the built-in diverging ramp.
- Legend (legend.js:8-101) and updateLegend/removeLegend call sites are element-generic — only the formatElementUnit arm (section 3.1) is needed for VOR/DIV (1e-5/s) ticks.
---

## 4. Pipeline Architecture (What Gets Built)

```
(A) Surface obs --stationsGeoJSON--> generateStationWindGrid(geojson, null)
      --> {u,v,header} --> kinematics.computeVortDiv --> zeta/D grid
      --> contour/contourf --> renderCustomContourGeoJSON --> addOrUpdateLayer(contour-surface-vor/div, model SURFACE, derivedFrom surface-obs)

(B) Upper-air --stationsGeoJSON@level--> generateStationWindGrid(geojson, level) [level QC!]
      --> same kinematic core --> contour-sounding-vor/div-<level> (model UPPER_AIR, derivedFrom upperair-obs-<level>)

(C) NWP wind --fetchGridData(MODEL/WIND/level, file)--> {u,v,header,x,y} (native res)
      --> same kinematic core (no IDW) --> contour-<MODEL>-vor/div-<level> (model MODEL, element VOR/DIV, derivedFrom wind-<layerId>)
      --> renderContourLayers-equivalent + optional raster; streamlines/barbs untouched
```

- **Shared core, three adapters.** All spherical differencing, unit scaling, smoothing, and stats live in kinematics.js; each pipeline is a thin adapter that produces {header, values(Float32Array), x?, y?, stats} in the shape renderCustomContourGeoJSON / renderContourLayers already consume. No new render primitive.
- **Station-grid reuse:** generateStationWindGrid (windLayer.js:648-809, currently dDeg=1.0, IDW 1/(distSq+0.5), domain clamp lon 60-145/lat 10-60) is called as-is. Its output grid becomes the input to differentiation — this guarantees VOR/DIV exactly overlie the station-streamline analysis the operator already sees (triggerStationStreamlines, layerActions.js:848-899).
- **NWP native resolution:** differentiate on the fetched grid directly (no resampling). Derivatives scale with header.d_lon/d_lat (or x/y when present, grid_data.go:49-61). Missing-value guard > -9990 matches contourLayer.js:118.
- **Caching:** NWP zeta/D grids are cached per (model, level, file/cycle.period) on the parent wind layer (layer.gridData / win.windGridData pattern, layerActions.js:817-839) so toggling VOR<->DIV or eye on/off never refetches; station zeta/D recompute with the station fetch they already ride along with (loadObservationProduct / loadUpperAirComposite).
---

## 5. File-by-File Work Breakdown

- **A. Pre-work audit — windLayer.js:697-712 vs grid_data.go:123-141 u/v convention.** Write down (in the new module header) which convention each producer uses; add the solid-rotation sign test first (section 7-T1). If server math-angle vs client met-direction disagree, keep both paths working and note the follow-up; do not bundle a sign flip into this change.
- **B. NEW client/src/layers/kinematics.js** — computeVortDiv(u, v, headerLike) -> { vor, div, nLon, nLat, x?, y? } (scaled x1e5, Float32Array, NaN-aware); buildKinematicGridData(field, u, v, headerLike) -> {header, values, stats} contour-ready; QC bounds: reject |zeta|,|D| > 100 (1e-5 s-1) as non-physical for display (jet/TC tips ~50-80 pass); export VOR_LEVELS, DIV_LEVELS, VOR_BOLD=[0,10], DIV_BOLD=[0], VOR_COLOR="#c678dd", DIV_COLOR="#56d4dd". Zero new dependencies (pure arithmetic + existing smoothGrid2D).
- **C. Station adapters — surfaceAnalysis.js + soundingAnalysis.js.** Add analyzeAndRenderSurfaceKinematicContours(map, stationsGeoJSON, "VOR"|"DIV", options, win) and analyzeAndRenderSoundingKinematicContour(map, stationsGeoJSON, level, "VOR"|"DIV", options, win) that: (1) call generateStationWindGrid (surface: level=null; sounding: pass level for WIND_QC_BOUNDS); (2) <3 stations -> toast+null (same guard as scalar paths, surfaceAnalysis.js:207-210); (3) differentiate via (B); (4) run the existing contour/contourf + renderCustomContourGeoJSON + addOrUpdateLayer tail (copy the surfaceAnalysis.js:310-430 / soundingAnalysis.js:220-300 tail, with ids contour-surface-vor|div and contour-sounding-vor|div-<level>, model SURFACE/UPPER_AIR, derivedFrom surface-obs/upperair-obs-<level>). Add VOR/DIV entries to SURFACE_CONTOUR_CONFIGS / SOUNDING_CONTOUR_CONFIGS (name/unit/color/colormap/levels/bold from section 3, extract: null, isKinematic: true) or document why they are intentionally absent — either way the addContour lookup in (D) must resolve them.
- **D. Picker + dispatch — layerControl.js:663-692 + layerActions.js:302-364.** Add <option value="VOR">Relative Vorticity (VOR)</option> and <option value="DIV">Divergence (DIV)</option> to both upper and surface selector branches; extend the addContour normalizer (layerActions.js:309-310) with VOR aliases (VOR/VORT/VORTICITY) and DIV aliases (DIV/DIVERGENCE) and route isKinematic elements to the (C) adapters instead of analyzeAndRenderSurfaceContours/SoundingElementContour. Naming falls back to cfg?.name (layerActions.js:334) — set, so "700 hPa Derived Relative Vorticity" reads correctly for free.
- **E. Preset lifecycle — main.js.** (1) renderSurfaceDerivedContoursForStation (main.js:755-861) and renderSoundingDerivedContoursForStation (main.js:647-753): branch kinematic elements to the (C) adapters (same snapshot/raster/legend block, only the analyze call differs). (2) Level-step rename (main.js:1186 + 947-region mapping): add VOR -> "Relative Vorticity", DIV -> "Divergence" arms so 500->700 restamps contour-sounding-vor-700 / "700 hPa Derived Relative Vorticity". (3) loadPresetGroup derived-skip (main.js:1057-1062) inherits — no edit (kinematic layers still carry derivedFrom, still derived after station fetch).
- **F. NWP derived layers — main.js:443-645 (loadWeatherField) + new triggerVortDivOverlay in layerActions.js.** Preferred shape (mirrors triggerRasterOverlay:198-265 three-tier fallback layer.gridData -> win.windGridData -> fetch): VOR/DIV preset entries are {type:"contour", model:"ECMWF_HR", element:"VOR"|"DIV", level, derivedFrom:"<wind-layer-id>"}; the NWP loader, upon seeing element VOR/DIV with a wind-capable parent, fetches MODEL/WIND/level once (or reuses cache), runs the (B) core at native resolution, then renders through the standard renderContourLayers + addOrUpdateLayer + armContourReRender + legend path with layerId contour-<model>-vor|div-<level>. Eye/config/raster toggles reuse handleLayerAction contour branch (layerActions.js:36-79) unchanged. Alternative (simpler, acceptable): compute zeta/D inside the existing wind layer as mutually-exclusive overlays — but preset/legend/snapshot semantics favor separate contour layers; decide at implementation kickoff.
- **G. Units/labels/colors — formatters.js:22-61, colormaps.js, paletteLoader.js:4-15, config.json.** As specified in section 3.1/3.4. Backfill check: TD/SLP/VIS/RAIN6 unit gap noted in the DTD plan is out of scope here — only add VOR/DIV arms.
- **H. Persistence — presets.js:192-246, config.json:330-543.** upsertDerivedLayerToPreset/removeDerivedLayerFromPreset/autoSaveLayerConfig match on (model, element) — VOR/DIV inherit with no edit; verify by test. Ship-or-hide decision (product call): recommend shipping one NWP example (e.g. ECMWF_HR 850 hPa VOR hidden visible:false as discoverability without visual noise) and not adding VOR/DIV to the default surface/upper-air observation presets (scalar-first initial view; operator adds via picker). If shipped, mirror the DTD render block (config.json:516-539) with section 3.3 defaults.
- **I. Prefetch — prefetchService.js:182-220.** collectNwpItems currently skips layer.derivedFrom (:189-192); for NWP VOR/DIV entries that skip would starve the parent WIND fetch on keyboard-step prefetch. Rule: when a VOR/DIV layer with derivedFrom->wind is present, prefetch the parent MODEL/WIND/level grid (+binary if its raster is on) instead of skipping. Station VOR/DIV keep the current skip (they ride the station fetch).
- **J. What stays manual:** station-plot glyphs (no per-station VOR/DIV number — meaningless pointwise), station filter fields, tooltips. getFieldValue/matchesStationFilters untouched.
- **K. Tests — new client/test/vorticity_divergence.test.js** (model on dtd_analysis.test.js + derived_layers.test.js): see section 7. Keep the file runnable from client/ (bun test test/vorticity_divergence.test.js) per the cwd-artifact note in prior reviews.
- **L. Docs — Architecture.md.** Extend the derived-element enumeration + QC-bounds table (:408-429 region) with VOR/DIV (kinematic pipeline note, 1e-5 s-1 unit, +-100 QC clip); extend the test-suite list (:226-235) with the new spec.
---

## 6. What Explicitly Does NOT Change

- **Server:** no parser/model/mock change (U/V already emitted, section 2). No new catalog tables; NWP VOR/DIV reuse MODEL/WIND/level paths.
- **Render primitives:** renderCustomContourGeoJSON, renderContourLayers, smoothing, labelSize, streamline/barb/raster paths untouched (VOR/DIV are line-first contours reusing them).
- **Snapshot/visibility/legend lifecycle:** element-generic already (ui-review2 C1-C3, ui-review3 C1-C4 fixes inherit); level-step snapshot blocks (main.js:1142-1192) cover new ids once the (E) rename arms land.
- **analyzeAndRenderSoundingContours HGT+TMP fallback** (soundingAnalysis.js:277-289, main.js:748-750) and surface SLP fallback (main.js:856-858): left as-is; VOR/DIV arrive via preset (H) or picker (D), never via fallback.
- **Station-plot canvas, filters, tooltips:** untouched (see section 5-J).

---

## 7. Acceptance Criteria + Verification

- [ ] **T1 — math sign (headless, no map):** solid-body rotation u=-Om*y, v=+Om*x on a synthetic 5x5 grid yields zeta~=+2Om (x1e5), D~=0; pure divergence u=al*x, v=al*y yields D~=+2al, zeta~=0; uniform flow yields 0/0. Pins the section 5-A convention audit. Fails loudly if u/v handedness flips.
- [ ] **T2 — metric sanity:** same wind shear at lat 20 and lat 50 gives larger zeta at 50 by ~1/cos(phi) (dx shrink); southern-hemisphere identical field keeps formula sign (no hidden NH flip).
- [ ] **T3 — station adapters:** 4-station surface fixture with a cyclonic swirl renders contour-surface-vor lines non-null; <3 valid wind stations -> null + existing addContour toast naming VOR/DIV; missing-dir stations skipped, no crash (mirrors derived_layers.test.js:654-669 wind-QC test).
- [ ] **T4 — upper-air level QC:** outlier (95 m/s at 925) rejected before gridding; contour-sounding-div-500 -> 700 step restamps id + "700 hPa Derived Divergence" with eye state preserved (snapshot inheritance, section 5-E).
- [ ] **T5 — NWP path:** mocked fetchGridData("ECMWF_HR/WIND/850") with analytic shear returns VOR contour layer contour-ECMWF_HR-vor-850 with derivedFrom pointing at the wind layer; second toggle reuses cache (fetch called once); prefetchService emits parent WIND item for VOR/DIV layers.
- [ ] **T6 — chrome:** picker shows VOR/DIV in both surface and upper-air drawers; legend shows VOR (1e-5/s) with the section 3.4 diverging ramp; palette select offers vorticity/divergence/Div via PRS_HGT; bun test green (new spec + full suite).
- [ ] **Manual matrix:** surface cyclone case (VOR+ max over low, convergence line along front); 500 hPa trough (VOR max downstream of trough axis); 200 hPa jet streak (DIV couplet); split-window [Wn] legend attribution for VOR/DIV; calm-wind domain -> near-zero field, auto-level fallback keeps lines drawable.

---

## 8. Risks / Open Questions

1. **Station-grid resolution vs noise:** generateStationWindGrid at dDeg=1.0 IDW is smooth but coarse — weak mesoscale vortices will be under-resolved and derivatives amplify IDW bullseyes. Mitigated by pre-smoothing (section 3.2) and line-first defaults; consider a dDeg=0.5 option for dense surface networks as a follow-up (cost: 4x grid points, still trivial vs NWP).
2. **Boundary stencils:** one-sided edge differences are noisier; clip one grid row/col from display or fade edge isolines if review flags it.
3. **Absolute vorticity follow-up:** some operators expect absolute vorticity (zeta+f). Out of scope — relative only; absolute = zeta + 2*Om*sin(phi) is a trivial post-add once (B) lands (note as roadmap).
4. **NWP HR cost:** differentiating a full HR grid is O(N) Float32 — negligible next to Marching Squares, which stays under the maxEffectiveCells budget via the existing crop path. No new perf work expected.
5. **Product calls:** (a) ship-vs-hide for preset VOR/DIV entries (section 5-H recommendation: one hidden NWP VOR example, no obs-preset change); (b) bold [0,10] vs [5,10] for VOR if the 0-line proves noisy; (c) legend unit string "1e-5/s" vs superscript for font safety (ASCII recommended); (d) separate contour layers (recommended) vs in-wind-layer overlay (section 5-F).
6. **Server convention reconciliation (section 5-A):** if the Diamond-11 cos/sin mapping proves to be math-angle rather than met-direction, the sign fix belongs server-side with its own test — this plan T1 will catch it without coupling the two changes.
