// configEditor.js - Interactive Preset & Colormap Configuration Editor Tab
import { PRESET_GROUPS, loadPresetGroups, savePresetConfig, formatCompactJSON } from "../config/presets.js";
import { refreshPresetControls, getActiveWindow, focusWindow } from "./tabWindowManager.js";
import { refreshNavBarPresets } from "./navBar.js";
import { appState } from "../store/appState.js";

let isConfigTabOpen = false;
let onConfigChangedCallback = null;
let prevActiveTabId = null;
let prevActiveWinIdx = null;
let lastSavedText = "";
let beforeUnloadHandler = null;

function hasUnsavedChanges() {
  const ta = document.getElementById("config-json-textarea");
  return ta && ta.value !== lastSavedText;
}

function ensureBeforeUnload() {
  if (beforeUnloadHandler) return;
  beforeUnloadHandler = (e) => {
    if (!hasUnsavedChanges()) return;
    e.preventDefault();
    e.returnValue = "";
  };
  window.addEventListener("beforeunload", beforeUnloadHandler);
}

function clearBeforeUnload() {
  if (beforeUnloadHandler) {
    window.removeEventListener("beforeunload", beforeUnloadHandler);
    beforeUnloadHandler = null;
  }
}

function updateBeforeUnloadState() {
  if (hasUnsavedChanges()) ensureBeforeUnload();
  else clearBeforeUnload();
}

export function initConfigEditor(onConfigChanged) {
  onConfigChangedCallback = onConfigChanged;
}

export function isConfigEditorOpen() {
  return isConfigTabOpen;
}

export function openConfigTab() {
  const tabsList = document.getElementById("tabs-list");
  const wsContainer = document.getElementById("workspace-container");
  if (!tabsList || !wsContainer) return;

  // Remember previously active window to restore on close
  const activeWin = getActiveWindow?.();
  if (activeWin) {
    prevActiveTabId = activeWin.tabId;
    prevActiveWinIdx = activeWin.winIdx;
  } else if (appState.get("activeWinId")) {
    // fallback: keep previous recorded ids
  }

  // 1. If tab already exists, focus it
  let tabPill = document.getElementById("tab-item-config");
  let panel = document.getElementById("config-editor-panel");

  if (!tabPill) {
    tabPill = document.createElement("div");
    tabPill.className = "tab-item tab-item-config";
    tabPill.id = "tab-item-config";
    tabPill.setAttribute("role", "tab");
    tabPill.setAttribute("aria-selected", "false");
    tabPill.innerHTML = `
      <span class="tab-label">⚙ Config</span>
      <button class="tab-close-btn" id="btn-config-tab-close" title="Close Config Tab">×</button>
    `;

    const addBtn = document.getElementById("btn-add-tab");
    // Fix: tabsList may be hidden in split mode (layout !== 1x1 → .hidden). Ensure pill remains visible.
    const wasHidden = tabsList.classList.contains("hidden");
    if (wasHidden) tabsList.classList.remove("hidden");
    if (addBtn && addBtn.parentNode === tabsList) {
      tabsList.insertBefore(tabPill, addBtn);
    } else {
      tabsList.appendChild(tabPill);
    }
    // If we temporarily un-hid tabsList for insertion, keep it visible while config tab is open
    // (activateConfigTab will manage workspace visibility; tabs-list visibility is layout-driven but config should be accessible)

    tabPill.addEventListener("click", (e) => {
      if (e.target.classList.contains("tab-close-btn")) {
        e.stopPropagation();
        closeConfigTab();
      } else {
        activateConfigTab();
      }
    });
  } else {
    // Pill already exists but may be hidden due to prior layout change — ensure visible
    tabPill.style.display = "";
    if (tabsList.classList.contains("hidden")) tabsList.classList.remove("hidden");
  }

  if (!panel) {
    panel = document.createElement("div");
    panel.className = "config-editor-panel";
    panel.id = "config-editor-panel";
    panel.innerHTML = `
      <div class="config-editor-toolbar">
        <div class="config-editor-title-group">
          <span class="config-editor-title">⚙ Meteorological Preset & Colormap Configuration</span>
          <span class="config-editor-status" id="config-status-badge">Loading...</span>
        </div>
        <div class="config-editor-actions">
          <button id="btn-config-format" class="btn" title="Auto-format and indent JSON">⚡ Format</button>
          <button id="btn-config-reload" class="btn" title="Reload original preset configuration from server">🔄 Reload</button>
          <button id="btn-config-cancel" class="btn" title="Cancel changes and close Config Tab">✕ Cancel</button>
          <button id="btn-config-save" class="btn btn-primary" title="Save configuration to server and apply immediately">💾 Save</button>
        </div>
      </div>
      <div class="config-editor-body">
        <textarea id="config-json-textarea" class="config-editor-textarea" spellcheck="false" placeholder="Loading config.json..."></textarea>
        <div class="config-editor-msg" id="config-editor-msg"></div>
      </div>
    `;
    wsContainer.appendChild(panel);
    bindEditorEvents(panel);
  }

  activateConfigTab();
  loadCurrentConfigIntoEditor();
}

export function activateConfigTab() {
  isConfigTabOpen = true;
  document.querySelectorAll(".tab-item").forEach((pill) => {
    pill.classList.remove("active");
    pill.setAttribute("aria-selected", "false");
  });
  const cfgPill = document.getElementById("tab-item-config");
  if (cfgPill) {
    cfgPill.classList.add("active");
    cfgPill.setAttribute("aria-selected", "true");
  }

  document.querySelectorAll(".tab-workspace").forEach((ws) => ws.classList.remove("active"));
  // Ensure any active-single window highlight is cleared while config is open (state inconsistency fix)
  document.querySelectorAll(".window-panel.active-single").forEach((wp) => wp.classList.remove("active-single"));
  const panel = document.getElementById("config-editor-panel");
  if (panel) panel.style.display = "flex";

  const layerPanel = document.getElementById("layer-control");
  if (layerPanel) layerPanel.classList.add("hidden");
  const legendPanel = document.getElementById("legend-panel");
  if (legendPanel) legendPanel.classList.add("hidden");
}

