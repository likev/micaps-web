<script>
  import { onMount } from "svelte";
  import { ui } from "../lib/stores/ui.svelte.js";
  import { app } from "../lib/stores/app.svelte.js";
  import { fetchStatus } from "../api/catalogApi.js";
  import {
    getOrCreateTimeline,
    timelinesByWindow,
  } from "../lib/stores/timeline.svelte.js";
  import {
    formatLeadTime,
    formatObsTimestamp,
    formatForecastInitTime,
    formatForecastValidTime,
  } from "../utils/formatters.js";
  import { getWindowById } from "../lib/stores/tabs.svelte.js";
  import { cursorProbeState } from "../lib/stores/cursorProbe.svelte.js";

  let { winId = "default", onTimeChange = null } = $props();

  $effect(() => {
    if (winId && !timelinesByWindow[winId]) {
      getOrCreateTimeline(winId);
    }
  });

  let timeline = $derived(
    (winId && timelinesByWindow[winId]) || {
      currentMode: "nwp",
      discretePeriods: [],
      currentPeriodIdx: 0,
      obsFiles: [],
      currentObsIdx: 0,
      forecastCycles: [],
      currentInitCycle: "",
      periodStepSeq: 0,
    }
  );

  let isObs = $derived(timeline.currentMode === "obs");
  let periods = $derived(timeline.discretePeriods || []);
  let activePeriod = $derived(periods[timeline.currentPeriodIdx] ?? 0);
  let obsFiles = $derived(timeline.obsFiles || []);
  let activeObsFile = $derived(obsFiles[timeline.currentObsIdx] || "");
  let cycles = $derived(timeline.forecastCycles || []);
  let currentCycle = $derived(timeline.currentInitCycle || "");
  let stepLength = $derived(timeline.currentStepLength || (isObs ? 3 : 6));

  let statusText = $state("Connecting...");
  let statusState = $state("connecting"); // connected | warning | disconnected
  let pollInterval = null;
  let abortController = null;

  async function checkStatus() {
    if (abortController) abortController.abort();
    abortController = new AbortController();
    try {
      const res = await fetchStatus(abortController.signal);
      if (res && res.status === "ok") {
        statusState = res.mock_mode ? "warning" : "connected";
        statusText = res.mock_mode ? "MOCK" : `CASSANDRA :${res.cassandra_port ?? 8000}`;
        app.status = "connected";
        app.isMock = Boolean(res.mock_mode);
      } else {
        statusState = "disconnected";
        statusText = "OFFLINE";
        app.status = "warning";
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        statusState = "disconnected";
        statusText = "OFFLINE";
        app.status = "disconnected";
      }
    }
  }

  onMount(() => {
    checkStatus();
    pollInterval = setInterval(checkStatus, 15000);
    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (abortController) abortController.abort();
    };
  });

  function handleCycleChange(e) {
    const cycle = e.target.value;
    const tl = timelinesByWindow[winId] || getOrCreateTimeline(winId);
    tl.currentInitCycle = cycle;
    app.cycle = cycle;
    if (onTimeChange) {
      onTimeChange({
        cycle,
        period: activePeriod,
        winId,
        _seq: ++tl.periodStepSeq,
      });
    }
    e.target?.blur?.();
  }

  function toggleLayers() {
    ui.layersOpen = !ui.layersOpen;
  }
</script>

