# Dew-Point Depression (T − Td) Plan — Surface + Upper-Air Analysis

**Date:** 2026-09-07
**Goal:** Add dew-point depression (DTD = T − Td) as a first-class derived contour element for both surface observations and upper-air soundings: objective-analysis contours (dry/moist zones, drylines), a directly-plotted station-plot number at left-middle (like TT), station filter field, legend/colormap support, and preset wiring — following the existing TD/TMP derived-layer patterns, with no server change.
**Status:** Plan only; no code changed.

---

## 1. Why T − Td (Meteorological Background)

T − Td measures how close air is to saturation at observation level and is a daily-use forecaster tool:

- **Saturation / cloud / precipitation potential:** DTD ≤ 2 °C ≈ saturated (fog, stratus, precipitation likely); 2–5 °C moist; > 5 °C progressively drier boundary layer.
- **Dryline / frontal diagnosis (surface):** tight DTD gradient with a moist tongue east and dry punch west marks the dryline — a convection-initiation nowcasting staple. Bold 2 °C and 10 °C lines frame it.
- **Fire-weather / ventilation (surface):** large DTD + strong wind = high fire danger; DTD contours overlay the wind field directly.
- **Upper-air moisture audit:** per-level DTD at 850/700/500 hPa shows dry intrusions, cap strength (700 hPa DTD), and saturation depth — read together with the HGT/TMP contours already shipped.
- **Complement, not replacement:** station plots already show TT and Td side-by-side (`stationLayer.js:361-365,428-436`); DTD contours turn point pairs into an areal field, exactly as SLP/TD contours do today.

---

## 2. Data Availability — No Server Change Needed (Verified)

| Product | T key | Td key | Server path | Verdict |
|---|---|---|---|---|
| Surface | `temperature` (+ aliases `TEM/TT/T/TMP`, `stationLayer.js:361,181`) | `dewpoint` (+ aliases `DPT/TD/Td`, `stationLayer.js:364,183`) | Parser decodes TT (elem 601/2001/23) and Td (801/2005/24/301–305/2006) into `temperature`/`dewpoint` (`server/parser/station_parser.go:138-141,213-214`); mock emits both (`server/mock/mock_generator.go:316-317`) | **Ready.** Both operands present per station. |
| Upper-air | `temperature` | `dewpoint` (computed `Td = T − depression` when only depression 802/803 present, `station_parser.go:142-145,194-199`) | Same record shape; `soundingAnalysis.js` HGT/TMP/TD extractors already read `p.temperature`/`p.dewpoint` (`soundingAnalysis.js:95-157`) | **Ready.** DTD = `p.temperature − p.dewpoint` per sounding at the requested pressure level. |

DTD is therefore a pure client-side derived field: `dtd = T − Td` where both are valid numbers. Effective station count will be lower than T-only or Td-only (needs both), which the QC/minimum-station rules in §4 account for.

---

## 3. Design Decisions

### 3.1 Element identity

- **Key:** `DTD` (uppercase canonical; aliases `T-TD`, `TTD`, `DEPRESSION`, `DPTDPR` mapped in both normalizers).
- **Unit:** `°C` (`formatElementUnit`, `formatters.js:22-37`). Note the existing gap: `TD`, `SLP`, `VIS`, `RAIN6` have no unit arm today (legend shows bare numbers) — backfill them in the same edit (§5-G).
- **Names:** surface config `name: "Dew-Point Depression"` (renders `"Dew-Point Depression (Surface Analysis)"` via `surfaceAnalysis.js:262`); sounding config `name: "Dew-Point Depression"` (renders `"700 hPa Dew-Point Depression (Sounding Analysis)"` via `soundingAnalysis.js:250`). This also fixes derived-preset naming for free: `layerActions.js:334` uses `cfg?.name`, and `main.js:947` needs one mapping arm (`DTD → "Dew-Point Depression"`, see §5-D).

### 3.2 Contour levels + bold values (operational rationale)

DTD range is roughly 0–35 °C (0 = saturated, 30+ = desert/downslope). Fixed operational thresholds beat auto-levels:

