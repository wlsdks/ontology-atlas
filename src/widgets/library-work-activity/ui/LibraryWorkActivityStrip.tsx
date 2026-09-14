"use client";

import { useEffect, useRef } from "react";
import { BookOpen, Check, ChevronDown, FilePenLine, Pause, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LibraryWorkActivity, LibraryWorkEvent, LibraryWorkTarget } from "@/features/library";
import { useDismissibleMenu } from "@/shared/lib/use-dismissible-menu";
import { Chip } from "@/shared/ui/controls";
import { controlClass } from "@/shared/ui/control-class";
import { Surface } from "@/shared/ui/surface";
import { transientSurface } from "@/shared/ui/transient-surface";

const ICONS = { read: BookOpen, proposal: FilePenLine, waiting: Pause, write: Check, error: TriangleAlert };
const INK = {
  read: "text-[color:var(--color-indigo-accent)]",
  proposal: "text-[color:var(--color-indigo-accent)]",
  waiting: "text-[color:var(--color-status-warning)]",
  write: "text-[color:var(--color-success-text-a95)]",
  error: "text-[color:var(--color-danger-text-strong)]",
};

/** Ephemeral observations, not an audit log or a claim that an agent is idle. */
export function LibraryWorkActivityStrip({ activity, onSelect, reserved = false }: {
  activity: LibraryWorkActivity;
  onSelect: (target: LibraryWorkTarget) => void;
  /**
   * Whether a session is open to report on. The lane holds its height so a receipt never
   * resizes the canvas, but holding it *always* charged every folder 112px of the picture
   * for work that was not happening: measured 2026-09-08 at 1920x1080, an idle Library
   * rendered `library-work-lane` at y 0..112 with no text and no `Surface` inside it, and
   * the canvas began at 160 instead of 48. So the reservation follows the session that
   * causes the receipts, and standing it up costs one shift at a moment the person asked
   * for by opening the conversation — never on the arriving receipt itself.
   */
  reserved?: boolean;
}) {
  const t = useTranslations("library.workActivity");
  const current = activity.current;
  const headline = current ?? activity.recent[0] ?? null;
  const Icon = headline ? ICONS[headline.kind] : BookOpen;
  const label = (event: LibraryWorkEvent) => t(`${event.phase}.${event.kind}`);
  const historyTriggerRef = useRef<HTMLButtonElement | null>(null);
  const {
    open: historyOpen,
    setOpen: setHistoryOpen,
    ref: historyRef,
    surfaceRef: historySurfaceRef,
  } = useDismissibleMenu();
  useEffect(() => {
    if (!historyOpen) return;
    const handleHistoryEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setHistoryOpen(false);
      historyTriggerRef.current?.focus();
    };
    // WKWebView can leave focus on the reader after a pointer opens this anchored
    // surface. Capture before the reader's own Escape handler closes the document.
    document.addEventListener("keydown", handleHistoryEscape, true);
    return () => document.removeEventListener("keydown", handleHistoryEscape, true);
  }, [historyOpen, setHistoryOpen]);
  // Nothing to report and no session that could report: the picture keeps the height.
  // A receipt still outlives its conversation, which is the whole point of a receipt, so
  // the lane stands for one that is already there even after the dock is closed.
  if (!reserved && headline === null) return null;
  return (
    /*
     * Reserve the activity lane before the first event: mounting a receipt must not
     * resize the canvas and move the very marks whose work it is explaining.
     *
     * **One line from `sm` up, two below it** (`docs/DECISIONS.md`, 2026-09-11 — "The
     * Library keeps its spine, and computes the structural check itself"). Two stacked
     * rows plus the status strip put a **third** header band over the reader: measured at
     * 1512, the landing and the document under it fell 112px the moment a conversation
     * opened, and 112 → 64 gives 48 of that back. 64px is the height the coarse-pointer
     * receipt chip needs (44px) plus its own inset.
     *
     * ⚠️ **The single line does not survive a phone, and two measurements say so.** At
     * 390px the first receipt chip came to rest at x 216..411 — past the right edge, so
     * reaching it needed a sideways scroll — and its row moved up to y 10..54, under the
     * toast, which sonner places at its own `mobileOffset` on a small viewport whatever
     * `--app-toast-top-offset` says. Both are the width's fault, not the lane's, so in
     * that band the two facts stack the way they always did and the reader there is
     * full-width anyway (`max-lg:order-first`).
     *
     * ⚠️ **The fold is 601px, not `sm` (640), and the boundary is sonner's** (design-
     * responsive C2, council 2026-09-11). Between 601 and 639 the lane still stacked two
     * rows while the toaster had already gone back to reading `--app-toast-top-offset`
     * (124, a measurement of the one-row lane), so the box landed 37px inside the
     * receipts at 620×900. Height and row direction now switch together on the same
     * width sonner switches its offset on. ⚠️ The toast half of that agreement lapsed on
     * 2026-09-12: this surface's toasts anchor to the pane's bottom-right corner and no
     * longer pass over this lane at any width (`src/shared/ui/toast-position.ts`). The
     * 601px fold stands on its first measurement — the receipt chip past the right edge
     * at 390. The horizontal insets keep their own `sm`/`md` steps: an inset is not part
     * of that agreement.
     */
    <div className="h-28 flex-none min-[601px]:h-16" data-testid="library-work-lane">
    <Surface open={headline !== null} motion="overlay" as="section"
      aria-label={t("title")} data-testid="library-work-activity"
      className="relative mx-5 flex h-full min-w-0 flex-col justify-center gap-2 border-b border-[color:var(--color-border-soft)] sm:mx-6 md:mx-10 min-[601px]:flex-row min-[601px]:items-center min-[601px]:gap-4">
      {headline ? <>
        <div className="flex min-w-0 items-start gap-2 min-[601px]:flex-1" data-testid="library-work-current" data-work-kind={headline.kind} data-work-phase={headline.phase}>
          <span className={"flex-none " + INK[headline.kind]}><Icon size={20} aria-hidden="true" /></span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="flex-none text-label leading-body text-[color:var(--color-text-tertiary)]">{current ? t("now") : t("latest")}</span>
              <p role="status" aria-atomic="true" className="truncate text-body-lg leading-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
                {label(headline)}
              </p>
            </div>
            <p title={headline.target?.ref ?? t("unbound")} className="truncate font-mono text-caption leading-body text-[color:var(--color-text-secondary)]">
              {headline.target?.ref ?? t("unbound")}
            </p>
          </div>
        </div>
        <div
          ref={historyRef}
          className="relative flex-none"
        >
          <button
            ref={historyTriggerRef}
            id="library-work-history-toggle"
            type="button"
            data-testid="library-work-history-toggle"
            aria-expanded={historyOpen}
            aria-controls="library-work-recent"
            onClick={() => setHistoryOpen((open) => !open)}
            className={controlClass({
              shape: "link",
              size: "sm",
              tone: "muted",
              hoverInk: "strong",
              className: "gap-1.5",
            })}
          >
            <ChevronDown
              size={14}
              aria-hidden
              className={"transition-transform " + (historyOpen ? "rotate-180" : "")}
            />
            <span>{t("recent")}</span>
            <span className="font-mono tabular-nums">{activity.recent.length}</span>
          </button>
          <Surface
            ref={(node: HTMLElement | null) => {
              historySurfaceRef.current = node;
            }}
            open={historyOpen}
            motion="overlay"
            origin="top right"
            as="section"
            id="library-work-recent"
            aria-labelledby="library-work-history-toggle"
            data-testid="library-work-recent"
            {...transientSurface("anchored")}
            className="absolute right-0 top-full z-[var(--z-dialog)] mt-1 flex w-[min(24rem,calc(100vw-2.5rem))] flex-col gap-1 rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-2 shadow-[var(--shadow-elevation-2)]"
          >
            {activity.recent.slice(0, 3).map((event) => {
              const EventIcon = ICONS[event.kind];
              const content = <><EventIcon size={14} aria-hidden="true" /><span className="truncate">{label(event)} · {event.target?.ref ?? t("unbound")}</span></>;
              return event.target && (event.kind === "read" || event.kind === "write") ? <Chip key={event.id} size="md" tone="muted" className="min-w-0 max-w-full justify-start"
                title={[label(event), event.target.ref].join(" · ")} onClick={() => {
                  setHistoryOpen(false);
                  onSelect(event.target!);
                }}>{content}</Chip>
                : <span key={event.id} className="flex min-w-0 items-center gap-1 px-2 py-1 text-label text-[color:var(--color-text-secondary)]">{content}</span>;
            })}
            {activity.recent.length === 0 ? <span className="text-label text-[color:var(--color-text-tertiary)]">{t("noReceipts")}</span> : null}
          </Surface>
        </div>
      </> : null}
    </Surface>
    </div>
  );
}
