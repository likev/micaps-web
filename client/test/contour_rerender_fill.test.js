// contour_rerender_fill.test.js - Expand-on-demand isoband fill bounds
import { describe, it, expect } from "bun:test";
import {
  expandFillBounds,
  isViewportWithinFill,
  FILL_BOUNDS_BUFFER_DEG,
  FILL_BOUNDS_TOLERANCE_DEG,
} from "../src/services/contourReRender.js";

describe("expand-on-demand fill bounds", () => {
  it("buffer default matches the render-path crop default", () => {
    expect(FILL_BOUNDS_BUFFER_DEG).toBe(1.75);
  });

  it("expandFillBounds pads viewport by the buffer on all sides", () => {
    // MapLibre LngLatBounds.toArray() shape [[w, s], [e, n]]
    expect(expandFillBounds([[100, 20], [120, 40]], 1.75)).toEqual([98.25, 18.25, 121.75, 41.75]);
    expect(expandFillBounds([100, 20, 120, 40], 2)).toEqual([98, 18, 122, 42]);
    expect(expandFillBounds(null)).toBe(null);
    expect(expandFillBounds("nonsense")).toBe(null);
  });

  it("viewport strictly inside fill box needs no recompute", () => {
    const fill = expandFillBounds([[100, 20], [120, 40]]);
    expect(isViewportWithinFill([[105, 25], [115, 35]], fill)).toBe(true);
    // Same viewport that produced the fill box sits 1.75deg inside it:
    // no recompute right after load.
    expect(isViewportWithinFill([[100, 20], [120, 40]], fill)).toBe(true);
  });

  it("viewport overflowing the fill box triggers recompute (zoom-out/pan)", () => {
    const fill = expandFillBounds([[110, 30], [112, 32]]); // small load-time box
    expect(isViewportWithinFill([[100, 20], [120, 40]], fill)).toBe(false); // zoomed out
    expect(isViewportWithinFill([[90, 25], [95, 30]], fill)).toBe(false); // panned away
  });

  it("edge contact within tolerance triggers recompute, nulls are safe", () => {
    const fill = [98.25, 18.25, 121.75, 41.75];
    // Touches the west edge exactly -> not strictly inside
    expect(isViewportWithinFill([98.25, 25, 110, 35], fill)).toBe(false);
    expect(isViewportWithinFill(null, fill)).toBe(false);
    expect(isViewportWithinFill([[105, 25], [115, 35]], null)).toBe(false);
    expect(FILL_BOUNDS_TOLERANCE_DEG).toBeGreaterThanOrEqual(0);
  });

  it("antimeridian crossing takes the safe side (recompute)", () => {
    const fill = expandFillBounds([[-10, 20], [10, 40]]);
    expect(isViewportWithinFill([[170, 25], [-170, 35]], fill)).toBe(false);
  });
});
