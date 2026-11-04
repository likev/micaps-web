# Config Panel Redesign — Foldable Dual-Document JSON Editor (`config.json` & `colormaps.json`)

## 0. Background & Motivation

The workstation configuration has scaled to **~186 presets** (`client/config.json`, ~5,923 lines), **15 shared render profiles** (`renderProfiles`), and **40 colormaps** (`client/colormaps.json`, ~432 lines).

The current 4-subtab form-based Config UI (`PresetForm.svelte`, `LayerForm.svelte`, `ColormapForm.svelte`, `SettingsForm.svelte`, `JSONFallbackForm.svelte`) has become difficult to use at this scale:

1. **Form impedance & incomplete schema coverage**: The guided forms (`PresetForm.svelte` + `LayerForm.svelte`) only expose a fraction of the fields actually used across the ~186 presets (missing `name_en`/`name_zh`, `category_en`/`category_zh`, `renderRef`, `levels`, `path`, `policy`, `tolerance`, `offset`, `mode`, `pacemaker`, `renderProfiles`, satellite/radar/profiler/event layer options, etc.).
2. **Poor navigation at ~200 items**: Navigating a split sidebar + nested card stack for ~186 presets is slow, while the fallback `<textarea>` in `JSONFallbackForm.svelte` dumps a single un-foldable 6,000+ line string containing the *merged* runtime `CURRENT_CONFIG` (with expanded `renderProfiles` and merged `colormaps`) rather than the actual `config.json` and `colormaps.json` files on disk.
3. **File modularity violations**: `PresetForm.svelte` (867 lines) and `ColormapForm.svelte` (696 lines) exceed the repository's strict **< 600 lines** per source file rule (`README.md:18`), and legacy imperative DOM modules (`client/src/ui/config/colormapForm.js`, `colormapStops.js`) remain as dead code alongside Svelte components.

---

## 1. Design Goals

1. **Remove the legacy multi-form config components**:
   - Remove `client/src/components/config/PresetForm.svelte`
   - Remove `client/src/components/config/LayerForm.svelte`
   - Remove `client/src/components/config/ColormapForm.svelte`
   - Remove `client/src/components/config/SettingsForm.svelte`
   - Remove `client/src/components/config/JSONFallbackForm.svelte`
   - Remove unused legacy DOM modules `client/src/ui/config/colormapForm.js` and `client/src/ui/config/colormapStops.js` (migrating pure helpers `stopsToCSSGradient`, `getColormapUsageCounts`, `rewriteColormapReferences` into a small pure utility module).
2. **Edit `config.json` and `colormaps.json` directly**:
   - Provide two top-level document tabs in `#config-editor-panel`:
     - **`config.json`**: Edits the true on-disk `config.json` structure (`basemap`, `performance`, `presets` array of ~186 items, `renderProfiles` map of shared profiles, plus optional `theme`/`locale`) and saves to `POST /api/config`.
     - **`colormaps.json`**: Edits the true on-disk `colormaps.json` dictionary (`{ "TMP": [...], "WIND": [...], ... }`) and saves to `POST /api/colormaps`.
3. **Fold All Items & Unfold One Item (Document-Level Accordion) + Intra-Item Key Folding (`Fold All` / `Unfold All` / `Unfold Key`)**:
   - **Document level**: Default to **all items folded** so the entire ~186-preset `config.json` or 40-ramp `colormaps.json` is immediately scannable as compact, single-line JSON item headers. Clicking an item unfolds **only that item** (single-expand accordion mode by default, with a top-level `Fold All` button).
   - **Within the unfolded item (Item-Level Key Folding)**: When editing a single unfolded item (e.g., `presets[i]`, `basemap`, `performance`, `renderProfiles`, or a colormap), the user can control folding of nested keys inside that item via three item-level actions plus inline gutter toggles:
     - **`Fold All` (item)**: Folds all collapsible sub-keys (objects `{...}` and arrays `[...]`, such as `"layers"`, `"levels"`, `"render"`, `"config"`, `"interval"`, `"boldValues"`, `"filterRules"`) inside the item so only the item's top-level keys and compact 1-line summaries of nested keys are shown.
     - **`Unfold All` (item)**: Expands nested objects inside the item to multi-line JSON, while **keeping simple/primitive arrays (such as `levels`, `render.levels`, `boldValues`, `bounds`, `sampleTimes`) on a single line** (e.g., `[1000, 925, 850, 700, 500, 400, 300, 250, 200, 150, 100]` or `[0.1, 1, 5, 10, 50, 100]`) rather than expanding them vertically into 10+ one-number-per-line rows.
     - **`Unfold Key` (item)**: Allows the user to unfold a specific key or key path inside the item (via an **`Unfold Key ▾`** selector/pill bar in the item toolbar AND clickable inline `▶` gutter chevrons on each nested key line).
       - For **simple/primitive arrays** (`levels`, `render.levels`, `boldValues`, etc.), unfolding expands the array onto **one single horizontal line** (`"levels": [1000, 925, 850, 700, 500, 400, 300, 250, 200, 150, 100]`) so it is never split across 10+ vertical lines.
       - For **`layers`**, unfolding the `layers` key expands the array with **one compact single line per layer** (`{ "id": "rh", "type": "contour", "model": "ECMWF_HR", "element": "RH", "render": { ... } }`), and unfolding a specific layer (`layers[0]`, `layers[1]`) or nested key (`render`) expands that layer/object while keeping sibling layers and primitive arrays on single lines.
   - All unfolded lines remain directly editable as JSON with line numbers, `Tab` indentation, `Format` (`formatCompactJSON`), and quick item actions (`Duplicate`, `Insert Above/Below`, `Move ↑/↓`, `Delete`).
