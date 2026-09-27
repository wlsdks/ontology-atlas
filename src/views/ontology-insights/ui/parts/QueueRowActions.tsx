"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { Check, Copy, FileText, GitBranch, MessageCircle, MoreHorizontal } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import { controlClass } from "@/shared/ui/control-class";
import { Surface } from "@/shared/ui/surface";

/**
 * The overflow actions on a to-do row, shared by queue and meaning-gap rows so one kebab has one item set.
 * Labels change with session ability, never hidden or greyed: a read-only folder offers "view in the workshop",
 * and a folder with no observed agent offers "copy the command to hand over".
 */

export interface QueueRowActionLabels {
  openSource: string;
  openBuilder: string;
  /** The same slot in a read-only session: view rather than write. */
  openBuilderReadOnly: string;
  handoffCopy: string;
  /** The same slot when no agent was observed: handoff rather than verification. */
  handoffCopyIdle: string;
  handoffCopied: string;
  /** When the clipboard is blocked; silence would read as success. */
  handoffCopyFailed: string;
  /** What to do after copying; the same sentence goes to a screen reader. */
  handoffCopiedHint: string;
  rowMenuTrigger: string;
  /** Hands the row to the map's agent. Absent where there is no agent surface, and the item is then not drawn. */
  askAgent?: string;
}

/** The session facts the kebab and the handoff button use to choose labels. */
export interface QueueRowAbilities {
  canWriteVault: boolean;
  agentObserved: boolean;
}

function resolveBuilderLabel(
  labels: QueueRowActionLabels,
  abilities: QueueRowAbilities,
): string {
  return abilities.canWriteVault ? labels.openBuilder : labels.openBuilderReadOnly;
}

function resolveHandoffLabel(
  labels: QueueRowActionLabels,
  abilities: QueueRowAbilities,
): string {
  return abilities.agentObserved ? labels.handoffCopy : labels.handoffCopyIdle;
}

export function RowActionMenu({
  sourceHref,
  builderHref,
  askAgentHref,
  hideBuilder = false,
  handoffPayload,
  candidate,
  onReviewStart,
  abilities,
  labels,
}: {
  sourceHref: string | null;
  builderHref: string;
  /** Drop the builder item when the row already carries "fix it myself", so one action is not offered twice. */
  hideBuilder?: boolean;
  /**
   * Opens the map's agent panel with this row's context. The address carries only the intent kind; the destination's
   * opening-line generator writes the sentence. Desktop only, so absent elsewhere and the item is not drawn.
   */
  askAgentHref?: string | null;
  handoffPayload: string;
  candidate: { id: string; title: string };
  onReviewStart?: (candidate: { id: string; title: string }) => void;
  abilities: QueueRowAbilities;
  labels: QueueRowActionLabels;
}) {
  // A copy failure must be stated here too.
  const { state: menuCopyState, copy: copyHandoff } = useCopyFeedback();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuNode, setMenuNode] = useState<HTMLElement | null>(null);
  const [placeAbove, setPlaceAbove] = useState(false);

  /**
   * The usable bottom is the tab bar's top, not the window's: the menu measures its height against the room below
   * the trigger and opens upward when it would not fit and there is more room above.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const menuHeight = menuNode?.offsetHeight ?? 0;
      if (!trigger || menuHeight === 0) return;
      const nav = document.querySelector<HTMLElement>('[data-tabbar="primary"]')?.getBoundingClientRect();
      const usableBottom = nav && nav.width > 0 && nav.height > 0 ? nav.top : window.innerHeight;
      const roomBelow = usableBottom - 8 - (trigger.bottom + 4);
      const roomAbove = trigger.top - 4 - 8;
      setPlaceAbove(roomBelow < menuHeight && roomAbove > roomBelow);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, menuNode]);

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
   * One menu item is one list line (`row`), bound to one constant for `<Link>` and `<button>` so heights match.
   * The menu sizes to its longest item (`w-max`, at least 16rem), so every item is one 32px line.
   */
  const menuItemClass = controlClass({
    shape: "row",
    size: "md",
    tone: "secondary",
    className:
      "whitespace-nowrap hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]",
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
      {/* Right-aligned under the row's end (over it near the bottom edge); the entrance origin is that corner too. */}
      <Surface
        ref={setMenuNode}
        open={open}
        origin={placeAbove ? "bottom right" : "top right"}
        role="menu"
        data-testid="do-next-row-menu-popover"
        data-placement={placeAbove ? "above" : "below"}
        className={`absolute right-0 z-20 ${placeAbove ? "bottom-full mb-1" : "top-full mt-1"} flex w-max min-w-[16rem] max-w-[calc(100vw-2rem)] flex-col gap-0.5 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-1 shadow-[var(--shadow-elevation-1)]`}
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
          {hideBuilder ? null : (
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
          )}
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
