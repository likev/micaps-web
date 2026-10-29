# MICAPS-Web Client UI/UX Code Review & Fix Suggestions (`ui-ux-review1.md`)

**Date:** 2026-10-29  
**Scope:** Full client-side UI/UX audit across `client/src/components/`, `client/src/ui/`, `client/src/layers/`, `client/src/styles/`, `client/config.json`, and `scripts/gen-presets.mjs`.

---

## Executive Summary

This review covers **13 UI/UX issues** identified in the `micaps-web` client:
- **Part I (Issues 1–7)** addresses the **7 core UI/UX issues** explicitly flagged for review, with exact file/line citations, root-cause analysis, unit-test impact notes, and drop-in code fixes.
- **Part II (Issues 8–13)** documents **6 additional high-impact UI/UX bugs** uncovered during the full client inspection (unreachable camera-sync button in split mode, wrong `hPa` unit suffixes in window headers, broken Light/Brutalism theme selectors on modals, invalid contrast-mode guards for satellite/radar/single-level presets, duplicate presets in `config.json`, and loop-range markers disappearing when paused).

| # | Category | Issue Summary | Primary Files | Severity |
| :- | :--- | :--- | :--- | :--- |
| **1** | Status Bar | `.timeline-info` should be hidden on a new empty window (before any weather data is loaded) | `StatusBar.svelte:162-210, 415-424` | High |
| **2** | Theme / Contrast | `#sl-time-lead-label` hardcoded `#e6edf3` text color is unreadable in Light & Brutalism themes | `StatusBar.svelte:490-557`, `tokens.css`, `polish.css:499` | High |
| **3** | Layer Config | Redundant Basemap `Scheme` `.config-row` in `LayerRow.svelte` desyncs map tiles from global UI theme | `LayerRow.svelte:154, 845-857, 1424`, `App.svelte:1842-1851` | High |
| **4** | Status Bar | `#btn-toggle-lighting` is always visible instead of only showing when active data is Satellite | `StatusBar.svelte:133-160`, `timelineMath.js:56-77` | High |
| **5** | Preset Menu | `.preset-badge` shows `12 hPa` for FY-4B satellite, `3000 hPa` for radar TDMOSAIC, and `Sfc` for non-surface data | `PresetMenu.svelte:430-436`, `PresetForm.svelte:273, 436`, `config.json` | High |
| **6** | Localization / i18n | Multi-language (Chinese + English) mixing in `name`/`title`, `category-name`, `preset-name`, `win-title`, `active-title`; should add user-selectable multi-language support (`en` / `zh` toggle) | `i18n.svelte.js` (new), `config.json`, `gen-presets.mjs`, `PresetMenu.svelte`, `NavBar.svelte`, `windowTitles.js`, `WindowPanel.svelte`, `LayerRow.svelte`, `StationFilter.svelte`, `HelpModal.svelte`, `LayerForm.svelte`, `SettingsForm.svelte` | High |
| **7** | Layer Config (T-LogP) | `Sounding Station Network` shows irrelevant `Temperature`, `Wind Barbs`... `.config-row`s and `Filter` subtab; should remove them and add `Station ID` `.config-row` | `LayerRow.svelte:115-120, 416-478, 630-635`, `layerDefaults.js:40-51`, `stationPlot.js`, `config.json:144-158` | High |
| **8** | Split Workspace | Camera Sync toggle (`#btn-sync-toggle`) is hidden by `.tabs-bar #layout-controls { display: none !important }` | `TabsBar.svelte:425-444, 555-557` | High |
| **9** | Window Header | `.win-title` appends `hPa` to satellite channel numbers (`12 hPa`) and radar heights (`3000 hPa`) | `WindowPanel.svelte:58-64` | Medium |
| **10** | Theme Support | Mismatched CSS selectors leave `HelpModal`, `ConfigEditor`, `CommandPalette`, and `WindowPanel` broken in Light/Brutalism themes | `HelpModal.svelte`, `ConfigEditor.svelte`, `CommandPalette.svelte`, `WindowPanel.svelte:240`, `tokens.css`, `polish.css` | Medium |
| **11** | Contrast Mode | Auto-allocation (`model` / `level` / `step`) is not disabled for Satellite, Radar, and single-level (`hasLevel: false`) presets | `NavBar.svelte:113-132, 599-617`, `TabsBar.svelte:59-70`, `App.svelte:1917-1924` | Medium |
| **12** | Preset Catalog | 30+ duplicate presets in `client/config.json` due to `gen-presets.mjs` appending `preset-*` duplicates alongside hand-authored IDs | `scripts/gen-presets.mjs:563-568`, `client/config.json` | Medium |
| **13** | Timeline UX | Loop markers `A`/`B` in `TimeSlider.svelte` are tied to `playback.isPlaying`, preventing loop range adjustment while paused | `TimeSlider.svelte:303, 323, 372, 660, 721` | Low |

---

## Part I: Core Reported UI/UX Issues (1–7)

---

### Issue 1: `.timeline-info` Should Be Hidden on a New Empty Window

#### Affected Files
- `client/src/components/StatusBar.svelte:19-40, 162-210` (script state & DOM template)
- `client/src/components/StatusBar.svelte:415-424` (CSS `.timeline-info`)
- `client/test/ui/status_bar_menu.test.js:42-50` & `client/test/ui_review2_fixes.test.js:63-66` (unit tests asserting `.timeline-info` presence in source)

#### Problem Analysis
In `StatusBar.svelte:162-210`, `.status-bar-center` unconditionally renders `<div class="timeline-info" aria-label="Timeline Status">` containing:
1. `.mode-badge` (`NWP FORECAST` / `OBSERVATION`)
2. `.cycle-control` (`Init:` + `#sl-select-forecast-cycle`)
3. `#sl-time-lead-wrapper` (`Forecast Lead: 000h` / `Obs Time: ...`)
4. `#sl-time-valid-label` (`Valid: ...`)

While `TimeSlider.svelte:550` properly hides the timeline bar when `!ui.timelineVisible || ui.configOpen`, `StatusBar.svelte` never checks whether the active window actually has loaded data (`ui.timelineVisible` and `activeWin?.activeGroup` / non-basemap layers).
Consequently:
- **On initial application boot** (before clicking `Load Data` or selecting a preset)
- **When clicking `+` in `TabsBar.svelte` to open a new empty window (`W2`, `W3`, ...)**
- **When switching focus to an unpopulated window in split-screen mode**

`.timeline-info` remains visible in the center of the status bar, displaying bogus placeholder state (`NWP FORECAST | Init: -- | Forecast Lead: 000h | --`) for a window that has no weather data loaded.

#### Fix Suggestion
In `StatusBar.svelte`, derive `hasTimelineData` from the active window (`activeWin`) and `ui.timelineVisible`, and apply `class:hidden={!hasTimelineData}` (and `hidden={!hasTimelineData}`) to `.timeline-info`.
*(Keeping the `.timeline-info` element in the DOM with `class:hidden` ensures `client/test/ui/status_bar_menu.test.js:42-50` continues to pass.)*

```svelte
<!-- client/src/components/StatusBar.svelte -->
<script>
  import { getWindowById } from "../lib/stores/tabs.svelte.js";
  import { getLayersForWindow } from "../lib/stores/layers.svelte.js";

  let activeWin = $derived(winId ? getWindowById(winId) : null);
  let winLayers = $derived(winId ? getLayersForWindow(winId) : []);
  let hasWeatherLayers = $derived(
    Array.isArray(winLayers) && winLayers.some((l) => l && l.type !== "pmtiles" && !String(l.id || "").startsWith("layer-pmtiles"))
  );
  let showTimelineInfo = $derived(
    Boolean(ui.timelineVisible && !ui.configOpen && (activeWin?.activeGroup || hasWeatherLayers))
  );
</script>

<!-- Center section: timeline-info (hidden on new/empty windows) -->
<div class="status-bar-center">
  <div
    class="timeline-info"
    class:hidden={!showTimelineInfo}
    hidden={!showTimelineInfo}
    aria-label="Timeline Status"
  >
    ...
  </div>
</div>
```

```css
/* client/src/components/StatusBar.svelte */
.timeline-info.hidden {
  display: none !important;
}
```

---

### Issue 2: `#sl-time-lead-label` Text Color (and Hardcoded Dark-Mode Text Colors in `StatusBar.svelte`)

