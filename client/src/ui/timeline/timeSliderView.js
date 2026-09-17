import { appState } from "../../store/appState.js";
import {
  formatLeadTime,
  formatObsTimestamp,
  formatForecastInitTime,
  formatForecastValidTime,
} from "../../utils/formatters.js";
import { generateDynamicForecastCycles } from "../../utils/timelineSync.js";
import {
  findClosestFile,
  selectObsChipsWindow,
  getPeriodsForStep,
  filterObsFilesByStep,
} from "./timelineMath.js";
import {
  timelineState,
  fireTimeChange,
  incPeriodStepSeq,
  subscribeTimeline,
} from "./timelineStore.js";
import {
  DEFAULT_PLAYBACK_MS,
  pausePlayback,
  startPlayback,
  step,
  setPlaybackSpeed,
  updatePlayButtonDisabledState,
} from "./playbackController.js";

export function updateStepLengthOptions(isUpper, currentStep) {
  if (typeof document === "undefined") {
    timelineState.currentStepLength = parseInt(currentStep, 10) || (isUpper ? 12 : 6);
    return;
  }
  const selStep = document.getElementById("select-step-length");
  if (!selStep) return;

  const targetOptions = isUpper
    ? [
        { value: "12", label: "12h" },
        { value: "24", label: "24h" },
        { value: "6", label: "6h" },
      ]
    : [
        { value: "1", label: "1h" },
        { value: "3", label: "3h" },
        { value: "6", label: "6h" },
        { value: "12", label: "12h" },
        { value: "24", label: "24h" },
      ];

  const currentOptsStr = Array.from(selStep.options || []).map((o) => o.value).join(",");
  const targetOptsStr = targetOptions.map((o) => o.value).join(",");

  if (currentOptsStr !== targetOptsStr) {
    selStep.innerHTML = "";
    targetOptions.forEach((opt) => {
      const el = document.createElement("option");
      el.value = opt.value;
      el.textContent = opt.label;
      selStep.appendChild(el);
    });
  }

  const validValues = targetOptions.map((o) => o.value);
  const valToSet = validValues.includes(String(currentStep)) ? String(currentStep) : validValues[0];
  selStep.value = valToSet;
  timelineState.currentStepLength = parseInt(valToSet, 10);
}

export function setTimeSliderVisible(visible = true) {
  if (typeof document === "undefined") return;
  const container = document.getElementById("timeslider-container");
  if (!container) return;
  container.classList.toggle("hidden", !visible);
}

export function renderChips() {
  if (typeof document === "undefined") return;
  const chipsContainer = document.getElementById("timeline-chips");
  if (!chipsContainer) return;
  chipsContainer.innerHTML = "";
  chipsContainer.setAttribute("role", "tablist");
  chipsContainer.setAttribute(
    "aria-label",
    timelineState.currentMode === "obs" ? "Observation time steps" : "Forecast lead time steps"
  );

  if (timelineState.currentMode === "obs") {
    timelineState.obsFiles.forEach((file, idx) => {
      const btn = document.createElement("button");
      btn.className = `chip-btn ${idx === timelineState.currentObsIdx ? "active" : ""}`;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", idx === timelineState.currentObsIdx ? "true" : "false");
      btn.setAttribute("aria-label", formatObsTimestamp(file));
      const timeLabel =
        file.length >= 10
          ? `${file.slice(4, 6)}/${file.slice(6, 8)} ${file.slice(8, 10)}:${file.slice(10, 12) || "00"}`
          : file;
      btn.textContent = timeLabel;
      btn.title = formatObsTimestamp(file);
      btn.addEventListener("click", () => {
        pausePlayback();
        timelineState.currentObsIdx = idx;
        updateLabels();
        renderChips();
        fireTimeChange({ isObs: true, file, _seq: incPeriodStepSeq() });
      });
      chipsContainer.appendChild(btn);
    });
  } else {
    timelineState.discretePeriods.forEach((period, idx) => {
      const btn = document.createElement("button");
      btn.className = `chip-btn ${idx === timelineState.currentPeriodIdx ? "active" : ""}`;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", idx === timelineState.currentPeriodIdx ? "true" : "false");
      btn.setAttribute("aria-label", period === 0 ? "Analysis 000h" : `Forecast +${period}h`);
      btn.textContent = period === 0 ? "000h" : `+${period}h`;
      btn.addEventListener("click", () => {
        pausePlayback();
        timelineState.currentPeriodIdx = idx;
        const p = timelineState.discretePeriods[idx];
        appState.set("period", p);
        updateLabels();
        renderChips();
        if (timelineState.onTimeChangeCallback) {
          const seq = incPeriodStepSeq();
          const boxed = { period: p, _seq: seq, valueOf() { return p; } };
          fireTimeChange(boxed);
        }
      });
      chipsContainer.appendChild(btn);
    });
  }

  // Auto-scroll active chip into view
  try {
    chipsContainer.querySelector(".chip-btn.active")?.scrollIntoView({ inline: "nearest", block: "nearest" });
  } catch {}
  updatePlayButtonDisabledState();
}

