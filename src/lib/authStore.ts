import { promises as fs } from "node:fs";
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import {
  availabilityStatusOptions,
  profileAvatarImageDataUrlLimit,
  profileAvatarImageMaxBytes,
  profileAvatarImageMimeTypes,
  profileBioLimit,
  profileDisplayNameLimit,
  profileVisibilityOptions,
  themePreferenceOptions,
  type AvailabilityStatus,
  type ProfileVisibility,
  type ThemePreference,
} from "@/lib/profileTypes";

const scrypt = promisify(scryptCallback);
const dataDirectory = path.join(process.cwd(), ".data");
const usersFile = path.join(dataDirectory, "users.json");

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
  googleSub?: string;
  authProviders?: Array<"password" | "google">;
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

type CreateUserInput = {
  username: string;
  email: string;
  password: string;
};

type GoogleUserInput = {
  email: string;
  name: string;
  sub: string;
};

type UpdateProfileInput = {
  displayName: string;
  bio: string;
  avatarImage: string;
  profileVisibility: ProfileVisibility;
};

type UpdatePreferencesInput = {
  availabilityStatus: AvailabilityStatus;
  themePreference: ThemePreference;
};

function toPublicUser(user: UserAccount): PublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: normalizeDisplayName(user.displayName || user.username),
    bio: normalizeProfileText(user.bio ?? "", profileBioLimit),
    avatarImage: normalizeAvatarImage(user.avatarImage ?? ""),
    profileVisibility: normalizeProfileVisibility(user.profileVisibility),
    availabilityStatus: normalizeAvailabilityStatus(user.availabilityStatus),
    themePreference: normalizeThemePreference(user.themePreference),
    createdAt: user.createdAt,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeUsername(username: string) {
  return username.trim();
}

function normalizeUsernameKey(username: string) {
  return normalizeUsername(username).toLowerCase();
}

function normalizeDisplayName(displayName: string) {
  return displayName.replace(/\s+/g, " ").trim();
}

function normalizeProfileText(value: string, limit: number) {
  return value.trim().slice(0, limit);
}

function normalizeAvatarImage(value: string) {
  const cleanValue = value.trim();

  return cleanValue.length <= profileAvatarImageDataUrlLimit ? cleanValue : "";
}

function normalizeProfileVisibility(
  value: ProfileVisibility | undefined,
): ProfileVisibility {
  if (value && profileVisibilityOptions.some((option) => option === value)) {
    return value;
  }

  return "friends";
}

function normalizeAvailabilityStatus(
  value: AvailabilityStatus | undefined,
): AvailabilityStatus {
  if (value && availabilityStatusOptions.some((option) => option === value)) {
    return value;
  }

  return "open";
}

function normalizeThemePreference(
  value: ThemePreference | undefined,
): ThemePreference {
  if (value && themePreferenceOptions.some((option) => option === value)) {
    return value;
  }

  return "system";
}

function slugifyUsername(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug || "connect_user";
}

async function hashPassword(password: string, salt: string) {
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

  return derivedKey.toString("hex");
}

