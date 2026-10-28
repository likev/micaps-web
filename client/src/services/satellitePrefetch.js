// satellitePrefetch.js - Resolves Left/Right scan times and Up/Down sibling channels for satellite layers
import { isSatelliteGroup } from "../ui/timeline/timelineMath.js";
import { swapChannelPrefix } from "../utils/fy4bChannels.js";
import { getFollowingTimeSteps } from "../lib/stores/timelineCore.js";
import { appState } from "../store/appState.js";

/**
 * Checks whether a given layer or window corresponds to satellite observations.
 */
export function isSatelliteLayer(layer, win = null) {
  if (!layer && !win) return false;
  if (layer?.model === "SATELLITE" || win?.model === "SATELLITE") return true;
  if (layer?.type === "image") return true;
  if (isSatelliteGroup(win?.activeGroup)) return true;
  if (isSatelliteGroup(layer?.path) || isSatelliteGroup(win?.activeGroup?.path)) return true;
  const p = String(layer?.path || "").toUpperCase();
  if (p.includes("SATELLITE") || p.includes("FY4") || p.includes("FY2")) return true;
  return false;
}

/**
 * Collects satellite prefetch items across time (left/right) and channel (up/down) axes.
 *
 * @param {Object} win - Window instance
 * @param {Object} layer - Satellite layer configuration
 * @param {Object} timelineSteps - Timeline steps containing current/prev/next obsFiles
 * @param {Array|Set|null} directions - Direction constraints
 * @param {Object} [options] - Additional options (e.g. lookahead, isPlaying overrides)
 * @returns {Object} { left: [], right: [], up: [], down: [], upLevel: number|null, downLevel: number|null }
 */
export function collectSatelliteItems(win, layer, timelineSteps, directions = null, options = {}) {
  const result = {
    left: [],
    right: [],
    up: [],
    down: [],
    upLevel: null,
    downLevel: null,
  };

  if (!win || !layer) return result;

  const curObsFile = timelineSteps?.obsFiles?.current ?? win?.obsTime;
  const prevObsFile = timelineSteps?.obsFiles?.prev;
  const nextObsFile = timelineSteps?.obsFiles?.next;

  const activeGroup = win.activeGroup;
  const hasLevel = Boolean(activeGroup?.hasLevel);
  const levels = Array.isArray(activeGroup?.levels) && activeGroup.levels.length > 0 ? activeGroup.levels : null;
  const defaultLevel = activeGroup?.defaultLevel ?? (levels ? levels[0] : 12);
  const curLevel = win.level ?? defaultLevel;

  const isImage = layer.type === "image";
  const rawPath = layer.path || win?.path || "SATELLITE/FY4B/L1/CHINA";
  const path = rawPath.replace(/\/C\d{3}$/i, "");

  // Parse allowed directions
  let allowed = null;
  if (directions) {
    allowed = new Set(
      (Array.isArray(directions) ? directions : Array.from(directions)).map((d) => {
        const s = String(d).trim().toLowerCase();
        if (s === "prev" || s === "left") return "left";
        if (s === "next" || s === "right") return "right";
        return s;
      })
    );
  }

  // Direction hint: for satellite, directions restricts ONLY the time axis.
  // Up and Down are always evaluated so sibling channels at current timestamp remain warm.
  const shouldFetchLeft = !allowed || allowed.has("left");
  const shouldFetchRight = !allowed || allowed.has("right");

  // 1. Time axis (Left / Right - same channel)
  if (shouldFetchLeft && prevObsFile && prevObsFile !== curObsFile) {
    if (isImage) {
      result.left.push({
        type: "sat-image",
        kind: "image",
        path,
        file: prevObsFile,
        direction: "left",
      });
    } else {
      result.left.push({
        type: "sat-grid",
        kind: "grid",
        path,
        file: prevObsFile,
        level: hasLevel ? String(curLevel) : null,
        direction: "left",
      });
    }
  }

  if (shouldFetchRight && nextObsFile && nextObsFile !== curObsFile) {
    if (isImage) {
      result.right.push({
        type: "sat-image",
        kind: "image",
        path,
        file: nextObsFile,
        direction: "right",
      });
    } else {
      result.right.push({
        type: "sat-grid",
        kind: "grid",
        path,
        file: nextObsFile,
        level: hasLevel ? String(curLevel) : null,
        direction: "right",
      });
    }

    // Playback lookahead: warm additional frames ahead during playback when stepLength <= 0.25h
    const stepLengthNum = parseFloat(win.stepLength ?? 0.25);
    const isPlaying = Boolean(options.isPlaying ?? win.isPlaying ?? appState.get("isPlaying"));
    const lookahead = Number(options.playbackLookahead ?? 2);

    if (isPlaying && stepLengthNum <= 0.25 && lookahead > 1) {
      const liveTimeline = options.liveTimeline || win._obsTimeline || timelineSteps?._state || timelineSteps;
      const following = getFollowingTimeSteps(liveTimeline, lookahead);
      // following[0] is the immediate next frame; following.slice(1) are additional look-ahead frames
      for (const nextFile of following.slice(1)) {
        if (!nextFile || nextFile === curObsFile || nextFile === nextObsFile) continue;
        if (isImage) {
          result.right.push({
            type: "sat-image",
            kind: "image",
            path,
            file: nextFile,
            direction: "right",
            lookahead: true,
          });
        } else {
          result.right.push({
            type: "sat-grid",
            kind: "grid",
            path,
            file: nextFile,
            level: hasLevel ? String(curLevel) : null,
            direction: "right",
            lookahead: true,
          });
        }
      }
    }
  }

  // 2. Channel / Level axis (Up / Down)
  // Only applicable if preset carries hasLevel: true and a valid levels list (e.g. FY-4B channels [1..15])
  if (hasLevel && levels && !isImage) {
    let idx = levels.findIndex((x) => String(x) === String(curLevel));
    if (idx === -1) {
      idx = levels.indexOf(Number(curLevel));
    }

    const upLevel = idx !== -1 && idx + 1 < levels.length ? levels[idx + 1] : null;
    const downLevel = idx !== -1 && idx - 1 >= 0 ? levels[idx - 1] : null;

    result.upLevel = upLevel;
    result.downLevel = downLevel;

    if (upLevel !== null && curObsFile) {
      const upFile = swapChannelPrefix(curObsFile, upLevel);
      if (upFile) {
        result.up.push({
          type: "sat-grid",
          kind: "grid",
          path,
          file: upFile,
          level: String(upLevel),
          direction: "up",
        });
      }
    }

    if (downLevel !== null && curObsFile) {
      const downFile = swapChannelPrefix(curObsFile, downLevel);
      if (downFile) {
        result.down.push({
          type: "sat-grid",
          kind: "grid",
          path,
          file: downFile,
          level: String(downLevel),
          direction: "down",
        });
      }
    }
  }

  return result;
}
