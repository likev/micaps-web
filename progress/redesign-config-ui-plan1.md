# Meteorological Preset & Colormap Configuration UI Redesign — Plan 1

## 0. Goal

Replace the current single-textarea huge-JSON editor (`client/src/ui/configEditor.js:109-126` — one `<textarea id="config-json-textarea">` holding the entire ~694-line `client/config.json`) with a **guided, form-based Config UI** so operators can manage presets, layers, colormaps, and global settings without hand-editing JSON.

Keep `config.json` schema 100% backward compatible. No server schema break. Preserve existing save path (`POST /api/config` → `server/handler/static_handler.go:95 ConfigHandler`) and live-apply path (`savePresetConfig` → `loadPresetGroups` → `refreshPresetControls` + `refreshNavBarPresets`).

## 1. Current state (verified) & pain points

| Concern | Location |
|---|---|
| Runtime config file (~694 lines, 8 colormaps + 6 presets, nested `render` blobs) | `client/config.json:1-694` |
| Raw-JSON tab UI: toolbar (Format/Reload/Cancel/Save) + textarea + msg | `client/src/ui/configEditor.js:50-354` |
| Panel styles (absolute full-workspace, `z-index:500`, dark mono textarea) | `client/src/tabs.css:377-490` |
| Load/save/format helpers, `CURRENT_CONFIG` draft, `autoSaveLayerConfig` debounce 400ms | `client/src/config/presets.js:45-192` |
| Colormap runtime store, `setColormaps` validation (≥2 stops, finite `val`, 0–255 channels, auto-sort), resolver/levels/gradient | `client/src/utils/colormaps.js:94-368` |
| Per-layer drawer controls already form-based (fills/lines/opacity/bold/interval/label/smooth/raster/palette, station toggles, basemap) | `client/src/ui/layers/layerRowView.js:185-372`, `layerRowBindings.js:11-552`, `configActions.js:26-324` |
| XML palette picker + gradient preview | `client/src/ui/layers/palettePicker.js:1-72`, `client/src/utils/paletteLoader.js:28` |
| Layer defaults factory (`buildBaseConfig`) | `client/src/ui/layers/layerDefaults.js:87-212` |
| Tab lifecycle (open/activate/close, prev-window restore, beforeunload guard) | `client/src/ui/configEditor.js:50-220` |
| Preset dropdown renderers (all map `PRESET_GROUPS` → `<option>`, no divider support today) | `client/src/ui/navBar.js:41,95,122,210`, `client/src/ui/tabs/windowFocus.js:186,200`, `client/src/ui/tabs/windowPanels.js:49` |
| Loader validation (rejects anything without `id` + `layers[]` — divider support requires relaxing this) | `client/src/config/presets.js:60`, `client/test/config.test.js:18-22`; load guard `client/src/services/presetLoader.js:66` (`if (!group \|\| !group.layers) return`) |

**Pain points with huge JSON:**
1. No discoverability: valid `type` (`contour|wind|station|tlogp`), `model` (`ECMWF_HR/SURFACE/UPPER_AIR/...`), `element` (`TMP/HGT/RH/WIND/VOR/DIV/DTD/SLP/...`), and per-type `render` keys are invisible; typos only surface as silent no-ops or `setColormaps` throws.
2. No safety: one misplaced comma/bracket invalidates the whole workstation config; `validateEditorContent` only checks JSON syntax, not semantics (missing `id`, empty `layers`, bad color channel, unsorted `val`, `maxEffectiveCells` out of range).
3. No visual feedback: colormap stops are `[r,g,b,a]` numbers — impossible to judge the gradient without rendering; `getCSSGradient` exists but is never shown in the editor.
4. Hostile color editing: color appears in many places — contour `render.lineColor` (bare `<input type="color">` in `layerRowView.js:247`, no swatches), `layer.color` dot (synced from lineColor, `layerRowBindings.js:105-107`), and every colormap stop `[r,g,b,a]` (`colormaps.js:3-88`, 8 built-in ramps) — but the editor offers zero guidance: no recommended palette, no element→color convention, no way to pick a consistent synoptic color without memorizing hex codes.
5. High cognitive load: presets, colormaps, `basemap`, `performance` are interleaved in one scroll; editing one preset risks touching others; no duplicate/rename/clone helpers.
6. Duplication: layer `render` form controls already exist in the layer drawer but are not reused for preset authoring — two mental models for the same fields.

## 2. Goals / Non-goals

**Goals:**
- G1: CRUD presets and layers via forms (no JSON typing for 95% of tasks).
- G2: Visual colormap editor (stop table + color pickers + gradient preview + sort/validate).
- G3: Inline validation with field-level errors (not just "JSON Syntax Error").
- G4: Safe save flow: draft → validate → preview diff summary → Save → live-apply, with Reload/Cancel/beforeunload preserved.
- G5: Keep every source file < 600 lines (repo rule, `README.md:15`); reuse layer-drawer widgets and `colormaps.js` validators.
- G6: Friendly color everywhere: every color field (contour `lineColor`, colormap stop color, layer dot) offers the same **20 recommended swatches + 20 built-in colormap presets** one click away, with native custom picker + recent-colors as escape hatches (see §3.6).
- G7: Visual dividers: operators can create / move / delete **pure horizontal lines between preset groups** (non-loadable separators, no JSON typing) to organize long preset lists (see §3.2.2).

