// navBar.js - Top header bar and connection health indicator
import { appState } from "../store/appState.js";
import { fetchStatus } from "../api/catalogApi.js";
import { PRESET_GROUPS } from "../config/presets.js";

let onPresetChangeCallback = null;
let onLevelChangeCallback = null;

export function initNavBar(containerId = "navbar", callbacks = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  onPresetChangeCallback = callbacks.onPresetChange;
  onLevelChangeCallback = callbacks.onLevelChange;

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
      </div>

      <div class="nav-control-group">
        <label for="select-level">Level:</label>
        <select id="select-level" class="nav-select">
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
      <button id="btn-toggle-catalog" class="btn btn-primary">
        <span>Catalog</span>
      </button>
      <button id="btn-toggle-layers" class="btn">
        <span>Layers</span>
      </button>
    </div>
  `;

  document.getElementById("select-preset").addEventListener("change", (e) => {
    const groupId = e.target.value;
    const group = PRESET_GROUPS.find((g) => g.id === groupId);
    if (group && onPresetChangeCallback) {
      onPresetChangeCallback(group);
    }
  });

  document.getElementById("select-level").addEventListener("change", (e) => {
    const lvl = parseInt(e.target.value, 10);
    if (!isNaN(lvl)) {
      appState.set("level", lvl);
      if (onLevelChangeCallback) {
        onLevelChangeCallback(lvl);
      }
    }
  });

  document.getElementById("btn-toggle-catalog").addEventListener("click", () => {
    const drawer = document.getElementById("catalog-drawer");
    if (drawer) drawer.classList.toggle("hidden");
  });

  document.getElementById("btn-toggle-layers").addEventListener("click", () => {
    const panel = document.getElementById("layer-control");
    if (panel) panel.classList.toggle("hidden");
  });

  // Poll connection status
  updateStatus();
  setInterval(updateStatus, 15000);
}

export function setNavBarLevel(level) {
  const select = document.getElementById("select-level");
  if (select && select.value !== String(level)) {
    select.value = String(level);
  }
}

export function setNavBarPreset(groupId) {
  const select = document.getElementById("select-preset");
  if (select) {
    select.value = groupId || "";
  }
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
