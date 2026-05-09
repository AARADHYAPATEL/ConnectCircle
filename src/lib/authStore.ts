import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
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
import {
  findUserAccountByEmail,
  findUserAccountByGoogleSub,
  findUserAccountById,
  findUserAccountByUsernameKey,
  getAllUserAccounts,
  clearUserLoginFailures,
  getUserLoginLockedError,
  insertUserAccount,
  recordUserLoginFailure,
  searchUserAccountsByUsername,
  updateUserAccount,
} from "@/lib/userAccountStore";
import type { PublicUser, UserAccount } from "@/lib/userAccountTypes";

export type { PublicUser, UserAccount } from "@/lib/userAccountTypes";

const currentPasswordAlgorithm = "scrypt:N=131072:r=8:p=1:keylen=64";
const legacyPasswordAlgorithm = "scrypt:legacy-node-defaults:keylen=64";
const passwordSaltBytes = 32;
const passwordMaxLength = 128;

type ScryptParameters = {
  N?: number;
  keylen: number;
  maxmem?: number;
  p?: number;
  r?: number;
};

type ScryptOptions = Omit<ScryptParameters, "keylen">;

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

type VerifyUserResult = {
  error: string;
  status: number;
  user: PublicUser | null;
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

function getPasswordAlgorithmParameters(
  algorithm: string | undefined,
): ScryptParameters {
  if (algorithm === currentPasswordAlgorithm) {
    return {
      N: 131072,
      keylen: 64,
      maxmem: 160 * 1024 * 1024,
      p: 1,
      r: 8,
    };
  }

  return {
    keylen: 64,
  };
}

async function hashPassword(
  password: string,
  salt: string,
  algorithm = currentPasswordAlgorithm,
) {
  const { keylen, ...options } = getPasswordAlgorithmParameters(algorithm);
  const derivedKey =
    algorithm === legacyPasswordAlgorithm
      ? await runScrypt(password, salt, keylen)
      : await runScrypt(password, salt, keylen, options);

  return derivedKey.toString("hex");
}

function runScrypt(
  password: string,
  salt: string,
  keylen: number,
  options?: ScryptOptions,
) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keylen, options ?? {}, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

async function createPasswordCredential(password: string) {
  const passwordSalt = randomBytes(passwordSaltBytes).toString("hex");
  const passwordHash = await hashPassword(
    password,
    passwordSalt,
    currentPasswordAlgorithm,
  );

  return {
    passwordAlgorithm: currentPasswordAlgorithm,
    passwordHash,
    passwordSalt,
  };
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

  if (password.length < 8 || password.length > passwordMaxLength) {
    return {
      error: `Password must be between 8 and ${passwordMaxLength} characters.`,
      user: null,
    };
  }

  if (await findUserAccountByEmail(cleanEmail)) {
    return {
      error: "An account with this email already exists.",
      user: null,
    };
  }

  if (await findUserAccountByUsernameKey(cleanUsernameKey)) {
    return {
      error: "This username is already taken.",
      user: null,
    };
  }

  const passwordCredential = await createPasswordCredential(password);
  const user: UserAccount = {
    id: randomUUID(),
    username: cleanUsername,
    email: cleanEmail,
    displayName: cleanUsername,
    profileVisibility: "friends",
    availabilityStatus: "open",
    themePreference: "system",
    ...passwordCredential,
    authProviders: ["password"],
    createdAt: new Date().toISOString(),
  };

  try {
    await insertUserAccount(user);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return {
        error: "An account with this email or username already exists.",
        user: null,
      };
    }

    throw error;
  }

  return {
    error: "",
    user: toPublicUser(user),
  };
}

export async function verifyUserCredentials(
  email: string,
  password: string,
): Promise<VerifyUserResult> {
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail || !password) {
    return {
      error: "Enter your email and password.",
      status: 400,
      user: null,
    };
  }

  const lockedError = await getUserLoginLockedError(cleanEmail);

  if (lockedError) {
    return {
      error: lockedError,
      status: 429,
      user: null,
    };
  }

  const user = await findUserAccountByEmail(cleanEmail);
  const genericError = "Email or password is incorrect.";

  if (!user?.passwordHash || !user.passwordSalt) {
    await recordUserLoginFailure(cleanEmail);

    return {
      error: genericError,
      status: 401,
      user: null,
    };
  }

  const passwordAlgorithm = user.passwordAlgorithm ?? legacyPasswordAlgorithm;
  const attemptedHash = await hashPassword(
    password,
    user.passwordSalt,
    passwordAlgorithm,
  );
  const savedHash = Buffer.from(user.passwordHash, "hex");
  const attemptedHashBuffer = Buffer.from(attemptedHash, "hex");

  if (
    savedHash.length !== attemptedHashBuffer.length ||
    !timingSafeEqual(savedHash, attemptedHashBuffer)
  ) {
    await recordUserLoginFailure(cleanEmail);

    return {
      error: genericError,
      status: 401,
      user: null,
    };
  }

  await clearUserLoginFailures(cleanEmail);

  if (passwordAlgorithm !== currentPasswordAlgorithm) {
    await updateUserAccount({
      ...user,
      ...(await createPasswordCredential(password)),
    });
  }

  return {
    error: "",
    status: 200,
    user: toPublicUser(user),
  };
}

export async function verifyUser(email: string, password: string) {
  return (await verifyUserCredentials(email, password)).user;
}

export async function findOrCreateGoogleUser({ email, name, sub }: GoogleUserInput) {
  const cleanEmail = normalizeEmail(email);
  const existingGoogleUser = await findUserAccountByGoogleSub(sub);

  if (existingGoogleUser) {
    return toPublicUser(existingGoogleUser);
  }

  const existingEmailUser = await findUserAccountByEmail(cleanEmail);

  if (existingEmailUser) {
    const linkedUser: UserAccount = {
      ...existingEmailUser,
      googleSub: sub,
      authProviders: Array.from(
        new Set([...(existingEmailUser.authProviders ?? ["password"]), "google"]),
      ),
    };

    await updateUserAccount(linkedUser);

    return toPublicUser(linkedUser);
  }

  const users = await getAllUserAccounts();
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

  await insertUserAccount(user);

  return toPublicUser(user);
}

export async function getUserById(userId: string) {
  const user = await findUserAccountById(userId);

  return user ? toPublicUser(user) : null;
}

export async function getUserByUsername(username: string) {
  const cleanUsernameKey = normalizeUsernameKey(username);
  const user = await findUserAccountByUsernameKey(cleanUsernameKey);

  return user ? toPublicUser(user) : null;
}

export async function updateUserProfile(
  userId: string,
  { avatarImage, bio, displayName, profileVisibility }: UpdateProfileInput,
) {
  const existingUser = await findUserAccountById(userId);

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

  await updateUserAccount(updatedUser);

  return {
    error: "",
    user: toPublicUser(updatedUser),
  };
}

export async function updateUserPreferences(
  userId: string,
  { availabilityStatus, themePreference }: UpdatePreferencesInput,
) {
  const existingUser = await findUserAccountById(userId);

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

  await updateUserAccount(updatedUser);

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

  const excludeUsernameKey = options?.excludeUsername
    ? normalizeUsernameKey(options.excludeUsername)
    : "";
  const limit = options?.limit ?? 8;

  return (
    await searchUserAccountsByUsername({
      excludeUsernameKey,
      limit,
      query: cleanQuery,
    })
  ).map(toPublicUser);
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

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
