"use client";

import { useEffect, useRef, useState } from "react";

type MessageActionsMenuProps = {
  align: "left" | "right";
  canCopyMedia: boolean;
  canDelete: boolean;
  canEdit: boolean;
  canReport?: boolean;
  disabled?: boolean;
  isMediaCopied: boolean;
  mediaKind?: "image" | "video";
  onCopyMedia: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onReport?: () => void;
  surface: "default" | "mine";
};

export function MessageActionsMenu({
  align,
  canCopyMedia,
  canDelete,
  canEdit,
  canReport = false,
  disabled = false,
  isMediaCopied,
  mediaKind = "image",
  onCopyMedia,
  onDelete,
  onEdit,
  onReport,
  surface,
}: MessageActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const hasActions = canCopyMedia || canEdit || canDelete || canReport;
  const isDisabled = disabled || !hasActions;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleDocumentMouseDown(event: MouseEvent) {
      if (
        event.target instanceof Node &&
        menuRef.current?.contains(event.target)
      ) {
        return;
      }

      setIsOpen(false);
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [isOpen]);

  function runAction(action: () => void) {
    setIsOpen(false);
    action();
  }

  const triggerClass =
    surface === "mine"
      ? "rounded-md bg-white/10 px-3 py-1 text-sm font-black text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-60"
      : "rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-black text-slate-700 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-60";

  const panelClass = `absolute bottom-full z-30 mb-2 grid min-w-44 gap-1 rounded-md border border-slate-200 bg-white p-2 shadow-xl shadow-slate-950/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30 ${
    align === "right" ? "right-0" : "left-0"
  }`;

  return (
    <div className="relative inline-flex" ref={menuRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Message actions"
        className={triggerClass}
        disabled={isDisabled}
        onClick={() => setIsOpen((currentIsOpen) => !currentIsOpen)}
        type="button"
      >
        ...
      </button>

      {isOpen ? (
        <div
          className={panelClass}
          role="menu"
          style={{ animation: "panel-enter 180ms var(--ease-fluid) both" }}
        >
          {canCopyMedia ? (
            <button
              className="rounded-md border border-transparent px-3 py-2 text-left text-sm font-bold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 dark:text-slate-200 dark:hover:border-teal-400 dark:hover:bg-teal-950/50 dark:hover:text-teal-50"
              onClick={() => runAction(onCopyMedia)}
              role="menuitem"
              type="button"
            >
              {isMediaCopied
                ? "Copied"
                : mediaKind === "video"
                  ? "Copy video"
                  : "Copy image"}
            </button>
          ) : null}
          {canEdit ? (
            <button
              className="rounded-md border border-transparent px-3 py-2 text-left text-sm font-bold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 dark:text-slate-200 dark:hover:border-teal-400 dark:hover:bg-teal-950/50 dark:hover:text-teal-50"
              onClick={() => runAction(onEdit)}
              role="menuitem"
              type="button"
            >
              Edit
            </button>
          ) : null}
          {canReport && onReport ? (
            <button
              className="rounded-md px-3 py-2 text-left text-sm font-bold text-rose-700 transition hover:bg-rose-50 hover:text-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 dark:text-rose-200 dark:hover:bg-rose-950/40 dark:hover:text-rose-100"
              onClick={() => runAction(onReport)}
              role="menuitem"
              type="button"
            >
              Report
            </button>
          ) : null}
          {canDelete ? (
            <button
              className="rounded-md px-3 py-2 text-left text-sm font-bold text-rose-700 transition hover:bg-rose-50 hover:text-rose-900 dark:text-rose-200 dark:hover:bg-rose-950/40 dark:hover:text-rose-100"
              onClick={() => runAction(onDelete)}
              role="menuitem"
              type="button"
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
