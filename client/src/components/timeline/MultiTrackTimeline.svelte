<script>
  import { onMount, onDestroy } from "svelte";
  import {
    parseTimestamp,
    formatZuluTime,
    formatFullZuluTime,
    formatAgeOffset,
    resolveLayerTime,
    generateCadenceSampleEntries,
    isBasemapLayer,
  } from "../../utils/timeResolver.js";

  let {
    winId = "default",
    layers = [],
    timeline = null,
    isPlaying = false,
    speed = 1500,
    onTimeChange = null,
    onTogglePlay = null,
    onStep = null,
    onSpeedChange = null,
    onToggleCollapse = null,
  } = $props();

  let weatherLayers = $derived(layers.filter((l) => l && !isBasemapLayer(l)));

  // Mode: "review" or "live" (§2.6)
  let mode = $state(timeline?.timelineMode || "review");
  let pacemakerId = $state(timeline?.pacemakerId || (layers.find((l) => l && !isBasemapLayer(l))?.id || null));
  let snapToPacemaker = $state(timeline?.snapToPacemaker !== undefined ? timeline.snapToPacemaker : true);
  let loopActive = $state(timeline?.loopRange?.active || false);
  let loopStartPct = $state(0.2); // 20% along ruler
  let loopEndPct = $state(0.85); // 85% along ruler

  // Time window bounds: 3 hours total window around cursor by default
  let cursorMs = $state(
    timeline?.wallClockCursor ||
    (timeline?.obsFiles?.length ? parseTimestamp(timeline.obsFiles[timeline.currentObsIdx]) : null) ||
    (timeline?.currentInitCycle || timeline?.forecastCycle ? parseTimestamp({ cycle: timeline.currentInitCycle || timeline.forecastCycle, period: timeline.discretePeriods?.[timeline.currentPeriodIdx] ?? 24 }) : null) ||
    Date.now()
  );

  let isDraggingPlayhead = false;
  let isDraggingHandleIn = false;
  let isDraggingHandleOut = false;
  let tracksContainerEl = null;

  let windowDurationMs = $state(3 * 3600 * 1000); // 3 hours window
  let windowCenterMs = $state(cursorMs);

  // Synchronize cursor if external timeline changes
  $effect(() => {
    if (timeline?.wallClockCursor && Math.abs(timeline.wallClockCursor - cursorMs) > 1000) {
      cursorMs = timeline.wallClockCursor;
      if (!isDraggingPlayhead) {
        windowCenterMs = timeline.wallClockCursor;
      }
    }
  });

  // Re-center window when cursor moves significantly and playhead is not actively dragged
  $effect(() => {
    if (!isDraggingPlayhead) {
      const half = windowDurationMs / 2;
      if (Math.abs(cursorMs - windowCenterMs) > half * 0.7) {
        windowCenterMs = cursorMs;
      }
    }
  });

  let windowStartMs = $derived(windowCenterMs - windowDurationMs * 0.65);
  let windowEndMs = $derived(windowCenterMs + windowDurationMs * 0.35);

  // Dynamic sync with external timeline / preset changes (§2.6)
  $effect(() => {
    if (timeline?.timelineMode && timeline.timelineMode !== mode) {
      mode = timeline.timelineMode;
    }
  });

  $effect(() => {
    if (timeline?.pacemakerId && timeline.pacemakerId !== pacemakerId) {
      pacemakerId = timeline.pacemakerId;
    }
  });

  $effect(() => {
    if (timeline?.loopRange?.active !== undefined && timeline.loopRange.active !== loopActive) {
      loopActive = timeline.loopRange.active;
    }
  });

  $effect(() => {
    if (!isDraggingHandleIn && !isDraggingHandleOut && timeline?.loopRange) {
      const span = windowEndMs - windowStartMs;
      if (span > 0) {
        const start = timeline.loopRange.start ?? timeline.loopRange.startMs;
        const end = timeline.loopRange.end ?? timeline.loopRange.endMs;
        if (typeof start === "number") {
          loopStartPct = Math.max(0, Math.min(0.95, (start - windowStartMs) / span));
        }
        if (typeof end === "number") {
          loopEndPct = Math.max(loopStartPct + 0.05, Math.min(1, (end - windowStartMs) / span));
        }
      }
    }
  });

  $effect(() => {
    if (timeline?.snapToPacemaker !== undefined && timeline.snapToPacemaker !== snapToPacemaker) {
      snapToPacemaker = timeline.snapToPacemaker;
    }
  });

  // Live mode ticker: advances cursor every 10s (§2.6)
  $effect(() => {
    if (mode !== "live") return;
    cursorMs = Date.now();
    windowCenterMs = cursorMs;
    const timer = setInterval(() => {
      cursorMs = Date.now();
      windowCenterMs = cursorMs;
      if (timeline) timeline.wallClockCursor = cursorMs;
      if (onTimeChange) {
        onTimeChange({
          cursorTime: cursorMs,
          cursorTimeZ: formatZuluTime(cursorMs),
          isLive: true,
          winId,
        });
      }
    }, 10000);
    return () => clearInterval(timer);
  });

  // Default pacemaker if none set or if pacemakerId not found in layers
  $effect(() => {
    const hasPacemaker = weatherLayers.some((l) => l.id === pacemakerId);
    if (!hasPacemaker && weatherLayers.length > 0) {
      pacemakerId = weatherLayers[0].id;
      if (timeline) timeline.pacemakerId = pacemakerId;
    }
  });

  let pacemakerLayer = $derived(weatherLayers.find((l) => l.id === pacemakerId) || weatherLayers[0] || null);

  // Generate or extract samples per layer for lanes
  let laneData = $derived(
    weatherLayers.filter((l) => l.visible !== false).map((layer) => {
      let samples = [];
      const cadence = layer.sampleCadenceMinutes ||
        (layer.element?.includes("RADAR") ? 5 :
        layer.element?.includes("SAT") || layer.element?.includes("IR") ? 10 :
        layer.model?.includes("SURFACE") ? 60 :
        layer.model?.includes("UPPER_AIR") ? 720 : 60);

      if (Array.isArray(layer.sampleTimes) && layer.sampleTimes.length > 0) {
        samples = layer.sampleTimes.map((t) => parseTimestamp(t)).filter((t) => t !== null);
      } else if (Array.isArray(layer.obsFiles) && layer.obsFiles.length > 0) {
        samples = layer.obsFiles.map((f) => parseTimestamp(f)).filter((ts) => ts !== null);
      } else {
        // Anchor simulated cadence samples to absolute wall-clock time grid (§2.3)
        const cadenceMs = cadence * 60 * 1000;
        const startAnchor = Math.floor((windowStartMs - cadenceMs * 2) / cadenceMs) * cadenceMs;
        const endAnchor = Math.ceil((windowEndMs + cadenceMs * 2) / cadenceMs) * cadenceMs;
        for (let ts = startAnchor; ts <= endAnchor; ts += cadenceMs) {
          samples.push(ts);
        }
      }

      samples.sort((a, b) => a - b);
      const resolution = resolveLayerTime(layer, cursorMs, { forceLatestAt: mode === "live" });

      return {
        layer,
        cadence,
        samples,
        resolution,
      };
    })
  );

  // Ruler markers: every 30 minutes
  let rulerTicks = $derived.by(() => {
    const ticks = [];
    const stepMs = 30 * 60 * 1000; // 30 min
    const firstTick = Math.ceil(windowStartMs / stepMs) * stepMs;
    for (let t = firstTick; t <= windowEndMs; t += stepMs) {
      const pct = (t - windowStartMs) / (windowEndMs - windowStartMs);
      if (pct >= 0 && pct <= 1) {
        ticks.push({
          timeMs: t,
          pct: pct * 100,
          label: formatZuluTime(t),
          isHour: new Date(t).getUTCMinutes() === 0,
        });
      }
    }
    return ticks;
  });

  // Current playhead position percentage
  let playheadPct = $derived(
    Math.max(0, Math.min(100, ((cursorMs - windowStartMs) / (windowEndMs - windowStartMs)) * 100))
  );

  // Past vs Future / Forecast shading boundary (§2.9)
  let mixesObsAndForecast = $derived.by(() => {
    const hasObs = weatherLayers.some((l) =>
      l.type === "station" ||
      l.model === "SURFACE" ||
      l.model === "UPPER_AIR" ||
      l.element?.includes("RADAR") ||
      l.element?.includes("SAT") ||
      l.isObservation === true
    );
    const hasForecast = weatherLayers.some((l) =>
      l.model === "ECMWF_HR" ||
      l.model === "GFS" ||
      l.model === "CMA_GFS" ||
      l.type === "forecast" ||
      (l.model && l.model !== "SURFACE" && l.model !== "UPPER_AIR" && !l.element?.includes("RADAR") && !l.element?.includes("SAT")) ||
      (l.period !== undefined && l.period !== null)
    );
    return hasObs && hasForecast;
  });

  let obsCutoffMs = $derived.by(() => {
    if (mode === "live") return Date.now();
    if (!mixesObsAndForecast) return null;
    if (timeline?.forecastCycle || timeline?.currentInitCycle || timeline?.initCycle) {
      const cycleTs = parseTimestamp(timeline.forecastCycle || timeline.currentInitCycle || timeline.initCycle);
      if (cycleTs) return cycleTs;
    }
    for (const l of weatherLayers) {
      if (l.cycle || l.forecastCycle) {
        const cycleTs = parseTimestamp(l.cycle || l.forecastCycle);
        if (cycleTs) return cycleTs;
      }
    }
    let latestObs = null;
    for (const lane of laneData) {
      const isObs = lane.layer.type === "station" || lane.layer.model === "SURFACE" || lane.layer.model === "UPPER_AIR" || lane.layer.element?.includes("RADAR");
      if (isObs && lane.samples.length > 0) {
        const last = lane.samples[lane.samples.length - 1];
        if (latestObs === null || last > latestObs) latestObs = last;
      }
    }
    return latestObs;
  });

  let splitPct = $derived(
    obsCutoffMs !== null
      ? Math.max(0, Math.min(100, ((obsCutoffMs - windowStartMs) / (windowEndMs - windowStartMs)) * 100))
      : 100
  );

  function handleScrub(clientX, isShiftHeld = false) {
    if (!tracksContainerEl) return;
    const rect = tracksContainerEl.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    let targetMs = windowStartMs + pct * (windowEndMs - windowStartMs);

    // Snapping to pacemaker ticks by default (§2.9)
    if (snapToPacemaker && !isShiftHeld && pacemakerLayer) {
      const pData = laneData.find((d) => d.layer.id === pacemakerLayer.id);
      if (pData && pData.samples.length > 0) {
        let closest = pData.samples[0];
        let minDiff = Infinity;
        for (const s of pData.samples) {
          const diff = Math.abs(s - targetMs);
          if (diff < minDiff) {
            minDiff = diff;
            closest = s;
          }
        }
        targetMs = closest;
      }
    }

    cursorMs = targetMs;
    if (timeline) {
      timeline.wallClockCursor = targetMs;
    }

    if (onTimeChange) {
      onTimeChange({
        cursorTime: targetMs,
        cursorTimeZ: formatZuluTime(targetMs),
        isLive: mode === "live",
        winId,
      });
    }
  }

  function handlePointerDown(e) {
    if (mode === "live") return; // Live mode is pinned to now
    isDraggingPlayhead = true;
    handleScrub(e.clientX, e.shiftKey);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function handlePointerMove(e) {
    if (!isDraggingPlayhead) return;
    handleScrub(e.clientX, e.shiftKey);
  }

  function handlePointerUp() {
    isDraggingPlayhead = false;
    windowCenterMs = cursorMs;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  }

  // Loop range dragging handles
  function handleHandleInDown(e) {
    e.stopPropagation();
    isDraggingHandleIn = true;
    window.addEventListener("pointermove", handleHandleInMove);
    window.addEventListener("pointerup", handleHandleInUp);
  }

  function handleHandleInMove(e) {
    if (!isDraggingHandleIn || !tracksContainerEl) return;
    const rect = tracksContainerEl.getBoundingClientRect();
    const pct = Math.max(0, Math.min(loopEndPct - 0.05, (e.clientX - rect.left) / rect.width));
    loopStartPct = pct;
    const start = windowStartMs + pct * (windowEndMs - windowStartMs);
    if (timeline) {
      if (!timeline.loopRange) timeline.loopRange = {};
      timeline.loopRange.start = start;
      timeline.loopRange.startMs = start;
    }
  }

  function handleHandleInUp() {
    isDraggingHandleIn = false;
    window.removeEventListener("pointermove", handleHandleInMove);
    window.removeEventListener("pointerup", handleHandleInUp);
  }

  function handleHandleOutDown(e) {
    e.stopPropagation();
    isDraggingHandleOut = true;
    window.addEventListener("pointermove", handleHandleOutMove);
    window.addEventListener("pointerup", handleHandleOutUp);
  }

  function handleHandleOutMove(e) {
    if (!isDraggingHandleOut || !tracksContainerEl) return;
    const rect = tracksContainerEl.getBoundingClientRect();
    const pct = Math.max(loopStartPct + 0.05, Math.min(1, (e.clientX - rect.left) / rect.width));
    loopEndPct = pct;
    const end = windowStartMs + pct * (windowEndMs - windowStartMs);
    if (timeline) {
      if (!timeline.loopRange) timeline.loopRange = {};
      timeline.loopRange.end = end;
      timeline.loopRange.endMs = end;
    }
  }

  function handleHandleOutUp() {
    isDraggingHandleOut = false;
    window.removeEventListener("pointermove", handleHandleOutMove);
    window.removeEventListener("pointerup", handleHandleOutUp);
  }

  function toggleLoopRange() {
    loopActive = !loopActive;
    if (timeline) {
      if (!timeline.loopRange) timeline.loopRange = {};
      timeline.loopRange.active = loopActive;
      if (loopActive) {
        const start = windowStartMs + loopStartPct * (windowEndMs - windowStartMs);
        const end = windowStartMs + loopEndPct * (windowEndMs - windowStartMs);
        timeline.loopRange.start = start;
        timeline.loopRange.startMs = start;
        timeline.loopRange.end = end;
        timeline.loopRange.endMs = end;
      }
    }
  }

  function handleModeToggle() {
    const next = mode === "live" ? "review" : "live";
    mode = next;
    if (timeline) timeline.timelineMode = next;
    if (next === "live") {
      cursorMs = Date.now();
      windowCenterMs = cursorMs;
      if (timeline) timeline.wallClockCursor = cursorMs;
    }
    if (onTimeChange) {
      onTimeChange({
        isLive: next === "live",
        cursorTime: cursorMs,
        cursorTimeZ: formatZuluTime(cursorMs),
        winId,
      });
    }
  }

  function handlePacemakerStep(delta) {
    if (!pacemakerLayer) return;
    const pData = laneData.find((d) => d.layer.id === pacemakerLayer.id);
    if (!pData || pData.samples.length === 0) return;

    const samples = pData.samples;
    // Find closest index
    let curIdx = 0;
    let minDiff = Infinity;
    samples.forEach((s, idx) => {
      const diff = Math.abs(s - cursorMs);
      if (diff < minDiff) {
        minDiff = diff;
        curIdx = idx;
      }
    });

    const nextIdx = Math.max(0, Math.min(samples.length - 1, curIdx + delta));
    const targetMs = samples[nextIdx];
    cursorMs = targetMs;
    windowCenterMs = targetMs;
    if (timeline) timeline.wallClockCursor = targetMs;

    if (onTimeChange) {
      onTimeChange({
        cursorTime: targetMs,
        cursorTimeZ: formatZuluTime(targetMs),
        isLive: mode === "live",
        winId,
      });
    }
  }

  function handleSampleClick(sampleMs) {
    if (mode === "live") return;
    cursorMs = sampleMs;
    windowCenterMs = sampleMs;
    if (timeline) timeline.wallClockCursor = sampleMs;
    if (onTimeChange) {
      onTimeChange({
        cursorTime: sampleMs,
        cursorTimeZ: formatZuluTime(sampleMs),
        isLive: false,
        winId,
      });
    }
  }

  onDestroy(() => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointermove", handleHandleInMove);
    window.removeEventListener("pointerup", handleHandleInUp);
    window.removeEventListener("pointermove", handleHandleOutMove);
    window.removeEventListener("pointerup", handleHandleOutUp);
  });
