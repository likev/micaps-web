// pro_menu_bar_redesign.test.js
// Verification of pro menu and button/tag feel in menu bar components and styles

import { describe, test, expect } from "bun:test";
import { readSrcText } from "../helpers/cssText.js";

describe("Pro Menu Bar Redesign & Button/Tag Aesthetic", () => {
  const navBarSrc = readSrcText("components/NavBar.svelte");
  const presetMenuSrc = readSrcText("components/PresetMenu.svelte");
  const navbarCss = readSrcText("styles/navbar.css");
  const tokensCss = readSrcText("styles/tokens.css");
  const polishCss = readSrcText("styles/polish.css");

  test("NavBar.svelte incorporates pro workstation header styling", () => {
    // Backdrop blur, subtle box shadow, and dark surface gradient
    expect(navBarSrc).toContain("backdrop-filter: blur(");
    expect(navBarSrc).toContain("box-shadow: 0 1px 3px");
    expect(navBarSrc).toContain("linear-gradient(180deg");
  });

  test("NavBar.svelte brand section features separator and PRO badge tag", () => {
    expect(navBarSrc).toContain("border-right: 1px solid");
    expect(navBarSrc).toContain(".brand-badge");
    expect(navBarSrc).toContain("linear-gradient(135deg");
    expect(navBarSrc).toContain("text-transform: uppercase");
    expect(navBarSrc).toContain("letter-spacing: 0.8px");
  });

  test("NavBar.svelte quick-pills have button/tag tactile styling", () => {
    expect(navBarSrc).toContain(".nav-quick-pills");
    expect(navBarSrc).toContain(".quick-pill");
    expect(navBarSrc).toContain(".pill-star");
    expect(navBarSrc).toContain(".pill-recent-icon");
    expect(navBarSrc).toContain("box-shadow: 0 1px 2px");
    expect(navBarSrc).toContain("transform: translateY(");
  });

  test("NavBar.svelte active preset indicator renders active pulse dot and tag badge", () => {
    expect(navBarSrc).toContain('class="preset-active-indicator"');
    expect(navBarSrc).toContain('class="active-dot"');
    expect(navBarSrc).toContain('class="active-tag"');
    expect(navBarSrc).toContain('class="active-title"');
    expect(navBarSrc).toContain('class="btn-reload-preset"');
    expect(navBarSrc).toContain("activePulse");
    expect(navBarSrc).toContain("transform: rotate(180deg)");
  });

  test("NavBar.svelte layout selector renders tactile button tag with animated caret", () => {
    expect(navBarSrc).toContain('id="btn-nav-layout"');
    expect(navBarSrc).toContain('class="btn-nav-layout"');
    expect(navBarSrc).toContain(".dropdown-caret");
    expect(navBarSrc).toContain('.btn-nav-layout[aria-expanded="true"] .dropdown-caret');
    expect(navBarSrc).toContain("transform: rotate(180deg)");
  });

  test("NavBar.svelte level and model selectors use nav-tag-capsule segmented styling", () => {
    expect(navBarSrc).toContain("nav-tag-capsule");
    expect(navBarSrc).toContain(".nav-tag-capsule label");
    expect(navBarSrc).toContain(".nav-tag-capsule:hover");
    expect(navBarSrc).toContain("appearance: none");
  });

  test("NavBar.svelte and PresetMenu.svelte dropdowns feature acrylic blur and entrance animations", () => {
    expect(navBarSrc).toContain("@keyframes proMenuFadeIn");
    expect(navBarSrc).toContain("backdrop-filter: blur(");
    expect(navBarSrc).toContain(".nav-dropdown-menu");
    expect(navBarSrc).toContain(".nav-layout-menu");
    expect(navBarSrc).toContain(".menu-shortcut");

    expect(presetMenuSrc).toContain("@keyframes proMenuFadeIn");
    expect(presetMenuSrc).toContain("backdrop-filter: blur(");
    expect(presetMenuSrc).toContain(".preset-dropdown");
    expect(presetMenuSrc).toContain(".preset-submenu");
    expect(presetMenuSrc).toContain(".category-count");
    expect(presetMenuSrc).toContain(".preset-badge");
  });

  test("PresetMenu.svelte trigger button has tactile button/tag feel with rotated arrow", () => {
    expect(presetMenuSrc).toContain(".preset-menu-trigger");
    expect(presetMenuSrc).toContain(".preset-trigger-arrow");
    expect(presetMenuSrc).toContain(".preset-trigger-arrow.rotated");
    expect(presetMenuSrc).toContain("transform: rotate(180deg)");
    expect(presetMenuSrc).toContain("box-shadow: 0 1px 2px");
  });

  test("styles/navbar.css keeps overflow: visible on .nav-left and includes pro styles", () => {
    expect(navbarCss).toMatch(/\.nav-left\s*\{[^}]*overflow:\s*visible/);
    expect(navbarCss).toContain("linear-gradient(180deg");
    expect(navbarCss).toContain(".brand-badge");
    expect(navbarCss).toContain(".nav-brand");
  });

  test("styles/tokens.css includes theme support for pro layout and nav tag elements", () => {
    expect(tokensCss).toContain('[data-theme="light"] .btn-nav-layout');
    expect(tokensCss).toContain('[data-theme="light"] .nav-tag-capsule');
    expect(tokensCss).toContain('[data-theme="light"] .preset-active-indicator');
    expect(tokensCss).toContain('[data-theme="light"] .btn-nav-layout.active');

    expect(polishCss).toContain('[data-theme="brutalism"] #app :is(.btn, .btn-menu, .btn-nav-layout');
    expect(polishCss).toContain('.nav-tag-capsule');
    expect(polishCss).toContain('.preset-active-indicator');
    expect(polishCss).toContain('.btn-nav-layout.active');
  });

  test("NavBar.svelte features nav-divider and horizontal overflow containment on quick-pills", () => {
    expect(navBarSrc).toContain('class="nav-divider"');
    expect(navBarSrc).toContain(".nav-divider");
    expect(navBarSrc).toContain("max-width: 380px");
    expect(navBarSrc).toContain("overflow-x: auto");
  });

  test("Dropdowns and menus define Firefox thin scrollbar styles", () => {
    expect(navBarSrc).toContain("scrollbar-width: thin");
    expect(presetMenuSrc).toContain("scrollbar-width: thin");
    expect(tokensCss).toContain("scrollbar-color");
  });

  test("Select options have explicit background and text styling", () => {
    expect(navBarSrc).toContain(".nav-select option");
    expect(navbarCss).toContain(".nav-select option");
  });

  test("styles/tokens.css provides high-contrast light and brutalism theme rules for tags and active pills", () => {
    expect(tokensCss).toContain('[data-theme="light"] .quick-pill.active');
    expect(tokensCss).toContain('[data-theme="light"] .preset-active-indicator .active-tag');
    expect(tokensCss).toContain('[data-theme="light"] .preset-badge');
    expect(tokensCss).toContain('[data-theme="light"] .category-count');
    expect(tokensCss).toContain('[data-theme="light"] .menu-shortcut');

    expect(polishCss).toContain('.quick-pill.active');
    expect(polishCss).toContain('[data-theme="brutalism"] #app .brand-badge');
    expect(polishCss).toContain('.menu-shortcut');
  });

  test("responsive.css defines responsive rules for quick-pills and active indicator", () => {
    const responsiveCss = readSrcText("styles/responsive.css");
    expect(responsiveCss).toContain(".nav-quick-pills");
    expect(responsiveCss).toContain(".preset-active-indicator");
  });
});