4. **Fast Search / Filter & Jump**:
   - Provide an instant filter bar (`Filter by id, name, category, model, element, or key...`) that filters folded JSON items in place and lets the operator click any match to unfold and edit its JSON immediately.
5. **Preserve Existing Workstation Contracts**:
   - Keep outer container `#config-editor-panel.config-editor-panel` (`role="region"`), `#btn-config-reload`, `#btn-config-save-apply`, `#btn-config-close`, `#config-editor-body`, and `#config-editor-msg`.
   - Preserve `savePresetConfig` / `loadPresetGroups` live-apply pipeline, `compactConfigForSave` / `expandRenderProfiles` round-trip semantics, `formatCompactJSON` single-line color array formatting (`{ "val": ..., "color": [r, g, b, a] }`), and `validateConfig` semantic validation (`configSchema.js`).
   - Keep every source file strictly **< 600 lines**.

---

## 2. UX & Interaction Design

### 2.1 Layout Overview (`#config-editor-panel`)

```text
┌─ .config-editor-toolbar ──────────────────────────────────────────────────────────┐
│ ⚙ Configuration Editor   [ 📄 config.json (186) ] [ 🎨 colormaps.json (40) ]     │
│ 🔍 [ Filter items (id, name, category, model...) ]  [ Fold All ] [ Raw File ▾ ]  │
│ ● Valid (Saved)                                  [ Reload ] [ Save & Apply ] [ ✕ ]│
├─ #config-editor-body ─────────────────────────────────────────────────────────────┤
│ {                                                                                 │
│   ▶ "basemap": { "projection": "mercator", "scheme": "dark", ... }      // 6 keys │
│   ▶ "performance": { "maxEffectiveCells": 50000, "prefetch": { ... } }  // 2 keys │
│   ▼ "presets": [                                // 186 items  [+ Add Preset]      │
│     001 ▶ { "id": "composite-surface", "name": "Surface Synoptic...", "layers": 3 }│
│     002 ▼ { "id": "composite-500hpa", "name": "500hPa Composite..." }             │
│           ┌─ Item Editor (presets[1]) ─ [Fold All] [Unfold All] [Unfold Key ▾] ──┐│
│           │  Keys: [layers] [layers[0]] [layers[1]] [render] [levels] [interval] ││
│           │                                           [Format] [⧉] [↑] [↓] [✕]   ││
│           ├──────────────────────────────────────────────────────────────────────┤│
│           │  1   │ {                                                             ││
│           │  2   │   "category": "NWP Synoptic",                                 ││
│           │  3   │   "defaultLevel": 500,                                        ││
│           │  4   │   "hasLevel": true,                                           ││
│           │  5   │   "id": "composite-500hpa",                                   ││
│           │  6 ▼ │   "layers": [                                                 ││
│           │  7 ▶ │     { "id": "rh", "element": "RH", ... },          // folded  ││
│           │  8 ▼ │     {                                                         ││
│           │  9   │       "element": "HGT",                                       ││
│           │ 10   │       "id": "hgt",                                            ││
│           │ 11 ▼ │       "render": {                                             ││
│           │ 12   │         "boldValues": [5880, 588],                            ││
│           │ 13   │         "interval": { "start": 500, "step": 4, "end": 600 },  ││
│           │ 14   │         "levels": [500, 504, 508, 512, 516, 520, ..., 600],   ││
│           │ 15   │         "lineColor": "#917373"                                ││
│           │ 16   │       },                                                      ││
│           │ 17   │       "type": "contour"                                       ││
│           │ 18   │     }                                                         ││
│           │ 19   │   ],                                                          ││
│           │ 20   │   "levels": [1000, 925, 850, 700, 500, 400, 300, 250, 200],   ││
│           │ 21   │   "name": "500hPa Composite (HGT + RH + WIND)"                ││
│           │ 22   │ }                                                             ││
│           └──────────────────────────────────────────────────────────────────────┘│
│     003 ▶ { "id": "composite-tlogp", "name": "Sounding T-lnP Profile", "layers": 2}│
│     ...                                                                           │
│   ],                                                                              │
│   ▶ "renderProfiles": { "contour-1", "contour-2", ... }                 // 15 keys│
│ }                                                                                 │
├─ #config-editor-msg ──────────────────────────────────────────────────────────────┤
│ Ready • config.json: 186 presets, 15 renderProfiles | colormaps.json: 40 ramps    │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Folding & Unfolding Behavior ("Fold All" + "Unfold One")

1. **Accordion Single-Unfold Rule**:
   - Each top-level block or array element is represented by a `FoldableJsonItem` row with a stable item path:
     - In **`config.json`**:
       - `"basemap"` (object block)
       - `"performance"` (object block)
       - `"theme"` / `"locale"` (optional top-level scalar/object settings block)
       - `"presets[0]"` .. `"presets[N-1]"` (each preset or divider item in `presets[]` is an independent foldable item; the `"presets"` section header itself can also be collapsed/expanded)
       - `"renderProfiles.<profileKey>"` (each shared profile under `renderProfiles` is an independent foldable item, or the entire `"renderProfiles"` block can be folded/unfolded)
     - In **`colormaps.json`**:
       - `"colormaps.<name>"` (each of the 40 colormap entries `"TMP"`, `"WIND"`, `"RH"`, etc. is an independent foldable item)
   - **Unfold One Item**: Clicking any folded row `▶` sets `unfoldedItemPath = itemPath`, automatically folding whichever item was previously open. Clicking the active row's `▼` header folds it back (`unfoldedItemPath = null`).
   - **Fold All button (`#btn-config-fold-all`)**: Sets `unfoldedItemPath = null` (and collapses any open sub-sections), returning the view to a clean, compact list of folded one-line JSON summaries.
   - **Keyboard Navigation**:
     - `↑` / `↓` on folded rows moves focus between items; `Enter` or `Space` unfolds the focused item and focuses its JSON editor; `Escape` inside an unfolded item editor folds it and returns focus to its summary row.

