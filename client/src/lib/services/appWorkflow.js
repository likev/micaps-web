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
 * Determines whether a preset group has its own specialized floating panel
 * (e.g. T-LogP, Time-Height, Line-Height, Time-Line / Hovmöller).
 * Auto-allocation must always be 'none' and disabled for these presets.
 */
export function isProfilePanelGroup(group) {
  if (!group) return false;
  if (
    group.id === "composite-ec-timeheight" ||
    group.id === "composite-ec-hovmoller" ||
    (typeof group.id === "string" && (
      group.id.includes("timeheight") ||
      group.id.includes("lineheight") ||
      group.id.includes("hovmoller") ||
      group.id.includes("tlogp")
    ))
  ) {
    return true;
  }
  if (Array.isArray(group.layers)) {
    return group.layers.some(
      (l) =>
        l?.type === "timeheight" ||
        l?.type === "hovmoller" ||
        l?.type === "lineheight" ||
        l?.type === "tlogp" ||
        l?.type === "timeline" ||
        l?.element === "TLOGP"
    );
  }
  return false;
}

export function isProfilePanelWindow(win) {
  if (!win) return false;
  if (isProfilePanelGroup(win.activeGroup)) return true;
  if (win.model === "UPPER_AIR" && (win.element === "TLOGP" || (typeof win.id === "string" && win.id.includes("tlogp")))) return true;
  if (Array.isArray(win.layers)) {
    return win.layers.some(
      (l) =>
        l?.type === "timeheight" ||
        l?.type === "hovmoller" ||
        l?.type === "lineheight" ||
        l?.type === "tlogp" ||
        l?.type === "timeline" ||
        l?.element === "TLOGP"
    );
  }
  return false;
}

export function isSurfaceGroup(group) {
  if (!group) return false;
  if (group.category === "Surface Observations" || group.id === "composite-surface") return true;
  if (group.model === "SURFACE" || group.model === "SURFACE_ANALYSIS") return true;
  if (Array.isArray(group.layers)) {
    return group.layers.some(
      (l) => l?.model === "SURFACE" || l?.model === "SURFACE_ANALYSIS" || (typeof l?.id === "string" && (l.id.startsWith("surface-obs") || l.id.startsWith("contour-surface-")))
    );
  }
  return false;
}

export function isUpperAirGroup(group) {
  if (!group) return false;
  if (group.category === "Upper-Air Observations" || (typeof group.id === "string" && group.id.startsWith("composite-upperair"))) return true;
  if (group.model === "UPPER_AIR") return true;
  if (Array.isArray(group.layers)) {
    return group.layers.some(
      (l) => l?.model === "UPPER_AIR" || (typeof l?.id === "string" && (l.id.startsWith("upperair-") || l.id.startsWith("contour-sounding-")))
    );
  }
  return false;
}

export function isSurfaceWindow(win) {
  if (!win) return false;
  if (isSurfaceGroup(win.activeGroup)) return true;
  if (win.model === "SURFACE" || win.model === "SURFACE_ANALYSIS") return true;
  if (win.isObservation && win.activeGroup?.hasLevel === false) return true;
  if (Array.isArray(win.layers)) {
    return win.layers.some(
      (l) => l?.model === "SURFACE" || l?.model === "SURFACE_ANALYSIS" || (typeof l?.id === "string" && (l.id.startsWith("surface-obs") || l.id.startsWith("contour-surface-")))
    );
  }
  if (typeof win.title === "string" && (win.title.includes("地面") || win.title.includes("Surface"))) return true;
  return false;
}

export function isUpperAirWindow(win) {
  if (!win) return false;
  if (isUpperAirGroup(win.activeGroup)) return true;
  if (win.model === "UPPER_AIR") return true;
  if (win.isObservation && (win.activeGroup?.hasLevel === true || (win.level !== null && win.level !== undefined && win.level > 0))) return true;
  if (Array.isArray(win.layers)) {
    return win.layers.some(
      (l) => l?.model === "UPPER_AIR" || (typeof l?.id === "string" && (l.id.startsWith("upperair-") || l.id.startsWith("contour-sounding-")))
    );
  }
  if (typeof win.title === "string" && (win.title.includes("高空") || win.title.includes("Upper"))) return true;
  return false;
}

/**
 * Applies a preset group's metadata, levels, and timeline mode to a window object.
 * Synchronizes uiState.timelineVisible according to Section 1.5 specifications.
 */
export function applyPresetToWindow(win, group, overrideLevel = null, timelinesMap = null) {
  if (!win || !group) return null;
  const isSpecialProfile = shouldHideTimelineForGroup(group);
  const previousGroupId = win.activeGroup?.id;

  // Use JSON round-trip to safely copy plain data from the group,
  // since `group` may be a Svelte 5 reactive $state proxy (or contain
  // non-serializable references like MapLibre map instances or DOM nodes)
  // that would cause structuredClone to throw a DataCloneError.
  const groupCopy = JSON.parse(JSON.stringify(group));
  win.activeGroup = groupCopy;
  win.isObservation = Boolean(groupCopy.isObservation);
  win.forecastCycle = null;
  if (previousGroupId !== groupCopy.id || !win.stepLength) {
    // Observation files belong to a product path/level. Never carry a file
    // from the previous preset into a newly selected surface/upper-air plot.
    win.obsTime = null;
    win._obsTimeline = null;
    win._obsTimelinePath = null;
    // Set canonical step default: 12h for upper-air, 3h for surface, 6h for NWP
    if (groupCopy.isObservation) {
      const isUpper = /upper|tlogp/i.test(groupCopy.id || "") ||
        (Array.isArray(groupCopy.layers) && groupCopy.layers.some((l) =>
          l?.model === "UPPER_AIR" || String(l?.path || "").includes("TLOGP") || l?.element === "TLOGP"));
      win.stepLength = isUpper ? 12 : 3;
    } else {
      win.stepLength = isSpecialProfile ? 12 : 6;
    }
  }
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
  win.title = groupCopy.name || groupCopy.id;
  win.baseTitle = groupCopy.name || groupCopy.id;

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
