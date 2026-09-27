// paletteLoader.js - Maps met elements to palette category and loads MICAPS XML palettes
import { COLORMAPS } from "./colormaps.js";

// Element name → palette folder mapping (category in client/palettes/<CATEGORY>/)
const ELEMENT_PALETTE_CATEGORY = {
  RH: "RH",
  HUMIDITY: "RH",
  RELATIVE_HUMIDITY: "RH",

  TMP: "TMP",
  TEMP: "TMP",
  T: "TMP",
  "2T": "TMP",
  T2M: "TMP",
  TMP_MAX: "TMP",
  TMP_MIN: "TMP",
  TMAX: "TMP",
  TMIN: "TMP",
  T850: "TMP",
  T700: "TMP",
  T500: "TMP",
  TD: "TMP",
  "2D": "TMP",
  D2M: "TMP",
  DTD: "TMP",
  "T-TD": "TMP",
  "T_TD": "TMP",

  WIND: "WIND",
  UV: "WIND",
  WS: "WIND",
  WSPD: "WIND",
  "10WIND": "WIND",
  "10M_WIND": "WIND",
  VVEL: "WIND",
  W: "WIND",

  HGT: "PRS_HGT",
  GH: "PRS_HGT",
  GPH: "PRS_HGT",
  HEIGHT: "PRS_HGT",
  "500HGT": "PRS_HGT",

  SLP: "PRS_HGT",
  PRS: "PRS_HGT",
  PRMSL: "PRS_HGT",
  MSLP: "PRS_HGT",
  PS: "PRS_HGT",

  RAIN: "RAIN",
  RAIN1: "RAIN",
  RAIN01: "RAIN",
  RAIN3: "RAIN",
  RAIN03: "RAIN",
  RAIN6: "RAIN",
  RAIN06: "RAIN",
  RAIN12: "RAIN",
  RAIN24: "RAIN",
  RAIN48: "RAIN",
  RAIN_1H: "RAIN",
  RAIN_3H: "RAIN",
  RAIN_6H: "RAIN",
  RAIN_12H: "RAIN",
  RAIN_24H: "RAIN",
  RAIN_48H: "RAIN",
  APCP: "RAIN",
  TP: "RAIN",
  PRECIPITATION: "RAIN",
  PRECIP: "RAIN",
  SNOW: "RAIN",

  RADAR: "RADAR",
  REF: "RADAR",
  CREF: "RADAR",
  DBZ: "RADAR",

  CAPE: "STABILITY",
  CIN: "STABILITY",
  K: "STABILITY",
  K_INDEX: "STABILITY",
  KINDEX: "STABILITY",

  VIS: "ENV_VIS",
  VISIB: "ENV_VIS",
  VISIBILITY: "ENV_VIS",
  GRIB_VIS: "ENV_VIS",
  GRIB_VISIB: "ENV_VIS",
  AQI: "ENV_VIS",
  PM25: "ENV_VIS",
  "PM2.5": "ENV_VIS",
  PM10: "ENV_VIS",
  SO2: "ENV_VIS",
  NO2: "ENV_VIS",
  O3: "ENV_VIS",
  CO: "ENV_VIS",

  VOR: "PRS_HGT",
  RVOR: "PRS_HGT",
  AVOR: "PRS_HGT",

  DIV: "PRS_HGT",
  RDIV: "PRS_HGT",

  Q: "RH",
  SH: "RH",
  SPECIFIC_HUMIDITY: "RH",
  VAPOR: "RH",
  PWAT: "RH",
  TPW: "RH",

  QPE: "RADAR",
  VIL: "RADAR",
  KDP: "RADAR",
  ZDR: "RADAR",
};

// Cache: category → [{name, path}]
const _fileListCache = {};
// Cache: path → parsed stops array
const _paletteCache = {};

/**
 * Return the palette category folder for a given element name.
 * e.g. "RH" → "RH",  "TMP" → "TMP",  "WIND" → "WIND"
 */
