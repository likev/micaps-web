// configForm.svelte.js - Svelte 5 reactive configuration form draft state
import {
  escapeHtml,
  deepClone,
  clonePresetGroup,
  cloneLayer,
  insertDivider,
  moveEntry,
  deleteDivider,
  createFormState,
} from "./formState.js";

export function createReactiveConfigForm(initialConfig = {}) {
  const core = createFormState(initialConfig);
  let draft = $state(core.getDraft());

  return {
    get draft() {
      return draft;
    },
    set draft(v) {
      draft = v;
      core.setDraft(v);
    },
    isDirty: () => core.isDirty(),
    markSaved: (text) => core.markSaved(text),
    reset: (cfg) => {
      core.reset(cfg);
      draft = core.getDraft();
    },
    core,
  };
}

export {
  escapeHtml,
  deepClone,
  clonePresetGroup,
  cloneLayer,
  insertDivider,
  moveEntry,
  deleteDivider,
  createFormState,
};
