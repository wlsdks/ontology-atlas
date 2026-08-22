'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import { Link } from '@/i18n/navigation';
import { getTopologyFocusHref } from '@/entities/project';
import { CHROME_STATUS_CHIP_CLASS } from '@/shared/ui/chrome-chip';
import { controlClass } from '@/shared/ui/control-class';
import { IconButton } from '@/shared/ui/controls';
import { Surface } from '@/shared/ui/surface';
import { cn } from '@/shared/lib/cn';
import { agentDisplayName } from '@/shared/lib/agent-display-name';
import type { AgentNotification, AgentNotificationKind } from '@/shared/lib/agent-notifications';
import { useAgentActivityFeed } from '../model/use-agent-activity-feed';
import type { AgentLiveWorkInput } from '../model/agent-work-projection';

/**
 * The "working / last worked" chip, plus the bell and the notification box.
 *
 * ## Measurement decided the placement — the map's bottom-right readout stack
 *
 * The top-centre status row (area, path, trail) was right by category but **does not fit at 1024**:
 * that row sits 69px from the INDEX panel's right edge (388px) while this chip is 194px, overlapping
 * by 32px. The top-right utility lane had only 28px left. The four chips in that row are
 * **transient states the user created by hand**, so they use that slack knowingly; this one is
 * **permanent**.
 *
 * The bottom-right readout stack has nothing competing horizontally, and the toast already reads
 * that stack's real rect and steps above it (`resolveToastBottomOffsetForStack`) — one more line and
 * the toast rises by itself. The category fits too: it is the home of the **ambient readouts** where
 * the legend, the first-run readout, and the frame instrument live. The popover is at the bottom of
 * the screen, so it opens **upward**.
 *
 * ## It never says "connected"
 *
 * Atlas does not connect to an agent — **it only watches a folder.** With no connection, "connected"
 * is a lie, while "last worked N minutes ago" is true whenever it is said.
 *
 * ## Charter
 *
 * Neutrals plus one indigo. The "working" dot is **indigo** — success (emerald) is restricted to
 * "connected/complete" signals, and working is not success. Only problem notifications use the
 * warning signal tone. No pulse, glow, or scale-hover: no decorative motion when the bell badge
 * increments ("one input = one event").
 */
/**
 * **One line lives in one place** (reverted on the owner's report, 2026-08-17).
 *
 * After the first instruction (*"사용자가 위는 봐도 아래는 잘 안볼듯한데"* — users may look at the
 * top but probably not at the bottom), **only the bell** moved up while the status line stayed
 * below. The owner reported three problems with the result, and all three had one root — **only the
 * control moved, while the geometry stayed as it had been at the bottom.**
 *
 * | Report | Measured | Cause |
 * |---|---|---|
 * | *"가로로 너무 길고"* (far too wide) | bell 40×24 (ratio 1.67) | one icon inside a **chip shell meant for a line of text** |
 * | *"누르면 제대로 안보이고"* (pressing it does not show properly) | notification box's top edge clipped **122px** above the screen | `bottom-full` grows **upward** — geometry from when it lived at the bottom |
 * | *"하단에는 그대로 이게 있고..? 헷갈리는데"* (this is still at the bottom..? confusing) | activity line in **two places** | one fact, two places |
 *
 * So the instruction's "move the whole line to the bottom" is followed exactly: the status line and
 * the bell live together as **one chip** on the **line below** "agent / recent changes". Nothing is
 * left at the bottom of the map. Gate: `tests/e2e/agent-activity-placement.spec.ts`.
 */
