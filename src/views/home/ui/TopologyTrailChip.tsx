"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Sparkles, Trash2, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import {
  CHROME_STATUS_CHIP_CLASS,
  CompactCopyButton,
  Surface,
  OntologyMapKindGlyph,
  controlClass,
} from "@/shared/ui";
import type { FootprintTrailEntry, TrailStepCaption } from "../lib/footprint-trail";

export interface TopologyTrailChipLabels {
  heading: string;
  triggerAriaLabel: string;
  /** "you are here"; the only tinted text in the popover. */
  currentLabel: string;
  /** Top row with nothing focused: "just now". */
  justNowLabel: string;
  /** "{count} steps back". */
  stepsAgoLabel: (count: number) => string;
  /** "go to {title}". */
  rowAriaLabel: (title: string) => string;
  /** When this node shares no edge with the previous step. */
  stepUnrelatedLabel: string;
  /** "hand this over to the AI". */
  copyLabel: string;
  copyAriaLabel: string;
  copyCopiedAriaLabel: string;
  clearLabel: string;
  /** Once armed; the second press discards. */
  clearConfirmLabel: string;
  clearAriaLabel: string;
  /** Shown only when something is archived. */
  pastLinkLabel: string;
  pastHeading: string;
  pastBackAriaLabel: string;
  pastDeleteAriaLabel: string;
  pastClearAllLabel: string;
  /** "press once more to delete". */
  pastClearAllConfirmLabel: string;
  /** "the last 10 only". */
  pastCapCaption: string;
  pastEmptyBody: string;
}

/** HomePage owns i18n and sends the strings formatted. */
export interface TopologyPastWalkRow {
  id: string;
  /** "first → last"; the arrow carries direction, so it is data. */
  routeLabel: string;
  /** "today · 12 places", or "not on the map right now" when it cannot replay. */
  metaLabel: string;
  /** When false the row is text, not a button that does nothing; delete (✕) stays. */
  replayable: boolean;
  /** Null without a button, so no unused "replay 0 places" string leaks elsewhere. */
  ariaLabel: string | null;
}

const CLEAR_ALL_CONFIRM_RESET_MS = 4000;

/** `w-[248px]` below; the side choice measures against it. */
const TRAIL_POPOVER_WIDTH = 248;

type TrailPopoverAlign = "start" | "end";

/**
 * Grows from the chip's right corner while the popover starts inside the free map, else from its
 * left.
 * The free map is the closest `[data-popover-boundary]` (the toolbar), or the window.
 */
function resolveTrailPopoverAlign(root: HTMLElement | null): TrailPopoverAlign {
  if (!root) return "end";
  const chip = root.getBoundingClientRect();
  const boundary = root.closest<HTMLElement>("[data-popover-boundary]")?.getBoundingClientRect();
  const left = boundary ? boundary.left : 0;
  const right = boundary ? boundary.right : window.innerWidth;
  if (chip.right - TRAIL_POPOVER_WIDTH >= left) return "end";
  // Rightward when it fits, and otherwise when it overlaps less (the boundary's right edge is the
  // window's).
  return chip.left + TRAIL_POPOVER_WIDTH <= right || chip.left - left < right - chip.right ? "start" : "end";
}

export interface TopologyTrailChipProps {
  /** HomePage owns i18n; the chip is pure chrome. */
  label: string;
  /** Below a 35rem toolbar only the count shows; `label` stays the tooltip and accessible name. */
  compactLabel?: string;
  /**
   * Oldest to newest; the popover reverses it so recent targets land on the first screen, like
   * every
   * time-ordered list in the app.
   */
  entries: readonly FootprintTrailEntry[];
  /**
   * Aligned with `entries`; index 0 is null, and null elsewhere means no shared edge, which the
   * row states.
   */
  stepCaptions: readonly (TrailStepCaption | null)[];
  /** The indigo dot on the timeline. */
  currentId: string | null;
  labels: TopologyTrailChipLabels;
  onFocusEntry: (id: string) => void;
  onCopyPacket: () => void;
  copied: boolean;
  /** Shared by the chip ✕ and the footer; discards without archiving. */
  onClear: () => void;
  /**
   * The trail lens: the map dims relations and everything unvisited while the popover is open.
   * Its lifetime is exactly the popover's, with no mode or URL state.
   */
  onLensChange?: (active: boolean) => void;
  /** Brushes the map node, answering "which node is two steps back" by pointing, not numbering. */
  onHoverEntry?: (id: string | null) => void;
  /** Newest first. */
  pastWalks: readonly TopologyPastWalkRow[];
  /** Null while archiving normally; with no archive and no notice the level-1 link does not appear. */
  pastNotice: string | null;
  /**
   * The caller archives the trail in progress, refines and loads this one, and focuses its last
   * step;
   * the chip only returns to level 1.
   */
  onReplayPastWalk: (id: string) => void;
  onDeletePastWalk: (id: string) => void;
  /** After the two-step confirm. */
  onClearPastWalks: () => void;
}