- **Levels:** `[1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30]` — dense at the moist end (where 1–2 °C decides fog/stratus), coarser at the dry end. Fall back to `griddata.autoLevels(minV, maxV, 8)` when computed max < 5 (uniformly saturated regime, e.g. widespread rain).
- **Bold:** `[2, 10]` — 2 °C saturation line + 10 °C very-dry line. (Siblings use `[0,10,20]` TD, `[0,-20]` TMP; DTD's two lines are the dryline pair.)
- **Upper-air:** same levels/bold at every pressure level (moisture thresholds are level-independent, unlike HGT's per-level tables). `getLevels` ignores `level`; `getBoldValues` returns `[2, 10]`.

### 3.3 Colormap (moist → dry semantics)

New `DTD` palette in `colormaps.js:3-57` (inverted moisture ramp — low = wet/green-blue, high = dry/brown-red):

```
0:  [20, 90, 200]    saturated blue
2:  [40, 160, 140]   moist teal-green
5:  [90, 190, 90]    green
8:  [220, 220, 80]   yellow
12: [240, 150, 40]   orange
18: [220, 70, 40]    red-brown
30: [140, 40, 30]    dark dry red
```

- Register `DTD` in `getColor`'s fixed-physical list (`colormaps.js:113-116`, currently RH/WIND/TMP/RAIN) so fills clamp to physical bounds instead of stretching per-scene. Add `DTD` arm to `getElementLevels` (`colormaps.js:201-273`) returning the §3.2 standard levels.
- Palette picker: map `DTD → "TMP"` category in `paletteLoader.js:4-14` (moisture-adjacent XML palettes exist there; no new `client/palettes/DTD/` folder needed — creating one is optional P2). `getPaletteCategory` returns `null` for unmapped elements today, which yields the silent empty-select gap from ui-review3 §2.6 — mapping DTD avoids it.

### 3.4 Fill default

Ship DTD with **`showFill: true`, `showLine: true`** in preset `render` blocks — unlike HGT/TMP siblings (line-only). Rationale: DTD's product value is areal (dry-zone shading + dryline position); the DTD palette from §3.3 is designed for it. Operator can still toggle fill off per-layer; the toggle path is generic (`layerActions.js:118-135`).

---

## 4. QC Rules (Per-Station Gating Before Triangulation)

Single bad T or Td currently produces bull's-eyes; DTD doubles the exposure (difference of two noisy fields), so gate strictly:

| # | Rule | Surface | Upper-air | Rationale |
|---|---|---|---|---|
| Q1 | Both operands required | `T ∈ [-90, 65]`, `Td ∈ [-90, 50]` (reuse TMP/TD bounds, `surfaceAnalysis.js:43,71`) | `T` within `TMP_QC_BOUNDS[level]`, `Td` within `bounds − 25 .. bounds` (reuse TD extractor bounds, `soundingAnalysis.js:147-153`) | Same envelopes as the sibling fields; no new tuning. |
| Q2 | Supersaturation cap | Reject if `Td > T + 0.5` | Same | Allows rounding noise, kills decoupled/failed sensors. (Server upper-air already clamps `dewPoint > temp` at ingest, `station_parser.go:196-198`; Q2 is the client-side backstop for surface + mock data.) |
| Q3 | Range cap | Reject if `DTD < 0` or `DTD > 45` | Same | Below 0 impossible after Q2; above 45 unphysical for either product. |
| Q4 | Minimum stations | Require ≥ 3 valid DTD points (existing `< 3` guards, `surfaceAnalysis.js:190-193`, `soundingAnalysis.js:305`) | Same | DTD attrition means a 3-station map can yield 0 DTD contours — the `addContour` path already toasts on `< 3` (`layerActions.js:305-308`); extend that toast to name the element (`${elem}` already interpolated) so `DTD` reads correctly with no extra work. |
| Q5 | Missing-data policy | Skip station silently (point-wise, like all sibling extractors) | Same | No imputation; `fillValue: avgVal` grid fill already handles edges. |

---

## 5. Work Items (by File)

### P0 — Core contours (both products render DTD)

- **A. `client/src/layers/surfaceAnalysis.js`**
  - Add `DTD` entry to `SURFACE_CONTOUR_CONFIGS` (`:7-155`): `name "Dew-Point Depression"`, `element "DTD"`, `unit "°C"`, `defaultColor "#e3b341"` (dry-amber reads against green TD/red TMP siblings), `colormap "DTD"`, `boldValues [2, 10]`, `extract(p)` implementing Q1–Q3 via the TMP/TD key lists, `getLevels` per §3.2 with auto fallback.
  - Extend `normalizeSurfaceElementKey` (`:157-166`) with `DTD/T-TD/TTD/DEPRESSION/DPTDPR → "DTD"`.
  - No render-pipeline change: `analyzeAndRenderSurfaceContours` (`:168-299`) already threads `colormap/boldValues/labelSize` generically, including the ui-review3 C1 `labelSize` fix.
- **B. `client/src/layers/soundingAnalysis.js`**
  - Add `DTD` entry to `SOUNDING_CONTOUR_CONFIGS` (`:89-192`): same name/unit/colors/levels/bold; `extract(p, level)` = `p.temperature − p.dewpoint` gated by TMP_QC bounds + Q2/Q3.
  - Extend `normalizeSoundingElementKey` (`:194-201`) with the same aliases.
  - No pipeline change: `analyzeAndRenderSoundingElementContour` (`:203-275`) is element-generic (levels via `cfg.getLevels`, bold via `cfg.getBoldValues`).
- **C. `client/src/ui/layerControl.js` — contour picker**
  - Add `<option value="DTD">Dew-Pt Depression (DTD)</option>` to both branches of `.sel-contour-element` (upper `:568-572`, surface `:574-580`). The `addContour` dispatch reads `selContourElem.value` generically (`:483-493`).
- **D. `client/src/ui/layerActions.js` + `client/src/main.js` — derived-layer plumbing (mostly free)**
  - `addContour` (`layerActions.js:302-364`): upper branch resolves `SOUNDING_CONTOUR_CONFIGS[elem]` + default color generically — works once B lands; surface branch likewise. Only gap: sounding derived-entry naming falls back to raw `elem` for unknown elements (`:334`); with `cfg.name` set it reads `"700 hPa Derived Dew-Point Depression"` automatically — no edit needed, verify by test.
  - `main.js:947` elemName mapping (`HGT → Geopotential Height`, `TMP → Temperature`, else raw): add `DTD → "Dew-Point Depression"` arm so level-stepped renames read `"700 hPa Derived Dew-Point Depression"` instead of `"... Derived DTD"`.
  - Level stepping / snapshots / visibility / legend lifecycle are all element-generic (`contour-sounding-${element}-${level}` ids `:925,945,958`; `layerSnapshots` by id/model; legend by `layer.element`) — DTD inherits them; cover with a stepping test rather than code.

### P1 — Presets, filter, legend/units

- **E. `client/config.json` — ship DTD in both observation presets**
  - `composite-surface` (`:347-379`): add derived entry `{ id: "contour-surface-dtd", model: "SURFACE", element: "DTD", derivedFrom: "surface-obs", name: "Surface Derived Dew-Point Depression", render: { showFill: true, showLine: true, lineColor: "#e3b341" } }` (§3.4).
  - `composite-upperair-500` (`:380-426`): add `{ id: "contour-sounding-dtd-500", model: "UPPER_AIR", element: "DTD", level: 500, derivedFrom: "upperair-obs-500", name: "500 hPa Derived Dew-Point Depression", render: {...} }`. Level-step rewrite (`main.js:936-951`) is generic over `l.element`/`l.model === "UPPER_AIR"` — id/path/name follow automatically; assert in test.
  - Default-visibility decision (product call): ship DTD **visible** in surface preset (dryline is a headline surface product) and **hidden** (`visible: false`… note preset schema uses `render` + top-level `visible`? siblings omit it, defaulting visible — check `presets.js` merge before finalising; simplest is to mirror siblings and let the eye toggle rule) — recommend visible in both, since ui-review2 C1/C2 snapshot work preserves eye state across reloads.
- **F. Station filter field — `stationLayer.js` + `stationFilterControl.js`**
  - `getFieldValue` (`stationLayer.js:178-221`): add `case "DTD": return dtd(T,Td) with Q1–Q3` (reuse `extractTemp` key lists). Enables `DTD > 10` (dry-outbreak stations) / `DTD < 2` (saturated stations) rules.
  - Add `<option value="DTD">DTD (°C)</option>` to both field lists (upper `:147-153`, surface `:154-162`).
- **G. Units + legend — `formatters.js`, `colormaps.js`, `paletteLoader.js`**
  - `formatElementUnit` (`formatters.js:22-37`): add `DTD → "°C"`; backfill missing `TD → "°C"`, `SLP → "hPa"`, `VIS → "km"`, `RAIN6 → "mm"` (legend currently unit-less for all four — same one-line shape).
  - `colormaps.js`: add `DTD` stops (§3.3); add `DTD` to `isFixedPhysical` (`:113-116`); add `DTD` arm in `getElementLevels` (`:201-273`).
  - `paletteLoader.js:4-14`: add `DTD: "TMP"`.
- **H. Tooltip (P1, 3 lines) — `tooltip.js:17-36`**
  - Compute `dtd = (tt valid && td valid) ? (tt − td).toFixed(1) + " °C" : "--"` and add a `DTD (T−Td)` row. Forecasters read the tooltip as a station audit; DTD there closes the loop with the contour field.
- **I. Station-plot DTD number at left-middle (P1) — `stationLayer.js` + `layerControl.js` + `config.json`**
  - **Slot:** DTD renders as an integer number in the middle-left row: `top:20px; left:0; width:22px; text-align:right; font-size:12px; font-weight:700; color:#f0883e (orange)` — same row as `ww` (`stationLayer.js:437-441`), same column as TT/Td (`:428-436`). 12px matches the other middle-row fields (R6/VIS); orange is distinct from TT red `#f85149`, Td green `#56d364`, ww amber `#e3b341`, VIS yellow `#ffd33d`. Integer rounding mirrors TT/Td (`Math.round`, `:362,365`); blank when either operand missing or Q2 fails (same blanking policy as R6, `rawRain6>0` precedent `:400-401`).
  - **Collision rule (DTD vs ww share the slot):** middle-left priority `DTD > ww`; displaced `ww` moves to the far-left slot (`left:-26px`, the VIS geometry) **only when VIS is off**; far-left priority `VIS > ww`, so in the pathological DTD+ww+VIS triple combo `ww` is dropped (documented in drawer `title`). Legacy layouts are pixel-identical when `showDTD` is off. VIS (`left:-26px`, `:443-446`) never collides with DTD (`left:0`), so no other cascade.
  - **Toggle + defaults (opt-in):** new `showDTD` key, default **`false`** — DTD plots only when the operator checks the box (R6/VIS precedent). Concretely: `getState` default `false` (`stationLayer.js:16-33`); factory defaults `false` in BOTH station branches (`layerControl.js:138-151`, upper `:139-143` and surface `:152-161` — upper branch omits Cloud/Weather/Tendency/Rain6/Vis by design, but DTD belongs in both since this plan covers surface + upper-air); drawer checkbox uses the `Boolean()` pattern (not `!== false`) in BOTH item lists (`renderStationDrawerHTML`, `:537-542` upper / `:543-552` surface); add `[".chk-station-dtd", "showDTD"]` to the `bindStationCheckbox` table (`:468-479`).
  - **Config plumbing (no `main.js` edit):** per the ui-review2 §8-R3 lesson, the flag must reach the map on toggle AND survive reload — it does automatically: `stnConfig` spreads (`main.js:573-578,641-647`) + `renderStationWeatherPlots` merge (`stationLayer.js:53-55`) + `setStationConfig` carry any `layer.config.showDTD`, and `autoSaveLayerConfig` persists the operator's check like all sibling flags. `config.json` ships NO `showDTD` flag (absent = off) — fresh loads plot clean legacy markers until opted in.
  - **Tests:** factory default `false` in both branches; `getState` default `false`; drawer checkbox unchecked by default in both branches; checking it plots DTD and the check survives reload (autoSave round-trip); DTD blanking (missing Td → `""`; `Td > T+0.5` → `""`); collision rule (DTD+ww → ww displaced; DTD off → ww middle unchanged).

### P2 — Polish / docs / tests

- **J. Tests — new `client/test/dtd_analysis.test.js`** (mirror `derived_layers.test.js` / `station_contour_analysis.test.js` fixtures):
  1. Extract math: T=25/Td=20 → 5; missing Td → null; Td>T+0.5 → null; DTD>45 → null.
  2. Normalizers: `DTD/T-TD/TTD/DEPRESSION` → `DTD` in both modules.
  3. Levels/bold: standard list returned; auto fallback when max<5 (surface).
  4. End-to-end render on sample stations (≥3 valid DTD): `layerId` shape `contour-surface-dtd` / `contour-sounding-dtd-700`; `element "DTD"`; `config.showFill true`.
  5. Level-step rename: `DTD → "Dew-Point Depression"` arm (`main.js:947` logic mirrored).
  6. Filter: `getFieldValue(p,"DTD")` + `matchesStationFilters` with `DTD > 10`.
  7. Units: `formatElementUnit("DTD") === "°C"` (+ backfilled TD/SLP/VIS/RAIN6).
- **K. Docs** — `Architecture.md`: extend the derived-element enumeration + QC-bounds table (`:408-429` region) with DTD; extend test-suite list (`:226-235`) with the new spec. `ui-review3.md`-style verification appendix in the implementing PR.
- **L. Manual acceptance matrix** (see §7).

---

## 6. What Explicitly Does NOT Change

- **Server:** no parser/model/mock change (both operands already emitted, §2).
- **Render pipeline:** `renderCustomContourGeoJSON`, smoothing, `labelSize`, raster/wind/barb paths untouched (DTD is line+fill contour like TD).
- **Snapshot/visibility/legend lifecycle:** element-generic already (ui-review2 C1–C3, ui-review3 C1–C4 fixes inherit).
- **`analyzeAndRenderSoundingContours` HGT+TMP fallback** (`soundingAnalysis.js:277-289`): left as-is; DTD arrives via preset (E) or picker (C), not the no-preset fallback.
- **Station plot glyphs:** EXPIRED by §5-I — DTD joins the plot as a left-middle number. All other glyphs untouched.
- **`analyzeAndRenderSoundingContours` HGT+TMP fallback** (`soundingAnalysis.js:277-289`): left as-is; DTD arrives via preset (E) or picker (C), not the no-preset fallback.

---

## 7. Acceptance Criteria + Verification

- [ ] Surface preset load shows DTD fill + 2/10 °C bold lines; eye toggle hides/shows; legend shows `DTD (°C)` with the §3.3 ramp.
- [ ] Upper-air 500→700 step: DTD layer id becomes `contour-sounding-dtd-700`, name `700 hPa Derived Dew-Point Depression`, eye state preserved (snapshot inheritance, §5-D).
- [ ] `..` filter `DTD between 2..10` isolates frontal-zone stations; focus restore unaffected.
- [ ] Tooltip shows `DTD (T−Td)` consistent with plotted TT/Td.
- [ ] Missing-Td stations skipped, no crash; `< 3` valid DTD → existing `addContour` toast names DTD.
- [ ] Station plots show NO DTD by default (both products, clean legacy markers); checking `Dew-Pt Depres. (T−Td)` plots the orange integer at left-middle; the check survives preset reload / time-step (config-plumbing inheritance, §5-I).
- [ ] DTD+ww both on → DTD middle-left, ww displaced far-left; ww alone → middle-left unchanged (legacy pixel-identical); missing Td → blank, no crash.
- [ ] `bun test` green (new `dtd_analysis.test.js` + full suite); manual recheck: saturated regime (all DTD < 2, auto-levels engage), dry regime (DTD > 20 renders), split-window `[Wn]` legend attribution for DTD.

## 8. Risks / Open Questions

1. **Station attrition:** DTD needs both T and Td; sparse-Td regions (parts of upper-air at 300–100 hPa, dry soundings reporting missing dewpoint) may yield < 3 points → no contour. Mitigated by Q4 messaging; consider a muted layer-row hint (`DTD: n<3 stations`) as follow-up.
2. **Mock-data realism:** verify `mock_generator.go:316-317` Td spread produces interesting DTD gradients; if mock T−Td is constant, demo looks flat — may need mock spread tweak (server-side, trivial).
3. **Fill-on default cost:** DTD fill adds one isoband layer per product; same cost class as existing fills — acceptable, and toggleable.
4. **Rain-contaminated DTD ≈ 0 everywhere** during widespread precipitation makes the field boring but correct (it *is* saturated) — auto-level fallback (§3.2) keeps lines drawable.
5. **Product call (§5-E):** default-visible vs hidden for shipped DTD layers; recommendation above is visible/visible.
6. **Resolved — opt-in:** DTD plots only on operator check (R6 precedent), so existing users' plots are untouched; no declutter impact (DTD lives inside the existing 56px box).
