import "../helpers/svelteRunesPolyfill.js";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  UI_STRINGS,
  translateUI,
  getGlobalLocale,
  setGlobalLocale,
  toggleGlobalLocale,
  localizeCategory,
  localizeEntityName,
  BADGE_TRANSLATIONS,
  LEGEND_TITLE_TRANSLATIONS,
} from "../../src/lib/stores/i18nCore.js";
import { readSrcText } from "../helpers/cssText.js";

describe("MICAPS-Web UI Internationalization (v1.13.0 Multi-Language Spec)", () => {
  beforeEach(() => {
    setGlobalLocale("en");
  });

  afterEach(() => {
    setGlobalLocale("en");
  });

  describe("Canonical Glossary & Terminology Mappings", () => {
    const CANONICAL_TERMS = [
      // Navigation & Presets
      ["nav.presets", "Presets", "数据集"],
      ["nav.layout", "Layout", "窗口布局"],
      ["nav.layout.1x1", "1x1 (Tabs)", "1x1 (单窗标签)"],
      ["nav.layout.1x2", "1x2 Split", "1x2 分割"],
      ["nav.layout.2x2", "2x2 Split", "2x2 分割"],
      ["nav.layout.2x3", "2x3 Split", "2x3 分割"],
      ["nav.layout.3x2", "3x2 Split", "3x2 分割"],
      ["nav.alloc.none", "Empty (none)", "空白 (无)"],
      ["nav.alloc.multiTime", "Multi-Time Contrast", "多时次对比"],
      ["nav.alloc.multiInit", "Multi-Init Contrast", "多起报对比"],
      ["nav.alloc.multiStep", "Multi-Step Contrast", "多时效对比"],
      ["nav.alloc.multiLevel", "Multi-Level Contrast", "多层级对比"],
      ["nav.alloc.multiModel", "Multi-Model Contrast", "多模式对比"],
      ["nav.level", "Level", "层级"],
      ["nav.channel", "Channel", "通道"],
      ["nav.height", "Height", "高度"],
      ["nav.model", "Model", "模型"],
      ["nav.mode.latest", "Latest", "实时模式"],
      ["nav.mode.history", "History", "复盘模式"],
      ["nav.menu.theme", "Theme / Scheme", "主题"],
      ["nav.menu.theme.light", "Light (Paper)", "浅色 (纸张)"],
      ["nav.menu.theme.dark", "Dark (Ink)", "深色 (暗夜)"],
      ["nav.menu.theme.brutalism", "Brutalism", "粗野主义"],
      ["nav.menu.projection", "Map Projection", "地图投影"],
      ["nav.menu.projection.mercator", "Mercator", "墨卡托 (Mercator)"],
      ["nav.menu.projection.globe", "Globe", "三维地球 (Globe)"],
      ["nav.menu.projection.perspective", "Vertical Perspective", "垂直透视 (Perspective)"],
      ["nav.menu.config", "Config", "配置"],
      ["nav.menu.print", "Print", "打印"],
      ["nav.menu.screenshot", "Screenshot", "截图"],
      ["nav.menu.help", "Help", "帮助"],
      ["nav.menu.commandPalette", "Command Palette", "命令面板"],
      ["nav.menu.language", "Language", "语言"],

      // Bottom Chrome & Status Bar
      ["status.layers", "Layers", "数据层"],
      ["status.lighting", "Lighting", "光线补偿"],
      ["status.observation", "OBSERVATION", "实况观测"],
      ["status.nwpForecast", "NWP FORECAST", "数值预报"],
      ["status.init", "Init:", "起报:"],
      ["status.obsTime", "Observation Time: ", "观测时间: "],
      ["status.forecastLead", "Forecast Lead: ", "预报时效: "],

      // Timeline & Controls
      ["timeline.step", "Step", "步长"],
      ["timeline.speed", "Speed", "速度"],
      ["timeline.singleStrip", "⤡ Single Strip", "⤡ 单轨时间轴"],
      ["timeline.dawLanes", "⤢ DAW Lanes", "⤢ 多轨时间轴"],

      // Layers Panel & Drawer
      ["layers.subtab.layers", "Layers", "数据层"],
      ["layers.subtab.status", "⏱ Time Status", "⏱ 时效状态"],
      ["layers.status.current", "Current", "正常"],
      ["layers.status.desync", "Desync", "时次偏移"],
      ["layers.status.softStale", "Soft Stale", "临期"],
      ["layers.status.stale", "Stale", "已过期"],
      ["layers.autoHideStale", "Auto-hide Stale", "自动隐藏过期层"],
      ["layers.empty", "No active data layers.", "暂无激活的数据层。"],

      // Station Filter
      ["stationFilter.title", "Data Filter Rules", "站点数据过滤规则"],
      ["stationFilter.match", "Match:", "匹配逻辑:"],
      ["stationFilter.viewOnly", "ViewOnly (per-element)", "仅隐藏要素 (保留站点)"],
      ["stationFilter.allAnd", "ALL (AND)", "全部满足 (AND)"],
      ["stationFilter.anyOr", "ANY (OR)", "任一满足 (OR)"],
      ["stationFilter.rule1Only", "Rule 1 Only", "仅规则 #1"],
      ["stationFilter.addRule", "＋ Add Rule", "＋ 添加规则"],
      ["stationFilter.clearAll", "Clear All", "清空全部"],

      // Configuration Dialog
      ["config.title", "⚙ Meteorological Configuration", "⚙ 气象工作站配置"],
      ["config.subtab.presets", "Presets", "数据集"],
      ["config.subtab.colormaps", "Colormaps", "色标方案"],
      ["config.subtab.settings", "Settings", "系统设置"],
      ["config.subtab.json", "⟨⟩ JSON", "⟨⟩ JSON 源码"],
      ["config.status.saved", "Valid (Saved)", "有效 (已保存)"],
      ["config.status.modified", "Modified (Unsaved)", "已修改 (未保存)"],
      ["config.status.invalid", "Invalid", "配置无效"],
      ["config.btn.reload", "↺ Reload", "↺ 重新加载"],
      ["config.btn.saveApply", "✓ Save & Apply", "✓ 保存并应用"],
      ["config.btn.close", "✕ Close", "✕ 关闭"],

      // Profile Floating Panels
      ["profile.tlogp", "T-lnP Sounding", "T-lnP 探空图"],
      ["profile.timeHeight", "Time-Height Cross-Section", "时间-高度剖面图"],
      ["profile.lineHeight", "Line-Height Cross-Section", "空间垂直剖面图"],
      ["profile.hovmoller", "Time-Line Hovmoller", "Hovmöller 时空剖面图"],
    ];

    for (const [key, expectedEn, expectedZh] of CANONICAL_TERMS) {
      it(`translates canonical key "${key}" to "${expectedEn}" in en and "${expectedZh}" in zh`, () => {
        expect(translateUI(key, {}, "en")).toBe(expectedEn);
        expect(translateUI(key, {}, "zh")).toBe(expectedZh);
      });
    }
  });

  describe("Dynamic Global Locale Switching & State Invariants", () => {
    it("defaults to en", () => {
      expect(getGlobalLocale()).toBe("en");
      expect(translateUI("nav.presets")).toBe("Presets");
    });

    it("switches to zh dynamically and updates translateUI output", () => {
      setGlobalLocale("zh");
      expect(getGlobalLocale()).toBe("zh");
      expect(translateUI("nav.presets")).toBe("数据集");
      expect(translateUI("nav.layout")).toBe("窗口布局");
      expect(translateUI("status.lighting")).toBe("光线补偿");
    });

    it("toggles between en and zh cleanly with toggleGlobalLocale()", () => {
      expect(getGlobalLocale()).toBe("en");
      toggleGlobalLocale();
      expect(getGlobalLocale()).toBe("zh");
      expect(translateUI("nav.mode.latest")).toBe("实时模式");
      toggleGlobalLocale();
      expect(getGlobalLocale()).toBe("en");
      expect(translateUI("nav.mode.latest")).toBe("Latest");
    });
  });

  describe("Parameter Interpolation & Edge Cases", () => {
    it("interpolates single parameter {count}", () => {
      expect(translateUI("layers.staleHidden", { count: 3, s: "s" }, "en")).toBe("3 layers hidden (stale)");
      expect(translateUI("layers.staleHidden", { count: 3, s: "s" }, "zh")).toBe("已隐藏 3 个过期数据层");
    });

    it("interpolates multiple parameters", () => {
      expect(translateUI("status.validStep", { valid: "2026-10-29 12:00", step: "6h" }, "en"))
        .toBe("Valid: 2026-10-29 12:00 (Step: 6h)");
      expect(translateUI("status.validStep", { valid: "2026-10-29 12:00", step: "6h" }, "zh"))
        .toBe("有效时间: 2026-10-29 12:00 (步长: 6h)");
    });

    it("returns key when key is unknown", () => {
      expect(translateUI("unknown.fake.key", {}, "en")).toBe("unknown.fake.key");
      expect(translateUI("unknown.fake.key", {}, "zh")).toBe("unknown.fake.key");
    });

    it("handles null, empty, or undefined params gracefully", () => {
      expect(translateUI("nav.presets", null, "en")).toBe("Presets");
      expect(translateUI("nav.presets", undefined, "zh")).toBe("数据集");
    });
  });

  describe("CommandPalette Bilingual Query Matching in Source Code", () => {
    const cmdPaletteSrc = readSrcText("components/CommandPalette.svelte");

    it("contains bilingual action definitions (titleEn and titleZh)", () => {
      expect(cmdPaletteSrc).toContain('titleEn: "Layout: Split 2x2 (Quad Grid)"');
      expect(cmdPaletteSrc).toContain('titleZh: "窗口布局: 2x2 分割"');
      expect(cmdPaletteSrc).toContain('categoryZh: "操作"');
      expect(cmdPaletteSrc).toContain('categoryZh: "主题"');
      expect(cmdPaletteSrc).toContain('categoryZh: "地图投影"');
      expect(cmdPaletteSrc).toContain('categoryZh: "语言"');
    });

    it("matches queries against both English and Chinese fields", () => {
      expect(cmdPaletteSrc).toContain("matchEn");
      expect(cmdPaletteSrc).toContain("matchZh");
      expect(cmdPaletteSrc).toContain("act.titleZh");
      expect(cmdPaletteSrc).toContain("act.titleEn");
    });

    it("uses reactive UI translation keys for placeholder and empty state", () => {
      expect(cmdPaletteSrc).toContain('placeholder={t("cmd.placeholder")}');
      expect(cmdPaletteSrc).toContain('{t("cmd.empty")}');
      expect(cmdPaletteSrc).toContain('{t("cmd.navigate")}');
      expect(cmdPaletteSrc).toContain('{t("cmd.select")}');
      expect(cmdPaletteSrc).toContain('{t("cmd.close")}');
    });
  });

  describe("Meteorological Legend & Badge Localization", () => {
    it("localizes standard meteorological legend titles", () => {
      expect(LEGEND_TITLE_TRANSLATIONS["CAPE (J/kg)"]?.zh).toBe("对流有效位能 CAPE (J/kg)");
      expect(LEGEND_TITLE_TRANSLATIONS["Temperature (°C)"]?.zh).toBe("温度 (°C)");
      expect(LEGEND_TITLE_TRANSLATIONS["Precipitation (mm)"]?.zh).toBe("降水量 (mm)");
      expect(LEGEND_TITLE_TRANSLATIONS["Composite Reflectivity (dBZ)"]?.zh).toBe("组合反射率 (dBZ)");
      expect(LEGEND_TITLE_TRANSLATIONS["IR Brightness Temp (K)"]?.zh).toBe("红外亮温 (K)");
      expect(LEGEND_TITLE_TRANSLATIONS["Height (dagpm)"]?.zh).toBe("位势高度 (dagpm)");
      expect(LEGEND_TITLE_TRANSLATIONS["Wind Speed (m/s)"]?.zh).toBe("风速 (m/s)");
    });

    it("localizes preset badge chips", () => {
      expect(BADGE_TRANSLATIONS["Diag"]?.zh).toBe("诊断");
      expect(BADGE_TRANSLATIONS["Sounding"]?.zh).toBe("探空");
      expect(BADGE_TRANSLATIONS["Profile"]?.zh).toBe("剖面");
      expect(BADGE_TRANSLATIONS["Sat QPE"]?.zh).toBe("卫星降水");
      expect(BADGE_TRANSLATIONS["Sat"]?.zh).toBe("卫星");
      expect(BADGE_TRANSLATIONS["Radar"]?.zh).toBe("雷达");
      expect(BADGE_TRANSLATIONS["Obs"]?.zh).toBe("观测");
      expect(BADGE_TRANSLATIONS["Sfc"]?.zh).toBe("地面");
    });
  });

  describe("Reactive Svelte 5 t() and localeState Integration", () => {
    it("exports reactive t() from i18n.svelte.js and responds to locale change", async () => {
      const { t: svelteT, setGlobalLocale: setLoc, getGlobalLocale: getLoc, localeState } = await import("../../src/lib/stores/i18n.svelte.js");
      setLoc("en");
      expect(getLoc()).toBe("en");
      expect(localeState.current).toBe("en");
      expect(svelteT("nav.presets")).toBe("Presets");
      expect(svelteT("timeline.mtt.title")).toBe("MULTI-TRACK DAW TIMELINE");

      setLoc("zh");
      expect(getLoc()).toBe("zh");
      expect(localeState.current).toBe("zh");
      expect(svelteT("nav.presets")).toBe("数据集");
      expect(svelteT("timeline.mtt.title")).toBe("多轨时序对齐视图");
      expect(svelteT("timeline.mtt.play")).toBe("▶ 播放");
      expect(svelteT("timeline.mtt.pause")).toBe("❚❚ 暂停");
      expect(svelteT("timeline.mtt.pacemaker")).toBe("步长基准层 (Pacemaker):");
      expect(svelteT("config.settings.cellBudget")).toBe("最大有效网格数 (Marching Squares 预算)");
      expect(svelteT("config.settings.graticule")).toBe("10° 经纬度网格线");

      // Reset back to en
      setLoc("en");
      expect(svelteT("nav.presets")).toBe("Presets");
    });
  });

  describe("Runtime CommandPalette Bilingual Search Mechanics", () => {
    const mockPresets = [
      { id: "composite-surface", name: "Surface Synoptic (Plots + SLP Isobars)", category: "Surface Observations" },
      { id: "composite-upperair-500", name: "500 hPa Upper-Air Sounding", category: "Upper-Air Observations" },
      { id: "composite-radar", name: "Radar Reflectivity Mosaic", category: "Severe Convective & Nowcasting" },
    ];

    function filterPresets(q, presets) {
      const lowerQ = (q || "").trim().toLowerCase();
      if (!lowerQ) return presets;
      return presets.filter((p) => {
        const zhName = localizeEntityName(p, "zh");
        const enName = localizeEntityName(p, "en");
        const zhCat = localizeCategory(p.category, "zh");
        const enCat = localizeCategory(p.category, "en");
        const nameMatch = (p.name && p.name.toLowerCase().includes(lowerQ)) ||
          (p.name_en && p.name_en.toLowerCase().includes(lowerQ)) ||
          (p.name_zh && p.name_zh.toLowerCase().includes(lowerQ)) ||
          (zhName && zhName.toLowerCase().includes(lowerQ)) ||
          (enName && enName.toLowerCase().includes(lowerQ));
        const catMatch = (p.category && p.category.toLowerCase().includes(lowerQ)) ||
          (p.category_en && p.category_en.toLowerCase().includes(lowerQ)) ||
          (p.category_zh && p.category_zh.toLowerCase().includes(lowerQ)) ||
          (zhCat && zhCat.toLowerCase().includes(lowerQ)) ||
          (enCat && enCat.toLowerCase().includes(lowerQ));
        const idMatch = p.id && p.id.toLowerCase().includes(lowerQ);
        return nameMatch || catMatch || idMatch;
      });
    }

    it("matches presets in Chinese when user searches for '探空'", () => {
      const results = filterPresets("探空", mockPresets);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe("composite-upperair-500");
    });

    it("matches presets in Chinese when user searches for '地面观测'", () => {
      const results = filterPresets("地面观测", mockPresets);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe("composite-surface");
    });

    it("matches presets in English when user searches for 'Surface'", () => {
      const results = filterPresets("Surface", mockPresets);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe("composite-surface");
    });

    it("matches presets in English when user searches for 'Sounding'", () => {
      const results = filterPresets("Sounding", mockPresets);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe("composite-upperair-500");
    });
  });

  describe("Profile Panels Title Localization & Subscriber Hook", () => {
    it("dispatches locale changes to subscriber listeners and translates profile titles", () => {
      const { subscribeLocale } = require("../../src/lib/stores/i18nCore.js");
      let notifiedLocale = null;
      const unsub = subscribeLocale((loc) => {
        notifiedLocale = loc;
      });

      setGlobalLocale("zh");
      expect(notifiedLocale).toBe("zh");
      expect(translateUI("profile.tlogp")).toBe("T-lnP 探空图");
      expect(translateUI("profile.timeHeight")).toBe("时间-高度剖面图");
      expect(translateUI("profile.lineHeight")).toBe("空间垂直剖面图");
      expect(translateUI("profile.hovmoller")).toBe("Hovmöller 时空剖面图");

      setGlobalLocale("en");
      expect(notifiedLocale).toBe("en");
      expect(translateUI("profile.tlogp")).toBe("T-lnP Sounding");
      expect(translateUI("profile.timeHeight")).toBe("Time-Height Cross-Section");
      expect(translateUI("profile.lineHeight")).toBe("Line-Height Cross-Section");
      expect(translateUI("profile.hovmoller")).toBe("Time-Line Hovmoller");

      unsub();
    });
  });
});