#### Affected Files
- `client/src/components/StatusBar.svelte:467-470, 490-500, 529-532, 554-557`
- `client/src/styles/tokens.css:85-98, 299-318`
- `client/src/styles/polish.css:498-503`

#### Problem Analysis
In `StatusBar.svelte:490-500`, the text colors for `#sl-time-lead-label` and its sibling status bar labels are hardcoded to dark-theme hex values instead of CSS custom properties:

```css
/* client/src/components/StatusBar.svelte:490-500 */
.lead-prefix {
  color: #8b949e;
}

#sl-time-lead-label {
  color: #e6edf3;
}

.valid-label {
  color: #8b949e;
}
```
Additionally, `StatusBar.svelte` hardcodes:
- `.cycle-label { color: #8b949e; }` (`:468`)
- `.status-text { color: #8b949e; }` (`:530`)
- `.probe-coords { color: #79c0ff; }` (`:556`)

**Why this breaks:**
1. **Light Theme (`[data-theme="light"]`)**: `--bg-footer` is `#f6f8fa` (`tokens.css:54`). Rendering `#sl-time-lead-label` in `#e6edf3` on `#f6f8fa` produces a **1.12:1 contrast ratio** (pale gray on white—completely invisible). Similarly, `.probe-coords` (`#79c0ff` on `#eaeef2`) has only a **1.78:1 contrast ratio**.
2. **Brutalism Theme (`[data-theme="brutalism"]`)**: `polish.css:499` overrides `.status-text, .valid-label, .lead-prefix { color: #111; }`, but **omits `#sl-time-lead-label` and `.probe-coords`**. Because `#sl-time-lead-label` uses an ID selector (`[0, 1, 0, 0]`), it stays `#e6edf3` on a `#ffffff` status bar (`1.18:1` contrast ratio).

#### Fix Suggestion

1. **In `client/src/components/StatusBar.svelte` (`:467-557`)**, replace hardcoded hex values with theme tokens:
```css
/* client/src/components/StatusBar.svelte */
.cycle-label {
  color: var(--text-secondary, #8b949e);
  font-size: 11px;
}

.lead-prefix {
  color: var(--text-secondary, #8b949e);
}

#sl-time-lead-label {
  color: var(--text-primary, #e6edf3);
}

.valid-label {
  color: var(--text-secondary, #8b949e);
  font-family: var(--font-mono, "JetBrains Mono", monospace);
}

.status-text {
  font-size: 11px;
  color: var(--text-secondary, #8b949e);
  white-space: nowrap;
}

.probe-coords {
  color: var(--accent-blue, #58a6ff);
}
```

2. **In `client/src/styles/tokens.css`**, add explicit light-theme contrast rules for `#sl-time-lead-label` and `.probe-coords`:
```css
[data-theme="light"] #sl-time-lead-label {
  color: var(--text-primary);
}
[data-theme="light"] .probe-coords {
  color: var(--accent-blue);
}
```

3. **In `client/src/styles/polish.css:499`**, include `#sl-time-lead-label` and `.probe-coords` in the Brutalism status bar rule:
```css
[data-theme="brutalism"] #app :is(.status-text, .valid-label, .lead-prefix, #sl-time-lead-label, .probe-coords) {
  color: #111;
}
```

---

### Issue 3: Basemap `Scheme` `.config-row` Should Be Removed

#### Affected Files
- `client/src/components/LayerRow.svelte:152-155` (subtab definition)
- `client/src/components/LayerRow.svelte:844-872` (`pmtiles` `basemap` subtab pane)
- `client/src/components/LayerRow.svelte:1424` (`.sel-basemap-scheme` CSS)
- `client/src/App.svelte:1842-1851` (per-layer `valPayload.scheme` handler)
- `client/src/ui/layerControl.js:469-478` (legacy layer control)
- `client/test/ui/clean_redesign_layout_layerconfig.test.js:206-216` (unit test)

#### Problem Analysis
In `LayerRow.svelte:844-872`, expanding the `Vector Basemap` (`layer.type === "pmtiles"`) row and switching to the `Style & Proj` (`basemap`) subtab renders:
```svelte
<!-- client/src/components/LayerRow.svelte:844-872 -->
<div class="config-subtab-pane" class:active={currentSubtab === "basemap"}>
  <div class="config-row">
    <label for="sel-basemap-scheme-{layer.id}" class="select-label">🎨 Scheme:</label>
    <select
      id="sel-basemap-scheme-{layer.id}"
      class="sel-basemap-scheme"
      value={layer.config?.scheme || "dark"}
      onchange={(e) => handleConfig("scheme", e.target.value)}
    >
      <option value="dark">🌙 Dark (Ink)</option>
      <option value="light">☀️ Light (Paper)</option>
      <option value="brutalism">🟨 Brutalism</option>
    </select>
  </div>

  <div class="config-row">
    <label for="sel-basemap-proj-{layer.id}" class="select-label">🌐 Projection:</label>
    ...
  </div>
</div>
```

**Why this should be removed:**
1. **Duplicate / Conflicting UI**: Global theme switching (`Light (Paper)`, `Dark (Ink)`, `Brutalism`) is now in the top-right Hamburger Menu (`NavBar.svelte:805-843`) and Command Palette (`CommandPalette.svelte:36-38`), which call `setGlobalTheme()` (`theme.svelte.js`).
2. **State Desynchronization Bug**: Changing `#sel-basemap-scheme-{layer.id}` inside `LayerRow.svelte` dispatches `handleLayerAction("config", { scheme })` (`App.svelte:1842-1851`), which calls `applyBasemapScheme(m, scheme)` on MapLibre **without** calling `setGlobalTheme(scheme)`. This leaves the UI chrome in Dark mode while the map basemap switches to Light/Brutalism (or vice versa). Furthermore, `value={layer.config?.scheme || "dark"}` displays `"dark"` even when the global theme is `"light"` or `"brutalism"`.

#### Fix Suggestion

1. **In `client/src/components/LayerRow.svelte:844-872`**, remove the `🎨 Scheme:` `.config-row` block (`lines 845-857`), leaving only the `🌐 Projection:` `.config-row`:
```svelte
<!-- client/src/components/LayerRow.svelte -->
<div class="config-subtab-pane" class:active={currentSubtab === "basemap"}>
  <div class="config-row">
    <label for="sel-basemap-proj-{layer.id}" class="select-label">🌐 Projection:</label>
    <select
      id="sel-basemap-proj-{layer.id}"
      class="sel-basemap-proj"
      value={layer.config?.projection || "mercator"}
      onchange={(e) => handleConfig("projection", e.target.value)}
    >
      <option value="mercator">🗺️ Mercator (2D)</option>
      <option value="globe">🌍 Globe (3D)</option>
      <option value="vertical-perspective">🪐 Perspective (3D)</option>
    </select>
  </div>
</div>
```

2. **In `client/src/components/LayerRow.svelte:152-155`**, rename the subtab label from `"Style & Proj"` to `"Projection"`:
```js
case "pmtiles":
  return [
    { id: "features", label: "Features", icon: "🗺️" },
    { id: "basemap", label: "Projection", icon: "🌐" },
  ];
```

3. **In `client/src/components/LayerRow.svelte:1424`**, remove `.sel-basemap-scheme,` from the CSS selector list.
4. **In `client/test/ui/clean_redesign_layout_layerconfig.test.js:215`**, update `expect(pmtilesBlock).toContain('class="sel-basemap-scheme"')` to `expect(pmtilesBlock).toContain('class="sel-basemap-proj"')`.

---

### Issue 4: `btn-toggle-lighting` Should Only Show When the Data Is Satellite

#### Affected Files
- `client/src/components/StatusBar.svelte:133-160`
- `client/src/ui/timeline/timelineMath.js:56-77`
- `client/test/lighting_compensation.test.js:691-720`

