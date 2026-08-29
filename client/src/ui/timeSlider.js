// timeSlider.js - Discrete forecast lead time stepper and observation timeline with step-length selection
import { appState } from "../store/appState.js";
import { formatLeadTime, formatObsTimestamp, formatForecastInitTime, formatForecastValidTime } from "../utils/formatters.js";

let playTimer = null;
let currentMode = "nwp"; // "nwp" or "obs"
let currentStepLength = 6; // 6h forecast, 3h surface, 12h upper-air

let discretePeriods = [0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 84, 96, 108, 120];
let currentPeriodIdx = 4; // default +024h
let currentInitCycle = "26082820";
let forecastCycles = [
  "26082908",
  "26082820",
  "26082808",
  "26082720",
  "26082708",
  "26082620",
  "26082608",
  "26082520",
];

let rawObsFiles = [
  "20260827080000.000",
  "20260827110000.000",
  "20260827140000.000",
  "20260827170000.000",
  "20260827200000.000",
  "20260828020000.000",
  "20260828050000.000",
  "20260828080000.000",
  "20260828110000.000",
  "20260828140000.000",
  "20260828170000.000",
  "20260828200000.000",
];
let obsFiles = [...rawObsFiles];
let currentObsIdx = obsFiles.length - 1;

let onTimeChangeCallback = null;
let currentWinTitle = "";
let isUpperAirMode = false;

export function getPeriodsForStep(step = 6) {
  const stepNum = parseInt(step, 10) || 6;
  const periods = [0];
  if (stepNum === 1) {
    for (let p = 1; p <= 36; p += 1) periods.push(p);
    for (let p = 39; p <= 72; p += 3) periods.push(p);
  } else if (stepNum === 3) {
    for (let p = 3; p <= 72; p += 3) periods.push(p);
    for (let p = 78; p <= 120; p += 6) periods.push(p);
  } else if (stepNum === 6) {
    for (let p = 6; p <= 120; p += 6) periods.push(p);
    for (let p = 132; p <= 240; p += 12) periods.push(p);
  } else if (stepNum === 12) {
    for (let p = 12; p <= 240; p += 12) periods.push(p);
  } else if (stepNum === 24) {
    for (let p = 24; p <= 240; p += 24) periods.push(p);
  } else {
    for (let p = stepNum; p <= 120; p += stepNum) periods.push(p);
  }
  return periods;
}

export function filterObsFilesByStep(files, stepHours, isUpper = false) {
  if (!Array.isArray(files) || files.length === 0) return [];

  if (isUpper) {
    const stepNum = parseInt(stepHours, 10) || 12;
    if (stepNum === 12) {
      // ONLY select 08:00 and 20:00 (UTC+8), filter out 14:00 and 02:00
      const filtered = files.filter((f) => {
        if (f.length < 10) return true;
        const hour = parseInt(f.slice(8, 10), 10);
        return hour === 8 || hour === 20;
      });
      return filtered.length > 0 ? filtered : files.filter((f) => {
        const hour = parseInt(f.slice(8, 10), 10);
        return hour !== 2 && hour !== 14;
      });
    } else if (stepNum === 6) {
      // 6h upper-air runs: 02:00, 08:00, 14:00, 20:00 (UTC+8)
      const filtered = files.filter((f) => {
        if (f.length < 10) return true;
        const hour = parseInt(f.slice(8, 10), 10);
        return hour === 2 || hour === 8 || hour === 14 || hour === 20;
      });
      return filtered.length > 0 ? filtered : [...files];
    }
  }

  if (stepHours <= 1) return [...files];

  const filtered = [];
  let lastTimeMs = 0;
  for (const file of files) {
    if (file.length >= 10) {
      const year = parseInt(file.slice(0, 4), 10);
      const month = parseInt(file.slice(4, 6), 10) - 1;
      const day = parseInt(file.slice(6, 8), 10);
      const hour = parseInt(file.slice(8, 10), 10);
      const min = parseInt(file.slice(10, 12) || "0", 10);
      const timeMs = Date.UTC(year, month, day, hour, min);
      if (lastTimeMs === 0 || Math.abs(timeMs - lastTimeMs) >= (stepHours * 3600000 - 1800000)) {
        filtered.push(file);
        lastTimeMs = timeMs;
      }
    } else {
      filtered.push(file);
    }
  }
  return filtered.length > 0 ? filtered : [...files];
}

