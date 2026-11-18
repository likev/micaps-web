<script>
  import { onDestroy } from "svelte";
  import { formatObsChipLabel, formatObsTimestamp } from "../../utils/formatters.js";
  import { parseTimestamp } from "../../utils/timeResolver.js";
  import { OBS_RANGE_WINDOW_OPTIONS } from "../../lib/stores/timelineMath.js";
  import { t } from "../../lib/stores/i18n.svelte.js";

  let {
    files = [],
    currentIndex = 0,
    rangeHours = 6,
    totalRawCount = 0,
    isLooping = false,
    loopRange = { active: false, start: null, end: null },
    onSelectFile = null,
    onRangeChange = null,
    onLoopRangeChange = null,
  } = $props();

  const SCRUB_THROTTLE_MS = 80;

  let trackEl = $state(null);
  let isScrubbing = $state(false);
  let dragLoopHandle = $state(null); // "a" | "b" | null
  let hoverIdx = $state(-1);
  let hoverPct = $state(0);
  let lastEmitTs = 0;
  let pendingTimer = null;
  let pendingFile = null;
  let pendingIdx = -1;

  let activeFile = $derived(files[currentIndex] || "");

  let timelineMeta = $derived.by(() => {
    const n = files.length;
    if (n === 0) {
      return { positions: [], timestamps: [], minTs: 0, maxTs: 0, usesTime: false };
    }
    const timestamps = files.map((f) => parseTimestamp(f));
    const valid = timestamps.filter((ts) => ts !== null && Number.isFinite(ts));
    const usesTime = valid.length === n && n > 1 && Math.max(...valid) > Math.min(...valid);
    if (usesTime) {
      const minTs = Math.min(...valid);
      const maxTs = Math.max(...valid);
      const span = Math.max(1, maxTs - minTs);
      const positions = timestamps.map((ts) => ((ts - minTs) / span) * 100);
      return { positions, timestamps, minTs, maxTs, usesTime: true };
    }
    const positions = files.map((_, i) => (n <= 1 ? 100 : (i / (n - 1)) * 100));
    return { positions, timestamps, minTs: 0, maxTs: 0, usesTime: false };
  });

  let activePct = $derived.by(() => {
    if (files.length === 0) return 0;
    const clamped = Math.max(0, Math.min(files.length - 1, currentIndex));
    return timelineMeta.positions[clamped] ?? 0;
  });

  let rulerLabels = $derived.by(() => {
    const n = files.length;
    if (n === 0) return [];
    if (n === 1) {
      return [{ idx: 0, pct: timelineMeta.positions[0] ?? 50, text: formatObsChipLabel(files[0], files) }];
    }
    const maxLabels = 7;
    const step = Math.max(1, Math.ceil((n - 1) / (maxLabels - 1)));
    const indices = [];
    for (let i = 0; i < n; i += step) {
      indices.push(i);
    }
    if (indices[indices.length - 1] !== n - 1) {
      const lastPos = timelineMeta.positions[indices[indices.length - 1]] ?? 0;
      const endPos = timelineMeta.positions[n - 1] ?? 100;
      if (endPos - lastPos < 9 && indices.length > 1) {
        indices[indices.length - 1] = n - 1;
      } else {
        indices.push(n - 1);
      }
    }
    return indices.map((idx) => ({
      idx,
      pct: timelineMeta.positions[idx] ?? 0,
      text: formatObsChipLabel(files[idx], files),
    }));
  });

  let loopBoundsPct = $derived.by(() => {
    if (!isLooping || files.length < 2) return null;
    const n = files.length;
    const startVal = loopRange?.active && loopRange?.start != null ? loopRange.start : null;
    const endVal = loopRange?.active && loopRange?.end != null ? loopRange.end : null;
    const idxToPct = (idx) => timelineMeta.positions[Math.max(0, Math.min(n - 1, idx))] ?? 0;

    let aIdx = Math.max(0, n - 10);
    let bIdx = n - 1;
    if (startVal !== null && endVal !== null) {
      if (startVal > 100000000 && timelineMeta.usesTime) {
        aIdx = findNearestIdxByValue(timelineMeta.timestamps, Math.min(startVal, endVal));
        bIdx = findNearestIdxByValue(timelineMeta.timestamps, Math.max(startVal, endVal));
      } else {
        aIdx = Math.max(0, Math.min(n - 1, Math.round(Math.min(startVal, endVal))));
        bIdx = Math.max(0, Math.min(n - 1, Math.round(Math.max(startVal, endVal))));
      }
    }
    if (aIdx > bIdx) [aIdx, bIdx] = [bIdx, aIdx];
    return {
      aIdx,
      bIdx,
      aPct: idxToPct(aIdx),
      bPct: idxToPct(bIdx),
    };
  });

  function findNearestIdxByValue(arr, val) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v == null) continue;
      const d = Math.abs(v - val);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  function clientXToNearestIndex(clientX) {
    if (!trackEl || files.length === 0) return { idx: 0, pct: 0 };
    const rect = trackEl.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / width) * 100));
    const idx = findNearestIdxByValue(timelineMeta.positions, pct);
    return { idx, pct: timelineMeta.positions[idx] ?? pct };
  }

  function clearPendingEmit() {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    pendingFile = null;
    pendingIdx = -1;
  }

  function emitSelect(idx, immediate = false) {
    if (idx < 0 || idx >= files.length) return;
    const file = files[idx];
    if (!file) return;
    const now = Date.now();
    if (immediate || now - lastEmitTs >= SCRUB_THROTTLE_MS) {
      clearPendingEmit();
      lastEmitTs = now;
      onSelectFile?.(file, idx);
      return;
    }
    pendingFile = file;
    pendingIdx = idx;
    if (!pendingTimer) {
      const wait = Math.max(10, SCRUB_THROTTLE_MS - (now - lastEmitTs));
      pendingTimer = setTimeout(() => {
        const f = pendingFile;
        const i = pendingIdx;
        pendingTimer = null;
        pendingFile = null;
        pendingIdx = -1;
        if (f && i >= 0) {
          lastEmitTs = Date.now();
          onSelectFile?.(f, i);
        }
      }, wait);
    }
  }

  function updateLoopHandleAtIdx(handle, idx) {
    if (!onLoopRangeChange || files.length < 2) return;
    const cur = loopBoundsPct || { aIdx: 0, bIdx: files.length - 1 };
    let nextA = cur.aIdx;
    let nextB = cur.bIdx;
    if (handle === "a") {
      nextA = Math.min(idx, nextB);
    } else if (handle === "b") {
      nextB = Math.max(idx, nextA);
    }
    if (timelineMeta.usesTime) {
      onLoopRangeChange({
        active: true,
        start: timelineMeta.timestamps[nextA],
        end: timelineMeta.timestamps[nextB],
      });
    } else {
      onLoopRangeChange({
        active: true,
        start: nextA,
        end: nextB,
      });
    }
  }

  function handleTrackPointerDown(e) {
    if (e.button !== 0 || files.length === 0) return;
    if (e.target?.dataset?.loopHandle) return;
    e.preventDefault();
    isScrubbing = true;
    try {
      trackEl?.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore if synthetic pointer event lacks capture support
    }
    const { idx, pct } = clientXToNearestIndex(e.clientX);
    hoverIdx = idx;
    hoverPct = pct;
    emitSelect(idx, true);
  }

  function handleLoopHandlePointerDown(handle, e) {
    if (e.button !== 0 || files.length < 2) return;
    e.preventDefault();
    e.stopPropagation();
    dragLoopHandle = handle;
    try {
      trackEl?.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }
  }

  function handleTrackPointerMove(e) {
    if (files.length === 0) return;
    const { idx, pct } = clientXToNearestIndex(e.clientX);
    hoverIdx = idx;
    hoverPct = pct;
    if (dragLoopHandle) {
      updateLoopHandleAtIdx(dragLoopHandle, idx);
      return;
    }
    if (isScrubbing) {
      emitSelect(idx, false);
    }
  }

  function handleTrackPointerUp(e) {
    if (dragLoopHandle) {
      const { idx } = clientXToNearestIndex(e.clientX);
      updateLoopHandleAtIdx(dragLoopHandle, idx);
      dragLoopHandle = null;
      return;
    }
    if (!isScrubbing) return;
    isScrubbing = false;
    try {
      trackEl?.releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }
    const { idx, pct } = clientXToNearestIndex(e.clientX);
    hoverIdx = idx;
    hoverPct = pct;
    emitSelect(idx, true);
  }

  function handleTrackPointerLeave() {
    if (!isScrubbing && !dragLoopHandle) {
      hoverIdx = -1;
    }
  }

  function handleTrackKeyDown(e) {
    if (files.length === 0) return;
    let nextIdx = currentIndex;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      nextIdx = Math.max(0, currentIndex - 1);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      nextIdx = Math.min(files.length - 1, currentIndex + 1);
    } else if (e.key === "Home") {
      nextIdx = 0;
    } else if (e.key === "End") {
      nextIdx = files.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    emitSelect(nextIdx, true);
  }

  function getRangeLabel(hours) {
    if (hours === 3) return t("timeline.range.3h");
    if (hours === 6) return t("timeline.range.6h");
    if (hours === 24) return t("timeline.range.24h");
    return t("timeline.range.all");
  }

  onDestroy(() => {
    clearPendingEmit();
  });