#### Problem Analysis
1. In `StatusBar.svelte:133-160`, `<div class="status-bar-lighting">` containing `#btn-toggle-lighting` (`Lighting ON/OFF`) is rendered unconditionally in the status bar at all times—even on initial boot before any data is loaded, and when viewing Surface station plots, Upper-Air soundings, T-LogP diagrams, NWP geopotential/temperature contours, or SWAN radar reflectivity.
2. Solar zenith lighting compensation (`solarLighting.js` / `lightingController.js`) only affects satellite imagery (`FY-4B` / `FY-2G`). Displaying an interactive `Lighting ON/OFF` switch during NWP or station/radar analysis misleads users into thinking lighting compensation applies to non-satellite products.
3. **Detection Gap in `isSatelliteGroup` (`client/src/ui/timeline/timelineMath.js:56-77`)**: `isSatelliteGroup` checks for `"SATELLITE"`, `"FY4"`, and `"FY-4"`, but omits `"FY2"`, `"FY-2"`, and `l?.type === "image"` (used by `FY-2G` presets such as `sat-fy2g-dust`, `sat-fy2g-ctt`, `sat-fy2g-qpe001`, `preset-fy2g_dust`).

#### Fix Suggestion

1. **Update `isSatelliteGroup` in `client/src/ui/timeline/timelineMath.js:56-77`** so both `FY-4B` and `FY-2G` satellite groups and layers are recognized:
```js
/** True when a preset group carries FY-4B / FY-2G / satellite imagery layers. */
export function isSatelliteGroup(group) {
  if (!group) return false;
  const matchSatStr = (val) => /SATELLITE|FY4|FY-4|FY2|FY-2/i.test(String(val || ""));
  if (typeof group === "string") return matchSatStr(group);
  if (
    matchSatStr(group.id) ||
    matchSatStr(group.name) ||
    matchSatStr(group.path) ||
    matchSatStr(group.category)
  ) {
    return true;
  }
  const layers = Array.isArray(group.layers) ? group.layers : [];
  return layers.some(
    (l) =>
      l?.model === "SATELLITE" ||
      l?.type === "image" ||
      matchSatStr(l?.path) ||
      matchSatStr(l?.element) ||
      matchSatStr(l?.id)
  );
}
```

2. **In `client/src/components/StatusBar.svelte`**, derive `isSatellite` from the active window (`activeWin` + `getLayersForWindow(winId)`) and hide `.status-bar-lighting` whenever `!isSatellite || ui.configOpen`:
```svelte
<script>
  // In StatusBar.svelte:
  let activeWin = $derived(winId ? getWindowById(winId) : null);
  let winLayers = $derived(winId ? getLayersForWindow(winId) : []);
  let isSatellite = $derived.by(() => {
    if (!activeWin) return false;
    if (isSatelliteGroup(activeWin.activeGroup)) return true;
    if (activeWin.model === "SATELLITE") return true;
    return Array.isArray(winLayers) && winLayers.some((l) =>
      l?.model === "SATELLITE" ||
      l?.type === "image" ||
      /SATELLITE|FY4|FY-4|FY2|FY-2/i.test(String(l?.path || l?.element || l?.id || ""))
    );
  });
</script>

<!-- Solar Lighting Compensation Toggle (Satellite Only) -->
<div class="status-bar-lighting" class:hidden={!isSatellite || ui.configOpen} hidden={!isSatellite || ui.configOpen}>
  <button
    id="btn-toggle-lighting"
    ...
```
```css
/* client/src/components/StatusBar.svelte */
.status-bar-lighting.hidden {
  display: none !important;
}
```
*(Note: Using `class:hidden={!isSatellite || ui.configOpen}` keeps `class="status-bar-lighting"` and `id="btn-toggle-lighting"` in the component source so `client/test/lighting_compensation.test.js:691-720` passes without breaking.)*

---

### Issue 5: `preset-badge` `12 hPa` for Satellite Is Wrong (and Other Incorrect Badges in `PresetMenu.svelte` & `PresetForm.svelte`)

#### Affected Files
- `client/src/components/PresetMenu.svelte:430-436`
- `client/src/components/config/PresetForm.svelte:272-274, 436`
- `client/config.json` & `scripts/gen-presets.mjs:343-397, 523-558`

#### Problem Analysis
`PresetMenu.svelte:430-436` computes the right-aligned `.preset-badge` pill using only three branches:
```svelte
<!-- client/src/components/PresetMenu.svelte:430-436 -->
{#if preset.badge}
  <span class="preset-badge">{preset.badge}</span>
{:else if preset.hasLevel !== false && (preset.defaultLevel || preset.hasLevel)}
  <span class="preset-badge">{preset.defaultLevel || 500} hPa</span>
{:else if preset.hasLevel === false}
  <span class="preset-badge">{preset.category?.includes("Derived") ? "Diag" : (preset.isObservation && preset.category?.includes("Upper") ? "Obs" : "Sfc")}</span>
{/if}
```

This causes **three distinct badge errors**:
1. **Satellite multi-channel presets show `12 hPa`**:
   - `sat-fy4b-china`, `sat-fy4b-disk`, `preset-fy4b_china_grouped`, and `preset-fy4b_disk_grouped` have `hasLevel: true, defaultLevel: 12`, where `12` is **FY-4B AGRI Channel 12 (`C012`, 10.8 µm IR)**, not `12 hPa` stratospheric pressure.
   - Because `preset.badge` is not set, `PresetMenu.svelte:433` renders **`12 hPa`** (and `PresetForm.svelte:273, 436` renders `• 12 hPa` and `(12hPa)`).
2. **3D Radar Mosaic (`swan-tdmosaic`, `preset-swan_tdmosaic`) shows `3000 hPa` / `500 hPa`**:
   - `swan-tdmosaic` has `hasLevel: true, defaultLevel: 3000` (and `preset-swan_tdmosaic` has `defaultLevel: 500`) with levels `[500, 1000, ..., 19000]` representing **altitude in meters (`m` ASL)**.
   - `PresetMenu.svelte:433` renders **`3000 hPa`** (3× sea-level pressure!) instead of **`3000 m`** (or `3 km`).
3. **Single-level non-surface presets (`hasLevel: false`) all show `Sfc`**:
   - All single-channel Satellite presets (`sat-fy4b-c002`, `sat-fy4b-c006`, `sat-fy4b-c009`, `sat-fy4b-c012`, `sat-fy2g-ctt`, `sat-fy2g-dust`, `sat-fy2g-qpe*`, `preset-fy2g_*`) render **`Sfc`**.
   - All Radar / Nowcasting / Lightning presets (`swan-mcr`, `swan-mtop`, `swan-mvil`, `swan-qpe`, `swan-qpf`, `swan-titan`, `swan-tvs`, `swan-cotrecwind`, `obs-lightning-*`) render **`Sfc`**.
   - Wind Profiler vertical observations (`obs-wind-profiler-robs`, `obs-wind-profiler-rad`, `preset-wind_profiler_*`) render **`Sfc`**.
   - High-altitude / column-integrated single-level NWP fields (`ecmwf-tropopause`, `ecmwf-0c-height`, `ecmwf-cape-shear`, `ecmwf-pwat`, `ecmwf-composite-radar`, `preset-ecmwf_hr_wind_100m`) render **`Sfc`**.

#### Fix Suggestion

Create a dedicated `formatPresetBadge(preset)` helper (matching the `isFY4B` and `isMeterHeight` logic already in `NavBar.svelte:142-179`) and call it in `PresetMenu.svelte` (and `PresetForm.svelte`):

