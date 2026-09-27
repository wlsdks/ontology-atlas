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
export function LibraryWorkActivityStrip({ activity, onSelect, reserved = false, compact = false, onOpenConversation }: {
  activity: LibraryWorkActivity;
  onSelect: (target: LibraryWorkTarget) => void;
  compact?: boolean;
  onOpenConversation?: () => void;
  /**
   * Whether a session is open to report on; the lane reserves its height only then, so an idle
   * Library does not lose canvas space.
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
    // WKWebView can leave focus on the reader after a pointer opens this surface; capture before
    // the reader's own Escape handler closes the document.
    document.addEventListener("keydown", handleHistoryEscape, true);
    return () => document.removeEventListener("keydown", handleHistoryEscape, true);
  }, [historyOpen, setHistoryOpen]);
  // Nothing to report and no session: no lane. A receipt outlives its conversation, so the lane
  // stands for one already there.
  if (!reserved && headline === null) return null;
  return (
    /*
     * Reserve the lane before the first event so a receipt never resizes the canvas. One line from
     * 601px, two below (`docs/DECISIONS.md`, "The Library keeps its spine, and computes the
     * structural check itself"): at 390px one line pushed the receipt chip past the right edge.
     * 64px fits the 44px coarse-pointer chip plus inset.
     */
    <div className={compact ? "flex-none" : "h-28 flex-none min-[601px]:h-16"} data-testid="library-work-lane">
    <Surface open={headline !== null} motion="overlay" as="section"
      aria-label={t("title")} data-testid="library-work-activity"
      className={"relative flex min-w-0 flex-col justify-center gap-2 border-b border-[color:var(--color-border-soft)] min-[601px]:flex-row min-[601px]:items-center min-[601px]:gap-4 " + (compact ? "py-3" : "mx-5 h-full sm:mx-6 md:mx-10")}>
      {headline ? <>
        <div className="flex min-w-0 items-start gap-2 min-[601px]:flex-1" data-testid="library-work-current" data-work-kind={headline.kind} data-work-phase={headline.phase}>
          <span className={"flex-none " + INK[headline.kind]}><Icon size={20} aria-hidden="true" /></span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="flex-none text-label leading-body text-[color:var(--color-text-tertiary)]">{current ? t("now") : compact ? t("compactLatest") : t("latest")}</span>
              <p role="status" aria-atomic="true" className={"truncate font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)] " + (compact ? "text-body leading-body" : "text-body-lg leading-body-lg")}>
                {label(headline)}
              </p>
            </div>
            {!compact || headline.target ? <p title={headline.target?.ref ?? t("unbound")} className="truncate font-mono text-caption leading-body text-[color:var(--color-text-secondary)]">
              {headline.target?.ref ?? t("unbound")}
            </p> : null}
          </div>
        </div>
        {compact && onOpenConversation ? <Chip size="sm" tone="muted" onClick={onOpenConversation}>{t("openConversation")}</Chip> : null}
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
