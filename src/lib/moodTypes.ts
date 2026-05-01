export const moodSuggestions = [
  "Calm",
  "Happy",
  "Excited",
  "Proud",
  "Hopeful",
  "Tired",
  "Stressed",
  "Anxious",
  "Sad",
  "Lonely",
  "Angry",
  "Confused",
] as const;

export const personalAudience = "Only me";
const supportedAudienceValues = [
  personalAudience,
  "Chosen friends",
  "Circle feed",
  "Selected circles",
] as const;

export const supportOptions = [
  "Open to talking",
  "Just encouragement",
  "No advice needed",
  "Check on me later",
] as const;

export type MoodSuggestion = (typeof moodSuggestions)[number];
export type Audience = (typeof supportedAudienceValues)[number];
export type SupportNeed = (typeof supportOptions)[number];

export type NewMoodEntry = {
  mood: string;
  intensity: number;
  audience: Audience;
  supportNeed: SupportNeed;
  note: string;
  sharedCircleIds?: string[];
  sharedWith?: string[];
};

export type SavedMoodEntry = Omit<
  NewMoodEntry,
  "sharedCircleIds" | "sharedWith"
> & {
  id: string;
  username: string;
  createdAt: string;
  sharedCircleIds: string[];
  sharedWith: string[];
};

export const moodLimit = 56;
export const noteLimit = 180;

export function isAudience(value: unknown): value is Audience {
  return supportedAudienceValues.some((option) => option === value);
}

export function isSupportNeed(value: unknown): value is SupportNeed {
  return supportOptions.some((option) => option === value);
}

export function isSavedMoodEntry(value: unknown): value is SavedMoodEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<SavedMoodEntry>;

  return (
    typeof entry.id === "string" &&
    typeof entry.username === "string" &&
    typeof entry.mood === "string" &&
    typeof entry.intensity === "number" &&
    isAudience(entry.audience) &&
    isSupportNeed(entry.supportNeed) &&
    typeof entry.note === "string" &&
    (entry.sharedCircleIds === undefined ||
      (Array.isArray(entry.sharedCircleIds) &&
        entry.sharedCircleIds.every((circleId) => typeof circleId === "string"))) &&
    (entry.sharedWith === undefined ||
      (Array.isArray(entry.sharedWith) &&
        entry.sharedWith.every((username) => typeof username === "string"))) &&
    typeof entry.createdAt === "string"
  );
}
