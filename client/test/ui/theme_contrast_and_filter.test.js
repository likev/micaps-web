import "../helpers/svelteRunesPolyfill.js";
import { describe, test, expect } from "bun:test";
import { THEME_TOKENS, getThemeTokens, getPlotTokens, getMapTokens } from "../../src/map/themeTokens.js";
import { BASEMAP_SCHEMES, getBasemapScheme } from "../../src/map/pmtilesLayers.js";
import { resolveInitialBasemapScheme } from "../../src/map/mapInstance.js";
import { normalizeTheme } from "../../src/lib/stores/theme.svelte.js";
import fs from "fs";
import path from "path";

describe("Theme Contrast, Black Theme Aliasing, and StationFilter Color Tokens", () => {
  test("black theme is aliased to dark theme across all token getters", () => {
    expect(THEME_TOKENS.black).toBeDefined();
    expect(THEME_TOKENS.black).toBe(THEME_TOKENS.dark);

    const blackTokens = getThemeTokens("black");
    const darkTokens = getThemeTokens("dark");
    expect(blackTokens).toBe(darkTokens);

    const blackPlot = getPlotTokens("black");
    const darkPlot = getPlotTokens("dark");
    expect(blackPlot.wind.color).toBe("#dee2e6");
    expect(blackPlot.wind.color).toBe(darkPlot.wind.color);
    expect(blackPlot.halo).toBe(darkPlot.halo);

    const blackMap = getMapTokens("black");
    const darkMap = getMapTokens("dark");
    expect(blackMap).toBe(darkMap);

    const blackBasemap = getBasemapScheme("black");
    expect(blackBasemap).toBe(darkMap);
    expect(BASEMAP_SCHEMES.black).toBe(darkMap);
  });

  test("normalizeTheme correctly normalizes black alias and empty values to dark", () => {
    expect(normalizeTheme("black")).toBe("dark");
    expect(normalizeTheme("BLACK")).toBe("dark");
    expect(normalizeTheme("dark")).toBe("dark");
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("brutalism")).toBe("brutalism");
    expect(normalizeTheme("invalid-theme")).toBe("dark");
    expect(normalizeTheme(null)).toBe("dark");
    expect(normalizeTheme(undefined)).toBe("dark");
  });

  test("resolveInitialBasemapScheme handles black alias and honors active UI theme", () => {
    const origLocalStorage = globalThis.localStorage;
    const storage = {};
    globalThis.localStorage = {
      getItem: (k) => storage[k] || null,
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; },
    };

    try {
      storage["micaps-basemap-scheme"] = "black";
      expect(resolveInitialBasemapScheme()).toBe("dark");

      delete storage["micaps-basemap-scheme"];
      storage["micaps-ui-theme"] = "black";
      expect(resolveInitialBasemapScheme()).toBe("dark");

      storage["micaps-ui-theme"] = "light";
      expect(resolveInitialBasemapScheme()).toBe("light");

      storage["micaps-ui-theme"] = "brutalism";
      expect(resolveInitialBasemapScheme()).toBe("brutalism");
    } finally {
      if (origLocalStorage) {
        globalThis.localStorage = origLocalStorage;
      } else {
        delete globalThis.localStorage;
      }
    }
  });

  test("config.json has dark basemap scheme to match default workstation theme", () => {
    const configPath = path.resolve(__dirname, "../../config.json");
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    expect(config.basemap.scheme).toBe("dark");
  });

  test("StationFilter.svelte uses CSS variables rather than hardcoded dark backgrounds", () => {
    const sveltePath = path.resolve(__dirname, "../../src/components/StationFilter.svelte");
    const content = fs.readFileSync(sveltePath, "utf-8");
    const styleIdx = content.indexOf("<style>");
    expect(styleIdx).toBeGreaterThan(0);
    const styleContent = content.slice(styleIdx);

    // .sel-filter-field, .sel-filter-op, .input-filter-val must not have hardcoded background: #161b22;
    expect(styleContent).not.toContain("background: #161b22;");
    expect(styleContent).toContain("var(--bg-card");
  });

  test("tokens.css includes light theme override rules for station filter controls", () => {
    const tokensPath = path.resolve(__dirname, "../../src/styles/tokens.css");
    const tokensContent = fs.readFileSync(tokensPath, "utf-8");

    expect(tokensContent).toContain('[data-theme="light"] .sel-filter-field');
    expect(tokensContent).toContain('[data-theme="light"] .sel-filter-op');
    expect(tokensContent).toContain('[data-theme="light"] .input-filter-val');
    expect(tokensContent).toContain('[data-theme="light"] .sel-filter-global-logic');
    expect(tokensContent).toContain('[data-theme="light"] .btn-filter-preset');
  });

  test("StationFilter quick-preset buttons preserve accent blue in light theme", () => {
    const tokensPath = path.resolve(__dirname, "../../src/styles/tokens.css");
    const tokensContent = fs.readFileSync(tokensPath, "utf-8");

    // Must not lump .btn-filter-preset into the plain text primary color block
    expect(tokensContent).toMatch(/\[data-theme="light"\]\s+\.btn-filter-preset\s*\{[^}]*color:\s*var\(--accent-blue\)/);
    expect(tokensContent).toMatch(/\[data-theme="light"\]\s+\.btn-filter-preset\s*\{[^}]*border-color:\s*var\(--accent-blue\)/);
  });

  test("cleanScheme and normalizeTheme handle untrimmed strings and edge cases", async () => {
    const { cleanScheme } = await import("../../src/map/mapInstance.js");
    expect(cleanScheme("  black  ")).toBe("dark");
    expect(cleanScheme("BLACK")).toBe("dark");
    expect(cleanScheme(" Dark ")).toBe("dark");
    expect(cleanScheme("LIGHT")).toBe("light");
    expect(cleanScheme("brutalism")).toBe("brutalism");
    expect(cleanScheme("")).toBeNull();
    expect(cleanScheme(null)).toBeNull();

    expect(normalizeTheme("  black  ")).toBe("dark");
    expect(normalizeTheme("  light  ")).toBe("light");
    expect(normalizeTheme("  brutalism  ")).toBe("brutalism");

    expect(getThemeTokens("  black  ")).toBe(THEME_TOKENS.dark);
    expect(getPlotTokens("  black  ").wind.color).toBe("#dee2e6");
  });

  test("tokens.css provides base station filter classes for universal theme support", () => {
    const tokensPath = path.resolve(__dirname, "../../src/styles/tokens.css");
    const tokensContent = fs.readFileSync(tokensPath, "utf-8");

    expect(tokensContent).toContain(".sel-filter-field,");
    expect(tokensContent).toContain(".btn-filter-preset {");
    expect(tokensContent).toContain("color: var(--accent-blue);");
  });
});

