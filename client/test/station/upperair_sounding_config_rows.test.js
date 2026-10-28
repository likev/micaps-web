// upperair_sounding_config_rows.test.js - Verification of 500 hPa Sounding Station Plots config-rows
import { describe, test, expect } from "bun:test";
import fs from "fs";
import { isUpperAirStationLayer, getStationDatasetType } from "../../src/ui/layers/layerDefaults.js";
import { readSrcText } from "../helpers/cssText.js";

describe("500 hPa Sounding Station Plots Config-Row Restoration", () => {
  const layerRowSrc = readSrcText("components/LayerRow.svelte");
  const stationFilterSrc = readSrcText("components/StationFilter.svelte");
  const rawConfig = fs.readFileSync(
    fs.existsSync("./config.json") ? "./config.json" : "./client/config.json",
    "utf-8"
  );
  const config = JSON.parse(rawConfig);

  const sounding500Group = config.presets.find((p) => p.id === "composite-upperair-500");
  const sounding500Layer = sounding500Group?.layers.find((l) => l.name === "500 hPa Sounding Station Plots");

  test("500 hPa Sounding Station Plots dataset classification", () => {
    expect(sounding500Layer).toBeDefined();
    expect(sounding500Layer.id).toBe("upperair-obs-500");
    expect(sounding500Layer.type).toBe("station");
    expect(sounding500Layer.model).toBe("UPPER_AIR");
    expect(sounding500Layer.level).toBe(500);

    // Layer defaults classify as upper air station
    expect(isUpperAirStationLayer(sounding500Layer)).toBe(true);
    expect(getStationDatasetType(sounding500Layer)).toBe("upper_air");
  });

  test("Multi-level sounding station layers (850, 700, 500, 200 hPa) classify as upper_air", () => {
    const levels = [850, 700, 500, 200];
    for (const lvl of levels) {
      const layer = {
        id: `upperair-obs-${lvl}`,
        model: "UPPER_AIR",
        element: "PLOT",
        level: lvl,
        name: `${lvl} hPa Sounding Station Plots`,
        path: `UPPER_AIR/PLOT/${lvl}`,
        type: "station",
      };
      expect(isUpperAirStationLayer(layer)).toBe(true);
      expect(getStationDatasetType(layer)).toBe("upper_air");
    }
  });

  test("LayerRow.svelte renders element config-rows for upper_air stationType", () => {
    const stationBranchStart = layerRowSrc.indexOf('{:else if layer.type === "station"}');
    const stationBranchEnd = layerRowSrc.indexOf('{:else if layer.type === "wind"}');
    expect(stationBranchStart).toBeGreaterThan(-1);
    expect(stationBranchEnd).toBeGreaterThan(stationBranchStart);
    const stationBranch = layerRowSrc.slice(stationBranchStart, stationBranchEnd);

    // Station elements subtab condition must include upper_air
    expect(stationBranch).toMatch(
      /\{#if\s+!stationType\s*\|\|\s*stationType\s*===\s*"standard"\s*\|\|\s*stationType\s*===\s*"upper_air"\}/
    );

    // Locate the station elements block for standard/upper_air
    const elementsBlockStart = stationBranch.indexOf('class="config-subtab-pane" class:active={currentSubtab === "elements"}');
    const snowDepthStart = stationBranch.indexOf('{:else if stationType === "snow_depth"}');
    expect(elementsBlockStart).toBeGreaterThan(-1);
    expect(snowDepthStart).toBeGreaterThan(elementsBlockStart);
    const elementsSlice = stationBranch.slice(elementsBlockStart, snowDepthStart);

    // Temperature & Dewpoint config-row
    expect(elementsSlice).toContain('class="chk-show-temp"');
    expect(elementsSlice).toContain('class="chk-show-dewpoint"');

    // Wind Barbs & Height/Pressure config-row
    expect(elementsSlice).toContain('class="chk-show-wind"');
    expect(elementsSlice).toContain('class="chk-show-pressure"');
    expect(elementsSlice).toContain('{isUpperStation ? "Height" : "Pressure"}');

    // T-Td and Streamlines config-row
    expect(elementsSlice).toContain('class="chk-show-dtd"');
    expect(elementsSlice).toContain('class="chk-show-streamlines"');

    // Surface-only elements must be guarded by !isUpperStation
    expect(elementsSlice).toContain('{#if !isUpperStation}');
    expect(elementsSlice).toContain('class="chk-show-cloud"');
    expect(elementsSlice).toContain('class="chk-show-weather"');
    expect(elementsSlice).toContain('class="chk-show-vis"');
    expect(elementsSlice).toContain('class="chk-show-rain6"');

    // Contour options for upper air
    expect(stationBranch).toContain('{#if isUpperStation}');
    expect(stationBranch).toContain('value="HGT"');
    expect(stationBranch).toContain('value="TMP"');
    expect(stationBranch).toContain('value="TD"');
    expect(stationBranch).toContain('value="DTD"');
  });

  test("StationFilter.svelte integrates canonical getStationDatasetType for upper_air", () => {
    expect(stationFilterSrc).toContain('getStationDatasetType');
    expect(stationFilterSrc).toContain('isUpperAirStationLayer');
    expect(stationFilterSrc).toMatch(/let\s+upper\s*=\s*\$derived\(stationType\s*===\s*"upper_air"/);
  });

  test("Upper-air element default checked states semantics", () => {
    // When config is empty ({}), upper air defaults:
    // showTemp: true, showDewpoint: true, showWind: true, showPressure (Height): true, showDTD: false, showStreamlines: false
    const evalShowTemp = (cfg) => cfg?.showTemp !== false;
    const evalShowDewpoint = (cfg) => cfg?.showDewpoint !== false;
    const evalShowWind = (cfg) => cfg?.showWind !== false;
    const evalShowPressureUpper = (cfg) => cfg?.showPressure !== false;
    const evalShowPressureSurface = (cfg) => Boolean(cfg?.showPressure);

    const emptyCfg = {};
    expect(evalShowTemp(emptyCfg)).toBe(true);
    expect(evalShowDewpoint(emptyCfg)).toBe(true);
    expect(evalShowWind(emptyCfg)).toBe(true);
    expect(evalShowPressureUpper(emptyCfg)).toBe(true);
    expect(evalShowPressureSurface(emptyCfg)).toBe(false);

    // When explicitly unchecked
    const uncheckedCfg = { showTemp: false, showPressure: false, showWind: false };
    expect(evalShowTemp(uncheckedCfg)).toBe(false);
    expect(evalShowPressureUpper(uncheckedCfg)).toBe(false);
    expect(evalShowWind(uncheckedCfg)).toBe(false);
  });
});
