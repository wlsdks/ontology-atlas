"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Trash2, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

import {
  CHROME_STATUS_CHIP_CLASS,
  CompactCopyButton,
  Surface,
  OntologyMapKindGlyph,
  controlClass,
} from "@/shared/ui";
import {
  trailStepCaptionText,
  type FootprintTrailEntry,
  type TrailStepCaption,
} from "../../lib/trail/footprint-trail";
import { resolveLanePopoverAlign, type LanePopoverAlign } from "./lane-popover-align";

export interface TopologyTrailChipLabels {
  heading: string;
  triggerAriaLabel: string;
  currentLabel: string;
  justNowLabel: string;
  stepsAgoLabel: (count: number) => string;
  rowAriaLabel: (title: string) => string;
  stepUnrelatedLabel: string;
  copyLabel: string;
  copyAriaLabel: string;
  copyCopiedAriaLabel: string;
  clearLabel: string;
  clearConfirmLabel: string;
  clearAriaLabel: string;
}

const CLEAR_CONFIRM_RESET_MS = 4000;

const TRAIL_POPOVER_WIDTH = 248;

export interface TopologyTrailChipProps {
  label: string;
  /** Below a 35rem toolbar only the count shows; `label` stays the tooltip and accessible name. */
  compactLabel?: string;
  /**
   * Oldest to newest; the popover reverses it so recent targets land on the first screen, like
   * every time-ordered list in the app.
   */
  entries: readonly FootprintTrailEntry[];
  stepCaptions: readonly (TrailStepCaption | null)[];
  currentId: string | null;
  labels: TopologyTrailChipLabels;
  onFocusEntry: (id: string) => void;
  onCopyPacket: () => void;
  copied: boolean;
  onClear: () => void;
  /**
   * The trail lens: the map dims relations and everything unvisited while the popover is open.
   * Its lifetime is exactly the popover's, with no mode or URL state.
   */
  onLensChange?: (active: boolean) => void;
  onHoverEntry?: (id: string | null) => void;
}

/**
 * The walked-trail chip: a mini timeline popover, newest on top with relative-step captions, like
 * every time-ordered list in the app. A self-closing anchored popover owning its own Escape, so the
 * global Esc ladder does not fire twice.
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
}: TopologyTrailChipProps) {
  const [open, setOpen] = useState(false);
  // A session trail is not in the URL and cannot be rebuilt, so both clear controls arm first and
  // the second press discards.
  const [clearArmed, setClearArmed] = useState(false);
  // Chosen on open against the toolbar box, or a right-hung popover lands under INDEX.
  const [align, setAlign] = useState<LanePopoverAlign>("end");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

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
    setClearArmed(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Off on unmount too, or the map freezes dimmed.
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

  useEffect(() => {
    if (!clearArmed) return;
    const timer = window.setTimeout(() => setClearArmed(false), CLEAR_CONFIRM_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [clearArmed]);

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
            setAlign(resolveLanePopoverAlign(rootRef.current, TRAIL_POPOVER_WIDTH));
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
            className: "min-w-6 text-center font-[var(--font-weight-signature)]",
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
      <Surface
        open={open}
        origin={align === "end" ? "top right" : "top left"}
        data-align={align}
        role="group"
        aria-label={labels.heading}
        data-testid="topology-trail-chip-popover"
        className={`absolute ${align === "end" ? "right-0" : "left-0"} top-[calc(100%+8px)] z-30 w-[248px] rounded-card border border-[color:var(--topology-floating-panel-border)] bg-[color:var(--topology-floating-panel-surface)] shadow-[var(--topology-floating-panel-shadow)]`}
      >
          <div className="flex items-center justify-between gap-2 border-b border-[color:var(--topology-floating-panel-divider)] px-3 py-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
            <span className="min-w-0 flex-1 truncate">{labels.heading}</span>
          </div>
          <ol className="flex max-h-[280px] flex-col overflow-y-auto px-3 py-2.5">
            {recentFirstEntries.map(({ entry, caption, oldest }, stepsBack) => {
              const isCurrent = entry.id === currentId;
              // "you are here" with focus, else "just now" without an indigo dot.
              const stepLabel =
                stepsBack === 0
                  ? isCurrent
                    ? labels.currentLabel
                    : labels.justNowLabel
                  : labels.stepsAgoLabel(stepsBack);
              return (
                <li
                  key={entry.id}
                  onMouseEnter={() => onHoverEntry?.(entry.id)}
                  onMouseLeave={() => onHoverEntry?.(null)}
                  onFocus={() => onHoverEntry?.(entry.id)}
                  onBlur={() => onHoverEntry?.(null)}
                  // One fixed height (28px title + 14px caption), or rows with a reason read as a
                  // different kind.
                  className="flex h-[42px] shrink-0 items-stretch gap-2"
                >
                  <span className="relative flex w-4 shrink-0 flex-col items-center">
                    <span
                      aria-hidden
                      className={`w-px flex-1 ${stepsBack === 0 ? "bg-transparent" : "bg-[color:var(--color-divider)]"}`}
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
                      className={`w-px flex-1 ${stepsBack === recentFirstEntries.length - 1 ? "bg-transparent" : "bg-[color:var(--color-divider)]"}`}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col justify-center">
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
                    {/* Outside the button, whose aria-label would swallow it, so screen readers
                       still read the distance; only the current row is indigo. */}
                    <span
                      data-testid="topology-trail-step-label"
                      className={`shrink-0 font-mono text-caption tabular-nums ${
                        stepsBack === 0 && isCurrent
                          ? "text-[color:var(--color-indigo-accent)]"
                          : "text-[color:var(--color-text-quaternary)]"
                      }`}
                    >
                      {stepLabel}
                    </span>
                    </span>
                    {/* How this step follows the last: relation word plus `relation_notes`.
                       Outside the button so the aria-label stays the destination; the oldest
                       row keeps the empty slot for equal height. */}
                    {(() => {
                      const text = oldest ? "" : trailStepCaptionText(caption, labels.stepUnrelatedLabel);
                      return (
                        <span
                          data-testid="topology-trail-step-link"
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
                className: clearArmed ? undefined : "hover:text-[color:var(--color-text-primary)]",
              })}
            >
              {clearArmed ? labels.clearConfirmLabel : labels.clearLabel}
            </button>
          </div>
      </Surface>
    </div>
  );
}
