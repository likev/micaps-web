// appWorkflow.js - Pure application workflow orchestrator helpers for window presets, timeline visibility, and multi-window isolation
import { uiState } from "../stores/uiCore.js";
import { createTimelineState } from "../stores/timelineCore.js";
import { parseTimestamp } from "../../utils/timeResolver.js";

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
    if (groupCopy.pacemaker) {
      tl.pacemakerId = groupCopy.pacemaker;
    } else {
      tl.pacemakerId = groupCopy.layers?.[0]?.id || null;
    }
    if (groupCopy.mode) {
      tl.timelineMode = groupCopy.mode;
    } else {
      tl.timelineMode = "review";
    }
  }

  return win;
}

/**
 * Pure step calculator for advancing or reversing timeline steps in an isolated window timeline.
 */
export function stepWindowTimeline(tl, delta) {
  if (!tl) return null;
  const loopActive = Boolean(tl.loopRange?.active && tl.loopRange?.start != null && tl.loopRange?.end != null);
  const loopStart = loopActive ? Math.min(tl.loopRange.start, tl.loopRange.end) : null;
  const loopEnd = loopActive ? Math.max(tl.loopRange.start, tl.loopRange.end) : null;

  if (tl.currentMode === "obs") {
    if (!tl.obsFiles || tl.obsFiles.length === 0) return null;
    const len = tl.obsFiles.length;
    let nextIdx = (tl.currentObsIdx + delta + len) % len;

    if (loopActive) {
      // Find range of indices in obsFiles within [loopStart, loopEnd]
      let minIdx = -1;
      let maxIdx = -1;
      for (let i = 0; i < len; i++) {
        const ts = parseTimestamp(tl.obsFiles[i]);
        if (ts !== null && ts >= loopStart && ts <= loopEnd) {
          if (minIdx === -1) minIdx = i;
          maxIdx = i;
        }
      }
      if (minIdx !== -1 && maxIdx !== -1 && minIdx <= maxIdx) {
        if (delta > 0) {
          if (tl.currentObsIdx < minIdx || tl.currentObsIdx >= maxIdx) {
            nextIdx = minIdx;
          } else {
            nextIdx = tl.currentObsIdx + 1;
          }
        } else if (delta < 0) {
          if (tl.currentObsIdx <= minIdx || tl.currentObsIdx > maxIdx) {
            nextIdx = maxIdx;
          } else {
            nextIdx = tl.currentObsIdx - 1;
          }
        }
      }
    }

    tl.currentObsIdx = nextIdx;
    const file = tl.obsFiles[tl.currentObsIdx];
    const fileTs = parseTimestamp(file);
    if (fileTs !== null) {
      tl.wallClockCursor = fileTs;
    }
    return {
      isObs: true,
      file,
      cursorTime: fileTs,
      _seq: ++tl.periodStepSeq,
    };
  } else {
    if (!tl.discretePeriods || tl.discretePeriods.length === 0) return null;
    const len = tl.discretePeriods.length;
    const stepDir = delta >= 0 ? 1 : -1;
    const numSteps = Math.max(1, Math.abs(delta));
    let nextIdx = (typeof tl.currentPeriodIdx === "number" && tl.currentPeriodIdx >= 0) ? tl.currentPeriodIdx : 0;

    if (loopActive && tl.currentInitCycle) {
      const cycleTs = parseTimestamp(tl.currentInitCycle);
      if (cycleTs) {
        let minIdx = -1;
        let maxIdx = -1;
        for (let i = 0; i < len; i++) {
          const validTs = cycleTs + Number(tl.discretePeriods[i]) * 3600 * 1000;
          if (validTs >= loopStart && validTs <= loopEnd) {
            if (minIdx === -1) minIdx = i;
            maxIdx = i;
          }
        }
        if (minIdx !== -1 && maxIdx !== -1 && minIdx <= maxIdx) {
          if (delta > 0) {
            if (tl.currentPeriodIdx < minIdx || tl.currentPeriodIdx >= maxIdx) {
              nextIdx = minIdx;
            } else {
              nextIdx = tl.currentPeriodIdx + 1;
            }
          } else if (delta < 0) {
            if (tl.currentPeriodIdx <= minIdx || tl.currentPeriodIdx > maxIdx) {
              nextIdx = maxIdx;
            } else {
              nextIdx = tl.currentPeriodIdx - 1;
            }
          }
          tl.currentPeriodIdx = nextIdx;
          const p = tl.discretePeriods[tl.currentPeriodIdx];
          const validTs = cycleTs + Number(p) * 3600 * 1000;
          tl.wallClockCursor = validTs;
          return {
            isObs: false,
            period: p,
            cycle: tl.currentInitCycle,
            cursorTime: validTs,
            _seq: ++tl.periodStepSeq,
          };
        }
      }
    }

    const hasDisabled = Boolean(
      tl.disabledPeriods && (Array.isArray(tl.disabledPeriods) ? tl.disabledPeriods.length > 0 : true)
    );

    if (hasDisabled) {
      for (let s = 0; s < numSteps; s++) {
        let found = false;
        for (let attempt = 0; attempt < len; attempt++) {
          nextIdx = (nextIdx + stepDir + len) % len;
          const p = tl.discretePeriods[nextIdx];
          const numP = Number(p);
          const isDisabled = Array.isArray(tl.disabledPeriods)
            ? (tl.disabledPeriods.includes(p) || tl.disabledPeriods.includes(numP))
            : (tl.disabledPeriods instanceof Set ? (tl.disabledPeriods.has(p) || tl.disabledPeriods.has(numP)) : false);
          if (!isDisabled) {
            found = true;
            break;
          }
        }
        if (!found) {
          nextIdx = (nextIdx + stepDir + len) % len;
        }
      }
    } else {
      nextIdx = (tl.currentPeriodIdx + delta + len * Math.ceil(Math.abs(delta) / len)) % len;
    }

    tl.currentPeriodIdx = nextIdx;
    const p = tl.discretePeriods[tl.currentPeriodIdx];
    if (tl.currentInitCycle) {
      const cycleTs = parseTimestamp(tl.currentInitCycle);
      if (cycleTs) {
        tl.wallClockCursor = cycleTs + Number(p) * 3600 * 1000;
      }
    }
    return {
      isObs: false,
      period: p,
      cycle: tl.currentInitCycle,
      cursorTime: tl.wallClockCursor,
      _seq: ++tl.periodStepSeq,
    };
  }
}

/**
 * Split-mode sweep coalescing.
 *
 * One ←/→ keypress in a shared split allocation (step/time/level/model)
 * fans out to a full sweep: one fetch + contour + raster pass PER visible
 * window, awaited sequentially. A sweep takes far longer than the 150ms key-
 * repeat throttle, so holding the key stacks N sweeps × M windows of
 * fetch/compute/memory. The per-window loadSeq guard only discards stale
 * results AFTER the fetch, so the work is still spent.
 *
 * Every shared sweep recomputes ALL visible windows from the latest intent,
 * so an older sweep may stop issuing loads once a newer shared sweep starts
 * without ever leaving a window uncovered. Single-window loads never touch
 * the generation and are unaffected.
 */
export function beginSharedSweep(tab) {
  if (!tab || typeof tab !== "object") return 0;
  const gen = (Number.isFinite(tab._sweepGen) ? tab._sweepGen : 0) + 1;
  tab._sweepGen = gen;
  return gen;
}

export function sharedSweepAlive(tab, gen) {
  if (!tab || typeof tab !== "object" || !gen) return true;
  return tab._sweepGen === gen;
}