```js
// Helper for PresetMenu.svelte (and PresetForm.svelte)
function formatPresetBadge(preset) {
  if (!preset) return "";
  if (preset.badge) return preset.badge;

  const id = String(preset.id || "").toUpperCase();
  const cat = String(preset.category || "").toUpperCase();
  const layers = Array.isArray(preset.layers) ? preset.layers : [];
  const firstPath = String(layers[0]?.path || layers[0]?.element || "").toUpperCase();

  // 1. Multi-level presets (hasLevel !== false)
  if (preset.hasLevel !== false && (preset.defaultLevel != null || preset.hasLevel)) {
    const lvl = preset.defaultLevel ?? 500;
    const isFy4b =
      id.includes("FY4B") ||
      firstPath.includes("FY4B") ||
      layers.some((l) => String(l?.path || l?.element || "").toUpperCase().includes("FY4B"));
    if (isFy4b) {
      return `C${String(lvl).padStart(3, "0")}`; // e.g. "C012"
    }
    const isMeterHeight =
      id.includes("TDMOSAIC") ||
      firstPath.includes("TDMOSAIC") ||
      layers.some((l) => String(l?.path || l?.element || "").toUpperCase().includes("TDMOSAIC"));
    if (isMeterHeight) {
      return `${lvl} m`; // e.g. "3000 m" or "500 m"
    }
    return `${lvl} hPa`;
  }

  // 2. Single-level presets (hasLevel === false)
  if (cat.includes("DERIVED")) return "Diag";
  if (cat.includes("TLOGP")) return "Sounding";
  if (cat.includes("TIME-HEIGHT") || cat.includes("LINE-HEIGHT") || cat.includes("TIME-DISTANCE")) return "Profile";

  // Satellite single-channel or L2 products
  const chMatch = firstPath.match(/\b(C\d{3})\b/);
  if (chMatch) return chMatch[1]; // e.g. "C002", "C006", "C009", "C012"
  if (id.includes("SAT-") || cat.includes("SATELLITE") || firstPath.startsWith("SATELLITE/")) {
    if (firstPath.includes("DUST")) return "RGB";
    if (firstPath.includes("CTT")) return "CTT";
    if (firstPath.includes("QPE")) return "Sat QPE";
    return "Sat";
  }

  // Radar, Lightning & Wind Profiler
  if (firstPath.includes("LIGHTNING") || id.includes("LIGHTNING")) return "Ltng";
  if (firstPath.includes("WIND_PROFILER") || id.includes("WIND-PROFILER") || id.includes("WIND_PROFILER")) return "Prof";
  if (firstPath.startsWith("SWAN_PRODUCT/") || id.includes("SWAN") || firstPath.includes("RADAR")) return "Radar";

  // Non-surface single-level NWP fields
  if (firstPath.includes("TROPOPAUSE") || id.includes("TROPOPAUSE")) return "Trop";
  if (firstPath.includes("ZERO_DEGREE") || id.includes("0C-HEIGHT")) return "0°C";
  if (firstPath.includes("100M") || id.includes("100M")) return "100m";
  if (firstPath.includes("CAPE") || firstPath.includes("CIN") || firstPath.includes("TCWV") || firstPath.includes("PWAT") || firstPath.includes("K_INDEX") || firstPath.includes("SWEAT") || firstPath.includes("HELICITY")) {
    return "Col";
  }

  if (preset.isObservation && cat.includes("UPPER")) return "Obs";
  return "Sfc";
}
```

Then in `PresetMenu.svelte:430-436`:
```svelte
{@const badgeText = formatPresetBadge(preset)}
{#if badgeText}
  <span class="preset-badge">{badgeText}</span>
{/if}
```

---

### Issue 6: Should Not Mix Multi-Language in `name`/`title`, `category-name`, `preset-name`, `win-title`, `active-title` — Add User-Selectable Multi-Language (`en` / `zh`) Support

#### Affected Files
- **New Reactive i18n Store**:
  - `client/src/lib/stores/i18n.svelte.js` (new global language store & translation/localization helpers, patterned after `theme.svelte.js`)
- **Preset & Layer Data Sources**:
  - `scripts/gen-presets.mjs:284-311, 317-397, 416, 531, 549`
  - `client/config.json` (categories, presets, and nested `layers[].name` entries)
- **Language Switcher / Toggle UI**:
  - `client/src/components/NavBar.svelte:802-890` (Hamburger Menu `Language / 语言` switcher or top-bar quick toggle)
  - `client/src/components/config/SettingsForm.svelte:79-120` (Global Settings language radio cards)
  - `client/src/components/CommandPalette.svelte:35-45` (Quick actions for switching language)
- **UI Components Rendering `name`/`title`, `category-name`, `preset-name`, `win-title`, `active-title`**:
  - `client/src/components/PresetMenu.svelte:105-124, 390, 429` (`.category-name`, `.preset-name`)
  - `client/src/components/NavBar.svelte:508, 639` (`.active-title`, `-- Presets / 组合图 --`)
  - `client/src/components/WindowPanel.svelte:51-66, 98` (`.win-title`)
  - `client/src/ui/tabs/windowTitles.js:12-71` (`computeFullWindowTitle`)
  - `client/src/components/TabsBar.svelte:298-302` (`.tab-label`)
  - `client/src/components/LayersPanel.svelte:51-60, 207` (`.win-target-badge`)
  - `client/src/components/LayerRow.svelte:213, 812, 821, 829, 839` (`.layer-name`, `pmtiles` feature checkboxes)
  - `client/src/components/StationFilter.svelte:158-181` (station filter field options)
  - `client/src/components/config/LayerForm.svelte:7-13, 180, 204, 225, 234` (config editor dropdowns/labels)
  - `client/src/components/HelpModal.svelte:56-124` (help modal headers and descriptions)

#### Problem Analysis
Currently, the application has no language/locale toggle. Instead, strings across the codebase either exist in a single language (the original 10 categories are English-only, while some presets like `"ECMWF 降水相态与能见度"` are Chinese-only) or concatenate **both** languages into a single string:

1. **8 Preset Categories (`config.json` & `scripts/gen-presets.mjs:284-309`) concatenate Chinese + English**:
   - `"强对流与短临 (Severe Convective & Nowcasting)"`
   - `"智能网格预报 (National Gridded Guidance)"`
   - `"高密地面与海洋观测 (High-Density Observations)"`
   - `"数值预报高影响要素 (High-Impact NWP Fields)"`
   - `"实况融合 (Land Surface Reanalysis)"`
   - `"集合预报与概率 (Ensemble & Probability)"`
   - `"预报员指导 (Forecaster Guidance)"`
   - `"气象卫星遥感 (Satellite Remote Sensing)"`
   - Meanwhile, the original 10 categories (`"Surface Observations"`, `"Upper-Air Observations"`, `"TlogP Observation"`, `"NWP Synoptic"`, `"NWP Synoptic Rain"`, `"NWP Time-Height Profile"`, `"NWP Line-Height Profile"`, `"NWP Time-Distance Profile"`, `"Multi-Time Recipes"`, `"Derived Diagnostics"`) are English-only.
   - Because `.preset-categories` in `PresetMenu.svelte:656` is `200px` wide (`max-width: 140px` for `.category-name`), every bilingual category string overflows and truncates with `...`.

2. **143 Preset Names & Layer Names (`config.json` & `scripts/gen-presets.mjs:416`) concatenate Chinese + English**:
   - `scripts/gen-presets.mjs:416` sets `const displayName = "${item.name_zh} / ${item.name_en}"` (even though `dataset_manifest.json` already provides separate `item.name_zh` and `item.name_en` fields!).
   - Hand-added presets in `config.json` also mix languages (e.g., `"SWAN 组合反射率 (MCR)"`, `"风云四号B 红外云图 (FY-4B C012)"`, `"实况 24小时变温 (24h Temp Change)"`).
   - Because `preset.name` directly feeds `.preset-name` (`PresetMenu.svelte:429`), `.active-title` (`NavBar.svelte:508`, `max-width: 190px`), `.win-title` (`WindowPanel.svelte:98`), `.tab-label` (`TabsBar.svelte:299`, `max-width: 180px`), `.win-target-badge` (`LayersPanel.svelte:207`, `max-width: 140px`), and `.layer-name` (`LayerRow.svelte:213`), every narrow label overflows and mixes languages.

3. **Hardcoded Bilingual Strings in Svelte Components**:
   - `NavBar.svelte:639`: `<option value="">-- Presets / 组合图 --</option>`
   - `LayerRow.svelte:812, 821, 829, 839`: `经纬网 (Graticule)`, `国界 (World)`, `省界 (Provinces)`, `城市 (Cities)`
   - `StationFilter.svelte:158-181`: `Snow Depth (积雪深度)`, `Pressure Change 3h (3h变压)`, `Visibility (能见度)`, `Temperature (气温)`, etc.
   - `LayerForm.svelte:8-12, 180, 204, 225, 234`: `Contour / Isobands (等值线/色斑图)`, `Wind Barbs / Streamlines (风羽/流线)`, etc.
   - `HelpModal.svelte:56-124`: `Help & Shortcuts / 快捷键与使用帮助`, `Keyboard Shortcuts / 快捷键`, `Quick Guide / 快速指南`, etc.

#### Fix Suggestion: Add Reactive Multi-Language (`en` / `zh`) Support with User Toggle

