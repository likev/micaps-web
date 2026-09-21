// timeline.svelte.js - Svelte 5 reactive timeline store with per-window isolation
import {
  DEFAULT_PLAYBACK_MS,
  createTimelineState,
  getAdjacentTimeSteps,
  fireTimeChange,
  setActiveWindowProvider,
  getActiveWindowProvider,
  setTimeChangeCallback,
  getTimeChangeCallback,
} from "./timelineCore.js";
import {
  selectObsChipsWindow,
  filterObsFilesByStep,
  getPeriodsForStep,
} from "./timelineMath.js";

// Global playback state
export const playback = $state({
  isPlaying: false,
  speed: DEFAULT_PLAYBACK_MS,
  loop: true,
});

// Per-window timelines map: { [winId]: TimelineState }
export const timelinesByWindow = $state({});

export function getOrCreateTimeline(winId = "default") {
  if (!timelinesByWindow[winId]) {
    timelinesByWindow[winId] = createTimelineState(winId);
  }
  return timelinesByWindow[winId];
}

export function goToPeriod(winId, period) {
  const tl = getOrCreateTimeline(winId);
  const idx = tl.discretePeriods.indexOf(period);
  if (idx !== -1) {
    tl.currentPeriodIdx = idx;
  }
}

export function goToObsFile(winId, file) {
  const tl = getOrCreateTimeline(winId);
  const idx = tl.obsFiles.indexOf(file);
  if (idx !== -1) {
    tl.currentObsIdx = idx;
  }
}

export {
  DEFAULT_PLAYBACK_MS,
  getAdjacentTimeSteps,
  fireTimeChange,
  selectObsChipsWindow,
  filterObsFilesByStep,
  getPeriodsForStep,
  setActiveWindowProvider,
  getActiveWindowProvider,
  setTimeChangeCallback,
  getTimeChangeCallback,
};
