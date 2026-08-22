"use client";

import { useEffect, useRef, useState } from "react";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { Check, Copy, FileText, GitBranch, MessageCircle, MoreHorizontal } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import { controlClass } from "@/shared/ui/control-class";
import { Surface } from "@/shared/ui/surface";

/**
 * The actions on a "to do" queue row — only the primary action (the map) stays outside; the rest
 * fold into the kebab.
 *
 * It lives here because the meaning-gap sections (undefined meaning, unassigned parent) use the
 * same action set. Two copies would give one kebab different items per surface.
 *
 * ## Labels are **translated** by session ability (never hidden or greyed out)
 *
 * This screen knows nothing about accounts, so it does not distinguish people. Instead it states
 * honestly only what the session can do right now — in a read-only folder "edit in the workshop" is
 * a door that cannot be walked through and becomes "view in the workshop", and in a folder where no
 * agent was observed "verify with an agent" becomes "copy the command to hand over" (passing it to
 * a colleague is this product's original verb, a handoff). Removing the item loses the very fact
 * that the product has such a feature, and a greyed-out disabled button states no reason.
 */

export interface QueueRowActionLabels {
  openSource: string;
  openBuilder: string;
  /** The same slot in a read-only session — view rather than write. */
  openBuilderReadOnly: string;
  handoffCopy: string;
  /** The same slot in a session where no agent was observed — handoff rather than verification. */
  handoffCopyIdle: string;
  handoffCopied: string;
  /** When the clipboard is blocked — silence reads as success. */
  handoffCopyFailed: string;
  /** What to do after copying — the same sentence goes to a screen reader. */
  handoffCopiedHint: string;
  rowMenuTrigger: string;
  /**
   * The slot that hands this row to the map's agent in words. Optional: where there is no agent
   * surface, neither the label nor the address arrives and the item does not appear (a door that
   * will not open is not drawn).
   */
  askAgent?: string;
}

/** The session facts the kebab and the handoff button use to choose labels. */
export interface QueueRowAbilities {
  canWriteVault: boolean;
  agentObserved: boolean;
}

export function resolveBuilderLabel(
  labels: QueueRowActionLabels,
  abilities: QueueRowAbilities,
): string {
  return abilities.canWriteVault ? labels.openBuilder : labels.openBuilderReadOnly;
}

export function resolveHandoffLabel(
  labels: QueueRowActionLabels,
  abilities: QueueRowAbilities,
): string {
  return abilities.agentObserved ? labels.handoffCopy : labels.handoffCopyIdle;
}