### 2.3 Folded Summary Line Representation

- **`config.json` → `presets[i]` folded row**:
  - Displays index `[001]`, expand chevron `▶`, compact JSON preview `{ "id": "...", "name": "...", "name_zh": "..." }`, plus right-aligned metadata badges:
    - Category pill (`Surface Observations`, `ECMWF_HR`, `Satellite Remote Sensing`, etc.)
    - Level badge (`500 hPa`, `C012`, `3000 m`, or `SFC`)
    - Layer count badge (`3 layers`)
    - Error badge (`⚠ Syntax/Schema Error`) if this item has validation issues
  - Divider entries (`{ "id": "div-...", "divider": true, "label": "..." }`) render as a distinct one-line JSON divider summary (`▶ { "id": "div-1", "divider": true, "label": "..." } ─────`) that also unfolds into its raw JSON object when clicked.
- **`colormaps.json` → `<KEY>` folded row**:
  - Displays expand chevron `▶`, `"KEY": [ ... ]`, stop count & value range badge (`11 stops • -40 .. 40`), usage count badge (`used by 14 layers`), and an inline CSS color-ramp gradient preview bar (`stopsToCSSGradient(stops)`).
  - When unfolded, the editor shows the compact-formatted JSON array of stops:
    ```json
    [
      { "val": -40, "color": [130, 20, 160, 255] },
      { "val": -30, "color": [40, 50, 180, 255] }
    ]
    ```
    Alongside a live-updating gradient preview strip at the top of the unfolded block so operators can see color changes immediately as they edit `[r, g, b, a]` numbers or pick from the optional inline color swatch helper.

### 2.4 Unfolded Item JSON Editor & Intra-Item Key Folding (`Fold All` / `Unfold All` / `Unfold Key`)

When a single item is unfolded for editing, the operator is editing that item's JSON directly while having full control over nested key folding inside that item:

