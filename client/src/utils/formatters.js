// formatters.js - Data, coordinate, and meteorological unit formatting helpers

export function formatDateTime(isoString) {
  if (!isoString) return "--";
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00 UTC`;
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
      return "°C";
    case "RAIN":
      return "mm";
    case "HGT":
      return "gpm";
    case "RH":
      return "%";
    case "WIND":
      return "m/s";
    default:
      return "";
  }
}

export function formatObsTimestamp(fileStr = "") {
  if (!fileStr || fileStr.length < 10) return fileStr || "--";
  const y = fileStr.slice(0, 4);
  const m = fileStr.slice(4, 6);
  const d = fileStr.slice(6, 8);
  const h = fileStr.slice(8, 10);
  const min = fileStr.length >= 12 ? fileStr.slice(10, 12) : "00";
  return `${y}-${m}-${d} ${h}:${min} UTC`;
}

