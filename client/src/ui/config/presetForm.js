// presetForm.js - Preset group & layer editor orchestrator
import { isDivider } from "../../config/presets.js";
import { renderPresetSidebar, renderDividerMiniForm } from "./presetList.js";
import { mountLayerForm } from "./layerForm.js";
import { cloneLayer, clonePresetGroup, escapeHtml } from "./formState.js";

const DEFAULT_LEVEL_OPTIONS = [
  1000, 925, 850, 700, 500, 400, 300, 250, 200, 150, 100, 70, 50, 30, 20, 10,
];

/**
 * Mounts the Presets sub-tab inside container.
 * @param {HTMLElement} container
 * @param {Object} formState
 * @returns {Function} unmount function
 */
export function mountPresetForm(container, formState) {
  if (!container || !formState) return () => {};

  let expandedLayerId = null;
  let layerFormUnmount = null;
  let statusBanner = null; // { type: 'warning' | 'info', message: string }

  function updateLayerRowSummary(layer) {
    const detailMount = container.querySelector("#presets-detail-mount");
    if (!detailMount) return;
    const wrap = detailMount.querySelector(".preset-layer-row-wrap.expanded");
    if (!wrap || wrap.dataset.layerId !== layer.id) return;
    const nameEl = wrap.querySelector(".layer-meta-name");
    const subEl = wrap.querySelector(".layer-meta-sub");
    const dotEl = wrap.querySelector(".preset-layer-dot");
    const chipEl = wrap.querySelector(".sidebar-item-chip");

    if (nameEl) nameEl.textContent = layer.name || layer.id;
    if (subEl) {
      subEl.textContent = `${layer.model || ""}/${layer.element || ""}${layer.level ? ` (${layer.level}hPa)` : ""}${layer.derivedFrom ? ` [derived: ${layer.derivedFrom}]` : ""}`;
    }
    const dotColor = layer.color || layer.render?.lineColor || "#58a6ff";
    if (dotEl) {
      dotEl.style.background = dotColor;
      dotEl.title = dotColor;
    }
    if (chipEl) {
      chipEl.textContent = layer.type || "contour";
      chipEl.className = `sidebar-item-chip type-${layer.type || "contour"}`;
    }
  }

  function render() {
    if (layerFormUnmount) {
      layerFormUnmount();
      layerFormUnmount = null;
    }

    const draft = formState.getDraft();
    const presets = draft.presets || [];
    let selectedId = formState.getSelectedPresetId();

    if (!selectedId || !presets.some((p) => p.id === selectedId)) {
      selectedId = presets.find((p) => !p.divider)?.id || presets[0]?.id || null;
      formState.setSelectedPresetId(selectedId);
    }

    const selectedEntry = presets.find((p) => p.id === selectedId) || null;
    const isDiv = selectedEntry ? isDivider(selectedEntry) : false;

    container.innerHTML = `
      <div class="config-split-view">
        <!-- Sidebar -->
        <div class="config-sidebar" id="presets-sidebar-mount"></div>

        <!-- Detail Pane -->
        <div class="config-detail-pane" id="presets-detail-mount"></div>
      </div>
    `;

    const sidebarMount = container.querySelector("#presets-sidebar-mount");
    const detailMount = container.querySelector("#presets-detail-mount");

    renderPresetSidebar(sidebarMount, formState, (newSelectedId) => {
      expandedLayerId = null;
      statusBanner = null;
      render();
    });

    if (presets.length === 0) {
      detailMount.innerHTML = `
        <div class="config-empty-state">
          <p>No presets found in configuration.</p>
          <button type="button" id="btn-create-first-preset" class="btn btn-primary" style="margin-top: 12px;">+ Create your first preset</button>
        </div>
      `;
      detailMount.querySelector("#btn-create-first-preset")?.addEventListener("click", () => {
        const newGroup = {
          id: "new-preset-1",
          name: "New Preset Group",
          category: "NWP Synoptic",
          hasLevel: true,
          defaultLevel: 500,
          layers: [],
        };
        formState.updateDraft((d) => {
          if (!Array.isArray(d.presets)) d.presets = [];
          d.presets.push(newGroup);
        });
        formState.setSelectedPresetId(newGroup.id);
        render();
      });
      return;
    }

    if (!selectedEntry) {
      detailMount.innerHTML = `
        <div class="config-empty-state">
          <p>No preset selected. Select a preset from the sidebar to edit.</p>
        </div>
      `;
      return;
    }

    if (isDiv) {
      renderDividerMiniForm(detailMount, selectedEntry, formState, (newId) => {
        render();
      });
      return;
    }

    // Render preset group detail form
    renderGroupDetail(detailMount, selectedEntry, presets);
  }

  function renderGroupDetail(detailMount, preset, allPresets) {
    const layers = Array.isArray(preset.layers) ? preset.layers : [];
    const otherPresets = allPresets.filter((p) => !p.divider && p.id !== preset.id);

    detailMount.innerHTML = `
      <div class="preset-detail-container">
        ${
          statusBanner
            ? `
          <div class="config-banner ${escapeHtml(statusBanner.type)}" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
            <span>${escapeHtml(statusBanner.message)}</span>
            <button type="button" class="btn-sidebar-action" id="btn-dismiss-banner" title="Dismiss">✕</button>
          </div>
        `
            : ""
        }

        <!-- Identity & Metadata Card -->
        <div class="config-card">
          <div class="config-card-header" style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h3>Preset Identity</h3>
              <p class="config-card-desc">Group ID, display title, category classification, and vertical level defaults.</p>
            </div>
            <div style="display: flex; gap: 8px;">
              <button type="button" id="btn-copy-this-group" class="btn" title="Duplicate preset group (⧉)">Duplicate</button>
              <button type="button" id="btn-del-this-group" class="btn" style="color: var(--text-danger, #f85149);" title="Delete this preset group">Delete Group</button>
            </div>
          </div>

          <div class="preset-identity-grid" style="margin-top: 12px;">
            <div class="config-field">
              <label class="config-label">Preset ID (URL slug, unique)</label>
              <input type="text" id="preset-inp-id" class="config-input" value="${escapeHtml(preset.id || "")}" />
            </div>

            <div class="config-field">
              <label class="config-label">Display Name</label>
              <input type="text" id="preset-inp-name" class="config-input" value="${escapeHtml(preset.name || "")}" />
            </div>

            <div class="config-field">
              <label class="config-label">Category</label>
              <input type="text" id="preset-inp-category" class="config-input" list="datalist-categories" value="${escapeHtml(preset.category || "")}" />
              <datalist id="datalist-categories">
                <option value="NWP Synoptic">NWP Synoptic</option>
                <option value="Surface Analysis">Surface Analysis</option>
                <option value="Observation Plot">Observation Plot</option>
                <option value="T-lnP Diagram">T-lnP Diagram</option>
                <option value="Severe Weather">Severe Weather</option>
              </datalist>
            </div>

            <div class="config-field">
              <label class="config-label">Default Level (hPa)</label>
              <select id="preset-sel-level" class="config-select" ${!preset.hasLevel ? "disabled" : ""}>
                <option value="">— None (Surface / Global) —</option>
                ${DEFAULT_LEVEL_OPTIONS.map((lvl) => `<option value="${lvl}" ${preset.defaultLevel === lvl ? "selected" : ""}>${lvl} hPa</option>`).join("")}
              </select>
            </div>

            <div class="config-field-toggles" style="grid-column: span 2; display: flex; gap: 20px; align-items: center; margin-top: 4px;">
              <label class="config-checkbox-label">
                <input type="checkbox" id="preset-chk-haslevel" ${preset.hasLevel ? "checked" : ""} />
                <span>Multi-level support (hasLevel)</span>
              </label>
              <label class="config-checkbox-label">
                <input type="checkbox" id="preset-chk-isobs" ${preset.isObservation ? "checked" : ""} />
                <span>Observation / station data source</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Layers List Card -->
        <div class="config-card">
          <div class="config-card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h3>Layers (${layers.length})</h3>
              <p class="config-card-desc">Layers stacked in rendering order (bottom to top).</p>
            </div>
            <div style="display: flex; gap: 8px;">
              <select id="sel-add-layer-type" class="config-select" style="font-size: 11px;">
                <option value="">+ Add Layer ▾</option>
                <option value="contour">Contour Layer</option>
                <option value="wind">Wind Layer</option>
                <option value="station">Station Layer</option>
                <option value="tlogp">T-LogP Layer</option>
              </select>
            </div>
          </div>

          <div class="config-card-body" style="padding: 0;">
            ${
              layers.length === 0
                ? `<div class="config-empty-state"><p>Preset has 0 layers. Use "+ Add Layer" above to add one.</p></div>`
                : `
              <div class="preset-layers-list">
                ${layers
                  .map((layer, lIdx) => {
                    const isExpanded = layer.id === expandedLayerId;
                    const dotColor = layer.color || layer.render?.lineColor || "#58a6ff";

                    return `
                    <div class="preset-layer-row-wrap ${isExpanded ? "expanded" : ""}" data-layer-id="${escapeHtml(layer.id)}">
                      <div class="preset-layer-row">
                        <div class="layer-drag-handle">
                          <button type="button" class="btn-layer-reorder btn-layer-up" data-idx="${lIdx}" ${lIdx === 0 ? "disabled" : ""} title="Move up">▲</button>
                          <button type="button" class="btn-layer-reorder btn-layer-down" data-idx="${lIdx}" ${lIdx === layers.length - 1 ? "disabled" : ""} title="Move down">▼</button>
                        </div>

                        <!-- Visibility Eye -->
                        <button type="button" class="btn-layer-eye ${layer.visible !== false ? "active" : ""}" data-idx="${lIdx}" title="Toggle visibility">
                          ${layer.visible !== false ? "👁" : "🚫"}
                        </button>

                        <!-- Color Dot -->
                        <span class="preset-layer-dot" style="background: ${escapeHtml(dotColor)};" title="${escapeHtml(dotColor)}"></span>

                        <!-- Info -->
                        <div class="preset-layer-meta">
                          <span class="layer-meta-name">${escapeHtml(layer.name || layer.id)}</span>
                          <span class="layer-meta-sub">${escapeHtml(layer.model || "")}/${escapeHtml(layer.element || "")}${layer.level ? ` (${layer.level}hPa)` : ""}${layer.derivedFrom ? ` [derived: ${escapeHtml(layer.derivedFrom)}]` : ""}</span>
                        </div>

                        <span class="sidebar-item-chip type-${escapeHtml(layer.type || "contour")}">${escapeHtml(layer.type || "contour")}</span>

                        <!-- Actions -->
                        <div class="preset-layer-row-actions">
                          <button type="button" class="btn-sidebar-action btn-copy-layer" data-layer-id="${escapeHtml(layer.id)}" title="Copy layer in this preset (⧉)">⧉</button>

                          ${
                            otherPresets.length > 0
                              ? `
                            <select class="sel-copy-to-preset config-select" data-layer-id="${escapeHtml(layer.id)}" style="font-size: 10px; height: 22px; padding: 0 4px; max-width: 90px;" title="Copy to another preset">
                              <option value="">Copy to ▾</option>
                              ${otherPresets.map((op) => `<option value="${escapeHtml(op.id)}">${escapeHtml(op.name || op.id)}</option>`).join("")}
                            </select>
                          `
                              : ""
                          }

                          <button type="button" class="btn-sidebar-action btn-expand-layer ${isExpanded ? "active" : ""}" data-layer-id="${escapeHtml(layer.id)}" title="Edit layer properties">⚙</button>
                          <button type="button" class="btn-sidebar-action btn-del-layer" data-idx="${lIdx}" ${layer.removable === false ? "disabled" : ""} title="${layer.removable === false ? "Base layer cannot be deleted" : "Delete layer"}">✕</button>
                        </div>
                      </div>

                      <!-- Inline Expansion for Layer Form -->
                      ${
                        isExpanded
                          ? `<div class="preset-layer-expanded-mount" data-layer-id="${escapeHtml(layer.id)}"></div>`
                          : ""
                      }
                    </div>
                  `;
                  })
                  .join("")}
              </div>
            `
            }
          </div>
        </div>
      </div>
    `;

    bindGroupEvents(detailMount, preset, layers);

    // If a layer is expanded, mount its form into the expanded container safely
    if (expandedLayerId) {
      const mountEl = detailMount.querySelector(".preset-layer-row-wrap.expanded .preset-layer-expanded-mount");
      const targetLayer = layers.find((l) => l.id === expandedLayerId);
      if (mountEl && targetLayer) {
        layerFormUnmount = mountLayerForm(mountEl, preset, targetLayer, formState, (opts = {}) => {
          if (opts.reRender) {
            render();
          } else {
            updateLayerRowSummary(targetLayer);
          }
        });
      }
    }
  }

  function bindGroupEvents(detailMount, preset, layers) {
    // Dismiss banner
    detailMount.querySelector("#btn-dismiss-banner")?.addEventListener("click", () => {
      statusBanner = null;
      render();
    });

    // Identity inputs
    const idInp = detailMount.querySelector("#preset-inp-id");
    idInp?.addEventListener("change", (e) => {
      const val = e.target.value.trim();
      if (val && val !== preset.id) {
        formState.updateDraft((d) => {
          const p = d.presets.find((x) => x.id === preset.id);
          if (p) p.id = val;
        });
        formState.setSelectedPresetId(val);
        render();
      }
    });

    const nameInp = detailMount.querySelector("#preset-inp-name");
    nameInp?.addEventListener("input", (e) => {
      const val = e.target.value;
      formState.updateDraft((d) => {
        const p = d.presets.find((x) => x.id === preset.id);
        if (p) p.name = val;
      });
    });

    const catInp = detailMount.querySelector("#preset-inp-category");
    catInp?.addEventListener("change", (e) => {
      const val = e.target.value.trim();
      formState.updateDraft((d) => {
        const p = d.presets.find((x) => x.id === preset.id);
        if (p) p.category = val;
      });
    });

    const selLevel = detailMount.querySelector("#preset-sel-level");
    selLevel?.addEventListener("change", (e) => {
      const raw = e.target.value;
      const val = raw ? parseInt(raw, 10) : null;
      formState.updateDraft((d) => {
        const p = d.presets.find((x) => x.id === preset.id);
        if (p) p.defaultLevel = val;
      });
    });

    const chkHasLevel = detailMount.querySelector("#preset-chk-haslevel");
    chkHasLevel?.addEventListener("change", (e) => {
      const checked = e.target.checked;
      formState.updateDraft((d) => {
        const p = d.presets.find((x) => x.id === preset.id);
        if (p) {
          p.hasLevel = checked;
          if (!checked) p.defaultLevel = null;
        }
      });
      render();
    });

    const chkIsObs = detailMount.querySelector("#preset-chk-isobs");
    chkIsObs?.addEventListener("change", (e) => {
      const checked = e.target.checked;
      formState.updateDraft((d) => {
        const p = d.presets.find((x) => x.id === preset.id);
        if (p) p.isObservation = checked;
      });
    });

    // Copy Group button
    detailMount.querySelector("#btn-copy-this-group")?.addEventListener("click", () => {
      let newId = null;
      formState.updateDraft((d) => {
        const res = clonePresetGroup(d, preset.id);
        if (res.ok) newId = res.newId;
      });
      if (newId) {
        formState.setSelectedPresetId(newId);
        expandedLayerId = null;
        statusBanner = { type: "info", message: `Copied "${preset.name || preset.id}" → new preset created.` };
        render();
      }
    });

    // Delete Group button
    detailMount.querySelector("#btn-del-this-group")?.addEventListener("click", () => {
      if (layers.length > 0) {
        const ok = confirm(`Delete preset "${preset.name || preset.id}" and its ${layers.length} layer(s)?`);
        if (!ok) return;
      }
      formState.updateDraft((d) => {
        const idx = d.presets.findIndex((p) => p.id === preset.id);
        if (idx !== -1) d.presets.splice(idx, 1);
      });
      const nextId = formState.getDraft().presets.find((p) => !p.divider)?.id || null;
      formState.setSelectedPresetId(nextId);
      expandedLayerId = null;
      statusBanner = null;
      render();
    });

    // Add Layer select with ID uniquification
    const addLayerSel = detailMount.querySelector("#sel-add-layer-type");
    addLayerSel?.addEventListener("change", (e) => {
      const type = e.target.value;
      if (!type) return;

      const existingIds = new Set(layers.map((l) => l.id));
      let counter = layers.length + 1;
      let newId = `${type}-${counter}`;
      while (existingIds.has(newId)) {
        counter++;
        newId = `${type}-${counter}`;
      }

      const newLayer = {
        id: newId,
        name: `New ${type.toUpperCase()} Layer`,
        type,
        model: preset.isObservation ? "SURFACE" : "ECMWF_HR",
        element: type === "contour" ? "HGT" : type === "wind" ? "WIND" : type === "station" ? "STATION" : "TLOGP",
        level: preset.hasLevel ? preset.defaultLevel || 500 : null,
        visible: true,
        removable: true,
        render: type === "contour" ? { showLine: true, lineWidth: 2, lineColor: "#58a6ff" } : {},
      };

      formState.updateDraft((d) => {
        const p = d.presets.find((x) => x.id === preset.id);
        if (p) {
          if (!Array.isArray(p.layers)) p.layers = [];
          p.layers.push(newLayer);
        }
      });

      expandedLayerId = newLayer.id;
      statusBanner = null;
      render();
    });

    // Reorder layers
    detailMount.querySelectorAll(".btn-layer-up").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx, 10);
        if (idx > 0) {
          formState.updateDraft((d) => {
            const p = d.presets.find((x) => x.id === preset.id);
            if (p?.layers) {
              const [item] = p.layers.splice(idx, 1);
              p.layers.splice(idx - 1, 0, item);
            }
          });
          render();
        }
      });
    });

    detailMount.querySelectorAll(".btn-layer-down").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx, 10);
        if (idx < layers.length - 1) {
          formState.updateDraft((d) => {
            const p = d.presets.find((x) => x.id === preset.id);
            if (p?.layers) {
              const [item] = p.layers.splice(idx, 1);
              p.layers.splice(idx + 1, 0, item);
            }
          });
          render();
        }
      });
    });

    // Eye visibility toggle
    detailMount.querySelectorAll(".btn-layer-eye").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx, 10);
        formState.updateDraft((d) => {
          const l = d.presets.find((x) => x.id === preset.id)?.layers?.[idx];
          if (l) l.visible = l.visible === false ? true : false;
        });
        render();
      });
    });

    // Copy Layer in same group
    detailMount.querySelectorAll(".btn-copy-layer").forEach((btn) => {
      btn.addEventListener("click", () => {
        const layerId = btn.dataset.layerId;
        let newLayerId = null;
        formState.updateDraft((d) => {
          const res = cloneLayer(d, preset.id, layerId, preset.id);
          if (res.ok) newLayerId = res.newId;
        });
        if (newLayerId) expandedLayerId = newLayerId;
        statusBanner = null;
        render();
      });
    });

    // Copy to another preset dropdown
    detailMount.querySelectorAll(".sel-copy-to-preset").forEach((sel) => {
      sel.addEventListener("change", (e) => {
        const targetPresetId = e.target.value;
        const layerId = sel.dataset.layerId;
        if (!targetPresetId || !layerId) return;

        let warningMsg = null;
        formState.updateDraft((d) => {
          const res = cloneLayer(d, preset.id, layerId, targetPresetId);
          if (res.warning) warningMsg = res.warning;
        });
        if (warningMsg) {
          statusBanner = { type: "warning", message: `Layer copied to preset "${targetPresetId}": ${warningMsg}` };
        } else {
          statusBanner = { type: "info", message: `Layer copied to preset "${targetPresetId}".` };
        }
        render();
      });
    });

    // Expand/collapse layer configuration
    detailMount.querySelectorAll(".btn-expand-layer").forEach((btn) => {
      btn.addEventListener("click", () => {
        const layerId = btn.dataset.layerId;
        expandedLayerId = expandedLayerId === layerId ? null : layerId;
        render();
      });
    });

    // Delete layer
    detailMount.querySelectorAll(".btn-del-layer").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx, 10);
        formState.updateDraft((d) => {
          const p = d.presets.find((x) => x.id === preset.id);
          if (p?.layers) p.layers.splice(idx, 1);
        });
        expandedLayerId = null;
        statusBanner = null;
        render();
      });
    });
  }

  render();

  return () => {
    if (layerFormUnmount) {
      layerFormUnmount();
      layerFormUnmount = null;
    }
    container.innerHTML = "";
  };
}
