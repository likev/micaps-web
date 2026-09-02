// paletteLoader.js - Maps met elements to palette category and loads MICAPS XML palettes

// Element name → palette folder mapping (category in client/palettes/<CATEGORY>/)
const ELEMENT_PALETTE_CATEGORY = {
  RH:    "RH",
  TMP:   "TMP",
  WIND:  "WIND",
  HGT:   "PRS_HGT",
  SLP:   "PRS_HGT",
  RAIN:  "RAIN",
  RADAR: "RADAR",
  CAPE:  "STABILITY",
  VIS:   "ENV_VIS",
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
  const up = (element || "").toUpperCase();
  return ELEMENT_PALETTE_CATEGORY[up] || null;
}

/**
 * Fetch and list all palette files in a given category directory.
 * Returns [{name: "dark-standard.xml", path: "/palettes/RH/dark-standard.xml"}]
 * Tries index.json manifest first, then directory listing HTML fallback.
 */
export async function listPaletteFiles(category) {
  if (_fileListCache[category]) return _fileListCache[category];

  // Try manifest file first (generated at build or available as JSON)
  try {
    const manifestRes = await fetch(`/palettes/${category}/index.json`);
    if (manifestRes.ok) {
      const names = await manifestRes.json();
      const files = names.map((name) => ({
        name,
        path: `/palettes/${category}/${name}`,
      }));
      _fileListCache[category] = files;
      return files;
    }
  } catch { /* fall through */ }

  // Fallback: fetch the directory listing as HTML and parse <a> links
  try {
    const res = await fetch(`/palettes/${category}/`);
    if (res.ok) {
      const html = await res.text();
      const matches = [...html.matchAll(/href="([^"?#]+\.(?:xml|pal))"/gi)];
      const files = matches
        .map((m) => m[1])
        .filter((n) => !n.startsWith("/") && !n.startsWith(".."))
        .map((name) => ({
          name: decodeURIComponent(name),
          path: `/palettes/${category}/${decodeURIComponent(name)}`,
        }));
      _fileListCache[category] = files;
      return files;
    }
  } catch { /* fall through */ }

  return [];
}

/**
 * Parse a MICAPS XML palette file into colormaps.js stop format.
 * <entry value="60.00" rgba="127,194,64,255" />
 * Returns [{val, color: [r,g,b,a]}] sorted by val, or null on failure.
 */
export async function loadXMLPalette(path) {
  if (_paletteCache[path]) return _paletteCache[path];

  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const text = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "application/xml");
    const entries = doc.querySelectorAll("entry");
    const stops = [];

    for (const entry of entries) {
      const value = parseFloat(entry.getAttribute("value"));
      const rawRgba = entry.getAttribute("rgba") || entry.getAttribute("color") || "";
      const rgba = rawRgba.split(",").map(Number);
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
