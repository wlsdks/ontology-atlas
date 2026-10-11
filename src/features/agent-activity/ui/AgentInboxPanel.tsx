'use client';

import { Fragment, useCallback, useState, type ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { AlertTriangle, Bot, Check } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { buildOntologyInsightsReturnHref } from '@/entities/knowledge-graph';
import { getTopologyFocusHref } from '@/entities/project';
import { agentDisplayName } from '@/shared/lib/agent-activity/agent-display-name';
import type { VaultProblemCounts } from '@/shared/lib/agent-activity/agent-notifications';
import { cn } from '@/shared/lib/cn';
import { Chip, RowButton } from '@/shared/ui/controls';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { TabBar } from '@/shared/ui/tab-bar';
import {
  BELL_TABS,
  type BellHistoryRow,
  type BellInbox,
  type BellResult,
  type BellTab,
  type BellTodo,
} from '../model/bell-inbox';
import { inboxDuration } from '../model/inbox-duration';
import type { AgentActivityFeed } from '../model/use-agent-activity-feed';

/**
 * The bell's inside is three questions, not one log (`model/bell-inbox.ts` derives them): `todo`
 * costs something if missed, `results` is one row per finished task, `history` a timeline. Tab strip
 * is `shared/ui/tab-bar`. Opens on the last used tab unless it is empty and another has content.
 */
const TAB_STORAGE_KEY = 'atlas.agentActivity.tab';
const TAB_ID_PREFIX = 'agent-inbox';

function readStoredTab(): BellTab | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TAB_STORAGE_KEY);
    return BELL_TABS.find((tab) => tab === raw) ?? null;
  } catch {
    return null;
  }
}

function writeStoredTab(tab: BellTab): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    // Private mode — the tab is still remembered for this session by React state.
  }
}

/**
 * What a finished write did, as one verb-first sentence. The leading kind is the largest count, ties
 * resolved added, edited, removed. Results and history share it, since a generic heading repeated
 * down a list is refused by `.claude/rules/design.md`.
 */
function writeSentence(
  t: (key: string, values?: Record<string, number>) => string,
  counts: { added: number; edited: number; removed: number } | null,
): string {
  if (!counts) return t('resultNothing');
  const ordered = [
    { key: 'resultAdded', count: counts.added },
    { key: 'resultEdited', count: counts.edited },
    { key: 'resultRemoved', count: counts.removed },
  ].sort((a, b) => b.count - a.count);
  const top = ordered[0];
  return top && top.count > 0 ? t(top.key, { count: top.count }) : t('resultNothing');
}

function problemSummary(
  t: (key: string, values?: Record<string, number>) => string,
  problems: VaultProblemCounts,
): string {
  const parts: string[] = [];
  if (problems.unresolvedEdges > 0) parts.push(t('problemUnresolved', { count: problems.unresolvedEdges }));
  if (problems.dependencyCycles > 0) {
    const key = problems.dependencyCyclesPartial ? 'problemCyclesAtLeast' : 'problemCycles';
    parts.push(t(key, { count: problems.dependencyCycles }));
  }
  return parts.join(t('summaryJoin'));
}

/**
 * **One fact, as the row's second line says it.** A label, an optional number, and which
 * of the two grades it carries — a plain fact, or one a person may want to look at.
 */
export interface BellFact {
  label: string;
  count?: number;
  tone?: 'neutral' | 'warning';
}

/**
 * The second line of a result row, as data.
 *
 * **Why a view model rather than the words inline.** A later slice supplies a per-turn
 * brief from the ontology diff (how much is newly known, how much is uncertain), and it has
 * to print **before** the agent's own facts without this row being rewritten. Today the
 * brief is simply absent, and with it absent the line renders exactly what it rendered
 * before this shape existed.
 */