1. **Intra-Item Folding Controls (in the Unfolded Item Header)**:
   - **`Fold All` (`btn-item-fold-all`)**: Folds every nested collapsible key/block inside the item (all child objects `{...}` and arrays `[...]` at depth ≥ 1, such as `"layers"`, `"levels"`, `"config"`, `"render"`, `"interval"`, `"boldValues"`, `"filterRules"`, `"prefetch"`). Only the item's top-level keys remain visible, with each nested object/array collapsed onto a single compact summary line (`▶ "layers": [ /* 3 items */ ],`).
   - **`Unfold All` (`btn-item-unfold-all`)**: Expands all nested keys, objects, and arrays inside the item to full multi-line formatted JSON.
   - **`Unfold Key` (`sel-item-unfold-key` dropdown + quick key chips + gutter `▶`/`▼` chevrons)**:
     - Dynamically lists all collapsible keys and paths present inside the currently unfolded item:
       - Top-level keys & indexed paths (e.g., `layers`, `layers[0] (rh)`, `layers[1] (hgt)`, `levels`)
       - Nested key names across the item (e.g., `render`, `config`, `interval`, `boldValues`, `filterRules`, `colormapByLevel`, `prefetch`)
     - Selecting a key or path from **`Unfold Key`** (or clicking its quick key chip):
       - **Folds sibling sub-trees** and **unfolds the target key** (automatically unfolding its ancestor path chain if nested — e.g., choosing `render` unfolds `layers`, `layers[*]`, and `layers[*].render` while keeping `levels` or `config` folded; choosing `layers[1]` unfolds `layers` and `layers[1]` while folding `layers[0]` and `layers[2]`).
     - Clicking any inline gutter chevron `▶` / `▼` next to a key toggles that specific sub-block folded/unfolded in place without closing other open keys in the item.

2. **Single-Line Simple Array & Shallow Layer Formatting (`formatItemWithFoldedKeys(itemObj, foldedKeyPaths)`)**:
   - **Primitive / Simple Arrays Always Expand to One Line**:
     - Any array of primitive values (`number | string | boolean | null` — such as preset `levels`, `render.levels`, `render.boldValues`, `bounds`, `sampleTimes`, and `color`) is **always formatted onto a single horizontal line** when unfolded (e.g., `"levels": [1000, 925, 850, 700, 500, 400, 300, 250, 200, 150, 100]` or `"levels": [0.1, 1, 5, 10, 50, 100]`), **never** expanded into 10+ vertical lines with one number per line.
     - Small flat scalar objects such as `"interval": { "start": 500, "step": 4, "end": 600 }` and colormap stop objects `{ "val": -40, "color": [130, 20, 160, 255] }` also stay on a single line.
   - **Shallow 1-Line-Per-Element Unfolding for `layers` (and `filterRules`)**:
     - When `layers` is folded, it sits on one line: `"layers": [ { "id": "rh", ... }, { "id": "hgt", ... } ]`.
     - When the user unfolds the `layers` key (`Unfold Key: layers`), `layers` expands so that **each layer element `layers[i]` is formatted on a single line** (unless `layers[i]` itself or `render` is explicitly unfolded):
       ```json
       "layers": [
         { "id": "rh", "name": "Relative Humidity (Fills)", "type": "contour", "model": "ECMWF_HR", "element": "RH", "renderRef": "contour-7", "render": { "colormap": "RH", "opacity": 0.55, "showFill": true, "showLine": false } },
         { "id": "hgt", "name": "Geopotential Height (Lines)", "type": "contour", "model": "ECMWF_HR", "element": "HGT", "renderRef": "contour-1", "render": { "boldValues": [5880, 588], "levels": [500, 504, 508, 512, 516, 520, 524, 528, 532, 536, 540, 544, 548, 552, 556, 560, 564, 568, 572, 576, 580, 584, 588, 592, 596, 600], "lineColor": "#917373" } }
       ]
       ```
     - When the user unfolds a specific layer (`layers[0]`, `layers[1]`) or clicks `Unfold Key: render` or `Unfold All`, that layer's object keys expand multi-line while its inner simple arrays (`levels`, `boldValues`) and `interval` still remain on a single line each.
   - Because both folded and unfolded keys are valid JSON, the user can edit any value directly in the JSON text, and switching between `Fold All`, `Unfold All`, and `Unfold Key(k)` parses the current item JSON and re-formats it with the requested key fold set without losing any unsaved edits.

3. **Immediate Scoped Validation**:
   - **Syntax check**: Parsing happens on `input` strictly for the unfolded item's JSON text. If invalid JSON is typed (e.g., trailing comma), an inline error banner appears at the bottom of that item with the exact line/column relative to that item, and the item is marked invalid (blocking `Save & Apply` and disabling re-fold until fixed) without corrupting the rest of the document.
   - **Schema check**: Once the item parses as valid JSON, it updates the in-memory draft and runs `validateConfig` (`configSchema.js`), surfacing any semantic errors (duplicate preset `id`, invalid `derivedFrom`, `< 2` colormap stops, channel outside `0..255`, missing `renderRef` target) directly on the item and in the toolbar status badge.

