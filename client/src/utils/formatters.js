// formatters.js - Data, coordinate, and meteorological unit formatting helpers

export function formatDateTime(isoString) {
  if (!isoString) return "--";
  const d = new Date(isoString);
  const bjtDate = new Date(d.getTime() + 8 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${bjtDate.getUTCFullYear()}-${pad(bjtDate.getUTCMonth() + 1)}-${pad(bjtDate.getUTCDate())} ${pad(bjtDate.getUTCHours())}:00 (UTC+8)`;
}

export function formatLeadTime(hours = 0) {
  const pad = (n) => String(n).padStart(3, "0");
  return `+${pad(hours)}h`;
}

export function formatCoords(lon, lat) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

export function formatElementUnit(element = "TMP") {
  switch (element) {
    case "TMP":
    case "TD":
    case "DTD":
      return "°C";
    case "RAIN":
    case "RAIN6":
      return "mm";
    case "HGT":
      return "gpm";
    case "RH":
      return "%";
    case "WIND":
      return "m/s";
    case "SLP":
      return "hPa";
    case "VIS":
      return "km";
    default:
      return "";
  }
}

export function formatContourLabel(val, element = "", isDam = false) {
  if (typeof val !== "number" || isNaN(val)) return String(val ?? "");
  const elem = String(element || "").toUpperCase();
  if (elem === "HGT" || elem === "HEIGHT") {
    // Upper-air geopotential height in gpm (e.g. >= 1000) displayed in decameters (dam):
    // 5880 gpm -> 588, 5840 gpm -> 584, 3120 gpm -> 312, 1520 gpm -> 152
    if (!isDam && Math.abs(val) >= 1000) {
      return String(Math.round(val / 10));
    }
    return String(Math.round(val));
  }
  if (elem === "TMP" || elem === "TD" || elem === "DTD" || elem === "VIS" || elem === "RAIN6") {
    return String(Math.round(val * 10) / 10);
  }
  return String(Math.round(val));
}

export function formatObsTimestamp(fileStr = "") {
  if (!fileStr) return "--";
  const clean = fileStr.includes("/") ? fileStr.split("/").pop() : fileStr;
  if (clean.length < 10) return clean || "--";
  const y = clean.slice(0, 4);
  const m = clean.slice(4, 6);
  const d = clean.slice(6, 8);
  const h = clean.slice(8, 10);
  const min = clean.length >= 12 ? clean.slice(10, 12) : "00";

  return `${y}-${m}-${d} ${h}:${min} (UTC+8)`;
}

export function formatForecastInitTime(cycleStr = "") {
  if (!cycleStr) return "--";
  const raw = cycleStr.includes("/") ? cycleStr.split("/").pop() : cycleStr;
  const clean = raw.split(".")[0];
  if (clean.length >= 8) {
    const y = clean.length === 8 ? `20${clean.slice(0, 2)}` : clean.slice(0, 4);
    const m = clean.length === 8 ? clean.slice(2, 4) : clean.slice(4, 6);
    const d = clean.length === 8 ? clean.slice(4, 6) : clean.slice(6, 8);
    const h = clean.length === 8 ? clean.slice(6, 8) : clean.slice(8, 10);
    return `${y}-${m}-${d} ${h}:00 (UTC+8)`;
  }
  return cycleStr;
}

export function formatForecastValidTime(cycleStr = "", leadHours = 0) {
  if (!cycleStr) return `Analysis + ${leadHours}h`;
  const raw = cycleStr.includes("/") ? cycleStr.split("/").pop() : cycleStr;
  const clean = raw.split(".")[0];
  if (clean.length >= 8) {
    const y = parseInt(clean.length === 8 ? `20${clean.slice(0, 2)}` : clean.slice(0, 4), 10);
    const m = parseInt(clean.length === 8 ? clean.slice(2, 4) : clean.slice(4, 6), 10) - 1;
    const d = parseInt(clean.length === 8 ? clean.slice(4, 6) : clean.slice(6, 8), 10);
    const h = parseInt(clean.length === 8 ? clean.slice(6, 8) : clean.slice(8, 10), 10);
    const initEpoch = Date.UTC(y, m, d, h);
    const validDate = new Date(initEpoch + leadHours * 3600 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const vy = validDate.getUTCFullYear();
    const vm = pad(validDate.getUTCMonth() + 1);
    const vd = pad(validDate.getUTCDate());
    const vh = pad(validDate.getUTCHours());
    return `${vy}-${vm}-${vd} ${vh}:00 (UTC+8) (+${String(leadHours).padStart(3, "0")}h)`;
  }
  return `Analysis + ${leadHours}h`;
}

