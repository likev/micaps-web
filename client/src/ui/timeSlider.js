// timeSlider.js - Forecast lead time scrubber and animation timeline
import { appState } from "../store/appState.js";
import { formatLeadTime } from "../utils/formatters.js";

let playTimer = null;

export function initTimeSlider(containerId = "timeslider-container", onTimeChange) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const periods = [0, 12, 24, 36, 48, 72];

  container.innerHTML = `
    <button id="btn-play" class="play-btn">▶</button>
    <div class="timeline">
      <div class="timeline-info">
        <span>Forecast Lead Offset: <strong id="time-lead-label">+024h</strong></span>
        <span id="time-valid-label">Analysis + 24h</span>
      </div>
      <input type="range" id="time-slider" min="0" max="${periods.length - 1}" value="2" step="1" class="slider" />
    </div>
  `;

  const btnPlay = document.getElementById("btn-play");
  const slider = document.getElementById("time-slider");
  const leadLabel = document.getElementById("time-lead-label");
  const validLabel = document.getElementById("time-valid-label");

  slider.addEventListener("input", (e) => {
    const idx = parseInt(e.target.value, 10);
    const period = periods[idx];
    updateLabels(period);
    appState.set("period", period);
    if (onTimeChange) onTimeChange(period);
  });

  btnPlay.addEventListener("click", () => {
    if (playTimer) {
      // Pause
      clearInterval(playTimer);
      playTimer = null;
      btnPlay.textContent = "▶";
      appState.set("isPlaying", false);
    } else {
      // Play
      btnPlay.textContent = "❚❚";
      appState.set("isPlaying", true);
      playTimer = setInterval(() => {
        let currentIdx = parseInt(slider.value, 10);
        currentIdx = (currentIdx + 1) % periods.length;
        slider.value = currentIdx;
        const period = periods[currentIdx];
        updateLabels(period);
        appState.set("period", period);
        if (onTimeChange) onTimeChange(period);
      }, appState.get("playbackSpeed") || 1800);
    }
  });

  function updateLabels(period) {
    leadLabel.textContent = formatLeadTime(period);
    validLabel.textContent = `Valid: +${period}h Offset`;
  }
}