</script>

<div class="obs-scrubber-root">
  <div class="obs-scrubber-header">
    <div class="obs-range-pills" role="group" aria-label={t("timeline.range.label")}>
      {#each OBS_RANGE_WINDOW_OPTIONS as h}
        <button
          type="button"
          class="obs-range-pill"
          class:active={Number(rangeHours) === h}
          data-testid={`obs-range-pill-${h}`}
          onclick={() => onRangeChange?.(h)}
        >
          {getRangeLabel(h)}
        </button>
      {/each}
    </div>

    <div class="obs-scrubber-meta">
      {#if activeFile}
        <span class="obs-active-time" data-testid="obs-scrubber-active-time">
          {formatObsTimestamp(activeFile)}
        </span>
      {/if}
      <span class="obs-scan-badge" data-testid="obs-scrubber-scan-count">
        {files.length}{#if totalRawCount > files.length}/{totalRawCount}{/if} {t("timeline.scans")}
      </span>
    </div>
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={trackEl}
    class="obs-scrubber-track-area"
    class:scrubbing={isScrubbing}
    data-testid="obs-time-scrubber"
    role="slider"
    tabindex="0"
    aria-label="Observation time scrubber"
    aria-valuemin={0}
    aria-valuemax={Math.max(0, files.length - 1)}
    aria-valuenow={currentIndex}
    onpointerdown={handleTrackPointerDown}
    onpointermove={handleTrackPointerMove}
    onpointerup={handleTrackPointerUp}
    onpointercancel={handleTrackPointerUp}
    onpointerleave={handleTrackPointerLeave}
    onkeydown={handleTrackKeyDown}
  >
    {#if hoverIdx >= 0 && hoverIdx < files.length}
      <div
        class="obs-hover-tooltip"
        style={`left: ${Math.max(4, Math.min(96, hoverPct))}%`}
      >
        {formatObsTimestamp(files[hoverIdx])}
      </div>
    {/if}

    <div class="obs-track-rail">
      <div class="obs-track-fill" style={`width: ${activePct}%`}></div>

      {#if loopBoundsPct}
        <div
          class="obs-loop-band"
          style={`left: ${loopBoundsPct.aPct}%; width: ${Math.max(0.5, loopBoundsPct.bPct - loopBoundsPct.aPct)}%`}
        ></div>
      {/if}

      {#each files as file, i}
        <span
          class="obs-scan-tick"
          class:active={i === currentIndex}
          class:hovered={i === hoverIdx}
          style={`left: ${timelineMeta.positions[i] ?? 0}%`}
          title={formatObsTimestamp(file)}
        ></span>
      {/each}

      {#if loopBoundsPct}
        <button
          type="button"
          id="timeline-loop-line-a"
          data-testid="timeline-loop-line-a"
          data-loop-handle="a"
          class="obs-loop-handle loop-a"
          style={`left: ${loopBoundsPct.aPct}%`}
          onpointerdown={(e) => handleLoopHandlePointerDown("a", e)}
          aria-label="Loop start A"
        >
          <span>A</span>
        </button>
        <button
          type="button"
          id="timeline-loop-line-b"
          data-testid="timeline-loop-line-b"
          data-loop-handle="b"
          class="obs-loop-handle loop-b"
          style={`left: ${loopBoundsPct.bPct}%`}
          onpointerdown={(e) => handleLoopHandlePointerDown("b", e)}
          aria-label="Loop end B"
        >
          <span>B</span>
        </button>
      {/if}

      {#if files.length > 0}
        <div class="obs-playhead" style={`left: ${activePct}%`}></div>
      {/if}
    </div>

    <div class="obs-ruler-labels">
      {#each rulerLabels as lbl}
        <span
          class="obs-ruler-label"
          style={`left: ${lbl.pct}%`}
          class:edge-left={lbl.pct < 6}
          class:edge-right={lbl.pct > 94}
        >
          {lbl.text}
        </span>
      {/each}
    </div>
  </div>
</div>

<style>
  .obs-scrubber-root { display: flex; flex-direction: column; gap: 4px; width: 100%; min-width: 240px; padding: 2px 6px 4px; user-select: none; }
  .obs-scrubber-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .obs-range-pills { display: inline-flex; align-items: center; gap: 3px; background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(148, 163, 184, 0.22); border-radius: 6px; padding: 1px; }
  .obs-range-pill { border: none; background: transparent; color: var(--text-muted, #94a3b8); font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 4px; cursor: pointer; transition: background-color 0.15s, color 0.15s; }
  .obs-range-pill:hover { color: var(--text-primary, #f1f5f9); background: rgba(148, 163, 184, 0.16); }
  .obs-range-pill.active { background: var(--accent, #38bdf8); color: #082f49; }
  .obs-scrubber-meta { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; }
  .obs-active-time { color: var(--accent, #38bdf8); font-weight: 600; font-variant-numeric: tabular-nums; }
  .obs-scan-badge { color: var(--text-muted, #94a3b8); font-size: 10px; background: rgba(148, 163, 184, 0.14); border-radius: 999px; padding: 1px 7px; font-variant-numeric: tabular-nums; }
  .obs-scrubber-track-area { position: relative; padding: 10px 6px 14px; cursor: pointer; touch-action: none; outline: none; }
  .obs-scrubber-track-area:focus-visible .obs-track-rail { box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.45); }
  .obs-scrubber-track-area.scrubbing { cursor: grabbing; }
  .obs-hover-tooltip { position: absolute; top: -14px; transform: translateX(-50%); background: rgba(15, 23, 42, 0.94); color: #f8fafc; border: 1px solid rgba(56, 189, 248, 0.55); border-radius: 4px; padding: 1px 6px; font-size: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; pointer-events: none; z-index: 10; }
  .obs-track-rail { position: relative; height: 6px; background: rgba(148, 163, 184, 0.24); border-radius: 999px; }
  .obs-track-fill { position: absolute; top: 0; left: 0; height: 100%; background: linear-gradient(90deg, rgba(56, 189, 248, 0.45), rgba(56, 189, 248, 0.9)); border-radius: 999px; pointer-events: none; }
  .obs-loop-band { position: absolute; top: -1px; height: 8px; background: rgba(250, 204, 21, 0.25); border-top: 1px solid rgba(250, 204, 21, 0.7); border-bottom: 1px solid rgba(250, 204, 21, 0.7); pointer-events: none; }
  .obs-scan-tick { position: absolute; top: 50%; width: 2px; height: 8px; transform: translate(-50%, -50%); background: rgba(226, 232, 240, 0.48); border-radius: 1px; pointer-events: none; }
  .obs-scan-tick.hovered { height: 11px; background: #ffffff; }
  .obs-scan-tick.active { height: 12px; background: var(--accent, #38bdf8); }
  .obs-playhead { position: absolute; top: 50%; width: 12px; height: 12px; transform: translate(-50%, -50%); border-radius: 50%; background: #ffffff; border: 2px solid var(--accent, #38bdf8); box-shadow: 0 0 6px rgba(56, 189, 248, 0.75); pointer-events: none; z-index: 4; }
  .obs-loop-handle { position: absolute; top: -10px; transform: translateX(-50%); width: 14px; height: 24px; padding: 0; border: 1px solid #facc15; border-radius: 3px; background: rgba(15, 23, 42, 0.95); color: #facc15; font-size: 9px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; cursor: ew-resize; z-index: 6; }
  .obs-ruler-labels { position: relative; height: 13px; margin-top: 4px; pointer-events: none; }
  .obs-ruler-label { position: absolute; top: 0; transform: translateX(-50%); font-size: 9px; color: var(--text-muted, #94a3b8); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .obs-ruler-label.edge-left { transform: translateX(0%); }
  .obs-ruler-label.edge-right { transform: translateX(-100%); }
</style>