export interface ResultFactLineModel {
  agent: string | null;
  duration: string | null;
  /**
   * When it happened. Without it `2m` was the only number on the line and read as "two
   * minutes ago" rather than "it took two minutes", and the boundary a press moves — a
   * time — was nowhere on the tab that draws unread dots.
   */
  age: string | null;
  allowed: number | null;
  denied: number | null;
  /** Everything else this row has to say — a decision's effect, a result that is not `completed`. */
  summaryFacts: BellFact[];
}

function resultFacts(
  t: (key: string, values?: Record<string, number>) => string,
  row: BellResult,
  duration: (ms: number) => string | null,
  age: string,
): ResultFactLineModel {
  const agent = agentDisplayName(row.agent) ?? row.agent ?? t('unknownAgent');
  if (row.kind === 'task') {
    const decided = row.allowed > 0 || row.rejected > 0;
    return {
      agent,
      duration: duration(row.durationMs),
      age,
      allowed: decided ? row.allowed : null,
      denied: decided ? row.rejected : null,
      summaryFacts: [],
    };
  }
  const facts: BellFact[] = [
    row.decision === 'rejected'
      ? { label: t('decisionNoChange') }
      : { label: t('decisionItems', { count: row.items }) },
  ];
  // A result that is not `completed` is a state, so it says the state word once — never a
  // fourth dot-separated word beside the decision and the count.
  if (row.decision === 'allowed' && row.result !== 'completed') {
    facts.push({ label: t(`receiptResult.${row.result}`), tone: 'warning' });
  }
  return { agent, duration: null, age, allowed: null, denied: null, summaryFacts: facts };
}

function ResultFactLine({
  facts,
  briefCounts,
  durationTitle,
}: {
  facts: ResultFactLineModel;
  /** The later slice's brief, printed before the agent's facts. Absent today. */
  briefCounts: readonly BellFact[] | null;
  durationTitle: string;
}) {
  const t = useTranslations('agentActivity');
  const parts: ReactNode[] = [];
  for (const fact of briefCounts ?? []) {
    parts.push(
      <span
        key={`brief:${fact.label}`}
        className={cn(
          'shrink-0 tabular-nums',
          fact.tone === 'warning' ? 'text-[color:var(--color-status-warning)]' : undefined,
        )}
      >
        {fact.count === undefined ? fact.label : `${fact.label} ${fact.count}`}
      </span>,
    );
  }
  if (facts.agent) parts.push(<span key="agent" className="shrink-0">{facts.agent}</span>);
  if (facts.duration) {
    parts.push(
      <span key="duration" title={durationTitle} className="shrink-0 tabular-nums">
        {facts.duration}
      </span>,
    );
  }
  if (facts.age) parts.push(<span key="age" className="shrink-0">{facts.age}</span>);
  if (facts.allowed !== null && facts.denied !== null) {
    parts.push(
      <span key="allowed" className="shrink-0 tabular-nums">
        {t('decidedAllowed', { count: facts.allowed })}
      </span>,
      <span key="denied" className="shrink-0 tabular-nums">
        {t('decidedRejected', { count: facts.denied })}
      </span>,
    );
  }
  for (const fact of facts.summaryFacts) {
    parts.push(
      <span
        key={`fact:${fact.label}`}
        className={cn(
          'min-w-0 truncate',
          fact.tone === 'warning' ? 'text-[color:var(--color-status-warning)]' : undefined,
        )}
      >
        {fact.count === undefined ? fact.label : `${fact.label} ${fact.count}`}
      </span>,
    );
  }
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 text-caption text-[color:var(--color-text-quaternary)]">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? <span aria-hidden>·</span> : null}
          {part}
        </Fragment>
      ))}
    </span>
  );
}

/**
 * **One line-1 box for every row kind.**
 *
 * A row whose object is a link is 8px taller than one without it, because the link control
 * carries the 24px WCAG 2.5.8 floor (measured: history rows 44 · 52 · 52 · 52 px in one
 * list). Lowering the link is an accessibility regression, so the rows without one reserve
 * the same box and the pitch stays the same in all three tabs.
 */