4. **Quick Item Actions (inside the unfolded header)**:
   - `Fold All` / `Unfold All` / `Unfold Key ▾` (intra-item key folding controls).
   - `Format` (`{}`): Re-applies `formatItemWithFoldedKeys` / `formatCompactJSON` on the unfolded item.
   - `Duplicate` (`⧉`): Clones the preset (`clonePresetGroup`) or colormap (`KEY_COPY`) immediately below the current item and unfolds the new clone.
   - `Move ↑` / `Move ↓`: Reorders the preset in `presets[]`.
   - `Delete` (`✕`): Removes the preset or colormap (with usage warning if a colormap is referenced by layers).
   - For `colormaps.json` items: also shows the rename key input + live CSS gradient bar so renaming or editing stops is seamless.

### 2.5 Full Raw Document Mode Toggle (`Raw File` view)

- While the **Folded Item JSON View** is the default (99% workflow), a toggle button in the toolbar (`View: Folded Items | Raw JSON`) allows switching the active tab (`config.json` or `colormaps.json`) to a full-document raw JSON editor for bulk search-and-replace or full-file copy/paste.
- Switching back to `Folded Items` parses the full JSON and folds all items (or keeps the selected item unfolded).

---

## 3. Data Model & Direct File Editing Semantics

### 3.1 Separating `config.json` and `colormaps.json` Drafts

Currently, `loadPresetGroups()` in `client/src/config/presets.js` merges `colormaps.json` into `CURRENT_CONFIG.colormaps` and expands `renderProfiles` in place on `CURRENT_CONFIG.presets`.

To edit `config.json` and `colormaps.json` **directly and faithfully**:
1. **`rawConfigDoc` (represents `client/config.json`)**:
   - Produced via `compactConfigForSave(CURRENT_CONFIG)` (or fetched from `/api/config`), containing:
     - `basemap`
     - `performance`
     - `presets` (with `renderRef` and compact `render` overrides preserved as stored in `config.json`)
     - `renderProfiles`
     - Optional `theme` / `locale`
   - Never embeds `colormaps` (matching test invariant `config.json no longer embeds colormaps` in `client/test/config-render-profiles.test.js:93`).
2. **`colormapsDoc` (represents `client/colormaps.json`)**:
   - Dictionary of `{ [colormapName]: [{ val, color: [r, g, b, a] }, ...] }` loaded from `colormaps.json` / `/api/colormaps` (or `CURRENT_CONFIG.colormaps`).
3. **Unified State Store (`formState.js` + `jsonFoldState.js`)**:
   - Tracks both `configDraft` (`config.json` object) and `colormapsDraft` (`colormaps.json` object), plus:
     - **Document-level folding**:
       - `activeDocTab`: `"config"` (`config.json`) | `"colormaps"` (`colormaps.json`)
       - `unfoldedItemPath`: `string | null` (e.g., `"presets.0"`, `"basemap"`, `"performance"`, `"renderProfiles.contour-1"`, `"colormaps.TMP"` — defaults to `null` so all items start folded!)
       - `foldAll()` / `unfoldItem(path)` / `toggleItem(path)` methods enforcing the document-level "fold all / unfold one" behavior.
     - **Intra-item key folding (for the currently unfolded item)**:
       - `itemFoldedKeyPaths`: `Set<string>` tracking which relative sub-paths inside the active item (e.g., `"layers"`, `"layers[0]"`, `"layers[1].render"`, `"layers[1].render.levels"`, `"levels"`) are currently folded.
       - `collectItemCollapsibleKeys(itemVal)`: traverses the item's JSON value and returns all collapsible child keys/paths (`{ path, keyName, depth, kind: "object" | "array", count, label }`).
       - `foldAllItemKeys(itemVal)`: populates `itemFoldedKeyPaths` with all collapsible sub-paths inside the item.
       - `unfoldAllItemKeys()`: clears `itemFoldedKeyPaths` so all keys in the item are expanded.
       - `unfoldItemKey(itemVal, targetKeyOrPath)`: folds all collapsible sub-paths *except* matching `targetKeyOrPath` (match by exact relative path like `"layers[1].render"` or by key name like `"render"` / `"layers"` / `"levels"`), automatically removing ancestor paths of the matched node(s) from `itemFoldedKeyPaths` so the target key is visible and expanded.
       - `toggleItemKeyPath(itemVal, path)`: toggles a single sub-path in `itemFoldedKeyPaths` (used by inline gutter `▶`/`▼` chevrons).
   - Backward-compatible `getDraft()` / `setDraft()` / `updateDraft()` methods remain on `createFormState` so existing unit tests (`client/test/config-draft.test.js`) continue to pass without breakage.
