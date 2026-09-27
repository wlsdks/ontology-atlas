'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { AcpRuntimeSettings, ModelConnections } from '@/widgets/app-settings-menu';
import { TabBar } from '@/shared/ui';
import { useRouter } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';
import { queueAgentChatIntent } from '@/shared/lib/agent-chat-intent';
import { isAcpBridgeAvailable } from '@/shared/lib/tauri-acp';
import { useSwapHeight } from '@/shared/lib/use-presence';
import { PAGE_FRAME_FORM, PAGE_HEADER_ROW, PAGE_TITLE_ROW } from '@/shared/ui/page-frame';

import { AGENTS_TAB_PARAM, buildAgentsTabHref, parseAgentsTab, type AgentsTab } from '../lib/agents-tab-state';

/**
 * Where coding agents are installed, connected and opened into a conversation, with tabs for
 * Atlas's own models and the folder's MCP. The MCP tab is `children` from the app layer, so
 * neither view imports the other. Choosing the workspace folder is `capabilities/vault-folder-session`.
 */
export function AgentsPage({
  children,
  mcpCount,
}: { children?: ReactNode; mcpCount?: number } = {}) {
  const t = useTranslations('agents');
  const tMcp = useTranslations('mcp');
  const router = useRouter();
  const openChatOnMap = useCallback(
    (runtimeId: string) => {
      queueAgentChatIntent(runtimeId);
      router.push(DESTINATION_HREF.map);
    },
    [router],
  );

  const searchParams = useSearchParams();
  const [tab, setTabState] = useState<AgentsTab>(() =>
    parseAgentsTab(searchParams?.get(AGENTS_TAB_PARAM)),
  );
  /* Panels differ in height; swapping them in one frame would drop the scroll position. */
  const { hostRef: panelHostRef, capture: capturePanelHeight } = useSwapHeight(tab);

  /* A rail click or shortcut changes only the query; the view stays mounted, so the tab follows. */
  const paramTab = parseAgentsTab(searchParams?.get(AGENTS_TAB_PARAM));
  // Adjusted during render: an effect would paint the stale tab for one frame.
  const [seenParamTab, setSeenParamTab] = useState(paramTab);
  if (paramTab !== seenParamTab) {
    setSeenParamTab(paramTab);
    if (paramTab !== tab) {
      capturePanelHeight();
      setTabState(paramTab);
    }
  }

  useEffect(() => {
    const syncTabFromHistory = () => {
      capturePanelHeight();
      setTabState(parseAgentsTab(new URL(window.location.href).searchParams.get(AGENTS_TAB_PARAM)));
    };
    window.addEventListener('popstate', syncTabFromHistory);
    return () => window.removeEventListener('popstate', syncTabFromHistory);
  }, [capturePanelHeight]);

  const selectTab = (next: string) => {
    const nextTab = parseAgentsTab(next);
    capturePanelHeight();
    setTabState(nextTab);
    /* Native history, not the router: a router navigation moves WebView focus off the strip. */
    window.history.replaceState(
      window.history.state,
      '',
      buildAgentsTabHref(nextTab, new URL(window.location.href)),
    );
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
      data-agents-tab={tab}
      className={`${PAGE_FRAME_FORM} max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]`}
    >
      {/* The lede stays outside: `PAGE_HEADER_ROW` is `justify-between` and would push it right. */}
      <header className={PAGE_HEADER_ROW}>
        <div className={PAGE_TITLE_ROW}>
          <h1 className="text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
            {t('title')}
          </h1>
        </div>
      </header>
      <p
        data-testid="agents-lede"
        className="mt-2 max-w-2xl break-keep text-body-lg leading-title text-[color:var(--color-text-tertiary)]"
      >
        {/* On the web the card below says a browser cannot start programs, so the app is the subject. */}
        {tab === 'mcp'
          ? tMcp('lede')
          : tab === 'models'
            ? t('models.lede')
            : isAcpBridgeAvailable()
              ? t('lede')
              : t('ledeWeb')}
      </p>

      <nav className="mt-5" data-testid="agents-tabs">
        <TabBar
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

      {/* Only the selected tab mounts, so the panel's id and aria-labelledby follow the tab. */}
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
    </main>
  );
}
