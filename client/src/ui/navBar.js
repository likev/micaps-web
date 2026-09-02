// navBar.js - Top header bar and connection health indicator
import { appState } from "../store/appState.js";
import { fetchStatus } from "../api/catalogApi.js";
import { PRESET_GROUPS } from "../config/presets.js";

let onPresetSelectCallback = null;
let onLevelSelectCallback = null;
let onLoadDataCallback = null;
let onOpenConfigCallback = null;

let statusInterval = null;
let statusAbortController = null;

export function initNavBar(containerId = "navbar", callbacks = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Legacy alias: onPresetChange previously served preset/load roles; kept for backwards compat.
  // For onPresetSelect / onLevelSelect we preserve the alias, but onLoadData intentionally
  // does NOT fallback to onPresetChange to avoid ambiguous dual-role invocation.
  onPresetSelectCallback = callbacks.onPresetSelect || callbacks.onPresetChange || null;
  onLevelSelectCallback = callbacks.onLevelSelect || callbacks.onLevelChange || null;
  onLoadDataCallback = callbacks.onLoadData || null;
  // Legacy aliases for config open (onConfigClick / onConfigReload)
  onOpenConfigCallback = callbacks.onOpenConfig || callbacks.onConfigClick || callbacks.onConfigReload || null;

  const currentLevel = appState.get("level") || 500;
  const levels = [1000, 925, 850, 700, 500, 400, 300, 200, 100];

  container.innerHTML = `
    <div class="nav-brand">
      <a href="https://github.com/likev/micaps-web" target="_blank" rel="noopener noreferrer" class="brand-link" title="MICAPS-Web on GitHub">MICAPS-Web</a>
      <span class="brand-badge">PRO</span>
    </div>

    <div class="nav-middle">
      <div class="nav-control-group">
        <label for="select-preset">Group:</label>
        <select id="select-preset" class="nav-select">
          <option value="">-- Presets / 组合图 --</option>
          ${PRESET_GROUPS.map((g) => `<option value="${g.id}">${g.name}</option>`).join("")}
        </select>
        <button id="btn-load-data" class="btn btn-primary nav-load-btn" title="Load selected preset group data">
          <span>Load Data</span>
        </button>
      </div>

      <div class="nav-control-group">
        <label for="select-nav-level">Level:</label>
        <select id="select-nav-level" class="nav-select">
          <option value="" ${!currentLevel ? "selected" : ""}>None</option>
          ${levels.map((l) => `<option value="${l}" ${l === currentLevel ? "selected" : ""}>${l} hPa</option>`).join("")}
        </select>
      </div>
    </div>

    <div class="nav-controls">
      <div id="nav-status-indicator" class="nav-status">
        <span class="status-dot"></span>
        <span id="nav-status-text">Connecting...</span>
      </div>
      <button id="btn-toggle-layers" class="btn btn-primary">
        <span>Layers</span>
      </button>
      <button id="btn-open-config" class="btn" title="Open Configuration Editor Tab">
        <span>⚙ Config</span>
      </button>
    </div>
  `;

  const selectPreset = document.getElementById("select-preset");
  const btnLoadData = document.getElementById("btn-load-data");
  const btnToggleLayers = document.getElementById("btn-toggle-layers");

  function updateLoadBtnState() {
    if (btnLoadData && selectPreset) {
      btnLoadData.disabled = !selectPreset.value;
    }
  }
  updateLoadBtnState();

  // Initial sync: set Layers button active state based on panel visibility
  const layerPanel = document.getElementById("layer-control");
  if (btnToggleLayers && layerPanel) {
    btnToggleLayers.classList.toggle("active", !layerPanel.classList.contains("hidden"));
  }

  selectPreset.addEventListener("change", (e) => {
    const groupId = e.target.value;
    const group = PRESET_GROUPS.find((g) => g.id === groupId) || null;
    const levelSelect = document.getElementById("select-nav-level");

    // Conditional level handling: preserve defaultLevel if group declares it
    if (group && (group.defaultLevel != null || group.hasLevel)) {
      const nextLevel = group.defaultLevel != null ? group.defaultLevel : appState.get("level");
      if (nextLevel != null) {
        appState.set("level", nextLevel);
        if (levelSelect) levelSelect.value = String(nextLevel);
      }
      // if group.hasLevel but no defaultLevel and no current level, keep current state (no clear)
    } else {
      if (levelSelect) levelSelect.value = "";
      appState.set("level", null);
    }

    updateLoadBtnState();

    if (onPresetSelectCallback) {
      onPresetSelectCallback(group);
    }
  });

  btnLoadData.addEventListener("click", () => {
    const select = document.getElementById("select-preset");
    const groupId = select ? select.value : "";
    if (!groupId) return;
    const group = PRESET_GROUPS.find((g) => g.id === groupId) || null;
    if (!group) return;
    const navLevelVal = document.getElementById("select-nav-level")?.value;
    const overrideLevel = navLevelVal ? parseInt(navLevelVal, 10) : null;
    const safeOverride = Number.isNaN(overrideLevel) ? null : overrideLevel;
    if (onLoadDataCallback) {
      onLoadDataCallback(group, safeOverride);
    }
  });

  document.getElementById("select-nav-level").addEventListener("change", (e) => {
    const val = e.target.value;
    const lvl = val ? parseInt(val, 10) : null;
    const safeLvl = Number.isNaN(lvl) ? null : lvl;
    appState.set("level", safeLvl);
    if (onLevelSelectCallback) {
      onLevelSelectCallback(safeLvl);
    }
  });

  btnToggleLayers.addEventListener("click", (e) => {
    const panel = document.getElementById("layer-control");
    if (panel) {
      panel.classList.toggle("hidden");
      e.currentTarget.classList.toggle("active", !panel.classList.contains("hidden"));
    }
  });

  document.getElementById("btn-open-config").addEventListener("click", () => {
    if (onOpenConfigCallback) {
      onOpenConfigCallback();
    }
  });

  // Poll connection status with AbortController and cleanup
  if (statusInterval) clearInterval(statusInterval);
  if (statusAbortController) statusAbortController.abort();
  statusAbortController = new AbortController();

  updateStatus(statusAbortController.signal);
  statusInterval = setInterval(() => {
    // recreate signal if previous aborted
    if (statusAbortController.signal.aborted) {
      statusAbortController = new AbortController();
    }
    updateStatus(statusAbortController.signal);
  }, 15000);
}

