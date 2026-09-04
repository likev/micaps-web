// stationFilterControl.js - Interactive Station Multi-Filter Rule Builder Component
import { autoSaveLayerConfig } from "../config/presets.js";

const PRESETS = {
  clear: [],
  // Upper-Air Sounding Presets
  hgt_5880: [{ field: "Height", op: ">=", val: "5880" }],
  hgt_5520: [{ field: "Height", op: "<=", val: "5520" }],
  wind_20: [{ field: "Wind", op: ">=", val: "20" }],
  wind_12: [{ field: "Wind", op: ">=", val: "12" }],
  tt_m20: [{ field: "TT", op: "<=", val: "-20" }],
  // Surface Observation Presets
  wind5_rain10_tt10_30: [
    { field: "Wind", op: ">", val: "5" },
    { field: "Rain", op: ">", val: "10" },
    { field: "TT", op: "between", val: "10", val2: "30" },
  ],
  wind5_rain10: [
    { field: "Wind", op: ">", val: "5" },
    { field: "Rain", op: ">", val: "10" },
  ],
  tt_10_30: [
    { field: "TT", op: "between", val: "10", val2: "30" },
  ],
  tt_gt30: [
    { field: "TT", op: ">", val: "30" },
  ],
  tt_lt10: [
    { field: "TT", op: "<", val: "10" },
  ],
  wind_gt5: [
    { field: "Wind", op: ">", val: "5" },
  ],
  rain_gt10: [
    { field: "Rain", op: ">", val: "10" },
  ],
  rain6_gt10: [
    { field: "Rain6", op: ">", val: "10" },
  ],
  vis_lt1: [
    { field: "Visibility", op: "<", val: "1" },
  ],
  rain_gt0: [
    { field: "Rain", op: ">", val: "0" },
  ],
};

export function ensureLayerFilterRules(layer) {
  if (!layer.config) layer.config = {};
  if (!Array.isArray(layer.config.filterRules)) {
    if (layer.config.filterField1 && layer.config.filterField1 !== "none") {
      const rules = [{ field: layer.config.filterField1, op: layer.config.filterOp1 || ">", val: layer.config.filterVal1 ?? "" }];
      if (layer.config.filterField2 && layer.config.filterField2 !== "none") {
        rules.push({ field: layer.config.filterField2, op: layer.config.filterOp2 || "<", val: layer.config.filterVal2 ?? "" });
      }
      layer.config.filterRules = rules;
    } else {
      layer.config.filterRules = [{ field: "none", op: ">", val: "", val2: "" }];
    }
  }
  if (!layer.config.filterLogic) {
    layer.config.filterLogic = "AND";
  }
}

function isUpperAir(layer) {
  if (!layer) return false;
  if (layer.model === "UPPER_AIR") return true;
  const id = (layer.id || "").toLowerCase();
  const name = (layer.name || "").toLowerCase();
  return id.includes("upper") || id.includes("sounding") || name.includes("upper") || name.includes("sounding") || name.includes("高空") || name.includes("探空") || (layer.type === "station" && typeof layer.level === "number" && layer.level > 0);
}

