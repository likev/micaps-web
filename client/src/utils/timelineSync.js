// timelineSync.js - Forecast cycle discovery and observation file timeline synchronization
import { fetchTree } from "../api/catalogApi.js";
import { setTimelineMode } from "../ui/timeSlider.js";
import { getActiveWindow } from "../ui/tabWindowManager.js";
import { DEFAULT_MOCK_OBS_FILES } from "../config/presets.js";

const forecastCyclesCache = {};

export async function resolveForecastCycles(model = "ECMWF_HR", element = "TMP", level = 500) {
  const path = `${model}/${element}/${level || 500}`;
  if (forecastCyclesCache[path]?.length) return forecastCyclesCache[path];
  try {
    const fileEntries = await fetchTree(path);
    if (Array.isArray(fileEntries) && fileEntries.length > 0) {
      const cycleSet = new Set();
      for (const f of fileEntries) {
        if (!f.name) continue;
        const parts = f.name.split(".");
        if (parts.length >= 2 && parts[0].length >= 8) {
          cycleSet.add(parts[0]);
        }
      }
      if (cycleSet.size > 0) {
        const sorted = Array.from(cycleSet).sort().reverse();
        forecastCyclesCache[path] = sorted;
        forecastCyclesCache[model] = sorted;
        return sorted;
      }
    }
  } catch (err) {
    console.warn(`[Forecast] Fetch cycles failed for ${path}:`, err);
  }

  const fallback = [
    "26082908", "26082820", "26082808", "26082720", "26082708",
    "26082620", "26082608", "26082520", "26082508", "26082420",
  ];
  return fallback;
}

export async function resolveLatestForecastCycle(model = "ECMWF_HR", element = "TMP", level = 500) {
  const cycles = await resolveForecastCycles(model, element, level);
  return cycles[0] || "26082908";
}

export async function syncObservationTimeline(path, currentFile = null, winTitle = "", win = null) {
  const isUpper = path.includes("UPPER_AIR") || winTitle.toLowerCase().includes("upper") || winTitle.toLowerCase().includes("sounding");
  const stepLength = isUpper ? 12 : 3;
  try {
    const fileEntries = await fetchTree(path);
    if (Array.isArray(fileEntries) && fileEntries.length > 0) {
      let validFiles = fileEntries.filter((f) => f.name && (f.size > 100 || f.size === 0)).map((f) => f.name);
      const hasObsFormat = validFiles.some((f) => f.length >= 14 && f.endsWith(".000"));
      validFiles = hasObsFormat ? validFiles.filter((f) => f.length >= 14 && f.endsWith(".000")) : DEFAULT_MOCK_OBS_FILES;
      if (validFiles.length > 0) {
        const recentFiles = validFiles.length >= 2 && validFiles !== DEFAULT_MOCK_OBS_FILES ? validFiles.slice(0, 10).reverse() : DEFAULT_MOCK_OBS_FILES;
        const targetFile = currentFile && recentFiles.includes(currentFile) ? currentFile : recentFiles[recentFiles.length - 1];
        if (!win || getActiveWindow() === win) setTimelineMode("obs", { file: targetFile, files: recentFiles, winTitle, stepLength, path });
        return targetFile;
      }
    }
  } catch (err) {
    console.warn("[Main] Failed to query observation file tree for timeline:", err);
  }
  const fallbackFile = currentFile || DEFAULT_MOCK_OBS_FILES[DEFAULT_MOCK_OBS_FILES.length - 1];
  if (!win || getActiveWindow() === win) setTimelineMode("obs", { file: fallbackFile, files: DEFAULT_MOCK_OBS_FILES, winTitle, stepLength, path });
  return fallbackFile;
}
