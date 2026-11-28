import { useTranslations } from 'use-intl';
import { useCallback, useState, type ReactNode } from 'react';

import { AcpRuntimeSettings, ModelConnections } from '@/widgets/app-settings-menu';
import { PageHeaderBar, TabBar } from '@/shared/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';
import { queueAgentChatIntent } from '@/shared/lib/agent-chat/agent-chat-intent';
import { controlClass } from '@/shared/ui/control-class';
import { cn } from '@/shared/lib/cn';
import { useSwapHeight } from '@/shared/lib/render-timing/use-presence';
import { TermHint } from '@/shared/ui/hints/term-hint';
import { PAGE_FRAME_FORM, PAGE_LEDE } from '@/shared/ui/tokens/page-frame';

import { buildAgentsTabHref, parseAgentsTab, type AgentsSearch, type AgentsTab } from '../lib/agents-tab-state';
import { currentAddress, guardedHistoryWrite } from '@/shared/lib/navigation/history-write-guard';
import { firstSearchText } from '@/shared/lib/navigation/search-text';

/** The MCP tab is `children` from the app layer, so neither view imports the other. */
export function AgentsPage({
  children,
  mcpCount,
  search,
}: { children?: ReactNode; mcpCount?: number; search: AgentsSearch }) {
  const t = useTranslations('agents');
  const tBriefing = useTranslations('gitBriefing');
  const tMcp = useTranslations('mcp');
  const router = useRouter();
  const openChatOnMap = useCallback(
    (runtimeId: string) => {
      queueAgentChatIntent(runtimeId);
      router.push(DESTINATION_HREF.map);
    },
    [router],
  );

  const paramTab = parseAgentsTab(firstSearchText(search.tab));
  const [tab, setTabState] = useState<AgentsTab>(paramTab);
  /* Panels differ in height; swapping them in one frame would drop the scroll position. */
  const { hostRef: panelHostRef, capture: capturePanelHeight } = useSwapHeight(tab);

  /* A rail click or shortcut changes only the query; the view stays mounted, so the tab follows. */
  // Adjusted during render: an effect would paint the stale tab for one frame.
  const [seenParamTab, setSeenParamTab] = useState(paramTab);
  if (paramTab !== seenParamTab) {
    setSeenParamTab(paramTab);
    if (paramTab !== tab) {
      capturePanelHeight();
      setTabState(paramTab);
    }
  }

  const selectTab = (next: string) => {
    const nextTab = parseAgentsTab(next);
    capturePanelHeight();
    setTabState(nextTab);
    /* The history door, not a router navigation: that would move WebView focus off the strip. */
    guardedHistoryWrite('replace', buildAgentsTabHref(nextTab, currentAddress()));
  };

  return (
    /*
     * Each destination view owns `<main>`, not the shell, or "skip to content" has no target.
     * The `max-lg:pb-…` reserves the bottom tab bar, or it hides the last line.
     */
    <main
      id="main"
      tabIndex={-1}
      data-testid="agents-page"
      className="flex flex-1 flex-col"
      data-agents-tab={tab}
    >
      <PageHeaderBar
        frame="page"
        title={t('title')}
        tabs={
          <nav data-testid="agents-tabs">
            <TabBar
              variant="segmented"
              idPrefix="agents"
              ariaLabel={t('workspace.aria')}
              activeKey={tab}
              onSelect={selectTab}
              items={[
                { key: 'agents', label: t('workspace.agents'), testId: 'agents-tab-agents' },
                { key: 'models', label: t('workspace.models'), testId: 'agents-tab-models' },
                {
                  key: 'mcp',
                  label: t('workspace.mcp'),
                  testId: 'agents-tab-mcp',
                  /* Enabled connectors; omitted until the store answers, so 0 never means "not read". */
                  count: mcpCount,
                  countTitle: t('workspace.mcpCount'),
                },
              ]}
            />
          </nav>
        }
      />
      <div
        className={cn(
          PAGE_FRAME_FORM,
          'pt-8 md:pt-10 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]',
        )}
      >
      {firstSearchText(search.returnTo) === 'changes' && <Link href="/changes/" className={controlClass({ shape: 'chip', hoverSurface: 'lift', hoverInk: 'strong', className: 'mb-4 w-fit' })}>{tBriefing('back')}</Link>}
      <div className="min-w-0">
      <p data-testid="agents-lede" className={`max-w-2xl ${PAGE_LEDE}`}>
        {tab === 'mcp'
          ? <>{tMcp('lede')} <TermHint term="mcp" /></>
          : tab === 'models'
            ? t('models.lede')
            : t('lede')}
      </p>

      <div
        ref={panelHostRef}
        role="tabpanel"
        id={`agents-tabpanel-${tab}`}
        aria-labelledby={`agents-tab-${tab}`}
        data-testid="agents-tabpanel"
        className="mt-5 min-w-0"
      >
        {tab === 'agents' ? (
          /* No sr-only heading: the tool group inside already shows this name visibly. */
          <section className="min-w-0" aria-label={t('runtimesHeading')}>
            <AcpRuntimeSettings embedded onOpenChat={openChatOnMap} />
          </section>
        ) : tab === 'models' ? (
          <section className="min-w-0" aria-label={t('workspace.models')}>
            <ModelConnections />
          </section>
        ) : (
          children
        )}
      </div>
      </div>
      </div>
    </main>
  );
}
