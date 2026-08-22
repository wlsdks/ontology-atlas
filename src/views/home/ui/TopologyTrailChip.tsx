"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Footprints, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import {
  CHROME_STATUS_CHIP_CLASS,
  CompactCopyButton,
  Surface,
  TopologyV2KindGlyph,
  controlClass,
} from "@/shared/ui";
import type { FootprintTrailEntry } from "../lib/footprint-trail";

export interface TopologyTrailChipLabels {
  /** Popover heading — "the trail you walked". */
  heading: string;
  /** Trigger aria — "open the trail you walked". */
  triggerAriaLabel: string;
  /** Current-position caption — "you are here". The only tinted text in the popover. */
  currentLabel: string;
  /** Top-row caption when nothing is focused — "just now". */
  justNowLabel: string;
  /** Relative-step caption — "{count} steps back". */
  stepsAgoLabel: (count: number) => string;
  /** Row click aria prefix — "go to {title}". */
  rowAriaLabel: (title: string) => string;
  /** "hand this over to the AI". */
  copyLabel: string;
  copyAriaLabel: string;
  copyCopiedAriaLabel: string;
  /** Footer "clear". */
  clearLabel: string;
  /** Chip ✕ aria — "clear the trail you walked". */
  clearAriaLabel: string;
  /** Level-1 header link — "past trails {count}". Shown only when something is archived. */
  pastLinkLabel: string;
  /** Level-2 heading — "past trails". */
  pastHeading: string;
  /** Level-2 ‹ aria — "back to the trail you walked". */
  pastBackAriaLabel: string;
  /** Row ✕ aria — "delete this trail". */
  pastDeleteAriaLabel: string;
  /** Level-2 footer "clear all". */
  pastClearAllLabel: string;
  /** Two-step confirm label — "press once more to delete". */
  pastClearAllConfirmLabel: string;
  /** Cap notice caption — "the last 10 only". */
  pastCapCaption: string;
  /** Empty-state body. */
  pastEmptyBody: string;
}

/** One row of the level-2 list — HomePage owns i18n and sends the strings already formatted. */
export interface TopologyPastWalkRow {
  id: string;
  /** Line 1 — "first → last". The middle arrow carries the trail's direction, so it is data. */
  routeLabel: string;
  /** Line 2 — "today · 12 places", or "not on the map right now" when the trail cannot be replayed. */
  metaLabel: string;
  /**
   * Whether this trail can be replayed on the current map. When false the row
   * becomes text rather than a button — looking unpressable is more honest than
   * a control that does nothing. Delete (✕) stays either way.
   */
  replayable: boolean;
  /**
   * Row button aria — "replay this trail — today, 12 places". A trail that cannot
   * be replayed has no button and therefore no label (null); computing a string
   * nothing uses is how a lie like "replay 0 places" leaks quietly into another
   * surface.
   */
  ariaLabel: string | null;
}

/** How long the `clear all` two-step confirm stays armed before reverting. */
const CLEAR_ALL_CONFIRM_RESET_MS = 4000;