export function closeConfigTab() {
  // beforeunload guard: if unsaved changes, confirm (when user clicks close button)
  if (hasUnsavedChanges()) {
    const ok = window.confirm("You have unsaved changes. Close without saving?");
    if (!ok) return;
  }
  clearBeforeUnload();
  isConfigTabOpen = false;
  document.getElementById("tab-item-config")?.remove();
  const panel = document.getElementById("config-editor-panel");
  if (panel) panel.remove();

  // Restore previously active window instead of always wsList[0]
  let restored = false;
  if (prevActiveTabId !== null && prevActiveWinIdx !== null) {
    try { focusWindow(prevActiveTabId, prevActiveWinIdx); restored = true; } catch {}
  }
  if (!restored) {
    const wsList = document.querySelectorAll(".tab-workspace");
    if (wsList.length > 0) {
      wsList[0].classList.add("active");
    }
    const tabPills = document.querySelectorAll(".tab-item:not(.tab-item-config)");
    if (tabPills.length > 0) {
      tabPills[0].classList.add("active");
      tabPills[0].setAttribute("aria-selected", "true");
    }
  }

  const legendPanel = document.getElementById("legend-panel");
  if (legendPanel) legendPanel.classList.remove("hidden");
}

async function loadCurrentConfigIntoEditor() {
  const textarea = document.getElementById("config-json-textarea");
  const badge = document.getElementById("config-status-badge");
  const msg = document.getElementById("config-editor-msg");
  if (!textarea) return;

  try {
    if (badge) { badge.className = "config-editor-status"; badge.textContent = "Fetching..."; }
    let res = await fetch(`/api/config?_t=${Date.now()}`);
    let text = "";
    if (res.ok) {
      const data = await res.json();
      text = formatCompactJSON(data);
    } else {
      const fallbackRes = await fetch("./config.json");
      const data = await fallbackRes.json();
      text = formatCompactJSON(data);
    }
    textarea.value = text;
    lastSavedText = text;
    validateEditorContent();
    updateBeforeUnloadState();
  } catch (err) {
    if (badge) { badge.className = "config-editor-status error"; badge.textContent = "Load Error"; }
    if (msg) msg.textContent = `Error loading config: ${err.message}`;
  }
}

function validateEditorContent() {
  const textarea = document.getElementById("config-json-textarea");
  const badge = document.getElementById("config-status-badge");
  const msg = document.getElementById("config-editor-msg");
  if (!textarea || !badge) return null;

  try {
    const parsed = JSON.parse(textarea.value);
    badge.className = "config-editor-status valid";
    badge.textContent = "✓ Valid JSON";
    if (msg) msg.textContent = `Presets Count: ${Array.isArray(parsed) ? parsed.length : (parsed.presets?.length || 0)} groups loaded.`;
    return parsed;
  } catch (e) {
    badge.className = "config-editor-status error";
    badge.textContent = "⚠ JSON Syntax Error";
    if (msg) msg.textContent = e.message;
    return null;
  }
}

function bindEditorEvents(panel) {
  const textarea = panel.querySelector("#config-json-textarea");
  const btnFormat = panel.querySelector("#btn-config-format");
  const btnReload = panel.querySelector("#btn-config-reload");
  const btnCancel = panel.querySelector("#btn-config-cancel");
  const btnSave = panel.querySelector("#btn-config-save");
  const msg = panel.querySelector("#config-editor-msg");
  const badge = panel.querySelector("#config-status-badge");

  if (textarea) {
    textarea.addEventListener("input", () => {
      validateEditorContent();
      updateBeforeUnloadState();
    });
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + "  " + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        validateEditorContent();
        updateBeforeUnloadState();
      }
    });
  }

  if (btnFormat) {
    btnFormat.addEventListener("click", () => {
      const parsed = validateEditorContent();
      if (parsed && textarea) {
        textarea.value = formatCompactJSON(parsed);
        validateEditorContent();
      }
    });
  }

  if (btnReload) {
    btnReload.addEventListener("click", async () => {
      await loadCurrentConfigIntoEditor();
      if (msg) msg.textContent = "Configuration reloaded from server.";
    });
  }

  if (btnCancel) {
    btnCancel.addEventListener("click", () => {
      closeConfigTab();
    });
  }

  if (btnSave) {
    btnSave.addEventListener("click", async () => {
      const parsed = validateEditorContent();
      if (!parsed) {
        alert("Cannot save: Invalid JSON syntax. Please correct syntax errors first.");
        return;
      }
      try {
        btnSave.disabled = true;
        btnSave.textContent = "Saving...";
        await savePresetConfig(parsed);
        await loadPresetGroups();
        refreshPresetControls();
        refreshNavBarPresets();
        if (onConfigChangedCallback) await onConfigChangedCallback();

        if (badge) { badge.className = "config-editor-status valid"; badge.textContent = "✓ Saved & Applied"; }
        if (msg) msg.textContent = "Configuration successfully saved to server and applied to workstation!";
        if (textarea) lastSavedText = textarea.value;
        updateBeforeUnloadState();
      } catch (err) {
        if (badge) { badge.className = "config-editor-status error"; badge.textContent = "Save Failed"; }
        if (msg) msg.textContent = `Save error: ${err.message}`;
      } finally {
        btnSave.disabled = false;
        btnSave.textContent = "💾 Save";
      }
    });
  }
}
