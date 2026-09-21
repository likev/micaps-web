<script>
  import { fade } from "svelte/transition";
  import { ui, hideToast } from "../lib/stores/ui.svelte.js";
</script>

{#if ui.toast}
  <div
    id="error-toast"
    class="toast-container"
    class:error={ui.toast.kind === "error" || !ui.toast.kind}
    class:info={ui.toast.kind === "info"}
    class:success={ui.toast.kind === "success"}
    role="button"
    aria-label="Dismiss notification"
    aria-live="polite"
    tabindex="0"
    transition:fade={{ duration: 150 }}
    onclick={hideToast}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        hideToast();
      }
    }}
  >
    <span>{ui.toast.message}</span>
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    bottom: 76px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-secondary, #21262d);
    color: var(--accent-red, #f85149);
    border: 1px solid #da3633;
    border-radius: 6px;
    padding: 8px 14px;
    font-size: 12px;
    z-index: 9999;
    max-width: 80vw;
    overflow-wrap: break-word;
    word-break: break-word;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    cursor: pointer;
    user-select: none;
  }

  .toast-container.info {
    color: #58a6ff;
    border-color: #388bfd;
  }

  .toast-container.success {
    color: #3fb950;
    border-color: #2ea043;
  }
</style>