async function readUsers() {
  try {
    const file = await fs.readFile(usersFile, "utf8");
    const parsed: unknown = JSON.parse(file);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isUserAccount);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeUsers(users: UserAccount[]) {
  await fs.mkdir(dataDirectory, { recursive: true });

  const temporaryFile = `${usersFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(users, null, 2), "utf8");
  await fs.rename(temporaryFile, usersFile);
}

export async function createUser({ username, email, password }: CreateUserInput) {
  const cleanUsername = normalizeUsername(username);
  const cleanUsernameKey = normalizeUsernameKey(username);
  const cleanEmail = normalizeEmail(email);

  if (cleanUsername.length < 3 || cleanUsername.length > 24) {
    return {
      error: "Username must be between 3 and 24 characters.",
      user: null,
    };
  }

  if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
    return {
      error: "Username can only use letters, numbers, and underscores.",
      user: null,
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return {
      error: "Enter a valid email address.",
      user: null,
    };
  }

  if (password.length < 8) {
    return {
      error: "Password must be at least 8 characters.",
      user: null,
    };
  }

  const users = await readUsers();

  if (users.some((user) => user.email === cleanEmail)) {
    return {
      error: "An account with this email already exists.",
      user: null,
    };
  }

  if (
    users.some((user) => normalizeUsernameKey(user.username) === cleanUsernameKey)
  ) {
    return {
      error: "This username is already taken.",
      user: null,
    };
  }

  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(password, passwordSalt);
  const user: UserAccount = {
    id: randomUUID(),
    username: cleanUsername,
    email: cleanEmail,
    displayName: cleanUsername,
    profileVisibility: "friends",
    availabilityStatus: "open",
    themePreference: "system",
    passwordHash,
    passwordSalt,
    authProviders: ["password"],
    createdAt: new Date().toISOString(),
  };

  await writeUsers([...users, user]);

  return {
    error: "",
    user: toPublicUser(user),
  };
}

export async function verifyUser(email: string, password: string) {
  const cleanEmail = normalizeEmail(email);
  const users = await readUsers();
  const user = users.find((currentUser) => currentUser.email === cleanEmail);

  if (!user?.passwordHash || !user.passwordSalt) {
    return null;
  }

  const attemptedHash = await hashPassword(password, user.passwordSalt);
  const savedHash = Buffer.from(user.passwordHash, "hex");
  const attemptedHashBuffer = Buffer.from(attemptedHash, "hex");

  if (
    savedHash.length !== attemptedHashBuffer.length ||
    !timingSafeEqual(savedHash, attemptedHashBuffer)
  ) {
    return null;
  }

  return toPublicUser(user);
}

export async function findOrCreateGoogleUser({ email, name, sub }: GoogleUserInput) {
  const cleanEmail = normalizeEmail(email);
  const users = await readUsers();
  const existingGoogleUser = users.find((user) => user.googleSub === sub);

  if (existingGoogleUser) {
    return toPublicUser(existingGoogleUser);
  }

  const existingEmailUser = users.find((user) => user.email === cleanEmail);

  if (existingEmailUser) {
    const linkedUser: UserAccount = {
      ...existingEmailUser,
      googleSub: sub,
      authProviders: Array.from(
        new Set([...(existingEmailUser.authProviders ?? ["password"]), "google"]),
      ),
    };
    const nextUsers = users.map((user) =>
      user.id === linkedUser.id ? linkedUser : user,
    );

    await writeUsers(nextUsers);

    return toPublicUser(linkedUser);
  }

  const username = createUniqueUsername(name || cleanEmail.split("@")[0], users);
  const user: UserAccount = {
    id: randomUUID(),
    username,
    email: cleanEmail,
    displayName: normalizeDisplayName(name) || username,
    profileVisibility: "friends",
    availabilityStatus: "open",
    themePreference: "system",
    googleSub: sub,
    authProviders: ["google"],
    createdAt: new Date().toISOString(),
  };

  await writeUsers([...users, user]);

  return toPublicUser(user);
}

export async function getUserById(userId: string) {
  const users = await readUsers();
  const user = users.find((currentUser) => currentUser.id === userId);

  return user ? toPublicUser(user) : null;
}

export async function getUserByUsername(username: string) {
  const cleanUsernameKey = normalizeUsernameKey(username);
  const users = await readUsers();
  const user = users.find(
    (currentUser) => normalizeUsernameKey(currentUser.username) === cleanUsernameKey,
  );

  return user ? toPublicUser(user) : null;
}

export async function updateUserProfile(
  userId: string,
  { avatarImage, bio, displayName, profileVisibility }: UpdateProfileInput,
) {
  const users = await readUsers();
  const existingUser = users.find((user) => user.id === userId);

  if (!existingUser) {
    return {
      error: "Profile could not be found.",
      user: null,
    };
  }

  const cleanDisplayName = normalizeDisplayName(displayName);
  const cleanBio = normalizeProfileText(bio, profileBioLimit);
  const cleanAvatarImage = avatarImage.trim();
  const cleanProfileVisibility = normalizeProfileVisibility(profileVisibility);

  if (
    cleanDisplayName.length < 2 ||
    cleanDisplayName.length > profileDisplayNameLimit
  ) {
    return {
      error: `Display name must be between 2 and ${profileDisplayNameLimit} characters.`,
      user: null,
    };
  }

  if (bio.trim().length > profileBioLimit) {
    return {
      error: `Bio must be ${profileBioLimit} characters or fewer.`,
      user: null,
    };
  }

  const avatarValidationError = validateAvatarImage(cleanAvatarImage);

  if (avatarValidationError) {
    return {
      error: avatarValidationError,
      user: null,
    };
  }

  const updatedUser: UserAccount = {
    ...existingUser,
    avatarImage: cleanAvatarImage,
    avatarUrl: undefined,
    bio: cleanBio,
    displayName: cleanDisplayName,
    profileVisibility: cleanProfileVisibility,
  };

  await writeUsers(
    users.map((user) => (user.id === userId ? updatedUser : user)),
  );

  return {
    error: "",
    user: toPublicUser(updatedUser),
  };
}

export async function updateUserPreferences(
  userId: string,
  { availabilityStatus, themePreference }: UpdatePreferencesInput,
) {
  const users = await readUsers();
  const existingUser = users.find((user) => user.id === userId);

  if (!existingUser) {
    return {
      error: "Preferences could not be found.",
      user: null,
    };
  }

  const cleanAvailabilityStatus = normalizeAvailabilityStatus(availabilityStatus);
  const cleanThemePreference = normalizeThemePreference(themePreference);
  const updatedUser: UserAccount = {
    ...existingUser,
    availabilityStatus: cleanAvailabilityStatus,
    themePreference: cleanThemePreference,
  };

  await writeUsers(
    users.map((user) => (user.id === userId ? updatedUser : user)),
  );

  return {
    error: "",
    user: toPublicUser(updatedUser),
  };
}

function validateAvatarImage(avatarImage: string) {
  if (!avatarImage) {
    return "";
  }

  if (avatarImage.length > profileAvatarImageDataUrlLimit) {
    return `Profile image must be ${Math.round(
      profileAvatarImageMaxBytes / 1024,
    )} KB or smaller.`;
  }

  const match = avatarImage.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);

  if (!match) {
    return "Choose an image file from your computer.";
  }

  const mimeType = match[1];

  if (!profileAvatarImageMimeTypes.some((allowedType) => allowedType === mimeType)) {
    return "Profile image must be a JPG, PNG, WebP, or GIF file.";
  }

  const imageBytes = Buffer.from(match[2], "base64");

  if (imageBytes.length > profileAvatarImageMaxBytes) {
    return `Profile image must be ${Math.round(
      profileAvatarImageMaxBytes / 1024,
    )} KB or smaller.`;
  }

  return "";
}

export async function searchUsersByUsername(query: string, options?: {
  excludeUsername?: string;
  limit?: number;
}) {
  const cleanQuery = normalizeUsernameKey(query);

  if (cleanQuery.length < 2) {
    return [];
  }

  const users = await readUsers();
  const excludeUsernameKey = options?.excludeUsername
    ? normalizeUsernameKey(options.excludeUsername)
    : "";
  const limit = options?.limit ?? 8;

  return users
    .filter((user) => {
      const usernameKey = normalizeUsernameKey(user.username);

      return usernameKey !== excludeUsernameKey && usernameKey.includes(cleanQuery);
    })
    .sort((first, second) => {
      const firstUsername = normalizeUsernameKey(first.username);
      const secondUsername = normalizeUsernameKey(second.username);
      const firstStartsWithQuery = firstUsername.startsWith(cleanQuery);
      const secondStartsWithQuery = secondUsername.startsWith(cleanQuery);

      if (firstStartsWithQuery !== secondStartsWithQuery) {
        return firstStartsWithQuery ? -1 : 1;
      }

      return firstUsername.localeCompare(secondUsername);
    })
    .slice(0, limit)
    .map(toPublicUser);
}

function isUserAccount(value: unknown): value is UserAccount {
  if (!value || typeof value !== "object") {
    return false;
  }

  const user = value as Partial<UserAccount>;

  return (
    typeof user.id === "string" &&
    typeof user.username === "string" &&
    typeof user.email === "string" &&
    typeof user.createdAt === "string"
  );
}

function createUniqueUsername(value: string, users: UserAccount[]) {
  const baseUsername = slugifyUsername(value).slice(0, 20);
  const usedUsernames = new Set(
    users.map((user) => normalizeUsernameKey(user.username)),
  );

  if (!usedUsernames.has(baseUsername)) {
    return baseUsername;
  }

  for (let count = 2; count < 1000; count += 1) {
    const suffix = `_${count}`;
    const candidate = `${baseUsername.slice(0, 24 - suffix.length)}${suffix}`;

    if (!usedUsernames.has(candidate)) {
      return candidate;
    }
  }

  return `user_${randomUUID().slice(0, 8)}`;
}
