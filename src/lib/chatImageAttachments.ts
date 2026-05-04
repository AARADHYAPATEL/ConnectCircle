export const chatImageAttachmentMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type ChatImageAttachmentMimeType =
  (typeof chatImageAttachmentMimeTypes)[number];

export type ChatImageAttachment = {
  dataUrl: string;
  name: string;
  size: number;
  type: ChatImageAttachmentMimeType;
};

type ChatImageAttachmentValidationResult = {
  attachment: ChatImageAttachment | null;
  error: string;
};

type ImageAttachmentValidationOptions = {
  maxBytes?: number | null;
  tooLargeMessage?: string;
};

function getImageAttachmentDataUrlLimit(maxBytes: number) {
  return Math.ceil((maxBytes * 4) / 3) + 100;
}

function isChatImageAttachmentMimeType(
  value: string,
): value is ChatImageAttachmentMimeType {
  return chatImageAttachmentMimeTypes.some((mimeType) => mimeType === value);
}

function getBase64ByteLength(base64Value: string) {
  const padding = base64Value.endsWith("==")
    ? 2
    : base64Value.endsWith("=")
      ? 1
      : 0;

  return Math.floor((base64Value.length * 3) / 4) - padding;
}

function cleanAttachmentName(name: string) {
  const cleanName = name.trim().replace(/\s+/g, " ").slice(0, 96);

  return cleanName || "attached image";
}

export function validateOptionalChatImageAttachment(
  value: unknown,
): ChatImageAttachmentValidationResult {
  return validateImageAttachment(value);
}

export function validateImageAttachment(
  value: unknown,
  options: ImageAttachmentValidationOptions = {},
): ChatImageAttachmentValidationResult {
  const maxBytes = options.maxBytes ?? null;
  const hasMaxBytes = typeof maxBytes === "number";
  const tooLargeMessage = options.tooLargeMessage ?? "Image is too large.";

  if (value === undefined || value === null) {
    return {
      attachment: null,
      error: "",
    };
  }

  if (!value || typeof value !== "object") {
    return {
      attachment: null,
      error: "Image attachment is invalid.",
    };
  }

  const attachment = value as Partial<ChatImageAttachment>;

  if (
    typeof attachment.dataUrl !== "string" ||
    typeof attachment.name !== "string" ||
    typeof attachment.size !== "number" ||
    typeof attachment.type !== "string"
  ) {
    return {
      attachment: null,
      error: "Image attachment is invalid.",
    };
  }

  if (!isChatImageAttachmentMimeType(attachment.type)) {
    return {
      attachment: null,
      error: "Choose a JPG, PNG, WebP, or GIF image.",
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
    attachment.dataUrl.length > getImageAttachmentDataUrlLimit(maxBytes)
  ) {
    return {
      attachment: null,
      error: tooLargeMessage,
    };
  }

  const dataUrlMatch = attachment.dataUrl.match(
    /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/u,
  );

  if (!dataUrlMatch || dataUrlMatch[1] !== attachment.type) {
    return {
      attachment: null,
      error: "Image attachment is invalid.",
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
      name: cleanAttachmentName(attachment.name),
      size: decodedSize,
      type: attachment.type,
    },
    error: "",
  };
}

export function isChatImageAttachment(
  value: unknown,
): value is ChatImageAttachment {
  return !validateOptionalChatImageAttachment(value).error && value != null;
}