**Non-goals (Plan 1):**
- No `config.json` schema migration, **except** the divider entry (§3.2.2) — the single sanctioned exception: a `{ id, divider: true, label? }` entry with no `layers`. All other keys keep their exact shapes; `interval`/`levels`, `colormapByLevel`, `palettePath` continue to ride existing passthrough.
- No server-side schema validation (server stays a dumb file store; validation is client-side).
- No multi-user conflict resolution / version history (single-operator workstation assumption).
- No XML palette authoring (palette picker stays read-only reference; colormap editor edits inline `colormaps` only).

## 3. UX design

### 3.1 Overall layout (inside existing `config-editor-panel`)

Keep existing tab pill (`⚙ Config`), toolbar, and lifecycle. Replace `.config-editor-body` single textarea with a **sub-tab bar + split view**:

```
┌─ toolbar (keep: title + status badge + Format* / Reload / Cancel / Save) ─┐
│ [Presets] [Colormaps] [Settings] [⟨⟩ JSON]          ● Unsaved (3 changes) │
├─ sub-tab content ─────────────────────────────────────────────────────────┤
│ Presets:  sidebar list (left 240px)  │  detail form (flex-1, scroll-y)     │
│ Colormaps: sidebar list              │  gradient + stop table              │
│ Settings: single-column form         │                                     │
│ JSON: existing textarea (read-write advanced fallback)                    │
├─ footer msg bar (keep #config-editor-msg, add max-height scroll) ─────────┤
└───────────────────────────────────────────────────────────────────────────┘
```

- `Format` button only visible on JSON sub-tab (it formats the draft JSON, unchanged behavior via `formatCompactJSON`).
- Status badge extends current 3 states (`Valid/Unsaved/JSON Syntax Error`, `configEditor.js:250-269`) with `⚠ N validation errors` state; Save disabled while errors exist.
- All sub-tabs edit the **same in-memory draft object** (deep clone of `CURRENT_CONFIG` at open). Switching sub-tabs never discards edits. Dirty = `JSON.stringify(draft) !== lastSavedText` (reuse `hasUnsavedChanges` pattern) plus per-field error map.

### 3.2 Presets sub-tab

**Left sidebar:** searchable list of preset groups showing `name`, `category` chip, `hasLevel ? defaultLevel+"hPa" : "no-level"` badge, layer count, **interleaved with divider rows** (`───` horizontal lines, §3.2.2 — rendered as non-selectable `<hr>` rows with ↑/↓/✕ handles, never opening the preset detail form). Actions per group row: select, copy (⧉, §3.2.1), delete (✕, confirm if layers > 0). Footer: `+ New preset` and `+ Divider` buttons (blank defaults) — copying an existing group (§3.2.1) is the recommended way to create a variant.

**Detail form (selected preset):**

| Section | Fields (controls) |
|---|---|
| Identity | `name` (text), `id` (text, slug-validated, uniqueness check), `category` (datalist: `NWP Synoptic / Surface Observations / Upper-Air Observations / TlogP Observation` + free text), `hasLevel` (checkbox) → enables `defaultLevel` (number select: 1000/925/850/700/500/400/300/250/200/150/100/70/50/30/20/10/null), `isObservation` (checkbox) |
| Layers table | Rows: `color-dot + name + type chip + model/element + ⧉ + 👁 + ✕`. `+ Add layer` dropdown by type (blank defaults per type). `⧉` copies the layer (§3.2.1); `Copy to ▾` submenu copies it into another group. Click row → expands inline layer form (reuse drawer markup, §5). Reorder via ↑/↓ buttons (drag is P2). |
| Layer form — common | `id` (text), `name` (text), `type` (select `contour/wind/station/tlogp`), `model` (select + free text), `element` (select per-type option lists copied from `renderStationDrawerHTML`/`renderWindDrawerHTML` element lists), `level` (number|null), `path` (text, only for station/tlogp), `stationId/defaultStation/parcelLevel` (only tlogp), `visible` (checkbox, default true), `removable` (checkbox) |
| Layer form — `contour` render | **Reuse** `layerRowView.js` contour drawer widgets verbatim, with one upgrade: `lineColor` uses the shared swatch picker (§3.6) instead of the bare `<input type="color">`: `showFill + opacity slider`, `showLine + lineColor(swatch+custom) + lineWidth`, `boldValues + boldLineWidth`, `interval Start/Span/End + Auto` (existing `contourLevels.js` helpers), `labelSize`, `smooth`, `showRaster`, palette select (`— Built-in default —` + `populatePaletteSelect` by element category), `colormap` (grouped select: built-in/recommended/draft-custom, §3.6, + `palette:...` note), `showWind/showBarbs` (if wind-related), `derivedFrom` (select among sibling station-layer ids, empty = none) |
| Layer form — `wind` render | `showWind/showBarbs/showRaster` checkboxes + `colormap` grouped select (§3.6) + `palettePath` picker |
| Layer form — `station` render | Checkbox grid (`showTemp/showDewpoint/showDTD/showPressure/showWind/showCloud/showWeather/showTendency/showVisibility/showRain6/showStreamlines`) + filter-rules section (reuse `renderStationFilterSection`); station plots use fixed WMO symbology colors (no free color fields — out of scope) |
| Layer form — `tlogp` render/config | `stationId`, `parcelLevel` select, curve toggles |

Empty states: no presets → "Create your first preset" CTA; preset with 0 layers → warning banner (matches `loadPresetGroups` requirement `id + layers` array, `presets.js:60`).

#### 3.2.1 Copy group / Copy layer (create-by-copy)

