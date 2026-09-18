// winHeaderFloating.test.js - Unit tests verifying floating win-header, larger title size, and full-height map-viewport
import { describe, it, expect } from "bun:test";
import fs from "fs";
import path from "path";

describe("Floating Window Header and Full-Height Map Viewport", () => {
  const tabsCssPath = path.resolve(__dirname, "../../src/tabs.css");
  const tabsCss = fs.readFileSync(tabsCssPath, "utf-8");

  it("verifies .win-header is positioned absolute and floating top-middle above map", () => {
    expect(tabsCss).toContain(".win-header {");

    // Extract .win-header rule block
    const headerBlock = tabsCss.split(".win-header {")[1].split("}")[0];
    expect(headerBlock).toContain("position: absolute;");
    expect(headerBlock).toContain("top: 10px;");
    expect(headerBlock).toContain("left: 50%;");
    expect(headerBlock).toContain("transform: translateX(-50%);");
    expect(headerBlock).toContain("z-index: 25;");
    expect(headerBlock).toContain("border-radius: 20px;");
    expect(headerBlock).toContain("backdrop-filter: blur(12px);");
  });

  it("verifies .win-title has a larger font size (14px) and prominent styling", () => {
    expect(tabsCss).toContain(".win-title {");

    const titleBlock = tabsCss.split(".win-title {")[1].split("}")[0];
    expect(titleBlock).toContain("font-size: 14px;");
    expect(titleBlock).toContain("font-weight: 600;");
  });

  it("verifies .map-viewport occupies 100% full height of the window panel without header height deduction", () => {
    expect(tabsCss).toContain(".map-viewport {");

    const viewportBlock = tabsCss.split(".map-viewport {")[1].split("}")[0];
    expect(viewportBlock).toContain("position: absolute;");
    expect(viewportBlock).toContain("top: 0;");
    expect(viewportBlock).toContain("left: 0;");
    expect(viewportBlock).toContain("width: 100%;");
    expect(viewportBlock).toContain("height: 100%;");
    // Ensure the old 28px deduction is gone
    expect(viewportBlock).not.toContain("calc(100% - 28px)");
  });
});
