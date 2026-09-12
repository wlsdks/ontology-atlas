'use client';

import { Fragment, useCallback, useState, type ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { AlertTriangle, Bot, Check } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { buildOntologyInsightsReturnHref } from '@/entities/knowledge-graph';
import { getTopologyFocusHref } from '@/entities/project';
import { agentDisplayName } from '@/shared/lib/agent-display-name';
import { cn } from '@/shared/lib/cn';
import { elapsedParts } from '@/shared/lib/elapsed';
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
import type { AgentActivityFeed } from '../model/use-agent-activity-feed';

/**
 * The bell's inside: **three questions, not one log.**
 *
 * Owner, 2026-09-12: 「이 알림창 내부 디자인도 매우매우 중요해! 알림함으로만 구분이 가능할
 * 수도 있기 때문에 말이지? 내부에 탭을 만들어도 괜찮고 하니 잘 구성해줘」 — the panel may have
 * to carry the distinction on its own, so the distinction has to be inside it.
 *
 * Before this the panel was an event log in two stacked sections: receipts whose
 * decision and result were four dot-separated words, then a feed that printed a task's
 * start and its end as two separate rows with the same title. A person coming back
 * after an agent worked for an hour could not tell from it whether anything was waiting
 * on them. The three tabs answer three different questions (`model/bell-inbox.ts` owns
 * the derivation):
 *
 * - `할 일` — the only tab that can cost the person something by being missed.
 * - `결과` — one row per finished task, unread until opened.
 * - `기록` — the same tasks as a timeline under a day label.
 *
 * **Why the tab strip is `shared/ui/tab-bar`**: that file is declared the one tab-bar
 * pattern for the app (caps label, engraved count, 2px indigo underline, roving
 * tabindex). A popover-local second tab implementation is how two tab dialects begin.
 *
 * **Which tab opens**: the one used last, remembered across sessions — unless it is
 * empty and another has something, because a panel that opens on an empty tab while a
 * request waits two tabs away is the defect this slice exists to remove.
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
 * What a finished write **did**, as one verb-first sentence.
 *
 * The leading kind is the largest count, ties resolved added → edited → removed. Both
 * `결과` and `기록` say this same sentence: four rows reading `Claude Code 작업 끝` is the
 * repetition the owner named, and a generic heading repeated down a list is refused by
 * `.claude/rules/design.md` as well.
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
 * brief from the ontology diff (「새로 알아야 할 것 4 · 확실하지 않은 것 2」), and that has
 * to print **before** the agent's own facts without this row being rewritten. Today the
 * brief is simply absent, and with it absent the line renders exactly what it rendered
 * before this shape existed.
 */
export interface ResultFactLineModel {
  agent: string | null;
  duration: string | null;
  allowed: number | null;
  denied: number | null;
  /** Everything else this row has to say — a decision's effect, a result that is not `completed`. */
  summaryFacts: BellFact[];
}

function resultFacts(
  t: (key: string, values?: Record<string, number>) => string,
  row: BellResult,
  duration: (ms: number) => string,
): ResultFactLineModel {
  const agent = agentDisplayName(row.agent) ?? row.agent ?? t('unknownAgent');
  if (row.kind === 'task') {
    const decided = row.allowed > 0 || row.rejected > 0;
    return {
      agent,
      duration: duration(row.durationMs),
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
  return { agent, duration: null, allowed: null, denied: null, summaryFacts: facts };
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
   * that does wins, and `할 일` is first in that order, so a panel does not open on an
   * empty tab while a request waits two tabs away. After that the person's own press is
   * final — an empty tab a person deliberately opened must show its empty sentence, and
   * content arriving later changes the **count in the label**, never the tab under the
   * reader.
   */
  const [tab, setTab] = useState<BellTab>(() => {
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
  const duration = (ms: number) => {
    const { hours, minutes, seconds } = elapsedParts(ms);
    if (hours > 0) return t('durationHours', { hours, minutes });
    if (minutes > 0) return t('durationMinutes', { minutes });
    return t('durationSeconds', { seconds });
  };

  const openRow = (row: BellResult) => {
    feed.markReadUpTo(row.at);
    if (row.kind === 'task' && row.node) {
      if (onOpenNode) {
        onOpenNode(row.node.slug);
        onClose?.();
      }
      return;
    }
    if (onOpenConversation) {
      onOpenConversation();
      onClose?.();
    }
  };

  return (
    <div data-testid="agent-inbox-panel">
      <div className="px-3 pt-1">
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
            {
              key: 'history',
              label: t('tab.history'),
              count: counts.history,
              countTitle: t('tabHistoryTitle'),
            },
          ]}
        />
      </div>

      <div
        role="tabpanel"
        id={`${TAB_ID_PREFIX}-tabpanel-${tab}`}
        aria-labelledby={`${TAB_ID_PREFIX}-tab-${tab}`}
        data-testid={`agent-inbox-panel-${tab}`}
        /*
         * One scroller for the whole body, capped at five rows of the 52px pitch.
         *
         * The panel's **own** height follows the tab (measured: 188 · 344 · 364 px on the
         * seeded folder) — a popover that always reserved the tallest tab would hang 200px
         * of empty ground over the map on the tab that matters most. What must not move is
         * what the pointer is on: the header and the tab strip are above the body, so they
         * stay put while the bottom edge follows the content.
         */
        className="max-h-[264px] overflow-y-auto px-2 py-1.5"
      >
        {tab === 'todo' ? (
          counts.todo === 0 ? (
            <InboxEmpty testId="agent-inbox-todo-empty">{t('todoEmpty')}</InboxEmpty>
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
                        <span className="shrink-0 text-label text-[color:var(--color-text-primary)]">
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
                        facts={resultFacts(t, row, duration)}
                        briefCounts={briefCountsFor?.(row) ?? null}
                        durationTitle={t('durationTitle')}
                      />
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

function InboxEmpty({ children, testId }: { children: string; testId: string }) {
  return (
    <p
      data-testid={testId}
      className="px-1 py-6 text-center text-caption leading-label text-[color:var(--color-text-tertiary)]"
    >
      {children}
    </p>
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
            className="shrink-0"
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
          {[
            todo.problems.unresolvedEdges > 0
              ? t('problemUnresolved', { count: todo.problems.unresolvedEdges })
              : null,
            todo.problems.dependencyCycles > 0
              ? t('problemCycles', { count: todo.problems.dependencyCycles })
              : null,
          ]
            .filter(Boolean)
            .join(t('summaryJoin'))}
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
 * Kind → the sentence a timeline row says, for everything that is not a finished write.
 *
 * A finished write says what it did (`writeSentence`) rather than `<agent> 작업 끝`: the
 * seeded folder drew that same line four times in a row, which is the repetition the owner
 * reported in the first place. The agent moved to the second line, where it belongs beside
 * the duration and the time.
 */
const HISTORY_LABEL_KEY: Readonly<Record<BellHistoryRow['kind'], string>> = {
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
    row.kind === 'task-end' ? writeSentence(t, row.counts) : t(HISTORY_LABEL_KEY[row.kind]);

  const detail = (() => {
    if (row.problems) {
      const parts: string[] = [];
      if (row.problems.unresolvedEdges > 0) {
        parts.push(t('problemUnresolved', { count: row.problems.unresolvedEdges }));
      }
      if (row.problems.dependencyCycles > 0) {
        parts.push(t('problemCycles', { count: row.problems.dependencyCycles }));
      }
      return parts.join(t('summaryJoin'));
    }
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
              'shrink-0 text-label',
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
                className={controlClass({
                  shape: 'link',
                  tone: 'accent',
                  truncate: true,
                  hoverInk: 'strong',
                  className: 'min-w-0',
                })}
              >
                {row.node.name}
              </button>
            ) : (
              <Link
                href={getTopologyFocusHref(row.node.slug)}
                title={row.node.slug}
                aria-label={t('openOnMap', { name: row.node.name })}
                className={controlClass({
                  shape: 'link',
                  tone: 'accent',
                  truncate: true,
                  hoverInk: 'strong',
                  className: 'min-w-0',
                })}
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
