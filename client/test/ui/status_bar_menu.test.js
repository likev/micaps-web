// status_bar_menu.test.js - Unit tests for items 5, 6, and 7
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { readSrcText } from "../helpers/cssText.js";
import { createInitialUIState } from "../../src/lib/stores/uiCore.js";
import { captureScreenshot, handlePrint } from "../../src/utils/screenshot.js";

describe("Item 5 & 6: StatusBar Component & Layer Toggle UI", () => {
  const statusBarSrc = readSrcText("components/StatusBar.svelte");
  const timeSliderSrc = readSrcText("components/TimeSlider.svelte");
  const appSrc = readSrcText("App.svelte");

  test("StatusBar.svelte renders #status-bar with .status-bar and .statebar classes", () => {
    expect(statusBarSrc).toContain('id="status-bar"');
    expect(statusBarSrc).toContain('class="status-bar statebar"');
  });

  test("Item 6: StatusBar.svelte renders #btn-toggle-layers with toggle-on-off UI", () => {
    expect(statusBarSrc).toContain('id="btn-toggle-layers"');
    expect(statusBarSrc).toContain('class="btn-toggle-layers"');
    expect(statusBarSrc).toContain('class:active={ui.layersOpen}');
    expect(statusBarSrc).toContain('role="switch"');
    expect(statusBarSrc).toContain('aria-checked={ui.layersOpen}');

    // Toggle switch track and thumb UI
    expect(statusBarSrc).toContain("toggle-switch-ui");
    expect(statusBarSrc).toContain("toggle-thumb");

    // Toggle ON / OFF state text pill
    expect(statusBarSrc).toContain("toggle-state-pill");
    expect(statusBarSrc).toContain('{ui.layersOpen ? "ON" : "OFF"}');
  });

  test("Item 6: Toggling layers modifies ui.layersOpen state", () => {
    const testUi = createInitialUIState();
    expect(testUi.layersOpen).toBe(true);
    testUi.layersOpen = false;
    expect(testUi.layersOpen).toBe(false);
    testUi.layersOpen = true;
    expect(testUi.layersOpen).toBe(true);
  });

  test("Item 5: StatusBar.svelte hosts .timeline-info with lead time, valid time, and cycle controls", () => {
    expect(statusBarSrc).toContain('class="timeline-info"');
    expect(statusBarSrc).toContain('class="mode-badge"');
    expect(statusBarSrc).toContain('id="sl-select-forecast-cycle"');
    expect(statusBarSrc).toContain('id="sl-time-lead-wrapper"');
    expect(statusBarSrc).toContain('id="sl-time-lead-label"');
    expect(statusBarSrc).toContain('id="sl-time-valid-label"');
    expect(statusBarSrc).toContain('class="valid-label"');
  });

  test("Item 5: TimeSlider.svelte no longer renders .timeline-info directly", () => {
    // Verified that timeline-info was moved out of TimeSlider.svelte
    expect(timeSliderSrc).not.toContain('<div class="timeline-info">');
  });

  test("Item 5: StatusBar.svelte hosts #nav-status-indicator and status text", () => {
    expect(statusBarSrc).toContain('id="nav-status-indicator"');
    expect(statusBarSrc).toContain('class="status-dot"');
    expect(statusBarSrc).toContain('id="nav-status-text"');
    expect(statusBarSrc).toContain("fetchStatus");
  });

  test("App.svelte imports and renders StatusBar at the bottom of the window", () => {
    expect(appSrc).toContain('import StatusBar from "./components/StatusBar.svelte";');
    expect(appSrc).toContain("<StatusBar");
    // Verify StatusBar is placed after TimeSlider in app-container layout
    const timeSliderPos = appSrc.indexOf("<TimeSlider");
    const statusBarPos = appSrc.indexOf("<StatusBar");
    expect(timeSliderPos).toBeGreaterThan(-1);
    expect(statusBarPos).toBeGreaterThan(timeSliderPos);
  });
});

