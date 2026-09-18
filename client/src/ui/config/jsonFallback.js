// jsonFallback.js - Advanced raw-JSON textarea editor fallback rewired to draft
import { formatCompactJSON } from "../../config/presets.js";

/**
 * Mounts the raw JSON fallback editor into container.
 * @param {HTMLElement} container
 * @param {Object} formState
 * @returns {Function} unmount function
 */
export function mountJSONFallback(container, formState) {
  if (!container || !formState) return () => {};

  container.innerHTML = `
    <div class="config-json-wrapper">
      <div class="config-json-toolbar">
        <span class="config-json-hint">Direct JSON mode. Changes synchronize across all visual sub-tabs.</span>
        <button id="btn-config-json-format" class="btn" title="Auto-format and indent JSON">⚡ Format JSON</button>
      </div>
      <textarea id="config-json-textarea" class="config-editor-textarea" spellcheck="false" placeholder="Loading JSON..."></textarea>
      <div class="config-json-errors" id="config-json-error-bar"></div>
    </div>
  `;

  const textarea = container.querySelector("#config-json-textarea");
  const btnFormat = container.querySelector("#btn-config-json-format");
  const errorBar = container.querySelector("#config-json-error-bar");

  // Initial sync from draft
  textarea.value = formatCompactJSON(formState.getDraft());

  function syncToDraft() {
    try {
      const parsed = JSON.parse(textarea.value);
      errorBar.textContent = "";
      errorBar.className = "config-json-errors";
      formState.setDraft(parsed);
      return true;
    } catch (err) {
      errorBar.textContent = `JSON Syntax Error: ${err.message}`;
      errorBar.className = "config-json-errors visible error";
      return false;
    }
  }

  textarea.addEventListener("input", () => {
    syncToDraft();
  });

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, start) + "  " + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      syncToDraft();
    }
  });

  if (btnFormat) {
    btnFormat.addEventListener("click", () => {
      try {
        const parsed = JSON.parse(textarea.value);
        textarea.value = formatCompactJSON(parsed);
        syncToDraft();
      } catch (err) {
        errorBar.textContent = `Cannot format: ${err.message}`;
        errorBar.className = "config-json-errors visible error";
      }
    });
  }

  // Sync to draft when unmounting or switching tabs
  return () => {
    syncToDraft();
    container.innerHTML = "";
  };
}
