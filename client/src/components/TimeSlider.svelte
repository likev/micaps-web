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
    formatObsChipLabel,
  } from "../utils/formatters.js";
  import { getPeriodsForStep, filterObsFilesByStep, selectObsChipsWindow, findClosestFile, getObsStepOptions, formatStepLabel, isSatelliteGroup } from "../lib/stores/timelineMath.js";
  import { stepWindowTimeline } from "../lib/services/appWorkflow.js";
  import { getWindowById } from "../lib/stores/tabs.svelte.js";
  import { getLayersForWindow } from "../lib/stores/layersCore.js";
  import { parseTimestamp, getReferenceNowMs } from "../utils/timeResolver.js";
  import MultiTrackTimeline from "./timeline/MultiTrackTimeline.svelte";
  import { t } from "../lib/stores/i18n.svelte.js";
  import {
    isRain12Element,
    isWindowRain12,
    getRainAccumulationHours,
    getRainAccumulationHoursForWindow,
    getDisabledPeriodsForRain,
    disabledPeriodsEqual,
  } from "../utils/rain12.js";

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
  // The selects must never render empty: coerce any stale/invalid store value
  // into the valid option set (step: upper 12/24/6 default 12 like v1.1.0,
  // otherwise 1/3/6/12/24; speed: 3000/1500/750 default 1500). The store
  // itself is corrected on next load/change.
  // FY-4B (satellite) windows additionally offer a 15 min step (0.25 h).
  let isSatellite = $derived.by(() => {
    if (!isObs) return false;
    const win = getWindowById(winId);
    if (isSatelliteGroup(win?.activeGroup)) return true;
    if (win?.model === "SATELLITE") return true;
    if (layers.some((l) => l?.model === "SATELLITE" || String(l?.path || "").includes("FY4B") || String(l?.element || "").includes("FY4B"))) return true;
    return false;
  });
  let stepOptions = $derived(
    !isObs && !timeline.isUpperAirMode
      ? [1, 3, 6, 12, 24]
      : getObsStepOptions({ isUpper: timeline.isUpperAirMode, isSatellite })
  );
  let stepValue = $derived.by(() => {
    const defaultStep = timeline.isUpperAirMode ? 12 : (isObs ? 3 : 6);
    const cur = parseFloat(timeline.currentStepLength);
    return String(stepOptions.includes(cur) ? cur : defaultStep);
  });
  let speedValue = $derived.by(() => {
    const valid = [3000, 1500, 750];
    const cur = parseInt(playback.speed, 10);
    return String(valid.includes(cur) ? cur : DEFAULT_PLAYBACK_MS);
  });
  let periods = $derived(timeline.discretePeriods || []);
  let activePeriod = $derived(periods[timeline.currentPeriodIdx] ?? 0);
  let obsFiles = $derived(timeline.obsFiles || []);
  let activeObsFile = $derived(obsFiles[timeline.currentObsIdx] || "");
  let cycles = $derived(timeline.forecastCycles || []);
  let currentCycle = $derived(timeline.currentInitCycle || "");

  let activeWin = $derived(getWindowById(winId) || null);
  let layers = $derived(getLayersForWindow(winId) || []);
  let rainAccumHours = $derived(
    getRainAccumulationHoursForWindow(activeWin) ??
    getRainAccumulationHours(app.element) ??
    getRainAccumulationHours(activeWin?.element) ??
    getRainAccumulationHours(activeWin?.activeGroup?.id) ??
    getRainAccumulationHours(activeWin?.activeGroup?.name)
  );
  let isRainAccum = $derived(rainAccumHours !== null && rainAccumHours > 0);
  let isRain12 = $derived(rainAccumHours === 12);

  $effect(() => {
    const tl = timelinesByWindow[winId] || getOrCreateTimeline(winId);
    if (isRainAccum && !isObs) {
      // Compare-then-assign: getDisabledPeriodsForRain builds a fresh array
      // every run, and blind assignment re-triggers this effect forever
      // (new object identity === changed $state), spinning CPU on rain
      // presets. Only assign when membership actually differs.
      const nextDisabled = getDisabledPeriodsForRain(rainAccumHours, tl.discretePeriods);
      if (!disabledPeriodsEqual(tl.disabledPeriods, nextDisabled)) {
        tl.disabledPeriods = nextDisabled;
      }
      const curP = tl.discretePeriods?.[tl.currentPeriodIdx];
      const isCurDisabled = curP !== undefined && (
        Number(curP) < rainAccumHours ||
        (Array.isArray(tl.disabledPeriods) && (tl.disabledPeriods.includes(curP) || tl.disabledPeriods.includes(Number(curP))))
      );
      if (isCurDisabled) {
        const firstValidIdx = Array.isArray(tl.discretePeriods)
          ? tl.discretePeriods.findIndex((p) => Number(p) >= rainAccumHours && !tl.disabledPeriods.includes(p) && !tl.disabledPeriods.includes(Number(p)))
          : -1;
        if (firstValidIdx !== -1) {
          tl.currentPeriodIdx = firstValidIdx;
          const targetP = tl.discretePeriods[firstValidIdx];
          app.period = targetP;
          emitTimeChange({ period: targetP, cycle: currentCycle, _seq: ++tl.periodStepSeq });
        }
      }
    } else if (tl.disabledPeriods && tl.disabledPeriods.length > 0 && !isRainAccum) {
      tl.disabledPeriods = [];
    }
  });

  let playTimer = null;

  function emitTimeChange(payload) {
    if (onTimeChange) onTimeChange({ ...payload, winId });
  }

  function handleStep(delta, options = {}) {
    if (!options.fromPlay) {
      pause();
    }
    const tl = timelinesByWindow[winId] || getOrCreateTimeline(winId);
    const res = stepWindowTimeline(tl, delta);
    if (!res) return;
    // v1.1.0 legacy step(): btn-prev -> prev, btn-next/btn-play -> next.
    res.prefetchDirections = delta < 0 ? ["prev"] : ["next"];
    if (!res.isObs) {
      app.period = res.period;
    }
    emitTimeChange(res);
  }

  function handleChipClick(idx) {
    pause();
    if (isObs) {
      const file = obsFiles[idx];
      if (file) {
        goToObsFile(winId, file);
        emitTimeChange({ isObs: true, file, _seq: ++timeline.periodStepSeq });
      }
    } else {
      const p = periods[idx];
      const isPeriodDisabled = (isRainAccum && Number(p) < rainAccumHours) ||
        (Array.isArray(timeline.disabledPeriods) && (timeline.disabledPeriods.includes(p) || timeline.disabledPeriods.includes(Number(p))));
      if (isPeriodDisabled) return;
      if (p !== undefined) {
        goToPeriod(winId, p);
        app.period = p;
        emitTimeChange({ period: p, cycle: currentCycle, _seq: ++timeline.periodStepSeq });
      }
    }
  }

  function handleStepLengthChange(e) {
    // v1.1.0 (legacy setStepLength, triggerCallback=true): preserve the
    // current position, re-filter, snap to closest when the current value
    // drops out, and reload the map at the snapped position.
    const step = parseFloat(e.target.value);
    pause();
    const tl = timelinesByWindow[winId] || getOrCreateTimeline(winId);
    tl.currentStepLength = step;
    const win = getWindowById(winId);
    if (win) {
      win.stepLength = step;
      if (win._obsTimeline) win._obsTimeline.stepLength = step;
      if (win._nwpTimeline) win._nwpTimeline.stepLength = step;
    }
    if (!isObs) {
      const curVal = periods[tl.currentPeriodIdx] ?? 24;
      tl.discretePeriods = getPeriodsForStep(step);
      if (isRainAccum) {
        tl.disabledPeriods = getDisabledPeriodsForRain(rainAccumHours, tl.discretePeriods);
      } else if (tl.disabledPeriods && tl.disabledPeriods.length > 0) {
        tl.disabledPeriods = [];
      }
      let closestIdx = 0;
      let minDiff = Infinity;
      tl.discretePeriods.forEach((p, idx) => {
        if (isRainAccum && Number(p) < rainAccumHours) return;
        const diff = Math.abs(p - curVal);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      });
      if (isRainAccum && Number(tl.discretePeriods[closestIdx]) < rainAccumHours) {
        const firstValid = tl.discretePeriods.findIndex((p) => Number(p) >= rainAccumHours);
        if (firstValid !== -1) closestIdx = firstValid;
      }
      tl.currentPeriodIdx = closestIdx;
      const newPeriod = tl.discretePeriods[tl.currentPeriodIdx];
      app.period = newPeriod;
      if (win) {
        win.period = newPeriod;
        win.discretePeriods = [...tl.discretePeriods];
      }
      emitTimeChange({ period: newPeriod, cycle: currentCycle, stepLength: step, discretePeriods: tl.discretePeriods, _seq: ++tl.periodStepSeq });
    } else {
      const wasAtLatest = obsFiles.length === 0 || tl.currentObsIdx >= obsFiles.length - 1;
      const curFile = obsFiles[tl.currentObsIdx] || "";
      const allFiltered = filterObsFilesByStep(tl.rawObsFiles, step, tl.isUpperAirMode);
      let targetFile = curFile;
      if (wasAtLatest && allFiltered.length > 0) {
        targetFile = allFiltered[allFiltered.length - 1];
      } else if (allFiltered.length > 0 && curFile && !allFiltered.includes(curFile)) {
        targetFile = findClosestFile(allFiltered, curFile);
      }
      // Always anchor step-change chips to the latest MAX_OBS_CHIPS window so the
      // newest observation chip is never cut off when switching (e.g. 3h -> 15min).
      tl.obsFiles = selectObsChipsWindow(allFiltered);
      const newIdx = (!wasAtLatest && targetFile) ? tl.obsFiles.indexOf(targetFile) : -1;
      tl.currentObsIdx = newIdx !== -1 ? newIdx : Math.max(0, tl.obsFiles.length - 1);
      const file = tl.obsFiles[tl.currentObsIdx];
      if (win && file) {
        win.obsTime = file;
        if (win._obsTimeline) win._obsTimeline.file = file;
      }
      if (file) emitTimeChange({ isObs: true, file, stepLength: step, _seq: ++tl.periodStepSeq });
    }
  }

  function handleMultiTrackTimeChange(payload) {
    if (!payload || !payload.cursorTime) return;
    const targetMs = payload.cursorTime;
    timeline.wallClockCursor = targetMs;

    if (isObs) {
      if (obsFiles.length > 0) {
        let closestIdx = 0;
        let minDiff = Infinity;
        obsFiles.forEach((file, idx) => {
          const ts = parseTimestamp(file);
          if (ts !== null) {
            const diff = Math.abs(ts - targetMs);
            if (diff < minDiff) {
              minDiff = diff;
              closestIdx = idx;
            }
          }
        });
        timeline.currentObsIdx = closestIdx;
        const file = obsFiles[closestIdx];
        emitTimeChange({ isObs: true, file, cursorTime: targetMs, _seq: ++timeline.periodStepSeq });
      }
    } else {
      if (periods.length > 0 && currentCycle) {
        const cycleTs = parseTimestamp(currentCycle) || getReferenceNowMs();
        const diffHours = (targetMs - cycleTs) / (3600 * 1000);
        let closestIdx = 0;
        let minDiff = Infinity;
        periods.forEach((p, idx) => {
          const diff = Math.abs(p - diffHours);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = idx;
          }
        });
        timeline.currentPeriodIdx = closestIdx;
        const targetP = periods[closestIdx];
        app.period = targetP;
        emitTimeChange({ period: targetP, cycle: currentCycle, cursorTime: targetMs, _seq: ++timeline.periodStepSeq });
      }
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
    ensureLoopRange();
    timeline.loopRange.active = true;
    if (timeline.loopRange.start == null || timeline.loopRange.end == null) {
      if (isObs) {
        timeline.loopRange.start = 0;
        timeline.loopRange.end = Math.max(0, obsFiles.length - 1);
      } else {
        timeline.loopRange.start = periods[0] ?? 0;
        timeline.loopRange.end = periods[periods.length - 1] ?? 72;
      }
    }
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

  function toggleLoopRange() {
    ensureLoopRange();
    timeline.loopRange.active = !timeline.loopRange.active;
    if (timeline.loopRange.active) {
      if (timeline.loopRange.start == null || timeline.loopRange.end == null) {
        if (isObs) {
          timeline.loopRange.start = 0;
          timeline.loopRange.end = Math.max(0, obsFiles.length - 1);
        } else {
          timeline.loopRange.start = periods[0] ?? 0;
          timeline.loopRange.end = periods[periods.length - 1] ?? 72;
        }
      }
    }
  }

  function handleSpeedChange(e) {
    const val = typeof e === "number" ? e : (e?.target?.value !== undefined ? e.target.value : e);
    const spd = parseInt(val, 10);
    const next = Number.isFinite(spd) ? spd : DEFAULT_PLAYBACK_MS;
    playback.speed = next;
    app.playbackSpeed = next;
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

  let isLooping = $derived(Boolean(playback.isPlaying || timeline.loopRange?.active));
  let loopA = $derived(timeline.loopRange?.start ?? null);
  let loopB = $derived(timeline.loopRange?.end ?? null);
  let isLoopActive = $derived(Boolean(timeline.loopRange?.active));

  let loopStartIdx = $derived.by(() => {
    if (!periods.length) return 0;
    if (timeline.loopRange?.start != null) {
      const idx = periods.indexOf(timeline.loopRange.start);
      if (idx !== -1) return idx;
    }
    return 0;
  });

  let loopEndIdx = $derived.by(() => {
    if (!periods.length) return 0;
    if (timeline.loopRange?.end != null) {
      const idx = periods.indexOf(timeline.loopRange.end);
      if (idx !== -1) return idx;
    }
    return periods.length - 1;
  });

  let obsLoopStartIdx = $derived.by(() => {
    if (!obsFiles.length) return 0;
    if (timeline.loopRange?.start != null) {
      const idx = Number(timeline.loopRange.start);
      if (Number.isFinite(idx) && idx >= 0 && idx < obsFiles.length) return idx;
    }
    return 0;
  });

  let obsLoopEndIdx = $derived.by(() => {
    if (!obsFiles.length) return 0;
    if (timeline.loopRange?.end != null) {
      const idx = Number(timeline.loopRange.end);
      if (Number.isFinite(idx) && idx >= 0 && idx < obsFiles.length) return idx;
    }
    return obsFiles.length - 1;
  });

  let draggingLine = $state(null);

  function ensureLoopRange() {
    if (!timeline.loopRange) {
      timeline.loopRange = { active: false, start: null, end: null };
    }
  }

  function startDrag(e, marker) {
    e.preventDefault();
    e.stopPropagation();
    draggingLine = marker;
    const chipsContainer = document.getElementById("sl-timeline-chips");

    function onPointerMove(moveEvent) {
      if (!draggingLine) return;
      const chipElements = chipsContainer?.querySelectorAll(".chip-btn");
      if (!chipElements || chipElements.length === 0) return;

      let closestIdx = 0;
      let minDistance = Infinity;
      chipElements.forEach((el, idx) => {
        const rect = el.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        const dist = Math.abs(moveEvent.clientX - center);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = idx;
        }
      });

      updateLoopMarkerIndex(draggingLine, closestIdx);
    }

    function onPointerUp() {
      draggingLine = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function handleLineDragStart(e, marker) {
    draggingLine = marker;
    if (e.dataTransfer) {
      e.dataTransfer.setData("text/plain", marker);
      e.dataTransfer.effectAllowed = "move";
    }
  }

  function handleChipDragOver(e, idx) {
    e.preventDefault();
    if (draggingLine) {
      updateLoopMarkerIndex(draggingLine, idx);
    }
  }

  function handleLineDragEnd() {
    draggingLine = null;
  }

  function updateLoopMarkerIndex(marker, idx) {
    ensureLoopRange();
    const len = isObs ? obsFiles.length : periods.length;
    if (len === 0) return;
    const clampedIdx = Math.max(0, Math.min(len - 1, idx));

    let curStart = isObs ? obsLoopStartIdx : loopStartIdx;
    let curEnd = isObs ? obsLoopEndIdx : loopEndIdx;

    if (marker === "A") {
      curStart = Math.min(clampedIdx, curEnd);
    } else if (marker === "B") {
      curEnd = Math.max(clampedIdx, curStart);
    }

    if (isObs) {
      timeline.loopRange.start = curStart;
      timeline.loopRange.end = curEnd;
    } else {
      timeline.loopRange.start = periods[curStart];
      timeline.loopRange.end = periods[curEnd];
    }
  }

  function formatLoopPoint(pt) {
    if (pt == null) return "--";
    if (isObs) {
      const f = obsFiles[pt];
      return f ? (f.length >= 10 ? `${f.slice(4, 6)}/${f.slice(6, 8)} ${f.slice(8, 10)}h` : f) : `Idx ${pt}`;
    }
    return pt === 0 ? "000h" : `+${pt}h`;
  }

  function isPeriodInLoop(p) {
    if (!isLoopActive || loopA == null || loopB == null) return false;
    const min = Math.min(loopA, loopB);
    const max = Math.max(loopA, loopB);
    return Number(p) >= min && Number(p) <= max;
  }

  function isPeriodPointA(p) {
    return loopA != null && Number(p) === Number(loopA);
  }

  function isPeriodPointB(p) {
    return loopB != null && Number(p) === Number(loopB);
  }

  function isObsInLoop(idx) {
    if (!isLoopActive || loopA == null || loopB == null) return false;
    const min = Math.min(loopA, loopB);
    const max = Math.max(loopA, loopB);
    return idx >= min && idx <= max;
  }

  function isObsPointA(idx) {
    return loopA != null && idx === Number(loopA);
  }

  function isObsPointB(idx) {
    return loopB != null && idx === Number(loopB);
  }


  onDestroy(() => {
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
  });
</script>

{#if ui.timelineVisible && !ui.configOpen}
  {#if timeline.multiTrackExpanded}
    <MultiTrackTimeline
      {winId}
      {layers}
      {timeline}
      isPlaying={playback.isPlaying}
      speed={playback.speed}
      onTogglePlay={togglePlay}
      onStep={handleStep}
      onSpeedChange={handleSpeedChange}
      onToggleCollapse={() => {
        timeline.multiTrackExpanded = false;
      }}
      onTimeChange={handleMultiTrackTimeChange}
    />
  {/if}

  <footer id="sl-timeslider" class="timeslider-container" aria-label="Timeline and Playback Controls">
    <div class="timeline-stepper">
      <button
        id="sl-btn-play"
        class="play-btn"
        class:active={playback.isPlaying}
        type="button"
        title={playback.isPlaying ? t("timeline.pause") : t("timeline.play")}
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
        id="sl-btn-step-prev"
        class="step-nav-btn"
        type="button"
        title={t("timeline.prev")}
        aria-label="Previous step"
        onclick={() => handleStep(-1)}
      >◀</button>

      <button
        id="sl-btn-step-next"
        class="step-nav-btn"
        type="button"
        title={t("timeline.next")}
        aria-label="Next step"
        onclick={() => handleStep(1)}
      >▶</button>

      <button
        id="sl-btn-toggle-loop"
        class="step-nav-btn loop-toggle-btn"
        class:active={timeline.loopRange?.active}
        type="button"
        title={timeline.loopRange?.active ? t("timeline.loop.disable") : t("timeline.loop.enable")}
        aria-label="Toggle loop range"
        onclick={toggleLoopRange}
      >🔁</button>

      <div class="step-length-control">
        <label for="sl-select-step-length" class="step-length-label">{t("timeline.step")}:</label>
        <select
          id="sl-select-step-length"
          class="step-length-select"
          value={stepValue}
          onchange={handleStepLengthChange}
        >
          {#each stepOptions as opt}
            <option value={String(opt)}>{formatStepLabel(opt)}</option>
          {/each}
        </select>
      </div>

      <div class="playback-speed-control">
        <label for="sl-select-playback-speed" class="step-length-label">{t("timeline.speed")}:</label>
        <select
          id="sl-select-playback-speed"
          class="step-length-select"
          value={speedValue}
          onchange={handleSpeedChange}
        >
          <option value="3000">0.5x</option>
          <option value="1500">1.0x</option>
          <option value="750">2.0x</option>
        </select>
      </div>

      <button
        type="button"
        id="sl-btn-toggle-multitrack"
        class="multitrack-toggle-btn"
        class:active={timeline.multiTrackExpanded}
        title={timeline.multiTrackExpanded ? t("timeline.multitrack.collapse") : t("timeline.multitrack.expand")}
        onclick={() => {
          timeline.multiTrackExpanded = !timeline.multiTrackExpanded;
        }}
      >
        {timeline.multiTrackExpanded ? t("timeline.singleStrip") : t("timeline.dawLanes")}
      </button>
    </div>

    <div class="timeline-body">
      <div
        id="sl-timeline-chips"
        class="timeline-chips"
        role="tablist"
        aria-label={isObs ? "Observation time steps" : "Forecast lead time steps"}
        ondragover={(e) => e.preventDefault()}
        ondrop={(e) => { e.preventDefault(); handleLineDragEnd(); }}
      >
        {#if isObs}
          {#each obsFiles as file, idx}
            {@const isInLoop = isObsInLoop(idx)}
            {@const isPtA = isObsPointA(idx)}
            {@const isPtB = isObsPointB(idx)}
            {#if isLooping && idx === obsLoopStartIdx}
              <div
                class="timeline-loop-line timeline-loop-line-a"
                id="timeline-loop-line-a"
                data-testid="timeline-loop-line-a"
                role="separator"
                aria-label="Loop Start A"
                title="Loop Start A (Drag to adjust)"
                draggable="true"
                onpointerdown={(e) => startDrag(e, 'A')}
                ondragstart={(e) => handleLineDragStart(e, 'A')}
                ondragend={handleLineDragEnd}
              >
                <div class="loop-line-bar"></div>
                <span class="loop-line-badge badge-a">A</span>
              </div>
            {/if}
            <button
              class="chip-btn"
              class:active={idx === timeline.currentObsIdx}
              class:in-loop-range={isInLoop}
              class:begin-timeline-chip={idx === obsLoopStartIdx}
              class:end-timeline-chip={idx === obsLoopEndIdx}
              class:loop-pt-a={isPtA}
              class:loop-pt-b={isPtB}
              role="tab"
              aria-selected={idx === timeline.currentObsIdx}
              onclick={() => handleChipClick(idx)}
              ondragover={(e) => handleChipDragOver(e, idx)}
              data-testid="timeline-chip"
              data-file={file}
            >
              {formatObsChipLabel(file)}
              {#if isPtA}<span class="chip-loop-tag tag-a">A</span>{/if}
              {#if isPtB}<span class="chip-loop-tag tag-b">B</span>{/if}
            </button>
            {#if isLooping && idx === obsLoopEndIdx}
              <div
                class="timeline-loop-line timeline-loop-line-b"
                id="timeline-loop-line-b"
                data-testid="timeline-loop-line-b"
                role="separator"
                aria-label="Loop End B"
                title="Loop End B (Drag to adjust)"
                draggable="true"
                onpointerdown={(e) => startDrag(e, 'B')}
                ondragstart={(e) => handleLineDragStart(e, 'B')}
                ondragend={handleLineDragEnd}
              >
                <div class="loop-line-bar"></div>
                <span class="loop-line-badge badge-b">B</span>
              </div>
            {/if}
          {/each}
        {:else}
          {#each periods as p, idx}
            {@const isPeriodDisabled = (isRainAccum && Number(p) < rainAccumHours) ||
              (Array.isArray(timeline.disabledPeriods) && (timeline.disabledPeriods.includes(p) || timeline.disabledPeriods.includes(Number(p))))}
            {@const isInLoop = isPeriodInLoop(p)}
            {@const isPtA = isPeriodPointA(p)}
            {@const isPtB = isPeriodPointB(p)}
            {#if isLooping && idx === loopStartIdx}
              <div
                class="timeline-loop-line timeline-loop-line-a"
                id="timeline-loop-line-a"
                data-testid="timeline-loop-line-a"
                role="separator"
                aria-label="Loop Start A"
                title="Loop Start A (Drag to adjust)"
                draggable="true"
                onpointerdown={(e) => startDrag(e, 'A')}
                ondragstart={(e) => handleLineDragStart(e, 'A')}
                ondragend={handleLineDragEnd}
              >
                <div class="loop-line-bar"></div>
                <span class="loop-line-badge badge-a">A</span>
              </div>
            {/if}
            <button
              class="chip-btn"
              class:active={idx === timeline.currentPeriodIdx}
              class:disabled={isPeriodDisabled}
              class:in-loop-range={isInLoop}
              class:begin-timeline-chip={idx === loopStartIdx}
              class:end-timeline-chip={idx === loopEndIdx}
              class:loop-pt-a={isPtA}
              class:loop-pt-b={isPtB}
              disabled={isPeriodDisabled}
              role="tab"
              aria-selected={idx === timeline.currentPeriodIdx}
              onclick={() => !isPeriodDisabled && handleChipClick(idx)}
              ondragover={(e) => handleChipDragOver(e, idx)}
              data-testid="timeline-chip"
              data-period={p}
              title={isPeriodDisabled
                ? (rainAccumHours
                    ? (rainAccumHours === 12
                        ? "Not available for RAIN12 (.000, .006 don't exist)"
                        : `Not available for RAIN${rainAccumHours < 10 ? '0' + rainAccumHours : rainAccumHours} (lead < ${rainAccumHours}h does not exist)`)
                    : "Not available (forecast lead time does not exist for accumulation period)")
                : undefined}
            >
              {p === 0 ? "000h" : `+${p}h`}
              {#if isPtA}<span class="chip-loop-tag tag-a">A</span>{/if}
              {#if isPtB}<span class="chip-loop-tag tag-b">B</span>{/if}
            </button>
            {#if isLooping && idx === loopEndIdx}
              <div
                class="timeline-loop-line timeline-loop-line-b"
                id="timeline-loop-line-b"
                data-testid="timeline-loop-line-b"
                role="separator"
                aria-label="Loop End B"
                title="Loop End B (Drag to adjust)"
                draggable="true"
                onpointerdown={(e) => startDrag(e, 'B')}
                ondragstart={(e) => handleLineDragStart(e, 'B')}
                ondragend={handleLineDragEnd}
              >
                <div class="loop-line-bar"></div>
                <span class="loop-line-badge badge-b">B</span>
              </div>
            {/if}
          {/each}
        {/if}
      </div>
    </div>
  </footer>
{:else}
  <footer id="sl-timeslider" class="timeslider-container hidden"></footer>
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
    background-color: var(--bg-card, transparent);
    border-radius: 4px;
    transition: background-color 0.15s ease;
  }

  .step-nav-btn {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    background: var(--bg-card, #21262d);
    color: var(--text-primary, #c9d1d9);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 11px;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .step-nav-btn:hover {
    background: var(--bg-hover, #30363d);
    color: var(--text-primary, #ffffff);
    border-color: var(--accent-blue, #58a6ff);
  }

  .step-nav-btn.active {
    background: var(--accent-blue, #388bfd);
    color: #fff;
    border-color: var(--accent-blue, #388bfd);
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
    color: var(--text-secondary, #8b949e);
    font-weight: 500;
  }

  .step-length-select,
  .init-time-select {
    background: var(--bg-card, #21262d);
    color: var(--accent-blue, #58a6ff);
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

  .multitrack-toggle-btn {
    background: var(--bg-card, #21262d);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
    color: var(--text-secondary, #c9d1d9);
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    margin-left: 8px;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .multitrack-toggle-btn:hover {
    background: var(--bg-hover, #30363d);
    color: var(--text-primary, #ffffff);
    border-color: var(--accent-blue, #58a6ff);
  }

  .multitrack-toggle-btn.active {
    background: rgba(56, 139, 253, 0.2);
    border-color: rgba(56, 139, 253, 0.6);
    color: #79c0ff;
    box-shadow: 0 0 8px rgba(56, 139, 253, 0.3);
  }

  .step-length-select:hover,
  .init-time-select:hover,
  .step-length-select:focus,
  .init-time-select:focus {
    border-color: var(--accent-blue, #388bfd);
    background: var(--bg-hover, #282e37);
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
    background: var(--bg-card, #21262d);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    color: var(--text-secondary, #8b949e);
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .chip-btn:hover {
    background: var(--bg-hover, #30363d);
    color: var(--text-primary, #c9d1d9);
  }

  .chip-btn.active {
    background: var(--accent-blue, #388bfd);
    border-color: #58a6ff;
    color: #ffffff;
    font-weight: bold;
    box-shadow: 0 0 8px rgba(56, 139, 253, 0.4);
  }

  .chip-btn:disabled,
  .chip-btn.disabled,
  :global(.chip-btn:disabled) {
    opacity: 0.35 !important;
    cursor: not-allowed !important;
    pointer-events: none !important;
    border-style: dashed !important;
  }

  .timeline-loop-line {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    cursor: col-resize;
    user-select: none;
    touch-action: none;
    z-index: 10;
    margin: 0 2px;
    height: 30px;
    padding: 0 2px;
    flex-shrink: 0;
  }

  .timeline-loop-line .loop-line-bar {
    width: 3px;
    height: 100%;
    border-radius: 2px;
    transition: width 0.15s ease, box-shadow 0.15s ease;
  }

  .timeline-loop-line-a .loop-line-bar {
    background: #388bfd;
    box-shadow: 0 0 6px rgba(56, 139, 253, 0.6);
  }

  .timeline-loop-line-b .loop-line-bar {
    background: #2ea043;
    box-shadow: 0 0 6px rgba(46, 160, 67, 0.6);
  }

  .loop-line-badge {
    position: absolute;
    top: -14px;
    font-size: 10px;
    font-weight: 800;
    font-family: var(--font-mono, monospace);
    line-height: 1;
    padding: 2px 4px;
    border-radius: 3px;
    color: #ffffff;
    pointer-events: none;
  }

  .loop-line-badge.badge-a {
    background: #388bfd;
  }

  .loop-line-badge.badge-b {
    background: #2ea043;
  }

  .timeline-loop-line:hover .loop-line-bar,
  .timeline-loop-line:active .loop-line-bar {
    width: 5px;
  }

  .chip-btn.in-loop-range {
    border-color: rgba(56, 139, 253, 0.6);
    background: rgba(56, 139, 253, 0.12);
  }

  .chip-btn.loop-pt-a {
    border-left: 2px solid #58a6ff;
  }

  .chip-btn.loop-pt-b {
    border-right: 2px solid #58a6ff;
  }

  .chip-loop-tag {
    font-size: 9px;
    font-weight: 800;
    padding: 0 3px;
    border-radius: 3px;
    margin-left: 3px;
    line-height: 1.2;
    display: inline-block;
  }

  .chip-loop-tag.tag-a {
    background: #388bfd;
    color: #ffffff;
  }

  .chip-loop-tag.tag-b {
    background: #2ea043;
    color: #ffffff;
  }
</style>
