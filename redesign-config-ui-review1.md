# Config UI Redesign — Review 1 (uncommitted implementation vs `redesign-config-ui-plan1.md`)

## 0. Scope & method

Reviewed the uncommitted worktree against `redesign-config-ui-plan1.md` (§2–§12):

- Ran `bun test` in `client/`: **425 pass / 0 fail across 60 files** (includes the 4 new suites).
- Ran `bun run build`: **passes** (vite, 25.5s). This matters because the new form modules (`presetForm`, `layerForm`, `colormapForm`, …) are only imported via `configEditor.js` ← `bootstrap.js`; no test imports them directly, so the build is the only automated syntax/import check for ~2,000 lines.
- Read the full diff for `presets.js`, `navBar.js`, `windowFocus.js`, `windowPanels.js`, `config.test.js`, `configEditor.js`, `tabs.css`, `Architecture.md`; read `formState.js` (319) and `configSchema.js` (305) in full; deep-reviewed the remaining 9 new files + new tests via parallel agents (findings merged below, severities re-judged by me).
- New code volume: 11 files, ~3,100 lines; largest is `colormapForm.js` (537). **All files < 600 lines** ✓ (plan G5 holds, but `colormapForm.js` has ~60 lines of headroom — see §4.5).

## 1. Verdict

**Data layer: accept. UI shell: accept with fixes. Layer/type forms: not yet done — several controls render but are unwired, and detail-pane re-rendering breaks text input.**

Concretely:

| Area | Status |
|---|---|
| Divider-tolerant loader (`presets.js`: `isDivider`, `formatDividerOption`, `getLoadableGroups`, relaxed validation, autoSave/upsert/remove skips) | ✅ Correct, minimal, matches plan §4/§5 |
| Divider rendering in all 4 dropdown sites (`navBar.js` ×3, `windowFocus.js`, `windowPanels.js`) | ✅ Correct (disabled `value=""` options, divider-aware lookups) |
| `formState.js` (draft store + clone/divider helpers) | ✅ Matches §3.2.1/§3.2.2/§4 semantics |
| `configSchema.js` (validation engine) | ✅ Largely matches §6, with 2 gaps (§2.2) |
| New unit tests (4 files) | ✅ Strong on data layer, thin on rendering (§3) |
| `configEditor.js` shell (sub-tabs, badge/dirty/Save gating, lifecycle) | ✅ Matches §3.1/§7, minor lint (§4.6) |
| Preset sidebar, copy flows, divider rows + mini-form | ✅ Present; 3 small UX gaps (§4.1) |
| Layer detail forms (contour/wind/station/tlogp) | ❌ Partially dead — §2.1 |
| Colormap editor core (sidebar, gradient, stop table, 20+20 libraries) | ✅ Working; 2 data-integrity/UX bugs (§2.3, §2.4) |
| Raw-HTML interpolation of user strings across all form modules | ⚠️ Must fix — §2.5 |
| `tabs.css` additions | ✅ All key classes present; ~20 minor class names unstyled (§4.7) |

## 2. Must-fix findings

### 2.1 Dead controls in layer forms (renders-but-does-nothing) — major

`layerTypeViews.js` renders controls that `layerForm.js:285-429` never binds:

- Contour: `#layer-inp-bold-width`, `#layer-chk-smooth`, `#layer-chk-raster` (`layerTypeViews.js:52,94,98`) — no listeners. (Note: `showRaster`/`smooth` already have working equivalents in the per-window drawer; here they are inert.)
- Wind (entire section): `#layer-chk-show-wind/show-barbs/show-raster` (`layerTypeViews.js:112-121`) — no listeners; `palettePath` picker absent (plan §3.2 requires it).
- T-LogP: `#layer-inp-station-id`, `#layer-sel-parcel` (`layerTypeViews.js:164,168`) — no listeners, and the parcel `<select>` never marks the draft's current value `selected`, so it always displays the wrong value.
- Plan §3.2 items with **no UI at all**: `path` (station/tlogp), `colormapByLevel` table, group-defaults collapsed section, station filter-rules section (`renderStationFilterSection` reuse), XML-palette optgroup in colormap selects, per-element hint wiring for stop cells.