</script>

<div class="multitrack-container" aria-label="Multi-Track Timeline DAW View">
  <!-- Top Master Bar with Playhead Time & Mode -->
  <div class="multitrack-header">
    <div class="header-left">
      <span class="view-title">MULTI-TRACK DAW TIMELINE</span>
      <div class="playhead-display">
        <span class="playhead-label">PLAYHEAD:</span>
        <strong class="playhead-time">{formatFullZuluTime(cursorMs)}</strong>
      </div>
    </div>

    <div class="header-right">
      <button
        type="button"
        class="mode-toggle-btn"
        class:is-live={mode === "live"}
        onclick={handleModeToggle}
        title={mode === "live" ? "Switch to Review Mode (scrubbable)" : "Switch to Live Mode (pinned to now)"}
      >
        {#if mode === "live"}
          <span class="live-dot">●</span> LIVE (NOWCAST)
        {:else}
          <span class="review-icon">⏱</span> REVIEW MODE
        {/if}
      </button>

      <button
        type="button"
        class="snap-toggle-btn"
        class:active={snapToPacemaker}
        onclick={() => {
          snapToPacemaker = !snapToPacemaker;
          if (timeline) timeline.snapToPacemaker = snapToPacemaker;
        }}
        title="Snap playhead to pacemaker layer's sample ticks (§2.9). Hold Shift for free scrub."
      >
        🧲 SNAP
      </button>

      <button
        type="button"
        class="collapse-btn"
        onclick={() => onToggleCollapse && onToggleCollapse()}
        title="Collapse to Single Strip Ruler"
      >
        ⤡ Single Strip
      </button>
    </div>
  </div>

  <!-- Main DAW Multi-Track Grid -->
  <div class="multitrack-grid">
    <!-- Left Labels Column -->
    <div class="track-headers-column">
      <div class="ruler-header-slot">
        <span class="slot-label">LAYERS CADENCE</span>
      </div>

      {#each laneData as lane (lane.layer.id)}
        <div class="track-header-row" class:is-pacemaker={lane.layer.id === pacemakerId}>
          <div class="track-header-top">
            {#if lane.layer.color}
              <span class="track-color-dot" style:background-color={lane.layer.color}></span>
            {/if}
            <span class="track-name" title={lane.layer.name}>{lane.layer.name}</span>
          </div>

          <div class="track-header-bottom">
            <span
              class="track-time-badge"
              class:status-desync={lane.resolution.isDesync}
              class:status-soft-stale={lane.resolution.status === "soft-stale"}
              class:status-hard-stale={lane.resolution.isHardStale}
              title="{lane.resolution.statusText}: {lane.resolution.actualTimeZ} ({lane.resolution.ageStr})"
            >
              <span class="dot">{lane.resolution.statusIcon}</span>
              {lane.resolution.actualTimeZ} {lane.resolution.ageStr}
            </span>
            <span class="cadence-tag">({lane.cadence}m)</span>
          </div>
        </div>
      {/each}
    </div>

    <!-- Right Timeline Tracks Area with Ruler and Shared Playhead -->
    <div
      class="tracks-scroll-area"
      bind:this={tracksContainerEl}
      onpointerdown={handlePointerDown}
      role="slider"
      tabindex="0"
      aria-label="Timeline Scrubber"
      aria-valuenow={cursorMs}
    >
      <!-- Time Ruler Row -->
      <div class="time-ruler">
        {#each rulerTicks as tick}
          <div
            class="ruler-tick"
            class:hour-tick={tick.isHour}
            style:left="{tick.pct}%"
          >
            <span class="tick-line"></span>
            <span class="tick-label">{tick.label}</span>
          </div>
        {/each}

        <!-- Shaded Future/Forecast Region (§2.9) -->
        {#if mixesObsAndForecast && obsCutoffMs !== null && splitPct < 100}
          <div
            class="forecast-future-shade"
            style:left="{splitPct}%"
            style:width="{100 - splitPct}%"
            title="NWP Forecast Region (Initialized {formatZuluTime(obsCutoffMs)})"
          >
            <span class="future-tag">FORECAST / FUTURE</span>
          </div>
        {/if}

        <!-- Loop Range Handles (§2.6) -->
        {#if loopActive}
          <div
            class="loop-range-bar"
            style:left="{loopStartPct * 100}%"
            style:width="{(loopEndPct - loopStartPct) * 100}%"
          >
            <div
              class="loop-handle handle-in"
              title="Loop In"
              role="slider"
              tabindex="0"
              aria-label="Loop In Handle"
              aria-valuenow={loopStartPct}
              onpointerdown={handleHandleInDown}
            ></div>
            <div
              class="loop-handle handle-out"
              title="Loop Out"
              role="slider"
              tabindex="0"
              aria-label="Loop Out Handle"
              aria-valuenow={loopEndPct}
              onpointerdown={handleHandleOutDown}
            ></div>
          </div>
        {/if}
      </div>

      <!-- Per-Layer Sample Lanes -->
      <div class="lanes-container">
        {#each laneData as lane (lane.layer.id)}
          <div class="lane-row" class:is-pacemaker={lane.layer.id === pacemakerId}>
            {#each lane.samples as sampleTs}
              {@const samplePct = ((sampleTs - windowStartMs) / (windowEndMs - windowStartMs)) * 100}
              {#if samplePct >= -5 && samplePct <= 105}
                <button
                  type="button"
                  class="sample-tick-bar"
                  style:left="{samplePct}%"
                  style:background-color={lane.layer.color || "#58a6ff"}
                  title="{lane.layer.name}: {formatZuluTime(sampleTs)} (Click to select)"
                  onpointerdown={(e) => e.stopPropagation()}
                  onclick={(e) => {
                    e.stopPropagation();
                    handleSampleClick(sampleTs);
                  }}
                ></button>
              {/if}
            {/each}
          </div>
        {/each}

        <!-- Vertical Playhead Line Crossing All Tracks -->
        <div class="shared-playhead-line" style:left="{playheadPct}%">
          <div class="playhead-top-cap">
            <span>{formatZuluTime(cursorMs)}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Bottom Toolbar & Pacemaker Controls -->
  <div class="multitrack-footer">
    <div class="playback-controls">
      <button
        type="button"
        class="ctrl-btn play-pause-btn"
        class:is-playing={isPlaying}
        onclick={() => onTogglePlay && onTogglePlay()}
        title={isPlaying ? "Pause Playback (Space)" : "Start Playback (Space)"}
      >
        {#if isPlaying}
          ❚❚ Pause
        {:else}
          ▶ Play
        {/if}
      </button>

      <button
        type="button"
        class="ctrl-btn"
        onclick={() => handlePacemakerStep(-1)}
        title="Step backward by pacemaker sample"
      >
        ◀◀ Prev
      </button>

      <button
        type="button"
        class="ctrl-btn"
        onclick={() => handlePacemakerStep(1)}
        title="Step forward by pacemaker sample"
      >
        Next ▶▶
      </button>
    </div>

    <div class="pacemaker-selector">
      <label for="sel-pacemaker" class="pacemaker-label">Step by (Pacemaker):</label>
      <select
        id="sel-pacemaker"
        class="pacemaker-select"
        value={pacemakerId}
        onchange={(e) => {
          pacemakerId = e.target.value;
          if (timeline) timeline.pacemakerId = pacemakerId;
        }}
        title="Select the pacing layer that sets the stepping cadence (§2.3)"
      >
        {#each laneData as lane}
          <option value={lane.layer.id}>
            {lane.layer.name} ({lane.cadence} min)
          </option>
        {/each}
      </select>
    </div>

    <div class="loop-control">
      <button
        type="button"
        class="loop-toggle-btn"
        class:active={loopActive}
        onclick={toggleLoopRange}
        title="Toggle loop animation over range (§2.6)"
      >
        🔁 Loop Range
      </button>
    </div>

    <div class="speed-control">
      <label for="sel-multitrack-speed" class="speed-label">Speed:</label>
      <select
        id="sel-multitrack-speed"
        class="speed-select"
        value={String(speed)}
        onchange={(e) => onSpeedChange && onSpeedChange(Number(e.target.value))}
      >
        <option value="3000">0.5x</option>
        <option value="1500">1.0x</option>
        <option value="750">2.0x</option>
      </select>
    </div>
  </div>
</div>

<style>
  .multitrack-container {
    background: var(--bg-secondary, #121824);
    border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    display: flex;
    flex-direction: column;
    width: 100%;
    z-index: 1000;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.5);
    user-select: none;
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  }

  .multitrack-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 16px;
    background: rgba(0, 0, 0, 0.35);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .view-title {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: var(--text-secondary, #8b949e);
  }

  .playhead-display {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.06);
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .playhead-label {
    font-size: 9.5px;
    color: var(--text-secondary, #8b949e);
    font-weight: 600;
  }

  .playhead-time {
    font-size: 12px;
    font-family: var(--font-mono, monospace);
    color: #58a6ff;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mode-toggle-btn {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 4px;
    background: #21262d;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #c9d1d9;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mode-toggle-btn.is-live {
    background: rgba(63, 185, 80, 0.2);
    border-color: rgba(63, 185, 80, 0.5);
    color: #3fb950;
  }

  .live-dot {
    display: inline-block;
    color: #3fb950;
    margin-right: 2px;
    animation: live-pulse 1.5s infinite;
  }

  @keyframes live-pulse {
    0% { opacity: 1; }
    50% { opacity: 0.3; }
    100% { opacity: 1; }
  }

  .snap-toggle-btn {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 4px;
    background: #21262d;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #8b949e;
    cursor: pointer;
  }

  .snap-toggle-btn.active {
    background: rgba(56, 139, 253, 0.15);
    border-color: rgba(56, 139, 253, 0.4);
    color: #58a6ff;
  }

  .collapse-btn {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    background: #21262d;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #c9d1d9;
    cursor: pointer;
  }

  .multitrack-grid {
    display: flex;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    position: relative;
    max-height: 280px;
    overflow-y: auto;
  }

  .track-headers-column {
    width: 220px;
    flex-shrink: 0;
    background: rgba(13, 17, 23, 0.95);
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
  }

  .ruler-header-slot {
    height: 26px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(0, 0, 0, 0.2);
  }

  .slot-label {
    font-size: 9.5px;
    font-weight: 700;
    color: var(--text-secondary, #8b949e);
  }

  .track-header-row {
    height: 38px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 2px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    transition: background 0.15s ease;
  }

  .track-header-row.is-pacemaker {
    background: rgba(56, 139, 253, 0.08);
    border-left: 2px solid #58a6ff;
  }

  .track-header-top {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .track-color-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .track-name {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-primary, #e6edf3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-header-bottom {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 1px;
  }

  .track-time-badge {
    font-size: 9.5px;
    font-family: var(--font-mono, monospace);
    color: var(--text-secondary, #8b949e);
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .track-time-badge.status-desync {
    color: #79c0ff;
  }

  .track-time-badge.status-soft-stale {
    color: #e3b341;
  }

  .track-time-badge.status-hard-stale {
    color: #ff7b72;
  }

  .cadence-tag {
    font-size: 9px;
    color: #6e7681;
  }

  .tracks-scroll-area {
    flex: 1;
    position: relative;
    overflow: hidden;
    cursor: ew-resize;
    background: #0d1117;
  }

  .time-ruler {
    height: 26px;
    position: relative;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.25);
  }

  .ruler-tick {
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .tick-line {
    width: 1px;
    height: 6px;
    background: rgba(255, 255, 255, 0.2);
  }

  .ruler-tick.hour-tick .tick-line {
    height: 10px;
    background: rgba(255, 255, 255, 0.4);
  }

  .tick-label {
    font-size: 9px;
    font-family: var(--font-mono, monospace);
    color: var(--text-secondary, #8b949e);
    margin-top: 1px;
    transform: translateX(-50%);
  }

  .forecast-future-shade {
    position: absolute;
    top: 0;
    bottom: 0;
    background: repeating-linear-gradient(
      -45deg,
      rgba(88, 166, 255, 0.05),
      rgba(88, 166, 255, 0.05) 6px,
      rgba(88, 166, 255, 0.1) 6px,
      rgba(88, 166, 255, 0.1) 12px
    );
    border-left: 1px dashed rgba(88, 166, 255, 0.4);
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 8px;
  }

  .future-tag {
    font-size: 8.5px;
    font-weight: 700;
    color: rgba(88, 166, 255, 0.5);
    letter-spacing: 0.5px;
  }

  .loop-range-bar {
    position: absolute;
    top: 2px;
    height: 4px;
    background: rgba(210, 153, 34, 0.5);
    border-radius: 2px;
    z-index: 10;
    pointer-events: auto;
  }

  .loop-handle {
    position: absolute;
    top: -4px;
    width: 10px;
    height: 12px;
    background: #d29922;
    border-radius: 2px;
    cursor: ew-resize;
    pointer-events: auto;
    touch-action: none;
  }

  .handle-in {
    left: -5px;
  }

  .handle-out {
    right: -5px;
  }

  .lanes-container {
    position: relative;
    display: flex;
    flex-direction: column;
  }

  .lane-row {
    height: 38px;
    position: relative;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  }

  .lane-row.is-pacemaker {
    background: rgba(56, 139, 253, 0.03);
  }

  .sample-tick-bar {
    position: absolute;
    top: 6px;
    bottom: 6px;
    width: 4px;
    border-radius: 2px;
    border: none;
    cursor: pointer;
    opacity: 0.85;
    transition: transform 0.1s ease, opacity 0.1s ease;
  }

  .sample-tick-bar:hover {
    transform: scaleY(1.2);
    opacity: 1;
    box-shadow: 0 0 6px currentColor;
  }

  .shared-playhead-line {
    position: absolute;
    top: -26px;
    bottom: 0;
    width: 2px;
    background: #58a6ff;
    box-shadow: 0 0 8px rgba(88, 166, 255, 0.8);
    pointer-events: none;
    z-index: 10;
  }

  .playhead-top-cap {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    background: #1f6feb;
    color: white;
    font-size: 9px;
    font-family: var(--font-mono, monospace);
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    white-space: nowrap;
  }

  .multitrack-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 16px;
    background: rgba(0, 0, 0, 0.25);
    flex-wrap: wrap;
    gap: 12px;
  }

  .playback-controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ctrl-btn {
    background: #21262d;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #c9d1d9;
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .ctrl-btn:hover {
    background: #30363d;
    color: #ffffff;
  }

  .play-pause-btn.is-playing {
    background: #1f6feb;
    color: #ffffff;
    border-color: #58a6ff;
  }

  .pacemaker-selector,
  .speed-control {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pacemaker-label,
  .speed-label {
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
  }

  .pacemaker-select,
  .speed-select {
    background: var(--bg-secondary, #161b22);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    color: var(--text-primary, #e6edf3);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    outline: none;
  }

  .loop-toggle-btn {
    background: #21262d;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #8b949e;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
  }

  .loop-toggle-btn.active {
    background: rgba(210, 153, 34, 0.15);
    border-color: rgba(210, 153, 34, 0.4);
    color: #e3b341;
  }
</style>