function updateStepLengthOptions(isUpper, currentStep) {
  const selStep = document.getElementById("select-step-length");
  if (!selStep) return;

  const targetOptions = isUpper
    ? [
        { value: "12", label: "12h" },
        { value: "6", label: "6h" },
      ]
    : [
        { value: "1", label: "1h" },
        { value: "3", label: "3h" },
        { value: "6", label: "6h" },
        { value: "12", label: "12h" },
        { value: "24", label: "24h" },
      ];

  const currentOptsStr = Array.from(selStep.options).map((o) => o.value).join(",");
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
  currentStepLength = parseInt(valToSet, 10);
}

export function setTimeSliderVisible(visible = true) {
  const container = document.getElementById("timeslider-container");
  if (!container) return;
  container.classList.toggle("hidden", !visible);
}

export function initTimeSlider(containerId = "timeslider-container", onTimeChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  onTimeChangeCallback = onTimeChange;
  container.classList.add("hidden");

  container.innerHTML = `
    <div class="timeline-stepper">
      <button id="btn-prev" class="step-nav-btn" title="Previous Step">◀</button>
      <button id="btn-play" class="play-btn" title="Play / Pause Animation">▶</button>
      <button id="btn-next" class="step-nav-btn" title="Next Step">▶</button>
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

  document.getElementById("btn-prev")?.addEventListener("click", () => step(-1));
  document.getElementById("btn-next")?.addEventListener("click", () => step(1));

  document.getElementById("btn-play")?.addEventListener("click", () => {
    if (playTimer) {
      pausePlayback();
    } else {
      startPlayback();
    }
  });

  const selStep = document.getElementById("select-step-length");
  if (selStep) {
    selStep.addEventListener("change", (e) => {
      const newStep = parseInt(e.target.value, 10) || 6;
      setStepLength(newStep, true);
    });
  }

  const selInit = document.getElementById("select-init-time");
  if (selInit) {
    selInit.addEventListener("change", (e) => {
      const newCycle = e.target.value;
      if (newCycle && newCycle !== currentInitCycle) {
        currentInitCycle = newCycle;
        updateLabels();
        if (onTimeChangeCallback) {
          onTimeChangeCallback({
            isInitChange: true,
            initCycle: newCycle,
            period: discretePeriods[currentPeriodIdx] ?? 24,
          });
        }
      }
    });
  }

  renderChips();
  updateLabels();
}

export function setStepLength(step, triggerCallback = false) {
  currentStepLength = parseInt(step, 10) || (currentMode === "obs" ? 3 : 6);
  const selStep = document.getElementById("select-step-length");
  if (selStep && selStep.value !== String(currentStepLength)) {
    selStep.value = String(currentStepLength);
  }

  if (currentMode === "nwp") {
    const curVal = discretePeriods[currentPeriodIdx] ?? 24;
    discretePeriods = getPeriodsForStep(currentStepLength);
    let closestIdx = 0;
    let minDiff = Infinity;
    discretePeriods.forEach((p, idx) => {
      const diff = Math.abs(p - curVal);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    currentPeriodIdx = closestIdx;
    const newPeriod = discretePeriods[currentPeriodIdx];
    appState.set("period", newPeriod);
    updateLabels();
    renderChips();
    if (triggerCallback && onTimeChangeCallback) onTimeChangeCallback(newPeriod);
  } else {
    const curFile = obsFiles[currentObsIdx] || "";
    obsFiles = filterObsFilesByStep(rawObsFiles, currentStepLength, isUpperAirMode);
    const newIdx = obsFiles.indexOf(curFile);
    currentObsIdx = newIdx !== -1 ? newIdx : Math.max(0, obsFiles.length - 1);
    updateLabels();
    renderChips();
    if (triggerCallback && onTimeChangeCallback && obsFiles[currentObsIdx]) {
      onTimeChangeCallback({ isObs: true, file: obsFiles[currentObsIdx] });
    }
  }
}

function renderChips() {
  const chipsContainer = document.getElementById("timeline-chips");
  if (!chipsContainer) return;
  chipsContainer.innerHTML = "";

  if (currentMode === "obs") {
    obsFiles.forEach((file, idx) => {
      const btn = document.createElement("button");
      btn.className = `chip-btn ${idx === currentObsIdx ? "active" : ""}`;
      const timeLabel = file.length >= 10
        ? `${file.slice(4, 6)}/${file.slice(6, 8)} ${file.slice(8, 10)}:${file.slice(10, 12) || "00"}`
        : file;
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
  const winBadge = document.getElementById("time-win-badge");
  const initWrapper = document.getElementById("time-init-wrapper");
  const selInit = document.getElementById("select-init-time");
  const leadWrapper = document.getElementById("time-lead-wrapper");
  const validLabel = document.getElementById("time-valid-label");

  if (!badge || !leadWrapper || !validLabel) return;

  if (winBadge) {
    if (currentWinTitle) {
      winBadge.textContent = currentWinTitle;
      winBadge.style.display = "inline-block";
      winBadge.title = currentWinTitle;
    } else {
      winBadge.style.display = "none";
    }
  }

  if (currentMode === "obs") {
    if (initWrapper) initWrapper.style.display = "none";
    badge.textContent = "OBSERVATION";
    badge.className = "mode-badge obs-badge";
    const curFile = obsFiles[currentObsIdx] || "";
    leadWrapper.innerHTML = `Observation Time: <strong id="time-lead-label">${formatObsTimestamp(curFile)}</strong>`;
    validLabel.textContent = `Real-time Observation (Step: ${currentStepLength}h)`;
  } else {
    // NWP Model Forecast: display init-time select
    if (initWrapper) {
      initWrapper.style.display = "inline-flex";
      if (selInit) {
        const curOpts = Array.from(selInit.options).map((o) => o.value).join(",");
        const targetOpts = forecastCycles.join(",");
        if (curOpts !== targetOpts) {
          selInit.innerHTML = "";
          forecastCycles.forEach((c) => {
            const opt = document.createElement("option");
            opt.value = c;
            opt.textContent = formatForecastInitTime(c);
            selInit.appendChild(opt);
          });
        }
        selInit.value = currentInitCycle;
      }
    }
    badge.textContent = "NWP FORECAST";
    badge.className = "mode-badge";
    const curPeriod = discretePeriods[currentPeriodIdx];
    leadWrapper.innerHTML = `Forecast Lead: <strong id="time-lead-label">${formatLeadTime(curPeriod)}</strong>`;
    validLabel.textContent = `Valid: ${formatForecastValidTime(currentInitCycle, curPeriod)} (Step: ${currentStepLength}h)`;
  }
}

export function step(delta) {
  if (currentMode === "obs") {
    if (obsFiles.length === 0) return;
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
  if (customData.winTitle !== undefined) currentWinTitle = customData.winTitle;
  if (customData.initCycle) currentInitCycle = customData.initCycle;

  if (currentMode === "obs") {
    isUpperAirMode = Boolean(
      customData.isUpper ||
      (customData.path && customData.path.includes("UPPER_AIR")) ||
      (customData.winTitle && (customData.winTitle.toLowerCase().includes("upper") || customData.winTitle.toLowerCase().includes("sounding")))
    );
  } else {
    isUpperAirMode = false;
  }

  // Set default step length: 12h for upper-air, 3h for surface, 6h for NWP forecast
  let targetStep = customData.stepLength;
  if (!targetStep) {
    if (currentMode === "obs") {
      targetStep = isUpperAirMode ? 12 : 3;
    } else {
      targetStep = 6;
    }
  }

  currentStepLength = targetStep;
  updateStepLengthOptions(isUpperAirMode, currentStepLength);

  if (currentMode === "obs") {
    if (Array.isArray(customData.files) && customData.files.length > 0) {
      rawObsFiles = customData.files;
    }
    obsFiles = filterObsFilesByStep(rawObsFiles, currentStepLength, isUpperAirMode);
    if (customData.file) {
      const idx = obsFiles.indexOf(customData.file);
      currentObsIdx = idx !== -1 ? idx : Math.max(0, obsFiles.length - 1);
    } else {
      currentObsIdx = Math.max(0, obsFiles.length - 1);
    }
  } else {
    if (Array.isArray(customData.cycles) && customData.cycles.length > 0) {
      forecastCycles = customData.cycles;
      if (!currentInitCycle || !forecastCycles.includes(currentInitCycle)) {
        currentInitCycle = forecastCycles[0];
      }
    } else if (!forecastCycles.length || !forecastCycles.includes(currentInitCycle)) {
      forecastCycles = [
        currentInitCycle || "26082908",
        "26082820",
        "26082808",
        "26082720",
        "26082708",
        "26082620",
        "26082608",
        "26082520",
      ];
    }

    discretePeriods = getPeriodsForStep(currentStepLength);
    if (customData.period !== undefined) {
      const idx = discretePeriods.indexOf(customData.period);
      currentPeriodIdx = idx !== -1 ? idx : Math.min(2, discretePeriods.length - 1);
    } else {
      currentPeriodIdx = Math.min(4, discretePeriods.length - 1);
    }
  }

  pausePlayback();
  updateLabels();
  renderChips();
  if (customData.visible !== false) {
    setTimeSliderVisible(true);
  }
}

