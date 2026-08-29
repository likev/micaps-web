// config.test.js - Unit tests for config.json compact formatting and structure validation
import { test, expect, describe } from "bun:test";
import { formatCompactJSON } from "../src/config/presets.js";
import fs from "fs";

describe("Configuration File Validation (config.json)", () => {
  test("config.json exists, parses, and contains valid preset groups", () => {
    const raw = fs.readFileSync("./public/config.json", "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveProperty("presets");
    expect(parsed).toHaveProperty("colormaps");
    expect(Array.isArray(parsed.presets)).toBe(true);
    expect(parsed.presets.length).toBeGreaterThan(0);

    for (const group of parsed.presets) {
      expect(group).toHaveProperty("id");
      expect(group).toHaveProperty("name");
      expect(Array.isArray(group.layers)).toBe(true);
    }
  });

  test("formatCompactJSON keeps color arrays on single lines", () => {
    const sample = {
      colormaps: {
        TMP: [
          { val: 0, color: [180, 240, 240, 255] },
          { val: 10, color: [100, 210, 110, 255] },
        ],
      },
    };
    const formatted = formatCompactJSON(sample);
    expect(formatted).toContain('"color": [180, 240, 240, 255]');
    expect(formatted).toContain('{ "val": 0, "color": [180, 240, 240, 255] }');
  });
});
