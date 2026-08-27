# Multi-Tab and Multi-Split Windows Review — MICAPS-Web Frontend (micaps-web v1)

**Date:** 2026-08-27
**Scope:** `client/index.html:19-30`, `client/src/ui/tabWindowManager.js:1-432`, `client/src/main.js:1-489`, `client/src/map/mapInstance.js:1-65`, `client/src/tabs.css:1-292`, `client/src/store/appState.js:1-89`, `client/src/config/presets.js:1-140`
**Verification:** Live `micaps-server -mock=true -port 8088` (mock mode) + `Bun 1.4.0 Bun.WebView` headless Chromium, existing E2E suites `client/test/e2e/*`
**Result:** Partial pass — tab/2×2 DOM mechanics work, but 2 critical regressions break initial data loading and catalog-level selection. Overall **FAIL for production use until patched**.

---

## 1. Executive Summary

| Area | Verdict | Evidence |
|---|---|---|
| Tab bar rendering & add/switch/close | **PASS** | `tabs-bar` visible, `tab-item` count `1→2→1`, active state toggles |
| 1×1 ⇄ 2×2 layout switching | **PASS** | `windows-grid` class `layout-1x1` → `layout-2x2`, 4 viewports resolved, `flex` display |
| 4-split map instantiation | **PASS** | After `btn-layout-4`, `canvas` count `1→4`, `.maplibregl-map` `4` |
| Per-window focus & header controls | **PASS** | `win-panel.active` follows click, `win-preset`/`win-level` isolated per window |
| Camera sync toggle | **PASS** | `btn-sync-toggle` class `active` toggles, `isSyncingCamera` guard prevents loop |
| Initial weather field load | **FAIL — P0** | `TypeError` at `main.js:151`, `__WEATHER_FIELD_LOADED__=false`, `contour_layer.test.js` 0/4 |
| Duplicate DOM ID `select-level` | **FAIL — P0** | `getElementById` collision navBar vs catalogDrawer |
| Global vs per-window state | **WARN — P1** | `appState.level` shared, race on async preset loads |

The feature is present and structurally sound, but the integration into `main.js` introduced a return-value mismatch that silently disables the primary workstation bootstrap. The existing `map_render.test.js` still passes (map-only), masking the regression unless `contour_layer.test.js` is run.

---

## 2. Architecture Overview (Current Implementation)

```
client/index.html:22  #tabs-bar
client/index.html:24  #workspace-container
   └─ .tab-workspace#tab-workspace-{tabId}  [tabWindowManager.js:88]
       └─ .windows-grid#windows-grid-{tabId} [tabWindowManager.js:94]
           ├─ .window-panel#win-panel-{tabId}-{winIdx} ×4  [tabWindowManager.js:126]
           │   ├─ .win-header (badge, title, preset/level selects, max btn)
           │   └─ .map-viewport  [tabWindowManager.js:110]
           │       ├─ tab1-win0 → #map-container (legacy)
           │       └─ others   → #map-viewport-{tabId}-{winIdx}
           └─ MapLibre instance per win (createMapInstance) [map/mapInstance.js:18]
```

State: `tabs[]`, `activeTabId`, `isSyncingCamera` in `tabWindowManager.js:9-13` (module globals, not in `appState`). Per-window: `win.activeGroup`, `win.level`, `win.map` [tabWindowManager.js:99-115]. Global: `appState.level/period/activeGroup` [store/appState.js:7-13] overwritten on `focusWindow` [tabWindowManager.js:321-327].

Lifecycle: `main.js:44 initTabWindowManager` → `createNewTab` → `initWindowMap(win0)` → `switchTab` → (bug) `firstWin = undefined` → no `onReady`. Layout `2×2` lazily calls `initWindowMap` for `w1..3` + `callbacks.onWindowInit` [tabWindowManager.js:274-283].

---

## 3. Verification Procedure

### 3.1 Environment
- Server: `server/micaps-server` (`go.mod` Go, `handler/static_handler.go` SPA) launched `nohup ./micaps-server -mock=true -port 8088` → `/api/status` `{"mock_mode":true,"status":"ok"}`.
- Frontend: `client/dist` (Vite 6, `vite.config.js:7` alias `griddata`, built `assets/index-PXzcOK6l.js` + `index-CVvEO31X.css`), PMTiles `map-china.pmtiles` range-served.
- Browser: `Bun.WebView` headless 1920×1080 Chromium (`/usr/bin/chromium`), helpers `client/test/e2e/helpers/testEnv.js:1` (`createTestWebView`, `waitForMapLoaded`).

