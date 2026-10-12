// screenshot_overlays.test.js - Unit tests for screenshot helpers
import { test, expect, describe } from "bun:test";
import {
  drawRoundedRect,
  drawColorBar,
  drawWindowHeaders,
  drawLegendOverlay,
  captureScreenshot,
} from "../../src/utils/screenshot.js";

describe("Screenshot Helpers (screenshot.js)", () => {
  test("drawRoundedRect executes paths and responds to fill/stroke flags", () => {
    let beginCalled = false;
    let fillCalled = false;
    let strokeCalled = false;
    let closeCalled = false;

    const mockCtx = {
      beginPath: () => { beginCalled = true; },
      moveTo: () => {},
      lineTo: () => {},
      quadraticCurveTo: () => {},
      closePath: () => { closeCalled = true; },
      fill: () => { fillCalled = true; },
      stroke: () => { strokeCalled = true; },
    };

    drawRoundedRect(mockCtx, 10, 10, 100, 50, 8, true, true);
    expect(beginCalled).toBe(true);
    expect(closeCalled).toBe(true);
    expect(fillCalled).toBe(true);
    expect(strokeCalled).toBe(true);

    // Guard on negative or zero dimensions
    beginCalled = false;
    drawRoundedRect(mockCtx, 10, 10, 0, 50, 8);
    expect(beginCalled).toBe(false);
  });

  test("drawColorBar parses CSS gradients and adds color stops", () => {
    const stops = [];
    let filled = false;
    const mockCtx = {
      save: () => {},
      restore: () => {},
      createLinearGradient: () => ({
        addColorStop: (offset, color) => {
          stops.push({ offset, color });
        },
      }),
      fillRect: () => { filled = true; },
      strokeRect: () => {},
    };

    const gradient = "linear-gradient(to right, rgb(0, 0, 255) 0% 25%, rgb(0, 255, 0) 25% 75%, rgb(255, 0, 0) 75% 100%)";
    drawColorBar(mockCtx, 0, 0, 200, 10, gradient);

    expect(filled).toBe(true);
    expect(stops.length).toBeGreaterThanOrEqual(3);
    expect(stops[0].color).toBe("rgb(0, 0, 255)");
    expect(stops[0].offset).toBe(0);
  });

  test("drawColorBar falls back gracefully when gradient is malformed or absent", () => {
    let filled = false;
    const mockCtx = {
      save: () => {},
      restore: () => {},
      createLinearGradient: () => { throw new Error("Grad failure"); },
      fillRect: () => { filled = true; },
      strokeRect: () => {},
    };

    drawColorBar(mockCtx, 0, 0, 200, 10, "invalid-gradient");
    expect(filled).toBe(true);
  });

  test("drawWindowHeaders draws badge, title, and centers when no rect is present", () => {
    const textCalls = [];
    const mockCtx = {
      canvas: { width: 1000, height: 800 },
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      quadraticCurveTo: () => {},
      fill: () => {},
      stroke: () => {},
      fillText: (t, x, y) => { textCalls.push({ t, x, y }); },
      measureText: (t) => ({ width: t.length * 7 }),
    };

    const fakeContainer = {
      querySelectorAll: () => [
        {
          classList: { contains: () => false },
          querySelector: (sel) => {
            if (sel === ".win-badge") return { textContent: "W2" };
            if (sel === ".win-title") return { textContent: "CMA-GFS 500 hPa Height & Wind" };
            return null;
          },
        },
      ],
    };

    drawWindowHeaders(mockCtx, fakeContainer, null, 1, null);
    const renderedTexts = textCalls.map((c) => c.t);
    expect(renderedTexts).toContain("W2");
    expect(renderedTexts).toContain("CMA-GFS 500 hPa Height & Wind");
  });

  test("drawLegendOverlay renders title, unit, color bar, and tick marks", () => {
    const textCalls = [];
    const lines = [];
    const mockCtx = {
      canvas: { width: 1000, height: 800 },
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: (x, y) => { lines.push({ type: "move", x, y }); },
      lineTo: (x, y) => { lines.push({ type: "line", x, y }); },
      quadraticCurveTo: () => {},
      fill: () => {},
      stroke: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: (t, x, y) => { textCalls.push({ t, x, y }); },
      createLinearGradient: () => ({ addColorStop: () => {} }),
    };

    const fakeDoc = {
      querySelector: (sel) => {
        if (sel.includes("legend")) {
          return {
            classList: { contains: () => false },
            querySelectorAll: (subSel) => {
              if (subSel.includes("legend-item")) {
                return [
                  {
                    querySelector: (elSel) => {
                      if (elSel === ".legend-title") return { textContent: "Relative Humidity" };
                      if (elSel === ".legend-unit") return { textContent: "(%)" };
                      if (elSel === ".legend-bar") return { style: { background: "linear-gradient(to right, #00f, #0f0, #ff0)" } };
                      return null;
                    },
                    querySelectorAll: (elSel) => {
                      if (elSel === ".legend-tick") {
                        return [
                          { style: { left: "0%" }, querySelector: () => ({ textContent: "0" }), classList: { contains: () => true } },
                          { style: { left: "50%" }, querySelector: () => ({ textContent: "50" }), classList: { contains: () => false } },
                          { style: { left: "100%" }, querySelector: () => ({ textContent: "100" }), classList: { contains: () => true } },
                        ];
                      }
                      return [];
                    },
                  },
                ];
              }
              return [];
            },
          };
        }
        return null;
      },
    };

    drawLegendOverlay(mockCtx, null, null, 1, fakeDoc);
    const renderedTexts = textCalls.map((c) => c.t);
    expect(renderedTexts).toContain("Relative Humidity");
    expect(renderedTexts).toContain("(%)");
    expect(renderedTexts).toContain("0");
    expect(renderedTexts).toContain("50");
    expect(renderedTexts).toContain("100");
    expect(lines.length).toBeGreaterThan(0);
  });
});