A control that looks editable but silently discards input is worse than a missing control. Either wire these before merge or remove them from the templates and track as P4 follow-ups — do not ship inert inputs.

### 2.2 Detail pane rebuilds per keystroke; special-char ids crash the mount — major

- `layerForm.js:183-193`: layer-name `input` event → `onUpdate` → `presetForm.js:243-245` rebuilds `detailMount.innerHTML` **on every keystroke** → focus loss after one character. Same pattern for swatch `onPick` (`layerForm.js:149-160`), opacity slider `input` (`298-311`), and station checkboxes. (Preset-name input in `presetForm.js:266-272` already does the right thing — update draft without full re-render. Apply the same pattern to layer fields.)
- `presetForm.js:240` builds a selector from `` `#mount-layer-${expandedLayerId}` `` via `querySelector`. Layer ids with spaces/quotes/brackets/`#` are legal until Save-gate slug validation, so a hand-edited `config.json` containing one kills the detail pane with an uncaught `SyntaxError`. Same hazard class as §2.5: escape or use `getElementById`/`data-*` lookup that doesn't parse CSS.
- Identical focus-loss bug in colormap sidebar search: `colormapForm.js:291-297` full-`render()` on `input` destroys the focused search box after one character.

### 2.3 Colormap rename orphans layer references — medium/high (data integrity)

`colormapForm.js:375-394`: rename moves `draft.colormaps[newName]` and deletes the old key but never rewrites `render.colormap` / `colormapByLevel` references. Renaming an in-use ramp silently dangles every layer that used it (they fall back to element default at load — a quiet, confusing behavior change). Delete at least `confirm()`s (`colormapForm.js:340`), but the plan's "replace usages with …" select exists in neither path, and rename has no guard at all. Fix: on rename, rewrite all references (same-file scan already exists for usage counts); on delete of an in-use ramp, offer replace-with select per plan §3.3, or block with the usage list.

### 2.4 `configSchema.js` validates `boldValues` at the wrong path — medium (Save-gate hole)

`configSchema.js:196` checks `layer.boldValues`, but the real key is `layer.render.boldValues` (`config.json:338,378,…` all sit inside `render`). The check is dead code: a non-numeric `render.boldValues` array passes validation and is saved. Fix: move the check to `layer.render.boldValues`. (Related inconsistency: channel check uses `Number.isInteger` in `configSchema.js:288` while runtime `setColormaps` in `colormaps.js:109` accepts `Number.isFinite` — a float channel like `127.5` Save-gates in the editor but loads fine at runtime. Align the two, preferably to integer + a message that matches the runtime error text.)

### 2.5 Unescaped user strings interpolated into HTML — medium (correctness + self-XSS)

Every form module writes draft/hand-JSON-controlled strings raw into `innerHTML`, `value="…"`, `title`, and `style`:

- `presetForm.js:89,102,107,112,172,175,192-193,196,200,205,207`; `presetList.js:33,81,86,135,138-140,144-147,280,288,315-319` (the live label preview at `:315-319` writes raw input into `innerHTML` on each keystroke); `layerForm.js:49,54,69,81,102,113,348`; `layerTypeViews.js:23,35,48,52,59-67,77,80,85,164`; `colormapForm.js:95,111,113,120,122-123,146,151,173`; `swatchPicker.js:67,70,73,75`.
- Impact on this single-operator local workstation is markup breakage first (a `"` in a name/id/label breaks the editor layout or the `querySelector` mount in §2.2), XSS second. Fix once, centrally: add `escapeHtml()` next to `deepClone` in `formState.js` (or a `html.js` util) and apply to every interpolated string; add a test with `"><img src=x onerror=…>`-style inputs asserting escaped output.

### 2.6 False alarm I checked and cleared (not a bug)

The draft review flagged a `formState.subscribe` listener leak in `configEditor.js:238`. It is **not** a leak: `loadCurrentConfigIntoEditor` creates a **new** `createFormState(data)` on every open/Reload, so the previous state's listener set is garbage-collected with it. No change needed.

