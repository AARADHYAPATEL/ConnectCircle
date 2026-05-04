"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  emojiShortcodeOptions,
  type EmojiShortcodeName,
  type EmojiShortcodeOption,
} from "@/lib/emojiShortcodes";

type EmojiPickerProps = {
  disabled?: boolean;
  onSelect: (option: EmojiShortcodeOption) => void;
  size?: "default" | "compact";
};

type EmojiGroup = {
  label: string;
  names: EmojiShortcodeName[];
};

const emojiGroups: EmojiGroup[] = [
  {
    label: "Faces",
    names: [
      "smile",
      "grin",
      "laugh",
      "joy",
      "rofl",
      "blush",
      "wink",
      "heart_eyes",
      "sunglasses",
      "thinking",
      "confused",
      "sad",
      "cry",
      "sob",
      "angry",
    ],
  },
  {
    label: "Care",
    names: ["heart", "broken_heart", "hug", "pray", "flower", "rainbow"],
  },
  {
    label: "Energy",
    names: ["sparkles", "star", "fire", "rocket", "party", "100"],
  },
  {
    label: "Gestures",
    names: ["wave", "thumbs_up", "thumbs_down", "clap", "ok_hand", "eyes"],
  },
  {
    label: "Moments",
    names: ["sun", "moon", "cloud", "coffee", "check", "x", "skull"],
  },
];

const optionsByName = new Map(
  emojiShortcodeOptions.map((option) => [option.name, option]),
);

function SmileIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8.5 9.5h.01M15.5 9.5h.01M8.8 14.2c1.7 2 4.7 2 6.4 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function EmojiPicker({
  disabled = false,
  onSelect,
  size = "default",
}: EmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const filteredOptions = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();

    if (!cleanQuery) {
      return [];
    }

    return emojiShortcodeOptions.filter((option) =>
      option.name.includes(cleanQuery),
    );
  }, [query]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function selectEmoji(option: EmojiShortcodeOption) {
    onSelect(option);
  }

  const buttonSizeClass =
    size === "compact" ? "h-9 w-9" : "h-12 w-12";
  const pickerWidthClass =
    size === "compact"
      ? "w-[min(18rem,calc(100vw-2rem))]"
      : "w-[min(22rem,calc(100vw-2rem))]";

  return (
    <div className="relative" ref={pickerRef}>
      <button
        aria-expanded={isOpen}
        aria-label="Choose emoji"
        className={`flex ${buttonSizeClass} shrink-0 items-center justify-center rounded-md border text-slate-600 shadow-sm transition ${
          isOpen
            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
            : "border-slate-300 bg-slate-50 hover:border-emerald-300 hover:bg-white hover:text-emerald-800"
        }`}
        disabled={disabled}
        onClick={() => setIsOpen((currentState) => !currentState)}
        title="Emoji"
        type="button"
      >
        <SmileIcon />
      </button>

      {isOpen ? (
        <div className={`emoji-picker absolute bottom-full left-0 z-30 mb-3 ${pickerWidthClass} overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/15`}>
          <div className="border-b border-slate-200 bg-slate-50 p-3">
            <input
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search emoji"
              value={query}
            />
          </div>

          <div className="max-h-72 overflow-y-auto p-3">
            {query.trim() ? (
              <EmojiGrid
                label="Matches"
                onSelect={selectEmoji}
                options={filteredOptions}
              />
            ) : (
              <div className="grid gap-4">
                {emojiGroups.map((group) => (
                  <EmojiGrid
                    key={group.label}
                    label={group.label}
                    onSelect={selectEmoji}
                    options={group.names
                      .map((name) => optionsByName.get(name))
                      .filter(
                        (option): option is EmojiShortcodeOption =>
                          Boolean(option),
                      )}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EmojiGrid({
  label,
  onSelect,
  options,
}: {
  label: string;
  onSelect: (option: EmojiShortcodeOption) => void;
  options: EmojiShortcodeOption[];
}) {
  if (options.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-500">
        No emoji found.
      </p>
    );
  }

  return (
    <section>
      <p className="mb-2 text-xs font-black uppercase tracking-normal text-slate-500">
        {label}
      </p>
      <div className="grid grid-cols-8 gap-1.5">
        {options.map((option) => (
          <button
            aria-label={option.shortcode}
            className="grid h-9 w-9 place-items-center rounded-md text-xl transition hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            key={option.shortcode}
            onClick={() => onSelect(option)}
            title={option.shortcode}
            type="button"
          >
            {option.emoji}
          </button>
        ))}
      </div>
    </section>
  );
}
