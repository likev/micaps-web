<script>
  import { ensureLayerFilterRules } from "../ui/stationFilterControl.js";
  import { getViewAutoCheckPatch } from "../layers/station/stationFilter.js";
  import { isUpperAirStationLayer, getStationDatasetType } from "../ui/layers/layerDefaults.js";
  import { getGlobalLocale } from "../lib/stores/i18n.svelte.js";

  let { layer, onFilterChange = null } = $props();

  let currentLocale = $derived(getGlobalLocale());
  let currentLayerId = $state(null);
  let rules = $state([]);
  let logic = $state("AND");

  const PRESETS = {
    hgt_5880: [{ field: "Height", op: ">=", val: "5880" }],
    hgt_5520: [{ field: "Height", op: "<=", val: "5520" }],
    wind_20: [{ field: "Wind", op: ">=", val: "20" }],
    wind_12: [{ field: "Wind", op: ">=", val: "12" }],
    tt_m20: [{ field: "TT", op: "<=", val: "-20" }],
    wind5_rain10_tt10_30: [
      { field: "Wind", op: ">", val: "5" },
      { field: "Rain", op: ">", val: "10" },
      { field: "TT", op: "between", val: "10", val2: "30" },
    ],
    wind5_rain10: [
      { field: "Wind", op: ">", val: "5" },
      { field: "Rain", op: ">", val: "10" },
    ],
    tt_10_30: [{ field: "TT", op: "between", val: "10", val2: "30" }],
    tt_gt30: [{ field: "TT", op: ">", val: "30" }],
    tt_lt10: [{ field: "TT", op: "<", val: "10" }],
    wind_gt5: [{ field: "Wind", op: ">", val: "5" }],
    rain_gt10: [{ field: "Rain", op: ">", val: "10" }],
    rain6_gt10: [{ field: "Rain6", op: ">", val: "10" }],
    vis_lt1: [{ field: "Visibility", op: "<", val: "1" }],
  };

  function syncRulesFromLayer(targetLayer) {
    if (!targetLayer) return;
    ensureLayerFilterRules(targetLayer);
    currentLayerId = targetLayer.id;
    rules = (targetLayer.config?.filterRules || [{ field: "none", op: ">", val: "", val2: "" }]).map((r, i) => ({
      ...r,
      _id: r._id || `rule-${targetLayer.id || "default"}-${i}`,
    }));
    logic = targetLayer.config?.filterLogic || "VIEW";
  }

  $effect(() => {
    if (layer && layer.id !== currentLayerId) {
      syncRulesFromLayer(layer);
    }
  });

  let stationType = $derived(getStationDatasetType(layer));
  let upper = $derived(stationType === "upper_air" || isUpperAirStationLayer(layer));

  function update() {
    layer.config.filterRules = rules.map(({ field, op, val, val2 }) => ({ field, op, val, val2 }));
    layer.config.filterLogic = logic;
    // ViewOnly: a new rule auto-checks its element's display toggle so the
    // rule has a visible effect (e.g. vis<1km enables Visibility). Only
    // transitions off->on, never unchecks, and only complete rules trigger.
    const autoChecked = getViewAutoCheckPatch(layer.config);
    Object.assign(layer.config, autoChecked);
    if (onFilterChange) {
      onFilterChange({ filterRules: layer.config.filterRules, filterLogic: logic, ...autoChecked });
    }
  }

  function addRule() {
    rules = [...rules, { field: "none", op: ">", val: "", val2: "", _id: `rule-${Date.now()}-${rules.length}` }];
    update();
  }

  function removeRule(idx) {
    if (rules.length <= 1) {
      rules[0] = { field: "none", op: ">", val: "", val2: "", _id: `rule-${Date.now()}-0` };
    } else {
      rules = rules.filter((_, ruleIdx) => ruleIdx !== idx);
    }
    update();
  }

  function clearRules() {
    rules = [{ field: "none", op: ">", val: "", val2: "", _id: `rule-${Date.now()}-0` }];
    update();
  }

  function applyPreset(key) {
    const preset = PRESETS[key];
    if (!preset) return;
    const incoming = preset.map((rule, idx) => ({ ...rule, _id: `rule-${Date.now()}-${idx}` }));
    // Presets ADD rules instead of clearing existing ones (dedupe exact
    // matches so double-clicks don't stack identical rows). A lone empty
    // placeholder row is replaced rather than kept.
    const hasReal = rules.some((r) => r.field && r.field !== "none");
    const base = hasReal ? rules : [];
    const isDup = (r) => base.some((b) => b.field === r.field && b.op === r.op && String(b.val ?? "") === String(r.val ?? "") && String(b.val2 ?? "") === String(r.val2 ?? ""));
    rules = [...base, ...incoming.filter((r) => !isDup(r))];
    if (rules.length === 0) rules = incoming;
    // Keep the current match mode (see update): presets gate per-element
    // under ViewOnly, whole stations under AND/OR.
    update();
  }

  let quickPresets = $derived(upper ? [
    ["hgt_5880", "Height≥5880"],
    ["wind_20", "Wind≥20 m/s"],
    ["tt_m20", "TT≤−20°C"],
    ["hgt_5520", "Height≤5520"],
    ["wind_12", "Wind≥12 m/s"],
  ] : [
    ["wind5_rain10_tt10_30", "Wind>5 & Rain>10 & TT 10..30"],
    ["wind5_rain10", "Wind>5 & Rain>10"],
    ["tt_10_30", "TT 10..30"],
    ["tt_gt30", "TT>30"],
    ["tt_lt10", "TT<10"],
    ["wind_gt5", "Wind>5"],
    ["rain_gt10", "Rain>10"],
    ["rain6_gt10", "Rain6>10"],
    ["vis_lt1", "Vis<1 km"],
  ]);
