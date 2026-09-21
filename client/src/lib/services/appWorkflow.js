// appWorkflow.js - Pure application workflow orchestrator helpers for window presets, timeline visibility, and multi-window isolation
import { uiState } from "../stores/uiCore.js";
import { createTimelineState } from "../stores/timelineCore.js";

/**
 * Determines whether a preset group requires hiding the forecast timeline
 * (e.g. specialized 2D profile panels like Time-Height or Hovmöller).
 */
export function shouldHideTimelineForGroup(group) {
  if (!group) return false;
  return Boolean(
    group.id === "composite-ec-timeheight" ||
    group.id === "composite-ec-hovmoller" ||
    group.layers?.some((l) => l.type === "timeheight" || l.type === "hovmoller")
  );
}

/**
 * Applies a preset group's metadata, levels, and timeline mode to a window object.
 * Synchronizes uiState.timelineVisible according to Section 1.5 specifications.
 */
export function applyPresetToWindow(win, group, overrideLevel = null, timelinesMap = null) {
  if (!win || !group) return null;
  const isSpecialProfile = shouldHideTimelineForGroup(group);

  const groupCopy = typeof structuredClone === "function" ? structuredClone(group) : JSON.parse(JSON.stringify(group));
  win.activeGroup = groupCopy;
  win.isObservation = Boolean(groupCopy.isObservation);
  win.forecastCycle = null;
  if (!groupCopy.isObservation) {
    win.model = null;
    win.element = null;
    win.obsTime = null;
  }
  if (groupCopy.hasLevel === false) {
    win.level = null;
  } else if (overrideLevel !== null) {
    win.level = overrideLevel;
  }
  win.title = `W${(win.winIdx ?? 0) + 1}: ${groupCopy.name || groupCopy.id}`;

  // Manage UI timeline visibility
  uiState.timelineVisible = !isSpecialProfile;

  // Manage timeline state per window
  if (timelinesMap) {
    let tl = typeof timelinesMap.get === "function" ? timelinesMap.get(win.id) : timelinesMap[win.id];
    if (!tl) {
      tl = createTimelineState(win.id);
      if (typeof timelinesMap.set === "function") {
        timelinesMap.set(win.id, tl);
      } else {
        timelinesMap[win.id] = tl;
      }
    }
    if (win.isObservation) {
      tl.currentMode = "obs";
    } else if (!isSpecialProfile) {
      tl.currentMode = "nwp";
    }
  }

  return win;
}

/**
 * Pure step calculator for advancing or reversing timeline steps in an isolated window timeline.
 */
export function stepWindowTimeline(tl, delta) {
  if (!tl) return null;
  if (tl.currentMode === "obs") {
    if (!tl.obsFiles || tl.obsFiles.length === 0) return null;
    tl.currentObsIdx = (tl.currentObsIdx + delta + tl.obsFiles.length) % tl.obsFiles.length;
    return {
      isObs: true,
      file: tl.obsFiles[tl.currentObsIdx],
      _seq: ++tl.periodStepSeq,
    };
  } else {
    if (!tl.discretePeriods || tl.discretePeriods.length === 0) return null;
    tl.currentPeriodIdx = (tl.currentPeriodIdx + delta + tl.discretePeriods.length) % tl.discretePeriods.length;
    return {
      isObs: false,
      period: tl.discretePeriods[tl.currentPeriodIdx],
      cycle: tl.currentInitCycle,
      _seq: ++tl.periodStepSeq,
    };
  }
}

/**
 * Applies a single catalog product to a window and loads relevant weather layers.
 */
export async function applyProductToWindow(win, map, product, services = {}) {
  if (!win) return null;
  const { model, element, level, period, obsTime, isObservation } = product;
  Object.assign(win, {
    activeGroup: null,
    model,
    element,
    level: level !== null ? level : win.level,
    period: period !== null ? period : win.period,
    obsTime,
    isObservation: Boolean(isObservation),
    forecastCycle: null,
  });

  const isTLogP = element === "TLOGP";
  const isUpper = !isTLogP && (model === "UPPER_AIR" || (element && element.includes("UPPER")));
  const title = isObservation
    ? (isTLogP ? `${element} (${model})` : (isUpper ? `${win.level || 500} hPa Sounding (${model})` : `${element} (${model})`))
    : `${win.level ? `${win.level} hPa ` : ""}${element} (${model})`;
  win.title = `W${(win.winIdx ?? 0) + 1}: ${title}`;
  uiState.timelineVisible = true;

  if (!map) return win;

  if (typeof services.clearAllWeatherLayersFromMap === "function") {
    services.clearAllWeatherLayersFromMap(map, win, { resetVisibility: true });
  }

  if (isObservation) {
    const isTLogP = element === "TLOGP";
    const obsPath = isTLogP
      ? "UPPER_AIR/TLOGP"
      : (model === "SURFACE" ? `SURFACE/${element}` : (model === "UPPER_AIR" ? `UPPER_AIR/${element}/${win.level || 500}` : `${model}/${element}`));

    let latestFile = obsTime || win.obsTime;
    if (typeof services.syncObservationTimeline === "function") {
      latestFile = await services.syncObservationTimeline(obsPath, latestFile, win.title, win);
    }
    win.obsTime = latestFile;

    if (typeof services.getOrCreateTimeline === "function") {
      const tl = services.getOrCreateTimeline(win.id);
      if (tl) tl.currentMode = "obs";
    }

    if (isTLogP) {
      win.level = null;
      if (typeof services.loadObservationProduct === "function") {
        await services.loadObservationProduct(map, "UPPER_AIR", "TLOGP", null, latestFile, win, "UPPER_AIR/TLOGP", null, "upperair-tlogp-stations");
      }
      if (typeof services.loadTLogPLayer === "function") {
        await services.loadTLogPLayer(map, {
          id: "upperair-tlogp-diagram",
          name: "T-lnP Sounding Diagram",
          type: "tlogp",
          model: "UPPER_AIR",
          element: "TLOGP",
          visible: true,
          removable: true,
        }, null, null, win);
      }
    } else if (model === "UPPER_AIR") {
      if (typeof services.loadUpperAirComposite === "function") {
        await services.loadUpperAirComposite(map, win.level || 500, latestFile, win);
      }
    } else {
      if (typeof services.loadObservationProduct === "function") {
        await services.loadObservationProduct(map, model, element, win.level, latestFile, win);
      }
    }
  } else {
    const dataElement = (element === "VOR" || element === "DIV") ? "WIND" : element;
    let cycles = [];
    if (typeof services.resolveForecastCycles === "function") {
      cycles = await services.resolveForecastCycles(model, dataElement, win.level || 500);
    }
    win.forecastCycle = cycles[0] || null;

    if (typeof services.getOrCreateTimeline === "function") {
      const tl = services.getOrCreateTimeline(win.id);
      if (tl) {
        tl.currentMode = "nwp";
        tl.forecastCycles = cycles;
        tl.currentInitCycle = cycles[0] || "";
      }
    }

    if (typeof services.loadWeatherField === "function") {
      await services.loadWeatherField(map, model, element, win.level, win.period, null, win);
    }
  }

  return win;
}
