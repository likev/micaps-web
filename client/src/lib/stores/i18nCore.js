// i18nCore.js - Pure JavaScript internationalization (en/zh) core store and helpers
import { CURRENT_CONFIG } from "../../config/presets.js";

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

let activeLocale = getStoredLocale();
const localeListeners = new Set();

export function getGlobalLocale() {
  return activeLocale;
}

export function subscribeLocale(fn) {
  localeListeners.add(fn);
  return () => localeListeners.delete(fn);
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

  for (const fn of localeListeners) {
    try {
      fn(norm);
    } catch {}
  }
}

export function toggleGlobalLocale() {
  setGlobalLocale(activeLocale === "en" ? "zh" : "en");
}

export const CATEGORY_TRANSLATIONS = {
  "Surface Observations": { en: "Surface Observations", zh: "地面观测" },
  "地面观测": { en: "Surface Observations", zh: "地面观测" },
  "Upper-Air Observations": { en: "Upper-Air Observations", zh: "高空观测" },
  "高空观测": { en: "Upper-Air Observations", zh: "高空观测" },
  "TlogP Observation": { en: "T-lnP Sounding", zh: "T-lnP 探空分析" },
  "T-lnP Sounding": { en: "T-lnP Sounding", zh: "T-lnP 探空分析" },
  "T-lnP 探空分析": { en: "T-lnP Sounding", zh: "T-lnP 探空分析" },
  "NWP Synoptic": { en: "NWP Synoptic", zh: "数值预报天气形势" },
  "数值预报天气形势": { en: "NWP Synoptic", zh: "数值预报天气形势" },
  "NWP Synoptic Rain": { en: "NWP Synoptic Rain", zh: "数值预报降水" },
  "数值预报降水": { en: "NWP Synoptic Rain", zh: "数值预报降水" },
  "NWP Time-Height Profile": { en: "NWP Time-Height Profile", zh: "时间-高度剖面" },
  "时间-高度剖面": { en: "NWP Time-Height Profile", zh: "时间-高度剖面" },
  "NWP Line-Height Profile": { en: "NWP Line-Height Profile", zh: "空间剖面" },
  "空间剖面": { en: "NWP Line-Height Profile", zh: "空间剖面" },
  "NWP Time-Distance Profile": { en: "NWP Time-Distance Profile", zh: "时间-距离剖面" },
  "时间-距离剖面": { en: "NWP Time-Distance Profile", zh: "时间-距离剖面" },
  "Multi-Time Recipes": { en: "Multi-Time Recipes", zh: "多时次合成图" },
  "多时次合成图": { en: "Multi-Time Recipes", zh: "多时次合成图" },
  "Derived Diagnostics": { en: "Derived Diagnostics", zh: "物理量诊断分析" },
  "物理量诊断分析": { en: "Derived Diagnostics", zh: "物理量诊断分析" },
  "Severe Convective & Nowcasting": { en: "Severe Convective & Nowcasting", zh: "强对流与短临" },
  "强对流与短临": { en: "Severe Convective & Nowcasting", zh: "强对流与短临" },
  "National Gridded Guidance": { en: "National Gridded Guidance", zh: "智能网格预报" },
  "智能网格预报": { en: "National Gridded Guidance", zh: "智能网格预报" },
  "High-Density Observations": { en: "High-Density Observations", zh: "高密地面与海洋观测" },
  "高密地面与海洋观测": { en: "High-Density Observations", zh: "高密地面与海洋观测" },
  "High-Impact NWP Fields": { en: "High-Impact NWP Fields", zh: "数值预报高影响要素" },
  "数值预报高影响要素": { en: "High-Impact NWP Fields", zh: "数值预报高影响要素" },
  "Land Surface Reanalysis": { en: "Land Surface Reanalysis", zh: "实况融合" },
  "实况融合": { en: "Land Surface Reanalysis", zh: "实况融合" },
  "Ensemble & Probability": { en: "Ensemble & Probability", zh: "集合预报与概率" },
  "集合预报与概率": { en: "Ensemble & Probability", zh: "集合预报与概率" },
  "Forecaster Guidance": { en: "Forecaster Guidance", zh: "预报员指导" },
  "预报员指导": { en: "Forecaster Guidance", zh: "预报员指导" },
  "Satellite Remote Sensing": { en: "Satellite Remote Sensing", zh: "气象卫星遥感" },
  "气象卫星遥感": { en: "Satellite Remote Sensing", zh: "气象卫星遥感" },
};

export function splitBilingualString(raw, locale = null) {
  const s = String(raw || "").trim();
  if (!s) return locale ? "" : { en: "", zh: "" };

  let en = s;
  let zh = s;

  if (s.includes(" / ")) {
    const [left, right] = s.split(" / ").map((p) => p.trim());
    const leftHasZh = /[\u4e00-\u9fa5]/.test(left);
    const rightHasZh = /[\u4e00-\u9fa5]/.test(right);
    if (leftHasZh && !rightHasZh) { zh = left; en = right; }
    else if (!leftHasZh && rightHasZh) { en = left; zh = right; }
    else { zh = left; en = right; }
  } else {
    const zhLeadMatch = s.match(/^([^\(]*[\u4e00-\u9fa5][^\(]*)\(([^\)\u4e00-\u9fa5]+)\)$/);
    if (zhLeadMatch) {
      zh = zhLeadMatch[1].trim();
      en = zhLeadMatch[2].trim();
    } else {
      const enLeadMatch = s.match(/^([^\(\u4e00-\u9fa5]+)\(([^\)]*[\u4e00-\u9fa5][^\)]*)\)$/);
      if (enLeadMatch) {
        en = enLeadMatch[1].trim();
        zh = enLeadMatch[2].trim();
      }
    }
  }

  if (locale) {
    return normalizeLocale(locale) === "zh" ? zh : en;
  }
  return { en, zh };
}

export function localizeCategory(rawCategory, locale = activeLocale) {
  if (!rawCategory) return locale === "zh" ? "其他" : "Other";
  const trimmed = String(rawCategory).trim();
  const direct = CATEGORY_TRANSLATIONS[trimmed];
  if (direct) return direct[locale] || direct.en;

  const { en, zh } = splitBilingualString(trimmed);
  if (CATEGORY_TRANSLATIONS[en]) {
    return CATEGORY_TRANSLATIONS[en][locale] || en;
  }
  if (CATEGORY_TRANSLATIONS[zh]) {
    return CATEGORY_TRANSLATIONS[zh][locale] || zh;
  }
  return locale === "zh" ? zh : en;
}