export interface TopologyTrailChipProps {
  /** Pre-formatted chip label — "trail · {count}" (HomePage owns i18n; the chip is pure chrome). */
  label: string;
  /**
   * Visit order (oldest → newest), exactly as the model gives it. The popover
   * **reverses** it so the newest is on top: every time-ordered list in the app
   * is newest-first, and the target you want to go back to is usually 1–3 steps
   * ago, so it lands on the first screen without scrolling.
   */
  entries: readonly FootprintTrailEntry[];
  /** Currently focused node id — drawn as the indigo dot on the timeline. */
  currentId: string | null;
  labels: TopologyTrailChipLabels;
  onFocusEntry: (id: string) => void;
  /** Copies the visit-chain handoff packet to the clipboard. */
  onCopyPacket: () => void;
  copied: boolean;
  /** Clears the session trail (chip ✕ and the footer share it). Discards without archiving. */
  onClear: () => void;
  /**
   * Popover open = the **trail lens** on/off. On this one signal the map sets
   * relation reading aside and yields to trajectory reading (visited nodes keep
   * their values and labels; everything else, edges included, dims). Not a new
   * mode, toggle, or URL state — its lifetime is exactly the popover's.
   */
  onLensChange?: (active: boolean) => void;
  /**
   * Row hover/focus ↔ node brushing on the map. Answers "which node is two steps
   * back" by **pointing at it** rather than by numbering nodes.
   */
  onHoverEntry?: (id: string | null) => void;
  /** Archived past trails — newest first. */
  pastWalks: readonly TopologyPastWalkRow[];
  /**
   * Why the current trail is not being kept (read-only vault, …); null while
   * archiving normally. With no archive and nothing to report, the level-1
   * header link does not appear at all.
   */
  pastNotice: string | null;
  /**
   * **Replays** one past trail as the trail being walked now. The caller archives
   * the trail in progress first, refines the chosen one against the live map,
   * loads it, then focuses its last step. The chip only returns to level 1 — the
   * trail it just replayed is there.
   */
  onReplayPastWalk: (id: string) => void;
  onDeletePastWalk: (id: string) => void;
  /** Deletes every past trail (called after the two-step confirm). */
  onClearPastWalks: () => void;
}

/**
 * The "trail you walked" chip — a status chip in the top-centre chrome row, same
 * grammar as `TopologyPathChip` / `TopologyRealmChip`. Clicking opens a **mini
 * timeline** popover: visit order on a vertical dot-and-line rail with the newest
 * on top, each dot a kind glyph (indigo for where you are now), row click =
 * focus that node.
 *
 * Why newest-first — owner: "위에가 1인지 맨 아래가 1인지 구분하기 쉽지 않다"
 * (it is hard to tell whether the top or the bottom is step 1). Direction is not
 * left to the metaphor of the line. It matches every other time-ordered list in
 * the app (git history, freshness, the INDEX recent filter), and each row carries
 * its own relative-step caption ("you are here" / "n steps back"), so distance is
 * answered from whichever row you read first and the "is the top 1?" question
 * that absolute numbering left behind disappears. No directional decoration
 * (arrows, gradients) — it only adds ink and does not read at this contrast.
 *
 * transient-surface contract (same as the settings gear): a self-closing anchored
 * popover with no dim or backdrop, owning its own Escape so it does not fire
 * twice with the global Esc ladder.
 *
 * **Level 2** of the same shell is the archived past trails. No new route and no
 * second popup: a feature's past is seen where the feature lives. Level 2 has no
 * indigo — in a list with no "you are here", having no attention winner is the
 * honest state. Pressing a row replays that trail and returns to level 1 (the
 * trail in progress is archived first, so nothing is lost).
 */
