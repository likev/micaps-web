// command_palette_and_search.test.js - Unit tests for Items A & E: Command Palette and Station Jump
import { test, expect, describe, beforeEach } from "bun:test";
import { readSrcText } from "../helpers/cssText.js";
import {
  CHINESE_STATIONS,
  searchStations,
  jumpToStation,
  highlightStationOnMap,
} from "../../src/utils/stationJump.js";

describe("Item A & E: Command Palette & Station Jump", () => {
  const cmdPaletteSrc = readSrcText("components/CommandPalette.svelte");
  const shortcutsSrc = readSrcText("actions/keyboardShortcuts.js");
  const navBarSrc = readSrcText("components/NavBar.svelte");
  const appSrc = readSrcText("App.svelte");

  test("CommandPalette.svelte exists and defines keyboard shortcuts (Ctrl+K, /) and Escape", () => {
    expect(cmdPaletteSrc).toBeDefined();
    expect(cmdPaletteSrc).toContain('id="command-palette-modal"');
    expect(cmdPaletteSrc).toContain('id="cmd-palette-input"');
    expect(cmdPaletteSrc).toContain("command-palette-backdrop");
    expect(cmdPaletteSrc).toContain('ArrowDown');
    expect(cmdPaletteSrc).toContain('ArrowUp');
    expect(cmdPaletteSrc).toContain('Escape');
    expect(cmdPaletteSrc).toContain('Enter');

    // Shortcuts registry binds Ctrl+K, Cmd+K, and /
    expect(shortcutsSrc).toContain("onOpenCommandPalette");
    expect(shortcutsSrc).toContain('key === "k"');
    expect(shortcutsSrc).toContain('key === "/"');
    expect(appSrc).toContain("commandPaletteOpen");

    // NavBar includes Command Palette trigger in hamburger submenu
    expect(navBarSrc).toContain('id="menu-item-command-palette"');
    expect(navBarSrc).toContain("Ctrl+K");

    // App mounts <CommandPalette>
    expect(appSrc).toContain("<CommandPalette");
  });

  test("CommandPalette includes standard actions (Splits, Screenshot, Print, Layers, Config, Help)", () => {
    expect(cmdPaletteSrc).toContain("Split 1x1");
    expect(cmdPaletteSrc).toContain("Split 1x2");
    expect(cmdPaletteSrc).toContain("Split 2x2");
    expect(cmdPaletteSrc).toContain("Split 2x3");
    expect(cmdPaletteSrc).toContain("Split 3x2");
    expect(cmdPaletteSrc).toContain("Capture Map Screenshot");
    expect(cmdPaletteSrc).toContain("Print Forecast Chart");
    expect(cmdPaletteSrc).toContain("Toggle Layers Panel");
    expect(cmdPaletteSrc).toContain("Open Configuration Editor");
    expect(cmdPaletteSrc).toContain("Open Keyboard Shortcuts Help");
  });

  test("Station Jump database includes key Chinese meteorological stations", () => {
    expect(CHINESE_STATIONS.length).toBeGreaterThanOrEqual(15);
    const beijing = CHINESE_STATIONS.find((s) => s.id === "54511");
    expect(beijing).toBeDefined();
    expect(beijing.nameZh || beijing.name).toContain("北京");
    expect(beijing.lat).toBeCloseTo(39.9, 1);
    expect(beijing.lon).toBeCloseTo(116.4, 1);

    const shanghai = CHINESE_STATIONS.find((s) => s.id === "58362");
    expect(shanghai).toBeDefined();
    expect(shanghai.nameZh || shanghai.name).toContain("上海");
  });

  test("searchStations searches by station ID, Chinese name, or Pinyin", () => {
    const resId = searchStations("54511");
    expect(resId.length).toBeGreaterThan(0);
    expect(resId[0].id).toBe("54511");

    const resName = searchStations("北京");
    expect(resName.length).toBeGreaterThan(0);
    expect(resName[0].name).toContain("北京");

    const resPinyin = searchStations("shanghai");
    expect(resPinyin.length).toBeGreaterThan(0);
    expect(resPinyin[0].id).toBe("58362");

    const resPinyinGuangzhou = searchStations("guangzhou");
    expect(resPinyinGuangzhou.length).toBeGreaterThan(0);
    expect(resPinyinGuangzhou[0].id).toBe("59287");
  });

  test("jumpToStation invokes map.flyTo with station coordinates and minimum zoom 6", () => {
    let flyToArgs = null;
    const mockMap = {
      flyTo: (opts) => {
        flyToArgs = opts;
      },
      getSource: () => null,
      addSource: () => {},
      addLayer: () => {},
      getZoom: () => 3,
    };

    const station = { id: "54511", name: "北京 (Beijing)", lon: 116.47, lat: 39.8 };
    jumpToStation(mockMap, station);

    expect(flyToArgs).not.toBeNull();
    expect(flyToArgs.center).toEqual([116.47, 39.8]);
    expect(flyToArgs.zoom).toBe(7.5);
  });

  test("highlightStationOnMap creates pulsing highlight layers and auto-removes after duration", async () => {
    const sources = new Map();
    const layers = new Map();

    const mockMap = {
      getSource: (id) => sources.get(id) || null,
      addSource: (id, def) => sources.set(id, def),
      removeSource: (id) => sources.delete(id),
      getLayer: (id) => layers.get(id) || null,
      addLayer: (def) => layers.set(def.id, def),
      removeLayer: (id) => layers.delete(id),
    };

    const station = { id: "54511", name: "北京 (Beijing)", lon: 116.47, lat: 39.8 };
    highlightStationOnMap(mockMap, station, 100);

    expect(sources.has("station-quick-jump-source")).toBe(true);
    expect(layers.has("station-quick-jump-halo")).toBe(true);
    expect(layers.has("station-quick-jump-center")).toBe(true);

    // Verify coordinates in geojson feature
    const srcDef = sources.get("station-quick-jump-source");
    expect(srcDef.data.features[0].geometry.coordinates).toEqual([116.47, 39.8]);

    // Wait for auto cleanup
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(layers.has("station-quick-jump-halo")).toBe(false);
    expect(sources.has("station-quick-jump-source")).toBe(false);
  });

  test("highlightStationOnMap cancels previous timeout on rapid consecutive jumps", async () => {
    const sources = new Map();
    const layers = new Map();

    const mockMap = {
      getSource: (id) => sources.get(id) || null,
      addSource: (id, def) => sources.set(id, def),
      removeSource: (id) => sources.delete(id),
      getLayer: (id) => layers.get(id) || null,
      addLayer: (def) => layers.set(def.id, def),
      removeLayer: (id) => layers.delete(id),
    };

    const st1 = { id: "54511", name: "北京", lon: 116.4, lat: 39.9 };
    const st2 = { id: "58362", name: "上海", lon: 121.4, lat: 31.4 };

    // Jump 1 with duration 60ms
    highlightStationOnMap(mockMap, st1, 60);
    expect(mockMap.__stationHighlightTimer).not.toBeNull();

    // Rapid jump 2 after 20ms with duration 100ms
    await new Promise((r) => setTimeout(r, 20));
    highlightStationOnMap(mockMap, st2, 100);

    // After another 50ms (total 70ms since jump 1, which would have killed jump 1's layers):
    await new Promise((r) => setTimeout(r, 50));
    // The layers MUST still be present because jump 1's timer was cancelled!
    expect(sources.has("station-quick-jump-source")).toBe(true);

    // After jump 2's timeout completes:
    await new Promise((r) => setTimeout(r, 70));
    expect(sources.has("station-quick-jump-source")).toBe(false);
  });
});
