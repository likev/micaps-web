# ECMWF Line-Profile Implementation — Review 1 (uncommitted)

**Date:** 2026-09-19 · **Base:** `2adb814` (main) · **Scope:** uncommitted work only
(`git status`: 16 modified + 12 new client + 4 new server + plan doc).
**Method:** static read of every new/changed file, `bun test client/test/lineprofile/`
(18/18 pass), `go test ./handler/ -run 'TestLineHeight|TestHovmoller|TestLineProfile'`
(pass), full `bun test` (492 pass / 8 fail) + `go test ./...` (all pass), and a
`git stash -u` clean-tree control proving the 8 bun failures pre-exist.

## Verdict

**Do not merge as-is: 1 must-fix (P1, ~15 min) + 6 moderate cleanups.** No correctness
break in the server path, no new test failures, and the plan's wire contracts (§3),
streaming protocol, timeline-ownership split (§6), pick state machine, and H9 swap/reverse
views are all implemented and test-locked. The single merge-blocker is a plan deviation:
Group 1 never reads its own `matrixCache`, so V-table L3 "step back is instant" fails —
every lead revisit refetches instead of serving memory.

## What matches plan (keep)

- Server: `lineprofile_common.go` (slerp + haversine, `parseLineCommon` validation incl.
  A~=B `<0.1deg`, `..`/`%00` reject, whole-segment-out → 400), both handlers mirror
  `profile_handler.go` (probe-first-task → NDJSON progress → result, conc-6 pool,
  file-cache → singleflight → Cassandra → mock), `main.go` routes registered.
- Client loaders: 1 fetch/load, monotonic progress, `cacheHits`/`lastSource`, abort-cancel,
  `null→NaN` gaps (Bun-locked in `loaders.test.js`).
- Timeline ownership: G1 `setLead` full-reload on `isTimeStep` (debounced 150 ms +
  abort-in-flight), G2 `isTimeStep` no-op, slider hidden for timeheight+hovmoller but NOT
  lineheight (`windowFocus.js`, `bootstrap.js`, `presetLoader.js` all consistent), ←/→
  swallowed for hovmoller, ↑/↓ swallowed for both (`bootstrap.js` keyboard guards).
- Pick UX (§2 + click update): `pickMode idle|draw|setA|setB` per window, two-click Draw
  with rubber-band preview (`lp-line-preview`) + pending-A marker, `Esc`/right-click cancel,
  disarmed-click no-op, snap+clamp+toast, overlay ids `lp-line-*` (no `th-*` collision).
- H9: `axisSwap dist-x|time-x` + `timeDir fwd|rev` are display-only remaps (generic u/v
  binding in `hovmollerCanvas.js`/`lineIsolines.js`), persisted, zero-fetch — tested.
- Registration checklist (§7): schema, `layerDefaults`, drawer HTML+bindings, dispatcher,
  visibility, prefetch skip, `configEditor` hide, `config.json` groups — all present.
## Must-fix before merge

### P1 — Group 1 never serves `matrixCache`: L3 "step back is instant" fails (plan §5/§10)

`hovmollerController.loadMatrix` opens with an exact-key fast path
(`hovmollerController.js:293-301`: `matrixCache.has(key)` → serve + `setData` + return,
no fetch, no progress bar). `lineHeightController.loadMatrix`
(`lineHeightController.js:314-346`) has **no such branch**: it unconditionally bumps
`loadingSeq`, creates an `AbortController`, flashes `setProgress(0%)`, and fetches — then
writes through via `_setMatrixCache` at `:333`, so the cache fills but is **write-only**.
Every plan §10-L3 step-back (`+24h → +48h → +24h`) costs a second 40-blob server job and a
progress-bar flash instead of the specified instant memory serve. The existing test only
asserts debounce + fan-out shape (`controllers.test.js:177-195`) and never revisits a lead,
so it passes despite the deviation.

**Fix (~15 min):** copy the G2 fast-path shape into `lineHeightController.loadMatrix`, keyed
by the existing `_cacheKey` (cycle|lead|line|n|levels — already span/line aware): on hit,
`setLead` badge + `setData(matrix, transect.distKm, lead)` + `setLine(...)` refresh and
`return s.matrix` before touching `loadingSeq`/abort/progress. Add a Bun test mirroring L3:
`setLead(48)` → 1 fetch, `setLead(24)` → 0 new fetches + badge shows `+24h`. Keep the
write-through at `:333` unchanged.

