// bootstrap.js - Application bootstrap, window synchronization, and UI events binding
import { getActiveMap } from "../map/mapInstance.js";
import { initNavBar, setNavBarLevel, setNavBarPreset } from "../ui/navBar.js";
import { initCatalogDrawer } from "../ui/catalogDrawer.js";
import { initLayerControl, syncLayerControlForWindow, getLayersForWindow } from "../ui/layerControl.js";
import { initTimeSlider, setTimelineMode, setTimeSliderVisible, setActiveWindowProvider, step as timeSliderStep } from "../ui/timeSlider.js";
import { handleLayerAction, triggerVortDivOverlay } from "../ui/layerActions.js";
import { initTooltip } from "../ui/tooltip.js";
import { stopWindAnimation, removeGridWindBarbs } from "../layers/windLayer.js";
import { removeRasterLayer } from "../layers/rasterLayer.js";
import { syncLegendForWindow } from "../ui/legend.js";
import { initKeyboardShortcuts } from "../ui/keyboardShortcuts.js";
import { initConfigEditor, openConfigTab } from "../ui/configEditor.js";
import { initFullscreenControl } from "../ui/fullscreenControl.js";
import { appState } from "../store/appState.js";
import { loadPresetGroups } from "../config/presets.js";
import { resolveForecastCycles, syncObservationTimeline } from "../utils/timelineSync.js";
import {
  initTabWindowManager,
  getActiveWindow,
  getWindowById,
  toggleTabsAndSplit,
  updateWindowTitle,
  setWindowHeaderPreset,
  setWindowHeaderLevel,
} from "../ui/tabWindowManager.js";
import { loadWeatherField } from "../services/weatherLoader.js";
import { loadUpperAirComposite, loadObservationProduct } from "../services/derivedContours.js";
import { loadPresetGroup, clearAllWeatherLayersFromMap, reloadConfiguration } from "../services/presetLoader.js";
import { changeVerticalLevel } from "../services/levelController.js";
import { loadTLogPLayer, tlogpController } from "../layers/tlogp/tlogpLayer.js";
import { timeHeightController } from "../layers/timeheight/timeHeightLayer.js";
import { lineHeightController, hovmollerController } from "../layers/lineprofile/lineProfileLayer.js";

// Deep-clone a preset group so per-window ✕/visibility edits never mutate the
// global PRESET_GROUPS entry (navBar/windowFocus pass live references via find()).
// Without this, handleRemoveAction-style splices permanently shrink the shared
// preset and later Load Data iterates a mutated array → "load not working".
function clonePresetGroup(group) {
  if (!group) return group;
  try {
    if (typeof structuredClone === "function") return structuredClone(group);
  } catch { /* fall through to JSON clone */ }
  return JSON.parse(JSON.stringify(group));
}

export function getMap() {
  const win = getActiveWindow();
  return (win && win.map) || getActiveMap();
}

