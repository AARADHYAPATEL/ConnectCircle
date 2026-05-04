export const profileDisplayNameLimit = 64;
export const profileBioLimit = 240;
export const profileAvatarImageMaxBytes = 512 * 1024;
export const profileAvatarImageDataUrlLimit =
  Math.ceil((profileAvatarImageMaxBytes * 4) / 3) + 100;
export const profileAvatarImageMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export const profileVisibilityOptions = ["public", "friends", "private"] as const;
export const availabilityStatusOptions = [
  "open",
  "friends_only",
  "taking_space",
  "unavailable",
] as const;
export const themePreferenceOptions = ["system", "light", "dark"] as const;

export type ProfileVisibility = (typeof profileVisibilityOptions)[number];
export type AvailabilityStatus = (typeof availabilityStatusOptions)[number];
export type ThemePreference = (typeof themePreferenceOptions)[number];