export function renderStationFilterSection(layer) {
  ensureLayerFilterRules(layer);
  const rules = layer.config.filterRules;
  const logic = layer.config.filterLogic || "AND";
  const upper = isUpperAir(layer);

  return `
    <div class="config-filter-section" style="margin-top: 8px; border-top: 1px solid #30363d; padding-top: 6px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
        <span style="font-size: 11px; font-weight: 600; color: #8b949e;">Data Filter Rules</span>
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="font-size: 10px; color: #8b949e;">Match:</span>
          <select class="sel-filter-global-logic" style="background: #161b22; color: #58a6ff; font-weight: bold; border: 1px solid #388bfd; border-radius: 4px; font-size: 10px; padding: 1px 4px;">
            <option value="AND" ${logic === "AND" ? "selected" : ""}>ALL (AND)</option>
            <option value="OR" ${logic === "OR" ? "selected" : ""}>ANY (OR)</option>
            <option value="none" ${logic === "none" ? "selected" : ""}>Rule 1 Only</option>
          </select>
        </div>
      </div>

      <!-- Rule Rows Container -->
      <div class="filter-rules-list">
        ${rules.map((rule, idx) => renderSingleRuleRow(rule, idx, rules.length, logic, upper)).join("")}
      </div>

      <!-- Action Buttons -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 6px;">
        <button type="button" class="btn-add-filter-rule" style="padding: 2px 8px; background: #21262d; color: #58a6ff; border: 1px solid #388bfd; border-radius: 3px; font-size: 11px; cursor: pointer;">
          + Add Rule
        </button>
        <button type="button" class="btn-clear-filter-rules" style="padding: 2px 8px; background: #21262d; color: #8b949e; border: 1px solid #30363d; border-radius: 3px; font-size: 10px; cursor: pointer;">
          Clear All
        </button>
      </div>

      <!-- Quick Filter Presets -->
      <div class="config-quick-presets">
        ${
          upper
            ? `
        <button type="button" class="btn-multi-filter-preset" data-preset="hgt_5880" style="padding: 1px 6px; background: #21262d; color: #58a6ff; font-weight: 600; border: 1px solid #388bfd; border-radius: 3px; font-size: 10px; cursor: pointer;">Height≥5880 (Sub-High)</button>
        <button type="button" class="btn-multi-filter-preset" data-preset="wind_20" style="padding: 1px 6px; background: #21262d; color: #f85149; font-weight: 600; border: 1px solid #da3633; border-radius: 3px; font-size: 10px; cursor: pointer;">Wind≥20m/s (Jet)</button>
        <button type="button" class="btn-multi-filter-preset" data-preset="tt_m20" style="padding: 1px 6px; background: #21262d; color: #79c0ff; border: 1px solid #30363d; border-radius: 3px; font-size: 10px; cursor: pointer;">TT≤-20°C (Cold)</button>
        <button type="button" class="btn-multi-filter-preset" data-preset="hgt_5520" style="padding: 1px 6px; background: #21262d; color: #a5d6ff; border: 1px solid #30363d; border-radius: 3px; font-size: 10px; cursor: pointer;">Height≤5520 (Trough)</button>
        <button type="button" class="btn-multi-filter-preset" data-preset="wind_12" style="padding: 1px 6px; background: #21262d; color: #e3b341; border: 1px solid #30363d; border-radius: 3px; font-size: 10px; cursor: pointer;">Wind≥12m/s</button>
        `
            : `
        <button type="button" class="btn-multi-filter-preset" data-preset="wind5_rain10_tt10_30" style="padding: 1px 6px; background: #21262d; color: #58a6ff; font-weight: 600; border: 1px solid #388bfd; border-radius: 3px; font-size: 10px; cursor: pointer;">Wind&gt;5 &amp; Rain&gt;10 &amp; TT 10..30</button>
        <button type="button" class="btn-multi-filter-preset" data-preset="wind5_rain10" style="padding: 1px 6px; background: #21262d; color: #a5d6ff; border: 1px solid #30363d; border-radius: 3px; font-size: 10px; cursor: pointer;">Wind&gt;5 &amp; Rain&gt;10</button>
        <button type="button" class="btn-multi-filter-preset" data-preset="tt_10_30" style="padding: 1px 6px; background: #21262d; color: #56d364; border: 1px solid #30363d; border-radius: 3px; font-size: 10px; cursor: pointer;">TT 10..30</button>
        <button type="button" class="btn-multi-filter-preset" data-preset="tt_gt30" style="padding: 1px 6px; background: #21262d; color: #f85149; border: 1px solid #30363d; border-radius: 3px; font-size: 10px; cursor: pointer;">TT&gt;30</button>
        <button type="button" class="btn-multi-filter-preset" data-preset="tt_lt10" style="padding: 1px 6px; background: #21262d; color: #79c0ff; border: 1px solid #30363d; border-radius: 3px; font-size: 10px; cursor: pointer;">TT&lt;10</button>
        <button type="button" class="btn-multi-filter-preset" data-preset="wind_gt5" style="padding: 1px 6px; background: #21262d; color: #a5d6ff; border: 1px solid #30363d; border-radius: 3px; font-size: 10px; cursor: pointer;">Wind&gt;5</button>
        <button type="button" class="btn-multi-filter-preset" data-preset="rain_gt10" style="padding: 1px 6px; background: #21262d; color: #79c0ff; border: 1px solid #30363d; border-radius: 3px; font-size: 10px; cursor: pointer;">Rain&gt;10</button>
        <button type="button" class="btn-multi-filter-preset" data-preset="rain6_gt10" style="padding: 1px 6px; background: #21262d; color: #38bdf8; border: 1px solid #388bfd; border-radius: 3px; font-size: 10px; cursor: pointer;">Rain6&gt;10</button>
        <button type="button" class="btn-multi-filter-preset" data-preset="vis_lt1" style="padding: 1px 6px; background: #21262d; color: #ffd33d; border: 1px solid #d29922; border-radius: 3px; font-size: 10px; cursor: pointer;">Vis&lt;1km</button>
        `
        }
      </div>
    </div>
  `;
}

