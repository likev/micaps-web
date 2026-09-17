# UI Play-Loop Review 1 — `#btn-play` Playback Loop

**Date:** 2026-09-15
**Scope:** `client/src/ui/timeSlider.js` (play loop `startPlayback`/`pausePlayback`/`step`, `initTimeSlider` wiring, chip render, `setTimelineMode`, `setStepLength`, visibility/blur guards), `client/src/main.js` time-change consumer, `client/src/services/prefetchService.js` interaction, `client/src/store/appState.js` `isPlaying`/`playbackSpeed`, `client/src/style.css` `.play-btn`, `client/src/ui/tabWindowManager.js` focus path, `client/src/utils/timelineSync.js` background-sync path, existing tests.
**Method:** Static code reading at HEAD `a8b3408`, `grep` traces for `btn-play`/`playTimer`/`isPlaying`/`setInterval`, full reads of `timeSlider.js` (709 lines), `main.js` time-change handler (288-408), `prefetchService.js` (412 lines), `style.css` play rules, `tabWindowManager.focusWindow`, `timelineSync.syncObservationTimeline`. No live browser.
**Verdict:** **1 critical (P0: obs-preset play self-pauses after one tick) + 3 moderate + 9 minor findings.** Core start/stop, button sync, auto-pause-on-hide, and review-2/3 a11y fixes (`.active` + `aria-pressed`) all hold for NWP and non-preset obs; no crash. The loop is the thinnest wrapper around `step(+1)` — so most play-loop defects are inherited from the underlying step/load pipeline (P0 self-pause, async-overlap pile-up, silent wrap-around, per-window/global state split), plus two defects owned by the loop itself (re-entrancy, dead speed control).

**Update 2026-09-15 (evening) — fix verification:** all 13 items (P0 + M1/P1/m4/M2/M3/L1/m6/m7/m8/m9/m10) are fixed in the working tree (uncommitted). Full suite green: **243 pass / 0 fail** across 23 files, incl. `client/test/ui_play_loop_review1_fixes.test.js` **18/18 pass** (13 fix tests + 5 residual R1–R5 tests). Details in §7. Residuals R1–R5 fixed and locked by tests; R6 (stale line refs in §§1–6) is documentation-only.
> **Line-number note:** §§1–6 cite the reviewed HEAD `a8b3408` (`timeSlider.js` 709 lines). The fix adds ~200 lines (`timeSlider.js` now 910 lines), so all `timeSlider.js:` cites below point ~40–180 lines low. §7 cites post-fix lines.

---

## 1. What works (verified)

| Area | Evidence | Verdict |
|---|---|---|
| Button toggle + visual/a11y sync | `timeSlider.js:245` renders `#btn-play.play-btn` with `title` + `aria-label` + `aria-pressed="false"`; click `279-285` branches on `playTimer`; `startPlayback` sets `❚❚` + `.active` + `aria-pressed=true` (`539-544`), `pausePlayback` restores `▶` + removes `.active` + `aria-pressed=false` (`564-569`). CSS `.play-btn.active` blue-dark + glow `style.css:690-693`. Closes ui-review2 S3 and ui-review3 confirms PASS | **Works.** Text+class+ARIA triple-sync |
| `isPlaying` single-writer discipline | Only writers are `startPlayback:546` (`true`) and `pausePlayback:571` (`false`); no external module writes `isPlaying` (grep: only `timeSlider.js` + `appState.js:39` decl) | **Works.** No split-brain on the flag |
| Auto-pause on hide/blur | Once-guard `document.__timeSliderVisibilityBound` (`650`), `visibilitychange → hidden ⇒ pause` (`652-654`), `window blur ⇒ pause` (`656`). Fixes ui-review1 "animation continues in background tab" | **Works** (with L1 caveat: pause-only, no resume) |
| Pause on any timeline mutation | `setTimelineMode:641`, chip click (`280-314`, every select path calls `pausePlayback` first `280`), `setStepLength` NWP (`352`) and obs (`377`) call `pausePlayback`. Stepping while playing stops the loop instead of fighting it | **Works, except P0.** Correct for user-initiated mutation, but the play tick's own obs-preset loader re-enters `setTimelineMode` and self-pauses after one frame — see P0 |
| Tick delegates to canonical `step(+1)` | `553-555`: `setInterval(() => step(1, {source:"btn-play", directions:["next"]}))`. Play inherits chip/label/callback/prefetch of manual next (`496-535`) — no forked logic | **Works by design** (but inherits P0 on obs-presets / P1 on slow links) |
| Wrap-around deliberate + consistent | `step` modulo both branches (`505`, `518`); prev/next share it (`276-277`). Prior reviews: "consistent but undocumented" | **Works.** M3 below only because loop amplifies it |
| Directional prefetch hint | Tick passes `directions:["next"]` (`554`); `main.js:375/296` stores `win.prefetchDirections`; commit `4a90798` constrains play/next to next-only. `startPlayback` fires immediate `schedulePrefetch(null,0,{directions:["next"]})` (`549-551`) | **Works with caveat** — see m4 (null-win target) |
| Interval source documented | `appState.get("playbackSpeed") \|\| 1800` (`555`) with `appState.js:40` default `1500`. 1500-vs-1800 mismatch is itself a defect (M2) | Works mechanically |