export const PRESET_TRANSLATIONS = {
  "composite-surface": { en: "Surface Synoptic (Plots + SLP Isobars)", zh: "地面综合天气形势 (站点填图与气压线)" },
  "Surface Synoptic (Plots + SLP Isobars)": { en: "Surface Synoptic (Plots + SLP Isobars)", zh: "地面综合天气形势 (站点填图与气压线)" },
  "composite-upperair-500": { en: "500 hPa Upper-Air Sounding", zh: "500 hPa 高空探空综合图" },
  "500 hPa Upper-Air Sounding": { en: "500 hPa Upper-Air Sounding", zh: "500 hPa 高空探空综合图" },
  "composite-tlogp": { en: "T-lnP Sounding Analysis (TlogP)", zh: "T-lnP 探空分析图" },
  "T-lnP Sounding Analysis (TlogP)": { en: "T-lnP Sounding Analysis (TlogP)", zh: "T-lnP 探空分析图" },
  "composite-500hpa": { en: "500hPa Composite (HGT + RH + WIND)", zh: "500hPa 综合分析 (高度+湿度+风场)" },
  "500hPa Composite (HGT + RH + WIND)": { en: "500hPa Composite (HGT + RH + WIND)", zh: "500hPa 综合分析 (高度+湿度+风场)" },
  "multi-model-rain12": { en: "ECMWF Rain12", zh: "ECMWF 12小时降水" },
  "ECMWF Rain12": { en: "ECMWF Rain12", zh: "ECMWF 12小时降水" },
  "composite-850hpa": { en: "850hPa Low-Level Jet (HGT + TMP + WIND)", zh: "850hPa 低空急流 (高度+气温+风场)" },
  "850hPa Low-Level Jet (HGT + TMP + WIND)": { en: "850hPa Low-Level Jet (HGT + TMP + WIND)", zh: "850hPa 低空急流 (高度+气温+风场)" },
  "composite-200hpa": { en: "200hPa Jet Stream (HGT + WIND)", zh: "200hPa 高空急流 (高度+风场)" },
  "200hPa Jet Stream (HGT + WIND)": { en: "200hPa Jet Stream (HGT + WIND)", zh: "200hPa 高空急流 (高度+风场)" },
  "composite-ecmwf-slp": { en: "ECMWF Sea Level Pressure (SLP)", zh: "ECMWF 海平面气压场" },
  "ECMWF Sea Level Pressure (SLP)": { en: "ECMWF Sea Level Pressure (SLP)", zh: "ECMWF 海平面气压场" },
  "composite-ecmwf-t2m": { en: "ECMWF 2m Temperature (T2m)", zh: "ECMWF 2米气温" },
  "ECMWF 2m Temperature (T2m)": { en: "ECMWF 2m Temperature (T2m)", zh: "ECMWF 2米气温" },
  "composite-ec-timeheight": { en: "EC Time-Height Profile (RH+T+VVEL+Wind)", zh: "ECMWF 时间-高度剖面 (RH+T+VVEL+Wind)" },
  "EC Time-Height Profile (RH+T+VVEL+Wind)": { en: "EC Time-Height Profile (RH+T+VVEL+Wind)", zh: "ECMWF 时间-高度剖面 (RH+T+VVEL+Wind)" },
  "composite-ec-lineheight": { en: "EC Line-Height Cross-Section (RH+T+VVEL+Wind)", zh: "ECMWF 空间剖面 (RH+T+VVEL+Wind)" },
  "EC Line-Height Cross-Section (RH+T+VVEL+Wind)": { en: "EC Line-Height Cross-Section (RH+T+VVEL+Wind)", zh: "ECMWF 空间剖面 (RH+T+VVEL+Wind)" },
  "composite-ec-hovmoller": { en: "EC Time-Line Hovmoller (RH+T+VVEL+Wind @ level)", zh: "ECMWF 纬度-时间 Hovmöller (RH+T+VVEL+Wind)" },
  "EC Time-Line Hovmoller (RH+T+VVEL+Wind @ level)": { en: "EC Time-Line Hovmoller (RH+T+VVEL+Wind @ level)", zh: "ECMWF 纬度-时间 Hovmöller (RH+T+VVEL+Wind)" },
  "composite-convective-nowcast": { en: "Convective Nowcast (Multi-Cadence)", zh: "强对流短临多频次预警" },
  "Convective Nowcast (Multi-Cadence)": { en: "Convective Nowcast (Multi-Cadence)", zh: "强对流短临多频次预警" },
  "composite-radar-motion-compare": { en: "Surface Motion Compare (T0 vs T-30m)", zh: "雷达回波动态外推对比 (T0 vs T-30m)" },
  "Surface Motion Compare (T0 vs T-30m)": { en: "Surface Motion Compare (T0 vs T-30m)", zh: "雷达回波动态外推对比 (T0 vs T-30m)" },
  "composite-derived-stability": { en: "NWP Derived Stability & Severe Indices (ECMWF)", zh: "ECMWF 对流不稳定与强天气指数" },
  "NWP Derived Stability & Severe Indices (ECMWF)": { en: "NWP Derived Stability & Severe Indices (ECMWF)", zh: "ECMWF 对流不稳定与强天气指数" },
  "composite-upperair-derived": { en: "Sounding Derived Multi-Level Analysis", zh: "探空多层物理量诊断" },
  "Sounding Derived Multi-Level Analysis": { en: "Sounding Derived Multi-Level Analysis", zh: "探空多层物理量诊断" },
  "derived-sounding-k-index": { en: "Sounding Derived K-Index", zh: "探空推算 K指数" },
  "derived-sounding-showalter": { en: "Sounding Derived Showalter Index", zh: "探空推算 沙氏指数 (SI)" },
  "derived-sounding-lifted": { en: "Sounding Derived Lifted Index", zh: "探空推算 抬升指数 (LI)" },
  "derived-sounding-sweat": { en: "Sounding Derived SWEAT Index", zh: "探空推算 强天气威胁指数 (SWEAT)" },
  "derived-sounding-tt": { en: "Sounding Derived Total Totals TT", zh: "探空推算 总全指数 (TT)" },
  "derived-sounding-shear": { en: "Sounding Derived Vertical Wind Shear", zh: "探空推算 垂直风切变" },
  "derived-sounding-thickness": { en: "Sounding Derived 1000-500hPa Thickness", zh: "探空推算 1000-500hPa 厚度" },
  "derived-sounding-t850-500": { en: "Sounding Derived T850-500 Difference", zh: "探空推算 850-500hPa 温差" },
  "derived-ecmwf-k-index": { en: "Derived K-Index (ECMWF)", zh: "ECMWF 推算 K指数" },
  "derived-ecmwf-showalter": { en: "Derived Showalter Index (ECMWF)", zh: "ECMWF 推算 沙氏指数 (SI)" },
  "derived-ecmwf-lifted": { en: "Derived Lifted Index (ECMWF)", zh: "ECMWF 推算 抬升指数 (LI)" },
  "derived-ecmwf-sweat": { en: "Derived SWEAT Index (ECMWF)", zh: "ECMWF 推算 强天气威胁指数 (SWEAT)" },
  "derived-ecmwf-tt": { en: "Derived Total Totals TT (ECMWF)", zh: "ECMWF 推算 总全指数 (TT)" },
  "derived-ecmwf-shear": { en: "Derived Vertical Wind Shear (ECMWF)", zh: "ECMWF 推算 垂直风切变" },
  "derived-ecmwf-thickness": { en: "Derived 1000-500hPa Thickness (ECMWF)", zh: "ECMWF 推算 1000-500hPa 厚度" },
  "derived-ecmwf-t850-500": { en: "Derived T850-500 Lapse Rate (ECMWF)", zh: "ECMWF 推算 850-500hPa 温差" },
  "obs-surface-t-var-24h": { en: "Surface Station 24h Temperature Variation", zh: "地面站点 24小时变温" },
  "obs-surface-t-var-48h": { en: "Surface Station 48h Temperature Variation", zh: "地面站点 48小时变温" },
  "obs-surface-slp-var-24h": { en: "Surface Station 24h SLP Variation", zh: "地面站点 24小时变压" },
  "obs-surface-slp-var-48h": { en: "Surface Station 48h SLP Variation", zh: "地面站点 48小时变压" },
  "obs-upperair-850-t-var-24h": { en: "850hPa Sounding 24h Temperature Variation", zh: "850hPa 探空 24小时变温" },
  "obs-upperair-850-t-var-48h": { en: "850hPa Sounding 48h Temperature Variation", zh: "850hPa 探空 48小时变温" },
  "derived-ecmwf-sfc-t-var-24h": { en: "ECMWF Surface 24h Temperature Variation", zh: "ECMWF 地面 24小时变温" },
  "derived-ecmwf-sfc-t-var-48h": { en: "ECMWF Surface 48h Temperature Variation", zh: "ECMWF 地面 48小时变温" },
  "derived-ecmwf-850-t-var-24h": { en: "ECMWF 850hPa 24h Temperature Variation", zh: "ECMWF 850hPa 24小时变温" },
  "derived-ecmwf-850-t-var-48h": { en: "ECMWF 850hPa 48h Temperature Variation", zh: "ECMWF 850hPa 48小时变温" },
  "derived-ecmwf-slp-var-24h": { en: "ECMWF 24h Sea Level Pressure Variation", zh: "ECMWF 24小时变压" },
  "derived-ecmwf-slp-var-48h": { en: "ECMWF 48h Sea Level Pressure Variation", zh: "ECMWF 48小时变压" },
  "recipe-surface-variation-24h": { en: "Surface 24h Synoptic Variation (T-var + SLP-var)", zh: "地面 24小时综合变压变温" },
  "recipe-surface-variation-48h": { en: "Surface 48h Synoptic Variation (T-var + SLP-var)", zh: "地面 48小时综合变压变温" },
  "recipe-nwp-variation-24h": { en: "NWP 24h Synoptic Variation (ECMWF 850 T-var + SLP-var)", zh: "数值预报 24小时综合变压变温 (ECMWF 850)" },
  "recipe-nwp-variation-48h": { en: "NWP 48h Synoptic Variation (ECMWF 850 T-var + SLP-var)", zh: "数值预报 48小时综合变压变温 (ECMWF 850)" }
};

