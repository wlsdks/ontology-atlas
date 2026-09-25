'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { getTopologyFocusHref } from '@/entities/project';
import { ChromeChip, CHROME_STATUS_CHIP_CLASS } from '@/shared/ui/chrome-chip';
import { controlClass } from '@/shared/ui/control-class';
import { Surface } from '@/shared/ui/surface';
import { cn } from '@/shared/lib/cn';
import { elapsedParts } from '@/shared/lib/elapsed';
import { AgentInboxPanel, MarkAllReadDoor } from './AgentInboxPanel';
import { AgentWorkFact } from './AgentWorkFact';
import { deriveBellInbox } from '../model/bell-inbox';
import { useAgentActivityFeed } from '../model/use-agent-activity-feed';
import type { AgentLiveWorkInput } from '../model/agent-work-projection';

/**
 * Verified 「Current/Last Task」 reading and past notifications are presented in one feed, in two lines.
 *
 * - The status row opens only the current agent·step·target below the top-right map toolbar.
 * - The bell is a square tile at the **far right** of the toolbar, opening only notification/task receipts.
 * - The unread count is an absolute badge inside the tile, so it does not increase button width.
 *
 * We do not create separate hooks for them to avoid duplicating disk polling and read criteria.
 * This root owns the feed, outer click, Escape, and focus return together.
 * Atlas does not claim the agent is 「Connected」. Only fresh heartbeats are in present tense,
 * otherwise it says 「Last task N minutes ago」. The gate
 * `tests/e2e/agent-activity-placement.spec.ts` measures position·square·width·overlap.
 */
