// windowReorder.js - Drag-reorder + split visibility for tab-wins
import { getVisibleWindows, getActiveTab, tabsState, getCallbacks } from "./tabsStore.js";
import { initWindowMap, syncTabCameras } from "./windowMaps.js";

function getPanelEl(win) {
  if (!win) return null;
  try {
    return document.getElementById(win.panelId) || null;
  } catch { return null; }
}

function getPillEl(win) {
  if (!win) return null;
  try {
    if (win.pillId) {
      const el = document.getElementById(win.pillId);
      if (el) return el;
    }
    // Fallback for legacy / mock wins without stable pillId
    return document.getElementById(`tab-item-win-${win.winIdx}`) || null;
  } catch { return null; }
}

function getLabelEl(win) {
  if (!win) return null;
  try {
    if (win.labelId) {
      const el = document.getElementById(win.labelId);
      if (el) return el;
    }
    return document.getElementById(`tab-label-${win.winIdx}`) || null;
  } catch { return null; }
}

// Update positional fields after order change. Stable DOM ids (panelId,
// pillId, ...) are never renamed so per-window layers/legends/maps stay bound.
// Pass the pre-mutation active object so a splice before the active index
// cannot misattribute focus (F1): post-splice tab.activeWinIdx is stale.
export function reindexWindowPositions(tab, activeWinOverride = null) {
  if (!tab || !Array.isArray(tab.windows)) return;
  let activeWin = activeWinOverride !== undefined && activeWinOverride !== null
    ? activeWinOverride
    : tab.windows[tab.activeWinIdx] || null;
  if (activeWin && !tab.windows.includes(activeWin)) activeWin = null;
  tab.windows.forEach((w, idx) => {
    w.winIdx = idx;
    const panel = getPanelEl(w);
    if (panel) {
      panel.dataset.winIdx = String(idx);
      panel.dataset.tabId = String(tab.id);
    }
    const pill = getPillEl(w);
    if (pill) {
      pill.dataset.winIdx = String(idx);
      pill.dataset.tabId = String(tab.id);
      const isActive = w === activeWin;
      pill.classList?.toggle?.("active", isActive);
      try { pill.setAttribute("aria-selected", isActive ? "true" : "false"); } catch {}
    }
    try {
      const badge = w.badgeId ? document.getElementById(w.badgeId) : null;
      if (badge) badge.textContent = `W${idx + 1}`;
    } catch {}
    try {
      const label = getLabelEl(w);
      if (label) {
        const titleText = w.titleId ? (document.getElementById(w.titleId)?.textContent || "") : "";
        // Preserve existing custom label when it already carries a title;
        // otherwise keep the default Tab N / W N: title shape.
        if (!label.textContent || /^Tab \d+$/.test(label.textContent) || /^W\d+:/.test(label.textContent)) {
          label.textContent = titleText ? `W${idx + 1}: ${titleText}` : `Tab ${idx + 1}`;
        } else if (titleText && label.textContent !== titleText) {
          label.textContent = `W${idx + 1}: ${titleText}`;
        }
      }
    } catch {}
    // Keep close-button affordance consistent: only wins beyond the first
    // four are closable (matches pill creation rule wIdx >= 4). The pill's
    // own click listener already handles .tab-close-btn via bubbling, so no
    // extra listener is needed here (avoids a cycle with windowPanels.js).
    try {
      const pill = getPillEl(w);
      const closeBtn = w.closeBtnId ? document.getElementById(w.closeBtnId) : pill?.querySelector?.(".tab-close-btn");
      if (pill && !closeBtn && idx >= 4) {
        const btn = document.createElement("button");
        btn.className = "tab-close-btn";
        if (w.closeBtnId) btn.id = w.closeBtnId;
        btn.title = "Close Tab";
        btn.textContent = "×";
        pill.appendChild(btn);
      } else if (pill && closeBtn && idx < 4) {
        closeBtn.remove();
      }
    } catch {}
  });
  if (activeWin) {
    const nextActive = tab.windows.indexOf(activeWin);
    tab.activeWinIdx = nextActive >= 0 ? nextActive : Math.min(tab.activeWinIdx, tab.windows.length - 1);
  } else {
    tab.activeWinIdx = Math.min(Math.max(0, tab.activeWinIdx || 0), tab.windows.length - 1);
  }
}

