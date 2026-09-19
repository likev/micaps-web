// windowTitles.js - Window title formatting with observation time and valid forecast time
import { formatObsTimestamp, formatForecastValidTime } from "../../utils/formatters.js";

export function computeFullWindowTitle(win, baseText = null) {
  if (!win) return "";
  let base = (baseText !== null && baseText !== undefined) ? baseText : win.baseTitle;
  if (!base) {
    base = win.activeGroup ? win.activeGroup.name : (win.title || "");
  }
  if (!base) return "";

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
  const fullTitle = computeFullWindowTitle(win, text);

  const el = document.getElementById(win.titleId);
  if (el) {
    el.textContent = fullTitle;
    el.title = fullTitle || "";
  }

  const labelId = win.labelId || `tab-label-${win.winIdx}`;
  const tabLabel = document.getElementById(labelId);
  if (tabLabel) {
    tabLabel.textContent = fullTitle ? `W${win.winIdx + 1}: ${fullTitle}` : `Tab ${win.winIdx + 1}`;
    tabLabel.title = fullTitle ? `W${win.winIdx + 1}: ${fullTitle}` : `Tab ${win.winIdx + 1}`;
  }
}
