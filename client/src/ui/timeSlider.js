// timeSlider.js - Facade module re-exporting timeline logic, state, and view
import { bindVisibilityPause } from "./timeline/playbackController.js";

export {
  MAX_OBS_CHIPS,
  findClosestFile,
  selectObsChipsWindow,
  getPeriodsForStep,
  filterObsFilesByStep,
} from "./timeline/timelineMath.js";

export {
  timelineState,
  DEFAULT_PLAYBACK_MS,
  getPeriodStepSeq,
  incPeriodStepSeq,
  getCurrentTimelineMode,
  getCurrentTimelinePeriod,
  getCurrentTimelineObsFile,
  getCurrentTimelineCycle,
  getTimelineObsFiles,
  getRawObsFiles,
  getAdjacentTimeSteps,
  setActiveWindowProvider,
  getActiveWindowProvider,
  setTimeChangeCallback,
  getTimeChangeCallback,
  fireTimeChange,
  subscribeTimeline,
  notifyTimeline,
} from "./timeline/timelineStore.js";

export {
  setPlayButtonBusy,
  updatePlayButtonDisabledState,
  step,
  scheduleNextTick,
  startPlayback,
  pausePlayback,
  setPlaybackSpeed,
  bindVisibilityPause,
} from "./timeline/playbackController.js";

export {
  setTimeSliderVisible,
  renderChips,
  updateLabels,
  setStepLength,
  setTimelineMode,
  initTimeSlider,
  updateStepLengthOptions,
} from "./timeline/timeSliderView.js";

// Auto-bind document visibility change to pause playback in background tabs
bindVisibilityPause();
