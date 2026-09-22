// profiles.svelte.js - Svelte 5 reactive mirror of the profile-panel registry.
//
// Controllers (plain JS) own their canvas/DOM and record readiness + header
// meta into profilesCore; this module mirrors it into $state so Svelte chrome
// auto-updates with zero manual DOM sync.
import {
  snapshotProfiles,
  onProfilesChange,
} from "./profilesCore.js";

// Reactive profile panels: { tlogp: entry|null, timeheight: {...}, ... }
export const profiles = $state(snapshotProfiles());

export function syncProfilesState() {
  const snap = snapshotProfiles();
  profiles.tlogp = snap.tlogp;
  profiles.timeheight = snap.timeheight;
  profiles.lineheight = snap.lineheight;
  profiles.hovmoller = snap.hovmoller;
}

// Bridge: every core mutation re-mirrors (replaces top-level keys so
// $derived consumers invalidate even though writers are non-reactive).
onProfilesChange(() => {
  try { syncProfilesState(); } catch {}
});

export { snapshotProfiles };