---

## 2. Findings (part 1 — critical + loop-owned defects)

### P0 [Critical] Obs-preset play self-pauses after exactly one tick — the play tick's own loader re-enters `setTimelineMode`

```js
// tick: timeSlider.js:553-554 → step obs branch 503-515 → onTimeChange{isObs,file}
// main.js:295-340: win.obsTime = data.file; … await loadPresetGroup(…, win.period, win.level, win, true, expectedSeq)
//   — note: passes win.level (almost always non-null, e.g. 500 leftover) even for SURFACE
// main.js:1062: if (!file || (group.isObservation && level !== null))
//                  file = await syncObservationTimeline(obsPath, win?.obsTime, winTitle, win);
// timelineSync.js:168-169: active win → setTimelineMode("obs", …)
// timeSlider.js:641: setTimelineMode → pausePlayback() unconditionally → clearInterval, ▶, isPlaying=false
```

- Symptom: press `▶` on a surface (`config.json:394 composite-surface`, `isObservation:true`) or upper-air (`config.json:441 composite-upperair`) preset → advances exactly one chip → button flips back to `▶`. This is the reported "surface/upper_air can't loop / auto-pause" bug.
- Non-preset obs (`win.activeGroup == null` → `loadUpperAirComposite`/`loadObservationProduct`, `main.js:346/348`) never calls `syncObservationTimeline`, so it loops fine — the bug hits only preset groups, and only when `level !== null` (the normal case, since `win.level` persists).
- Correction to this review's original pass: §1 endorsed the `setTimelineMode:641` pause as "correct conservative choice" and m6 marked the obs path "safe" — true only for *background*-window deferral (`_pendingTimeline`, `timelineSync.js:170-171`); the *foreground* play-driven loader re-enters it on every tick.
- Fix (pick one): (a) skip the re-sync on time-step ticks when a valid file is already in hand — `if (!file || (!isTimeStep && group.isObservation && level !== null))` at `main.js:1062`; (b) add a `silent`/`pause:false` option to `setTimelineMode` for loader-originated syncs. (a) is one line and also saves a `fetchTree` per tick.


### M1 [Moderate] `startPlayback` is re-entrant — double start leaks an interval (2x speed, one pause kills only one)

```js
// timeSlider.js:537-555
function startPlayback() {
  ...button sync...                 // 538-545
  appState.set("isPlaying", true);  // 546
  try { schedulePrefetch(...); } catch {}   // 549-551
  playTimer = setInterval(() => {   // 553 — overwrites handle, never clears first
    step(1, { source: "btn-play", directions: ["next"] });
  }, appState.get("playbackSpeed") || 1800);
}
// click: 279-285 — if (playTimer) pause else start; no debounce
// initTimeSlider: 236-285 — re-calling re-binds ANOTHER #btn-play click listener
//   on the SAME element (getElementById + addEventListener, no once/remove)
```

