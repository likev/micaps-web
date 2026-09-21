// timelineCore.js - Plain-core timeline state and operations
import { generateDynamicForecastCycles } from "../../utils/timelineSync.js";
import { DEFAULT_MOCK_OBS_FILES } from "../../config/presets.js";
import { selectObsChipsWindow, filterObsFilesByStep } from "./timelineMath.js";

export const DEFAULT_PLAYBACK_MS = 1500;

export function createTimelineState(winId = "default", overrides = {}) {
  const cycles = overrides.forecastCycles || generateDynamicForecastCycles(null, 10);
  const rawObs = overrides.rawObsFiles || [...DEFAULT_MOCK_OBS_FILES];
  const step = overrides.currentStepLength ?? 6;
  const isUpper = overrides.isUpperAirMode ?? false;
  const obs = selectObsChipsWindow(filterObsFilesByStep(rawObs, step, isUpper));

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
  const { currentMode, discretePeriods, currentPeriodIdx, obsFiles, currentObsIdx, currentInitCycle } = state;
  const prevPeriodIdx = discretePeriods.length > 0 ? (currentPeriodIdx - 1 + discretePeriods.length) % discretePeriods.length : -1;
  const nextPeriodIdx = discretePeriods.length > 0 ? (currentPeriodIdx + 1) % discretePeriods.length : -1;

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
