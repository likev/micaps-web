import { generateDynamicForecastCycles } from "../../utils/timelineSync.js";
import { DEFAULT_MOCK_OBS_FILES } from "../../config/presets.js";
import { selectObsChipsWindow, filterObsFilesByStep } from "./timelineMath.js";

export const DEFAULT_PLAYBACK_MS = 1500;

export const timelineState = {
  currentMode: "nwp", // "nwp" or "obs"
  currentStepLength: 6, // 6h forecast, 3h surface, 12h upper-air
  discretePeriods: [0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 84, 96, 108, 120],
  currentPeriodIdx: 4, // default +024h
  forecastCycles: generateDynamicForecastCycles(null, 10),
  currentInitCycle: "26082820",
  isUpperAirMode: false,
  currentWinTitle: "",
  periodStepSeq: 0,
  onTimeChangeCallback: null,
  rawObsFiles: [...DEFAULT_MOCK_OBS_FILES],
  obsFiles: [],
  currentObsIdx: 0,
  playTimer: null,
  isTickLoading: false,
  playbackLoopOptions: { loop: true },
  activeWindowProvider: null,
};

// Initialize currentInitCycle from dynamic forecastCycles if available
if (timelineState.forecastCycles && timelineState.forecastCycles.length > 0) {
  timelineState.currentInitCycle = timelineState.forecastCycles[0];
}

// Initialize default obs files
timelineState.obsFiles = selectObsChipsWindow(
  filterObsFilesByStep(timelineState.rawObsFiles, timelineState.currentStepLength, timelineState.isUpperAirMode)
);
timelineState.currentObsIdx = Math.max(0, timelineState.obsFiles.length - 1);

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

export function setTimeChangeCallback(cb) {
  timelineState.onTimeChangeCallback = cb;
}

export function getTimeChangeCallback() {
  return timelineState.onTimeChangeCallback;
}

// R2: single choke point for time-change callbacks — sync throws and async
// rejections are logged and swallowed (resolving null) so manual
// step/chip/keyboard paths, which ignore the return, can never produce
// unhandled promise rejections. Playback serialization is preserved:
// step() still awaits the callback promise before reporting completion.
export function fireTimeChange(payload) {
  if (!timelineState.onTimeChangeCallback) return null;
  try {
    return Promise.resolve(timelineState.onTimeChangeCallback(payload)).catch((err) => {
      console.warn("[TimeSlider] Time-change error:", err);
      return null;
    });
  } catch (err) {
    console.warn("[TimeSlider] Time-change error:", err);
    return Promise.resolve(null);
  }
}

export function getAdjacentTimeSteps() {
  const { currentMode, discretePeriods, currentPeriodIdx, obsFiles, currentObsIdx, currentInitCycle } = timelineState;
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