export function getPaletteCategory(element) {
  if (!element) return null;
  const raw = String(element).trim().toUpperCase();
  if (ELEMENT_PALETTE_CATEGORY[raw]) return ELEMENT_PALETTE_CATEGORY[raw];

  // Try normalized alphanumeric/underscore key
  const norm = raw.replace(/[\s-]+/g, "_");
  if (ELEMENT_PALETTE_CATEGORY[norm]) return ELEMENT_PALETTE_CATEGORY[norm];

  // Pattern-based element matching
  if (raw.startsWith("RAIN") || raw.startsWith("APCP") || raw === "TP" || raw.includes("PRECIP") || raw.includes("SNOW")) {
    return "RAIN";
  }
  if (raw.startsWith("TMP") || raw.startsWith("TEMP") || raw === "T" || raw === "2T" || raw.startsWith("T2M") || raw.startsWith("TMAX") || raw.startsWith("TMIN") || /^T\d+$/.test(raw)) {
    return "TMP";
  }
  if (raw === "DTD" || raw.startsWith("T-TD") || raw.startsWith("T_TD") || raw.startsWith("T-D") || raw.startsWith("T_D") || raw === "TTD" || raw.includes("DEWPOINT_DEPRESSION") || raw.includes("露点差")) {
    return "TMP";
  }
  if (raw === "TD" || raw === "2D" || raw === "D2M" || raw.startsWith("TD") || raw === "DEWPOINT") {
    return "TMP";
  }
  if (raw.startsWith("HGT") || raw.startsWith("GH") || raw.startsWith("GPH") || raw.includes("HEIGHT")) {
    return "PRS_HGT";
  }
  if (raw.startsWith("SLP") || raw.startsWith("PRMSL") || raw.startsWith("MSLP") || raw === "PRS" || raw === "PS") {
    return "PRS_HGT";
  }
  if (raw.startsWith("VOR") || raw.includes("VORT")) {
    return "PRS_HGT";
  }
  if (raw.startsWith("DIV")) {
    return "PRS_HGT";
  }
  if (raw.startsWith("VIS") || raw.includes("VISIB")) {
    return "ENV_VIS";
  }
  if (raw.startsWith("WIND") || raw === "UV" || raw.startsWith("WSPD") || raw === "VVEL" || raw === "W") {
    return "WIND";
  }
  if (raw.startsWith("CAPE") || raw.startsWith("CIN") || raw.startsWith("K_INDEX") || raw === "K") {
    return "STABILITY";
  }
  if (raw.startsWith("RADAR") || raw === "CREF" || raw === "REF" || raw === "DBZ" || raw === "QPE" || raw === "VIL" || raw === "KDP" || raw === "ZDR") {
    return "RADAR";
  }
  if (raw.startsWith("RH") || raw === "Q" || raw === "SH" || raw.includes("HUMIDITY") || raw.includes("VAPOR") || raw === "PWAT" || raw === "TPW") {
    return "RH";
  }
  return null;
}

/**
 * Filter a list of palette files for a specific meteorological element.
 */
