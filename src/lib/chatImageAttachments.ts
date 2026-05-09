export const chatImageAttachmentMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const chatVideoAttachmentMimeTypes = [
  "video/mp4",
  "video/webm",
  "video/ogg",
] as const;

export const chatMediaAttachmentMimeTypes = [
  ...chatImageAttachmentMimeTypes,
  ...chatVideoAttachmentMimeTypes,
] as const;

export type ChatImageAttachmentMimeType =
  (typeof chatImageAttachmentMimeTypes)[number];

export type ChatVideoAttachmentMimeType =
  (typeof chatVideoAttachmentMimeTypes)[number];

export type ChatMediaAttachmentMimeType =
  (typeof chatMediaAttachmentMimeTypes)[number];

export type ChatMediaAttachmentKind = "image" | "video";

type BaseChatAttachment = {
  dataUrl: string;
  kind?: ChatMediaAttachmentKind;
  name: string;
  size: number;
};

export type ChatImageAttachment = BaseChatAttachment & {
  kind?: "image";
  type: ChatImageAttachmentMimeType;
};

export type ChatVideoAttachment = BaseChatAttachment & {
  kind?: "video";
  type: ChatVideoAttachmentMimeType;
};

export type ChatMediaAttachment = ChatImageAttachment | ChatVideoAttachment;

type ChatMediaAttachmentValidationResult = {
  attachment: ChatMediaAttachment | null;
  error: string;
};

type ChatImageAttachmentValidationResult = {
  attachment: ChatImageAttachment | null;
  error: string;
};

type AttachmentValidationOptions = {
  maxBytes?: number | null;
  tooLargeMessage?: string;
};

const chatAttachmentTypeLabel = "JPG, PNG, WebP, GIF, MP4, WebM, or Ogg";

function getAttachmentDataUrlLimit(maxBytes: number) {
  return Math.ceil((maxBytes * 4) / 3) + 100;
}

function isChatVideoAttachmentMimeType(
  value: string,
): value is ChatVideoAttachmentMimeType {
  return chatVideoAttachmentMimeTypes.some((mimeType) => mimeType === value);
}

function isChatMediaAttachmentMimeType(
  value: string,
): value is ChatMediaAttachmentMimeType {
  return chatMediaAttachmentMimeTypes.some((mimeType) => mimeType === value);
}

export function getChatMediaAttachmentKind(
  attachment: Pick<ChatMediaAttachment, "type">,
): ChatMediaAttachmentKind {
  return isChatVideoAttachmentMimeType(attachment.type) ? "video" : "image";
}

export function isChatVideoAttachment(
  attachment: Pick<ChatMediaAttachment, "type">,
) {
  return getChatMediaAttachmentKind(attachment) === "video";
}

function getBase64ByteLength(base64Value: string) {
  const padding = base64Value.endsWith("==")
    ? 2
    : base64Value.endsWith("=")
      ? 1
      : 0;

  return Math.floor((base64Value.length * 3) / 4) - padding;
}

function cleanAttachmentName(name: string, kind: ChatMediaAttachmentKind) {
  const cleanName = name.trim().replace(/\s+/g, " ").slice(0, 96);

  return cleanName || (kind === "video" ? "attached video" : "attached image");
}

function validateAttachment(
  value: unknown,
  options: AttachmentValidationOptions,
  allowedKind: ChatMediaAttachmentKind | "media",
): ChatMediaAttachmentValidationResult {
  const maxBytes = options.maxBytes ?? null;
  const hasMaxBytes = typeof maxBytes === "number";
  const tooLargeMessage =
    options.tooLargeMessage ?? "Attachment is too large.";

  if (value === undefined || value === null) {
    return {
      attachment: null,
      error: "",
    };
  }

  if (!value || typeof value !== "object") {
    return {
      attachment: null,
      error: "Attachment is invalid.",
    };
  }

  const attachment = value as Partial<ChatMediaAttachment>;

  if (
    typeof attachment.dataUrl !== "string" ||
    typeof attachment.name !== "string" ||
    typeof attachment.size !== "number" ||
    typeof attachment.type !== "string"
  ) {
    return {
      attachment: null,
      error: "Attachment is invalid.",
    };
  }

  if (!isChatMediaAttachmentMimeType(attachment.type)) {
    return {
      attachment: null,
      error: `Choose a ${chatAttachmentTypeLabel} file.`,
    };
  }

  const kind = getChatMediaAttachmentKind({ type: attachment.type });

  if (allowedKind !== "media" && kind !== allowedKind) {
    return {
      attachment: null,
      error:
        allowedKind === "image"
          ? "Choose a JPG, PNG, WebP, or GIF image."
          : "Choose an MP4, WebM, or Ogg video.",
    };
  }

  if (
    !Number.isFinite(attachment.size) ||
    attachment.size <= 0 ||
    (hasMaxBytes && attachment.size > maxBytes)
  ) {
    return {
      attachment: null,
      error: tooLargeMessage,
    };
  }

  if (
    hasMaxBytes &&
    attachment.dataUrl.length > getAttachmentDataUrlLimit(maxBytes)
  ) {
    return {
      attachment: null,
      error: tooLargeMessage,
    };
  }

  const dataUrlMatch = attachment.dataUrl.match(
    /^data:((?:image\/(?:jpeg|png|webp|gif))|(?:video\/(?:mp4|webm|ogg)));base64,([A-Za-z0-9+/=]+)$/u,
  );

  if (!dataUrlMatch || dataUrlMatch[1] !== attachment.type) {
    return {
      attachment: null,
      error: "Attachment is invalid.",
    };
  }

  const decodedSize = getBase64ByteLength(dataUrlMatch[2]);

  if (decodedSize <= 0 || (hasMaxBytes && decodedSize > maxBytes)) {
    return {
      attachment: null,
      error: tooLargeMessage,
    };
  }

  return {
    attachment: {
      dataUrl: attachment.dataUrl,
      kind,
      name: cleanAttachmentName(attachment.name, kind),
      size: decodedSize,
      type: attachment.type,
    } as ChatMediaAttachment,
    error: "",
  };
}

export function validateOptionalChatMediaAttachment(
  value: unknown,
): ChatMediaAttachmentValidationResult {
  return validateMediaAttachment(value);
}

export function validateOptionalChatImageAttachment(
  value: unknown,
): ChatImageAttachmentValidationResult {
  return validateImageAttachment(value);
}

export function validateMediaAttachment(
  value: unknown,
  options: AttachmentValidationOptions = {},
): ChatMediaAttachmentValidationResult {
  return validateAttachment(value, options, "media");
}

export function validateImageAttachment(
  value: unknown,
  options: AttachmentValidationOptions = {},
): ChatImageAttachmentValidationResult {
  const validation = validateAttachment(value, options, "image");

  return {
    attachment: validation.attachment as ChatImageAttachment | null,
    error: validation.error,
  };
}

export function isChatMediaAttachment(
  value: unknown,
): value is ChatMediaAttachment {
  return !validateOptionalChatMediaAttachment(value).error && value != null;
}

export function isChatImageAttachment(
  value: unknown,
): value is ChatImageAttachment {
  return !validateOptionalChatImageAttachment(value).error && value != null;
}
