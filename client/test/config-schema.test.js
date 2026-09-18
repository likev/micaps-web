// config-schema.test.js - Unit tests for configSchema validation rules
import { test, expect, describe } from "bun:test";
import { validateConfig, isValidSlug } from "../src/ui/config/configSchema.js";
import fs from "fs";

describe("Config Schema Validator (configSchema.js)", () => {
  test("valid full config.json from disk passes validation with zero errors", () => {
    const raw = fs.readFileSync("./config.json", "utf8");
    const parsed = JSON.parse(raw);
    const res = validateConfig(parsed);
    expect(res.isValid).toBe(true);
    expect(res.errors.length).toBe(0);
  });

  test("isValidSlug correctly accepts valid slugs and rejects invalid ones", () => {
    expect(isValidSlug("composite-500hpa")).toBe(true);
    expect(isValidSlug("ecmwf_surface_wind")).toBe(true);
    expect(isValidSlug("div-1")).toBe(true);
    expect(isValidSlug("Group-A")).toBe(true);
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("   ")).toBe(false);
    expect(isValidSlug("500 hpa")).toBe(false);
    expect(isValidSlug("-bad-leading-dash")).toBe(false);
    expect(isValidSlug("special*char")).toBe(false);
  });

  test("preset id uniqueness and slug validation", () => {
    const invalid = {
      presets: [
        { id: "group-1", name: "G1", layers: [] },
        { id: "group-1", name: "G1 Duplicate", layers: [] },
      ],
    };
    const res = validateConfig(invalid);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.message.includes('Duplicate ID "group-1"'))).toBe(true);
  });

  test("layer derivedFrom dangling ref produces error", () => {
    const config = {
      presets: [
        {
          id: "obs-surface",
          name: "Surface Obs",
          layers: [
            {
              id: "station-sfc",
              name: "Stations",
              type: "station",
              model: "SURFACE",
              element: "STATION",
              render: {},
            },
            {
              id: "contour-tmp",
              name: "TMP Contour",
              type: "contour",
              model: "SURFACE",
              element: "TMP",
              derivedFrom: "station-missing",
              render: {},
            },
          ],
        },
      ],
    };
    const res = validateConfig(config);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.message.includes('derivedFrom "station-missing"'))).toBe(true);
  });

  test("colormap stop validation: < 2 stops, bad channel, and duplicate val", () => {
    const badStops = {
      colormaps: {
        TOO_SHORT: [{ val: 0, color: [255, 0, 0, 255] }],
        BAD_CHANNEL: [
          { val: 0, color: [255, 300, 0, 255] },
          { val: 10, color: [0, 255, 0, 255] },
        ],
        DUPLICATE_VAL: [
          { val: 5, color: [255, 0, 0, 255] },
          { val: 5, color: [0, 255, 0, 255] },
        ],
      },
    };
    const res = validateConfig(badStops);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.message.includes('TOO_SHORT" must contain at least two stops'))).toBe(true);
    expect(res.errors.some((e) => e.message.includes('BAD_CHANNEL" stop 0 contains color channel outside 0-255'))).toBe(true);
    expect(res.errors.some((e) => e.message.includes('DUPLICATE_VAL" contains duplicate stop value 5'))).toBe(true);

    // Finite float channel is accepted (aligned with runtime setColormaps)
    const floatStops = {
      colormaps: {
        FLOAT_CH: [
          { val: 0, color: [255, 128.5, 0, 255] },
          { val: 10, color: [0, 255, 0, 255] },
        ],
      },
    };
    const resFloat = validateConfig(floatStops);
    expect(resFloat.isValid).toBe(true);
  });

  test("layer render.boldValues validation detects non-numeric items", () => {
    const badBold = {
      presets: [
        {
          id: "p1",
          name: "P1",
          layers: [
            {
              id: "l1",
              model: "ECMWF_HR",
              element: "HGT",
              render: { boldValues: ["not-a-number", 588] },
            },
          ],
        },
      ],
    };
    const res = validateConfig(badBold);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.message.includes("boldValues must be an array of numbers"))).toBe(true);
  });

  test("layer render.levels validation accepts null or valid >=2 number array, rejects <2 numbers or non-finite", () => {
    const configNullLevels = {
      presets: [
        {
          id: "p1",
          name: "P1",
          layers: [
            {
              id: "rh",
              type: "contour",
              model: "ECMWF_HR",
              element: "RH",
              render: { levels: null },
            },
          ],
        },
      ],
    };
    const resNull = validateConfig(configNullLevels);
    expect(resNull.isValid).toBe(true);

    const configValidLevels = {
      presets: [
        {
          id: "p1",
          name: "P1",
          layers: [
            {
              id: "rh",
              type: "contour",
              model: "ECMWF_HR",
              element: "RH",
              render: { levels: [10, 20, 30] },
            },
          ],
        },
      ],
    };
    const resValid = validateConfig(configValidLevels);
    expect(resValid.isValid).toBe(true);

    const configTooShort = {
      presets: [
        {
          id: "p1",
          name: "P1",
          layers: [
            {
              id: "rh",
              type: "contour",
              model: "ECMWF_HR",
              element: "RH",
              render: { levels: [10] },
            },
          ],
        },
      ],
    };
    const resTooShort = validateConfig(configTooShort);
    expect(resTooShort.isValid).toBe(false);
    expect(resTooShort.errors.some((e) => e.message.includes("levels must be an array of >= 2 numbers"))).toBe(true);
  });

  test("maxEffectiveCells boundaries and clamping validation", () => {
    const configLow = { performance: { maxEffectiveCells: 500 } };
    const resLow = validateConfig(configLow);
    expect(resLow.isValid).toBe(false);
    expect(resLow.errors.some((e) => e.message.includes("between 1000 and 4000000"))).toBe(true);

    const configHigh = { performance: { maxEffectiveCells: 5000000 } };
    const resHigh = validateConfig(configHigh);
    expect(resHigh.isValid).toBe(false);

    const configOk = { performance: { maxEffectiveCells: 50000 } };
    const resOk = validateConfig(configOk);
    expect(resOk.isValid).toBe(true);
  });

  describe("Divider Validation Rules", () => {
    test("bare divider and labeled divider pass validation", () => {
      const config = {
        presets: [
          { id: "g1", name: "Group 1", layers: [] },
          { id: "div-1", divider: true },
          { id: "g2", name: "Group 2", layers: [] },
          { id: "div-2", divider: true, label: "Observations" },
        ],
      };
      const res = validateConfig(config);
      expect(res.isValid).toBe(true);
      expect(res.errors.length).toBe(0);
    });

    test("divider with layers key produces error", () => {
      const config = {
        presets: [
          { id: "g1", name: "Group 1", layers: [] },
          { id: "div-1", divider: true, layers: [] },
        ],
      };
      const res = validateConfig(config);
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.message.includes('Divider "div-1" must not have layers'))).toBe(true);
    });

    test("divider id colliding with a group id produces error", () => {
      const config = {
        presets: [
          { id: "item-1", name: "Group 1", layers: [] },
          { id: "item-1", divider: true },
        ],
      };
      const res = validateConfig(config);
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.message.includes('Duplicate ID "item-1"'))).toBe(true);
    });

    test("consecutive, leading, and trailing dividers produce warnings but do not invalidate config", () => {
      const config = {
        presets: [
          { id: "div-lead", divider: true },
          { id: "g1", name: "Group 1", layers: [] },
          { id: "div-c1", divider: true },
          { id: "div-c2", divider: true },
          { id: "g2", name: "Group 2", layers: [] },
          { id: "div-trail", divider: true },
        ],
      };
      const res = validateConfig(config);
      expect(res.isValid).toBe(true);
      expect(res.errors.length).toBe(0);
      expect(res.warnings.some((w) => w.message.includes("Leading divider"))).toBe(true);
      expect(res.warnings.some((w) => w.message.includes("Consecutive dividers"))).toBe(true);
      expect(res.warnings.some((w) => w.message.includes("Trailing divider"))).toBe(true);
    });

    test("name-on-divider produces warning without failing validation", () => {
      const config = {
        presets: [
          { id: "g1", name: "Group 1", layers: [] },
          { id: "div-named", divider: true, name: "Section Heading" },
        ],
      };
      const res = validateConfig(config);
      expect(res.isValid).toBe(true);
      expect(res.warnings.some((w) => w.message.includes("uses label, not name"))).toBe(true);
    });
  });
});
