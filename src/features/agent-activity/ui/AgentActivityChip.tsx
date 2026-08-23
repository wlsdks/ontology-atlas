'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Bell, ChevronRight } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import { Link } from '@/i18n/navigation';
import { getTopologyFocusHref } from '@/entities/project';
import { ChromeChip, CHROME_STATUS_CHIP_CLASS } from '@/shared/ui/chrome-chip';
import { controlClass } from '@/shared/ui/control-class';
import { RowButton } from '@/shared/ui/controls';
import { Surface } from '@/shared/ui/surface';
import { cn } from '@/shared/lib/cn';
import { useRowDisclosure } from '@/shared/lib/use-row-disclosure';
import { agentDisplayName } from '@/shared/lib/agent-display-name';
import type { AgentNotification, AgentNotificationKind } from '@/shared/lib/agent-notifications';
import type { AcpWorkReceipt } from '@/shared/lib/acp-work-receipt';
import { useAgentActivityFeed } from '../model/use-agent-activity-feed';
import type { AgentLiveWorkInput } from '../model/agent-work-projection';

function WorkReceiptRow({ receipt, nowMs }: { receipt: AcpWorkReceipt; nowMs: number }) {
  const t = useTranslations('agentActivity');
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const { mounted, boxRef, contentRef } = useRowDisclosure(open);
  const bodyId = `agent-receipt-${receipt.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const result = t(`receiptResult.${receipt.result}`);
  const decision = t(`receiptDecision.${receipt.decision}`);

  return (
    <div className="border-b border-[color:var(--color-divider)] last:border-b-0">
      <RowButton
        size="sm"
        tone={open ? 'strong' : 'secondary'}
        active={open}
        hoverInk="strong"
        hoverSurface="lift"
        aria-expanded={open}
        aria-controls={bodyId}
        data-testid="agent-work-receipt-row"
        onClick={() => setOpen((value) => !value)}
        className="w-full py-2"
      >
        <ChevronRight
          size={ICON_SIZE.sm}
          aria-hidden
          className="shrink-0 transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
        <span className="grid min-w-0 flex-1 gap-0.5 text-left">
          <span className="truncate text-label text-[color:var(--color-text-primary)]">
            {receipt.request}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-caption text-[color:var(--color-text-quaternary)]">
            <span>{agentDisplayName(receipt.agent)}</span>
            <span aria-hidden>·</span>
            <span>{decision}</span>
            <span aria-hidden>·</span>
            <span>{result}</span>
            <span aria-hidden>·</span>
            <span>{t('receiptItems', { count: receipt.items.length })}</span>
          </span>
        </span>
      </RowButton>
      <div
        ref={boxRef}
        id={bodyId}
        data-state={open ? 'open' : 'closed'}
        className="ai-row-disclosure"
        inert={!open}
      >
        {mounted ? (
          <div
            ref={contentRef}
            className="ai-row-disclosure-body grid gap-2 px-2 pb-2 pl-7 text-caption leading-label"
          >
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1">
              <dt className="text-[color:var(--color-text-quaternary)]">{t('toolLabel')}</dt>
              <dd className="min-w-0 truncate font-mono text-[color:var(--color-text-tertiary)]">
                {receipt.tool}
              </dd>
              <dt className="text-[color:var(--color-text-quaternary)]">{t('receiptAt')}</dt>
              <dd className="text-[color:var(--color-text-tertiary)]">
                {format.relativeTime(new Date(receipt.updatedAt), nowMs)}
              </dd>
            </dl>
            <ol className="grid max-h-32 gap-1 overflow-y-auto border-t border-[color:var(--color-divider)] pt-2">
              {receipt.items.map((item, index) => (
                <li
                  key={`${receipt.id}:${index}`}
                  className="break-all font-mono text-[color:var(--color-text-tertiary)]"
                >
                  {item.relation
                    ? `${item.relation.from} → ${item.relation.type} → ${item.relation.to}`
                    : item.target ?? item.fields.join(' · ')}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </div>
  );
}

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
  onOpenChange,
  onOpenNode,
}: {
  suppressed?: boolean;
  /** The current state the in-app ACP on the right already knows. Updates the same chip before file polling. */
  liveWork?: AgentLiveWorkInput | null;
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
} = {}) {
  const t = useTranslations('agentActivity');
  const format = useFormatter();
  const feed = useAgentActivityFeed(liveWork);
  const [openSurface, setOpenSurface] = useState<'status' | 'notifications' | null>(null);
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
  const openPanel = (trigger: 'status' | 'bell') => {
    const surface = trigger === 'status' ? 'status' : 'notifications';
    if (openSurface === surface) {
      close(false);
      return;
    }
    openTriggerRef.current = trigger;
    setOpenSurface(surface);
    if (trigger === 'bell') feed.markAllRead();
  };

  return (
    <div
      ref={rootRef}
      className="contents"
      data-testid="agent-activity-chip"
      data-work-mode={feed.work.mode}
    >
      {showStatus ? (
        <div
          className={cn(
            CHROME_STATUS_CHIP_CLASS,
            'absolute right-0 top-[calc(100%+8px)] w-max min-w-0 max-w-[min(var(--git-setup-measure),calc(100vw-var(--chrome-inset)*2))]',
          )}
          data-agent-activity-status-slot="utility-row-below"
          data-writing={feed.writing ? 'true' : 'false'}
        >
          <button
            ref={statusRef}
            type="button"
            aria-haspopup="true"
            aria-expanded={openSurface === 'status'}
            aria-label={t('statusAria', { status: statusLabel })}
            data-testid="agent-activity-status-trigger"
            onClick={() => openPanel('status')}
            className={controlClass({
              shape: 'link',
              hoverInk: 'strong',
              className: 'min-w-0 gap-1.5 text-left text-inherit',
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
            <span
              data-testid="agent-activity-status"
              className="min-w-0 truncate text-[color:var(--color-text-primary)]"
            >
              {statusLabel}
            </span>
          </button>
          {feed.lastNode ? (
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
        </div>
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
            feed.unreadCount > 0
              ? t('bellUnreadAria', { count: feed.unreadCount })
              : t('bellAria')
          }
          data-testid="agent-activity-bell"
          data-agent-activity-bell-slot="utility-row-end"
          className="relative shrink-0 overflow-visible"
          icon={<Bell aria-hidden />}
          badge={
            feed.unreadCount > 0 ? (
              <span
                data-testid="agent-activity-unread"
                className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--color-indigo-a32)] px-1 font-mono text-caption tabular-nums text-[color:var(--color-indigo-text-soft)]"
              >
                {feed.unreadCount > 99 ? '99+' : feed.unreadCount}
              </span>
            ) : null
          }
        />
      ) : null}

      <Surface
        open={open}
        origin="top right"
        role="group"
        aria-label={t(openSurface === 'notifications' ? 'notificationTitle' : 'inboxTitle')}
        data-testid="agent-activity-inbox"
        data-agent-activity-panel={openSurface ?? undefined}
        style={{ right: 'calc(var(--chrome-tile-size) + 8px)' }}
        className={cn(
          'absolute z-30 w-[var(--topology-v2-panel-width)] overflow-hidden whitespace-normal rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-floating-panel-border)] bg-[color:var(--topology-floating-panel-surface)] shadow-[var(--topology-floating-panel-shadow)]',
          openSurface === 'status' || showStatus
            ? 'top-[calc(100%+52px)]'
            : 'top-[calc(100%+8px)]',
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[color:var(--topology-floating-panel-divider)] px-3 py-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
          <span className="min-w-0 flex-1 truncate">
            {t(openSurface === 'notifications' ? 'notificationTitle' : 'inboxTitle')}
          </span>
        </div>

        {openSurface === 'status' && feed.work.mode !== 'idle' ? (
          <section
            data-testid="agent-activity-current-work"
            className="px-3 py-3"
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

        {openSurface === 'notifications' ? (
          <>
            {feed.workReceipts.length > 0 ? (
              <section
                data-testid="agent-work-receipts"
                className="border-b border-[color:var(--topology-floating-panel-divider)]"
              >
                <p className="px-3 pt-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                  {t('receiptTitle')}
                </p>
                <div className="max-h-[240px] overflow-y-auto px-2 py-1.5">
                  {[...feed.workReceipts].slice(-5).reverse().map((receipt) => (
                    <WorkReceiptRow key={receipt.id} receipt={receipt} nowMs={feed.nowMs} />
                  ))}
                </div>
              </section>
            ) : null}
            {feed.notifications.length === 0 && feed.workReceipts.length === 0 ? (
              <p
                data-testid="agent-activity-inbox-empty"
                className="px-3 py-4 text-caption leading-label text-[color:var(--color-text-tertiary)]"
              >
                {t('inboxEmpty')}
              </p>
            ) : feed.notifications.length > 0 ? (
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
            ) : null}
          </>
        ) : null}

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
