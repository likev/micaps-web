// windowTitles.js - Window title formatting with observation time and valid forecast time
import { formatObsTimestamp, formatForecastValidTime } from "../../utils/formatters.js";
import { getActiveTab } from "./tabsStore.js";
import { DEFAULT_MODELS } from "../../lib/stores/tabsCore.js";
import { getGlobalLocale, localizeEntityName, splitBilingualString } from "../../lib/stores/i18nCore.js";

let defaultTabResolver = null;

export function setDefaultTabResolver(resolver) {
  defaultTabResolver = resolver;
}

export function computeFullWindowTitle(win, baseText = null, isModelAlloc = null) {
  if (!win) return "";
  const locale = typeof getGlobalLocale === "function" ? getGlobalLocale() : "en";
  let base = (baseText !== null && baseText !== undefined) ? baseText : null;
  if (!base) {
    base = win.activeGroup ? localizeEntityName(win.activeGroup, locale) : (win.baseTitle || win.title || "");
  }
  if (!base) return "";
  base = splitBilingualString(base, locale);
  if (win.activeGroup?.hasLevel && win.level != null && /\d+\s*hPa/i.test(base)) {
    base = base.replace(/\d+\s*hPa/i, `${win.level} hPa`);
  }

  // Strip any stale "Wn: " window prefix so drag-reorder never bakes it in.
  base = String(base).replace(/^W\d+:\s*/, "").trim();
  // Strip any existing timestamp suffix to prevent duplicate accumulation
  base = base.replace(/\s*[\(\[](Obs|Valid).*?[\)\]]$/i, "").trim();

  const isObs = Boolean(
    win.isObservation ||
    win.activeGroup?.isObservation ||
    win.model === "SURFACE" ||
    win.model === "UPPER_AIR" ||
    base.toLowerCase().includes("sounding") ||
    base.toLowerCase().includes("observation")
  );

  const tab = (typeof defaultTabResolver === "function" ? defaultTabResolver(win) : null) ||
              (typeof getActiveTab === "function" ? getActiveTab() : null);
  const effectiveModelAlloc = (isModelAlloc !== null && isModelAlloc !== undefined)
    ? Boolean(isModelAlloc)
    : Boolean(tab?.autoAllocation === "model" || win.autoAllocation === "model");

  if (effectiveModelAlloc && win.model && !isObs) {
    for (const m of DEFAULT_MODELS) {
      base = base.replace(new RegExp(`\\s*\\(${m}\\)`, "gi"), "").trim();
    }
    base = `${base} (${win.model})`;
  }
  win.baseTitle = base;

  let timeSuffix = "";
  if (isObs) {
    if (win.obsTime) {
      const formatted = formatObsTimestamp(win.obsTime);
      if (formatted && formatted !== "--") {
        timeSuffix = `[Obs: ${formatted}]`;
      }
    }
  } else {
    // NWP Forecast mode
    if (win.forecastCycle) {
      const formatted = formatForecastValidTime(win.forecastCycle, win.period ?? 0);
      if (formatted && !formatted.includes("NaN")) {
        timeSuffix = `[Valid: ${formatted}]`;
      }
    } else if (win.period !== undefined && win.period !== null && win.period !== "") {
      timeSuffix = `[Valid: +${String(win.period).padStart(3, "0")}h]`;
    }
  }

  const full = timeSuffix ? `${base} ${timeSuffix}` : base;
  win.title = full;
  return full;
}

export function updateWindowTitle(win, text = null, isModelAlloc = null) {
  if (!win || typeof document === "undefined") return;
  // State-only: pill labels (TabsBar), window headers (WindowPanel), the
  // layers badge, and the legend all derive reactively from win.title /
  // win.winIdx, including on first mount. Direct DOM writes are banned here:
  // Svelte renders pill labels with stable per-window ids
  // (`tab-label-${uid}`), while win.winIdx is positional — after any
  // drag-reorder or close, `tab-label-${win.winIdx}` addresses a DIFFERENT
  // pill, so the old imperative write corrupted other tabs' titles
  // (tab W5 vs win W1 mashups on every Load Data / time-step / reload).
  computeFullWindowTitle(win, text, isModelAlloc);
}
