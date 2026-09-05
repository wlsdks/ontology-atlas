'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import { AgentSetupSection } from '@/widgets/app-settings-menu';
import { ConnectorsPanel, useVaultConnectors } from '@/features/mcp-connectors';
import { useLocalVault } from '@/entities/vault-session';
import { TabBar } from '@/shared/ui';
import { useSwapHeight } from '@/shared/lib/use-presence';
import { PAGE_FRAME, PAGE_HEADER_ROW, PAGE_TITLE_ROW } from '@/shared/ui/page-frame';

import { buildMcpTabHref, parseMcpTab, type McpTab } from '../lib/mcp-tab-state';

/**
 * The **MCP** destination — the folder's own MCP connection, and the external connectors an
 * agent reaches through it.
 *
 * ## Why it left `/agents` (2026-09-05)
 *
 * `/agents` had grown two unrelated jobs under one title. One is *"which coding tools does this
 * computer have, and can I open a conversation"*. The other is *"what does an agent reach over
 * MCP"* — the folder's own server plus every external connector. They share the word "agent" and
 * nothing else: the first is about programs on this machine, the second about a wire that behaves
 * identically in a browser, and the second was the taller half of the screen.
 *
 * The owner read the merged screen and asked for the split: *"Agents itself needs a redesign —
 * MCP separately (doesn't it need its own LNB tab?) the LNB may grow, I approve"*.
 *
 * ## Why two tabs rather than two stacked sections
 *
 * Stacked, the connector list sat below a pane that is several screens tall, so the only way to
 * reach it was to scroll past a job you were not doing. Tabs are the repository's existing answer
 * for "one screen, one question at a time" (`shared/ui/tab-bar`), and `?tab=` keeps a shared link
 * and an agent handoff pointing at the half they meant.
 *
 * ## Why the whole screen is drawn on the web too
 *
 * MCP attaches to **the folder**, not to an Atlas screen: the agent starts the server on its own
 * side and that server reads and writes the vault on disk. So a browser user connects as well
 * (ledger 2026-08-01). What a browser cannot do is save the config file for you — it does not know
 * the folder's absolute path — and it cannot read this machine's agent config files or hold a
 * token in a keychain. Each of those is stated where it is missing rather than hidden, and
 * everything else here works.
 */
export function McpPage() {
  const t = useTranslations('mcp');
  const localVault = useLocalVault();
  const handle = localVault.status === 'loaded' ? (localVault.handle ?? null) : null;

  /*
   * **One store, read by both the tab strip and the panel.** The count beside the "Connectors"
   * tab has to change the moment a switch is flipped, and a second `useVaultConnectors` here
   * would be a second reader of the same file that never learns about the first one's writes —
   * the two-canonical-stores defect `.claude/rules/forbidden.md` names. So the page owns it and
   * hands it down.
   */
  const connectors = useVaultConnectors(handle);
  const enabledCount = connectors.connectors.filter((connector) => connector.enabled).length;

  const searchParams = useSearchParams();
  const [tab, setTabState] = useState<McpTab>(() => parseMcpTab(searchParams.get('tab')));
  /*
   * The two panels are very different heights, and swapping them in one frame drops the page's
   * scroll position somewhere unrelated. `useSwapHeight` is this repository's grammar for exactly
   * that (`/ontology/insights` is its first consumer): measure before the change, transition the
   * host's height on `--motion-base`, and stand aside under reduced motion.
   */
  const { hostRef: panelHostRef, capture: capturePanelHeight } = useSwapHeight(tab);

  /*
   * Back and forward have to move the tab too. Without this the address bar says `?tab=connectors`
   * while the screen still draws the share tab — the state and the URL disagreeing is exactly what
   * putting the tab in the URL was for.
   */
  useEffect(() => {
    const syncFromHistory = () => {
      capturePanelHeight();
      setTabState(parseMcpTab(new URL(window.location.href).searchParams.get('tab')));
    };
    window.addEventListener('popstate', syncFromHistory);
    return () => window.removeEventListener('popstate', syncFromHistory);
  }, [capturePanelHeight]);

  const selectTab = (next: string) => {
    const nextTab = parseMcpTab(next);
    capturePanelHeight();
    setTabState(nextTab);
    /*
     * Only the query view of the same document changes. A router navigation moves focus to the
     * document root in the WebView, which would throw away the tab strip's roving focus, so the
     * URL is updated through native history in the same event instead — the pattern
     * `/ontology/insights` already uses.
     */
    window.history.replaceState(
      window.history.state,
      '',
      buildMcpTabHref(nextTab, window.location.pathname),
    );
  };

  return (
    /*
     * ⚠️ **`<main>`, not `<div>`** — in this repository the shell does not own `<main>`; each
     * destination view owns its own, or the accessibility ratchet measures zero elements inside it
     * and "skip to content" has nowhere to go.
     */
    <main
      id="main"
      tabIndex={-1}
      data-testid="mcp-page"
      data-mcp-tab={tab}
      className={`${PAGE_FRAME} max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]`}
    >
      {/* The description sits outside the header: `PAGE_HEADER_ROW` is one `justify-between`
          row, so a paragraph placed inside it is pushed to the opposite end from the title. */}
      <header className={PAGE_HEADER_ROW}>
        <div className={PAGE_TITLE_ROW}>
          <h1 className="text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
            {t('title')}
          </h1>
        </div>
      </header>
      <p className="mt-2 max-w-2xl break-keep text-body-lg leading-title text-[color:var(--color-text-tertiary)]">
        {t('lede')}
      </p>

      <div className="mt-5" data-testid="mcp-tabs">
        <TabBar
          idPrefix="mcp"
          ariaLabel={t('tablistAriaLabel')}
          activeKey={tab}
          onSelect={selectTab}
          items={[
            { key: 'share', label: t('shareHeading') },
            {
              key: 'connectors',
              label: t('connectorsHeading'),
              /*
               * **How many are switched on**, not how many are written down. Everything starts
               * off, and a list of five where none is on reaches an agent as nothing at all —
               * the number that answers "is anything actually attached" is this one.
               */
              count: enabledCount,
              countTitle: t('connectorsCountTitle'),
            },
          ]}
        />
      </div>

      {/*
        **One panel element, and the tab decides what is in it.** Only the selected tab's panel is
        rendered — the same shape `/ontology/insights` uses, and the reason `TabBar` records for it:
        drawing the other half into a hidden box pays for building a model nobody is looking at
        (`.claude/rules/architecture.md`), while `aria-controls` only has to resolve for the
        selected tab. The `id` and `aria-labelledby` therefore follow the tab, keeping `TabBar`'s
        prefix contract intact.
      */}
      <div
        ref={panelHostRef}
        role="tabpanel"
        id={`mcp-tabpanel-${tab}`}
        aria-labelledby={`mcp-tab-${tab}`}
        data-testid="mcp-tabpanel"
        className="mt-5 min-w-0"
      >
        {tab === 'share' ? (
          <AgentSetupSection />
        ) : (
          <ConnectorsPanel handle={handle} store={connectors} />
        )}
      </div>
    </main>
  );
}
