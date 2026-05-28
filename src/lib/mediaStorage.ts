import { createHash } from "node:crypto";
import {
  getChatMediaAttachmentKind,
  type ChatMediaAttachment,
} from "@/lib/chatImageAttachments";

type MediaStorageContext = {
  folder: "direct-chat" | "circle-chat";
  messageId: string;
};

type CloudinaryUploadResponse = {
  bytes?: number;
  public_id?: string;
  secure_url?: string;
};

function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() ?? "";
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim() ?? "";
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() ?? "";

  return {
    apiKey,
    apiSecret,
    cloudName,
  };
}

export function isCloudinaryMediaStorageConfigured() {
  const { apiKey, apiSecret, cloudName } = getCloudinaryConfig();

  return Boolean(apiKey && apiSecret && cloudName);
}

function signCloudinaryParameters(parameters: Record<string, string>) {
  const { apiSecret } = getCloudinaryConfig();
  const payload = Object.keys(parameters)
    .sort()
    .map((key) => `${key}=${parameters[key]}`)
    .join("&");

  return createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
}

function getCloudinaryResourceType(attachment: ChatMediaAttachment) {
  return getChatMediaAttachmentKind(attachment) === "video" ? "video" : "image";
}

function cleanPublicIdPart(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "media"
  );
}

export async function uploadMediaAttachment(
  attachment: ChatMediaAttachment | null,
  context: MediaStorageContext,
) {
  if (!attachment || attachment.url || !attachment.dataUrl) {
    return attachment;
  }

  if (!isCloudinaryMediaStorageConfigured()) {
    return attachment;
  }

  const { apiKey, cloudName } = getCloudinaryConfig();
  const resourceType = getCloudinaryResourceType(attachment);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = `connectcircle/${context.folder}`;
  const publicId = `${cleanPublicIdPart(context.messageId)}-${Date.now()}`;
  const signedParameters = {
    folder,
    public_id: publicId,
    timestamp,
  };
  const formData = new FormData();

  formData.append("file", attachment.dataUrl);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp);
  formData.append("folder", folder);
  formData.append("public_id", publicId);
  formData.append("signature", signCloudinaryParameters(signedParameters));

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error("Media could not be uploaded. Try again.");
  }

  const result = (await response.json()) as CloudinaryUploadResponse;

  if (!result.secure_url || !result.public_id) {
    throw new Error("Media upload did not return a usable URL.");
  }

  const kind = getChatMediaAttachmentKind(attachment);
  const storedAttachment = {
    cloudinaryPublicId: result.public_id,
    kind,
    name: attachment.name,
    provider: "cloudinary" as const,
    size: result.bytes ?? attachment.size,
    type: attachment.type,
    url: result.secure_url,
  };

  return storedAttachment as ChatMediaAttachment;
}

export async function deleteMediaAttachment(
  attachment: ChatMediaAttachment | null | undefined,
) {
  if (
    !attachment ||
    attachment.provider !== "cloudinary" ||
    !attachment.cloudinaryPublicId ||
    !isCloudinaryMediaStorageConfigured()
  ) {
    return;
  }

  const { apiKey, cloudName } = getCloudinaryConfig();
  const resourceType = getCloudinaryResourceType(attachment);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signedParameters = {
    public_id: attachment.cloudinaryPublicId,
    timestamp,
  };
  const formData = new FormData();

  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp);
  formData.append("public_id", attachment.cloudinaryPublicId);
  formData.append("signature", signCloudinaryParameters(signedParameters));

  await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`,
    {
      method: "POST",
      body: formData,
    },
  ).catch(() => {});
}
