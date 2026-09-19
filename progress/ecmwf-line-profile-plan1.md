# ECMWF Line Profiles — Plan 1: Line–Height Section + Time–Line Hovmoller

## 0. Goal

Add **two new `ECMWF_HR` preset groups** reusing the shipped EC time–height stack
(`composite-ec-timeheight`, `GET /api/data/timeheight/profile`,
`client/src/layers/timeheight/`, `server/handler/profile_handler.go` +
`server/parser/sample_point.go` + `server/filecache/`) for transect diagrams:

| # | Preset id | Axes | Time source | Level source |
|---|---|---|---|---|
| 1 | `composite-ec-lineheight` | X = along-line distance (km), Y = pressure log | **One lead from global NWP timeline** (chip / ◀ ▶ / ← → / play) | Fixed 10 levels, same as time–height |
| 2 | `composite-ec-hovmoller` | Swappable: default X = distance (km), Y = forecast lead (0 top → end bottom); swapped X = lead, Y = distance. Time axis revertible (mirrors time–height `ltr/rtl`, display-only) | **Panel-local span** (`start–end @ step`, default `0–144 @ 12`); global timeline hidden+ignored | **User single level** (default 850, dropdown of 10) |

User map: "line (start-lonlat to end-lonlat)–height of one time via timeline/keyboard" = Group 1;
"time–line (start to end) of any height, no timeline" = Group 2.

Both sample 4 elements (`RH,TMP,VVEL,WIND`) from `ECMWF_HR/<ELEM>/<level>`, render RH fill +
red T lines + cyan VVEL (bold `ω=0`) + barbs, stream NDJSON progress→result behind the 2000 MB
server file cache. No new Cassandra schema, no map-plane contours, no build change.

Non-goals: replace point time–height (all three coexist); freehand polyline (2-point A→B only);
map-plane reference contour; dragging existing endpoints (v1 moves endpoints via click, not drag);
obs timeline changes.

## 1. Current-state reuse inventory

- Preset shape: `composite-ec-timeheight` (`client/config.json:693-727`, category
  `NWP Time-Height Profile`, `hasLevel:false`, one `type:"timeheight"` layer with
  `config {lon,lat,initCycle,startHour,endHour,stepHours,timeDirection,levels[10],show*}`).
  New groups clone this with A/B endpoints instead of a point (see §4).
- Server sampler: `parser.SampleGridPoint` (`server/parser/sample_point.go`) — 4-pt stencil,
  N→S aware, `ErrOutOfDomain`, wind polar/cartesian detect. Both new endpoints loop it over
  transect nodes. No new interpolation math.
- Streaming endpoint: `ProfileHandler.Handler` (`server/handler/profile_handler.go:81-330`) —
  validate → probe-first-task domain check → `application/x-ndjson` → conc-6 pool → progress
  lines → result matrix. New endpoints are structural clones with different task grids (§3).
- Client loader: `loadTimeHeightMatrix` (`timeHeightLoader.js:64+`) — 1 fetch, NDJSON reader,
  monotonic `onProgress`, Abort+seq cancel, `buildLeads`, `SUPPORTED_STEPS=[1,3,6,12,24]`,
  41-col cap. New loaders copy URL + matrix assembly only.
- Canvas: `timeHeightCanvas.js` (`pressureToFy`, layout, cursor, hover, exportPNG) +
  `timeHeightIsolines.js` (RH fill, T/VVEL lines via `griddata.contour`, barbs via
  `drawWindBarbCanvas`). Line–Height swaps `x(lead)`→`x(distKm)`; Hovmoller adds linear
  lead y-axis (§5).
- Controller pattern: `timeHeightController.js` (WindowState per winId, matrixCache<=20,
  loadingSeq+abort, map-click lifecycle, _persistConfig+autoSave, updateCursorLead cursor-only
  steps). New controllers copy it; no shared state with time–height controller.
- Timeline/keyboard spine: NWP chips + `step()` (`ui/timeline/`), global keydown arrows
  (`ui/keyboardShortcuts.js`), fan-out `bootstrap onTimeChange` →
  `presetLoader.loadPresetGroup(isTimeStep)` → `updateCursorLead` (`presetLoader.js:223-229`),
  slider show/hide (`windowFocus.js:108-140`, `bootstrap.js:94-121,272`). §6 new branches.
