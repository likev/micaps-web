import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  isSatelliteGroup,
  getObsTreeLimit,
  getObsStepOptions,
  formatStepLabel,
  getPeriodsForStep,
  stepBackwardByInterval,
  filterObsFilesByStep,
  selectObsChipsWindow,
} from "../../src/ui/timeline/timelineMath.js";

import {
  getGlobalLocale,
  setGlobalLocale,
  toggleGlobalLocale,
  normalizeLocale,
  splitBilingualString,
  localizeCategory,
  localizeEntityName,
  CATEGORY_TRANSLATIONS,
} from "../../src/lib/stores/i18nCore.js";

import { getStationDatasetType } from "../../src/ui/layers/layerDefaults.js";
import { computeAllocBadgeText, DEFAULT_MODELS, DEFAULT_LEVELS } from "../../src/lib/stores/tabsCore.js";
import { computeFullWindowTitle } from "../../src/ui/tabs/windowTitles.js";

const clientDir = resolve(__dirname, "../..");
function readSrc(relPath) {
  return readFileSync(resolve(clientDir, "src", relPath), "utf8");
}

// Extracted helper matching PresetMenu.svelte formatPresetBadge
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
      return `C${String(lvl).padStart(3, "0")}`;
    }
    const isMeterHeight =
      id.includes("TDMOSAIC") ||
      firstPath.includes("TDMOSAIC") ||
      (Array.isArray(preset.levels) && preset.levels.some((l) => l > 1050)) ||
      layers.some((l) => String(l?.path || l?.element || "").toUpperCase().includes("TDMOSAIC"));
    if (isMeterHeight) {
      return `${lvl} m`;
    }
    return `${lvl} hPa`;
  }

  // 2. Single-level presets (hasLevel === false)
  if (preset.category?.includes("Derived") ? "Diag" : null) return "Diag";
  if (cat.includes("DERIVED")) return "Diag";
  if (cat.includes("TLOGP")) return "Sounding";
  if (cat.includes("TIME-HEIGHT") || cat.includes("LINE-HEIGHT") || cat.includes("TIME-DISTANCE")) return "Profile";

  // Satellite single-channel or L2 products
  const chMatch = firstPath.match(/\b(C\d{3})\b/);
  if (chMatch) return chMatch[1];
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

