import { describe, test, expect, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getObsTreeLimit,
  stepBackwardByInterval,
  filterObsFilesByStep,
  selectObsChipsWindow,
  formatStepLabel,
  MAX_OBS_CHIPS,
} from "../../src/ui/timeline/timelineMath.js";
import {
  setTimelineMode,
  setStepLength,
  getTimelineObsFiles,
  getRawObsFiles,
  getCurrentTimelineObsFile,
  timelineState,
  updateLabels,
  initTimeSlider,
} from "../../src/ui/timeSlider.js";

const clientDir = resolve(__dirname, "../..");
function readSrc(relPath) {
  return readFileSync(resolve(clientDir, "src", relPath), "utf8");
}

function generateSatelliteFiles(startDate, numFiles, intervalMinutes = 15) {
  const files = [];
  const startMs = Date.parse(startDate);
  for (let i = 0; i < numFiles; i++) {
    const d = new Date(startMs + i * intervalMinutes * 60 * 1000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const h = String(d.getUTCHours()).padStart(2, "0");
    const min = String(d.getUTCMinutes()).padStart(2, "0");
    files.push(`C012_${y}${m}${day}${h}${min}00_FY4B.AWX`);
  }
  return files;
}

describe("Issue 14: Step Chips and Latest Chip Visibility", () => {
  describe("Part A: getObsTreeLimit catalog limits", () => {
    test("returns 1000 for satellite paths", () => {
      expect(getObsTreeLimit("SATELLITE/FY4B/L1/CHINA/C012")).toBe(1000);
      expect(getObsTreeLimit("SATELLITE/FY2G/L2/IR1")).toBe(1000);
      expect(getObsTreeLimit("FY4A/AGRI")).toBe(1000);
      expect(getObsTreeLimit("satellite/fy4b/l1/disk")).toBe(1000);
    });

    test("returns 1000 for radar and high-cadence surface/profiler products", () => {
      expect(getObsTreeLimit("SWAN_PRODUCT/2D_CREF")).toBe(1000);
      expect(getObsTreeLimit("RADAR/MOSAIC_3D")).toBe(1000);
      expect(getObsTreeLimit("SURFACE/PLOT_10MIN")).toBe(1000);
      expect(getObsTreeLimit("SURFACE/PLOT_5MIN")).toBe(1000);
      expect(getObsTreeLimit("SURFACE/PLOT_1MIN")).toBe(1000);
      expect(getObsTreeLimit("WIND_PROFILER/WIND")).toBe(1000);
      expect(getObsTreeLimit("SURFACE/LIGHTNING_10MIN")).toBe(1000);
    });

    test("returns 300 for 1-hour products", () => {
      expect(getObsTreeLimit("CLDAS/PRECIP_1H")).toBe(300);
      expect(getObsTreeLimit("SURFACE/PLOT_ALL")).toBe(300);
      expect(getObsTreeLimit("SURFACE/AWS_1H")).toBe(300);
    });

    test("returns 100 default for standard synoptic observation products", () => {
      expect(getObsTreeLimit("UPPER_AIR/PLOT/500")).toBe(100);
      expect(getObsTreeLimit("SURFACE/PLOT_GLOBAL_3H")).toBe(100);
      expect(getObsTreeLimit("ECMWF_HR/TMP/500")).toBe(100);
      expect(getObsTreeLimit("")).toBe(100);
      expect(getObsTreeLimit(null)).toBe(100);
    });
  });

  describe("Part A: stepBackwardByInterval", () => {
    test("returns empty array for empty inputs", () => {
      expect(stepBackwardByInterval([], 24)).toEqual([]);
      expect(stepBackwardByInterval(null, 12)).toEqual([]);
    });

    test("anchors interval backward from latest candidate file", () => {
      const files = [
        "20261026000000.000",
        "20261026060000.000",
        "20261026120000.000",
        "20261026180000.000",
        "20261027000000.000",
        "20261027060000.000",
        "20261027120000.000",
        "20261027180000.000",
        "20261027210000.000", // Newest file: 21:00
      ];

      const stepped12 = stepBackwardByInterval(files, 12);
      expect(stepped12[stepped12.length - 1]).toBe("20261027210000.000"); // Latest file is preserved!
      expect(stepped12).toContain("20261027060000.000");
      expect(stepped12).toContain("20261026180000.000");
      expect(stepped12).toContain("20261026060000.000");
    });

    test("correctly handles non-hourly / sub-hourly radar scans", () => {
      // Radar files every 6 minutes: 00:06, 00:12, ..., 01:00
      const radarFiles = [
        "RADAR_20261027000600.RAW",
        "RADAR_20261027001200.RAW",
        "RADAR_20261027001800.RAW",
        "RADAR_20261027002400.RAW",
        "RADAR_20261027003000.RAW",
        "RADAR_20261027003600.RAW",
        "RADAR_20261027004200.RAW",
        "RADAR_20261027004800.RAW",
        "RADAR_20261027005400.RAW",
        "RADAR_20261027010000.RAW",
      ];
      const stepped = stepBackwardByInterval(radarFiles, 0.5); // 30 min step
      expect(stepped[stepped.length - 1]).toBe("RADAR_20261027010000.RAW");
      expect(stepped).toContain("RADAR_20261027003000.RAW");
    });
  });

  describe("Part A: filterObsFilesByStep with satellite multi-day and short-span data", () => {
    test("10-day satellite dataset (960 files @ 15min) yields full 10 chips for step=12h and step=24h", () => {
      const files = generateSatelliteFiles("2026-10-18T00:00:00Z", 960, 15);
      expect(files.length).toBe(960);

      // step = 12h: should yield 20 standard files (00:00 and 12:00)
      const filtered12 = filterObsFilesByStep(files, 12);
      expect(filtered12.length).toBe(20);
      const chips12 = selectObsChipsWindow(filtered12);
      expect(chips12.length).toBe(MAX_OBS_CHIPS);
      chips12.forEach((f) => {
        const h = parseInt(f.slice(13, 15), 10);
        expect([0, 12]).toContain(h);
      });

      // step = 24h: should yield 10 standard midnight files (00:00)
      const filtered24 = filterObsFilesByStep(files, 24);
      expect(filtered24.length).toBe(10);
      const chips24 = selectObsChipsWindow(filtered24);
      expect(chips24.length).toBe(MAX_OBS_CHIPS);
      chips24.forEach((f) => {
        const h = parseInt(f.slice(13, 15), 10);
        expect(h).toBe(0);
      });
    });

    test("short-span 24h dataset (21:00 to 21:00 next day) yields 2 chips at step=24h ending at latest scan", () => {
      // 24 hours of 15-minute scans from 2026-10-26 21:00 to 2026-10-27 21:00 (97 files)
      const files = generateSatelliteFiles("2026-10-26T21:00:00Z", 97, 15);
      const latestFile = files[files.length - 1];
      expect(latestFile).toContain("20261027210000");

      const filtered24 = filterObsFilesByStep(files, 24);
      // Standard midnight only has 1 file (20261027000000); fallback backward interval yields 2 files!
      expect(filtered24.length).toBe(2);
      expect(filtered24[filtered24.length - 1]).toBe(latestFile);
      expect(filtered24[0]).toBe(files[0]);
    });

    test("radar dataset without exact :00 scans steps back from newest file at step=12h", () => {
      // Radar files every 15 min at :05, :20, :35, :50
      const radarFiles = [];
      const startMs = Date.parse("2026-10-26T00:05:00Z");
      for (let i = 0; i < 96; i++) {
        const d = new Date(startMs + i * 15 * 60 * 1000);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        const h = String(d.getUTCHours()).padStart(2, "0");
        const min = String(d.getUTCMinutes()).padStart(2, "0");
        radarFiles.push(`RADAR_${y}${m}${day}${h}${min}00.RAW`);
      }
      const filtered12 = filterObsFilesByStep(radarFiles, 12);
      expect(filtered12.length).toBeGreaterThanOrEqual(2);
      expect(filtered12[filtered12.length - 1]).toBe(radarFiles[radarFiles.length - 1]);
    });
  });

  describe("Part B: Step change preserves and displays latest chip", () => {
    test("switching from step=3h to step=15min (0.25) anchors to latest window and selects latest chip", () => {
      // 1 full day of 15-minute satellite scans: 00:00 to 23:45 (96 files)
      const files = generateSatelliteFiles("2026-10-27T00:00:00Z", 96, 15);
      const latestScan = files[files.length - 1]; // 23:45

      // 1. Initialize timeline in obs mode at step = 3h
      setTimelineMode("obs", {
        files,
        stepLength: 3,
        path: "SATELLITE/FY4B/L1/CHINA/C012",
        winTitle: "FY-4B TrueColor",
      });

      const initialChips = getTimelineObsFiles();
      // At step = 3h: [00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00]
      expect(initialChips.length).toBe(8);
      // Current active file is the latest 3h file (21:00), index = 7
      expect(getCurrentTimelineObsFile()).toContain("20261027210000");

      // 2. Switch step length to 15min (0.25)
      setStepLength(0.25);

      const newChips = getTimelineObsFiles();
      expect(newChips.length).toBe(MAX_OBS_CHIPS);
      // The rightmost chip MUST be the latest scan 23:45
      expect(newChips[newChips.length - 1]).toBe(latestScan);
      // The active file MUST be the latest scan 23:45 because wasAtLatest was true
      expect(getCurrentTimelineObsFile()).toBe(latestScan);
    });

    test("switching step preserves previous target file when targetFile is within latest window", () => {
      // 1 full day of 15-minute satellite scans: 00:00 to 23:45 (96 files)
      const files = generateSatelliteFiles("2026-10-27T00:00:00Z", 96, 15);

      // Initialize at step = 0.25 (15 min)
      setTimelineMode("obs", {
        files,
        stepLength: 0.25,
        file: "C012_20261027220000_FY4B.AWX",
        path: "SATELLITE/FY4B/L1/CHINA/C012",
      });

      // Target file is 22:00 (not the latest 23:45)
      expect(getCurrentTimelineObsFile()).toBe("C012_20261027220000_FY4B.AWX");

      // Switch step to 1h
      setStepLength(1);

      const chips1h = getTimelineObsFiles();
      // 1h files for this day: 00:00..23:00 (24 files). Latest 10 chips: 14:00..23:00.
      expect(chips1h.length).toBe(MAX_OBS_CHIPS);
      expect(chips1h[chips1h.length - 1]).toContain("20261027230000");
      // 22:00 is within 14:00..23:00, so target file position 22:00 MUST be preserved!
      expect(getCurrentTimelineObsFile()).toBe("C012_20261027220000_FY4B.AWX");
    });

    test("switching step advances to latest chip when previous file falls outside latest window", () => {
      // 1 full day of 15-minute satellite scans: 00:00 to 23:45 (96 files)
      const files = generateSatelliteFiles("2026-10-27T00:00:00Z", 96, 15);

      // Initialize at step = 0.25 with early morning file (03:00)
      setTimelineMode("obs", {
        files,
        stepLength: 0.25,
        file: "C012_20261027030000_FY4B.AWX",
        path: "SATELLITE/FY4B/L1/CHINA/C012",
      });

      expect(getCurrentTimelineObsFile()).toBe("C012_20261027030000_FY4B.AWX");

      // Switch step to 1h (latest 10 chips are 14:00..23:00; 03:00 is NOT in it)
      setStepLength(1);

      const chips1h = getTimelineObsFiles();
      expect(chips1h.length).toBe(MAX_OBS_CHIPS);
      expect(chips1h[chips1h.length - 1]).toContain("20261027230000");
      // Because 03:00 is outside latest 10 chips, currentObsIdx advances to latest chip!
      expect(getCurrentTimelineObsFile()).toContain("20261027230000");
    });
  });

  describe("Part C: Source Code Verification", () => {
    test("TimeSlider.svelte anchors step-change chips to selectObsChipsWindow(allFiltered)", () => {
      const timeSliderSrc = readSrc("components/TimeSlider.svelte");
      expect(timeSliderSrc).toContain("const wasAtLatest = obsFiles.length === 0 || tl.currentObsIdx >= obsFiles.length - 1;");
      expect(timeSliderSrc).toContain("tl.obsFiles = selectObsChipsWindow(allFiltered);");
      expect(timeSliderSrc).toContain("const newIdx = (!wasAtLatest && targetFile) ? tl.obsFiles.indexOf(targetFile) : -1;");
      expect(timeSliderSrc).toContain("tl.currentObsIdx = newIdx !== -1 ? newIdx : Math.max(0, tl.obsFiles.length - 1);");
    });

    test("timeSliderView.js anchors step-change chips to selectObsChipsWindow(allFiltered)", () => {
      const timeSliderViewSrc = readSrc("ui/timeline/timeSliderView.js");
      expect(timeSliderViewSrc).toContain("const wasAtLatest = timelineState.obsFiles.length === 0 || timelineState.currentObsIdx >= timelineState.obsFiles.length - 1;");
      expect(timeSliderViewSrc).toContain("timelineState.obsFiles = selectObsChipsWindow(allFiltered);");
      expect(timeSliderViewSrc).toContain("const newIdx = (!wasAtLatest && targetFile) ? timelineState.obsFiles.indexOf(targetFile) : -1;");
      expect(timeSliderViewSrc).toContain("timelineState.currentObsIdx = newIdx !== -1 ? newIdx : Math.max(0, timelineState.obsFiles.length - 1);");
    });

    test("timelineSync.js passes getObsTreeLimit into fetchTree and slices by treeLimit", () => {
      const timelineSyncSrc = readSrc("utils/timelineSync.js");
      expect(timelineSyncSrc).toContain("const treeLimit = getObsTreeLimit(path);");
      expect(timelineSyncSrc).toContain("await fetchTree(path, treeLimit, treeOpts);");
      expect(timelineSyncSrc).toContain("chronologicalFiles.slice(-treeLimit)");
    });

    test("weatherLoader.js passes getObsTreeLimit into fetchTree", () => {
      const weatherLoaderSrc = readSrc("services/weatherLoader.js");
      expect(weatherLoaderSrc).toContain("const treeLimit = getObsTreeLimit(dataPath);");
      expect(weatherLoaderSrc).toContain("await fetchTree(dataPath, treeLimit, targetLevel);");
    });

    test("presetLoader.js passes getObsTreeLimit into fetchTree", () => {
      const presetLoaderSrc = readSrc("services/presetLoader.js");
      expect(presetLoaderSrc).toContain("await fetchTree(obsPath, getObsTreeLimit(obsPath));");
      expect(presetLoaderSrc).toContain("await fetchTree(tlogpPath, getObsTreeLimit(tlogpPath));");
    });

    test("timeSliderView.js parses step length as float in select-step-length onchange", () => {
      const timeSliderViewSrc = readSrc("ui/timeline/timeSliderView.js");
      expect(timeSliderViewSrc).toContain("const newStep = parseFloat(e.target.value)");
      expect(timeSliderViewSrc).toContain("formatStepLabel(timelineState.currentStepLength)");
    });
  });

  describe("Part D: DOM Interaction and Label Formatting for Fractional Steps", () => {
    test("DOM select-step-length change handler parses 0.25 as 15min and does not truncate to 6", () => {
      const selStep = {
        id: "select-step-length",
        options: [{ value: "0.25" }, { value: "1" }, { value: "3" }, { value: "6" }],
        value: "3",
        onchange: null,
        innerHTML: "",
        appendChild(child) {
          if (Array.isArray(this.options)) this.options.push(child);
        },
      };

      const prevDoc = globalThis.document;
      globalThis.document = {
        getElementById(id) {
          if (id === "select-step-length") return selStep;
          if (id === "select-init-time" || id === "select-playback-speed") return { options: [], value: "" };
          if (id === "time-slider-chips" || id === "timeslider-container") {
            return {
              innerHTML: "",
              appendChild() {},
              classList: { toggle() {}, add() {}, remove() {} },
            };
          }
          if (id === "time-badge" || id === "time-lead-wrapper" || id === "time-valid-label" || id === "time-win-badge" || id === "time-init-wrapper") {
            return { textContent: "", style: {}, innerHTML: "" };
          }
          if (id === "btn-play" || id === "btn-prev" || id === "btn-next") {
            return {
              disabled: false,
              setAttribute() {},
              removeAttribute() {},
              classList: { add() {}, remove() {}, toggle() {} },
            };
          }
          return null;
        },
        createElement() {
          return { value: "", textContent: "", setAttribute() {}, addEventListener() {}, classList: { add() {} } };
        },
      };

      try {
        const files = generateSatelliteFiles("2026-10-27T00:00:00Z", 96, 15);
        setTimelineMode("obs", {
          files,
          stepLength: 3,
          path: "SATELLITE/FY4B/L1/CHINA/C012",
        });

        // Initialize DOM listeners
        initTimeSlider();
        expect(typeof selStep.onchange).toBe("function");

        // Simulate user selecting 15min ("0.25") in select element
        selStep.onchange({ target: { value: "0.25" } });

        // Step length must be 0.25, NOT truncated to 6!
        expect(timelineState.currentStepLength).toBe(0.25);
        const chips = getTimelineObsFiles();
        expect(chips.length).toBe(MAX_OBS_CHIPS);
        expect(chips[chips.length - 1]).toBe(files[files.length - 1]);
      } finally {
        globalThis.document = prevDoc;
      }
    });

    test("updateLabels formats 15min correctly for fractional satellite step in #time-valid-label", () => {
      const validLabel = { textContent: "" };
      const leadWrapper = { innerHTML: "" };
      const badge = { textContent: "", className: "" };

      const prevDoc = globalThis.document;
      globalThis.document = {
        getElementById(id) {
          if (id === "time-valid-label") return validLabel;
          if (id === "time-lead-wrapper") return leadWrapper;
          if (id === "time-badge") return badge;
          return null;
        },
      };

      try {
        timelineState.currentMode = "obs";
        timelineState.currentStepLength = 0.25;
        timelineState.obsFiles = ["C012_20261027234500_FY4B.AWX"];
        timelineState.currentObsIdx = 0;

        updateLabels();
        expect(validLabel.textContent).toBe("Real-time Observation (Step: 15min)");
      } finally {
        globalThis.document = prevDoc;
      }
    });

    test("Edge cases: empty arrays and boundary inputs for stepping and filtering", () => {
      expect(filterObsFilesByStep([], 12)).toEqual([]);
      expect(filterObsFilesByStep(null, 12)).toEqual([]);
      expect(stepBackwardByInterval([], 12)).toEqual([]);
      expect(stepBackwardByInterval(null, 12)).toEqual([]);

      // Single file input
      const single = ["20261027120000.000"];
      expect(stepBackwardByInterval(single, 12)).toEqual(single);
      expect(filterObsFilesByStep(single, 12)).toEqual(single);

      // Files without timestamps are safely retained
      const nonTsFiles = ["random_file_a.txt", "random_file_b.txt"];
      const steppedNonTs = stepBackwardByInterval(nonTsFiles, 12);
      expect(steppedNonTs.length).toBe(2);
    });
  });
});

