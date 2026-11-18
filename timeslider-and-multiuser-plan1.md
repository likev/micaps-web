# High-Cadence Time Scrubber & Multi-User Workstation Config Design

## Overview

This document describes the architecture and implementation of two features in `micaps-web`:
1. **High-Cadence Scrubbable Time Slider** for sub-hourly observation products (`FY-4B`, `Radar / SWAN`, `Lightning`, `Profiler`, `1–10min Surface`).
2. **Multi-User Workstation Configuration System** with profile switching, fallback-on-read, copy-on-write isolation, cloning, and reset-to-default.

---

## Feature 1: High-Cadence Scrubbable Time Slider

### 1. Problem
The discrete chip strip (`MAX_OBS_CHIPS = 10`) works cleanly for 1h/3h/12h synoptic and NWP products, but covers only 1–2.5 hours at 6–15 minute observation cadences (FY-4B at 15min, SWAN/Radar at 6–10min), making multi-hour scrubbing awkward.

### 2. Design & Auto-Switch Rule
- **Discrete Chips** remain active whenever:
  - Forecast / NWP mode (`currentMode !== "obs"`), OR
  - Observation mode with `stepLength >= 1` (`1h`, `3h`, `6h`, `12h`, `24h`), unless manually toggled to slider (`obsViewMode === "slider"`).
- **Scrubbable Time Scrubber (`ObsTimeScrubber.svelte`)** automatically activates when:
  - `currentMode === "obs"` AND (`stepLength < 1` OR filtered chips > 10 in auto mode), OR
  - Manually toggled to slider via `#sl-btn-toggle-obs-view` (unless manually pinned to `"chips"`).
- **Range Window Selector**:
  - Pills `3h` | `6h` (default) | `24h` | `All` (`OBS_RANGE_WINDOW_OPTIONS = [3, 6, 24, 0]`) filter `allStepFilteredObs` around the latest/active timestamp via `filterObsFilesByRangeWindow`.
- **High-Cadence Step Options (`timelineMath.js`)**:
  - Satellite (`FY-4B`): `[0.25, 0.5, 1, 3, 6, 12]`
  - Radar / SWAN / High-Cadence (`isRadarOrHighCadenceGroup`): `[0.1, 1/6, 0.25, 0.5, 1, 3, 6]` (`6min`, `10min`, `15min`, `30min`, `1h`, `3h`, `6h`)
  - Standard Surface: `[1, 3, 6, 12, 24]`
  - Upper Air: `[12, 24]`
- **Scrubbing, Stepping & Prefetch**:
  - `timelineCore.js` stores `obsRangeHours`, `obsViewMode`, `sliderObsFiles`, `currentSliderObsIdx`, updated via `syncSliderObsFiles(tl, allFiltered, targetFile)`.
  - `stepWindowTimeline`, `getAdjacentTimeSteps`, and `getFollowingTimeSteps` traverse the full `sliderObsFiles` range (including timestamp-based or index-based `loopRange` bounds `A`–`B`) when slider mode is active, while keeping `tl.obsFiles` (10-chip window) synchronized.
  - Pointer drag scrubbing throttles live frame emissions to `80ms` while showing an instantaneous hover timestamp tooltip, committing cleanly on release.

---

## Feature 2: Multi-User Workstation Profile Configuration

### 1. User Identification & UX
- Lightweight Workstation Profile Switcher (`UserProfileSwitcher.svelte`) in `NavBar.svelte` (`variant="navbar"`) and `ConfigEditor.svelte` (`variant="config"`).
- Active user ID is persisted in browser `localStorage` (`micaps-user-id`) and propagated on API requests via:
  - Header: `X-Micaps-User: <userId>`
  - Query param fallback: `?user=<userId>`
- No passwords or external auth dependencies are introduced; empty or `"default"` resolves to `"System Default"`.

### 2. Storage & Copy-on-Write Model
- **System Defaults**: `client/config.json` and `client/colormaps.json` remain the shared read-only fallback base for named users.
- **Per-User Directory**: `server/config/config.go` configures `UsersDir` (`USERS_DIR` env var or `-users-dir` CLI flag, default `"./users"`, gitignored).
  - `<UsersDir>/<userId>/config.json` (written only when that user saves presets/settings)
  - `<UsersDir>/<userId>/colormaps.json` (written only when that user saves colormaps)
  - `<UsersDir>/<userId>/meta.json` (`id`, `name`, `hasCustomConfig`, `hasCustomColormaps`, `favorites`, `updatedAt`)
- **HTTP Response Provenance**:
  - `GET / POST / PUT /api/config` and `/api/colormaps` return `X-Micaps-User` and `X-Micaps-Config-Source` (`"user"` or `"system"`).
- **Profile Management & Reset Endpoints (`user_config_handler.go`)**:
  - `GET /api/users`: Lists `default` + all sanitized user profiles under `UsersDir`.
  - `POST / PUT /api/users`: Creates/updates a profile and optionally clones `config.json` & `colormaps.json` from `"default"` (`copySystem: true`) or another user (`cloneFrom`).
  - `DELETE /api/users?user=<id>`: Deletes a custom user profile directory (`default` is protected).
  - `POST / DELETE /api/config/reset`: Removes per-user `config.json` and/or `colormaps.json` overrides (`target`: `"config" | "colormaps" | "all"`) so the profile falls back cleanly to system defaults.
- **Per-User Favorites**: `presetFavorites.svelte.js` namespaces `micaps-pinned-presets` and `micaps-recent-presets` per active `userId` and automatically refreshes on profile switches.