const ROW_HEADLINE_CLASS = 'flex min-h-6 min-w-0 items-center gap-1.5';

/**
 * The 12px mark column every row wears, drawn or not.
 *
 * All three tabs share it so the sentence starts at the same x in each — measured before
 * it existed: 1117 / 1101 / 1097, so switching tabs shifted the text edge by 20px and the
 * three views read as three different lists.
 */
function RowMark({ children }: { children?: ReactNode }) {
  return (
    <span className="mt-0.5 flex size-3 shrink-0 items-center justify-center self-start">
      {children}
    </span>
  );
}

export function AgentInboxPanel({
  inbox,
  feed,
  onOpenNode,
  /** Opens the conversation, where a waiting request is reviewed beside the change it makes. */
  onOpenConversation,
  onClose,
  briefCountsFor,
}: {
  /** Derived by the bell, which needs the same counts for its badge while this is closed. */
  inbox: BellInbox;
  feed: AgentActivityFeed;
  onOpenNode?: (slug: string) => void;
  onOpenConversation?: () => void;
  onClose?: () => void;
  /**
   * What a finished turn taught, printed before the agent's facts. A later slice supplies
   * it from the ontology diff; absent, the row is what it was without this seam.
   */
  briefCountsFor?: (row: BellResult) => readonly BellFact[] | null;
}) {
  const t = useTranslations('agentActivity');
  const format = useFormatter();

  const counts: Record<BellTab, number> = {
    todo: inbox.todos.length,
    results: inbox.results.length,
    history: inbox.history.reduce((total, group) => total + group.rows.length, 0),
  };

  /*
   * **Which tab opens is decided once, at mount, and never taken back.**
   *
   * The remembered tab wins while it has something in it; when it is empty the first tab
   * that does wins, and the todo tab is first in that order, so a panel does not open on an
   * empty tab while a request waits two tabs away. After that the person's own press is
   * final — an empty tab a person deliberately opened must show its empty sentence, and
   * content arriving later changes the **count in the label**, never the tab under the
   * reader.
   */
  const [tab, setTab] = useState<BellTab>(() => {
    // The badge and the opening tab must name the same thing: a remembered non-empty tab must not win
    // over a waiting request.
    if (counts.todo > 0) return 'todo';
    const remembered = readStoredTab();
    if (remembered && counts[remembered] > 0) return remembered;
    return BELL_TABS.find((key) => counts[key] > 0) ?? remembered ?? 'todo';
  });

  const selectTab = useCallback((next: string) => {
    const known = BELL_TABS.find((key) => key === next);
    if (!known) return;
    setTab(known);
    writeStoredTab(known);
  }, []);

  const relative = (at: number) => format.relativeTime(new Date(at), feed.nowMs);
  /* Null under a second, so the row leaves the duration out rather than print "0s". */
  const duration = (ms: number): string | null => {
    const parts = inboxDuration(ms);
    if (parts === null) return null;
    if (parts.unit === 'hours') return t('durationHours', { hours: parts.hours, minutes: parts.minutes });
    if (parts.unit === 'minutes') return t('durationMinutes', { minutes: parts.minutes, seconds: parts.seconds });
    return t('durationSeconds', { seconds: parts.seconds });
  };

  /*
   * A press must not delete the list it was invited into: selecting a node suppresses the bell,
   * leaving other unread rows no door. A task row focuses the map behind the panel and its dot goes
   * out in place. Only a door that leaves (the conversation) closes the panel.
   */
  const openRow = (row: BellResult) => {
    feed.markReadUpTo(row.at);
    if (row.kind === 'task' && row.node) {
      onOpenNode?.(row.node.slug);
      return;
    }
    onOpenConversation?.();
    if (onOpenConversation) onClose?.();
  };

  return (
    <div data-testid="agent-inbox-panel" className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 pt-1">
        <TabBar
          idPrefix={TAB_ID_PREFIX}
          ariaLabel={t('inboxTabs')}
          activeKey={tab}
          onSelect={selectTab}
          items={[
            { key: 'todo', label: t('tab.todo'), count: counts.todo, countTitle: t('tabTodoTitle') },
            {
              key: 'results',
              label: t('tab.results'),
              count: counts.results,
              countTitle: t('tabResultsTitle'),
            },
            { key: 'history', label: t('tab.history') },
          ]}
        />
      </div>

      <div
        role="tabpanel"
        id={`${TAB_ID_PREFIX}-tabpanel-${tab}`}
        aria-labelledby={`${TAB_ID_PREFIX}-tab-${tab}`}
        data-testid={`agent-inbox-panel-${tab}`}
        /*
         * One scroller for the whole body. Two ceilings, in this order: **264px**, four
         * whole rows of the 52px pitch plus 44 of the fifth — the partial row is the scroll
         * affordance — and, when the window is shorter than that, whatever the flex column
         * leaves after the header and the footer (`--map-panel-max-height` on the Surface).
         *
         * The panel's **own** height follows the tab (measured 188 · 344 · 388 px on the
         * seeded folder): a popover that always reserved the tallest tab would hang 200px of
         * empty ground over the map on the tab that matters most. What must not move is what
         * the pointer is on — the header and the strip are above the body, so the edge that
         * follows the content is the bottom one.
         */
        className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5 [max-height:264px]"
      >
        {tab === 'todo' ? (
          counts.todo === 0 ? (
            /*
             * The sentence says what has reached this list, not what is true of the world: the ask row stands on
             * a heartbeat that goes stale after five minutes, and a folder problem leaves after a day.
             */
            <InboxEmpty testId="agent-inbox-todo-empty">
              {t('todoEmpty')}
              <Link
                href={buildOntologyInsightsReturnHref('do-next')}
                data-testid="agent-inbox-todo-empty-repair"
                onClick={() => onClose?.()}
                className={controlClass({
                  shape: 'link',
                  tone: 'accent',
                  hoverInk: 'strong',
                  className: 'mt-1',
                })}
              >
                {t('todoEmptyRepair')}
              </Link>
            </InboxEmpty>
          ) : (
            <ul className="flex flex-col">
              {inbox.todos.map((todo) => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  onOpenConversation={onOpenConversation}
                  onClose={onClose}
                />
              ))}
            </ul>
          )
        ) : null}

        {tab === 'results' ? (
          counts.results === 0 ? (
            <InboxEmpty testId="agent-inbox-results-empty">{t('resultsEmpty')}</InboxEmpty>
          ) : (
            <ul className="flex flex-col">
              {inbox.results.map((row) => (
                <li key={row.id} className="min-w-0">
                  <RowButton
                    size="sm"
                    tone="secondary"
                    hoverInk="strong"
                    hoverSurface="lift"
                    data-testid="agent-inbox-result-row"
                    data-unread={row.unread ? 'true' : 'false'}
                    onClick={() => openRow(row)}
                    className="w-full gap-2 px-1 py-1.5"
                  >
                    <RowMark>
                      {row.unread ? (
                        <>
                          <span
                            aria-hidden
                            data-testid="agent-inbox-unread-dot"
                            className="size-1.5 rounded-full bg-[color:var(--color-indigo-accent)]"
                          />
                          <span className="sr-only">{t('unreadRow')}</span>
                        </>
                      ) : null}
                    </RowMark>
                    {/*
                      **Two lines, always.** The sentence and its object share the first
                      line and the facts own the second, so a row with no object is the
                      same height as a row with one (measured at three lines: 60 · 46 · 60
                      · 62 px in one list, which is the copy deciding the grid).
                    */}
                    <span className="grid min-w-0 flex-1 gap-0.5 text-left">
                      <span className={ROW_HEADLINE_CLASS}>
                        <span
                          className={cn(
                            /*
                             * Not `shrink-0`: at large text sizes the sentence kept its width and the object it names was
                             * erased. Both halves truncate.
                             */
                            'min-w-0 truncate text-label',
                            row.unread
                              ? 'text-[color:var(--color-text-primary)]'
                              : 'text-[color:var(--color-text-secondary)]',
                          )}
                        >
                          {row.kind === 'task'
                            ? writeSentence(t, row.counts)
                            : row.decision === 'allowed'
                              ? t('decisionAllowed')
                              : t('decisionRejected')}
                        </span>
                        {row.kind === 'task' && row.node ? (
                          <>
                            <span aria-hidden className="shrink-0 text-[color:var(--color-text-quaternary)]">
                              —
                            </span>
                            <span
                              title={row.node.slug}
                              className="min-w-0 truncate text-label text-[color:var(--color-text-secondary)]"
                            >
                              {row.node.name}
                            </span>
                          </>
                        ) : row.kind === 'decision' ? (
                          <>
                            <span aria-hidden className="shrink-0 text-[color:var(--color-text-quaternary)]">
                              —
                            </span>
                            <span className="min-w-0 truncate text-label text-[color:var(--color-text-secondary)]">
                              {row.request}
                            </span>
                          </>
                        ) : null}
                        {/* A count, not a state — so no badge box, which would also grow the line. */}
                        {row.repeat > 1 ? (
                          <span
                            title={t('resultRepeatTitle', { count: row.repeat })}
                            className="shrink-0 font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]"
                          >
                            {t('resultRepeat', { count: row.repeat })}
                          </span>
                        ) : null}
                      </span>
                      <ResultFactLine
                        facts={resultFacts(t, row, duration, relative(row.at))}
                        briefCounts={briefCountsFor?.(row) ?? null}
                        durationTitle={t('durationTitle')}
                      />
                      {/*
                        **Where the press goes is said in the one channel that has room
                        for it.** The whole row is the button, so its accessible name was
                        the sentence plus the facts and nothing in it said a press
                        navigates — while History's node link has carried `openOnMap` from
                        the start. It is appended here rather than set as `aria-label`,
                        which would replace the row's summary with the destination, and it
                        is omitted when neither door is wired: then the press only moves
                        the read boundary, and naming a destination would be a claim.
                        `sr-only` is absolutely positioned, so it adds no grid row and the
                        52px pitch does not move.
                      */}
                      {row.kind === 'task' && row.node && onOpenNode ? (
                        <span className="sr-only">
                          {t('openOnMap', { name: row.node.name })}
                        </span>
                      ) : onOpenConversation ? (
                        <span className="sr-only">{t('openInConversation')}</span>
                      ) : null}
                    </span>
                  </RowButton>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === 'history' ? (
          counts.history === 0 ? (
            <InboxEmpty testId="agent-inbox-history-empty">{t('historyEmpty')}</InboxEmpty>
          ) : (
            <div className="flex flex-col gap-1">
              {inbox.history.map((group) => (
                <section key={group.key} data-testid="agent-inbox-history-day">
                  {/* The day is said once per group, so no row has to repeat it. */}
                  <p className="px-1 pb-0.5 pt-1 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                    {group.label === 'today'
                      ? t('dayToday')
                      : group.label === 'yesterday'
                        ? t('dayYesterday')
                        : format.dateTime(new Date(group.at), { month: 'long', day: 'numeric' })}
                  </p>
                  <ul className="flex flex-col">
                    {group.rows.map((row) => (
                      <HistoryRow
                        key={row.id}
                        row={row}
                        age={relative(row.at)}
                        duration={row.durationMs === null ? null : duration(row.durationMs)}
                        onOpenNode={onOpenNode}
                        onClose={onClose}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

function InboxEmpty({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div
      data-testid={testId}
      className="grid justify-items-center px-1 py-6 text-center text-caption leading-label text-[color:var(--color-text-tertiary)]"
    >
      {children}
    </div>
  );
}

function TodoRow({
  todo,
  onOpenConversation,
  onClose,
}: {
  todo: BellTodo;
  onOpenConversation?: () => void;
  onClose?: () => void;
}) {
  const t = useTranslations('agentActivity');

  if (todo.kind === 'permission-ask') {
    const agent = agentDisplayName(todo.agent) ?? todo.agent;
    return (
      <li
        data-testid="agent-inbox-todo-row"
        data-todo-kind="permission-ask"
        className="atlas-touch-floor flex items-center gap-2 px-1 py-1.5"
      >
        <RowMark>
          <Bot size={ICON_SIZE.sm} aria-hidden className="text-[color:var(--color-indigo-accent)]" />
        </RowMark>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className={ROW_HEADLINE_CLASS}>
            <span className="min-w-0 truncate text-label text-[color:var(--color-text-primary)]">
              {agent ? t('askSentence', { agent }) : t('askSentenceUnknown')}
            </span>
          </span>
          {/* The person's own request, or the tool if the request is not known — never a path. */}
          <span className="truncate text-caption text-[color:var(--color-text-tertiary)]">
            {todo.summary ?? todo.tool ?? ''}
          </span>
        </span>
        {onOpenConversation ? (
          <Chip
            size="sm"
            tone="accent"
            hoverInk="strong"
            hoverSurface="lift"
            aria-label={t('askDoorAria')}
            data-testid="agent-inbox-ask-door"
            onClick={() => {
              onOpenConversation();
              onClose?.();
            }}
            /*
             * `atlas-touch-floor`: the control ramp promotes on `pointer: coarse` while the rows use
             * `any-pointer: coarse`, so this door would stay 28px beside 44px rows.
             */
            className="atlas-touch-floor shrink-0"
          >
            {t('askDoor')}
          </Chip>
        ) : null}
      </li>
    );
  }

  return (
    <li
      data-testid="agent-inbox-todo-row"
      data-todo-kind="folder-problem"
      className="atlas-touch-floor flex items-center gap-2 px-1 py-1.5"
    >
      <RowMark>
        <AlertTriangle
          size={ICON_SIZE.sm}
          aria-hidden
          className="text-[color:var(--color-status-warning)]"
        />
      </RowMark>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className={ROW_HEADLINE_CLASS}>
          <span className="min-w-0 truncate text-label text-[color:var(--color-text-primary)]">
            {t('problemSentence')}
          </span>
        </span>
        <span className="truncate text-caption text-[color:var(--color-text-tertiary)]">
          {problemSummary(t, todo.problems)}
        </span>
      </span>
      <Link
        href={buildOntologyInsightsReturnHref('do-next')}
        aria-label={t('problemDoorAria')}
        data-testid="agent-inbox-problem-door"
        onClick={() => onClose?.()}
        className={controlClass({ shape: 'chip', size: 'sm', className: 'shrink-0' })}
      >
        {t('problemDoor')}
      </Link>
    </li>
  );
}

/**
 * The sentence a timeline row says for everything that is not a finished write. A finished write
 * says what it did (`writeSentence`); the agent goes on the second line.
 */
/**
 * Control mark, not the panel's indigo: indigo means this needs you, and a settled timeline needs
 * nobody. Ink is `secondary` like the results tab; a quiet-link underline marks that the word
 * presses.
 */
const HISTORY_OBJECT_CLASS = controlClass({
  shape: 'link',
  tone: 'secondary',
  truncate: true,
  hoverInk: 'strong',
  className:
    'min-w-0 underline decoration-[color:var(--color-indigo-line-a32)] underline-offset-2 hover:decoration-[color:var(--color-indigo-accent)]',
});

const HISTORY_LABEL_KEY: Readonly<Record<BellHistoryRow['kind'], string>> = {
  'human-decision': 'decisionAllowed',
  'task-start': 'runningTask',
  'task-end': 'event.taskEnd',
  'domain-added': 'event.domainAdded',
  'domain-removed': 'event.domainRemoved',
  'bridge-inserted': 'event.bridgeInserted',
  'vault-problem': 'event.vaultProblem',
};

function HistoryRow({
  row,
  age,
  duration,
  onOpenNode,
  onClose,
}: {
  row: BellHistoryRow;
  age: string;
  duration: string | null;
  onOpenNode?: (slug: string) => void;
  onClose?: () => void;
}) {
  const t = useTranslations('agentActivity');
  const problem = row.kind === 'vault-problem';
  const agent = row.agent ? (agentDisplayName(row.agent) ?? row.agent) : null;
  const sentence =
    row.kind === 'task-end'
      ? writeSentence(t, row.counts)
      : row.kind === 'human-decision'
        ? t(row.decision === 'rejected' ? 'decisionRejected' : 'decisionAllowed')
        : t(HISTORY_LABEL_KEY[row.kind]);

  const detail = (() => {
    if (row.problems) return problemSummary(t, row.problems);
    if (row.childCount) return t('bridgeChildren', { count: row.childCount });
    return row.label ?? '';
  })();

  /*
   * **Two lines, always** — with a target or without, with details or without. A row whose
   * height follows its copy length destroys the list's grid (`design.md`, dimensional
   * regularity), and the mark column keeps the sentence on the same x as the other tabs.
   */
  return (
    <li
      data-testid="agent-inbox-history-row"
      data-kind={row.kind}
      className="atlas-touch-floor flex gap-2 px-1 py-1.5"
    >
      <RowMark />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className={ROW_HEADLINE_CLASS}>
          <span
            className={cn(
              // Shrinkable for the same reason as the result row's sentence.
              'min-w-0 truncate text-label',
              problem
                ? 'text-[color:var(--color-status-warning)]'
                : 'text-[color:var(--color-text-primary)]',
            )}
          >
            {sentence}
          </span>
          {row.node ? (
            onOpenNode ? (
              <button
                type="button"
                onClick={() => {
                  onOpenNode(row.node!.slug);
                  onClose?.();
                }}
                title={row.node.slug}
                aria-label={t('openOnMap', { name: row.node.name })}
                className={HISTORY_OBJECT_CLASS}
              >
                {row.node.name}
              </button>
            ) : (
              <Link
                href={getTopologyFocusHref(row.node.slug)}
                title={row.node.slug}
                aria-label={t('openOnMap', { name: row.node.name })}
                className={HISTORY_OBJECT_CLASS}
              >
                {row.node.name}
              </Link>
            )
          ) : null}
        </span>
        <span className="flex min-w-0 items-baseline gap-1.5 text-caption text-[color:var(--color-text-quaternary)]">
          {agent ? <span className="shrink-0">{agent}</span> : null}
          {agent && (detail || duration) ? <span aria-hidden>·</span> : null}
          {detail ? <span className="min-w-0 truncate">{detail}</span> : null}
          {detail && duration ? <span aria-hidden>·</span> : null}
          {duration ? (
            <span title={t('durationTitle')} className="shrink-0 tabular-nums">
              {duration}
            </span>
          ) : null}
          <span aria-hidden>·</span>
          <span className="shrink-0">{age}</span>
        </span>
      </span>
    </li>
  );
}

/** Marks every row read up to now. The only door that moves the boundary in one press. */
export function MarkAllReadDoor({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onPress}
      data-testid="agent-inbox-mark-all-read"
      className={controlClass({
        shape: 'link',
        hoverInk: 'strong',
        className: 'shrink-0 text-[color:var(--color-text-tertiary)]',
      })}
    >
      <Check size={ICON_SIZE.sm} aria-hidden />
      {label}
    </button>
  );
}
