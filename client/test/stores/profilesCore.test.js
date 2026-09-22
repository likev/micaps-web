// profilesCore.test.js - Profile-panel registry: readiness lifecycle, meta,
// hide-all semantics, and change notifications
import { describe, test, expect } from "bun:test";
import {
  hasProfilePanel,
  getProfileState,
  setProfileState,
  clearProfileState,
  setAllProfilesHidden,
  onProfilesChange,
  snapshotProfiles,
} from "../../src/lib/stores/profilesCore.js";

describe("profile registry lifecycle", () => {
  test("unknown window has no readiness; set creates it; clear removes it", () => {
    expect(hasProfilePanel("timeheight", "nope-win")).toBe(false);
    expect(getProfileState("timeheight", "nope-win")).toBeNull();
    setProfileState("timeheight", "nope-win", { visible: true, mode: "point" });
    expect(hasProfilePanel("timeheight", "nope-win")).toBe(true);
    expect(getProfileState("timeheight", "nope-win")?.mode).toBe("point");
    clearProfileState("timeheight", "nope-win");
    expect(hasProfilePanel("timeheight", "nope-win")).toBe(false);
  });

  test("tlogp singleton readiness is global, not per-window", () => {
    clearProfileState("tlogp"); // singleton is process-global; reset first
    expect(hasProfilePanel("tlogp", "any-win")).toBe(false);
    setProfileState("tlogp", "global", { visible: true, winId: "w1", stationId: "58362" });
    expect(hasProfilePanel("tlogp", "other-win")).toBe(true);
    expect(getProfileState("tlogp")?.stationId).toBe("58362");
    clearProfileState("tlogp");
    expect(hasProfilePanel("tlogp", "any-win")).toBe(false);
  });

  test("setAllProfilesHidden flips visible without creating entries", () => {
    setProfileState("lineheight", "w1", { visible: true });
    setAllProfilesHidden("lineheight");
    expect(getProfileState("lineheight", "w1")?.visible).toBe(false);
    // Never-loaded window gains no readiness from hide-all
    expect(hasProfilePanel("lineheight", "never-loaded")).toBe(false);
    clearProfileState("lineheight", "w1");
  });

  test("mutations notify subscribers; snapshot is a detached copy", () => {
    const seen = [];
    const unsub = onProfilesChange((type, winId) => seen.push([type, winId]));
    setProfileState("hovmoller", "w9", { visible: true });
    expect(seen).toContainEqual(["hovmoller", "w9"]);
    unsub();
    setProfileState("hovmoller", "w9", { visible: false });
    expect(seen.length).toBe(1);

    const snap = snapshotProfiles();
    expect(snap.hovmoller["w9"]?.visible).toBe(false);
    snap.hovmoller["w9"].visible = true; // mutating snapshot must not leak
    expect(getProfileState("hovmoller", "w9")?.visible).toBe(false);
    clearProfileState("hovmoller", "w9");
  });
});