export function AgentActivityChip({
  suppressed = false,
  liveWork = null,
  onOpenChange,
  onOpenNode,
}: {
  suppressed?: boolean;
  /** The current state the in-app ACP on the right already knows. Updates the same chip before file polling. */
  liveWork?: AgentLiveWorkInput | null;
  /**
   * Reports when the notification box opens and closes.
   *
   * Why the outside needs to know (owner report 2026-08-17: *"알림이 위로 덮어야지?"* — shouldn't
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
} = {}) {
  const t = useTranslations('agentActivity');
  const format = useFormatter();
  const feed = useAgentActivityFeed(liveWork);
  const [open, setOpen] = useState(false);
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
      setOpen(false);
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

  const showBell = feed.notificationsEnabled && feed.notifications.length > 0;
  const showStatus = feed.showStatus;
  // While the stack has receded (during a datasheet investigation) it **unmounts** — the stack
  // disappears by `opacity-0` alone, so leaving it makes an invisible but clickable, focusable control.
  if (suppressed) return null;
  // With nothing to say and nothing to open, it takes up no space.
  if (!showStatus && !showBell) return null;

  const relative = (at: number) => format.relativeTime(new Date(at), feed.nowMs);
  const phase = feed.work.phase ? t(`phase.${feed.work.phase}`) : null;
  const age = feed.lastAt === null ? null : relative(feed.lastAt);
  const statusLabel =
    feed.work.mode === 'live'
      ? feed.agentName && phase
        ? t('liveAgent', { agent: feed.agentName, phase })
        : phase ?? t('writing')
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
  const openInbox = (trigger: 'status' | 'bell') => {
    if (open) {
      close(false);
      return;
    }
    openTriggerRef.current = trigger;
    setOpen(true);
    feed.markAllRead();
  };

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto relative min-w-0"
      data-testid="agent-activity-chip"
      data-work-mode={feed.work.mode}
    >
      {/* **The content decides the box.** The chip shell is meant to hold «a line of text» and so
          carries 14px of horizontal padding. With no status to state and only the bell left (the
          status display switched off in settings), that shell seats a single icon in a 56px-wide box —
          exactly the shape the owner reported. */}
      <div
        className={showStatus ? CHROME_STATUS_CHIP_CLASS : 'pointer-events-auto flex items-center'}
        data-writing={feed.writing ? 'true' : 'false'}>
        {showStatus ? (
          <>
            <button
              ref={statusRef}
              type="button"
              aria-haspopup="true"
              aria-expanded={open}
              aria-label={t('statusAria', { status: statusLabel })}
              data-testid="agent-activity-status-trigger"
              onClick={() => openInbox('status')}
              className={controlClass({
                shape: 'link',
                hoverInk: 'strong',
                className: 'min-w-0 gap-1.5 text-left text-inherit',
              })}
            >
              {/* The status is stated by **words**, not colour — the dot only assists, so someone who
                  cannot see the colour still reaches the verdict from the copy alone (WCAG 1.4.1). */}
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
              <span
                data-testid="agent-activity-status"
                className="min-w-0 truncate text-[color:var(--color-text-primary)]"
              >
                {statusLabel}
              </span>
            </button>
            {/* With no target (a batch write, a document absorb, or a slug that vanished from the vault)
                it states **the status without a target**. It does not create a dead link. */}
            {feed.lastNode ? (
              // The truncation ladder — the target name folds only on a phone (<md) where width is
              // scarce. Even folded, the target is still carried by the "work finished" line in the box.
              <span className="flex min-w-0 items-center gap-1.5 max-md:hidden">
                <span aria-hidden className="shrink-0 text-[color:var(--color-text-quaternary)]">
                  ·
                </span>
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
                      className:
                        'min-w-0 max-w-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
                    })}
                  >
                    <span className="shrink-0 text-[color:var(--color-text-quaternary)]">
                      {targetPrefix}:
                    </span>
                    <span className="min-w-0 truncate">{feed.lastNode.name}</span>
                  </button>
                ) : (
                  <Link
                    href={getTopologyFocusHref(feed.lastNode.slug)}
                    data-testid="agent-activity-target"
                    aria-label={t('openOnMap', { name: feed.lastNode.name })}
                  /*
                   * ⚠️ The `truncate` axis is not used (owner report 2026-08-17 → measured). That axis
                   * emits `block truncate`, and `block` displaces this shape's `inline-flex`
                   * (tailwind-merge). Then `items-center` has nothing to centre against, and **the text
                   * sticks to the top** inside the 24px `min-h-6` box.
                   *
                   * Measured: neighbouring text on the same line had a top edge at 17–18px while this
                   * link alone was at 14px — floating 3px high (same font size, both 9px of ink). So
                   * truncation is left to the inner text and the shape is untouched.
                   */
                    className={controlClass({
                      shape: 'link',
                      tone: 'accent',
                      hoverInk: 'strong',
                      className:
                        'min-w-0 max-w-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
                    })}
                  >
                    <span className="shrink-0 text-[color:var(--color-text-quaternary)]">
                      {targetPrefix}:
                    </span>
                    <span className="min-w-0 truncate">{feed.lastNode.name}</span>
                  </Link>
                )}
              </span>
            ) : null}
          </>
        ) : null}
        {showBell ? (
          <>
            {showStatus ? (
              <span
                aria-hidden
                className="h-4 w-px shrink-0 bg-[color:var(--color-divider)]"
              />
            ) : null}
            {/*
              * The canonical square icon control is `IconButton` (shape: 'icon'). It used to be
              * `shape: 'segment'`, which is a **horizontally stretching** shape, so holding a single
              * icon made it 40×24 (ratio 1.67).
              *
              * The unread count sits **outside the button**. Inside, that width stretches the button
              * again and breaks the square — fixing the shape and then undoing it with content. A
              * sibling riding the chip's `gap-1.5` rhythm is the right form.
              */}
            <IconButton
              ref={bellRef}
              size="sm"
              onClick={() => {
                openInbox('bell');
              }}
              aria-haspopup="true"
              aria-expanded={open}
              label={
                feed.unreadCount > 0
                  ? t('bellUnreadAria', { count: feed.unreadCount })
                  : t('bellAria')
              }
              data-testid="agent-activity-bell"
              className="-mr-1 shrink-0 hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]"
            >
              <Bell size={ICON_SIZE.sm} aria-hidden />
            </IconButton>
            {feed.unreadCount > 0 ? (
              <span
                data-testid="agent-activity-unread"
                className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-indigo-a32)] px-1 font-mono text-caption tabular-nums text-[color:var(--color-indigo-text-soft)]"
              >
                {feed.unreadCount}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      {/* The notification box grows **downward** from the bell button. Its entrance origin is anchored
          to the trigger (top right) — born at the centre, the place pressed and the place appearing
          are disconnected.
          ⚠️ The direction is decided by **where the chip lives**. While this chip lived at the bottom
          of the map it grew upward (`bottom-full`), and after moving to the top right that direction
          became off-screen — measured −122px. Moving the placement means reading this line too. */}
      <Surface
        open={open}
        origin="top right"
        role="group"
        aria-label={t('inboxTitle')}
        data-testid="agent-activity-inbox"
        // Separates it from the right-hand map tool column by exactly one tile plus the gap. Even with
        // the surface drawn above, an overlapping rect makes the icons show through the translucent
        // background as if they were row actions.
        style={{ right: 'calc(var(--chrome-tile-size) + 8px)' }}
        // `whitespace-normal` is required — the readout stack this panel lives in sets
        // `whitespace-nowrap` on its container (legends and readouts are single-line strings), and
        // without breaking that inheritance the footer sentence flows outside the panel (measured at 1512).
        className="absolute top-[calc(100%+8px)] z-30 w-[280px] overflow-hidden whitespace-normal rounded-chip border border-[color:var(--topology-floating-panel-border)] bg-[color:var(--topology-floating-panel-surface)] shadow-[var(--topology-floating-panel-shadow)]"
      >
          <div className="flex items-center justify-between gap-2 border-b border-[color:var(--topology-floating-panel-divider)] px-3 py-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
            <span className="min-w-0 flex-1 truncate">{t('inboxTitle')}</span>
          </div>
          {feed.work.mode !== 'idle' ? (
            <section
              data-testid="agent-activity-current-work"
              className="border-b border-[color:var(--topology-floating-panel-divider)] px-3 py-3"
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate text-label text-[color:var(--color-text-primary)]">
                  {feed.agentName ?? t('unknownAgent')}
                </span>
                <span className="shrink-0 font-mono text-caption text-[color:var(--color-text-tertiary)]">
                  {feed.work.mode === 'live'
                    ? phase ?? t('writing')
                    : feed.work.mode === 'recent-write'
                      ? t('recentWriteShort')
                      : t('complete')}
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
                    <dt className="text-[color:var(--color-text-quaternary)]">{t('targetLabel')}</dt>
                    <dd className="min-w-0">
                      {onOpenNode ? (
                        <button
                          type="button"
                          onClick={() => onOpenNode(feed.lastNode!.slug)}
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
                    <dd className="min-w-0 truncate text-[color:var(--color-text-tertiary)]">{feed.work.nextStep}</dd>
                  </>
                ) : null}
                {feed.work.lastTool ? (
                  <>
                    <dt className="text-[color:var(--color-text-quaternary)]">{t('toolLabel')}</dt>
                    <dd className="min-w-0 truncate font-mono text-[color:var(--color-text-tertiary)]">{feed.work.lastTool}</dd>
                  </>
                ) : null}
              </dl>
            </section>
          ) : null}
          {feed.notifications.length === 0 && feed.work.mode === 'idle' ? (
            <p
              data-testid="agent-activity-inbox-empty"
              className="px-3 py-4 text-caption leading-label text-[color:var(--color-text-tertiary)]"
            >
              {t('inboxEmpty')}
            </p>
          ) : (
            feed.notifications.length > 0 ? (
              <>
                <p className="px-3 pt-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                  {t('historyTitle')}
                </p>
                <ul
                  data-testid="agent-activity-inbox-list"
                  className="flex max-h-[240px] flex-col overflow-y-auto px-2 py-1.5"
                >
                  {feed.notifications.map((item) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      age={relative(item.at)}
                      onOpenNode={onOpenNode}
                    />
                  ))}
                </ul>
              </>
            ) : null
          )}
          {/* The notification box is not a substitute for the audit log — the full history is held by
              `activity.jsonl` inside the vault and by `/git`. That fact is not hidden. */}
          <p className="border-t border-[color:var(--topology-floating-panel-divider)] px-3 py-2 text-caption leading-label text-[color:var(--color-text-quaternary)]">
            {t('inboxFooter')}
          </p>
      </Surface>
    </div>
  );
}