- Registration checklist per new layer type: `layerDefaults.js:153-170`, `configSchema.js:6`
  (`ALLOWED_LAYER_TYPES`), `layerRowView/layerRowBindings/visibilityActions/actionsDispatcher`,
  `timeHeightDrawerBindings.js`, `prefetchService.js` skip guard, `configEditor.js`, <600-line rule.

---

## 2. UX definition

### 2.1 Group 1 — Line–Height (`composite-ec-lineheight`)

- Diagram: X = distance from A in km (0 at A, L at B, linear), Y = pressure 1000→200 hPa
  (log, identical `pressureToFy`). Same 10 levels `[1000,925,850,700,600,500,400,300,250,200]`
  (config `levels`, fixed in v1).
- Time: exactly one lead = `win.period` from global NWP timeline. Chip/◀▶/←→/play re-fetches
  the section for that lead (cheap: ~40 grids, file-cached; §3.1). Header shows
  `Init <cycle> · +<lead>h valid <date>` + `A(lon,lat) → B(lon,lat) · <L> km · <N> pts`.
- Line editing (v1, click — no drag): drawer+panel numeric `A lon/lat`, `B lon/lat`,
  `N points` (default 41, range 2–81), plus **direct map clicking**:
  (a) `Draw line` mode — click map once for A, click again for B (rubber-band preview line
  follows the cursor between the two clicks; `Esc`/right-click cancels after the first click);
  (b) single-endpoint fix-up — `Set A from map` / `Set B from map` arm one endpoint, next map
  click assigns it. Every map-assigned endpoint snaps via `snapToGridNode`, clamps via
  `clampToGridDomain`+toast, then redraws overlay, persists config, reloads.
- Overlay (`lineHighlight.js`, new): amber LineString A→B + A/B circles, ids `lp-line-source`,
  `lp-line-halo`, `lp-line-a`, `lp-line-b` (not `th-active-point-*`, no collision).
- Panel: init-cycle select (`resolveForecastCycles`), A/B inputs + `Draw line` (two-click)
  + `Set A/B from map` fix-up, N select, element toggles,
  flip `A→B`/`B→A` (display-only, zero fetch — mirrors `ltr/rtl`), progress+Cancel, PNG export,
  minimize/close, hover readout `<dist> km | <p> hPa | T/RH/ω/wind`.

### 2.2 Group 2 — Time–Line Hovmoller (`composite-ec-hovmoller`)

> Name note: user said "time-line". Id uses `hovmoller` (display name keeps "Time–Line")
> because `timeline` collides with `ui/timeline/`, `timelineState`, `setTimelineMode` in code
> search and operator language ("the timeline" = bottom chip bar). All UI strings say Time–Line.

- Diagram: two display modes sharing one `[lead][pt]` matrix (no refetch on switch):
  default `dist-x` (X = distance km linear, Y = lead hours linear, **0h top → endHour bottom**,
  classic Hovmoller) and swapped `time-x` (X = lead hours, Y = distance km, 0 at bottom).
  One row/column per `buildLeads(start,end,step)` (default `0–144 @ 12` → 13 steps; same
  SUPPORTED_STEPS + 41-step cap). Independently, the **time axis is revertible** (mirrors
  time–height `ltr/rtl`, display-only, zero fetch): `timeDir: "fwd"` (0→end, default) vs
  `"rev"` (end→0). Swap and revert compose (4 views total); both persisted in config,
  both instant (axis remap + re-render only).
- Height: single-level dropdown panel+drawer (default 850, options = 10 profile levels).
  Independent of `win.level` and global timeline; Up/Down do nothing when focused (§6.3).
- Span: panel-local `start–end @ step` (same validation as time–height setRange). Global bottom
  timeline **hidden** while active (same mechanism as time–height); ←/→ swallowed for periods.
- Contents at level: RH cell fill (same resolver), TMP isolines, VVEL isolines (bold ω=0,
  dashed ascent), barbs decimated (stride from N×nLeads, default stride 2 when cells>300).
  All four renderers take a generic `(uFn, vFn)` mapping so **swap = rebind axes**
  (`dist-x`: u=distKm, v=leadFy; `time-x`: u=lead, v=distFrac) and **revert = flip the time
  mapping** (`fwd`: lead 0 at origin; `rev`: lead end at origin) — no data transpose, only
  coordinate remap + tick/hover relabel.
