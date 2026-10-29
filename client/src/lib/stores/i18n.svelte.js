// i18n.svelte.js - Reactive internationalization (en/zh) store for Svelte components
import {
  ALLOWED_LOCALES,
  LOCALE_LABELS,
  normalizeLocale,
  getGlobalLocale as coreGetGlobalLocale,
  setGlobalLocale as coreSetGlobalLocale,
  toggleGlobalLocale as coreToggleGlobalLocale,
  subscribeLocale,
  splitBilingualString,
  localizeCategory,
  localizeEntityName,
  CATEGORY_TRANSLATIONS,
  UI_STRINGS,
  BADGE_TRANSLATIONS,
  LEGEND_TITLE_TRANSLATIONS,
  translateUI,
} from "./i18nCore.js";
import { tabsState } from "./tabs.svelte.js";
import { updateWindowTitle } from "../../ui/tabs/windowTitles.js";

export {
  ALLOWED_LOCALES,
  LOCALE_LABELS,
  normalizeLocale,
  splitBilingualString,
  localizeCategory,
  localizeEntityName,
  CATEGORY_TRANSLATIONS,
  UI_STRINGS,
  BADGE_TRANSLATIONS,
  LEGEND_TITLE_TRANSLATIONS,
  translateUI,
};

let activeLocale = $state(coreGetGlobalLocale());

subscribeLocale((norm) => {
  activeLocale = norm;
  // Refresh all window titles so headers, tab labels, and target badges update immediately
  try {
    for (const tab of tabsState.tabs || []) {
      for (const win of tab.windows || []) {
        if (win && win.activeGroup) {
          win.baseTitle = localizeEntityName(win.activeGroup, norm);
        }
        if (win) {
          updateWindowTitle(win);
        }
      }
    }
  } catch {}
});

export const localeState = $state({
  get current() {
    return activeLocale;
  },
  set current(val) {
    setGlobalLocale(val);
  },
});

export function getGlobalLocale() {
  return activeLocale;
}

export function setGlobalLocale(locale) {
  coreSetGlobalLocale(locale);
}

export function toggleGlobalLocale() {
  coreToggleGlobalLocale();
}

/**
 * Reactive UI string translator for Svelte 5 templates & $derived expressions.
 * Automatically tracks `activeLocale`.
 */
export function t(key, paramsOrLocale = undefined, explicitLocale = undefined) {
  let params = undefined;
  let loc = explicitLocale;
  if (typeof paramsOrLocale === "string") {
    loc = paramsOrLocale;
  } else {
    params = paramsOrLocale;
  }
  if (!loc) {
    loc = activeLocale;
  }
  return translateUI(key, params, loc);
}
