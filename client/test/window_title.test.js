// window_title.test.js - Unit tests for Observation Time and Valid Time in window titles
import { test, expect, describe, beforeEach, beforeAll } from "bun:test";
import { computeFullWindowTitle, updateWindowTitle } from "../src/ui/tabWindowManager.js";

const elements = new Map();

beforeAll(() => {
  if (typeof globalThis.document === "undefined") {
    globalThis.document = {};
  }
  if (!globalThis.document.createElement) {
    globalThis.document.createElement = (tag) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            putImageData: () => {},
          }),
          toDataURL: () => "data:image/png;base64,mock",
        };
      }
      return {};
    };
  }
  const prevGetElementById = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => elements.get(id) || (prevGetElementById ? prevGetElementById(id) : null);
});

describe("Window Title with Observation Time and Valid Time", () => {
  beforeEach(() => {
    elements.clear();
    elements.set("win-title-1-0", { textContent: "", title: "" });
    elements.set("tab-label-0", { textContent: "", title: "" });
  });

  test("Basic window without time info returns base title", () => {
    const win = {
      titleId: "win-title-1-0",
      winIdx: 0,
      activeGroup: { name: "Surface Observations", isObservation: true },
      isObservation: true,
      obsTime: null,
    };
    const title = computeFullWindowTitle(win, "Surface Observations");
    expect(title).toBe("Surface Observations");
  });

  test("Observation window appends formatted [Obs: YYYY-MM-DD HH:mm (UTC+8)]", () => {
    const win = {
      titleId: "win-title-1-0",
      winIdx: 0,
      activeGroup: { name: "Surface Observations", isObservation: true },
      isObservation: true,
      obsTime: "20260904080000.000",
    };
    const title = computeFullWindowTitle(win, "Surface Observations");
    expect(title).toContain("Surface Observations");
    expect(title).toContain("[Obs: 2026-09-04 08:00 (UTC+8)]");
  });

  test("Observation window updates cleanly on time step without duplicating suffixes", () => {
    const win = {
      titleId: "win-title-1-0",
      winIdx: 0,
      activeGroup: { name: "Surface Observations", isObservation: true },
      isObservation: true,
      obsTime: "20260904080000.000",
    };
    computeFullWindowTitle(win, "Surface Observations");

    // Advance obs time
    win.obsTime = "20260904110000.000";
    const updated = computeFullWindowTitle(win);
    expect(updated).toBe("Surface Observations [Obs: 2026-09-04 11:00 (UTC+8)]");
    expect(updated.match(/\[Obs:/g)?.length).toBe(1);
  });

  test("NWP Forecast window appends formatted [Valid: YYYY-MM-DD HH:mm (UTC+8) (+XXXh)]", () => {
    const win = {
      titleId: "win-title-1-0",
      winIdx: 0,
      activeGroup: { name: "ECMWF 500hPa HGT+WIND+TMP", isObservation: false },
      isObservation: false,
      forecastCycle: "2026090408",
      period: 24,
    };
    const title = computeFullWindowTitle(win, "ECMWF 500hPa HGT+WIND+TMP");
    expect(title).toContain("ECMWF 500hPa HGT+WIND+TMP");
    expect(title).toContain("[Valid: 2026-09-05 08:00 (UTC+8) (+024h)]");
  });

  test("NWP Forecast window updates valid time when lead hour steps", () => {
    const win = {
      titleId: "win-title-1-0",
      winIdx: 0,
      activeGroup: { name: "ECMWF 500hPa HGT+WIND+TMP", isObservation: false },
      isObservation: false,
      forecastCycle: "2026090408",
      period: 24,
    };
    computeFullWindowTitle(win, "ECMWF 500hPa HGT+WIND+TMP");

    // Advance period to +36h
    win.period = 36;
    const updated = computeFullWindowTitle(win);
    expect(updated).toBe("ECMWF 500hPa HGT+WIND+TMP [Valid: 2026-09-05 20:00 (UTC+8) (+036h)]");
    expect(updated.match(/\[Valid:/g)?.length).toBe(1);
  });

  test("NWP Forecast window with period only formats [+024h]", () => {
    const win = {
      titleId: "win-title-1-0",
      winIdx: 0,
      activeGroup: { name: "TMP (ECMWF_HR)", isObservation: false },
      isObservation: false,
      forecastCycle: null,
      period: 24,
    };
    const title = computeFullWindowTitle(win, "TMP (ECMWF_HR)");
    expect(title).toBe("TMP (ECMWF_HR) [Valid: +024h]");
  });

  test("updateWindowTitle updates both header element and tab label DOM nodes", () => {
    const win = {
      titleId: "win-title-1-0",
      winIdx: 0,
      activeGroup: { name: "500hPa Upper-Air Sounding", isObservation: true },
      isObservation: true,
      obsTime: "20260904080000.000",
    };

    updateWindowTitle(win, "500hPa Upper-Air Sounding");

    const headerEl = document.getElementById("win-title-1-0");
    const tabEl = document.getElementById("tab-label-0");

    expect(headerEl?.textContent).toBe("500hPa Upper-Air Sounding [Obs: 2026-09-04 08:00 (UTC+8)]");
    expect(headerEl?.title).toBe("500hPa Upper-Air Sounding [Obs: 2026-09-04 08:00 (UTC+8)]");
    expect(tabEl?.textContent).toBe("W1: 500hPa Upper-Air Sounding [Obs: 2026-09-04 08:00 (UTC+8)]");
    expect(tabEl?.title).toBe("W1: 500hPa Upper-Air Sounding [Obs: 2026-09-04 08:00 (UTC+8)]");
  });
});
