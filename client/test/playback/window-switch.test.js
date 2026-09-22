// test/playback/window-switch.test.js - Live-code guards from ui_play_loop_review1.
// Legacy runtime tests (L1/R1/R2: legacy boot + playback engine + mock DOM)
// were removed with the dead legacy tab/timeline view: the Svelte app owns
// boot, focus, and playback stepping (see lib/services/appWorkflow.js and
// lib/stores/timeline.svelte.js, covered by stores/app-workflow.test.js).
// Kept: source-text guards pinning live services/presetLoader.js behavior.
import { test, expect, describe } from "bun:test";
import { readSrcText } from "../helpers/cssText.js";

describe("UI Play-Loop Review 1 (m6, R5 — live guards)", () => {
  test("m6: Background preset update defers to _pendingNwp when window is not active", () => {
    const presetLoaderContent = readSrcText("services/presetLoader.js");

    expect(presetLoaderContent).toContain("if (getActiveWindow() === win) {");
    expect(presetLoaderContent).toContain("win._pendingNwp = nwpPayload;");
  });

  test("R5: P0 guard skips obs re-sync on time-step ticks with a valid file", () => {
    const presetLoaderContent = readSrcText("services/presetLoader.js");

    expect(presetLoaderContent).toContain("freshObsLoad");
    expect(presetLoaderContent).toContain("if (!file || freshObsLoad");
  });
});
