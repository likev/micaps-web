// timelineCore.js - Plain-core timeline state and operations
import { generateDynamicForecastCycles } from "../../utils/timelineSync.js";
import { DEFAULT_MOCK_OBS_FILES } from "../../config/presets.js";
import { selectObsChipsWindow, filterObsFilesByStep } from "./timelineMath.js";
import { parseTimestamp, resolveLayerTime, getReferenceNowMs } from "../../utils/timeResolver.js";

export const DEFAULT_PLAYBACK_MS = 1500;

export function createTimelineState(winId = "default", overrides = {}) {
  const isUpper = overrides.isUpperAirMode ?? false;
  const isObs = overrides.currentMode === "obs";
  const defaultStep = isObs ? (isUpper ? 12 : 3) : 6;
  const step = overrides.currentStepLength ?? defaultStep;
  const cycles = overrides.forecastCycles || generateDynamicForecastCycles(null, 10);
  const rawObs = overrides.rawObsFiles || [...DEFAULT_MOCK_OBS_FILES];
  const obs = selectObsChipsWindow(filterObsFilesByStep(rawObs, step, isUpper));

  // Initial cursor time
  let initialCursor = overrides.wallClockCursor;
  if (!initialCursor) {
    if (isObs && obs.length > 0) {
      initialCursor = parseTimestamp(obs[Math.max(0, obs.length - 1)]) || getReferenceNowMs();
    } else if (isObs) {
      initialCursor = getReferenceNowMs();
    } else {
      const initCycle = overrides.currentInitCycle || (cycles && cycles.length > 0 ? cycles[0] : "26082820");
      const period = overrides.discretePeriods ? overrides.discretePeriods[overrides.currentPeriodIdx ?? 4] : 24;
      const cycleTs = parseTimestamp(initCycle) || getReferenceNowMs();
      initialCursor = cycleTs + (period || 0) * 3600 * 1000;
    }
  }

  return {
    winId,
    currentMode: overrides.currentMode || "nwp", // "nwp" or "obs"
    currentStepLength: step,
    discretePeriods: overrides.discretePeriods || [0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 84, 96, 108, 120],
    currentPeriodIdx: overrides.currentPeriodIdx ?? 4, // default +024h
    forecastCycles: cycles,
    currentInitCycle: overrides.currentInitCycle || (cycles && cycles.length > 0 ? cycles[0] : "26082820"),
    isUpperAirMode: isUpper,
    currentWinTitle: overrides.currentWinTitle || "",
    periodStepSeq: 0,
    rawObsFiles: rawObs,
    obsFiles: obs,
    currentObsIdx: Math.max(0, obs.length - 1),
    isTickLoading: false,
    disabledPeriods: overrides.disabledPeriods || [],

    // Part 2 Extensions
    timelineMode: overrides.timelineMode || "review", // "review" or "live" (§2.6)
    wallClockCursor: initialCursor, // continuous playhead moment (§2.1)
    pacemakerId: overrides.pacemakerId || null, // pacemaker layer id (§2.3)
    loopRange: overrides.loopRange || { start: null, end: null, active: false }, // loop range (§2.6)
    snapToPacemaker: overrides.snapToPacemaker !== undefined ? overrides.snapToPacemaker : true, // snap to pacemaker (§2.9)
    multiTrackExpanded: Boolean(overrides.multiTrackExpanded), // multi-track DAW lanes (§2.3)
    autoHideStale: Boolean(overrides.autoHideStale), // auto-hide stale layers (§2.4)
    layerResolutions: {}, // live resolution results per layerId
  };
}

export const timelineState = createTimelineState("default");
timelineState.onTimeChangeCallback = null;
timelineState.playTimer = null;
timelineState.playbackLoopOptions = { loop: true };
timelineState.activeWindowProvider = null;

const timelineListeners = new Set();

export function subscribeTimeline(fn) {
  timelineListeners.add(fn);
  return () => timelineListeners.delete(fn);
}

