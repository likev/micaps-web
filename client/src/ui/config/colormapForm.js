// colormapForm.js - Visual Colormap editor with gradient bar, stop table, and swatch integration
import { BUILTIN_COLORMAP_PRESETS, findPreset } from "./colorPresets.js";
import { escapeHtml } from "./formState.js";
import { stopsToCSSGradient, mountColormapStops } from "./colormapStops.js";

export { stopsToCSSGradient };

/**
 * Counts how many preset layers reference each colormap name.
 */
export function getColormapUsageCounts(draft) {
  const counts = {};
  if (!draft || !Array.isArray(draft.presets)) return counts;
  for (const p of draft.presets) {
    if (p.divider || !Array.isArray(p.layers)) continue;
    for (const l of p.layers) {
      if (l.render?.colormap) {
        counts[l.render.colormap] = (counts[l.render.colormap] || 0) + 1;
      }
      if (l.render?.colormapByLevel && typeof l.render.colormapByLevel === "object") {
        for (const cmap of Object.values(l.render.colormapByLevel)) {
          if (cmap) counts[cmap] = (counts[cmap] || 0) + 1;
        }
      }
    }
  }
  return counts;
}

/**
 * Rewrites all references to a colormap across preset layers.
 */
export function rewriteColormapReferences(draft, oldName, newName) {
  if (!draft || !Array.isArray(draft.presets) || !oldName || !newName) return;
  for (const p of draft.presets) {
    if (p.divider || !Array.isArray(p.layers)) continue;
    for (const l of p.layers) {
      if (l.render?.colormap === oldName) {
        l.render.colormap = newName;
      }
      if (l.render?.colormapByLevel && typeof l.render.colormapByLevel === "object") {
        for (const [lvl, cmap] of Object.entries(l.render.colormapByLevel)) {
          if (cmap === oldName) {
            l.render.colormapByLevel[lvl] = newName;
          }
        }
      }
    }
  }
}

/**
 * Mounts the Colormaps sub-tab into container.
 */
