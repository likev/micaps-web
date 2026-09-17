import { appState } from "../../store/appState.js";
import { schedulePrefetch } from "../../services/prefetchService.js";
import {
  timelineState,
  DEFAULT_PLAYBACK_MS,
  fireTimeChange,
  incPeriodStepSeq,
  notifyTimeline,
} from "./timelineStore.js";

export { DEFAULT_PLAYBACK_MS };

export function setPlayButtonBusy(isBusy) {
  if (typeof document === "undefined") return;
  const btnPlay = document.getElementById("btn-play");
  if (btnPlay) {
    if (isBusy) {
      btnPlay.setAttribute("aria-busy", "true");
      btnPlay.classList.add("loading");
    } else {
      btnPlay.removeAttribute("aria-busy");
      btnPlay.classList.remove("loading");
    }
  }
}

export function updatePlayButtonDisabledState() {
  if (typeof document === "undefined") return;
  const btnPlay = document.getElementById("btn-play");
  if (!btnPlay) return;
  const isSingle =
    (timelineState.currentMode === "obs" && timelineState.obsFiles.length <= 1) ||
    (timelineState.currentMode === "nwp" && timelineState.discretePeriods.length <= 1);
  if (isSingle) {
    btnPlay.setAttribute("disabled", "true");
    btnPlay.classList.add("disabled");
    btnPlay.title = "Animation requires at least 2 time steps";
    if (appState.get("isPlaying")) {
      pausePlayback();
    }
  } else {
    btnPlay.removeAttribute("disabled");
    btnPlay.classList.remove("disabled");
    btnPlay.title = "Play / Pause Animation (loops)";
  }
}

export function step(delta, options = {}) {
  let directions = options.directions || options.prefetchDirections;
  if (!directions) {
    if (options.source === "btn-prev") directions = ["prev"];
    else if (options.source === "btn-next" || options.source === "btn-play") directions = ["next"];
  }

  if (timelineState.currentMode === "obs") {
    if (timelineState.obsFiles.length === 0 || (options.source === "btn-play" && timelineState.obsFiles.length <= 1)) {
      return Promise.resolve({ wrapped: false, noop: true, mode: "obs" });
    }
    const prevIdx = timelineState.currentObsIdx;
    timelineState.currentObsIdx = (timelineState.currentObsIdx + delta + timelineState.obsFiles.length) % timelineState.obsFiles.length;
    const wrapped = delta > 0 ? timelineState.currentObsIdx < prevIdx : (delta < 0 ? timelineState.currentObsIdx > prevIdx : false);
    notifyTimeline();
    let callbackPromise = null;
    if (timelineState.onTimeChangeCallback) {
      callbackPromise = fireTimeChange({
        isObs: true,
        file: timelineState.obsFiles[timelineState.currentObsIdx],
        _seq: incPeriodStepSeq(),
        prefetchDirections: directions,
        source: options.source || (delta < 0 ? "btn-prev" : "btn-next"),
      });
    }
    return Promise.resolve(callbackPromise).then(() => ({
      wrapped,
      mode: "obs",
      index: timelineState.currentObsIdx,
      file: timelineState.obsFiles[timelineState.currentObsIdx],
    }));
  } else {
    if (timelineState.discretePeriods.length === 0 || (options.source === "btn-play" && timelineState.discretePeriods.length <= 1)) {
      return Promise.resolve({ wrapped: false, noop: true, mode: "nwp" });
    }
    const prevIdx = timelineState.currentPeriodIdx;
    timelineState.currentPeriodIdx = (timelineState.currentPeriodIdx + delta + timelineState.discretePeriods.length) % timelineState.discretePeriods.length;
    const wrapped = delta > 0 ? timelineState.currentPeriodIdx < prevIdx : (delta < 0 ? timelineState.currentPeriodIdx > prevIdx : false);
    const period = timelineState.discretePeriods[timelineState.currentPeriodIdx];
    appState.set("period", period);
    notifyTimeline();
    let callbackPromise = null;
    if (timelineState.onTimeChangeCallback) {
      const seq = incPeriodStepSeq();
      const boxed = {
        period,
        _seq: seq,
        prefetchDirections: directions,
        source: options.source || (delta < 0 ? "btn-prev" : "btn-next"),
        valueOf() { return period; },
      };
      callbackPromise = fireTimeChange(boxed);
    }
    return Promise.resolve(callbackPromise).then(() => ({
      wrapped,
      mode: "nwp",
      index: timelineState.currentPeriodIdx,
      period,
    }));
  }
}

export function scheduleNextTick(delay) {
  if (timelineState.playTimer) {
    clearTimeout(timelineState.playTimer);
    timelineState.playTimer = null;
  }
  timelineState.playTimer = setTimeout(runTick, delay);
}