// Toggle .slot-visible so any win (not just idx 0..N-1) can appear in splits.
// Visibility always includes the active window.
export function applySplitVisibility(tab) {
  if (!tab || !Array.isArray(tab.windows)) return [];
  const visible = getVisibleWindows(tab);
  const visibleSet = new Set(visible);
  const callbacks = getCallbacks();
  visible.forEach((win) => {
    if (win && !win.map) {
      try {
        initWindowMap(win);
        if (callbacks.onWindowInit) callbacks.onWindowInit(win);
      } catch {}
    }
  });
  tab.windows.forEach((win) => {
    const panel = getPanelEl(win);
    if (panel?.classList) {
      panel.classList.toggle("slot-visible", visibleSet.has(win));
    }
  });
  const schedule = () => {
    visible.forEach((win) => {
      try { if (win.map) win.map.resize(); } catch {}
    });
    try {
      if (tab.layout !== "1x1" && tab.syncMap) syncTabCameras(tab);
    } catch {}
  };
  if (typeof requestAnimationFrame === "function") {
    try { requestAnimationFrame(schedule); } catch { setTimeout(schedule, 20); }
  } else {
    setTimeout(schedule, 20);
  }
  return visible;
}

// Move window from fromIdx to toIdx (both are positions in tab.windows).
export function reorderWindows(tab, fromIdx, toIdx) {
  if (!tab || !Array.isArray(tab.windows)) return false;
  const n = tab.windows.length;
  if (!Number.isInteger(fromIdx) || !Number.isInteger(toIdx)) return false;
  if (fromIdx < 0 || fromIdx >= n || toIdx < 0 || toIdx >= n) return false;
  if (fromIdx === toIdx) return false;

  // Capture the active object BEFORE mutation (F1): post-splice indices shift.
  const activeBeforeMove = tab.windows[tab.activeWinIdx] || null;
  const [moved] = tab.windows.splice(fromIdx, 1);
  tab.windows.splice(toIdx, 0, moved);
  reindexWindowPositions(tab, activeBeforeMove);

  // Re-append panels + pills in the new order so the grid packs correctly.
  try {
    const grid = document.getElementById(`windows-grid-${tab.id}`);
    if (grid) {
      tab.windows.forEach((w) => {
        const panel = getPanelEl(w);
        if (panel) grid.appendChild(panel);
      });
    }
  } catch {}
  try {
    const tabsList = document.getElementById("tabs-list");
    const addBtn = document.getElementById("btn-add-tab");
    const cfgPill = document.getElementById("tab-item-config");
    const anchor = cfgPill && cfgPill.parentNode === tabsList ? cfgPill : addBtn;
    if (tabsList) {
      tab.windows.forEach((w) => {
        const pill = getPillEl(w);
        if (pill) {
          if (anchor) tabsList.insertBefore(pill, anchor);
          else tabsList.appendChild(pill);
        }
      });
    }
  } catch {}

  applySplitVisibility(tab);
  return true;
}

function getTabFromDataset(el) {
  try {
    const tabId = parseInt(el?.dataset?.tabId, 10);
    if (!Number.isNaN(tabId)) {
      const found = tabsState.tabs.find((t) => t.id === tabId);
      if (found) return found;
    }
  } catch {}
  return null;
}

function findReorderTab(sourceEl, targetEl) {
  return getTabFromDataset(sourceEl) || getTabFromDataset(targetEl) || getActiveTab() || null;
}

function readWinIdx(el) {
  const v = parseInt(el?.dataset?.winIdx, 10);
  return Number.isNaN(v) ? null : v;
}

function readUid(el) {
  const v = el?.dataset?.uid;
  return v !== undefined && v !== null && String(v) !== "" ? String(v) : null;
}

function findWinIndexByUid(tab, uid) {
  if (!tab || uid == null) return -1;
  return tab.windows.findIndex((w) => String(w.uid) === String(uid));
}

let dndEnabled = false;