Copy is the primary creation path for variants (e.g. "500hPa composite → 700hPa test", "HGT lines → thick-red HGT"). Both are draft-only until Save — no POST, no live-apply until the existing Save flow (§7.3).

- **Copy group (sidebar `⧉` + detail header `⧉ Copy group`):** deep-clones the whole preset (`structuredClone`) and appends it directly below the source. New `id` = `{sourceId}-copy`, uniquified with `-2, -3…` against all preset ids; new `name` = `{source} (Copy)`. Layer `id`s inside the copy are kept verbatim (they only need uniqueness *within* a preset, §4), so intra-group `derivedFrom` references stay valid with zero rewriting. After copy: select the new group, scroll it into view, focus its `name` field for immediate rename, mark dirty, msg `Copied "X" → "Y" (N layers)`.
- **Copy layer (row `⧉`, same group):** deep-clones the layer and inserts it directly below the source. New `id` = `{sourceId}-copy` uniquified *within the target preset*; new `name` = `{source} (Copy)`; `derivedFrom` kept as-is (still a valid sibling ref). If the source is a station layer that other layers derive from, existing derived layers keep pointing at the **original** (copy never retargets siblings — documented in the row tooltip). After copy: expand + scroll to the new row, focus its `name`/`id` field.
- **Copy layer to another group (row `Copy to ▾` submenu listing other presets):** same clone inserted at the end of the target group with id uniquified there. `derivedFrom` is kept **only if** a sibling with that id exists in the target; otherwise it is cleared and a non-blocking warning is shown (`derivedFrom "X" not found in "Target" — cleared`), since `derivedFrom` must resolve within the same preset (`configSchema.js` rule, §6). `level`/`path`/`stationId` travel verbatim; target preset's `hasLevel` mismatch is a warning, not a rewrite.
- **ID/name rules:** copy never asks for an id upfront (fast path); collisions are impossible by construction (auto-uniquify loop), and any later manual rename is governed by the existing uniqueness validation (§6, Save-gated). `visible` is copied verbatim; `removable` is forced `true` on copies so a cloned base layer can always be deleted.
- **Colormaps travel by reference:** layer `render.colormap` / `colormapByLevel` values are copied as strings; no colormap is duplicated with the layer (use Colormaps tab `⧉` if a variant ramp is needed).

#### 3.2.2 Divider — pure horizontal line between groups (create / move / delete)

A divider is a **visual-only separator** in the `presets[]` order — rendered as a horizontal rule between group rows in the Config sidebar and as a disabled `───` option in every preset dropdown (navbar + per-window selects). It carries no layers, is never loadable, never appears in the detail form, and never triggers data fetch. Scope is deliberately narrow: dividers live **only between preset groups** (top-level `presets[]` order). Dividers between layers inside a group or between colormaps are out of scope.

- **Data shape (the §2 schema exception):** `{ "id": "div-nwp", "divider": true, "label": "NWP" }`. `id` required (slug, unique across groups + dividers); `divider: true` required (single-flag discriminator — chosen over `type: "divider"` to avoid colliding with layer `type` values); `label` optional string (≤ 40 chars, may be `""`/absent for a bare line). A divider **must not** have `layers`, `hasLevel`, `render`, or any loadable keys (§6 errors on them). Example with a labeled and a bare divider:
  ```json
  { "id": "composite-500hpa", "name": "500hPa Composite", "layers": [ … ] },
  { "id": "div-obs", "divider": true, "label": "Observations" },
  { "id": "composite-surface", "name": "Surface Synoptic", "layers": [ … ] },
  { "id": "div-bare-1", "divider": true },
  ```
- **Create:** footer `+ Divider` appends a bare divider at the end (auto id `div-1, div-2…`); per-row hover menu offers `Insert divider above / below`. New divider is selected (mini-form, below), scrolled into view, label input focused. Draft-only until Save.
- **Divider mini-form (replaces the preset detail pane while selected):** read-only `id` + editable `label` (text, placeholder `Section label — empty = bare line`) + live `<hr>` preview (bare vs labeled rendering) + `Delete divider` button. No other fields — a divider has nothing else to configure.
- **Move:** divider rows carry the same ↑/↓ buttons as group rows (same splice-reorder on `draft.presets`); group ↑/↓ stepping moves across dividers (order is one flat array). Drag reorder is P2 and covers dividers automatically once implemented for groups.
- **Delete:** row `✕` + mini-form button, no confirm (a divider holds no data; recovery is Cancel/Reload before Save). Deleting never touches neighboring groups.
- **Rendering contract (runtime, outside the Config tab):**
  - Sidebar (Config): `<hr>`-style row (labeled: `── label ──`); click selects mini-form; never shows layer count, badges, copy, or eye.
  - Dropdowns (`navBar.js` init/refresh, `windowFocus.js:refreshPresetControls`, `windowPanels.js` template): divider → `<option value="" disabled>───── label ─────</option>` (bare: `────────`). Disabled ⇒ unselectable, `Load Data` stays disabled (`updateLoadBtnState` already gates on empty value), keyboard skip is native to disabled options. If a saved `currentGroupId` ever resolves to a divider (hand-edited JSON), treat as `""` (no selection) — never pass a divider to `loadPresetGroup` (its `!group.layers` guard already returns, but callers must not get that far).
  - Search/filter in the sidebar matches divider labels (so typing "obs" surfaces the section header); a filter that hides all groups still shows matching dividers.