- View controls (panel + drawer): `⇄ Swap axes` button (label shows current mode:
  `X:dist · Y:time` / `X:time · Y:dist`) and `⇄ Reverse time` button (label shows current
  direction: `0→144h` / `144→0h`, same wording pattern as time–height `⇄ 0→144h`).
- Line editing: identical A/B inputs + `Draw line` (two-click) + `Set A/B from map`
  (single-endpoint fix-up) + amber overlay (shared `lineUtils.js`).
- Header: `Init <cycle> · <level> hPa · <nLeads> leads × <N> pts · A→B <L> km`.

### 2.3 Shared rules

- Map-click ownership while a line preset is active: `Draw line` armed → 1st map click sets
  A (preview arm stays on, rubber-band A→cursor), 2nd click sets B and disarms (reload);
  `Set A/B` armed → next map click assigns that endpoint and disarms (reload);
  nothing armed → map click is a no-op (never moves endpoints accidentally).
  `Esc` or right-click (`contextmenu`, `preventDefault`) cancels any armed mode and discards a
  pending A. Clicks on panel/drawer/navbar never reach the map handler. Starting `Draw line`
  or `Set A/B` while another pick mode is armed switches to the new mode.
- Out-of-domain endpoints clamp to ECMWF_HR bbox (live header/x/y; 60–150E × -10–60N fallback)
  + one toast max per gesture. `A==B` (length < ~0.25°) rejected + toast, keep old line.
- Eye hides panel+overlay; ✕ removes listeners/sources/panel (mirror destroy).
---

## 3. Server design (two endpoints, same file-cache + sampler core)

### 3.1 GET /api/data/lineheight/profile — one lead x 10 levels x N nodes

```
GET /api/data/lineheight/profile
  ?model=ECMWF_HR & cycle=<YYMMDDHH 8 digits> & lead=<0..240>
  & levels=1000,925,850,700,600,500,400,300,250,200 (1..10 ints, 10..1050)
  & lon0=<A lon> & lat0=<A lat> & lon1=<B lon> & lat1=<B lat>
  & npoints=<2..81, default 41>
```

- Nodes server-side: interpolate npoints along geodesic slerp (equirect lerp accepted fallback
  for <=2000 km + comment; distances always haversine). Default ~1100 km @ 41 pts ~= 27 km.
- Tasks: len(levels) x 4 elements (default 40). Each = fetch/decompress one
  `(table,subPath,file=<cycle>.<lead:03d>)` blob (cache → singleflight → Cassandra → mock,
  same as processTask), then SampleGridPoint each of N nodes. Per-task = N scalars (or N U/V).
- Stream: same NDJSON — totalTasks=len(levels)*4 progress lines
  `{type,loaded,total,ok,failed,cacheHits,lastSource}` then one result:
  `{type:"result",pointA:{lon,lat,i,j},pointB:{...},distKm,lead,cycle,levels,
  rh[level][pt],tmp[level][pt],vvel[level][pt],u[level][pt],v[level][pt],
  missing{rh,tmp,vvel,wind},stats}`. null = gap (client → NaN; never fabricate).
- Validation 400s: bad cycle, lead out of range, levels violations, non-numeric/out-of-range
  lonlat (-180..360/-90..90), npoints range, `..`/`%00`, A~=B degenerate (angular sep >= ~0.1°),
  whole-segment-out-of-domain → 400 (probe node 0 like first-task probe; partially-out returns
  edge-clamped samples + missing counts, never extrapolate).
- Cost: 40 blobs/lead (vs 520 point time–height); response 10x41x6 floats ~= 30–60 KB.
  Timeline stepping stays interactive; repeat leads served from file cache.

### 3.2 GET /api/data/hovmoller/profile — N leads x 1 level x N nodes

```
GET /api/data/hovmoller/profile
  ?model=ECMWF_HR & cycle=<8 digits> & leads=0,12,...,144 (1..41 ints, 0..240)
  & level=<single of 1000,925,850,700,600,500,400,300,250,200> (10..1050)
  & lon0=&lat0=&lon1=&lat1= & npoints=<2..81, default 41>
```

- Tasks: len(leads) x 4 (default 52). Same fetch/sample/stream core; result matrices
  `[lead][pt]` (rh/tmp/vvel/u/v) + {pointA,pointB,distKm,cycle,leads,level,missing,stats}.
