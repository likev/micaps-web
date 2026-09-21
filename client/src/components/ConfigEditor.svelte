<script>
  import { onMount, onDestroy } from "svelte";
  import { ui, showToast } from "../lib/stores/ui.svelte.js";
  import { createFormState } from "../lib/stores/formState.js";
  import { CURRENT_CONFIG, savePresetConfig, onConfigLoaded } from "../config/presets.js";
  import PresetForm from "./config/PresetForm.svelte";
  import ColormapForm from "./config/ColormapForm.svelte";
  import SettingsForm from "./config/SettingsForm.svelte";
  import JSONFallbackForm from "./config/JSONFallbackForm.svelte";
  import { focusRestore } from "../actions/focusRestore.js";

  let { onConfigSaved = null } = $props();

  let activeSubtab = $state(ui.activeConfigSubtab || "presets");
  let formState = $state(createFormState(CURRENT_CONFIG || {}));
  let isDirty = $state(false);
  let statusText = $state("Valid");
  let statusClass = $state("valid");
  let statusMsg = $state("");

  $effect(() => {
    if (ui.activeConfigSubtab && ui.activeConfigSubtab !== activeSubtab) {
      activeSubtab = ui.activeConfigSubtab;
      formState.setActiveSubTab(activeSubtab);
      updateStatus();
    }
  });

  let wasConfigOpen = $state(false);
  $effect(() => {
    if (ui.configOpen && !wasConfigOpen) {
      wasConfigOpen = true;
      if (!isDirty && CURRENT_CONFIG && CURRENT_CONFIG.presets && CURRENT_CONFIG.presets.length > 0) {
        formState.reset(CURRENT_CONFIG);
        updateStatus();
      }
    } else if (!ui.configOpen && wasConfigOpen) {
      wasConfigOpen = false;
    }
  });

  function updateStatus() {
    isDirty = formState.isDirty();
    ui.configDirty = isDirty;
    const val = formState.getValidation();
    if (!val.valid) {
      statusText = `Invalid (${val.errors.length} err)`;
      statusClass = "error";
      statusMsg = val.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
    } else if (isDirty) {
      statusText = "Modified (Unsaved)";
      statusClass = "dirty";
      statusMsg = "You have unsaved changes.";
    } else {
      statusText = "Valid (Saved)";
      statusClass = "valid";
      statusMsg = "Configuration is valid and synchronized.";
    }
  }

  function selectSubtab(tabName) {
    activeSubtab = tabName;
    ui.activeConfigSubtab = tabName;
    formState.setActiveSubTab(tabName);
    updateStatus();
  }

  async function handleSaveApply() {
    const val = formState.getValidation();
    if (!val.valid) {
      showToast("error", `Cannot save invalid configuration: ${val.errors[0]?.message}`);
      return;
    }

    const draft = formState.getDraft();
    try {
      const res = await savePresetConfig(draft);
      if (res && (res.ok || res.status === "ok")) {
        formState.markSaved();
        updateStatus();
        showToast("success", "Configuration saved and applied successfully!");
        if (onConfigSaved) onConfigSaved(draft);
      } else {
        showToast("error", `Failed to save configuration: ${res?.error || "Unknown error"}`);
      }
    } catch (err) {
      showToast("error", `Failed to save configuration: ${err.message || err}`);
    }
  }

  function handleReload() {
    if (isDirty) {
      if (!confirm("Discard unsaved changes and reload configuration?")) {
        return;
      }
    }
    formState.reset(CURRENT_CONFIG || {});
    updateStatus();
    showToast("info", "Configuration reloaded.");
  }

  function handleClose() {
    if (isDirty) {
      if (!confirm("You have unsaved changes. Discard and close editor?")) {
        return;
      }
    }
    ui.configOpen = false;
  }

  function beforeUnloadListener(e) {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  }

  let unsubConfig = null;
  onMount(() => {
    window.addEventListener("beforeunload", beforeUnloadListener);
    const unsub = formState.subscribe(() => {
      updateStatus();
    });
    unsubConfig = onConfigLoaded((cfg) => {
      if (!isDirty && cfg && cfg.presets && cfg.presets.length > 0) {
        formState.reset(cfg);
        updateStatus();
      }
    });

    if (!isDirty && CURRENT_CONFIG && CURRENT_CONFIG.presets && CURRENT_CONFIG.presets.length > 0) {
      if (!formState.getDraft()?.presets?.length) {
        formState.reset(CURRENT_CONFIG);
      }
    }
    updateStatus();
    return () => {
      window.removeEventListener("beforeunload", beforeUnloadListener);
      unsub();
      if (unsubConfig) unsubConfig();
    };
  });
