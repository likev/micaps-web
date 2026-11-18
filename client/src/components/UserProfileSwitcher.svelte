<script>
  import { onMount } from "svelte";
  import {
    userProfile,
    DEFAULT_USER_ID,
    DEFAULT_USER_NAME,
    setActiveUserId,
    fetchUserProfiles,
    createNewUserProfile,
    deleteExistingUserProfile,
    resetActiveUserConfig,
  } from "../lib/stores/userProfile.svelte.js";
  import { loadPresetGroups, CURRENT_CONFIG } from "../config/presets.js";
  import { showToast } from "../lib/stores/ui.svelte.js";
  import { t } from "../lib/stores/i18n.svelte.js";

  let {
    variant = "navbar", // "navbar" | "config"
    onProfileChanged = null,
    onConfigReset = null,
  } = $props();

  let isOpen = $state(false);
  let showNewForm = $state(false);
  let newUserId = $state("");
  let newUserName = $state("");
  let cloneFrom = $state(DEFAULT_USER_ID);
  let copySystemOnCreate = $state(false);
  let isBusy = $state(false);
  let containerRef = $state(null);

  onMount(() => {
    fetchUserProfiles();
  });

  function handleWindowPointerDown(e) {
    if (isOpen && containerRef && !containerRef.contains(e.target)) {
      isOpen = false;
    }
  }

  async function selectProfile(uid, uname = null) {
    if (isBusy) return;
    isBusy = true;
    try {
      setActiveUserId(uid, uname);
      await loadPresetGroups();
      await fetchUserProfiles();
      isOpen = false;
      if (onProfileChanged) {
        await onProfileChanged(uid, CURRENT_CONFIG);
      }
      showToast("info", `${t("user.profile")}: ${uname || uid}`);
    } catch (err) {
      showToast("error", `Failed to switch profile: ${err?.message || err}`);
    } finally {
      isBusy = false;
    }
  }

  async function handleSelectChange(e) {
    const uid = e.target.value;
    const found = userProfile.users.find((u) => u.id === uid);
    await selectProfile(uid, found?.name || uid);
  }

  async function handleCreateSubmit(e) {
    if (e) e.preventDefault();
    if (isBusy || !newUserId.trim()) return;
    isBusy = true;
    try {
      const created = await createNewUserProfile({
        id: newUserId.trim(),
        name: newUserName.trim() || newUserId.trim(),
        cloneFrom: cloneFrom || DEFAULT_USER_ID,
        copySystem: Boolean(copySystemOnCreate && cloneFrom === DEFAULT_USER_ID),
      });
      newUserId = "";
      newUserName = "";
      showNewForm = false;
      setActiveUserId(created.id, created.name);
      await loadPresetGroups();
      await fetchUserProfiles();
      isOpen = false;
      if (onProfileChanged) {
        await onProfileChanged(created.id, CURRENT_CONFIG);
      }
      showToast("success", `Profile "${created.name || created.id}" created.`);
    } catch (err) {
      showToast("error", err?.message || String(err));
    } finally {
      isBusy = false;
    }
  }

  async function handleResetDefault() {
    if (isBusy || userProfile.currentUserId === DEFAULT_USER_ID) return;
    if (typeof confirm === "function" && !confirm(t("user.resetConfirm"))) return;
    isBusy = true;
    try {
      await resetActiveUserConfig("all");
      await loadPresetGroups();
      if (onConfigReset) {
        await onConfigReset(userProfile.currentUserId, CURRENT_CONFIG);
      } else if (onProfileChanged) {
        await onProfileChanged(userProfile.currentUserId, CURRENT_CONFIG);
      }
      showToast("success", "Reset user configuration to System Default.");
    } catch (err) {
      showToast("error", err?.message || String(err));
    } finally {
      isBusy = false;
    }
  }

  async function handleDeleteProfile(uid, name) {
    if (isBusy || uid === DEFAULT_USER_ID) return;
    if (typeof confirm === "function" && !confirm(t("user.deleteConfirm", { name: name || uid }))) return;
    isBusy = true;
    try {
      const wasActive = userProfile.currentUserId === uid;
      await deleteExistingUserProfile(uid);
      if (wasActive) {
        await loadPresetGroups();
        if (onProfileChanged) {
          await onProfileChanged(DEFAULT_USER_ID, CURRENT_CONFIG);
        }
      }
      showToast("info", `Deleted profile "${name || uid}".`);
    } catch (err) {
      showToast("error", err?.message || String(err));
    } finally {
      isBusy = false;
    }
  }
</script>

<svelte:window onpointerdown={handleWindowPointerDown} />

