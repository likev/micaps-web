<script>
  import { onMount, onDestroy } from "svelte";
  import { formatCompactJSON } from "../../config/presets.js";

  let { formState } = $props();

  let text = $state("");
  let errorMsg = $state("");
  let textareaEl = null;

  function initFromDraft() {
    try {
      text = formatCompactJSON(formState.getDraft());
      errorMsg = "";
    } catch (e) {
      errorMsg = `Error serializing config: ${e.message}`;
    }
  }

  initFromDraft();

  const unsub = formState.subscribe(() => {
    // Only resync if the draft changed externally and not from our own parse
    try {
      const currentDraft = formState.getDraft();
      const currentParsed = JSON.parse(text);
      if (JSON.stringify(currentDraft) !== JSON.stringify(currentParsed)) {
        text = formatCompactJSON(currentDraft);
      }
    } catch {
      // Invalid JSON currently in text, do not overwrite while user is typing
    }
  });

  onDestroy(() => {
    unsub();
    syncToDraft();
  });

  function syncToDraft() {
    try {
      const parsed = JSON.parse(text);
      errorMsg = "";
      formState.setDraft(parsed);
      return true;
    } catch (err) {
      errorMsg = `JSON Syntax Error: ${err.message}`;
      return false;
    }
  }

  function handleInput() {
    syncToDraft();
  }

  function handleKeydown(e) {
    if (e.key === "Tab") {
      e.preventDefault();
      if (!textareaEl) return;
      const start = textareaEl.selectionStart;
      const end = textareaEl.selectionEnd;
      text = text.substring(0, start) + "  " + text.substring(end);
      setTimeout(() => {
        if (textareaEl) {
          textareaEl.selectionStart = textareaEl.selectionEnd = start + 2;
        }
      }, 0);
      syncToDraft();
    }
  }

  function handleFormat() {
    try {
      const parsed = JSON.parse(text);
      text = formatCompactJSON(parsed);
      errorMsg = "";
      formState.setDraft(parsed);
    } catch (err) {
      errorMsg = `Cannot format: ${err.message}`;
    }
  }
</script>

<div class="config-json-wrapper">
  <div class="config-json-toolbar">
    <span class="config-json-hint">Direct JSON mode. Changes synchronize across all visual sub-tabs.</span>
    <button
      id="btn-config-json-format"
      type="button"
      class="btn"
      title="Auto-format and indent JSON"
      onclick={handleFormat}
    >⚡ Format JSON</button>
  </div>
  <textarea
    id="config-json-textarea"
    class="config-editor-textarea"
    spellcheck="false"
    placeholder="Loading JSON..."
    bind:this={textareaEl}
    bind:value={text}
    oninput={handleInput}
    onkeydown={handleKeydown}
  ></textarea>
  <div
    id="config-json-error-bar"
    class="config-json-errors"
    class:visible={Boolean(errorMsg)}
    class:error={Boolean(errorMsg)}
  >
    {errorMsg}
  </div>
</div>

<style>
  .config-json-wrapper {
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
    min-height: 0;
    padding: 16px;
    gap: 12px;
    background: var(--bg-primary, #0d1117);
  }

  .config-json-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
  }

  .config-json-hint {
    font-size: 12px;
    color: var(--text-secondary, #8b949e);
  }

  .config-editor-textarea {
    flex: 1;
    min-height: 0;
    width: 100%;
    background: var(--bg-secondary, #161b22);
    color: var(--text-primary, #e6edf3);
    border: 1px solid var(--border-color, #30363d);
    border-radius: 6px;
    padding: 12px;
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    line-height: 1.5;
    resize: none;
    outline: none;
    box-sizing: border-box;
  }

  .config-editor-textarea:focus {
    border-color: var(--accent-blue, #58a6ff);
  }

  .config-json-errors {
    display: none;
    font-size: 12px;
    padding: 8px 12px;
    border-radius: 6px;
    flex-shrink: 0;
  }

  .config-json-errors.visible {
    display: block;
  }

  .config-json-errors.error {
    background: rgba(248, 81, 73, 0.15);
    color: #f85149;
    border: 1px solid rgba(248, 81, 73, 0.4);
  }
</style>