export async function bootstrap() {
  console.log("[MICAPS-Web] Initializing meteorological workstation...");

  try {
    await loadPresetGroups();
  } catch (error) {
    console.error("[Config] Initial preset configuration load failed:", error);
  }

  // Inject active-window provider so playback/prefetch resolve the window
  // without dynamic-importing tabWindowManager (breaks tabs<->timeline cycle).
  setActiveWindowProvider(() => getActiveWindow());

  // ── Tab / Window Manager ─────────────────────────────────────────────────
  const firstTab = initTabWindowManager({
    onWindowFocus: (win) => {
      if (!win) return;
      setNavBarPreset(win.activeGroup?.id || "");
      if (win.level) setNavBarLevel(win.level);

      let winTitle = "";
      if (win.activeGroup) {
        winTitle = `W${win.winIdx + 1}: ${win.activeGroup.name}`;
      } else if (win.model && win.element) {
        const isUpper = win.model === "UPPER_AIR" || win.element.includes("UPPER");
        const name = win.isObservation
          ? (isUpper ? `${win.level || 500} hPa Sounding (${win.model})` : `${win.element} (${win.model})`)
          : `${win.level ? `${win.level} hPa ` : ""}${win.element} (${win.model})`;
        winTitle = `W${win.winIdx + 1}: ${name}`;
      }

      // Synchronously update layer panel and legends for focused window
      syncLayerControlForWindow(win);
      syncLegendForWindow(win);

      const hasData = Boolean(win.activeGroup || win.model || win.isObservation || win.gridData || win.obsTime);
      if (!hasData) {
        setTimeSliderVisible(false);
        try { timeHeightController.hide(win.map, win); } catch {}
        try { lineHeightController.hide(win.map, win); } catch {}
        try { hovmollerController.hide(win.map, win); } catch {}
        try { tlogpController.hide(win.map, win); } catch {}
        return;
      }

      const thLayer = timeHeightController._findLayer(win);
      const isTimeHeight = Boolean(
        win.activeGroup?.id === "composite-ec-timeheight" ||
        thLayer ||
        win.activeGroup?.layers?.some((l) => l.type === "timeheight" || l.id === "ec-timeheight-diagram") ||
        win.layers?.some((l) => l.type === "timeheight" || l.id === "ec-timeheight-diagram")
      );
      const hasTimeHeight = isTimeHeight && (thLayer ? thLayer.visible !== false : true);

      const lhLayer = lineHeightController._findLayer(win);
      const isLineHeight = Boolean(
        win.activeGroup?.id === "composite-ec-lineheight" ||
        lhLayer ||
        win.activeGroup?.layers?.some((l) => l.type === "lineheight" || l.id === "ec-lineheight-diagram") ||
        win.layers?.some((l) => l.type === "lineheight" || l.id === "ec-lineheight-diagram")
      );
      const hasLineHeight = isLineHeight && (lhLayer ? lhLayer.visible !== false : true);

      const hovLayer = hovmollerController._findLayer(win);
      const isHovmoller = Boolean(
        win.activeGroup?.id === "composite-ec-hovmoller" ||
        hovLayer ||
        win.activeGroup?.layers?.some((l) => l.type === "hovmoller" || l.id === "ec-hovmoller-diagram") ||
        win.layers?.some((l) => l.type === "hovmoller" || l.id === "ec-hovmoller-diagram")
      );
      const hasHovmoller = isHovmoller && (hovLayer ? hovLayer.visible !== false : true);

      const tlogpLayer = tlogpController._findTLogPLayer(win);
      const isTLogP = Boolean(
        win.activeGroup?.id === "composite-tlogp" ||
        tlogpLayer ||
        win.activeGroup?.layers?.some((l) => l.element === "TLOGP" || l.type === "tlogp") ||
        win.element === "TLOGP"
      );
      const hasTLogP = isTLogP && (tlogpLayer ? tlogpLayer.visible !== false : true);

      if (isTimeHeight) {
        if (hasTimeHeight) {
          timeHeightController.show(win.map, win);
        } else {
          timeHeightController.hide(win.map, win);
        }
        try { lineHeightController.hide(win.map, win); } catch {}
        try { hovmollerController.hide(win.map, win); } catch {}
        tlogpController.hide(win.map, win);
        setTimeSliderVisible(false);
        return;
      }

      if (isHovmoller) {
        if (hasHovmoller) {
          hovmollerController.show(win.map, win);
        } else {
          hovmollerController.hide(win.map, win);
        }
        try { timeHeightController.hide(win.map, win); } catch {}
        try { lineHeightController.hide(win.map, win); } catch {}
        tlogpController.hide(win.map, win);
        setTimeSliderVisible(false);
        return;
      }

      if (isLineHeight) {
        if (hasLineHeight) {
          lineHeightController.show(win.map, win);
        } else {
          lineHeightController.hide(win.map, win);
        }
        try { timeHeightController.hide(win.map, win); } catch {}
        try { hovmollerController.hide(win.map, win); } catch {}
        tlogpController.hide(win.map, win);
        // Slider stays VISIBLE: fall through to NWP timeline setup below
      } else if (hasTLogP) {
        try { timeHeightController.hide(); } catch {}
        try { lineHeightController.hide(); } catch {}
        try { hovmollerController.hide(); } catch {}
        tlogpController.show(win.map, win);
      } else {
        try { timeHeightController.hide(); } catch {}
        try { lineHeightController.hide(); } catch {}
        try { hovmollerController.hide(); } catch {}
        tlogpController.hide(win.map, win);
      }

      // When a non-observation preset group is active, never treat the window as obs
      // even if win.model is stale ("SURFACE" / "UPPER_AIR" from a prior catalog load).
      const hasNwpGroup = Boolean(win.activeGroup && !win.activeGroup.isObservation);
      const isObs = !hasNwpGroup && Boolean(win.isObservation || win.activeGroup?.isObservation || win.model === "SURFACE" || win.model === "UPPER_AIR");
      if (isObs) {
        const isTLogP = win.activeGroup?.id === "composite-tlogp" || win.activeGroup?.layers?.some((l) => l.element === "TLOGP") || win.element === "TLOGP";
        const obsPath = isTLogP
          ? "UPPER_AIR/TLOGP"
          : win.model === "UPPER_AIR"
            ? `UPPER_AIR/${win.element || "PLOT"}/${win.level || 500}`
            : (win.model === "SURFACE" ? `SURFACE/${win.element || "PLOT_GLOBAL_3H"}` : "SURFACE/PLOT_GLOBAL_3H");
        syncObservationTimeline(obsPath, win.obsTime, winTitle, win).then((latestFile) => {
          if (getActiveWindow() === win) {
            win.obsTime = latestFile;
            updateWindowTitle(win);
          }
        });
      } else {
        const pLayer = win.activeGroup?.layers?.find((l) => l.type === "contour" || l.type === "wind" || l.type === "lineheight" || l.type === "hovmoller");
        // Line-profile groups step 12h (each G1 chip = a 40-blob reload; matches presetLoader)
        const isLineProfile = pLayer?.type === "lineheight" || pLayer?.type === "hovmoller";
        resolveForecastCycles(pLayer?.model || win.model || "ECMWF_HR", pLayer?.element || win.element || "TMP", win.level || 500).then((cycles) => {
          if (getActiveWindow() === win) {
            if (!win.forecastCycle || !cycles.includes(win.forecastCycle)) {
              win.forecastCycle = cycles[0];
            }
            setTimelineMode("nwp", { period: win.period ?? 24, winTitle, initCycle: win.forecastCycle, cycles, stepLength: win.stepLength || (isLineProfile ? 12 : 6) });
            updateWindowTitle(win);
          }
        });
      }
    },
    onWindowGroupChange: async (win, group) => {
      if (!win.map || !group) return;
      // Per-window copy: never hold the live PRESET_GROUPS reference.
      group = clonePresetGroup(group);
      win.activeGroup = group;
      win.isObservation = Boolean(group.isObservation);
      win.forecastCycle = null;
      // Clear stale catalog-mode model/obsTime so onWindowFocus does not misdetect as obs
      if (!group.isObservation) {
        win.model = null;
        win.element = null;
        win.obsTime = null;
      }
      if (group.hasLevel === false) {
        win.level = null;
      } else if (group.defaultLevel) {
        win.level = group.defaultLevel;
      }

      const winTitle = `W${win.winIdx + 1}: ${group.name}`;
      updateWindowTitle(win, group.name);
      setWindowHeaderPreset(win, group.id);
      const isTimeHeight = group.id === "composite-ec-timeheight" || group.layers?.some((l) => l.type === "timeheight");
      const isHovmoller = group.id === "composite-ec-hovmoller" || group.layers?.some((l) => l.type === "hovmoller");
      if (win.isObservation) {
        const isTLogP = group.id === "composite-tlogp" || group.layers?.some((l) => l.element === "TLOGP");
        const effectiveLevel = win.level || group.defaultLevel || 500;
        const obsPath = isTLogP
          ? "UPPER_AIR/TLOGP"
          : (group.id?.includes("upper") ? `UPPER_AIR/PLOT/${effectiveLevel}` : "SURFACE/PLOT_GLOBAL_3H");
        const latestFile = await syncObservationTimeline(obsPath, win.obsTime, winTitle, win);
        win.obsTime = latestFile;
        updateWindowTitle(win);
      } else if (isTimeHeight || isHovmoller) {
        if (getActiveWindow() === win) {
          setTimeSliderVisible(false);
        }
      } else {
        const pLayer = group.layers?.find((l) => l.type === "contour" || l.type === "wind");
        const cycles = await resolveForecastCycles(pLayer?.model || win.model || "ECMWF_HR", pLayer?.element || win.element || "TMP", win.level || 500);
        win.forecastCycle = cycles[0];
        updateWindowTitle(win);
        const nwpPayload = { period: win.period ?? 24, winTitle, initCycle: win.forecastCycle, cycles, stepLength: win.stepLength || 6 };
        if (getActiveWindow() === win) {
          setTimelineMode("nwp", nwpPayload);
        } else {
          win._pendingNwp = nwpPayload;
        }
      }
      await loadPresetGroup(win.map, group, win.period, null, win);
    },
    onWindowLevelChange: async (win, level) => {
      if (!win.map) return;
      win.level = level;
      if (win.activeGroup) {
        await changeVerticalLevel(win.map, 0, level, win);
      } else if (win.model && win.element) {
        await loadWeatherField(win.map, win.model, win.element, level, win.period, null, win);
      }
    },
    onWindowInit: async (win) => {
      // Lazy-init maps in split mode when style loads
      if (!win.map) return;
      const onLoad = async () => {
        if (win.activeGroup) {
          await loadPresetGroup(win.map, win.activeGroup, win.period, null, win);
        }
      };
      if (win.map.isStyleLoaded() || win.map.loaded()) {
        await onLoad();
      } else {
        win.map.once("load", onLoad);
      }
    },
  });

  // ── Navbar ───────────────────────────────────────────────────────────────
  initNavBar("navbar", {
    onOpenConfig: () => openConfigTab(),
    onConfigReload: reloadConfiguration,
    onPresetSelect: () => {
      // Intentionally do not modify active window title or state before data is actually loaded via onLoadData
    },
    onLevelSelect: () => {
      // Intentionally do not modify active window state before data is actually loaded via onLoadData
    },
    onLoadData: async (group, overrideLevel = null) => {
      const win = getActiveWindow();
      const map = win?.map || getActiveMap();
      if (!win || !map || !group) return;
      // Per-window copy: Load Data must start from a pristine definition so a
      // previously ✕-removed base layer (e.g. ECMWF-HR HGT) comes back.
      group = clonePresetGroup(group);
      win.activeGroup = group;
      win.isObservation = Boolean(group.isObservation);
      win.forecastCycle = null;
      // Clear stale catalog-mode model/obsTime so onWindowFocus does not misdetect as obs
      if (!group.isObservation) {
        win.model = null;
        win.element = null;
        win.obsTime = null;
      }
      if (group.hasLevel === false) {
        win.level = null;
      } else if (overrideLevel !== null) {
        win.level = overrideLevel;
      }

      const effectiveLevel = overrideLevel || win.level || group.defaultLevel || 500;
      const winTitle = `W${win.winIdx + 1}: ${group.name}`;
      updateWindowTitle(win, group.name);
      setWindowHeaderPreset(win, group.id);
      const isTimeHeight = group.id === "composite-ec-timeheight" || group.layers?.some((l) => l.type === "timeheight");
      const isHovmoller = group.id === "composite-ec-hovmoller" || group.layers?.some((l) => l.type === "hovmoller");
      if (win.isObservation) {
        const isTLogP = group.id === "composite-tlogp" || group.layers?.some((l) => l.element === "TLOGP");
        const obsPath = isTLogP
          ? "UPPER_AIR/TLOGP"
          : (group.id?.includes("upper") ? `UPPER_AIR/PLOT/${effectiveLevel}` : "SURFACE/PLOT_GLOBAL_3H");
        const latestFile = await syncObservationTimeline(obsPath, win.obsTime, winTitle, win);
        win.obsTime = latestFile;
        updateWindowTitle(win);
      } else if (isTimeHeight || isHovmoller) {
        if (getActiveWindow() === win) {
          setTimeSliderVisible(false);
        }
      } else {
        const pLayer = group.layers?.find((l) => l.type === "contour" || l.type === "wind");
        const cycles = await resolveForecastCycles(pLayer?.model || win.model || "ECMWF_HR", pLayer?.element || win.element || "TMP", win.level || 500);
        win.forecastCycle = cycles[0];
        updateWindowTitle(win);
        const nwpPayload = { period: win.period ?? 24, winTitle, initCycle: win.forecastCycle, cycles, stepLength: win.stepLength || 6 };
        if (getActiveWindow() === win) {
          setTimelineMode("nwp", nwpPayload);
        } else {
          win._pendingNwp = nwpPayload;
        }
      }
      await loadPresetGroup(map, group, win.period, overrideLevel, win);
    },
  });

  initConfigEditor(reloadConfiguration);
  initTooltip("tooltip");
  initFullscreenControl("btn-fullscreen-toggle");
  initKeyboardShortcuts({
    onPeriodStep: (dir) => {
      try {
        const win = getActiveWindow();
        if (win && hovmollerController.isActive(win)) return; // Group 2 swallows ←/→
      } catch {}
      return timeSliderStep(dir, { source: dir < 0 ? "btn-prev" : "btn-next", directions: dir < 0 ? ["prev"] : ["next"] });
    },
    onLevelStep: async (dir) => {
      try {
        const win = getActiveWindow();
        // Both line-profile diagrams own their vertical axis; Up/Down never touch win.level here
        if (win && (lineHeightController.isActive(win) || hovmollerController.isActive(win))) return;
      } catch {}
      const m = getMap();
      if (!m) return;
      await changeVerticalLevel(m, dir);
    },
    onToggleSplit: () => toggleTabsAndSplit(),
    onTogglePlay: () => {
      const btnPlay = document.getElementById("btn-play");
      btnPlay?.click();
    },
  });

  initCatalogDrawer("catalog-drawer", async ({ model, element, level, period, obsTime, isObservation }) => {
    const map = getMap(), win = getActiveWindow();
    if (!win || !map) return;
    const upd = { activeGroup: null, model, element, level: level !== null ? level : win.level, period: period !== null ? period : win.period, obsTime, isObservation, forecastCycle: null };
    Object.assign(win, upd);
    appState.update(upd);
    setNavBarPreset("");

    const isUpper = model === "UPPER_AIR" || (element && element.includes("UPPER"));
    const catalogTitle = isObservation ? (isUpper ? `${win.level || 500} hPa Sounding (${model})` : `${element} (${model})`) : `${win.level ? `${win.level} hPa ` : ""}${element} (${model})`;

    updateWindowTitle(win, catalogTitle);
    setWindowHeaderPreset(win, "");
    if (win.level) { setWindowHeaderLevel(win, win.level); setNavBarLevel(win.level); }

    const winBannerTitle = `W${win.winIdx + 1}: ${catalogTitle}`;
    clearAllWeatherLayersFromMap(map, win, { resetVisibility: true });

    if (isObservation) {
      const isTLogP = element === "TLOGP";
      const obsPath = isTLogP
        ? "UPPER_AIR/TLOGP"
        : (model === "SURFACE" ? `SURFACE/${element}` : (model === "UPPER_AIR" ? `UPPER_AIR/${element}/${win.level || 500}` : `${model}/${element}`));
      const latestFile = await syncObservationTimeline(obsPath, obsTime || win.obsTime, winBannerTitle);
      win.obsTime = latestFile;
      updateWindowTitle(win);
      if (isTLogP) {
        win.level = null;
        await loadObservationProduct(map, "UPPER_AIR", "TLOGP", null, latestFile, win, "UPPER_AIR/TLOGP", null, "upperair-tlogp-stations");
        await loadTLogPLayer(map, {
          id: "upperair-tlogp-diagram",
          name: "T-lnP Sounding Diagram",
          type: "tlogp",
          model: "UPPER_AIR",
          element: "TLOGP",
          visible: true,
          removable: true,
        }, null, null, win);
      } else if (model === "UPPER_AIR") {
        await loadUpperAirComposite(map, win.level || 500, latestFile, win);
      } else {
        await loadObservationProduct(map, model, element, win.level, latestFile, win);
      }
    } else {
      const dataElement = (element === "VOR" || element === "DIV") ? "WIND" : element;
      const cycles = await resolveForecastCycles(model, dataElement, win.level || 500);
      win.forecastCycle = cycles[0];
      updateWindowTitle(win);
      setTimelineMode("nwp", { period: win.period ?? 24, winTitle: winBannerTitle, initCycle: win.forecastCycle, cycles, stepLength: win.stepLength || 6 });
      await loadWeatherField(map, model, element, win.level, win.period, null, win);
    }
    if (win?.layerSnapshots) win.layerSnapshots = null;
  });

  // ── Layer Control ────────────────────────────────────────────────────────
  initLayerControl("layer-control", (action, layerId, value, layer, winId) => {
    const win = (winId ? getWindowById(winId) : null) || getActiveWindow();
    handleLayerAction(win?.map || getMap(), action, layerId, value, layer, win);
  });

  // ── Time Slider ──────────────────────────────────────────────────────────
  initTimeSlider("timeslider-container", async (data) => {
    const win = getActiveWindow();
    const map = getMap();
    if (!win || !map) return;
    if (typeof data === "object" && data !== null && data.stepLength) {
      win.stepLength = data.stepLength;
    }
    if (typeof data === "object" && data !== null && data.isObs) {
      win.prefetchDirections = data.prefetchDirections || null;
      win.loadSeq = (win.loadSeq || 0) + 1;
      const expectedSeq = win.loadSeq;
      win.obsTime = data.file;
      if (win._obsTimeline) {
        win._obsTimeline.file = data.file;
        if (data.stepLength) win._obsTimeline.stepLength = data.stepLength;
      }
      updateWindowTitle(win);
      if (!win.layerSnapshots) {
        const prevLayers = getLayersForWindow(win);
        if (prevLayers && prevLayers.length > 0) {
          win.layerSnapshots = prevLayers.map((l) => ({
            id: l.id,
            type: l.type,
            model: l.model,
            element: l.element,
            visible: l.visible !== false,
            config: { ...(l.config || {}) },
            color: l.color,
            colormap: l.colormap,
          }));
        }
      }
      const prevContours = getLayersForWindow(win)
        .filter((l) => l.type === "contour" && (l.model === "SURFACE" || l.model === "UPPER_AIR"))
        .map((l) => ({
          id: l.id,
          model: l.model,
          element: l.element,
          level: l.level,
          config: { ...(l.config || {}) },
          derivedFrom: l.derivedFrom,
          visible: l.visible !== false,
          colormap: l.colormap,
        }));
      win.derivedContourSnapshots = prevContours;

      // Stop previous station wind animation, wind barbs, and raster layers before reload
      stopWindAnimation(map);
      removeGridWindBarbs(map);
      removeRasterLayer(map);

      if (win.activeGroup) {
        await loadPresetGroup(map, win.activeGroup, win.period, win.level, win, true, expectedSeq);
      } else {
        const model = win.model || "SURFACE";
        const element = win.element || "PLOT_GLOBAL_3H";
        const level = win.level;
        const isTLogP = element === "TLOGP" || win.activeGroup?.id === "composite-tlogp";
        if (isTLogP) {
          await loadObservationProduct(map, "UPPER_AIR", "TLOGP", null, data.file, win, "UPPER_AIR/TLOGP", expectedSeq, "upperair-tlogp-stations");
          if (tlogpController.isActive()) {
            await tlogpController.updateCycle(data.file, win, map);
          }
        } else if (model === "UPPER_AIR") {
          await loadUpperAirComposite(map, level || 500, data.file, win, expectedSeq);
        } else {
          await loadObservationProduct(map, model, element, level, data.file, win, null, expectedSeq);
        }
      }
    } else if (typeof data === "object" && data !== null && data.isInitChange) {
      win.forecastCycle = data.initCycle;
      const period = typeof data.period === "number" ? data.period : (win.period ?? 24);
      win.period = period;
      updateWindowTitle(win);
      clearAllWeatherLayersFromMap(map, win, { resetVisibility: true });
      const activeGroup = win.activeGroup;
      if (activeGroup) {
        await loadPresetGroup(map, activeGroup, period, win.level, win, false);
      } else if (win.model && win.element) {
        await loadWeatherField(map, win.model, win.element, win.level, period, null, win, false);
        if (win?.layerSnapshots) win.layerSnapshots = null;
      }
    } else {
      let period = win.period ?? 24;
      if (typeof data === "number") {
        period = data;
        win.prefetchDirections = null;
      } else if (typeof data === "object" && data !== null) {
        if (typeof data.period === "number") {
          period = data.period;
        } else if (typeof data.valueOf === "function" && typeof data.valueOf() === "number") {
          period = data.valueOf();
        }
        win.prefetchDirections = data.prefetchDirections || null;
      } else {
        win.prefetchDirections = null;
      }
      win.loadSeq = (win.loadSeq || 0) + 1;
      const expectedSeq = win.loadSeq;
      win.period = period;
      if (win._nwpTimeline) {
        win._nwpTimeline.period = period;
      }
      appState.set("period", period);
      updateWindowTitle(win);

      if (!win.layerSnapshots) {
        const prevLayers = getLayersForWindow(win);
        if (prevLayers && prevLayers.length > 0) {
          win.layerSnapshots = prevLayers.map((l) => ({
            id: l.id,
            type: l.type,
            model: l.model,
            element: l.element,
            visible: l.visible !== false,
            config: { ...(l.config || {}) },
            color: l.color,
            colormap: l.colormap,
          }));
        }
      }

      const activeGroup = win.activeGroup;
      if (activeGroup) {
        await loadPresetGroup(map, activeGroup, period, win.level, win, true, expectedSeq);
      } else if (win.model && win.element) {
        await loadWeatherField(map, win.model, win.element, win.level, period, null, win, true, expectedSeq);
        if (win && expectedSeq !== null && expectedSeq !== undefined && win.loadSeq !== expectedSeq) {
          return;
        }
        const extraLayers = getLayersForWindow(win).filter(
          (l) => l.type === "contour" && (l.element === "VOR" || l.element === "DIV" || (l.element === "WIND" && l.derivedFrom)) && l.element !== win.element
        );
        for (const extra of extraLayers) {
          extra.gridData = null;
          await triggerVortDivOverlay(map, extra, win);
          if (win && expectedSeq !== null && expectedSeq !== undefined && win.loadSeq !== expectedSeq) {
            return;
          }
        }
      }
    }
  });

  // ── Boot First Window Map ────────────────────────────────────────────────
  const firstWin = firstTab?.windows[0];
  const map = firstWin?.map;

  const onReady = () => {
    console.log("[Main] Map ready, workstation initialized with clean base canvas.");
    window.__WEATHER_FIELD_LOADED__ = false;
  };

  if (map) {
    if (map.isStyleLoaded() || map.loaded()) {
      onReady();
    } else {
      map.once("load", onReady);
    }
  }
}
