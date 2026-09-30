// multi_track_and_staleness.test.js - Unit tests for Part 2 Multi-Track Timeline, Staleness & Recipes
import { describe, it, expect } from "bun:test";
import { validateConfig } from "../src/ui/config/configSchema.js";
import {
  createTimelineState,
  setTimelineModeSetting,
  setPacemaker,
  setWallClockCursor,
  setLoopRange,
  toggleMultiTrack,
  updateLayerResolutions,
} from "../src/lib/stores/timelineCore.js";
import { applyPresetToWindow, stepWindowTimeline } from "../src/lib/services/appWorkflow.js";
import {
  resolveLayerTime,
  resolveAllLayersForStatus,
  generateCadenceSampleEntries,
} from "../src/utils/timeResolver.js";
import { buildLegendItems, updateLegend, removeLegend } from "../src/lib/stores/legendCore.js";

describe("Part 2 Implementation: Multi-Track Timeline, Staleness & Recipes", () => {
  describe("§2.8 Saved Product Recipes & Config Schema Validation", () => {
    it("accepts valid recipe with pacemaker, mode, policy, tolerance and offset", () => {
      const draft = {
        presets: [
          {
            id: "recipe-convective-nowcast",
            name: "Convective Nowcast",
            pacemaker: "radar_cref",
            mode: "live",
            layers: [
              {
                id: "radar_cref",
                model: "RADAR",
                element: "CREF",
                type: "contour",
                policy: "nearest",
                tolerance: "10m",
                offset: 0,
              },
              {
                id: "sat_ir",
                model: "SATELLITE",
                element: "IR",
                type: "contour",
                policy: "nearest",
                tolerance: "20m",
                offset: 0,
              },
              {
                id: "metar_wind",
                model: "SURFACE",
                element: "PLOT_GLOBAL_3H",
                type: "station",
                policy: "latest-at",
                tolerance: "90m",
                offset: 0,
              },
              {
                id: "mslp_anl",
                model: "SURFACE",
                element: "SLP",
                type: "contour",
                policy: "latest-at",
                tolerance: "3h",
                offset: 0,
              },
              {
                id: "t850_meso",
                model: "ECMWF_HR",
                element: "TMP",
                type: "contour",
                policy: "hold",
                tolerance: "6h",
                offset: 0,
              },
            ],
          },
        ],
      };

      const result = validateConfig(draft);
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("accepts deliberate desync offset (e.g. -30m) and review mode", () => {
      const draft = {
        presets: [
          {
            id: "recipe-radar-desync",
            name: "Radar Storm Motion Compare",
            pacemaker: "radar_curr",
            mode: "review",
            layers: [
              {
                id: "radar_curr",
                model: "RADAR",
                element: "CREF",
                type: "contour",
                policy: "nearest",
                tolerance: "10m",
                offset: 0,
              },
              {
                id: "radar_lagged",
                model: "RADAR",
                element: "CREF",
                type: "contour",
                policy: "nearest",
                tolerance: "10m",
                offset: "-30m",
              },
            ],
          },
        ],
      };

      const result = validateConfig(draft);
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("rejects invalid timeline mode and invalid matching policy", () => {
      const invalid = {
        presets: [
          {
            id: "recipe-invalid",
            name: "Invalid Recipe",
            mode: "fast-forward", // invalid mode
            layers: [
              {
                id: "l1",
                model: "RADAR",
                element: "CREF",
                type: "contour",
                policy: "magic-predict", // invalid policy
              },
            ],
          },
        ],
      };

      const result = validateConfig(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('mode must be "live" or "review"'))).toBe(true);
      expect(result.errors.some((e) => e.message.includes("policy must be one of"))).toBe(true);
    });

    it("warns if pacemaker ID does not match any layer", () => {
      const draft = {
        presets: [
          {
            id: "recipe-pacemaker-missing",
            name: "Missing Pacemaker Recipe",
            pacemaker: "non_existent_layer",
            mode: "live",
            layers: [
              {
                id: "l1",
                model: "RADAR",
                element: "CREF",
                type: "contour",
              },
            ],
          },
        ],
      };

      const result = validateConfig(draft);
      expect(result.isValid).toBe(true); // Warning only, does not block validation
      expect(result.warnings.some((w) => w.message.includes('pacemaker "non_existent_layer" does not match'))).toBe(true);
    });
  });

  describe("§2.3 & §2.6 Timeline Core: Mode, Pacemaker & DAW Tracks", () => {
    it("initializes timeline core with Part 2 defaults", () => {
      const tl = createTimelineState("win-1");
      expect(tl.timelineMode).toBe("review");
      expect(typeof tl.wallClockCursor).toBe("number");
      expect(tl.pacemakerId).toBeNull();
      expect(tl.snapToPacemaker).toBe(true);
      expect(tl.multiTrackExpanded).toBe(false);
      expect(tl.autoHideStale).toBe(false);
      expect(typeof tl.layerResolutions).toBe("object");
    });

    it("toggles between Live and Review modes", () => {
      const tl = createTimelineState("win-1");
      setTimelineModeSetting(tl, "live");
      expect(tl.timelineMode).toBe("live");

      setTimelineModeSetting(tl, "review");
      expect(tl.timelineMode).toBe("review");
    });

    it("sets pacemaker and updates cursor", () => {
      const tl = createTimelineState("win-1");
      setPacemaker(tl, "radar_cref");
      expect(tl.pacemakerId).toBe("radar_cref");

      const now = Date.now();
      setWallClockCursor(tl, now);
      expect(tl.wallClockCursor).toBe(now);
    });

    it("manages loop range and multi-track toggle", () => {
      const tl = createTimelineState("win-1");
      const start = Date.now() - 3600000;
      const end = Date.now();
      setLoopRange(tl, start, end);
      expect(tl.loopRange).toEqual({ start, end, active: true });

      toggleMultiTrack(tl);
      expect(tl.multiTrackExpanded).toBe(true);
      toggleMultiTrack(tl);
      expect(tl.multiTrackExpanded).toBe(false);
    });

    it("applies recipe pacemaker and mode to window timeline via applyPresetToWindow", () => {
      const win = { id: "win-test" };
      const group = {
        id: "recipe-nowcast",
        name: "Convective Nowcast",
        pacemaker: "radar_cref",
        mode: "live",
        isObservation: true,
        layers: [],
      };
      const timelinesMap = new Map();
      applyPresetToWindow(win, group, null, timelinesMap);

      const tl = timelinesMap.get("win-test");
      expect(tl).toBeDefined();
      expect(tl.pacemakerId).toBe("radar_cref");
      expect(tl.timelineMode).toBe("live");
    });
  });

  describe("§2.4 & §2.5 Staleness Signals & Status Panel Sorting", () => {
    it("sorts layer resolutions by age in status table", () => {
      const cursor = Date.UTC(2026, 8, 30, 14, 27, 0);
      const layers = [
        {
          id: "t850",
          name: "850T",
          file: "20260930130000.000",
          tolerance: "30m",
          policy: "hold",
        },
        {
          id: "radar",
          name: "Radar CREF",
          file: "20260930142500.000",
          tolerance: "10m",
          policy: "nearest",
        },
        {
          id: "sat",
          name: "Satellite IR",
          file: "20260930142000.000",
          tolerance: "20m",
          policy: "nearest",
        },
        {
          id: "wind",
          name: "10m Wind",
          file: "20260930140000.000",
          tolerance: "20m",
          policy: "latest-at",
        },
      ];

      const resolved = resolveAllLayersForStatus(layers, cursor);
      expect(resolved.length).toBe(4);
      // Smallest age diff first: Radar (-2m), Sat (-7m), Wind (-27m), 850T (-87m)
      expect(resolved[0].layerId).toBe("radar");
      expect(resolved[0].ageFormatted).toBe("−2m");
      expect(resolved[0].status).toBe("current");

      expect(resolved[1].layerId).toBe("sat");
      expect(resolved[1].ageFormatted).toBe("−7m");
      expect(resolved[1].status).toBe("current");

      expect(resolved[2].layerId).toBe("wind");
      expect(resolved[2].ageFormatted).toBe("−27m");
      expect(resolved[2].status).toBe("soft-stale");

      expect(resolved[3].layerId).toBe("t850");
      expect(resolved[3].ageFormatted).toBe("−87m");
      expect(resolved[3].status).toBe("hard-stale");
    });

    it("marks deliberate offset as desync with blue indicator", () => {
      const cursor = Date.UTC(2026, 8, 30, 14, 30, 0);
      const layer = {
        id: "radar_lag",
        name: "Radar (Compare -30m)",
        sampleTimes: [
          Date.UTC(2026, 8, 30, 14, 0, 0),
          Date.UTC(2026, 8, 30, 14, 30, 0),
        ],
        offset: "-30m",
        policy: "nearest",
        tolerance: "10m",
      };

      const res = resolveLayerTime(layer, cursor);
      expect(res.isDesync).toBe(true);
      expect(res.status).toBe("desync");
      expect(res.statusColor).toBe("#58a6ff"); // blue indicator
      expect(res.statusIcon).toBe("◆");
    });

    it("embeds time badge and staleness status into legend items", () => {
      const win = { id: "win-legend-test" };
      updateLegend("CREF", "RADAR", 0, 70, win, {
        resolved: {
          actualTimeZ: "14:25Z",
          ageStr: "−2m",
          status: "current",
          statusIcon: "●",
          statusText: "Current",
          isStale: false,
        },
      });
      updateLegend("TMP", "TMP", -40, 40, win, {
        resolved: {
          actualTimeZ: "13:00Z",
          ageStr: "−87m",
          status: "hard-stale",
          statusIcon: "○",
          statusText: "Stale (87m old)",
          isStale: true,
          isHardStale: true,
        },
      });

      const legendItems = buildLegendItems(win);
      expect(legendItems.length).toBe(2);

      const radarItem = legendItems.find((i) => i.element === "CREF");
      expect(radarItem).toBeDefined();
      expect(radarItem.timeBadge).toBe("14:25Z (−2m)");
      expect(radarItem.status).toBe("current");
      expect(radarItem.statusIcon).toBe("●");

      const t850Item = legendItems.find((i) => i.element === "TMP");
      expect(t850Item).toBeDefined();
      expect(t850Item.timeBadge).toBe("13:00Z (−87m)");
      expect(t850Item.status).toBe("hard-stale");
      expect(t850Item.statusIcon).toBe("○");
    });

    it("preserves separate legend items for multiple layers of same element (e.g. T+0 and T-30m)", () => {
      const win = { id: "win-multitime-legend" };
      // Layer 1: Radar T+0
      updateLegend("CREF", "RADAR", 0, 70, win, {
        layerId: "radar-t0",
        name: "Radar CREF (T+0)",
        resolved: {
          actualTimeZ: "14:30Z",
          ageStr: "±0m",
          status: "current",
          statusIcon: "●",
        },
      });
      // Layer 2: Radar T-30m
      updateLegend("CREF", "RADAR", 0, 70, win, {
        layerId: "radar-lag30",
        name: "Radar CREF (T-30m)",
        resolved: {
          actualTimeZ: "14:00Z",
          ageStr: "−30m",
          status: "desync",
          statusIcon: "◆",
          isDesync: true,
        },
      });

      const items = buildLegendItems(win);
      expect(items.length).toBe(2);
      expect(items.some((i) => i.layerId === "radar-t0" && i.resolvedTimeZ === "14:30Z")).toBe(true);
      expect(items.some((i) => i.layerId === "radar-lag30" && i.resolvedTimeZ === "14:00Z")).toBe(true);

      // Remove specific layer by layerId
      removeLegend("radar-lag30", win);
      const itemsAfterRemove = buildLegendItems(win);
      expect(itemsAfterRemove.length).toBe(1);
      expect(itemsAfterRemove[0].layerId).toBe("radar-t0");
    });
  });

  describe("§2.3 Cadence & Visible Data Gap Detection", () => {
    it("generates cadence sample entries with simulated gaps (§2.3)", () => {
      const base = Date.UTC(2026, 8, 30, 12, 0, 0);
      const cadence = 10; // 10 minutes
      const count = 12;
      const gapIndices = [3, 7];

      const entries = generateCadenceSampleEntries(base, cadence, count, gapIndices);
      // count 12 minus 2 gap indices = 10 returned samples
      expect(entries.length).toBe(10);
      expect(entries.every((e) => typeof e.ts === "number" && typeof e.file === "string")).toBe(true);

      // Verify gaps are omitted
      const sampleTimestamps = entries.map((e) => e.ts);
      const startMs = base - Math.floor(count / 2) * cadence * 60 * 1000;
      const gap3Ts = startMs + 3 * cadence * 60 * 1000;
      const gap7Ts = startMs + 7 * cadence * 60 * 1000;
      expect(sampleTimestamps.includes(gap3Ts)).toBe(false);
      expect(sampleTimestamps.includes(gap7Ts)).toBe(false);
    });
  });

  describe("§2.6 Loop Range Playback & Preset Reactivity", () => {
    it("bounds obs timeline stepping to active loop range and wraps from end to start", () => {
      const obsFiles = [
        "20260930120000.000",
        "20260930130000.000",
        "20260930140000.000",
        "20260930150000.000",
        "20260930160000.000",
      ];
      const start = Date.UTC(2026, 8, 30, 13, 0, 0); // index 1
      const end = Date.UTC(2026, 8, 30, 15, 0, 0);   // index 3

      const tl = {
        currentMode: "obs",
        obsFiles,
        currentObsIdx: 1, // at start (13:00)
        periodStepSeq: 0,
        loopRange: { start, end, active: true },
      };

      // Step forward to 14:00 (index 2)
      let res = stepWindowTimeline(tl, 1);
      expect(tl.currentObsIdx).toBe(2);
      expect(res.file).toBe("20260930140000.000");

      // Step forward to 15:00 (index 3)
      res = stepWindowTimeline(tl, 1);
      expect(tl.currentObsIdx).toBe(3);
      expect(res.file).toBe("20260930150000.000");

      // Step forward past end: should wrap to start (index 1: 13:00)
      res = stepWindowTimeline(tl, 1);
      expect(tl.currentObsIdx).toBe(1);
      expect(res.file).toBe("20260930130000.000");

      // Step backward before start: should wrap to end (index 3: 15:00)
      res = stepWindowTimeline(tl, -1);
      expect(tl.currentObsIdx).toBe(3);
      expect(res.file).toBe("20260930150000.000");
    });

    it("bounds NWP forecast stepping to active loop range", () => {
      const initCycle = "2026093000";
      const cycleTs = Date.UTC(2026, 8, 30, 0, 0, 0);
      const discretePeriods = [0, 6, 12, 18, 24, 30, 36];
      // Loop between +12h and +24h
      const start = cycleTs + 12 * 3600 * 1000;
      const end = cycleTs + 24 * 3600 * 1000;

      const tl = {
        currentMode: "nwp",
        currentInitCycle: initCycle,
        discretePeriods,
        currentPeriodIdx: 2, // period 12
        periodStepSeq: 0,
        loopRange: { start, end, active: true },
      };

      // Step forward to 18 (index 3)
      let res = stepWindowTimeline(tl, 1);
      expect(tl.currentPeriodIdx).toBe(3);
      expect(res.period).toBe(18);

      // Step forward to 24 (index 4)
      res = stepWindowTimeline(tl, 1);
      expect(tl.currentPeriodIdx).toBe(4);
      expect(res.period).toBe(24);

      // Step forward past 24: wraps back to 12 (index 2)
      res = stepWindowTimeline(tl, 1);
      expect(tl.currentPeriodIdx).toBe(2);
      expect(res.period).toBe(12);
    });

    it("resets pacemakerId and timelineMode when switching to a preset without explicit mode or pacemaker", () => {
      const win = { id: "win-reset-test" };
      const groupA = {
        id: "recipe-nowcast",
        pacemaker: "radar-pacer",
        mode: "live",
        layers: [{ id: "radar-pacer" }],
      };
      const timelinesMap = new Map();
      applyPresetToWindow(win, groupA, null, timelinesMap);

      const tl = timelinesMap.get("win-reset-test");
      expect(tl.pacemakerId).toBe("radar-pacer");
      expect(tl.timelineMode).toBe("live");

      // Now switch to standard preset without pacemaker or mode
      const groupB = {
        id: "preset-standard",
        layers: [{ id: "first-layer" }, { id: "second-layer" }],
      };
      applyPresetToWindow(win, groupB, null, timelinesMap);
      expect(tl.pacemakerId).toBe("first-layer");
      expect(tl.timelineMode).toBe("review");
    });

    it("renders legend item safely when item.name is undefined without TDZ error", () => {
      const win = { id: "win-legend-tdz" };
      updateLegend("TMP", "TMP", -20, 20, win, {
        layerId: "contour-tmp-simple",
        // name is intentionally omitted
        resolved: {
          actualTimeZ: "14:00Z",
          ageStr: "±0m",
          status: "current",
        },
      });

      const items = buildLegendItems(win);
      expect(items.length).toBe(1);
      expect(items[0].element).toBe("TMP");
      expect(items[0].displayTitle).toContain("TMP");
    });

    it("evaluates staleness for NWP weather loader layer and attaches resolved metadata", async () => {
      const { loadWeatherField } = await import("../src/services/weatherLoader.js");
      const { getLayerById } = await import("../src/lib/stores/layersCore.js");
      const win = {
        id: "win-nwp-stale-test",
        forecastCycle: "2026082800",
        period: 24,
        wallClockCursor: Date.UTC(2026, 7, 30, 0, 0, 0), // 24h past valid time (Aug 29 00Z)
      };

      const map = {
        getSource: () => null,
        addSource: () => {},
        getLayer: () => null,
        addLayer: () => {},
        on: () => {},
        off: () => {},
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        return {
          ok: true,
          json: async () => ({
            header: { n_lon: 10, n_lat: 10, start_lon: 60, end_lon: 140, start_lat: 10, end_lat: 60 },
            values: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 20)),
            stats: { min: 10, max: 30 },
          }),
        };
      };

      try {
        await loadWeatherField(map, "ECMWF_HR", "TMP", 500, 24, {
          id: "contour-ecmwf-tmp-stale",
          tolerance: "6h",
          showFill: true,
          showLine: true,
        }, win, false);

        const layer = getLayerById("contour-ecmwf-tmp-stale", win);
        expect(layer).toBeDefined();
        expect(layer.resolved).toBeDefined();
        // Cursor is 24h past valid time, tolerance is 6h -> age is 24h > 2 * 6h -> hard-stale
        expect(layer.resolved.isHardStale).toBe(true);
        expect(layer.resolved.status).toBe("hard-stale");
        expect(layer.isHardStale).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