export function AgentActivityChip({
  suppressed = false,
  liveWork = null,
  conversationOpen = false,
  compact = false,
  onOpenChange,
  onOpenNode,
  onOpenConversation,
}: {
  suppressed?: boolean;
  /** The current state the in-app ACP on the right already knows. Updates the same chip before file polling. */
  liveWork?: AgentLiveWorkInput | null;
  /**
   * The conversation panel is open beside the map.
   *
   * That panel already streams the in-app turn — its step, its tools, its words — so the
   * toolbar saying the same thing again is the same fact in two places (2026-09-19,
   * "nothing said twice"; owner, 2026-09-24, on exactly this pair). While it is open, an
   * **in-app** turn's status leaves the toolbar. Work the panel does not show — another
   * agent's heartbeat, a recent write on disk — still speaks here.
   */
  conversationOpen?: boolean;
  /**
   * The lane is in its icon-first state (a docked panel beside it, or a focus). The
   * status then folds to its dot and elapsed time, like every other chip in the row.
   */
  compact?: boolean;
  /**
   * Reports when the notification box opens and closes.
   *
   * Why the outside needs to know (owner report 2026-08-17: *"Shouldn't
   * the notification cover what's above?"* — shouldn't
   * the notification cover what's above?): the utility lane this chip lives in is `z-20` and
   * therefore **creates a stacking context.** So giving the notification box `z-30` makes that 30
   * valid **only inside the lane**, and the right-hand tool tiles outside it (same `z-20`, but later
   * in the DOM and therefore winning) drew on top of it.
   *
   * The lane must not be raised permanently — the scrim (`--z-map-scrim`, 25) must be able to cover
   * it. So it is raised **only while open**. The notification box closes itself on an outside press
   * or Escape, so the raised state does not last long.
   */
  onOpenChange?: (open: boolean) => void;
  /** Already on the map: updates the same HomePage selection state without a route remount. */
  onOpenNode?: (slug: string) => void;
  /**
   * Opens the conversation dock.
   *
   * The todo tab's door for a waiting request. Atlas cannot answer that request from
   * here: the allow/reject callback lives inside `useAcpSession`, owned by the chat panel,
   * and an ontology write is reviewed against a directional diff (`OntologyChangeReview`)
   * inside the permission card. A 352px popover is the wrong place to decide that, so the
   * row states the fact and this door goes to the place that can decide it.
   */
  onOpenConversation?: () => void;
} = {}) {
  const t = useTranslations('agentActivity');
  const format = useFormatter();
  const feed = useAgentActivityFeed(liveWork);
  /*
   * Derived here rather than inside the panel: the bell's own badge has to know whether
   * anything waits on the person **before** the panel is ever opened.
   */
  const inbox = useMemo(
    () =>
      deriveBellInbox({
        sessions: feed.sessions,
        notifications: feed.notifications,
        receipts: feed.workReceipts,
        work: feed.work,
        readAt: feed.readAt,
        nowMs: feed.nowMs,
      }),
    [feed.sessions, feed.notifications, feed.workReceipts, feed.work, feed.readAt, feed.nowMs],
  );
  const todoCount = inbox.todos.length;
  /*
   * One mark, two grades (the plan asked for the waiting count alone; the code says it
   * cannot be that). Nothing waits most of the time, so that alone deletes the
   * unread mark in exactly the moment this slice was written for — four finished turns
   * waiting after an hour. So: something waiting on the person wins the badge and its
   * filled indigo; otherwise the badge counts the **results** nobody has opened.
   *
   * ⚠️ Not `feed.unreadCount`, which counts raw notifications: this slice folds a task's
   * start and its end into one row, so a bell reading 8 sat over a Results tab reading 4 with four
   * unread dots (measured on the seeded folder, design-lead round 1). The badge, the dots
   * and the "Mark all read" door now read the same number.
   */
  const badgeCount = todoCount > 0 ? todoCount : inbox.unreadResults;
  const [openSurface, setOpenSurface] = useState<'status' | 'notifications' | null>(null);
  /*
   * **Which of the two views the box holds, kept through the exit.**
   *
   * `openSurface` goes null the moment the box starts closing, so a child conditioned on
   * it unmounted in the same frame and the rounded box faded out **empty** — the content
   * hard-cut while its own container was still animating. This is set by the press that
   * opens a view and never cleared, so the two views are a swap (the box always holds one
   * of them) rather than two appearances.
   */
  const [renderedSurface, setRenderedSurface] = useState<'status' | 'notifications'>('notifications');
  const open = openSurface !== null;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLButtonElement | null>(null);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const openTriggerRef = useRef<'status' | 'bell'>('status');

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  // Also report closed on unmount (when a datasheet opens and the stack recedes) — without it the
  // lane freezes in its raised state.
  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);

  const close = useCallback(
    (returnFocus: boolean) => {
      setOpenSurface(null);
      if (returnFocus) {
        const trigger = openTriggerRef.current === 'bell' ? bellRef.current : statusRef.current;
        trigger?.focus();
      }
    },
    [],
  );

  // The transient-surface contract (same as the settings gear and the trail): a self-closing anchored
  // popover with no dim, owning its own Escape so it does not double-fire with the global Esc ladder.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      close(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, close]);

  const showBell =
    (feed.notificationsEnabled && feed.notifications.length > 0) || feed.workReceipts.length > 0;
  const showStatus = feed.showStatus && !(liveWork !== null && conversationOpen);
  // While the stack has receded (during a datasheet investigation) it **unmounts** — the stack
  // disappears by `opacity-0` alone, so leaving it makes an invisible but clickable, focusable control.
  if (suppressed) return null;
  // With nothing to say and nothing to open, it takes up no space.
  if (!showStatus && !showBell) return null;

  const relative = (at: number) => format.relativeTime(new Date(at), feed.nowMs);
  const phase = feed.work.phase ? t(`phase.${feed.work.phase}`) : null;
  const age = feed.lastAt === null ? null : relative(feed.lastAt);
  /*
   * How long the agent has been at it (owner, 2026-09-06: "can it say how many minutes it
   * has been working?"). The number comes from the turn's own start, not from the last
   * heartbeat, so a long silent tool call still counts.
   */
  const elapsed = (() => {
    const startedAt = feed.work.startedAt ?? null;
    if (feed.work.mode !== 'live' || startedAt === null) return null;
    const { hours, minutes, seconds } = elapsedParts(feed.nowMs - startedAt);
    if (hours > 0) return t('elapsedHours', { hours, minutes });
    if (minutes > 0) return t('elapsedMinutes', { minutes, seconds });
    return t('elapsedSeconds', { seconds });
  })();
  const liveLabel = feed.agentName && phase ? t('liveAgent', { agent: feed.agentName, phase }) : phase ?? t('writing');
  const statusLabel =
    feed.work.mode === 'live'
      ? elapsed
        ? `${liveLabel} · ${elapsed}`
        : liveLabel
      : feed.work.mode === 'recent-write'
        ? feed.agentName && age
          ? t('recentWriteAgent', { agent: feed.agentName, age })
          : age
            ? t('recentWrite', { age })
            : t('quietUnknown')
        : feed.lastAt === null
          ? t('quietUnknown')
          : feed.agentName
            ? t('lastWorkedAtAgent', { agent: feed.agentName, age: age ?? '' })
            : t('lastWorkedAt', { age: age ?? '' });
  const targetPrefix = feed.work.mode === 'live' ? t('currentTarget') : t('lastTarget');
  // The short step word a folded status keeps beside its dot — only while live, and
  // only when the elapsed time is not already standing there.
  const foldedPhase = feed.work.mode === 'live' && !elapsed ? phase : null;
  const openPanel = (trigger: 'status' | 'bell') => {
    const surface = trigger === 'status' ? 'status' : 'notifications';
    if (openSurface === surface) {
      close(false);
      return;
    }
    openTriggerRef.current = trigger;
    setRenderedSurface(surface);
    setOpenSurface(surface);
  };

  return (
    <div
      ref={rootRef}
      className="contents"
      data-testid="agent-activity-chip"
      data-work-mode={feed.work.mode}
    >
      {/*
        **The status is a segment of the activity control, not a box under it** (owner,
        2026-09-24: *"the toast at the top — the design is poor, the colour too, and the
        position"*, pointing at this line during an in-app turn). It used to hang 8px under
        the toolbar's right end, `absolute`, attached to nothing: measured at 1040 it lay
        across the search lane's second row (832–918 × 74–98 over 804–1016 × 76–112), and
        at 1512 with the meaning panel open a toast covered it. Now it is the left half of
        one control whose right half is the bell, in the toolbar row itself, so it can
        neither float over the map nor collide with a lane it does not belong to.

        The node it names moved into the status view this segment opens: the map already
        rings that node, and the row's width is what the lane cannot spare.
      */}
      {showStatus || showBell ? (
        <div
          className="flex shrink-0 items-center"
          data-testid="agent-activity-dock"
          data-agent-activity-status-slot={showStatus ? 'utility-row-segment' : undefined}
        >
          {showStatus ? (
            <button
              ref={statusRef}
              type="button"
              aria-haspopup="true"
              aria-expanded={openSurface === 'status'}
              aria-label={t('statusAria', { status: statusLabel })}
              title={statusLabel}
              data-testid="agent-activity-status-trigger"
              data-writing={feed.writing ? 'true' : 'false'}
              data-status-fold={compact ? 'compact' : 'labelled'}
              onClick={() => openPanel('status')}
              className={controlClass({
                shape: 'chip',
                size: 'md',
                hoverInk: 'strong',
                hoverSurface: 'lift',
                hoverBorder: 'strong',
                // The row's status-chip geometry (one source with the realm and return
                // chips) over the shared control's focus and hover axes — the same lift
                // and border `ChromeChip` gives the bell beside it.
                className: cn(
                  CHROME_STATUS_CHIP_CLASS,
                  'min-w-0',
                  openSurface === 'status' &&
                    'border-[color:var(--chrome-active-border)] bg-[color:var(--chrome-active-surface)] text-[color:var(--color-text-primary)]',
                  // Joined to the bell: one outline; the bell's own left border is the seam.
                  showBell && 'rounded-r-none border-r-0',
                  // With nothing but the dot left to show, the segment is a tile.
                  compact && !elapsed && !foldedPhase && 'w-[var(--chrome-tile-size)] justify-center px-0',
                  !compact &&
                    !elapsed &&
                    !foldedPhase &&
                    'max-xl:w-[var(--chrome-tile-size)] max-xl:justify-center max-xl:px-0',
                ),
              })}
            >
              <span
                aria-hidden
                data-testid="agent-activity-dot"
                className={cn(
                  'inline-block size-1.5 shrink-0 rounded-full',
                  feed.writing
                    ? 'bg-[color:var(--color-indigo-accent)]'
                    : 'bg-[color:var(--color-text-quaternary)]',
                )}
              />
              {/*
                Who and which step. Folded to the screen reader where the lane is compact
                (a docked panel beside it) or narrower than `xl`; the button's
                `aria-label` and `title` keep the whole sentence.
              */}
              <span
                data-testid="agent-activity-status"
                className={cn(
                  'flex min-w-0 max-w-48 items-baseline text-[color:var(--color-text-primary)]',
                  compact ? 'sr-only' : 'max-xl:sr-only',
                )}
              >
                <AgentWorkFact text={feed.work.mode === 'live' ? liveLabel : statusLabel} />
              </span>
              {/*
                The step word stays beside the dot where the sentence folds away
                (2026-09-25): at 1040 the segment was a bare 36px dot, so "Codex ·
                verifying" lived only in the accessible name and the native title.
              */}
              {foldedPhase ? (
                <span
                  data-testid="agent-activity-phase"
                  aria-hidden
                  className={cn(
                    'shrink-0 whitespace-nowrap text-[color:var(--color-text-primary)]',
                    compact ? undefined : 'xl:hidden',
                  )}
                >
                  {foldedPhase}
                </span>
              ) : null}
              {feed.work.mode === 'live' && elapsed ? (
                <span
                  data-testid="agent-activity-elapsed"
                  className="shrink-0 font-mono tabular-nums text-[color:var(--color-text-tertiary)]"
                >
                  {elapsed}
                </span>
              ) : null}
            </button>
          ) : null}

          {showBell ? (
            <ChromeChip
              ref={bellRef}
              compact
              active={openSurface === 'notifications'}
              onClick={() => openPanel('bell')}
              aria-haspopup="true"
              aria-expanded={openSurface === 'notifications'}
              aria-label={
                todoCount > 0
                  ? t('bellTodoAria', { count: todoCount })
                  : inbox.unreadResults > 0
                    ? t('bellUnreadAria', { count: inbox.unreadResults })
                    : t('bellAria')
              }
              data-testid="agent-activity-bell"
              data-agent-activity-bell-slot="utility-row-end"
              /*
               * The bell carries its own state, not just a badge beside it. Reported
               * 2026-08-24: with the count sitting in a 16px badge, a bell holding nine
               * unread receipts and an empty bell read the same at a glance. Filling the
               * glyph and lifting it to primary ink changes the **shape and weight** of
               * the mark, so "there is something here" survives a squint and does not
               * depend on noticing a small badge -- or on colour alone.
               */
              className={cn(
                'relative shrink-0 overflow-visible',
                showStatus && 'rounded-l-none',
                badgeCount > 0 && 'text-[color:var(--color-text-primary)]',
              )}
              icon={<Bell aria-hidden fill={badgeCount > 0 ? 'currentColor' : 'none'} />}
              badge={
                badgeCount > 0 ? (
                  <span
                    data-testid="agent-activity-unread"
                    data-badge-grade={todoCount > 0 ? 'waiting' : 'unread'}
                    className={cn(
                      'absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-caption tabular-nums',
                      todoCount > 0
                        ? 'bg-[color:var(--color-indigo-brand)] text-[color:var(--color-text-on-accent)]'
                        : 'bg-[color:var(--color-indigo-a32)] text-[color:var(--color-indigo-text-soft)]',
                    )}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                ) : null
              }
            />
          ) : null}
        </div>
      ) : null}

      <Surface
        open={open}
        origin="top right"
        role="group"
        aria-label={t(renderedSurface === 'notifications' ? 'notificationTitle' : 'inboxTitle')}
        data-testid="agent-activity-inbox"
        data-agent-activity-panel={openSurface ?? undefined}
        data-agent-activity-rendered={renderedSurface}
        style={{ right: 'calc(var(--chrome-tile-size) + 8px)' }}
        className={cn(
          /*
           * ⚠️ **The viewport is the hard ceiling; the body's own cap is the preferred one**
           * (design-responsive, 2026-09-12). With no height token the box grew to whatever
           * its content wanted: at 768×600 with the browser's text at 150% the closing
           * sentence was sliced in half by the bottom tab bar, and at 200% four of the five
           * rows plus the footer sat below the window edge with no way to scroll to them.
           * The ceiling is the viewport **minus this box's own anchor**, because
           * `--map-panel-max-height` alone is not it: that token is written for a surface
           * hanging at `--topology-node-popover-top`, and this one hangs under the utility
           * lane (`--chrome-inset` + a `--chrome-tile-size` row + the `top` offsets written
           * on this very element, 52 + 8). Measured at 768×600 with the token alone: the box
           * ended 28px inside the bottom tab bar because its real top was 124, not 72.
           * `--map-panel-bottom-reserve` carries the tab bar and the safe area below `lg`,
           * and the flex column hands the leftover to the scrolling body rather than to the
           * header or the footer.
           */
          'absolute z-30 flex max-h-[calc(100dvh-var(--chrome-inset)-var(--chrome-tile-size)-60px-var(--map-panel-bottom-reserve))] w-[var(--map-panel-width)] flex-col overflow-hidden whitespace-normal rounded-[var(--map-panel-radius)] border border-[color:var(--topology-floating-panel-border)] bg-[color:var(--topology-floating-panel-surface)] shadow-[var(--topology-floating-panel-shadow)]',
          // The status now stands in the row itself, so both views hang from the row.
          'top-[calc(100%+8px)]',
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--topology-floating-panel-divider)] px-3 py-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
          <span className="min-w-0 flex-1 truncate">
            {t(renderedSurface === 'notifications' ? 'notificationTitle' : 'inboxTitle')}
          </span>
          {/*
            The one door that moves the read boundary in a single press. It appears only
            with something unread behind it — a control that can change nothing is noise.
          */}
          {renderedSurface === 'notifications' && inbox.unreadResults > 0 ? (
            <MarkAllReadDoor
              onPress={feed.markAllRead}
              label={t('markAllReadCount', { count: inbox.unreadResults })}
            />
          ) : null}
        </div>

        {renderedSurface === 'notifications' ? (
          <AgentInboxPanel
            inbox={inbox}
            feed={feed}
            onOpenNode={onOpenNode}
            onOpenConversation={onOpenConversation}
            onClose={() => close(true)}
          />
        ) : feed.work.mode !== 'idle' ? (
          <section
            data-testid="agent-activity-current-work"
            className="min-h-0 overflow-y-auto px-3 py-3"
          >
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="min-w-0 truncate text-label text-[color:var(--color-text-primary)]">
                {feed.agentName ?? t('unknownAgent')}
              </span>
              <span className="min-w-0 font-mono text-caption text-[color:var(--color-text-tertiary)]">
                <AgentWorkFact text={feed.work.mode === 'live'
                  ? phase ?? t('writing')
                  : feed.work.mode === 'recent-write'
                    ? t('recentWriteShort')
                    : t('complete')} />
              </span>
            </div>
            {feed.work.summary ? (
              <p className="mt-1.5 text-label leading-label text-[color:var(--color-text-secondary)]">
                {feed.work.summary}
              </p>
            ) : null}
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-caption leading-label">
              {feed.lastNode ? (
                <>
                  {/* The prefix the toolbar row used to carry: "current" only while live. */}
                  <dt className="text-[color:var(--color-text-quaternary)]">{targetPrefix}</dt>
                  <dd className="min-w-0">
                    {onOpenNode ? (
                      <button
                        type="button"
                        onClick={() => onOpenNode(feed.lastNode!.slug)}
                        data-testid="agent-activity-target"
                        aria-label={t('openOnMap', { name: feed.lastNode.name })}
                        className={controlClass({
                          shape: 'link',
                          tone: 'accent',
                          hoverInk: 'strong',
                          className: 'min-w-0',
                        })}
                      >
                        <span className="min-w-0 truncate">{feed.lastNode.name}</span>
                      </button>
                    ) : (
                      <Link
                        href={getTopologyFocusHref(feed.lastNode.slug)}
                        data-testid="agent-activity-target"
                        aria-label={t('openOnMap', { name: feed.lastNode.name })}
                        className={controlClass({
                          shape: 'link',
                          tone: 'accent',
                          hoverInk: 'strong',
                          className: 'min-w-0',
                        })}
                      >
                        <span className="min-w-0 truncate">{feed.lastNode.name}</span>
                      </Link>
                    )}
                  </dd>
                </>
              ) : null}
              {feed.work.nextStep ? (
                <>
                  <dt className="text-[color:var(--color-text-quaternary)]">{t('nextStepLabel')}</dt>
                  <dd className="min-w-0 truncate text-[color:var(--color-text-tertiary)]">
                    {feed.work.nextStep}
                  </dd>
                </>
              ) : null}
              {feed.work.lastTool ? (
                <>
                  <dt className="text-[color:var(--color-text-quaternary)]">{t('toolLabel')}</dt>
                  <dd className="min-w-0 truncate font-mono text-[color:var(--color-text-tertiary)]">
                    {feed.work.lastTool}
                  </dd>
                </>
              ) : null}
            </dl>
          </section>
        ) : null}

        <p className="shrink-0 border-t border-[color:var(--topology-floating-panel-divider)] px-3 py-2 text-caption leading-label text-[color:var(--color-text-quaternary)]">
          {t('inboxFooter')}
        </p>
      </Surface>
    </div>
  );
}
