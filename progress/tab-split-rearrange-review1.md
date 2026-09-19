# Tab-Mode / Split-Mode Toggle & Rearrange - Review 1

Date: 2026-09-19 - Scope: uncommitted working-tree changes (`git status` vs `main` @ `1256b13`)
Reviewer: Muse Spark (working-tree review; no commits made)

## 0. Verdict (TL;DR)

**Approve with small fixes.** Direction is right and the core bugs of the old
model are fixed (positional-ID renames orphaning maps/legends; entering split
losing focus; hidden wins unreachable). No import cycles, no syntax errors, and
the two most-related suites still pass on the working tree.

Must-fix before commit (all small, see section 4): **F1** background-close focus
theft, **F2** `syncMap` guard mismatch, **F3** pill `dataset.tabId` + drop by
stable id, **F4** dead code/nits (unused import, dead `wIdxHint`, unused helper).
**Remember `windowReorder.js` is untracked (`??`) - it must be `git add`ed.**

## 1. Scope of changes

```text
M client/src/tabs.css                  (slot-visible contract + DnD affordances)
M client/src/ui/configEditor.js        (prevActiveWinId restore, tabs always visible)
M client/src/ui/legend.js              (live Wn prefix)
M client/src/ui/tabWindowManager.js    (facade re-exports + enableWindowReorderDnD)
M client/src/ui/tabs/tabsBarView.js    (stable pill ids, draggable, always-visible)
M client/src/ui/tabs/tabsStore.js      (+37: getNumVisible/getVisibleWindows/isWindowVisible)
M client/src/ui/tabs/windowFocus.js    (stable pill lookup, applySplitVisibility on focus)
M client/src/ui/tabs/windowMaps.js     (sync scoped to visible set)
M client/src/ui/tabs/windowPanels.js   (stable uid ids, close + setTabLayout rewrites)
M client/src/ui/tabs/windowTitles.js   (labelId lookup)
?? client/src/ui/tabs/windowReorder.js (new, ~280 lines: reindex/apply/reorder/DnD)
```

Stat: 10 files changed, 205 insertions, 180 deletions (plus the new file).

## 2. What the change intends (reconstructed)

1. **Tabs stay visible in every layout** (`tabsBarView.js`, `configEditor.js`):
   pills for hidden wins (e.g. Tab 3 in 1x2, Tab 5 in 2x2) remain clickable.
2. **Visibility always includes the active window** - pure helpers in
   `tabsStore.js` (`getNumVisible` 1/2/4; `getVisibleWindows`; `isWindowVisible`)
   plus DOM enforcer `applySplitVisibility(tab)` in `windowReorder.js` toggling
   `.slot-visible`; CSS switches from `[data-win-idx=0..N]` selectors to
   `.slot-visible` (`tabs.css`).
3. **Stable uid-based DOM ids** (`windowPanels.js`): `tab-{id}-win-{uid}`,
   `win-panel-{id}-{uid}`, `tab-item-win-{uid}`, `tab-label-{uid}`, etc.
   `winIdx` becomes purely positional, refreshed by `reindexWindowPositions`
   (dataset, badge `Wn`, label, close-button). Panels/pills are **moved**
   (appendChild/insertBefore), never rebuilt, so live MapLibre instances survive.
4. **Mouse-drag rearrange**: delegated HTML5 DnD (`enableWindowReorderDnD`, wired
   once in `initTabWindowManager`) for pills and `.win-header`s, routed through
   `reorderWindows(tab, fromIdx, toIdx)`.
5. **Focus brings hidden wins on screen**: `focusWindow` calls
   `applySplitVisibility`; `setTabLayout` no longer resets `activeWinIdx = 0`.
6. **Consistency fixes**: camera sync iterates the visible set (`windowMaps.js`);
   legend recomputes `Wn` live (`legend.js`); titles use `labelId`
   (`windowTitles.js`); config close restores by stable `prevActiveWinId` with
   idx fallback (`configEditor.js`).

## 3. What works (verified by reading + tests)

- **Stable ids fix the old reindex orphan bug.** Old `closeWindowTab` renamed
  `panelId/headerId/domId` for every survivor, detaching maps and legends
  (`windowLegends` keyed by `win.id`). Keeping ids stable and refreshing only
  positional fields is strictly correct. Legacy fallbacks
  (`pillId || tab-item-win-{winIdx}`, `labelId || tab-label-{winIdx}`) keep
  mocks working.