export function notifyTimeline() {
  timelineListeners.forEach((fn) => {
    try {
      fn(timelineState);
    } catch (e) {
      console.error("[TimelineStore] Listener error:", e);
    }
  });
}

export function getPeriodStepSeq() {
  return timelineState.periodStepSeq;
}

export function incPeriodStepSeq() {
  return ++timelineState.periodStepSeq;
}

export function getCurrentTimelineMode() {
  return timelineState.currentMode;
}

export function getCurrentTimelinePeriod() {
  return timelineState.discretePeriods[timelineState.currentPeriodIdx] ?? null;
}

export function getCurrentTimelineObsFile() {
  return timelineState.obsFiles[timelineState.currentObsIdx] ?? null;
}

export function getCurrentTimelineCycle() {
  return timelineState.currentInitCycle;
}

export function getTimelineObsFiles() {
  return [...timelineState.obsFiles];
}

export function getRawObsFiles() {
  return [...timelineState.rawObsFiles];
}

export function setActiveWindowProvider(provider) {
  timelineState.activeWindowProvider = provider;
}

export function getActiveWindowProvider() {
  return timelineState.activeWindowProvider;
}

const windowTimeCallbacks = new Map();

export function setTimeChangeCallback(cb, winId = null) {
  if (winId) {
    windowTimeCallbacks.set(winId, cb);
  } else {
    timelineState.onTimeChangeCallback = cb;
  }
}

export function clearWindowTimeline(winId = null) {
  if (winId) {
    windowTimeCallbacks.delete(winId);
  }
}

export function getTimeChangeCallback(winId = null) {
  if (winId && windowTimeCallbacks.has(winId)) {
    return windowTimeCallbacks.get(winId);
  }
  return timelineState.onTimeChangeCallback;
}

export function fireTimeChange(payload, winId = null) {
  const cb = (winId && windowTimeCallbacks.get(winId)) || timelineState.onTimeChangeCallback;
  if (!cb) return null;
  try {
    return Promise.resolve(cb(payload)).catch((err) => {
      console.warn("[TimeSlider] Time-change error:", err);
      return null;
    });
  } catch (err) {
    console.warn("[TimeSlider] Time-change error:", err);
    return Promise.resolve(null);
  }
}

export function getAdjacentTimeSteps(state = timelineState) {
  const {
    currentMode,
    discretePeriods,
    currentPeriodIdx,
    obsFiles,
    currentObsIdx,
    currentInitCycle,
    disabledPeriods,
  } = state;

  let prevPeriodIdx = -1;
  let nextPeriodIdx = -1;

  if (discretePeriods && discretePeriods.length > 0) {
    const len = discretePeriods.length;
    const curIdx = (typeof currentPeriodIdx === "number" && currentPeriodIdx >= 0) ? currentPeriodIdx : 0;
    const hasDisabled = Boolean(
      disabledPeriods && (Array.isArray(disabledPeriods) ? disabledPeriods.length > 0 : true)
    );
    const isPDisabled = (p) => hasDisabled && (Array.isArray(disabledPeriods)
      ? (disabledPeriods.includes(p) || disabledPeriods.includes(Number(p)))
      : (disabledPeriods instanceof Set ? (disabledPeriods.has(p) || disabledPeriods.has(Number(p))) : false));

    // Find previous non-disabled step
    let pIdx = (curIdx - 1 + len) % len;
    for (let i = 0; i < len; i++) {
      if (!isPDisabled(discretePeriods[pIdx])) {
        prevPeriodIdx = pIdx;
        break;
      }
      pIdx = (pIdx - 1 + len) % len;
    }

    // Find next non-disabled step
    let nIdx = (curIdx + 1) % len;
    for (let i = 0; i < len; i++) {
      if (!isPDisabled(discretePeriods[nIdx])) {
        nextPeriodIdx = nIdx;
        break;
      }
      nIdx = (nIdx + 1) % len;
    }
  }

  const prevObsIdx = obsFiles.length > 0 ? (currentObsIdx - 1 + obsFiles.length) % obsFiles.length : -1;
  const nextObsIdx = obsFiles.length > 0 ? (currentObsIdx + 1) % obsFiles.length : -1;

  return {
    mode: currentMode,
    periods: {
      prev: prevPeriodIdx !== -1 ? discretePeriods[prevPeriodIdx] : null,
      current: discretePeriods[currentPeriodIdx] ?? null,
      next: nextPeriodIdx !== -1 ? discretePeriods[nextPeriodIdx] : null,
      cycle: currentInitCycle,
    },
    obsFiles: {
      prev: prevObsIdx !== -1 ? obsFiles[prevObsIdx] : null,
      current: currentObsIdx !== -1 ? obsFiles[currentObsIdx] : null,
      next: nextObsIdx !== -1 ? obsFiles[nextObsIdx] : null,
    },
  };
}