export function updateLabels() {
  if (typeof document === "undefined") return;
  const badge = document.getElementById("time-badge");
  const winBadge = document.getElementById("time-win-badge");
  const initWrapper = document.getElementById("time-init-wrapper");
  const selInit = document.getElementById("select-init-time");
  const leadWrapper = document.getElementById("time-lead-wrapper");
  const validLabel = document.getElementById("time-valid-label");

  if (!badge || !leadWrapper || !validLabel) return;

  if (winBadge) {
    if (timelineState.currentWinTitle) {
      winBadge.textContent = timelineState.currentWinTitle;
      winBadge.style.display = "inline-block";
      winBadge.title = timelineState.currentWinTitle;
    } else {
      winBadge.style.display = "none";
    }
  }

  if (timelineState.currentMode === "obs") {
    if (initWrapper) initWrapper.style.display = "none";
    badge.textContent = "OBSERVATION";
    badge.className = "mode-badge obs-badge";
    const curFile = timelineState.obsFiles[timelineState.currentObsIdx] || "";
    leadWrapper.innerHTML = `Observation Time: <strong id="time-lead-label">${formatObsTimestamp(curFile)}</strong>`;
    validLabel.textContent = `Real-time Observation (Step: ${timelineState.currentStepLength}h)`;
  } else {
    // NWP Model Forecast: display init-time select
    if (initWrapper) {
      initWrapper.style.display = "inline-flex";
      if (selInit) {
        const curOpts = Array.from(selInit.options || []).map((o) => o.value).join(",");
        const targetOpts = timelineState.forecastCycles.join(",");
        if (curOpts !== targetOpts) {
          selInit.innerHTML = "";
          timelineState.forecastCycles.forEach((c) => {
            const opt = document.createElement("option");
            opt.value = c;
            opt.textContent = formatForecastInitTime(c);
            selInit.appendChild(opt);
          });
        }
        selInit.value = timelineState.currentInitCycle;
      }
    }
    badge.textContent = "NWP FORECAST";
    badge.className = "mode-badge";
    const curPeriod = timelineState.discretePeriods[timelineState.currentPeriodIdx];
    leadWrapper.innerHTML = `Forecast Lead: <strong id="time-lead-label">${formatLeadTime(curPeriod)}</strong>`;
    validLabel.textContent = `Valid: ${formatForecastValidTime(timelineState.currentInitCycle, curPeriod)} (Step: ${timelineState.currentStepLength}h)`;
  }
}