- **Active preservation in `reindexWindowPositions`** captures the active object
  and re-resolves via `indexOf` - the right approach for a move operation.
- **No import cycles.** `windowReorder -> {tabsStore, windowMaps}`;
  `windowFocus -> windowReorder`; `windowPanels -> {windowFocus, windowReorder,
  windowMaps}`; `windowMaps -> tabsStore`. One-way DAG.
- **DnD delegation is sound**: close-button and config-pill excluded, header
  SELECT/BUTTON/OPTION excluded (maximize button unaffected), `preventDefault`
  only over valid targets, indicators cleaned on drop/dragend, `dndEnabled` guard.
- `node --check` passes for `windowReorder/tabsStore/windowPanels/windowFocus`;
  `bun test window_title` 8/8 and `ui_review3_fixes` 15/15 pass on the working
  tree with these changes applied.

## 4. Findings (ordered by severity)

### F1 [High] closeWindowTab steals focus when closing a background tab

`windowPanels.js:closeWindowTab` ends unconditionally with
`focusWindow(tab.id, nextIdx)` where `nextIdx = clamp(winIdx)`. Closing a
background tab (pill-x on W6 while W1 is active) yanks focus, visibility
(`applySplitVisibility` inside `focusWindow`), map focus and `onWindowInit`
to the closed tab's neighbour. Worse, when `winIdx < tab.activeWinIdx`,
`reindexWindowPositions` had correctly preserved the active object, but the
forced `focusWindow(nextIdx)` then moves the active index to the wrong
window. Fix: capture `wasActive = (winIdx === tab.activeWinIdx)` BEFORE
splice; only `focusWindow` when true (keep `applySplitVisibility` always).

### F2 [Moderate] syncMap guard mismatch (!== false vs truthy)

`windowReorder.js:applySplitVisibility` re-syncs cameras when
`tab.syncMap !== false` (undefined-safe default-ON), but `windowMaps.js` move
throttle and `syncTabCameras` require truthy `tab.syncMap`. A tab with
`syncMap === undefined` (mock, deserialized state) would auto-sync on
visibility changes yet never on user moves. Normalize at creation
(`syncMap: true` already in `createPrimaryWorkspace`) and use one check
everywhere (truthy recommended; the facade toggle `!tab.syncMap` is already
boolean-safe).

### F3 [Moderate] Reorder resolved by positional index; pills carry no tabId

`enableWindowReorderDnD` reads `dataset.winIdx` at dragstart and drop and
resolves the tab via `getTabFromDataset(source) || getTabFromDataset(target)
|| getActiveTab()`. Panels carry `dataset.tabId`, but pills only carry
`winIdx/uid` (`tabsBarView.js:54-55`), so `getTabFromDataset(pill)` always
misses - wrong tab if workspaces ever multiply, and racy if an add/close
lands between dragstart and drop. Fix: set `pill.dataset.tabId` at creation
and in `reindexWindowPositions`; on drop resolve the moved window by
`dataset.uid` (already on both pills and panels) and derive indices at drop
time.

### F4 [Low] Dead code and redundancy (do before commit)

- `isWindowVisible` exported (and facade re-exported) but never called. Use
  it (e.g. the `move` guard instead of `getVisibleWindows(tab).includes(win)`)
  or delete it so two visible-definitions cannot drift.
- `windowPanels.js` imports `getVisibleWindows` but never uses it; remove.
- `createWindowPanel(tab, gridEl, wIdxHint)`: `wIdxHint` is ignored internally
  yet both call sites still pass `wIdx`. Remove the param or honour it; as-is
  it misleads the next caller into thinking position is controllable.
- Map init is triple-covered (`applySplitVisibility` already lazy-inits plus
  `onWindowInit`; `setTabLayout` and `focusWindow` repeat it). Harmless
  (`initWindowMap` idempotent, callbacks fire once via `!win.map`) but noisy;
  collapse ownership to `applySplitVisibility`.
- `focusWindow` early-returns when already focused BEFORE
  `applySplitVisibility`, so clicking the active pill while its slot is hidden
  (config close, mid-reorder) re-asserts nothing. Run visibility before the
  early-return check (cheap) or accept the dead state.

