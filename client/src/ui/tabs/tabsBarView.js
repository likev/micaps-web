// tabsBarView.js - Tab bar and layout buttons view components
import { getActiveTab, getActiveTabId } from "./tabsStore.js";

export function renderTabsBar({ onAddTab, onSetLayout, onSyncToggle } = {}) {
  const tabsBar = document.getElementById("tabs-bar");
  if (!tabsBar) return;

  tabsBar.innerHTML = `
    <div class="tabs-list" id="tabs-list">
      <button class="btn-add-tab" id="btn-add-tab" title="Add new tab">+</button>
    </div>
    <div class="layout-controls" id="layout-controls">
      <span class="layout-label">Layout:</span>
      <button id="btn-layout-1" class="layout-btn active" title="Tabs Mode (Full window tab)">⊟ Tabs</button>
      <button id="btn-layout-2" class="layout-btn" title="2-Split Mode (Side-by-side 1x2)">◫ 2-Split</button>
      <button id="btn-layout-4" class="layout-btn" title="4-Split Mode (2x2 grid)">⊞ 4-Split</button>
      <button id="btn-sync-toggle" class="layout-btn active hidden" title="Sync pan & zoom across windows">Sync 🔗</button>
    </div>
  `;

  document.getElementById("btn-add-tab")?.addEventListener("click", () => {
    onAddTab?.();
  });

  document.getElementById("btn-layout-1")?.addEventListener("click", () => {
    onSetLayout?.(getActiveTabId(), "1x1");
  });

  document.getElementById("btn-layout-2")?.addEventListener("click", () => {
    onSetLayout?.(getActiveTabId(), "1x2");
  });

  document.getElementById("btn-layout-4")?.addEventListener("click", () => {
    onSetLayout?.(getActiveTabId(), "2x2");
  });

  document.getElementById("btn-sync-toggle")?.addEventListener("click", () => {
    onSyncToggle?.();
  });
}

export function renderTabPillForWindow(tab, winObj, { onFocus, onClose } = {}) {
  const tabsList = document.getElementById("tabs-list");
  const addBtn = document.getElementById("btn-add-tab");
  if (!tabsList || !addBtn) return;

  const wIdx = winObj.winIdx;
  const pill = document.createElement("div");
  pill.className = `tab-item ${wIdx === tab.activeWinIdx ? "active" : ""}`;
  pill.id = `tab-item-win-${wIdx}`;
  pill.dataset.winIdx = String(wIdx);
  pill.setAttribute("role", "tab");
  pill.setAttribute("aria-selected", wIdx === tab.activeWinIdx ? "true" : "false");

  pill.innerHTML = `
    <span class="tab-label" id="tab-label-${wIdx}">Tab ${wIdx + 1}</span>
    ${wIdx >= 4 ? `<button class="tab-close-btn" id="tab-close-${wIdx}" title="Close Tab">×</button>` : ""}
  `;

  pill.addEventListener("click", (e) => {
    const curIdx = parseInt(pill.dataset.winIdx, 10);
    const targetIdx = Number.isNaN(curIdx) ? winObj.winIdx : curIdx;
    if (e.target.classList.contains("tab-close-btn")) {
      e.stopPropagation();
      onClose?.(tab, targetIdx);
    } else {
      onFocus?.(tab.id, targetIdx);
    }
  });

  tabsList.insertBefore(pill, addBtn);
}

export function updateLayoutButtons(layout) {
  const btn1 = document.getElementById("btn-layout-1");
  const btn2 = document.getElementById("btn-layout-2");
  const btn4 = document.getElementById("btn-layout-4");
  const syncBtn = document.getElementById("btn-sync-toggle");
  const tabsList = document.getElementById("tabs-list");
  const tab = getActiveTab();

  if (btn1) {
    btn1.classList.toggle("active", layout === "1x1");
    btn1.setAttribute("aria-pressed", layout === "1x1" ? "true" : "false");
  }
  if (btn2) {
    btn2.classList.toggle("active", layout === "1x2");
    btn2.setAttribute("aria-pressed", layout === "1x2" ? "true" : "false");
  }
  if (btn4) {
    btn4.classList.toggle("active", layout === "2x2");
    btn4.setAttribute("aria-pressed", layout === "2x2" ? "true" : "false");
  }

  if (tabsList) {
    tabsList.classList.toggle("hidden", layout !== "1x1");
  }

  if (syncBtn) {
    syncBtn.classList.toggle("hidden", layout === "1x1");
    if (tab) {
      const isSync = tab.syncMap !== false;
      syncBtn.classList.toggle("active", isSync);
      syncBtn.setAttribute("aria-pressed", isSync ? "true" : "false");
      syncBtn.textContent = isSync ? "Sync 🔗" : "Sync ✕";
      syncBtn.title = isSync
        ? "Camera sync enabled across windows (Click to toggle off)"
        : "Camera sync disabled (Click to toggle on)";
    }
  }
}
