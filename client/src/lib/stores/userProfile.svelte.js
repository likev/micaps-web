// userProfile.svelte.js - Reactive Svelte 5 multi-user profile store
import {
  USER_STORAGE_KEY,
  USER_NAME_STORAGE_KEY,
  DEFAULT_USER_ID,
  DEFAULT_USER_NAME,
  sanitizeUserId,
  userProfileState,
  subscribeUserProfile,
  notifyUserProfile,
  getActiveUserId,
  getActiveUserProfile,
  setActiveUserId,
  setUserConfigSource,
  getUserRequestHeaders,
  appendUserQueryParam,
  fetchUserProfiles,
  createNewUserProfile,
  deleteExistingUserProfile,
  resetActiveUserConfig,
} from "./userProfileCore.js";

export {
  USER_STORAGE_KEY,
  USER_NAME_STORAGE_KEY,
  DEFAULT_USER_ID,
  DEFAULT_USER_NAME,
  sanitizeUserId,
  userProfileState,
  subscribeUserProfile,
  notifyUserProfile,
  getActiveUserId,
  getActiveUserProfile,
  setActiveUserId,
  setUserConfigSource,
  getUserRequestHeaders,
  appendUserQueryParam,
  fetchUserProfiles,
  createNewUserProfile,
  deleteExistingUserProfile,
  resetActiveUserConfig,
};

export const userProfile = $state({
  currentUserId: userProfileState.currentUserId,
  currentUserName: userProfileState.currentUserName,
  configSource: userProfileState.configSource,
  colormapsSource: userProfileState.colormapsSource,
  users: [...userProfileState.users],
});

subscribeUserProfile((state) => {
  userProfile.currentUserId = state.currentUserId;
  userProfile.currentUserName = state.currentUserName;
  userProfile.configSource = state.configSource;
  userProfile.colormapsSource = state.colormapsSource;
  userProfile.users = Array.isArray(state.users) ? [...state.users] : [];
});