- **Copy:** divider rows offer no `⧉` (nothing to vary — `+ Divider` is one click and already unique). Group copy (§3.2.1) never includes adjacent dividers (only the group's own layers travel).

### 3.3 Colormaps sub-tab

**Left sidebar:** list of colormap names with mini gradient swatch (via existing `getCSSGradient(element, name)`), stop count, usage count ("used by N layers" — computed by scanning draft presets' `render.colormap` + `colormapByLevel`). Actions: select, duplicate, rename (inline), delete (blocked with explanation if in use — offer "replace usages with …" select). Footer: `+ New colormap` (from element template: TMP/HGT/RH/WIND/RAIN/DTD/VOR/DIV defaults in `colormaps.js:3-88`).

**Detail editor (selected colormap):**
1. Gradient preview bar (full-width, 28px, `getCSSGradient`) + min/max labels.
2. Stop table: rows `[# val (number)] [# color (swatch picker §3.6 + alpha 0–255 slider+number)] [✕]`, sorted by `val` ascending (auto-sort on blur, matching `setColormaps` sort). `+ Add stop` appends midpoint-interpolated stop. Live preview updates on every input (no save needed to preview). Stop color cells use the **same swatch-picker component** as `lineColor` so stop authoring and line authoring share muscle memory.
3. Helpers: `Sort`, `Reverse`, `Sample data range` hint (e.g. TMP −40…40, HGT 0…17000 — static hint text from `getElementLevels` knowledge, not auto-applied) + `Apply recommended ramp ▾` dropdown (20 built-in options, §3.6 — one click replaces stops, e.g. reset a mangled TMP back to default).
4. Field errors inline: non-finite `val`, duplicate `val`, channel out of 0–255, `< 2 stops` (mirrors `setColormaps` throw messages, `colormaps.js:101-113`).

### 3.4 Settings sub-tab

Single form, two cards:
- **Basemap** (`draft.basemap`): `scheme` (3 radio cards 🌙/☀️/🌐 reusing `layerRowView.js:353-357` options), `projection` (select mercator/globe/vertical-perspective), toggles `showGraticule/showWorld/showProvinces/showCities` (checkboxes, same labels as basemap drawer).
- **Performance** (`draft.performance.maxEffectiveCells`): number input + range slider (1,000–4,000,000, default 50,000) with clamp note; reuse `DEFAULT_/MIN_/MAX_MAX_EFFECTIVE_CELLS` + `getMaxEffectiveCells` from `presets.js:14-41` for display of effective value.

### 3.5 JSON sub-tab (advanced fallback)

Keep the current textarea editor **as-is** (load via `/api/config` → `formatCompactJSON`, Tab-key indent, syntax badge, `btn-config-format`) but rewire it to the draft: entering the tab serializes draft → textarea; leaving with valid JSON parses back into draft (semantic validation applied, errors listed, abort on error with option to stay). This preserves power-user workflows and guarantees no capability regression.

### 3.6 Recommended colors & colormaps library (friendly pickers)

Color is edited in three places — contour `render.lineColor`, colormap stop `color`, and the layer-list `color` dot (auto-synced from `lineColor`, `layerRowBindings.js:105-107`) — so all three share **one swatch library + one picker component**. Colormap *ramps* (whole gradients) get a parallel 20-item built-in gallery. Both live in a single new data module so recommendations stay consistent and testable.

**3.6.1 `MET_LINE_COLORS` — 20 recommended line/swatch colors.**
Single exported array in `colorPresets.js`, each `{ hex, name, use }`. Composition (dark-theme legible on `#0d1117`, colorblind-safer where possible, distinct hues for overlay stacking):
- Canonical 6 (must keep exact hexes — they are the codebase conventions in `layerDefaults.js:169-181`, `derivedContourActions.js:43`, `overlayKinematics.js:54`): `#58a6ff` HGT blue, `#f85149` TMP red, `#e3b341` DTD gold, `#c678dd` VOR purple, `#56d4dd` DIV cyan, `#ffffff` white default.
- Synoptic 8: SLP navy `#1f6feb`, isoband edge `#79c0ff`, freezing isotherm `#39c5bb`, subtropical-ridge yellow `#f2cc60`, jet-stream orange `#f0883e`, rain green `#56d364`, calm gray `#8b949e`, alert red `#ff7b72`.
- Extended 6: magenta `#ff9ece`, lime `#b8e62e`, teal dark `#0e9b8b`, violet deep `#8256d0`, sand `#d2a679`, ice `#b3f0ff`.
Each swatch shows `title="{name} ({hex}) — {use}"`, e.g. `HGT blue (#58a6ff) — height contours`.

**3.6.2 `BUILTIN_COLORMAP_PRESETS` — 20 recommended ramps.**
The 8 existing inline ramps are items 1–8 verbatim (TMP/HGT/RH/WIND/RAIN/DTD/VOR/DIV stops from `colormaps.js:3-88` + `config.json:13-302`, referenced — not duplicated — as the reset templates). 12 curated additions fill the gaps operators currently hand-build or fetch via XML palettes (`paletteLoader.js:4-17` categories):
- `SLP-blue` (PRS_HGT family, 1010-centered neutral), `TMP-extreme` (−60…45 extended isotherm), `RAIN-log` (0.1…250 log-spaced TVA palette), `VIS-gray` (fog white→amber), `WIND-jet` (0…60 jet emphasis), `RH-night` (dark-bg variant), `HGT-dam` (500…600 dam sounding variant), `CAPE-green` (stability family), `RADAR-dBZ` (−10…75 dBZ), `TD-dewpoint` (teal moisture), plus `GRAY-print` (grayscale for print) and `OCEAN-depth` (blues for SST/satellite backdrop).
Each preset: `{ key, label, family, elementHint, stops: [{val, color}] }`. Stops are static data (copy the XML-derived representative stops at plan time; runtime XML stays the live source for `palettePath` — presets never write `palette:*` keys).

**3.6.3 Picker UX (same component in both sub-tabs).**
- `lineColor` field = native `<input type="color">` (kept for arbitrary colors, existing binding `layerRowBindings.js:135` unchanged) **+** 20-swatch strip below it (one click sets hex, updates dot preview live) **+** "recent" row (last 8 customs, `localStorage: micaps-recent-colors`) **+** per-element recommendation hint (`HGT → #58a6ff` chip; click to apply). Invalid/empty → fall back to element default (`layerDefaults.js` table), never blank.
- Stop color cell = identical swatch strip in mini form (swatch grid + alpha slider kept separate since native picker has no alpha). Alpha (0–255) stays a slider+number; swatches set RGB only and preserve current alpha.
- Colormap selects (layer `render.colormap`, `colormapByLevel` table, group defaults) become **grouped dropdowns**: `Built-in (8) / Recommended (12) / This config (draft customs) / XML palette (via palettePath picker)`; each option renders a mini gradient swatch (reuse `getCSSGradient`). Colormap detail header adds `Apply recommended ramp ▾` with the same 20.
- Layer dot (`layer.color`) is **not** independently editable — it mirrors `lineColor` (current sync behavior kept); the plan's swatch UI therefore covers it for free.

## 4. Data model & editing semantics

```js
// Draft lifecycle (all in new configDraft.js, ~120 lines)
draft = structuredClone(CURRENT_CONFIG)   // at openConfigTab
errors = validateConfig(draft)            // { presetErrors: Map, colormapErrors: Map, globalErrors: [] }
isDirty = serialize(draft) !== lastSavedText
// Save: if errors empty → savePresetConfig(draft) → loadPresetGroups → refreshPresetControls + refreshNavBarPresets + onConfigChangedCallback (existing save handler, configEditor.js:325-353)
```

- **No schema change.** Draft shape is exactly `config.json` shape (`{ basemap, performance, colormaps, presets[] }`). New UI only writes keys the loaders already understand (`render.*`, `colormapByLevel`, `interval/levels`, `palettePath`, `derivedFrom`, `visible`, `removable`, `level`, `path`, `stationId`, `parcelLevel`, `config` for tlogp).
- **IDs:** preset `id` and layer `id` uniqueness enforced within their scope (preset ids global; layer ids per-preset with cross-preset warning only). Renaming a preset id updates nothing else (ids are keys, `derivedFrom` points at layer ids *within* the same preset — offer auto-fix when a referenced layer id is renamed/deleted).
- **Copy semantics (pure helpers, §5):** `clonePresetGroup(draft, sourceId)` / `cloneLayer(draft, presetId, layerId, targetPresetId?)` in `formState.js` — deep clone via `structuredClone`, auto-uniquify (`-copy`, `-copy-2…`), `name + " (Copy)"`, copies forced `removable: true`; cross-group layer copy clears dangling `derivedFrom` with a warning. Helpers return `{ ok, newId, warning? }` / `{ ok: false, error }` for missing source; they never touch `CURRENT_CONFIG` or POST — Save flow (§7.3) is unchanged.
- **Divider semantics (§3.2.2):** dividers are ordered entries of `draft.presets` interleaved with groups; `formState.js` gains `insertDivider(draft, index?)` / `moveEntry(draft, from, to)` (shared by groups + dividers) / `deleteDivider(draft, id)` — all pure, index-based, order-preserving for everything else. Loader contract (`presets.js` edit, §5): `loadPresetGroups` accepts `{ id, divider: true }` entries (no `layers` required), keeps them in order in `CURRENT_CONFIG.presets` for round-trip save, and exposes `isDivider(entry)` + `getLoadableGroups()` (dividers filtered) — all data paths (`presetLoader` self-heal loop, `autoSaveLayerConfig` preset scan, `upsert/removeDerivedLayerToPreset` group lookup) skip dividers via the helper. `PRESET_GROUPS` retains full order (dividers included) so dropdowns render separators in place; anything that *loads* (`loadPresetGroup`, navbar `find`, window focus lookup) resolves through loadable groups only.
- **`colormapByLevel` editing:** collapsed "per-level overrides" details row in layer form: table `{level → colormap select}` + add/remove. Group-level `colormap/colormapByLevel` (legacy, `Architecture.md:284`) exposed as collapsed "group defaults" section to avoid clutter.
- **Serialization:** always save via `formatCompactJSON` (keeps `color` arrays single-line, `config.test.js:25-45` invariant intact).

## 5. Architecture — files (all < 600 lines)

Reuse, don't fork: import drawer HTML builders, validators, and gradient helpers where possible.

| # | File | Purpose | Notes |
|---|---|---|---|
| 1 | `client/src/ui/config/formState.js` (~200) | Draft clone, dirty check, error map store, pub/sub for sub-tabs + pure `clonePresetGroup` / `cloneLayer` copy helpers (§3.2.1) + divider helpers `insertDivider` / `moveEntry` / `deleteDivider` (§3.2.2) | Pure, unit-testable; no DOM |
| 2 | `client/src/ui/config/configSchema.js` (~230) | `validateConfig(draft)` → field errors; mirrors `setColormaps` rules + `loadPresetGroups` group shape + id uniqueness + color-channel ranges + `maxEffectiveCells` clamp + divider rules (§3.2.2/§6) | Pure, unit-testable; single source of truth for Save-gating |
| 3 | `client/src/ui/config/colorPresets.js` (~200) | `MET_LINE_COLORS[20]` + `BUILTIN_COLORMAP_PRESETS[20]` static data + `getRecommendedLineColor(element)`, `findPreset(key)`, recent-colors (`localStorage`) helpers | Pure data + tiny helpers; imported by 4–6; unit-tested |
| 4 | `client/src/ui/config/swatchPicker.js` (~180) | Framework-free swatch-strip renderer `renderSwatchStrip(container, {value, onPick, showRecent, hint})` used by lineColor fields AND stop color cells | DOM-only, no config knowledge; unit-tested via mock DOM like `keyboard_shortcuts.test.js` |
| 5 | `client/src/ui/config/presetForm.js` (~480) | Presets sidebar (groups + divider `<hr>` rows + mini-form, §3.2.2) + preset detail + layer table + layer render forms (imports contour/station/tlogp row HTML from `layerRowView.js` where feasible, adapts `name` attributes to draft paths; lineColor + colormap selects delegate to 3–4) | DOM only; emits `draft-mutated` events |
| 6 | `client/src/ui/config/colormapForm.js` (~380) | Colormap sidebar + gradient preview + stop table (stop colors via 4) + `Apply recommended ramp ▾` + add/dup/rename/delete + usage scan | Uses `getCSSGradient`, `getColormap`; never calls `setColormaps` on draft (only on Save) |
| 7 | `client/src/ui/config/settingsForm.js` (~150) | Basemap + performance form | Uses `DEFAULT/MIN/MAX_MAX_EFFECTIVE_CELLS` |
| 8 | `client/src/ui/config/jsonFallback.js` (~120) | Existing textarea logic extracted from `configEditor.js:222-306` (load/format/Tab/validate) rewired to draft | Keeps current behavior for power users |
| 9 | `client/src/ui/configEditor.js` (edit, stays < 600) | Becomes thin shell: tab pill/panel lifecycle (keep `open/activate/closeConfigTab`, beforeunload, Reload/Cancel/Save handlers), sub-tab bar, mounts 1–8, owns Save gating | Delete inline textarea template; add sub-tab container + CSS hooks |
| 10 | `client/src/tabs.css` (append ~270) | Sidebar + form + stop-table + swatch/swatch-strip/gradient-option + divider rows (`<hr>` + labeled `── x ──`) + responsive (drawer ≥ 900px two-col, < 520px single-col stack; reuse `--bg-*`/`--border-color` vars, 11–12px form language) | Fix `ui-review3` notes: `min-width:0/min-height:0` on flex children, `max-height+overflow` on msg bar |
| 11 | `client/src/config/presets.js` (edit, +~30) | Relax `loadPresetGroups` validation to accept divider entries; add `isDivider(entry)` + `getLoadableGroups()`; `autoSave`/`upsert`/`removeDerived` skip dividers | No behavior change when zero dividers exist |
| 12 | Preset dropdown renderers (edit, +~10 each) | `navBar.js` (init options, `refreshNavBarPresets`, change/load `find`), `windowFocus.js:refreshPresetControls`, `windowPanels.js` template: dividers → disabled `<option>`, selection/load paths resolve loadable groups only | Shared `isDivider` import; no behavior change when zero dividers exist |

**Wiring:** `bindEditorEvents` → replaced by sub-tab mount + single Save handler (existing `savePresetConfig → loadPresetGroups → refreshPresetControls/refreshNavBarPresets → onConfigChangedCallback` sequence kept verbatim). `populatePaletteSelect` reused inside layer forms (needs a `configDrawer`-like container — pass the layer form element). `autoSaveLayerConfig` is **not** used by the Config UI (explicit Save only; avoids 400ms surprise POSTs mid-edit). Swatch picks write plain hex/`[r,g,b,a]` values into the draft (no new schema keys); `colorPresets.js` is display-only data, so old clients ignore it safely.

## 6. Validation rules (shared with tests)

Client-side only, implemented once in `configSchema.js`:
- Preset: `id` non-empty slug (`/^[a-z0-9][a-z0-9-_]*$/i`), unique; `name` non-empty; `layers` is array (may be empty with warning); `hasLevel` boolean; `defaultLevel` null or finite number when `hasLevel`, else must be null.
- Divider: `id` non-empty slug, unique across **groups + dividers combined** (shared namespace); `divider === true` required; `label` optional string ≤ 40 chars; `layers`/`hasLevel`/`defaultLevel`/`render`/`derivedFrom` present → error (`Divider "X" must not have layers — remove the key`); non-object or missing `id` → error. Consecutive dividers, leading divider (index 0), or trailing divider → **warning only** (never Save-gates). `name` on a divider → warning (`dividers use label, not name`) and ignored by renderers.
- Layer: `id` non-empty (unique within preset); `type ∈ {contour, wind, station, tlogp, pmtiles?}` (pmtiles rejected in presets with message); `model/element` non-empty; `render` object; `derivedFrom` (if set) must match a sibling layer id; `boldValues` numeric array; `interval {start,step,end}` validated by existing `validateInterval`/`buildLevelsFromInterval` (`contourLevels.js`); `levels` (if set) numeric array length ≥ 2.
- Colormap: same rules as `setColormaps` (`colormaps.js:101-113`) + unique sorted `val` (auto-sort, flag duplicates); ≥ 2 stops; channels 0–255 ints.
- Color friendliness (non-blocking warnings, never Save-gates): `lineColor` should be `#rrggbb` and ideally one of `MET_LINE_COLORS` (unknown hex = hint, not error); stop colors should contrast with dark basemap (luminance check → warning only); `BUILTIN_COLORMAP_PRESETS` keys must resolve via `getColormap` in tests.
- Global: `performance.maxEffectiveCells` int within `[MIN, MAX]` (clamp + warn, per `getMaxEffectiveCells`); `basemap.scheme ∈ {light,dark,micaps}`, `projection ∈ {mercator,globe,vertical-perspective}`.

## 7. Save / Reload / Cancel / Apply flow (unchanged backbone)

1. **Open:** `GET /api/config` (fallback `config.json`) → `formatCompactJSON` → `lastSavedText` → `draft = parse`. Identical to `loadCurrentConfigIntoEditor` (`configEditor.js:222-248`).
2. **Edit:** any form input mutates draft → re-validate → badge (`✓ Valid` / `● Unsaved` / `⚠ N errors`) + msg line (`Presets: N · Colormaps: M · Layers: K` + first error).
3. **Save (gated):** if errors → focus first error, no POST. Else existing handler: `savePresetConfig(draft)` → `loadPresetGroups()` → `refreshPresetControls()` + `refreshNavBarPresets()` + `onConfigChangedCallback()` → badge `✓ Saved & Applied`, `lastSavedText = serialize(draft)`, `updateBeforeUnloadState`.
4. **Reload:** confirm-if-dirty → re-fetch → rebuild draft + re-render active sub-tab (existing confirm pattern, `configEditor.js:308-317`).
5. **Cancel/close:** confirm-if-dirty → `closeConfigTab` with prev-window restore (keep `configEditor.js:167-220` verbatim); `beforeunload` guard kept.
6. **Keyboard:** keep `keyboardShortcuts.js:14` guard — extend selector to new form inputs so map shortcuts stay suppressed while editing.

## 8. Tests

- **NEW** `client/test/config-schema.test.js` (bun:test, pure): preset id uniqueness, layer `derivedFrom` dangling ref, colormap `<2 stops / bad channel / duplicate val`, `maxEffectiveCells` clamp boundaries (1000 / 50000 / 4000000), valid full `config.json` passes. Divider cases: `{ id, divider: true }` + labeled variant pass; divider with `layers` errors; divider `id` colliding with a group id errors; consecutive/leading/trailing dividers warn (no gate); `name`-on-divider warns.
- **NEW** `client/test/config-draft.test.js`: draft clone isolation (mutating draft doesn't touch `CURRENT_CONFIG`), dirty detection, serialize round-trip through `formatCompactJSON` keeps `{ "val":…, "color": […] }` single-line form. Copy cases: `clonePresetGroup` deep-clones (mutating copy's `render` doesn't affect source), auto-uniquifies id (`x-copy`, `x-copy-2`), keeps layer ids + valid `derivedFrom`; `cloneLayer` same-group inserts below source with uniquified id and preserved `derivedFrom`; cross-group copy clears dangling `derivedFrom` with warning and uniquifies in target; missing source returns `{ ok: false }`; copies never mutate `CURRENT_CONFIG`. Divider cases: `insertDivider` appends by default / inserts at index with uniquified `div-N` id; `moveEntry` reorders groups and dividers in one flat array (others untouched); `deleteDivider` removes only the divider; divider round-trip through `formatCompactJSON` preserves order and shape.
- **NEW** `client/test/config-divider-render.test.js` (bun:test, mock DOM like `keyboard_shortcuts.test.js`): divider renders as disabled `<option>` (bare `────────`, labeled `── label ──`); selectable options contain loadable groups only; resolving a divider id as current selection yields `""`; `getLoadableGroups()` strips dividers while `PRESET_GROUPS` keeps order; `loadPresetGroups` accepts a config containing dividers (no throw) — and the existing `config.test.js:18-22` loop must be updated to skip `divider` entries.
- **NEW** `client/test/config-color-presets.test.js` (bun:test, pure + mock DOM): `MET_LINE_COLORS` has exactly 20 unique valid hexes including canonical 6 (`#58a6ff/#f85149/#e3b341/#c678dd/#56d4dd/#ffffff`); `getRecommendedLineColor('HGT'|'TMP'|'VOR'|'DIV'|'DTD')` returns the canonical mapping; every `BUILTIN_COLORMAP_PRESETS` entry has ≥ 2 valid sorted stops and passes `setColormaps` without throwing; swatch-strip `onPick` writes the picked hex into the draft field and preserves stop alpha.
- **Re-run existing:** `config.test.js` (formatting + autosave untouched; **update** the group-shape loop to `if (group.divider) continue`), `colormaps.test.js`, `derived/config-persistence.test.js`, `dtd/presets-robustness.test.js`, `ui_review2/3_fixes.test.js` (add assertions for new CSS classes + `min-height:0` invariants).
- Manual acceptance: create → copy group → rename → delete preset; add each layer type; copy layer within group + `Copy to` another group; create/move/delete divider (sidebar + dropdowns) with live order; add/sort/delete colormap stops with live gradient; invalid triple blocked; Reload/Cancel guards fire; Save applies and layer control + navbar refresh.

## 9. Implementation phases

1. **P1 — Shell + Settings + JSON fallback + divider-tolerant loader** (low risk): extract textarea logic to `jsonFallback.js`, add sub-tab bar, implement `formState.js` (incl. copy + `insertDivider`/`moveEntry`/`deleteDivider`) + `configSchema.js` (incl. divider rules) + `settingsForm.js`. Loader relaxation (`presets.js` `isDivider`/`getLoadableGroups`, autoSave/upsert skips) ships here so no later phase can persist a config the loader rejects. Save/Revert flow works; Presets/Colormaps tabs show read-only summaries. Tests: schema + draft (incl. divider cases).
2. **P2 — Color library + colormap editor**: `colorPresets.js` + `swatchPicker.js` first (both small, pure/DOM-only, independently testable), then `colormapForm.js` + gradient/swatch CSS (stop cells + `Apply recommended ramp ▾` consume them). Tests: color-presets + stop validation + gradient render.
3. **P3 — Preset & layer editor + divider UI + dropdown renderers**: `presetForm.js` (largest; split further if near 600 lines: `presetList.js` + `layerForm.js`). Reuse drawer widgets + `populatePaletteSelect` + interval helpers; lineColor fields and colormap selects consume `swatchPicker` + `colorPresets` from P2 (no new color logic here). Copy UI (`⧉` + `Copy to ▾`) calls the P1 `formState.js` clone helpers — no new data logic in P3. Divider sidebar rows + mini-form + ↑/↓ (shared `moveEntry`) and the `navBar`/`windowFocus`/`windowPanels` disabled-option rendering land here with the P1 loader already in place. Tests: derived-ref fixups, layer CRUD + copy on draft, divider render suite, swatch-pick writes `lineColor` + syncs dot.
4. **P4 — Polish**: usage counts, per-level override tables, empty states, responsive < 520px, a11y (`role=tab`, `aria-selected`, labeled inputs — follow `layerRowView.js` patterns), docs touch-up (`Architecture.md §4` one paragraph + screenshot note).

## 10. Acceptance criteria

- [ ] Zero hand-written JSON needed for: new/duplicate/rename/delete preset; add/copy/remove/reorder layer; edit any `render` toggle/color/width/bold/interval/palette/colormap; edit colormap stops; change basemap/performance.
- [ ] Copy-to-create works: `⧉` on a group creates a runnable group below the source with uniquified id and ` (Copy)` name (intra-group `derivedFrom` intact); `⧉` on a layer inserts an editable copy below the source; `Copy to ▾` into another group uniquifies the id and clears dangling `derivedFrom` with a warning; new copy is selected, scrolled into view, and dirty; Save persists copies and live-apply loads them.
- [ ] Divider create/move/delete works without JSON: `+ Divider` / `Insert above-below` adds a bare line with uniquified id; ↑/↓ reorders it among groups; `✕` deletes only the line; label edit toggles bare vs `── label ──` rendering live; navbar + per-window dropdowns show matching disabled options and never attempt data load; divider order + labels survive Save → Reload round-trip.
- [ ] Invalid states never POST: Save disabled with counted badge; first error focused on attempt.
- [ ] Valid `config.json` from disk loads with zero errors; round-trip save produces `formatCompactJSON` output (multi-line, single-line colors) and passes `config.test.js`.
- [ ] Colormap edits live-preview via gradient bar; `setColormaps` never throws on saved output.
- [ ] Friendly color: every `lineColor` field and every stop color cell shows the 20-swatch strip + native custom picker + recent-colors; picking a swatch updates the preview/dot live without typing hex; colormap selects and `Apply recommended ramp ▾` expose all 20 built-in ramps with gradient previews; per-element hint chip (`HGT → #58a6ff`) applies in one click.
- [ ] Lifecycle preserved: Reload/Cancel/close confirm when dirty; `beforeunload` fires; prev-window focus + layer-panel restore on close.
- [ ] Live-apply preserved: after Save, preset controls + navbar refresh without reload.
- [ ] All new + existing config/colormap/persistence suites green; no file exceeds 600 lines.

## 11. Risks & mitigations

- **Scope creep into layer-drawer refactor** → strictly import/reuse drawer HTML; no drawer behavior changes in Plan 1.
- **Divider UX edge cases** → consecutive/leading/trailing dividers are warnings, not errors (§6); dropdown a11y comes free from native disabled `<option>` (focus/arrow-key skip); sidebar divider rows are `<div role="separator">`, focusable, with labeled ↑/↓/✕ buttons (not icon-only).
- **`presetForm.js` size** → pre-split into list + layer-form modules if it approaches 500 lines.
- **Palette-path vs inline-colormap confusion** (`configActions.js:221-313` `palette:...` runtime keys) → editor shows both but labels clearly: `Colormap (inline)` grouped select vs `Raster Palette (XML)` picker; never writes `palette:*` keys into `config.json`.
- **Recommendation drift** (swatches diverge from code defaults) → `colorPresets.js` canonical 6 hexes are asserted equal to `layerDefaults.js`/`derivedContourActions.js` defaults in `config-color-presets.test.js`; curated 12 ramps are static snapshots (not live XML reads) so saved configs stay reproducible.
- **Large-draft performance** → draft is < 100 KB; re-validate debounced (150ms) like prefetch; gradient preview is CSS-only.

## 12. Out of scope (follow-ups)

- Visual contour-level preview on a mini map; per-fill vs per-line colormaps; XML palette authoring/upload; config version history/diff view; multi-window preset assignment matrix; server-side JSON-schema endpoint; dividers between layers or colormaps (groups-only, §3.2.2).
