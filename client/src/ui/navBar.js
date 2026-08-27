// navBar.js - Top header bar and connection health indicator
import { appState } from "../store/appState.js";
import { fetchStatus } from "../api/catalogApi.js";

export function initNavBar(containerId = "navbar") {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="nav-brand">
      <span>MICAPS-Web</span>
      <span class="brand-badge">PRO</span>
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