- Same validation/caps; leads rules copy existing parseIntegerList(leads,1,41,0,240);
  single level param (reject lists).
- Cost: 52 blobs per span load; response 13x41x6 ~= 40–80 KB.

### 3.3 Shared vs new

- SHARED unchanged: SampleGridPoint/IsValidScalar/DetectWindSpeedDir, filecache+singleflight,
  db.GetBlob, mock GenerateMockGrid, main.go timeout posture (both routes get the same
  ResponseController write-deadline exemption as timeheight/profile).
- NEW: `server/handler/lineheight_handler.go` + `server/handler/hovmoller_handler.go` (each <600
  lines; common transect math + NDJSON helpers in `server/handler/lineprofile_common.go`:
  parseTransectParams, buildTransectNodes, haversineKm, task/result types), routes in
  `server/cmd/main.go`, Go tests (§8). Merging into one `lineprofile_handler.go` with
  mode=section|hovmoller accepted — wire contracts fixed, file split flexible.
---

## 4. Config (client/config.json — two new groups)

- `composite-ec-lineheight` / "EC Line-Height Cross-Section (RH+T+VVEL+Wind)" /
  category "NWP Line-Height Profile", isObservation=false, hasLevel=false,
  defaultLevel=null, colormap RH; one layer id `ec-lineheight-diagram`, type `lineheight`,
  model ECMWF_HR, element RH, visible+removable true.
- config: lon0 115.0, lat0 28.0, lon1 125.0, lat1 38.0, npoints 41, lead null (=follow
  win.period; header always shows effective lead), levels [1000,925,850,700,600,500,400,
  300,250,200], flipDirection false (display-only A<->B mirror, zero fetch, persisted,
  button label A->B / B->A), showRH/showTemp/showVVel/showWind/showTransectMarker true.
- `composite-ec-hovmoller` / "EC Time-Line Hovmoller (RH+T+VVEL+Wind @ level)" /
  category "NWP Time-Distance Profile"; layer id `ec-hovmoller-diagram`, type `hovmoller`.
- config: same A/B/npoints, initCycle null, startHour 0, endHour 144, stepHours 12,
  level 850 (single), show* true. No `lead` key — time axis is the span.
  View state (both display-only, persisted, zero fetch): `axisSwap: "dist-x"` (default;
  `"time-x"` = swapped X=time/Y=distance) and `timeDir: "fwd"` (default 0→end;
  `"rev"` = end→0, mirrors time–height `timeDirection ltr/rtl`).
- Layer types `lineheight` + `hovmoller` are new first-class values.
---

## 5. Client design (new client/src/layers/lineprofile/, each file <600 lines)

- lineUtils.js: validateEndpoints (numeric, in-range, angular sep >=0.1deg, segment
  intersects ECMWF_HR domain; v1 clamp endpoints, reject fully-outside+toast),
  buildTransectNodes(a,b,n)->{lons,lats,distKm,totalKm} (slerp; lerp fallback+comment;
  haversine cumulative), flipLine (display reverse), decimateStride. Pure, tested.
  Wire carries only A/B/N (server authoritative); client math for overlay+ticks.
- lineHighlight.js: amber LineString + A/B circles; ids lp-line-source/halo/a/b; show/hide/remove.
  Adds preview datum: pending-A marker (`lp-line-pending`) + rubber-band line (`lp-line-preview`)
  updated on map `mousemove` while `Draw line` waits for B; both removed on commit/cancel/destroy.
- lineHeightLoader.js: GET lineheight/profile -> {pointA,pointB,distKm,lead,levels,
  rh/tmp/vvel/u/v[level][pt],missing,stats}; NDJSON progress + cancel (copy loader core).
- hovmollerLoader.js: GET hovmoller/profile -> matrices [lead][pt]; same stream/cancel core.
- lineHeightPanel.js + lineHeightCanvas.js: section X=km linear 0->L flippable, Y=log-p
  pressureToFy reuse; cursor selected-lead becomes headline badge `+<lead>h` (not vertical
  line — no time axis); ticks 0,L/4,L/2,3L/4,L + endpoint lonlat; Y ticks same 10 levels.
  Reuse renderRHFill/renderTempLines/renderVVelLines/renderWindBarbs unchanged (generic
  xFn/yFn + [level][pt]; only x array leads->distKm). Hover: dist|p|T/RH/omega/wind.