export function filterPalettesForElement(files, element) {
  if (!Array.isArray(files) || files.length === 0 || !element) return files;
  const el = String(element).toUpperCase().trim();

  // DTD: T-Td (dew point depression) - strictly match T-Td palettes
  const isDTD =
    el === "DTD" ||
    el === "TTD" ||
    el === "T_TD" ||
    el === "T-TD" ||
    el === "T_D" ||
    el === "T-D" ||
    el.includes("T-TD") ||
    el.includes("T_TD") ||
    el.includes("DEWPOINT_DEPRESSION") ||
    el.includes("露点差") ||
    el.includes("温度露点差");
  if (isDTD) {
    return files.filter((f) => /(?:^|[-_])t[-_]td(?:\.|$)/i.test(f.name));
  }

  // TD: dewpoint temperature (must not match DTD)
  const isTD = el === "TD" || el === "2D" || el === "D2M" || el.startsWith("TD") || el === "DEWPOINT";
  if (isTD) {
    return files.filter((f) => /(?:^|[-_])td(?:\.|$)/i.test(f.name) && !/(?:^|[-_])t[-_]td(?:\.|$)/i.test(f.name));
  }

  // TMP: general temperature variants (exclude DTD and TD)
  const isTemp =
    el.startsWith("TMP") ||
    el.startsWith("TEMP") ||
    el === "T" ||
    el === "2T" ||
    el.startsWith("T2M") ||
    el.startsWith("TMAX") ||
    el.startsWith("TMIN") ||
    /^T\d+$/.test(el);
  if (isTemp) {
    return files.filter(
      (f) =>
        (!f.path || f.path.includes("/palettes/TMP/")) &&
        !/(?:^|[-_])t[-_]td(?:\.|$)/i.test(f.name) &&
        !/(?:^|[-_])td(?:\.|$)/i.test(f.name) &&
        !/rain|snow|precip|散度|涡度|diamond120/i.test(f.name)
    );
  }

  // Rain / Precipitation / Snow - strictly exclude temperature palettes
  if (
    el.startsWith("RAIN") ||
    el.startsWith("APCP") ||
    el === "TP" ||
    el.includes("PRECIP") ||
    el.includes("SNOW")
  ) {
    return files.filter(
      (f) =>
        /rain|snow|precip|降|雪|awx-dsd|awx-snw/i.test(f.name) &&
        !/temp|气温|温度|mean/i.test(f.name)
    );
  }

  // Divergence
  if (el === "DIV" || el === "RDIV" || el === "DIVERGENCE") {
    return files.filter((f) => /div|散度/i.test(f.name));
  }

  // Vorticity
  if (el === "VOR" || el === "RVOR" || el === "AVOR" || el === "VORTICITY") {
    return files.filter((f) => /vor|涡度/i.test(f.name));
  }

  // Sea Level Pressure (SLP) / Pressure
  if (el === "SLP" || el === "PRMSL" || el === "MSLP" || el === "PRS" || el === "PS") {
    return files.filter((f) =>
      !/div|散度|vor|涡度/i.test(f.name) &&
      /prmsl|海平面气压|变压|bianya|slp|prs/i.test(f.name)
    );
  }

  // Geopotential Height (HGT)
  if (el === "HGT" || el === "GH" || el === "GPH" || el === "HEIGHT" || el.includes("500HGT")) {
    return files.filter((f) =>
      !/div|散度|vor|涡度/i.test(f.name) &&
      /high|高度|hgt|形式场/i.test(f.name)
    );
  }

  // Visibility (VIS) - strictly exclude diamond120 AQI / pollutant palettes
  if (el.startsWith("VIS") || el.includes("VISIB")) {
    return files.filter((f) =>
      /vis/i.test(f.name) &&
      !/aqi|diamond120|_pm|pm10|pm2\.5|_co|_no2|_so2|_o3/i.test(f.name)
    );
  }

  // Air quality / pollutants in ENV_VIS
  if (el === "AQI") {
    return files.filter((f) => /aqi/i.test(f.name));
  }
  if (el === "PM25" || el === "PM2.5" || el === "PM2_5") {
    return files.filter((f) => /pm2\.5/i.test(f.name));
  }
  if (el === "PM10") {
    return files.filter((f) => /pm10/i.test(f.name));
  }
  if (el === "CO") {
    return files.filter((f) => /_co\./i.test(f.name) || /diamond120_co/i.test(f.name));
  }
  if (el === "NO2") {
    return files.filter((f) => /_no2\./i.test(f.name) || /diamond120_no2/i.test(f.name));
  }
  if (el === "SO2") {
    return files.filter((f) => /_so2\./i.test(f.name) || /diamond120_so2/i.test(f.name));
  }
  if (el === "O3") {
    return files.filter((f) => /_o3/i.test(f.name) || /diamond120_o3/i.test(f.name));
  }

  // Specific humidity (Q / SH)
  if (el === "Q" || el === "SH" || el === "SPECIFIC_HUMIDITY") {
    return files.filter((f) => /比湿|specific-humidity/i.test(f.name));
  }

  // Vapor flux / content
  if (el === "VAPOR" || el === "PWAT" || el === "TPW") {
    return files.filter((f) => /水汽/i.test(f.name));
  }

  // Relative Humidity (exclude specific humidity and vapor flux)
  if (el === "RH" || el === "HUMIDITY" || el === "RELATIVE_HUMIDITY") {
    return files.filter((f) => !/比湿|specific-humidity|水汽/i.test(f.name));
  }

  // Radar specific products
  if (el === "QPE") return files.filter((f) => /qpe/i.test(f.name));
  if (el === "VIL") return files.filter((f) => /vil/i.test(f.name));
  if (el === "ET") return files.filter((f) => /et/i.test(f.name));
  if (el === "KDP") return files.filter((f) => /kdp/i.test(f.name));
  if (el === "ZDR") return files.filter((f) => /zdr/i.test(f.name));
  if (el === "REF" || el === "CREF" || el === "DBZ") {
    return files.filter((f) => /ref|dbz|反射率/i.test(f.name) && !/qpe|vil|kdp|zdr|et/i.test(f.name));
  }

  // Vertical velocity (VVEL / W)
  if (el === "VVEL" || el === "W") {
    return files.filter((f) => /垂直速度|vvel/i.test(f.name));
  }

  // Wind speed / vector (exclude vertical velocity)
  if (el === "WIND" || el === "WS" || el === "WSPD" || el === "10WIND") {
    return files.filter((f) => !/垂直速度|vvel/i.test(f.name));
  }

  // CAPE / Stability
  if (el === "CAPE" || el === "CIN") {
    return files.filter((f) => /对流有效位能|cape|duiliu/i.test(f.name) && !/k指数|k_/i.test(f.name));
  }
  if (el === "K" || el === "K_INDEX" || el === "KINDEX") {
    return files.filter((f) => /k指数|k_/i.test(f.name));
  }

  return files;
}