- Click handler reads `playTimer` synchronously so a single click is safe, but **two `startPlayback()` calls without an interleaved pause orphan the first interval**: the first handle is overwritten at `553` and `pausePlayback`'s single `clearInterval(playTimer)` (`560`) only stops the second. Net: steps fire 2x per tick until a second pause/start cycle, or permanently if the handle is lost.
- Reachable: (a) double `initTimeSlider("timeslider-container", ...)` (main.js calls once at `235`, but HMR / test re-import / re-init adds a second click listener — both fire per click, i.e. start+start); (b) programmatic double-start; (c) any future keyboard shortcut bound to the same function.
- Fix (2 lines): guard at top — `if (playTimer) return;` (or clear first), plus once-guard in `initTimeSlider` mirroring `__timeSliderVisibilityBound` (`650`), or `btnPlay.replaceWith(btnPlay.cloneNode(true))` before binding.

### P1 [Moderate] `setInterval` tick overlaps `async onTimeChange` loads — play outruns fetch, responses resolve out of order

```js
// timeSlider.js:553 — fire-and-forget, no await, no outstanding-load guard
playTimer = setInterval(() => { step(1, {...}); }, speed);
// step:508-515 / 523-532 — invokes sync onTimeChangeCallback, return value ignored
// main.js:288 — the callback is `async (data) => { ... await loadPresetGroup /
//   loadWeatherField / loadUpperAirComposite ... }` (340/346/348/359/361/403/405)
// NWP branch HAS win.loadSeq/expectedSeq stale-discard (379-380,469);
// OBS path: seq bumped at 297-298, but ui-review3 section 4 already notes
// "OBS time-step has no loadSeq stale guard (NWP does)" for the render path
```

- `step()` returns `void`; the interval never awaits the previous frame's `fetchGridData`/`fetchStationObservations`. At 1.5 s/frame a slow grid fetch (> tick) means 2-3 loads in flight; each completion renders unless discarded by the NWP `loadSeq` check, so slow frame N can paint *after* fast frame N+1: visible flicker, final frame not the newest chip.
- `schedulePrefetch` 150 ms debounce (`prefetchService.js:382-393`) only paces best-effort neighbours, not primary loads — and on obs presets P0 above fires first, so the loop never survives long enough to overlap there.
- Biggest operator-visible defect on NWP/slow links: chips advance smoothly while the map lags 1-2 frames then jumps. Fixes, cheapest first: (a) self-scheduling `setTimeout` chain armed after the callback settles — needs `step` to return the callback's promise; (b) skip-a-tick `if (loading) return` flag around the awaited callback; (c) extend `expectedSeq` discard to every OBS play-driven call and define converge-on-latest policy.

### m4 [Moderate] Playback prefetch targets the wrong window (`schedulePrefetch(null, ...)`)

```js
// timeSlider.js:548-551 — "Immediately prefetch next step when playback starts"
try { schedulePrefetch(null, 0, { directions: ["next"] }); } catch {}
// prefetchService.js:382-383: winKey = win?.id || w-winIdx || "default"
// prefetchService.js:54: timelineSteps = options.timelineSteps || getAdjacentTimeSteps()
// prefetchService.js:269+: prefetchSurroundingData(win=null, ...) — getLayersForWindow(null),
//   win.activeGroup, win.forecastCycle all fall back to global-timeline guess
```

- Every real tick correctly threads `directions:["next"]` through `step → onTimeChange → win.prefetchDirections → main.js:891/892,623/892,1086/1218` per-window debounced prefetch. But the *immediate* burst on start passes `win=null`: resolves under key `"default"`, reads the global `getAdjacentTimeSteps()` snapshot, has no `win.layers/activeGroup/forecastCycle` — exactly the multi-window skew `Architecture.md 11.7` warns about (`prefetchTimers` keyed per-window so W1 must not disturb W2).
- 1x1: harmless (global == active). 2x2/multi-tab: warms the cache for the wrong window, under a `"default"` key no later `cancelScheduledPrefetch(win)` cancels.
- Fix: `schedulePrefetch(getActiveWindow?.() ?? undefined, 0, {directions:["next"]})` — lazy-import like `focusWindow` does (`527/541`) to avoid the `tabWindowManager <-> timeSlider` cycle, or thread win through `startPlayback(win)`.

### M2 [Minor] Playback speed is dead configurability — no UI, two disagreeing defaults (1500 vs 1800)

- `appState.js:40`: `playbackSpeed: 1500`; `timeSlider.js:555`: `appState.get("playbackSpeed") || 1800`. Fresh `appState` yields 1500 (truthy, fallback never fires) so effective speed is 1500 ms; `1800` only applies if someone sets speed to `0/null`. ui-review1 already flagged "Speed control exposed via appState.playbackSpeed but no UI slider — dead configurability" — still true: `grep playbackSpeed client/src` hits only those two lines + the review doc.
- Speed snapshotted once at `startPlayback`; mid-play change has no effect until stop/start (zero `appState.subscribe` consumers in `src/`).
- Fix: expose a speed select next to step-length (e.g. 0.5x/1x/2x = 3000/1500/750 ms) that pause+starts on change, or delete the field and hard-code one `DEFAULT_PLAYBACK_MS` export. Minimum: unify the constant.

---

## 2. Findings (part 2 — pipeline / policy defects the loop amplifies)

### M3 [Minor] Infinite wrap-around has no stop affordance — play never ends, last→first cut is abrupt

- `step` modulo (`505` obs / `518` nwp) means play cycles forever. For a 6 h NWP run (+000→+240, ~30 chips, ~45 s/loop) arguably desired; for a single-cycle forecaster the +240 h → +000 h cut snaps contours, jumps the window title, no toast/chip flash.
- Prior disposition "consistent but undocumented" (ui-review1 `step(delta)`, ui-review2 chips) stands for *manual* stepping; for *autoplay* recommend: stop-at-end (pause, keep last chip), or one-frame dwell + title flash on wrap, or minimum `title="Play / Pause Animation (loops)"` hint. Cheap: make `step` return `{wrapped:boolean}` (currently `void`) so the tick can `pausePlayback()` on wrap under a `loop=false` option.

### L1 [Minor] Auto-pause is pause-only; window-switch keeps playing a stale window's timeline

- `visibilitychange/blur → pause` (`652-657`) is right for resources, but no resume on visible/focus (correct — avoids surprise autoplay — but undocumented; one comment line would help).
- Load-bearing half: `focusWindow` (`tabWindowManager.js:460-552`) replays `_pendingTimeline/_obsTimeline/_pendingNwp/_nwpTimeline` via `setTimelineMode`, and `setTimelineMode` pauses (`641`) — good. But the early-return path (`484-487`, already-focused) and `switchTab` paths that skip the timeline leave a running interval bound to *module-global* `currentPeriodIdx/currentObsIdx` (not per-win). Switch windows mid-play → chips/labels describe window B while ticks advance the shared index and fire loads into B with A's cadence. Fix: `pausePlayback()` on every `focusWindow`/`switchTab`, or per-win play ownership.

### m6 [Minor] `pausePlayback` is over-broad: background `setTimelineMode` kills user-intended play silently

- `setTimelineMode:641` pauses unconditionally — including background syncs. Obs background path is safe (`timelineSync.js:164-175` defers via `_pendingTimeline`); NWP background path (`main.js:139/166`, `focusWindow` replay `541-548`) calls `setTimelineMode("nwp")` directly on the foreground timeline ("Background NWP load clobbers foreground timeline", ui-review3 4.3/C3). Landing mid-play it flips `❚❚ → ▶` with no toast — looks like a button bug.
- Fix with C3: only pause for *active-window user-originated* mode changes; route background NWP syncs through `_pendingNwp` (already exists `538-549`). The *foreground* obs-preset self-pause is now tracked separately as P0 above — m6 covers only background-originated pauses.

---

### m7 [Minor] No keyboard control, no disabled/empty state, no loading indicator

- `keyboardShortcuts.js:23-69` binds arrows/F4 only; Space (universal play/pause) unbound. Recommend `Space`/`Ctrl+Space` → toggle when timeline visible and focus not in input — one `initKeyboardShortcuts` option.
- `#btn-play` never `disabled` while a frame loads or when timeline is empty/singleton (contrast `Load Data:disabled` in `navBar.js`). Single-frame timelines loop a no-op tick every 1.5 s (identical fetch + `updateWindowTitle` + prefetch each cycle; `step` early-returns only for `obsFiles.length===0`, not `===1`; NWP never early-returns).
- No spinner: ticks are fire-and-forget so lag (P1) is indistinguishable from stall. Minimal: `aria-busy` + `.loading` class around the awaited callback.

### m8 [Minor] `setInterval` drift + blur-vs-hidden over-trigger

- `setInterval(1500)` drifts (callback + render + GC push each tick late; error accumulates; seconds over a 10-min loop). Cosmetically fine; textbook fix is self-correcting `setTimeout(tick, speed - elapsed)`. Low priority.
- Browsers throttle background `setInterval` to >=1000 ms AND the code pauses on hidden (`653`) — belt and suspenders, fine — but `window blur` (`656`) also pauses when user focuses DevTools/second monitor while tab stays visible. Consider `document.hidden`-only, or document blur-pause as intentional.

### m9 [Minor] Module-global play state vs per-window timelines; DOM-absent skew

- `playTimer/currentMode/currentPeriodIdx/currentObsIdx` are singletons; windows carry `_obsTimeline/_nwpTimeline/stepLength/forecastCycle` each. Two windows with different step lengths share one cadence + index: play W1, focus W2 (pauses per `641`), play W2 resumes from W1 leftover index, not W2 `win.period/obsTime`. Fix: reseed `currentPeriodIdx` from `win.period` on focus, or per-win `win._playIdx`.
- `startPlayback` syncs button only `if (btnPlay)` but sets `isPlaying=true` unconditionally — headless/tests report playing with no observable timer. Harmless; tests should assert `isPlaying` + timer mock, not DOM text.
- Zero `subscribe("isPlaying")` consumers — status bar/title/tests can only poll. Emitter exists (`appState.emit`); just subscribe when a status pill needs it.

### m10 [Minor] A11y + styling residuals (small, completeness)

- `aria-label` + `aria-pressed` present (`245`) but `aria-label` never swaps Play/Pause on toggle (`539-544`/`564-569` swap only `textContent`), so SR announces the glyph literally. Swap label alongside text. No `aria-keyshortcuts` (once Space exists). No `:focus-visible` ring (only `:hover` + `.active`, `style.css:689-693`) — keyboard operators get no focus cue.
- `.play-btn` 34 px circle vs `.step-nav-btn` 28 px squares (`673-703`): intentional hierarchy, fine. `flex-shrink:0` (`685`) clips chips before button — correct priority.
- `#timeslider-container` now `min-height:60px;height:auto` (`662-663`): ui-review3 L4 fixed-60 px clip verified fixed; two-row info no longer clips button. Confirmed.

---

## 3. Interaction map (how the loop drives the system)

```
#btn-play click (timeSlider.js:279)
 |- pausePlayback() -> clearInterval, button play, isPlaying=false   (558-572)
 `- startPlayback() -> button pause/.active/aria-pressed, isPlaying=true (537-546)
     |- schedulePrefetch(null, 0, {next}) — m4: should be active win
     `- setInterval(speed) -> step(+1, {source:"btn-play"})          (553-555)
         |- obs: currentObsIdx % len -> labels+chips -> onTimeChange{isObs,file} (503-516)
         `- nwp: currentPeriodIdx % len -> labels+chips -> onTimeChange{period} (517-534)
             `- main.js:288 onTimeChange (async, un-awaited by loop — P1)
                 |- obs: snap layers -> stopWind/removeBarbs/removeRaster -> loadPresetGroup (295-350) — P0: preset + level!==null re-syncs timeline at main.js:1062 and self-pauses
                 |- init-change: forecastCycle -> clearAll -> loadPresetGroup/loadWeatherField (351-363)
                 `- nwp step: win.loadSeq++ -> win.period -> loadPresetGroup/loadWeatherField (364-407)
                     `- schedulePrefetch(win, 150, {next}) per load (624/892/1086/1218)
 visibilitychange/blur -> pausePlayback (652-657); setTimelineMode/setStepLength/chip-click -> pause (641/352/377/280)
 focusWindow replays pending/obs/nwp timelines (tabWindowManager.js:523-549)
```

---

## 4. Recommended fixes (ordered by value/effort)

0. **P0 — stop the self-pause (do first)** (`main.js:1062`): `if (!file || (!isTimeStep && group.isObservation && level !== null))` so play ticks reuse the tick's file and skip the `syncObservationTimeline`/`setTimelineMode` re-entry; or add a `silent` option to `setTimelineMode`. One line, and also saves a `fetchTree` per tick. Minutes.

1. **M1 — 2-line re-entrancy guard** (`timeSlider.js:537`): clear existing `playTimer` at top of `startPlayback`, plus once-guard in `initTimeSlider` (mirror `__timeSliderVisibilityBound`). Prevents 2x-speed ghost interval. Minutes.
2. **P1 — serialize or skip overlapping ticks**: `step` returns the callback promise; `startPlayback` uses a `setTimeout` chain armed after settle, or an `isTickLoading -> skip` guard. Extend `win.loadSeq/expectedSeq` discard to OBS play-driven calls. 0.5-1 day incl. tests. Highest remaining operator value after P0.
3. **m4 — active window to start-prefetch**: lazy-import `getActiveWindow` (cycle-safe pattern in `focusWindow`) and `schedulePrefetch(win, 0, {next})`. Minutes.
4. **M2 — unify speed + expose or delete**: single `DEFAULT_PLAYBACK_MS` export; optional speed select beside step-length; re-arm interval on change. 1-2 h.
5. **M3/L1/m6 — loop/window/focus policy**: stop-at-end option + wrap-hint title; `pausePlayback()` in `focusWindow`/`switchTab`; background NWP via `_pendingNwp` not direct `setTimelineMode`. 0.5 day.
6. **m7 — Space shortcut + single-frame/disabled guards**: skip tick when `len<=1`; `disabled` + `aria-busy` during load. 1-2 h.
7. **m8/m9/m10 — polish**: drift-correcting scheduler; per-window index reseed on focus; swap `aria-label` Play/Pause; `:focus-visible` ring. Small, batch.

---

## 5. Test gaps

- ~~No test covers the loop~~ (fixed — see §7): new `client/test/ui_play_loop_review1_fixes.test.js` (423 lines, 13 tests) covers P0/M1/P1+M3/m4/M2/L1/m6/m7/m8/m9/m10; `timeslider.test.js` still covers `getPeriodsForStep`/filtering/chips; `ui_review2/3_fixes.test.js` cover `.active`/`aria-pressed` CSS presence.
- Suggested (bun:test, fake timers + minimal DOM stub like `ui_review3_fixes.test.js:14-95`):
  - start→`isPlaying=true`+`.active`+`aria-pressed=true`; pause→inverse; double-start→single interval (M1).
  - tick advances index, fires `onTimeChange` with `{source:"btn-play", directions:["next"]}`; wrap documents behaviour (M3).
  - slow-callback overlap: two ticks with deferred promise → assert skip-or-serialize (P1).
  - `setTimelineMode`/`setStepLength`/chip-click pauses (lock in current behaviour).
  - P0 regression: obs-preset tick (`isTimeStep=true`, valid file, `level!==null`) does not call `setTimelineMode`/`pausePlayback` — stub `syncObservationTimeline`, assert play survives N ticks.
  - `visibilitychange` hidden pauses (dispatch on stubbed `document`).
  - speed: change `playbackSpeed` mid-play → interval re-armed (M2, post-fix).

---

## 6. File:line index

- Loop core: `timeSlider.js:7` (`playTimer`), `236-285` (`initTimeSlider` + `#btn-play` wiring), `496-535` (`step`), `537-556` (`startPlayback`), `558-572` (`pausePlayback`), `574-647` (`setTimelineMode` + pause `641`), `649-658` (visibility/blur guards).
- Consumer: `main.js:288-408` (`onTimeChange`: obs `295-350`, init `351-363`, NWP `364-407`), P0 chain `main.js:1062` → `timelineSync.js:168-169` → `timeSlider.js:641`, obs presets `config.json:394/441`, per-load `schedulePrefetch` `624/892/932/1086/1218`, `win.loadSeq` `297/379`.
- State/style: `appState.js:38-40` (`isPlaying/playbackSpeed`), `style.css:661-703` (container + `.play-btn(.active)` + `.step-nav-btn`).
- Window interplay: `tabWindowManager.js:460-552` (`focusWindow`, early-return `484-487`, replay `523-549`), `timelineSync.js:161-214` (`syncObservationTimeline`, `_pendingTimeline` deferral `164-175`), `prefetchService.js:382-393` (`schedulePrefetch`), keyboard `keyboardShortcuts.js:23-69` (no play binding).

*Prior-review closure: ui-review1 background-pause + ui-review2 S3 a11y + ui-review3 L4 container-height verified fixed at HEAD; M2 dead-speed note from ui-review1 remains open and is re-reported with the 1500/1800 mismatch. Addendum 2026-09-15: P0 obs-preset self-pause added — missed in the original pass (§1 row and m6 corrected to point at it). Verification 2026-09-15 evening: all items fixed in working tree, see §7 (243 pass / 0 fail; play-loop test file 18/18 incl. R1–R5 residual locks).*

---

## 7. Fix verification (working tree, 2026-09-15 evening)

Test result: `bun test` → **243 pass / 0 fail / 23 files**; `bun test test/ui_play_loop_review1_fixes.test.js` → **18/18 pass** (13 fix tests + R1/R2/R3/R4/R5 residual tests). Out-of-scope `pmtilesLayers.js` county `minzoom:7` change is unrelated (passing).

| Issue | Fix (post-fix lines) | Status |
|---|---|---|
| P0 obs-preset self-pause | `main.js:1077` → `if (!file \|\| (!isTimeStep && group.isObservation && level !== null))`; play ticks reuse the tick file, skip `syncObservationTimeline`/`setTimelineMode` re-entry. NWP re-sync already `!isTimeStep`-gated. Escape hatch `setTimelineMode` `pause:false`/`silent` (`timeSlider.js:837`) exists but no caller uses it yet (fine) | **FIXED** |
| M1 re-entrancy | `startPlayback` clears existing timeout first (`timeSlider.js:685`); `pausePlayback` exported; re-init calls `pausePlayback()` (`:243`) and buttons use `onclick=` — no listener stacking | **FIXED** |
| P1 overlapping ticks | `step` returns callback promise (`:550/579/572/605`); `runTick` awaits with `isTickLoading` guard + drift-corrected `setTimeout` chain (`:646-681`); stale-render discard via `win.loadSeq/expectedSeq` present (`main.js:309/391/484/882/915`) | **FIXED** (R1 race, low) |
| m4 prefetch window | start-burst lazy-imports `getActiveWindow`, falls back to `null` (`timeSlider.js:708`) | **FIXED** |
| M2 speed | `DEFAULT_PLAYBACK_MS=1500` single constant (`:7`); Speed `0.5x/1x/2x` select (`:263`); `setPlaybackSpeed` + `appState.subscribe("playbackSpeed")` re-arm mid-play (`:743-770`) | **FIXED** |
| M3 wrap | `step` returns `{wrapped}` (`:554/583`); `loop:false` stops at end (`:675/697`); title `"(loops)"` (`:250`) | **MECHANISM FIXED, not reachable** — nothing passes `loop:false`, no UI for it |
| L1 window switch | `focusWindow` pauses (`tabWindowManager.js:524`) + reseeds `pt.file/ot.file/pn.period/nt.period` (`:531/538/547/554`); NWP step syncs `win._nwpTimeline.period` (`main.js:395`); `setTabLayout:394` funnels through `focusWindow` | **FIXED** |
| m6 background clobber | bootstrap group/level NWP defer to `win._pendingNwp` when inactive (`main.js:169/235`); `loadPresetGroup` caches `_nwpTimeline` + defers (`:1032-1045`); obs bootstrap passes `win` (`:157/223`) | **FIXED**. Remaining direct `setTimelineMode("nwp")` at `:139` (active-guarded) and `:287` (foreground catalog handler) are correct |
| m7 shortcut/disabled/busy | Space → `onTogglePlay` → `btnPlay.click()` (`keyboardShortcuts.js:35/51`, `main.js:252`); singleton guard + play-source `len<=1` noop; `updatePlayButtonDisabledState` + `aria-busy/.loading` (`timeSlider.js:613/627`); CSS `:disabled/.disabled` (`style.css:694-718`) | **FIXED** (R4 Space double-toggle, low) |
| m8 drift/blur | `nextDelay=max(50,speed-elapsed)` (`:679`); `blur` removed, exported once-guarded `bindVisibilityPause`, hidden-only (`:849-857`) | **FIXED** |
| m9 global vs per-window | reseed rows above; focus-replay re-derives index from `period/file` — reported skew closed without per-win `_playIdx` | **FIXED ENOUGH** |
| m10 a11y/style | `aria-label` Play↔Pause, `aria-keyshortcuts="Space"`, `:focus-visible`, `.loading`/`:disabled` | **FIXED** |

### Residuals (all fixed, locked by tests)

- **R1 — speed-change-during-load timer churn FIXED** (`timeSlider.js:753-781`): `setPlaybackSpeed` + `playbackSpeed` subscriber skip `scheduleNextTick` while `isTickLoading`; the in-flight `runTick` reads the fresh speed (`:658`) and re-arms itself on settle. Test: `R1: speed change while a tick is loading does not re-arm a second chain`.
- **R2 — manual-step rejections unhandled FIXED**: new `fireTimeChange` choke point (`timeSlider.js:557`) logs-and-swallows sync throws and async rejections; all `step` (obs/nwp), chip-click, `setStepLength`, and init-cycle paths route through it. Playback serialization preserved — `step()` still awaits the callback before resolving. Test: `R2: throwing / rejecting time-change callbacks never reject unhandled`.
- **R3 — select listeners stack on re-init FIXED** (`timeSlider.js:318-340`): `select-step-length` / `select-playback-speed` / `select-init-time` now use `onchange=` property assignment (same idempotent treatment M1 gave the buttons). Test: `R3: re-init does not duplicate select handlers`.
- **R4 — Space double-toggle on focused `#btn-play` FIXED** (`keyboardShortcuts.js:41`): shortcut returns early when `e.target.id === "btn-play"` or `tagName === "BUTTON"` (native click already activates). Test: `R4: Space on focused #btn-play does not double-toggle`.
- **R5 — P0 guard has no content assertion FIXED**: new test `R5: P0 guard skips obs re-sync on time-step ticks with a valid file` asserts the `!isTimeStep &&` guard string at `main.js:1077`.
- **R6 — stale line refs (documentation-only, kept)**: §§1–6 cite HEAD `a8b3408` (`timeSlider.js` 709 lines; now ~940). See note at top; no renumbering done.