4. **Save & Apply Flow (`savePresetConfig`)**:
   - Validates combined `configDraft` + `colormapsDraft` using `validateConfig`.
   - Also validates that every `renderRef` in `configDraft.presets` resolves to a key in `configDraft.renderProfiles` (or inline `render`).
   - Saves `colormapsDraft` to `POST /api/colormaps` (when `colormapsDraft` is dirty or present) and `configDraft` to `POST /api/config`.
   - Expands `renderProfiles` into a fresh runtime clone for `CURRENT_CONFIG` and `PRESET_GROUPS`, calls `setColormaps(colormapsDraft)`, and triggers `notifyConfigLoaded()` + `onConfigSaved` so open map windows live-reload.

---

## 4. File-by-File Architecture Plan (All Files < 600 Lines)

### 4.1 Files to Remove

| File | Current Lines | Reason for Removal |
|---|---:|---|
| `client/src/components/config/PresetForm.svelte` | 867 | Replaced by foldable JSON item editor; also exceeded 600-line limit |
| `client/src/components/config/LayerForm.svelte` | 405 | Replaced by direct preset JSON editing |
| `client/src/components/config/ColormapForm.svelte` | 696 | Replaced by foldable `colormaps.json` item editor; exceeded 600-line limit |
| `client/src/components/config/SettingsForm.svelte` | 433 | Replaced by foldable `"basemap"` & `"performance"` JSON blocks in `config.json` |
| `client/src/components/config/JSONFallbackForm.svelte` | 179 | Replaced by unified foldable / raw JSON editor |
| `client/src/ui/config/colormapForm.js` | 414 | Legacy unused imperative DOM form |
| `client/src/ui/config/colormapStops.js` | 331 | Legacy unused imperative DOM table |

### 4.2 Files to Create / Update

| # | File | Target Lines | Responsibility |
|---|---|---:|---|
| 1 | `client/src/ui/config/colormapUtils.js` (new) | ~90 | Pure helpers extracted from `colormapForm.js` / `colormapStops.js`: `stopsToCSSGradient`, `getColormapUsageCounts`, `rewriteColormapReferences` (re-exported by a tiny shim if needed by tests). |
| 2 | `client/src/ui/config/jsonFoldState.js` (new) | ~280 | Pure state & helper logic for both document-level and intra-item JSON folding: builds item descriptors for `config.json` & `colormaps.json`, computes `collectItemCollapsibleKeys(itemVal)`, `foldAllItemKeys`, `unfoldAllItemKeys`, `unfoldItemKey(itemVal, keyOrPath)`, `formatItemWithFoldedKeys(itemVal, foldedPaths)`, line-range mapping for inline gutter chevrons, search filtering, and per-item JSON parse/patch. |
| 3 | `client/src/ui/config/formState.js` (update) | ~380 | Extends `createFormState` with dual-document tracking (`config.json` + `colormaps.json`), document-level `unfoldedItemPath` (default `null`), `foldAll()`, `unfoldItem(path)`, and intra-item key folding state (`foldAllKeys()`, `unfoldAllKeys()`, `unfoldKey(keyOrPath)`), while preserving all existing exports (`clonePresetGroup`, `cloneLayer`, `insertDivider`, `moveEntry`, `deleteDivider`) for unit test compatibility. |
| 4 | `client/src/components/config/FoldableJsonItem.svelte` (new) | ~360 | Renders a single foldable JSON item row: folded 1-line summary header and, when unfolded, the item toolbar (`Fold All`, `Unfold All`, `Unfold Key ▾` + key pills, `Format`, `Duplicate`, `Move ↑/↓`, `Delete`), the line-numbered JSON code editor with gutter `▶`/`▼` key toggles, and scoped syntax/validation error banner. |
| 5 | `client/src/components/config/JsonDocEditor.svelte` (new) | ~340 | Renders the active JSON document (`config.json` or `colormaps.json`): filter input, `Fold All` / `Add Preset` / `Add Divider` / `Add Colormap` / `Raw JSON` controls, list of `FoldableJsonItem` blocks, and full-file raw JSON mode. |
| 6 | `client/src/components/ConfigEditor.svelte` (update) | ~320 | Top-level `#config-editor-panel` shell: toolbar with `[ config.json ]` and `[ colormaps.json ]` document tabs, status badge (`Valid`, `Modified`, `Invalid`), `Fold All`, `Reload`, `Save & Apply`, `Close`, keyboard shortcuts, and `JsonDocEditor` mount. |
| 7 | `client/src/lib/stores/i18nCore.js` (update) | <580 | Add/update localization keys for `config.json` / `colormaps.json` tabs, `Fold All`, `Unfold All`, `Unfold Key`, `Raw JSON`, and item actions in English and Chinese (`en` / `zh`). |

