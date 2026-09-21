<script>
  import MapViewport from "../map/MapViewport.svelte";

  let {
    win,
    isActive = false,
    onFocus = null,
    onClose = null,
    onMapCreated = null,
  } = $props();

  let winTitle = $derived.by(() => {
    if (!win) return "";
    if (win.title) return win.title;
    if (win.activeGroup?.name) return win.activeGroup.name;
    if (win.model && win.element) {
      const isUpper = win.model === "UPPER_AIR" || (typeof win.element === "string" && win.element.includes("UPPER"));
      if (win.isObservation) {
        return isUpper ? `${win.level || 500} hPa Sounding (${win.model})` : `${win.element} (${win.model})`;
      }
      return `${win.level ? `${win.level} hPa ` : ""}${win.element} (${win.model})`;
    }
    return `Window ${win.winIdx + 1}`;
  });

</script>

<div
  class="window-panel"
  class:active={isActive}
  data-win-id={win.id}
  tabindex="-1"
>
  <div
    class="win-header"
    role="button"
    tabindex="0"
    aria-label={`Focus window W${win.winIdx + 1}: ${winTitle}`}
    onclick={() => onFocus && onFocus(win)}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        if (onFocus) onFocus(win);
      }
    }}
  >
    <div class="win-title-group">
      <span class="win-badge">W{win.winIdx + 1}</span>
      <span class="win-title" title={winTitle}>{winTitle}</span>
    </div>

    <div class="win-actions">
      {#if onClose}
        <button
          type="button"
          class="win-btn-close"
          title="Close Subwindow"
          aria-label="Close Subwindow"
          onclick={(e) => {
            e.stopPropagation();
            onClose(win);
          }}
        >✕</button>
      {/if}
    </div>
  </div>

  <div class="win-body">
    <MapViewport winId={win.id} {isActive} {onMapCreated} />
  </div>
</div>

<style>
  .window-panel {
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
    background: #0d1117;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-sizing: border-box;
    width: 100%;
    height: 100%;
  }

  .window-panel.active {
    border-color: #58a6ff !important;
    box-shadow: inset 0 0 0 1px #58a6ff;
  }

  .win-header {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 4px 14px;
    height: 32px;
    min-height: 32px;
    background: var(--bg-panel, rgba(18, 24, 36, 0.85));
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.14));
    border-radius: 20px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
    z-index: 25;
    user-select: none;
    pointer-events: auto;
    max-width: min(85%, 680px);
    box-sizing: border-box;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .win-header:hover {
    background: rgba(22, 27, 34, 0.95);
    border-color: rgba(255, 255, 255, 0.22);
  }

  .window-panel.active .win-header {
    border-color: rgba(88, 166, 255, 0.5);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(88, 166, 255, 0.3);
  }

  .win-title-group {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
    min-width: 0;
    flex: 1;
  }

  .win-badge {
    font-size: 11px;
    background: #238636;
    color: #fff;
    padding: 2px 7px;
    border-radius: 10px;
    font-weight: 700;
    font-family: var(--font-mono, monospace);
    flex-shrink: 0;
    letter-spacing: 0.5px;
  }

  .window-panel.active .win-badge {
    background: #1f6feb;
  }

  .win-title {
    font-size: 14px;
    color: var(--text-primary, #f0f6fc);
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }

  .win-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .win-btn-close {
    background: transparent;
    border: none;
    color: var(--text-secondary, #8b949e);
    cursor: pointer;
    font-size: 13px;
    padding: 2px 4px;
    border-radius: 4px;
  }

  .win-btn-close:hover {
    color: var(--accent-red, #f85149);
    background: rgba(248, 81, 73, 0.15);
  }

  .win-body {
    flex: 1;
    min-height: 0;
    width: 100%;
    height: 100%;
    position: relative;
  }
</style>