function renderSingleRuleRow(rule, idx, totalCount, logic, upper = false) {
  const isHidden = (logic === "none" && idx > 0);
  const isRange = rule.op === "between" || rule.op === "..";

  return `
    <div class="config-row filter-rule-row ${isHidden ? "hidden" : ""}" data-rule-idx="${idx}" style="${isHidden ? "display: none;" : ""}">
      <span class="rule-index">#${idx + 1}</span>
      <select class="sel-rule-field" data-rule-idx="${idx}" title="Filter field">
        <option value="none" ${!rule.field || rule.field === "none" ? "selected" : ""}>- Field -</option>
        ${
          upper
            ? `
        <option value="Height" ${rule.field === "Height" ? "selected" : ""}>HGT (gpm)</option>
        <option value="TT" ${rule.field === "TT" ? "selected" : ""}>TT (°C)</option>
        <option value="Td" ${rule.field === "Td" ? "selected" : ""}>Td (°C)</option>
        <option value="Wind" ${rule.field === "Wind" ? "selected" : ""}>Wind (m/s)</option>
        `
            : `
        <option value="TT" ${rule.field === "TT" ? "selected" : ""}>TT (°C)</option>
        <option value="Td" ${rule.field === "Td" ? "selected" : ""}>Td (°C)</option>
        <option value="Wind" ${rule.field === "Wind" ? "selected" : ""}>Wind (m/s)</option>
        <option value="Rain" ${rule.field === "Rain" ? "selected" : ""}>Rain (mm)</option>
        <option value="Rain6" ${rule.field === "Rain6" ? "selected" : ""}>Rain6 (mm)</option>
        <option value="Visibility" ${rule.field === "Visibility" ? "selected" : ""}>Vis (km)</option>
        <option value="SLP" ${rule.field === "SLP" ? "selected" : ""}>SLP (hPa)</option>
        `
        }
      </select>
      <select class="sel-rule-op" data-rule-idx="${idx}" title="Comparison operator">
        <option value=">" ${rule.op === ">" ? "selected" : ""}>&gt;</option>
        <option value=">=" ${rule.op === ">=" ? "selected" : ""}>&ge;</option>
        <option value="<" ${rule.op === "<" ? "selected" : ""}>&lt;</option>
        <option value="<=" ${rule.op === "<=" ? "selected" : ""}>&le;</option>
        <option value="=" ${rule.op === "=" ? "selected" : ""}>=</option>
        <option value="between" ${isRange ? "selected" : ""}>..</option>
      </select>
      <input type="number" class="ipt-rule-val ${isRange ? "range" : ""}" data-rule-idx="${idx}" placeholder="${isRange ? "min" : "val"}" value="${rule.val ?? ""}" title="${isRange ? "Minimum value" : "Filter value"}" />
      ${isRange ? `<input type="number" class="ipt-rule-val2 range" data-rule-idx="${idx}" placeholder="max" value="${rule.val2 ?? ""}" title="Maximum value" />` : ""}
      ${totalCount > 1 ? `<button type="button" class="btn-remove-rule" data-rule-idx="${idx}" title="Remove rule">✕</button>` : ""}
    </div>
  `;
}