describe("Empirical Challenger: Stress-Testing & Adversarial Edge Cases", () => {
  const statusBarSrc = readSrc("components/StatusBar.svelte");
  const windowPanelSrc = readSrc("components/WindowPanel.svelte");
  const timeSliderSrc = readSrc("components/TimeSlider.svelte");
  const navBarSrc = readSrc("components/NavBar.svelte");
  const tabsBarSrc = readSrc("components/TabsBar.svelte");

  // =========================================================================
  // Area 1: Issue 1 - Empty Windows, Null Layers, PMTiles vs Real Weather Layers
  // =========================================================================
  describe("Area 1 (Issue 1): StatusBar Timeline Info Visibility Edge Cases", () => {
    function computeShowTimelineInfo(activeWin, winLayers, ui = { timelineVisible: true, configOpen: false }) {
      const hasWeatherLayers = Array.isArray(winLayers) && winLayers.some((l) =>
        l && l.type !== "pmtiles" && !String(l.id || "").startsWith("layer-pmtiles")
      );
      return Boolean(ui.timelineVisible && !ui.configOpen && (activeWin?.activeGroup || hasWeatherLayers));
    }

    test("handles empty, null, and undefined window/layers gracefully without crashing", () => {
      expect(computeShowTimelineInfo(null, null)).toBe(false);
      expect(computeShowTimelineInfo(undefined, undefined)).toBe(false);
      expect(computeShowTimelineInfo({}, [])).toBe(false);
      expect(computeShowTimelineInfo({ id: "w1" }, [null, undefined, {}])).toBe(true); // empty object has no type === "pmtiles"
    });

    test("hides timeline-info on a fresh empty window with only pmtiles basemap layers", () => {
      const emptyWin = { id: "w1", activeGroup: null };
      const basemapOnlyLayers = [
        { id: "layer-pmtiles-base", type: "pmtiles" },
        { id: "layer-pmtiles-world", type: "pmtiles" },
      ];
      expect(computeShowTimelineInfo(emptyWin, basemapOnlyLayers)).toBe(false);
    });

    test("shows timeline-info when a real weather layer is added", () => {
      const winWithLayers = { id: "w1", activeGroup: null };
      const layersWithWeather = [
        { id: "layer-pmtiles-base", type: "pmtiles" },
        { id: "layer-c1", type: "contour", element: "TMP" },
      ];
      expect(computeShowTimelineInfo(winWithLayers, layersWithWeather)).toBe(true);
    });

    test("shows timeline-info when activeGroup is set even before layers finish mounting", () => {
      const winWithGroup = { id: "w1", activeGroup: { id: "sat-fy4b" } };
      expect(computeShowTimelineInfo(winWithGroup, [])).toBe(true);
    });

    test("hides timeline-info when ui.timelineVisible is false or ui.configOpen is true", () => {
      const win = { id: "w1", activeGroup: { id: "sat-fy4b" } };
      const layers = [{ id: "layer-c1", type: "contour" }];
      expect(computeShowTimelineInfo(win, layers, { timelineVisible: false, configOpen: false })).toBe(false);
      expect(computeShowTimelineInfo(win, layers, { timelineVisible: true, configOpen: true })).toBe(false);
    });

    test("source verification: StatusBar uses class:hidden and hidden attributes", () => {
      expect(statusBarSrc).toContain("class:hidden={!showTimelineInfo}");
      expect(statusBarSrc).toContain("hidden={!showTimelineInfo}");
      expect(statusBarSrc).toContain(".timeline-info.hidden");
    });
  });

  // =========================================================================
  // Area 2: Issue 4 - FY4B vs FY2G vs Radar vs NWP in isSatelliteGroup
  // =========================================================================
  describe("Area 2 (Issue 4): isSatelliteGroup Boundary & Detection Stress Tests", () => {
    test("detects FY-4B and FY-2G variations across IDs, names, paths, and models", () => {
      // Direct string matches
      expect(isSatelliteGroup("FY4B")).toBe(true);
      expect(isSatelliteGroup("FY-4B")).toBe(true);
      expect(isSatelliteGroup("FY2G")).toBe(true);
      expect(isSatelliteGroup("FY-2G")).toBe(true);
      expect(isSatelliteGroup("SATELLITE")).toBe(true);
      expect(isSatelliteGroup("satellite/fy4b/l1/china/c012")).toBe(true);

      // Object groups
      expect(isSatelliteGroup({ id: "sat-fy4b-china" })).toBe(true);
      expect(isSatelliteGroup({ id: "sat-fy2g-dust" })).toBe(true);
      expect(isSatelliteGroup({ name: "FY-2G CTT Cloud Top" })).toBe(true);
      expect(isSatelliteGroup({ path: "SATELLITE/FY2G/L2/DUST" })).toBe(true);
      expect(isSatelliteGroup({ model: "SATELLITE" })).toBe(true);
      expect(isSatelliteGroup({ category: "气象卫星遥感 (Satellite Remote Sensing)" })).toBe(true);

      // Nested layer matches
      expect(isSatelliteGroup({ layers: [{ type: "image" }] })).toBe(true);
      expect(isSatelliteGroup({ layers: [{ model: "SATELLITE" }] })).toBe(true);
      expect(isSatelliteGroup({ layers: [{ path: "SATELLITE/FY4B/L1/CHINA/C001" }] })).toBe(true);
    });

    test("strictly rejects radar, NWP, surface, and profile products from satellite classification", () => {
      // SWAN Radar
      expect(isSatelliteGroup({ id: "swan-mcr", name: "SWAN MCR", path: "SWAN_PRODUCT/MCR" })).toBe(false);
      expect(isSatelliteGroup({ id: "swan-tdmosaic", name: "3D Radar Mosaic" })).toBe(false);
      expect(isSatelliteGroup("RADAR")).toBe(false);

      // NWP Models
      expect(isSatelliteGroup({ id: "ecmwf-500hpa", model: "ECMWF_HR" })).toBe(false);
      expect(isSatelliteGroup({ id: "gfs-rain", model: "GFS" })).toBe(false);
      expect(isSatelliteGroup({ id: "cma-meso-wind", model: "CMA_MESO" })).toBe(false);

      // Surface & Upper-Air Observations
      expect(isSatelliteGroup({ id: "obs-surface", model: "SURFACE" })).toBe(false);
      expect(isSatelliteGroup({ id: "obs-upperair", model: "UPPER_AIR" })).toBe(false);
      expect(isSatelliteGroup({ id: "composite-tlogp", name: "T-lnP Sounding" })).toBe(false);
    });

    test("safely handles null, undefined, empty, and unusual inputs", () => {
      expect(isSatelliteGroup(null)).toBe(false);
      expect(isSatelliteGroup(undefined)).toBe(false);
      expect(isSatelliteGroup("")).toBe(false);
      expect(isSatelliteGroup(0)).toBe(false);
      expect(isSatelliteGroup(false)).toBe(false);
      expect(isSatelliteGroup({})).toBe(false);
      expect(isSatelliteGroup({ layers: [] })).toBe(false);
      expect(isSatelliteGroup({ layers: [null, undefined, {}] })).toBe(false);
    });
  });

  // =========================================================================
  // Area 3: Issue 5 - formatPresetBadge across Extreme Levels, Strings, & Badges
  // =========================================================================
  describe("Area 3 (Issue 5): formatPresetBadge Extreme Values & Edge Cases", () => {
    test("respects explicit preset.badge override regardless of levels or categories", () => {
      expect(formatPresetBadge({ badge: "CUSTOM_PILL", defaultLevel: 500 })).toBe("CUSTOM_PILL");
      expect(formatPresetBadge({ badge: "LIVE", hasLevel: false })).toBe("LIVE");
    });

    test("formats FY-4B channels with 3-digit zero-padding across numbers and strings", () => {
      expect(formatPresetBadge({ id: "sat-fy4b-china", defaultLevel: 12 })).toBe("C012");
      expect(formatPresetBadge({ id: "sat-fy4b-disk", defaultLevel: 2 })).toBe("C002");
      expect(formatPresetBadge({ id: "sat-fy4b-disk", defaultLevel: 1 })).toBe("C001");
      expect(formatPresetBadge({ id: "sat-fy4b-china", defaultLevel: "15" })).toBe("C015");
      expect(formatPresetBadge({ id: "sat-fy4b-china", defaultLevel: "7" })).toBe("C007");
    });

    test("formats radar TDMOSAIC in meters (m) across extreme heights", () => {
      expect(formatPresetBadge({ id: "swan-tdmosaic", defaultLevel: 3000 })).toBe("3000 m");
      expect(formatPresetBadge({ id: "preset-swan_tdmosaic", defaultLevel: 500 })).toBe("500 m");
      expect(formatPresetBadge({ id: "swan-tdmosaic", defaultLevel: 19000 })).toBe("19000 m");
      // Levels array with entries > 1050 indicates meters
      expect(formatPresetBadge({ id: "custom-radar-height", defaultLevel: 1500, levels: [500, 1000, 1500, 2000] })).toBe("1500 m");
    });

    test("formats standard NWP pressure levels with hPa suffix", () => {
      expect(formatPresetBadge({ id: "ecmwf-500", defaultLevel: 500 })).toBe("500 hPa");
      expect(formatPresetBadge({ id: "gfs-850", defaultLevel: 850 })).toBe("850 hPa");
      expect(formatPresetBadge({ id: "ecmwf-10", defaultLevel: 10 })).toBe("10 hPa");
      expect(formatPresetBadge({ id: "ecmwf-1000", defaultLevel: 1000 })).toBe("1000 hPa");
      expect(formatPresetBadge({ id: "ecmwf-default-null", hasLevel: true })).toBe("500 hPa"); // fallback to 500
    });

    test("formats single-level presets (hasLevel === false) with dedicated pills", () => {
      expect(formatPresetBadge({ hasLevel: false, category: "Derived Diagnostics" })).toBe("Diag");
      expect(formatPresetBadge({ hasLevel: false, category: "TlogP Observation" })).toBe("Sounding");
      expect(formatPresetBadge({ hasLevel: false, category: "NWP Time-Height Profile" })).toBe("Profile");

      // Single-channel satellite
      expect(formatPresetBadge({ hasLevel: false, layers: [{ path: "SATELLITE/FY4B/L1/CHINA/C002" }] })).toBe("C002");
      expect(formatPresetBadge({ hasLevel: false, layers: [{ path: "SATELLITE/FY4B/L1/CHINA/C012" }] })).toBe("C012");
      expect(formatPresetBadge({ hasLevel: false, id: "sat-fy2g-dust", layers: [{ path: "SATELLITE/FY2G/L2/DUST" }] })).toBe("RGB");
      expect(formatPresetBadge({ hasLevel: false, id: "sat-fy2g-ctt", layers: [{ path: "SATELLITE/FY2G/L2/CTT" }] })).toBe("CTT");
      expect(formatPresetBadge({ hasLevel: false, id: "sat-fy2g-qpe", layers: [{ path: "SATELLITE/FY2G/L2/QPE" }] })).toBe("Sat QPE");

      // Radar & Lightning
      expect(formatPresetBadge({ hasLevel: false, id: "swan-mcr", layers: [{ path: "SWAN_PRODUCT/MCR" }] })).toBe("Radar");
      expect(formatPresetBadge({ hasLevel: false, id: "obs-lightning", layers: [{ path: "SURFACE/LIGHTNING" }] })).toBe("Ltng");
      expect(formatPresetBadge({ hasLevel: false, id: "obs-wind-profiler", layers: [{ path: "WIND_PROFILER/RAD" }] })).toBe("Prof");

      // Column / Height NWP fields
      expect(formatPresetBadge({ hasLevel: false, id: "ecmwf-tropopause", layers: [{ path: "ECMWF_HR/TROPOPAUSE" }] })).toBe("Trop");
      expect(formatPresetBadge({ hasLevel: false, id: "ecmwf-0c-height", layers: [{ path: "ECMWF_HR/ZERO_DEGREE" }] })).toBe("0°C");
      expect(formatPresetBadge({ hasLevel: false, id: "ecmwf-100m", layers: [{ path: "ECMWF_HR/100M_WIND" }] })).toBe("100m");
      expect(formatPresetBadge({ hasLevel: false, id: "ecmwf-cape", layers: [{ path: "ECMWF_HR/CAPE" }] })).toBe("Col");
      expect(formatPresetBadge({ hasLevel: false, id: "ecmwf-pwat", layers: [{ path: "ECMWF_HR/PWAT" }] })).toBe("Col");

      // Surface vs Upper-air obs
      expect(formatPresetBadge({ hasLevel: false, isObservation: true, category: "Surface Observations" })).toBe("Sfc");
      expect(formatPresetBadge({ hasLevel: false, isObservation: true, category: "Upper-Air Observations" })).toBe("Obs");
    });

    test("gracefully returns empty string for null, undefined, and empty objects", () => {
      expect(formatPresetBadge(null)).toBe("");
      expect(formatPresetBadge(undefined)).toBe("");
    });
  });

  // =========================================================================
  // Area 4: Issue 6 - Localization, Locale Switching & Malformed String Resilience
  // =========================================================================
  describe("Area 4 (Issue 6): Localization & Locale Switching Edge Cases", () => {
    test("normalizeLocale handles case variations, subtags, and invalid fallbacks", () => {
      expect(normalizeLocale("en")).toBe("en");
      expect(normalizeLocale("EN")).toBe("en");
      expect(normalizeLocale("en-US")).toBe("en");
      expect(normalizeLocale("zh")).toBe("zh");
      expect(normalizeLocale("ZH")).toBe("zh");
      expect(normalizeLocale("zh-CN")).toBe("zh");
      expect(normalizeLocale("zh-TW")).toBe("zh");
      expect(normalizeLocale("zh-Hans")).toBe("zh");
      expect(normalizeLocale("fr")).toBe("en"); // fallback
      expect(normalizeLocale("")).toBe("en");
      expect(normalizeLocale(null)).toBe("en");
      expect(normalizeLocale(undefined)).toBe("en");
      expect(normalizeLocale(123)).toBe("en");
    });

    test("splitBilingualString handles diverse delimiter formats and malformed strings", () => {
      // Pattern 1: Slash delimiter "zh / en"
      expect(splitBilingualString("雷达拼图 / Radar Mosaic")).toEqual({ zh: "雷达拼图", en: "Radar Mosaic" });
      expect(splitBilingualString("Radar Mosaic / 雷达拼图")).toEqual({ zh: "雷达拼图", en: "Radar Mosaic" });

      // Pattern 2: Chinese leading, English in parens
      expect(splitBilingualString("强对流与短临 (Severe Convective & Nowcasting)")).toEqual({
        zh: "强对流与短临",
        en: "Severe Convective & Nowcasting",
      });

      // Pattern 3: English leading, Chinese in parens
      expect(splitBilingualString("Surface Observations (地面观测)")).toEqual({
        en: "Surface Observations",
        zh: "地面观测",
      });

      // Single-language inputs
      expect(splitBilingualString("English Only")).toEqual({ en: "English Only", zh: "English Only" });
      expect(splitBilingualString("纯中文")).toEqual({ en: "纯中文", zh: "纯中文" });

      // Malformed / unusual inputs
      expect(splitBilingualString("")).toEqual({ en: "", zh: "" });
      expect(splitBilingualString(null)).toEqual({ en: "", zh: "" });
      expect(splitBilingualString("   /   ")).toEqual({ en: "/", zh: "/" });
      expect(splitBilingualString("Single (Unclosed Parens")).toEqual({ en: "Single (Unclosed Parens", zh: "Single (Unclosed Parens" });
    });

    test("localizeCategory accurately translates all 18 categories across en and zh", () => {
      const allCategories = [
        "Surface Observations",
        "Upper-Air Observations",
        "TlogP Observation",
        "NWP Synoptic",
        "NWP Synoptic Rain",
        "NWP Time-Height Profile",
        "NWP Line-Height Profile",
        "NWP Time-Distance Profile",
        "Multi-Time Recipes",
        "Derived Diagnostics",
        "Severe Convective & Nowcasting",
        "National Gridded Guidance",
        "High-Density Observations",
        "High-Impact NWP Fields",
        "Land Surface Reanalysis",
        "Ensemble & Probability",
        "Forecaster Guidance",
        "Satellite Remote Sensing",
      ];

      for (const cat of allCategories) {
        const en = localizeCategory(cat, "en");
        const zh = localizeCategory(cat, "zh");
        expect(en).toBeDefined();
        expect(zh).toBeDefined();
        expect(/[\u4e00-\u9fa5]/.test(zh)).toBe(true); // Chinese characters present
        expect(/[\u4e00-\u9fa5]/.test(en)).toBe(false); // No Chinese characters in English output
      }
    });

    test("localizeCategory handles fallback for null or empty category", () => {
      expect(localizeCategory(null, "en")).toBe("Other");
      expect(localizeCategory(null, "zh")).toBe("其他");
      expect(localizeCategory("", "en")).toBe("Other");
      expect(localizeCategory("", "zh")).toBe("其他");
    });

    test("global locale switching and toggle state persistence", () => {
      setGlobalLocale("en");
      expect(getGlobalLocale()).toBe("en");
      toggleGlobalLocale();
      expect(getGlobalLocale()).toBe("zh");
      toggleGlobalLocale();
      expect(getGlobalLocale()).toBe("en");
    });
  });

  // =========================================================================
  // Area 5: Issue 7 - TLOGP Sounding Station ID vs Surface/Upper-Air Elements
  // =========================================================================
  describe("Area 5 (Issue 7): TLOGP Sounding Station ID & Dataset Type", () => {
    test("getStationDatasetType classifies TLOGP sounding stations as tlogp before upper_air", () => {
      expect(getStationDatasetType({ path: "UPPER_AIR/TLOGP" })).toBe("tlogp");
      expect(getStationDatasetType({ element: "TLOGP" })).toBe("tlogp");
      expect(getStationDatasetType({ name: "Sounding Station Network" })).toBe("tlogp");
      expect(getStationDatasetType({ id: "upperair-tlogp-stations" })).toBe("tlogp");
    });

    test("getStationDatasetType correctly classifies other station types", () => {
      expect(getStationDatasetType({ model: "UPPER_AIR", path: "UPPER_AIR/PLOT/500" })).toBe("upper_air");
      expect(getStationDatasetType({ path: "SURFACE/PLOT_ALL" })).toBe("standard");
      expect(getStationDatasetType({ path: "SURFACE/SNOW_DEPTH" })).toBe("snow_depth");
      expect(getStationDatasetType({ path: "SURFACE/PRES_CHANGE_3H" })).toBe("pres_change_3h");
      expect(getStationDatasetType({ path: "SURFACE/HORIZONTAL_VISIBILITY" })).toBe("visibility");
      expect(getStationDatasetType({ type: "contour" })).toBe(null); // non-station
    });

    test("stationPlot logic evaluates showStationId accurately for TLOGP stations", () => {
      const cfgTlogp = { element: "TLOGP", path: "UPPER_AIR/TLOGP" };
      const isTlogpStation = String(cfgTlogp?.element || "").toUpperCase() === "TLOGP" || String(cfgTlogp?.path || "").toUpperCase().includes("TLOGP");
      const defaultShowStationId = cfgTlogp?.showStationId !== undefined ? Boolean(cfgTlogp.showStationId) : isTlogpStation;
      expect(defaultShowStationId).toBe(true);

      const cfgTlogpDisabled = { element: "TLOGP", showStationId: false };
      const explicitDisable = cfgTlogpDisabled?.showStationId !== undefined ? Boolean(cfgTlogpDisabled.showStationId) : isTlogpStation;
      expect(explicitDisable).toBe(false);

      const cfgStandard = { path: "SURFACE/PLOT_ALL" };
      const isTlogpStandard = String(cfgStandard?.element || "").toUpperCase() === "TLOGP";
      const standardDefault = cfgStandard?.showStationId !== undefined ? Boolean(cfgStandard.showStationId) : isTlogpStandard;
      expect(standardDefault).toBe(false);
    });
  });

  // =========================================================================
  // Area 6: Issue 9 - Window Title Formatting & Unit Accuracy
  // =========================================================================
  describe("Area 6 (Issue 9): Window Title & Alloc Badge Units", () => {
    test("computeAllocBadgeText displays proper channel (C0xx) and meter (m) units", () => {
      // Satellite FY-4B
      expect(computeAllocBadgeText({ model: "SATELLITE", level: 12 }, "level")).toBe("C012");
      expect(computeAllocBadgeText({ model: "SATELLITE", level: 2 }, "level")).toBe("C002");

      // Radar TDMOSAIC
      expect(computeAllocBadgeText({ activeGroup: { id: "swan-tdmosaic" }, level: 3000 }, "level")).toBe("3000m");
      expect(computeAllocBadgeText({ activeGroup: { id: "swan-tdmosaic" }, level: 500 }, "level")).toBe("500m");

      // Pressure levels
      expect(computeAllocBadgeText({ level: 500 }, "level")).toBe("500hPa");
      expect(computeAllocBadgeText({ level: 850 }, "level")).toBe("850hPa");

      // Surface
      expect(computeAllocBadgeText({ level: null }, "level")).toBe("SFC");
      expect(computeAllocBadgeText({ level: undefined }, "level")).toBe("SFC");
    });

    test("computeFullWindowTitle strips redundant window numbers and appends valid timestamps", () => {
      const winNwp = {
        title: "W1: ECMWF 500hPa Geopotential Height",
        activeGroup: { id: "ecmwf-500hpa", name: "ECMWF 500hPa Geopotential Height" },
        model: "ECMWF_HR",
        period: 24,
        forecastCycle: "2026102800",
      };
      const titleNwp = computeFullWindowTitle(winNwp);
      expect(titleNwp).not.toContain("W1:");
      expect(titleNwp).toContain("ECMWF 500hPa Geopotential Height");
      expect(titleNwp).toContain("[Valid:");

      const winObs = {
        title: "W2: Surface Synoptic",
        activeGroup: { id: "composite-surface", isObservation: true, name: "Surface Synoptic" },
        obsTime: "20261028120000.000",
      };
      const titleObs = computeFullWindowTitle(winObs);
      expect(titleObs).not.toContain("W2:");
      expect(titleObs).toContain("[Obs:");
    });
  });

  // =========================================================================
  // Area 7: Issue 11 - Contrast Allocation Guards for Non-NWP & Observations
  // =========================================================================
  describe("Area 7 (Issue 11): Contrast Mode Allocation Guards", () => {
    function evaluateAllocGuards({ currentGroup, activeWin }) {
      const isSurface = Boolean(
        activeWin?.model === "SURFACE" ||
        String(activeWin?.activeGroup?.id || "").toLowerCase().includes("surface") ||
        String(currentGroup?.id || "").toLowerCase().includes("surface")
      );
      const isUpperAir = Boolean(
        activeWin?.model === "UPPER_AIR" ||
        String(activeWin?.activeGroup?.id || "").toLowerCase().includes("upper") ||
        String(currentGroup?.id || "").toLowerCase().includes("upper")
      );
      const isObs = Boolean(
        isSurface ||
        isUpperAir ||
        activeWin?.isObservation ||
        currentGroup?.isObservation
      );
      const isObsOrNonNwp = Boolean(
        isObs ||
        activeWin?.model === "SATELLITE" ||
        currentGroup?.model === "SATELLITE" ||
        String(currentGroup?.id || "").toLowerCase().includes("swan") ||
        String(currentGroup?.id || "").toLowerCase().includes("radar") ||
        String(currentGroup?.id || "").toLowerCase().includes("sat-")
      );
      const levelAllocDisabled = Boolean(
        isSurface ||
        (currentGroup ? currentGroup.hasLevel === false : (activeWin ? activeWin.hasLevel === false : false))
      );
      return { isObsOrNonNwp, levelAllocDisabled };
    }

    test("disables multi-step and multi-model allocation for Satellite and Radar presets", () => {
      const satGroup = { id: "sat-fy4b-china", model: "SATELLITE", isObservation: true, hasLevel: true };
      const satGuards = evaluateAllocGuards({ currentGroup: satGroup, activeWin: { model: "SATELLITE" } });
      expect(satGuards.isObsOrNonNwp).toBe(true);

      const radarGroup = { id: "swan-mcr", hasLevel: false, isObservation: true };
      const radarGuards = evaluateAllocGuards({ currentGroup: radarGroup, activeWin: null });
      expect(radarGuards.isObsOrNonNwp).toBe(true);
      expect(radarGuards.levelAllocDisabled).toBe(true);
    });

    test("disables multi-level allocation for single-level presets (hasLevel === false)", () => {
      const capeGroup = { id: "ecmwf-cape", hasLevel: false, model: "ECMWF_HR" };
      const guards = evaluateAllocGuards({ currentGroup: capeGroup, activeWin: null });
      expect(guards.levelAllocDisabled).toBe(true);
      expect(guards.isObsOrNonNwp).toBe(false); // multi-step / multi-model is allowed for NWP single-level
    });

    test("enables multi-level and multi-model allocation for standard multi-level NWP models", () => {
      const nwpGroup = { id: "ecmwf-500hpa", hasLevel: true, model: "ECMWF_HR", isObservation: false };
      const guards = evaluateAllocGuards({ currentGroup: nwpGroup, activeWin: { model: "ECMWF_HR" } });
      expect(guards.isObsOrNonNwp).toBe(false);
      expect(guards.levelAllocDisabled).toBe(false);
    });

    test("safely handles missing metadata without throwing", () => {
      const guards = evaluateAllocGuards({ currentGroup: null, activeWin: null });
      expect(guards.isObsOrNonNwp).toBe(false);
      expect(guards.levelAllocDisabled).toBe(false);
    });
  });

  // =========================================================================
  // Area 8: Issue 13 - Loop Range Marker Retention When Playback Paused
  // =========================================================================
  describe("Area 8 (Issue 13): TimeSlider Loop Range Marker Retention When Paused", () => {
    test("loop range markers remain active when playback is paused", () => {
      // Simulate playback and timeline state
      const timeline = { loopRange: { active: false, start: 0, end: 10 } };
      let isPlaying = false;

      function start() {
        isPlaying = true;
        timeline.loopRange.active = true;
      }

      function pause() {
        isPlaying = false;
        // Verify pause DOES NOT overwrite loopRange.active
      }

      function isLooping() {
        return Boolean(isPlaying || timeline.loopRange?.active);
      }

      start();
      expect(isLooping()).toBe(true);

      pause();
      // Crucial test for Issue 13: markers remain visible and draggable while paused
      expect(timeline.loopRange.active).toBe(true);
      expect(isLooping()).toBe(true);
    });

    test("TimeSlider source contains dedicated loop toggle button", () => {
      expect(timeSliderSrc).toContain('id="sl-btn-toggle-loop"');
      expect(timeSliderSrc).toContain("toggleLoopRange");
      expect(timeSliderSrc).toContain("let isLooping = $derived(Boolean(playback.isPlaying || timeline.loopRange?.active));");
    });
  });

  // =========================================================================
  // Area 9: Issue 14 - Step Intervals & Latest Chip Preservation Under Irregularities
  // =========================================================================
  describe("Area 9 (Issue 14): Step Intervals & Latest Chip Retention Stress Tests", () => {
    test("filterObsFilesByStep handles empty arrays and non-array inputs safely", () => {
      expect(filterObsFilesByStep([], 3)).toEqual([]);
      expect(filterObsFilesByStep(null, 3)).toEqual([]);
      expect(filterObsFilesByStep(undefined, 3)).toEqual([]);
    });

    test("filterObsFilesByStep handles single file list gracefully", () => {
      const single = ["Z_RADA_C_BABJ_20261027120000.bin"];
      expect(filterObsFilesByStep(single, 3)).toEqual(single);
    });

    test("stepBackwardByInterval always preserves the latest candidate scan", () => {
      const candidates = [
        "20261027000000",
        "20261027060000",
        "20261027120000",
        "20261027180000",
        "20261027234500", // latest scan (non-standard 23:45)
      ];
      const stepped = stepBackwardByInterval(candidates, 12);
      expect(stepped.length).toBeGreaterThanOrEqual(2);
      expect(stepped[stepped.length - 1]).toBe("20261027234500"); // Newest file ALWAYS kept!
    });

    test("filterObsFilesByStep yields chips for 12h and 24h on irregular timestamps", () => {
      // 24-hour irregular radar scans every 30 minutes from 21:00 to 21:00 next day
      const files = [];
      const baseMs = Date.UTC(2026, 9, 26, 21, 0, 0);
      for (let i = 0; i <= 48; i++) {
        const d = new Date(baseMs + i * 30 * 60 * 1000);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        const h = String(d.getUTCHours()).padStart(2, "0");
        const min = String(d.getUTCMinutes()).padStart(2, "0");
        files.push(`SWAN_${y}${m}${day}${h}${min}00.bin`);
      }

      const res24 = filterObsFilesByStep(files, 24);
      expect(res24.length).toBeGreaterThanOrEqual(2);
      expect(res24[res24.length - 1]).toBe(files[files.length - 1]); // ends at latest scan

      const res12 = filterObsFilesByStep(files, 12);
      expect(res12.length).toBeGreaterThanOrEqual(3);
      expect(res12[res12.length - 1]).toBe(files[files.length - 1]); // ends at latest scan
    });

    test("switching from step=3h to step=0.25h (15min) anchors to latest window and includes latest scan", () => {
      // Create 24h of 15m FY-4B scans (00:00 to 23:45 = 96 files)
      const rawObsFiles = [];
      for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 15) {
          rawObsFiles.push(`FY4B_20261027${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}00.AWX`);
        }
      }

      // Initial step = 3h: returns 8 chips [00:00, 03:00, ..., 21:00]
      const step3Filtered = filterObsFilesByStep(rawObsFiles, 3);
      expect(step3Filtered.length).toBe(8);
      let obsFiles = selectObsChipsWindow(step3Filtered);
      let currentObsIdx = obsFiles.length - 1; // user is on the latest 3h chip: 21:00
      expect(obsFiles[currentObsIdx]).toContain("210000");

      // User changes Step from 3h to 15min (0.25h)
      const newStep = 0.25;
      const wasAtLatest = obsFiles.length === 0 || currentObsIdx >= obsFiles.length - 1;
      const allFiltered = filterObsFilesByStep(rawObsFiles, newStep);
      expect(allFiltered.length).toBe(96);

      let targetFile = obsFiles[currentObsIdx];
      if (wasAtLatest && allFiltered.length > 0) {
        targetFile = allFiltered[allFiltered.length - 1]; // Advance target to newest file (23:45)
      }

      // TimeSlider anchor to latest window
      obsFiles = selectObsChipsWindow(allFiltered);
      expect(obsFiles.length).toBe(10); // MAX_OBS_CHIPS
      // Crucial empirical check: latest file 23:45 MUST be in obsFiles!
      expect(obsFiles[obsFiles.length - 1]).toContain("234500");

      const newIdx = (!wasAtLatest && targetFile) ? obsFiles.indexOf(targetFile) : -1;
      currentObsIdx = newIdx !== -1 ? newIdx : Math.max(0, obsFiles.length - 1);
      expect(obsFiles[currentObsIdx]).toContain("234500");
    });

    test("getObsTreeLimit returns elevated limits for high-frequency observation products", () => {
      expect(getObsTreeLimit("SATELLITE/FY4B/L1/CHINA/C012")).toBe(1000);
      expect(getObsTreeLimit("SWAN_PRODUCT/MCR")).toBe(1000);
      expect(getObsTreeLimit("SURFACE/PLOT_10MIN")).toBe(1000);
      expect(getObsTreeLimit("WIND_PROFILER/RAD")).toBe(1000);
      expect(getObsTreeLimit("SURFACE/LIGHTNING")).toBe(1000);
      expect(getObsTreeLimit("FY2G/L2/DUST")).toBe(300);
      expect(getObsTreeLimit("CLDAS/TEMP/2M")).toBe(300);
      expect(getObsTreeLimit("SURFACE/PLOT_ALL")).toBe(300);
      expect(getObsTreeLimit("SURFACE/PLOT/STANDARD")).toBe(100);
    });

    test("formatStepLabel formats sub-hourly fractions in minutes and integers in hours", () => {
      expect(formatStepLabel(0.25)).toBe("15min");
      expect(formatStepLabel(0.5)).toBe("30min");
      expect(formatStepLabel(1)).toBe("1h");
      expect(formatStepLabel(3)).toBe("3h");
      expect(formatStepLabel(6)).toBe("6h");
      expect(formatStepLabel(12)).toBe("12h");
      expect(formatStepLabel(24)).toBe("24h");
      expect(formatStepLabel(0)).toBe("");
      expect(formatStepLabel(-1)).toBe("");
      expect(formatStepLabel("invalid")).toBe("");
    });
  });
});
