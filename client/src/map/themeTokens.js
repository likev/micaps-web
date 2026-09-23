// themeTokens.js - Unified theme token system for map + plot styling

export const THEME_TOKENS = {
  dark: {
    id: "dark",
    name: "Ink",
    map: {
      id: "dark",
      name: "Ink",
      background: "#08090d",
      fills: {
        world: "#0c0e14",
        china: "#0e1018",
        provincesBoundary: "#10121c",
        provinces: "#10121c",
        citys: "#10121c",
        county: "#10121c",
      },
      fillOpacity: 0.85,
      boundaries: {
        world: { color: "#334155", width: 0.85, opacity: 0.50 },
        china: { color: "#475569", width: 1.2, opacity: 0.65 },
        provinces: { color: "#334155", width: 0.8, opacity: 0.50 },
        provincesDetail: { color: "#334155", width: 0.7, opacity: 0.45 },
        city: { color: "#1e293b", width: 0.5, dasharray: [4, 3], opacity: 0.35 },
        county: { color: "#1e293b", width: 0.4, dasharray: [2, 3], opacity: 0.25 },
      },
      graticule: "rgba(100, 116, 139, 0.18)",
    },
    plot: {
      halo: "rgba(0, 0, 0, 0.92)",
      haloWidth: 2.5,
      font: "'SF Mono', ui-monospace, monospace",
      tt: { color: "#ff6b6b", size: 13, weight: "700" },
      td: { color: "#69db7c", size: 13, weight: "700" },
      dtd: { color: "#ffa94d", size: 12, weight: "700" },
      ppp: { color: "#e0e0e0", size: 13, weight: "700" },
      rain: { color: "#74c0fc", size: 12, weight: "700" },
      tend: { color: "#a5d8ff", size: 11, weight: "600" },
      ww: { color: "#ffd43b", size: 15, weight: "normal" },
      vis: { color: "#ffe066", size: 12, weight: "700" },
      wind: { color: "#dee2e6" },
      sky: { bg: "rgba(8, 9, 13, 0.90)", border: "#dee2e6", fill: "#dee2e6" },
      dot: { fill: "#ffd43b", stroke: "rgba(0, 0, 0, 0.6)" },
    },
  },
  light: {
    id: "light",
    name: "Paper",
    map: {
      id: "light",
      name: "Paper",
      background: "#e8e4de",
      fills: {
        world: "#f0ece6",
        china: "#f5f2ed",
        provincesBoundary: "#f0ece6",
        provinces: "#f0ece6",
        citys: "#ebe7e1",
        county: "#ebe7e1",
      },
      fillOpacity: 1.0,
      boundaries: {
        world: { color: "#a8a29e", width: 0.85, opacity: 0.50 },
        china: { color: "#78716c", width: 1.2, opacity: 0.70 },
        provinces: { color: "#a8a29e", width: 0.75, opacity: 0.45 },
        provincesDetail: { color: "#a8a29e", width: 0.7, opacity: 0.40 },
        city: { color: "#d6d3d1", width: 0.5, dasharray: [4, 3], opacity: 0.35 },
        county: { color: "#d6d3d1", width: 0.4, dasharray: [2, 3], opacity: 0.25 },
      },
      graticule: "rgba(120, 113, 108, 0.15)",
    },
    plot: {
      halo: "rgba(255, 255, 255, 0.92)",
      haloWidth: 2.5,
      font: "'SF Mono', ui-monospace, monospace",
      tt: { color: "#c92a2a", size: 13, weight: "700" },
      td: { color: "#2b8a3e", size: 13, weight: "700" },
      dtd: { color: "#d9480f", size: 12, weight: "700" },
      ppp: { color: "#1c1c1e", size: 13, weight: "700" },
      rain: { color: "#1864ab", size: 12, weight: "700" },
      tend: { color: "#1971c2", size: 11, weight: "600" },
      ww: { color: "#e67700", size: 15, weight: "normal" },
      vis: { color: "#e67700", size: 12, weight: "700" },
      wind: { color: "#1c1c1e" },
      sky: { bg: "rgba(255, 252, 248, 0.92)", border: "#1c1c1e", fill: "#1c1c1e" },
      dot: { fill: "#e67700", stroke: "rgba(255, 255, 255, 0.5)" },
    },
  },
  micaps: {
    id: "micaps",
    name: "Slate Blue",
    map: {
      id: "micaps",
      name: "Slate Blue",
      background: "#070b14",
      fills: {
        world: "#0a1020",
        china: "#0d1426",
        provincesBoundary: "#0f162a",
        provinces: "#0f162a",
        citys: "#0f162a",
        county: "#0f162a",
      },
      fillOpacity: 0.85,
      boundaries: {
        world: { color: "#163a66", width: 0.85, opacity: 0.50 },
        china: { color: "#94a3b8", width: 1.2, opacity: 0.55 },
        provinces: { color: "#1e5088", width: 0.8, opacity: 0.40 },
        provincesDetail: { color: "#1e5088", width: 0.7, opacity: 0.35 },
        city: { color: "#163a66", width: 0.5, dasharray: [4, 3], opacity: 0.30 },
        county: { color: "#163a66", width: 0.4, dasharray: [2, 3], opacity: 0.20 },
      },
      graticule: "rgba(30, 80, 136, 0.15)",
    },
    plot: {
      halo: "rgba(7, 11, 20, 0.92)",
      haloWidth: 2.5,
      font: "'SF Mono', ui-monospace, monospace",
      tt: { color: "#ff8787", size: 13, weight: "700" },
      td: { color: "#8ce99a", size: 13, weight: "700" },
      dtd: { color: "#ffc078", size: 12, weight: "700" },
      ppp: { color: "#e0e0e0", size: 13, weight: "700" },
      rain: { color: "#a5d8ff", size: 12, weight: "700" },
      tend: { color: "#d0ebff", size: 11, weight: "600" },
      ww: { color: "#ffd43b", size: 15, weight: "normal" },
      vis: { color: "#ffe066", size: 12, weight: "700" },
      wind: { color: "#dee2e6" },
      sky: { bg: "rgba(7, 11, 20, 0.90)", border: "#dee2e6", fill: "#dee2e6" },
      dot: { fill: "#ffd43b", stroke: "rgba(7, 11, 20, 0.5)" },
    },
  },
};

export function getThemeTokens(name = "dark") {
  if (!name) return THEME_TOKENS.dark;
  const key = String(name).toLowerCase();
  return THEME_TOKENS[key] || THEME_TOKENS.dark;
}

export function getMapTokens(name = "dark") {
  return getThemeTokens(name).map;
}

export function getPlotTokens(name = "dark") {
  return getThemeTokens(name).plot;
}