describe("Item 7: Hamburger Menu & Submenu Actions in NavBar.svelte", () => {
  const navBarSrc = readSrcText("components/NavBar.svelte");

  test("NavBar.svelte replaces direct btn-open-config with hamburger menu #btn-nav-menu", () => {
    expect(navBarSrc).toContain('id="btn-nav-menu"');
    expect(navBarSrc).toContain("btn-menu");
    expect(navBarSrc).toContain("hamburger-icon");
    expect(navBarSrc).toContain("☰");
  });

  test("NavBar.svelte dropdown submenu includes Print, Screenshot, Help, and Config", () => {
    expect(navBarSrc).toContain('id="menu-item-print"');
    expect(navBarSrc).toContain('id="menu-item-screenshot"');
    expect(navBarSrc).toContain('id="menu-item-help"');
    expect(navBarSrc).toContain('id="btn-open-config"');
  });

  test("NavBar.svelte preserves #btn-open-config backwards compatibility whether menu is open or closed", () => {
    // Both dropdown menu item and closed-state fallback share id="btn-open-config"
    expect(navBarSrc).toContain('{#if isMenuOpen}');
    expect(navBarSrc).toContain('id="btn-open-config"');
    expect(navBarSrc).toContain("{:else}");
    expect(navBarSrc).toContain('class="visually-hidden"');
  });

  test("NavBar.svelte imports HelpModal and screenshot utility", () => {
    expect(navBarSrc).toContain('import HelpModal from "./HelpModal.svelte";');
    expect(navBarSrc).toContain('import { captureScreenshot, handlePrint } from "../utils/screenshot.js";');
    expect(navBarSrc).toContain("<HelpModal");
  });

  test("NavBar.svelte supports keyboard Escape and click-outside dismissal", () => {
    expect(navBarSrc).toContain('if (e.key === "Escape")');
    expect(navBarSrc).toContain("handleWindowPointerDown");
    expect(navBarSrc).toContain("svelte:window onpointerdown");
  });
});