</script>

{#if ui.configOpen}
  <div id="config-editor-panel" class="config-editor-panel" role="region" aria-label="Configuration Editor" use:focusRestore>
    <div class="config-editor-toolbar">
      <div class="config-editor-title-group">
        <span class="config-editor-title">⚙ Meteorological Configuration</span>
        <div class="config-subtab-bar" role="tablist">
          <button
            class="config-subtab-btn"
            class:active={activeSubtab === "presets"}
            data-tab="presets"
            role="tab"
            aria-selected={activeSubtab === "presets"}
            onclick={() => selectSubtab("presets")}
          >Presets</button>
          <button
            class="config-subtab-btn"
            class:active={activeSubtab === "colormaps"}
            data-tab="colormaps"
            role="tab"
            aria-selected={activeSubtab === "colormaps"}
            onclick={() => selectSubtab("colormaps")}
          >Colormaps</button>
          <button
            class="config-subtab-btn"
            class:active={activeSubtab === "settings"}
            data-tab="settings"
            role="tab"
            aria-selected={activeSubtab === "settings"}
            onclick={() => selectSubtab("settings")}
          >Settings</button>
          <button
            class="config-subtab-btn"
            class:active={activeSubtab === "json"}
            data-tab="json"
            role="tab"
            aria-selected={activeSubtab === "json"}
            onclick={() => selectSubtab("json")}
          >⟨⟩ JSON</button>
        </div>
        <span class="config-editor-status {statusClass}">{statusText}</span>
      </div>

      <div class="config-editor-actions">
        <button id="btn-config-reload" class="btn" title="Reload pristine configuration" onclick={handleReload}>
          ↺ Reload
        </button>
        <button id="btn-config-save-apply" class="btn btn-primary" title="Save and apply configuration changes" onclick={handleSaveApply}>
          ✓ Save & Apply
        </button>
        <button id="btn-config-close" class="btn" title="Close Configuration Editor" onclick={handleClose}>
          ✕ Close
        </button>
      </div>
    </div>

    <div id="config-editor-body" class="config-editor-body">
      {#if activeSubtab === "presets"}
        <PresetForm {formState} />
      {:else if activeSubtab === "colormaps"}
        <ColormapForm {formState} />
      {:else if activeSubtab === "settings"}
        <SettingsForm {formState} />
      {:else if activeSubtab === "json"}
        <JSONFallbackForm {formState} />
      {/if}
    </div>

    <div id="config-editor-msg" class="config-editor-msg" title={statusMsg}>
      {statusMsg}
    </div>
  </div>
{/if}

<style>
  .config-editor-panel {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #0d1117;
    display: flex;
    flex-direction: column;
    z-index: 500;
    box-sizing: border-box;
    min-width: 0;
    min-height: 0;
  }

  .config-editor-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: #161b22;
    border-bottom: 1px solid #30363d;
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 8px;
  }

  .config-editor-title-group {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .config-editor-title {
    font-size: 13px;
    font-weight: 600;
    color: #e6edf3;
  }

  .config-subtab-bar {
    display: flex;
    gap: 2px;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 2px;
  }

  .config-subtab-btn {
    background: none;
    border: none;
    color: #8b949e;
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .config-subtab-btn:hover {
    color: #e6edf3;
  }

  .config-subtab-btn.active {
    background: #21262d;
    color: #58a6ff;
    font-weight: 600;
  }

  .config-editor-status {
    font-size: 11px;
    font-family: var(--font-mono, monospace);
    padding: 2px 8px;
    border-radius: 12px;
    background: #21262d;
    color: #8b949e;
  }

  .config-editor-status.valid {
    background: rgba(46, 160, 67, 0.2);
    color: #56d364;
    border: 1px solid rgba(46, 160, 67, 0.4);
  }

  .config-editor-status.error {
    background: rgba(248, 81, 73, 0.2);
    color: #f85149;
    border: 1px solid rgba(248, 81, 73, 0.4);
  }

  .config-editor-status.dirty {
    background: rgba(210, 153, 34, 0.2);
    color: #e3b341;
    border: 1px solid rgba(210, 153, 34, 0.4);
  }

  .config-editor-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .config-editor-body {
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }

  .config-editor-msg {
    flex-shrink: 0;
    font-size: 11px;
    font-family: var(--font-mono, monospace);
    color: #8b949e;
    min-height: 18px;
    max-height: 60px;
    overflow-y: auto;
    overflow-wrap: break-word;
    padding: 4px 16px;
    background: #161b22;
    border-top: 1px solid #21262d;
  }
</style>
