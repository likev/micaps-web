<script>
  import { onMount } from "svelte";
  import { isFullscreen, toggleFullscreen } from "../ui/fullscreenControl.js";
  import { ui } from "../lib/stores/ui.svelte.js";

  let inFullscreen = $state(false);

  function sync() {
    inFullscreen = isFullscreen();
    ui.isFullscreen = inFullscreen;
  }

  onMount(() => {
    sync();
    const events = ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"];
    events.forEach((e) => document.addEventListener(e, sync));
    return () => {
      events.forEach((e) => document.removeEventListener(e, sync));
    };
  });

  async function handleClick() {
    await toggleFullscreen();
    sync();
  }
</script>

<button
  id="btn-fullscreen-toggle"
  class="btn-fullscreen-toggle"
  class:is-fullscreen={inFullscreen}
  type="button"
  aria-label={inFullscreen ? "Exit Fullscreen" : "Toggle Fullscreen"}
  title={inFullscreen ? "Exit Fullscreen" : "Toggle Fullscreen"}
  onclick={handleClick}
>
  {#if inFullscreen}
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 3v3a2 2 0 0 1-2 2H3"></path>
      <path d="M21 8h-3a2 2 0 0 1-2-2V3"></path>
      <path d="M3 16h3a2 2 0 0 1 2 2v3"></path>
      <path d="M16 21v-3a2 2 0 0 1 2-2h3"></path>
    </svg>
  {:else}
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
      <path d="M21 8V5a2 2 0 0 0-2-2h-3"></path>
      <path d="M3 16v3a2 2 0 0 2 2h3"></path>
      <path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>
    </svg>
  {/if}
</button>

<style>
  .btn-fullscreen-toggle {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 520;
    width: 36px;
    height: 36px;
    padding: 0;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-panel, rgba(18, 24, 36, 0.88));
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    color: var(--text-primary, #e6edf3);
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
    outline: none;
    user-select: none;
  }

  .btn-fullscreen-toggle:hover {
    background: rgba(30, 41, 59, 0.95);
    border-color: rgba(255, 255, 255, 0.25);
    color: #ffffff;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
  }

  .btn-fullscreen-toggle:active {
    transform: translateY(-50%) scale(0.95);
  }

  .btn-fullscreen-toggle:focus-visible {
    box-shadow: 0 0 0 2px var(--accent-blue, #388bfd), 0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .btn-fullscreen-toggle svg {
    width: 18px;
    height: 18px;
    display: block;
    pointer-events: none;
    stroke: currentColor;
  }
</style>