// HTML5 mouse-drag for pills (tab bar) and win headers (split panels).
// Delegated so dynamically added windows work without rewiring.
export function enableWindowReorderDnD() {
  if (dndEnabled) return;
  if (typeof document === "undefined") return;
  dndEnabled = true;

  let dragFromIdx = null;
  let dragFromUid = null;
  let dragTab = null;

  const clearIndicators = () => {
    try {
      document.querySelectorAll?.(".tab-item.drag-over")?.forEach((el) => el.classList.remove("drag-over"));
      document.querySelectorAll?.(".window-panel.drag-over")?.forEach((el) => el.classList.remove("drag-over"));
      document.querySelectorAll?.(".tab-item.dragging")?.forEach((el) => el.classList.remove("dragging"));
      document.querySelectorAll?.(".window-panel.dragging")?.forEach((el) => el.classList.remove("dragging"));
    } catch {}
  };

  const resetDrag = () => {
    dragFromIdx = null;
    dragFromUid = null;
    dragTab = null;
  };

  document.addEventListener("dragstart", (e) => {
    const pill = e.target?.closest?.(".tab-item:not(.tab-item-config)");
    const header = e.target?.closest?.(".win-header");
    let sourceEl = null;
    if (pill && (e.target === pill || pill.contains(e.target))) {
      // Only start pill drag from the pill itself (close button excluded).
      if (e.target?.closest?.(".tab-close-btn")) return;
      sourceEl = pill;
    } else if (header) {
      if (e.target?.tagName === "SELECT" || e.target?.tagName === "BUTTON" || e.target?.tagName === "OPTION") return;
      sourceEl = header.closest?.(".window-panel");
    }
    if (!sourceEl) return;
    const idx = readWinIdx(sourceEl);
    if (idx == null) return;
    dragFromIdx = idx;
    dragFromUid = readUid(sourceEl);
    dragTab = findReorderTab(sourceEl, sourceEl);
    sourceEl.classList?.add?.("dragging");
    try {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/tab-win-idx", String(idx));
      if (dragFromUid != null) e.dataTransfer.setData("text/tab-win-uid", dragFromUid);
    } catch {}
  });

  document.addEventListener("dragover", (e) => {
    if (dragFromIdx == null && dragFromUid == null) return;
    const pill = e.target?.closest?.(".tab-item:not(.tab-item-config)");
    const panel = e.target?.closest?.(".window-panel");
    const over = pill || panel;
    if (!over) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = "move"; } catch {}
    over.classList?.add?.("drag-over");
  });

  document.addEventListener("dragleave", (e) => {
    const pill = e.target?.closest?.(".tab-item:not(.tab-item-config)");
    const panel = e.target?.closest?.(".window-panel");
    (pill || panel)?.classList?.remove?.("drag-over");
  });

  document.addEventListener("drop", (e) => {
    if (dragFromIdx == null && dragFromUid == null) return;
    const pill = e.target?.closest?.(".tab-item:not(.tab-item-config)");
    const panel = e.target?.closest?.(".window-panel");
    const over = pill || panel;
    if (!over) return;
    e.preventDefault();
    const tab = findReorderTab(over, over) || dragTab;
    clearIndicators();
    if (tab) {
      // Resolve by stable uid at drop time so an add/close between
      // dragstart and drop cannot make the positional index stale (F3).
      let fromIdx = dragFromUid != null ? findWinIndexByUid(tab, dragFromUid) : -1;
      if (fromIdx < 0) {
        try {
          const dtIdx = parseInt(e.dataTransfer?.getData?.("text/tab-win-idx"), 10);
          if (!Number.isNaN(dtIdx) && dtIdx >= 0 && dtIdx < tab.windows.length) fromIdx = dtIdx;
          else fromIdx = dragFromIdx;
        } catch { fromIdx = dragFromIdx; }
      }
      let toIdx = -1;
      const overUid = readUid(over);
      if (overUid != null) toIdx = findWinIndexByUid(tab, overUid);
      if (toIdx < 0) toIdx = readWinIdx(over);
      if (fromIdx != null && toIdx != null && fromIdx !== toIdx) {
        try { reorderWindows(tab, fromIdx, toIdx); } catch { console.debug("[tabs] reorder drop failed", fromIdx, toIdx); }
      }
    }
    resetDrag();
  });

  document.addEventListener("dragend", () => {
    clearIndicators();
    resetDrag();
  });
}