### 3.2 Manual Probe Scripts (Bun)
Created `/tmp/test_tabs2.js`, `/tmp/test_tabs3.js`, `/tmp/test_tabs4.js` reusing `testEnv.js`:

- Checked `tabs-bar` existence, `.tab-item` count, `.tab-workspace.active`, `windows-grid-1.className`, `window-panel` display, viewport IDs.
- Clicked `btn-layout-4` → verified `layout-2x2`, `getComputedStyle` `flex`, counted `canvas` and `.maplibregl-map`.
- Clicked `win-panel-1-1` → verified `window-panel.active` switch and `win-title`.
- Clicked `btn-add-tab` → verified new `tab-item-2`, `tab-workspace-2`, `map-viewport-2-0` existence, grid isolation.
- Switched back to `tab-item-1`, toggled `btn-sync-toggle`.
- Duplicate-ID scan via `querySelectorAll("[id]")`.
- Catalog vs navbar `select-level` collision (`querySelector("#catalog-drawer #select-level")` vs `#navbar #select-level` vs `getElementById`).
- Per-window level change `win-level-1-1 → 700`, asserted isolation from `win-level-1-0`.

### 3.3 Existing E2E Suites
```bash
bun test ./test/e2e/map_render.test.js      # 4 pass
bun test ./test/e2e/contour_layer.test.js   # 0 pass / 4 fail
```
Console log capture via `window.__LOGS__` (instrumented in `index.html:11-16`).

---

## 4. Detailed Findings

### 4.1 [P0-CRITICAL] Bootstrap Return-Value Mismatch — Initial Load Dead

**Files:** `client/src/ui/tabWindowManager.js:15-19`, `client/src/main.js:44-171`

```js
// tabWindowManager.js:15
export function initTabWindowManager(callbacksObj = {}) {
  callbacks = callbacksObj;
  renderTabsBar();
  const firstTab = createNewTab("Workspace 1");
  return firstTab.windows[0]; // ← returns Window
}

// main.js:44,151
const firstTab = initTabWindowManager({...}); // name implies Tab, is Window
const firstWin = firstTab?.windows[0];       // ← undefined → TypeError
const map = firstWin?.map;                   // undefined → onReady never bound
```

**Observed:** `window.__LOGS__` → `REJECT: TypeError: Cannot read properties of undefined (reading '0') at e_ (assets/index-PXzcOK6l.js:1130:4984)` (minified `main.js:151`). `__WEATHER_FIELD_LOADED__=false`, `window.__MAP__.getSource("isoband-source")` stays falsy until user manually switches to `2×2` (which triggers `onWindowInit` for w1..3). New tab then loads its presets, masking that w0 never loaded.

**Impact:** Fresh page shows empty basemap + stations missing until interaction. Breaks contract of `micaps-web-plan1.md` §9 Phase 5 and `README.md` Quick Start. E2E `contour_layer.test.js:19-48` expects isoband/isoline at boot → fails.

**Fix (one line):**

```js
// main.js:44 — option A (minimal)
const firstWin = initTabWindowManager({...});
const map = firstWin?.map;
// OR option B — fix callee to return tab:
return firstTab; // tabWindowManager.js:19
// then main.js stays as-is
```

**Line-count impact:** <2 lines, no file exceeds 600-line rule (`main.js:489`, `tabWindowManager.js:432`).

### 4.2 [P0-CRITICAL] Duplicate DOM ID `select-level`

**Files:** `client/src/ui/navBar.js:36`, `client/src/ui/catalogDrawer.js:42`, `client/src/store/appState.js` consumers

```html
<!-- navBar.js:36 -->
<select id="select-level" class="nav-select"> <!-- 1000..100 hPa -->

<!-- catalogDrawer.js:42 -->
<select id="select-level" class="form-select"> <!-- 1000..200 hPa, dynamic -->
```

**Observed:** `querySelectorAll("[id]")` → `select-level:2`. `document.getElementById("select-level") === navSel true`, `=== drawerSel false`. After `initNavBar` then `initCatalogDrawer`, `catalogDrawer.js:91` `const selectLevel = getElementById("select-level")` captures **navbar** element, not drawer’s. Changing drawer level mutates navbar; drawer’s own `<select>` is orphaned (updated via `innerHTML` at `catalogDrawer.js:120-144` but reference stale). `setNavBarLevel` (`navBar.js:95`) also ambiguous.

**Impact:** Catalog → NWP `Level` selector broken; `updateFormVisibility` rewrites `selectLevel.innerHTML` on wrong node. Existing `ui_controls.test.js:92` keyboard `ArrowUp` (expects `500→400`) uses `getElementById("select-level")` — now nondeterministic (passes only because navbar is first). Production users cannot reliably pick 850/700 etc via drawer.