/**
 * Fetch file list for category directory using manifest, HTML directory, or Node/Bun filesystem.
 */
async function fetchPaletteFileList(category) {
  // 1. Try manifest file first (generated at build or available as JSON)
  try {
    const manifestRes = await fetch(`/palettes/${category}/index.json`);
    if (manifestRes.ok) {
      const names = await manifestRes.json();
      return names.map((name) => ({
        name,
        path: `/palettes/${category}/${name}`,
      }));
    }
  } catch { /* fall through */ }

  // 2. Fallback: fetch the directory listing as HTML and parse <a> links
  try {
    const res = await fetch(`/palettes/${category}/`);
    if (res.ok) {
      const html = await res.text();
      const matches = [...html.matchAll(/href="([^"?#]+\.(?:xml|pal))"/gi)];
      return matches
        .map((m) => m[1])
        .filter((n) => !n.startsWith("/") && !n.startsWith(".."))
        .map((name) => ({
          name: decodeURIComponent(name),
          path: `/palettes/${category}/${decodeURIComponent(name)}`,
        }));
    }
  } catch { /* fall through */ }

  // 3. Fallback for Node/Bun runtime / tests: read from filesystem
  if (typeof process !== "undefined") {
    try {
      const fs = await import("fs");
      const pathModule = await import("path");
      const candidates = [
        pathModule.resolve(process.cwd(), "client", "palettes", category, "index.json"),
        pathModule.resolve(process.cwd(), "palettes", category, "index.json"),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, "utf8");
          const names = JSON.parse(content);
          return names.map((name) => ({
            name,
            path: `/palettes/${category}/${name}`,
          }));
        }
      }
    } catch { /* fall through */ }
  }

  return [];
}

/**
 * Fetch and list all palette files in a given category or for an element.
 * listPaletteFiles(category, element) or listPaletteFiles(element)
 */
