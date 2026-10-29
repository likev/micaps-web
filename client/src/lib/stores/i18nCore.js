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
