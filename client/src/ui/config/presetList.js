// presetList.js - Sidebar list of presets & dividers with filtering and management
import { isDivider } from "../../config/presets.js";
import { clonePresetGroup, insertDivider, moveEntry, deleteDivider, escapeHtml } from "./formState.js";

/**
 * Renders the presets sidebar into sidebarEl.
 * @param {HTMLElement} sidebarEl
 * @param {Object} formState
 * @param {Function} onSelect - callback when active selection changes (preset or divider id)
 */
export function renderPresetSidebar(sidebarEl, formState, onSelect) {
  if (!sidebarEl || !formState) return;

  let searchQuery = "";
  const draft = formState.getDraft();
  const presets = Array.isArray(draft.presets) ? draft.presets : [];
  const selectedId = formState.getSelectedPresetId();
  const validation = formState.getValidation();

  sidebarEl.innerHTML = `
    <div class="config-sidebar-header">
      <input
        type="text"
        id="input-preset-search"
        class="config-search-input"
        placeholder="🔍 Filter presets..."
        value=""
      />
    </div>
    <div class="config-sidebar-list" id="preset-sidebar-list"></div>
    <div class="config-sidebar-footer" style="display: flex; gap: 6px;">
      <button type="button" id="btn-add-preset" class="btn btn-primary" style="flex: 2; font-size: 11px;">+ Preset</button>
      <button type="button" id="btn-add-divider" class="btn" style="flex: 1; font-size: 11px;" title="Insert horizontal visual divider">+ Divider</button>
    </div>
  `;

  const searchInput = sidebarEl.querySelector("#input-preset-search");
  const listEl = sidebarEl.querySelector("#preset-sidebar-list");

  searchInput?.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderList();
  });

  function renderList() {
    listEl.innerHTML = "";
    const q = searchQuery.toLowerCase();

    presets.forEach((entry, idx) => {
      const isDiv = isDivider(entry);
      const isSelected = entry.id === selectedId;

      // Filter check
      if (q) {
        if (isDiv) {
          const labelMatch = (entry.label || "").toLowerCase().includes(q);
          if (!labelMatch) return;
        } else {
          const nameMatch = (entry.name || "").toLowerCase().includes(q);
          const idMatch = (entry.id || "").toLowerCase().includes(q);
          const catMatch = (entry.category || "").toLowerCase().includes(q);
          if (!nameMatch && !idMatch && !catMatch) return;
        }
      }

      if (isDiv) {
        // Divider row
        const row = document.createElement("div");
        row.className = `config-sidebar-divider-row ${isSelected ? "selected" : ""}`;
        row.dataset.id = entry.id;
        row.setAttribute("role", "separator");
        row.innerHTML = `
          <div class="divider-row-content">
            <span class="divider-text">${entry.label ? `── ${escapeHtml(entry.label)} ──` : "────────"}</span>
          </div>
          <div class="sidebar-item-actions">
            <button type="button" class="btn-sidebar-action btn-move-up" data-idx="${idx}" ${idx === 0 ? "disabled" : ""} title="Move up">↑</button>
            <button type="button" class="btn-sidebar-action btn-move-down" data-idx="${idx}" ${idx === presets.length - 1 ? "disabled" : ""} title="Move down">↓</button>
            <button type="button" class="btn-sidebar-action btn-del-div" data-id="${escapeHtml(entry.id)}" title="Delete divider">✕</button>
          </div>
        `;

        row.addEventListener("click", (e) => {
          if (e.target.closest(".btn-sidebar-action")) return;
          formState.setSelectedPresetId(entry.id);
          onSelect(entry.id);
          renderList();
        });

        const btnUp = row.querySelector(".btn-move-up");
        const btnDown = row.querySelector(".btn-move-down");
        const btnDel = row.querySelector(".btn-del-div");

        btnUp?.addEventListener("click", (e) => {
          e.stopPropagation();
          formState.updateDraft((d) => moveEntry(d, idx, idx - 1));
          renderPresetSidebar(sidebarEl, formState, onSelect);
        });

        btnDown?.addEventListener("click", (e) => {
          e.stopPropagation();
          formState.updateDraft((d) => moveEntry(d, idx, idx + 1));
          renderPresetSidebar(sidebarEl, formState, onSelect);
        });

        btnDel?.addEventListener("click", (e) => {
          e.stopPropagation();
          formState.updateDraft((d) => deleteDivider(d, entry.id));
          const nextId = draft.presets.find((p) => !p.divider)?.id || draft.presets[0]?.id || null;
          formState.setSelectedPresetId(nextId);
          onSelect(nextId);
          renderPresetSidebar(sidebarEl, formState, onSelect);
        });

        listEl.appendChild(row);
      } else {
        // Preset group row
        const row = document.createElement("div");
        const hasError = validation.presetErrors?.has(entry.id);
        row.className = `config-sidebar-item ${isSelected ? "selected" : ""} ${hasError ? "has-error" : ""}`;
        row.dataset.id = entry.id;

        const layerCount = Array.isArray(entry.layers) ? entry.layers.length : 0;
        const levelBadge = entry.hasLevel ? `${entry.defaultLevel ?? "—"}hPa` : "no-level";

        row.innerHTML = `
          <div class="sidebar-item-top">
            <span class="sidebar-item-name" title="${escapeHtml(entry.name || entry.id)}">${escapeHtml(entry.name || entry.id)}</span>
            <div class="sidebar-item-badges">
              ${hasError ? `<span class="badge-error" title="Validation errors">⚠</span>` : ""}
              ${entry.category ? `<span class="sidebar-item-chip cat">${escapeHtml(entry.category)}</span>` : ""}
              <span class="sidebar-item-chip lvl">${escapeHtml(levelBadge)}</span>
              <span class="sidebar-item-chip count">${layerCount}L</span>
            </div>
          </div>
          <div class="sidebar-item-actions">
            <button type="button" class="btn-sidebar-action btn-move-up" data-idx="${idx}" ${idx === 0 ? "disabled" : ""} title="Move up">↑</button>
            <button type="button" class="btn-sidebar-action btn-move-down" data-idx="${idx}" ${idx === presets.length - 1 ? "disabled" : ""} title="Move down">↓</button>
            <button type="button" class="btn-sidebar-action btn-copy-grp" data-id="${escapeHtml(entry.id)}" title="Copy preset group (⧉)">⧉</button>
            <button type="button" class="btn-sidebar-action btn-del-grp" data-id="${escapeHtml(entry.id)}" title="Delete preset">✕</button>
          </div>
        `;

        row.addEventListener("click", (e) => {
          if (e.target.closest(".btn-sidebar-action")) return;
          formState.setSelectedPresetId(entry.id);
          onSelect(entry.id);
          renderList();
        });

        const btnUp = row.querySelector(".btn-move-up");
        const btnDown = row.querySelector(".btn-move-down");
        const btnCopy = row.querySelector(".btn-copy-grp");
        const btnDel = row.querySelector(".btn-del-grp");

        btnUp?.addEventListener("click", (e) => {
          e.stopPropagation();
          formState.updateDraft((d) => moveEntry(d, idx, idx - 1));
          renderPresetSidebar(sidebarEl, formState, onSelect);
        });

        btnDown?.addEventListener("click", (e) => {
          e.stopPropagation();
          formState.updateDraft((d) => moveEntry(d, idx, idx + 1));
          renderPresetSidebar(sidebarEl, formState, onSelect);
        });

        btnCopy?.addEventListener("click", (e) => {
          e.stopPropagation();
          let newId = null;
          formState.updateDraft((d) => {
            const res = clonePresetGroup(d, entry.id);
            if (res.ok) newId = res.newId;
          });
          if (newId) {
            formState.setSelectedPresetId(newId);
            onSelect(newId);
          }
          renderPresetSidebar(sidebarEl, formState, onSelect);
        });

        btnDel?.addEventListener("click", (e) => {
          e.stopPropagation();
          if (layerCount > 0) {
            const ok = confirm(`Preset "${entry.name}" contains ${layerCount} layer(s). Delete it?`);
            if (!ok) return;
          }
          formState.updateDraft((d) => {
            const pIdx = d.presets.findIndex((p) => p.id === entry.id);
            if (pIdx !== -1) d.presets.splice(pIdx, 1);
          });
          const nextId = draft.presets.find((p) => !p.divider)?.id || draft.presets[0]?.id || null;
          formState.setSelectedPresetId(nextId);
          onSelect(nextId);
          renderPresetSidebar(sidebarEl, formState, onSelect);
        });

        listEl.appendChild(row);
      }
    });
  }

  renderList();

  // Add preset button
  sidebarEl.querySelector("#btn-add-preset")?.addEventListener("click", () => {
    let newId = null;
    formState.updateDraft((d) => {
      const existing = new Set(d.presets.map((p) => p.id));
      let counter = 1;
      let cand = `preset-custom-${counter}`;
      while (existing.has(cand)) cand = `preset-custom-${++counter}`;
      newId = cand;
      d.presets.push({
        id: cand,
        name: `Custom Preset ${counter}`,
        category: "NWP Synoptic",
        hasLevel: true,
        defaultLevel: 500,
        isObservation: false,
        layers: [],
      });
    });
    if (newId) {
      formState.setSelectedPresetId(newId);
      onSelect(newId);
    }
    renderPresetSidebar(sidebarEl, formState, onSelect);
  });

  // Add divider button (appends at end)
  sidebarEl.querySelector("#btn-add-divider")?.addEventListener("click", () => {
    let divId = null;
    formState.updateDraft((d) => {
      const res = insertDivider(d, -1);
      if (res.ok) divId = res.newId;
    });
    if (divId) {
      formState.setSelectedPresetId(divId);
      onSelect(divId);
    }
    renderPresetSidebar(sidebarEl, formState, onSelect);
  });
}