---

## 5. Step-by-Step Implementation Plan

### Step 1: Extract Pure Colormap & Formatting Utilities
- Create `client/src/ui/config/colormapUtils.js` containing `stopsToCSSGradient`, `getColormapUsageCounts`, and `rewriteColormapReferences`.
- Keep `formatPresetLevel` and `formatLayerLevel` as pure exported helpers in `client/src/ui/config/jsonFoldState.js` so preset summary badges (`500 hPa`, `C012`, `3000 m`) remain consistent with `PresetMenu.svelte` and `WindowPanel.svelte`.

### Step 2: Implement `jsonFoldState.js` & Update `formState.js`
- Build `jsonFoldState.js` to decompose:
  - **`config.json`** into foldable items:
    1. `basemap` (summary shows scheme, projection, active vector overlays)
    2. `performance` (summary shows `maxEffectiveCells` and `prefetch` settings)
    3. `presets` array items `presets[0..N-1]` (summary shows index, `id`, localized/raw `name`, `category`, level badge, layer count, or divider line)
    4. `renderProfiles` entries `renderProfiles.<key>` (summary shows profile key, layer type, and usage count across presets)
  - **`colormaps.json`** into foldable items:
    1. Each key `name` in `colormaps.json` (summary shows key, stop count, min..max value range, usage count across presets, and CSS gradient string).
- Enforce the **Document-Level Fold All / Unfold One** state machine:
  - `unfoldedPath`: `string | null` (initially `null` = all items folded).
  - `unfoldOne(path)`: sets `unfoldedPath = path` (automatically folding any previously unfolded item), resets intra-item key folding (or applies default item key view), and initializes `editingText = formatItemWithFoldedKeys(itemValue, itemFoldedKeyPaths)`.
  - `foldAll()`: clears `unfoldedPath = null` (if the currently unfolded item has valid JSON, commits it first; if invalid syntax, prompts or retains error state).
- Implement **Intra-Item Key Folding (`foldAllItemKeys`, `unfoldAllItemKeys`, `unfoldItemKey`, `formatItemWithFoldedKeys`)**:
  - `collectItemCollapsibleKeys(itemVal)` discovers every nested object/array key and path inside the item (e.g., `layers`, `layers[0]`, `layers[0].render`, `layers[1]`, `layers[1].render`, `levels`, `config`, `filterRules`).
  - **Primitive arrays (`levels`, `render.levels`, `boldValues`, `bounds`, `sampleTimes`, `color`) always format to a single horizontal line** (`[1000, 925, 850, ...]`, `[0.1, 1, 5, 10, 50, 100]`), both in `formatItemWithFoldedKeys` and in `formatCompactJSON`, never splitting numbers across 10+ vertical lines.
  - `foldAllItemKeys(itemVal)` folds all collapsible sub-keys inside the item so every nested object/array is rendered on a single compact line while top-level scalar fields (`id`, `name`, `category`, `hasLevel`, `defaultLevel`) remain expanded.
  - `unfoldAllItemKeys(itemVal)` expands nested objects in the item to multi-line JSON while keeping simple primitive arrays (`levels`, `boldValues`, etc.) and `interval` on single lines.
  - `unfoldItemKey(itemVal, keyOrPath)`:
    - When `keyOrPath === "layers"`, unfolds `layers` to **1 line per layer object** (`layers[0]`, `layers[1]` remain folded on their own single lines until a specific `layers[i]` or `render` is unfolded).
    - When `keyOrPath` is a primitive array like `"levels"`, expands it on a single horizontal line (`"levels": [1000, 925, 850, ...]`).
    - When `keyOrPath` is a nested key/path like `"render"` or `"layers[1].render"`, unfolds its ancestor path chain (`layers` → `layers[1]` → `layers[1].render`) while keeping sibling keys folded.
  - Editing the unfolded item's JSON text parses and validates on the fly:
    - Valid JSON immediately updates the corresponding path in `configDraft` or `colormapsDraft`.
    - Invalid JSON records a syntax error at `unfoldedPath` with line/column diagnostics and disables `Save & Apply` until resolved.

### Step 3: Build `FoldableJsonItem.svelte` & `JsonDocEditor.svelte`
- Implement `FoldableJsonItem.svelte`:
  - Compact single-line header (`height: 30px`, monospace JSON preview, hover actions, click to toggle unfold).
  - When `isUnfolded === true`, renders:
    - **Intra-item key folding bar**: `[Fold All]` (`#btn-item-fold-all`), `[Unfold All]` (`#btn-item-unfold-all`), `[Unfold Key ▾]` (`#sel-item-unfold-key`), plus clickable key chips for quick 1-click key unfolding (`layers`, `render`, `levels`, `interval`, `config`, etc.).
    - **Line-numbered JSON editor** with gutter `▶`/`▼` toggles on lines starting collapsible `{...}` / `[...]` blocks.
    - **Live colormap gradient bar** (for `colormaps.json` items) + **inline error banner**.
