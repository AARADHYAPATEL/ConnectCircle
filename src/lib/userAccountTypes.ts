import type {
  AvailabilityStatus,
  ProfileVisibility,
  ThemePreference,
} from "@/lib/profileTypes";

export type AuthProvider = "password" | "google";

export type UserAccount = {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  bio?: string;
  avatarImage?: string;
  avatarUrl?: string;
  profileVisibility?: ProfileVisibility;
  availabilityStatus?: AvailabilityStatus;
  themePreference?: ThemePreference;
  passwordHash?: string;
  passwordSalt?: string;
  passwordAlgorithm?: string;
  googleSub?: string;
  authProviders?: AuthProvider[];
  createdAt: string;
};

export type PublicUser = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  bio: string;
  avatarImage: string;
  profileVisibility: ProfileVisibility;
  availabilityStatus: AvailabilityStatus;
  themePreference: ThemePreference;
  createdAt: string;
};
