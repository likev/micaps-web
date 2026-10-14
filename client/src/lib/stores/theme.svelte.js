// theme.svelte.js - Global UI theme and basemap scheme synchronization
import { mapInstances } from "./tabs.svelte.js";
import { setBasemapScheme, setMapProjection } from "../../map/mapInstance.js";
import { applyBasemapScheme } from "../../map/pmtilesLayers.js";
import { updateGraticuleScheme } from "../../map/graticule.js";
import { CURRENT_CONFIG } from "../../config/presets.js";
import { getState } from "../../layers/station/stationState.js";
import { drawStationCanvas } from "../../layers/station/stationCanvas.js";

export const ALLOWED_THEMES = ["dark", "light", "brutalism"];

export const THEME_LABELS = {
  dark: "Dark (Ink)",
  light: "Light (Paper)",
  brutalism: "Brutalism (Raw)",
};

export const PROJECTIONS = [
  { id: "mercator", label: "🗺️ Mercator (2D)" },
  { id: "globe", label: "🌐 Globe (3D)" },
  { id: "vertical-perspective", label: "🔭 Vertical Perspective" },
];

function getStoredTheme() {
  if (typeof localStorage === "undefined") return "dark";
  try {
    const s = localStorage.getItem("micaps-ui-theme") || localStorage.getItem("micaps-basemap-scheme");
    if (s && ALLOWED_THEMES.includes(s)) return s;
  } catch {}
  return "dark";
}

let activeTheme = $state(getStoredTheme());

export function getGlobalTheme() {
  return activeTheme;
}

function getMapList() {
  if (!mapInstances) return [];
  if (typeof mapInstances.entries === "function") {
    return Array.from(mapInstances.entries());
  }
  return Object.entries(mapInstances);
}

export function setGlobalTheme(theme) {
  if (!ALLOWED_THEMES.includes(theme)) return;
  activeTheme = theme;

  // 1. Update DOM data-theme attribute
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-scheme", theme);
  }

  // 2. Persist to localStorage
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("micaps-ui-theme", theme);
      localStorage.setItem("micaps-basemap-scheme", theme);
    } catch {}
  }

  // 3. Update CURRENT_CONFIG
  if (CURRENT_CONFIG) {
    CURRENT_CONFIG.theme = theme;
    if (!CURRENT_CONFIG.basemap) CURRENT_CONFIG.basemap = {};
    CURRENT_CONFIG.basemap.scheme = theme;
  }

  // 4. Synchronize all active map instances
  const entries = getMapList();
  for (const [winId, map] of entries) {
    if (map) {
      try {
        setBasemapScheme(map, theme);
      } catch {
        try {
          applyBasemapScheme(map, theme);
          updateGraticuleScheme(map, theme);
          const stState = getState(map);
          if (stState && stState.config) {
            stState.config.__themeId = theme;
            drawStationCanvas(map);
          }
        } catch (err) {
          console.warn(`[theme] Failed to apply theme to window ${winId}:`, err);
        }
      }
    }
  }

  // 5. Notify window
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent("micaps:theme-change", { detail: { theme } }));
    } catch {}
  }
}

function getStoredProjection() {
  if (typeof localStorage === "undefined") return "mercator";
  try {
    const p = localStorage.getItem("micaps-map-projection");
    if (p && ["mercator", "globe", "vertical-perspective"].includes(p)) return p;
  } catch {}
  return "mercator";
}

let activeProjection = $state(getStoredProjection());

export function getGlobalProjection() {
  return activeProjection;
}

export function setGlobalProjection(proj) {
  if (!["mercator", "globe", "vertical-perspective"].includes(proj)) return;
  activeProjection = proj;

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("micaps-map-projection", proj);
    } catch {}
  }

  if (CURRENT_CONFIG) {
    if (!CURRENT_CONFIG.basemap) CURRENT_CONFIG.basemap = {};
    CURRENT_CONFIG.basemap.projection = proj;
  }

  const entries = getMapList();
  for (const [winId, map] of entries) {
    if (map) {
      try {
        setMapProjection(map, proj);
      } catch {
        try {
          if (typeof map.setProjection === "function") {
            map.setProjection({ type: proj });
          } else {
            map.setProjection(proj);
          }
          map.__mapProjection = proj;
        } catch (err) {
          console.warn(`[theme] Failed to set projection on window ${winId}:`, err);
        }
      }
    }
  }

  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent("micaps:projection-change", { detail: { projection: proj } }));
    } catch {}
  }
}

export function initGlobalTheme() {
  const initial = getStoredTheme();
  setGlobalTheme(initial);
}