</script>

<div class="config-filter-section">
  <div class="filter-header">
    <span class="filter-title">Data Filter Rules</span>
    <div class="filter-match">
      <span>Match:</span>
      <select
        class="sel-filter-global-logic"
        bind:value={logic}
        onchange={update}
        title="ViewOnly: each rule hides only its own element (others still show). AND/OR/Rule-1 hide whole stations."
      >
        <option value="VIEW">ViewOnly (per-element)</option>
        <option value="AND">ALL (AND)</option>
        <option value="OR">ANY (OR)</option>
        <option value="none">Rule 1 Only</option>
      </select>
    </div>
  </div>

  {#if logic === "VIEW"}
    <div class="filter-hint">ViewOnly: a rule hides only its own element (e.g. Wind&gt;5 hides just the barb); elements without rules always show.</div>
  {/if}

  <div class="filter-rules-list">
    {#each rules as rule, idx (rule._id || idx)}
      <div class="filter-rule-row" class:hidden={logic === "none" && idx > 0} data-rule-idx={idx}>
        <span class="rule-index">#{idx + 1}</span>
        <select
          class="sel-filter-field"
          bind:value={rule.field}
          onchange={update}
        >
          <option value="none">{currentLocale === "zh" ? "无过滤" : "No Filter"}</option>
          {#if stationType === "snow_depth"}
            <option value="SnowDepth">{currentLocale === "zh" ? "积雪深度" : "Snow Depth"}</option>
          {:else if stationType === "pres_change_3h"}
            <option value="PressDiff3h">{currentLocale === "zh" ? "3小时变压" : "3h Pressure Change"}</option>
          {:else if stationType === "pres_change_24h"}
            <option value="PressDiff24h">{currentLocale === "zh" ? "24小时变压" : "24h Pressure Change"}</option>
          {:else if stationType === "visibility"}
            <option value="Visibility">{currentLocale === "zh" ? "能见度" : "Visibility"}</option>
          {:else if stationType === "amv"}
            <option value="Wind">{currentLocale === "zh" ? "风速" : "Wind Speed"}</option>
          {:else if upper}
            <option value="Height">{currentLocale === "zh" ? "位势高度" : "Height"}</option>
            <option value="TT">{currentLocale === "zh" ? "温度" : "Temperature"}</option>
            <option value="Td">{currentLocale === "zh" ? "露点" : "Dewpoint"}</option>
            <option value="DTD">{currentLocale === "zh" ? "温度露点差" : "T-Td"}</option>
            <option value="Wind">{currentLocale === "zh" ? "风速" : "Wind Speed"}</option>
          {:else}
            <option value="TT">{currentLocale === "zh" ? "气温" : "Temperature"}</option>
            <option value="Td">{currentLocale === "zh" ? "露点" : "Dewpoint"}</option>
            <option value="SLP">{currentLocale === "zh" ? "气压" : "Sea-Level Pressure"}</option>
            <option value="Wind">{currentLocale === "zh" ? "风速" : "Wind Speed"}</option>
            <option value="Rain">{currentLocale === "zh" ? "1小时降水" : "Rain 1h"}</option>
            <option value="Rain6">{currentLocale === "zh" ? "6小时降水" : "Rain 6h"}</option>
            <option value="DTD">{currentLocale === "zh" ? "露点差" : "T-Td"}</option>
            <option value="Visibility">{currentLocale === "zh" ? "能见度" : "Visibility"}</option>
          {/if}
        </select>

        {#if rule.field !== "none"}
          <select
            class="sel-filter-op"
            bind:value={rule.op}
            onchange={update}
          >
            <option value=">">&gt;</option>
            <option value=">=">&gt;=</option>
            <option value="<">&lt;</option>
            <option value="<=">&lt;=</option>
            <option value="=">=</option>
            <option value="!=">!=</option>
            <option value="between">between</option>
          </select>

          <input
            type="number"
            class="input-filter-val"
            placeholder="Val"
            bind:value={rule.val}
            oninput={update}
          />

          {#if rule.op === "between"}
            <span>~</span>
            <input
              type="number"
              class="input-filter-val2"
              placeholder="Max"
              bind:value={rule.val2}
              oninput={update}
            />
          {/if}
        {/if}

        <button
          type="button"
          class="btn-remove-rule"
          title="Remove Rule"
          onclick={() => removeRule(idx)}
        >✕</button>
      </div>
    {/each}
  </div>

  <div class="filter-actions">
    <button type="button" class="btn-add-rule" onclick={addRule}>＋ Add Rule</button>
    <button type="button" class="btn-clear-rules" onclick={clearRules}>Clear All</button>
  </div>

  <div class="config-quick-presets" aria-label="Quick station filter presets">
    {#each quickPresets as [key, label]}
      <button type="button" class="btn-filter-preset" onclick={() => applyPreset(key)}>{label}</button>
    {/each}
  </div>
</div>

<style>
  .config-filter-section {
    margin-top: 8px;
    border-top: 1px solid var(--border-color, rgba(48, 54, 61, 0.6));
    padding-top: 6px;
  }

  .filter-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .filter-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary, #8b949e);
  }

  .filter-match {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: var(--text-secondary, #8b949e);
  }

  .filter-hint {
    font-size: 10px;
    color: var(--text-secondary, #8b949e);
    margin: 0 0 6px 0;
    line-height: 1.4;
  }

  .sel-filter-global-logic {
    background: var(--bg-card, #161b22);
    color: var(--accent-blue, #58a6ff);
    font-weight: bold;
    border: 1px solid var(--accent-blue, #388bfd);
    border-radius: 4px;
    font-size: 10px;
    padding: 1px 4px;
  }

  .filter-rules-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .filter-rule-row {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    min-width: 0;
  }

  .filter-rule-row.hidden {
    display: none;
  }

  .rule-index {
    width: 18px;
    color: var(--text-secondary, #8b949e);
    font-size: 10px;
    flex-shrink: 0;
  }

  .sel-filter-field,
  .sel-filter-op {
    background: var(--bg-card, #161b22);
    color: var(--text-primary, #e6edf3);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 4px;
    font-size: 10px;
    padding: 2px 4px;
    min-width: 0;
  }

  .sel-filter-field option,
  .sel-filter-op option,
  .sel-filter-global-logic option {
    background: var(--bg-card, #21262d);
    color: var(--text-primary, #e6edf3);
  }

  /* The field select carries the longest option text — let it shrink so the
     inputs and the remove-rule button are never pushed out of view. */
  .sel-filter-field {
    flex: 1 1 auto;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sel-filter-op {
    flex-shrink: 0;
  }

  .input-filter-val,
  .input-filter-val2 {
    width: 44px;
    flex-shrink: 0;
    background: var(--bg-card, #161b22);
    color: var(--text-primary, #e6edf3);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 4px;
    font-size: 10px;
    padding: 2px 4px;
  }

  .input-filter-val::placeholder,
  .input-filter-val2::placeholder {
    color: var(--text-secondary, #8b949e);
    opacity: 0.8;
  }

  .btn-remove-rule {
    background: transparent;
    border: none;
    color: var(--text-secondary, #8b949e);
    cursor: pointer;
    font-size: 11px;
    padding: 2px 4px;
    flex-shrink: 0;
  }

  .btn-remove-rule:hover {
    color: var(--accent-red, #f85149);
  }

  .filter-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 6px;
  }

  .config-quick-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }

  .btn-filter-preset {
    padding: 2px 6px;
    background: var(--bg-card, #21262d);
    border: 1px solid var(--accent-blue, #388bfd);
    border-radius: 3px;
    color: var(--accent-blue, #58a6ff);
    font-size: 10px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .btn-filter-preset:hover {
    background: color-mix(in srgb, var(--accent-blue, #388bfd) 18%, transparent);
  }

  .btn-add-rule,
  .btn-clear-rules {
    background: var(--bg-card, #21262d);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    color: var(--text-primary, #e6edf3);
    border-radius: 4px;
    font-size: 10px;
    padding: 2px 8px;
    cursor: pointer;
  }

  .btn-add-rule:hover,
  .btn-clear-rules:hover {
    background: var(--bg-hover, #30363d);
  }
</style>