{#if variant === "config"}
  <div id="config-user-bar" class="config-user-bar">
    <label for="config-user-select" class="config-user-label">👤 {t("user.profile")}:</label>
    <select
      id="config-user-select"
      class="config-user-select"
      value={userProfile.currentUserId}
      disabled={isBusy}
      onchange={handleSelectChange}
    >
      {#each userProfile.users as u (u.id)}
        <option value={u.id}>
          {u.id === DEFAULT_USER_ID ? t("user.systemDefault") : (u.name || u.id)}
          {u.hasCustomConfig || u.hasCustomColormaps ? " ★" : ""}
        </option>
      {/each}
    </select>

    <span
      class="config-user-source-pill"
      class:is-custom={userProfile.configSource === "user" || userProfile.colormapsSource === "user"}
      title="Configuration source"
    >
      {userProfile.configSource === "user" || userProfile.colormapsSource === "user"
        ? t("user.customOverride")
        : t("user.inheritingDefault")}
    </span>

    <button
      type="button"
      id="btn-config-new-user"
      class="btn btn-sm"
      disabled={isBusy}
      onclick={() => { showNewForm = !showNewForm; cloneFrom = userProfile.currentUserId; }}
    >
      {t("user.newProfile")}
    </button>

    {#if userProfile.currentUserId !== DEFAULT_USER_ID}
      <button
        type="button"
        id="btn-config-reset-default"
        class="btn btn-sm btn-warning"
        disabled={isBusy}
        title={t("user.resetDefault")}
        onclick={handleResetDefault}
      >
        {t("user.resetDefault")}
      </button>
    {/if}

    {#if showNewForm}
      <form class="config-new-user-inline" onsubmit={handleCreateSubmit}>
        <input
          type="text"
          id="input-config-new-user-id"
          class="user-input-sm"
          placeholder="id (e.g. desk_1)"
          bind:value={newUserId}
          required
        />
        <input
          type="text"
          id="input-config-new-user-name"
          class="user-input-sm"
          placeholder={t("user.profileName")}
          bind:value={newUserName}
        />
        <button type="submit" class="btn btn-sm btn-primary" disabled={isBusy || !newUserId.trim()}>
          {t("user.create")}
        </button>
        <button type="button" class="btn btn-sm" onclick={() => { showNewForm = false; }}>
          ✕
        </button>
      </form>
    {/if}
  </div>
{:else}
  <div id="nav-user-profile" class="nav-user-profile" bind:this={containerRef}>
    <button
      type="button"
      id="btn-user-profile"
      class="btn btn-user-profile"
      class:is-custom-user={userProfile.currentUserId !== DEFAULT_USER_ID}
      aria-haspopup="true"
      aria-expanded={isOpen}
      title={`${t("user.profile")}: ${userProfile.currentUserName}`}
      onclick={() => { isOpen = !isOpen; if (isOpen) fetchUserProfiles(); }}
    >
      <span class="user-icon" aria-hidden="true">👤</span>
      <span class="user-name-text">
        {userProfile.currentUserId === DEFAULT_USER_ID ? t("user.systemDefault") : userProfile.currentUserName}
      </span>
      {#if userProfile.configSource === "user" || userProfile.colormapsSource === "user"}
        <span class="user-custom-dot" title={t("user.customOverride")}></span>
      {/if}
      <span class="dropdown-caret">▾</span>
    </button>

    {#if isOpen}
      <div id="user-profile-dropdown" class="user-profile-dropdown" role="menu">
        <div class="user-dropdown-header">
          <span>{t("user.profile")}</span>
          <button
            type="button"
            class="btn-new-profile-toggle"
            onclick={() => { showNewForm = !showNewForm; cloneFrom = userProfile.currentUserId; }}
          >
            {t("user.newProfile")}
          </button>
        </div>

        <div class="user-list">
          {#each userProfile.users as u (u.id)}
            <div class="user-list-row" class:active={u.id === userProfile.currentUserId}>
              <button
                type="button"
                class="user-select-item"
                role="menuitem"
                data-user-id={u.id}
                disabled={isBusy}
                onclick={() => selectProfile(u.id, u.id === DEFAULT_USER_ID ? DEFAULT_USER_NAME : (u.name || u.id))}
              >
                <span class="user-check">{u.id === userProfile.currentUserId ? "✓" : ""}</span>
                <span class="user-item-name">
                  {u.id === DEFAULT_USER_ID ? t("user.systemDefault") : (u.name || u.id)}
                </span>
                {#if u.hasCustomConfig || u.hasCustomColormaps}
                  <span class="user-badge-custom">★</span>
                {/if}
              </button>
              {#if u.id !== DEFAULT_USER_ID}
                <button
                  type="button"
                  class="user-delete-btn"
                  title={t("user.delete")}
                  disabled={isBusy}
                  onclick={() => handleDeleteProfile(u.id, u.name)}
                >✕</button>
              {/if}
            </div>
          {/each}
        </div>

        {#if userProfile.currentUserId !== DEFAULT_USER_ID}
          <div class="user-dropdown-actions">
            <button
              type="button"
              id="btn-nav-reset-user"
              class="user-action-reset"
              disabled={isBusy}
              onclick={handleResetDefault}
            >
              {t("user.resetDefault")}
            </button>
          </div>
        {/if}

        {#if showNewForm}
          <form class="user-create-form" onsubmit={handleCreateSubmit}>
            <label class="user-form-field">
              <span>{t("user.profileId")}</span>
              <input
                type="text"
                id="input-new-user-id"
                placeholder="forecaster_1"
                bind:value={newUserId}
                required
              />
            </label>
            <label class="user-form-field">
              <span>{t("user.profileName")}</span>
              <input
                type="text"
                id="input-new-user-name"
                placeholder="Forecaster 1"
                bind:value={newUserName}
              />
            </label>
            <label class="user-form-field">
              <span>{t("user.cloneFrom")}</span>
              <select bind:value={cloneFrom}>
                {#each userProfile.users as u (u.id)}
                  <option value={u.id}>{u.id === DEFAULT_USER_ID ? t("user.systemDefault") : (u.name || u.id)}</option>
                {/each}
              </select>
            </label>
            <div class="user-form-buttons">
              <button type="submit" id="btn-create-user-profile" class="btn-create-user" disabled={isBusy || !newUserId.trim()}>
                {t("user.create")}
              </button>
              <button type="button" class="btn-cancel-user" onclick={() => { showNewForm = false; }}>
                {t("user.cancel")}
              </button>
            </div>
          </form>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .nav-user-profile {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .btn-user-profile {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 6px;
    background: var(--bg-card, #21262d);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.14));
    color: var(--text-primary, #e6edf3);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-user-profile.is-custom-user {
    border-color: rgba(88, 166, 255, 0.5);
    color: #79c0ff;
  }

  .user-custom-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #56d364;
  }

  .user-profile-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 240px;
    background: var(--bg-secondary, #161b22);
    border: 1px solid var(--border-color, #30363d);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    padding: 8px;
    z-index: 2000;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .user-dropdown-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary, #8b949e);
    padding: 2px 4px;
  }

  .btn-new-profile-toggle {
    background: rgba(56, 139, 253, 0.15);
    border: 1px solid rgba(56, 139, 253, 0.4);
    color: #58a6ff;
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 10px;
    cursor: pointer;
  }

  .user-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 200px;
    overflow-y: auto;
  }

  .user-list-row {
    display: flex;
    align-items: center;
    gap: 4px;
    border-radius: 5px;
  }

  .user-list-row.active {
    background: rgba(56, 139, 253, 0.16);
  }

  .user-select-item {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    color: var(--text-primary, #e6edf3);
    padding: 5px 6px;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .user-check {
    width: 12px;
    color: #58a6ff;
    font-weight: 700;
  }

  .user-item-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-badge-custom {
    color: #e3b341;
    font-size: 10px;
  }

  .user-delete-btn {
    background: none;
    border: none;
    color: var(--text-secondary, #8b949e);
    cursor: pointer;
    padding: 3px 6px;
    font-size: 11px;
  }

  .user-delete-btn:hover {
    color: #f85149;
  }

  .user-dropdown-actions {
    border-top: 1px solid var(--border-color, #30363d);
    padding-top: 6px;
  }

  .user-action-reset {
    width: 100%;
    padding: 5px 8px;
    border-radius: 5px;
    background: rgba(210, 153, 34, 0.15);
    border: 1px solid rgba(210, 153, 34, 0.4);
    color: #e3b341;
    font-size: 11px;
    cursor: pointer;
  }

  .user-create-form {
    border-top: 1px solid var(--border-color, #30363d);
    padding-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .user-form-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 10px;
    color: var(--text-secondary, #8b949e);
  }

  .user-form-field input,
  .user-form-field select,
  .user-input-sm,
  .config-user-select {
    background: var(--bg-primary, #0d1117);
    border: 1px solid var(--border-color, #30363d);
    border-radius: 4px;
    color: var(--text-primary, #e6edf3);
    padding: 4px 6px;
    font-size: 11px;
  }

  .user-form-buttons {
    display: flex;
    gap: 6px;
  }

  .btn-create-user {
    flex: 1;
    background: #238636;
    border: 1px solid rgba(46, 160, 67, 0.6);
    color: #fff;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
  }

  .btn-cancel-user {
    background: var(--bg-card, #21262d);
    border: 1px solid var(--border-color, #30363d);
    color: var(--text-secondary, #8b949e);
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
  }

  .config-user-bar {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 6px;
    background: var(--bg-primary, #0d1117);
    border: 1px solid var(--border-color, #30363d);
  }

  .config-user-label {
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
    font-weight: 500;
  }

  .config-user-source-pill {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 10px;
    background: var(--bg-card, #21262d);
    color: var(--text-secondary, #8b949e);
    border: 1px solid var(--border-color, #30363d);
  }

  .config-user-source-pill.is-custom {
    background: rgba(56, 139, 253, 0.16);
    color: #79c0ff;
    border-color: rgba(56, 139, 253, 0.45);
  }

  .config-new-user-inline {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .btn-sm {
    padding: 3px 8px;
    font-size: 11px;
  }

  .btn-warning {
    border-color: rgba(210, 153, 34, 0.45);
    color: #e3b341;
  }
</style>