describe("Screenshot & Print Utilities (screenshot.js)", () => {
  test("captureScreenshot gracefully warns when no canvas is present", () => {
    const fakeDoc = {
      querySelector: () => null,
      querySelectorAll: () => [],
      body: { appendChild: () => {}, removeChild: () => {} },
      createElement: () => ({}),
    };
    const result = captureScreenshot(fakeDoc);
    expect(result).toBe(false);
  });

  test("captureScreenshot extracts image from single canvas", () => {
    let clicked = false;
    let downloadedName = "";
    const mockCanvas = {
      width: 800,
      height: 600,
      toDataURL: () => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    };
    const mockLink = {
      href: "",
      download: "",
      click: () => { clicked = true; downloadedName = mockLink.download; },
      remove: () => {},
    };
    const fakeDoc = {
      querySelector: (sel) => sel.includes("canvas") ? mockCanvas : null,
      querySelectorAll: () => [mockCanvas],
      body: { appendChild: () => {} },
      createElement: (tag) => tag === "a" ? mockLink : {},
    };

    const res = captureScreenshot(fakeDoc);
    expect(res).toBe(true);
    expect(clicked).toBe(true);
    expect(downloadedName).toMatch(/^micaps-screenshot-\d{8}_\d{6}\.png$/);
  });

  test("captureScreenshot composites multiple overlaid canvases", () => {
    let drawnCount = 0;
    const canvas1 = {
      width: 800,
      height: 600,
      toDataURL: () => "data:image/png;base64,mock1",
    };
    const canvas2 = {
      width: 800,
      height: 600,
      toDataURL: () => "data:image/png;base64,mock2",
    };
    const compositeCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => { drawnCount++; },
      }),
      toDataURL: () => "data:image/png;base64,composite",
    };
    const mockLink = {
      click: () => {},
      remove: () => {},
    };
    const fakeDoc = {
      querySelector: () => null,
      querySelectorAll: () => [canvas1, canvas2],
      body: { appendChild: () => {} },
      createElement: (tag) => {
        if (tag === "canvas") return compositeCanvas;
        if (tag === "a") return mockLink;
        return {};
      },
    };

    const res = captureScreenshot(fakeDoc);
    expect(res).toBe(true);
    expect(drawnCount).toBe(2);
    expect(compositeCanvas.width).toBe(800);
    expect(compositeCanvas.height).toBe(600);
  });

  test("captureScreenshot composites multiple overlaid canvases with bounding rect positioning", () => {
    let calls = [];
    const canvas1 = {
      width: 400,
      height: 300,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }),
      toDataURL: () => "data:image/png;base64,mock1",
    };
    const canvas2 = {
      width: 400,
      height: 300,
      getBoundingClientRect: () => ({ left: 400, top: 0, width: 400, height: 300 }),
      toDataURL: () => "data:image/png;base64,mock2",
    };
    const compositeCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (c, dx, dy, dw, dh) => { calls.push({ c, dx, dy, dw, dh }); },
      }),
      toDataURL: () => "data:image/png;base64,composite",
    };
    const mockLink = {
      click: () => {},
      remove: () => {},
    };
    const fakeContainer = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 300 }),
      querySelectorAll: () => [canvas1, canvas2],
    };
    const fakeDoc = {
      querySelector: (sel) => sel.includes("window-panel") ? fakeContainer : null,
      querySelectorAll: () => [canvas1, canvas2],
      body: { appendChild: () => {} },
      createElement: (tag) => {
        if (tag === "canvas") return compositeCanvas;
        if (tag === "a") return mockLink;
        return {};
      },
    };

    const res = captureScreenshot(fakeDoc);
    expect(res).toBe(true);
    expect(calls.length).toBe(2);
    expect(calls[0].dx).toBe(0);
    expect(calls[0].dy).toBe(0);
    expect(calls[1].dx).toBe(400);
    expect(calls[1].dy).toBe(0);
  });

  test("handlePrint invokes window.print() safely", () => {
    let printCalled = false;
    const origWindow = globalThis.window;
    globalThis.window = {
      print: () => { printCalled = true; },
    };
    try {
      handlePrint();
      expect(printCalled).toBe(true);
    } finally {
      globalThis.window = origWindow;
    }
  });

  test("captureScreenshot composites window title header and active legend overlay", () => {
    const textCalls = [];
    const rectCalls = [];
    const mockCanvas = {
      width: 800,
      height: 600,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      toDataURL: () => "data:image/png;base64,mockCanvasData",
    };
    const mockHeader = {
      classList: { contains: () => false },
      getBoundingClientRect: () => ({ left: 250, top: 10, width: 300, height: 32 }),
      querySelector: (sel) => {
        if (sel === ".win-badge") return { textContent: "W1" };
        if (sel === ".win-title") return { textContent: "ECMWF Surface 2m Temperature" };
        return null;
      },
    };
    const mockLegendItem = {
      querySelector: (sel) => {
        if (sel === ".legend-title") return { textContent: "2m Temperature" };
        if (sel === ".legend-unit") return { textContent: "(°C)" };
        if (sel === ".legend-bar") return {
          style: { background: "linear-gradient(to right, rgb(0,0,255) 0% 50%, rgb(255,0,0) 50% 100%)" },
          getAttribute: () => "background: linear-gradient(to right, rgb(0,0,255) 0% 50%, rgb(255,0,0) 50% 100%)",
        };
        return null;
      },
      querySelectorAll: (sel) => {
        if (sel === ".legend-tick") {
          return [
            { style: { left: "0%" }, querySelector: () => ({ textContent: "-20" }), classList: { contains: (c) => c === "tick-first" } },
            { style: { left: "50%" }, querySelector: () => ({ textContent: "0" }), classList: { contains: () => false } },
            { style: { left: "100%" }, querySelector: () => ({ textContent: "40" }), classList: { contains: (c) => c === "tick-last" } },
          ];
        }
        return [];
      },
    };
    const mockLegendPanel = {
      classList: { contains: () => false },
      getBoundingClientRect: () => ({ left: 200, top: 520, width: 400, height: 60 }),
      querySelectorAll: (sel) => sel.includes("legend-item") ? [mockLegendItem] : [],
      querySelector: (sel) => null,
    };
    const compositeCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => {},
        fillRect: (x, y, w, h) => { rectCalls.push({ type: "fill", x, y, w, h }); },
        strokeRect: (x, y, w, h) => { rectCalls.push({ type: "stroke", x, y, w, h }); },
        fillText: (txt, x, y) => { textCalls.push({ txt, x, y }); },
        measureText: (txt) => ({ width: txt.length * 8 }),
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        quadraticCurveTo: () => {},
        fill: () => {},
        stroke: () => {},
        save: () => {},
        restore: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
      }),
      toDataURL: () => "data:image/png;base64,compositeSuccess",
    };
    let downloadedUrl = "";
    const mockLink = {
      click: () => { downloadedUrl = mockLink.href; },
      remove: () => {},
    };
    const fakeContainer = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      querySelectorAll: (sel) => {
        if (sel.includes("canvas")) return [mockCanvas];
        if (sel.includes("win-header")) return [mockHeader];
        return [];
      },
      querySelector: (sel) => {
        if (sel.includes("win-header")) return mockHeader;
        if (sel.includes("legend")) return mockLegendPanel;
        return null;
      },
    };
    const fakeDoc = {
      querySelector: (sel) => {
        if (sel.includes("window-panel")) return fakeContainer;
        if (sel.includes("legend")) return mockLegendPanel;
        return null;
      },
      querySelectorAll: (sel) => {
        if (sel.includes("canvas")) return [mockCanvas];
        if (sel.includes("win-header")) return [mockHeader];
        return [];
      },
      body: { appendChild: () => {} },
      createElement: (tag) => {
        if (tag === "canvas") return compositeCanvas;
        if (tag === "a") return mockLink;
        return {};
      },
    };

    const res = captureScreenshot(fakeDoc);
    expect(res).toBe(true);
    expect(downloadedUrl).toBe("data:image/png;base64,compositeSuccess");
    const texts = textCalls.map((t) => t.txt);
    expect(texts).toContain("W1");
    expect(texts).toContain("ECMWF Surface 2m Temperature");
    expect(texts).toContain("2m Temperature");
    expect(texts).toContain("(°C)");
    expect(texts).toContain("-20");
    expect(texts).toContain("0");
    expect(texts).toContain("40");
  });

});

