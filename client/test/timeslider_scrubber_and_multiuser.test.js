import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import {
  getObsStepOptions,
  formatStepLabel,
  isRadarOrHighCadenceGroup,
  filterObsFilesByStep,
  filterObsFilesByRangeWindow,
  shouldUseObsTimeSlider,
} from "../src/ui/timeline/timelineMath.js";
import {
  createTimelineState,
  syncSliderObsFiles,
  getAdjacentTimeSteps,
  getFollowingTimeSteps,
} from "../src/lib/stores/timelineCore.js";
import { stepWindowTimeline } from "../src/lib/services/appWorkflow.js";
import {
  sanitizeUserId,
  getActiveUserId,
  setActiveUserId,
  appendUserQueryParam,
  getUserRequestHeaders,
  fetchUserProfiles,
  createNewUserProfile,
  deleteExistingUserProfile,
  resetActiveUserConfig,
  userProfileState,
} from "../src/lib/stores/userProfileCore.js";
import { loadColormaps, loadPresetGroups, savePresetConfig } from "../src/config/presets.js";
import {
  getPinnedPresetIds,
  getRecentPresetIds,
  togglePinPreset,
  addRecentPreset,
  syncFavoritesForUser,
} from "../src/lib/stores/presetFavoritesCore.js";

function makeScanSeries(startMs, count, intervalMin) {
  const files = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(startMs + i * intervalMin * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const name =
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
      `${pad(d.getHours())}${pad(d.getMinutes())}00.000`;
    files.push(name);
  }
  return files;
}

describe("High-cadence scrubbable observation time slider", () => {
  it("provides sub-hourly step options for FY-4B, Radar/SWAN, and 1-10min Surface", () => {
    const satSteps = getObsStepOptions({ isSatellite: true });
    expect(satSteps[0]).toBe(0.25);

    const radarSteps = getObsStepOptions({ isHighCadence: true, path: "RADAR_MOSAIC/CR" });
    expect(radarSteps).toContain(0.1);
    expect(radarSteps).toContain(0.25);
    expect(radarSteps).toContain(0.5);

    const fastSurface = getObsStepOptions({ path: "SURFACE/PLOT_10MIN" });
    expect(fastSurface[0]).toBeCloseTo(1 / 6, 6);
    expect(isRadarOrHighCadenceGroup({ id: "radar_cr", name: "Radar Mosaic" })).toBe(true);
    expect(isRadarOrHighCadenceGroup({ id: "surface_3h", name: "Surface Plot" })).toBe(false);

    expect(formatStepLabel(0.1)).toBe("6min");
    expect(formatStepLabel(1 / 6)).toBe("10min");
    expect(formatStepLabel(0.25)).toBe("15min");

    expect(getObsStepOptions({})).toEqual([1, 3, 6, 12, 24]);
    expect(getObsStepOptions({ isUpper: true })).toEqual([12, 24, 6]);
  });

  it("auto-switches to slider for sub-hourly steps or >10 chips and keeps chips for >=1h", () => {
    expect(shouldUseObsTimeSlider({ isObs: false, stepLength: 0.1 })).toBe(false);
    expect(shouldUseObsTimeSlider({ isObs: true, stepLength: 0.1, chipCount: 40 })).toBe(true);
    expect(shouldUseObsTimeSlider({ isObs: true, stepLength: 0.25, chipCount: 24 })).toBe(true);
    expect(shouldUseObsTimeSlider({ isObs: true, stepLength: 3, chipCount: 10 })).toBe(false);
    expect(shouldUseObsTimeSlider({ isObs: true, stepLength: 1, chipCount: 8 })).toBe(false);
    expect(shouldUseObsTimeSlider({ isObs: true, stepLength: 3, chipCount: 8, obsViewMode: "slider" })).toBe(true);
    expect(shouldUseObsTimeSlider({ isObs: true, stepLength: 0.1, chipCount: 60, obsViewMode: "chips" })).toBe(false);
  });

  it("filters 6-min radar and 15-min FY-4B scans across 3h, 6h, 24h, and All windows", () => {
    const startMs = new Date(2026, 6, 15, 0, 0, 0).getTime();
    // 10 hours of 6-minute scans = 101 files
    const radarRaw = makeScanSeries(startMs, 101, 6);
    const filtered6m = filterObsFilesByStep(radarRaw, 0.1, false);
    expect(filtered6m.length).toBe(101);

    const win3h = filterObsFilesByRangeWindow(filtered6m, 3);
    const win6h = filterObsFilesByRangeWindow(filtered6m, 6);
    const win24h = filterObsFilesByRangeWindow(filtered6m, 24);
    const winAll = filterObsFilesByRangeWindow(filtered6m, 0);

    expect(win3h.length).toBe(31);
    expect(win6h.length).toBe(61);
    expect(win24h.length).toBe(101);
    expect(winAll.length).toBe(101);
  });

  it("steps and prefetches across all >10 slider frames while keeping 10-chip window synchronized", () => {
    const startMs = new Date(2026, 6, 15, 0, 0, 0).getTime();
    const raw = makeScanSeries(startMs, 61, 6); // 6h at 6-min intervals = 61 scans
    const tl = createTimelineState();
    tl.currentMode = "obs";
    tl.currentStepLength = 0.1;
    tl.obsRangeHours = 6;
    tl.rawObsFiles = [...raw];
    tl.obsFiles = raw.slice(-10);
    tl.currentObsIdx = 9;

    syncSliderObsFiles(tl, raw, raw[25]);
    expect(tl.sliderObsFiles.length).toBe(61);
    expect(tl.currentSliderObsIdx).toBe(25);

    // Step backwards well beyond the 10-chip boundary
    const stepped = stepWindowTimeline(tl, -1);
    expect(stepped?.file).toBe(raw[24]);
    expect(tl.currentSliderObsIdx).toBe(24);
    expect(tl.obsFiles.includes(raw[24])).toBe(true);

    // Adjacent & following prefetch helpers read from sliderObsFiles in slider mode
    const adj = getAdjacentTimeSteps(tl);
    expect(adj.obsFiles.prev).toBe(raw[23]);
    expect(adj.obsFiles.current).toBe(raw[24]);
    expect(adj.obsFiles.next).toBe(raw[25]);

    const follow = getFollowingTimeSteps(tl, 3);
    expect(follow).toEqual([raw[25], raw[26], raw[27]]);

    // A-B loop constrained within slider indices 20..26
    tl.loopRange = { active: true, start: 20, end: 26 };
    tl.currentSliderObsIdx = 26;
    const wrapped = stepWindowTimeline(tl, 1);
    expect(wrapped?.file).toBe(raw[20]);
    expect(tl.currentSliderObsIdx).toBe(20);
  });
});

