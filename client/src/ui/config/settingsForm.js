// settingsForm.js - Basemap and Performance workstation settings form
import {
  DEFAULT_MAX_EFFECTIVE_CELLS,
  MIN_MAX_EFFECTIVE_CELLS,
  MAX_MAX_EFFECTIVE_CELLS,
} from "../../config/presets.js";

/**
 * Mounts the Settings sub-tab form into container.
 * @param {HTMLElement} container
 * @param {Object} formState
 * @returns {Function} unmount function
 */
export function mountSettingsForm(container, formState) {
  if (!container || !formState) return () => {};

  function renderHTML(draft) {
    const basemap = draft.basemap || {};
    const perf = draft.performance || {};
    const cells = Number.isFinite(perf.maxEffectiveCells) ? perf.maxEffectiveCells : DEFAULT_MAX_EFFECTIVE_CELLS;
    const scheme = basemap.scheme || "dark";
    const proj = basemap.projection || "mercator";

    return `
      <div class="config-settings-container">
        <!-- Basemap Settings Card -->
        <div class="config-card">
          <div class="config-card-header">
            <h3>🗺️ Basemap & Projection</h3>
            <p class="config-card-desc">Default background tile theme, layer visibility, and coordinate projection.</p>
          </div>
          <div class="config-card-body">
            <div class="config-field-group">
              <label class="config-label">Theme Scheme</label>
              <div class="config-radio-cards" id="settings-basemap-schemes">
                <label class="radio-card ${scheme === "dark" ? "selected" : ""}">
                  <input type="radio" name="basemap-scheme" value="dark" ${scheme === "dark" ? "checked" : ""} />
                  <span class="radio-card-icon">🌙</span>
                  <span class="radio-card-title">Midnight Slate</span>
                  <span class="radio-card-sub">Dark</span>
                </label>
                <label class="radio-card ${scheme === "light" ? "selected" : ""}">
                  <input type="radio" name="basemap-scheme" value="light" ${scheme === "light" ? "checked" : ""} />
                  <span class="radio-card-icon">☀️</span>
                  <span class="radio-card-title">Daybreak Neutral</span>
                  <span class="radio-card-sub">Light</span>
                </label>
                <label class="radio-card ${scheme === "micaps" ? "selected" : ""}">
                  <input type="radio" name="basemap-scheme" value="micaps" ${scheme === "micaps" ? "checked" : ""} />
                  <span class="radio-card-icon">🌐</span>
                  <span class="radio-card-title">MICAPS Classic</span>
                  <span class="radio-card-sub">Navy</span>
                </label>
              </div>
            </div>

            <div class="config-field-group" style="margin-top: 16px;">
              <label for="settings-basemap-proj" class="config-label">Map Projection</label>
              <select id="settings-basemap-proj" class="config-select">
                <option value="mercator" ${proj === "mercator" ? "selected" : ""}>🗺️ Mercator (Standard 2D)</option>
                <option value="globe" ${proj === "globe" ? "selected" : ""}>🌍 Globe (Spherical 3D)</option>
                <option value="vertical-perspective" ${proj === "vertical-perspective" ? "selected" : ""}>🪐 Vertical Perspective (3D)</option>
              </select>
            </div>

            <div class="config-field-group" style="margin-top: 16px;">
              <label class="config-label">Vector Overlays</label>
              <div class="config-checkbox-grid">
                <label class="config-checkbox-label">
                  <input type="checkbox" id="chk-cfg-graticule" ${basemap.showGraticule !== false ? "checked" : ""} />
                  <span>10° Lon/Lat Graticule Lines</span>
                </label>
                <label class="config-checkbox-label">
                  <input type="checkbox" id="chk-cfg-world" ${basemap.showWorld !== false ? "checked" : ""} />
                  <span>World Country Boundaries</span>
                </label>
                <label class="config-checkbox-label">
                  <input type="checkbox" id="chk-cfg-provinces" ${basemap.showProvinces !== false ? "checked" : ""} />
                  <span>Province Boundaries</span>
                </label>
                <label class="config-checkbox-label">
                  <input type="checkbox" id="chk-cfg-cities" ${basemap.showCities !== false ? "checked" : ""} />
                  <span>City / County Boundaries</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Performance Budget Card -->
        <div class="config-card" style="margin-top: 16px;">
          <div class="config-card-header">
            <h3>⚡ Performance & Contour Budget</h3>
            <p class="config-card-desc">Controls memory budget and Marching Squares grid cell sampling limits.</p>
          </div>
          <div class="config-card-body">
            <div class="config-field-group">
              <label for="input-perf-cells" class="config-label">
                Max Effective Cells (Marching Squares budget)
              </label>
              <div style="display: flex; align-items: center; gap: 12px; margin-top: 6px;">
                <input
                  type="range"
                  id="slider-perf-cells"
                  min="${MIN_MAX_EFFECTIVE_CELLS}"
                  max="${MAX_MAX_EFFECTIVE_CELLS}"
                  step="1000"
                  value="${cells}"
                  style="flex: 1;"
                />
                <input
                  type="number"
                  id="input-perf-cells"
                  class="config-input"
                  min="${MIN_MAX_EFFECTIVE_CELLS}"
                  max="${MAX_MAX_EFFECTIVE_CELLS}"
                  step="1000"
                  value="${cells}"
                  style="width: 110px; text-align: right;"
                />
                <span style="font-size: 11px; color: var(--text-secondary, #8b949e);">cells</span>
              </div>
              <p class="config-hint" style="margin-top: 6px;">
                Allowed bounds: ${MIN_MAX_EFFECTIVE_CELLS.toLocaleString()} – ${MAX_MAX_EFFECTIVE_CELLS.toLocaleString()} cells.
                Default: ${DEFAULT_MAX_EFFECTIVE_CELLS.toLocaleString()}. Higher values increase contour resolution on fine grids at the cost of CPU/memory.
              </p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = renderHTML(formState.getDraft());

  function bindEvents() {
    // Scheme radios
    const radioContainer = container.querySelector("#settings-basemap-schemes");
    if (radioContainer) {
      radioContainer.addEventListener("change", (e) => {
        if (e.target.name === "basemap-scheme") {
          const val = e.target.value;
          formState.updateDraft((draft) => {
            if (!draft.basemap) draft.basemap = {};
            draft.basemap.scheme = val;
          });
          radioContainer.querySelectorAll(".radio-card").forEach((card) => {
            const input = card.querySelector("input");
            card.classList.toggle("selected", input && input.checked);
          });
        }
      });
    }

    // Projection select
    const projSelect = container.querySelector("#settings-basemap-proj");
    if (projSelect) {
      projSelect.addEventListener("change", (e) => {
        const val = e.target.value;
        formState.updateDraft((draft) => {
          if (!draft.basemap) draft.basemap = {};
          draft.basemap.projection = val;
        });
      });
    }

    // Basemap vector toggles
    const chkGraticule = container.querySelector("#chk-cfg-graticule");
    const chkWorld = container.querySelector("#chk-cfg-world");
    const chkProvinces = container.querySelector("#chk-cfg-provinces");
    const chkCities = container.querySelector("#chk-cfg-cities");

    [
      { el: chkGraticule, key: "showGraticule" },
      { el: chkWorld, key: "showWorld" },
      { el: chkProvinces, key: "showProvinces" },
      { el: chkCities, key: "showCities" },
    ].forEach(({ el, key }) => {
      if (el) {
        el.addEventListener("change", (e) => {
          const checked = e.target.checked;
          formState.updateDraft((draft) => {
            if (!draft.basemap) draft.basemap = {};
            draft.basemap[key] = checked;
          });
        });
      }
    });

    // Performance inputs (slider + number sync)
    const slider = container.querySelector("#slider-perf-cells");
    const numInput = container.querySelector("#input-perf-cells");

    function updatePerf(val) {
      const parsed = parseInt(val, 10);
      if (Number.isFinite(parsed)) {
        formState.updateDraft((draft) => {
          if (!draft.performance) draft.performance = {};
          draft.performance.maxEffectiveCells = parsed;
        });
      }
    }

    if (slider && numInput) {
      slider.addEventListener("input", (e) => {
        numInput.value = e.target.value;
        updatePerf(e.target.value);
      });
      numInput.addEventListener("input", (e) => {
        slider.value = e.target.value;
        updatePerf(e.target.value);
      });
    }
  }

  bindEvents();

  return () => {
    container.innerHTML = "";
  };
}