export function TopologyTrailChip({
  label,
  entries,
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
  // Destructive and unrecoverable, so it goes through an inline two-step confirm
  // (a dialog is overkill at this size).
  const [clearAllArmed, setClearAllArmed] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const pastLinkRef = useRef<HTMLButtonElement | null>(null);

  // Only the render is reversed — the model (`appendFootprintVisit`) and the
  // handoff packet stay oldest → newest (the packet is replayed by a machine,
  // where chronological order is the correct one).
  const recentFirstEntries = useMemo(() => [...entries].reverse(), [entries]);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    // Closing always returns to level 1 — remembering which level was open would
    // make one trigger open a different screen each time.
    setShowPast(false);
    setClearAllArmed(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Lens lifetime = popover lifetime. It must turn off on unmount too (including
  // when clearing the trail removes the chip), or the map freezes dimmed. It stays
  // on while level 2 is showing — as long as the popover is open the map is still
  // a screen for reading trajectories.
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

  // Switching levels unmounts the other side's rows wholesale, with no pointer
  // leave event, so brushing is released explicitly here in **both** directions.
  // Returning to level 1 (including right after a replay) swaps the entire list,
  // and a row drawn under a stationary pointer fires no mouseenter — the old
  // brushing would stay on the map.
  useEffect(() => {
    onHoverEntry?.(null);
  }, [showPast, onHoverEntry]);

  // The confirm disarms itself — holding the armed state turns one careless click
  // later into a deletion.
  useEffect(() => {
    if (!clearAllArmed) return;
    const timer = window.setTimeout(() => setClearAllArmed(false), CLEAR_ALL_CONFIRM_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [clearAllArmed]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      close(false);
    };
    // Same contract as the settings gear — a WINDOW capture Escape closes even when
    // focus is outside, and stopPropagation keeps the global Esc ladder from
    // consuming the same key again.
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
    <div ref={rootRef} className="relative" data-testid="topology-trail-chip">
      <div className={CHROME_STATUS_CHIP_CLASS}>
        <Footprints size={ICON_SIZE.md} aria-hidden className="shrink-0 text-[color:var(--color-text-tertiary)]" />
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            if (open) close(false);
            else setOpen(true);
          }}
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={labels.triggerAriaLabel}
          data-testid="topology-trail-chip-trigger"
          className={controlClass({
            shape: "link",
            tone: "strong",
            truncate: true,
            // Under 12px of clearance from the clear button beside it — touch-hit-expand
            // would steal the tap.
            className: "min-w-0 font-[var(--font-weight-signature)]",
          })}
        >
          {label}
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label={labels.clearAriaLabel}
          data-testid="topology-trail-chip-clear"
          className={controlClass({
            shape: "icon",
            size: "sm",
            tone: "muted",
            className: "-mr-1 hover:text-[color:var(--color-text-primary)]",
          })}
        >
          <X size={ICON_SIZE.md} aria-hidden />
        </button>
      </div>
      {/* Hangs off the chip's bottom-right corner, and grows out of that corner. */}
      <Surface
        open={open}
        origin="top right"
        role="group"
        aria-label={labels.heading}
        data-testid="topology-trail-chip-popover"
        className="absolute right-0 top-[calc(100%+8px)] z-30 w-[248px] rounded-chip border border-[color:var(--topology-floating-panel-border)] bg-[color:var(--topology-floating-panel-surface)] shadow-[var(--topology-floating-panel-shadow)]"
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
                {/* A quiet entry point that appears only when there is something to
                    show — a link pointing at an absent past is only ink. */}
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
              {/* Say why nothing is being kept — a silent failure is the worst kind.
                  While archiving normally this line does not exist at all. */}
              {pastNotice !== null ? (
                <p
                  data-testid="topology-trail-past-notice"
                  className="border-b border-[color:var(--topology-floating-panel-divider)] px-3 py-2 text-caption leading-label text-[color:var(--color-text-tertiary)]"
                >
                  {pastNotice}
                </p>
              ) : null}
              {/* Past trails — row height is decided by the anatomy (two lines), not
                  by the content, so the grid reads at one rhythm whatever the
                  title length. */}
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
                      {/* Only a replayable trail is a button. A trail gone from the map
                          keeps the same anatomy as text, and its second line answers
                          why it cannot be pressed — we do not build controls that do
                          nothing when pressed. */}
                      {walk.replayable ? (
                        <button
                          type="button"
                          onClick={() => {
                            onReplayPastWalk(walk.id);
                            // The trail just replayed is on level 1 — go back there.
                            setShowPast(false);
                            setClearAllArmed(false);
                          }}
                          aria-label={walk.ariaLabel ?? undefined}
                          data-testid="topology-trail-past-replay"
                          // The affordance is carried by a **text lift**, not by the
                          // background — overlay-1 hover measures 1.03:1 on this
                          // surface, i.e. effectively invisible. Level-1 rows already
                          // say "pressable" with the same secondary→primary lift.
                          // The text is a child span, so the cascade is blocked and it
                          // has to go through group.
                          className={controlClass({ shape: "row", size: "sm", className: "group min-w-0 flex-1 flex-col justify-center gap-0.5 self-stretch px-1.5 hover:bg-[color:var(--color-overlay-1)]" })}
                        >
                          {/* Lift line 1 only — lifting both collapses the two-line
                              hierarchy and gives level 2 an attention winner it
                              deliberately lacks. */}
                          <span className="w-full truncate text-body text-[color:var(--color-text-secondary)] transition-colors group-hover:text-[color:var(--color-text-primary)]">
                            {walk.routeLabel}
                          </span>
                          <span className="w-full truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                            {walk.metaLabel}
                          </span>
                        </button>
                      ) : (
                        <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-1.5">
                          {/* Demote, but not to the floor — the only thing to do in
                              this row is read which trail to delete, so putting that
                              text at the bottom of the ramp inverts it. Clearly below
                              a live row (secondary) and above the caption
                              (quaternary): three steps are what make line 2 read as
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
                      // Hover belongs to the consumer — the ink wakes only before arming.
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
                {/* Do not hide the cap — say up front that this is a rotating buffer,
                    not an accumulation. */}
                <span className="shrink-0 font-mono text-caption text-[color:var(--color-text-quaternary)]">
                  {labels.pastCapCaption}
                </span>
              </div>
            </>
          ) : (
          <>
          {/* Mini timeline — a vertical dot-and-line rail, newest on top (top = latest
              → bottom = oldest). i is therefore "how many steps back from the latest
              visit", so the caption costs one index. */}
          <ol className="flex max-h-[280px] flex-col overflow-y-auto px-3 py-2.5">
            {recentFirstEntries.map((entry, i) => {
              const isCurrent = entry.id === currentId;
              // The top row alone gets "you are here" (when something is focused) or
              // "just now" (when nothing is selected — e.g. after an empty-canvas
              // click; the honest state, with no indigo dot).
              const stepLabel =
                i === 0
                  ? isCurrent
                    ? labels.currentLabel
                    : labels.justNowLabel
                  : labels.stepsAgoLabel(i);
              return (
                <li
                  key={entry.id}
                  // Brushing targets the whole row (rail glyph + title + step caption)
                  // — the unit the user reads is the row, not the button.
                  onMouseEnter={() => onHoverEntry?.(entry.id)}
                  onMouseLeave={() => onHoverEntry?.(null)}
                  onFocus={() => onHoverEntry?.(entry.id)}
                  onBlur={() => onHoverEntry?.(null)}
                  className="flex items-stretch gap-2"
                >
                  {/* Left rail — the dot plus the connecting segments above and below
                      (half only on the first and last row). */}
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
                      <TopologyV2KindGlyph kind={entry.kind} size={13} className="my-0.5 shrink-0" />
                    )}
                    <span
                      aria-hidden
                      className={`w-px flex-1 ${i === recentFirstEntries.length - 1 ? "bg-transparent" : "bg-[color:var(--color-divider)]"}`}
                    />
                  </span>
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
                  {/* The relative-step caption sits **outside** the button so the row's
                      aria-label does not swallow it and screen readers still get the
                      distance. Only the current row is indigo (the attention winner). */}
                  <span
                    data-testid="topology-trail-step-label"
                    className={`shrink-0 self-center font-mono text-caption tabular-nums ${
                      i === 0 && isCurrent
                        ? "text-[color:var(--color-indigo-accent)]"
                        : "text-[color:var(--color-text-quaternary)]"
                    }`}
                  >
                    {stepLabel}
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
              onClick={onClear}
              data-testid="topology-trail-clear-footer"
              className={controlClass({
                shape: "segment",
                tone: "muted",
                className: "hover:text-[color:var(--color-text-primary)]",
              })}
            >
              {labels.clearLabel}
            </button>
          </div>
          </>
          )}
      </Surface>
    </div>
  );
}