Instead of baking both languages into every string, introduce a reactive locale store (`en` / `zh`) so the user can toggle/select their preferred language at any time, and every `name`, `title`, `category-name`, `preset-name`, `win-title`, `active-title`, and control label renders **only** in the currently active language.

##### Step 1: Create `client/src/lib/stores/i18n.svelte.js` (Reactive Locale Store & Translators)
Patterned after `theme.svelte.js`, store the active locale (`"en"` or `"zh"`) in `$state`, persist it to `localStorage` (`"micaps-ui-locale"`) and `CURRENT_CONFIG.locale`, and provide helpers that resolve localized names for categories, presets, layers, and UI chrome:

```js
// client/src/lib/stores/i18n.svelte.js
import { CURRENT_CONFIG } from "../../config/presets.js";
import { tabsState } from "./tabs.svelte.js";
import { updateWindowTitle } from "../../ui/tabs/windowTitles.js";

export const ALLOWED_LOCALES = ["en", "zh"];

export const LOCALE_LABELS = {
  en: "English (EN)",
  zh: "中文 (ZH)",
};

export function normalizeLocale(locale) {
  if (!locale) return "en";
  const l = String(locale).toLowerCase().trim();
  if (l.startsWith("zh")) return "zh";
  return ALLOWED_LOCALES.includes(l) ? l : "en";
}

function getStoredLocale() {
  if (typeof localStorage === "undefined") return "en";
  try {
    const s = localStorage.getItem("micaps-ui-locale");
    if (s) return normalizeLocale(s);
  } catch {}
  return "en";
}

let activeLocale = $state(getStoredLocale());

export function getGlobalLocale() {
  return activeLocale;
}

export function setGlobalLocale(locale) {
  const norm = normalizeLocale(locale);
  activeLocale = norm;

  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.setAttribute("lang", norm === "zh" ? "zh-CN" : "en");
    document.documentElement.setAttribute("data-locale", norm);
  }
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("micaps-ui-locale", norm);
    } catch {}
  }
  if (CURRENT_CONFIG && !Array.isArray(CURRENT_CONFIG)) {
    CURRENT_CONFIG.locale = norm;
  }

  // Recompute all window titles so .win-title, .tab-label, and .win-target-badge update immediately
  try {
    for (const tab of tabsState.tabs || []) {
      for (const win of tab.windows || []) {
        if (win.activeGroup) {
          win.baseTitle = localizeEntityName(win.activeGroup, norm);
        }
        updateWindowTitle(win);
      }
    }
  } catch {}
}

export function toggleGlobalLocale() {
  setGlobalLocale(activeLocale === "en" ? "zh" : "en");
}

// Canonical category translation table (covers all 18 categories)
export const CATEGORY_TRANSLATIONS = {
  "Surface Observations": { en: "Surface Observations", zh: "地面观测" },
  "Upper-Air Observations": { en: "Upper-Air Observations", zh: "高空观测" },
  "TlogP Observation": { en: "T-lnP Sounding", zh: "T-lnP 探空分析" },
  "NWP Synoptic": { en: "NWP Synoptic", zh: "数值预报天气形势" },
  "NWP Synoptic Rain": { en: "NWP Synoptic Rain", zh: "数值预报降水" },
  "NWP Time-Height Profile": { en: "NWP Time-Height Profile", zh: "时间-高度剖面" },
  "NWP Line-Height Profile": { en: "NWP Line-Height Profile", zh: "任意基线空间剖面" },
  "NWP Time-Distance Profile": { en: "NWP Time-Distance Profile", zh: "时间-距离剖面 (Hovmöller)" },
  "Multi-Time Recipes": { en: "Multi-Time Recipes", zh: "多时次合成图" },
  "Derived Diagnostics": { en: "Derived Diagnostics", zh: "物理量诊断分析" },
  "Severe Convective & Nowcasting": { en: "Severe Convective & Nowcasting", zh: "强对流与短临" },
  "National Gridded Guidance": { en: "National Gridded Guidance", zh: "智能网格预报" },
  "High-Density Observations": { en: "High-Density Observations", zh: "高密地面与海洋观测" },
  "High-Impact NWP Fields": { en: "High-Impact NWP Fields", zh: "数值预报高影响要素" },
  "Land Surface Reanalysis": { en: "Land Surface Reanalysis", zh: "实况融合分析" },
  "Ensemble & Probability": { en: "Ensemble & Probability", zh: "集合预报与概率" },
  "Forecaster Guidance": { en: "Forecaster Guidance", zh: "预报员指导产品" },
  "Satellite Remote Sensing": { en: "Satellite Remote Sensing", zh: "气象卫星遥感" },
};

/**
 * Splits a legacy mixed "中文 / English" or "中文 (English)" string if explicit
 * name_en / name_zh fields are not present on the object.
 */
export function splitBilingualString(raw) {
  const s = String(raw || "").trim();
  if (!s) return { en: "", zh: "" };

  // Pattern 1: "中文名称 / English Name"
  if (s.includes(" / ")) {
    const [left, right] = s.split(" / ").map((p) => p.trim());
    const leftHasZh = /[\u4e00-\u9fa5]/.test(left);
    const rightHasZh = /[\u4e00-\u9fa5]/.test(right);
    if (leftHasZh && !rightHasZh) return { zh: left, en: right };
    if (!leftHasZh && rightHasZh) return { en: left, zh: right };
  }

  // Pattern 2: "中文名称 (English Name)" where parens contain no Chinese
  const zhLeadMatch = s.match(/^([^\(]*[\u4e00-\u9fa5][^\(]*)\(([^\)\u4e00-\u9fa5]+)\)$/);
  if (zhLeadMatch) {
    return { zh: zhLeadMatch[1].trim(), en: zhLeadMatch[2].trim() };
  }

  // Pattern 3: "English Name (中文名称)"
  const enLeadMatch = s.match(/^([^\(\u4e00-\u9fa5]+)\(([^\)]*[\u4e00-\u9fa5][^\)]*)\)$/);
  if (enLeadMatch) {
    return { en: enLeadMatch[1].trim(), zh: enLeadMatch[2].trim() };
  }

  return { en: s, zh: s };
}

export function localizeCategory(rawCategory, locale = activeLocale) {
  if (!rawCategory) return locale === "zh" ? "其他" : "Other";
  const direct = CATEGORY_TRANSLATIONS[rawCategory];
  if (direct) return direct[locale] || direct.en;

  const { en, zh } = splitBilingualString(rawCategory);
  if (CATEGORY_TRANSLATIONS[en]) {
    return CATEGORY_TRANSLATIONS[en][locale];
  }
  return locale === "zh" ? zh : en;
}

export function localizeEntityName(entity, locale = activeLocale) {
  if (!entity) return "";
  if (typeof entity === "string") {
    const { en, zh } = splitBilingualString(entity);
    return locale === "zh" ? zh : en;
  }
  if (locale === "zh" && entity.name_zh) return entity.name_zh;
  if (locale === "en" && entity.name_en) return entity.name_en;
  const raw = (locale === "en" && entity.shortName && !/[\u4e00-\u9fa5]/.test(entity.shortName))
    ? entity.name || entity.shortName
    : (entity.name || entity.title || entity.id || "");
  const { en, zh } = splitBilingualString(raw);
  return locale === "zh" ? zh : en;
}
```

##### Step 2: Store Separate `name_en` / `name_zh` and `category_en` / `category_zh` in `scripts/gen-presets.mjs` & `client/config.json`
In `scripts/gen-presets.mjs:416, 531, 549`, `dataset_manifest.json` **already** has separate `item.name_en` and `item.name_zh` fields! Instead of concatenating `${item.name_zh} / ${item.name_en}` into `name`:
```js
// scripts/gen-presets.mjs
const layerDef = {
  id: layerId,
  name: item.name_en,
  name_en: item.name_en,
  name_zh: item.name_zh,
  type: layerType,
  model,
  element,
  path: item.dataPath,
  render,
};

const presetDef = {
  category: categoryEn,       // e.g. "Satellite Remote Sensing"
  category_en: categoryEn,
  category_zh: categoryZh,    // e.g. "气象卫星遥感"
  hasLevel,
  id: presetId,
  name: item.name_en,
  name_en: item.name_en,
  name_zh: item.name_zh,
  isObservation,
  layers: [layerDef],
};
```
And for the hand-authored presets in `client/config.json`, provide `name_en` and `name_zh` (e.g., `name_en: "SWAN Composite Reflectivity (MCR)"`, `name_zh: "SWAN 组合反射率"`).