export function localizeEntityName(entity, locale = activeLocale) {
  if (!entity) return "";
  if (typeof entity === "string") {
    const trimmed = entity.trim();
    if (CATEGORY_TRANSLATIONS[trimmed]) {
      return CATEGORY_TRANSLATIONS[trimmed][locale] || trimmed;
    }
    if (PRESET_TRANSLATIONS[trimmed]) {
      return PRESET_TRANSLATIONS[trimmed][locale] || PRESET_TRANSLATIONS[trimmed].en;
    }
    const { en, zh } = splitBilingualString(trimmed);
    return locale === "zh" ? zh : en;
  }

  if (locale === "zh") {
    if (entity.name_zh) return entity.name_zh;
    if (entity.id && PRESET_TRANSLATIONS[entity.id]) return PRESET_TRANSLATIONS[entity.id].zh;
    if (entity.name && PRESET_TRANSLATIONS[entity.name]) return PRESET_TRANSLATIONS[entity.name].zh;
    if (entity.category_zh && !entity.name) return entity.category_zh;
  } else {
    if (entity.name_en) return entity.name_en;
    if (entity.id && PRESET_TRANSLATIONS[entity.id]) return PRESET_TRANSLATIONS[entity.id].en;
    if (entity.name && PRESET_TRANSLATIONS[entity.name]) return PRESET_TRANSLATIONS[entity.name].en;
    if (entity.category_en && !entity.name) return entity.category_en;
  }

  const raw = (locale === "en" && entity.shortName && !/[\u4e00-\u9fa5]/.test(entity.shortName))
    ? (entity.name || entity.shortName)
    : (entity.name || entity.title || entity.id || "");

  const { en, zh } = splitBilingualString(raw);
  return locale === "zh" ? zh : en;
}

export const BADGE_TRANSLATIONS = {
  Diag: { en: "Diag", zh: "诊断" },
  Sounding: { en: "Sounding", zh: "探空" },
  Profile: { en: "Profile", zh: "剖面" },
  "Sat QPE": { en: "Sat QPE", zh: "卫星降水" },
  Sat: { en: "Sat", zh: "卫星" },
  Ltng: { en: "Ltng", zh: "闪电" },
  Prof: { en: "Prof", zh: "风廓线" },
  Radar: { en: "Radar", zh: "雷达" },
  Trop: { en: "Trop", zh: "对流层顶" },
  Col: { en: "Col", zh: "整层" },
  Obs: { en: "Obs", zh: "观测" },
  Sfc: { en: "Sfc", zh: "地面" },
};

export const LEGEND_TITLE_TRANSLATIONS = {
  "CAPE (J/kg)": { en: "CAPE (J/kg)", zh: "对流有效位能 CAPE (J/kg)" },
  "Temperature (°C)": { en: "Temperature (°C)", zh: "温度 (°C)" },
  "Precipitation (mm)": { en: "Precipitation (mm)", zh: "降水量 (mm)" },
  "Composite Reflectivity (dBZ)": { en: "Composite Reflectivity (dBZ)", zh: "组合反射率 (dBZ)" },
  "IR Brightness Temp (K)": { en: "IR Brightness Temp (K)", zh: "红外亮温 (K)" },
  "Height (dagpm)": { en: "Height (dagpm)", zh: "位势高度 (dagpm)" },
  "Wind Speed (m/s)": { en: "Wind Speed (m/s)", zh: "风速 (m/s)" },
};