- hovmollerPanel.js + hovmollerCanvas.js: orientation state `{ axisSwap: "dist-x"|"time-x",
  timeDir: "fwd"|"rev" }` (both display-only, persisted, zero fetch; mirror time–height
  `timeDirection`). Mappings: `leadToFy=(lead-start)/(end-start)` (0 top) and
  `leadToFx` (same fraction left→right, or right→left when `rev`); `distToFx=dist/L` and
  `distToFy=dist/L` (0 bottom, L top; A–B flip stays part of line `flipDirection`-style handling
  if added — out of v1, only time reverts). `dist-x`: X=dist (0 left), Y=lead (fwd: 0 top,
  rev: end top). `time-x`: X=lead (fwd: 0 left, rev: end left), Y=dist (0 bottom always).
  renderHovRHFill cell-average over [lead][pt]; renderHovLines via griddata.contour in (u,v)
  coords with getTempLevels/getVVelLevels (bold ω=0, dashed ascent; factor shared style
  consts if dup >~30 lines); renderHovBarbs decimated via drawWindBarbCanvas. Ticks/hover/
  footer are axis-aware: `dist-x` ticks X=0,L/4,L/2,3L/4,L km + Y=+start..+end h, hover
  `+<lead>h | <dist> km`; `time-x` transposed with hover `<dist> km | +<lead>h`; `rev` mirrors
  time ticks/labels/readouts. Footer always `A->B L km · nLeads x N pts @ level hPa · gaps n`
  + view badge `[X:dist|time · 0→end|end→0]`.
- lineHeightController.js + hovmollerController.js: per-window state (copy WindowState:
  activeLine, cycle/lead|span/level, matrix, matrixCache<=20, loadingSeq+abort, pick-click
  lifecycle, _persistConfig). Hov controller additionally holds view { axisSwap, timeDir } +
  setAxisSwap()/setTimeDir() (display-only: remap + re-render + persist, zero fetch).
  Pick state machine per window: `pickMode: "idle"|"draw"|"setA"|"setB"` + pending A;
  `startDraw()` / `setAFromMap()` / `setBFromMap()` arm (switching discards pending A),
  `cancelPick()` disarms; map `click` + `mousemove` (preview) + `contextmenu` + global `Esc`
  keydown drive it; destroy/hide detach all four listeners.
  No shared state with timeheight controller.
- lineProfileLayer.js: facades loadLineHeightLayer/remove/setVisibility +
  loadHovmollerLayer/remove/setVisibility (mirror timeHeightLayer.js).
---

## 6. Timeline / keyboard / window-focus wiring (core of this plan)

### 6.1 Group 1 follows global NWP timeline (slider VISIBLE)

- Chip / prev-next / arrows / play tick: bootstrap onTimeChange({period}) ->
  loadPresetGroup(isTimeStep=true). NEW branch: hovmoller active -> ignore (no-op);
  lineheight active -> lineHeightController.setLead(period,win) = FULL section reload
  for that lead (abort prior, progress, server-cached). Time–height keeps cursor-only
  updateCursorLead. Init-cycle select (isInitChange) -> setCycle -> reload same lead.
- Group 1 has NO span controls. Play works (each tick = one 40-grid section reload);
  debounce 150ms + abort-in-flight so fast play never piles up; doc as convenience.
- Prefetch: SKIP both new types (same guard as timeheight) — span/lead-driven profile
  fetches do not benefit from adjacent-grid prefetch; server file cache covers repeats.
- win.period stays single source of truth for Group 1 lead. win._nwpTimeline /
  setTimelineMode("nwp") payloads unchanged. Invert time–height hide-slider condition
  (windowFocus.js + bootstrap onWindowFocus): hide slider ONLY for hovmoller layers,
  NOT for lineheight.

### 6.2 Group 2 owns its time (global timeline HIDDEN + ignored)

- windowFocus isHovmoller + bootstrap onWindowFocus: setTimeSliderVisible(false) when
  focused group is composite-ec-hovmoller or has hovmoller layer (extend isTimeHeight
  checks, do not replace).
- presetLoader.loadPresetGroup(isTimeStep=true) with hovmoller active -> early no-op.
  Internal setSpan/setLevel/setCycle/setLine drive hovmollerController.loadMatrix.