##### Step 3: Add User Language Selector / Toggle in `NavBar.svelte`, `SettingsForm.svelte`, and `CommandPalette.svelte`
1. **In `NavBar.svelte` Hamburger Menu (`#nav-menu-dropdown`, right after `Theme / Scheme` or `Map Projection`)**:
   ```svelte
   <div class="menu-divider" role="separator"></div>

   <!-- Language Switcher -->
   <div class="menu-section-header">{currentLocale === "zh" ? "语言 (Language)" : "Language"}</div>
   <button
     type="button"
     id="menu-item-lang-en"
     class="nav-menu-item"
     class:selected={currentLocale === "en"}
     role="menuitem"
     onclick={() => { setGlobalLocale("en"); isMenuOpen = false; }}
   >
     <span class="menu-item-icon">🌐</span>
     <span class="menu-item-label">English</span>
     {#if currentLocale === "en"}<span class="menu-check">✓</span>{/if}
   </button>
   <button
     type="button"
     id="menu-item-lang-zh"
     class="nav-menu-item"
     class:selected={currentLocale === "zh"}
     role="menuitem"
     onclick={() => { setGlobalLocale("zh"); isMenuOpen = false; }}
   >
     <span class="menu-item-icon">🇨🇳</span>
     <span class="menu-item-label">中文 (简体)</span>
     {#if currentLocale === "zh"}<span class="menu-check">✓</span>{/if}
   </button>
   ```
2. **In `SettingsForm.svelte`** (Config Editor -> Global Settings): Add a `Language` radio card group (`English` / `中文`) next to `Theme Scheme`.
3. **In `CommandPalette.svelte`**: Add quick commands to toggle between `English` and `中文`.

##### Step 4: Use Active Locale Across All Title, Category, Preset, Window, and Layer Components
- **`PresetMenu.svelte:390, 429`**:
  - `.category-name`: `{localizeCategory(cat.name, currentLocale)}`
  - `.preset-name`: `{localizeEntityName(preset, currentLocale)}`
- **`NavBar.svelte:508, 639`**:
  - `.active-title`: `{currentGroup ? localizeEntityName(currentGroup, currentLocale) : (currentLocale === "zh" ? "选择预设..." : "Select Preset...")}`
  - `#select-preset-group` placeholder (`:639`): `{currentLocale === "zh" ? "-- 预设组合图 --" : "-- Presets --"}`
- **`windowTitles.js:12-71` & `WindowPanel.svelte:51-66, 98`**:
  - In `computeFullWindowTitle(win, baseText, isModelAlloc)`, resolve `base = localizeEntityName(win.activeGroup, getGlobalLocale())` when `win.activeGroup` is present, so `.win-title` (`WindowPanel.svelte:98`), `.tab-label` (`TabsBar.svelte:299`), and `.win-target-badge` (`LayersPanel.svelte:207`) always render in a single language (`en` or `zh`) and immediately update when the user toggles the language!
- **`LayerRow.svelte:213, 812-839`, `StationFilter.svelte:158-181`, `LayerForm.svelte`, and `HelpModal.svelte`**:
  - `.layer-name`: `{localizeEntityName(layer, currentLocale)}`
  - Replace hardcoded bilingual labels (`经纬网 (Graticule)`, `Snow Depth (积雪深度)`, `Contour / Isobands (等值线/色斑图)`, `Help & Shortcuts / 快捷键与使用帮助`) with locale-selected labels (`currentLocale === "zh" ? "经纬网" : "Graticule"`, etc.).

---

### Issue 7: `Sounding Station Network` Should Remove `Temperature`, `Wind Barbs`... `.config-row`s and `Filter` Subtab, and Add `Station ID` `.config-row`

#### Affected Files
- `client/src/ui/layers/layerDefaults.js:40-51` (`getStationDatasetType`)
- `client/src/components/LayerRow.svelte:115-120` (subtab list for `station` layers)
- `client/src/components/LayerRow.svelte:416-564, 630-635` (`station` `elements` and `filter` panes)
- `client/src/layers/station/stationPlot.js:60-73, 120-205` (rendering `station_id` label on map canvas)
- `client/config.json:144-158` (`upperair-tlogp-stations` layer config in `composite-tlogp`)

#### Problem Analysis
When the `T-lnP Sounding Analysis (TlogP)` preset (`id: "composite-tlogp"`, `client/config.json:138-189`) is loaded, it creates two layers:
1. `id: "upperair-tlogp-stations"`, `name: "Sounding Station Network"`, `type: "station"`, `model: "UPPER_AIR"`, `element: "TLOGP"`, `path: "UPPER_AIR/TLOGP"`.
2. `id: "upperair-tlogp-diagram"`, `name: "T-lnP Sounding Diagram (58362 Shanghai)"`, `type: "tlogp"`.

The `Sounding Station Network` (`UPPER_AIR/TLOGP`) endpoint returns the geographic network of radiosonde stations (`station_id`, `lon`, `lat`, `alt`) so the user can see and click stations on the map to load their vertical T-lnP sounding profile. Unlike `UPPER_AIR/PLOT/500`, `UPPER_AIR/TLOGP` features **do not have single-level `temperature`, `dewpoint`, `wind_speed`, `wind_dir`, or `height` properties**.

However:
1. `getStationDatasetType(layer)` (`client/src/ui/layers/layerDefaults.js:40-51`) classifies `upperair-tlogp-stations` as `"upper_air"` instead of `"tlogp"`.
2. In `LayerRow.svelte:115-120`, `case "station":` unconditionally includes `{ id: "filter", label: "Filter", icon: "🔍" }`, exposing the multi-rule meteorological value `StationFilter` (`Temperature`, `Dewpoint`, `Wind Speed`, `Height/Pressure`) which cannot filter `UPPER_AIR/TLOGP` stations because those fields do not exist on `TLOGP` station index features.
3. In `LayerRow.svelte:417-478`, `Sounding Station Network` renders 3 `.config-row` blocks with checkboxes for `Temperature`, `Dew Point`, `Wind Barbs`, `Height`, `T−Td`, and `Streamlines` (and `client/config.json:151-156` sets `showTemp`, `showDewpoint`, `showPressure`, `showWind`), none of which exist on `Sounding Station Network`!
4. Meanwhile, there is **no `Station ID` `.config-row`** to toggle displaying the 5-digit `station_id` label (e.g. `58362`, `54511`) next to each sounding station dot on the map!

#### Fix Suggestion

1. **In `client/src/ui/layers/layerDefaults.js:40-51`**, detect `"tlogp"` in `getStationDatasetType(layer)` before `isUpperAirStationLayer(layer)`:
```js
export function getStationDatasetType(layer) {
  if (!layer) return "standard";
  if (layer.type && layer.type !== "station") return null;
  const str = `${layer.path || ""} ${layer.element || ""} ${layer.id || ""} ${layer.name || ""}`.toUpperCase();
  if (str.includes("TLOGP") || str.includes("SOUNDING STATION NETWORK")) return "tlogp";
  if (str.includes("SNOW_DEPTH") || str.includes("SNOD")) return "snow_depth";
  if (str.includes("PRES_CHANGE_3H")) return "pres_change_3h";
  if (str.includes("PRES_CHANGE_24H")) return "pres_change_24h";
  if (str.includes("HORIZONTAL_VISIBILITY") || str.includes("VISIBILITY_1MIN") || str.includes("VIS_1MIN")) return "visibility";
  if (str.includes("AMV")) return "amv";
  if (isUpperAirStationLayer(layer)) return "upper_air";
  return "standard";
}
```

2. **In `client/src/components/LayerRow.svelte:115-120`**, omit the `Filter` subtab when `stationType === "tlogp"`:
```js
case "station":
  if (stationType === "tlogp") {
    return [
      { id: "elements", label: "Elements", icon: "📋" },
      { id: "time", label: "Time", icon: "⏱" },
    ];
  }
  return [
    { id: "elements", label: "Elements", icon: "📋" },
    { id: "filter", label: "Filter", icon: "🔍" },
    { id: "time", label: "Time", icon: "⏱" },
  ];
```

