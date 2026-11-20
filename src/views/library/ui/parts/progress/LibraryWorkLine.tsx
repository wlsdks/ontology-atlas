"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { LibraryWorkActivity, LibraryWorkEvent, LibraryWorkTarget } from "@/features/library";
import { cn } from "@/shared/lib/cn";
import { useDismissibleMenu } from "@/shared/lib/overlays/use-dismissible-menu";
import { EXIT_WINDOW_MS } from "@/shared/lib/render-timing/use-presence";
import { WorkGlyph } from "@/shared/motion/work-glyph";
import { controlClass } from "@/shared/ui/control-class";
import { Chip } from "@/shared/ui/controls/controls";
import { Surface } from "@/shared/ui/surfaces/surface";
import { transientSurface } from "@/shared/ui/surfaces/transient-surface";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

/** A receipt whose target is a file the reader can open: read and written files exist. */
function opensTarget(event: LibraryWorkEvent): event is LibraryWorkEvent & { target: LibraryWorkTarget } {
  return event.target !== null && (event.kind === "read" || event.kind === "write");
}

/**
 * A path split so the file name survives a narrow line: the folders truncate first, the name last.
 */
function PathText({ path }: { path: string }) {
  const cut = path.lastIndexOf("/");
  const folder = cut >= 0 ? path.slice(0, cut + 1) : "";
  const name = cut >= 0 ? path.slice(cut + 1) : path;
  return (
    <span className="flex min-w-0 font-mono">
      {folder ? <span className="min-w-0 truncate">{folder}</span> : null}
      <span className="min-w-0 max-w-full flex-none truncate">{name}</span>
    </span>
  );
}

/**
 * The line that is leaving while another takes its place, held for the exit window. Keyed by the
 * event's id, since the activity rebuilds its event objects on every receipt.
 */
function useEventSwap(current: LibraryWorkEvent | null): LibraryWorkEvent | null {
  const [swap, setSwap] = useState<{ current: LibraryWorkEvent | null; leaving: LibraryWorkEvent | null }>({
    current,
    leaving: null,
  });
  if ((swap.current?.id ?? null) !== (current?.id ?? null)) {
    setSwap({ current, leaving: swap.current });
  }
  useEffect(() => {
    if (swap.leaving === null) return;
    const id = setTimeout(() => setSwap((state) => (state.leaving === null ? state : { ...state, leaving: null })), EXIT_WINDOW_MS);
    return () => clearTimeout(id);
  }, [swap.leaving]);
  return (swap.current?.id ?? null) === (current?.id ?? null) ? swap.leaving : null;
}

/**
 * What the agent did last in this folder, as one line: a running mark only while it works, the kind
 * of work, the file as a press that opens it, and "Recent N" for the last three. Ephemeral
 * observations, not an audit log or a claim that an agent is idle.
 *
 * `reserved` keeps the line's height before the first event, so its arrival moves nothing; a swap
 * crossfades the two lines in the same box.
 */
export function LibraryWorkLine({
  activity,
  onSelect,
  reserved = false,
  className,
}: {
  activity: LibraryWorkActivity;
  onSelect: (target: LibraryWorkTarget) => void;
  reserved?: boolean;
  className?: string;
}) {
  const t = useTranslations("library.workActivity");
  const headline = activity.current ?? activity.recent[0] ?? null;
  const leaving = useEventSwap(headline);
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

  if (!reserved && headline === null) return null;
  const label = (event: LibraryWorkEvent) => t(`${event.phase}.${event.kind}`);
  const line = (event: LibraryWorkEvent, live: boolean) => {
    const running = live && activity.current === event && activity.isActive;
    return (
      <div
        key={event.id}
        inert={!live || undefined}
        aria-hidden={!live || undefined}
        data-testid={live ? "library-work-current" : undefined}
        data-work-kind={live ? event.kind : undefined}
        data-work-phase={live ? event.phase : undefined}
        className={cn(
          "col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 text-label leading-label",
          live ? "motion-swap-in" : "motion-swap-out pointer-events-none",
        )}
      >
        {running ? <WorkGlyph phase="running" size={ICON_SIZE.sm} /> : null}
        <p role={live ? "status" : undefined} aria-atomic={live || undefined} className="flex-none text-[color:var(--color-text-secondary)]">
          {label(event)}
        </p>
        {event.target ? (
          opensTarget(event) ? (
            <button
              type="button"
              tabIndex={live ? undefined : -1}
              data-testid={live ? "library-work-target" : undefined}
              title={event.target.ref}
              onClick={() => onSelect(event.target)}
              className={controlClass({
                shape: "link",
                tone: "secondary",
                hoverInk: "strong",
                className: "min-w-0 max-w-full",
              })}
            >
              <PathText path={event.target.ref} />
            </button>
          ) : (
            <span title={event.target.ref} className="flex min-w-0 text-[color:var(--color-text-tertiary)]">
              <PathText path={event.target.ref} />
            </span>
          )
        ) : null}
      </div>
    );
  };
  return (
    <div
      data-testid="library-work-line"
      aria-label={t("title")}
      role="group"
      className={cn("flex h-6 min-w-0 items-center gap-2", className)}
    >
      <div className="grid min-w-0 flex-1">
        {leaving && leaving.id !== headline?.id ? line(leaving, false) : null}
        {headline ? line(headline, true) : null}
      </div>
      {/* "Recent N" only once there is something to list; the first event alone is the line itself. */}
      {activity.recent.length > 0 ? (
        <div ref={historyRef} className="relative flex flex-none items-center">
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
              tone: "muted",
              hoverInk: "strong",
              active: historyOpen,
              className: "text-label tabular-nums",
            })}
          >
            {t("recentCount", { count: activity.recent.length })}
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
              const content = <span className="truncate">{label(event)} · {event.target?.ref ?? t("unbound")}</span>;
              return opensTarget(event) ? (
                <Chip
                  key={event.id}
                  size="md"
                  tone="muted"
                  className="min-w-0 max-w-full justify-start"
                  title={[label(event), event.target.ref].join(" · ")}
                  onClick={() => {
                    setHistoryOpen(false);
                    onSelect(event.target);
                  }}
                >
                  {content}
                </Chip>
              ) : (
                <span key={event.id} className="flex min-w-0 items-center gap-1 px-2 py-1 text-label text-[color:var(--color-text-secondary)]">
                  {content}
                </span>
              );
            })}
            {activity.recent.length === 0 ? (
              <span className="text-label text-[color:var(--color-text-tertiary)]">{t("noReceipts")}</span>
            ) : null}
          </Surface>
        </div>
      ) : null}
    </div>
  );
}