describe("Multi-user workstation profile & configuration store", () => {
  let originalFetch;
  let storageMap;
  let origLocalStorage;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    origLocalStorage = globalThis.localStorage;
    storageMap = new Map();
    globalThis.localStorage = {
      getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
      setItem: (k, v) => storageMap.set(k, String(v)),
      removeItem: (k) => storageMap.delete(k),
      clear: () => storageMap.clear(),
    };
    setActiveUserId("default");
    syncFavoritesForUser("default");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = origLocalStorage;
  });

  it("sanitizes user IDs and builds X-Micaps-User headers and ?user= query params", () => {
    expect(sanitizeUserId("")).toBe("default");
    expect(sanitizeUserId("DEFAULT")).toBe("default");
    expect(sanitizeUserId("Forecaster_01")).toBe("forecaster_01");
    expect(sanitizeUserId("../bad", true)).toBe(null);

    expect(appendUserQueryParam("/api/config")).toBe("/api/config");
    expect(getUserRequestHeaders({ Accept: "application/json" })).toEqual({ Accept: "application/json" });

    setActiveUserId("alice", "Forecaster Alice");
    expect(getActiveUserId()).toBe("alice");
    expect(appendUserQueryParam("/api/config")).toBe("/api/config?user=alice");
    expect(appendUserQueryParam("/api/config?_t=1")).toBe("/api/config?_t=1&user=alice");
    expect(getUserRequestHeaders()).toEqual({ "X-Micaps-User": "alice" });
  });

  it("propagates user headers in loadColormaps, loadPresetGroups, savePresetConfig, and tracks source provenance", async () => {
    const calls = [];
    globalThis.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), opts });
      if (String(url).startsWith("/api/colormaps")) {
        return {
          ok: true,
          headers: new Map([["X-Micaps-Config-Source", "system"]]),
          json: async () => ({}),
        };
      }
      if (String(url).startsWith("/api/config") && (!opts.method || opts.method === "GET")) {
        return {
          ok: true,
          headers: new Map([["X-Micaps-Config-Source", "user"]]),
          json: async () => ({
            presets: [{ id: "g1", name: "Group 1", layers: [{ name: "T2M", path: "SURFACE/T2M" }] }],
          }),
        };
      }
      return {
        ok: true,
        headers: new Map([["X-Micaps-Config-Source", "user"]]),
        json: async () => ({ status: "ok", source: "user" }),
      };
    };

    setActiveUserId("alice", "Alice");
    await loadColormaps();
    await loadPresetGroups();
    expect(userProfileState.colormapsSource).toBe("system");
    expect(userProfileState.configSource).toBe("user");

    await savePresetConfig({ presets: [] });
    const postCall = calls.find((c) => c.opts?.method === "POST" && c.url.includes("/api/config"));
    expect(postCall).toBeTruthy();
    expect(postCall.opts.headers["X-Micaps-User"]).toBe("alice");
    expect(postCall.url).toContain("user=alice");
  });

  it("isolates pinned and recent favorites per user profile", () => {
    setActiveUserId("alice");
    syncFavoritesForUser("alice");
    togglePinPreset("fy4b_ir");
    addRecentPreset("radar_cr");
    expect(getPinnedPresetIds()).toContain("fy4b_ir");

    setActiveUserId("bob");
    syncFavoritesForUser("bob");
    expect(getPinnedPresetIds()).not.toContain("fy4b_ir");
    expect(getRecentPresetIds()).toEqual([]);

    setActiveUserId("alice");
    syncFavoritesForUser("alice");
    expect(getPinnedPresetIds()).toContain("fy4b_ir");
    expect(getRecentPresetIds()).toContain("radar_cr");
  });

  it("handles fetchUserProfiles, createNewUserProfile, resetActiveUserConfig, and deleteExistingUserProfile", async () => {
    const requests = [];
    let usersList = [{ id: "default", name: "System Default", isDefault: true }];
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      requests.push({ url: u, method: opts.method || "GET", headers: opts.headers || {} });
      if (u.startsWith("/api/users") && (!opts.method || opts.method === "GET")) {
        return { ok: true, json: async () => ({ status: "ok", users: usersList }) };
      }
      if (u.startsWith("/api/users") && opts.method === "POST") {
        const body = JSON.parse(opts.body);
        const created = { id: body.id, name: body.name, hasCustomConfig: true };
        usersList = [...usersList, created];
        return { ok: true, json: async () => ({ status: "ok", user: created }) };
      }
      if (u.startsWith("/api/config/reset") && opts.method === "POST") {
        usersList = usersList.map((x) => (x.id === "carol" ? { ...x, hasCustomConfig: false, hasCustomColormaps: false } : x));
        return { ok: true, json: async () => ({ status: "ok" }) };
      }
      if (u.startsWith("/api/users") && opts.method === "DELETE") {
        usersList = usersList.filter((x) => x.id !== "carol");
        return { ok: true, json: async () => ({ status: "ok", deleted: "carol" }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };

    const list = await fetchUserProfiles();
    expect(list.length).toBe(1);

    const created = await createNewUserProfile({ id: "carol", name: "Carol", cloneFrom: "default" });
    expect(created.id).toBe("carol");
    expect(userProfileState.users.some((u) => u.id === "carol")).toBe(true);

    setActiveUserId("carol");
    await resetActiveUserConfig("all");
    expect(userProfileState.configSource).toBe("system");

    await deleteExistingUserProfile("carol");
    expect(getActiveUserId()).toBe("default");
    expect(requests.some((r) => r.method === "DELETE" && r.url.includes("user=carol"))).toBe(true);
  });

  it("keeps new and modified Svelte/UI files under the 600-line limit", () => {
    const filesToCheck = [
      path.resolve(import.meta.dir, "../src/components/ConfigEditor.svelte"),
      path.resolve(import.meta.dir, "../src/components/UserProfileSwitcher.svelte"),
      path.resolve(import.meta.dir, "../src/components/timeline/ObsTimeScrubber.svelte"),
    ];
    for (const filePath of filesToCheck) {
      const lines = fs.readFileSync(filePath, "utf8").split("\n").length;
      expect(lines).toBeLessThan(600);
    }
  });
});
