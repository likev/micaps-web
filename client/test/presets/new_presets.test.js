import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateConfig } from "../../src/ui/config/configSchema.js";

describe("New Generated Presets", () => {
  const configRaw = readFileSync(resolve(__dirname, "../../config.json"), "utf8");
  const config = JSON.parse(configRaw);

  it("config.json satisfies full schema validation with 0 errors", () => {
    const res = validateConfig(config);
    expect(res.isValid).toBe(true);
    expect(res.errors.length).toBe(0);
  });

  it("contains all 7 new categories", () => {
    const categories = new Set(config.presets.map((p) => p.category).filter(Boolean));
    expect(categories.has("强对流与短临 (Severe Convective & Nowcasting)")).toBe(true);
    expect(categories.has("智能网格预报 (National Gridded Guidance)")).toBe(true);
    expect(categories.has("高密地面与海洋观测 (High-Density Observations)")).toBe(true);
    expect(categories.has("数值预报高影响要素 (High-Impact NWP Fields)")).toBe(true);
    expect(categories.has("实况融合 (Land Surface Reanalysis)")).toBe(true);
    expect(categories.has("集合预报与概率 (Ensemble & Probability)")).toBe(true);
    expect(categories.has("预报员指导 (Forecaster Guidance)")).toBe(true);
  });

  it("contains SWAN radar presets (MCR, MTOP, MVIL, REF_FST)", () => {
    const ids = new Set(config.presets.map((p) => p.id));
    expect(ids.has("preset-swan_mcr")).toBe(true);
    expect(ids.has("preset-swan_mtop")).toBe(true);
    expect(ids.has("preset-swan_mvil")).toBe(true);
    expect(ids.has("preset-swan_ref_fst")).toBe(true);
  });

  it("contains event and profiler presets", () => {
    const ids = new Set(config.presets.map((p) => p.id));
    expect(ids.has("preset-swan_tvs")).toBe(true);
    expect(ids.has("preset-swan_hail") || ids.has("preset-swan_hail_warn")).toBe(true);
    expect(ids.has("preset-swan_gale") || ids.has("preset-swan_gale_warn")).toBe(true);
    expect(ids.has("preset-surface_lightning_10min") || ids.has("preset-lightning_10min")).toBe(true);
    expect(ids.has("preset-wind_profiler_robs") || ids.has("preset-obs_wind_profiler")).toBe(true);

    const tvs = config.presets.find((p) => p.id === "preset-swan_tvs");
    expect(tvs.layers[0].type).toBe("event");
    expect(tvs.layers[0].eventType).toBe("tvs");

    const profiler = config.presets.find((p) => p.id === "preset-wind_profiler_robs" || p.id === "preset-obs_wind_profiler");
    expect(profiler.layers[0].type).toBe("profiler");
    expect(profiler.layers[0].product).toBe("ROBS");
  });

  it("contains grouped ECMWF PVORT preset with level support", () => {
    const pvort = config.presets.find((p) => p.id === "preset-ecmwf_pvort");
    expect(pvort).toBeDefined();
    expect(pvort.hasLevel).toBe(true);
    expect(pvort.defaultLevel).toBe(500);
    expect(pvort.layers[0].path).toBe("ECMWF_HR/PVORT");
  });
});