<footer id="status-bar" class="status-bar statebar" aria-label="Status Bar">
  <!-- Left section: nav-status-indicator -->
  <div class="status-bar-left">
    <div id="nav-status-indicator" class="nav-status status-indicator" title="Backend Server Status: {statusText}">
      <span
        class="status-dot"
        class:warning={statusState === "warning"}
        class:disconnected={statusState === "disconnected"}
      ></span>
      <span id="nav-status-text" class="status-text">{statusText}</span>
    </div>
  </div>

  <!-- Center section: timeline-info -->
  <div class="status-bar-center">
    <div class="timeline-info" aria-label="Timeline Status">
      {#if app.historyMode && app.historyDate}
        <span id="status-history-badge" class="history-badge" title="History Mode Cutoff: {app.historyDate} 24:00">
          HISTORY · {app.historyDate}
        </span>
      {/if}
      <span class="mode-badge" class:obs-badge={isObs}>
        {isObs ? "OBSERVATION" : "NWP FORECAST"}
      </span>

      {#if !isObs}
        <div class="init-time-control">
          <label for="sl-select-forecast-cycle" class="init-time-label">Init:</label>
          <select
            id="sl-select-forecast-cycle"
            class="init-time-select"
            value={currentCycle}
            onchange={handleCycleChange}
            title="Select forecast initialization cycle"
          >
            {#if cycles.length === 0}
              <option value="">--</option>
            {/if}
            {#each cycles as cycle}
              <option value={cycle}>{formatForecastInitTime(cycle)}</option>
            {/each}
          </select>
        </div>
      {/if}

      <div id="sl-time-lead-wrapper">
        <span class="lead-prefix">{isObs ? "Observation Time: " : "Forecast Lead: "}</span>
        <strong id="sl-time-lead-label">
          {isObs ? (activeObsFile ? formatObsTimestamp(activeObsFile) : "--") : formatLeadTime(activePeriod)}
        </strong>
      </div>

      <div id="sl-time-valid-label" class="valid-label">
        {#if isObs}
          Real-time Observation (Step: {stepLength}h)
        {:else if currentCycle}
          Valid: {formatForecastValidTime(currentCycle, activePeriod)} (Step: {stepLength}h)
        {:else}
          --
        {/if}
      </div>
    </div>

    <!-- Item C: Live Coordinates & Value Probe -->
    <div id="status-cursor-probe" class="status-cursor-probe" title="Live Cursor Probe (Coordinates & Meteorological Values)">
      <span class="probe-icon" aria-hidden="true">📍</span>
      <span id="status-probe-coords" class="probe-coords">{cursorProbeState.formattedCoords}</span>
      {#if cursorProbeState.metValues}
        <span class="probe-divider">|</span>
        <span id="status-probe-values" class="probe-values">{cursorProbeState.metValues}</span>
      {/if}
    </div>
  </div>

  <!-- Right section: btn-toggle-layers with toggle switch UI -->
  <div class="status-bar-right">
    <button
      id="btn-toggle-layers"
      type="button"
      class="btn-toggle-layers"
      class:active={ui.layersOpen}
      role="switch"
      aria-checked={ui.layersOpen}
      aria-label="Toggle Layers Panel"
      title={ui.layersOpen ? "Hide Layers Panel" : "Show Layers Panel"}
      onclick={toggleLayers}
    >
      <span class="layers-icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
          <path d="m8 1.5 6 3-6 3-6-3 6-3zm0 5.25L13.5 4 14 4.25v2.5L8 10 2 6.75v-2.5L2.5 4 8 6.75zM2 9.25 2.5 9 8 11.75 13.5 9l.5.25v2.5L8 15l-6-3.25v-2.5z"/>
        </svg>
      </span>
      <span class="layers-label">Layers</span>
      <span class="toggle-switch-ui" class:on={ui.layersOpen} aria-hidden="true">
        <span class="toggle-thumb"></span>
      </span>
      <span class="toggle-state-pill" class:active={ui.layersOpen}>{ui.layersOpen ? "ON" : "OFF"}</span>
    </button>
  </div>
</footer>

<style>
  .status-bar {
    height: 32px;
    min-height: 32px;
    background: var(--bg-footer, #0d1117);
    border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    gap: 12px;
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
    z-index: 1000;
    flex-shrink: 0;
    user-select: none;
    box-sizing: border-box;
  }

  .status-bar-left,
  .status-bar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .status-bar-center {
    display: flex;
    align-items: center;
    min-width: 0;
    flex: 1;
    justify-content: center;
  }

  .btn-toggle-layers {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--bg-card, #21262d);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    color: var(--text-primary, #e6edf3);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-toggle-layers:hover {
    background: var(--bg-hover, #30363d);
    border-color: var(--accent-blue, rgba(255, 255, 255, 0.2));
  }

  .btn-toggle-layers.active {
    background: rgba(56, 139, 253, 0.15);
    border-color: rgba(56, 139, 253, 0.5);
    color: #79c0ff;
  }

  .layers-icon {
    display: inline-flex;
    align-items: center;
    color: inherit;
  }

  .layers-label {
    font-weight: 600;
  }

  .toggle-switch-ui {
    position: relative;
    display: inline-block;
    width: 24px;
    height: 13px;
    background: var(--bg-hover, #30363d);
    border-radius: 7px;
    transition: background-color 0.2s ease;
  }

  .toggle-switch-ui.on {
    background: var(--accent-green, #238636);
  }

  .toggle-thumb {
    position: absolute;
    top: 1.5px;
    left: 2px;
    width: 10px;
    height: 10px;
    background: #ffffff;
    border-radius: 50%;
    transition: transform 0.2s ease;
  }

  .toggle-switch-ui.on .toggle-thumb {
    transform: translateX(10px);
  }

  .toggle-state-pill {
    font-size: 9.5px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--bg-card, #30363d);
    color: var(--text-secondary, #8b949e);
    font-family: var(--font-mono, monospace);
  }

  .toggle-state-pill.active {
    background: rgba(35, 134, 54, 0.25);
    color: #3fb950;
  }

  .timeline-info {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    row-gap: 2px;
    column-gap: 12px;
    font-size: 11px;
    font-family: var(--font-mono, monospace);
    min-width: 0;
  }

  .history-badge {
    padding: 1px 6px;
    border-radius: 3px;
    background: rgba(210, 153, 34, 0.2);
    border: 1px solid #d29922;
    color: #e3b341;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .mode-badge {
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(56, 139, 253, 0.18);
    border: 1px solid var(--accent-blue, #388bfd);
    color: #79c0ff;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.3px;
  }

  .mode-badge.obs-badge {
    background: rgba(46, 160, 67, 0.18);
    border-color: #2ea043;
    color: #56d364;
  }

  .init-time-control {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .init-time-label {
    color: var(--text-secondary, #8b949e);
  }

  .init-time-select {
    background: var(--bg-card, #21262d);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 3px;
    color: var(--text-primary, #e6edf3);
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    padding: 1px 4px;
    outline: none;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .init-time-select:hover,
  .init-time-select:focus {
    background: var(--bg-hover, #30363d);
    border-color: var(--accent-blue, #388bfd);
  }

  #sl-time-lead-wrapper {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lead-prefix {
    color: #8b949e;
  }

  #sl-time-lead-label {
    color: #e6edf3;
  }

  .valid-label {
    color: #8b949e;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-family: var(--font-mono, monospace);
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent-green, #2ea043);
  }

  .status-dot.warning {
    background: var(--accent-orange, #d29922);
  }

  .status-dot.disconnected {
    background: var(--accent-red, #f85149);
  }

  .status-text {
    color: #8b949e;
    font-size: 11px;
  }

  .status-cursor-probe {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 4px;
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--text-primary, #e6edf3);
    margin-left: 12px;
    white-space: nowrap;
  }

  .probe-icon {
    font-size: 11px;
    opacity: 0.8;
  }

  .probe-coords {
    color: #79c0ff;
    font-weight: 600;
  }

  .probe-divider {
    color: var(--border-color, rgba(255, 255, 255, 0.2));
  }

  .probe-values {
    color: var(--accent-green, #2ea043);
    font-weight: 500;
  }
</style>