### F5 [Low] UX note: active win renders in DOM position, not slot 1

`getVisibleWindows` returns `[active, ...others]` but the grid packs DOM
order, and `reorderWindows` deliberately re-appends in `tab.windows` order.
So focus-W3 in 1x2 shows W1 left + W3 right, not W3 first. Visibility is
correct; placement may surprise. Either document (focus pulls it into view,
order unchanged unless dragged) or physically move visible panels first
(which breaks the stated promise). Current comments (grid packs in DOM order)
already describe reality - keep code, keep wording.

### F6 [Note] 1x1 dual show-rules are redundant but safe

`.layout-1x1 .window-panel` now has both `.active-single` and `.slot-visible`
show rules; `focusWindow` sets both consistently and `activateConfigTab`
strips both. Do not remove one without auditing config open/close restore
(`closeConfigTab` relies on `focusWindow` - verified it does restore).

### F7 [Note] Config-pill anchor fix is correct

`renderTabPillForWindow` anchors before `#tab-item-config` when present, so
adding a win with Config open no longer appends after Config. Same anchor
logic duplicated in `reorderWindows` - acceptable; extract a helper only if
touched again.

## 5. Per-file notes

- `windowReorder.js` (new, untracked): well-factored; stable-id lookups with
  legacy fallbacks. Needs F2/F3. Nit: `dragleave` matches plain `.tab-item`
  while over/drop exclude `.tab-item-config` - add the `:not()` there too.
  Mouse-only reorder (no keyboard/touch path, see section 6).
- `tabsStore.js`: pure helpers correct for stated policy; per-call array alloc
  negligible at this scale. `isWindowVisible` dead (F4).
- `windowPanels.js`: stable-uid rewrite removes the old rename-orphan bug;
  close removes exactly the dead panel plus pill. Needs F1 plus `wIdxHint` cleanup.
- `windowFocus.js`: stable pill lookup plus index-based active flag correct
  post-reorder; `applySplitVisibility` on focus is what makes hidden-win
  clicks work. Consider F4 early-return tweak.
- `windowMaps.js`: visible-set scoping correct; rAF throttle plus `syncingTabs`
  retained. Align guard (F2).
- `tabsBarView.js`: stable ids plus draggable plus always-visible correct. Add
  `dataset.tabId` (F3). Every-pill `draggable=true` has a11y cost (see 6).
- `tabs.css`: `.slot-visible` contract clean; 1x1 rule added so focusing any
  win shows it. DnD affordances minimal, accent-consistent.
- `configEditor.js`: `prevActiveWinId` plus idx fallback strictly better than
  idx-only; `remove("hidden")` on close matches always-visible contract.
- `legend.js`: live Wn recompute at render, stored-prefix fallback - right.
- `windowTitles.js`: `labelId` lookup, positional `W{idx+1}` - consistent.
- `tabWindowManager.js`: facade plus one-time `enableWindowReorderDnD` - right.

## 6. Follow-ups (not blocking)

1. Keyboard/touch reorder plus screen-reader affordance (arrow shortcut or
   move menu, aria-dropeffect/live announcement). HTML5 DnD is mouse-only.
2. New-policy tests (`client/test/ui/tab-reorder-visibility.test.js`): 1x2
   focus-W3 visible set; reorder preserves map identity plus follows active
   object; background close keeps active (locks F1); `syncMap=undefined`
   behaviour (locks F2).
3. Existing fixtures assume positional ids (`tab-1-win-0`, `win-panel-1-0`,
   `tab-label-0` in `ui_review3_fixes`/`window_title`). They pass via mocks
   but no longer describe real shapes - annotate so nobody fixes code to
   match mocks.
4. DnD swallows failures (`try{reorder}catch{}`): add console.debug or flash
   so failed drops are distinguishable from success.

## 7. Commit checklist

- [ ] F1 background-close focus, F2 syncMap guard, F3 pill tabId plus uid drop
- [ ] F4 nits (unused import/param/function or wire them up)
- [ ] `git add client/src/ui/tabs/windowReorder.js` (currently untracked)
- [ ] `bun test` (min: `window_title`, `ui_review3_fixes`,
  `ui/tab-subwindow-visibility`) plus manual pass: 1x1/1x2/2x2 with W3/W5
  focus, pill-drag plus header-drag, background close, Config open/close mid-split
