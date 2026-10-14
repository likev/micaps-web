<script>
  import { focusRestore } from "../actions/focusRestore.js";

  let { open = false, onClose = null } = $props();

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  }

  function handleKeydown(e) {
    if (!open) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      if (onClose) onClose();
      return;
    }
    if (e.key === "Tab") {
      const dialog = document.querySelector(".help-modal-dialog");
      if (!dialog) return;
      const focusables = Array.from(dialog.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    class="help-modal-overlay"
    role="presentation"
    onclick={handleBackdropClick}
  >
    <div
      class="help-modal-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
      use:focusRestore
    >
      <header class="help-modal-header">
        <div class="header-title-group">
          <span class="help-icon" aria-hidden="true">📖</span>
          <h2 id="help-modal-title" class="help-title">Help & Shortcuts / 快捷键与使用帮助</h2>
        </div>
        <button
          type="button"
          class="btn-close-help"
          aria-label="Close help"
          onclick={() => onClose && onClose()}
        >
          ✕
        </button>
      </header>

      <div class="help-modal-body">
        <section class="help-section">
          <h3 class="section-title">⌨️ Keyboard Shortcuts / 快捷键操作</h3>
          <div class="shortcuts-grid">
            <div class="shortcut-row">
              <span class="kbd-pill">◀ / ▶</span>
              <span class="shortcut-desc">Step Timeline (Prev / Next lead time / obs file) / 时间步进</span>
            </div>
            <div class="shortcut-row">
              <span class="kbd-pill">▲ / ▼</span>
              <span class="shortcut-desc">Step Vertical Level (1000hPa ~ 100hPa) / 切换高度层</span>
            </div>
            <div class="shortcut-row">
              <span class="kbd-pill">Space</span>
              <span class="shortcut-desc">Play / Pause Timeline Animation / 播放或暂停动画</span>
            </div>
            <div class="shortcut-row">
              <span class="kbd-pill">F4 / Alt+S</span>
              <span class="shortcut-desc">Cycle Split View Layout (1x1 ~ 3x2) / 切换多屏分屏布局</span>
            </div>
            <div class="shortcut-row">
              <span class="kbd-pill">Esc</span>
              <span class="shortcut-desc">Close Modals & Configuration Editor / 关闭弹窗与配置界面</span>
            </div>
          </div>
        </section>

        <section class="help-section">
          <h3 class="section-title">🧭 Quick Guide / 核心功能导航</h3>
          <ul class="guide-list">
            <li>
              <strong>Presets (组合图):</strong> Select meteorological combinations (Upper-air, Surface, ECMWF, GRAPES-GFS) from the top nav bar. Supports keyboard navigation and hover submenus.
            </li>
            <li>
              <strong>Status Bar (状态栏):</strong> Located at the bottom of the window, displaying the Layers toggle switch, active NWP/OBS mode, forecast init cycle, valid times, and backend connection status.
            </li>
            <li>
              <strong>Layers Panel (图层管理):</strong> Click the "Layers" toggle in the status bar to show or hide the layer stack, adjust contour intervals, styles, and opacities.
            </li>
            <li>
              <strong>Multi-Window & Tabs (多窗对比):</strong> Use the tab bar to add windows, switch layouts (1x1, 1x2, 2x2, etc.), and synchronize map zoom and pan across windows.
            </li>
            <li>
              <strong>Hamburger Menu (☰):</strong> Access Print, Screenshot capture, this Help guide, and the Configuration Editor.
            </li>
          </ul>
        </section>
      </div>

      <footer class="help-modal-footer">
        <span class="system-badge">MICAPS-Web PRO v1.9.0</span>
        <button
          type="button"
          class="btn btn-primary"
          onclick={() => onClose && onClose()}
        >
          Got it / 关闭
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .help-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(2px);
    z-index: 3000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    box-sizing: border-box;
  }

  .help-modal-dialog {
    background: #161b22;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    width: 640px;
    max-width: 95vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
    color: #e6edf3;
    overflow: hidden;
  }

  .help-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    background: #0d1117;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .header-title-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .help-icon {
    font-size: 18px;
  }

  .help-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #e6edf3;
  }

  .btn-close-help {
    background: transparent;
    border: none;
    color: #8b949e;
    font-size: 16px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: color 0.15s ease, background 0.15s ease;
  }

  .btn-close-help:hover {
    color: #f85149;
    background: rgba(248, 81, 73, 0.15);
  }

  .help-modal-body {
    padding: 18px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .help-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #79c0ff;
  }

  .shortcuts-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: #0d1117;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 10px 14px;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .kbd-pill {
    display: inline-block;
    min-width: 80px;
    padding: 2px 8px;
    background: #21262d;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    color: #79c0ff;
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 600;
    text-align: center;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }

  .shortcut-desc {
    font-size: 12px;
    color: #c9d1d9;
  }

  .guide-list {
    margin: 0;
    padding-left: 20px;
    font-size: 12px;
    line-height: 1.6;
    color: #8b949e;
  }

  .guide-list li strong {
    color: #e6edf3;
  }

  .help-modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 18px;
    background: #0d1117;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .system-badge {
    font-size: 11px;
    color: #8b949e;
    font-family: var(--font-mono, monospace);
  }
</style>