export function bindStationFilterEvents(configDrawer, layer, onAction, winId) {
  if (!configDrawer || !layer) return;

  const triggerUpdate = () => {
    autoSaveLayerConfig(layer);
    if (onAction) onAction("config", layer.id, layer.config, layer, winId);
  };

  const rerender = () => {
    // Preserve focus/selection across innerHTML rebuild
    const activeEl = document.activeElement;
    const wasInput = activeEl && configDrawer.contains(activeEl) && (activeEl.classList.contains("ipt-rule-val") || activeEl.classList.contains("ipt-rule-val2") || activeEl.classList.contains("sel-rule-field") || activeEl.classList.contains("sel-rule-op"));
    const activeIdx = wasInput ? activeEl.dataset.ruleIdx : null;
    const activeClass = wasInput ? Array.from(activeEl.classList).find((c) => c.startsWith("ipt-") || c.startsWith("sel-")) : null;
    const selStart = wasInput && activeEl.selectionStart !== undefined ? activeEl.selectionStart : null;
    const selEnd = wasInput && activeEl.selectionEnd !== undefined ? activeEl.selectionEnd : null;

    const listContainer = configDrawer.querySelector(".filter-rules-list");
    if (listContainer) {
      const upper = isUpperAir(layer);
      listContainer.innerHTML = layer.config.filterRules
        .map((rule, idx) => renderSingleRuleRow(rule, idx, layer.config.filterRules.length, layer.config.filterLogic, upper))
        .join("");
      attachRuleInputListeners();
      // Restore focus and cursor position if editing was in progress
      if (wasInput && activeIdx !== null && activeClass) {
        // Distinguish val vs val2 when both share same idx
        const selector = `.${activeClass}[data-rule-idx="${activeIdx}"]`;
        const candidates = configDrawer.querySelectorAll(selector);
        let newEl = candidates[0] || null;
        // If multiple matches (unlikely same class same idx), prefer first; val2 distinct class ensures uniqueness
        if (newEl) {
          newEl.focus();
          if (selStart !== null && typeof newEl.setSelectionRange === "function") {
            try { newEl.setSelectionRange(selStart, selEnd); } catch {}
          }
        }
      }
    }
    triggerUpdate();
  };

  const attachRuleInputListeners = () => {
    configDrawer.querySelectorAll(".filter-rule-row").forEach((row) => {
      row.addEventListener("click", (e) => e.stopPropagation());
    });

    configDrawer.querySelectorAll(".sel-rule-field").forEach((sel) => {
      sel.addEventListener("change", (e) => {
        const idx = parseInt(e.target.dataset.ruleIdx, 10);
        if (layer.config.filterRules[idx]) {
          layer.config.filterRules[idx].field = e.target.value;
          triggerUpdate();
        }
      });
    });

    configDrawer.querySelectorAll(".sel-rule-op").forEach((sel) => {
      sel.addEventListener("change", (e) => {
        const idx = parseInt(e.target.dataset.ruleIdx, 10);
        if (layer.config.filterRules[idx]) {
          layer.config.filterRules[idx].op = e.target.value;
          rerender();
        }
      });
    });

    configDrawer.querySelectorAll(".ipt-rule-val").forEach((ipt) => {
      ipt.addEventListener("input", (e) => {
        const idx = parseInt(e.target.dataset.ruleIdx, 10);
        if (layer.config.filterRules[idx]) {
          layer.config.filterRules[idx].val = e.target.value;
          triggerUpdate();
        }
      });
    });

    configDrawer.querySelectorAll(".ipt-rule-val2").forEach((ipt) => {
      ipt.addEventListener("input", (e) => {
        const idx = parseInt(e.target.dataset.ruleIdx, 10);
        if (layer.config.filterRules[idx]) {
          layer.config.filterRules[idx].val2 = e.target.value;
          triggerUpdate();
        }
      });
    });

    configDrawer.querySelectorAll(".btn-remove-rule").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(e.currentTarget.dataset.ruleIdx, 10);
        if (layer.config.filterRules.length > 1) {
          layer.config.filterRules.splice(idx, 1);
          rerender();
        }
      });
    });
  };

  const logicSel = configDrawer.querySelector(".sel-filter-global-logic");
  if (logicSel) {
    logicSel.addEventListener("click", (e) => e.stopPropagation());
    logicSel.addEventListener("change", (e) => {
      layer.config.filterLogic = e.target.value;
      rerender();
    });
  }

  const btnAdd = configDrawer.querySelector(".btn-add-filter-rule");
  if (btnAdd) {
    btnAdd.addEventListener("click", (e) => {
      e.stopPropagation();
      layer.config.filterRules.push({ field: "none", op: ">", val: "", val2: "" });
      rerender();
    });
  }

  const btnClear = configDrawer.querySelector(".btn-clear-filter-rules");
  if (btnClear) {
    btnClear.addEventListener("click", (e) => {
      e.stopPropagation();
      layer.config.filterRules = [{ field: "none", op: ">", val: "", val2: "" }];
      layer.config.filterLogic = "AND";
      if (logicSel) logicSel.value = "AND";
      rerender();
    });
  }

  configDrawer.querySelectorAll(".btn-multi-filter-preset").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const pKey = e.currentTarget.dataset.preset;
      const presetRules = PRESETS[pKey];
      if (presetRules) {
        layer.config.filterRules = presetRules.map((r) => ({ ...r }));
        layer.config.filterLogic = "AND";
        if (logicSel) logicSel.value = "AND";
        rerender();
      }
    });
  });

  attachRuleInputListeners();
}