## 3. Test report (all green, with coverage notes)

- `bun test`: **425 pass / 0 fail, 60 files, 10,092 assertions** — includes `config-schema` (178 lines), `config-draft` (218), `config-color-presets` (138), `config-divider-render` (64).
- `bun run build`: **passes** — the only automated check covering the DOM form modules.
- What's genuinely well tested: draft isolation, dirty tracking, clone/divider helpers incl. `-copy-2` uniquify, cross-group `derivedFrom` clearing, divider round-trip, 20/20 color libraries, `setColormaps` acceptance of all 20 ramps, divider `isDivider`/`formatDividerOption`/`getLoadableGroups`.
- What's thin (flagged, not failing):
  - `config-divider-render.test.js` re-implements the `<option>` template inline (`:35-41`) instead of importing the real renderers — it tests the helpers, not `navBar.js`/`windowFocus.js`/`windowPanels.js`. A refactor that breaks the real templates would not fail this test. Recommend importing a shared `renderPresetOptions()` helper (which the three call sites should also use — today the same ternary is copy-pasted 4×) and testing that.
  - Alpha preservation (`colormapForm.js:274-278`) is asserted by hand-computed math (`config-color-presets.test.js:127-136`), never by driving `renderSwatchStrip`. The `showRecent:false` / missing `elementHint` deviations in stop cells (§4.3) are therefore untested.
  - No test covers: Save-gating end-to-end (invalid draft disables Save — only wired in `configEditor.js:updateUIFromState`), `+ Add layer` id uniqueness, rename-reference rewrite (§2.3), escaping (§2.5), JSON-tab leave-with-invalid-JSON behavior.

## 4. Minor deviations & gaps (non-blocking, track explicitly)

### 4.1 Copy/divider UX gaps vs §3.2.1–§3.2.2

