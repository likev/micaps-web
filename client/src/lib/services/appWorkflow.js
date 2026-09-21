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
  const previousGroupId = win.activeGroup?.id;

  // Use JSON round-trip to safely copy plain data from the group,
  // since `group` may be a Svelte 5 reactive $state proxy (or contain
  // non-serializable references like MapLibre map instances or DOM nodes)
  // that would cause structuredClone to throw a DataCloneError.
  const groupCopy = JSON.parse(JSON.stringify(group));
  win.activeGroup = groupCopy;
  win.isObservation = Boolean(groupCopy.isObservation);
  win.forecastCycle = null;
  if (previousGroupId !== groupCopy.id) {
    // Observation files belong to a product path/level. Never carry a file
    // from the previous preset into a newly selected surface/upper-air plot.
    win.obsTime = null;
    win._obsTimeline = null;
    win._obsTimelinePath = null;
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
