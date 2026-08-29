// navBar.js - Top header bar and connection health indicator
import { appState } from "../store/appState.js";
import { fetchStatus } from "../api/catalogApi.js";
import { PRESET_GROUPS } from "../config/presets.js";

let onPresetSelectCallback = null;
let onLevelSelectCallback = null;
let onLoadDataCallback = null;
let onOpenConfigCallback = null;

export function initNavBar(containerId = "navbar", callbacks = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  onPresetSelectCallback = callbacks.onPresetSelect || callbacks.onPresetChange;
  onLevelSelectCallback = callbacks.onLevelSelect || callbacks.onLevelChange;
  onLoadDataCallback = callbacks.onLoadData || callbacks.onPresetChange;
  onOpenConfigCallback = callbacks.onOpenConfig || callbacks.onConfigClick || callbacks.onConfigReload;

  const currentLevel = appState.get("level") || 500;
  const levels = [1000, 925, 850, 700, 500, 400, 300, 200, 100];

  container.innerHTML = `
    <div class="nav-brand">
      <span>MICAPS-Web</span>
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

      <div class="nav-keyboard-hint" title="Use Left/Right arrow keys to step forecast periods, Up/Down to step pressure levels">
        <span class="kbd-pill">← / → Period</span>
        <span class="kbd-pill">↑ / ↓ Level</span>
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

  document.getElementById("select-preset").addEventListener("change", (e) => {
    const groupId = e.target.value;
    const group = PRESET_GROUPS.find((g) => g.id === groupId) || null;
    if (onPresetSelectCallback) {
      onPresetSelectCallback(group);
    }
  });

  document.getElementById("btn-load-data").addEventListener("click", () => {
    const select = document.getElementById("select-preset");
    const groupId = select ? select.value : "";
    const group = PRESET_GROUPS.find((g) => g.id === groupId) || PRESET_GROUPS[0];
    const navLevelVal = document.getElementById("select-nav-level")?.value;
    const overrideLevel = navLevelVal ? parseInt(navLevelVal, 10) : null;
    if (group && onLoadDataCallback) {
      if (select && !select.value) select.value = group.id;
      onLoadDataCallback(group, overrideLevel);
    }
  });

  document.getElementById("select-nav-level").addEventListener("change", (e) => {
    const val = e.target.value;
    const lvl = val ? parseInt(val, 10) : null;
    appState.set("level", lvl);
    if (onLevelSelectCallback) {
      onLevelSelectCallback(lvl);
    }
  });

  document.getElementById("btn-toggle-layers").addEventListener("click", (e) => {
    const panel = document.getElementById("layer-control");
    if (panel) {
      panel.classList.toggle("hidden");
      e.currentTarget.classList.toggle("active", !panel.classList.contains("hidden"));
    }
  });

  document.getElementById("btn-open-config").addEventListener("click", () => {
    if (onOpenConfigCallback) {
      onOpenConfigCallback();
    } else if (onConfigReloadCallback) {
      onConfigReloadCallback();
    }
  });

  // Poll connection status
  updateStatus();
  setInterval(updateStatus, 15000);
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
}

async function updateStatus() {
  const textEl = document.getElementById("nav-status-text");
  const dotEl = document.querySelector(".status-dot");
  if (!textEl || !dotEl) return;

  try {
    const status = await fetchStatus();
    if (status.status === "ok") {
      const mode = status.mock_mode ? "MOCK" : `CASSANDRA :${status.cassandra_port}`;
      textEl.textContent = mode;
      dotEl.className = status.mock_mode ? "status-dot warning" : "status-dot";
      appState.set("status", "connected");
      appState.set("isMock", status.mock_mode);
    }
  } catch (e) {
    textEl.textContent = "OFFLINE";
    dotEl.className = "status-dot warning";
    appState.set("status", "disconnected");
  }
}
