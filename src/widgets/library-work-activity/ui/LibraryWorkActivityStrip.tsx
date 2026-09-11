"use client";

import { BookOpen, Check, FilePenLine, Pause, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LibraryWorkActivity, LibraryWorkEvent, LibraryWorkTarget } from "@/features/library";
import { Chip } from "@/shared/ui/controls";
import { Surface } from "@/shared/ui/surface";

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
     * toast, which sonner places at 16px on a small viewport whatever
     * `--app-toast-top-offset` says. Both are the width's fault, not the lane's, so below
     * `sm` the two facts stack the way they always did and the reader there is
     * full-width anyway (`max-lg:order-first`).
     */
    <div className="h-28 flex-none sm:h-16" data-testid="library-work-lane">
    <Surface open={headline !== null} motion="overlay" as="section"
      aria-label={t("title")} data-testid="library-work-activity"
      className="mx-5 flex h-full min-w-0 flex-col justify-center gap-2 overflow-x-auto border-b border-[color:var(--color-border-soft)] sm:mx-6 sm:flex-row sm:items-center sm:gap-3 md:mx-10">
      {headline ? <>
        <div className="flex min-w-0 items-center gap-2" data-testid="library-work-current" data-work-kind={headline.kind} data-work-phase={headline.phase}>
          <span className={`flex-none ${INK[headline.kind]}`}><Icon size={20} aria-hidden="true" /></span>
          <span className="flex-none text-label leading-body text-[color:var(--color-text-tertiary)]">{current ? t("now") : t("latest")}</span>
          <p role="status" aria-atomic="true" className="flex min-w-0 items-baseline gap-x-2 text-body-lg leading-body-lg text-[color:var(--color-text-primary)]">
            <span className="flex-none font-[var(--font-weight-strong)]">{label(headline)}</span>
            <span title={headline.target?.ref ?? t("unbound")} className="min-w-0 truncate text-label text-[color:var(--color-text-secondary)]">{headline.target?.ref ?? t("unbound")}</span>
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-2" data-testid="library-work-recent">
          <span className="flex-none text-label leading-body text-[color:var(--color-text-tertiary)]">{t("recent")}</span>
          {activity.recent.slice(0, 3).map((event) => {
            const EventIcon = ICONS[event.kind];
            const content = <><EventIcon size={14} aria-hidden="true" /><span className="truncate">{label(event)} · {event.target?.ref ?? t("unbound")}</span></>;
            return event.target && (event.kind === "read" || event.kind === "write") ? <Chip key={event.id} size="md" tone="muted" className="min-w-0 max-w-full flex-none"
              title={`${label(event)} · ${event.target.ref}`} onClick={() => onSelect(event.target!)}>{content}</Chip>
              : <span key={event.id} className="flex min-w-0 items-center gap-1 text-label text-[color:var(--color-text-secondary)]">{content}</span>;
          })}
          {activity.recent.length === 0 ? <span className="text-label text-[color:var(--color-text-tertiary)]">{t("noReceipts")}</span> : null}
        </div>
      </> : null}
    </Surface>
    </div>
  );
}