export function cleanupNavBar() {
  if (statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
  }
  if (statusAbortController) {
    statusAbortController.abort();
    statusAbortController = null;
  }
}

export function setNavBarLevel(level) {
  const select = document.getElementById("select-nav-level");
  if (!select) return;
  const strVal = level !== null && level !== undefined && level !== "" ? String(level) : "";
  if (select.value !== strVal) {
    select.value = strVal;
  }
}

export function setNavBarPreset(groupId) {
  const select = document.getElementById("select-preset");
  if (select) {
    select.value = groupId || "";
    const btn = document.getElementById("btn-load-data");
    if (btn) btn.disabled = !select.value;
  }
}

export function refreshNavBarPresets() {
  const select = document.getElementById("select-preset");
  if (!select) return;

  const currentGroupId = select.value || appState.get("activeGroup")?.id || "";
  select.innerHTML = `
    <option value="">-- Presets / 组合图 --</option>
    ${PRESET_GROUPS.map((g) => `<option value="${g.id}">${g.name}</option>`).join("")}
  `;
  select.value = PRESET_GROUPS.some((g) => g.id === currentGroupId) ? currentGroupId : "";
  const btn = document.getElementById("btn-load-data");
  if (btn) btn.disabled = !select.value;
}

async function updateStatus(signal) {
  const textEl = document.getElementById("nav-status-text");
  const dotEl = document.querySelector(".status-dot");
  if (!textEl || !dotEl) return;

  try {
    // fetchStatus currently does not accept signal, but we guard abort before applying result
    const status = await fetchStatus();
    if (signal && signal.aborted) return;
    if (status.status === "ok") {
      const mode = status.mock_mode ? "MOCK" : `CASSANDRA :${status.cassandra_port}`;
      textEl.textContent = mode;
      dotEl.className = status.mock_mode ? "status-dot warning" : "status-dot";
      appState.set("status", "connected");
      appState.set("isMock", status.mock_mode);
    }
  } catch (e) {
    if (signal && signal.aborted) return;
    textEl.textContent = "OFFLINE";
    dotEl.className = "status-dot warning";
    appState.set("status", "disconnected");
  }
}
