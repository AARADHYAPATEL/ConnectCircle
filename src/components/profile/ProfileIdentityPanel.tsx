"use client";

import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";
import {
  profileAvatarImageMaxBytes,
  profileAvatarImageMimeTypes,
  profileBioLimit,
  profileDisplayNameLimit,
  type ProfileVisibility,
} from "@/lib/profileTypes";

type ProfileUser = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  bio: string;
  avatarImage: string;
  profileVisibility: ProfileVisibility;
  createdAt: string;
};

type ProfileResponse = {
  error?: string;
  user?: ProfileUser;
};

type ProfileIdentityPanelProps = {
  initialUser: ProfileUser;
};

const visibilityOptions: Array<{
  description: string;
  label: string;
  value: ProfileVisibility;
}> = [
  {
    description:
      "People can see your display name, profile image, and bio when they find you.",
    label: "Everyone",
    value: "public",
  },
  {
    description:
      "Only accepted friends can see your display name, profile image, and bio.",
    label: "Friends only",
    value: "friends",
  },
  {
    description:
      "Only you can see your profile details. Others see your username only.",
    label: "Only me",
    value: "private",
  },
];

function formatJoinedDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function getInitials(displayName: string, username: string) {
  const words = (displayName || username)
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2);
  const initials = words.map((word) => word[0]?.toUpperCase()).join("");

  return initials || username[0]?.toUpperCase() || "C";
}

function formatFileSize(bytes: number) {
  return `${Math.round(bytes / 1024)} KB`;
}

function getVisibilityLabel(value: ProfileVisibility) {
  return (
    visibilityOptions.find((option) => option.value === value)?.label ??
    "Friends only"
  );
}

