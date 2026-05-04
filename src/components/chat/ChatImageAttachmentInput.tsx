"use client";

import { useRef } from "react";
import {
  chatImageAttachmentMimeTypes,
  validateImageAttachment,
  type ChatImageAttachment,
} from "@/lib/chatImageAttachments";

type ChatImageAttachmentInputProps = {
  attachment: ChatImageAttachment | null;
  density?: "default" | "compact";
  disabled?: boolean;
  onAttachmentChange: (attachment: ChatImageAttachment | null) => void;
  onError: (error: string) => void;
  tone: "emerald" | "teal";
};

const toneClasses = {
  emerald: {
    button:
      "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100",
    previewBorder: "border-emerald-200",
    previewImage: "border-emerald-100 bg-emerald-50",
  },
  teal: {
    button:
      "border-teal-200 bg-teal-50 text-teal-800 hover:border-teal-300 hover:bg-teal-100",
    previewBorder: "border-teal-200",
    previewImage: "border-teal-100 bg-teal-50",
  },
};

function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Image could not be read."));
    };
    reader.onerror = () => reject(new Error("Image could not be read."));
    reader.readAsDataURL(file);
  });
}

function dataUrlToPngBlob(dataUrl: string) {
  return new Promise<Blob>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Image could not be copied."));
        return;
      }

      context.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("Image could not be copied."));
      }, "image/png");
    };
    image.onerror = () => reject(new Error("Image could not be copied."));
    image.src = dataUrl;
  });
}

async function writeImageBlobToClipboard(blob: Blob) {
  await navigator.clipboard.write([
    new ClipboardItem({
      [blob.type]: blob,
    }),
  ]);
}

export function getClipboardImageFiles(clipboardData: DataTransfer) {
  const itemImageFiles = Array.from(clipboardData.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));

  if (itemImageFiles.length > 0) {
    return itemImageFiles;
  }

  return Array.from(clipboardData.files).filter((file) =>
    file.type.startsWith("image/"),
  );
}

export function getClipboardImageFile(clipboardData: DataTransfer) {
  return getClipboardImageFiles(clipboardData)[0] ?? null;
}

export async function createChatImageAttachmentFromFile(file: File) {
  return createImageAttachmentFromFile(file);
}

export async function createImageAttachmentFromFile(
  file: File,
  options: { maxBytes?: number | null; tooLargeMessage?: string } = {},
) {
  const maxBytes = options.maxBytes ?? null;
  const tooLargeMessage = options.tooLargeMessage ?? "Image is too large.";

  if (!chatImageAttachmentMimeTypes.some((mimeType) => mimeType === file.type)) {
    throw new Error("Choose a JPG, PNG, WebP, or GIF image.");
  }

  if (typeof maxBytes === "number" && file.size > maxBytes) {
    throw new Error(tooLargeMessage);
  }

  const dataUrl = await readFileAsDataUrl(file);
  const validation = validateImageAttachment(
    {
      dataUrl,
      name: file.name || "pasted image",
      size: file.size,
      type: file.type,
    },
    {
      maxBytes,
      tooLargeMessage,
    },
  );

  if (validation.error || !validation.attachment) {
    throw new Error(validation.error || "Image could not be attached.");
  }

  return validation.attachment;
}

export async function copyChatImageAttachmentToClipboard(
  attachment: ChatImageAttachment,
) {
  if (
    typeof ClipboardItem === "undefined" ||
    !navigator.clipboard ||
    typeof navigator.clipboard.write !== "function"
  ) {
    throw new Error("Image copy is not supported in this browser.");
  }

  const response = await fetch(attachment.dataUrl);
  const blob = await response.blob();

  try {
    await writeImageBlobToClipboard(blob);
  } catch {
    const pngBlob = await dataUrlToPngBlob(attachment.dataUrl);
    await writeImageBlobToClipboard(pngBlob);
  }
}

export function ChatImageAttachmentInput({
  attachment,
  density = "default",
  disabled = false,
  onAttachmentChange,
  onError,
  tone,
}: ChatImageAttachmentInputProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const classes = toneClasses[tone];
  const acceptValue = chatImageAttachmentMimeTypes.join(",");
  const isCompact = density === "compact";

  async function handleFileSelection(file: File | undefined) {
    if (!file) {
      return;
    }

    if (!chatImageAttachmentMimeTypes.some((mimeType) => mimeType === file.type)) {
      onError("Choose a JPG, PNG, WebP, or GIF image.");
      return;
    }

    try {
      const attachment = await createChatImageAttachmentFromFile(file);

      onAttachmentChange(attachment);
      onError("");
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Image could not be attached.",
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <div className={isCompact ? "mt-2" : "mt-3"}>
      <input
        accept={acceptValue}
        className="sr-only"
        disabled={disabled}
        onChange={(event) =>
          void handleFileSelection(event.currentTarget.files?.[0])
        }
        ref={fileInputRef}
        type="file"
      />
      <button
        className={`rounded-md border px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
          isCompact ? "py-1.5" : "py-2"
        } ${classes.button}`}
        disabled={disabled}
        onClick={() => fileInputRef.current?.click()}
        type="button"
      >
        Attach image
      </button>

      {attachment ? (
        <div
          className={`flex items-center gap-3 rounded-md border bg-white ${
            isCompact ? "mt-2 p-2" : "mt-3 p-3"
          } ${classes.previewBorder}`}
        >
          <div
            aria-label={attachment.name}
            className={`shrink-0 rounded-md border bg-contain bg-center bg-no-repeat ${
              isCompact ? "h-12 w-16" : "h-16 w-20"
            } ${classes.previewImage}`}
            role="img"
            style={{
              backgroundImage: `url(${JSON.stringify(attachment.dataUrl)})`,
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">
              {attachment.name}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {formatBytes(attachment.size)}
            </p>
          </div>
          <button
            className="btn btn-danger btn-sm shrink-0"
            disabled={disabled}
            onClick={() => {
              onAttachmentChange(null);
              onError("");
            }}
            type="button"
          >
            Remove
          </button>
        </div>
      ) : null}
    </div>
  );
}