- changeVerticalLevel (Up/Down, level selects) must NOT touch Hovmoller level: guard by
  layer type — diagram-hovmoller windows step only map-plane contours if present, never
  controller.level. Group 1 has no level concept (fixed 10) so Up/Down never reach either.

### 6.3 Keyboard (keyboardShortcuts.js + bootstrap bindings; no new keys v1)

- Left/Right (onPeriodStep): Group 1 focused -> default (win.period -> section reload).
  Group 2 focused -> SWALLOW (no global step/reload). Impl: bootstrap onPeriodStep closure
  checks hovmollerController.isActive(win) first, early return.
- Up/Down (onLevelStep): swallow for both when their diagram is window-active (no win.level
  semantics). Optional Phase-4: remap Up/Down to Hovmoller level stepping — out of v1.
- isTextInput guard already protects A/B + span fields; pick-arm + `Esc`/right-click in
  controllers (Esc handler checks pickMode first, stops propagation only when armed, so global
  shortcuts are unaffected otherwise).
---

## 7. Registration checklist (missing one breaks load/toggle/config)

1. client/config.json: two groups per §4 (shape test like config.test.js).
2. presets.js: data-driven, no code change expected; cover new ids in tests.
3. configSchema.js: ALLOWED_LAYER_TYPES += lineheight,hovmoller + per-type config
   validation (A/B numeric, npoints 2–81, Group1 fixed 10 levels, Group2 single
   level in PROFILE_LEVELS, span/step via SUPPORTED_STEPS, axisSwap dist-x|time-x,
   timeDir fwd|rev).
4. layerDefaults.js: buildBaseConfig branches (defaults = §4).
5. layerRowView.js: renderLineHeightDrawerHTML + renderHovmollerDrawerHTML
   (A/B inputs, Draw-line + Set-A/B pick buttons, N select; G1 lead badge;
   G2 level + span + swap/reverse buttons).
6. Bindings: new lineProfileDrawerBindings.js wired in dispatcher alongside timeheight.
7. visibilityActions + actionsDispatcher: show/hide/remove per type.
8. presetLoader.js: loadPresetGroup branches (lineheight init vs setLead on isTimeStep;
   hovmoller init vs no-op on isTimeStep) + clearAllWeatherLayersFromMap teardown +
   schedulePrefetch skip.
9. bootstrap.js: onTimeChange fan-out, onWindowFocus slider + controller show/hide,
   onPeriodStep/onLevelStep guards, lazy onWindowInit loads.
10. windowFocus.js: extend hide-slider with isHovmoller (G1 keeps slider).
11. prefetchService.js: skip lineheight/hovmoller (mirror timeheight guard).
12. configEditor.js: preset-shape validation passes for both types.
13. server/cmd/main.go: register /api/data/lineheight/profile + /api/data/hovmoller/profile.

## 8. Tests (green before merge)

- Bun client/test/lineprofile/: lineUtils (haversine 1deg lat ~=111 km, slerp endpoints
  exact, distKm monotonic, degenerate reject, flip involution, stride caps); loaders
  (mocked NDJSON: exactly 1 fetch/load, monotonic loaded, cacheHits/lastSource, cancel
  aborts + keeps prior, null→NaN gaps, A~=B zero fetches); canvas (x(0)=left,x(L)=right,
  flip mirrors, pressureToFy reuse, leadToFy(0)=0 top; hov swap dist-x<->time-x mirrors
  ticks/fills/lines/barbs/hover with zero fetches, rev mirrors time axis zero-fetch,
  swap+rev compose to 4 views, config persists both, all-NaN no throw); controllers
  (two windows isolated; pick state machine draw/setA/setB/cancel/disarm + rubber-band preview + Esc/contextmenu cancel + disarmed-click no-op; G1 setLead reloads + step calls setLead not cursor;
  G2 isTimeStep no-op + arrow swallow).
- Go handler tests: validation table (bad cycle/lead(s)/level(s)/lonlat/npoints/traversal/
  A~=B → 400; fully-out-of-domain → 400), mock-stream (G1 levels=850,500&lead=24&npoints=5
  → 8 progress + result[2][5]; G2 leads=0,12,24&level=850&npoints=5 → 12 + result[3][5]),
  monotonic progress + mock source, cancel-context no-hang, parity (1-node == SampleGridPoint
  direct within 1e-4; multi-node == per-node loop).