export function HandoffCopyButton({
  payload,
  labels,
  abilities,
  candidate,
  onReviewStart,
}: {
  payload: string;
  labels: QueueRowActionLabels;
  abilities: QueueRowAbilities;
  candidate?: { id: string; title: string };
  onReviewStart?: (candidate: { id: string; title: string }) => void;
}) {
  /**
   * The copy result states **both success and failure** (QA 2026-07-28). Clipboard permission can
   * be refused silently, and staying quiet then leaves the user believing it copied — they find out
   * at the paste. It uses the shared three-state hook (no new mechanism).
   */
  const { state: copyState, copy: copyHandoff } = useCopyFeedback(1600);
  const copied = copyState === "copied";
  const label = resolveHandoffLabel(labels, abilities);
  return (
    <>
      <button
        type="button"
        data-testid="do-next-handoff-copy"
        onClick={async () => {
          if (candidate) onReviewStart?.(candidate);
          await copyHandoff(payload);
        }}
        /**
         * **The `compact` prop disappeared on 2026-08-03.** What it chose was one height (30 vs 32),
         * and once the chip ramp converged on 32 the two values became equal. An axis that chooses
         * nothing only adds something to choose, so it was deleted.
         */
        className={controlClass({ hoverInk: 'strong',
          shape: "chip",
          size: "md",
          className: "hover:border-[color:var(--color-indigo-a46)]",
        })}
      >
        {copied ? <Check size={ICON_SIZE.sm} aria-hidden /> : <Copy size={ICON_SIZE.sm} aria-hidden />}
        {copyState === "failed"
          ? labels.handoffCopyFailed
          : copied
            ? labels.handoffCopied
            : label}
      </button>
      {/* A successful copy changes almost nothing on screen — one sentence saying what is now in
          hand and what to do with it is given to assistive tech as well. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {copied ? labels.handoffCopiedHint : ""}
      </span>
    </>
  );
}

export function RowActionMenu({
  sourceHref,
  builderHref,
  askAgentHref,
  handoffPayload,
  candidate,
  onReviewStart,
  abilities,
  labels,
}: {
  sourceHref: string | null;
  builderHref: string;
  /**
   * Crosses to the map and opens the agent panel with a sentence carrying this row's context.
   * **The address carries only the kind of intent**; the sentence is composed by the destination's
   * opening-line generator (both entry points must pass through one function or they diverge).
   * That surface exists only in the desktop app, so this only offers a link, and where there is no
   * bridge the caller does not supply this value and the item does not appear at all.
   */
  askAgentHref?: string | null;
  handoffPayload: string;
  candidate: { id: string; title: string };
  onReviewStart?: (candidate: { id: string; title: string }) => void;
  abilities: QueueRowAbilities;
  labels: QueueRowActionLabels;
}) {
  // This menu rides the same contract — a failure must be stated.
  const { state: menuCopyState, copy: copyHandoff } = useCopyFeedback(1600);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  /**
   * One menu item is one line of a list → `row`. `<Link>` and `<button>` use the same string, so it
   * is bound to one constant (letting them diverge gives items different heights inside the menu).
   * Only the hover ink the ramp does not emit remains here.
   *
   * `row` carries `w-full`, but this menu is already `flex-col` (i.e. stretch), so the width is
   * unchanged.
   */
  const menuItemClass = controlClass({
    shape: "row",
    size: "sm",
    tone: "secondary",
    className:
      "hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]",
  });

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-testid="do-next-row-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={labels.rowMenuTrigger}
        onClick={() => setOpen((value) => !value)}
        className={controlClass({ shape: "chip", tone: "muted", className: "h-8 w-8 justify-center border-[color:var(--color-border-soft)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]" })}
      >
        <MoreHorizontal size={ICON_SIZE.md} aria-hidden />
      </button>
      {/* Right-aligned under the «⋯» at the end of the row — its entrance origin is that corner too. */}
      <Surface
        open={open}
        origin="top right"
        role="menu"
        data-testid="do-next-row-menu-popover"
        className="absolute right-0 z-20 mt-1 flex min-w-[10rem] flex-col gap-0.5 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-1 shadow-[var(--shadow-elevation-1)]"
      >
          {sourceHref ? (
            <Link
              href={sourceHref}
              role="menuitem"
              data-testid="do-next-row-menu-source"
              onClick={() => {
                onReviewStart?.(candidate);
                setOpen(false);
              }}
              className={menuItemClass}
            >
              <FileText size={ICON_SIZE.sm} aria-hidden />
              {labels.openSource}
            </Link>
          ) : null}
          <Link
            href={builderHref}
            role="menuitem"
            data-testid="do-next-row-menu-builder"
            onClick={() => {
              onReviewStart?.(candidate);
              setOpen(false);
            }}
            className={menuItemClass}
          >
            <GitBranch size={ICON_SIZE.sm} aria-hidden />
            {resolveBuilderLabel(labels, abilities)}
          </Link>
          {askAgentHref && labels.askAgent ? (
            <Link
              href={askAgentHref}
              role="menuitem"
              data-testid="do-next-row-menu-ask-agent"
              onClick={() => {
                onReviewStart?.(candidate);
                setOpen(false);
              }}
              className={menuItemClass}
            >
              <MessageCircle size={ICON_SIZE.sm} aria-hidden />
              {labels.askAgent}
            </Link>
          ) : null}
          <button
            type="button"
            role="menuitem"
            data-testid="do-next-row-menu-handoff"
            onClick={async () => {
              onReviewStart?.(candidate);
              if (await copyHandoff(handoffPayload)) {
                window.setTimeout(() => setOpen(false), 1000);
              }
            }}
            className={menuItemClass}
          >
            {menuCopyState === "copied" ? (
              <Check size={ICON_SIZE.sm} aria-hidden />
            ) : (
              <Copy size={ICON_SIZE.sm} aria-hidden />
            )}
            {menuCopyState === "copied"
              ? labels.handoffCopied
              : menuCopyState === "failed"
                ? labels.handoffCopyFailed
                : resolveHandoffLabel(labels, abilities)}
          </button>
      </Surface>
    </div>
  );
}