- Implement `JsonDocEditor.svelte`:
  - Search/filter bar that filters `presets[]`, `renderProfiles`, and `colormaps` by `id`, `name`, `name_zh`, `category`, `model`, `element`, or `renderRef`.
  - Section headers in `config.json` (`"basemap"`, `"performance"`, `"presets" [186]`, `"renderProfiles" [15]`) with `+ Add Preset`, `+ Divider`, `+ Add Profile`, and `+ New Colormap` buttons that insert a new item and immediately unfold it.
  - Toggle between **Folded Items Mode** (default) and **Full Raw JSON Mode** (`#config-json-textarea` + `#btn-config-json-format`).

### Step 4: Redesign `ConfigEditor.svelte` & Remove Legacy Form Files
- Update `ConfigEditor.svelte` to switch between **`config.json`** (`data-tab="config"`) and **`colormaps.json`** (`data-tab="colormaps"`), plus a quick **`Fold All`** toolbar button (`#btn-config-fold-all`).
- Delete `PresetForm.svelte`, `LayerForm.svelte`, `ColormapForm.svelte`, `SettingsForm.svelte`, `JSONFallbackForm.svelte`, `colormapForm.js`, and `colormapStops.js`.

### Step 5: Update & Expand Unit Tests
- Update existing tests in `client/test/` that read the removed `.svelte` files directly:
  - `client/test/ui/ui_ux_review1_all13_issues.test.js`: point level-badge / config checks to `jsonFoldState.js` / `ConfigEditor.svelte` / `NavBar.svelte`.
  - `client/test/ui/navbar_layout_dropdown_and_allocation.test.js`: verify model list in `NavBar.svelte` / `MultiTrackTimeline.svelte` / `jsonFoldState.js`.
  - `client/test/ui/global_theme_and_features.test.js`: verify theme & projection switches in `NavBar.svelte` and `ConfigEditor.svelte` (`basemap` block).
  - `client/test/config-draft.test.js`: import `rewriteColormapReferences` from `colormapUtils.js`.
- Add new unit tests in `client/test/config-json-fold-editor.test.js` covering:
  1. Direct loading & separation of `config.json` (~186 presets + `renderProfiles` + `basemap` + `performance`) and `colormaps.json` (40 colormaps).
  2. Document-level default **all-folded** state (`unfoldedPath === null`), **single-unfold accordion** transition (`unfoldOne("presets.0")` followed by `unfoldOne("presets.1")` folds `"presets.0"` and unfolds `"presets.1"`), and `foldAll()`.
  3. **Intra-item key folding (`Fold All` / `Unfold All` / `Unfold Key`) & Single-Line Simple Arrays**:
     - `foldAllItemKeys(preset)` collapses all nested keys (`layers`, `levels`, `render`, `interval`, `boldValues`) into compact single-line JSON while keeping top-level scalar keys visible and valid JSON.
     - `unfoldAllItemKeys(preset)` expands nested objects to multi-line JSON while keeping simple/primitive arrays (`levels`, `render.levels`, `boldValues`, e.g., `[1000, 925, 850, ...]` or `[0.1, 1, 5, 10, 50, 100]`) on a **single horizontal line** (never 10+ vertical lines).
     - `unfoldItemKey(preset, "layers")` expands `layers` to **one single line per layer object** (`layers[0]`, `layers[1]` remain compact 1-line objects until individually unfolded).
     - `unfoldItemKey(preset, "levels")` expands `levels` onto a **single horizontal line** (`"levels": [1000, 925, 850, ...]`).
     - `unfoldItemKey(preset, "render")` (by key name) and `unfoldItemKey(preset, "layers[1].render")` (by path) unfold the target key and its ancestor chain (`layers` → `layers[1]` → `layers[1].render`) while keeping sibling keys (`layers[0]`) folded and primitive arrays (`levels`, `boldValues`) on single lines.
     - Editing the JSON text while keys are folded/unfolded preserves all data losslessly on round-trip parse.
  4. Editing an unfolded preset or colormap JSON block updates the draft, preserves `formatCompactJSON` single-line color arrays, catches syntax and schema errors inline, and saves cleanly to `/api/config` and `/api/colormaps`.
  5. Every file in `client/src/` remains strictly `< 600` lines.