/** Kind → copy key. A new kind grows this one place only. */
const EVENT_LABEL_KEY: Readonly<Record<AgentNotificationKind, string>> = {
  'task-start': 'event.taskStart',
  'task-end': 'event.taskEnd',
  'domain-added': 'event.domainAdded',
  'domain-removed': 'event.domainRemoved',
  'bridge-inserted': 'event.bridgeInserted',
  'vault-problem': 'event.vaultProblem',
};

/** Copy for a work notification whose agent is known — same grammar as the status chip. */
const EVENT_LABEL_KEY_WITH_AGENT: Readonly<Partial<Record<AgentNotificationKind, string>>> = {
  'task-start': 'event.taskStartAgent',
  'task-end': 'event.taskEndAgent',
};

/**
 * A row is **fixed at two lines** — long title or short, with details or without, it reads with the
 * same rhythm (dimensional regularity: in a repeated set, height decided by character count destroys
 * the grid).
 */
function NotificationRow({
  item,
  age,
  onOpenNode,
}: {
  item: AgentNotification;
  age: string;
  onOpenNode?: (slug: string) => void;
}) {
  const t = useTranslations('agentActivity');
  const problem = item.kind === 'vault-problem';

  const detail = useMemo(() => {
    if (item.counts) {
      // A kind at zero is not drawn — "0 deletions" is noise, not information.
      const parts: string[] = [];
      if (item.counts.added > 0) parts.push(t('summaryAdded', { count: item.counts.added }));
      if (item.counts.edited > 0) parts.push(t('summaryEdited', { count: item.counts.edited }));
      if (item.counts.removed > 0) parts.push(t('summaryRemoved', { count: item.counts.removed }));
      return parts.join(t('summaryJoin'));
    }
    if (item.problems) {
      const parts: string[] = [];
      if (item.problems.unresolvedEdges > 0) {
        parts.push(t('problemUnresolved', { count: item.problems.unresolvedEdges }));
      }
      if (item.problems.dependencyCycles > 0) {
        parts.push(t('problemCycles', { count: item.problems.dependencyCycles }));
      }
      return parts.join(t('summaryJoin'));
    }
    if (item.childCount) return t('bridgeChildren', { count: item.childCount });
    return item.label ?? '';
  }, [item, t]);

  return (
    <li
      data-testid="agent-activity-inbox-row"
      data-kind={item.kind}
      className="flex h-12 shrink-0 flex-col justify-center gap-0.5 px-1"
    >
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span
          className={cn(
            'shrink-0 text-label',
            problem
              ? 'text-[color:var(--color-status-warning)]'
              : 'text-[color:var(--color-text-primary)]',
          )}
        >
          {item.agent && EVENT_LABEL_KEY_WITH_AGENT[item.kind]
            ? t(EVENT_LABEL_KEY_WITH_AGENT[item.kind] as string, { agent: agentDisplayName(item.agent) ?? item.agent })
            : t(EVENT_LABEL_KEY[item.kind])}
        </span>
        {item.node ? (
          onOpenNode ? (
            <button
              type="button"
              onClick={() => onOpenNode(item.node!.slug)}
              aria-label={t('openOnMap', { name: item.node.name })}
              className={controlClass({
                shape: 'link',
                tone: 'accent',
                truncate: true,
                hoverInk: 'strong',
                className:
                  'min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
              })}
            >
              {item.node.name}
            </button>
          ) : (
            <Link
              href={getTopologyFocusHref(item.node.slug)}
              aria-label={t('openOnMap', { name: item.node.name })}
              className={controlClass({
                shape: 'link',
                tone: 'accent',
                truncate: true,
                hoverInk: 'strong',
                className:
                  'min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
              })}
            >
              {item.node.name}
            </Link>
          )
        ) : null}
      </div>
      {/* This line holds its place even with no details — an optional clause must not change the line count. */}
      <p className="min-w-0 truncate text-caption text-[color:var(--color-text-tertiary)]">
        {detail ? `${detail} · ${age}` : age}
      </p>
    </li>
  );
}