/**
 * Renders the divider mini-form in the detail pane when a divider is selected.
 * @param {HTMLElement} container
 * @param {Object} divider
 * @param {Object} formState
 * @param {Function} onUpdate - callback when divider updated
 */
export function renderDividerMiniForm(container, divider, formState, onUpdate) {
  if (!container || !divider || !formState) return;

  container.innerHTML = `
    <div class="divider-mini-form">
      <div class="config-card">
        <div class="config-card-header">
          <h3>Visual Section Divider</h3>
          <p class="config-card-desc">
            Organizes presets into visual sections. In dropdowns, dividers render as centered separator lines (─── label ───) and cannot be selected.
          </p>
        </div>

        <div class="config-card-body" style="padding-top: 12px;">
          <div class="config-field-group">
            <label class="config-label">Divider ID</label>
            <input type="text" class="config-input" value="${escapeHtml(divider.id)}" disabled style="opacity: 0.6;" />
          </div>

          <div class="config-field-group" style="margin-top: 12px;">
            <label class="config-label">Section Label (Optional, max 40 chars)</label>
            <input
              type="text"
              id="input-divider-label"
              class="config-input"
              placeholder="Section label — empty = bare line"
              maxlength="40"
              value="${escapeHtml(divider.label || "")}"
            />
          </div>

          <div class="config-field-group" style="margin-top: 16px;">
            <label class="config-label">Live Appearance Preview</label>
            <div class="divider-preview-box" id="divider-preview-render">
              <div class="divider-preview-hr ${divider.label ? "with-label" : ""}">
                <span>${divider.label ? `── ${escapeHtml(divider.label)} ──` : "────────"}</span>
              </div>
            </div>
          </div>

          <div style="margin-top: 24px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            <button type="button" id="btn-insert-div-above" class="btn" style="font-size: 11px;">+ Insert Divider Above</button>
            <button type="button" id="btn-insert-div-below" class="btn" style="font-size: 11px;">+ Insert Divider Below</button>
            <button type="button" id="btn-delete-divider-pane" class="btn btn-danger" style="font-size: 11px; margin-left: auto;">✕ Delete Divider</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const labelInput = container.querySelector("#input-divider-label");
  const previewBox = container.querySelector("#divider-preview-render");
  const btnDel = container.querySelector("#btn-delete-divider-pane");
  const btnInsAbove = container.querySelector("#btn-insert-div-above");
  const btnInsBelow = container.querySelector("#btn-insert-div-below");

  labelInput?.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    formState.updateDraft((d) => {
      const target = d.presets.find((p) => p.id === divider.id);
      if (target) {
        if (val) target.label = val;
        else delete target.label;
      }
    });
    if (previewBox) {
      const hr = previewBox.querySelector(".divider-preview-hr");
      const span = previewBox.querySelector("span");
      if (hr && span) {
        hr.className = `divider-preview-hr ${val ? "with-label" : ""}`;
        span.textContent = val ? `── ${val} ──` : "────────";
      }
    }
    onUpdate?.();
  });

  btnInsAbove?.addEventListener("click", () => {
    let newId = null;
    formState.updateDraft((d) => {
      const idx = d.presets.findIndex((p) => p.id === divider.id);
      const res = insertDivider(d, idx >= 0 ? idx : 0, "New Section");
      if (res.ok) newId = res.newId;
    });
    if (newId) {
      formState.setSelectedPresetId(newId);
      onUpdate?.(newId);
    }
  });

  btnInsBelow?.addEventListener("click", () => {
    let newId = null;
    formState.updateDraft((d) => {
      const idx = d.presets.findIndex((p) => p.id === divider.id);
      const res = insertDivider(d, idx >= 0 ? idx + 1 : -1, "New Section");
      if (res.ok) newId = res.newId;
    });
    if (newId) {
      formState.setSelectedPresetId(newId);
      onUpdate?.(newId);
    }
  });

  btnDel?.addEventListener("click", () => {
    formState.updateDraft((d) => deleteDivider(d, divider.id));
    const nextId = formState.getDraft().presets.find((p) => !p.divider)?.id || null;
    formState.setSelectedPresetId(nextId);
    onUpdate?.(nextId);
  });
}
