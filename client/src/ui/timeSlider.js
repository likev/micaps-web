// timeSlider.js - Discrete forecast lead time stepper and observation timeline
import { appState } from "../store/appState.js";
import { formatLeadTime, formatObsTimestamp } from "../utils/formatters.js";

let playTimer = null;
let currentMode = "nwp"; // "nwp" or "obs"
let discretePeriods = [0, 12, 24, 36, 48, 72, 96, 120];
let currentPeriodIdx = 2; // default +024h

let obsFiles = [
  "20260827080000.000",
  "20260827120000.000",
  "20260827170000.000",
  "20260827174000.000",
  "20260827200000.000",
];
let currentObsIdx = obsFiles.length - 1;

let onTimeChangeCallback = null;

export function initTimeSlider(containerId = "timeslider-container", onTimeChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  onTimeChangeCallback = onTimeChange;

  container.innerHTML = `
    <div class="timeline-stepper">
      <button id="btn-prev" class="step-nav-btn" title="Previous Step">◀</button>
      <button id="btn-play" class="play-btn" title="Play / Pause Animation">▶</button>
      <button id="btn-next" class="step-nav-btn" title="Next Step">▶</button>
    </div>

    <div class="timeline-body">
      <div class="timeline-info">
        <span id="time-badge" class="mode-badge">NWP FORECAST</span>
        <span id="time-lead-wrapper">Forecast Lead: <strong id="time-lead-label">+024h</strong></span>
        <span id="time-valid-label" class="valid-label">Analysis + 24h</span>
      </div>

      <!-- Discrete Step Chips Bar (No continuous slider track) -->
      <div class="timeline-chips" id="timeline-chips"></div>
    </div>
  `;

  const btnPlay = document.getElementById("btn-play");
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");

  btnPrev.addEventListener("click", () => step(-1));
  btnNext.addEventListener("click", () => step(1));

  btnPlay.addEventListener("click", () => {
    if (playTimer) {
      pausePlayback();
    } else {
      startPlayback();
    }
  });

  renderChips();
  updateLabels();
}

function renderChips() {
  const chipsContainer = document.getElementById("timeline-chips");
  if (!chipsContainer) return;
  chipsContainer.innerHTML = "";

  if (currentMode === "obs") {
    obsFiles.forEach((file, idx) => {
      const btn = document.createElement("button");
      btn.className = `chip-btn ${idx === currentObsIdx ? "active" : ""}`;
      // Extract HH:MM UTC
      const timeLabel = file.length >= 12 ? `${file.slice(8, 10)}:${file.slice(10, 12)}Z` : file;
      btn.textContent = timeLabel;
      btn.title = formatObsTimestamp(file);
      btn.addEventListener("click", () => {
        currentObsIdx = idx;
        updateLabels();
        renderChips();
        if (onTimeChangeCallback) onTimeChangeCallback({ isObs: true, file });
      });
      chipsContainer.appendChild(btn);
    });
  } else {
    // Discrete Forecast Lead Hours (No continuous steps)
    discretePeriods.forEach((period, idx) => {
      const btn = document.createElement("button");
      btn.className = `chip-btn ${idx === currentPeriodIdx ? "active" : ""}`;
      btn.textContent = period === 0 ? "000h" : `+${period}h`;
      btn.addEventListener("click", () => {
        currentPeriodIdx = idx;
        const p = discretePeriods[idx];
        appState.set("period", p);
        updateLabels();
        renderChips();
        if (onTimeChangeCallback) onTimeChangeCallback(p);
      });
      chipsContainer.appendChild(btn);
    });
  }
}

function updateLabels() {
  const badge = document.getElementById("time-badge");
  const leadWrapper = document.getElementById("time-lead-wrapper");
  const leadLabel = document.getElementById("time-lead-label");
  const validLabel = document.getElementById("time-valid-label");

  if (!badge || !leadLabel || !validLabel) return;

  if (currentMode === "obs") {
    badge.textContent = "OBSERVATION";
    badge.className = "mode-badge obs-badge";
    const curFile = obsFiles[currentObsIdx];
    leadWrapper.innerHTML = `Observation Time: <strong id="time-lead-label">${formatObsTimestamp(curFile)}</strong>`;
    validLabel.textContent = "Instantaneous Station Analysis (No Forecast Offset)";
  } else {
    badge.textContent = "NWP FORECAST";
    badge.className = "mode-badge";
    const curPeriod = discretePeriods[currentPeriodIdx];
    leadWrapper.innerHTML = `Forecast Lead: <strong id="time-lead-label">${formatLeadTime(curPeriod)}</strong>`;
    validLabel.textContent = `Valid: Analysis + ${curPeriod}h Discrete Horizon`;
  }
}

function step(delta) {
  if (currentMode === "obs") {
    currentObsIdx = (currentObsIdx + delta + obsFiles.length) % obsFiles.length;
    updateLabels();
    renderChips();
    if (onTimeChangeCallback) onTimeChangeCallback({ isObs: true, file: obsFiles[currentObsIdx] });
  } else {
    currentPeriodIdx = (currentPeriodIdx + delta + discretePeriods.length) % discretePeriods.length;
    const period = discretePeriods[currentPeriodIdx];
    appState.set("period", period);
    updateLabels();
    renderChips();
    if (onTimeChangeCallback) onTimeChangeCallback(period);
  }
}

function startPlayback() {
  const btnPlay = document.getElementById("btn-play");
  if (btnPlay) btnPlay.textContent = "❚❚";
  appState.set("isPlaying", true);

  playTimer = setInterval(() => {
    step(1);
  }, appState.get("playbackSpeed") || 1800);
}

function pausePlayback() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
  const btnPlay = document.getElementById("btn-play");
  if (btnPlay) btnPlay.textContent = "▶";
  appState.set("isPlaying", false);
}

export function setTimelineMode(mode, customData = {}) {
  currentMode = mode === "obs" ? "obs" : "nwp";
  if (currentMode === "obs" && customData.file) {
    const idx = obsFiles.indexOf(customData.file);
    if (idx !== -1) currentObsIdx = idx;
  } else if (currentMode === "nwp" && customData.period !== undefined) {
    const idx = discretePeriods.indexOf(customData.period);
    if (idx !== -1) currentPeriodIdx = idx;
  }
  pausePlayback();
  updateLabels();
  renderChips();
}

