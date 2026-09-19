// configEditor.js - Interactive Preset & Colormap Configuration Editor Shell
import { loadPresetGroups, savePresetConfig } from "../config/presets.js";
import { refreshPresetControls, getActiveWindow, focusWindow, getActiveTab } from "./tabWindowManager.js";
import { refreshNavBarPresets } from "./navBar.js";
import { createFormState } from "./config/formState.js";
import { mountPresetForm } from "./config/presetForm.js";
import { mountColormapForm } from "./config/colormapForm.js";
import { mountSettingsForm } from "./config/settingsForm.js";
import { mountJSONFallback } from "./config/jsonFallback.js";
import { setTimeSliderVisible } from "./timeSlider.js";
import { tlogpController } from "../layers/tlogp/tlogpLayer.js";
import { timeHeightController } from "../layers/timeheight/timeHeightLayer.js";
import { lineHeightController, hovmollerController } from "../layers/lineprofile/lineProfileLayer.js";

let isConfigTabOpen = false;
let onConfigChangedCallback = null;
let prevActiveTabId = null;
let prevActiveWinIdx = null;
let prevActiveWinId = null;
let beforeUnloadHandler = null;
let wasLayerControlOpen = false;
let formState = null;
let activeSubTabUnmount = null;

function hasUnsavedChanges() {
  return formState ? formState.isDirty() : false;
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

  const activeWin = getActiveWindow?.();
  if (activeWin) {
    prevActiveTabId = activeWin.tabId;
    prevActiveWinIdx = activeWin.winIdx;
    prevActiveWinId = activeWin.id || null;
  }

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
    const wasHidden = tabsList.classList.contains("hidden");
    if (wasHidden) tabsList.classList.remove("hidden");
    if (addBtn && addBtn.parentNode === tabsList) {
      tabsList.insertBefore(tabPill, addBtn);
    } else {
      tabsList.appendChild(tabPill);
    }

    tabPill.addEventListener("click", (e) => {
      if (e.target.classList.contains("tab-close-btn")) {
        e.stopPropagation();
        closeConfigTab();
      } else {
        activateConfigTab();
      }
    });
  } else {
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
          <span class="config-editor-title">⚙ Meteorological Configuration</span>
          <div class="config-subtab-bar" role="tablist">
            <button class="config-subtab-btn active" data-tab="presets" role="tab" aria-selected="true">Presets</button>
            <button class="config-subtab-btn" data-tab="colormaps" role="tab" aria-selected="false">Colormaps</button>
            <button class="config-subtab-btn" data-tab="settings" role="tab" aria-selected="false">Settings</button>
            <button class="config-subtab-btn" data-tab="json" role="tab" aria-selected="false">⟨⟩ JSON</button>
          </div>
          <span class="config-editor-status" id="config-status-badge">Loading...</span>
        </div>
        <div class="config-editor-actions">
          <button id="btn-config-format" class="btn hidden" title="Auto-format and indent JSON">⚡ Format</button>
          <button id="btn-config-reload" class="btn" title="Reload original preset configuration from server">🔄 Reload</button>
          <button id="btn-config-cancel" class="btn" title="Cancel changes and close Config Tab">✕ Cancel</button>
          <button id="btn-config-save" class="btn btn-primary" title="Save configuration to server and apply immediately">💾 Save</button>
        </div>
      </div>
      <div class="config-editor-body">
        <div class="config-subtab-content" id="config-subtab-content"></div>
        <div class="config-editor-msg" id="config-editor-msg"></div>
      </div>
    `;
    wsContainer.appendChild(panel);
    bindToolbarEvents(panel);
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
  document.querySelectorAll(".window-panel").forEach((wp) => wp.classList.remove("active", "active-single"));
  const panel = document.getElementById("config-editor-panel");
  if (panel) panel.style.display = "flex";

  const layerPanel = document.getElementById("layer-control");
  if (layerPanel) {
    wasLayerControlOpen = !layerPanel.classList.contains("hidden");
    layerPanel.classList.add("hidden");
  }
  const btnLayers = document.getElementById("btn-toggle-layers");
  if (btnLayers) {
    btnLayers.classList.remove("active");
    btnLayers.setAttribute("aria-pressed", "false");
  }
  const legendPanel = document.getElementById("legend-panel");
  if (legendPanel) legendPanel.classList.add("hidden");

  // Hide timeslider and subwindows when config tab is active
  try { setTimeSliderVisible(false); } catch {}
  try { tlogpController.hide(); } catch {}
  try { timeHeightController.hide(); } catch {}
  try { lineHeightController.hide(); } catch {}
  try { hovmollerController.hide(); } catch {}
  try {
    const tlogpPanel = document.getElementById("tlogp-panel");
    if (tlogpPanel) tlogpPanel.style.display = "none";
  } catch {}
  try {
    document.querySelectorAll(".timeheight-subwindow").forEach((el) => {
      el.style.display = "none";
    });
    document.querySelectorAll(".lineheight-subwindow, .hovmoller-subwindow").forEach((el) => {
      el.style.display = "none";
    });
  } catch {}
}

export function deactivateConfigTab() {
  isConfigTabOpen = false;
  const cfgPill = document.getElementById("tab-item-config");
  if (cfgPill) {
    cfgPill.classList.remove("active");
    cfgPill.setAttribute("aria-selected", "false");
  }
  const panel = document.getElementById("config-editor-panel");
  if (panel) {
    panel.style.display = "none";
  }
}

export function closeConfigTab() {
  if (hasUnsavedChanges()) {
    const ok = window.confirm("You have unsaved changes. Close without saving?");
    if (!ok) return;
  }
  clearBeforeUnload();
  if (activeSubTabUnmount) {
    activeSubTabUnmount();
    activeSubTabUnmount = null;
  }
  isConfigTabOpen = false;
  document.getElementById("tab-item-config")?.remove();
  const panel = document.getElementById("config-editor-panel");
  if (panel) panel.remove();

  let restored = false;
  if (prevActiveWinId) {
    try {
      const at = getActiveTab?.();
      const pos = at?.windows?.findIndex((w) => w.id === prevActiveWinId);
      if (at && pos != null && pos >= 0) {
        focusWindow(at.id, pos);
        restored = true;
      } else if (prevActiveTabId !== null && prevActiveWinIdx !== null) {
        focusWindow(prevActiveTabId, prevActiveWinIdx);
        restored = true;
      }
    } catch {
      try { focusWindow(prevActiveTabId, prevActiveWinIdx); restored = true; } catch {}
    }
  } else if (prevActiveTabId !== null && prevActiveWinIdx !== null) {
    try { focusWindow(prevActiveTabId, prevActiveWinIdx); restored = true; } catch {}
  }
  const activeTab = getActiveTab();
  if (activeTab) {
    const ws = document.getElementById(`tab-workspace-${activeTab.id}`);
    if (ws) ws.classList.add("active");
  }
  if (!restored) {
    const wsList = document.querySelectorAll(".tab-workspace");
    if (wsList.length > 0) wsList[0].classList.add("active");
    const tabPills = document.querySelectorAll(".tab-item:not(.tab-item-config)");
    if (tabPills.length > 0) {
      tabPills[0].classList.add("active");
      tabPills[0].setAttribute("aria-selected", "true");
    }
  }

  const tabsList = document.getElementById("tabs-list");
  if (tabsList) {
    // Tabs stay visible in every layout so split slots remain reachable.
    tabsList.classList.remove("hidden");
  }

  if (wasLayerControlOpen) {
    const layerPanel = document.getElementById("layer-control");
    if (layerPanel) layerPanel.classList.remove("hidden");
    const btnLayers = document.getElementById("btn-toggle-layers");
    if (btnLayers) {
      btnLayers.classList.add("active");
      btnLayers.setAttribute("aria-pressed", "true");
    }
  }

  const legendPanel = document.getElementById("legend-panel");
  if (legendPanel) legendPanel.classList.remove("hidden");
}

async function loadCurrentConfigIntoEditor() {
  const badge = document.getElementById("config-status-badge");
  const msg = document.getElementById("config-editor-msg");

  try {
    if (badge) { badge.className = "config-editor-status"; badge.textContent = "Fetching..."; }
    let res = await fetch(`/api/config?_t=${Date.now()}`);
    let data;
    if (res.ok) {
      data = await res.json();
    } else {
      const fallbackRes = await fetch("./config.json");
      data = await fallbackRes.json();
    }

    formState = createFormState(data);
    formState.subscribe(updateUIFromState);

    updateUIFromState();
    mountActiveSubTab();
  } catch (err) {
    if (badge) { badge.className = "config-editor-status error"; badge.textContent = "Load Error"; }
    if (msg) msg.textContent = `Error loading config: ${err.message}`;
  }
}

function updateUIFromState() {
  if (!formState) return;
  const badge = document.getElementById("config-status-badge");
  const msg = document.getElementById("config-editor-msg");
  const btnSave = document.getElementById("btn-config-save");
  const val = formState.getValidation();
  const dirty = formState.isDirty();

  updateBeforeUnloadState();

  if (!val.isValid) {
    if (badge) {
      badge.className = "config-editor-status error";
      badge.textContent = `⚠ ${val.errors.length} validation error${val.errors.length > 1 ? "s" : ""}`;
    }
    if (btnSave) btnSave.disabled = true;
    if (msg) {
      const first = val.errors[0];
      msg.textContent = `[${first.path}] ${first.message}`;
    }
  } else if (dirty) {
    if (badge) {
      badge.className = "config-editor-status dirty";
      badge.textContent = "● Unsaved changes";
    }
    if (btnSave) btnSave.disabled = false;
    if (msg) {
      const d = formState.getDraft();
      const pCount = d.presets?.length || 0;
      const cCount = Object.keys(d.colormaps || {}).length;
      msg.textContent = `Presets: ${pCount} · Colormaps: ${cCount} (Ready to save)`;
    }
  } else {
    if (badge) {
      badge.className = "config-editor-status valid";
      badge.textContent = "✓ Valid Configuration";
    }
    if (btnSave) btnSave.disabled = false;
    if (msg) {
      const d = formState.getDraft();
      const pCount = d.presets?.length || 0;
      const cCount = Object.keys(d.colormaps || {}).length;
      msg.textContent = `Presets: ${pCount} · Colormaps: ${cCount} · Configuration in sync.`;
    }
  }
}

function mountActiveSubTab() {
  if (!formState) return;
  if (activeSubTabUnmount) {
    activeSubTabUnmount();
    activeSubTabUnmount = null;
  }

  const content = document.getElementById("config-subtab-content");
  if (!content) return;

  const currentTab = formState.getActiveSubTab();
  const formatBtn = document.getElementById("btn-config-format");
  if (formatBtn) {
    formatBtn.classList.toggle("hidden", currentTab !== "json");
  }

  if (currentTab === "presets") {
    activeSubTabUnmount = mountPresetForm(content, formState);
  } else if (currentTab === "colormaps") {
    activeSubTabUnmount = mountColormapForm(content, formState);
  } else if (currentTab === "settings") {
    activeSubTabUnmount = mountSettingsForm(content, formState);
  } else if (currentTab === "json") {
    activeSubTabUnmount = mountJSONFallback(content, formState);
  }
}

function bindToolbarEvents(panel) {
  const subtabBtns = panel.querySelectorAll(".config-subtab-btn");
  subtabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (!tab || !formState) return;
      subtabBtns.forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      formState.setActiveSubTab(tab);
      mountActiveSubTab();
    });
  });

  const btnReload = panel.querySelector("#btn-config-reload");
  btnReload?.addEventListener("click", async () => {
    if (hasUnsavedChanges()) {
      const ok = window.confirm("You have unsaved changes. Reload original preset config?");
      if (!ok) return;
    }
    await loadCurrentConfigIntoEditor();
  });

  const btnCancel = panel.querySelector("#btn-config-cancel");
  btnCancel?.addEventListener("click", () => {
    closeConfigTab();
  });

  const btnSave = panel.querySelector("#btn-config-save");
  btnSave?.addEventListener("click", async () => {
    if (!formState) return;
    const val = formState.getValidation();
    if (!val.isValid) {
      alert(`Cannot save: ${val.errors[0]?.message}`);
      return;
    }

    try {
      btnSave.disabled = true;
      btnSave.textContent = "Saving...";
      const draft = formState.getDraft();
      await savePresetConfig(draft);
      if (onConfigChangedCallback) {
        await onConfigChangedCallback();
      } else {
        await loadPresetGroups();
        refreshPresetControls();
        refreshNavBarPresets();
      }

      formState.markSaved();
      const badge = document.getElementById("config-status-badge");
      const msg = document.getElementById("config-editor-msg");
      if (badge) {
        badge.className = "config-editor-status valid";
        badge.textContent = "✓ Saved & Applied";
      }
      if (msg) msg.textContent = "Configuration successfully saved and live-applied!";
    } catch (err) {
      const badge = document.getElementById("config-status-badge");
      const msg = document.getElementById("config-editor-msg");
      if (badge) { badge.className = "config-editor-status error"; badge.textContent = "Save Failed"; }
      if (msg) msg.textContent = `Save error: ${err.message}`;
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = "💾 Save";
    }
  });
}