**Fix:** Unique IDs:

```html
<!-- navBar.js:36 -->
<select id="select-nav-level">
<!-- catalogDrawer.js:42 -->
<select id="select-catalog-level">
```

Update all refs: `navBar.js:69,95`, `catalogDrawer.js:91,120,139`, `style.css` if targeting ID (currently class-based, none), and tests. Keep `tabs.css`/`style.css` class selectors untouched.

### 4.3 [P1-MAJOR] `#map-container` Legacy vs `map-viewport-*` Inconsistency

**Files:** `client/src/ui/tabWindowManager.js:110`, `client/src/style.css:139`, `client/src/tabs.css:287`

```js
domId: tabId === 1 && wIdx === 0 ? "map-container" : `map-viewport-${tabId}-${wIdx}`,
```

Only first window of first tab retains `map-container`; `tab2-win0` is `map-viewport-2-0`. CSS `style.css:139 #map-container {width:100%;height:100%}` does not apply to `tab2-win0` (covered by `.map-viewport` `flex:1` + `height:calc(100% -28px)` in `tabs.css:287` so visually identical, but JS that queries `#map-container` (legacy fallback `mapInstance.js:62 initMap`) will miss secondary tabs. The probe showed `all viewports ids` mix is functional but surprising.

**Fix:** Normalize to `map-viewport-${tabId}-${wIdx}` for all, keep `map-container` as alias only if needed for backward compat: `if (tabId===1&&wIdx===0) container.id = "map-viewport-1-0"; container.setAttribute("data-legacy","map-container")` or retain both IDs via `container.id` + `container.dataset.legacy`.

### 4.4 [P1-MAJOR] Global `appState` vs Per-Window State Race

**Files:** `client/src/store/appState.js:7`, `client/src/ui/tabWindowManager.js:300-327`, `client/src/main.js:83-95,405-409`

`appState` holds single `level/period/activeGroup`. `focusWindow` does `appState.set("level", win.level)` and `appState.set("activeGroup", win.activeGroup)`. `loadPresetGroup` reads `appState.get("period")` and `appState.get("level")` without scoping to `win`. If user changes period in win0, it mutates global, affecting next `loadWeatherField` in win1. Verified: after setting `win-level-1-1=700`, `getElementById("select-level")` (navbar) also shows `700` (desired) but catalog drawer still shows old value via `getElementById` collision.

**Observation:** Isolation test showed `win-level-1-0` stayed `500` after `win-level-1-1→700` — DOM isolation is correct, but `appState.level` is now `700`, so any non-window-scoped loader (e.g., `TimeSlider` `main.js:125-147` using `getMap()` → `getActiveWindow()`) will mistakenly reload with wrong level.

**Fix:** Scope loaders to `win` object as already done in `main.js:48-65` callbacks (`win.level`, `win.activeGroup`). Remove `appState.set("level")` from global path for window-local operations, or introduce `win.period` (already `win.period=24` but unused) and make `TimeSlider` window-aware (`getActiveWindow()` → `win.period`). For minimal change, document that `appState` is now “active window mirror” and ensure all async loads capture `win` closure (already done in `main.js:68-78` `onWindowInit`).

### 4.5 [P2-MINOR] Other Observations

- **Line-length rule:** All files under 600 lines (`main.js 489`, `tabWindowManager 432`, `style.css 587`, `tabs.css 292`) — pass.
- **CSS layout:** `tabs.css:155-180` correctly hides non-active single panels (`display:none` vs `flex`), `layout-2x2` uses `grid` — verified via `getComputedStyle`.
- **Sync mechanism:** `tabWindowManager.js:350-366` uses `isSyncingCamera` global flag. It is per-tab scoped via `win.tabId` lookup, so cross-tab interference unlikely, but global flag could drop events if two tabs move simultaneously. Minor; consider `isSyncingCamera` per `tab`.
- **Maximize:** `win-btn-max` toggles `window-panel.maximized` (`tabs.css:196`) with absolute positioning — works, but `z-index:100` may overlap `tabs-bar` (`z-index:900`). Should be `z-index:901` or confine to `windows-grid` stack.
- **Lifecycle `resize`:** `switchTab` and `setTabLayout` call `win.map.resize()` after 50 ms `setTimeout` — adequate for `MapLibre` but fragile for slow style load. Already guards `win.map.loaded()` in sync handler.
- **Accessibility:** `select` labels use `for="select-level"` duplicated — breaks a11y, fixed by ID rename.
- **No duplicate for `select-preset`**: Drawer does not have preset selector (window headers do `win-preset-*` unique), so no collision there.

---

## 5. Test Matrix (What Was Executed)

| Step | Action | Expected | Actual |
|---|---|---|---|
| 1 | Load `http://localhost:8088` | Map + TMP 850 isoband | Map loads (`isStyleLoaded true`, `canvas true`), isoband **false**, log `TypeError` |
| 2 | Click `btn-layout-4` (2×2) | 4 maps | 4 maps (`canvas 4`, `.maplibregl-map 4`), viewports filled |
| 3 | Click `win-panel-1-1` | Focus `W1`, nav updates | `active` → `win-panel-1-1`, title `850hPa Low-Level Jet`, nav `700` after change |
| 4 | Add tab `btn-add-tab` | New workspace `tab-workspace-2`, active switch | `tab-item` `1→2`, `active=tab-item-2`, `map-viewport-2-0` exists, `grid layout-1x1` |
| 5 | Switch back `tab-item-1` | Active returns | `active=tab-item-1`, `tab-workspace-1` visible |
| 6 | Toggle sync `btn-sync-toggle` | `active` class toggles | `true→false` |
| 7 | Duplicate scan | 0 dups | `select-level:2` |
| 8 | Catalog drawer `select-level` vs navbar | Separate | `getElementById` returns navbar, catalog orphaned |
| 9 | Per-window preset `win-preset-1-1→composite-200hpa` | Title updates | `win-title-1-1` → `200hPa Jet Stream` |
|10 | `bun test map_render` | Pass | **PASS 4/4** |
|11 | `bun test contour_layer` | Pass | **FAIL 0/4** (isoband missing) |

---

## 6. Recommendations (Prioritized)

### P0 — Must Fix Before Merge

1. **Fix `main.js:151` return mismatch.** Change `const firstTab = initTabWindowManager` → `const firstWin = initTabWindowManager` and `const map = firstWin?.map` (or return tab from `tabWindowManager.js:19`). Rebuild `bun run build` and re-run contour tests.
2. **Rename duplicate IDs.** `navBar.js:36` → `select-nav-level`, `catalogDrawer.js:42` → `select-catalog-level`, update `navBar.js:69,95`, `catalogDrawer.js:91`, `ui_controls.test.js:94-99`. Add lint rule (`eslint-plugin-no-duplicate-id` or `html-validate`) to CI.

### P1 — Should Fix

3. **Normalize viewport IDs.** Remove special-case `map-container` in `tabWindowManager.js:110`; use uniform `map-viewport-${tabId}-${wIdx}` and keep `#map-container` as deprecated alias via CSS class.
4. **Scope `appState` or document mirroring.** Ensure `TimeSlider` (`main.js:125`) and `loadWeatherField` use `win.level/period` not global `appState` when window-local. Either pass `win` explicitly or store `win.period`.
5. **Add multi-tab E2E coverage.** New test file `client/test/e2e/tabs_windows.test.js` covering the matrix above (layout switch, focus, add/close, per-window preset). Gate on `window.__WEATHER_FIELD_LOADED__` after fix.

### P2 — Nice to Have

6. Per-tab `isSyncingCamera` map, `z-index` fix for `maximized`, a11y `label for` update after rename.
7. Expose `window.__TABS__` for debugging (optional, guarded by `import.meta.env.DEV`).

---

## 7. Conclusion

The multi-tab / 4-split implementation **is functionally present and largely correct** — tabs, 2×2 grid, per-window headers, focus, sync toggle, and viewport isolation all behave as designed under live `Bun.WebView` probing. However, the integration point in `main.js:151` and the `select-level` ID collision are **show-stoppers** that disable the primary data path and catalog interaction. With the two one-line P0 patches and a rebuild, the feature should pass the full E2E suite and be shippable.

**Sign-off:** `FAIL (fixable)`. Retest after P0 patches.

---

## 8. Appendix

- **Repro log snippet:** `REJECT: TypeError: Cannot read properties of undefined (reading '0') at e_ (assets/index-PXzcOK6l.js:1130:4984)`
- **Files inspected:** `client/src/main.js:35-171`, `client/src/ui/tabWindowManager.js:1-432`, `client/src/ui/navBar.js:1-127`, `client/src/ui/catalogDrawer.js:1-192`, `client/src/map/mapInstance.js:1-65`, `client/src/tabs.css:1-292`, `client/src/style.css:122-142`
- **Build artifact:** `client/dist/assets/index-PXzcOK6l.js` (1.18 MB), `client/dist/index.html` correctly includes `tabs.css` via bundled CSS `index-CVvEO31X.css:82972`
- **Server:** `server/cmd/main.go:35`, `server/handler/static_handler.go` SPA fallback, verified `curl -I /` 200
