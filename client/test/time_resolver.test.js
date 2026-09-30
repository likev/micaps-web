// time_resolver.test.js - Unit tests for Meteorological Multi-Layer Time Resolution Engine
import { describe, it, expect } from "bun:test";
import {
  parseTimestamp,
  parseTolerance,
  formatTolerance,
  parseOffset,
  formatOffset,
  formatZuluTime,
  formatFullZuluTime,
  formatAgeOffset,
  formatMicapsTimestamp,
  resolveLayerTime,
  generateCadenceSampleEntries,
  resolveAllLayersForStatus,
  DEFAULT_TOLERANCES,
} from "../src/utils/timeResolver.js";

describe("Time Resolver Engine (Part 2 of Meteorological Explorer Design)", () => {
  describe("Timestamp Parsing & Zulu Formatting", () => {
    it("parses ISO strings, Unix timestamps, and MICAPS formats", () => {
      // ISO string
      const iso = "2026-09-30T14:27:00Z";
      expect(parseTimestamp(iso)).toBe(Date.UTC(2026, 8, 30, 14, 27, 0));

      // MICAPS 14-char
      const micaps14 = "20260930142500.000";
      expect(parseTimestamp(micaps14)).toBe(Date.UTC(2026, 8, 30, 14, 25, 0));

      // MICAPS 10-char
      const micaps10 = "2026093014";
      expect(parseTimestamp(micaps10)).toBe(Date.UTC(2026, 8, 30, 14, 0, 0));

      // MICAPS 8-char YYMMDDHH
      const micaps8 = "26093014";
      expect(parseTimestamp(micaps8)).toBe(Date.UTC(2026, 8, 30, 14, 0, 0));

      // MICAPS 10-char YYMMDDHHmm
      const micaps10min = "2609301430";
      expect(parseTimestamp(micaps10min)).toBe(Date.UTC(2026, 8, 30, 14, 30, 0));

      // NWP forecast file with lead hour: 26082820.024 (cycle + 24h lead)
      const nwp8Lead = "26082820.024";
      expect(parseTimestamp(nwp8Lead)).toBe(Date.UTC(2026, 7, 28, 20, 0, 0) + 24 * 3600 * 1000);

      // NWP forecast file with 10-char cycle: 2026082820.048 (cycle + 48h lead)
      const nwp10Lead = "2026082820.048";
      expect(parseTimestamp(nwp10Lead)).toBe(Date.UTC(2026, 7, 28, 20, 0, 0) + 48 * 3600 * 1000);

      // NWP forecast cycle + period object
      expect(parseTimestamp({ cycle: "26082820", period: 24 })).toBe(Date.UTC(2026, 7, 28, 20, 0, 0) + 24 * 3600 * 1000);

      // formatMicapsTimestamp round-trip
      const testMs = Date.UTC(2026, 7, 28, 20, 30, 0);
      expect(formatMicapsTimestamp(testMs)).toBe("20260828203000.000");

      // Date object
      const d = new Date(Date.UTC(2026, 8, 30, 14, 0, 0));
      expect(parseTimestamp(d)).toBe(d.getTime());

      // Full file paths
      const pathObs = "/data/surface/20260828200000.000";
      expect(parseTimestamp(pathObs)).toBe(Date.UTC(2026, 7, 28, 20, 0, 0));

      const pathNwp = "/data/nwp/26082820.024";
      expect(parseTimestamp(pathNwp)).toBe(Date.UTC(2026, 7, 28, 20, 0, 0) + 24 * 3600 * 1000);

      // Non-numeric strings (should NOT evaluate as NaN or corrupt numbers)
      expect(parseTimestamp("ECMWF_HR")).toBeNull();
      expect(parseTimestamp("SURFACE_PLOT")).toBeNull();
      expect(parseTimestamp("UNKNOWN")).toBeNull();
    });

    it("formats Zulu times correctly per §2.3 and §2.4", () => {
      const ts = Date.UTC(2026, 8, 30, 14, 25, 0);
      expect(formatZuluTime(ts)).toBe("14:25Z");
      expect(formatFullZuluTime(ts)).toBe("2026-09-30 14:25Z");
      expect(formatZuluTime(ts, true)).toBe("09-30 14:25Z");
    });

    it("formats age offsets correctly per §2.4 (-2m, -27m, -87m)", () => {
      expect(formatAgeOffset(0)).toBe("±0m");
      expect(formatAgeOffset(-2)).toBe("−2m");
      expect(formatAgeOffset(-7)).toBe("−7m");
      expect(formatAgeOffset(-27)).toBe("−27m");
      expect(formatAgeOffset(-87)).toBe("−87m");
      expect(formatAgeOffset(-120)).toBe("−2h");
      expect(formatAgeOffset(15)).toBe("+15m");
    });
  });

  describe("Tolerance & Offset Parsing", () => {
    it("parses string tolerances into minutes", () => {
      expect(parseTolerance("10m")).toBe(10);
      expect(parseTolerance("20m")).toBe(20);
      expect(parseTolerance("90m")).toBe(90);
      expect(parseTolerance("1h")).toBe(60);
      expect(parseTolerance("3h")).toBe(180);
      expect(parseTolerance("6h")).toBe(360);
      expect(parseTolerance(15)).toBe(15);
      expect(parseTolerance("unlimited")).toBe(Infinity);
    });

    it("formats tolerances clearly", () => {
      expect(formatTolerance(10)).toBe("10m");
      expect(formatTolerance(90)).toBe("1h 30m");
      expect(formatTolerance(180)).toBe("3h");
      expect(formatTolerance(Infinity)).toBe("Unlimited");
    });

    it("parses deliberate time offsets per §2.7", () => {
      expect(parseOffset("0")).toBe(0);
      expect(parseOffset("T + 0")).toBe(0);
      expect(parseOffset("-30m")).toBe(-30);
      expect(parseOffset("T - 30m")).toBe(-30);
      expect(parseOffset("+1h")).toBe(60);
      expect(parseOffset("T + 1h")).toBe(60);
      expect(parseOffset(-45)).toBe(-45);
    });

    it("formats deliberate time offsets per §2.7", () => {
      expect(formatOffset(0)).toBe("T + 0");
      expect(formatOffset(-30)).toBe("T - 30m");
      expect(formatOffset(60)).toBe("T + 1h");
      expect(formatOffset(-90)).toBe("T - 1h 30m");
    });
  });

  describe("Matching Policies (§2.2)", () => {
    const baseTime = Date.UTC(2026, 8, 30, 14, 27, 0); // 14:27Z cursor
    // Samples at 14:00, 14:15, 14:25, 14:30, 14:45
    const sampleTimes = [
      Date.UTC(2026, 8, 30, 14, 0, 0),
      Date.UTC(2026, 8, 30, 14, 15, 0),
      Date.UTC(2026, 8, 30, 14, 25, 0),
      Date.UTC(2026, 8, 30, 14, 30, 0),
      Date.UTC(2026, 8, 30, 14, 45, 0),
    ];

    it("policy 'nearest': chooses sample with minimal absolute time delta", () => {
      // 14:27Z is closer to 14:25Z (diff 2m) than 14:30Z (diff 3m)
      const layer = {
        id: "radar",
        element: "CREF",
        policy: "nearest",
        tolerance: "10m",
        sampleTimes,
      };
      const res = resolveLayerTime(layer, baseTime);
      expect(res.actualTimeZ).toBe("14:25Z");
      expect(res.ageMinutes).toBe(-2);
      expect(res.status).toBe("current");
      expect(res.statusIcon).toBe("●");
    });

    it("policy 'latest-at' (causal): chooses most recent sample <= cursor time", () => {
      // Cursor at 14:28Z: latest <= 14:28Z is 14:25Z (not 14:30Z)
      const layer = {
        id: "metar",
        element: "SURFACE",
        policy: "latest-at",
        tolerance: "90m",
        sampleTimes,
      };
      const res = resolveLayerTime(layer, Date.UTC(2026, 8, 30, 14, 28, 0));
      expect(res.actualTimeZ).toBe("14:25Z");
      expect(res.ageMinutes).toBe(-3);
      expect(res.status).toBe("current");
    });

    it("policy 'hold': keeps sample <= cursor time and escalates from current to soft-stale and hard-stale", () => {
      // Sounding at 12:00Z with 6h tolerance
      const soundingLayer = {
        id: "sounding",
        element: "TLOGP",
        policy: "hold",
        tolerance: "6h",
        sampleTimes: [Date.UTC(2026, 8, 30, 12, 0, 0)],
      };
      // 1. Within tolerance: cursor at 16:00Z (4h later <= 6h) -> current ("Held")
      const resCurrent = resolveLayerTime(soundingLayer, Date.UTC(2026, 8, 30, 16, 0, 0));
      expect(resCurrent.actualTimeZ).toBe("12:00Z");
      expect(resCurrent.status).toBe("current");
      expect(resCurrent.statusText).toBe("Held");
      expect(resCurrent.statusIcon).toBe("●");

      // 2. Soft-stale: cursor at 20:00Z (8h later > 6h and <= 12h) -> soft-stale
      const resSoft = resolveLayerTime(soundingLayer, Date.UTC(2026, 8, 30, 20, 0, 0));
      expect(resSoft.actualTimeZ).toBe("12:00Z");
      expect(resSoft.status).toBe("soft-stale");
      expect(resSoft.statusIcon).toBe("◐");

      // 3. Hard-stale: cursor at 04:00Z next day (16h later > 12h) -> hard-stale
      const resHard = resolveLayerTime(soundingLayer, Date.UTC(2026, 8, 31, 4, 0, 0));
      expect(resHard.actualTimeZ).toBe("12:00Z");
      expect(resHard.status).toBe("hard-stale");
      expect(resHard.statusIcon).toBe("○");
    });

    it("policy 'interpolate': computes bounding pair and interpolation factor for smooth fields", () => {
      const tempLayer = {
        id: "tmp850",
        element: "TMP",
        policy: "interpolate",
        tolerance: "3h",
        sampleTimes: [
          Date.UTC(2026, 8, 30, 14, 0, 0),
          Date.UTC(2026, 8, 30, 15, 0, 0),
        ],
      };
      // Cursor at 14:30 (halfway)
      const res = resolveLayerTime(tempLayer, Date.UTC(2026, 8, 30, 14, 30, 0));
      expect(res.interpolationFactor).toBeCloseTo(0.5, 2);
    });
  });

  describe("Staleness & Age Escalation (§2.4)", () => {
    it("classifies fresh, soft-stale, and hard-stale according to tolerance", () => {
      const cursor = Date.UTC(2026, 8, 30, 14, 27, 0);

      // Layer with 10m tolerance
      const radar = {
        id: "radar",
        element: "CREF",
        tolerance: "10m",
        policy: "nearest",
      };

      // 1. Fresh (age 2 min <= 10 min) -> 'current' (●)
      radar.sampleTimes = [Date.UTC(2026, 8, 30, 14, 25, 0)];
      const res1 = resolveLayerTime(radar, cursor);
      expect(res1.status).toBe("current");
      expect(res1.statusIcon).toBe("●");
      expect(res1.isStale).toBe(false);

      // 2. Soft stale (age 15 min > 10 min, but <= 20 min) -> 'soft-stale' (◐)
      radar.sampleTimes = [Date.UTC(2026, 8, 30, 14, 12, 0)];
      const res2 = resolveLayerTime(radar, cursor);
      expect(res2.status).toBe("soft-stale");
      expect(res2.statusIcon).toBe("◐");
      expect(res2.isStale).toBe(true);
      expect(res2.isHardStale).toBe(false);

      // 3. Hard stale (age 25 min > 20 min) -> 'hard-stale' (○)
      radar.sampleTimes = [Date.UTC(2026, 8, 30, 14, 2, 0)];
      const res3 = resolveLayerTime(radar, cursor);
      expect(res3.status).toBe("hard-stale");
      expect(res3.statusIcon).toBe("○");
      expect(res3.isStale).toBe(true);
      expect(res3.isHardStale).toBe(true);
    });
  });

  describe("Deliberate Time Offset (Desync) (§2.7)", () => {
    it("marks layer as 'desync' with blue indicator when offset is non-zero", () => {
      const cursor = Date.UTC(2026, 8, 30, 14, 27, 0);
      const sampleTimes = [
        Date.UTC(2026, 8, 30, 13, 57, 0), // 30m prior to cursor
        Date.UTC(2026, 8, 30, 14, 25, 0),
      ];

      const compareRadar = {
        id: "radar_compare",
        element: "CREF",
        offset: -30, // T - 30m intentional desync
        tolerance: "10m",
        policy: "nearest",
        sampleTimes,
      };

      const res = resolveLayerTime(compareRadar, cursor);
      expect(res.actualTimeZ).toBe("13:57Z");
      expect(res.isDesync).toBe(true);
      expect(res.status).toBe("desync");
      expect(res.statusIcon).toBe("◆");
      expect(res.statusText).toContain("Desync");
    });
  });

  describe("Status Column Ranking (§2.5)", () => {
    it("sorts resolved layers by age and staleness status", () => {
      const cursor = Date.UTC(2026, 8, 30, 14, 27, 0);

      const layers = [
        {
          id: "t850",
          name: "850T mesoanal",
          element: "TMP",
          tolerance: "60m",
          sampleTimes: [Date.UTC(2026, 8, 30, 13, 0, 0)], // 87m old -> hard stale
        },
        {
          id: "radar",
          name: "Radar CREF",
          element: "CREF",
          tolerance: "10m",
          sampleTimes: [Date.UTC(2026, 8, 30, 14, 25, 0)], // 2m old -> current
        },
        {
          id: "sat",
          name: "Satellite IR",
          element: "IR",
          tolerance: "20m",
          sampleTimes: [Date.UTC(2026, 8, 30, 14, 20, 0)], // 7m old -> current
        },
        {
          id: "wind10m",
          name: "10m Wind",
          element: "WIND",
          tolerance: "20m",
          sampleTimes: [Date.UTC(2026, 8, 30, 14, 0, 0)], // 27m old -> soft stale
        },
      ];

      const resolved = resolveAllLayersForStatus(layers, cursor);
      expect(resolved.length).toBe(4);
      // Fastest answer to "is what I'm looking at real right now?":
      // Order should be: Radar (-2m, current), Satellite (-7m, current), 10m Wind (-27m, soft-stale), 850T (-87m, hard-stale)
      expect(resolved[0].layer.id).toBe("radar");
      expect(resolved[1].layer.id).toBe("sat");
      expect(resolved[2].layer.id).toBe("wind10m");
      expect(resolved[3].layer.id).toBe("t850");
    });
  });

  describe("Data Gaps in Cadence Generation (§2.3)", () => {
    it("generates sample ticks with visible data gaps", () => {
      const base = Date.UTC(2026, 8, 30, 14, 0, 0);
      // Generate 12 samples at 5-min intervals with gaps at index 4 and 5
      const samples = generateCadenceSampleEntries(base, 5, 12, [4, 5]);
      expect(samples.length).toBe(10);
      // Consecutive difference should be 5 mins except across the gap
      const diffBeforeGap = (samples[4].ts - samples[3].ts) / (60 * 1000);
      expect(diffBeforeGap).toBe(15); // 15 min gap (index 4 and 5 missing)
    });
  });
});