## Moderate (fix in same pass, none blocks timeline UX)

### M1 — `changeVerticalLevel` line-profile guard is dead code on its only real path

`levelController.js:13-26` returns early when the window holds a lineheight/hovmoller layer.
But line 15 already returns for **every** preset with `hasLevel === false` — and both new
groups declare `"hasLevel": false` (`config.json`). So on the shipped presets the M1 guard
never fires; it only matters for hand-built windows mixing `hasLevel: true` with a transect
layer. Harmless but misleading: a reader assumes Up/Down protection comes from here, while it
actually comes from the `bootstrap.js` `onLevelStep` swallow. Either (a) delete lines 19-26
and cite the bootstrap guard + `hasLevel:false` in a one-line comment, or (b) keep it as
defense-in-depth and say so explicitly. Current comment ("never route ... into their
controllers" — nothing ever routed there) overclaims.

### M2 — `showLineHighlight` creates same-source circle layers without `filter` at `addLayer`

`lineHighlight.js:49-54` adds `lp-line-a` / `lp-line-b` as filter-less `circle` layers over a
source that also holds the `LineString` + both points; the `lp-a`/`lp-b` filters are applied
*after* via `map.setFilter?.()` (`:55-63`). On real MapLibre (unlike the mock in tests, whose
`setFilter(){}` is a no-op) two things go wrong: (1) a `circle` layer whose source contains a
`LineString` is invalid — the spec requires `circle` geometry to be `Point`; some GL builds
warn/skip, so A/B may not paint until the deferred `setFilter` lands; (2) between `addLayer`
and `setFilter` both circles render **all three features** (line vertices included), i.e. up to
2× duplicated endpoint dots for one frame. Pass the filters inline in the `addLayer` calls
(same pattern already used for the halo/line layers at `:35-48`), keep the `setFilter?.()`
fallback for idempotent re-show.

### M3 — LineHeight `setLead` persists `lead` but Group 1 `config.json` still ships `"lead": null`

`setLead` writes `_persistConfig({ lead: target })` (`lineHeightController.js:284`) and
`loadMatrix`'s write-through key includes the lead, yet the shipped default stays
`"lead": null` (= follow `win.period`, resolved at `init` `:74`), and `setLead` is the only
writer. After the first timeline step the window copy carries a concrete lead while the
pristine preset keeps `null` — intended, but undocumented and untested: no test asserts the
`null → follow → persist-concrete` transition, and the plan (§4) says only "`lead: null`
means follow" without stating it flips after first step. Either assert the transition in the
G1 timeline test (init `lead` resolves from `win.period`; after `setLead(48)` the layer
config holds `48` while `PRESET_GROUPS` stays `null`) or stop persisting `lead` and keep it
purely ephemeral like time–height's cursor. Current half-state risks "reload preset keeps
stale lead" confusion.

### M4 — `validateLineProfileLayerConfig` accepts a `levels` the handlers/server may not serve

Schema (`configSchema.js:332-337`) allows any 1..10 pressures in `[10, 1050]`, but the
Group 1 contract is the fixed 10-level set (`PROFILE_LEVELS`), the loader defaults to it,
and `PROFILE_LEVELS.includes(level)` is enforced for G2 single level
(`hovmollerController.js:72`) while G1 `init` (`lineHeightController.js:73`) takes
`cfg.levels` unchecked. A hand-edited config with `levels: [999]` validates, then draws a
one-row "section". Tighten: G1 `levels` must be a non-empty subset of `PROFILE_LEVELS`
(or the exact 10 in v1); G2 `level` must be *in* `PROFILE_LEVELS`, not just `[10,1050]`
(the UI dropdown already restricts to the 10 — schema should match). Add one negative test
per type.
### M5 — Drawer bindings bypass the window: multi-window cross-talk on every drawer edit

`lineProfileDrawerBindings.js` calls `lineHeightController.setLine/setFlip/startDraw/...`
and the hovmoller equivalents without a `win` argument, so the controllers resolve the
"default" state instead of the drawer window (`_getWinId(null)` falls back to
`this._activeWin?.id || "default"`). In a two-window setup, editing the drawer of window B
mutates/fetches the wrong window state. Thread the owning `win` through (the row-binding
site in `layerRowBindings.js` already has the window context — pass it into
`bindLineProfileDrawerEvents`) and add a two-window drawer test: a drawer edit on B must
not change A's line or matrixCache.

### M6 — `lineIsolines.js` double-imports isoline levels; dead void noise hides real wiring

`lineIsolines.js` both re-exports and locally imports the same two level helpers, and
`hovmollerCanvas.js` carries a matching dead void statement; `renderHovRHFill` /
`renderHovLines` keep unused params alive with void placeholders. None of this breaks
rendering, but it trips lint and reader trust: keep the re-export or the local import, not
both, and drop the void placeholders and unused params. While here, confirm the canvas
honors the showTemp/showVVel/showWind toggles on the Hov path — the section canvas gates
them, but the Hov render calls in the reviewed slice never visibly check the flags, so
drawer/panel toggles may repaint nothing on G2 (untested — add a toggle test).

## Minor / nits (no code change required to merge)

- m1 — Architecture.md test count is stale on arrival. The tree says "510 bun tests across
  73 files" but the worktree runs 500 tests across 73 files (492 pass + the same 8
  pre-existing fails as the clean tree, verified via stash control). Re-count at merge time
  instead of hand-maintaining.