export const UI_STRINGS = {
  // Navigation & Presets
  "nav.presets": { en: "Presets", zh: "数据集" },
  "nav.presets.title": { en: "Open categorized presets menu", zh: "打开分类数据集菜单" },
  "nav.presets.empty": { en: "No presets available", zh: "暂无可用数据集" },
  "nav.presets.pin": { en: "Pin to quick bar", zh: "固定到快捷栏" },
  "nav.presets.unpin": { en: "Unpin preset", zh: "取消固定" },
  "nav.presets.active": { en: "Active:", zh: "当前:" },
  "nav.presets.activeTitle": { en: "Active Preset", zh: "当前预设" },
  "nav.presets.reload": { en: "Reload", zh: "重新加载" },
  "nav.presets.loadData": { en: "Load Data", zh: "加载数据" },
  "nav.presets.defaultOption": { en: "-- Presets --", zh: "-- 预设组合图 --" },
  "nav.presets.pinnedTitle": { en: "Pinned: {name}", zh: "已固定: {name}" },
  "nav.presets.recentTitle": { en: "Recent: {name}", zh: "最近: {name}" },

  // Window Layout & Split Modes
  "nav.layout": { en: "Layout", zh: "窗口布局" },
  "nav.layout.title": { en: "Window Layout and Multi-Window Auto-Allocation", zh: "窗口布局与多窗自动分配" },
  "nav.layout.1x1": { en: "1x1 (Tabs)", zh: "1x1 (单窗标签)" },
  "nav.layout.1x2": { en: "1x2 Split", zh: "1x2 分割" },
  "nav.layout.2x2": { en: "2x2 Split", zh: "2x2 分割" },
  "nav.layout.2x3": { en: "2x3 Split", zh: "2x3 分割" },
  "nav.layout.3x2": { en: "3x2 Split", zh: "3x2 分割" },

  // Auto-Allocation / Contrast
  "nav.alloc.none": { en: "Empty (none)", zh: "空白 (无)" },
  "nav.alloc.multiTime": { en: "Multi-Time Contrast", zh: "多时次对比" },
  "nav.alloc.multiInit": { en: "Multi-Init Contrast", zh: "多起报对比" },
  "nav.alloc.multiStep": { en: "Multi-Step Contrast", zh: "多时效对比" },
  "nav.alloc.multiLevel": { en: "Multi-Level Contrast", zh: "多层级对比" },
  "nav.alloc.multiModel": { en: "Multi-Model Contrast", zh: "多模式对比" },

  // Vertical Dimension & Model
  "nav.level": { en: "Level", zh: "层级" },
  "nav.channel": { en: "Channel", zh: "通道" },
  "nav.height": { en: "Height", zh: "高度" },
  "nav.none": { en: "None", zh: "无" },
  "nav.model": { en: "Model", zh: "模型" },
  "nav.level.selectTitle": { en: "Select {label} for focused window", zh: "选择当前窗口的{label}" },
  "nav.model.selectTitle": { en: "Select NWP forecast model", zh: "选择数值预报模型" },

  // Operating Mode
  "nav.mode.latest": { en: "Latest", zh: "实时模式" },
  "nav.mode.history": { en: "History", zh: "复盘模式" },
  "nav.mode.historyActive": { en: "History Mode active. Click to switch to Latest (live).", zh: "复盘模式已激活。点击切换到实时模式。" },
  "nav.mode.historySwitch": { en: "Switch to History Mode", zh: "切换到复盘模式" },
  "nav.mode.historyDate": { en: "Select historical target date (YYYY-MM-DD)", zh: "选择历史归档日期 (YYYY-MM-DD)" },
  "nav.mode.historyExit": { en: "Exit History Mode and return to Latest", zh: "退出复盘模式并返回实时模式" },

  // System Menu
  "nav.menu.title": { en: "Application Menu (Print, Screenshot, Help, Config)", zh: "系统菜单 (打印、截图、帮助、配置)" },
  "nav.menu.print": { en: "Print", zh: "打印" },
  "nav.menu.screenshot": { en: "Screenshot", zh: "截图" },
  "nav.menu.help": { en: "Help", zh: "帮助" },
  "nav.menu.commandPalette": { en: "Command Palette", zh: "命令面板" },
  "nav.menu.commandPaletteTitle": { en: "Open Command Palette (Ctrl+K or /)", zh: "打开命令面板 (Ctrl+K 或 /)" },
  "nav.menu.theme": { en: "Theme / Scheme", zh: "主题" },
  "nav.menu.theme.light": { en: "Light (Paper)", zh: "浅色 (纸张)" },
  "nav.menu.theme.dark": { en: "Dark (Ink)", zh: "深色 (暗夜)" },
  "nav.menu.theme.brutalism": { en: "Brutalism", zh: "粗野主义" },
  "nav.menu.projection": { en: "Map Projection", zh: "地图投影" },
  "nav.menu.projection.mercator": { en: "Mercator", zh: "墨卡托 (Mercator)" },
  "nav.menu.projection.globe": { en: "Globe", zh: "三维地球 (Globe)" },
  "nav.menu.projection.perspective": { en: "Vertical Perspective", zh: "垂直透视 (Perspective)" },
  "nav.menu.language": { en: "Language", zh: "语言" },
  "nav.menu.config": { en: "Config", zh: "配置" },
  "nav.menu.configTitle": { en: "Open Configuration Editor Tab", zh: "打开配置编辑器标签页" },

  // Tabs Bar
  "tabs.tab": { en: "Tab {index}", zh: "标签 {index}" },
  "tabs.split": { en: "Split", zh: "分割" },
  "tabs.collapse": { en: "✕ Collapse", zh: "✕ 收起对比组" },
  "tabs.collapseTitle": { en: "Collapse split contrast group and remove auto-allocated tabs (Shift+F4)", zh: "收起多窗对比组并移除自动分配的标签页 (Shift+F4)" },
  "tabs.config": { en: "⚙ Config", zh: "⚙ 配置" },
  "tabs.newTab": { en: "Add new tab", zh: "新建标签页" },
  "tabs.returnToSplit": { en: "⊞ Return to {layout} Split", zh: "⊞ 返回 {layout} 分割" },
  "tabs.alloc": { en: "Alloc:", zh: "分配:" },
  "tabs.layout": { en: "Layout:", zh: "窗口布局:" },
  "tabs.layout.tabs": { en: "⊟ Tabs", zh: "⊟ 单窗标签" },
  "tabs.layout.2split": { en: "◫ 2-Split", zh: "◫ 2分屏" },
  "tabs.layout.4split": { en: "⊞ 4-Split", zh: "⊞ 4分屏" },
  "tabs.layout.6split": { en: "▦ 6-Split", zh: "▦ 6分屏" },
  "tabs.syncOn": { en: "Sync 🔗", zh: "同步 🔗" },
  "tabs.syncOff": { en: "Sync ✕", zh: "同步 ✕" },
  "tabs.syncTitleOn": { en: "Camera sync enabled across windows (Click to toggle off)", zh: "已开启多窗口视角同步 (点击关闭)" },
  "tabs.syncTitleOff": { en: "Camera sync disabled (Click to toggle on)", zh: "视角同步已关闭 (点击开启)" },
  "tabs.pin": { en: "Pin as permanent independent tab (Alt+P)", zh: "固定为独立常驻标签页 (Alt+P)" },
  "tabs.close": { en: "Close Tab", zh: "关闭标签页" },
  "tabs.dragHint": { en: "Drag to rearrange", zh: "拖拽以重新排序" },
  "tabs.autoAllocSlot": { en: "Auto-allocated contrast slot ({mode}). Click 📌 to keep permanently.", zh: "自动分配的对比标签 ({mode})。点击 📌 可常驻。" },

  // Status Bar
  "status.connecting": { en: "Connecting...", zh: "连接中..." },
  "status.mock": { en: "MOCK", zh: "模拟数据" },
  "status.offline": { en: "OFFLINE", zh: "离线" },
  "status.lighting": { en: "Lighting", zh: "光线补偿" },
  "status.lightingTitleOn": { en: "Solar Lighting Compensation: ON (Normalizes sun-angle & slant-path cloud/vapor color differences)", zh: "太阳天顶角光线补偿: 开启 (校正不同角度与光照下的云图偏色)" },
  "status.lightingTitleOff": { en: "Solar Lighting Compensation: OFF (Click to normalize morning/noon/evening & longitude sun-angle differences)", zh: "太阳天顶角光线补偿: 关闭 (点击开启光线补偿)" },
  "status.historyBadge": { en: "HISTORY · {date}", zh: "复盘 · {date}" },
  "status.observation": { en: "OBSERVATION", zh: "实况观测" },
  "status.nwpForecast": { en: "NWP FORECAST", zh: "数值预报" },
  "status.init": { en: "Init:", zh: "起报:" },
  "status.initTitle": { en: "Select forecast initialization cycle", zh: "选择模式起报时间" },
  "status.obsTime": { en: "Observation Time: ", zh: "观测时间: " },
  "status.forecastLead": { en: "Forecast Lead: ", zh: "预报时效: " },
  "status.realTimeObs": { en: "Real-time Observation (Step: {step})", zh: "实况观测 (步长: {step})" },
  "status.validStep": { en: "Valid: {valid} (Step: {step})", zh: "有效时间: {valid} (步长: {step})" },
  "status.cursorProbe": { en: "Live Cursor Probe (Coordinates & Meteorological Values)", zh: "光标经纬度与当前格点数值" },
  "status.layers": { en: "Layers", zh: "数据层" },
  "status.layersTitle": { en: "Toggle Layers Drawer", zh: "展开/收起数据层面板" },

  // Timeline & MultiTrack
  "timeline.play": { en: "Start Playback (Space)", zh: "播放动画 (空格键)" },
  "timeline.pause": { en: "Pause Playback (Space)", zh: "暂停动画 (空格键)" },
  "timeline.prev": { en: "Previous Step (Left Arrow)", zh: "上一时次 (左方向键)" },
  "timeline.next": { en: "Next Step (Right Arrow)", zh: "下一时次 (右方向键)" },
  "timeline.loop.enable": { en: "Enable Loop Range (A/B markers)", zh: "开启循环播放区间 (A/B 标记)" },
  "timeline.loop.disable": { en: "Disable Loop Range", zh: "关闭区间循环播放" },
  "timeline.step": { en: "Step", zh: "步长" },
  "timeline.speed": { en: "Speed", zh: "速度" },
  "timeline.singleStrip": { en: "⤡ Single Strip", zh: "⤡ 单轨时间轴" },
  "timeline.dawLanes": { en: "⤢ DAW Lanes", zh: "⤢ 多轨时间轴" },
  "timeline.multitrack.collapse": { en: "Collapse Multi-Track DAW View", zh: "收起多轨时间轴视图" },
  "timeline.multitrack.expand": { en: "Expand Multi-Track DAW Lanes (§2.3)", zh: "展开多轨时间轴视图" },
  "timeline.mtt.title": { en: "MULTI-TRACK DAW TIMELINE", zh: "多轨时序对齐视图" },
  "timeline.mtt.playhead": { en: "PLAYHEAD: {time}", zh: "播放指针: {time}" },
  "timeline.mtt.historyReview": { en: "HISTORY REVIEW", zh: "历史复盘模式" },
  "timeline.mtt.liveNowcast": { en: "LIVE (NOWCAST)", zh: "实时追踪模式" },
  "timeline.mtt.reviewMode": { en: "REVIEW MODE", zh: "复盘浏览模式" },
  "timeline.mtt.snap": { en: "🧲 SNAP", zh: "🧲 吸附" },
  "timeline.mtt.snapTitle": { en: "Snap playhead to pacemaker layer's sample ticks (§2.9). Hold Shift for free scrub.", zh: "播放指针吸附基准层刻度。按住 Shift 自由拖动。" },
  "timeline.mtt.collapseBtn": { en: "⤡ Single Strip", zh: "⤡ 收起多轨" },
  "timeline.mtt.collapseTitle": { en: "Collapse to Single Strip Ruler", zh: "收起至单轨时间标尺" },
  "timeline.mtt.cadence": { en: "LAYERS CADENCE", zh: "数据层与更新频次" },
  "timeline.mtt.future": { en: "FORECAST / FUTURE", zh: "预报 / 未来时段" },
  "timeline.mtt.empty": { en: "No active layers to display in timeline", zh: "暂无可显示在时间轴上的激活数据层" },
  "timeline.mtt.pin": { en: "Pin layer time (lock from master playhead)", zh: "锁定该层时间 (不随主指针移动)" },
  "timeline.mtt.vis": { en: "Toggle layer visibility", zh: "切换图层可见性" },
  "timeline.mtt.play": { en: "▶ Play", zh: "▶ 播放" },
  "timeline.mtt.pause": { en: "❚❚ Pause", zh: "❚❚ 暂停" },
  "timeline.mtt.prev": { en: "◀◀ Prev", zh: "◀◀ 上一时次" },
  "timeline.mtt.next": { en: "Next ▶▶", zh: "下一时次 ▶▶" },
  "timeline.mtt.pacemaker": { en: "Step by (Pacemaker):", zh: "步长基准层 (Pacemaker):" },
  "timeline.mtt.loop": { en: "🔁 Loop Range", zh: "🔁 循环区间" },

  // Layers Panel & Status Panel
  "layers.subtab.layers": { en: "Layers", zh: "数据层" },
  "layers.subtab.status": { en: "⏱ Time Status", zh: "⏱ 时效状态" },
  "layers.staleHidden": { en: "{count} layer{s} hidden (stale)", zh: "已隐藏 {count} 个过期数据层" },
  "layers.show": { en: "Show", zh: "显示" },
  "layers.status.current": { en: "Current", zh: "正常" },
  "layers.status.desync": { en: "Desync", zh: "时次偏移" },
  "layers.status.softStale": { en: "Soft Stale", zh: "临期" },
  "layers.status.stale": { en: "Stale", zh: "已过期" },
  "layers.autoHideStale": { en: "Auto-hide Stale", zh: "自动隐藏过期层" },
  "layers.empty": { en: "No active data layers.", zh: "暂无激活的数据层。" },
  "layers.col.layer": { en: "Layer", zh: "数据层" },
  "layers.col.time": { en: "Obs Time", zh: "数据时间" },
  "layers.col.age": { en: "Age", zh: "时差" },
  "layers.col.status": { en: "Status", zh: "状态" },

  // Layer Row Controls
  "layers.subtab.style": { en: "Style", zh: "样式" },
  "layers.subtab.interval": { en: "Interval", zh: "间隔" },
  "layers.subtab.time": { en: "Time", zh: "时间" },
  "layers.subtab.elements": { en: "Elements", zh: "要素" },
  "layers.subtab.filter": { en: "Filter", zh: "过滤" },
  "layers.subtab.display": { en: "Display", zh: "显示" },
  "layers.subtab.palette": { en: "Palette", zh: "色标" },
  "layers.subtab.station": { en: "Station", zh: "站点" },
  "layers.subtab.curves": { en: "Curves", zh: "曲线" },
  "layers.subtab.point": { en: "Point & Time", zh: "单点与时效" },
  "layers.subtab.fields": { en: "Fields", zh: "物理量" },
  "layers.subtab.transect": { en: "Transect", zh: "剖面线" },
  "layers.subtab.features": { en: "Features", zh: "地理要素" },
  "layers.subtab.basemap": { en: "Projection", zh: "地图投影" },
  "layers.subtab.general": { en: "General", zh: "常规" },
  "layers.solo": { en: "Solo layer (S)", zh: "独显该层 (S)" },
  "layers.expand": { en: "Expand/collapse layer settings", zh: "展开/收起图层设置" },
  "layers.removeContour": { en: "Remove derived contour layer", zh: "移除衍生等值线层" },
  "layers.contourLines": { en: "Contour Lines", zh: "等值线" },
  "layers.colorFill": { en: "Color Fill", zh: "色斑填充" },
  "layers.rasterShading": { en: "Raster Shading", zh: "栅格渲染" },
  "layers.labels": { en: "Labels", zh: "数值标注" },
  "layers.opacity": { en: "Opacity:", zh: "不透明度:" },
  "layers.lineColor": { en: "Line color", zh: "线色" },
  "layers.width": { en: "Width", zh: "线宽" },
  "layers.label": { en: "Label", zh: "字号" },
  "layers.boldValues": { en: "Bold values", zh: "加粗值" },
  "layers.boldPx": { en: "Bold px", zh: "加粗线宽" },
  "layers.smoothLines": { en: "Smooth Contour Lines", zh: "平滑等值线" },
  "layers.windStreamlines": { en: "Wind Streamlines", zh: "风场流线" },
  "layers.windBarbs": { en: "Wind Barbs", zh: "风羽" },
  "layers.windRaster": { en: "Wind Magnitude Raster", zh: "风速色斑栅格" },
  "layers.interval": { en: "Interval", zh: "等值线间隔" },
  "layers.start": { en: "Start", zh: "起始" },
  "layers.step": { en: "Step", zh: "步长" },
  "layers.end": { en: "End", zh: "终止" },
  "layers.auto": { en: "Auto", zh: "自动" },
  "layers.palette": { en: "🎨 Palette", zh: "🎨 调色板" },
  "layers.builtinDefault": { en: "Built-in default", zh: "内置默认" },
  "layers.temperature": { en: "Temperature", zh: "温度" },
  "layers.dewPoint": { en: "Dew Point", zh: "露点" },
  "layers.pressure": { en: "Pressure", zh: "气压" },
  "layers.height": { en: "Height", zh: "位势高度" },
  "layers.dtd": { en: "T−Td", zh: "露点差 (T−Td)" },
  "layers.cloud": { en: "Cloud", zh: "云量" },
  "layers.weather": { en: "Weather", zh: "现在天气" },
  "layers.visibility": { en: "Visibility", zh: "能见度" },
  "layers.rain6": { en: "Rain 6h", zh: "6h降水" },
  "layers.streamlines": { en: "Streamlines", zh: "流线" },
  "layers.snowDepth": { en: "Snow Depth", zh: "积雪深度" },
  "layers.pressChange3h": { en: "3h Pressure Change", zh: "3h变压" },
  "layers.pressChange24h": { en: "24h Pressure Change", zh: "24h变压" },
  "layers.stationId": { en: "Station ID", zh: "区站号" },
  "layers.addContour": { en: "Add Contour Layer", zh: "添加衍生等值线层" },
  "layers.add": { en: "＋ Add", zh: "＋ 添加" },
  "layers.smoothRaster": { en: "Smooth Raster Interpolation", zh: "平滑栅格插值" },
  "layers.stationSelection": { en: "Station Selection", zh: "探空站点选择" },
  "layers.parcelOrigin": { en: "Parcel Origin", zh: "气块抬升起始层" },
  "layers.surface": { en: "Surface", zh: "地面" },
  "layers.custom": { en: "Custom", zh: "自定义" },
  "layers.dryAdiabats": { en: "Dry Adiabats", zh: "干绝热线" },
  "layers.moistAdiabats": { en: "Moist Adiabats", zh: "湿绝热线" },
  "layers.mixingRatio": { en: "Mixing Ratio", zh: "等饱和比湿线" },
  "layers.indices": { en: "Indices", zh: "强对流指数" },
  "layers.crossSectionPoint": { en: "Cross-section Point", zh: "剖面单点坐标" },
  "layers.rhFill": { en: "RH Fill", zh: "相对湿度色斑" },
  "layers.vvel": { en: "VVEL", zh: "垂直速度" },
  "layers.mapMarker": { en: "Map Marker", zh: "地图标记" },
  "layers.transectAB": { en: "Transect A → B", zh: "空间剖面线 A → B" },
  "layers.apply": { en: "Apply", zh: "应用" },
  "layers.draw": { en: "✏ Draw", zh: "✏ 绘制" },
  "layers.setA": { en: "Set A", zh: "设点 A" },
  "layers.setB": { en: "Set B", zh: "设点 B" },
  "layers.flip": { en: "⇄ Flip", zh: "⇄ 反转" },
  "layers.swapAxes": { en: "⇄ Swap axes", zh: "⇄ 切换坐标轴" },
  "layers.reverseTime": { en: "⇄ Reverse time", zh: "⇄ 反转时间" },
  "layers.proj.label": { en: "🌐 Projection:", zh: "🌐 地图投影:" },
  "layers.proj.mercator": { en: "🗺️ Mercator (2D)", zh: "🗺️ 墨卡托 (2D)" },
  "layers.proj.globe": { en: "🌍 Globe (3D)", zh: "🌍 三维地球 (3D)" },
  "layers.proj.perspective": { en: "🪐 Perspective (3D)", zh: "🪐 垂直透视 (3D)" },
  "layers.obsTimeMatching": { en: "⏱ Observation Time & Matching", zh: "⏱ 观测时间与匹配策略" },
  "layers.policy": { en: "Policy", zh: "匹配策略" },
  "layers.policy.nearest": { en: "Nearest (closest sample either side)", zh: "最近可用时次" },
  "layers.policy.latestAt": { en: "Latest-at (causal: sample ≤ T)", zh: "最新有效数据 (≤ T)" },
  "layers.policy.hold": { en: "Hold (keep showing until superseded)", zh: "持续保持 (直到更新)" },
  "layers.policy.interpolate": { en: "Interpolate (smooth fields)", zh: "时序插值 (平滑过渡)" },
  "layers.tolerance": { en: "Tolerance", zh: "容差窗口" },
  "layers.timeOffset": { en: "Time Offset (Desync)", zh: "时间偏移 (异步对比)" },
  "layers.sync0": { en: "Sync (0)", zh: "同步 (0)" },

  // Station Filter
  "stationFilter.title": { en: "Data Filter Rules", zh: "站点数据过滤规则" },
  "stationFilter.match": { en: "Match:", zh: "匹配逻辑:" },
  "stationFilter.viewOnly": { en: "ViewOnly (per-element)", zh: "仅隐藏要素 (保留站点)" },
  "stationFilter.allAnd": { en: "ALL (AND)", zh: "全部满足 (AND)" },
  "stationFilter.anyOr": { en: "ANY (OR)", zh: "任一满足 (OR)" },
  "stationFilter.rule1Only": { en: "Rule 1 Only", zh: "仅规则 #1" },
  "stationFilter.addRule": { en: "＋ Add Rule", zh: "＋ 添加规则" },
  "stationFilter.clearAll": { en: "Clear All", zh: "清空全部" },

  // Window Panel & Fullscreen
  "window.unsynced": { en: "Independent Window (Unsynced)", zh: "独立窗口 (未同步)" },
  "window.expand": { en: "Expand this window to full view (double-click header)", zh: "最大化此窗口 (或双击标题栏)" },
  "window.returnToSplit": { en: "⊞ Return to {layout} Split", zh: "⊞ 返回 {layout} 分割" },
  "fullscreen.enter": { en: "Fullscreen", zh: "全屏显示" },
  "fullscreen.exit": { en: "Exit Fullscreen (Esc)", zh: "退出全屏 (Esc)" },

  // Legend
  "legend.title": { en: "Legend", zh: "图例" },
  "legend.collapse": { en: "Collapse legend", zh: "收起图例" },

  // Command Palette
  "cmd.placeholder": { en: "Type a command, preset, or station ID (e.g. 54511)...", zh: "输入命令、数据集或区站号 (如 54511)..." },
  "cmd.empty": { en: "No matching presets, stations, or actions found.", zh: "未找到匹配的数据集、站点或操作。" },
  "cmd.navigate": { en: "Navigate", zh: "导航" },
  "cmd.select": { en: "Select", zh: "选择" },
  "cmd.close": { en: "Close", zh: "关闭" },
  "cmd.cat.actions": { en: "Actions", zh: "操作" },
  "cmd.cat.theme": { en: "Theme", zh: "主题" },
  "cmd.cat.projection": { en: "Projection", zh: "地图投影" },
  "cmd.cat.language": { en: "Language", zh: "语言" },
  "cmd.cat.presets": { en: "Presets", zh: "数据集" },
  "cmd.cat.stations": { en: "Stations", zh: "气象站" },

  // Config Editor & Sub-Forms
  "config.title": { en: "⚙ Meteorological Configuration", zh: "⚙ 气象工作站配置" },
  "config.subtab.presets": { en: "Presets", zh: "数据集" },
  "config.subtab.colormaps": { en: "Colormaps", zh: "色标方案" },
  "config.subtab.settings": { en: "Settings", zh: "系统设置" },
  "config.subtab.json": { en: "⟨⟩ JSON", zh: "⟨⟩ JSON 源码" },
  "config.status.saved": { en: "Valid (Saved)", zh: "有效 (已保存)" },
  "config.status.modified": { en: "Modified (Unsaved)", zh: "已修改 (未保存)" },
  "config.status.invalid": { en: "Invalid", zh: "配置无效" },
  "config.btn.reload": { en: "↺ Reload", zh: "↺ 重新加载" },
  "config.btn.saveApply": { en: "✓ Save & Apply", zh: "✓ 保存并应用" },
  "config.btn.close": { en: "✕ Close", zh: "✕ 关闭" },
  "config.settings.basemapTitle": { en: "🗺️ Basemap & Projection", zh: "🗺️ 底图与地图投影" },
  "config.settings.basemapDesc": { en: "Default background tile theme, layer visibility, and coordinate projection.", zh: "默认底图主题、矢量图层叠加与坐标投影设置。" },
  "config.settings.themeScheme": { en: "Theme Scheme", zh: "主题方案" },
  "config.settings.mapProjection": { en: "Map Projection", zh: "地图投影" },
  "config.settings.vectorOverlays": { en: "Vector Overlays", zh: "矢量叠加层" },
  "config.settings.perfTitle": { en: "⚡ Performance & Contour Budget", zh: "⚡ 性能与等值线网格预算" },
  "config.settings.perfDesc": { en: "Controls memory budget and Marching Squares grid cell sampling limits.", zh: "控制内存预算与 Marching Squares 等值线网格采样上限。" },
  "config.settings.cellBudget": { en: "Max Effective Cells (Marching Squares budget)", zh: "最大有效网格数 (Marching Squares 预算)" },
  "config.settings.graticule": { en: "10° Lon/Lat Graticule Lines", zh: "10° 经纬度网格线" },
  "config.settings.world": { en: "World Country Boundaries", zh: "国界线" },
  "config.settings.provinces": { en: "Province Boundaries", zh: "省界线" },
  "config.settings.cities": { en: "City / County Boundaries", zh: "市县界线" },
  "config.settings.displayLanguage": { en: "Display Language", zh: "界面语言" },
  "config.settings.languageTitle": { en: "🌐 Language / 语言", zh: "🌐 界面语言" },
  "config.settings.languageDesc": { en: "User interface display language and category localization.", zh: "用户界面显示语言与气象要素本地化。" },
  "config.presets.filter": { en: "Filter presets...", zh: "搜索数据集..." },
  "config.presets.newPreset": { en: "+ New Preset", zh: "+ 新建数据集" },
  "config.presets.addPreset": { en: "+ Preset", zh: "+ 数据集" },
  "config.presets.addDivider": { en: "+ Div", zh: "+ 分隔线" },
  "config.presets.addPresetTitle": { en: "Add new preset group", zh: "添加新数据集组合" },
  "config.presets.addDividerTitle": { en: "Add category divider", zh: "添加分类分隔线" },
  "config.presets.noMatch": { en: "No presets match search", zh: "未找到匹配的数据集" },
  "config.presets.moveUp": { en: "Move up", zh: "上移" },
  "config.presets.moveDown": { en: "Move down", zh: "下移" },
  "config.presets.layersBadge": { en: "{count} layers", zh: "{count} 个图层" },
  "config.presets.empty": { en: "No presets found in configuration.", zh: "配置中未找到数据集。" },
  "config.presets.createFirst": { en: "+ Create your first preset", zh: "+ 创建第一个数据集" },
  "config.presets.categoryDivider": { en: "Category Divider: {id}", zh: "分类分隔线: {id}" },
  "config.presets.dividerLabel": { en: "Divider Label", zh: "分隔线名称" },
  "config.presets.deleteDivider": { en: "🗑️ Delete Divider", zh: "🗑️ 删除分隔线" },
  "config.presets.duplicate": { en: "Duplicate", zh: "复制" },
  "config.presets.delete": { en: "Delete", zh: "删除" },
  "config.presets.displayName": { en: "Display Name", zh: "显示名称" },
  "config.presets.category": { en: "Category", zh: "分类" },
  "config.presets.defaultIsobaricLevel": { en: "Default Isobaric Level", zh: "默认等压面层级" },
  "config.presets.hasPressureLevels": { en: "Has Pressure Levels (multi-level)", zh: "包含气压层级 (多层对比)" },
  "config.presets.layersCount": { en: "Layers ({count})", zh: "数据层 ({count})" },
  "config.presets.layersDesc": { en: "Stacked layers rendered when this preset is loaded.", zh: "加载此数据集时渲染的图层栈。" },
  "config.presets.addLayer": { en: "+ Add Layer", zh: "+ 添加数据层" },
  "config.presets.noLayers": { en: "No layers in this preset group.", zh: "当前数据集中暂无图层。" },
  "config.presets.addFirstLayer": { en: "+ Add first layer", zh: "+ 添加首个图层" },
  "config.presets.duplicateLayer": { en: "Duplicate Layer", zh: "复制图层" },
  "config.presets.removeLayer": { en: "Remove Layer", zh: "移除图层" },

  // Layer Form
  "config.layer.copy": { en: "📋 Copy", zh: "📋 复制" },
  "config.layer.remove": { en: "🗑️ Remove", zh: "🗑️ 移除" },
  "config.layer.type": { en: "Layer Type", zh: "图层类型" },
  "config.layer.name": { en: "Display Name", zh: "显示名称" },
  "config.layer.model": { en: "Model / Data Source", zh: "模式 / 数据源" },
  "config.layer.element": { en: "Element", zh: "气象要素" },
  "config.layer.level": { en: "Pressure Level (hPa)", zh: "气压层级 (hPa)" },
  "config.layer.colormap": { en: "Colormap", zh: "色标方案" },
  "config.layer.noneDefault": { en: "(None / Default)", zh: "(无 / 默认)" },
  "config.layer.palettePath": { en: "XML Palette Path (optional)", zh: "XML 调色板路径 (可选)" },
  "config.layer.contourShading": { en: "Contour & Shading Options", zh: "等值线与色斑设置" },
  "config.layer.showIsolines": { en: "Show Isolines", zh: "显示等值线" },
  "config.layer.lineColor": { en: "Line Color", zh: "线色" },
  "config.layer.showIsobands": { en: "Show Isobands", zh: "显示填充色斑" },
  "config.layer.rasterMode": { en: "Raster Mode", zh: "栅格模式" },
  "config.layer.windOptions": { en: "Wind Vector Options", zh: "风场矢量设置" },
  "config.layer.streamlines": { en: "Streamlines", zh: "流线动画" },
  "config.layer.windBarbs": { en: "Wind Barbs", zh: "风羽" },
  "config.layer.stationElements": { en: "Station Plotting Elements", zh: "站点填图要素" },
  "config.layer.temperature": { en: "Temperature", zh: "温度" },
  "config.layer.dewPoint": { en: "Dew Point", zh: "露点" },
  "config.layer.windBarb": { en: "Wind Barb", zh: "风羽" },
  "config.layer.pressureHeight": { en: "Pressure / Height", zh: "气压 / 高度" },

  // Colormap Form
  "config.colormaps.filter": { en: "Filter colormaps...", zh: "搜索色标方案..." },
  "config.colormaps.newColormap": { en: "+ New Colormap", zh: "+ 新建色标" },
  "config.colormaps.noMatch": { en: "No colormaps found", zh: "未找到色标方案" },
  "config.colormaps.colorStops": { en: "Color Stops", zh: "色标节点" },
  "config.colormaps.addStop": { en: "+ Add Stop", zh: "+ 添加节点" },
  "config.colormaps.stopsCount": { en: "{count} stops", zh: "{count} 个节点" },
  "config.colormaps.usedCount": { en: "{count} used", zh: "{count} 处引用" },
  "config.colormaps.emptyDetails": { en: "Select or create a colormap to view details.", zh: "选择或新建色标方案以查看详情。" },
  "config.colormaps.name": { en: "Colormap Name:", zh: "色标名称:" },
  "config.colormaps.presetTemplate": { en: "Preset Template...", zh: "预设模板..." },
  "config.colormaps.gradientPreview": { en: "Gradient Preview", zh: "渐变预览" },
  "config.colormaps.stopPointsCount": { en: "Stop Points ({count})", zh: "色标节点 ({count})" },
  "config.colormaps.stopPointsDesc": { en: "Define scalar values and corresponding RGBA color transitions.", zh: "定义标量数值及对应的 RGBA 颜色过渡。" },
  "config.colormaps.reverseColors": { en: "Reverse Colors", zh: "反转颜色" },
  "config.colormaps.colValue": { en: "Value", zh: "数值" },
  "config.colormaps.colColor": { en: "Color", zh: "颜色" },
  "config.colormaps.colHex": { en: "Hex", zh: "Hex 颜色值" },

  // JSON Form
  "config.json.format": { en: "⚡ Format JSON", zh: "⚡ 格式化 JSON" },
  "config.json.hint": { en: "Direct JSON mode. Changes synchronize across all visual sub-tabs.", zh: "直接编辑 JSON 模式。修改将实时同步到所有可视化配置子页面。" },
  "config.json.loading": { en: "Loading JSON...", zh: "正在加载 JSON..." },

  // Profile floating panels
  "profile.tlogp": { en: "T-lnP Sounding", zh: "T-lnP 探空图" },
  "profile.timeHeight": { en: "Time-Height Cross-Section", zh: "时间-高度剖面图" },
  "profile.lineHeight": { en: "Line-Height Cross-Section", zh: "空间垂直剖面图" },
  "profile.hovmoller": { en: "Time-Line Hovmoller", zh: "Hovmöller 时空剖面图" },
};

export function translateUI(key, paramsOrLocale = {}, maybeLocale = null) {
  let params = {};
  let locale = null;
  if (typeof paramsOrLocale === "string") {
    locale = paramsOrLocale;
    params = {};
  } else {
    params = paramsOrLocale || {};
    locale = maybeLocale;
  }
  const normLocale = normalizeLocale(locale || activeLocale);
  const entry = UI_STRINGS[key];
  let text = entry ? (entry[normLocale] || entry.en || key) : key;
  if (params && typeof params === "object") {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), v != null ? String(v) : "");
    }
  }
  return text;
}

export const t = translateUI;
