<script>
  import { onDestroy } from "svelte";
  import { ui } from "../lib/stores/ui.svelte.js";
  import { app } from "../lib/stores/app.svelte.js";
  import {
    getOrCreateTimeline,
    goToPeriod,
    goToObsFile,
    playback,
    timelinesByWindow,
    DEFAULT_PLAYBACK_MS,
  } from "../lib/stores/timeline.svelte.js";
  import { createTimelineState } from "../lib/stores/timelineCore.js";
  import {
    formatLeadTime,
    formatObsTimestamp,
    formatForecastInitTime,
    formatForecastValidTime,
  } from "../utils/formatters.js";
  import { getPeriodsForStep, filterObsFilesByStep, selectObsChipsWindow } from "../lib/stores/timelineMath.js";
  import { stepWindowTimeline } from "../lib/services/appWorkflow.js";

  let { winId = "default", onTimeChange = null } = $props();

  $effect(() => {
    if (winId && !timelinesByWindow[winId]) {
      getOrCreateTimeline(winId);
    }
  });

  let previousWinId = $state(winId);
  $effect(() => {
    if (winId !== previousWinId) {
      previousWinId = winId;
      if (playback.isPlaying) {
        pause();
      }
    }
  });

  let timeline = $derived(timelinesByWindow[winId] || {
    currentMode: "nwp",
    discretePeriods: [],
    currentPeriodIdx: 0,
    obsFiles: [],
    currentObsIdx: 0,
    forecastCycles: [],
    currentInitCycle: "",
    periodStepSeq: 0,
  });
  let isObs = $derived(timeline.currentMode === "obs");
  let periods = $derived(timeline.discretePeriods || []);
  let activePeriod = $derived(periods[timeline.currentPeriodIdx] ?? 0);
  let obsFiles = $derived(timeline.obsFiles || []);
  let activeObsFile = $derived(obsFiles[timeline.currentObsIdx] || "");
  let cycles = $derived(timeline.forecastCycles || []);
  let currentCycle = $derived(timeline.currentInitCycle || "");

  let playTimer = null;

  function handleStep(delta, options = {}) {
    if (!options.fromPlay) {
      pause();
    }
    const tl = timelinesByWindow[winId] || getOrCreateTimeline(winId);
    const res = stepWindowTimeline(tl, delta);
    if (!res) return;
    if (!res.isObs) {
      app.period = res.period;
    }
    if (onTimeChange) onTimeChange(res);
  }

  function handleChipClick(idx) {
    pause();
    if (isObs) {
      const file = obsFiles[idx];
      if (file) {
        goToObsFile(winId, file);
        if (onTimeChange) onTimeChange({ isObs: true, file, _seq: ++timeline.periodStepSeq });
      }
    } else {
      const p = periods[idx];
      if (p !== undefined) {
        goToPeriod(winId, p);
        app.period = p;
        if (onTimeChange) onTimeChange({ period: p, cycle: currentCycle, _seq: ++timeline.periodStepSeq });
      }
    }
  }

  function handleCycleChange(e) {
    const cycle = e.target.value;
    timeline.currentInitCycle = cycle;
    app.cycle = cycle;
    if (onTimeChange) {
      onTimeChange({
        cycle,
        period: activePeriod,
        _seq: ++timeline.periodStepSeq,
      });
    }
  }

  function handleStepLengthChange(e) {
    const step = parseInt(e.target.value, 10);
    timeline.currentStepLength = step;
    if (!isObs) {
      timeline.discretePeriods = getPeriodsForStep(step);
      if (timeline.currentPeriodIdx >= timeline.discretePeriods.length) {
        timeline.currentPeriodIdx = 0;
      }
    } else {
      const filtered = filterObsFilesByStep(timeline.rawObsFiles, step, timeline.isUpperAirMode);
      timeline.obsFiles = selectObsChipsWindow(filtered);
      timeline.currentObsIdx = Math.max(0, timeline.obsFiles.length - 1);
    }
  }

  function togglePlay() {
    if (playback.isPlaying) {
      pause();
    } else {
      start();
    }
  }

  function start() {
    playback.isPlaying = true;
    app.isPlaying = true;
    if (playTimer) clearInterval(playTimer);
    playTimer = setInterval(() => {
      handleStep(1, { fromPlay: true });
    }, playback.speed || DEFAULT_PLAYBACK_MS);
  }

  function pause() {
    playback.isPlaying = false;
    app.isPlaying = false;
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
  }

  function handleSpeedChange(e) {
    const spd = parseInt(e.target.value, 10);
    playback.speed = spd;
    app.playbackSpeed = spd;
    if (playback.isPlaying) {
      start(); // restart with new speed
    }
  }

  $effect(() => {
    function handleVisibility() {
      if (document.hidden && playback.isPlaying) {
        pause();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (playTimer) {
        clearInterval(playTimer);
        playTimer = null;
      }
    };
  });

  $effect(() => {
    if (!ui.timelineVisible && playback.isPlaying) {
      pause();
    }
  });

  $effect(() => {
    if (playback.isPlaying && !playTimer) {
      start();
    } else if (!playback.isPlaying && playTimer) {
      pause();
    }
  });

  onDestroy(() => {
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
  });
</script>

{#if ui.timelineVisible && !ui.configOpen}
  <footer id="timeslider-container" class="timeslider-container" aria-label="Timeline and Playback Controls">
    <div class="timeline-stepper">
      <button
        id="btn-play"
        class="play-btn"
        class:active={playback.isPlaying}
        type="button"
        title={playback.isPlaying ? "Pause Playback (Space)" : "Start Playback (Space)"}
        aria-label={playback.isPlaying ? "Pause" : "Play"}
        onclick={togglePlay}
      >
        {#if playback.isPlaying}
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
        {:else}
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        {/if}
      </button>

      <button
        id="btn-step-prev"
        class="step-nav-btn"
        type="button"
        title="Previous Step (Left Arrow)"
        aria-label="Previous step"
        onclick={() => handleStep(-1)}
      >◀</button>

      <button
        id="btn-step-next"
        class="step-nav-btn"
        type="button"
        title="Next Step (Right Arrow)"
        aria-label="Next step"
        onclick={() => handleStep(1)}
      >▶</button>

      <div class="step-length-control">
        <label for="select-step-length" class="step-length-label">Step:</label>
        <select
          id="select-step-length"
          class="step-length-select"
          value={timeline.currentStepLength}
          onchange={handleStepLengthChange}
        >
          {#if timeline.isUpperAirMode}
            <option value="6">6h</option>
            <option value="12">12h</option>
            <option value="24">24h</option>
          {:else}
            <option value="1">1h</option>
            <option value="3">3h</option>
            <option value="6">6h</option>
            <option value="12">12h</option>
            <option value="24">24h</option>
          {/if}
        </select>
      </div>

      <div class="playback-speed-control">
        <label for="select-playback-speed" class="step-length-label">Speed:</label>
        <select
          id="select-playback-speed"
          class="step-length-select"
          value={playback.speed}
          onchange={handleSpeedChange}
        >
          <option value="3000">0.5x</option>
          <option value="1500">1.0x</option>
          <option value="750">2.0x</option>
        </select>
      </div>
    </div>

    <div class="timeline-body">
      <div class="timeline-info">
        <span class="mode-badge" class:obs-badge={isObs}>
          {isObs ? "OBSERVATION" : "NWP FORECAST"}
        </span>

        {#if !isObs}
          <div class="init-time-control">
            <label for="select-forecast-cycle" class="init-time-label">Init:</label>
            <select
              id="select-forecast-cycle"
              class="init-time-select"
              value={currentCycle}
              onchange={handleCycleChange}
            >
              {#each cycles as cycle}
                <option value={cycle}>{formatForecastInitTime(cycle)}</option>
              {/each}
            </select>
          </div>
        {/if}

        <div id="time-lead-wrapper">
          {isObs ? "Observation Time: " : "Forecast Lead: "}
          <strong id="time-lead-label">
            {isObs ? (activeObsFile ? formatObsTimestamp(activeObsFile) : "--") : formatLeadTime(activePeriod)}
          </strong>
        </div>

        <div id="time-valid-label" class="valid-label">
          {#if isObs}
            Real-time Observation (Step: {timeline.currentStepLength || 3}h)
          {:else if currentCycle}
            Valid: {formatForecastValidTime(currentCycle, activePeriod)} (Step: {timeline.currentStepLength || 6}h)
          {/if}
        </div>
      </div>

      <div id="timeline-chips" class="timeline-chips" role="tablist" aria-label={isObs ? "Observation time steps" : "Forecast lead time steps"}>
        {#if isObs}
          {#each obsFiles as file, idx}
            <button
              class="chip-btn"
              class:active={idx === timeline.currentObsIdx}
              role="tab"
              aria-selected={idx === timeline.currentObsIdx}
              onclick={() => handleChipClick(idx)}
              data-testid="timeline-chip"
              data-file={file}
            >
              {file.length >= 10 ? `${file.slice(4, 6)}/${file.slice(6, 8)} ${file.slice(8, 10)}:${file.slice(10, 12) || "00"}` : file}
            </button>
          {/each}
        {:else}
          {#each periods as p, idx}
            <button
              class="chip-btn"
              class:active={idx === timeline.currentPeriodIdx}
              role="tab"
              aria-selected={idx === timeline.currentPeriodIdx}
              onclick={() => handleChipClick(idx)}
              data-testid="timeline-chip"
              data-period={p}
            >
              {p === 0 ? "000h" : `+${p}h`}
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </footer>
{:else}
  <footer id="timeslider-container" class="timeslider-container hidden"></footer>
{/if}

<style>
  .timeslider-container {
    min-height: 60px;
    height: auto;
    background: var(--bg-secondary, #121824);
    border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    display: flex;
    align-items: center;
    padding: 6px 20px;
    gap: 16px;
    z-index: 1000;
  }

  .timeslider-container.hidden {
    display: none !important;
  }

  .play-btn {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--accent-blue, #388bfd);
    color: white;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 13px;
    flex-shrink: 0;
    transition: background 0.15s ease;
  }

  .play-btn:hover {
    background: #58a6ff;
  }

  .play-btn.active {
    background: #1f6feb;
    box-shadow: 0 0 10px rgba(56, 139, 253, 0.6);
  }

  .timeline-stepper {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .step-nav-btn {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    background: #21262d;
    color: #c9d1d9;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 11px;
  }

  .step-nav-btn:hover {
    background: #30363d;
    color: #ffffff;
  }

  .step-length-control,
  .playback-speed-control {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: 6px;
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
  }

  .step-length-label {
    font-size: 11px;
    color: #8b949e;
    font-weight: 500;
  }

  .step-length-select,
  .init-time-select {
    background: #21262d;
    color: #58a6ff;
    font-weight: 600;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 11px;
    font-family: var(--font-mono, monospace);
    outline: none;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .step-length-select:hover,
  .init-time-select:hover,
  .step-length-select:focus,
  .init-time-select:focus {
    border-color: var(--accent-blue, #388bfd);
    background: #282e37;
  }

  .init-time-control {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
  }

  .init-time-label {
    font-size: 11px;
    color: #8b949e;
    font-weight: 500;
  }

  .timeline-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .timeline-info {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    row-gap: 4px;
    column-gap: 12px;
    font-size: 12px;
    font-family: var(--font-mono, monospace);
    min-width: 0;
  }

  .mode-badge {
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(56, 139, 253, 0.2);
    border: 1px solid var(--accent-blue, #388bfd);
    color: #79c0ff;
    font-size: 10px;
    font-weight: bold;
  }

  .mode-badge.obs-badge {
    background: rgba(46, 160, 67, 0.2);
    border-color: #2ea043;
    color: #56d364;
  }

  #time-lead-wrapper {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .valid-label {
    margin-left: auto;
    color: #8b949e;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .timeline-chips {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .chip-btn {
    padding: 4px 10px;
    border-radius: 12px;
    background: #21262d;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    color: #8b949e;
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .chip-btn:hover {
    background: #30363d;
    color: #c9d1d9;
  }

  .chip-btn.active {
    background: var(--accent-blue, #388bfd);
    border-color: #58a6ff;
    color: #ffffff;
    font-weight: bold;
    box-shadow: 0 0 8px rgba(56, 139, 253, 0.4);
  }
</style>