3. **In `client/src/components/LayerRow.svelte:416-564`**, add an `{:else if stationType === "tlogp"}` branch that renders only the `Station ID` `.config-row` (removing `Temperature`, `Dew Point`, `Wind Barbs`, `Height`, `T−Td`, `Streamlines`) and omit `<StationFilter>` when `stationType === "tlogp"`:
```svelte
<!-- client/src/components/LayerRow.svelte -->
{:else if stationType === "tlogp"}
  <div class="config-row">
    <label for="chk-show-station-id-{layer.id}">
      <input
        type="checkbox"
        id="chk-show-station-id-{layer.id}"
        class="chk-show-station-id"
        checked={layer.config?.showStationId !== false}
        onchange={(e) => handleConfigChange("showStationId", e.target.checked)}
      />
      <span class="lbl-station-id">Station ID</span>
    </label>
  </div>
{/if}
```
```svelte
{#if stationType !== "tlogp"}
  <div class="config-subtab-pane" class:active={currentSubtab === "filter"} role="tabpanel">
    <StationFilter
      {layer}
      onFilterChange={(filterData) => handleConfigPatch(filterData)}
    />
  </div>
{/if}
```

4. **In `client/src/layers/station/stationPlot.js`**, support rendering `station_id` when `cfg.showStationId` is enabled (or by default for `TLOGP` stations when `cfg.showStationId !== false`):
```js
// In renderStationPlotToCanvas (client/src/layers/station/stationPlot.js):
const isTlogpStation = String(cfg.element || "").toUpperCase() === "TLOGP" || String(cfg.layerId || "").toLowerCase().includes("tlogp");
const showStationId = cfg.showStationId !== undefined ? Boolean(cfg.showStationId) : isTlogpStation;
const stationIdText = p?.station_id != null ? String(p.station_id).trim() : (p?.id != null ? String(p.id).trim() : "");

if (showStationId && stationIdText) {
  drawPlotText(stationIdText, cx + 6 * scale, cy - 8 * scale, "ppp", "left");
}
```

5. **In `client/config.json:151-156`** and `client/src/config/presets.js:332-343` (`autoSaveLayerConfig`), replace the unused `showTemp`/`showDewpoint`/`showPressure`/`showWind` flags on `upperair-tlogp-stations` with `"showStationId": true` and persist `showStationId` in `autoSaveLayerConfig`.

---

## Part II: Additional UI/UX Issues Found Across the Client (8–13)

---

### Issue 8: Camera Sync Toggle (`#btn-sync-toggle`) Is Hidden and Unreachable in Split-Screen Mode

#### Affected Files
- `client/src/components/TabsBar.svelte:425-444` (DOM markup)
- `client/src/components/TabsBar.svelte:555-557` (CSS override)

#### Problem Analysis
In `TabsBar.svelte:425-444`, the map camera synchronization button `#btn-sync-toggle` (`Sync 🔗` / `Sync ✕`) is nested inside `<div id="layout-controls" class="layout-controls">`:
```svelte
<!-- client/src/components/TabsBar.svelte:425-444 -->
<div id="layout-controls" class="layout-controls" role="group" aria-label="Grid layout">
  {#each LAYOUTS as l}
    ...
  {/each}

  <button
    id="btn-sync-toggle"
    class="layout-btn sync-btn"
    class:active={syncMap}
    class:hidden={!isSplit}
    type="button"
    title="Toggle camera (pan/zoom) synchronization across split windows"
    aria-pressed={syncMap}
    onclick={() => onToggleSync && onToggleSync()}
  >
    {syncMap ? "Sync 🔗" : "Sync ✕"}
  </button>
</div>
```
However, when the layout grid selector was moved to `NavBar.svelte`, `TabsBar.svelte:555-557` added:
```css
/* Hide duplicate layout controls in secondary bar (moved to primary NavBar) */
.tabs-bar #layout-controls {
  display: none !important;
}
```
Because `#btn-sync-toggle` is inside `#layout-controls` and was **not** moved to `NavBar.svelte`, `#btn-sync-toggle` is permanently hidden (`display: none !important`). Users in `1x2`, `2x2`, `2x3`, or `3x2` split-screen mode have no way to toggle map pan/zoom synchronization on or off!

#### Fix Suggestion
Move `#btn-sync-toggle` **outside** `#layout-controls` in `TabsBar.svelte:425-444` (placing it directly in `.tabs-bar-controls` when `isSplit` is true):
```svelte
<!-- client/src/components/TabsBar.svelte -->
<div id="layout-controls" class="layout-controls" role="group" aria-label="Grid layout">
  {#each LAYOUTS as l}
    ...
  {/each}
</div>

<button
  id="btn-sync-toggle"
  class="layout-btn sync-btn"
  class:active={syncMap}
  class:hidden={!isSplit}
  type="button"
  title="Toggle camera (pan/zoom) synchronization across split windows"
  aria-pressed={syncMap}
  onclick={() => onToggleSync && onToggleSync()}
>
  {syncMap ? "Sync 🔗" : "Sync ✕"}
</button>
```

---

### Issue 9: Window Header (`.win-title`) Appends Raw `hPa` to Satellite Channels (`12 hPa`) and Radar Heights (`3000 hPa`)

#### Affected Files
- `client/src/components/WindowPanel.svelte:51-66`

#### Problem Analysis
In `WindowPanel.svelte:58-64`:
```js
const isSurface = win?.model === "SURFACE" || win?.level === 0 || win?.activeGroup?.hasLevel === false;
const levelStr = (!isSurface && win?.level) ? `${win.level} hPa` : "";
let suffix = "";
if (levelStr && !rawTitle.includes(`${win.level}`) && !rawTitle.toLowerCase().includes("surface")) {
  suffix += ` - ${levelStr}`;
}
```
When viewing a multi-channel satellite preset (`sat-fy4b-china`, `win.level = 12`) whose title is `"FY-4B CHINA Multi-Channel"`, `rawTitle` does not contain `"12"`, so `WindowPanel.svelte:62` appends **` - 12 hPa`** to `.win-title`! Similarly, when viewing 3D Radar Mosaic (`swan-tdmosaic`, `win.level = 3000`), it appends **` - 3000 hPa`** instead of **` - 3000 m`**!

#### Fix Suggestion
Format `levelStr` in `WindowPanel.svelte:58-64` using the same channel/meter awareness as `NavBar.svelte`:
```js
const isSurface = win?.model === "SURFACE" || win?.level === 0 || win?.activeGroup?.hasLevel === false;
const isFy4b =
  win?.model === "SATELLITE" ||
  /FY4B/i.test(String(win?.activeGroup?.id || "")) ||
  (Array.isArray(win?.layers) && win.layers.some((l) => /FY4B/i.test(String(l?.path || l?.element || ""))));
const isMeterHeight =
  /TDMOSAIC/i.test(String(win?.activeGroup?.id || "")) ||
  (Array.isArray(win?.layers) && win.layers.some((l) => /TDMOSAIC/i.test(String(l?.path || l?.element || ""))));

const levelStr = (!isSurface && win?.level != null)
  ? (isFy4b
      ? `C${String(win.level).padStart(3, "0")}`
      : (isMeterHeight ? `${win.level} m` : `${win.level} hPa`))
  : "";
```

---

### Issue 10: Mismatched CSS Selectors Break `HelpModal`, `ConfigEditor`, `CommandPalette`, and `WindowPanel` in Light & Brutalism Themes

#### Affected Files
- `client/src/components/HelpModal.svelte:50, 145-283` vs `client/src/styles/tokens.css:112` & `client/src/styles/polish.css:265, 386`
- `client/src/components/ConfigEditor.svelte:105, 149` vs `client/src/styles/tokens.css:109` & `client/src/styles/polish.css:265, 386`
- `client/src/components/CommandPalette.svelte:98, 175` vs `client/src/styles/polish.css:269, 398`
- `client/src/components/WindowPanel.svelte:240`
- `client/src/components/timeline/MultiTrackTimeline.svelte:911, 1032, 1136, 1291`

#### Problem Analysis
1. **`HelpModal.svelte` (`:50, :145-283`)**:
   - The dialog container class in `HelpModal.svelte:50` is `.help-modal-dialog`, and its styles (`:145-283`) use 100% hardcoded dark colors (`background: #161b22`, `background: #0d1117`, `color: #e6edf3`, `color: #c9d1d9`, `kbd { background: #21262d }`).
   - Meanwhile, `tokens.css:112` and `polish.css:265, 386` target `.help-modal-content` (a class that does not exist in `HelpModal.svelte`). As a result, `HelpModal` remains dark with broken styling in both `Light (Paper)` and `Brutalism` themes.