export function ProfileIdentityPanel({
  initialUser,
}: ProfileIdentityPanelProps) {
  const [user, setUser] = useState(initialUser);
  const [displayName, setDisplayName] = useState(initialUser.displayName);
  const [bio, setBio] = useState(initialUser.bio);
  const [avatarImage, setAvatarImage] = useState(initialUser.avatarImage);
  const [profileVisibility, setProfileVisibility] = useState(
    initialUser.profileVisibility,
  );
  const [selectedAvatarFileName, setSelectedAvatarFileName] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const cleanDisplayName = displayName.trim();
  const canSave = cleanDisplayName.length >= 2 && !isSaving;
  const initials = useMemo(
    () => getInitials(user.displayName, user.username),
    [user.displayName, user.username],
  );
  const previewAvatarImage = isEditing ? avatarImage : user.avatarImage;
  const avatarStyle = previewAvatarImage
    ? { backgroundImage: `url(${JSON.stringify(previewAvatarImage)})` }
    : undefined;

  function handleCancel() {
    setDisplayName(user.displayName);
    setBio(user.bio);
    setAvatarImage(user.avatarImage);
    setProfileVisibility(user.profileVisibility);
    setSelectedAvatarFileName("");
    setFileInputKey((currentKey) => currentKey + 1);
    setError("");
    setSuccessMessage("");
    setIsEditing(false);
  }

  function handleAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError("");
    setSuccessMessage("");

    if (
      !profileAvatarImageMimeTypes.some(
        (allowedType) => allowedType === file.type,
      )
    ) {
      setError("Choose a JPG, PNG, WebP, or GIF image.");
      setFileInputKey((currentKey) => currentKey + 1);
      return;
    }

    if (file.size > profileAvatarImageMaxBytes) {
      setError(
        `Choose an image ${formatFileSize(profileAvatarImageMaxBytes)} or smaller.`,
      );
      setFileInputKey((currentKey) => currentKey + 1);
      return;
    }

    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        setError("We could not read that image file.");
        return;
      }

      setAvatarImage(reader.result);
      setSelectedAvatarFileName(file.name);
    });
    reader.addEventListener("error", () => {
      setError("We could not read that image file.");
    });
    reader.readAsDataURL(file);
  }

  function handleRemoveAvatarImage() {
    setAvatarImage("");
    setSelectedAvatarFileName("");
    setFileInputKey((currentKey) => currentKey + 1);
    setError("");
    setSuccessMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSave) {
      return;
    }

    setIsSaving(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          avatarImage,
          bio,
          displayName,
          profileVisibility,
        }),
      });
      const data = (await response.json()) as ProfileResponse;

      if (!response.ok || !data.user) {
        setError(data.error ?? "Profile could not be updated.");
        return;
      }

      setUser(data.user);
      setDisplayName(data.user.displayName);
      setBio(data.user.bio);
      setAvatarImage(data.user.avatarImage);
      setProfileVisibility(data.user.profileVisibility);
      setSelectedAvatarFileName("");
      setFileInputKey((currentKey) => currentKey + 1);
      setIsEditing(false);
      setSuccessMessage("Profile updated.");
    } catch {
      setError("We could not reach the profile service.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <article className="motion-panel rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div
            aria-label={`${user.displayName} profile avatar`}
            className={`grid h-24 w-24 shrink-0 place-items-center rounded-md border border-teal-200 bg-teal-50 bg-cover bg-center text-3xl font-black text-teal-800 shadow-sm ${
              previewAvatarImage ? "" : "bg-none"
            }`}
            role="img"
            style={avatarStyle}
          >
            {previewAvatarImage ? null : initials}
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setError("");
              setSuccessMessage("");
              setIsEditing(true);
            }}
            type="button"
          >
            Edit profile
          </button>
        </div>

        <div className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-normal text-slate-500">
            Display name
          </p>
          <h2 className="mt-2 break-words text-3xl font-bold text-slate-950">
            {user.displayName}
          </h2>
          <p className="mt-2 text-sm font-semibold text-teal-800">
            @{user.username}
          </p>
        </div>

        <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold uppercase tracking-normal text-slate-500">
            About
          </p>
          <p className="mt-2 leading-7 text-slate-700">
            {user.bio || "No bio added yet."}
          </p>
        </div>

        <dl className="mt-5 grid gap-3 text-sm">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <dt className="font-semibold uppercase tracking-normal text-slate-500">
              Joined
            </dt>
            <dd className="mt-1 font-bold text-slate-950">
              {formatJoinedDate(user.createdAt)}
            </dd>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <dt className="font-semibold uppercase tracking-normal text-slate-500">
              Visibility
            </dt>
            <dd className="mt-1 font-bold text-slate-950">
              {getVisibilityLabel(user.profileVisibility)}
            </dd>
          </div>
        </dl>

        {successMessage ? (
          <p className="mt-4 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm font-semibold text-teal-900">
            {successMessage}
          </p>
        ) : null}
      </article>

      <form
        className="rounded-md border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={handleSubmit}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
              Identity details
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              {isEditing ? "Update your profile" : "Profile details"}
            </h2>
          </div>
          {!isEditing ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setIsEditing(true)}
              type="button"
            >
              Edit
            </button>
          ) : null}
        </div>

        <label className="mt-5 block text-sm font-semibold text-slate-700">
          Display name
          <input
            className="mt-2 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!isEditing}
            maxLength={profileDisplayNameLimit}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Your name"
            value={displayName}
          />
        </label>
        <p className="mt-1 text-right text-xs font-semibold text-slate-500">
          {displayName.length}/{profileDisplayNameLimit}
        </p>

        <label className="mt-4 block text-sm font-semibold text-slate-700">
          Profile image
          <input
            accept={profileAvatarImageMimeTypes.join(",")}
            className="mt-2 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none file:mr-4 file:rounded-md file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-bold file:text-teal-800 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!isEditing}
            key={fileInputKey}
            onChange={handleAvatarFileChange}
            type="file"
          />
        </label>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-500">
            {selectedAvatarFileName
              ? selectedAvatarFileName
              : avatarImage
                ? "Profile image selected."
                : `JPG, PNG, WebP, or GIF. Max ${formatFileSize(
                    profileAvatarImageMaxBytes,
                  )}.`}
          </p>
          {isEditing && avatarImage ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleRemoveAvatarImage}
              type="button"
            >
              Remove image
            </button>
          ) : null}
        </div>

        <label className="mt-4 block text-sm font-semibold text-slate-700">
          About me
          <textarea
            className="mt-2 min-h-36 w-full resize-none rounded-md border border-slate-300 bg-slate-50 p-3 text-sm leading-6 text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!isEditing}
            maxLength={profileBioLimit}
            onChange={(event) => setBio(event.target.value)}
            placeholder="A short note about who you are or how friends know you."
            value={bio}
          />
        </label>
        <p className="mt-1 text-right text-xs font-semibold text-slate-500">
          {bio.length}/{profileBioLimit}
        </p>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-slate-700">
            Profile visibility
          </legend>
          <div className="mt-3 grid gap-3">
            {visibilityOptions.map((option) => (
              <label
                className={`flex items-start gap-3 rounded-md border p-4 transition ${
                  profileVisibility === option.value
                    ? "border-teal-300 bg-teal-50"
                    : "border-slate-200 bg-slate-50"
                } ${
                  isEditing
                    ? "cursor-pointer hover:border-teal-300 hover:bg-teal-50"
                    : "cursor-not-allowed opacity-75"
                }`}
                key={option.value}
              >
                <input
                  checked={profileVisibility === option.value}
                  className="mt-1 accent-teal-700"
                  disabled={!isEditing}
                  name="profileVisibility"
                  onChange={() => setProfileVisibility(option.value)}
                  type="radio"
                  value={option.value}
                />
                <span>
                  <span className="block text-sm font-bold text-slate-950">
                    {option.label}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {error ? (
          <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
            {error}
          </p>
        ) : null}

        {isEditing ? (
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="btn btn-primary" disabled={!canSave} type="submit">
              {isSaving ? "Saving..." : "Save profile"}
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleCancel}
              type="button"
            >
              Cancel
            </button>
          </div>
        ) : (
          <p className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">
            Your username is permanent for now. Display name, bio, and avatar
            image can be updated here.
          </p>
        )}
      </form>
    </div>
  );
}
