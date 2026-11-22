'use client';

import { useCallback, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { controlClass } from '@/shared/ui/control-class';
import { TabBar } from '@/shared/ui/controls/tab-bar';
import {
  BELL_TABS,
  type BellInbox,
  type BellResult,
  type BellTab,
} from '../model/bell-inbox';
import type { BellFact } from '../model/inbox-row-copy';
import { openingTab, readStoredTab, writeStoredTab } from '../model/inbox-tab';
import type { AgentActivityFeed } from '../model/use-agent-activity-feed';
import { HistoryRow } from './inbox-rows/HistoryRow';
import { InboxEmpty, MAP_TIDY_LIST_HREF } from './inbox-rows/inbox-row-primitives';
import { ResultRow } from './inbox-rows/ResultRow';
import { TodoRow } from './inbox-rows/TodoRow';

/**
 * The bell's inside is three questions, not one log (`model/bell-inbox.ts` derives them): `todo`
 * costs something if missed, `results` is one row per finished task, `history` a timeline. Tab strip
 * is `shared/ui/controls/tab-bar`. Opens on the last used tab unless it is empty and another has content.
 */
const TAB_ID_PREFIX = 'agent-inbox';

export function AgentInboxPanel({
  inbox,
  feed,
  onOpenNode,
  onOpenConversation,
  onClose,
  briefCountsFor,
}: {
  inbox: BellInbox;
  feed: AgentActivityFeed;
  onOpenNode?: (slug: string) => void;
  onOpenConversation?: () => void;
  onClose?: () => void;
  /** What a finished turn taught, printed before the agent's facts. */
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
   * Decided once, at mount. After that the person's press is final; later content changes the
   * count in the label, never the tab under the reader.
   */
  const [tab, setTab] = useState<BellTab>(() => openingTab(counts, readStoredTab()));

  const selectTab = useCallback((next: string) => {
    const known = BELL_TABS.find((key) => key === next);
    if (!known) return;
    setTab(known);
    writeStoredTab(known);
  }, []);

  const relative = (at: number) => format.relativeTime(new Date(at), feed.nowMs);

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
         * One scroller for the whole body, capped at 264px (four whole 52px rows plus 44 of the fifth, the partial row being the scroll
         * affordance) or, in a shorter window, what the flex column leaves (`--map-panel-max-height`). The panel's own height follows the
         * tab so it does not hang empty ground over the map; the header and strip stay above the body so the pointer's target never moves.
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
                href={MAP_TIDY_LIST_HREF}
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
                <ResultRow
                  key={row.id}
                  row={row}
                  age={relative(row.at)}
                  briefCounts={briefCountsFor?.(row) ?? null}
                  canOpenNode={Boolean(onOpenNode)}
                  canOpenConversation={Boolean(onOpenConversation)}
                  onOpen={() => openRow(row)}
                />
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
