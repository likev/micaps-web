# MICAPS-Web Multi-Language UI Architecture & Implementation Plan (`multi-language-ui-plan1.md`)

**Target Version**: v1.13.0  
**Scope**: Full-stack client UI localization (`en` / `zh`) across all 19 Svelte 5 components, supporting view modules, and meteorological data/config entities.

---

## 1. Executive Summary & Problem Statement

### Current State
Currently, MICAPS-Web's internationalization layer ([client/src/lib/stores/i18nCore.js](file:///root/downloads/micaps-web/client/src/lib/stores/i18nCore.js) and [client/src/lib/stores/i18n.svelte.js](file:///root/downloads/micaps-web/client/src/lib/stores/i18n.svelte.js)) primarily localizes **data entities**:
1. Splitting bilingual `"English / 中文"` names (`splitBilingualString`, `localizeEntityName`).
2. Translating preset category names (`CATEGORY_TRANSLATIONS`) and preset group titles (`PRESET_TRANSLATIONS`).
3. A handful of inline ternary expressions (`currentLocale === "zh" ? ... : ...`) in [HelpModal.svelte](file:///root/downloads/micaps-web/client/src/components/HelpModal.svelte), [StationFilter.svelte](file:///root/downloads/micaps-web/client/src/components/StationFilter.svelte), and PMTiles basemap toggles in [LayerRow.svelte](file:///root/downloads/micaps-web/client/src/components/LayerRow.svelte).

**Gap**: When the user switches the language to `中文 (ZH)` via the navbar toggle (`#btn-lang-zh`), hamburger menu, or Config Editor, **over 90% of the application UI chrome remains in English**—including `Presets`, `Layout`, `2x3 Split`, `Multi-Model Contrast`, `Level:`, `Channel:`, `Model:`, `Latest` / `History`, `Theme / Scheme`, `Map Projection`, `Config`, `Layers`, `Lighting`, timeline controls, layer drawer tabs, status badges, and configuration dialogs.

### Objective
Upgrade the i18n architecture to provide **complete, reactive multi-language UI support (`en` and `zh`)** so that every button, label, dropdown, menu item, tooltip, badge, tab, and modal switches instantaneously when the locale changes—without page reload and with zero regressions to the existing 1,384 automated tests.

---

## 2. Core Terminology Glossary (`EN` ↔ `ZH`)

The following table defines the canonical Chinese meteorological workstation terminology (incorporating all user-mandated translations):

| Domain | English (`en`) | Chinese (`zh`) | Component / Location |
| :--- | :--- | :--- | :--- |
| **Navigation & Presets** | `Presets` | `数据集` | [PresetMenu.svelte](file:///root/downloads/micaps-web/client/src/components/PresetMenu.svelte), [ConfigEditor.svelte](file:///root/downloads/micaps-web/client/src/components/ConfigEditor.svelte) |
| **Window Layout** | `Layout` | `窗口布局` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte), [TabsBar.svelte](file:///root/downloads/micaps-web/client/src/components/TabsBar.svelte) |
| **Split Modes** | `1x1 (Tabs)` | `1x1 (单窗标签)` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte) |
| | `1x2 Split` | `1x2 分割` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte), [TabsBar.svelte](file:///root/downloads/micaps-web/client/src/components/TabsBar.svelte) |
| | `2x2 Split` | `2x2 分割` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte), [TabsBar.svelte](file:///root/downloads/micaps-web/client/src/components/TabsBar.svelte) |
| | `2x3 Split` | `2x3 分割` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte), [TabsBar.svelte](file:///root/downloads/micaps-web/client/src/components/TabsBar.svelte) |
| | `3x2 Split` | `3x2 分割` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte), [TabsBar.svelte](file:///root/downloads/micaps-web/client/src/components/TabsBar.svelte) |
| **Auto-Allocation / Contrast** | `Empty (none)` | `空白 (无)` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte), [TabsBar.svelte](file:///root/downloads/micaps-web/client/src/components/TabsBar.svelte) |
| | `Multi-Time Contrast` | `多时次对比` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte), [TabsBar.svelte](file:///root/downloads/micaps-web/client/src/components/TabsBar.svelte) |
| | `Multi-Init Contrast` | `多起报对比` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte), [TabsBar.svelte](file:///root/downloads/micaps-web/client/src/components/TabsBar.svelte) |
| | `Multi-Step Contrast` | `多时效对比` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte), [TabsBar.svelte](file:///root/downloads/micaps-web/client/src/components/TabsBar.svelte) |
| | `Multi-Level Contrast` | `多层级对比` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte), [TabsBar.svelte](file:///root/downloads/micaps-web/client/src/components/TabsBar.svelte) |
| | `Multi-Model Contrast` | `多模式对比` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte), [TabsBar.svelte](file:///root/downloads/micaps-web/client/src/components/TabsBar.svelte) |
| **Vertical Dimension** | `Level` / `Channel` / `Height` | `层级` / `通道` / `高度` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte) |
| **NWP Model** | `Model` | `模型` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte) |
| **Operating Mode** | `Latest` / `History` | `实时模式` / `复盘模式` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte) |
| **System Menu** | `Theme` / `Theme / Scheme` | `主题` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte), [SettingsForm.svelte](file:///root/downloads/micaps-web/client/src/components/config/SettingsForm.svelte) |
| | `Light (Paper)` / `Dark (Ink)` / `Brutalism` | `浅色 (纸张)` / `深色 (暗夜)` / `粗野主义` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte), [SettingsForm.svelte](file:///root/downloads/micaps-web/client/src/components/config/SettingsForm.svelte) |
| | `Map Projection` | `地图投影` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte), [LayerRow.svelte](file:///root/downloads/micaps-web/client/src/components/LayerRow.svelte), [SettingsForm.svelte](file:///root/downloads/micaps-web/client/src/components/config/SettingsForm.svelte) |
| | `Mercator` / `Globe` / `Vertical Perspective` | `墨卡托 (Mercator)` / `三维地球 (Globe)` / `垂直透视 (Perspective)` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte), [LayerRow.svelte](file:///root/downloads/micaps-web/client/src/components/LayerRow.svelte) |
| | `Config` | `配置` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte), [TabsBar.svelte](file:///root/downloads/micaps-web/client/src/components/TabsBar.svelte) |
| | `Print` / `Screenshot` / `Help` / `Command Palette` / `Language` | `打印` / `截图` / `帮助` / `命令面板` / `语言` | [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte) |
| **Status Bar & Drawer** | `Layers` | `数据层` | [StatusBar.svelte](file:///root/downloads/micaps-web/client/src/components/StatusBar.svelte), [LayersPanel.svelte](file:///root/downloads/micaps-web/client/src/components/LayersPanel.svelte) |
| | `Lighting` | `光线补偿` | [StatusBar.svelte](file:///root/downloads/micaps-web/client/src/components/StatusBar.svelte) |
| | `OBSERVATION` / `NWP FORECAST` | `实况观测` / `数值预报` | [StatusBar.svelte](file:///root/downloads/micaps-web/client/src/components/StatusBar.svelte) |
| | `Init:` / `Valid:` / `Step:` / `Speed:` | `起报:` / `有效时间:` / `步长:` / `速度:` | [StatusBar.svelte](file:///root/downloads/micaps-web/client/src/components/StatusBar.svelte), [TimeSlider.svelte](file:///root/downloads/micaps-web/client/src/components/TimeSlider.svelte) |
| | `Observation Time:` / `Forecast Lead:` | `观测时间:` / `预报时效:` | [StatusBar.svelte](file:///root/downloads/micaps-web/client/src/components/StatusBar.svelte) |
| | `Sync 🔗` / `Sync ✕` | `同步 🔗` / `同步 ✕` | [TabsBar.svelte](file:///root/downloads/micaps-web/client/src/components/TabsBar.svelte) |

---

## 3. Architecture & Store Design

### 3.1 Pure Dictionary & Translation Function in `i18nCore.js`
Extend [client/src/lib/stores/i18nCore.js](file:///root/downloads/micaps-web/client/src/lib/stores/i18nCore.js) with a structured `UI_STRINGS` dictionary and a fast, zero-dependency translation lookup helper `t(key, paramsOrLocale, maybeLocale)`:

```javascript
/**
 * Dictionary of UI chrome strings keyed by dot-separated namespace keys.
 * Each entry has `{ en: string, zh: string }`.
 */
export const UI_STRINGS = {
  // Navbar & Presets
  "nav.presets": { en: "Presets", zh: "数据集" },
  "nav.presets.title": { en: "Open categorized presets menu", zh: "打开分类数据集菜单" },
  "nav.presets.empty": { en: "No presets available", zh: "暂无可用数据集" },
  "nav.presets.pin": { en: "Pin to quick bar", zh: "固定到快捷栏" },
  "nav.presets.unpin": { en: "Unpin preset", zh: "取消固定" },
  "nav.layout": { en: "Layout", zh: "窗口布局" },
  "nav.layout.title": { en: "Window layout & auto-allocation", zh: "窗口布局与多窗自动分配" },
  "nav.layout.1x1": { en: "1x1 (Tabs)", zh: "1x1 (单窗标签)" },
  "nav.layout.1x2": { en: "1x2 Split", zh: "1x2 分割" },
  "nav.layout.2x2": { en: "2x2 Split", zh: "2x2 分割" },
  "nav.layout.2x3": { en: "2x3 Split", zh: "2x3 分割" },
  "nav.layout.3x2": { en: "3x2 Split", zh: "3x2 分割" },
  "nav.alloc.none": { en: "Empty (none)", zh: "空白 (无)" },
  "nav.alloc.multiTime": { en: "Multi-Time Contrast", zh: "多时次对比" },
  "nav.alloc.multiInit": { en: "Multi-Init Contrast", zh: "多起报对比" },
  "nav.alloc.multiStep": { en: "Multi-Step Contrast", zh: "多时效对比" },
  "nav.alloc.multiLevel": { en: "Multi-Level Contrast", zh: "多层级对比" },
  "nav.alloc.multiModel": { en: "Multi-Model Contrast", zh: "多模式对比" },
  "nav.level": { en: "Level", zh: "层级" },
  "nav.channel": { en: "Channel", zh: "通道" },
  "nav.height": { en: "Height", zh: "高度" },
  "nav.none": { en: "None", zh: "无" },
  "nav.model": { en: "Model", zh: "模型" },
  "nav.mode.latest": { en: "Latest", zh: "实时模式" },
  "nav.mode.history": { en: "History", zh: "复盘模式" },
  "nav.menu.print": { en: "Print", zh: "打印" },
  "nav.menu.screenshot": { en: "Screenshot", zh: "截图" },
  "nav.menu.help": { en: "Help", zh: "帮助" },
  "nav.menu.commandPalette": { en: "Command Palette", zh: "命令面板" },
  "nav.menu.theme": { en: "Theme / Scheme", zh: "主题" },
  "nav.menu.theme.light": { en: "Light (Paper)", zh: "浅色 (纸张)" },
  "nav.menu.theme.dark": { en: "Dark (Ink)", zh: "深色 (暗夜)" },
  "nav.menu.theme.brutalism": { en: "Brutalism", zh: "粗野主义 (Brutalism)" },
  "nav.menu.projection": { en: "Map Projection", zh: "地图投影" },
  "nav.menu.projection.mercator": { en: "Mercator", zh: "墨卡托 (Mercator)" },
  "nav.menu.projection.globe": { en: "Globe", zh: "三维地球 (Globe)" },
  "nav.menu.projection.perspective": { en: "Vertical Perspective", zh: "垂直透视 (Perspective)" },
  "nav.menu.language": { en: "Language", zh: "语言" },
  "nav.menu.config": { en: "Config", zh: "配置" },
  // ... (Full namespace coverage detailed in Section 4)
};
```

#### Parameter Interpolation Support
`translateUI(key, params = {}, locale = getGlobalLocale())` supports `{placeholder}` interpolation:
- Example: `translateUI("layers.staleHidden", { count: 3 }, "zh")` → `"已隐藏 3 个过期数据层"` (from `"已隐藏 {count} 个过期数据层"`).
- Fallback rule: If `key` is missing in `zh`, fall back to `en`; if `key` is missing in `UI_STRINGS`, return `key` unchanged.

### 3.2 Reactive Wrapper in `i18n.svelte.js`
Expose a reactive `t(key, params)` helper from [client/src/lib/stores/i18n.svelte.js](file:///root/downloads/micaps-web/client/src/lib/stores/i18n.svelte.js) that reads `i18nState.locale` (a Svelte 5 `$state` rune):

```javascript
/**
 * Reactive UI string translator for Svelte 5 templates & $derived expressions.
 * Automatically tracks `i18nState.locale`.
 */
export function t(key, params = undefined, explicitLocale = undefined) {
  const loc = explicitLocale || i18nState.locale;
  return translateUI(key, params, loc);
}
```
Because `i18nState.locale` is a reactive rune inside `i18n.svelte.js`, any Svelte component template calling `{t("nav.presets")}` or any `$derived(t(...))` expression will automatically re-evaluate whenever `setLocale("zh")` or `setLocale("en")` is triggered—**without needing manual `$derived(i18n.locale)` boilerplate in every component**.

---

## 4. Component-by-Component Implementation Specification

### Phase 1: Top Navigation Bar, Preset Menu & Tabs Bar

#### 4.1 [PresetMenu.svelte](file:///root/downloads/micaps-web/client/src/components/PresetMenu.svelte)
| Line(s) | Element / Selector | Current (`en`) | Localized (`zh`) |
| :--- | :--- | :--- | :--- |
| 170–200 | `formatPresetBadge(preset)` | `Diag`, `Sounding`, `Profile`, `Sat QPE`, `Sat`, `Ltng`, `Prof`, `Radar`, `Trop`, `Col`, `Obs`, `Sfc` | `诊断`, `探空`, `剖面`, `卫星降水`, `卫星`, `闪电`, `风廓线`, `雷达`, `对流层顶`, `整层`, `观测`, `地面` |
| 393 | `.quick-preset-pill` `title` | `{label} — click to activate` | `{label} — 点击激活` |
| 429 | `#btn-presets-menu` `title` | `Open categorized presets menu` | `打开分类数据集菜单` |
| 432 | `.preset-trigger-label` | `Presets` | `数据集` |
| 445 | `.preset-empty` | `No presets available` | `暂无可用数据集` |
| 510 | `.preset-pin-btn` `title`/`aria-label` | `Unpin preset` / `Pin to quick bar` | `取消固定` / `固定到快捷栏` |

#### 4.2 [NavBar.svelte](file:///root/downloads/micaps-web/client/src/components/NavBar.svelte)
| Line(s) | Element / Selector | Current (`en`) | Localized (`zh`) |
| :--- | :--- | :--- | :--- |
| 165 | `levelLabel` (`$derived`) | `Channel` / `Height` / `Level` | `通道` / `高度` / `层级` |
| 273–278 | `SPLIT_LAYOUTS` labels | `1x2 Split`, `2x2 Split`, `2x3 Split`, `3x2 Split` | `1x2 分割`, `2x2 分割`, `2x3 分割`, `3x2 分割` |
| 552, 555 | `#btn-layout-dropdown`, `.layout-label-text` | `Layout` (title: `Window layout & auto-allocation`) | `窗口布局` (title: `窗口布局与多窗自动分配`) |
| 569 | `#btn-layout-1x1` | `1x1 (Tabs)` | `1x1 (单窗标签)` |
| 604 | `.layout-sub-item` (none) | `Empty (none)` | `空白 (无)` |
| 611 | `.layout-sub-item` (time) | `Multi-Time Contrast` | `多时次对比` |
| 618 | `.layout-sub-item` (init) | `Multi-Init Contrast` | `多起报对比` |
| 625 | `.layout-sub-item` (step) | `Multi-Step Contrast` | `多时效对比` |
| 632 | `.layout-sub-item` (level) | `Multi-Level Contrast` | `多层级对比` |
| 639 | `.layout-sub-item` (model) | `Multi-Model Contrast` | `多模式对比` |
| 682, 686 | `<label for="select-nav-level">` & `title` | `{levelLabel}:` (`Select vertical level or channel`) | `{levelLabel}:` (`选择垂直层级或通道`) |
| 690 | `<option value="">` | `None` | `无` |
| 700, 704 | `<label for="select-nav-model">` & `title` | `Model:` (`Select NWP Model`) | `模型:` (`选择数值预报模型`) |
| 724–728 | `#btn-history-mode` & `title` | `History` / `Latest` | `复盘模式` / `实时模式` |
| 738, 744 | `#input-history-date`, `#input-history-hour` `title` | `Select archive date (UTC)` / `Select archive hour (UTC)` | `选择历史归档日期 (UTC)` / `选择历史归档时次 (UTC)` |
| 774 | `#btn-nav-menu` `title` | `System Menu (Print, Export, Theme, Projection, Config, Help)` | `系统菜单 (打印、截图、主题、地图投影、配置、帮助)` |
| 788–825 | Action items | `Print`, `Screenshot`, `Help`, `Command Palette` | `打印`, `截图`, `帮助`, `命令面板` |
| 830–875 | Theme section | `Theme / Scheme`, `Light (Paper)`, `Dark (Ink)`, `Brutalism` | `主题`, `浅色 (纸张)`, `深色 (暗夜)`, `粗野主义 (Brutalism)` |
| 879–924 | Projection section | `Map Projection`, `Mercator`, `Globe`, `Vertical Perspective` | `地图投影`, `墨卡托 (Mercator)`, `三维地球 (Globe)`, `垂直透视 (Perspective)` |
| 928 | Language header | `Language` | `语言` |
| 948 | `#btn-open-config` | `Config` | `配置` |

#### 4.3 [TabsBar.svelte](file:///root/downloads/micaps-web/client/src/components/TabsBar.svelte)
| Line(s) | Element / Selector | Current (`en`) | Localized (`zh`) |
| :--- | :--- | :--- | :--- |
| 285 | `.contrast-group-badge` | `{layout} Split · {mode}` | `{layout} 分割 · {localizedMode}` |
| 319 | `.tab-title` fallback | `Tab {i + 1}` | `标签 {i + 1}` |
| 351 | `.contrast-collapse-btn` | `✕ Collapse` | `✕ 收起对比组` |
| 368 | `#btn-contrast-config` | `⚙ Config` | `⚙ 配置` |
| 383 | `#btn-new-tab` `title` | `New Tab` | `新建标签页` |
| 399 | `#btn-restore-split` | `⊞ Return to {layout} Split` | `⊞ 返回 {layout} 分割` |
| 408–425 | `#select-auto-alloc` & label | `Alloc:`, `none`, `multi-time-contrast`, `multi-init-contrast`, `multi-step-contrast`, `multi-level-contrast`, `multi-model-contrast` | `分配:`, `空白 (无)`, `多时次对比`, `多起报对比`, `多时效对比`, `多层级对比`, `多模式对比` |
| 433–451 | `#select-layout` & label | `Layout:`, `⊟ Tabs`, `◫ 2-Split`, `⊞ 4-Split`, `▦ 6-Split` | `窗口布局:`, `⊟ 单窗标签`, `◫ 2分屏`, `⊞ 4分屏`, `▦ 6分屏` |
| 460–464 | `#btn-sync-toggle` & `title` | `Sync 🔗` / `Sync ✕` | `同步 🔗` / `同步 ✕` |

---

### Phase 2: Status Bar, Timeline & Multi-Track DAW View

#### 4.4 [StatusBar.svelte](file:///root/downloads/micaps-web/client/src/components/StatusBar.svelte)
| Line(s) | Element / Selector | Current (`en`) | Localized (`zh`) |
| :--- | :--- | :--- | :--- |
| 72, 89, 94 | `#system-status-badge` | `Connecting...`, `MOCK`, `OFFLINE` | `连接中...`, `模拟数据`, `离线` |
| 167, 173 | `#btn-lighting-toggle`, `.lighting-label` | `Lighting` (title: `Toggle Solar Lighting Compensation (SZA)`) | `光线补偿` (title: `切换太阳天顶角光线补偿 (SZA)`) |
| 193 | `.history-badge` | `HISTORY · {date}` | `复盘 · {date}` |
| 197 | `.mode-badge` | `OBSERVATION` / `NWP FORECAST` | `实况观测` / `数值预报` |
| 202, 206 | `.init-label`, `#select-init-time` `title` | `Init:` (`Select model initialization run time`) | `起报:` (`选择模式起报时间`) |
| 221 | `.lead-prefix` | `Observation Time: ` / `Forecast Lead: ` | `观测时间: ` / `预报时效: ` |
| 229–231 | `#sl-time-valid-label` | `Real-time Observation (Step: ...)` / `Valid: ... (Step: ...)` | `实况观测 (步长: ...)` / `有效时间: ... (步长: ...)` |
| 244 | `.cursor-readout` `title` | `Cursor position and active grid values` | `光标经纬度与当前格点数值` |
| 261, 267 | `#btn-layers-toggle`, `.layers-label` | `Layers` (title: `Toggle Layers Drawer`) | `数据层` (title: `展开/收起数据层面板`) |

#### 4.5 [TimeSlider.svelte](file:///root/downloads/micaps-web/client/src/components/TimeSlider.svelte) & [timeSliderView.js](file:///root/downloads/micaps-web/client/src/views/timeSliderView.js)
| Line(s) | Element / Selector | Current (`en`) | Localized (`zh`) |
| :--- | :--- | :--- | :--- |
| 542–582 | Transport buttons `title` | `Previous Time Step`, `Play / Pause Animation`, `Next Time Step`, `Toggle Loop` | `上一时次`, `播放 / 暂停动画`, `下一时次`, `循环播放开关` |
| 591 | `.timeline-track-scroll` `title` | `Click chip to jump · Drag to scroll · Alt+Wheel to change step` | `点击时次跳转 · 拖拽滚动 · Alt+滚轮切换步长` |
| 633 | `<label for="select-step">` | `Step:` | `步长:` |
| 647 | `<label for="select-speed">` | `Speed:` | `速度:` |
| 670 | `#btn-toggle-multitrack` | `⤡ Single Strip` / `⤢ DAW Lanes` | `⤡ 单轨时间轴` / `⤢ 多轨时间轴` |
| `timeSliderView.js:9–16` | `STEP_BADGE_MAP` (`getStepLabelText`) | `Step: 15 min`, `Step: 1 hour`, etc. | `步长: 15分钟`, `步长: 1小时`, etc. (when `zh`) |

#### 4.6 [MultiTrackTimeline.svelte](file:///root/downloads/micaps-web/client/src/components/timeline/MultiTrackTimeline.svelte)
| Line(s) | Element / Selector | Current (`en`) | Localized (`zh`) |
| :--- | :--- | :--- | :--- |
| 612 | `.mtt-title` | `MULTI-TRACK DAW TIMELINE` | `多轨时序对齐视图` |
| 615 | `.mtt-playhead-label` | `PLAYHEAD: {label}` | `播放指针: {label}` |
| 626–632 | `.mtt-mode-badge` | `HISTORY REVIEW` / `LIVE (NOWCAST)` / `REVIEW MODE` | `历史复盘模式` / `实时追踪模式` / `复盘浏览模式` |
| 649 | `.mtt-snap-btn` | `🧲 SNAP` | `🧲 吸附` |
| 657 | `.mtt-collapse-btn` | `⤡ Single Strip` | `⤡ 收起多轨` |
| 667 | `.mtt-lane-header-cell` | `LAYERS CADENCE` | `数据层与更新频次` |
| 679 | `.mtt-future-label` | `FORECAST / FUTURE` | `预报 / 未来时段` |
| 718, 725 | `.mtt-pin-btn`, `.mtt-eye-btn` `title` | `Pin layer time` / `Toggle layer visibility` | `锁定该层时间 (不随主指针移动)` / `切换图层可见性` |
| 742 | `.mtt-empty-lanes` | `No active layers to display in timeline` | `暂无可显示在时间轴上的激活数据层` |

---

### Phase 3: Layers Panel, Layer Controls, Station Filter & Status Panel

#### 4.7 [LayersPanel.svelte](file:///root/downloads/micaps-web/client/src/components/LayersPanel.svelte) & [StatusPanel.svelte](file:///root/downloads/micaps-web/client/src/components/StatusPanel.svelte)
| Line(s) | Element / Selector | Current (`en`) | Localized (`zh`) |
| :--- | :--- | :--- | :--- |
| `LayersPanel:191` | Subtab `layers` | `Layers` | `数据层` |
| `LayersPanel:202` | Subtab `status` | `⏱ Time Status` | `⏱ 时效状态` |
| `LayersPanel:216, 221` | `.stale-hidden-banner` | `{N} layer(s) hidden (stale)` / `Show` | `已隐藏 {N} 个过期数据层` / `显示` |
| `StatusPanel:30–35` | `STATUS_META` labels | `Current`, `Desync`, `Soft Stale`, `Stale` | `正常`, `时次偏移`, `临期`, `已过期` |
| `StatusPanel:47, 56` | Header & toggle | `Layer Temporal Alignment` / `Auto-hide Stale` | `数据层时序对齐状态` / `自动隐藏过期层` |
| `StatusPanel:71` | Empty message | `No active data layers.` | `暂无激活的数据层。` |
| `StatusPanel:77–80` | Table headers | `Layer`, `Obs Time`, `Age`, `Status` | `数据层`, `数据时间`, `时差`, `状态` |

#### 4.8 [LayerRow.svelte](file:///root/downloads/micaps-web/client/src/components/LayerRow.svelte)
| Line(s) | Element / Selector | Current (`en`) | Localized (`zh`) |
| :--- | :--- | :--- | :--- |
| 113–168 | `availableSubtabs` labels | `Style`, `Interval`, `Time`, `Elements`, `Filter`, `Display`, `Palette`, `Station`, `Curves`, `Point & Time`, `Fields`, `Transect`, `Features`, `Projection`, `General` | `样式`, `间隔`, `时间`, `要素`, `过滤`, `显示`, `色标`, `站点`, `曲线`, `单点与时效`, `物理量`, `剖面线`, `地理要素`, `地图投影`, `常规` |
| 256, 267, 290 | Layer row header buttons `title` | `Solo layer (S)`, `Expand/collapse layer settings`, `Remove derived contour layer` | `独显该层 (S)`, `展开/收起图层设置`, `移除衍生等值线层` |
| 306–416 | Contour & grid style controls | `Contour Lines`, `Color Fill`, `Raster Shading`, `Labels`, `Opacity:`, `Line color`, `Width`, `Label`, `Bold values`, `Bold px`, `Smooth Contour Lines`, `Wind Streamlines`, `Wind Barbs`, `Interval`, `Start`, `Step`, `End`, `Auto`, `🎨 Palette`, `Built-in default` | `等值线`, `色斑填充`, `栅格渲染`, `数值标注`, `不透明度:`, `线色`, `线宽`, `字号`, `加粗值`, `加粗线宽`, `平滑等值线`, `风场流线`, `风羽`, `等值线间隔`, `起始`, `步长`, `终止`, `自动`, `🎨 调色板`, `内置默认` |
| 436–582 | Station plot elements & derived contour | `Temperature`, `Dew Point`, `Wind Barbs`, `Height`, `Pressure`, `T−Td`, `Cloud`, `Weather`, `Visibility`, `Rain 6h`, `Streamlines`, `Snow Depth`, `3h Pressure Change`, `24h Pressure Change`, `Station ID`, `Add Contour Layer`, `＋ Add` | `温度`, `露点`, `风羽`, `位势高度`, `气压`, `露点差 (T−Td)`, `云量`, `现在天气`, `能见度`, `6h降水`, `流线`, `积雪深度`, `3h变压`, `24h变压`, `区站号`, `添加衍生等值线层`, `＋ 添加` |
| 590–702 | Raster, AWX & Radar controls | `Opacity:`, `Smooth Raster Interpolation`, `Color Palette`, `Built-in Default`, `Min dBZ Threshold:` | `不透明度:`, `平滑栅格插值`, `色标方案`, `内置默认`, `最小回波阈值 (dBZ):` |
| 711–825 | Sounding & Cross-Section controls | `Station Selection`, `Parcel origin`, `Surface`, `Custom`, `Dry Adiabats`, `Moist Adiabats`, `Mixing Ratio`, `Indices`, `Cross-section Point`, `RH Fill`, `VVEL`, `Map Marker`, `Transect A → B`, `Apply`, `✏ Draw`, `Set A`, `Set B`, `⇄ Flip`, `⇄ Swap axes`, `⇄ Reverse time` | `探空站点选择`, `气块抬升起始层`, `地面`, `自定义`, `干绝热线`, `湿绝热线`, `等饱和比湿线`, `强对流指数`, `剖面单点坐标`, `相对湿度色斑`, `垂直速度`, `地图标记`, `空间剖面线 A → B`, `应用`, `✏ 绘制`, `设点 A`, `设点 B`, `⇄ 反转`, `⇄ 切换坐标轴`, `⇄ 反转时间` |
| 869–879 | Basemap Projection buttons | `🌐 Projection:`, `🗺️ Mercator (2D)`, `🌍 Globe (3D)`, `🪐 Perspective (3D)` | `🌐 地图投影:`, `🗺️ 墨卡托 (2D)`, `🌍 三维地球 (3D)`, `🪐 垂直透视 (3D)` |
| 909–989 | Temporal Policy & Offset | `⏱ Observation Time & Matching`, `Policy`, `Strict Window`, `Nearest Available`, `Latest Valid`, `Exact Match`, `Tolerance`, `Time Offset (Desync)`, `Sync (0)` | `⏱ 观测时间与匹配策略`, `匹配策略`, `严格时间窗`, `最近可用时次`, `最新有效数据`, `精确匹配`, `容差窗口`, `时间偏移 (异步对比)`, `同步 (0)` |

#### 4.9 [StationFilter.svelte](file:///root/downloads/micaps-web/client/src/components/StationFilter.svelte)
| Line(s) | Element / Selector | Current (`en`) | Localized (`zh`) |
| :--- | :--- | :--- | :--- |
| 128 | `.sf-title` | `Data Filter Rules` | `站点数据过滤规则` |
| 131 | `.sf-viewonly-label` | `ViewOnly (per-element)` | `仅隐藏要素 (保留站点)` |
| 142–157 | `.sf-logic-bar` | `Match:`, `ALL (AND)`, `ANY (OR)`, `Rule 1 Only` | `匹配逻辑:`, `全部满足 (AND)`, `任一满足 (OR)`, `仅规则 #1` |
| 223, 229 | `.sf-btn-add`, `.sf-btn-clear` | `＋ Add Rule`, `Clear All` | `＋ 添加规则`, `清空全部` |

---

### Phase 4: Window Panels, Legends, Command Palette, Config Editor & Floating Panels

#### 4.10 [WindowPanel.svelte](file:///root/downloads/micaps-web/client/src/components/WindowPanel.svelte) & [Legend.svelte](file:///root/downloads/micaps-web/client/src/components/Legend.svelte) & [FullscreenButton.svelte](file:///root/downloads/micaps-web/client/src/components/FullscreenButton.svelte)
- **WindowPanel.svelte**:
  - Line 242: `.window-sync-badge` `title`: `"Independent Window (Unsynced)"` → `"独立窗口 (未同步)"`
  - Line 251: `.window-expand-btn` `title`: `"Expand this window to full view (double-click header)"` → `"最大化此窗口 (或双击标题栏)"`
  - Line 268: `.contrast-float-return`: `"⊞ Return to {layout} Split"` → `"⊞ 返回 {layout} 分割"`
- **Legend.svelte** & [legendCore.js](file:///root/downloads/micaps-web/client/src/views/legendCore.js):
  - Line 154: `"Legend"` → `"图例"`
  - Line 171: `title="Collapse legend"` → `"收起图例"`
  - Localize built-in legend titles in `legendCore.js` (`CAPE (J/kg)`, `Temperature (°C)`, `Precipitation (mm)`, `Composite Reflectivity (dBZ)`, `IR Brightness Temp (K)`, `Height (dagpm)`, `Wind Speed (m/s)`) when `locale === "zh"` (`对流有效位能 CAPE (J/kg)`, `温度 (°C)`, `降水量 (mm)`, `组合反射率 (dBZ)`, `红外亮温 (K)`, `位势高度 (dagpm)`, `风速 (m/s)`).
- **FullscreenButton.svelte**:
  - Line 54: `"Exit Fullscreen (Esc)"` / `"Fullscreen"` → `"退出全屏 (Esc)"` / `"全屏显示"`

#### 4.11 [CommandPalette.svelte](file:///root/downloads/micaps-web/client/src/components/CommandPalette.svelte)
- Localize all entries in `ACTIONS` (lines 27–46) with bilingual titles so users can search in either English or Chinese, and render the active locale's title and category badge (`Layout` → `窗口布局`, `Action` → `操作`, `Theme` → `主题`, `Projection` → `地图投影`, `Language` → `语言`, `Preset` → `数据集`, `Station` → `气象站`).
- Line 198 placeholder: `"Type a command, preset, or station ID (e.g. 54511)..."` → `"输入命令、数据集或区站号 (如 54511)..."`
- Line 208 empty state: `"No matching presets, stations, or actions found."` → `"未找到匹配的数据集、站点或操作。"`
- Lines 235–237 footer hints: `Navigate` (`导航`), `Select` (`选择`), `Close` (`关闭`).

#### 4.12 [ConfigEditor.svelte](file:///root/downloads/micaps-web/client/src/components/ConfigEditor.svelte) & Sub-Forms
- **ConfigEditor.svelte**:
  - Header title: `⚙ Meteorological Configuration` → `⚙ 气象工作站配置`
  - Subtabs: `Presets` (`数据集`), `Colormaps` (`色标方案`), `Settings` (`系统设置`), `⟨⟩ JSON` (`⟨⟩ JSON 源码`)
  - Status badges: `Valid (Saved)` (`有效 (已保存)`), `Modified (Unsaved)` (`已修改 (未保存)`), `Invalid` (`配置无效`)
  - Footer buttons: `↺ Reload` (`↺ 重新加载`), `✓ Save & Apply` (`✓ 保存并应用`), `✕ Close` (`✕ 关闭`)
- **[SettingsForm.svelte](file:///root/downloads/micaps-web/client/src/components/config/SettingsForm.svelte)**:
  - Section headers & labels: `🗺️ Basemap & Projection` (`🗺️ 底图与地图投影`), `Theme Scheme` (`主题方案`), `Map Projection` (`地图投影`), `Vector Overlays` (`矢量叠加层`), `⚡ Performance & Contour Budget` (`⚡ 性能与等值线网格预算`), `🌐 Language / 语言` (`🌐 界面语言`).
- **[PresetForm.svelte](file:///root/downloads/micaps-web/client/src/components/config/PresetForm.svelte) & [LayerForm.svelte](file:///root/downloads/micaps-web/client/src/components/config/LayerForm.svelte)**:
  - Filter input (`Filter presets...` → `搜索数据集...`), `+ New Preset` (`+ 新建数据集`), `Duplicate` (`复制`), `Delete` (`删除`), `Layers ({N})` (`数据层 ({N})`), `+ Add Layer` (`+ 添加数据层`), field labels (`Preset ID`, `Display Name`, `Category`, `Mode`, `Default Level`, `Quick Bar`).
- **[ColormapForm.svelte](file:///root/downloads/micaps-web/client/src/components/config/ColormapForm.svelte) & [JSONFallbackForm.svelte](file:///root/downloads/micaps-web/client/src/components/config/JSONFallbackForm.svelte)**:
  - `+ New Colormap` (`+ 新建色标`), `Color Stops` (`色标节点`), `+ Add Stop` (`+ 添加节点`), `Format JSON` (`格式化 JSON`).

#### 4.13 Imperative Profile Panels (`tlogpPanel.js`, `timeHeightPanel.js`, `lineHeightPanel.js`, `hovmollerPanel.js`)
- Subscribe to `subscribeLocale()` in [i18nCore.js](file:///root/downloads/micaps-web/client/src/lib/stores/i18nCore.js) or read `getGlobalLocale()` when rendering panel headers/titles so floating sounding and cross-section window headers (`T-lnP Sounding`, `Time-Height Section`, `Space-Height Cross Section`, `Hovmöller Diagram`) also localize to `T-lnP 探空图`, `时间-高度剖面图`, `空间垂直剖面图`, `Hovmöller 时空剖面图`.

---

## 5. Backward Compatibility & Test Preservation Strategy

1. **Default Locale Invariant (`"en"`)**:
   - `getGlobalLocale()` defaults to `"en"` in headless/unit test environments unless explicitly switched via `setLocale("zh")` / `setGlobalLocale("zh")`.
   - All 144 existing test files (1,384 tests) that assert English text in default state will continue to pass without modification.
2. **DOM Contract Preservation**:
   - Never alter element `id`, `class`, `data-*` attributes, or `<option value="...">` values when localizing display text.
   - In [CommandPalette.svelte](file:///root/downloads/micaps-web/client/src/components/CommandPalette.svelte), match queries against **both** English and Chinese action titles (`action.titleEn` and `action.titleZh`) so keyboard automation and user searches work in either language regardless of active UI locale.
3. **Layout & Typography Resilience for CJK**:
   - Chinese labels such as `实时模式` / `复盘模式` and `窗口布局` are compact (2–4 CJK characters) and fit cleanly inside existing flex/pill containers with `white-space: nowrap`.

---

## 6. Phased Execution & Verification Plan

1. **Step 1 — Core i18n Dictionary & Reactive `t()` API**:
   - Implement `UI_STRINGS` and `translateUI(key, params, locale)` in [client/src/lib/stores/i18nCore.js](file:///root/downloads/micaps-web/client/src/lib/stores/i18nCore.js).
   - Export reactive `t(key, params, locale)` from [client/src/lib/stores/i18n.svelte.js](file:///root/downloads/micaps-web/client/src/lib/stores/i18n.svelte.js).
2. **Step 2 — Top Chrome (`NavBar`, `PresetMenu`, `TabsBar`)**:
   - Wire all navbar labels (`数据集`, `窗口布局`, `2x3 分割`, `多模式对比`, `层级`/`通道`, `模型`, `实时模式`/`复盘模式`, `主题`, `地图投影`, `配置`) and tabs bar controls.
3. **Step 3 — Bottom Chrome & Drawers (`StatusBar`, `TimeSlider`, `MultiTrackTimeline`, `LayersPanel`, `LayerRow`, `StationFilter`, `StatusPanel`)**:
   - Wire `数据层`, `光线补偿`, observation/forecast badges, timeline step/speed labels, DAW timeline headers, and layer drawer subtabs/controls.
4. **Step 4 — Modals, Overlays & Legends (`CommandPalette`, `ConfigEditor` & sub-forms, `WindowPanel`, `Legend`, `FullscreenButton`, profile panels)**:
   - Wire command palette bilingual search & display, configuration editor forms, legend titles, and floating profile headers.
5. **Step 5 — Automated Unit & Integration Testing**:
   - Extend [client/test/i18n_support.test.js](file:///root/downloads/micaps-web/client/test/i18n_support.test.js) (and add dedicated UI localization tests) to verify:
     - All user-mandated terminology mappings (`Presets` → `数据集`, `Layout` → `窗口布局`, `2x3 Split` → `2x3 分割`, `Multi-Model Contrast` → `多模式对比`, `Level`/`Channel` → `层级`/`通道`, `Model` → `模型`, `Latest`/`History` → `实时模式`/`复盘模式`, `Theme` → `主题`, `Map Projection` → `地图投影`, `Config` → `配置`, `Layers` → `数据层`, `Lighting` → `光线补偿`).
     - Dynamic runtime switching (`en` → `zh` → `en`) across `NavBar`, `PresetMenu`, `TabsBar`, `StatusBar`, `LayersPanel`, `LayerRow`, and `ConfigEditor`.
   - Run the full Vitest suite (`npx vitest run`) to confirm 100% pass rate across all 144+ test files.