- No `Insert divider above / below` per-row menu — only footer `+ Divider` (append). `insertDivider`/`moveEntry` already accept indices; only the menu UI is missing.
- No scroll-into-view, no focus-`name`, no `Copied "X" → "Y"` status message after copy (selection + dirty work; the rest doesn't). Copy-warning uses blocking `alert()` (`presetForm.js:446`) where the plan specifies a non-blocking inline warning.
- No `hasLevel`-mismatch warning on cross-group layer copy (plan §3.2.1).
- `+ Add layer` generates `type-N` ids (`presetForm.js:351-352`) without uniquification — collides after delete/copy cycles; duplicates are Save-gated, but the UX should auto-uniquify like the copy path.
- No-preset empty state reads "No preset selected…" (`presetForm.js:60-64`), not the plan's "Create your first preset" CTA with a button.

### 4.2 Layer-form scope gaps vs §3.2 (absent, not dead)

`path`, `stationId/defaultStation/parcelLevel` in the common form; contour `showWind/showBarbs` for wind-related layers; palette select (`populatePaletteSelect` never called from the new forms); `colormapByLevel` table; group-defaults section; `labelSize` binding; station filter rules. Recommend moving these to a P4 checklist in the plan rather than silently dropping them.

### 4.3 Swatch/strip parity gaps vs §3.6.3

Stop cells mount the shared strip with `showRecent:false` and no `elementHint` (`colormapForm.js:268-283`), so two plan promises ("identical strip", per-element hint chip) hold only for `lineColor`. Either pass them through or amend the plan. `Apply recommended ramp` is a flat 20-option list (`colormapForm.js:149-152,396-412`) — no Built-in/Recommended grouping, no per-option gradient swatches. Both dropdown renderers and the strip use a local `stopsToCSSGradient` (`colormapForm.js:8-19`) instead of the plan-mandated `getCSSGradient` reuse — functionally justified (alpha support; runtime helper drops alpha) but the fork should be documented in the plan or reconciled.

### 4.4 Settings + JSON-tab semantics vs §3.4–§3.5

- `updatePerf` (`settingsForm.js:194-202`) stores unclamped ints; out-of-range is Save-gated by schema, so this is safe but the plan's clamp-on-write + `getMaxEffectiveCells` effective-value display are missing.
- JSON tab syncs `input → setDraft` continuously (`jsonFallback.js:45-47`) and ignores the unmount `syncToDraft()` failure flag (`:74-75`): leaving the tab with invalid JSON silently keeps the last-valid draft with no "stay and fix" affordance. The plan's enter-serializes / leave-parses-or-stays contract is not implemented.

### 4.5 `colormapForm.js` at 537/600 lines

The §2.3 fix (usage-rewrite UI) plus any §4.2 additions will breach the repo's 600-line rule. Pre-split now per the plan's own contingency: extract the stop table into `colormapStops.js`, as was already done for presets (`presetList.js` + `layerForm.js` + `layerTypeViews.js`).

### 4.6 Lint-level

`configEditor.js:2,5` imports `PRESET_GROUPS`, `formatCompactJSON`, `appState` — all three are now unused after the shell rewrite (formatting moved to `jsonFallback.js`, state moved to `formState.js`). Remove or confirm no other usage before merge.

### 4.7 Unstyled classes in `tabs.css`

Present and styled: split view, sidebar, detail pane, cards, swatch strip/grid, gradient bar, layer rows, divider rows, JSON wrapper. Missing rules (unstyled but non-breaking): `config-field*`, `preset-detail-container`, `preset-layers-list`, `preset-layer-row-wrap/actions`, `layer-drag-handle`, `layer-detail-form-card`, `layer-render-section`, `config-empty-state`, `divider-mini-form`, `divider-preview-box`, `btn-copy-layer/btn-expand-layer/btn-del-layer/sel-copy-to-preset`, `sidebar-item-chip.type-*/cat/lvl/count`, `badge-error`, `btn-row-del`, `config-banner.error`, `colormap-detail-header/title-row/actions-row`, `colormap-table-container`, `gradient-*-label`, `.swatch-strip-root.compact`, `config-settings-container`, `config-hint`. The `ui_review2/3_fixes` CSS assertions still pass (verified in the suite run). Sweep the missing selectors into `tabs.css` or drop them from templates.

## 5. Loader & dropdown changes (accepted, no findings)

`presets.js` (+26: `isDivider`/`formatDividerOption`/`getLoadableGroups` + 4 skip-sites), `navBar.js` (4 sites), `windowFocus.js` (2), `windowPanels.js` (1), `config.test.js` (`if (group.divider) continue`) are exactly what plan §4/§5 rows 11–12 specify. Notes:

- `presetLoader.js` needed **no** change: the self-heal loop's `Array.isArray(pristine.layers)` guard already skips dividers, and all callers now resolve loadable groups. Plan §4's wording ("self-heal loop must skip dividers") can be marked satisfied-by-construction.
- `keyboardShortcuts.js` needed **no** change: the existing `el.closest?.("#config-editor-panel")` guard (`keyboardShortcuts.js:14`) already covers all new inputs since they mount inside the panel. Plan §7.6 satisfied without edits.
- `Architecture.md` one-liner added per P4 docs touch-up. The 4× copy-pasted option ternary should become one shared `renderPresetOptions()` helper (§3) — today's duplication is a drift risk.

## 6. Recommended actions before merge

1. Wire or remove every dead control in §2.1 (no inert inputs ship).
2. Fix per-keystroke detail rebuild + search rebuild (§2.2) — adopt the preset-name pattern everywhere; replace id-interpolated `querySelector` with safe lookup.
3. Rewrite layer references on colormap rename; add replace-with-`select` (or block) on delete of in-use ramps (§2.3).
4. Move `boldValues` validation to `render.boldValues`; align channel integer/finite rule with runtime (§2.4).
5. Central `escapeHtml` + test (§2.5).
6. Add `Insert divider above/below`, post-copy focus/scroll/message, `+ Add layer` uniquification (§4.1).
7. Decide P4 vs now for §4.2–§4.4 items and record the decision in the plan; pre-split `colormapForm.js` (§4.5); drop unused imports (§4.6); sweep unstyled classes (§4.7); extract shared `renderPresetOptions()` + test the real template (§3/§5).
