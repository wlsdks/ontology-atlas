"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { LibraryWorkActivity, LibraryWorkEvent, LibraryWorkTarget } from "@/features/library";
import { cn } from "@/shared/lib/cn";
import { useDismissibleMenu } from "@/shared/lib/overlays/use-dismissible-menu";
import { EXIT_WINDOW_MS } from "@/shared/lib/render-timing/use-presence";
import { WorkGlyph } from "@/shared/motion/status-glyphs/WorkGlyph";
import { controlClass } from "@/shared/ui/control-class";
import { Chip } from "@/shared/ui/controls/controls";
import { Surface } from "@/shared/ui/surfaces/surface";
import { transientSurface } from "@/shared/ui/surfaces/transient-surface";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

/** A receipt whose target is a file the reader can open: read and written files exist. */
function opensTarget(event: LibraryWorkEvent): event is LibraryWorkEvent & { target: LibraryWorkTarget } {
  return event.target !== null && (event.kind === "read" || event.kind === "write");
}

/** The last segment of a vault path: the file a person recognises. */
function fileName(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut >= 0 ? path.slice(cut + 1) : path;
}

/**
 * A file's name, never its folders. When the name itself does not fit it is cut in the middle: the
 * head truncates and the ending (with the extension) stays, so a cut name still reads as that file.
 */
function FileName({ path }: { path: string }) {
  const name = fileName(path);
  const keep = Math.min(10, Math.floor(name.length / 2));
  return (
    <span className="flex min-w-0">
      <span className="min-w-0 truncate">{name.slice(0, name.length - keep)}</span>
      <span className="flex-none whitespace-pre">{name.slice(name.length - keep)}</span>
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
 * What last happened to this folder's files, as one line: a running mark only while work runs, what
 * happened, the file or page as a press that opens it, and a press listing the last three. Ephemeral
 * observations, not an audit log. `reserved` keeps the height before the first event.
 */
export function LibraryWorkLine({
  activity,
  onSelect,
  pageTitle,
  changedPages,
  reserved = false,
  className,
}: {
  activity: LibraryWorkActivity;
  onSelect: (target: LibraryWorkTarget) => void;
  /** The title of the wiki page at a `wiki/<slug>` address, or null when no such page is listed. */
  pageTitle: (ref: string) => string | null;
  /** Wiki pages whose file changed while this folder has been open: the count a change line states. */
  changedPages: number;
  reserved?: boolean;
  className?: string;
}) {
  const t = useTranslations("library.workActivity");
  const headline = activity.current ?? activity.recent[0] ?? null;
  const leaving = useEventSwap(headline);
  const historyTriggerRef = useRef<HTMLButtonElement | null>(null);
  const targetPathId = useId();
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
  /** What happened, in words. A change line counts `pages`; one receipt alone is one page. */
  const label = (event: LibraryWorkEvent, pages = 1) =>
    event.phase === "complete" && event.kind === "write"
      ? t("complete.write", { count: Math.max(1, pages) })
      : t(`${event.phase}.${event.kind}`);
  const wikiTitle = (target: LibraryWorkTarget) => (target.kind === "wiki" ? pageTitle(target.ref) : null);
  const name = (target: LibraryWorkTarget) => wikiTitle(target) ?? fileName(target.ref);
  const targetName = (target: LibraryWorkTarget) => {
    const title = wikiTitle(target);
    return title === null ? <FileName path={target.ref} /> : <span className="min-w-0 truncate">{title}</span>;
  };
  const line = (event: LibraryWorkEvent, live: boolean) => {
    const pathId = live ? targetPathId : undefined;
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
          {label(event, changedPages)}
        </p>
        {event.target ? (
          <>
            <span aria-hidden className="flex-none text-[color:var(--color-text-tertiary)]">·</span>
            {opensTarget(event) ? (
              <button
                type="button"
                tabIndex={live ? undefined : -1}
                data-testid={live ? "library-work-target" : undefined}
                title={event.target.ref}
                aria-describedby={pathId}
                onClick={() => onSelect(event.target)}
                className={controlClass({
                  shape: "link",
                  tone: "secondary",
                  hoverInk: "strong",
                  className: "min-w-0 max-w-full",
                })}
              >
                {targetName(event.target)}
              </button>
            ) : (
              <span title={event.target.ref} aria-describedby={pathId} className="flex min-w-0 text-[color:var(--color-text-tertiary)]">
                {targetName(event.target)}
              </span>
            )}
          </>
        ) : null}
        {event.target && pathId ? <span id={pathId} className="sr-only">{event.target.ref}</span> : null}
      </div>
    );
  };
  return (
    <div
      data-testid="library-work-line"
      aria-label={t("title")}
      role="group"
      className={cn("flex h-6 min-w-0 items-center gap-3", className)}
    >
      <div className="grid min-w-0">
        {leaving && leaving.id !== headline?.id ? line(leaving, false) : null}
        {headline ? line(headline, true) : null}
      </div>
      {/* The list's press only once there is something to list; the first event alone is the line itself. */}
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
              className: "text-label",
            })}
          >
            {t("recent")}
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
              const content = <span className="truncate">{label(event)} · {event.target ? name(event.target) : t("unbound")}</span>;
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
          </Surface>
        </div>
      ) : null}
    </div>
  );
}