async function runTick() {
  if (!appState.get("isPlaying")) return;
  if (timelineState.isTickLoading) return;

  const speed = Number(appState.get("playbackSpeed")) || DEFAULT_PLAYBACK_MS;
  const t0 = Date.now();
  timelineState.isTickLoading = true;
  setPlayButtonBusy(true);

  let stepResult = null;
  try {
    stepResult = await step(1, { source: "btn-play", directions: ["next"] });
  } catch (err) {
    console.warn("[TimeSlider] Playback step error:", err);
  } finally {
    timelineState.isTickLoading = false;
    setPlayButtonBusy(false);
  }

  if (!appState.get("isPlaying")) return;

  if (stepResult?.wrapped && timelineState.playbackLoopOptions.loop === false) {
    pausePlayback();
    return;
  }

  const elapsed = Date.now() - t0;
  const nextDelay = Math.max(50, speed - elapsed);
  scheduleNextTick(nextDelay);
}

export function startPlayback(options = {}) {
  // Re-entrancy guard (M1): Clear existing timer if any
  if (timelineState.playTimer) {
    clearTimeout(timelineState.playTimer);
    timelineState.playTimer = null;
  }

  // Singleton timeline guard (m7): cannot animate single or empty timelines
  if (
    (timelineState.currentMode === "obs" && timelineState.obsFiles.length <= 1) ||
    (timelineState.currentMode === "nwp" && timelineState.discretePeriods.length <= 1)
  ) {
    return;
  }

  timelineState.playbackLoopOptions = { loop: options.loop !== false };

  if (typeof document !== "undefined") {
    const btnPlay = document.getElementById("btn-play");
    if (btnPlay) {
      btnPlay.textContent = "❚❚";
      btnPlay.classList.add("active");
      btnPlay.setAttribute("aria-pressed", "true");
      btnPlay.setAttribute("aria-label", "Pause Animation");
    }
  }
  appState.set("isPlaying", true);

  // m4: Immediately prefetch next step for the active window
  if (typeof timelineState.activeWindowProvider === "function") {
    const win = timelineState.activeWindowProvider();
    schedulePrefetch(win || null, 0, { directions: ["next"] });
  } else {
    import("../tabWindowManager.js")
      .then(({ getActiveWindow }) => {
        const win = getActiveWindow?.();
        schedulePrefetch(win || null, 0, { directions: ["next"] });
      })
      .catch(() => {
        try { schedulePrefetch(null, 0, { directions: ["next"] }); } catch {}
      });
  }

  const speed = Number(appState.get("playbackSpeed")) || DEFAULT_PLAYBACK_MS;
  scheduleNextTick(speed);
}

export function pausePlayback() {
  if (timelineState.playTimer) {
    clearTimeout(timelineState.playTimer);
    timelineState.playTimer = null;
  }
  timelineState.isTickLoading = false;
  setPlayButtonBusy(false);
  if (typeof document !== "undefined") {
    const btnPlay = document.getElementById("btn-play");
    if (btnPlay) {
      btnPlay.textContent = "▶";
      btnPlay.classList.remove("active");
      btnPlay.setAttribute("aria-pressed", "false");
      btnPlay.setAttribute("aria-label", "Play Animation");
    }
  }
  appState.set("isPlaying", false);
}

export function setPlaybackSpeed(speedMs) {
  const speed = parseInt(speedMs, 10) || DEFAULT_PLAYBACK_MS;
  appState.set("playbackSpeed", speed);
  if (typeof document !== "undefined") {
    const sel = document.getElementById("select-playback-speed");
    if (sel && sel.value !== String(speed)) {
      sel.value = String(speed);
    }
  }
  // R1: skip re-arm while a tick is loading — the in-flight runTick already
  // reads the fresh speed and re-arms itself on settle.
  if (appState.get("isPlaying") && !timelineState.isTickLoading) {
    scheduleNextTick(speed);
  }
}

appState.subscribe("playbackSpeed", (speed) => {
  const speedVal = parseInt(speed, 10) || DEFAULT_PLAYBACK_MS;
  if (typeof document !== "undefined") {
    const sel = document.getElementById("select-playback-speed");
    if (sel && sel.value !== String(speedVal)) {
      sel.value = String(speedVal);
    }
  }
  // R1: same guard as setPlaybackSpeed — in-flight tick re-arms itself.
  if (appState.get("isPlaying") && !timelineState.isTickLoading) {
    scheduleNextTick(speedVal);
  }
});

// Pause playback when window/tab is hidden to save resources and avoid background fetch spam
export function bindVisibilityPause(doc = (typeof document !== "undefined" ? document : null)) {
  if (!doc || typeof doc.addEventListener !== "function" || doc.__timeSliderVisibilityBound) return;
  doc.__timeSliderVisibilityBound = true;
  doc.addEventListener("visibilitychange", () => {
    if (doc.hidden) pausePlayback();
  });
}