2. **`ConfigEditor.svelte` (`:105, :149`)**:
   - `ConfigEditor.svelte:105` uses `.config-editor-panel`, while `tokens.css:109` and `polish.css:265, 386` target `.config-editor-modal`.
3. **`CommandPalette.svelte` (`:98, :175`)**:
   - `CommandPalette.svelte:98` uses `.cmd-palette-backdrop`, while `polish.css:269, 398` targets `.cmd-palette-overlay`.
4. **`WindowPanel.svelte` (`:240`)**:
   - `.win-panel .win-header:hover` hardcodes `background: rgba(22, 27, 34, 0.95);`. In `Light` or `Brutalism` theme, hovering over a window header turns it pitch-black while the text in `Brutalism` is `#111` (`polish.css:458`), making the window title unreadable on hover!
5. **`MultiTrackTimeline.svelte` (`:911, :1032, :1136, :1291`)**:
   - `.track-headers-column` (`:1032`) hardcodes `background: rgba(13, 17, 23, 0.95);` instead of `var(--bg-secondary)`, so in `Light` and `Brutalism` themes the left header column of the DAW timeline is pitch-black while the right scroll area (`:1129`, `var(--bg-primary)`) is white!

#### Fix Suggestion
- In `HelpModal.svelte:145-283`, replace hardcoded hex colors (`#161b22`, `#0d1117`, `#e6edf3`, `#c9d1d9`, `#8b949e`, `#30363d`) with CSS variables (`var(--bg-secondary)`, `var(--bg-primary)`, `var(--text-primary)`, `var(--text-secondary)`, `var(--border-color)`).
- In `tokens.css:109-112` and `polish.css:265, 269, 386, 398`, include `.help-modal-dialog`, `.config-editor-panel`, and `.cmd-palette-backdrop`.
- In `WindowPanel.svelte:240`, change `background: rgba(22, 27, 34, 0.95);` to `background: var(--bg-header, rgba(22, 27, 34, 0.95));`.
- In `MultiTrackTimeline.svelte:1032`, change `background: rgba(13, 17, 23, 0.95);` to `background: var(--bg-secondary, rgba(13, 17, 23, 0.95));` and replace hardcoded `rgba(255, 255, 255, 0.08)` borders with `var(--border-subtle, rgba(255, 255, 255, 0.08))`.

---

### Issue 11: Split Contrast Mode (`model` / `level`) Guards Do Not Check `isObservation` or `hasLevel === false`

#### Affected Files
- `client/src/components/NavBar.svelte:113-132, 599, 608, 617`
- `client/src/components/TabsBar.svelte:59-70`
- `client/src/App.svelte:1917-1924`

#### Problem Analysis
In `NavBar.svelte:599, 608, 617` and `TabsBar.svelte:59-70`:
- **Multi-Time Contrast (`step`)**: `disabled={isSurface || isUpperAir}`
- **Multi-Level Contrast (`level`)**: `disabled={isSurface}`
- **Multi-Model Contrast (`model`)**: `disabled={isSurface || isUpperAir}`

However, `isSurface` (`NavBar.svelte:113-121`) only checks `model === "SURFACE"` or `id.includes("surface")`, and `isUpperAir` (`NavBar.svelte:123-132`) only checks `model === "UPPER_AIR"` or `id.includes("upper")`.
Consequently:
1. When viewing **Satellite (`SATELLITE`), Radar (`SWAN_PRODUCT`), CLDAS, or Wind Profiler** observations (`activeGroup?.isObservation === true`), **Multi-Model Contrast (`model`) is enabled**! Clicking it attempts to load satellite/radar paths under `ECMWF_HR`, `GFS`, `CMA_GFS`, and `CMA_MESO`, failing across all split panes.
2. When viewing **any single-level preset with `activeGroup?.hasLevel === false`** (such as `CAPE`, `PWAT`, `10m Gust`, `SWAN MCR`, `FY-2G Dust`), **Multi-Level Contrast (`level`) is enabled**! Clicking it attempts to allocate `1000, 850, 700, 500 hPa` across split panes for a product that has no pressure levels.

#### Fix Suggestion
In `NavBar.svelte`, `TabsBar.svelte`, and `App.svelte:1917-1924`:
- Disable **Multi-Level Contrast (`level`)** whenever `activeGroup ? activeGroup.hasLevel === false : isSurface`.
- Disable **Multi-Model Contrast (`model`)** whenever `Boolean(activeGroup?.isObservation || activeWin?.isObservation || isSurface || isUpperAir)` or when the model is not one of the switchable NWP models (`DEFAULT_MODELS`: `ECMWF_HR`, `GFS`, `CMA_GFS`, `CMA_MESO`).

---

### Issue 12: 30+ Duplicate Presets in `client/config.json` from `scripts/gen-presets.mjs`

#### Affected Files
- `scripts/gen-presets.mjs:562-568`
- `client/config.json`

#### Problem Analysis
In `scripts/gen-presets.mjs:563-568`:
```js
// Retain all existing non-generated presets from origin/main
const existingNonGenerated = config.presets.filter((p) => {
  if (!p || p.divider) return true;
  return !p.id?.startsWith("preset-");
});

config.presets = [...existingNonGenerated, ...newPresets];
```
Because `config.json` already contained hand-authored presets with IDs like `sat-fy4b-china`, `sat-fy4b-disk`, `swan-mcr`, `swan-mtop`, `swan-mvil`, `swan-qpe`, `swan-tdmosaic`, `swan-tvs`, `ecmwf-cape-shear`, `ecmwf-pwat`, `ecmwf-pvort-multi`, `cldas-temp-2m`, `scmoc-rain-24h`, etc. (none of which start with `"preset-"`), running `scripts/gen-presets.mjs` appended `preset-fy4b_china_grouped`, `preset-fy4b_disk_grouped`, `preset-swan_mcr`, `preset-swan_tdmosaic`, `preset-ecmwf_pvort`, etc. **into the exact same categories**.
As a result, users opening `气象卫星遥感 (Satellite Remote Sensing)` or `强对流与短临 (Severe Convective & Nowcasting)` see duplicate items for the exact same dataset with slightly different naming formats.

#### Fix Suggestion
In `scripts/gen-presets.mjs`, deduplicate against `existingNonGenerated` by checking whether an existing preset already references the same primary `layer.path` (or consolidate on a single canonical preset list) before pushing a generated `preset-*` entry.

---

### Issue 13: Loop Range Markers (`A` / `B`) in `TimeSlider.svelte` Disappear When Playback Is Paused

#### Affected Files
- `client/src/components/TimeSlider.svelte:303, 323, 372, 660, 696, 721, 766`

#### Problem Analysis
In `TimeSlider.svelte`:
- `start()` (`:303`) sets `timeline.loopRange.active = true;`
- `pause()` (`:323`) sets `timeline.loopRange.active = false;`
- `let isLooping = $derived(Boolean(playback.isPlaying));` (`:372`)
- The draggable loop boundary lines (`#timeline-loop-line-a` and `#timeline-loop-line-b` at `:660, :696, :721, :766`) only render when `{#if isLooping && ...}`.

This creates a Catch-22 for the user:
1. While **paused**, the `A` and `B` loop boundary handles are completely hidden, so the user cannot set up a loop sub-range before pressing Play.
2. Only while **actively playing** (when the active chip is jumping every 0.75s–1.5s) do the `A` and `B` drag handles appear—and as soon as the user pauses playback to inspect a frame, `pause()` sets `timeline.loopRange.active = false` and hides the `A`/`B` markers!

#### Fix Suggestion
- Do not overwrite `timeline.loopRange.active = false` inside `pause()` (`TimeSlider.svelte:322-324`) if the user has customized a loop range (or provide an explicit loop toggle button in `TimeSlider.svelte` matching `MultiTrackTimeline.svelte:866`).
- Derive `let isLooping = $derived(Boolean(playback.isPlaying || timeline.loopRange?.active));` (`TimeSlider.svelte:372`) so that when a loop range is active, the `A` and `B` handles remain visible and draggable while paused.
