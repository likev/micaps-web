// windowTitles.js - Window title formatting with observation time and valid forecast time
import { formatObsTimestamp, formatForecastValidTime } from "../../utils/formatters.js";

export function computeFullWindowTitle(win, baseText = null) {
  if (!win) return "";
  let base = (baseText !== null && baseText !== undefined) ? baseText : win.baseTitle;
  if (!base) {
    base = win.activeGroup ? win.activeGroup.name : (win.title || "");
  }
  if (!base) return "";

  // Strip any stale "Wn: " window prefix so drag-reorder never bakes it in.
  base = String(base).replace(/^W\d+:\s*/, "").trim();
  // Strip any existing timestamp suffix to prevent duplicate accumulation
  base = base.replace(/\s*[\(\[](Obs|Valid).*?[\)\]]$/i, "").trim();
  win.baseTitle = base;

  const isObs = Boolean(
    win.isObservation ||
    win.activeGroup?.isObservation ||
    win.model === "SURFACE" ||
    win.model === "UPPER_AIR" ||
    base.toLowerCase().includes("sounding") ||
    base.toLowerCase().includes("observation")
  );

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

export function updateWindowTitle(win, text = null) {
  if (!win || typeof document === "undefined") return;
  // State-only: pill labels (TabsBar), window headers (WindowPanel), the
  // layers badge, and the legend all derive reactively from win.title /
  // win.winIdx, including on first mount. Direct DOM writes are banned here:
  // Svelte renders pill labels with stable per-window ids
  // (`tab-label-${uid}`), while win.winIdx is positional — after any
  // drag-reorder or close, `tab-label-${win.winIdx}` addresses a DIFFERENT
  // pill, so the old imperative write corrupted other tabs' titles
  // (tab W5 vs win W1 mashups on every Load Data / time-step / reload).
  computeFullWindowTitle(win, text);
}