/**
 * Returns up to n following frames forward from the current position without wrapping,
 * clamping at the end of the obs-file list.
 *
 * @param {Object} [state=timelineState]
 * @param {number} [n=2]
 * @returns {Array<string>}
 */
export function getFollowingTimeSteps(state = timelineState, n = 2) {
  if (!state) return [];
  const obsFiles = Array.isArray(state.obsFiles)
    ? state.obsFiles
    : (Array.isArray(state.files)
      ? state.files
      : (Array.isArray(state.rawFiles)
        ? state.rawFiles
        : (Array.isArray(state._state?.obsFiles)
          ? state._state.obsFiles
          : null)));
  if (!obsFiles || obsFiles.length === 0) {
    return [];
  }
  let currentObsIdx = typeof state.currentObsIdx === "number" ? state.currentObsIdx : -1;
  if (currentObsIdx < 0) {
    const cur = state.file || state.currentFile || state.obsFiles?.current;
    if (cur) currentObsIdx = obsFiles.indexOf(cur);
  }
  if (currentObsIdx < 0) return [];
  const count = typeof n === "number" && n > 0 ? n : 2;
  const following = [];
  for (let i = 1; i <= count; i++) {
    const idx = currentObsIdx + i;
    if (idx < obsFiles.length) {
      following.push(obsFiles[idx]);
    } else {
      break;
    }
  }
  return following;
}

export function setTimelineModeSetting(tl, mode) {
  if (!tl) return;
  tl.timelineMode = mode === "live" ? "live" : "review";
}

export function setPacemaker(tl, pacemakerId) {
  if (!tl) return;
  tl.pacemakerId = pacemakerId || null;
}

export function setWallClockCursor(tl, time) {
  if (!tl) return;
  const ts = parseTimestamp(time);
  if (ts !== null) {
    tl.wallClockCursor = ts;
  }
}

export function setLoopRange(tl, rangeOrStart, endArg = null, activeArg = true) {
  if (!tl || rangeOrStart === undefined || rangeOrStart === null) return;
  if (typeof rangeOrStart === "object") {
    tl.loopRange = {
      start: rangeOrStart.start !== undefined ? rangeOrStart.start : tl.loopRange?.start,
      end: rangeOrStart.end !== undefined ? rangeOrStart.end : tl.loopRange?.end,
      active: rangeOrStart.active !== undefined ? Boolean(rangeOrStart.active) : true,
    };
  } else {
    tl.loopRange = {
      start: rangeOrStart,
      end: endArg,
      active: Boolean(activeArg),
    };
  }
}

export function toggleMultiTrack(tl, forceValue = null) {
  if (!tl) return;
  tl.multiTrackExpanded = forceValue !== null ? Boolean(forceValue) : !tl.multiTrackExpanded;
}

export function updateLayerResolutions(tl, layers) {
  if (!tl || !Array.isArray(layers)) return {};
  const cursor = tl.wallClockCursor || getReferenceNowMs();
  const isLive = tl.timelineMode === "live";
  const map = {};
  for (const layer of layers) {
    if (!layer || !layer.id) continue;
    map[layer.id] = resolveLayerTime(layer, cursor, { forceLatestAt: isLive });
  }
  tl.layerResolutions = map;
  return map;
}