export function mountColormapForm(container, formState) {
  if (!container || !formState) return () => {};

  let searchQuery = "";
  let activeColormap = formState.getSelectedColormapName();
  let stopsMountController = null;
  let replaceModalData = null; // { colormapName, count, targetCmap }

  function getAvailableNames() {
    const draft = formState.getDraft();
    return Object.keys(draft.colormaps || {});
  }

  function renderSidebarList() {
    const listEl = container.querySelector("#colormap-sidebar-list");
    if (!listEl) return;
    const draft = formState.getDraft();
    const colormapNames = Object.keys(draft.colormaps || {});
    const usages = getColormapUsageCounts(draft);
    const validation = formState.getValidation();

    const filtered = colormapNames.filter((name) =>
      name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="config-empty-state" style="padding: 16px; font-size: 11px; color: var(--text-secondary, #8b949e);">No colormaps found</div>`;
      return;
    }

    listEl.innerHTML = filtered
      .map((name) => {
        const stops = draft.colormaps[name] || [];
        const grad = stopsToCSSGradient(stops);
        const isSelected = name === activeColormap;
        const count = usages[name] || 0;
        const hasError = validation.colormapErrors?.has(name);

        return `
          <div class="config-sidebar-item ${isSelected ? "selected" : ""} ${hasError ? "has-error" : ""}" data-name="${escapeHtml(name)}">
            <div class="sidebar-item-top">
              <span class="sidebar-item-name">${escapeHtml(name)}</span>
              <div class="sidebar-item-badges">
                ${hasError ? `<span class="badge-error" title="Validation errors">⚠</span>` : ""}
                <span class="sidebar-item-chip">${stops.length} stops</span>
                ${count > 0 ? `<span class="sidebar-item-chip usage">${count} used</span>` : ""}
              </div>
            </div>
            <div class="sidebar-item-swatch" style="background: ${grad};" title="${stops.length} stops"></div>
            <div class="sidebar-item-actions">
              <button type="button" class="btn-sidebar-action btn-dup-cmap" data-name="${escapeHtml(name)}" title="Duplicate colormap">⧉</button>
              <button type="button" class="btn-sidebar-action btn-del-cmap" data-name="${escapeHtml(name)}" title="Delete colormap">✕</button>
            </div>
          </div>
        `;
      })
      .join("");

    bindSidebarItemEvents();
  }

  function bindSidebarItemEvents() {
    container.querySelectorAll(".config-sidebar-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (e.target.closest(".btn-sidebar-action")) return;
        const name = item.dataset.name;
        if (name && name !== activeColormap) {
          activeColormap = name;
          formState.setSelectedColormapName(name);
          render();
        }
      });
    });

    container.querySelectorAll(".btn-dup-cmap").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const srcName = btn.dataset.name;
        formState.updateDraft((d) => {
          if (!d.colormaps?.[srcName]) return;
          let newName = `${srcName}_COPY`;
          let counter = 2;
          while (d.colormaps[newName]) {
            newName = `${srcName}_COPY_${counter++}`;
          }
          d.colormaps[newName] = JSON.parse(JSON.stringify(d.colormaps[srcName]));
          activeColormap = newName;
          formState.setSelectedColormapName(newName);
        });
        render();
      });
    });

    container.querySelectorAll(".btn-del-cmap").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const name = btn.dataset.name;
        handleDeleteColormap(name);
      });
    });
  }

  function handleDeleteColormap(name) {
    const draft = formState.getDraft();
    const usages = getColormapUsageCounts(draft);
    const count = usages[name] || 0;

    if (count > 0) {
      // Show replace dialog per plan §3.3
      replaceModalData = {
        colormapName: name,
        count,
        targetCmap: getAvailableNames().find((n) => n !== name) || "",
      };
      render();
      return;
    }

    formState.updateDraft((d) => {
      if (d.colormaps) delete d.colormaps[name];
    });
    activeColormap = getAvailableNames()[0] || null;
    formState.setSelectedColormapName(activeColormap);
    render();
  }

  function render() {
    if (stopsMountController) {
      stopsMountController.unmount();
      stopsMountController = null;
    }

    const draft = formState.getDraft();
    if (!draft.colormaps) draft.colormaps = {};
    const colormapNames = Object.keys(draft.colormaps);
    const usages = getColormapUsageCounts(draft);
    const count = activeColormap ? usages[activeColormap] || 0 : 0;

    if (!activeColormap || !draft.colormaps[activeColormap]) {
      activeColormap = colormapNames[0] || null;
      formState.setSelectedColormapName(activeColormap);
    }

    container.innerHTML = `
      <div class="config-split-view">
        <!-- Sidebar: Colormap List -->
        <div class="config-sidebar">
          <div class="config-sidebar-header">
            <input
              type="text"
              id="input-colormap-search"
              class="config-search-input"
              placeholder="🔍 Filter colormaps..."
              value="${escapeHtml(searchQuery)}"
            />
          </div>
          <div class="config-sidebar-list" id="colormap-sidebar-list"></div>
          <div class="config-sidebar-footer">
            <button type="button" id="btn-new-colormap" class="btn" style="width: 100%; font-size: 11px;">+ New Colormap</button>
          </div>
        </div>

        <!-- Main Detail: Selected Colormap Editor -->
        <div class="config-detail-pane">
          ${
            replaceModalData
              ? `
            <div class="config-card" style="border: 1px solid #f85149; background: #1c1214;">
              <div class="config-card-header">
                <h3 style="color: #f85149;">Replace Usages of "${escapeHtml(replaceModalData.colormapName)}"</h3>
                <p class="config-card-desc">
                  This colormap is currently referenced by <strong>${replaceModalData.count}</strong> layer(s).
                  Select another colormap to reassign those layers to before deleting:
                </p>
              </div>
              <div style="display: flex; gap: 10px; align-items: center; margin: 12px 0;">
                <label class="config-label" style="margin: 0;">Replace with:</label>
                <select id="sel-replace-cmap" class="config-select" style="flex: 1;">
                  ${colormapNames
                    .filter((n) => n !== replaceModalData.colormapName)
                    .map((n) => `<option value="${escapeHtml(n)}" ${n === replaceModalData.targetCmap ? "selected" : ""}>${escapeHtml(n)}</option>`)
                    .join("")}
                </select>
              </div>
              <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button type="button" id="btn-cancel-replace" class="btn">Cancel</button>
                <button type="button" id="btn-confirm-replace-del" class="btn btn-primary" style="background: #da3633;">Replace & Delete</button>
              </div>
            </div>
          `
              : ""
          }

          ${
            !activeColormap
              ? `<div class="config-empty-state"><p>Select or create a colormap to begin editing.</p></div>`
              : `
            <div class="config-card colormap-detail-header">
              <div class="colormap-title-row" style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                <div style="flex: 1;">
                  <label class="config-label">Colormap Key / Identifier</label>
                  <input
                    type="text"
                    id="input-colormap-name"
                    class="config-input"
                    value="${escapeHtml(activeColormap)}"
                    style="font-size: 13px; font-weight: 600; width: 100%; max-width: 320px;"
                  />
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="sidebar-item-chip ${count > 0 ? "usage" : ""}">
                    ${count > 0 ? `${count} layer(s) using this ramp` : "Unused in presets"}
                  </span>
                </div>
              </div>

              <!-- Recommended Ramps Selector -->
              <div class="colormap-actions-row" style="margin-top: 12px; display: flex; gap: 12px; align-items: flex-end;">
                <div style="flex: 1;">
                  <label class="config-label">Apply Recommended Meteorological Ramp (20 library ramps)</label>
                  <select id="sel-builtin-ramp" class="config-select">
                    <option value="">— Select a built-in ramp to apply —</option>
                    <optgroup label="Standard Synoptic Ramps (8)">
                      ${BUILTIN_COLORMAP_PRESETS.slice(0, 8).map((p) => `<option value="${escapeHtml(p.key)}">${escapeHtml(p.label)}</option>`).join("")}
                    </optgroup>
                    <optgroup label="Specialized Meteorological Ramps (12)">
                      ${BUILTIN_COLORMAP_PRESETS.slice(8).map((p) => `<option value="${escapeHtml(p.key)}">${escapeHtml(p.label)}</option>`).join("")}
                    </optgroup>
                  </select>
                </div>
                <button type="button" id="btn-apply-ramp" class="btn">Apply Ramp</button>
              </div>
            </div>

            <div id="colormap-stops-mount"></div>
          `
          }
        </div>
      </div>
    `;

    renderSidebarList();
    bindEvents();

    if (activeColormap && !replaceModalData) {
      const stopsMount = container.querySelector("#colormap-stops-mount");
      if (stopsMount) {
        stopsMountController = mountColormapStops(stopsMount, activeColormap, formState, () => {
          renderSidebarList();
        });
      }
    }
  }

  function bindEvents() {
    // Colormap search: filter list without losing focus
    const searchInput = container.querySelector("#input-colormap-search");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value;
        renderSidebarList();
      });
    }

    // New colormap
    const btnNew = container.querySelector("#btn-new-colormap");
    btnNew?.addEventListener("click", () => {
      formState.updateDraft((d) => {
        if (!d.colormaps) d.colormaps = {};
        let name = "NEW_COLORMAP";
        let counter = 2;
        while (d.colormaps[name]) {
          name = `NEW_COLORMAP_${counter++}`;
        }
        d.colormaps[name] = [
          { val: 0, color: [50, 100, 220, 255] },
          { val: 10, color: [100, 210, 110, 255] },
          { val: 20, color: [230, 50, 40, 255] },
        ];
        activeColormap = name;
        formState.setSelectedColormapName(name);
      });
      render();
    });

    // Rename active colormap with automatic reference rewriting
    const nameInput = container.querySelector("#input-colormap-name");
    nameInput?.addEventListener("change", (e) => {
      const newName = e.target.value.trim();
      if (!newName || newName === activeColormap) return;
      const draft = formState.getDraft();
      if (draft.colormaps?.[newName] && newName !== activeColormap) {
        alert(`Colormap "${newName}" already exists.`);
        e.target.value = activeColormap;
        return;
      }
      formState.updateDraft((d) => {
        if (!d.colormaps || !d.colormaps[activeColormap]) return;
        d.colormaps[newName] = d.colormaps[activeColormap];
        delete d.colormaps[activeColormap];
        rewriteColormapReferences(d, activeColormap, newName);
        activeColormap = newName;
        formState.setSelectedColormapName(newName);
      });
      render();
    });

    // Apply recommended ramp
    const selRamp = container.querySelector("#sel-builtin-ramp");
    const btnApplyRamp = container.querySelector("#btn-apply-ramp");
    btnApplyRamp?.addEventListener("click", () => {
      const key = selRamp?.value;
      if (!key) return;
      const preset = findPreset(key);
      if (preset && preset.stops) {
        formState.updateDraft((d) => {
          if (d.colormaps?.[activeColormap]) {
            d.colormaps[activeColormap] = JSON.parse(JSON.stringify(preset.stops));
          }
        });
        render();
      }
    });

    // Replace modal events
    const btnCancelReplace = container.querySelector("#btn-cancel-replace");
    btnCancelReplace?.addEventListener("click", () => {
      replaceModalData = null;
      render();
    });

    const btnConfirmReplace = container.querySelector("#btn-confirm-replace-del");
    btnConfirmReplace?.addEventListener("click", () => {
      if (!replaceModalData) return;
      const selReplace = container.querySelector("#sel-replace-cmap");
      const targetCmap = selReplace?.value;
      if (!targetCmap) return;

      const oldName = replaceModalData.colormapName;
      formState.updateDraft((d) => {
        rewriteColormapReferences(d, oldName, targetCmap);
        if (d.colormaps) delete d.colormaps[oldName];
      });
      replaceModalData = null;
      activeColormap = getAvailableNames()[0] || null;
      formState.setSelectedColormapName(activeColormap);
      render();
    });
  }

  render();

  return () => {
    if (stopsMountController) {
      stopsMountController.unmount();
      stopsMountController = null;
    }
    container.innerHTML = "";
  };
}