describe("HelpModal Component (HelpModal.svelte)", () => {
  const helpModalSrc = readSrcText("components/HelpModal.svelte");

  test("HelpModal.svelte displays keyboard shortcuts table", () => {
    expect(helpModalSrc).toContain("◀ / ▶");
    expect(helpModalSrc).toContain("▲ / ▼");
    expect(helpModalSrc).toContain("Space");
    expect(helpModalSrc).toContain("F4 / Alt+S");
    expect(helpModalSrc).toContain("Esc");
  });

  test("HelpModal.svelte displays core guide for Presets, Status Bar, and Layers", () => {
    expect(helpModalSrc).toContain("Presets (组合图)");
    expect(helpModalSrc).toContain("Status Bar (状态栏)");
    expect(helpModalSrc).toContain("Layers Panel (图层管理)");
    expect(helpModalSrc).toContain("Multi-Window & Tabs (多窗对比)");
  });

  test("HelpModal.svelte provides close button, focusRestore, and Tab focus trap", () => {
    expect(helpModalSrc).toContain("btn-close-help");
    expect(helpModalSrc).toContain('if (!open) return;');
    expect(helpModalSrc).toContain('if (e.key === "Escape")');
    expect(helpModalSrc).toContain('if (e.key === "Tab")');
    expect(helpModalSrc).toContain("use:focusRestore");
    expect(helpModalSrc).toContain("onClose && onClose()");
  });
});

describe("Hardened Robustness & Architecture Alignment", () => {
  const navBarSrc = readSrcText("components/NavBar.svelte");
  const statusBarSrc = readSrcText("components/StatusBar.svelte");
  const mapInstanceSrc = readSrcText("map/mapInstance.js");

  test("NavBar.svelte implements ArrowDown, ArrowUp, Home, End keyboard navigation", () => {
    expect(navBarSrc).toContain('if (e.key === "ArrowDown" || e.key === "ArrowUp")');
    expect(navBarSrc).toContain('if (isMenuOpen && e.key === "Home")');
    expect(navBarSrc).toContain('if (isMenuOpen && e.key === "End")');
  });

  test("StatusBar.svelte handles network disconnection with red status-dot and OFFLINE label", () => {
    expect(statusBarSrc).toContain('statusState = "disconnected";');
    expect(statusBarSrc).toContain('statusText = "OFFLINE";');
    expect(statusBarSrc).toContain('.status-dot.disconnected');
  });

  test("mapInstance.js enables preserveDrawingBuffer for reliable WebGL canvas capture", () => {
    expect(mapInstanceSrc).toContain("preserveDrawingBuffer: options.preserveDrawingBuffer ?? true");
  });
});