/**
 * The walked-trail chip: a mini timeline popover, newest on top with relative-step captions,
 * like every time-ordered list in the app. A self-closing anchored popover owning its own Escape,
 * so the
 * global Esc ladder does not fire twice. Level 2 in the same shell holds archived trails without
 * indigo,
 * since no row there is "you are here"; replaying archives the current trail first.
 */
export function TopologyTrailChip({
  label,
  compactLabel,
  entries,
  stepCaptions,
  currentId,
  labels,
  onFocusEntry,
  onCopyPacket,
  copied,
  onClear,
  onLensChange,
  onHoverEntry,
  pastWalks,
  pastNotice,
  onReplayPastWalk,
  onDeletePastWalk,
  onClearPastWalks,
}: TopologyTrailChipProps) {
  const [open, setOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  // Destructive and unrecoverable, so an inline two-step confirm.
  const [clearAllArmed, setClearAllArmed] = useState(false);
  // A session trail is not in the URL and cannot be rebuilt, so both clear controls arm first and
  // the second
  // press discards, matching clear-all.
  const [clearArmed, setClearArmed] = useState(false);
  // Chosen on open against the toolbar box, or a right-hung popover lands under INDEX.
  const [align, setAlign] = useState<TrailPopoverAlign>("end");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const pastLinkRef = useRef<HTMLButtonElement | null>(null);

  // Only the render is reversed; model and packet stay chronological for machine replay.
  const recentFirstEntries = useMemo(
    () =>
      entries
        .map((entry, i) => ({ entry, caption: stepCaptions[i] ?? null, oldest: i === 0 }))
        .reverse(),
    [entries, stepCaptions],
  );

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    // Always level 1, so one trigger opens one screen.
    setShowPast(false);
    setClearAllArmed(false);
    setClearArmed(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Off on unmount too, or the map freezes dimmed; stays on at level 2.
  useEffect(() => {
    onLensChange?.(open);
    if (!open) {
      onHoverEntry?.(null);
      return;
    }
    return () => {
      onLensChange?.(false);
      onHoverEntry?.(null);
    };
  }, [open, onLensChange, onHoverEntry]);

  // Switching levels unmounts rows without a pointer leave, so brushing is released here in both
  // directions.
  useEffect(() => {
    onHoverEntry?.(null);
  }, [showPast, onHoverEntry]);

  // Disarms itself, or a careless click later deletes.
  useEffect(() => {
    if (!clearAllArmed) return;
    const timer = window.setTimeout(() => setClearAllArmed(false), CLEAR_ALL_CONFIRM_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [clearAllArmed]);

  useEffect(() => {
    if (!clearArmed) return;
    const timer = window.setTimeout(() => setClearArmed(false), CLEAR_ALL_CONFIRM_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [clearArmed]);

  /** Shared by the header ✕ and the footer. */
  const handleClearPress = useCallback(() => {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    setClearArmed(false);
    onClear();
  }, [clearArmed, onClear]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      close(false);
    };
    // A window capture Escape closes even with focus outside; stopPropagation keeps the Esc ladder
    // out.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, close]);

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      data-testid="topology-trail-chip"
      // The toolbar reads this (`has-[[data-lane-popover=open]]`) to rise above INDEX.
      data-lane-popover={open ? "open" : undefined}
    >
      <div className={CHROME_STATUS_CHIP_CLASS}>
        <Sparkles size={ICON_SIZE.md} aria-hidden className="shrink-0 text-[color:var(--color-text-tertiary)]" />
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            if (open) {
              close(false);
              return;
            }
            setAlign(resolveTrailPopoverAlign(rootRef.current));
            setOpen(true);
          }}
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={labels.triggerAriaLabel}
          title={label}
          data-testid="topology-trail-chip-trigger"
          className={controlClass({
            shape: "link",
            tone: "strong",
            truncate: true,
            // Under 12px from the clear button, touch-hit-expand would steal the tap.
            className: "min-w-0 font-[var(--font-weight-signature)]",
          })}
        >
          {compactLabel ? (
            // Keyed to the toolbar width (`@container/map-toolbar`), not the density flag, which a
            // selection also sets.
            <>
              <span className="hidden @min-[35rem]/map-toolbar:inline">{label}</span>
              <span className="@min-[35rem]/map-toolbar:hidden">{compactLabel}</span>
            </>
          ) : (
            label
          )}
        </button>
        {/* Armed: the tone steps up and the ✕ becomes a bin, since the shape says "this press
           deletes".
           aria-label alone let a sighted person discard with a second press. */}
        <button
          type="button"
          onClick={handleClearPress}
          aria-label={clearArmed ? labels.clearConfirmLabel : labels.clearAriaLabel}
          data-testid="topology-trail-chip-clear"
          data-armed={clearArmed ? "true" : undefined}
          className={controlClass({
            shape: "icon",
            size: "sm",
            tone: clearArmed ? "strong" : "muted",
            // Hover wakes the ink only before arming.
            className: clearArmed ? "-mr-1" : "-mr-1 hover:text-[color:var(--color-text-primary)]",
          })}
        >
          {clearArmed ? (
            <Trash2 size={ICON_SIZE.md} aria-hidden />
          ) : (
            <X size={ICON_SIZE.md} aria-hidden />
          )}
        </button>
      </div>
      {/* Grows out of the chip corner it hangs from. */}
      <Surface
        open={open}
        origin={align === "end" ? "top right" : "top left"}
        data-align={align}
        role="group"
        aria-label={labels.heading}
        data-testid="topology-trail-chip-popover"
        className={`absolute ${align === "end" ? "right-0" : "left-0"} top-[calc(100%+8px)] z-30 w-[248px] rounded-chip border border-[color:var(--topology-floating-panel-border)] bg-[color:var(--topology-floating-panel-surface)] shadow-[var(--topology-floating-panel-shadow)]`}
      >
          <div className="flex items-center justify-between gap-2 border-b border-[color:var(--topology-floating-panel-divider)] px-3 py-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
            {showPast ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setShowPast(false);
                    setClearAllArmed(false);
                    pastLinkRef.current?.focus();
                  }}
                  aria-label={labels.pastBackAriaLabel}
                  data-testid="topology-trail-past-back"
                  className={controlClass({ shape: "icon", size: "xs", tone: "muted", className: "-ml-1 h-5 w-5 rounded-full hover:text-[color:var(--color-text-primary)]" })}
                >
                  <ChevronLeft size={ICON_SIZE.md} aria-hidden />
                </button>
                <span className="min-w-0 flex-1 truncate">{labels.pastHeading}</span>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate">{labels.heading}</span>
                {/* Appears only with something to show. */}
                {pastWalks.length > 0 || pastNotice !== null ? (
                  <button
                    ref={pastLinkRef}
                    type="button"
                    onClick={() => setShowPast(true)}
                    data-testid="topology-trail-past-link"
                    className={controlClass({ shape: "link", tone: "muted", className: "shrink-0 rounded-chip px-1 py-0.5 hover:text-[color:var(--color-text-primary)]" })}
                  >
                    {labels.pastLinkLabel}
                  </button>
                ) : null}
              </>
            )}
          </div>
          {showPast ? (
            <>
              {/* Why nothing is kept; absent while archiving normally. */}
              {pastNotice !== null ? (
                <p
                  data-testid="topology-trail-past-notice"
                  className="border-b border-[color:var(--topology-floating-panel-divider)] px-3 py-2 text-caption leading-label text-[color:var(--color-text-tertiary)]"
                >
                  {pastNotice}
                </p>
              ) : null}
              {/* Two-line anatomy decides row height, not content length. */}
              {pastWalks.length > 0 ? (
                <ul
                  data-testid="topology-trail-past-list"
                  className="flex max-h-[280px] flex-col overflow-y-auto px-2 py-1.5"
                >
                  {pastWalks.map((walk) => (
                    <li
                      key={walk.id}
                      data-testid="topology-trail-past-row"
                      data-replayable={walk.replayable ? "true" : "false"}
                      className="flex h-[47px] shrink-0 items-center gap-1"
                    >
                      {/* Only a replayable trail is a button; otherwise its second line says why. */}
                      {walk.replayable ? (
                        <button
                          type="button"
                          onClick={() => {
                            onReplayPastWalk(walk.id);
                            // The replayed trail is on level 1.
                            setShowPast(false);
                            setClearAllArmed(false);
                          }}
                          aria-label={walk.ariaLabel ?? undefined}
                          data-testid="topology-trail-past-replay"
                          // A text lift, not a background (overlay-1 hover is 1.03:1 here);
                          // through `group` since the text is a child.
                          className={controlClass({ shape: "row", size: "sm", className: "group min-w-0 flex-1 flex-col justify-center gap-0.5 self-stretch px-1.5 hover:bg-[color:var(--color-overlay-1)]" })}
                        >
                          {/* Lifting only line 1 keeps level 2 without an attention winner. */}
                          <span className="w-full truncate text-body text-[color:var(--color-text-secondary)] transition-colors group-hover:text-[color:var(--color-text-primary)]">
                            {walk.routeLabel}
                          </span>
                          <span className="w-full truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                            {walk.metaLabel}
                          </span>
                        </button>
                      ) : (
                        <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-1.5">
                          {/* Tertiary, between a live row and the caption, so line 2 reads as
                             explaining line 1. */}
                          <span className="truncate text-body text-[color:var(--color-text-tertiary)]">
                            {walk.routeLabel}
                          </span>
                          <span className="truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                            {walk.metaLabel}
                          </span>
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeletePastWalk(walk.id)}
                        aria-label={labels.pastDeleteAriaLabel}
                        data-testid="topology-trail-past-delete"
                        className={controlClass({
                          shape: "icon",
                          size: "lg",
                          tone: "muted",
                          className: "hover:text-[color:var(--color-text-primary)]",
                        })}
                      >
                        <X size={ICON_SIZE.md} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p
                  data-testid="topology-trail-past-empty"
                  className="px-3 py-4 text-caption leading-label text-[color:var(--color-text-quaternary)]"
                >
                  {labels.pastEmptyBody}
                </p>
              )}
              <div className="flex items-center justify-between gap-2 border-t border-[color:var(--topology-floating-panel-divider)] px-2 py-1.5">
                {pastWalks.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!clearAllArmed) {
                        setClearAllArmed(true);
                        return;
                      }
                      setClearAllArmed(false);
                      onClearPastWalks();
                    }}
                    data-testid="topology-trail-past-clear-all"
                    className={controlClass({
                      shape: "segment",
                      tone: clearAllArmed ? "strong" : "muted",
                      // Hover wakes the ink only before arming.
                      className: clearAllArmed
                        ? undefined
                        : "hover:text-[color:var(--color-text-primary)]",
                    })}
                  >
                    {clearAllArmed ? labels.pastClearAllConfirmLabel : labels.pastClearAllLabel}
                  </button>
                ) : (
                  <span />
                )}
                {/* Say up front that this is a rotating buffer. */}
                <span className="shrink-0 font-mono text-caption text-[color:var(--color-text-quaternary)]">
                  {labels.pastCapCaption}
                </span>
              </div>
            </>
          ) : (
          <>
          {/* Newest on top, so `i` is steps back from the latest visit. */}
          <ol className="flex max-h-[280px] flex-col overflow-y-auto px-3 py-2.5">
            {recentFirstEntries.map(({ entry, caption, oldest }, i) => {
              const isCurrent = entry.id === currentId;
              // "you are here" with focus, else "just now" without an indigo dot.
              const stepLabel =
                i === 0
                  ? isCurrent
                    ? labels.currentLabel
                    : labels.justNowLabel
                  : labels.stepsAgoLabel(i);
              return (
                <li
                  key={entry.id}
                  // The row is the unit the user reads.
                  onMouseEnter={() => onHoverEntry?.(entry.id)}
                  onMouseLeave={() => onHoverEntry?.(null)}
                  onFocus={() => onHoverEntry?.(entry.id)}
                  onBlur={() => onHoverEntry?.(null)}
                  // One fixed height (28px title + 14px caption), or rows with a reason read as a
                  // different kind.
                  className="flex h-[42px] shrink-0 items-stretch gap-2"
                >
                  {/* The dot with half segments on the first and last row. */}
                  <span className="relative flex w-4 shrink-0 flex-col items-center">
                    <span
                      aria-hidden
                      className={`w-px flex-1 ${i === 0 ? "bg-transparent" : "bg-[color:var(--color-divider)]"}`}
                    />
                    {isCurrent ? (
                      <span
                        aria-hidden
                        data-testid="topology-trail-current-dot"
                        className="my-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--color-indigo-accent)]"
                      />
                    ) : (
                      <OntologyMapKindGlyph kind={entry.kind} size={13} className="my-0.5 shrink-0" />
                    )}
                    <span
                      aria-hidden
                      className={`w-px flex-1 ${i === recentFirstEntries.length - 1 ? "bg-transparent" : "bg-[color:var(--color-divider)]"}`}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col justify-center">
                    {/* Title and distance share a line so the caption explains both. */}
                    <span className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onFocusEntry(entry.id);
                        close(false);
                      }}
                      aria-label={labels.rowAriaLabel(entry.title)}
                      aria-current={isCurrent ? "true" : undefined}
                      data-testid="topology-trail-row"
                      className={controlClass({ shape: "row", size: "sm", tone: "secondary", className: "min-w-0 flex-1 truncate hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]" })}
                    >
                      {entry.title}
                    </button>
                    {/* Outside the button so its aria-label keeps the distance for screen readers;
                       only the current row is indigo. */}
                    <span
                      data-testid="topology-trail-step-label"
                      className={`shrink-0 font-mono text-caption tabular-nums ${
                        i === 0 && isCurrent
                          ? "text-[color:var(--color-indigo-accent)]"
                          : "text-[color:var(--color-text-quaternary)]"
                      }`}
                    >
                      {stepLabel}
                    </span>
                    </span>
                    {/* How this step follows the last: relation word plus `relation_notes`. Outside
                       the button so the aria-label
                       stays the destination; the oldest row keeps the empty slot for equal height. */}
                    {(() => {
                      const text = oldest
                        ? ""
                        : caption
                          ? caption.reason
                            ? `${caption.relationLabel} · ${caption.reason}`
                            : caption.relationLabel
                          : labels.stepUnrelatedLabel;
                      return (
                        <span
                          data-testid="topology-trail-step-link"
                          // The native tooltip keeps a truncated reason reachable.
                          title={text || undefined}
                          // The empty slot keeps its line box, or the oldest title drops 7px.
                          className="min-h-[var(--leading-caption)] truncate px-2 text-caption leading-caption text-[color:var(--color-text-quaternary)]"
                        >
                          {text}
                        </span>
                      );
                    })()}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="flex items-center justify-between gap-2 border-t border-[color:var(--topology-floating-panel-divider)] px-2 py-1.5">
            <CompactCopyButton
              data-testid="topology-trail-copy-packet"
              copied={copied}
              label={labels.copyLabel}
              ariaLabel={copied ? labels.copyCopiedAriaLabel : labels.copyAriaLabel}
              onClick={onCopyPacket}
              className="min-h-0 py-1"
            />
            <button
              type="button"
              onClick={handleClearPress}
              data-testid="topology-trail-clear-footer"
              className={controlClass({
                shape: "segment",
                tone: clearArmed ? "strong" : "muted",
                // Hover wakes the ink only before arming.
                className: clearArmed ? undefined : "hover:text-[color:var(--color-text-primary)]",
              })}
            >
              {clearArmed ? labels.clearConfirmLabel : labels.clearLabel}
            </button>
          </div>
          </>
          )}
      </Surface>
    </div>
  );
}