- m2 — onWindowFocus NWP-timeline stepLength differs for lineheight windows.
  presetLoader uses step 12 for timeheight+hovmoller groups; the bootstrap focus path
  (contour/wind-only layer lookup) falls back to 6 for the same window. G1 is the only
  preset whose chips are load-bearing (each step = a 40-blob reload), so the focus-then-step
  sequence can silently change chip density. Include the new types in the focus-path lookup
  or document the split.
- m3 — Loaders accept signalSeq but ignore it. Both loaders declare the param yet
  shouldCancel checks only signal.aborted plus isCancelled; callers compensate via
  isCancelled comparing loadingSeq, so cancellation works, but the dead param invites a
  future caller to rely on it. Wire it or delete it.
- m4 — setSnapped does a redundant full blob refetch. Both handlers call
  fetchDecompressed for the first task a second time — a repeated decompress of a blob
  already sampled. Harmless on mock but doubles first-byte latency on live Cassandra.
  Sample once and derive snapped lon/lat/i/j from that.
- m5 — No trailing newline in client/config.json. The worktree file ends without a newline,
  byte-identical to HEAD — pre-existing, but the new groups were the natural moment to fix
  it and kill a class of diff noise.
- m6 — Server lineBlobTask carries three copies of the same level (pressure, level,
  levelVal all set to the same value at both call sites, with a "deprecated aliases"
  comment but no removal target). Pick one field now rather than shipping the triple.
## Verification executed

- bun test client/test/lineprofile/: 18 pass / 0 fail (4 files, 175 expects) — incl. draw
  two-click, disarmed no-op, Esc/contextmenu cancel, G1 setLead debounce + fan-out, G2
  no-op + span/level + swap/reverse zero-fetch.
- go test handler with line-profile filter: pass — validation tables, mock streams
  (8 and 12 progress lines), cancel-no-hang, 1e-4 parity.
- go test ./... : all packages pass.
- Full bun test: 492 pass / 8 fail — identical 8 failures on the clean tree (stash
  control): DTD-derived-layer, config-shape, maxEffectiveCells, C3 raster, contour-label,
  V12 tlogp — all pre-existing, none touched by this diff.
- Plan section 8 wire-shape spot checks: G1 levels 850,500 with lead 24 and npoints 5
  yields 8 progress events plus a 2x5 result; G2 leads 0,12,24 at level 850 yields 12
  plus a 3x5 result — matching the Go tests.

## Suggested fix order (about 1 h total)

1. P1 G1 matrixCache fast path + L3 revisit test (about 15 min, only merge-blocker).
2. M5 drawer win threading + two-window test (about 15 min, real split-view corruption).
3. M2 inline circle filters (about 5 min, one-frame duplicate dots / possible skipped paint).
4. M4 schema subset tightening + 2 negative tests (about 10 min).
5. M3 lead-null transition test-or-do-not-persist decision (about 5 min).
6. M6 import/void/toggle-gating cleanup + G2 toggle test (about 10 min).
7. Re-run the lineprofile Bun tests + handler tests; re-count Architecture numbers (m1).