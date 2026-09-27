"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { controlClass } from "@/shared/ui";

/**
 * The Git screen's inline confirms (commit, restore, discard) share one shape: every pair
 * and door sits on the chip `lg` step, and only the tone says which decision it is.
 */
export const CONFIRM_PRIMARY_CLASS = controlClass({
  shape: "chip",
  size: "lg",
  tone: "onAccent",
  className: "border-transparent",
});
const CONFIRM_DANGER_CLASS = controlClass({
  shape: "chip",
  size: "lg",
  tone: "danger",
  className: "border-[color:var(--color-danger-text)]",
});
export const CONFIRM_CANCEL_CLASS = controlClass({
  shape: "chip",
  size: "lg",
  tone: "secondary",
  hoverInk: "strong",
  hoverBorder: "strong",
  className: "border-[color:var(--color-border-soft)]",
});
/** A document's own door — quiet at rest, the same height and type as the pair it opens. */
const DOCUMENT_DOOR_CLASS = controlClass({
  shape: "chip",
  size: "lg",
  tone: "secondary",
  hoverInk: "strong",
  hoverBorder: "strong",
  className: "self-start border-[color:var(--color-border-soft)]",
});

/**
 * Focus for a confirm that swaps in where its trigger stood. The trigger unmounts on press,
 * or focus would fall to `<body>`; opening focuses the step, and Escape or cancel returns
 * focus to the opener if still mounted, else to the restored trigger.
 */
export function useInlineConfirmFocus(
  open: boolean,
  setOpen: (open: boolean) => void,
  {
    busy = false,
    returnTo = "opener",
  }: {
    busy?: boolean;
    /**
     * `trigger` always returns to the door the step replaced. `opener` prefers whatever held
     * focus when the step opened (a Push that stays mounted), falling back to the trigger.
     * WebKit does not focus a pressed button, so "whatever held focus" can be an unrelated
     * row there; a step with exactly one door uses `trigger`.
     */
    returnTo?: "opener" | "trigger";
  } = {},
) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const initialRef = useRef<HTMLElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef(false);
  const wasOpenRef = useRef(open);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const active = typeof document === "undefined" ? null : document.activeElement;
      openerRef.current =
        active instanceof HTMLElement && active !== document.body && active.isConnected ? active : null;
      initialRef.current?.focus();
    }
    if (!open && wasOpenRef.current && returnFocusRef.current) {
      returnFocusRef.current = false;
      const opener = openerRef.current;
      const target =
        returnTo === "opener" && opener && opener.isConnected && !(opener as HTMLButtonElement).disabled
          ? opener
          : triggerRef.current;
      target?.focus();
      openerRef.current = null;
    }
    wasOpenRef.current = open;
  }, [open, returnTo]);

  /** Close and hand focus back — cancel, Escape, and a finished confirm all go through here. */
  const close = useCallback(() => {
    returnFocusRef.current = true;
    setOpen(false);
  }, [setOpen]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    },
    [busy, close],
  );

  return { triggerRef, initialRef, close, onKeyDown };
}

/**
 * One document's restore or discard confirm: a door that opens into a full-width card with
 * the consequence and one pair, left-aligned under the document's metadata.
 */
export function DocumentConfirmStep({
  testIdPrefix,
  doorLabel,
  lead,
  confirmLabel,
  busyLabel,
  cancelLabel,
  tone,
  busy,
  onConfirm,
  children,
}: {
  /** `atlas-git-discard` or `atlas-git-restore`; suffixes `-step`, `-confirm`, `-cancel` follow. */
  testIdPrefix: string;
  doorLabel: string;
  /** Optional words before the door, naming whose document it is. */
  lead?: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  cancelLabel: string;
  tone: "primary" | "danger";
  busy: boolean;
  onConfirm: () => Promise<boolean>;
  /** The consequence, in sentences. */
  children: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const { triggerRef, initialRef, close, onKeyDown } = useInlineConfirmFocus(confirming, setConfirming, {
    busy,
    returnTo: "trigger",
  });
  if (confirming) {
    return (
      <div
        role="group"
        aria-label={doorLabel}
        onKeyDown={onKeyDown}
        className="git-fade-in flex w-full flex-col gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3"
        data-testid={`${testIdPrefix}-step`}
      >
        {children}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid={`${testIdPrefix}-confirm`}
            disabled={busy}
            onClick={() => {
              void onConfirm().then((ok) => {
                if (ok) close();
              });
            }}
            className={tone === "danger" ? CONFIRM_DANGER_CLASS : CONFIRM_PRIMARY_CLASS}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
          {/* The safe answer takes focus when the step opens: Enter on a destructive
              confirm must not be one keystroke away from the door that opened it. */}
          <button
            type="button"
            ref={(node) => {
              initialRef.current = node;
            }}
            data-testid={`${testIdPrefix}-cancel`}
            disabled={busy}
            onClick={close}
            className={CONFIRM_CANCEL_CLASS}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {lead}
      <button
        type="button"
        ref={triggerRef}
        data-testid={testIdPrefix}
        onClick={() => setConfirming(true)}
        className={DOCUMENT_DOOR_CLASS}
      >
        {doorLabel}
      </button>
    </p>
  );
}