export function setStepLength(stepVal, triggerCallback = false) {
  pausePlayback();
  timelineState.currentStepLength = parseInt(stepVal, 10) || (timelineState.currentMode === "obs" ? 3 : 6);
  const selStep = typeof document !== "undefined" ? document.getElementById("select-step-length") : null;
  if (selStep) {
    const hasOpt = selStep.options && Array.from(selStep.options).some((o) => String(o.value) === String(timelineState.currentStepLength));
    if (hasOpt) {
      selStep.value = String(timelineState.currentStepLength);
    } else if (selStep.options && selStep.options.length > 0) {
      selStep.selectedIndex = 0;
      selStep.value = selStep.options[0]?.value || "";
      timelineState.currentStepLength = parseInt(selStep.value, 10) || timelineState.currentStepLength;
    } else {
      selStep.value = String(timelineState.currentStepLength);
    }
  }

  if (timelineState.currentMode === "nwp") {
    const curVal = timelineState.discretePeriods[timelineState.currentPeriodIdx] ?? 24;
    timelineState.discretePeriods = getPeriodsForStep(timelineState.currentStepLength);
    let closestIdx = 0;
    let minDiff = Infinity;
    timelineState.discretePeriods.forEach((p, idx) => {
      const diff = Math.abs(p - curVal);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    timelineState.currentPeriodIdx = closestIdx;
    const newPeriod = timelineState.discretePeriods[timelineState.currentPeriodIdx];
    appState.set("period", newPeriod);
    updateLabels();
    renderChips();
    if (triggerCallback && timelineState.onTimeChangeCallback) {
      const seq = incPeriodStepSeq();
      const payload = newPeriod;
      if (typeof payload === "number") {
        const boxed = { period: payload, stepLength: timelineState.currentStepLength, _seq: seq, valueOf() { return payload; } };
        fireTimeChange(boxed);
      } else {
        fireTimeChange(payload);
      }
    }
  } else {
    const curFile = timelineState.obsFiles[timelineState.currentObsIdx] || "";
    const allFiltered = filterObsFilesByStep(timelineState.rawObsFiles, timelineState.currentStepLength, timelineState.isUpperAirMode);
    let targetFile = curFile;
    if (allFiltered.length > 0 && !allFiltered.includes(curFile) && curFile) {
      targetFile = findClosestFile(allFiltered, curFile);
    }
    timelineState.obsFiles = selectObsChipsWindow(allFiltered, targetFile);
    let newIdx = timelineState.obsFiles.indexOf(targetFile);
    timelineState.currentObsIdx = newIdx !== -1 ? newIdx : Math.max(0, timelineState.obsFiles.length - 1);
    updateLabels();
    renderChips();
    if (triggerCallback && timelineState.onTimeChangeCallback && timelineState.obsFiles[timelineState.currentObsIdx]) {
      fireTimeChange({
        isObs: true,
        file: timelineState.obsFiles[timelineState.currentObsIdx],
        stepLength: timelineState.currentStepLength,
        _seq: incPeriodStepSeq(),
      });
    }
  }
  updatePlayButtonDisabledState();
}

export function setTimelineMode(mode, customData = {}) {
  timelineState.currentMode = mode === "obs" ? "obs" : "nwp";
  if (customData.winTitle !== undefined) timelineState.currentWinTitle = customData.winTitle;
  if (customData.initCycle) timelineState.currentInitCycle = customData.initCycle;

  if (timelineState.currentMode === "obs") {
    // Priority: explicit isUpper > path check (reliable) > winTitle heuristic (brittle — e.g. surface product named "upper")
    timelineState.isUpperAirMode = Boolean(
      customData.isUpper ||
      (customData.path && customData.path.includes("UPPER_AIR")) ||
      (customData.winTitle && (customData.winTitle.toLowerCase().includes("upper") || customData.winTitle.toLowerCase().includes("sounding")))
    );
  } else {
    timelineState.isUpperAirMode = false;
  }

  // Set default step length: 12h for upper-air, 3h for surface, 6h for NWP forecast
  let targetStep = customData.stepLength;
  if (!targetStep) {
    if (timelineState.currentMode === "obs") {
      targetStep = timelineState.isUpperAirMode ? 12 : 3;
    } else {
      targetStep = 6;
    }
  }

  timelineState.currentStepLength = targetStep;
  updateStepLengthOptions(timelineState.isUpperAirMode, timelineState.currentStepLength);

  if (timelineState.currentMode === "obs") {
    if (Array.isArray(customData.files) && customData.files.length > 0) {
      timelineState.rawObsFiles = customData.files;
    }
    const allFiltered = filterObsFilesByStep(timelineState.rawObsFiles, timelineState.currentStepLength, timelineState.isUpperAirMode);
    let targetFile = customData.file;
    if (targetFile && !allFiltered.includes(targetFile)) {
      targetFile = findClosestFile(allFiltered, targetFile);
    }
    timelineState.obsFiles = selectObsChipsWindow(allFiltered, targetFile);
    if (targetFile) {
      const idx = timelineState.obsFiles.indexOf(targetFile);
      timelineState.currentObsIdx = idx !== -1 ? idx : Math.max(0, timelineState.obsFiles.length - 1);
    } else {
      timelineState.currentObsIdx = Math.max(0, timelineState.obsFiles.length - 1);
    }
  } else {
    if (Array.isArray(customData.cycles) && customData.cycles.length > 0) {
      timelineState.forecastCycles = customData.cycles;
      if (!timelineState.currentInitCycle || !timelineState.forecastCycles.includes(timelineState.currentInitCycle)) {
        timelineState.currentInitCycle = timelineState.forecastCycles[0];
      }
    } else if (!timelineState.forecastCycles.length || !timelineState.forecastCycles.includes(timelineState.currentInitCycle)) {
      timelineState.forecastCycles = generateDynamicForecastCycles(timelineState.currentInitCycle, 10);
      if (!timelineState.currentInitCycle || !timelineState.forecastCycles.includes(timelineState.currentInitCycle)) {
        timelineState.currentInitCycle = timelineState.forecastCycles[0];
      }
    }

    timelineState.discretePeriods = getPeriodsForStep(timelineState.currentStepLength);
    if (customData.period !== undefined) {
      const idx = timelineState.discretePeriods.indexOf(customData.period);
      timelineState.currentPeriodIdx = idx !== -1 ? idx : Math.min(2, timelineState.discretePeriods.length - 1);
    } else {
      timelineState.currentPeriodIdx = Math.min(4, timelineState.discretePeriods.length - 1);
    }
  }

  if (customData.pause !== false && !customData.silent) {
    pausePlayback();
  }
  updateLabels();
  renderChips();
  updatePlayButtonDisabledState();
  if (customData.visible !== false) {
    setTimeSliderVisible(true);
  }
}

export function initTimeSlider(containerId = "timeslider-container", onTimeChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  pausePlayback();
  timelineState.onTimeChangeCallback = onTimeChange;
  container.classList.add("hidden");

  container.innerHTML = `
    <div class="timeline-stepper">
      <button id="btn-prev" class="step-nav-btn" title="Previous Step (wraps)">◀</button>
      <button id="btn-play" class="play-btn" title="Play / Pause Animation (loops)" aria-label="Play Animation" aria-pressed="false" aria-keyshortcuts="Space">▶</button>
      <button id="btn-next" class="step-nav-btn" title="Next Step (wraps)">▶</button>
      <div class="step-length-control">
        <label for="select-step-length" class="step-length-label">Step:</label>
        <select id="select-step-length" class="step-length-select" title="Change timeline step length">
          <option value="1">1h</option>
          <option value="3">3h</option>
          <option value="6" selected>6h</option>
          <option value="12">12h</option>
          <option value="24">24h</option>
        </select>
      </div>
      <div class="playback-speed-control">
        <label for="select-playback-speed" class="step-length-label">Speed:</label>
        <select id="select-playback-speed" class="step-length-select" title="Change animation playback speed">
          <option value="3000">0.5x</option>
          <option value="1500" selected>1x</option>
          <option value="750">2x</option>
        </select>
      </div>
    </div>

    <div class="timeline-body">
      <div class="timeline-info">
        <span id="time-badge" class="mode-badge">NWP FORECAST</span>
        <span id="time-win-badge" class="win-target-badge" style="display:none;"></span>
        <div id="time-init-wrapper" class="init-time-control" style="display:none;">
          <label for="select-init-time" class="init-time-label">Init:</label>
          <select id="select-init-time" class="init-time-select" title="Select forecast initialization run cycle"></select>
        </div>
        <span id="time-lead-wrapper">Forecast Lead: <strong id="time-lead-label">+024h</strong></span>
        <span id="time-valid-label" class="valid-label">Valid: Analysis + 24h</span>
      </div>

      <!-- Discrete Step Chips Bar (No continuous slider track) -->
      <div class="timeline-chips" id="timeline-chips"></div>
    </div>
  `;

  const btnPrev = document.getElementById("btn-prev");
  if (btnPrev) {
    btnPrev.onclick = () => {
      pausePlayback();
      step(-1, { source: "btn-prev", directions: ["prev"] });
    };
  }

  const btnNext = document.getElementById("btn-next");
  if (btnNext) {
    btnNext.onclick = () => {
      pausePlayback();
      step(1, { source: "btn-next", directions: ["next"] });
    };
  }

  const btnPlay = document.getElementById("btn-play");
  if (btnPlay) {
    btnPlay.onclick = () => {
      if (appState.get("isPlaying")) {
        pausePlayback();
      } else {
        startPlayback();
      }
    };
  }

  const selStep = document.getElementById("select-step-length");
  if (selStep) {
    selStep.onchange = (e) => {
      const newStep = parseInt(e.target.value, 10) || 6;
      setStepLength(newStep, true);
    };
  }

  const selSpeed = document.getElementById("select-playback-speed");
  if (selSpeed) {
    const curSpeed = appState.get("playbackSpeed") || DEFAULT_PLAYBACK_MS;
    selSpeed.value = String(curSpeed);
    selSpeed.onchange = (e) => {
      const newSpeed = parseInt(e.target.value, 10) || DEFAULT_PLAYBACK_MS;
      setPlaybackSpeed(newSpeed);
    };
  }

  const selInit = document.getElementById("select-init-time");
  if (selInit) {
    selInit.onchange = (e) => {
      const newCycle = e.target.value;
      if (newCycle && newCycle !== timelineState.currentInitCycle) {
        timelineState.currentInitCycle = newCycle;
        updateLabels();
        if (timelineState.onTimeChangeCallback) {
          fireTimeChange({
            isInitChange: true,
            initCycle: newCycle,
            period: timelineState.discretePeriods[timelineState.currentPeriodIdx] ?? 24,
          });
        }
      }
    };
  }

  subscribeTimeline(() => {
    updateLabels();
    renderChips();
    updatePlayButtonDisabledState();
  });

  renderChips();
  updateLabels();
  // Re-sync step-length select in case setTimelineMode was called before the DOM was ready
  updateStepLengthOptions(timelineState.isUpperAirMode, timelineState.currentStepLength);
  updatePlayButtonDisabledState();
}
