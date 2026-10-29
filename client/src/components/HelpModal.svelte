<script>
  import { focusRestore } from "../actions/focusRestore.js";
  import { getGlobalLocale } from "../lib/stores/i18n.svelte.js";

  let { open = false, onClose = null } = $props();
  let currentLocale = $derived(getGlobalLocale());
  let isZh = $derived(currentLocale === "zh");

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
      class="help-modal-dialog help-modal-content"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
      use:focusRestore
    >
      <header class="help-modal-header">
        <div class="header-title-group">
          <span class="help-icon" aria-hidden="true">📖</span>
          <h2 id="help-modal-title" class="help-title">{isZh ? "快捷键与使用帮助" : "Help & Shortcuts"}</h2>
        </div>
        <button
          type="button"
          class="btn-close-help"
          aria-label={isZh ? "关闭帮助" : "Close help"}
          onclick={() => onClose && onClose()}
        >
          ✕
        </button>
      </header>

      <div class="help-modal-body">
        <section class="help-section">
          <h3 class="section-title">{isZh ? "⌨️ 快捷键操作" : "⌨️ Keyboard Shortcuts"}</h3>
          <div class="shortcuts-grid">
            <div class="shortcut-row">
              <span class="kbd-pill">◀ / ▶</span>
              <span class="shortcut-desc">{isZh ? "时间步进 (上一时次 / 下一时次)" : "Step Timeline (Prev / Next lead time / obs file)"}</span>
            </div>
            <div class="shortcut-row">
              <span class="kbd-pill">▲ / ▼</span>
              <span class="shortcut-desc">{isZh ? "切换高度层 (1000hPa ~ 100hPa)" : "Step Vertical Level (1000hPa ~ 100hPa)"}</span>
            </div>
            <div class="shortcut-row">
              <span class="kbd-pill">Space</span>
              <span class="shortcut-desc">{isZh ? "播放或暂停动画" : "Play / Pause Timeline Animation"}</span>
            </div>
            <div class="shortcut-row">
              <span class="kbd-pill">F4 / Alt+S</span>
              <span class="shortcut-desc">{isZh ? "切换多屏分屏布局 (1x1 ~ 3x2)" : "Cycle Split View Layout (1x1 ~ 3x2)"}</span>
            </div>
            <div class="shortcut-row">
              <span class="kbd-pill">Esc</span>
              <span class="shortcut-desc">{isZh ? "关闭弹窗与配置界面" : "Close Modals & Configuration Editor"}</span>
            </div>
          </div>
        </section>

        <section class="help-section">
          <h3 class="section-title">{isZh ? "🧭 核心功能指南" : "🧭 Quick Guide"}</h3>
          <ul class="guide-list">
            <li>
              <strong>{isZh ? "预设组合图 (Presets):" : "Presets (组合图):"}</strong> {isZh ? "从顶部导航栏选择气象预设组合图 (高空、地面、ECMWF、GRAPES-GFS 等)。支持键盘导航与悬停展开。" : "Select meteorological combinations (Upper-air, Surface, ECMWF, GRAPES-GFS) from the top nav bar. Supports keyboard navigation and hover submenus."}
            </li>
            <li>
              <strong>{isZh ? "状态栏 (Status Bar):" : "Status Bar (状态栏):"}</strong> {isZh ? "位于窗口底部，显示图层面板开关、当前模式、起报时次、预报时效及后端连接状态。" : "Located at the bottom of the window, displaying the Layers toggle switch, active NWP/OBS mode, forecast init cycle, valid times, and backend connection status."}
            </li>
            <li>
              <strong>{isZh ? "图层管理 (Layers Panel):" : "Layers Panel (图层管理):"}</strong> {isZh ? "点击状态栏的“图层”按钮展开或隐藏图层列表，调节等值线间隔、样式与透明度。" : "Click the \"Layers\" toggle in the status bar to show or hide the layer stack, adjust contour intervals, styles, and opacities."}
            </li>
            <li>
              <strong>{isZh ? "多窗对比 (Multi-Window & Tabs):" : "Multi-Window & Tabs (多窗对比):"}</strong> {isZh ? "使用标签栏添加窗口，切换多屏分屏布局 (1x1, 1x2, 2x2 等)，并同步跨窗口缩放平移。" : "Use the tab bar to add windows, switch layouts (1x1, 1x2, 2x2, etc.), and synchronize map zoom and pan across windows."}
            </li>
            <li>
              <strong>{isZh ? "主菜单 (☰):" : "Hamburger Menu (☰):"}</strong> {isZh ? "支持打印、截图导出、主题与语言切换及气象配置编辑器。" : "Access Print, Screenshot capture, Theme & Language switcher, this Help guide, and the Configuration Editor."}
            </li>
          </ul>
        </section>
      </div>

      <footer class="help-modal-footer">
        <span class="system-badge">MICAPS-Web PRO v1.12.1</span>
        <button
          type="button"
          class="btn btn-primary"
          onclick={() => onClose && onClose()}
        >
          {isZh ? "知道了" : "Got it"}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .help-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .help-modal-dialog {
    background: var(--bg-panel, #161b22);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
    border-radius: 8px;
    width: 640px;
    max-width: 95vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-3, 0 16px 40px rgba(0, 0, 0, 0.6));
    color: var(--text-primary, #e6edf3);
    overflow: hidden;
  }

  .help-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    background: var(--bg-secondary, #0d1117);
    border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
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
    color: var(--text-primary, #e6edf3);
  }

  .btn-close-help {
    background: transparent;
    border: none;
    color: var(--text-secondary, #8b949e);
    font-size: 16px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: color 0.15s ease, background 0.15s ease;
  }

  .btn-close-help:hover {
    color: var(--accent-red, #f85149);
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
    color: var(--accent-blue, #79c0ff);
  }

  .shortcuts-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--bg-secondary, #0d1117);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
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
    background: var(--bg-card, #21262d);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
    border-radius: 4px;
    color: var(--accent-blue, #79c0ff);
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 600;
    text-align: center;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }

  .shortcut-desc {
    font-size: 12px;
    color: var(--text-primary, #c9d1d9);
  }

  .guide-list {
    margin: 0;
    padding-left: 20px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-secondary, #8b949e);
  }

  .guide-list li strong {
    color: var(--text-primary, #e6edf3);
  }

  .help-modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 18px;
    background: var(--bg-secondary, #0d1117);
    border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  }

  .system-badge {
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
    font-family: var(--font-mono, monospace);
  }
</style>