export async function listPaletteFiles(categoryOrElement, element = null) {
  if (!categoryOrElement && !element) return [];

  let category = categoryOrElement;
  let targetElement = element;

  if (targetElement) {
    category = getPaletteCategory(targetElement) || getPaletteCategory(categoryOrElement) || categoryOrElement;
  } else if (categoryOrElement) {
    const mapped = getPaletteCategory(categoryOrElement);
    if (mapped && mapped !== categoryOrElement.toUpperCase()) {
      category = mapped;
      targetElement = categoryOrElement;
    } else {
      category = mapped || categoryOrElement;
      targetElement = categoryOrElement;
    }
  }

  let files = _fileListCache[category];
  if (!files) {
    files = await fetchPaletteFileList(category);
    if (files && files.length > 0) {
      _fileListCache[category] = files;
    }
  }

  return filterPalettesForElement(files || [], targetElement);
}

/**
 * Parse a MICAPS XML palette file into colormaps.js stop format.
 * <entry value="60.00" rgba="127,194,64,255" />
 * Returns [{val, color: [r,g,b,a]}] sorted by val, or null on failure.
 */
export async function loadXMLPalette(path) {
  if (_paletteCache[path]) return _paletteCache[path];

  try {
    let text = null;
    try {
      const res = await fetch(path);
      if (res.ok) text = await res.text();
    } catch { /* fall through */ }

    if (!text && typeof process !== "undefined") {
      try {
        const fs = await import("fs");
        const pathModule = await import("path");
        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        const candidates = [
          pathModule.resolve(process.cwd(), cleanPath),
          pathModule.resolve(process.cwd(), "client", cleanPath),
        ];
        for (const c of candidates) {
          if (fs.existsSync(c)) {
            text = fs.readFileSync(c, "utf8");
            break;
          }
        }
      } catch {}
    }

    if (!text) return null;

    let entries = [];
    if (typeof DOMParser !== "undefined") {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "application/xml");
        const nodeList = doc.querySelectorAll("entry");
        if (nodeList && nodeList.length > 0) {
          entries = Array.from(nodeList).map((el) => ({
            value: el.getAttribute("value"),
            rgba: el.getAttribute("rgba") || el.getAttribute("color") || "",
          }));
        }
      } catch {}
    }

    if (entries.length === 0) {
      // Regex fallback for non-DOM environments or XML parsing fallback
      const re = /<entry\b[^>]*?\bvalue="([^"]+)"[^>]*?(?:rgba|color)="([^"]+)"[^>]*?>/gi;
      let m;
      while ((m = re.exec(text)) !== null) {
        entries.push({ value: m[1], rgba: m[2] });
      }
    }

    const stops = [];
    for (const entry of entries) {
      const value = parseFloat(entry.value);
      const rgba = (entry.rgba || "").split(",").map(Number);
      if (!Number.isFinite(value) || rgba.length < 3) continue;
      const color = rgba.length >= 4
        ? [rgba[0], rgba[1], rgba[2], rgba[3]]
        : [rgba[0], rgba[1], rgba[2], 255];
      if (color.some((c) => !Number.isFinite(c) || c < 0 || c > 255)) continue;
      stops.push({ val: value, color });
    }

    if (stops.length < 2) return null;
    stops.sort((a, b) => a.val - b.val);
    _paletteCache[path] = stops;

    // Also register into COLORMAPS under path and clean path
    try {
      if (COLORMAPS) {
        COLORMAPS[path] = stops;
        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        COLORMAPS[cleanPath] = stops;
      }
    } catch {}

    return stops;
  } catch {
    return null;
  }
}

/**
 * Load all XML palettes for a category eagerly.
 * Returns [{name, path, stops}] for all valid palette files.
 */
export async function loadPalettesForCategory(category) {
  const files = await listPaletteFiles(category);
  const xmlFiles = files.filter((f) => f.name.endsWith(".xml"));
  const results = await Promise.all(
    xmlFiles.map(async (f) => {
      const stops = await loadXMLPalette(f.path);
      if (!stops) return null;
      return { name: f.name, path: f.path, stops };
    })
  );
  return results.filter(Boolean);
}

/**
 * Clear internal caches (useful in tests or hot-reload).
 */
export function clearPaletteCache() {
  Object.keys(_fileListCache).forEach((k) => delete _fileListCache[k]);
  Object.keys(_paletteCache).forEach((k) => delete _paletteCache[k]);
}