- Suites: go test ./... + bun test (record updated counts in merge note).
---

## 9. Rollout phases

- P1 Wire+server: lineprofile_common.go + two handlers + routes + Go tests (mock e2e first,
  live bore.pub parity spot-check one A/B line).
- P2 Shared client core: lineUtils + lineHighlight + both loaders + Bun tests;
  prefetch/schema/layerDefaults guards.
- P3 Group 1: section panel/canvas/controller/facade + drawer + setLead-on-isTimeStep +
  chips/buttons/keys/play/draw-click verification (L1–L8).
- P4 Group 2: hov panel/canvas/controller + level/span + swap/reverse view controls +
  slider-hide + step-swallow (H1–H9); drag-handles + Up/Down level remap stretch if time allows.
- P5 Docs: Architecture.md transect section (endpoints, matrices, timeline-ownership table),
  README flags if any, record heap/response sizes (targets <=100 KB/load, browser matrices
  only — no grids, same as Plan2 P1).

## 10. Verification V-table

G1 Line–Height: L1 preset shape (config.json + loadPresetGroups + editor); L2 cold load mock
40 progress → RH+T/VVEL+barbs over distance×pressure, header +lead h; L3 timeline follow
(chip/◀▶/←→ → 1 lineheight request/step; step-back instant from matrixCache); L4 endpoint edit
(numeric B, Draw-line two-click re-draw with rubber-band + Esc/right-click cancel, Set-A/B fix-up,
click with nothing armed = zero fetches → overlay moves, reload, persist lon0/lat0/lon1/lat1); L5 flip mirrors zero-fetch;
L6 cancel/partial (monotonic bar; Cancel keeps prior; missing level → NaN gap + failed count,
1 toast max); L7 eye/close/multi-window isolation; L8 play debounce+abort, no pile-up/flash.

G2 Hovmoller: H1 preset shape; H2 cold mock 52 progress → RH+T/VVEL+decimated barbs over
 distance×lead @850; H3 no-timeline (slider hidden; chip/arrows/play/isTimeStep = zero
 hovmoller fetches via spy); H4 level select 850→500 reloads (1 req), header/footer update,
 back-step from cache; H5 span 0–72@6 → 13 rows, overlap cached, invalid toast+revert no storm;
 H6 endpoint edit/flip as L4 (Draw-line two-click + Set-A/B + cancel + disarmed-no-op); H7 cancel/partial on [lead][pt]; H8 eye/close/multi-window;
 point + line + hov coexist in three windows. H9 swap+reverse: swap toggles dist-x<->time-x
 (axis/ticks/fills/lines/barbs/hover transpose, footer badge flips, zero fetches via spy,
 config persists axisSwap); reverse toggles 0→end<->end→0 (time ticks/labels mirror,
 zero fetches, persists timeDir); combined 4 views all render without throw.

## 11. Risks and decisions

1. G1 reload cost: each lead step = 40-blob server job. Masks: file cache (repeats free),
   abort+debounce, matrixCache<=20, play-as-convenience. Follow-up if slow: multi-lead
   section endpoint — NOT v1 (keep wire small).
2. Hov orientation default X=distance/Y=time-down is the convention and shares xFn with the
   section; swapped X=time/Y=distance is now IN v1 as a display-only `axisSwap` toggle (§2.2,
   §5 — coordinate remap only, no data transpose on the wire). Time revert (`timeDir fwd/rev`,
   mirrors time–height `ltr/rtl`) composes with swap → 4 views; both must be covered by H9
   zero-fetch tests so a future refactor cannot silently refetch.
3. Geodesic vs lerp: slerp; <=2000 km lerp differs <0.5% — either ok if commented + tested.
4. Keyboard surprise: swallowing arrows in Hov windows confuses global-step expectation.
   Mask: panel hint badge ("Time controlled here — timeline parked") + hidden-slider tooltip.
5. Id naming: hovmoller not timeline (avoids ui/timeline collision); UI strings say Time–Line.
   Layer ids ec-lineheight-diagram / ec-hovmoller-diagram, overlay lp-line-* avoid th-*/tlogp-*.
6. Line-count rule: ~10 small modules, none >=600 lines; canvas split fill/lines/barbs/axes.
